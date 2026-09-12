-- =====================================================================
-- VINCULAR ADMIN COMO OPERADOR
-- Configura admin@aprovva.com como operador no painel
-- =====================================================================

-- 1) Encontra o user_id do admin@aprovva.com em auth.users
-- Copie o user_id resultado e cola na linha abaixo
SELECT id as user_id, email FROM auth.users WHERE email = 'admin@aprovva.com';

-- 2) IMPORTANTE: Após ver o user_id acima, descomente a linha abaixo
--    e substitua 'seu-user-id-aqui' pelo user_id que apareceu:

-- INSERT INTO usuarios_painel (user_id, papel, operador_id, created_at)
-- VALUES ('seu-user-id-aqui', 'operador', '11111111-1111-1111-1111-111111111111', now())
-- ON CONFLICT (user_id) DO UPDATE SET papel = 'operador', operador_id = '11111111-1111-1111-1111-111111111111';

-- 3) Verifica se foi criado corretamente
SELECT up.user_id, up.papel, up.operador_id, o.nome as operador_nome
FROM usuarios_painel up
LEFT JOIN operadores o ON o.id = up.operador_id
WHERE up.user_id IN (SELECT id FROM auth.users WHERE email = 'admin@aprovva.com');
