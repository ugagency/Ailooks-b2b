-- Confirma se vendedor2@maville.com ficou sem user_id vinculado.
select id, unidade_id, nome, email, user_id, status from vendedores where email ilike '%vendedor2%';

select id, email from auth.users where email ilike '%vendedor2%';
