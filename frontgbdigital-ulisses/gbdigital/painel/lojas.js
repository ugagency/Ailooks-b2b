// painel/lojas.js — lista de lojas (#/lojas) e detalhe com abas (#/lojas/:id?aba=dados|branding|catalogo|unidades).
window.Lojas = (() => {
  const { $, esc, campo, erroCampo, limparErros } = UI;
  const STATUS = [{ valor: 'ativo', rotulo: 'Ativa' }, { valor: 'inativo', rotulo: 'Inativa' }];

  async function operadoresDisponiveis() {
    const lista = await API.listarOperadores();
    return lista.map(o => ({ valor: o.id, rotulo: o.nome }));
  }

  /* ---------------------- formulário rápido (modal) ---------------------- */
  // Resolve com a loja salva ou null.
  async function formulario(loja) {
    const operadores = await operadoresDisponiveis();
    return new Promise(resolve => {
      const l = loja || { nome: '', observacao: '', operador_id: API.perfil?.operador_id || (operadores[0] && operadores[0].valor) || '', status: 'ativo' };
      const m = UI.abrirModal({
        titulo: loja ? 'Editar loja' : 'Nova loja',
        corpo: `<form id="form-loja" novalidate>
          <div id="lj-erro" class="aviso-erro" hidden style="margin-bottom:14px"></div>
          <div class="grade">
            ${campo({ id: 'lj-nome', rotulo: 'Nome da loja (marca)', valor: l.nome, attrs: 'maxlength="80" placeholder="MA Ville"', largo: true })}
            ${API.ehPlataforma()
              ? campo({ id: 'lj-operador', rotulo: 'Operador', valor: l.operador_id, opcoes: operadores })
              : `<input type="hidden" id="lj-operador" value="${l.operador_id}"><div style="padding:6px 0"><span class="rotulo">Operador</span><div style="margin-top:4px">${operadores.find(o => o.valor === l.operador_id)?.rotulo || '—'}</div></div>`}
            ${loja ? campo({ id: 'lj-status', rotulo: 'Status', valor: l.status, opcoes: STATUS }) : '<div></div>'}
            ${campo({ id: 'lj-observacao', rotulo: 'Segmento / observação (livre)', tipo: 'textarea', valor: l.observacao || '', attrs: 'maxlength="500" placeholder="Contexto para quem for montar o catálogo"', largo: true })}
          </div>
        </form>`,
        rodape: `<button type="button" class="btn btn-neutro" id="lj-cancelar">Cancelar</button>
                 <button type="submit" form="form-loja" class="btn btn-primario" id="lj-salvar">Salvar loja</button>`,
      });
      $('lj-cancelar').onclick = () => { m.fechar(); resolve(null); };
      $('modal-fechar').onclick = () => { m.fechar(); resolve(null); };
      $('lj-nome').focus();
      $('form-loja').onsubmit = async ev => {
        ev.preventDefault();
        limparErros(['lj-nome', 'lj-operador']);
        let ok = true;
        if (!$('lj-nome').value.trim()) { erroCampo('lj-nome', 'Informe o nome.'); ok = false; }
        if (!$('lj-operador').value) { erroCampo('lj-operador', 'Escolha o operador.'); ok = false; }
        if (!ok) return;
        $('lj-salvar').disabled = true;
        try {
          const campos = { nome: $('lj-nome').value.trim(), operador_id: $('lj-operador').value, observacao: $('lj-observacao').value.trim() || null };
          if (loja) campos.status = $('lj-status').value;
          const salva = await API.salvarLoja(campos, loja ? loja.id : null);
          UI.aviso(`Loja "${campos.nome}" ${loja ? 'atualizada' : 'criada'}.`, 'ok');
          m.fechar(); resolve(salva);
        } catch (e) {
          $('lj-erro').textContent = 'Não foi possível salvar: ' + UI.erroDe(e); $('lj-erro').hidden = false; $('lj-salvar').disabled = false;
        }
      };
    });
  }

  /* ---------------------- lista ---------------------- */
  async function telaLista({ container }) {
    const [lojas, operadores, unidades] = await Promise.all([API.listarLojas(), API.listarOperadores(), API.listarUnidades()]);
    const nomeOp = Object.fromEntries(operadores.map(o => [o.id, o.nome]));
    const unPorLoja = {};
    unidades.forEach(u => { (unPorLoja[u.loja_id] ||= []).push(u); });

    container.innerHTML = `
      <div class="cabecalho">
        <div><h1>Lojas</h1><p class="dica sub">Marca ou rede: catálogo e branding são da loja; totens e vendedores são das unidades.</p></div>
        <a class="btn btn-primario" href="#/nova-loja">+ Nova loja</a>
      </div>
      <div class="quadro">
        <div class="rolagem"><table>
          <thead><tr><th>Loja</th><th>Operador</th><th>Unidades</th><th>Totens</th><th>Status</th><th></th></tr></thead>
          <tbody id="lj-corpo"></tbody>
        </table></div>
        ${lojas.length ? '' : UI.vazio('Nenhuma loja ainda. Use o cadastro guiado para criar a primeira.')}
      </div>`;

    const corpo = $('lj-corpo');
    lojas.forEach(l => {
      const us = unPorLoja[l.id] || [];
      const totens = us.filter(u => u.status === 'ativo').reduce((s, u) => s + Number(u.totens_contratados || 0), 0);
      const tr = document.createElement('tr');
      tr.className = 'clicavel';
      if (l.status !== 'ativo') tr.classList.add('inativa');
      tr.dataset.id = l.id;
      tr.innerHTML = `
        <td class="nome">${esc(l.nome)} ${l.wizard_etapa ? UI.badge('cadastro incompleto', 'alerta') : ''}<div class="dica">${esc((l.branding && l.branding.nome_exibicao) || '')}</div></td>
        <td>${esc(nomeOp[l.operador_id] || '—')}</td>
        <td>${us.length}</td>
        <td>${totens}</td>
        <td>${UI.badgeStatus(l.status)}</td>
        <td><div class="acoes">${l.wizard_etapa ? `<a class="btn-mini" href="#/nova-loja?loja=${l.id}">Continuar cadastro</a>` : ''}<a class="btn-mini" href="#/lojas/${l.id}">Abrir</a></div></td>`;
      tr.onclick = ev => { if (!ev.target.closest('a,button')) Rotas.navegar(`#/lojas/${l.id}`); };
      corpo.appendChild(tr);
    });
  }

  /* ---------------------- detalhe com abas ---------------------- */
  const ABAS = [
    { id: 'dados', rotulo: 'Dados' },
    { id: 'branding', rotulo: 'Branding' },
    { id: 'catalogo', rotulo: 'Catálogo' },
    { id: 'unidades', rotulo: 'Unidades' },
    { id: 'gerentes', rotulo: 'Gerentes' },
  ];

  async function telaDetalhe({ params, query, container }) {
    const loja = await API.obterLoja(params.id);
    if (!loja) { container.innerHTML = UI.vazio('Loja não encontrada ou sem acesso.'); return; }
    const operador = await API.obterOperador(loja.operador_id).catch(() => null);
    const aba = ABAS.some(a => a.id === query.get('aba')) ? query.get('aba') : 'dados';

    container.innerHTML = `
      <div class="migalhas"><a href="#/lojas">Lojas</a> › ${esc(loja.nome)}</div>
      <div class="cabecalho">
        <div><h1>${esc(loja.nome)}</h1><p class="dica sub">Operador: ${esc(operador ? operador.nome : '—')} · ${UI.badgeStatus(loja.status)}${loja.wizard_etapa ? ' · ' + UI.badge('cadastro incompleto', 'alerta') : ''}</p></div>
        ${loja.wizard_etapa ? `<a class="btn btn-primario" href="#/nova-loja?loja=${loja.id}">Continuar cadastro guiado</a>` : ''}
      </div>
      <div class="abas" role="tablist">${ABAS.map(a => `<button type="button" class="aba" role="tab" data-aba="${a.id}" aria-selected="${a.id === aba}">${a.rotulo}</button>`).join('')}</div>
      <div id="aba-conteudo"></div>`;

    container.querySelectorAll('.aba').forEach(b => b.onclick = () => Rotas.navegar(`#/lojas/${loja.id}?aba=${b.dataset.aba}`));
    const alvo = $('aba-conteudo');

    if (aba === 'dados') abaDados(alvo, loja, operador);
    else if (aba === 'branding') Branding.render(alvo, loja);
    else if (aba === 'catalogo') await Catalogo.render(alvo, loja.id);
    else if (aba === 'unidades') await Unidades.render(alvo, loja);
    else if (aba === 'gerentes') abaGerentes(alvo, loja);
  }

  function abaGerentes(alvo, loja) {
    alvo.innerHTML = `
      <div class="quadro">
        <div class="topo-quadro"><h2>Gerentes da loja</h2><button type="button" class="btn btn-primario" id="gr-novo">+ Novo gerente</button></div>
        <div class="rolagem"><table><thead><tr><th>E-mail</th><th>Status</th><th></th></tr></thead><tbody id="gr-corpo"></tbody></table></div>
        <div class="vazio" id="gr-vazio" hidden></div>
      </div>`;

    async function carregarGerentes() {
      const lista = await API.listarGerentes(loja.id);
      const corpo = $('gr-corpo');
      corpo.innerHTML = '';
      $('gr-vazio').hidden = lista.length > 0;
      $('gr-vazio').textContent = 'Nenhum gerente. Gerentes podem acessar o painel desta loja.';
      lista.forEach(g => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${esc(g.user_email)}</td>
          <td>${UI.badgeStatus(g.status || 'ativo')}</td>
          <td><div class="acoes"><button type="button" class="btn-mini gr-deletar" style="color:var(--erro)">Deletar</button></div></td>`;
        tr.querySelector('.gr-deletar').onclick = async () => {
          if (!await UI.confirmar(`Remover acesso de "${g.user_email}" da loja?`, { titulo: 'Remover gerente', ok: 'Remover' })) return;
          try { await API.removerGerente(loja.id, g.user_id); UI.aviso('Gerente removido.', 'ok'); await carregarGerentes(); }
          catch (e) { UI.aviso(UI.erroDe(e), 'erro'); }
        };
        corpo.appendChild(tr);
      });
    }

    $('gr-novo').onclick = async () => {
      const email = prompt('E-mail do novo gerente (o login é criado automaticamente):');
      if (!email) return;
      try {
        const res = await API.adicionarGerente(loja.id, email.trim().toLowerCase());
        await carregarGerentes();
        if (res.senha_temporaria) mostrarSenhaGerente(res.email, res.senha_temporaria);
        else UI.aviso(`Gerente "${res.email}" vinculado (já tinha login no Auth).`, 'ok');
      } catch (e) {
        UI.aviso(UI.erroDe(e), 'erro');
      }
    };

    carregarGerentes();
  }

  // Mostra a senha temporária gerada pra copiar/repassar ao gerente.
  function mostrarSenhaGerente(email, senha) {
    const m = UI.abrirModal({
      titulo: 'Gerente criado',
      corpo: `
        <div style="padding:4px 0">
          <p class="dica">Repasse estas credenciais ao gerente. A senha não será exibida novamente.</p>
          <div class="grade" style="margin-top:12px">
            <div><span class="rotulo">E-mail</span><div class="nome" style="margin-top:4px">${esc(email)}</div></div>
            <div><span class="rotulo">Senha temporária</span><div class="nome" style="margin-top:4px;font-family:monospace;font-size:16px">${esc(senha)}</div></div>
          </div>
        </div>`,
      rodape: `<button type="button" class="btn btn-neutro" id="gr-copiar">Copiar senha</button>
               <button type="button" class="btn btn-primario" id="gr-ok">Entendi</button>`,
      largura: '420px',
    });
    $('gr-copiar').onclick = async () => {
      try { await navigator.clipboard.writeText(senha); UI.aviso('Senha copiada.', 'ok'); }
      catch (e) { UI.aviso('Não foi possível copiar automaticamente.', 'erro'); }
    };
    $('gr-ok').onclick = () => m.fechar();
    $('modal-fechar').onclick = () => m.fechar();
  }

  function abaDados(alvo, loja, operador) {
    alvo.innerHTML = `
      <div class="quadro"><div class="corpo-quadro">
        <div class="grade">
          <div><span class="rotulo">Nome</span><div class="nome" style="margin-top:4px">${esc(loja.nome)}</div></div>
          <div><span class="rotulo">Operador</span><div style="margin-top:4px">${esc(operador ? operador.nome : '—')}</div></div>
          <div class="largo"><span class="rotulo">Segmento / observação</span><div style="margin-top:4px;white-space:pre-wrap">${esc(loja.observacao || '—')}</div></div>
          <div><span class="rotulo">Criada em</span><div style="margin-top:4px">${UI.dataBr(loja.created_at)}</div></div>
          <div><span class="rotulo">Status</span><div style="margin-top:4px">${UI.badgeStatus(loja.status)}</div></div>
        </div>
        <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px;flex-wrap:wrap">
          ${API.ehPlataforma() ? '<button type="button" class="btn btn-neutro" id="lj-excluir" style="color:var(--erro)">Excluir loja</button>' : ''}
          <button type="button" class="btn btn-primario" id="lj-editar">Editar dados</button>
        </div>
      </div></div>`;
    $('lj-editar').onclick = async () => { if (await formulario(loja)) Rotas.render(); };
    const ex = $('lj-excluir');
    if (ex) ex.onclick = async () => {
      if (!await UI.confirmar(`Excluir a loja "${loja.nome}"? Só é possível sem unidades, vendedores, gerações ou peças vinculadas.`, { titulo: 'Excluir loja', ok: 'Excluir' })) return;
      try { await API.excluirLoja(loja.id); UI.aviso('Loja excluída.', 'ok'); Rotas.navegar('#/lojas'); }
      catch (e) { UI.aviso(UI.erroDe(e), 'erro'); }
    };
  }

  // Lista é só de quem administra mais de uma loja; papel 'loja' vai direto pro detalhe (nav própria).
  Rotas.registrar('/lojas', telaLista, { papeis: ['plataforma', 'operador'], titulo: 'Lojas' });
  Rotas.registrar('/lojas/:id', telaDetalhe, { titulo: 'Loja' });

  return { formulario, operadoresDisponiveis };
})();
