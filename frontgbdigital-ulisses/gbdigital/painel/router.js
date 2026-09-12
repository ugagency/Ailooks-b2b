// painel/router.js — rotas por hash (#/lojas, #/lojas/:id, #/nova-loja?loja=ID ...).
// O gating por papel aqui é só experiência de uso; a regra de verdade é o RLS no banco.
window.Rotas = (() => {
  const rotas = [];
  let container = null;
  let semAcesso = null;

  function registrar(padrao, handler, opcoes = {}) {
    const chaves = [];
    const regex = new RegExp('^' + padrao.replace(/:([a-zA-Z]+)/g, (_, k) => { chaves.push(k); return '([^/]+)'; }) + '$');
    rotas.push({ padrao, regex, chaves, handler, papeis: opcoes.papeis || null, titulo: opcoes.titulo || '' });
  }

  function analisar(hash) {
    const bruto = (hash || '').replace(/^#/, '');
    const [caminho, query] = bruto.split('?');
    return { caminho: caminho || '/', query: new URLSearchParams(query || '') };
  }

  function encontrar(caminho) {
    for (const r of rotas) {
      const m = r.regex.exec(caminho);
      if (m) {
        const params = {};
        r.chaves.forEach((k, i) => params[k] = decodeURIComponent(m[i + 1]));
        return { rota: r, params };
      }
    }
    return null;
  }

  async function render() {
    if (!container) container = document.getElementById('rota');
    const perfil = API.perfil;
    const { caminho, query } = analisar(location.hash);
    const achado = encontrar(caminho);
    marcarAtivo(caminho);

    if (!achado) { location.hash = '#/'; return; }
    const { rota, params } = achado;
    if (rota.papeis && (!perfil || !rota.papeis.includes(perfil.papel))) {
      container.innerHTML = UI.vazio('Você não tem acesso a esta tela.');
      return;
    }
    container.innerHTML = UI.carregando();
    try {
      await rota.handler({ params, query, container });
    } catch (e) {
      console.error(e);
      container.innerHTML = `<div class="aviso-erro">Não foi possível carregar: ${UI.esc(UI.erroDe(e))}</div>`;
    }
    window.scrollTo({ top: 0 });
  }

  function navegar(hash) {
    if (location.hash === hash) render(); else location.hash = hash;
  }

  // Links de navegação por papel. Papel 'loja' vai direto para a própria loja
  // (só tem uma; a lista de lojas nem existe pra ela — ver /lojas com papeis restritos).
  function montarNav(perfil) {
    const nav = document.getElementById('nav-links');
    if (!nav) return;
    const links = [{ hash: '#/', rotulo: 'Consumo' }];
    if (perfil.papel === 'plataforma') links.push({ hash: '#/operadores', rotulo: 'Operadores' });
    if (perfil.papel === 'loja') links.push({ hash: `#/lojas/${perfil.loja_id}`, rotulo: 'Minha loja' });
    else links.push({ hash: '#/lojas', rotulo: 'Lojas' });
    if (perfil.papel === 'plataforma') links.push({ hash: '#/usuarios', rotulo: 'Usuários' });
    nav.innerHTML = links.map(l => `<a href="${l.hash}" data-hash="${l.hash}">${UI.esc(l.rotulo)}</a>`).join('');
    marcarAtivo(analisar(location.hash).caminho);
  }

  function marcarAtivo(caminho) {
    document.querySelectorAll('#nav-links a').forEach(a => {
      const base = a.dataset.hash.replace(/^#/, '');
      const ativo = base === '/' ? caminho === '/' : caminho.startsWith(base);
      a.classList.toggle('ativo', ativo);
    });
  }

  function ligar() {
    window.addEventListener('hashchange', render);
  }

  return { registrar, analisar, render, navegar, montarNav, ligar, atual: () => analisar(location.hash) };
})();
