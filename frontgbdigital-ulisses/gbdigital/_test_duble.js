// _test_duble.js — dublê em memória do cliente Supabase para os harnesses (_test_painel.html, _test_tablet.html).
// Emula: query builder (select/insert/upsert/update/delete/eq/in/order/single/maybeSingle, thenable),
// auth do painel, storage, os RPCs de 04_funcoes_provva.sql e o RLS por papel de 03_estrutura_provva.sql.
window.criarDuble = function criarDuble(seed = {}) {
  const clone = x => JSON.parse(JSON.stringify(x));
  const db = {
    operadores: [], lojas: [], unidades: [], vendedores: [], usuarios_painel: [],
    catalogo_loja: [], geracoes: [], sessoes: [],
    ...clone({ ...seed, usuarios_auth: undefined }),
  };
  delete db.usuarios_auth;
  const usuariosAuth = clone(seed.usuarios_auth || []);
  const arquivos = {};
  const chamadas = [];
  let sessaoAuth = null;
  let cbAuth = null;
  let seq = 1;
  const novoId = () => `00000000-0000-4000-8000-${String(seq++).padStart(12, '0')}`;
  const agora = () => new Date().toISOString();
  const CRED = { base: 1000, plus: 2000, max: 3500, scale: 5000 };
  let mesRef = '2026-09-01';
  const ok = data => ({ data, error: null });
  const err = (code, message) => ({ data: null, error: { code, message } });

  db.unidades.forEach(u => { u.geracoes_incluidas_mes = u.totens_contratados * CRED[u.plano]; });

  /* ---------------- escopo (RLS) ---------------- */
  const perfilAtual = () => sessaoAuth ? (db.usuarios_painel.find(u => u.user_id === sessaoAuth.user.id) || null) : null;
  const lojaVisivel = lojaId => {
    const p = perfilAtual(); if (!p) return false;
    if (p.papel === 'plataforma') return true;
    const l = db.lojas.find(x => x.id === lojaId);
    return !!l && l.operador_id === p.operador_id;
  };
  const unidadeVisivel = uid => { const u = db.unidades.find(x => x.id === uid); return !!u && lojaVisivel(u.loja_id); };
  function visivel(t, r) {
    const p = perfilAtual();
    if (t === 'catalogo_loja') return true; // leitura pública
    if (!p) return false;
    switch (t) {
      case 'operadores': return p.papel === 'plataforma' || r.id === p.operador_id;
      case 'lojas': return lojaVisivel(r.id);
      case 'unidades': case 'consumo_unidade_mes': return lojaVisivel(r.loja_id);
      case 'vendedores': case 'vendedores_painel': case 'geracoes': return unidadeVisivel(r.unidade_id);
      case 'usuarios_painel': return p.papel === 'plataforma' || r.user_id === p.user_id;
      case 'frota_operador': return p.papel === 'plataforma' || r.operador_id === p.operador_id;
    }
    return true;
  }
  function podeEscrever(t, r) {
    const p = perfilAtual(); if (!p) return false;
    switch (t) {
      case 'operadores': case 'usuarios_painel': return p.papel === 'plataforma';
      case 'lojas': return p.papel === 'plataforma' || r.operador_id === p.operador_id;
      case 'unidades': case 'catalogo_loja': return lojaVisivel(r.loja_id);
      case 'vendedores': return unidadeVisivel(r.unidade_id);
      case 'geracoes': return false;
    }
    return false;
  }

  /* ---------------- tabelas e views ---------------- */
  function linhas(t) {
    if (t === 'vendedores_painel') return db.vendedores.map(({ senha_hash, tentativas_falhas, ...r }) => r);
    if (t === 'consumo_unidade_mes') return db.unidades.map(u => {
      const l = db.lojas.find(x => x.id === u.loja_id) || {};
      const incl = u.totens_contratados * CRED[u.plano];
      const usadas = db.geracoes.filter(g => g.unidade_id === u.id && g.mes_ref === mesRef).length;
      return {
        unidade_id: u.id, loja_id: u.loja_id, loja_nome: l.nome, operador_id: l.operador_id, unidade_nome: u.nome,
        plano: u.plano, totens_contratados: u.totens_contratados, status: u.status, incluidas: incl, usadas,
        saldo: Math.max(incl - usadas, 0), excedente: Math.max(usadas - incl, 0),
        percentual: incl === 0 ? (usadas > 0 ? 100 : 0) : Math.round(usadas * 100 / incl), mes_ref: mesRef,
      };
    });
    if (t === 'frota_operador') return db.operadores.map(o => {
      const totens = db.unidades.filter(u => u.status === 'ativo' && db.lojas.some(l => l.id === u.loja_id && l.operador_id === o.id))
        .reduce((s, u) => s + u.totens_contratados, 0);
      return { operador_id: o.id, operador_nome: o.nome, totens, desconto_pct: totens >= 10 ? 15 : totens >= 5 ? 10 : totens >= 3 ? 5 : 0 };
    });
    return db[t] || [];
  }

  class Consulta {
    constructor(t) { this.t = t; this.filtros = []; this.ins = []; this.op = 'select'; this.retornar = false; this.modo = 'lista'; }
    select() { if (this.op !== 'select') this.retornar = true; return this; }
    insert(rows) { this.op = 'insert'; this.dados = Array.isArray(rows) ? rows : [rows]; return this; }
    upsert(rows, opts) { this.op = 'upsert'; this.dados = Array.isArray(rows) ? rows : [rows]; this.opts = opts; return this; }
    update(p) { this.op = 'update'; this.dados = p; return this; }
    delete() { this.op = 'delete'; return this; }
    eq(c, v) { this.filtros.push([c, v]); return this; }
    in(c, vs) { this.ins.push([c, vs]); return this; }
    order() { return this; }
    limit() { return this; }
    single() { this.modo = 'single'; return this; }
    maybeSingle() { this.modo = 'maybe'; return this; }
    casa(l) {
      return this.filtros.every(([c, v]) => String(l[c]) === String(v)) &&
        this.ins.every(([c, vs]) => vs.map(String).includes(String(l[c])));
    }
    fim(data, error = null) {
      if (error) return { data: null, error };
      if (this.modo === 'single') return (data && data.length === 1) ? ok(data[0]) : err('PGRST116', `single esperava 1 linha, veio ${data ? data.length : 0}`);
      if (this.modo === 'maybe') return ok(data && data.length ? data[0] : null);
      return ok(data);
    }
    executar() {
      const t = this.t;
      chamadas.push({ op: this.op, tabela: t, filtros: this.filtros, dados: this.dados });
      if (this.op === 'select') return this.fim(linhas(t).filter(l => this.casa(l) && visivel(t, l)).map(clone));
      if (!sessaoAuth) return this.fim(null, { code: '42501', message: 'permission denied (anon)' });
      if (this.op === 'insert') {
        const out = [];
        for (const r of this.dados) {
          if (t === 'vendedores') return this.fim(null, { code: '42501', message: 'permission denied for table vendedores' });
          if (!podeEscrever(t, r)) return this.fim(null, { code: '42501', message: 'new row violates row-level security policy' });
          if (t === 'catalogo_loja' && db.catalogo_loja.some(x => x.loja_id === r.loja_id && x.sku === r.sku))
            return this.fim(null, { code: '23505', message: 'duplicate key value violates unique constraint' });
          const row = { id: novoId(), created_at: agora(), ...r };
          if (t === 'lojas') { row.branding ??= {}; row.status ??= 'ativo'; row.wizard_etapa ??= null; }
          if (t === 'unidades') { row.status ??= 'ativo'; row.geracoes_incluidas_mes = row.totens_contratados * CRED[row.plano]; }
          if (t === 'operadores') row.status ??= 'ativo';
          db[t].push(row); out.push(clone(row));
        }
        return this.fim(this.retornar ? out : null);
      }
      if (this.op === 'upsert') {
        for (const r of this.dados) {
          if (!podeEscrever(t, r)) return this.fim(null, { code: '42501', message: 'row-level security' });
          const ex = db[t].find(x => x.loja_id === r.loja_id && x.sku === r.sku);
          if (ex) Object.assign(ex, r); else db[t].push({ id: novoId(), created_at: agora(), ...r });
        }
        return this.fim(null);
      }
      if (this.op === 'update') {
        const alvo = db[t].filter(l => this.casa(l) && visivel(t, l) && podeEscrever(t, l));
        alvo.forEach(l => { Object.assign(l, this.dados); if (t === 'unidades') l.geracoes_incluidas_mes = l.totens_contratados * CRED[l.plano]; });
        return this.fim(this.retornar ? alvo.map(clone) : null);
      }
      if (this.op === 'delete') {
        db[t] = db[t].filter(l => !(this.casa(l) && visivel(t, l) && podeEscrever(t, l)));
        return this.fim(null);
      }
      return this.fim(null, { message: 'operação não suportada no dublê' });
    }
    then(res) { res(this.executar()); }
  }

  /* ---------------- RPC ---------------- */
  function payload(token) {
    const s = db.sessoes.find(x => x.token === token); if (!s) return null;
    const v = db.vendedores.find(x => x.id === s.vendedor_id);
    const u = db.unidades.find(x => x.id === v.unidade_id);
    const l = db.lojas.find(x => x.id === u.loja_id);
    const o = db.operadores.find(x => x.id === l.operador_id) || {};
    const incl = u.totens_contratados * CRED[u.plano];
    const usadas = db.geracoes.filter(g => g.unidade_id === u.id && g.mes_ref === mesRef).length;
    return {
      ok: true, token, expira_em: s.expira_em,
      vendedor: { id: v.id, nome: v.nome },
      unidade: { id: u.id, nome: u.nome, plano: u.plano, totens_contratados: u.totens_contratados },
      loja: { id: l.id, nome: l.nome, branding: l.branding || {} },
      operador: { id: o.id, nome: o.nome },
      creditos: { incluidas: incl, usadas, saldo: Math.max(incl - usadas, 0), excedente: Math.max(usadas - incl, 0),
        percentual: incl === 0 ? (usadas > 0 ? 100 : 0) : Math.round(usadas * 100 / incl), mes_ref: mesRef },
    };
  }

  async function rpc(nome, args = {}) {
    chamadas.push({ op: 'rpc', nome, args });
    const p = perfilAtual();
    switch (nome) {
      case 'meu_perfil':
        return ok(p ? { papel: p.papel, operador_id: p.operador_id || null, loja_id: p.loja_id || null } : null);
      case 'criar_vendedor': {
        if (!unidadeVisivel(args.p_unidade)) return err('42501', 'Sem permissão para esta unidade');
        if ((args.p_senha || '').length < 6) return err('22023', 'A senha precisa ter ao menos 6 caracteres');
        const email = String(args.p_email || '').trim().toLowerCase();
        if (db.vendedores.some(v => v.email === email)) return err('23505', 'duplicate key value violates unique constraint');
        const v = { id: novoId(), unidade_id: args.p_unidade, nome: args.p_nome, email, senha_hash: 'hash:' + args.p_senha, status: 'ativo', tentativas_falhas: 0, bloqueado_ate: null, created_at: agora() };
        db.vendedores.push(v); return ok(v.id);
      }
      case 'redefinir_senha_vendedor': {
        const v = db.vendedores.find(x => x.id === args.p_id);
        if (!v || !unidadeVisivel(v.unidade_id)) return err('42501', 'Sem permissão para este vendedor');
        if ((args.p_senha || '').length < 6) return err('22023', 'A senha precisa ter ao menos 6 caracteres');
        v.senha_hash = 'hash:' + args.p_senha; v.tentativas_falhas = 0; v.bloqueado_ate = null;
        db.sessoes = db.sessoes.filter(s => s.vendedor_id !== v.id);
        return ok(null);
      }
      case 'vincular_usuario_painel': {
        if (!p || p.papel !== 'plataforma') return err('42501', 'Só a plataforma vincula usuários');
        const u = usuariosAuth.find(x => x.email.toLowerCase() === String(args.p_email).toLowerCase());
        if (!u) return err('P0002', 'Usuário não encontrado no Supabase Auth. Crie em Authentication > Users primeiro.');
        const ex = db.usuarios_painel.find(x => x.user_id === u.id);
        const row = { user_id: u.id, papel: args.p_papel, operador_id: args.p_operador || null, loja_id: args.p_loja || null, created_at: agora() };
        if (ex) Object.assign(ex, row); else db.usuarios_painel.push(row);
        return ok(u.id);
      }
      case 'listar_usuarios_painel': {
        if (!p || p.papel !== 'plataforma') return err('42501', 'Só a plataforma lista usuários');
        return ok(db.usuarios_painel.map(x => ({
          user_id: x.user_id, email: (usuariosAuth.find(u => u.id === x.user_id) || {}).email, papel: x.papel,
          operador_id: x.operador_id, operador_nome: (db.operadores.find(o => o.id === x.operador_id) || {}).nome || null,
          loja_id: x.loja_id, loja_nome: null, created_at: x.created_at || agora(),
        })));
      }
      /* ---- tablet ---- */
      case 'vendedor_login': {
        const v = db.vendedores.find(x => x.email === String(args.p_email || '').trim().toLowerCase());
        if (!v) return ok({ ok: false, erro: 'credenciais' });
        if (v.bloqueado_ate && new Date(v.bloqueado_ate) > new Date()) return ok({ ok: false, erro: 'bloqueado' });
        if (v.senha_hash !== 'hash:' + args.p_senha) {
          v.tentativas_falhas = (v.tentativas_falhas || 0) + 1;
          if (v.tentativas_falhas >= 5) { v.tentativas_falhas = 0; v.bloqueado_ate = new Date(Date.now() + 15 * 60000).toISOString(); return ok({ ok: false, erro: 'bloqueado' }); }
          return ok({ ok: false, erro: 'credenciais' });
        }
        if (v.status !== 'ativo') return ok({ ok: false, erro: 'inativo' });
        v.tentativas_falhas = 0;
        const token = novoId();
        db.sessoes.push({ token, vendedor_id: v.id, expira_em: new Date(Date.now() + 12 * 3600000).toISOString() });
        return ok(payload(token));
      }
      case 'vendedor_sessao': {
        const pl = payload(args.p_token);
        return ok(pl || { ok: false, erro: 'sessao' });
      }
      case 'vendedor_logout':
        db.sessoes = db.sessoes.filter(s => s.token !== args.p_token); return ok(null);
      case 'registrar_geracao': {
        const s = db.sessoes.find(x => x.token === args.p_token);
        if (!s) return ok({ ok: false, erro: 'sessao' });
        const v = db.vendedores.find(x => x.id === s.vendedor_id);
        const u = db.unidades.find(x => x.id === v.unidade_id);
        const incl = u.totens_contratados * CRED[u.plano];
        const usadas = db.geracoes.filter(g => g.unidade_id === u.id && g.mes_ref === mesRef).length;
        db.geracoes.push({ id: novoId(), unidade_id: u.id, loja_id: u.loja_id, vendedor_id: v.id, origem: args.p_origem, excedente: usadas >= incl, mes_ref: mesRef, criado_em: agora() });
        return ok({ ok: true, creditos: payload(s.token).creditos });
      }
    }
    return err('42883', 'função desconhecida no dublê: ' + nome);
  }

  /* ---------------- auth / storage ---------------- */
  const auth = {
    async getSession() { return { data: { session: sessaoAuth } }; },
    onAuthStateChange(cb) { cbAuth = cb; return { data: { subscription: { unsubscribe() { } } } }; },
    async signInWithPassword({ email, password }) {
      const u = usuariosAuth.find(x => x.email.toLowerCase() === String(email).toLowerCase());
      if (!u || u.senha !== password) return { data: {}, error: { message: 'Invalid login credentials' } };
      sessaoAuth = { access_token: 'tok-' + u.id + '-' + (seq++), user: { id: u.id, email: u.email } };
      cbAuth && cbAuth('SIGNED_IN', sessaoAuth);
      return { data: { session: sessaoAuth }, error: null };
    },
    async signOut() { sessaoAuth = null; cbAuth && cbAuth('SIGNED_OUT', null); return { error: null }; },
  };

  const storage = {
    from(bucket) {
      return {
        async upload(caminho, blob, opts) {
          chamadas.push({ op: 'upload', bucket, caminho, tipo: blob.type, tamanho: blob.size, opts });
          if (!sessaoAuth) return { error: { message: 'new row violates row-level security policy', statusCode: '403' } };
          const pasta = caminho.split('/')[0];
          const ehUuid = /^[0-9a-f-]{36}$/i.test(pasta);
          const pode = ehUuid ? lojaVisivel(pasta) : (perfilAtual() || {}).papel === 'plataforma';
          if (!pode) return { error: { message: 'new row violates row-level security policy', statusCode: '403' } };
          if (arquivos[caminho] && !(opts && opts.upsert)) return { error: { message: 'The resource already exists' } };
          arquivos[`${bucket}/${caminho}`] = { tipo: blob.type, tamanho: blob.size };
          return { data: { path: caminho }, error: null };
        },
        getPublicUrl(caminho) { return { data: { publicUrl: `https://exemplo.supabase.co/storage/v1/object/public/${bucket}/${caminho}` } }; },
        async remove(caminhos) {
          chamadas.push({ op: 'remove', bucket, caminhos });
          caminhos.forEach(c => delete arquivos[`${bucket}/${c}`]);
          return { data: null, error: null };
        },
      };
    },
  };

  return {
    auth, storage, rpc, from: t => new Consulta(t),
    __db: db, __arquivos: arquivos, __chamadas: chamadas,
    __setMes: m => { mesRef = m; }, __perfilAtual: perfilAtual,
    __logarComo: email => { const u = usuariosAuth.find(x => x.email === email); sessaoAuth = { access_token: 'tok-' + u.id, user: { id: u.id, email } }; },
  };
};
