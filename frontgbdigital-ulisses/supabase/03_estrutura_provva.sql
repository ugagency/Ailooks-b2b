-- =====================================================================
-- PROVVA — estrutura operador → loja → unidade → vendedores
-- Rodar DEPOIS de 01_catalogo_loja.sql e 02_painel_policies.sql,
-- no SQL Editor do projeto AILOOKS. Idempotente: pode rodar de novo.
--
-- Modelo de acesso:
--   * Painel  : Supabase Auth + papéis em usuarios_painel (plataforma | operador).
--   * Tablet  : login próprio de vendedor (e-mail + senha, bcrypt) via RPC
--               em 04_funcoes_provva.sql. O papel anon NÃO lê nenhuma
--               tabela desta estrutura diretamente — só o que os RPCs devolvem.
--   * Catálogo: continua leitura pública (é vitrine).
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------
-- 1) TABELAS
-- ---------------------------------------------------------------------
create table if not exists operadores (
  id          uuid primary key default gen_random_uuid(),
  nome        text not null,
  documento   text,
  status      text not null default 'ativo' check (status in ('ativo', 'suspenso')),
  created_at  timestamptz not null default now()
);

create table if not exists lojas (
  id            uuid primary key default gen_random_uuid(),
  operador_id   uuid not null references operadores(id),
  nome          text not null,
  observacao    text,
  -- {logo_url, cor_primaria, cor_secundaria, nome_exibicao}; campos ausentes caem no padrão neutro do tablet
  branding      jsonb not null default '{}'::jsonb,
  -- passo do onboarding em andamento (1..5); null = cadastro concluído
  wizard_etapa  smallint check (wizard_etapa between 1 and 5),
  status        text not null default 'ativo' check (status in ('ativo', 'inativo')),
  created_at    timestamptz not null default now()
);

-- Gerações incluídas por totem contratado, por plano.
create or replace function creditos_por_totem(p_plano text) returns integer
language sql immutable as $$
  select case p_plano
           when 'base'  then 1000
           when 'plus'  then 2000
           when 'max'   then 3500
           when 'scale' then 5000
           else 0 end
$$;

create table if not exists unidades (
  id                      uuid primary key default gen_random_uuid(),
  loja_id                 uuid not null references lojas(id),
  nome                    text not null,
  endereco                text,
  totens_contratados      integer not null default 1 check (totens_contratados >= 1),
  plano                   text not null default 'base' check (plano in ('base', 'plus', 'max', 'scale')),
  -- explícito e sempre coerente: recalculado pelo banco ao editar totens ou plano
  geracoes_incluidas_mes  integer generated always as (totens_contratados * creditos_por_totem(plano)) stored,
  status                  text not null default 'ativo' check (status in ('ativo', 'inativo')),
  created_at              timestamptz not null default now()
);

create table if not exists vendedores (
  id                 uuid primary key default gen_random_uuid(),
  unidade_id         uuid not null references unidades(id),
  nome               text not null,
  email              text not null unique check (email = lower(email)),
  senha_hash         text not null,
  status             text not null default 'ativo' check (status in ('ativo', 'inativo')),
  tentativas_falhas  integer not null default 0,
  bloqueado_ate      timestamptz,
  created_at         timestamptz not null default now()
);

create table if not exists sessoes_vendedor (
  token        uuid primary key default gen_random_uuid(),
  vendedor_id  uuid not null references vendedores(id) on delete cascade,
  criado_em    timestamptz not null default now(),
  expira_em    timestamptz not null
);

create table if not exists geracoes (
  id           bigint generated always as identity primary key,
  unidade_id   uuid not null references unidades(id),      -- de onde sai o crédito
  loja_id      uuid not null references lojas(id),         -- denormalizado: relatório por marca sem join
  vendedor_id  uuid references vendedores(id),             -- auditoria
  origem       text not null check (origem in ('multi_peca', 'estilista')),
  excedente    boolean not null default false,             -- true quando passou do pool do mês
  mes_ref      date not null,                              -- 1º dia do mês em America/Sao_Paulo
  criado_em    timestamptz not null default now()
);
create index if not exists geracoes_unidade_mes_idx on geracoes (unidade_id, mes_ref);
create index if not exists geracoes_loja_mes_idx on geracoes (loja_id, mes_ref);

create table if not exists usuarios_painel (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  papel        text not null check (papel in ('plataforma', 'operador', 'loja')),
  operador_id  uuid references operadores(id),
  loja_id      uuid references lojas(id),
  created_at   timestamptz not null default now(),
  check (papel <> 'operador' or operador_id is not null),
  check (papel <> 'loja' or loja_id is not null)
);

-- ---------------------------------------------------------------------
-- 2) MIGRAÇÃO DO CATÁLOGO EXISTENTE
--    A loja demo recebe o id que já era o default de catalogo_loja.loja_id,
--    então as linhas atuais passam a apontar para uma loja real sem update
--    de dados. Depois o default some e a coluna vira FK.
-- ---------------------------------------------------------------------
insert into operadores (id, nome)
values ('00000000-0000-0000-0000-00000000000a', 'Provva (demo)')
on conflict (id) do nothing;

insert into lojas (id, operador_id, nome, branding)
values ('00000000-0000-0000-0000-000000000001',
        '00000000-0000-0000-0000-00000000000a',
        'Loja demo',
        -- mantém a paleta que o demo já usava (o padrão neutro do tablet é cinza)
        '{"nome_exibicao": "AI Looks", "cor_primaria": "#1A1A1A", "cor_secundaria": "#C78D75"}'::jsonb)
on conflict (id) do nothing;

-- Qualquer linha órfã (loja_id sem loja) vai para a loja demo.
update catalogo_loja
   set loja_id = '00000000-0000-0000-0000-000000000001'
 where loja_id not in (select id from lojas);

alter table catalogo_loja alter column loja_id drop default;
alter table catalogo_loja drop constraint if exists catalogo_loja_loja_id_fkey;
alter table catalogo_loja
  add constraint catalogo_loja_loja_id_fkey foreign key (loja_id) references lojas(id);

insert into unidades (id, loja_id, nome, totens_contratados, plano)
values ('00000000-0000-0000-0000-0000000000b1',
        '00000000-0000-0000-0000-000000000001',
        'Unidade 1', 1, 'base')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- 3) FUNÇÕES AUXILIARES (escopo do usuário do painel)
--    security definer para ler usuarios_painel sem depender das policies;
--    search_path fixo (exigência de segurança para security definer).
-- ---------------------------------------------------------------------
create or replace function papel_atual() returns text
language sql stable security definer set search_path = public, pg_temp as $$
  select papel from usuarios_painel where user_id = auth.uid()
$$;

create or replace function operador_atual() returns uuid
language sql stable security definer set search_path = public, pg_temp as $$
  select operador_id from usuarios_painel where user_id = auth.uid()
$$;

create or replace function loja_visivel(p_loja uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(papel_atual() = 'plataforma', false)
      or exists (select 1 from lojas l where l.id = p_loja and l.operador_id = operador_atual())
$$;

create or replace function unidade_visivel(p_unidade uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from unidades u where u.id = p_unidade and loja_visivel(u.loja_id))
$$;

-- Arquivo em <loja_id>/... é da loja; arquivo na raiz (legado) só a plataforma mexe.
create or replace function pasta_loja_visivel(p_name text) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select case
           when split_part(p_name, '/', 1) ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
             then loja_visivel(split_part(p_name, '/', 1)::uuid)
           else coalesce(papel_atual() = 'plataforma', false)
         end
$$;

-- Mês de referência dos créditos: 1º dia do mês corrente em São Paulo.
create or replace function mes_atual() returns date
language sql stable as $$
  select (date_trunc('month', (now() at time zone 'America/Sao_Paulo')))::date
$$;

-- Desconto de frota por total de totens ativos do operador.
create or replace function desconto_frota(p_totens integer) returns integer
language sql immutable as $$
  select case
           when coalesce(p_totens, 0) >= 10 then 15
           when coalesce(p_totens, 0) >= 5  then 10
           when coalesce(p_totens, 0) >= 3  then 5
           else 0 end
$$;

-- Nada disso é para o anon (o tablet nunca chama direto).
revoke execute on function papel_atual()               from public, anon;
revoke execute on function operador_atual()            from public, anon;
revoke execute on function loja_visivel(uuid)          from public, anon;
revoke execute on function unidade_visivel(uuid)       from public, anon;
revoke execute on function pasta_loja_visivel(text)    from public, anon;
revoke execute on function mes_atual()                 from public, anon;
revoke execute on function desconto_frota(integer)     from public, anon;
revoke execute on function creditos_por_totem(text)    from public, anon;
grant execute on function papel_atual(), operador_atual(), loja_visivel(uuid), unidade_visivel(uuid),
                          pasta_loja_visivel(text), mes_atual(), desconto_frota(integer), creditos_por_totem(text)
  to authenticated, service_role;

-- ---------------------------------------------------------------------
-- 4) RLS — anon sem acesso direto; authenticated escopado por papel
-- ---------------------------------------------------------------------
alter table operadores       enable row level security;
alter table lojas            enable row level security;
alter table unidades         enable row level security;
alter table vendedores       enable row level security;
alter table sessoes_vendedor enable row level security;
alter table geracoes         enable row level security;
alter table usuarios_painel  enable row level security;

revoke all on table operadores, lojas, unidades, vendedores, sessoes_vendedor, geracoes, usuarios_painel from anon;

-- operadores
drop policy if exists "operadores select" on operadores;
create policy "operadores select" on operadores for select to authenticated
  using (papel_atual() = 'plataforma' or id = operador_atual());
drop policy if exists "operadores insert" on operadores;
create policy "operadores insert" on operadores for insert to authenticated
  with check (papel_atual() = 'plataforma');
drop policy if exists "operadores update" on operadores;
create policy "operadores update" on operadores for update to authenticated
  using (papel_atual() = 'plataforma') with check (papel_atual() = 'plataforma');
drop policy if exists "operadores delete" on operadores;
create policy "operadores delete" on operadores for delete to authenticated
  using (papel_atual() = 'plataforma');

-- lojas
drop policy if exists "lojas select" on lojas;
create policy "lojas select" on lojas for select to authenticated
  using (loja_visivel(id));
drop policy if exists "lojas insert" on lojas;
create policy "lojas insert" on lojas for insert to authenticated
  with check (papel_atual() = 'plataforma' or operador_id = operador_atual());
drop policy if exists "lojas update" on lojas;
create policy "lojas update" on lojas for update to authenticated
  using (loja_visivel(id))
  with check (papel_atual() = 'plataforma' or operador_id = operador_atual()); -- operador não transfere loja
drop policy if exists "lojas delete" on lojas;
create policy "lojas delete" on lojas for delete to authenticated
  using (papel_atual() = 'plataforma');

-- unidades
drop policy if exists "unidades select" on unidades;
create policy "unidades select" on unidades for select to authenticated
  using (loja_visivel(loja_id));
drop policy if exists "unidades insert" on unidades;
create policy "unidades insert" on unidades for insert to authenticated
  with check (loja_visivel(loja_id));
drop policy if exists "unidades update" on unidades;
create policy "unidades update" on unidades for update to authenticated
  using (loja_visivel(loja_id)) with check (loja_visivel(loja_id));
drop policy if exists "unidades delete" on unidades;
create policy "unidades delete" on unidades for delete to authenticated
  using (papel_atual() = 'plataforma');

-- vendedores: senha_hash nunca sai para o cliente.
-- Privilégio de tabela é revogado e reconcedido por coluna (revogar só a coluna
-- não funciona quando existe grant de tabela). Inserção só pelo RPC criar_vendedor.
revoke all on table vendedores from authenticated;
grant select (id, unidade_id, nome, email, status, tentativas_falhas, bloqueado_ate, created_at) on vendedores to authenticated;
grant update (nome, email, status, unidade_id) on vendedores to authenticated;
grant delete on vendedores to authenticated;
drop policy if exists "vendedores select" on vendedores;
create policy "vendedores select" on vendedores for select to authenticated
  using (unidade_visivel(unidade_id));
drop policy if exists "vendedores update" on vendedores;
create policy "vendedores update" on vendedores for update to authenticated
  using (unidade_visivel(unidade_id)) with check (unidade_visivel(unidade_id));
drop policy if exists "vendedores delete" on vendedores;
create policy "vendedores delete" on vendedores for delete to authenticated
  using (unidade_visivel(unidade_id));

-- sessoes_vendedor: só os RPCs (owner) tocam.
revoke all on table sessoes_vendedor from authenticated;

-- geracoes: painel só lê; a escrita é do RPC registrar_geracao.
revoke insert, update, delete on table geracoes from authenticated;
drop policy if exists "geracoes select" on geracoes;
create policy "geracoes select" on geracoes for select to authenticated
  using (unidade_visivel(unidade_id));

-- usuarios_painel
drop policy if exists "usuarios_painel select" on usuarios_painel;
create policy "usuarios_painel select" on usuarios_painel for select to authenticated
  using (user_id = auth.uid() or papel_atual() = 'plataforma');
drop policy if exists "usuarios_painel insert" on usuarios_painel;
create policy "usuarios_painel insert" on usuarios_painel for insert to authenticated
  with check (papel_atual() = 'plataforma');
drop policy if exists "usuarios_painel update" on usuarios_painel;
create policy "usuarios_painel update" on usuarios_painel for update to authenticated
  using (papel_atual() = 'plataforma') with check (papel_atual() = 'plataforma');
drop policy if exists "usuarios_painel delete" on usuarios_painel;
create policy "usuarios_painel delete" on usuarios_painel for delete to authenticated
  using (papel_atual() = 'plataforma');

-- catalogo_loja: leitura pública fica (vitrine); escrita passa a ser por loja visível.
drop policy if exists "catalogo insere autenticado"   on catalogo_loja;
drop policy if exists "catalogo atualiza autenticado" on catalogo_loja;
drop policy if exists "catalogo apaga autenticado"    on catalogo_loja;
drop policy if exists "catalogo insert loja" on catalogo_loja;
create policy "catalogo insert loja" on catalogo_loja for insert to authenticated
  with check (loja_visivel(loja_id));
drop policy if exists "catalogo update loja" on catalogo_loja;
create policy "catalogo update loja" on catalogo_loja for update to authenticated
  using (loja_visivel(loja_id)) with check (loja_visivel(loja_id));
drop policy if exists "catalogo delete loja" on catalogo_loja;
create policy "catalogo delete loja" on catalogo_loja for delete to authenticated
  using (loja_visivel(loja_id));

-- storage: bucket branding novo; arquivos vivem em <loja_id>/...
insert into storage.buckets (id, name, public)
values ('branding', 'branding', true)
on conflict (id) do nothing;

drop policy if exists "catalogo storage leitura publica"    on storage.objects;
drop policy if exists "catalogo storage insere autenticado" on storage.objects;
drop policy if exists "catalogo storage atualiza autenticado" on storage.objects;
drop policy if exists "catalogo storage apaga autenticado"  on storage.objects;

drop policy if exists "provva storage leitura publica" on storage.objects;
create policy "provva storage leitura publica" on storage.objects for select
  using (bucket_id in ('catalogo', 'branding'));
drop policy if exists "provva storage insert loja" on storage.objects;
create policy "provva storage insert loja" on storage.objects for insert to authenticated
  with check (bucket_id in ('catalogo', 'branding') and pasta_loja_visivel(name));
drop policy if exists "provva storage update loja" on storage.objects;
create policy "provva storage update loja" on storage.objects for update to authenticated
  using (bucket_id in ('catalogo', 'branding') and pasta_loja_visivel(name))
  with check (bucket_id in ('catalogo', 'branding') and pasta_loja_visivel(name));
drop policy if exists "provva storage delete loja" on storage.objects;
create policy "provva storage delete loja" on storage.objects for delete to authenticated
  using (bucket_id in ('catalogo', 'branding') and pasta_loja_visivel(name));

-- ---------------------------------------------------------------------
-- 5) VIEWS (security_invoker: o RLS das tabelas vale para quem consulta)
-- ---------------------------------------------------------------------
drop view if exists consumo_unidade_mes;
create view consumo_unidade_mes with (security_invoker = true) as
select u.id                      as unidade_id,
       u.loja_id,
       l.nome                    as loja_nome,
       l.operador_id,
       u.nome                    as unidade_nome,
       u.plano,
       u.totens_contratados,
       u.status,
       u.geracoes_incluidas_mes  as incluidas,
       count(g.id)::int          as usadas,
       greatest(u.geracoes_incluidas_mes - count(g.id), 0)::int as saldo,
       greatest(count(g.id) - u.geracoes_incluidas_mes, 0)::int as excedente,
       case when u.geracoes_incluidas_mes = 0
              then case when count(g.id) > 0 then 100 else 0 end
            else round(count(g.id) * 100.0 / u.geracoes_incluidas_mes)
       end::int                  as percentual,
       mes_atual()               as mes_ref
  from unidades u
  join lojas l on l.id = u.loja_id
  left join geracoes g on g.unidade_id = u.id and g.mes_ref = mes_atual()
 group by u.id, l.id;

drop view if exists frota_operador;
create view frota_operador with (security_invoker = true) as
select o.id   as operador_id,
       o.nome as operador_nome,
       coalesce(sum(u.totens_contratados) filter (where u.status = 'ativo'), 0)::int as totens,
       desconto_frota(coalesce(sum(u.totens_contratados) filter (where u.status = 'ativo'), 0)::int) as desconto_pct
  from operadores o
  left join lojas l on l.operador_id = o.id
  left join unidades u on u.loja_id = l.id
 group by o.id;

drop view if exists vendedores_painel;
create view vendedores_painel with (security_invoker = true) as
select id, unidade_id, nome, email, status, bloqueado_ate, created_at
  from vendedores;

revoke all on consumo_unidade_mes, frota_operador, vendedores_painel from anon;
grant select on consumo_unidade_mes, frota_operador, vendedores_painel to authenticated, service_role;

-- PostgREST recarrega o esquema (novas tabelas/views/funções aparecem na API).
notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------
-- 6) CONFERÊNCIA (só leitura)
-- ---------------------------------------------------------------------
select tablename, rowsecurity from pg_tables
 where schemaname = 'public'
   and tablename in ('operadores','lojas','unidades','vendedores','sessoes_vendedor','geracoes','usuarios_painel','catalogo_loja')
 order by tablename;

select tablename, policyname, cmd from pg_policies
 where schemaname = 'public' and tablename in ('operadores','lojas','unidades','vendedores','geracoes','usuarios_painel','catalogo_loja')
 order by tablename, policyname;
