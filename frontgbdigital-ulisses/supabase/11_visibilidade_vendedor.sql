-- =====================================================================
-- PROVVA — vendedor precisa enxergar a própria loja/unidade (RLS)
-- Rodar DEPOIS de 10_migracao_auth_unificada.sql. Idempotente.
--
-- Com a autenticação unificada (Supabase Auth), o vendedor loga como
-- usuário 'authenticated' comum — mas loja_visivel()/unidade_visivel()
-- só reconheciam vínculo em usuarios_painel (papel plataforma/operador/
-- loja). Vendedor não tem linha em usuarios_painel, então RLS bloqueava
-- tudo: index.html não conseguia ler a própria linha em `vendedores`
-- (caía sempre no fallback painel.html) e o tablet não conseguia ler
-- unidades/lojas/catálogo.
--
-- Este arquivo:
--   1) Estende loja_visivel() para reconhecer "sou vendedor de uma
--      unidade desta loja" (via e-mail do JWT == vendedores.email).
--      unidade_visivel() já delega em loja_visivel(), então nada mais
--      precisa mudar — abre automaticamente vendedores, unidades,
--      geracoes, catalogo_loja e a própria loja (todos filtram por
--      loja_visivel/unidade_visivel).
--   2) Corrige registrar_geracao(): o join com
--      usuarios_painel.papel = 'vendedor' nunca casava (vendedor não
--      tem linha em usuarios_painel) — toda geração no tablet estava
--      retornando erro 'sessao'. Removido.
-- =====================================================================

-- 1) loja_visivel() passa a reconhecer o vendedor logado.
create or replace function loja_visivel(p_loja uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(papel_atual() = 'plataforma', false)
      or exists (select 1 from lojas l where l.id = p_loja and l.operador_id = operador_atual())
      or p_loja = loja_atual()
      or exists (
           select 1 from vendedores v
           join unidades u on u.id = v.unidade_id
          where u.loja_id = p_loja
            and v.email = (auth.jwt() ->> 'email')
         )
$$;

-- 2) registrar_geracao(): remove o join incorreto com usuarios_painel.
create or replace function registrar_geracao(p_origem text) returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  r        record;
  v_usadas integer;
  v_incl   integer;
  v_user_id uuid;
begin
  if p_origem not in ('multi_peca', 'estilista') then
    raise exception 'origem inválida: %', p_origem using errcode = '22023';
  end if;

  v_user_id := auth.uid();
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'erro', 'sessao');
  end if;

  -- Busca o vendedor pelo e-mail do usuário autenticado (Supabase Auth).
  select v.id as vendedor_id, u.id as unidade_id, u.loja_id, u.geracoes_incluidas_mes,
         v.nome as vendedor_nome, u.nome as unidade_nome, l.nome as loja_nome, l.branding,
         o.nome as operador_nome
    into r
    from vendedores v
    join unidades u on u.id = v.unidade_id
    join lojas l on l.id = u.loja_id
    join operadores o on o.id = l.operador_id
   where v.email = (select email from auth.users where id = v_user_id)
     and v.status = 'ativo' and u.status = 'ativo' and l.status = 'ativo' and o.status = 'ativo';

  if not found then
    return jsonb_build_object('ok', false, 'erro', 'sessao');
  end if;

  -- serializa por unidade
  perform pg_advisory_xact_lock(hashtext(r.unidade_id::text));

  select count(*) into v_usadas
    from geracoes where unidade_id = r.unidade_id and mes_ref = mes_atual();
  v_incl := coalesce(r.geracoes_incluidas_mes, 0);

  insert into geracoes (unidade_id, loja_id, vendedor_id, origem, excedente, mes_ref)
  values (r.unidade_id, r.loja_id, r.vendedor_id, p_origem, v_usadas >= v_incl, mes_atual());

  return jsonb_build_object(
    'ok', true,
    'vendedor', jsonb_build_object('id', r.vendedor_id, 'nome', r.vendedor_nome),
    'unidade', jsonb_build_object('id', r.unidade_id, 'nome', r.unidade_nome),
    'loja', jsonb_build_object('id', r.loja_id, 'nome', r.loja_nome, 'branding', coalesce(r.branding, '{}'::jsonb)),
    'operador', jsonb_build_object('nome', r.operador_nome),
    'creditos', jsonb_build_object(
      'incluidas', v_incl,
      'usadas', v_usadas + 1,
      'saldo', greatest(v_incl - (v_usadas + 1), 0),
      'excedente', greatest((v_usadas + 1) - v_incl, 0),
      'percentual', case when v_incl = 0 then (case when v_usadas + 1 > 0 then 100 else 0 end)
                         else round((v_usadas + 1) * 100.0 / v_incl)::int end
    )
  );
end $$;

revoke execute on function registrar_geracao(text) from public, anon;
grant  execute on function registrar_geracao(text) to authenticated, service_role;

notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------
-- 3) CONFERÊNCIA (só leitura)
-- ---------------------------------------------------------------------
select proname, prosrc ilike '%vendedores%' as reconhece_vendedor
  from pg_proc where proname in ('loja_visivel', 'unidade_visivel');
