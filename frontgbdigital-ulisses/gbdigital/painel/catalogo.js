// painel/catalogo.js — CRUD do catálogo de uma loja (aba "Catálogo" do detalhe da loja).
// Imagens vão para o bucket "catalogo" em <loja_id>/<SKU>.png (o RLS do storage checa a pasta).
window.Catalogo = (() => {
  const { $, esc, campo, erroCampo, limparErros } = UI;
  const BUCKET = 'catalogo';
  const TIPOS_ACEITOS = ['image/png', 'image/jpeg', 'image/webp'];
  const SKU_VALIDO = /^[A-Za-z0-9._-]+$/;
  const sanitizar = s => String(s).replace(/[^A-Za-z0-9._-]/g, '_');

  // JPG/JPEG/WEBP viram PNG antes de subir; PNG passa como está.
  async function converterParaPng(arquivo) {
    if (arquivo.type === 'image/png') return arquivo;
    const url = URL.createObjectURL(arquivo);
    try {
      const img = new Image();
      await new Promise((ok, falha) => {
        img.onload = ok;
        img.onerror = () => falha(new Error('Não foi possível ler a imagem escolhida.'));
        img.src = url;
      });
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth || img.width;
      canvas.height = img.naturalHeight || img.height;
      canvas.getContext('2d').drawImage(img, 0, 0);
      return await new Promise((ok, falha) => canvas.toBlob(
        b => b ? ok(b) : falha(new Error('Falha ao converter a imagem para PNG.')), 'image/png'));
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  const caminhoImagem = (lojaId, sku) => `${lojaId}/${sanitizar(sku)}.png`;

  async function subirImagem(lojaId, sku, arquivo) {
    const png = await converterParaPng(arquivo);
    return API.subirArquivo(BUCKET, caminhoImagem(lojaId, sku), png, 'image/png');
  }

  function ordenar(lista) {
    const idx = c => { const i = UI.ORDEM_CATEGORIAS.indexOf(c); return i === -1 ? UI.ORDEM_CATEGORIAS.length : i; };
    return [...lista].sort((a, b) =>
      idx(a.categoria) - idx(b.categoria) ||
      (Number(a.ordem || 0) - Number(b.ordem || 0)) ||
      String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR'));
  }

  // Renderiza a aba de catálogo da loja dentro de `container`.
  async function render(container, lojaId) {
    let pecas = [];
    let filtro = 'todas';

    container.innerHTML = `
      <div class="barra">
        <div class="filtros" id="cat-filtros" role="group" aria-label="Filtrar por categoria"></div>
        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
          <span class="rotulo" id="cat-contador">0 peças</span>
          <button type="button" class="btn btn-neutro" id="cat-importar">Importar CSV</button>
          <button type="button" class="btn btn-primario" id="cat-nova">+ Nova peça</button>
        </div>
      </div>
      <div class="quadro">
        <div class="rolagem">
          <table>
            <thead><tr><th>Imagem</th><th>SKU</th><th>Nome</th><th>Categoria</th><th>Preço</th><th>Estoque</th><th>Ativo</th><th></th></tr></thead>
            <tbody id="cat-corpo"></tbody>
          </table>
        </div>
        <div class="vazio" id="cat-vazio" hidden></div>
      </div>`;

    async function carregar() {
      pecas = ordenar(await API.listarCatalogo(lojaId));
      renderTabela();
    }

    function renderFiltros() {
      const opcoes = [{ valor: 'todas', rotulo: 'Todas' }, ...UI.CATEGORIAS];
      $('cat-filtros').innerHTML = '';
      opcoes.forEach(o => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'filtro';
        b.textContent = o.rotulo;
        b.dataset.categoria = o.valor;
        b.setAttribute('aria-pressed', String(filtro === o.valor));
        b.onclick = () => { filtro = o.valor; renderFiltros(); renderTabela(); };
        $('cat-filtros').appendChild(b);
      });
    }

    function renderTabela() {
      const lista = filtro === 'todas' ? pecas : pecas.filter(p => p.categoria === filtro);
      $('cat-contador').textContent = lista.length === 1 ? '1 peça' : `${lista.length} peças`;
      const corpo = $('cat-corpo');
      corpo.innerHTML = '';
      if (lista.length === 0) {
        $('cat-vazio').hidden = false;
        $('cat-vazio').textContent = pecas.length === 0
          ? 'Nenhuma peça cadastrada. Use "Nova peça" ou "Importar CSV".'
          : 'Nenhuma peça nesta categoria.';
        return;
      }
      $('cat-vazio').hidden = true;
      lista.forEach(p => {
        const tr = document.createElement('tr');
        tr.dataset.id = p.id;
        tr.dataset.sku = p.sku;
        if (!p.ativo) tr.classList.add('inativa');
        tr.innerHTML = `
          <td><img class="miniatura" src="${esc(p.imagem_url)}" alt="${esc(p.nome)}"></td>
          <td class="sku">${esc(p.sku)}</td>
          <td class="nome">${esc(p.nome)}</td>
          <td>${esc(UI.rotuloCategoria(p.categoria))}</td>
          <td>${UI.emReais(p.preco_centavos)}</td>
          <td>${esc(p.estoque)}</td>
          <td><label class="chave"><input type="checkbox" class="alternar-ativo" ${p.ativo ? 'checked' : ''} aria-label="Ativar ou desativar ${esc(p.nome)}"><span class="trilho"></span><span class="texto">${p.ativo ? 'Ativa' : 'Inativa'}</span></label></td>
          <td><div class="acoes"><button type="button" class="btn-mini editar">Editar</button><button type="button" class="btn-mini perigo excluir">Excluir</button></div></td>`;
        tr.querySelector('.alternar-ativo').onchange = ev => alternarAtivo(p, ev.target);
        tr.querySelector('.editar').onclick = () => abrirForm(p);
        tr.querySelector('.excluir').onclick = () => excluir(p);
        corpo.appendChild(tr);
      });
    }

    async function alternarAtivo(peca, caixa) {
      const novo = caixa.checked;
      caixa.disabled = true;
      try {
        await API.atualizarPeca(peca.id, { ativo: novo });
        peca.ativo = novo;
        UI.aviso(`"${peca.nome}" ${novo ? 'ativada' : 'desativada'}.`, 'ok');
        renderTabela();
      } catch (e) {
        caixa.checked = !novo;
        UI.aviso('Não foi possível alterar: ' + UI.erroDe(e), 'erro');
      } finally {
        caixa.disabled = false;
      }
    }

    function abrirForm(peca) {
      let imagemPendente = null;
      let imagemUrl = peca ? peca.imagem_url : null;
      const m = UI.abrirModal({
        titulo: peca ? 'Editar peça' : 'Nova peça',
        corpo: `<form id="form-peca" novalidate>
          <div id="form-erro" class="aviso-erro" hidden style="margin-bottom:14px"></div>
          <div class="grade">
            ${campo({ id: 'f-sku', rotulo: 'SKU', valor: peca ? peca.sku : '', attrs: `maxlength="40" placeholder="TOP-004" ${peca ? 'readonly' : ''}` })}
            ${campo({ id: 'f-categoria', rotulo: 'Categoria', valor: peca ? peca.categoria : 'top', opcoes: UI.CATEGORIAS })}
            ${campo({ id: 'f-nome', rotulo: 'Nome', valor: peca ? peca.nome : '', attrs: 'maxlength="120" placeholder="Camisa Oxford Branca"', largo: true })}
            ${campo({ id: 'f-preco', rotulo: 'Preço (R$)', tipo: 'number', valor: peca ? (Number(peca.preco_centavos || 0) / 100).toFixed(2) : '', attrs: 'min="0" step="0.01" placeholder="249,00"' })}
            ${campo({ id: 'f-estoque', rotulo: 'Estoque', tipo: 'number', valor: peca ? Number(peca.estoque || 0) : 0, attrs: 'min="0" step="1"' })}
            ${campo({ id: 'f-ordem', rotulo: 'Ordem na categoria', tipo: 'number', valor: peca ? Number(peca.ordem || 0) : 0, attrs: 'min="0" step="1"' })}
            ${campo({ id: 'f-ativo', rotulo: 'Ativa no tablet', tipo: 'checkbox', valor: peca ? !!peca.ativo : true })}
            <div class="campo largo">
              <label class="rotulo" for="f-imagem">Imagem da peça</label>
              <div class="caixa-imagem">
                <img id="form-preview" class="preview-imagem" alt="" ${imagemUrl ? `src="${esc(imagemUrl)}"` : ''}>
                <div style="flex:1;display:flex;flex-direction:column;gap:8px">
                  <input type="file" id="f-imagem" accept="image/png,image/jpeg,image/webp">
                  <span class="dica" id="status-imagem">${peca ? 'Escolher uma nova imagem substitui o arquivo no bucket.' : 'JPG e WEBP são convertidos para PNG. O arquivo vai para o bucket como &lt;loja&gt;/&lt;SKU&gt;.png.'}</span>
                  <span class="erro-campo" id="e-f-imagem"></span>
                </div>
              </div>
            </div>
          </div>
        </form>`,
        rodape: `<button type="button" class="btn btn-neutro" id="btn-cancelar-form">Cancelar</button>
                 <button type="submit" form="form-peca" class="btn btn-primario" id="btn-salvar">Salvar peça</button>`,
      });
      $('btn-cancelar-form').onclick = m.fechar;
      $('f-' + (peca ? 'nome' : 'sku')).focus();

      async function enviarPendente(sku) {
        if (!imagemPendente) return;
        $('status-imagem').textContent = 'Enviando imagem...';
        $('btn-salvar').disabled = true;
        try {
          imagemUrl = await subirImagem(lojaId, sku, imagemPendente);
          $('form-preview').src = imagemUrl;
          imagemPendente = null;
          $('status-imagem').textContent = `Imagem enviada como ${sanitizar(sku)}.png.`;
        } catch (e) {
          $('e-f-imagem').textContent = 'Falha ao enviar: ' + UI.erroDe(e);
          throw e;
        } finally {
          $('btn-salvar').disabled = false;
        }
      }

      $('f-imagem').onchange = async ev => {
        const arquivo = ev.target.files && ev.target.files[0];
        $('e-f-imagem').textContent = '';
        if (!arquivo) return;
        if (!TIPOS_ACEITOS.includes(arquivo.type)) {
          $('e-f-imagem').textContent = 'Formato não aceito. Use PNG, JPG ou WEBP.';
          ev.target.value = '';
          return;
        }
        $('form-preview').src = URL.createObjectURL(arquivo);
        imagemPendente = arquivo;
        const sku = $('f-sku').value.trim();
        if (!sku) { $('status-imagem').textContent = 'Preencha o SKU: a imagem sobe ao salvar.'; return; }
        await enviarPendente(sku).catch(() => { });
      };
      $('f-sku').onblur = () => {
        const sku = $('f-sku').value.trim();
        if (imagemPendente && sku && SKU_VALIDO.test(sku)) enviarPendente(sku).catch(() => { });
      };

      function validar() {
        limparErros(['f-sku', 'f-nome', 'f-preco', 'f-estoque', 'f-ordem', 'f-imagem']);
        let ok = true;
        const e = (id, msg) => { erroCampo(id, msg); if (msg) ok = false; };
        const sku = $('f-sku').value.trim();
        if (!sku) e('f-sku', 'Informe o SKU.');
        else if (!SKU_VALIDO.test(sku)) e('f-sku', 'Use apenas letras, números, ponto, hífen ou underline.');
        else if (!peca && pecas.some(p => p.sku.toLowerCase() === sku.toLowerCase())) e('f-sku', 'Já existe uma peça com este SKU.');
        if (!$('f-nome').value.trim()) e('f-nome', 'Informe o nome.');
        const preco = $('f-preco').value.trim();
        if (preco === '' || isNaN(Number(preco)) || Number(preco) < 0) e('f-preco', 'Informe um preço válido (0 ou mais).');
        const est = $('f-estoque').value.trim();
        if (est === '' || !Number.isInteger(Number(est)) || Number(est) < 0) e('f-estoque', 'Estoque deve ser um inteiro maior ou igual a zero.');
        const ord = $('f-ordem').value.trim();
        if (ord === '' || !Number.isInteger(Number(ord)) || Number(ord) < 0) e('f-ordem', 'Ordem deve ser um inteiro maior ou igual a zero.');
        if (!peca && !imagemUrl && !imagemPendente) e('f-imagem', 'Escolha uma imagem para a peça.');
        return ok;
      }

      $('form-peca').onsubmit = async ev => {
        ev.preventDefault();
        $('form-erro').hidden = true;
        if (!validar()) return;
        const sku = $('f-sku').value.trim();
        const btn = $('btn-salvar');
        btn.disabled = true; btn.textContent = 'Salvando...';
        try {
          if (imagemPendente) await enviarPendente(sku);
          const registro = {
            nome: $('f-nome').value.trim(),
            categoria: $('f-categoria').value,
            preco_centavos: Math.round(Number($('f-preco').value) * 100),
            estoque: Number($('f-estoque').value),
            ordem: Number($('f-ordem').value),
            ativo: $('f-ativo').checked,
            imagem_url: imagemUrl,
          };
          if (peca) { await API.atualizarPeca(peca.id, registro); UI.aviso(`"${registro.nome}" atualizada.`, 'ok'); }
          else { await API.inserirPeca({ ...registro, loja_id: lojaId, sku }); UI.aviso(`"${registro.nome}" cadastrada.`, 'ok'); }
          m.fechar();
          await carregar();
        } catch (e) {
          $('form-erro').textContent = (e.code === '23505' || /duplicate key|unique/i.test(e.message || ''))
            ? 'Já existe uma peça com este SKU nesta loja.' : 'Não foi possível salvar: ' + UI.erroDe(e);
          $('form-erro').hidden = false;
        } finally {
          btn.disabled = false; btn.textContent = 'Salvar peça';
        }
      };
    }

    async function excluir(peca) {
      const sim = await UI.confirmar(`Excluir "${peca.nome}" (${peca.sku})? A peça sai do catálogo e a imagem é apagada do bucket.`, { titulo: 'Excluir peça', ok: 'Excluir' });
      if (!sim) return;
      try {
        await API.excluirPeca(peca.id);
        const caminho = API.caminhoDeUrl(peca.imagem_url, BUCKET);
        if (caminho) {
          try { await API.removerArquivo(BUCKET, [caminho]); }
          catch (eArq) { UI.aviso(`Peça excluída, mas a imagem ${caminho} continua no bucket.`, 'erro'); await carregar(); return; }
        }
        UI.aviso(`"${peca.nome}" excluída.`, 'ok');
        await carregar();
      } catch (e) {
        UI.aviso('Não foi possível excluir: ' + UI.erroDe(e), 'erro');
      }
    }

    $('cat-nova').onclick = () => abrirForm(null);
    $('cat-importar').onclick = () => CSV.abrirImportacao(lojaId, carregar);
    renderFiltros();
    await carregar();
    return { carregar, get pecas() { return pecas; } };
  }

  return { render, subirImagem, converterParaPng, caminhoImagem, SKU_VALIDO, TIPOS_ACEITOS, BUCKET };
})();
