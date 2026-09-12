-- =====================================================================
-- DIAGNÓSTICO — por que o operador não consegue criar loja
-- Rodar no SQL Editor do projeto AILOOKS, só leitura.
-- =====================================================================

-- 1) Confirma o vínculo do usuário: papel, operador_id, e se esse operador existe mesmo.
select u.email, p.papel, p.operador_id, o.nome as operador_nome, o.status as operador_status
  from usuarios_painel p
  join auth.users u on u.id = p.user_id
  left join operadores o on o.id = p.operador_id
 order by u.email;

-- 2) Confirma a policy de insert em "lojas" está exatamente como deveria
--    (with_check deve conter "operador_id = operador_atual()").
select policyname, cmd, qual as usando, with_check
  from pg_policies
 where schemaname = 'public' and tablename = 'lojas'
 order by policyname;

-- 3) Testa a função operador_atual() teria que ser chamada como o próprio usuário
--    (aqui roda como owner/service role, então SEMPRE vai dar null — é normal,
--    serve só para confirmar que a função existe e não dá erro de sintaxe).
select operador_atual();
