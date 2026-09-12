// painel/wizard.js — cadastro guiado de loja (#/nova-loja e #/nova-loja?loja=ID para retomar).
// Cada passo grava no banco e avança lojas.wizard_etapa; sair no meio não perde nada.
// O wizard só orquestra: reaproveita Branding.render, CSV.abrirImportacao, Unidades.formulario e
// Unidades.formularioVendedor — as mesmas funções das telas normais.
window.Wizard = (() => {
  const { $, esc, campo, erroCampo, limparErros } = UI;
  const PASSOS = [
    { n: 1, rotulo: 'Loja' },
    { n: 2, rotulo: 'Branding' },
    { n: 3, rotulo: 'Catálogo' },
    { n: 4, rotulo: 'Unidades' },
    { n: 5, rotulo: 'Vendedores' },
  ];

  async function avancarPara(loja, etapa) {
    // null = concluído
    await API.salvarLoja({ wizard_etapa: etapa }, loja.id);
    loja.wizard_etapa = etapa;
    if (etapa === null) Rotas.navegar(`#/lojas/${loja.id}`);
    else Rotas.navegar(`#/nova-loja?loja=${loja.id}&etapa=${etapa}`);
  }

  function cabecalho(container, loja, etapa) {
    container.innerHTML = `
      <div class="migalhas"><a href="#/lojas">Lojas</a> › Cadastro guiado${loja ? ' › ' + esc(loja.nome) : ''}</div>
      <div class="cabecalho"><div><h1>${loja ? esc(loja.nome) : 'Nova loja'}</h1><p class="dica sub">Cada passo é salvo na hora. Você pode sair e continuar depois pela lista de lojas.</p></div></div>
      <div class="passos">${PASSOS.map(p => `<span class="passo ${p.n === etapa ? 'atual' : ''} ${loja && (loja.wizard_etapa === null || p.n < (loja.wizard_etapa || 1)) ? 'feito' : ''}" data-passo="${p.n}"><span class="num">${p.n}</span>${p.rotulo}</span>`).join('')}</div>
      <div class="quadro"><div class="corpo-quadro" id="wz-corpo"></div></div>`;
    // passos já feitos são clicáveis para revisar
    container.querySelectorAll('.passo.feito').forEach(el => {
      el.style.cursor = 'pointer';
      el.onclick = () => Rotas.navegar(`#/nova-loja?loja=${loja.id}&etapa=${el.dataset.passo}`);
    });
    return $('wz-corpo');
  }

  /* ---------------------- passo 1: loja ---------------------- */
  async function passoLoja(container, loja) {
    const corpo = cabecalho(container, loja, 1);
    const operadores = await Lojas.operadoresDisponiveis();
    const l = loja || { nome: '', observacao: '', operador_id: API.perfil?.operador_id || (operadores[0] && operadores[0].valor) || '' };
    corpo.innerHTML = `<form id="wz-form-loja" novalidate>
      <div id="wz-erro" class="aviso-erro" hidden style="margin-bottom:14px"></div>
      <div class="grade">
        ${campo({ id: 'wz-nome', rotulo: 'Nome da loja (marca)', valor: l.nome, attrs: 'maxlength="80" placeholder="MA Ville"', largo: true })}
        ${API.ehPlataforma()
          ? campo({ id: 'wz-operador', rotulo: 'Operador', valor: l.operador_id, opcoes: operadores, dica: operadores.length ? '' : 'Cadastre um operador antes.' })
          : `<input type="hidden" id="wz-operador" value="${l.operador_id}"><div style="padding:6px 0"><span class="rotulo">Operador</span><div style="margin-top:4px">${operadores.find(o => o.valor === l.operador_id)?.rotulo || '—'}</div></div>`}
        <div></div>
        ${campo({ id: 'wz-observacao', rotulo: 'Segmento / observação (livre)', tipo: 'textarea', valor: l.observacao || '', attrs: 'maxlength="500" placeholder="Contexto para quem for configurar o catálogo depois"', largo: true })}
      </div>
      <div style="display:flex;justify-content:flex-end;margin-top:16px"><button type="submit" class="btn btn-primario" id="wz-avancar">Salvar e avançar</button></div>
    </form>`;
    $('wz-nome').focus();
    $('wz-form-loja').onsubmit = async ev => {
      ev.preventDefault();
      limparErros(['wz-nome', 'wz-operador']);
      let ok = true;
      if (!$('wz-nome').value.trim()) { erroCampo('wz-nome', 'Informe o nome.'); ok = false; }
      if (!$('wz-operador').value) { erroCampo('wz-operador', 'Escolha o operador.'); ok = false; }
      if (!ok) return;
      $('wz-avancar').disabled = true;
      try {
        const campos = { nome: $('wz-nome').value.trim(), operador_id: $('wz-operador').value, observacao: $('wz-observacao').value.trim() || null, wizard_etapa: 2 };
        const salva = await API.salvarLoja(campos, loja ? loja.id : null);
        UI.aviso(loja ? 'Loja atualizada.' : 'Loja criada.', 'ok');
        Rotas.navegar(`#/nova-loja?loja=${salva.id}&etapa=2`);
      } catch (e) {
        $('wz-erro').textContent = UI.erroDe(e); $('wz-erro').hidden = false; $('wz-avancar').disabled = false;
      }
    };
  }

  /* ---------------------- passo 2: branding ---------------------- */
  function passoBranding(container, loja) {
    const corpo = cabecalho(container, loja, 2);
    corpo.innerHTML = `<div id="wz-branding"></div>
      <div style="display:flex;justify-content:space-between;margin-top:8px;flex-wrap:wrap;gap:8px">
        <a class="btn btn-neutro" href="#/nova-loja?loja=${loja.id}&etapa=1">Voltar</a>
        <button type="button" class="btn btn-neutro" id="wz-pular">Pular por enquanto</button>
      </div>`;
    Branding.render($('wz-branding'), loja, { rotuloSalvar: 'Salvar e avançar', aoSalvar: () => avancarPara(loja, 3) });
    $('wz-pular').onclick = () => avancarPara(loja, 3);
  }

  /* ---------------------- passo 3: catálogo ---------------------- */
  async function passoCatalogo(container, loja) {
    const corpo = cabecalho(container, loja, 3);
    const pecas = await API.listarCatalogo(loja.id);
    corpo.innerHTML = `
      <div class="cartoes" style="margin-bottom:16px">
        <div class="cartao-info"><span class="rotulo">Peças no catálogo</span><div class="valor" id="wz-qtd">${pecas.length}</div><span class="dica">Você pode cadastrar peça a peça depois, na aba Catálogo da loja.</span></div>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button type="button" class="btn btn-primario" id="wz-csv">Importar CSV</button>
        <a class="btn btn-neutro" href="#/lojas/${loja.id}?aba=catalogo">Cadastrar peça a peça</a>
      </div>
      <div style="display:flex;justify-content:space-between;margin-top:20px;flex-wrap:wrap;gap:8px">
        <a class="btn btn-neutro" href="#/nova-loja?loja=${loja.id}&etapa=2">Voltar</a>
        <button type="button" class="btn btn-primario" id="wz-avancar">${pecas.length ? 'Avançar' : 'Pular e avançar'}</button>
      </div>`;
    $('wz-csv').onclick = () => CSV.abrirImportacao(loja.id, async () => {
      const novas = await API.listarCatalogo(loja.id);
      $('wz-qtd').textContent = novas.length;
      $('wz-avancar').textContent = 'Avançar';
    });
    $('wz-avancar').onclick = () => avancarPara(loja, 4);
  }

  /* ---------------------- passo 4: unidades ---------------------- */
  async function passoUnidades(container, loja) {
    const corpo = cabecalho(container, loja, 4);
    const unidades = await API.listarUnidades(loja.id);
    const total = unidades.filter(u => u.status === 'ativo').reduce((s, u) => s + Unidades.creditos(u), 0);
    corpo.innerHTML = `
      <p class="dica" style="margin:0 0 12px">Cada unidade (ponto físico) tem seus totens contratados e plano. O pool de gerações é por unidade e não é compartilhado entre unidades.</p>
      <ul class="lista-simples" id="wz-unidades">
        ${unidades.map(u => `<li><span><b>${esc(u.nome)}</b> <span class="dica">· ${UI.rotuloPlano(u.plano)} · ${u.totens_contratados} totem(ns)</span></span><span>${UI.numero(u.geracoes_incluidas_mes ?? Unidades.creditos(u))} gerações/mês</span></li>`).join('')}
        ${unidades.length ? '' : '<li class="dica">Nenhuma unidade ainda.</li>'}
      </ul>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-top:12px;flex-wrap:wrap;gap:8px">
        <button type="button" class="btn btn-neutro" id="wz-add-unidade">+ Adicionar unidade</button>
        <div><span class="rotulo">Total da loja</span><div style="font-family:'Playfair Display',serif;font-size:22px">${UI.numero(total)} gerações/mês</div></div>
      </div>
      ${unidades.length ? '' : '<div class="aviso-info" style="margin-top:12px">Sem unidade não há totem nem vendedor. Dá para avançar mesmo assim e criar depois.</div>'}
      <div style="display:flex;justify-content:space-between;margin-top:20px;flex-wrap:wrap;gap:8px">
        <a class="btn btn-neutro" href="#/nova-loja?loja=${loja.id}&etapa=3">Voltar</a>
        <button type="button" class="btn btn-primario" id="wz-avancar">Avançar</button>
      </div>`;
    $('wz-add-unidade').onclick = async () => { if (await Unidades.formulario(loja.id, null)) await passoUnidades(container, loja); };
    $('wz-avancar').onclick = () => avancarPara(loja, 5);
  }

  /* ---------------------- passo 5: primeiro vendedor por unidade ---------------------- */
  async function passoVendedores(container, loja) {
    const corpo = cabecalho(container, loja, 5);
    const [unidades, vendedores] = await Promise.all([API.listarUnidades(loja.id), API.listarVendedores()]);
    const porUnidade = {};
    vendedores.forEach(v => { (porUnidade[v.unidade_id] ||= []).push(v); });
    corpo.innerHTML = `
      <p class="dica" style="margin:0 0 12px">Crie o primeiro vendedor de cada unidade para o tablet ficar logável. Os demais entram depois pela tela da unidade.</p>
      <ul class="lista-simples">
        ${unidades.map(u => {
          const vs = porUnidade[u.id] || [];
          return `<li><span><b>${esc(u.nome)}</b><div class="dica">${vs.length ? vs.map(v => esc(v.nome) + ' · ' + esc(v.email)).join('<br>') : 'sem vendedor'}</div></span>
            <button type="button" class="btn-mini wz-add-vendedor" data-unidade="${u.id}">${vs.length ? '+ Outro vendedor' : '+ Primeiro vendedor'}</button></li>`;
        }).join('')}
        ${unidades.length ? '' : '<li class="dica">Nenhuma unidade cadastrada — volte ao passo 4 para criar uma.</li>'}
      </ul>
      <div style="display:flex;justify-content:space-between;margin-top:20px;flex-wrap:wrap;gap:8px">
        <a class="btn btn-neutro" href="#/nova-loja?loja=${loja.id}&etapa=4">Voltar</a>
        <button type="button" class="btn btn-primario" id="wz-concluir">Concluir cadastro</button>
      </div>`;
    corpo.querySelectorAll('.wz-add-vendedor').forEach(b => b.onclick = async () => {
      if (await Unidades.formularioVendedor(b.dataset.unidade, null)) await passoVendedores(container, loja);
    });
    $('wz-concluir').onclick = async () => {
      await avancarPara(loja, null);
      UI.aviso('Cadastro concluído.', 'ok');
    };
  }

  /* ---------------------- rota ---------------------- */
  async function tela({ query, container }) {
    const lojaId = query.get('loja');
    if (!lojaId) { await passoLoja(container, null); return; }
    const loja = await API.obterLoja(lojaId);
    if (!loja) { container.innerHTML = UI.vazio('Loja não encontrada ou sem acesso.'); return; }
    if (loja.wizard_etapa === null && !query.get('etapa')) { Rotas.navegar(`#/lojas/${loja.id}`); return; }
    const etapa = Number(query.get('etapa')) || loja.wizard_etapa || 1;
    const fn = { 1: passoLoja, 2: passoBranding, 3: passoCatalogo, 4: passoUnidades, 5: passoVendedores }[etapa] || passoLoja;
    await fn(container, loja);
  }

  Rotas.registrar('/nova-loja', tela, { papeis: ['plataforma', 'operador'], titulo: 'Cadastro guiado' });
  return { PASSOS };
})();
