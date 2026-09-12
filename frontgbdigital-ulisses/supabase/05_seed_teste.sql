-- =====================================================================
-- SEED DE TESTE - Cria operador, lojas, unidades e catálogo
-- Rodar DEPOIS de 00_reset_dados.sql
-- =====================================================================

-- 1) Operador de Teste
INSERT INTO operadores (id, nome, documento, status)
VALUES ('11111111-1111-1111-1111-111111111111', 'Operador Teste', '12.345.678/0001-90', 'ativo')
ON CONFLICT (id) DO NOTHING;

-- 2) Lojas de Teste
INSERT INTO lojas (id, operador_id, nome, branding, status)
VALUES
  ('22222222-2222-2222-2222-222222222221', '11111111-1111-1111-1111-111111111111',
   'Loja Premium - Rio', '{"nome_exibicao": "Premium Rio", "cor_primaria": "#1A1A1A", "cor_secundaria": "#C78D75"}', 'ativo'),
  ('22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111',
   'Loja Standard - São Paulo', '{"nome_exibicao": "Standard SP", "cor_primaria": "#2A2A2A", "cor_secundaria": "#B8956A"}', 'ativo'),
  ('22222222-2222-2222-2222-222222222223', '11111111-1111-1111-1111-111111111111',
   'Loja Básica - Belo Horizonte', '{"nome_exibicao": "Básica BH", "cor_primaria": "#333333", "cor_secundaria": "#A0826D"}', 'ativo')
ON CONFLICT (id) DO NOTHING;

-- 3) Unidades de Teste
INSERT INTO unidades (id, loja_id, nome, endereco, totens_contratados, plano, status)
VALUES
  ('33333333-3333-3333-3333-333333333331', '22222222-2222-2222-2222-222222222221',
   'Shopping JK - Loja 1', 'Av. Presidente Juscelino, 500', 2, 'plus', 'ativo'),
  ('33333333-3333-3333-3333-333333333332', '22222222-2222-2222-2222-222222222221',
   'Barra - Flagship', 'Av. Sernambetiba, 2000', 4, 'max', 'ativo'),
  ('33333333-3333-3333-3333-333333333333', '22222222-2222-2222-2222-222222222222',
   'Iguatemi SP', 'Av. Brigadeiro Faria Lima, 2232', 1, 'base', 'ativo'),
  ('33333333-3333-3333-3333-333333333334', '22222222-2222-2222-2222-222222222223',
   'BH Shopping', 'Av. Getúlio Vargas, 1500', 1, 'base', 'ativo')
ON CONFLICT (id) DO NOTHING;

-- 4) Catálogo - 8 peças de exemplo
INSERT INTO catalogo_loja (id, loja_id, sku, nome, categoria, preco_centavos, estoque, ordem, imagem_url, ativo)
VALUES
  (gen_random_uuid(), '22222222-2222-2222-2222-222222222221', 'TOP-001', 'Camisa Oxford Branca', 'top', 24900, 12, 1, 'https://agzknkebggfytlqcsuuu.supabase.co/storage/v1/object/public/catalogo/TOP-001.png', true),
  (gen_random_uuid(), '22222222-2222-2222-2222-222222222221', 'TOP-002', 'Polo Piquet Azul-Marinho', 'top', 18900, 8, 2, 'https://agzknkebggfytlqcsuuu.supabase.co/storage/v1/object/public/catalogo/TOP-002.png', true),
  (gen_random_uuid(), '22222222-2222-2222-2222-222222222221', 'TOP-003', 'Blazer Linho Bege', 'top', 59900, 4, 3, 'https://agzknkebggfytlqcsuuu.supabase.co/storage/v1/object/public/catalogo/TOP-003.png', true),
  (gen_random_uuid(), '22222222-2222-2222-2222-222222222221', 'BOT-001', 'Calça Chino Caqui', 'bottom', 22900, 10, 1, 'https://agzknkebggfytlqcsuuu.supabase.co/storage/v1/object/public/catalogo/BOT-001.png', true),
  (gen_random_uuid(), '22222222-2222-2222-2222-222222222221', 'BOT-002', 'Calça Alfaiataria Cinza', 'bottom', 32900, 6, 2, 'https://agzknkebggfytlqcsuuu.supabase.co/storage/v1/object/public/catalogo/BOT-002.png', true),
  (gen_random_uuid(), '22222222-2222-2222-2222-222222222221', 'CAL-001', 'Loafer Couro Marrom', 'calcado', 39900, 5, 1, 'https://agzknkebggfytlqcsuuu.supabase.co/storage/v1/object/public/catalogo/CAL-001.png', true),
  (gen_random_uuid(), '22222222-2222-2222-2222-222222222221', 'CAL-002', 'Tênis Couro Branco', 'calcado', 29900, 9, 2, 'https://agzknkebggfytlqcsuuu.supabase.co/storage/v1/object/public/catalogo/CAL-002.png', true),
  (gen_random_uuid(), '22222222-2222-2222-2222-222222222221', 'ACE-001', 'Cinto Couro Marrom', 'acessorio', 9900, 15, 1, 'https://agzknkebggfytlqcsuuu.supabase.co/storage/v1/object/public/catalogo/ACE-001.png', true)
ON CONFLICT (loja_id, sku) DO NOTHING;

-- 5) Confirma dados criados
SELECT 'Operadores' as tabela, count(*) as registros FROM operadores
UNION ALL
SELECT 'Lojas', count(*) FROM lojas
UNION ALL
SELECT 'Unidades', count(*) FROM unidades
UNION ALL
SELECT 'Catálogo', count(*) FROM catalogo_loja;
