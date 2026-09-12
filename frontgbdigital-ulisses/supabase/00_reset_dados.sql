-- =====================================================================
-- RESET DE DADOS - Limpa tudo mantendo a estrutura
-- Rodar no SQL Editor do projeto AILOOKS
-- =====================================================================

-- Desabilita triggers de FK temporariamente para evitar ordem de delete
ALTER TABLE geracoes DISABLE TRIGGER ALL;
ALTER TABLE sessoes_vendedor DISABLE TRIGGER ALL;
ALTER TABLE vendedores DISABLE TRIGGER ALL;
ALTER TABLE usuarios_painel DISABLE TRIGGER ALL;
ALTER TABLE catalogo_loja DISABLE TRIGGER ALL;
ALTER TABLE unidades DISABLE TRIGGER ALL;
ALTER TABLE lojas DISABLE TRIGGER ALL;
ALTER TABLE operadores DISABLE TRIGGER ALL;

-- Limpa tudo na ordem correta
DELETE FROM geracoes;
DELETE FROM sessoes_vendedor;
DELETE FROM vendedores;
DELETE FROM usuarios_painel;
DELETE FROM catalogo_loja;
DELETE FROM unidades;
DELETE FROM lojas;
DELETE FROM operadores;

-- Reabilita triggers
ALTER TABLE operadores ENABLE TRIGGER ALL;
ALTER TABLE lojas ENABLE TRIGGER ALL;
ALTER TABLE unidades ENABLE TRIGGER ALL;
ALTER TABLE catalogo_loja ENABLE TRIGGER ALL;
ALTER TABLE usuarios_painel ENABLE TRIGGER ALL;
ALTER TABLE vendedores ENABLE TRIGGER ALL;
ALTER TABLE sessoes_vendedor ENABLE TRIGGER ALL;
ALTER TABLE geracoes ENABLE TRIGGER ALL;

-- Confirma limpeza
SELECT 'Operadores' as tabela, count(*) as registros FROM operadores
UNION ALL
SELECT 'Lojas', count(*) FROM lojas
UNION ALL
SELECT 'Unidades', count(*) FROM unidades
UNION ALL
SELECT 'Vendedores', count(*) FROM vendedores
UNION ALL
SELECT 'Catálogo', count(*) FROM catalogo_loja
UNION ALL
SELECT 'Usuários Painel', count(*) FROM usuarios_painel
UNION ALL
SELECT 'Gerações', count(*) FROM geracoes;
