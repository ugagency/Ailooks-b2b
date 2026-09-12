// painel/csv.js — importação de catálogo por CSV (usada pela tela de catálogo e pelo wizard).
// Cabeçalho esperado: sku,nome,categoria,preco,estoque,ordem,ativo,imagem_url (ordem livre, só sku e nome são obrigatórios).
// Aceita ; ou , como delimitador, BOM, ANSI (windows-1252), campos entre aspas e preço com vírgula.
window.CSV = (() => {
  const { esc } = UI;
  const CABECALHO = ['sku', 'nome', 'categoria', 'preco', 'estoque', 'ordem', 'ativo', 'imagem_url'];
  const PLACEHOLDER = 'catalogo/placeholder.svg'; // imagem_url é NOT NULL: peça sem foto ganha o placeholder
  const SKU_VALIDO = /^[A-Za-z0-9._-]+$/;
  const LOTE = 200;

  const CATEGORIA = {
    top: 'top', 'parte de cima': 'top', cima: 'top', camisa: 'top', blusa: 'top',
    bottom: 'bottom', 'parte de baixo': 'bottom', baixo: 'bottom', calca: 'bottom',
    vestido: 'vestido', vestidos: 'vestido', dress: 'vestido',
    calcado: 'calcado', calcados: 'calcado', sapato: 'calcado', sapatos: 'calcado', tenis: 'calcado',
    acessorio: 'acessorio', acessorios: 'acessorio',
  };
  const SINONIMOS = {
    sku: 'sku', codigo: 'sku', code: 'sku',
    nome: 'nome', name: 'nome', produto: 'nome', descricao: 'nome',
    categoria: 'categoria', category: 'categoria', tipo: 'categoria',
    preco: 'preco', price: 'preco', valor: 'preco',
    estoque: 'estoque', stock: 'estoque', qtd: 'estoque', quantidade: 'estoque',
    ordem: 'ordem', order: 'ordem', posicao: 'ordem',
    ativo: 'ativo', active: 'ativo', status: 'ativo',
    imagem_url: 'imagem_url', imagem: 'imagem_url', image: 'imagem_url', url: 'imagem_url', foto: 'imagem_url',
  };

  const semAcento = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

  function decodificar(buffer) {
    let texto = new TextDecoder('utf-8').decode(buffer);
    if (texto.includes('�')) {
      try { texto = new TextDecoder('windows-1252').decode(buffer); } catch (e) { /* fica no utf-8 */ }
    }
    return texto.replace(/^﻿/, '');
  }

  function detectarDelimitador(primeiraLinha) {
    const pv = (primeiraLinha.match(/;/g) || []).length;
    const vg = (primeiraLinha.match(/,/g) || []).length;
    return pv >= vg ? ';' : ',';
  }

  // Parser simples com suporte a aspas ("campo; com delimitador" e aspas duplicadas).
  function separar(texto, delim) {
    const linhas = [];
    let linha = [], campo = '', aspas = false;
    for (let i = 0; i < texto.length; i++) {
      const ch = texto[i];
      if (aspas) {
        if (ch === '"') { if (texto[i + 1] === '"') { campo += '"'; i++; } else aspas = false; }
        else campo += ch;
      } else if (ch === '"') {
        aspas = true;
      } else if (ch === delim) {
        linha.push(campo); campo = '';
      } else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && texto[i + 1] === '\n') i++;
        linha.push(campo); linhas.push(linha); linha = []; campo = '';
      } else {
        campo += ch;
      }
    }
    if (campo !== '' || linha.length) { linha.push(campo); linhas.push(linha); }
    return linhas.filter(l => l.some(c => String(c).trim() !== ''));
  }

  function precoParaCentavos(v) {
    let s = String(v ?? '').trim().replace(/[R$\s]/g, '');
    if (s === '') return 0;
    if (s.includes(',') && s.includes('.')) s = s.replace(/\./g, '').replace(',', '.');
    else if (s.includes(',')) s = s.replace(',', '.');
    const n = Number(s);
    return isNaN(n) ? null : Math.round(n * 100);
  }

  function booleano(v) {
    const s = semAcento(v);
    if (s === '') return true;
    if (['sim', 's', 'true', '1', 'x', 'ativo', 'ativa', 'yes', 'y'].includes(s)) return true;
    if (['nao', 'n', 'false', '0', 'inativo', 'inativa', 'no'].includes(s)) return false;
    return null;
  }

  // Texto CSV -> { registros válidos, linhas inválidas, avisos }
  function analisar(texto, lojaId) {
    const primeira = texto.split(/\r?\n/)[0] || '';
    const delim = detectarDelimitador(primeira);
    const tabela = separar(texto, delim);
    if (tabela.length < 2) throw new Error('O arquivo precisa ter um cabeçalho e ao menos uma linha.');

    const colunas = tabela[0].map(c => SINONIMOS[semAcento(c).replace(/\s+/g, '_')] || SINONIMOS[semAcento(c)] || null);
    if (!colunas.includes('sku') || !colunas.includes('nome')) {
      throw new Error('O cabeçalho precisa ter ao menos as colunas "sku" e "nome". Colunas lidas: ' + tabela[0].join(' | '));
    }

    const validas = [], invalidas = [], avisos = [];
    const vistos = new Map();
    for (let i = 1; i < tabela.length; i++) {
      const bruta = tabela[i];
      const obj = {};
      colunas.forEach((col, idx) => { if (col) obj[col] = String(bruta[idx] ?? '').trim(); });
      const erros = [];

      const sku = obj.sku || '';
      if (!sku) erros.push('SKU vazio');
      else if (!SKU_VALIDO.test(sku)) erros.push('SKU com caracteres inválidos (use letras, números, ponto, hífen ou underline)');

      const nome = obj.nome || '';
      if (!nome) erros.push('nome vazio');

      const categoria = CATEGORIA[semAcento(obj.categoria)] || null;
      if (!categoria) erros.push(`categoria inválida "${obj.categoria || ''}" (use top, bottom, vestido, calcado ou acessorio)`);

      const preco = precoParaCentavos(obj.preco);
      if (preco === null || preco < 0) erros.push(`preço inválido "${obj.preco}"`);

      const estoque = obj.estoque === '' || obj.estoque === undefined ? 0 : Number(obj.estoque);
      if (!Number.isInteger(estoque) || estoque < 0) erros.push(`estoque inválido "${obj.estoque}"`);

      const ordem = obj.ordem === '' || obj.ordem === undefined ? 0 : Number(obj.ordem);
      if (!Number.isInteger(ordem) || ordem < 0) erros.push(`ordem inválida "${obj.ordem}"`);

      const ativo = booleano(obj.ativo);
      if (ativo === null) erros.push(`ativo inválido "${obj.ativo}" (use sim/não)`);

      let imagem = obj.imagem_url || '';
      if (!imagem) imagem = PLACEHOLDER;
      else if (/^https?:\/\//i.test(imagem) && !/supabase\.co\//i.test(imagem)) {
        avisos.push(`linha ${i + 1}: imagem externa (${imagem.slice(0, 40)}…) pode falhar no tablet se o site não permitir CORS.`);
      }

      if (vistos.has(sku)) avisos.push(`linha ${i + 1}: SKU "${sku}" repetido no arquivo; a última linha prevalece.`);
      vistos.set(sku, i);

      if (erros.length) { invalidas.push({ linha: i + 1, sku, erros }); continue; }
      validas.push({ loja_id: lojaId, sku, nome, categoria, preco_centavos: preco, estoque, ordem, ativo, imagem_url: imagem });
    }

    // SKU repetido: mantém a última ocorrência
    const porSku = new Map();
    validas.forEach(r => porSku.set(r.sku, r));
    return { registros: [...porSku.values()], invalidas, avisos, delim, colunas: tabela[0] };
  }

  async function importar(registros, aoProgresso) {
    let feitos = 0;
    for (let i = 0; i < registros.length; i += LOTE) {
      await API.upsertCatalogo(registros.slice(i, i + LOTE));
      feitos = Math.min(i + LOTE, registros.length);
      if (aoProgresso) aoProgresso(feitos, registros.length);
    }
    return feitos;
  }

  // Modal de importação. aoConcluir(total) é chamado depois do upsert.
  function abrirImportacao(lojaId, aoConcluir) {
    const m = UI.abrirModal({
      titulo: 'Importar catálogo por CSV',
      largura: '680px',
      corpo: `
        <p class="dica" style="margin:0 0 8px">Cabeçalho aceito (ordem livre; só <b>sku</b> e <b>nome</b> são obrigatórios). Delimitador <code>;</code> ou <code>,</code>.
        SKU já existente na loja é atualizado; novo é criado. Sem <code>imagem_url</code>, a peça entra com uma imagem provisória.</p>
        <pre class="csv-exemplo">sku;nome;categoria;preco;estoque;ordem;ativo;imagem_url
TOP-010;Camisa Linho Off-White;top;299,90;8;1;sim;
BOT-004;Calça Alfaiataria Preta;bottom;349,00;5;1;sim;https://.../BOT-004.png</pre>
        <div class="campo" style="margin-top:14px">
          <label class="rotulo" for="csv-arquivo">Arquivo CSV</label>
          <input type="file" id="csv-arquivo" accept=".csv,text/csv,text/plain">
          <span class="erro-campo" id="csv-erro"></span>
        </div>
        <div id="csv-previa"></div>`,
      rodape: `<button type="button" class="btn btn-neutro" id="csv-cancelar">Cancelar</button>
               <button type="button" class="btn btn-primario" id="csv-importar" disabled>Importar</button>`,
    });
    let analise = null;
    const $ = UI.$;
    $('csv-cancelar').onclick = m.fechar;

    $('csv-arquivo').onchange = async ev => {
      const arquivo = ev.target.files && ev.target.files[0];
      $('csv-erro').textContent = '';
      $('csv-previa').innerHTML = '';
      $('csv-importar').disabled = true;
      analise = null;
      if (!arquivo) return;
      try {
        const texto = decodificar(await arquivo.arrayBuffer());
        analise = analisar(texto, lojaId);
      } catch (e) {
        $('csv-erro').textContent = e.message || String(e);
        return;
      }
      const { registros, invalidas, avisos } = analise;
      const previa = registros.slice(0, 8).map(r => `<tr><td class="sku">${esc(r.sku)}</td><td>${esc(r.nome)}</td><td>${esc(UI.rotuloCategoria(r.categoria))}</td><td>${UI.emReais(r.preco_centavos)}</td><td>${r.estoque}</td><td>${r.ativo ? 'sim' : 'não'}</td></tr>`).join('');
      $('csv-previa').innerHTML = `
        <p style="margin:12px 0 6px"><b>${registros.length}</b> linha(s) válida(s)${invalidas.length ? `, <b style="color:var(--erro)">${invalidas.length}</b> inválida(s) que serão ignoradas` : ''}.</p>
        ${registros.length ? `<div class="rolagem"><table style="min-width:520px"><thead><tr><th>SKU</th><th>Nome</th><th>Categoria</th><th>Preço</th><th>Estoque</th><th>Ativo</th></tr></thead><tbody>${previa}</tbody></table></div>` : ''}
        ${registros.length > 8 ? `<p class="dica">… e mais ${registros.length - 8}.</p>` : ''}
        ${invalidas.length ? `<div class="aviso-erro" style="margin-top:10px">${invalidas.slice(0, 6).map(l => `linha ${l.linha}${l.sku ? ` (${esc(l.sku)})` : ''}: ${esc(l.erros.join('; '))}`).join('<br>')}${invalidas.length > 6 ? `<br>… e mais ${invalidas.length - 6}.` : ''}</div>` : ''}
        ${avisos.length ? `<div class="aviso-info" style="margin-top:10px">${avisos.slice(0, 4).map(esc).join('<br>')}${avisos.length > 4 ? `<br>… e mais ${avisos.length - 4}.` : ''}</div>` : ''}`;
      $('csv-importar').disabled = registros.length === 0;
      $('csv-importar').textContent = `Importar ${registros.length} peça(s)`;
    };

    $('csv-importar').onclick = async () => {
      if (!analise || !analise.registros.length) return;
      const btn = $('csv-importar');
      btn.disabled = true;
      try {
        await importar(analise.registros, (f, t) => { btn.textContent = `Importando ${f}/${t}...`; });
        UI.aviso(`${analise.registros.length} peça(s) importada(s).`, 'ok');
        m.fechar();
        if (aoConcluir) await aoConcluir(analise.registros.length);
      } catch (e) {
        $('csv-erro').textContent = 'Falha ao importar: ' + UI.erroDe(e);
        btn.disabled = false;
        btn.textContent = 'Importar';
      }
    };
  }

  return { CABECALHO, PLACEHOLDER, decodificar, analisar, importar, abrirImportacao, precoParaCentavos, separar };
})();
