-- =====================================================================
-- PROVVA — funções (RPC) de login de vendedor, créditos e painel
-- Rodar DEPOIS de 03_estrutura_provva.sql. Idempotente.
--
-- Todas são security definer com search_path fixo. O grant de execução
-- é explícito por função: o Supabase concede EXECUTE a anon/authenticated
-- em toda função nova de public por padrão, e aqui isso é revogado.
--
-- Chamadas pelo tablet (anon)      : vendedor_login, vendedor_sessao,
--                                    vendedor_logout, registrar_geracao
-- Chamadas pelo painel (authenticated): meu_perfil, criar_vendedor,
--                                    redefinir_senha_vendedor,
--                                    vincular_usuario_painel, listar_usuarios_painel
-- Interna (só o owner)             : sessao_payload
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) PAYLOAD DA SESSÃO — o que o tablet recebe no login e ao revalidar.
--    Monta o JSON campo a campo: senha_hash nunca entra aqui.
-- ---------------------------------------------------------------------
create or replace function sessao_payload(p_token uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  r        record;
  v_usadas integer;
  v_incl   integer;
begin
  select s.token, s.expira_em,
         v.id   as vendedor_id, v.nome as vendedor_nome,
         u.id   as unidade_id,  u.nome as unidade_nome, u.plano, u.totens_contratados, u.geracoes_incluidas_mes,
         l.id   as loja_id,     l.nome as loja_nome,    l.branding,
         o.id   as operador_id, o.nome as operador_nome
    into r
    from sessoes_vendedor s
    join vendedores v on v.id = s.vendedor_id
    join unidades   u on u.id = v.unidade_id
    join lojas      l on l.id = u.loja_id
    join operadores o on o.id = l.operador_id
   where s.token = p_token;
  if not found then
    return null;
  end if;

  select count(*) into v_usadas
    from geracoes g
   where g.unidade_id = r.unidade_id and g.mes_ref = mes_atual();
  v_incl := coalesce(r.geracoes_incluidas_mes, 0);

  return jsonb_build_object(
    'ok', true,
    'token', r.token,
    'expira_em', r.expira_em,
    'vendedor', jsonb_build_object('id', r.vendedor_id, 'nome', r.vendedor_nome),
    'unidade',  jsonb_build_object('id', r.unidade_id, 'nome', r.unidade_nome,
                                   'plano', r.plano, 'totens_contratados', r.totens_contratados),
    'loja',     jsonb_build_object('id', r.loja_id, 'nome', r.loja_nome,
                                   'branding', coalesce(r.branding, '{}'::jsonb)),
    'operador', jsonb_build_object('id', r.operador_id, 'nome', r.operador_nome),
    'creditos', jsonb_build_object(
      'incluidas',  v_incl,
      'usadas',     v_usadas,
      'saldo',      greatest(v_incl - v_usadas, 0),
      'excedente',  greatest(v_usadas - v_incl, 0),
      'percentual', case when v_incl = 0 then (case when v_usadas > 0 then 100 else 0 end)
                         else round(v_usadas * 100.0 / v_incl)::int end,
      'mes_ref',    mes_atual())
  );
end $$;

revoke execute on function sessao_payload(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 2) LOGIN DO VENDEDOR (tablet)
--    * 5 falhas → 15 min de bloqueio
--    * e-mail inexistente ainda roda crypt() (tempo parecido; evita enumeração)
--    * erro sempre genérico para o cliente
-- ---------------------------------------------------------------------
create or replace function vendedor_login(p_email text, p_senha text) returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  v           vendedores%rowtype;
  v_cadeia_ok boolean;
  v_token     uuid;
  c_hash_falso constant text := '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy';
begin
  select * into v from vendedores where email = lower(trim(coalesce(p_email, '')));

  if not found then
    perform extensions.crypt(coalesce(p_senha, ''), c_hash_falso);
    return jsonb_build_object('ok', false, 'erro', 'credenciais');
  end if;

  if v.bloqueado_ate is not null and v.bloqueado_ate > now() then
    return jsonb_build_object('ok', false, 'erro', 'bloqueado', 'ate', v.bloqueado_ate);
  end if;

  if v.senha_hash <> extensions.crypt(coalesce(p_senha, ''), v.senha_hash) then
    if v.tentativas_falhas + 1 >= 5 then
      update vendedores set tentativas_falhas = 0, bloqueado_ate = now() + interval '15 minutes' where id = v.id;
      return jsonb_build_object('ok', false, 'erro', 'bloqueado', 'ate', now() + interval '15 minutes');
    end if;
    update vendedores set tentativas_falhas = tentativas_falhas + 1 where id = v.id;
    return jsonb_build_object('ok', false, 'erro', 'credenciais');
  end if;

  if v.status <> 'ativo' then
    return jsonb_build_object('ok', false, 'erro', 'inativo');
  end if;

  select (u.status = 'ativo' and l.status = 'ativo' and o.status = 'ativo') into v_cadeia_ok
    from unidades u
    join lojas l on l.id = u.loja_id
    join operadores o on o.id = l.operador_id
   where u.id = v.unidade_id;
  if not coalesce(v_cadeia_ok, false) then
    return jsonb_build_object('ok', false, 'erro', 'unidade_inativa');
  end if;

  update vendedores set tentativas_falhas = 0, bloqueado_ate = null where id = v.id;
  delete from sessoes_vendedor where expira_em < now();

  insert into sessoes_vendedor (vendedor_id, expira_em)
  values (v.id, now() + interval '12 hours')
  returning token into v_token;

  return sessao_payload(v_token);
end $$;

-- ---------------------------------------------------------------------
-- 3) REVALIDAR / RENOVAR SESSÃO (tablet ao abrir)
-- ---------------------------------------------------------------------
create or replace function vendedor_sessao(p_token uuid) returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  r record;
begin
  if p_token is null then
    return jsonb_build_object('ok', false, 'erro', 'sessao');
  end if;

  select s.token, v.status as v_status, u.status as u_status, l.status as l_status, o.status as o_status
    into r
    from sessoes_vendedor s
    join vendedores v on v.id = s.vendedor_id
    join unidades   u on u.id = v.unidade_id
    join lojas      l on l.id = u.loja_id
    join operadores o on o.id = l.operador_id
   where s.token = p_token and s.expira_em > now();

  if not found then
    return jsonb_build_object('ok', false, 'erro', 'sessao');
  end if;

  if r.v_status <> 'ativo' or r.u_status <> 'ativo' or r.l_status <> 'ativo' or r.o_status <> 'ativo' then
    delete from sessoes_vendedor where token = p_token;
    return jsonb_build_object('ok', false, 'erro', 'inativo');
  end if;

  update sessoes_vendedor set expira_em = now() + interval '12 hours' where token = p_token;
  return sessao_payload(p_token);
end $$;

create or replace function vendedor_logout(p_token uuid) returns void
language sql volatile security definer set search_path = public, pg_temp as $$
  delete from sessoes_vendedor where token = p_token
$$;

-- ---------------------------------------------------------------------
-- 4) REGISTRAR GERAÇÃO (tablet, após resposta bem-sucedida do n8n)
--    Uma linha por chamada. Nunca bloqueia: acima do pool grava excedente.
-- ---------------------------------------------------------------------
create or replace function registrar_geracao(p_token uuid, p_origem text) returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  r        record;
  v_usadas integer;
  v_incl   integer;
begin
  if p_origem not in ('multi_peca', 'estilista') then
    raise exception 'origem inválida: %', p_origem using errcode = '22023';
  end if;

  select v.id as vendedor_id, u.id as unidade_id, u.loja_id, u.geracoes_incluidas_mes
    into r
    from sessoes_vendedor s
    join vendedores v on v.id = s.vendedor_id
    join unidades   u on u.id = v.unidade_id
   where s.token = p_token and s.expira_em > now() and v.status = 'ativo';

  if not found then
    return jsonb_build_object('ok', false, 'erro', 'sessao');
  end if;

  -- serializa por unidade: a flag excedente fica exata mesmo com dois tablets gerando juntos
  perform pg_advisory_xact_lock(hashtext(r.unidade_id::text));

  select count(*) into v_usadas
    from geracoes where unidade_id = r.unidade_id and mes_ref = mes_atual();
  v_incl := coalesce(r.geracoes_incluidas_mes, 0);

  insert into geracoes (unidade_id, loja_id, vendedor_id, origem, excedente, mes_ref)
  values (r.unidade_id, r.loja_id, r.vendedor_id, p_origem, v_usadas >= v_incl, mes_atual());

  return jsonb_build_object('ok', true, 'creditos', sessao_payload(p_token) -> 'creditos');
end $$;

revoke execute on function vendedor_login(text, text)          from public, anon, authenticated;
revoke execute on function vendedor_sessao(uuid)               from public, anon, authenticated;
revoke execute on function vendedor_logout(uuid)               from public, anon, authenticated;
revoke execute on function registrar_geracao(uuid, text)       from public, anon, authenticated;
grant  execute on function vendedor_login(text, text), vendedor_sessao(uuid), vendedor_logout(uuid), registrar_geracao(uuid, text)
  to anon, authenticated, service_role;

-- ---------------------------------------------------------------------
-- 5) PAINEL (authenticated)
-- ---------------------------------------------------------------------
-- Papel e escopo do usuário logado. Null = usuário do Auth sem vínculo.
create or replace function meu_perfil() returns jsonb
language sql stable security invoker as $$
  select jsonb_build_object('papel', papel, 'operador_id', operador_id, 'loja_id', loja_id)
    from usuarios_painel where user_id = auth.uid()
$$;

create or replace function criar_vendedor(p_unidade uuid, p_nome text, p_email text, p_senha text) returns uuid
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  v_id uuid;
begin
  if not unidade_visivel(p_unidade) then
    raise exception 'Sem permissão para esta unidade' using errcode = '42501';
  end if;
  if length(coalesce(p_senha, '')) < 6 then
    raise exception 'A senha precisa ter ao menos 6 caracteres' using errcode = '22023';
  end if;
  if coalesce(p_email, '') !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'E-mail inválido' using errcode = '22023';
  end if;

  insert into vendedores (unidade_id, nome, email, senha_hash)
  values (p_unidade, trim(p_nome), lower(trim(p_email)),
          extensions.crypt(p_senha, extensions.gen_salt('bf')))
  returning id into v_id;
  return v_id;
end $$;

create or replace function redefinir_senha_vendedor(p_id uuid, p_senha text) returns void
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  v_unidade uuid;
begin
  select unidade_id into v_unidade from vendedores where id = p_id;
  if v_unidade is null or not unidade_visivel(v_unidade) then
    raise exception 'Sem permissão para este vendedor' using errcode = '42501';
  end if;
  if length(coalesce(p_senha, '')) < 6 then
    raise exception 'A senha precisa ter ao menos 6 caracteres' using errcode = '22023';
  end if;

  update vendedores
     set senha_hash = extensions.crypt(p_senha, extensions.gen_salt('bf')),
         tentativas_falhas = 0,
         bloqueado_ate = null
   where id = p_id;
  delete from sessoes_vendedor where vendedor_id = p_id; -- força novo login nos tablets
end $$;

-- Vincula um usuário do Supabase Auth (criado no dashboard) a um papel do painel.
create or replace function vincular_usuario_painel(p_email text, p_papel text, p_operador uuid default null, p_loja uuid default null) returns uuid
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  v_user uuid;
begin
  if coalesce(papel_atual(), '') <> 'plataforma' then
    raise exception 'Só a plataforma vincula usuários' using errcode = '42501';
  end if;
  if p_papel not in ('plataforma', 'operador', 'loja') then
    raise exception 'Papel inválido' using errcode = '22023';
  end if;

  select id into v_user from auth.users where lower(email) = lower(trim(p_email));
  if v_user is null then
    raise exception 'Usuário não encontrado no Supabase Auth. Crie em Authentication > Users primeiro.' using errcode = 'P0002';
  end if;

  insert into usuarios_painel (user_id, papel, operador_id, loja_id)
  values (v_user, p_papel, p_operador, p_loja)
  on conflict (user_id) do update
    set papel = excluded.papel, operador_id = excluded.operador_id, loja_id = excluded.loja_id;
  return v_user;
end $$;

-- Lista os usuários do painel com e-mail (auth.users não é legível pelo cliente).
create or replace function listar_usuarios_painel() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if coalesce(papel_atual(), '') <> 'plataforma' then
    raise exception 'Só a plataforma lista usuários' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'user_id', p.user_id, 'email', u.email, 'papel', p.papel,
             'operador_id', p.operador_id, 'operador_nome', o.nome,
             'loja_id', p.loja_id, 'loja_nome', l.nome, 'created_at', p.created_at)
           order by u.email)
      from usuarios_painel p
      join auth.users u on u.id = p.user_id
      left join operadores o on o.id = p.operador_id
      left join lojas l on l.id = p.loja_id
  ), '[]'::jsonb);
end $$;

revoke execute on function meu_perfil()                                        from public, anon;
revoke execute on function criar_vendedor(uuid, text, text, text)              from public, anon;
revoke execute on function redefinir_senha_vendedor(uuid, text)                from public, anon;
revoke execute on function vincular_usuario_painel(text, text, uuid, uuid)     from public, anon;
revoke execute on function listar_usuarios_painel()                            from public, anon;
grant  execute on function meu_perfil(), criar_vendedor(uuid, text, text, text), redefinir_senha_vendedor(uuid, text),
                           vincular_usuario_painel(text, text, uuid, uuid), listar_usuarios_painel()
  to authenticated, service_role;

notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------
-- 6) BOOTSTRAP (editar e descomentar; rodar uma vez)
-- ---------------------------------------------------------------------
-- a) Primeiro usuário da plataforma. Crie antes em Authentication > Users
--    (com "Auto Confirm User") e troque o e-mail abaixo:
-- insert into usuarios_painel (user_id, papel)
-- select id, 'plataforma' from auth.users where lower(email) = lower('SEU-EMAIL@EXEMPLO.COM')
-- on conflict (user_id) do update set papel = 'plataforma', operador_id = null, loja_id = null;

-- b) Vendedor de demonstração na "Unidade 1" da loja demo (troque a senha):
-- insert into vendedores (unidade_id, nome, email, senha_hash)
-- values ('00000000-0000-0000-0000-0000000000b1', 'Vendedor demo', 'vendedor@demo.provva',
--         extensions.crypt('TROQUE-ESTA-SENHA', extensions.gen_salt('bf')))
-- on conflict (email) do nothing;

-- ---------------------------------------------------------------------
-- 7) CONFERÊNCIA (só leitura)
-- ---------------------------------------------------------------------
select p.proname, p.prosecdef as security_definer, p.proconfig as search_path
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname in ('sessao_payload','vendedor_login','vendedor_sessao','vendedor_logout','registrar_geracao',
                     'meu_perfil','criar_vendedor','redefinir_senha_vendedor','vincular_usuario_painel','listar_usuarios_painel')
 order by p.proname;
