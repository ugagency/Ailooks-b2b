-- =====================================================================
-- DEMO TOTEM — acesso de escrita para o painel do catálogo (painel.html)
-- Rodar DEPOIS de 01_catalogo_loja.sql, no SQL Editor do projeto AILOOKS.
--
-- Modelo escolhido: Supabase Auth (opção 1).
--   Leitura  : pública, para o totem funcionar sem login  (criada em 01)
--   Escrita  : só para usuários autenticados, ou seja, o painel
-- Nenhuma service role key é usada no navegador. O painel usa a mesma
-- chave anon do totem, que é pública por design e contida pelo RLS.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) CRIAR O USUÁRIO DO PAINEL (manual, uma vez, pelo dashboard)
--    Authentication > Users > Add user > Create new user
--    Marque "Auto Confirm User" para não depender de confirmação por e-mail.
--    Esse e-mail e senha são o login do painel.html.
--    Qualquer usuário autenticado do projeto consegue escrever no catálogo:
--    é uma demo de loja única, sem papéis nem permissões (fora do escopo).
-- ---------------------------------------------------------------------

-- ---------------------------------------------------------------------
-- 2) ESCRITA NA TABELA DO CATÁLOGO
-- ---------------------------------------------------------------------
drop policy if exists "catalogo insere autenticado" on catalogo_loja;
create policy "catalogo insere autenticado"
  on catalogo_loja for insert to authenticated
  with check (true);

drop policy if exists "catalogo atualiza autenticado" on catalogo_loja;
create policy "catalogo atualiza autenticado"
  on catalogo_loja for update to authenticated
  using (true) with check (true);

drop policy if exists "catalogo apaga autenticado" on catalogo_loja;
create policy "catalogo apaga autenticado"
  on catalogo_loja for delete to authenticated
  using (true);

-- ---------------------------------------------------------------------
-- 3) ESCRITA NO BUCKET catalogo
--    O upload usa upsert, que faz UPDATE quando o arquivo <SKU>.png já
--    existe — por isso a policy de update também é necessária.
-- ---------------------------------------------------------------------
drop policy if exists "catalogo storage insere autenticado" on storage.objects;
create policy "catalogo storage insere autenticado"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'catalogo');

drop policy if exists "catalogo storage atualiza autenticado" on storage.objects;
create policy "catalogo storage atualiza autenticado"
  on storage.objects for update to authenticated
  using (bucket_id = 'catalogo') with check (bucket_id = 'catalogo');

drop policy if exists "catalogo storage apaga autenticado" on storage.objects;
create policy "catalogo storage apaga autenticado"
  on storage.objects for delete to authenticated
  using (bucket_id = 'catalogo');

-- ---------------------------------------------------------------------
-- 4) CONFERÊNCIA (só leitura)
--    Esperado na tabela: leitura pública + insert/update/delete autenticado.
-- ---------------------------------------------------------------------
select policyname, cmd, roles
  from pg_policies
 where schemaname = 'public' and tablename = 'catalogo_loja'
 order by policyname;

select policyname, cmd, roles
  from pg_policies
 where schemaname = 'storage' and tablename = 'objects'
   and policyname like 'catalogo%'
 order by policyname;
