// painel/unidades.js — unidades (ponto físico: totens, plano, pool de créditos) e seus vendedores.
// Lista por loja (aba "Unidades"), detalhe em #/unidades/:id, formulários reaproveitados pelo wizard.
window.Unidades = (() => {
  const { $, esc, campo, erroCampo, limparErros } = UI;
  const STATUS = [{ valor: 'ativo', rotulo: 'Ativa' }, { valor: 'inativo', rotulo: 'Inativa' }];
  const creditos = u => Number(u.totens_contratados || 0) * UI.creditosPlano(u.plano);

  /* ---------------------- formulário de unidade (modal) ---------------------- */
  // Resolve com a unidade salva, ou null se cancelou.
  function formulario(lojaId, unidade) {
    return new Promise(resolve => {
      const u = unidade || { nome: '', endereco: '', totens_contratados: 1, plano: 'base', status: 'ativo' };
      const m = UI.abrirModal({
        titulo: unidade ? 'Editar unidade' : 'Nova unidade',
        corpo: `<form id="form-unidade" novalidate>
          <div id="un-erro" class="aviso-erro" hidden style="margin-bottom:14px"></div>
          <div class="grade">
            ${campo({ id: 'un-nome', rotulo: 'Nome da unidade', valor: u.nome, attrs: 'maxlength="80" placeholder="Belvedere"', largo: true })}
            ${campo({ id: 'un-endereco', rotulo: 'Endereço (opcional)', valor: u.endereco || '', attrs: 'maxlength="200"', largo: true })}
            ${campo({ id: 'un-totens', rotulo: 'Totens contratados', tipo: 'number', valor: u.totens_contratados, attrs: 'min="1" step="1"' })}
            ${campo({ id: 'un-plano', rotulo: 'Plano', valor: u.plano, opcoes: UI.PLANOS.map(p => ({ valor: p.valor, rotulo: `${p.rotulo} · ${UI.numero(p.creditos)} gerações/totem` })) })}
            ${campo({ id: 'un-status', rotulo: 'Status', valor: u.status, opcoes: STATUS })}
            <div class="campo" style="justify-content:flex-end">
              <span class="rotulo">Pool de gerações / mês</span>
              <div class="valor" id="un-creditos" style="font-family:'Playfair Display',serif;font-size:22px">—</div>
            </div>
          </div>
        </form>`,
        rodape: `<button type="button" class="btn btn-neutro" id="un-cancelar">Cancelar</button>
                 <button type="submit" form="form-unidade" class="btn btn-primario" id="un-salvar">Salvar unidade</button>`,
      });
      const calc = () => {
        const t = Number($('un-totens').value || 0), c = UI.creditosPlano($('un-plano').value);
        $('un-creditos').textContent = t > 0 ? `${UI.numero(t * c)}` : '—';
      };
      $('un-totens').oninput = calc; $('un-plano').onchange = calc; calc();
      $('un-cancelar').onclick = () => { m.fechar(); resolve(null); };
      $('modal-fechar').onclick = () => { m.fechar(); resolve(null); };
      $('un-nome').focus();

      $('form-unidade').onsubmit = async ev => {
        ev.preventDefault();
        limparErros(['un-nome', 'un-totens']);
        let ok = true;
        if (!$('un-nome').value.trim()) { erroCampo('un-nome', 'Informe o nome.'); ok = false; }
        const t = Number($('un-totens').value);
        if (!Number.isInteger(t) || t < 1) { erroCampo('un-totens', 'Ao menos 1 totem.'); ok = false; }
        if (!ok) return;
        const btn = $('un-salvar'); btn.disabled = true;
        try {
          const campos = {
            nome: $('un-nome').value.trim(), endereco: $('un-endereco').value.trim() || null,
            totens_contratados: t, plano: $('un-plano').value, status: $('un-status').value,
          };
          const salva = await API.salvarUnidade(unidade ? campos : { ...campos, loja_id: lojaId }, unidade ? unidade.id : null);
          UI.aviso(`Unidade "${campos.nome}" ${unidade ? 'atualizada' : 'criada'}.`, 'ok');
          m.fechar();
          resolve(salva);
        } catch (e) {
          $('un-erro').textContent = 'Não foi possível salvar: ' + UI.erroDe(e);
          $('un-erro').hidden = false;
          btn.disabled = false;
        }
      };
    });
  }

  /* ---------------------- formulário de vendedor (modal) ---------------------- */
  // Novo vendedor ou edição (nome/e-mail). Senha é gerenciada via Supabase Auth.
  function formularioVendedor(unidadeId, vendedor) {
    return new Promise(resolve => {
      const v = vendedor || { nome: '', email: '' };
      const m = UI.abrirModal({
        titulo: vendedor ? 'Editar vendedor' : 'Novo vendedor',
        corpo: `<form id="form-vendedor" novalidate>
          <div id="vd-erro" class="aviso-erro" hidden style="margin-bottom:14px"></div>
          <div class="grade">
            ${campo({ id: 'vd-nome', rotulo: 'Nome', valor: v.nome, attrs: 'maxlength="80"', largo: true })}
            ${campo({ id: 'vd-email', rotulo: 'E-mail (login no tablet)', tipo: 'email', valor: v.email, attrs: 'maxlength="120" autocomplete="off"', largo: true })}
            ${vendedor ? '' : '<div id="vd-info" class="dica" style="margin:12px 0;padding:10px;background:#EFF6FF;border-radius:8px">Após criar, você precisará criar o login no <strong>Supabase Dashboard</strong> (Authentication › Users › Add user) com o mesmo e-mail.</div>'}
          </div>
        </form>`,
        rodape: `<button type="button" class="btn btn-neutro" id="vd-cancelar">Cancelar</button>
                 <button type="submit" form="form-vendedor" class="btn btn-primario" id="vd-salvar">${vendedor ? 'Salvar' : 'Criar vendedor'}</button>`,
      });
      $('vd-cancelar').onclick = () => { m.fechar(); resolve(false); };
      $('modal-fechar').onclick = () => { m.fechar(); resolve(false); };
      $('vd-nome').focus();

      $('form-vendedor').onsubmit = async ev => {
        ev.preventDefault();
        limparErros(['vd-nome', 'vd-email']);
        let ok = true;
        const nome = $('vd-nome').value.trim(), email = $('vd-email').value.trim().toLowerCase();
        if (!nome) { erroCampo('vd-nome', 'Informe o nome.'); ok = false; }
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { erroCampo('vd-email', 'Informe um e-mail válido.'); ok = false; }
        if (!ok) return;
        const btn = $('vd-salvar'); btn.disabled = true;
        try {
          if (vendedor) await API.atualizarVendedor(vendedor.id, { nome, email });
          else await API.criarVendedor(unidadeId, nome, email);
          UI.aviso(`Vendedor "${nome}" ${vendedor ? 'atualizado' : 'criado'}.`, 'ok');
          m.fechar();
          resolve(true);
        } catch (e) {
          $('vd-erro').textContent = (e.code === '23505' || /duplicate|unique/i.test(e.message || ''))
            ? 'Já existe um vendedor com este e-mail.' : 'Não foi possível salvar: ' + UI.erroDe(e);
          $('vd-erro').hidden = false;
          btn.disabled = false;
        }
      };
    });
  }

  /* ---------------------- lista de unidades de uma loja ---------------------- */
  async function render(container, loja) {
    const unidades = await API.listarUnidades(loja.id);
    const consumo = await API.consumoUnidades().catch(() => []);
    const porUnidade = Object.fromEntries(consumo.map(c => [c.unidade_id, c]));
    const total = unidades.filter(u => u.status === 'ativo').reduce((s, u) => s + creditos(u), 0);

    container.innerHTML = `
      <div class="barra">
        <div><span class="rotulo">Pool total da loja (unidades ativas)</span><div style="font-family:'Playfair Display',serif;font-size:22px">${UI.numero(total)} gerações/mês</div></div>
        <button type="button" class="btn btn-primario" id="un-nova">+ Nova unidade</button>
      </div>
      <div class="quadro">
        <div class="rolagem">
          <table>
            <thead><tr><th>Unidade</th><th>Plano</th><th>Totens</th><th>Pool / mês</th><th>Uso no mês</th><th>Status</th><th></th></tr></thead>
            <tbody id="un-corpo"></tbody>
          </table>
        </div>
        ${unidades.length ? '' : UI.vazio('Nenhuma unidade. Cada unidade tem seus totens, plano e vendedores.')}
      </div>`;

    const corpo = $('un-corpo');
    unidades.forEach(u => {
      const c = porUnidade[u.id];
      const tr = document.createElement('tr');
      tr.className = 'clicavel';
      if (u.status !== 'ativo') tr.classList.add('inativa');
      tr.innerHTML = `
        <td class="nome">${esc(u.nome)}<div class="dica">${esc(u.endereco || '')}</div></td>
        <td>${esc(UI.rotuloPlano(u.plano))}</td>
        <td>${u.totens_contratados}</td>
        <td>${UI.numero(u.geracoes_incluidas_mes ?? creditos(u))}</td>
        <td style="min-width:140px">${c ? barraConsumo(c) : '<span class="dica">—</span>'}</td>
        <td>${UI.badgeStatus(u.status)}</td>
        <td><div class="acoes"><a class="btn-mini" href="#/unidades/${u.id}">Abrir</a></div></td>`;
      tr.onclick = ev => { if (!ev.target.closest('a,button')) Rotas.navegar(`#/unidades/${u.id}`); };
      corpo.appendChild(tr);
    });

    $('un-nova').onclick = async () => { if (await formulario(loja.id, null)) await render(container, loja); };
  }

  function barraConsumo(c) {
    const pct = Math.min(100, Number(c.percentual || 0));
    const classe = c.usadas >= c.incluidas && c.incluidas > 0 ? 'erro' : pct >= 80 ? 'alerta' : '';
    return `<div class="dica" style="margin-bottom:4px">${UI.numero(c.usadas)} / ${UI.numero(c.incluidas)}${c.excedente > 0 ? ` · <b style="color:var(--erro)">+${UI.numero(c.excedente)} excedente</b>` : ''}</div>
            <div class="progresso ${classe}"><span style="width:${pct}%"></span></div>`;
  }

  /* ---------------------- detalhe da unidade (#/unidades/:id) ---------------------- */
  async function telaDetalhe({ params, container }) {
    const unidade = await API.obterUnidade(params.id);
    if (!unidade) { container.innerHTML = UI.vazio('Unidade não encontrada ou sem acesso.'); return; }
    const loja = await API.obterLoja(unidade.loja_id);
    const consumo = (await API.consumoUnidades().catch(() => [])).find(c => c.unidade_id === unidade.id);

    container.innerHTML = `
      <div class="migalhas"><a href="#/lojas">Lojas</a> › <a href="#/lojas/${unidade.loja_id}?aba=unidades">${esc(loja ? loja.nome : 'Loja')}</a> › ${esc(unidade.nome)}</div>
      <div class="cabecalho">
        <div><h1>${esc(unidade.nome)}</h1><p class="dica sub">${esc(unidade.endereco || 'Sem endereço')} · ${UI.badgeStatus(unidade.status)}</p></div>
        <div style="display:flex;gap:8px"><button type="button" class="btn btn-neutro" id="und-editar">Editar unidade</button></div>
      </div>
      <div class="cartoes" style="margin-bottom:16px">
        <div class="cartao-info"><span class="rotulo">Plano</span><div class="valor">${esc(UI.rotuloPlano(unidade.plano))}</div><span class="dica">${unidade.totens_contratados} totem(ns) contratado(s)</span></div>
        <div class="cartao-info"><span class="rotulo">Pool do mês</span><div class="valor">${UI.numero(unidade.geracoes_incluidas_mes ?? creditos(unidade))}</div><span class="dica">gerações incluídas</span></div>
        <div class="cartao-info"><span class="rotulo">Usadas no mês</span><div class="valor">${consumo ? UI.numero(consumo.usadas) : '0'}</div>${consumo ? barraConsumo(consumo) : ''}</div>
        <div class="cartao-info"><span class="rotulo">Excedente</span><div class="valor" style="color:${consumo && consumo.excedente > 0 ? 'var(--erro)' : 'inherit'}">${consumo ? UI.numero(consumo.excedente) : '0'}</div><span class="dica">acima do pool (não bloqueia)</span></div>
      </div>
      <div class="quadro">
        <div class="topo-quadro"><h2>Vendedores</h2><button type="button" class="btn btn-primario" id="vd-novo">+ Novo vendedor</button></div>
        <div class="rolagem"><table><thead><tr><th>Nome</th><th>E-mail</th><th>Status</th><th></th></tr></thead><tbody id="vd-corpo"></tbody></table></div>
        <div class="vazio" id="vd-vazio" hidden></div>
      </div>`;

    async function carregarVendedores() {
      const lista = await API.listarVendedores(unidade.id);
      const corpo = $('vd-corpo');
      corpo.innerHTML = '';
      $('vd-vazio').hidden = lista.length > 0;
      $('vd-vazio').textContent = 'Nenhum vendedor. Sem vendedor, ninguém consegue entrar no tablet desta unidade.';
      lista.forEach(v => {
        const tr = document.createElement('tr');
        if (v.status !== 'ativo') tr.classList.add('inativa');
        tr.innerHTML = `
          <td class="nome">${esc(v.nome)}</td>
          <td>${esc(v.email)}</td>
          <td><label class="chave"><input type="checkbox" class="vd-ativo" ${v.status === 'ativo' ? 'checked' : ''} aria-label="Ativar ou desativar ${esc(v.nome)}"><span class="trilho"></span><span class="texto">${v.status === 'ativo' ? 'Ativo' : 'Inativo'}</span></label></td>
          <td><div class="acoes"><button type="button" class="btn-mini vd-editar">Editar</button><button type="button" class="btn-mini vd-deletar" style="color:var(--erro)">Deletar</button></div></td>`;
        tr.querySelector('.vd-ativo').onchange = async ev => {
          const novo = ev.target.checked ? 'ativo' : 'inativo';
          try { await API.atualizarVendedor(v.id, { status: novo }); UI.aviso(`"${v.nome}" ${novo === 'ativo' ? 'ativado' : 'desativado'}.`, 'ok'); await carregarVendedores(); }
          catch (e) { ev.target.checked = !ev.target.checked; UI.aviso(UI.erroDe(e), 'erro'); }
        };
        tr.querySelector('.vd-editar').onclick = async () => { if (await formularioVendedor(unidade.id, v)) await carregarVendedores(); };
        tr.querySelector('.vd-deletar').onclick = async () => {
          if (!await UI.confirmar(`Deletar o vendedor "${v.nome}"? Esta ação não pode ser desfeita.`, { titulo: 'Deletar vendedor', ok: 'Deletar' })) return;
          try { await API.excluirVendedor(v.id); UI.aviso(`Vendedor "${v.nome}" deletado.`, 'ok'); await carregarVendedores(); }
          catch (e) { UI.aviso(UI.erroDe(e), 'erro'); }
        };
        corpo.appendChild(tr);
      });
    }

    $('vd-novo').onclick = async () => { if (await formularioVendedor(unidade.id, null)) await carregarVendedores(); };
    $('und-editar').onclick = async () => { if (await formulario(unidade.loja_id, unidade)) Rotas.render(); };
    await carregarVendedores();
  }

  Rotas.registrar('/unidades/:id', telaDetalhe, { titulo: 'Unidade' });

  return { render, formulario, formularioVendedor, creditos, barraConsumo };
})();
