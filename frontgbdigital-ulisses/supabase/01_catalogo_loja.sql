-- =====================================================================
-- DEMO TOTEM — catálogo da loja
-- Rodar no SQL Editor do projeto AILOOKS (agzknkebggfytlqcsuuu).
-- Não altera user_wardrobe: o B2C continua funcionando.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0) VERIFICAÇÃO DE SEGURANÇA (rodar ANTES de tudo, só leitura)
--    Esperado: rowsecurity = true nas três tabelas do B2C.
--    Se vier false em user_wardrobe, a chave anon (que está no auth.js)
--    lê o closet de todos os usuários. Corrigir com o bloco 0b.
-- ---------------------------------------------------------------------
select tablename, rowsecurity
from pg_tables
where schemaname = 'public'
  and tablename in ('user_wardrobe', 'user_avatars', 'user_history');

select tablename, policyname, cmd, qual
from pg_policies
where schemaname = 'public'
  and tablename in ('user_wardrobe', 'user_avatars', 'user_history')
order by tablename, policyname;

-- 0b) Só se rowsecurity = false em alguma tabela acima (descomentar):
-- alter table user_wardrobe enable row level security;
-- create policy "dono le"     on user_wardrobe for select using (auth.uid() = user_id);
-- create policy "dono insere" on user_wardrobe for insert with check (auth.uid() = user_id);
-- create policy "dono apaga"  on user_wardrobe for delete using (auth.uid() = user_id);

-- ---------------------------------------------------------------------
-- 1) TABELA DO CATÁLOGO
-- ---------------------------------------------------------------------
create table if not exists catalogo_loja (
  id             uuid primary key default gen_random_uuid(),
  loja_id        uuid not null default '00000000-0000-0000-0000-000000000001', -- loja do demo
  sku            text not null,
  nome           text not null,
  imagem_url     text not null,
  categoria      text not null check (categoria in ('top', 'bottom', 'calcado', 'acessorio')),
  preco_centavos integer not null default 0,
  estoque        integer not null default 0,
  ativo          boolean not null default true,
  ordem          integer not null default 0,           -- ordem de exibição dentro da categoria
  created_at     timestamptz not null default now(),
  unique (loja_id, sku)
);

create index if not exists catalogo_loja_loja_categoria_idx
  on catalogo_loja (loja_id, categoria) where ativo;

alter table catalogo_loja enable row level security;

-- Vitrine: leitura pública. Escrita só via service role / dashboard.
drop policy if exists "catalogo leitura publica" on catalogo_loja;
create policy "catalogo leitura publica"
  on catalogo_loja for select using (true);

-- ---------------------------------------------------------------------
-- 2) BUCKET DE IMAGENS (público, só leitura anônima)
--    Subir as fotos em: catalogo/<sku>.png
--    URL pública: https://agzknkebggfytlqcsuuu.supabase.co/storage/v1/object/public/catalogo/<sku>.png
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('catalogo', 'catalogo', true)
on conflict (id) do nothing;

drop policy if exists "catalogo storage leitura publica" on storage.objects;
create policy "catalogo storage leitura publica"
  on storage.objects for select
  using (bucket_id = 'catalogo');

-- ---------------------------------------------------------------------
-- 3) SEED — 8 peças de exemplo (mesmos SKUs do gbdigital/catalogo.json)
--    Trocar imagem_url pelas fotos reais depois do upload no bucket.
-- ---------------------------------------------------------------------
insert into catalogo_loja (sku, nome, categoria, preco_centavos, estoque, ordem, imagem_url) values
  ('TOP-001', 'Camisa Oxford Branca',        'top',       24900, 12, 1, 'https://agzknkebggfytlqcsuuu.supabase.co/storage/v1/object/public/catalogo/TOP-001.png'),
  ('TOP-002', 'Polo Piquet Azul-Marinho',    'top',       18900,  8, 2, 'https://agzknkebggfytlqcsuuu.supabase.co/storage/v1/object/public/catalogo/TOP-002.png'),
  ('TOP-003', 'Blazer Linho Bege',           'top',       59900,  4, 3, 'https://agzknkebggfytlqcsuuu.supabase.co/storage/v1/object/public/catalogo/TOP-003.png'),
  ('BOT-001', 'Calça Chino Caqui',           'bottom',    22900, 10, 1, 'https://agzknkebggfytlqcsuuu.supabase.co/storage/v1/object/public/catalogo/BOT-001.png'),
  ('BOT-002', 'Calça Alfaiataria Cinza',     'bottom',    32900,  6, 2, 'https://agzknkebggfytlqcsuuu.supabase.co/storage/v1/object/public/catalogo/BOT-002.png'),
  ('CAL-001', 'Loafer Couro Marrom',         'calcado',   39900,  5, 1, 'https://agzknkebggfytlqcsuuu.supabase.co/storage/v1/object/public/catalogo/CAL-001.png'),
  ('CAL-002', 'Tênis Couro Branco',          'calcado',   29900,  9, 2, 'https://agzknkebggfytlqcsuuu.supabase.co/storage/v1/object/public/catalogo/CAL-002.png'),
  ('ACE-001', 'Cinto Couro Marrom',          'acessorio',  9900, 15, 1, 'https://agzknkebggfytlqcsuuu.supabase.co/storage/v1/object/public/catalogo/ACE-001.png')
on conflict (loja_id, sku) do update
  set nome = excluded.nome,
      categoria = excluded.categoria,
      preco_centavos = excluded.preco_centavos,
      estoque = excluded.estoque,
      ordem = excluded.ordem,
      imagem_url = excluded.imagem_url;
