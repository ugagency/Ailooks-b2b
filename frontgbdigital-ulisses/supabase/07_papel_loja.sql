-- =====================================================================
-- PROVVA — habilita o papel 'loja' (painel da própria loja)
-- Rodar DEPOIS de 03_estrutura_provva.sql e 04_funcoes_provva.sql. Idempotente.
--
-- 'loja' já existia como valor válido na coluna usuarios_painel.papel e no RPC
-- vincular_usuario_painel, mas loja_visivel() só reconhecia 'plataforma' e
-- 'operador' — um usuário papel 'loja' não via nada (RLS vazio). Este arquivo
-- fecha essa lacuna: loja_visivel() passa a aceitar a própria loja, o que
-- automaticamente abre unidades, vendedores, catálogo, geracoes, storage e as
-- views (todos já filtram por loja_visivel/unidade_visivel) — sem tocar em
-- nenhuma dessas policies.
-- =====================================================================

-- 1) Loja do usuário logado (paralelo a operador_atual()).
create or replace function loja_atual() returns uuid
language sql stable security definer set search_path = public, pg_temp as $$
  select loja_id from usuarios_painel where user_id = auth.uid()
$$;

revoke execute on function loja_atual() from public, anon;
grant  execute on function loja_atual() to authenticated, service_role;

-- 2) loja_visivel() passa a reconhecer o papel 'loja'.
create or replace function loja_visivel(p_loja uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(papel_atual() = 'plataforma', false)
      or exists (select 1 from lojas l where l.id = p_loja and l.operador_id = operador_atual())
      or p_loja = loja_atual()
$$;

-- 3) "lojas update": o with check original só liberava plataforma/operador da
--    própria rede; sem isso o papel 'loja' passaria o using() (loja_visivel)
--    mas seria bloqueado no check ao salvar (nome, observação, branding).
drop policy if exists "lojas update" on lojas;
create policy "lojas update" on lojas for update to authenticated
  using (loja_visivel(id))
  with check (papel_atual() = 'plataforma' or operador_id = operador_atual() or id = loja_atual());

notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------
-- 4) CONFERÊNCIA (só leitura)
-- ---------------------------------------------------------------------
select tablename, policyname, cmd from pg_policies
 where schemaname = 'public' and tablename = 'lojas'
 order by policyname;
