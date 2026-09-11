// painel/branding.js — branding da loja (logo, cores, nome de exibição) com preview ao vivo
// de um mockup da tela do tablet. Usado pela aba "Branding" e pelo passo 2 do wizard.
window.Branding = (() => {
  const { $, esc, campo } = UI;
  const BUCKET = 'branding';
  const PADRAO = { nome_exibicao: '', logo_url: '', cor_primaria: '#1A1A1A', cor_secundaria: '#8E8E93' };
  const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

  function normalizarHex(v) {
    let s = String(v || '').trim();
    if (s && !s.startsWith('#')) s = '#' + s;
    if (!HEX.test(s)) return null;
    if (s.length === 4) s = '#' + s.slice(1).split('').map(c => c + c).join('');
    return s.toUpperCase();
  }

  function contraste(hex) {
    const h = normalizarHex(hex) || '#1A1A1A';
    const n = parseInt(h.slice(1), 16);
    const lin = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    const L = 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
    return L > 0.4 ? '#1A1A1A' : '#FFFFFF';
  }

  // Mockup simplificado da tela de atração do tablet.
  function preview(el, b) {
    const p = normalizarHex(b.cor_primaria) || PADRAO.cor_primaria;
    const s = normalizarHex(b.cor_secundaria) || PADRAO.cor_secundaria;
    const nome = (b.nome_exibicao || '').trim() || 'Nome da loja';
    el.innerHTML = `
      <span class="chip" style="background:${p};color:${contraste(p)}">Unidade · Vendedor</span>
      ${b.logo_url ? `<img class="logo" src="${esc(b.logo_url)}" alt="">` : `<div class="nome" style="color:${p}">${esc(nome)}</div>`}
      <p style="font-size:11px;color:#8E8E93;margin:0">Experimente as peças da loja em você.</p>
      <div class="cards">
        <div class="card" style="border-color:${s};box-shadow:0 0 0 2px ${s}33"></div>
        <div class="card"></div><div class="card"></div><div class="card"></div>
      </div>
      <span class="botao" style="background:${p};color:${contraste(p)}">Gerar look com IA</span>
      <span style="font-size:9px;color:${s};font-weight:700;letter-spacing:.15em;text-transform:uppercase">2 de 5 peças</span>`;
  }

  async function subirLogo(lojaId, arquivo) {
    const png = await Catalogo.converterParaPng(arquivo);
    return API.subirArquivo(BUCKET, `${lojaId}/logo.png`, png, 'image/png');
  }

  // Renderiza o formulário de branding em `container`. opcoes: { aoSalvar(loja), rotuloSalvar }
  function render(container, loja, opcoes = {}) {
    const atual = { ...PADRAO, ...(loja.branding || {}) };
    let logoPendente = null;
    let logoUrl = atual.logo_url || '';

    container.innerHTML = `
      <div class="grade-lado">
        <form id="form-branding" novalidate>
          <div id="br-erro" class="aviso-erro" hidden style="margin-bottom:14px"></div>
          <div class="grade">
            ${campo({ id: 'br-nome', rotulo: 'Nome de exibição', valor: atual.nome_exibicao || loja.nome || '', attrs: 'maxlength="60" placeholder="Como aparece no tablet"', largo: true })}
            <div class="campo">
              <label class="rotulo" for="br-primaria">Cor primária</label>
              <div style="display:flex;gap:8px;align-items:center">
                <input type="color" id="br-primaria" value="${normalizarHex(atual.cor_primaria) || PADRAO.cor_primaria}" style="width:56px;flex-shrink:0">
                <input type="text" id="br-primaria-hex" value="${normalizarHex(atual.cor_primaria) || PADRAO.cor_primaria}" maxlength="7" placeholder="#1A1A1A">
              </div>
              <span class="dica">Botões, selos e títulos.</span>
              <span class="erro-campo" id="e-br-primaria-hex"></span>
            </div>
            <div class="campo">
              <label class="rotulo" for="br-secundaria">Cor secundária</label>
              <div style="display:flex;gap:8px;align-items:center">
                <input type="color" id="br-secundaria" value="${normalizarHex(atual.cor_secundaria) || PADRAO.cor_secundaria}" style="width:56px;flex-shrink:0">
                <input type="text" id="br-secundaria-hex" value="${normalizarHex(atual.cor_secundaria) || PADRAO.cor_secundaria}" maxlength="7" placeholder="#C78D75">
              </div>
              <span class="dica">Destaques e seleção de peças.</span>
              <span class="erro-campo" id="e-br-secundaria-hex"></span>
            </div>
            <div class="campo largo">
              <label class="rotulo" for="br-logo">Logo</label>
              <div class="caixa-imagem">
                <img id="br-logo-preview" class="preview-imagem" style="object-fit:contain;height:84px;width:120px" alt="" ${logoUrl ? `src="${esc(logoUrl)}"` : ''}>
                <div style="flex:1;display:flex;flex-direction:column;gap:8px">
                  <input type="file" id="br-logo" accept="image/png,image/jpeg,image/webp">
                  <span class="dica">PNG com fundo transparente fica melhor. Sem logo, o tablet mostra o nome de exibição.</span>
                  <button type="button" class="btn-mini perigo" id="br-logo-remover" ${logoUrl ? '' : 'hidden'}>Remover logo</button>
                  <span class="erro-campo" id="e-br-logo"></span>
                </div>
              </div>
            </div>
          </div>
          <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:16px">
            <button type="submit" class="btn btn-primario" id="br-salvar">${esc(opcoes.rotuloSalvar || 'Salvar branding')}</button>
          </div>
        </form>
        <div>
          <p class="rotulo" style="margin:0 0 8px">Prévia do tablet</p>
          <div class="preview-totem" id="br-preview"></div>
          <p class="dica" style="margin-top:8px">Atualiza enquanto você ajusta. Cores fora do padrão caem no neutro do tablet.</p>
        </div>
      </div>`;

    const lerForm = () => ({
      nome_exibicao: $('br-nome').value.trim(),
      cor_primaria: normalizarHex($('br-primaria-hex').value) || $('br-primaria').value,
      cor_secundaria: normalizarHex($('br-secundaria-hex').value) || $('br-secundaria').value,
      logo_url: logoUrl,
    });
    const atualizarPreview = () => preview($('br-preview'), lerForm());

    ['br-nome'].forEach(id => $(id).oninput = atualizarPreview);
    [['br-primaria', 'br-primaria-hex'], ['br-secundaria', 'br-secundaria-hex']].forEach(([cor, hex]) => {
      $(cor).oninput = () => { $(hex).value = $(cor).value.toUpperCase(); atualizarPreview(); };
      $(hex).oninput = () => {
        const v = normalizarHex($(hex).value);
        UI.erroCampo(hex, v ? '' : 'Use o formato #RRGGBB.');
        if (v) $(cor).value = v;
        atualizarPreview();
      };
    });

    $('br-logo').onchange = ev => {
      const arquivo = ev.target.files && ev.target.files[0];
      UI.erroCampo('br-logo', '');
      if (!arquivo) return;
      if (!Catalogo.TIPOS_ACEITOS.includes(arquivo.type)) { UI.erroCampo('br-logo', 'Formato não aceito. Use PNG, JPG ou WEBP.'); ev.target.value = ''; return; }
      logoPendente = arquivo;
      logoUrl = URL.createObjectURL(arquivo);
      $('br-logo-preview').src = logoUrl;
      $('br-logo-remover').hidden = false;
      atualizarPreview();
    };
    $('br-logo-remover').onclick = () => {
      logoPendente = null; logoUrl = '';
      $('br-logo-preview').removeAttribute('src');
      $('br-logo').value = '';
      $('br-logo-remover').hidden = true;
      atualizarPreview();
    };

    $('form-branding').onsubmit = async ev => {
      ev.preventDefault();
      $('br-erro').hidden = true;
      const p = normalizarHex($('br-primaria-hex').value), s = normalizarHex($('br-secundaria-hex').value);
      UI.erroCampo('br-primaria-hex', p ? '' : 'Use o formato #RRGGBB.');
      UI.erroCampo('br-secundaria-hex', s ? '' : 'Use o formato #RRGGBB.');
      if (!p || !s) return;
      const btn = $('br-salvar');
      btn.disabled = true;
      try {
        if (logoPendente) {
          logoUrl = await subirLogo(loja.id, logoPendente);
          logoPendente = null;
          $('br-logo-preview').src = logoUrl;
        }
        const branding = { nome_exibicao: $('br-nome').value.trim(), cor_primaria: p, cor_secundaria: s, logo_url: logoUrl || null };
        const salvo = await API.salvarLoja({ branding }, loja.id);
        loja.branding = branding;
        UI.aviso('Branding salvo.', 'ok');
        if (opcoes.aoSalvar) await opcoes.aoSalvar(salvo || loja);
      } catch (e) {
        $('br-erro').textContent = 'Não foi possível salvar: ' + UI.erroDe(e);
        $('br-erro').hidden = false;
      } finally {
        btn.disabled = false;
      }
    };

    atualizarPreview();
  }

  return { render, preview, contraste, normalizarHex, subirLogo, PADRAO, BUCKET };
})();
