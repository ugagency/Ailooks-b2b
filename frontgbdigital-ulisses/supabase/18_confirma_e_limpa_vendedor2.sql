-- 1) Confirma se a função existe (se vier vazio, o script 15 não rodou ainda).
select proname from pg_proc where proname = 'vincular_vendedor_auth';

-- 2) Confirma de novo, sem ilike (evita pegar resultado da query errada por engano).
select count(*) as existe_em_vendedores from vendedores where email = 'vendedor2@maville.com';

-- 3) Se a função do passo 1 não existir, rode 15_vendedor_user_id.sql primeiro.
--    Depois, para limpar o usuário órfão no Auth, use o Dashboard:
--    Authentication > Users > busque vendedor2@maville.com > Delete user.
--    (Deletar via SQL direto em auth.users não é recomendado; o Admin API/Dashboard
--    cuida de tabelas internas relacionadas.)
