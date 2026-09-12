-- Existe no Auth?
select id, email, created_at from auth.users where email ilike '%maville%';

-- Existe na tabela vendedores?
select id, unidade_id, nome, email, status from vendedores where email ilike '%maville%';

-- Existe em usuarios_painel (não deveria, vendedor não tem vínculo lá)?
select * from usuarios_painel where user_id = (select id from auth.users where email = 'vendedor@maville.com');
