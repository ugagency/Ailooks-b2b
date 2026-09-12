-- =====================================================================
-- MIGRAÇÃO — Unificar autenticação via Supabase Auth apenas
-- Remove RPC de vendedor, sessoes_vendedor, e senha_hash da tabela
-- =====================================================================

-- 1) REMOVER RPCs DE VENDEDOR
drop function if exists vendedor_login(text, text);
drop function if exists vendedor_sessao(uuid);
drop function if exists vendedor_logout(uuid);
drop function if exists registrar_geracao(uuid, text);
drop function if exists sessao_payload(uuid);
drop function if exists redefinir_senha_vendedor(uuid, text);

-- 2) REMOVER TABELA SESSOES_VENDEDOR
drop table if exists sessoes_vendedor;

-- 2b) REMOVER VIEW VENDEDORES_PAINEL (depende das colunas que vamos remover)
drop view if exists vendedores_painel;

-- 3) MODIFICAR TABELA VENDEDORES
-- Remove colunas de senha e bloqueio (agora gerenciado via Supabase Auth)
alter table vendedores drop column if exists senha_hash;
alter table vendedores drop column if exists tentativas_falhas;
alter table vendedores drop column if exists bloqueado_ate;

-- 3b) RECRIAR VIEW VENDEDORES_PAINEL (sem as colunas removidas)
create view vendedores_painel with (security_invoker = true) as
select id, unidade_id, nome, email, status, created_at
  from vendedores;

-- 4) MODIFICAR FUNÇÃO CRIAR_VENDEDOR
-- Agora só cria a linha na tabela, não trata senha (será criada via Auth)
create or replace function criar_vendedor(p_unidade uuid, p_nome text, p_email text) returns uuid
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  v_id uuid;
begin
  if not unidade_visivel(p_unidade) then
    raise exception 'Sem permissão para esta unidade' using errcode = '42501';
  end if;
  if coalesce(p_email, '') !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'E-mail inválido' using errcode = '22023';
  end if;

  insert into vendedores (unidade_id, nome, email)
  values (p_unidade, trim(p_nome), lower(trim(p_email)))
  returning id into v_id;
  return v_id;
end $$;

-- 5) NOVA FUNÇÃO: CRIAR USUÁRIO AUTH + VENDEDOR
-- Chamada pelo painel ao adicionar vendedor
-- Cria o usuário no Supabase Auth com senha temporária
-- e vincula na tabela vendedores
create or replace function criar_vendedor_com_auth(
  p_unidade uuid,
  p_nome text,
  p_email text,
  p_senha_temporaria text default null
) returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  v_vendedor_id uuid;
  v_resultado jsonb;
begin
  if not unidade_visivel(p_unidade) then
    raise exception 'Sem permissão para esta unidade' using errcode = '42501';
  end if;
  if coalesce(p_email, '') !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'E-mail inválido' using errcode = '22023';
  end if;

  -- Cria o vendedor na tabela (sem senha)
  insert into vendedores (unidade_id, nome, email)
  values (p_unidade, trim(p_nome), lower(trim(p_email)))
  returning id into v_vendedor_id;

  -- NOTA: A criação do usuário no Supabase Auth deve ser feita via:
  -- 1) Dashboard manualmente, OU
  -- 2) Cliente JS (painel) via admin API, OU
  -- 3) RPC que chama admin API via extension
  -- Por enquanto, apenas vinculamos a tabela e o cliente JS cuida da Auth

  return jsonb_build_object(
    'ok', true,
    'vendedor_id', v_vendedor_id,
    'email', lower(trim(p_email)),
    'mensagem', 'Vendedor criado. Crie o usuário no Supabase Auth (Dashboard > Authentication > Users > Add user) com o mesmo e-mail.'
  );
end $$;

revoke execute on function criar_vendedor(uuid, text, text) from public, anon;
revoke execute on function criar_vendedor_com_auth(uuid, text, text, text) from public, anon;
grant  execute on function criar_vendedor(uuid, text, text), criar_vendedor_com_auth(uuid, text, text, text)
  to authenticated, service_role;

-- 6) CRIAR FUNÇÃO PARA REGISTRAR GERAÇÃO (usando user_id autenticado)
-- Usa Supabase Auth em vez de token UUID
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

  -- Busca o vendedor pelo user_id autenticado
  select v.id as vendedor_id, u.id as unidade_id, u.loja_id, u.geracoes_incluidas_mes,
         v.nome as vendedor_nome, u.nome as unidade_nome, l.nome as loja_nome, l.branding,
         o.nome as operador_nome
    into r
    from vendedores v
    join unidades u on u.id = v.unidade_id
    join lojas l on l.id = u.loja_id
    join operadores o on o.id = l.operador_id
    join usuarios_painel p on p.user_id = v_user_id and p.papel = 'vendedor'
   where v.id = (select id from vendedores where email = (select email from auth.users where id = v_user_id))
     and u.status = 'ativo' and l.status = 'ativo' and o.status = 'ativo';

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

-- 7) CONFERÊNCIA
select tablename, rowsecurity from pg_tables
 where schemaname = 'public' and tablename in ('vendedores', 'usuarios_painel', 'geracoes')
 order by tablename;
