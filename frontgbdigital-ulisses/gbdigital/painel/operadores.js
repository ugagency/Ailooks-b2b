// painel/operadores.js — CRUD de operadores (só plataforma) com a frota e o desconto de cada um.
window.Operadores = (() => {
  const { $, esc, campo, erroCampo, limparErros } = UI;
  const STATUS = [{ valor: 'ativo', rotulo: 'Ativo' }, { valor: 'suspenso', rotulo: 'Suspenso' }];

  function formulario(operador) {
    return new Promise(resolve => {
      const o = operador || { nome: '', documento: '', status: 'ativo' };
      const m = UI.abrirModal({
        titulo: operador ? 'Editar operador' : 'Novo operador',
        corpo: `<form id="form-operador" novalidate>
          <div id="op-erro" class="aviso-erro" hidden style="margin-bottom:14px"></div>
          <div class="grade">
            ${campo({ id: 'op-nome', rotulo: 'Nome', valor: o.nome, attrs: 'maxlength="120" placeholder="Empresa de painéis LED"', largo: true })}
            ${campo({ id: 'op-documento', rotulo: 'Documento (CNPJ, opcional)', valor: o.documento || '', attrs: 'maxlength="30"' })}
            ${campo({ id: 'op-status', rotulo: 'Status', valor: o.status, opcoes: STATUS })}
          </div>
        </form>`,
        rodape: `<button type="button" class="btn btn-neutro" id="op-cancelar">Cancelar</button>
                 <button type="submit" form="form-operador" class="btn btn-primario" id="op-salvar">Salvar</button>`,
      });
      $('op-cancelar').onclick = () => { m.fechar(); resolve(null); };
      $('modal-fechar').onclick = () => { m.fechar(); resolve(null); };
      $('op-nome').focus();
      $('form-operador').onsubmit = async ev => {
        ev.preventDefault();
        limparErros(['op-nome']);
        if (!$('op-nome').value.trim()) { erroCampo('op-nome', 'Informe o nome.'); return; }
        $('op-salvar').disabled = true;
        try {
          const campos = { nome: $('op-nome').value.trim(), documento: $('op-documento').value.trim() || null, status: $('op-status').value };
          const salvo = await API.salvarOperador(campos, operador ? operador.id : null);
          UI.aviso(`Operador "${campos.nome}" ${operador ? 'atualizado' : 'criado'}.`, 'ok');
          m.fechar(); resolve(salvo);
        } catch (e) {
          $('op-erro').textContent = 'Não foi possível salvar: ' + UI.erroDe(e); $('op-erro').hidden = false; $('op-salvar').disabled = false;
        }
      };
    });
  }

  async function tela({ container }) {
    const [operadores, frota, lojas] = await Promise.all([API.listarOperadores(), API.frotaOperadores().catch(() => []), API.listarLojas()]);
    const frotaPor = Object.fromEntries(frota.map(f => [f.operador_id, f]));
    const lojasPor = {};
    lojas.forEach(l => { lojasPor[l.operador_id] = (lojasPor[l.operador_id] || 0) + 1; });

    container.innerHTML = `
      <div class="cabecalho">
        <div><h1>Operadores</h1><p class="dica sub">Empresas que operam os painéis. O desconto de frota soma os totens de todas as unidades ativas do operador.</p></div>
        <button type="button" class="btn btn-primario" id="op-novo">+ Novo operador</button>
      </div>
      <div class="quadro"><div class="rolagem"><table>
        <thead><tr><th>Operador</th><th>Documento</th><th>Lojas</th><th>Totens ativos</th><th>Desconto de frota</th><th>Status</th><th></th></tr></thead>
        <tbody id="op-corpo"></tbody>
      </table></div>${operadores.length ? '' : UI.vazio('Nenhum operador cadastrado.')}</div>
      <p class="dica">Faixas: 1–2 totens 0% · 3–4 5% · 5–9 10% · 10+ 15%.</p>`;

    const corpo = $('op-corpo');
    operadores.forEach(o => {
      const f = frotaPor[o.id] || { totens: 0, desconto_pct: 0 };
      const tr = document.createElement('tr');
      if (o.status !== 'ativo') tr.classList.add('inativa');
      tr.innerHTML = `
        <td class="nome">${esc(o.nome)}</td>
        <td>${esc(o.documento || '—')}</td>
        <td>${lojasPor[o.id] || 0}</td>
        <td>${f.totens}</td>
        <td>${f.desconto_pct > 0 ? UI.badge(`${f.desconto_pct}%`, 'ok') : '<span class="dica">0%</span>'}</td>
        <td>${UI.badgeStatus(o.status)}</td>
        <td><div class="acoes"><button type="button" class="btn-mini op-editar">Editar</button><button type="button" class="btn-mini perigo op-excluir">Excluir</button></div></td>`;
      tr.querySelector('.op-editar').onclick = async () => { if (await formulario(o)) Rotas.render(); };
      tr.querySelector('.op-excluir').onclick = async () => {
        if (!await UI.confirmar(`Excluir o operador "${o.nome}"? Só é possível se não tiver lojas.`, { titulo: 'Excluir operador', ok: 'Excluir' })) return;
        try { await API.excluirOperador(o.id); UI.aviso('Operador excluído.', 'ok'); Rotas.render(); }
        catch (e) { UI.aviso(UI.erroDe(e), 'erro'); }
      };
      corpo.appendChild(tr);
    });
    $('op-novo').onclick = async () => { if (await formulario(null)) Rotas.render(); };
  }

  Rotas.registrar('/operadores', tela, { papeis: ['plataforma'], titulo: 'Operadores' });
  return { formulario };
})();
