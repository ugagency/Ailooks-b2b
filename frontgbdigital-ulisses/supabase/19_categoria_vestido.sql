-- =====================================================================
-- PROVVA — adiciona a categoria "vestido" ao catálogo.
-- Rodar a qualquer momento. Sem migração de dados: só adiciona um valor
-- permitido a mais, não afeta linhas existentes.
--
-- Verifique o nome real da constraint antes de aplicar em produção:
--   select conname from pg_constraint
--    where conrelid = 'catalogo_loja'::regclass and contype = 'c';
-- Se o nome não bater com o assumido abaixo (padrão do Postgres:
-- <tabela>_<coluna>_check), ajuste o "drop constraint" para o nome real.
-- =====================================================================

alter table catalogo_loja
  drop constraint if exists catalogo_loja_categoria_check;

alter table catalogo_loja
  add constraint catalogo_loja_categoria_check
  check (categoria in ('top', 'bottom', 'vestido', 'calcado', 'acessorio'));

-- Conferência: lista a constraint aplicada.
select conname, pg_get_constraintdef(oid) as definicao
  from pg_constraint
 where conrelid = 'catalogo_loja'::regclass and contype = 'c';
