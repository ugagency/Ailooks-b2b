# Demo Totem — o que foi feito e o que falta

Adaptação da branch `ulisses` para o demo do totem. Código descartável: o objetivo é provar que
o produto funciona na frente do dono da empresa de totem. Nada aqui é base de produção.

## Como rodar

```
cd gbdigital
python -m http.server 8123
# abrir http://localhost:8123/index.html
```

Precisa de servidor HTTP (não abrir por `file://`): o catálogo local é carregado via `fetch`.

## O que mudou (frontend)

| Arquivo | Mudança |
|---|---|
| `gbdigital/totem.js` | **Novo.** Substitui `auth.js`: cria o cliente Supabase (anon), stub de `getAuthState()` sempre anônimo, `IS_TOTEM = true`. |
| `gbdigital/index.html` | Carrega `totem.js` em vez de `auth.js`. Regra CSS `.auth-only { display:none }`. Chat oculto (`hidden` na coluna direita), coluna de ferramentas vira `col-span-12`. Abas de foto: "Tirar foto" + "Manequim Pronto" ("Minhas imagens" oculta). `capture="user"` na foto. Upload de peça oculto; bloco `#catalogo-grid` no lugar. 4 rodas trocadas por seletor de ocasião (4 botões). Bloco `#resultJustificativa` abaixo dos looks. |
| `gbdigital/script.js` | `ANON_LIMIT` = ilimitado no totem. `OCASIOES` + `setOcasiao()`. `loadCatalogo()` lê `catalogo_loja` (Supabase) e cai para `catalogo.json` se a tabela não existir. Clique na peça seta `fileRef` (mesmo caminho do closet). `renderJustificativa()` mostra o texto da IA junto do resultado. `finalPrompt` fixo: `Estilo: Old Money`, momento/clima/formalidade derivados da ocasião, e agora envia `Contexto:` (o backend já lia esse campo, o B2C nunca mandava). |
| `gbdigital/catalogo.json` + `gbdigital/catalogo/*.svg` | **Novo.** 8 peças de exemplo com placeholders SVG. Serve para testar a UI sem banco. **Trocar por fotos reais antes do demo** — o Gemini não vai gerar nada útil a partir de um SVG com texto. |
| `supabase/01_catalogo_loja.sql` | **Novo.** Verificação de RLS, tabela `catalogo_loja`, bucket `catalogo`, seed com os mesmos 8 SKUs. |

Nada foi deletado. Tudo que saiu de cena está oculto (`hidden`, `.auth-only`, `style="display:none"`) e
o `auth.js` original continua no repositório. Para voltar ao B2C: trocar `totem.js` por `auth.js` no
`index.html` e remover a regra `.auth-only`.

## Seleção múltipla de peças (até 5)

Estado em `selectedPecas` (`script.js`), separado do `fileRef` que o closet B2C ainda usa.

- **Tetos por categoria** em `CATALOGO_LIMITES`: top 2, bottom 1, calcado 1, acessorio 1 (soma 5 = `CATALOGO_MAX_TOTAL`).
  Ao estourar o teto, `toggleSelecionarPeca()` remove a peça mais antiga daquela categoria (filtro sobre o array
  mantém a ordem de toque) e entra a nova. Feedback: o card novo dá um "pulso" de escala (Web Animations API), sem `alert`.
- **Tocar de novo desmarca.** Peça sem estoque continua selecionável e ganha um selo "Sem estoque" no card.
- **UI:** selo de check + borda no card, contador `N de 5 peças`, faixa `#pecas-selecionadas` com × por peça.
  Gerar fica desabilitado com 0 peças. A linha antiga de peça única (`#section-wardrobe-upload`) é ocultada no totem.
- **Envio:** `pecasOrdenadas()` ordena por `top, bottom, calcado, acessorio` mantendo a ordem de seleção dentro da
  categoria (sort estável). `image_reference`, `image_reference_2..5`, `nr_imagem` e `pecas_nomes` (nomes com `|`)
  saem todos desse mesmo array, então a ordem bate por construção. Cada URL vira Blob via `toBlob()`.
- **Resposta:** `justificativa` nula/vazia não renderiza nada; o bloco `#resultJustificativa` só aparece se ao menos
  um item trouxer texto.
- **Teste:** `gbdigital/_test_multiselect.html` (abrir via servidor HTTP) simula toques, intercepta o POST e valida
  campos, ordem e a regra da justificativa. 26 checks. Rodar headless:
  `chrome --headless=new --virtual-time-budget=40000 --dump-dom http://127.0.0.1:8123/_test_multiselect.html`.

## Painel do catálogo (`gbdigital/painel.html`)

Ferramenta de demonstração para o lojista cadastrar as peças. Arquivo único, HTML + CSS + JS próprios,
sem framework e sem build. Não usa `script.js`, `totem.js` nem `style.css`, e não altera o totem.

```
cd gbdigital && python -m http.server 8123
# abrir http://localhost:8123/painel.html
```

- **Acesso:** Supabase Auth (e-mail e senha). A escrita no banco e no bucket é liberada só para usuários
  autenticados pelas policies de `supabase/02_painel_policies.sql`. Nenhuma service role key no navegador.
  O usuário é criado à mão no dashboard (Authentication > Users > Add user, com "Auto Confirm").
- **Listagem:** miniatura, SKU, nome, categoria, preço, estoque e interruptor de ativo. Filtro por categoria.
  Ordena por categoria na sequência do totem (top, bottom, calcado, acessorio) e depois por `ordem`.
- **Imagem:** JPG e WEBP são convertidos para PNG por canvas antes de subir. O arquivo vai para a raiz do
  bucket `catalogo` como `<SKU>.png` com `upsert`, e `imagem_url` recebe a URL pública com `?v=<timestamp>`
  para não servir cache antigo (o nome do arquivo nunca muda).
- **Ativar/desativar** é direto na lista, sem abrir formulário. **Excluir** confirma numa janela da própria
  página, apaga a linha e remove o arquivo do bucket. Nenhum `alert()` ou `confirm()` nativo.
- **Teste:** `gbdigital/_test_painel.html` (abrir via servidor HTTP) substitui o Supabase por um dublê em
  memória e dirige a interface: login, ordenação, filtro, toggle, criar, editar, trocar imagem e excluir.
  47 checks. Headless: `chrome --headless=new --virtual-time-budget=40000 --dump-dom http://127.0.0.1:8123/_test_painel.html`.

## Pendências manuais (na ordem)

1. **Verificar RLS em `user_wardrobe`** — não consegui checar daqui: o MCP do Supabase só tem acesso ao
   projeto "renova", não ao projeto do AILOOKS (`agzknkebggfytlqcsuuu`), e as chamadas REST foram bloqueadas
   pelo sandbox. Rodar o bloco 0 do `supabase/01_catalogo_loja.sql` no SQL Editor. Se `rowsecurity = false`,
   aplicar o bloco 0b.
2. **Criar `catalogo_loja` e o bucket** — blocos 1 e 2 do mesmo SQL.
3. **Rodar `supabase/02_painel_policies.sql`** e criar o usuário do painel no dashboard (Authentication > Users).
4. **Subir fotos reais** no bucket `catalogo` como `<SKU>.png` e rodar o seed (bloco 3). Enquanto a tabela
   não existir, o front usa `catalogo.json` e avisa no rodapé do catálogo.
5. **Testar ponta a ponta com Gemini real** — foto (ou manequim) + peça do catálogo + ocasião → 3 looks.
6. *(Se sobrar tempo)* Style bible da loja no File Search do Gemini e ajustar o `Switch` do n8n.

## Avisos vindos da leitura do n8n (`n8n/Ia_look_backendweb.json`)

- **Só o ramo `OLD_MONEY` está completo.** É o único que passa pelo node que cria as 3 variações
  (`Code in JavaScript11`) e tem `Respond`. Os ramos `ATEMPORAL` e `ATHLEISURE` terminam em nós sem saída
  (`Code in JavaScript7` e `10`). Por isso o totem fixa `Estilo: Old Money`. Não é limitação do demo, é o estado
  do workflow.
- **Chaves de API do Gemini foram redigidas** nos nós `Edit Fields`, `Edit Fields4` e `Edit Fields7` antes do
  primeiro push (viraram `REDACTED_ROTATE_BEFORE_USE`). O workflow só volta a rodar com chaves reais, que devem
  entrar pelas credenciais do n8n e não como valor fixo no JSON. As chaves antigas, que ficaram expostas em disco
  até essa redação, precisam ser rotacionadas.
- O node `Edit an image` recebe exatamente `image_base` + `image_reference`. Suportar N peças exige mudar a
  chamada, não um parâmetro (item 7 do plano — fora do demo, como combinado).
- Formalidade: o front sempre mandou 1–3, o prompt do agente diz 1–5. O totem usa 1–3. Funciona, mas o range
  nunca é explorado.

## Riscos do plano que continuam valendo

- Demo com fotos padronizadas performa melhor que catálogo real de lojista pequeno. Misturar 3–4 fotos
  "ruins" de propósito antes do demo.
- Fotos de marca real no catálogo = exposição de PI. Hoje o repositório só tem placeholders SVG; ao trocar
  pelas fotos de verdade, usar banco licenciado ou fotos próprias.
- Demo bem-sucedido não fecha o gate de fidelidade (N peças, consumidores reais, 90%).
