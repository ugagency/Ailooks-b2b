-- =====================================================================
-- FIX — corrige grant de SELECT em vendedores que faz referência a
-- colunas removidas (tentativas_falhas, bloqueado_ate).
-- =====================================================================

-- Remove o grant antigo que menciona colunas que não existem mais.
revoke select on vendedores from authenticated;

-- Reconcedem SELECT apenas nas colunas que ainda existem.
grant select (id, unidade_id, nome, email, status, created_at) on vendedores to authenticated;

-- Força reload das policies.
notify pgrst, 'reload schema';

-- Verificação: lista colunas de vendedores.
select column_name, data_type from information_schema.columns
 where table_name = 'vendedores' and table_schema = 'public'
 order by ordinal_position;
