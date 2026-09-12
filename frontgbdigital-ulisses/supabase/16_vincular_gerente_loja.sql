-- =====================================================================
-- PROVVA — RPC de apoio à Edge Function criar-gerente-loja-auth.
-- Rodar a qualquer momento (idempotente).
--
-- vincular_usuario_painel() só deixa a 'plataforma' vincular QUALQUER
-- papel (plataforma/operador/loja) e exige que o usuário já exista no
-- Auth — bom para vínculos administrativos raros (novo operador), mas
-- trava demais para o caso comum "operador cadastra o gerente da
-- própria loja". Esta função é mais restrita em escopo (só papel
-- 'loja', só quem já vê a loja) e mais permissiva em quem pode chamar.
-- =====================================================================

create or replace function vincular_gerente_loja(p_loja uuid, p_user_id uuid) returns void
language plpgsql volatile security definer set search_path = public, pg_temp as $$
begin
  insert into usuarios_painel (user_id, papel, operador_id, loja_id)
  values (p_user_id, 'loja', null, p_loja)
  on conflict (user_id) do update
    set papel = 'loja', operador_id = null, loja_id = excluded.loja_id;
end $$;

-- Só a Edge Function (service_role) chama — ela mesma valida loja_visivel()
-- do usuário original antes de chegar aqui.
revoke execute on function vincular_gerente_loja(uuid, uuid) from public, anon, authenticated;
grant  execute on function vincular_gerente_loja(uuid, uuid) to service_role;

-- usuarios_painel não tem coluna de e-mail (nem de status) — painel/lojas.js
-- tentava selecionar user_email/status direto da tabela, o que sempre falhava.
-- Esta RPC junta com auth.users e devolve o formato que o front espera.
create or replace function listar_gerentes_loja(p_loja uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not loja_visivel(p_loja) then
    raise exception 'Sem permissão para esta loja' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('user_id', up.user_id, 'user_email', u.email, 'status', 'ativo') order by u.email)
      from usuarios_painel up
      join auth.users u on u.id = up.user_id
     where up.loja_id = p_loja and up.papel = 'loja'
  ), '[]'::jsonb);
end $$;

revoke execute on function listar_gerentes_loja(uuid) from public, anon;
grant  execute on function listar_gerentes_loja(uuid) to authenticated, service_role;

notify pgrst, 'reload schema';
