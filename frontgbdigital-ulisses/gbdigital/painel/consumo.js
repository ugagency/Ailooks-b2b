// painel/consumo.js — visão inicial (#/): consumo do mês por unidade e frota/desconto por operador.
// Plataforma vê tudo; operador vê só as próprias lojas (o RLS já filtra as views).
window.Consumo = (() => {
  const { $, esc } = UI;

  async function tela({ container }) {
    const [consumo, frota, lojas] = await Promise.all([
      API.consumoUnidades(), API.frotaOperadores().catch(() => []), API.listarLojas(),
    ]);
    const ativas = consumo.filter(c => c.status === 'ativo');
    const totalIncl = ativas.reduce((s, c) => s + Number(c.incluidas || 0), 0);
    const totalUsadas = consumo.reduce((s, c) => s + Number(c.usadas || 0), 0);
    const totalExc = consumo.reduce((s, c) => s + Number(c.excedente || 0), 0);
    const mes = consumo[0] ? new Date(consumo[0].mes_ref + 'T12:00:00').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }) : new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });

    container.innerHTML = `
      <div class="cabecalho">
        <div><h1>Consumo de ${esc(mes)}</h1><p class="dica sub">${API.ehPlataforma() ? 'Todas as unidades da plataforma.' : 'Unidades das suas lojas.'} O pool é por unidade e nunca bloqueia: acima dele conta excedente.</p></div>
      </div>
      <div class="cartoes" style="margin-bottom:18px">
        <div class="cartao-info"><span class="rotulo">Unidades ativas</span><div class="valor">${ativas.length}</div><span class="dica">de ${consumo.length} cadastrada(s)</span></div>
        <div class="cartao-info"><span class="rotulo">Pool do mês</span><div class="valor">${UI.numero(totalIncl)}</div><span class="dica">gerações incluídas (ativas)</span></div>
        <div class="cartao-info"><span class="rotulo">Gerações usadas</span><div class="valor">${UI.numero(totalUsadas)}</div><span class="dica">${totalIncl ? Math.round(totalUsadas * 100 / totalIncl) : 0}% do pool</span></div>
        <div class="cartao-info"><span class="rotulo">Excedente</span><div class="valor" style="color:${totalExc > 0 ? 'var(--erro)' : 'inherit'}">${UI.numero(totalExc)}</div><span class="dica">acima do pool das unidades</span></div>
      </div>

      ${frota.length ? `
      <div class="quadro">
        <div class="topo-quadro"><h2>Frota por operador</h2><span class="dica">1–2 totens 0% · 3–4 5% · 5–9 10% · 10+ 15%</span></div>
        <div class="rolagem"><table>
          <thead><tr><th>Operador</th><th>Totens ativos</th><th>Desconto de frota</th></tr></thead>
          <tbody>${frota.map(f => `<tr><td class="nome">${esc(f.operador_nome)}</td><td>${f.totens}</td><td>${f.desconto_pct > 0 ? UI.badge(`${f.desconto_pct}%`, 'ok') : '<span class="dica">0%</span>'}</td></tr>`).join('')}</tbody>
        </table></div>
      </div>` : ''}

      <div class="quadro">
        <div class="topo-quadro"><h2>Unidades</h2><a class="btn-mini" href="#/lojas">Ver lojas</a></div>
        <div class="rolagem"><table>
          <thead><tr><th>Loja</th><th>Unidade</th><th>Plano</th><th>Totens</th><th>Uso no mês</th><th>Status</th><th></th></tr></thead>
          <tbody id="cs-corpo"></tbody>
        </table></div>
        ${consumo.length ? '' : UI.vazio(lojas.length ? 'Nenhuma unidade cadastrada ainda.' : 'Nenhuma loja ainda. Comece pelo cadastro guiado em Lojas.')}
      </div>`;

    const corpo = $('cs-corpo');
    [...consumo].sort((a, b) => Number(b.percentual) - Number(a.percentual) || String(a.loja_nome).localeCompare(String(b.loja_nome), 'pt-BR')).forEach(c => {
      const tr = document.createElement('tr');
      tr.className = 'clicavel';
      if (c.status !== 'ativo') tr.classList.add('inativa');
      tr.innerHTML = `
        <td>${esc(c.loja_nome)}</td>
        <td class="nome">${esc(c.unidade_nome)}</td>
        <td>${esc(UI.rotuloPlano(c.plano))}</td>
        <td>${c.totens_contratados}</td>
        <td style="min-width:160px">${Unidades.barraConsumo(c)}</td>
        <td>${UI.badgeStatus(c.status)}</td>
        <td><div class="acoes"><a class="btn-mini" href="#/unidades/${c.unidade_id}">Abrir</a></div></td>`;
      tr.onclick = ev => { if (!ev.target.closest('a,button')) Rotas.navegar(`#/unidades/${c.unidade_id}`); };
      corpo.appendChild(tr);
    });
  }

  Rotas.registrar('/', tela, { titulo: 'Consumo' });
  return {};
})();
