-- =====================================================================
-- DIAGNÓSTICO — simula o contexto do vendedor logado via JWT e testa
-- se loja_visivel()/unidade_visivel() e a policy "vendedores select"
-- realmente liberam a leitura da própria linha.
-- =====================================================================

-- 1) Confirma que o usuário existe no Auth e pega o uid.
select id as uid, email from auth.users where email = 'vendedor@maville.com';

-- 2) Confirma a linha na tabela vendedores (rodando como admin, sem RLS).
select id, unidade_id, nome, email, status from vendedores where email = 'vendedor@maville.com';

-- 3) Simula o mesmo contexto de JWT que o PostgREST usa quando o vendedor
--    está logado (troque <UID> pelo id retornado no passo 1).
begin;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', (select id from auth.users where email = 'vendedor@maville.com')::text,
                     'email', 'vendedor@maville.com',
                     'role', 'authenticated')::text,
  true
);
set local role authenticated;

select auth.jwt() ->> 'email' as jwt_email, auth.uid() as jwt_uid;

select id, unidade_id, nome, email, status
  from vendedores
 where email = 'vendedor@maville.com';

select loja_visivel(u.loja_id) as loja_ok, unidade_visivel(u.id) as unidade_ok, u.id, u.loja_id
  from unidades u
  join vendedores v on v.unidade_id = u.id
 where v.email = 'vendedor@maville.com';

rollback;
