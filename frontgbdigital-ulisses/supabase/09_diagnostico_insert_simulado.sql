-- =====================================================================
-- DIAGNÓSTICO AVANÇADO — passo 3: tudo na MESMA transação, pra ver se o
-- "bate=true" continua valendo bem no instante em que o INSERT falha.
-- =====================================================================

begin;
select set_config('request.jwt.claims', '{"sub":"b9ba7e1d-c1da-4e79-ad30-c06ee701c527","role":"authenticated"}', true);
set local role authenticated;

select
  auth.uid()                                                    as meu_uid,
  papel_atual()                                                  as meu_papel,
  operador_atual()                                               as meu_operador_atual,
  operador_atual() = '11111111-1111-1111-1111-111111111111'::uuid as bate_antes_do_insert;

-- Não damos rollback antes disso: o insert roda no MESMO estado do select acima.
insert into lojas (nome, operador_id, observacao, wizard_etapa)
values ('TESTE DIAGNOSTICO — pode ignorar', '11111111-1111-1111-1111-111111111111', 'teste', 2)
returning id, nome, operador_id;

rollback;
