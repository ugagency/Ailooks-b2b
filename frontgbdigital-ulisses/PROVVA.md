# Provva — operador → loja → unidade → vendedores

Esta é a segunda camada sobre o Demo Totem (ver [DEMO-TOTEM.md](DEMO-TOTEM.md) para o histórico anterior:
seleção múltipla de peças, painel de catálogo single-tenant, deploy no Vercel). Este documento cobre
a estrutura multi-tenant: operadores, lojas, unidades, vendedores, créditos e o painel de gestão reescrito.

Continua sendo código de demonstração: sem consentimento/LGPD, sem handoff de tablet, sem estoque por
unidade, sem faturamento automático, sem self-service de onboarding pelo lojista. Papel `loja` no painel
existe na coluna do banco mas não tem policy nem tela — fica para uma etapa seguinte.

## Como rodar

```
cd gbdigital
python -m http.server 8123
```
- Tablet (vendedor): `http://localhost:8123/index.html`
- Painel (gestão): `http://localhost:8123/painel.html`

## Ordem de execução no Supabase

Rodar no SQL Editor do projeto AILOOKS, nesta ordem (todos idempotentes, podem rodar de novo):

1. `supabase/01_catalogo_loja.sql` — tabela `catalogo_loja` original, bucket `catalogo`.
2. `supabase/02_painel_policies.sql` — policies antigas de escrita autenticada (o `03` substitui as de
   `catalogo_loja`, mas o arquivo continua útil como registro histórico).
3. `supabase/03_estrutura_provva.sql` — `operadores`, `lojas`, `unidades`, `vendedores`,
   `sessoes_vendedor`, `geracoes`, `usuarios_painel`; migra o catálogo existente para uma "Loja demo";
   funções auxiliares de escopo (`loja_visivel`, `unidade_visivel`, ...); RLS completo; views
   `consumo_unidade_mes`, `frota_operador`, `vendedores_painel`; bucket `branding`.
4. `supabase/04_funcoes_provva.sql` — RPCs de login de vendedor, créditos e painel. Termina com dois
   blocos de bootstrap **comentados**: descomentar e rodar uma vez, com seus próprios valores.

### Bootstrap (obrigatório para o primeiro acesso)

1. No dashboard, **Authentication → Users → Add user**, marcando "Auto Confirm User". Esse é o primeiro
   usuário do painel.
2. No fim do `04_funcoes_provva.sql`, bloco 6a: trocar o e-mail e rodar o `insert into usuarios_painel ...`
   para vincular esse usuário como `plataforma`.
3. Bloco 6b (opcional): cria um vendedor de demonstração na "Unidade 1" da loja demo, para testar o
   tablet sem passar pelo painel primeiro.

## Modelo de acesso

Duas autenticações independentes, cada uma com seu próprio RLS:

- **Painel** — Supabase Auth (e-mail + senha) de sempre. O papel (`plataforma` ou `operador`) vem de
  `usuarios_painel`, resolvido pelo RPC `meu_perfil()`. Todo o escopo — quem vê qual loja, unidade,
  vendedor — é imposto por policies no banco (`loja_visivel()`, `unidade_visivel()`), não pela tela: um
  operador que tentar abrir a URL de uma loja alheia recebe RLS vazio, não um erro de JavaScript.
- **Tablet** — login próprio de vendedor, sem Supabase Auth. `vendedores.senha_hash` (bcrypt via
  `pgcrypto`), RPC `vendedor_login` cria um token em `sessoes_vendedor` (12h deslizantes), o token fica
  em `localStorage`. O papel `anon` não tem policy nem grant em nenhuma tabela da estrutura Provva —
  só os RPCs `security definer` decidem o que o tablet recebe, a partir do token. `catalogo_loja`
  continua com leitura pública (é vitrine, sempre foi).

Nenhum RPC devolve `senha_hash`; o payload da sessão é montado campo a campo (`jsonb_build_object`), nunca
por `select *` ou `to_jsonb` da linha inteira.

## Branding dinâmico no tablet

`gbdigital/totem.js` foi reescrito. Fluxo de boot:

1. Tela neutra (`#telaCarregando`, cinzas literais) enquanto resolve.
2. Token em `localStorage`? Chama `vendedor_sessao(token)`. Sem token, ou inválido: mostra o login do
   vendedor (reaproveita o `#authOverlay` do B2C, com "fechar"/"criar conta"/"esqueci a senha" ocultos).
3. Sessão válida → `aplicarBranding(loja.branding)` seta variáveis CSS (`--cor-primaria`,
   `--cor-secundaria`, os triplets RGB para o Tailwind, e uma cor de contraste calculada por luminância)
   **antes** de revelar `#appContent`. Nunca cacheia branding: um tablet reaproveitado nunca mostra a loja
   anterior antes da hora.
4. Campo ausente ou cor inválida → cai no padrão neutro (`#1A1A1A` / `#8E8E93`), sem travar e sem erro.

O Tailwind CDN foi fixado em `3.4.17` (a v4 do Play CDN não segue o mesmo esquema de config) e as cores
`primary`/`secondary` do `tailwind.config` viraram `rgb(var(--cor-x-rgb) / <alpha-value>)`, preservando os
modificadores de opacidade já usados no HTML (`bg-primary/40`, `ring-secondary`, etc). `style.css` teve os
três hexes literais trocados por `var(--cor-secundaria, ...)`.

## Créditos

- Pool mensal por **unidade** (não por loja, não compartilhado entre unidades da mesma loja):
  `geracoes_incluidas_mes` é coluna gerada (`totens_contratados × creditos_por_totem(plano)`), sem
  trigger — sempre coerente, sem estado para dessincronizar.
- Cada geração bem-sucedida do tablet chama `registrar_geracao(token, origem)`, que grava uma linha em
  `geracoes` (nunca uma por imagem: 3 variações de um mesmo clique = 1 linha) com `pg_advisory_xact_lock`
  por unidade, para a flag `excedente` ficar exata mesmo com dois tablets gerando ao mesmo tempo na mesma
  unidade.
- Nunca bloqueia. Acima do pool, grava `excedente = true` e segue normalmente.
- Avisos em 80% e 100% aparecem como toast no tablet (`totem.js`), com dedupe por mês — não repetem a
  cada geração.
- Mês de referência: `date_trunc('month', now() at time zone 'America/Sao_Paulo')`.

## Desconto de frota

`frota_operador` (view) soma `totens_contratados` das unidades `ativo` de todas as lojas do operador e
aplica `desconto_frota()`: 1–2 totens 0%, 3–4 5%, 5–9 10%, 10+ 15%. Só leitura — sem fatura, como
combinado.

## Painel

`gbdigital/painel.html` virou casca (login, papel, navegação, `<main id="rota">`) + `gbdigital/painel/*.js`,
scripts simples sem bundler, roteados por hash:

| Arquivo | Conteúdo |
|---|---|
| `ui.js` | `$`, `esc`, avisos/confirmação/modal genérico, campos de formulário, categorias e planos |
| `api.js` | Cliente Supabase, sessão, papel (`meu_perfil`), todas as consultas e RPCs |
| `router.js` | Rotas por hash, navegação por papel |
| `consumo.js` | `#/` — consumo do mês por unidade + frota por operador |
| `operadores.js` | `#/operadores` — só plataforma |
| `lojas.js` | `#/lojas`, `#/lojas/:id?aba=dados\|branding\|catalogo\|unidades` |
| `branding.js` | Logo, cores, preview ao vivo (mockup do tablet) |
| `catalogo.js` | CRUD do catálogo por loja; imagem em `<loja_id>/<SKU>.png` |
| `csv.js` | Importação de catálogo por CSV (nova; usada pela aba e pelo wizard) |
| `unidades.js` | `#/unidades/:id` — CRUD de unidade e seus vendedores |
| `usuarios.js` | `#/usuarios` — vincula usuário do Supabase Auth a um papel (só plataforma) |
| `wizard.js` | `#/nova-loja[?loja=ID]` — cadastro guiado em 5 passos |

### Wizard (cadastro guiado)

1. Loja (nome, operador, observação livre)
2. Branding (logo, cores, preview ao vivo)
3. Catálogo inicial (CSV, ou pular)
4. Unidades (uma ou mais; mostra o pool calculado por unidade e o total da loja)
5. Primeiro vendedor de cada unidade

Cada "Avançar" grava os dados do passo e `lojas.wizard_etapa = próximo` (`null` = concluído). Sair no meio
não perde nada: `#/nova-loja?loja=ID` reabre exatamente no passo salvo, com os dados já preenchidos. A
lista de lojas marca "cadastro incompleto" com um atalho "Continuar cadastro". Só nome e operador são
obrigatórios no passo 1; os demais podem ser pulados. Depois do wizard, adicionar unidade ou vendedor é
pelas telas normais — nenhuma lógica é duplicada, o wizard só chama as mesmas funções.

### Importação de catálogo por CSV

Cabeçalho `sku,nome,categoria,preco,estoque,ordem,ativo,imagem_url` (ordem livre; só `sku` e `nome` são
obrigatórios; sinônimos comuns são aceitos, ex. `price`, `stock`, `status`). Delimitador `;` ou `,`
detectado automaticamente; BOM e ANSI (windows-1252) tratados; campos entre aspas suportados; preço aceita
vírgula ou ponto decimal. `imagem_url` vazia recebe `catalogo/placeholder.svg` (a coluna é `NOT NULL`).
Linhas inválidas são listadas e ignoradas, nunca travam a importação inteira. `upsert` por
`(loja_id, sku)` em lotes de 200. Um aviso avisa quando `imagem_url` aponta para fora do Supabase: o
`toBlob()` do tablet faz `fetch()` na hora de gerar, e um site sem CORS aberto quebra silenciosamente.

## Testes

Três harnesses HTML, cada um com um dublê completo do cliente Supabase (`_test_duble.js`, compartilhado):
consulta com `select/insert/upsert/update/delete/eq/in/order/single/maybeSingle` (thenable), `auth.*`,
`storage.*` e todos os RPCs de `04_funcoes_provva.sql`, replicando o RLS por papel.

- `_test_multiselect.html` — 31 checks. Seleção múltipla de peças + geração; **novo nesta etapa**: uma
  `registrar_geracao` por geração bem-sucedida (não por imagem), com a origem certa (`multi_peca` vs
  `estilista`).
- `_test_tablet.html` — 37 checks. Boot sem token, senha errada, bloqueio por 5 tentativas, vendedor
  inativo, branding aplicado antes do reveal, contraste calculado, loja sem branding cai no neutro,
  créditos e avisos de 80%/100%, retomada de sessão por token sem "piscar" outra loja, isolamento de
  catálogo por loja.
- `_test_painel.html` — 56 checks. Papéis (plataforma vê tudo; operador só as próprias lojas, inclusive
  por URL direta e por RPC), catálogo por loja, upload com conversão para PNG, exclusão que deriva o
  caminho do arquivo pelo legado (raiz do bucket) e pelo novo (`<loja_id>/...`), importação CSV completa,
  unidades e vendedores (incluindo bloqueio de senha curta e o hash nunca aparecendo na tela), wizard
  criado → interrompido → retomado → concluído, vínculo de usuário, e a tela "sem acesso" para um login
  do Supabase Auth sem papel.

Rodar headless:
```
chrome --headless=new --virtual-time-budget=60000 --dump-dom http://127.0.0.1:8123/_test_painel.html
chrome --headless=new --virtual-time-budget=60000 --dump-dom http://127.0.0.1:8123/_test_tablet.html
chrome --headless=new --virtual-time-budget=60000 --dump-dom http://127.0.0.1:8123/_test_multiselect.html
```
Todos excluídos do deploy via `.vercelignore` (`_test_*.html`, `_test_duble.js`).

## Decisões tomadas que não estavam especificadas no prompt

- **Login de vendedor por RPC, não Supabase Auth.** Criar um usuário do Supabase Auth por vendedor
  multiplicaria contas fora do controle do painel. RPCs `security definer` com token próprio dão o mesmo
  nível de "regra de servidor" (RLS nega tudo a `anon`; só os RPCs decidem) sem essa duplicação.
- **Mitigação mínima de força bruta**: 5 falhas → bloqueio de 15 minutos; e-mail inexistente ainda roda
  `crypt()` contra um hash fixo (evita diferença de tempo que revelaria e-mails cadastrados); mensagem de
  erro sempre genérica no tablet.
- **`geracoes_incluidas_mes` é coluna gerada**, não recalculada por trigger — elimina uma classe inteira
  de bug de sincronização.
- **Migração do catálogo sem tocar nas linhas**: a "Loja demo" nasce com o mesmo UUID que já era o
  `default` de `catalogo_loja.loja_id`, então as 8 peças de exemplo do Demo Totem continuam válidas depois
  da migração, sem `update` nelas.
- **Imagens passam a viver em `<loja_id>/<SKU>.png`** nos buckets `catalogo` e `branding` (SKU sozinho
  colidiria entre lojas). Arquivos legados na raiz (da era single-tenant) continuam servindo pela URL já
  gravada; a exclusão deriva o caminho a partir da própria `imagem_url`, então funciona nos dois casos.
- **Papel `loja` fica só na coluna.** O prompt permitia adiar; não há policy nem tela para ele agora.
- **`vendedores_painel` é uma view sem `senha_hash`**, e a tabela `vendedores` teve os privilégios de
  coluna revogados e reconcedidos seletivamente (`select`/`update` sem a coluna de hash) — o painel não
  consegue puxar a senha nem por engano.
- **CSV**: schema de colunas não existia antes; nasceu junto com o painel novo, reaproveitado pelo wizard.

## O que ainda falta (manual, no Supabase)

1. Rodar `03` e `04` nesta ordem, no projeto AILOOKS (o MCP do Supabase não alcança esse projeto — ver
   memória da sessão; é sempre SQL manual).
2. Bootstrap: criar o primeiro usuário no Authentication → Users, depois rodar o bloco 6a comentado no
   fim do `04` com o e-mail certo.
3. Testar ponta a ponta com o Gemini real: login de vendedor → branding aplicado → geração → linha nova
   em `geracoes` → pill de créditos atualizada.
4. Subir fotos reais no bucket `catalogo` (os SVGs do Demo Totem continuam sendo só placeholder).
