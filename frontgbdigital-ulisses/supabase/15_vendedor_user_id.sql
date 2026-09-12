-- =====================================================================
-- PROVVA — vincula vendedores.user_id ao auth.users(id), em vez de
-- comparar e-mail (frágil: case-sensitivity, espaços, e-mail trocado).
-- Rodar DEPOIS de 11_visibilidade_vendedor.sql. Idempotente.
-- =====================================================================

-- 1) Nova coluna, vinculando à conta do Supabase Auth.
alter table vendedores add column if not exists user_id uuid references auth.users(id) on delete set null;
create unique index if not exists vendedores_user_id_key on vendedores(user_id) where user_id is not null;

-- 2) Backfill: vincula vendedores existentes cujo e-mail já bate com um
--    usuário do Auth (case-insensitive).
update vendedores v
   set user_id = u.id
  from auth.users u
 where v.user_id is null
   and lower(v.email) = lower(u.email);

-- 3) loja_visivel() passa a usar user_id em vez de e-mail.
create or replace function loja_visivel(p_loja uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(papel_atual() = 'plataforma', false)
      or exists (select 1 from lojas l where l.id = p_loja and l.operador_id = operador_atual())
      or p_loja = loja_atual()
      or exists (
           select 1 from vendedores v
           join unidades u on u.id = v.unidade_id
          where u.loja_id = p_loja
            and v.user_id = auth.uid()
         )
$$;

-- 4) criar_vendedor() passa a aceitar/gravar user_id (opcional — a Edge
--    Function cria o Auth user DEPOIS de inserir a linha, então o
--    vínculo é feito num passo seguinte via vincular_vendedor_auth()).
create or replace function vincular_vendedor_auth(p_vendedor_id uuid, p_user_id uuid) returns void
language plpgsql volatile security definer set search_path = public, pg_temp as $$
begin
  update vendedores set user_id = p_user_id where id = p_vendedor_id;
end $$;

revoke execute on function vincular_vendedor_auth(uuid, uuid) from public, anon, authenticated;
grant  execute on function vincular_vendedor_auth(uuid, uuid) to service_role;

-- 5) registrar_geracao() passa a buscar o vendedor por user_id.
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

  select v.id as vendedor_id, u.id as unidade_id, u.loja_id, u.geracoes_incluidas_mes,
         v.nome as vendedor_nome, u.nome as unidade_nome, l.nome as loja_nome, l.branding,
         o.nome as operador_nome
    into r
    from vendedores v
    join unidades u on u.id = v.unidade_id
    join lojas l on l.id = u.loja_id
    join operadores o on o.id = l.operador_id
   where v.user_id = v_user_id
     and v.status = 'ativo' and u.status = 'ativo' and l.status = 'ativo' and o.status = 'ativo';

  if not found then
    return jsonb_build_object('ok', false, 'erro', 'sessao');
  end if;

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

-- 6) Permite o painel ler a coluna user_id (útil para telas de gerentes/depuração).
grant select (id, unidade_id, nome, email, status, user_id, created_at) on vendedores to authenticated;

-- 7) Policy "vendedores select próprio": um vendedor pode ler a própria
--    linha mesmo antes de qualquer outra checagem (fallback direto por user_id,
--    sem depender de loja_visivel/unidade_visivel — mais barato e à prova de bala).
drop policy if exists "vendedores select propria" on vendedores;
create policy "vendedores select propria" on vendedores for select to authenticated
  using (user_id = auth.uid());

notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------
-- 8) CONFERÊNCIA
-- ---------------------------------------------------------------------
select id, unidade_id, nome, email, user_id, status from vendedores;
