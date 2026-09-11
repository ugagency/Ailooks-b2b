// painel/usuarios.js — vínculo de usuários do Supabase Auth a papéis do painel (só plataforma).
// O usuário é criado no dashboard do Supabase (Authentication > Users); aqui só se define o papel.
window.Usuarios = (() => {
  const { $, esc, campo, erroCampo, limparErros } = UI;
  const PAPEIS = [{ valor: 'plataforma', rotulo: 'Plataforma (vê tudo)' }, { valor: 'operador', rotulo: 'Operador (só as próprias lojas)' }];
  const ROTULO = { plataforma: 'Plataforma', operador: 'Operador', loja: 'Loja' };

  async function formulario() {
    const operadores = (await API.listarOperadores()).map(o => ({ valor: o.id, rotulo: o.nome }));
    return new Promise(resolve => {
      const m = UI.abrirModal({
        titulo: 'Vincular usuário',
        corpo: `<form id="form-usuario" novalidate>
          <div id="us-erro" class="aviso-erro" hidden style="margin-bottom:14px"></div>
          <p class="dica" style="margin:0 0 12px">O e-mail precisa existir em Authentication › Users no Supabase (crie lá com "Auto Confirm User").</p>
          <div class="grade">
            ${campo({ id: 'us-email', rotulo: 'E-mail do usuário', tipo: 'email', valor: '', attrs: 'autocomplete="off"', largo: true })}
            ${campo({ id: 'us-papel', rotulo: 'Papel', valor: 'operador', opcoes: PAPEIS })}
            ${campo({ id: 'us-operador', rotulo: 'Operador', valor: operadores[0] ? operadores[0].valor : '', opcoes: operadores })}
          </div>
        </form>`,
        rodape: `<button type="button" class="btn btn-neutro" id="us-cancelar">Cancelar</button>
                 <button type="submit" form="form-usuario" class="btn btn-primario" id="us-salvar">Vincular</button>`,
      });
      const sync = () => { $('us-operador').disabled = $('us-papel').value !== 'operador'; };
      $('us-papel').onchange = sync; sync();
      $('us-cancelar').onclick = () => { m.fechar(); resolve(false); };
      $('modal-fechar').onclick = () => { m.fechar(); resolve(false); };
      $('us-email').focus();
      $('form-usuario').onsubmit = async ev => {
        ev.preventDefault();
        limparErros(['us-email', 'us-operador']);
        const email = $('us-email').value.trim(), papel = $('us-papel').value;
        let ok = true;
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { erroCampo('us-email', 'Informe um e-mail válido.'); ok = false; }
        if (papel === 'operador' && !$('us-operador').value) { erroCampo('us-operador', 'Escolha o operador.'); ok = false; }
        if (!ok) return;
        $('us-salvar').disabled = true;
        try {
          await API.vincularUsuario(email, papel, papel === 'operador' ? $('us-operador').value : null, null);
          UI.aviso(`${email} vinculado como ${ROTULO[papel]}.`, 'ok');
          m.fechar(); resolve(true);
        } catch (e) {
          $('us-erro').textContent = UI.erroDe(e); $('us-erro').hidden = false; $('us-salvar').disabled = false;
        }
      };
    });
  }

  async function tela({ container }) {
    const usuarios = await API.listarUsuarios();
    container.innerHTML = `
      <div class="cabecalho">
        <div><h1>Usuários do painel</h1><p class="dica sub">Quem entra aqui e com qual papel. Vendedores do tablet são cadastrados na unidade, não aqui.</p></div>
        <button type="button" class="btn btn-primario" id="us-novo">+ Vincular usuário</button>
      </div>
      <div class="quadro"><div class="rolagem"><table>
        <thead><tr><th>E-mail</th><th>Papel</th><th>Operador</th><th>Desde</th><th></th></tr></thead>
        <tbody id="us-corpo"></tbody>
      </table></div>${usuarios.length ? '' : UI.vazio('Nenhum usuário vinculado.')}</div>`;

    const corpo = $('us-corpo');
    const meuId = API.sessao?.user?.id;
    usuarios.forEach(u => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="nome">${esc(u.email)}${u.user_id === meuId ? ' ' + UI.badge('você') : ''}</td>
        <td>${UI.badge(ROTULO[u.papel] || u.papel, u.papel === 'plataforma' ? 'ok' : '')}</td>
        <td>${esc(u.operador_nome || '—')}</td>
        <td>${UI.dataBr(u.created_at)}</td>
        <td><div class="acoes">${u.user_id === meuId ? '' : '<button type="button" class="btn-mini perigo us-remover">Remover acesso</button>'}</div></td>`;
      const rm = tr.querySelector('.us-remover');
      if (rm) rm.onclick = async () => {
        if (!await UI.confirmar(`Remover o acesso de ${u.email} ao painel? O usuário continua existindo no Supabase Auth.`, { titulo: 'Remover acesso', ok: 'Remover' })) return;
        try { await API.removerUsuario(u.user_id); UI.aviso('Acesso removido.', 'ok'); Rotas.render(); }
        catch (e) { UI.aviso(UI.erroDe(e), 'erro'); }
      };
      corpo.appendChild(tr);
    });
    $('us-novo').onclick = async () => { if (await formulario()) Rotas.render(); };
  }

  Rotas.registrar('/usuarios', tela, { papeis: ['plataforma'], titulo: 'Usuários' });
  return { formulario };
})();
