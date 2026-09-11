// painel/ui.js — utilidades de interface compartilhadas pelas telas do painel.
// Sem alert()/confirm(): avisos flutuantes e modais da própria página.
window.UI = (() => {
  const $ = id => document.getElementById(id);

  const esc = t => String(t ?? '').replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));

  // Ordem canônica das categorias — a mesma do tablet.
  const CATEGORIAS = [
    { valor: 'top', rotulo: 'Parte de cima' },
    { valor: 'bottom', rotulo: 'Parte de baixo' },
    { valor: 'calcado', rotulo: 'Calçados' },
    { valor: 'acessorio', rotulo: 'Acessórios' },
  ];
  const ORDEM_CATEGORIAS = CATEGORIAS.map(c => c.valor);
  const rotuloCategoria = v => (CATEGORIAS.find(c => c.valor === v) || {}).rotulo || v;

  // Planos: gerações incluídas por totem contratado, por mês (espelha creditos_por_totem no banco).
  const PLANOS = [
    { valor: 'base', rotulo: 'Base', creditos: 1000 },
    { valor: 'plus', rotulo: 'Plus', creditos: 2000 },
    { valor: 'max', rotulo: 'Max', creditos: 3500 },
    { valor: 'scale', rotulo: 'Scale', creditos: 5000 },
  ];
  const creditosPlano = plano => (PLANOS.find(p => p.valor === plano) || {}).creditos || 0;
  const rotuloPlano = plano => (PLANOS.find(p => p.valor === plano) || {}).rotulo || plano;

  const emReais = centavos => (Number(centavos || 0) / 100)
    .toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const numero = n => Number(n || 0).toLocaleString('pt-BR');
  const dataBr = iso => iso ? new Date(iso).toLocaleDateString('pt-BR') : '';

  // Mensagem legível a partir de um erro do Supabase/PostgREST/JS.
  function erroDe(e) {
    if (!e) return 'Erro desconhecido.';
    if (e.code === '23505' || /duplicate key|unique/i.test(e.message || '')) return 'Já existe um registro com esse valor.';
    if (e.code === '42501' || /permission denied|row-level security/i.test(e.message || '')) return 'Sem permissão para esta ação.';
    if (e.code === '23503' || /foreign key/i.test(e.message || '')) return 'Não é possível: há registros dependentes.';
    return e.message || String(e);
  }

  /* ---------------------- avisos flutuantes ---------------------- */
  function aviso(mensagem, tipo = 'ok') {
    const el = document.createElement('div');
    el.className = 'aviso ' + tipo;
    el.textContent = mensagem;
    $('avisos').appendChild(el);
    setTimeout(() => el.remove(), 4500);
    return el;
  }

  /* ---------------------- confirmação ---------------------- */
  function confirmar(texto, opcoes = {}) {
    const { titulo = 'Tem certeza?', ok = 'Confirmar', perigo = true } = opcoes;
    return new Promise(resolve => {
      $('titulo-confirmar').textContent = titulo;
      $('texto-confirmar').textContent = texto;
      const btnSim = $('btn-sim');
      btnSim.textContent = ok;
      btnSim.className = 'btn ' + (perigo ? 'btn-perigo' : 'btn-primario');
      $('modal-confirmar').hidden = false;
      const encerrar = resposta => {
        $('modal-confirmar').hidden = true;
        btnSim.onclick = null;
        $('btn-nao').onclick = null;
        resolve(resposta);
      };
      btnSim.onclick = () => encerrar(true);
      $('btn-nao').onclick = () => encerrar(false);
    });
  }

  /* ---------------------- modal genérico ---------------------- */
  // abrirModal({ titulo, corpo (html), rodape (html), largura }) -> { el, corpo, rodape, fechar }
  function abrirModal({ titulo = '', corpo = '', rodape = '', largura = '560px' } = {}) {
    const m = $('modal-generico');
    $('modal-titulo').textContent = titulo;
    $('modal-corpo').innerHTML = corpo;
    $('modal-rodape').innerHTML = rodape;
    $('modal-rodape').hidden = !rodape;
    m.querySelector('.modal').style.maxWidth = largura;
    m.hidden = false;
    const fechar = () => { m.hidden = true; $('modal-corpo').innerHTML = ''; $('modal-rodape').innerHTML = ''; };
    $('modal-fechar').onclick = fechar;
    return { el: m, corpo: $('modal-corpo'), rodape: $('modal-rodape'), fechar };
  }
  function fecharModal() { const m = $('modal-generico'); if (m) m.hidden = true; }

  /* ---------------------- helpers de DOM ---------------------- */
  function el(html) {
    const t = document.createElement('template');
    t.innerHTML = html.trim();
    return t.content.firstElementChild;
  }
  const vazio = texto => `<div class="vazio">${esc(texto)}</div>`;
  const carregando = (texto = 'Carregando...') => `<div class="vazio carregando">${esc(texto)}</div>`;

  // Campo de formulário padrão (label + input/select + erro).
  function campo({ id, rotulo, tipo = 'text', valor = '', opcoes = null, attrs = '', dica = '', largo = false }) {
    let controle;
    if (opcoes) {
      controle = `<select id="${id}" ${attrs}>${opcoes.map(o =>
        `<option value="${esc(o.valor)}" ${String(o.valor) === String(valor) ? 'selected' : ''}>${esc(o.rotulo)}</option>`).join('')}</select>`;
    } else if (tipo === 'textarea') {
      controle = `<textarea id="${id}" rows="3" ${attrs}>${esc(valor)}</textarea>`;
    } else if (tipo === 'checkbox') {
      return `<div class="campo ${largo ? 'largo' : ''}" style="justify-content:flex-end">
        <label class="marcador"><input type="checkbox" id="${id}" ${valor ? 'checked' : ''} ${attrs}>
        <span class="rotulo" style="color:var(--primary)">${esc(rotulo)}</span></label>
        <span class="erro-campo" id="e-${id}"></span></div>`;
    } else {
      controle = `<input type="${tipo}" id="${id}" value="${esc(valor)}" ${attrs}>`;
    }
    return `<div class="campo ${largo ? 'largo' : ''}">
      <label class="rotulo" for="${id}">${esc(rotulo)}</label>
      ${controle}
      ${dica ? `<span class="dica">${dica}</span>` : ''}
      <span class="erro-campo" id="e-${id}"></span>
    </div>`;
  }

  // Marca erro num campo; retorna false quando há mensagem (para encadear validações).
  function erroCampo(id, msg) {
    const e = $('e-' + id);
    if (e) e.textContent = msg || '';
    return !msg;
  }

  function limparErros(ids) { ids.forEach(id => erroCampo(id, '')); }

  const badge = (texto, tipo = '') => `<span class="badge ${tipo}">${esc(texto)}</span>`;
  const badgeStatus = s => badge(s === 'ativo' ? 'Ativo' : s === 'suspenso' ? 'Suspenso' : 'Inativo',
    s === 'ativo' ? 'ok' : 'off');

  return {
    $, esc, el, vazio, carregando, campo, erroCampo, limparErros, badge, badgeStatus,
    CATEGORIAS, ORDEM_CATEGORIAS, rotuloCategoria, PLANOS, creditosPlano, rotuloPlano,
    emReais, numero, dataBr, erroDe, aviso, confirmar, abrirModal, fecharModal,
  };
})();
