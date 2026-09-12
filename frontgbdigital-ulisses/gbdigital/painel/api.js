// painel/api.js — cliente Supabase, sessão do painel, papel do usuário e consultas.
// O painel usa Supabase Auth (e-mail + senha). O escopo é garantido pelo RLS
// (03_estrutura_provva.sql); este arquivo só organiza as chamadas.
window.API = (() => {
  const SUPABASE_URL = 'https://agzknkebggfytlqcsuuu.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFnemtua2ViZ2dmeXRscWNzdXV1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA4MDMzODUsImV4cCI6MjA4NjM3OTM4NX0.c2pFotvELY6ZopuQSMlzqUwluKc0HenIAvWuZVclQz0';

  let cliente = null;
  let sessao = null;
  let perfil = null; // { papel, operador_id, loja_id } ou null (usuário sem vínculo)
  const ouvintes = [];

  /* ---------------------- sessão ---------------------- */
  async function iniciar(injetado) {
    cliente = injetado || supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    cliente.auth.onAuthStateChange((_evento, s) => { aplicarSessao(s); });
    const { data } = await cliente.auth.getSession();
    await aplicarSessao(data ? data.session : null);
  }

  let ultimaSessaoId = undefined;
  async function aplicarSessao(s) {
    const id = s ? (s.access_token || s.user?.id || 'x') : null;
    if (id === ultimaSessaoId) return; // onAuthStateChange repete o evento inicial
    ultimaSessaoId = id;
    sessao = s;
    perfil = null;
    if (s) {
      try { perfil = await rpc('meu_perfil'); } catch (e) { console.warn('meu_perfil:', e); perfil = null; }
    }
    for (const fn of ouvintes) { try { await fn(sessao, perfil); } catch (e) { console.error(e); } }
  }

  const onSessao = fn => ouvintes.push(fn);

  async function entrar(email, senha) {
    const { error } = await cliente.auth.signInWithPassword({ email, password: senha });
    if (error) throw error;
  }
  async function sair() { await cliente.auth.signOut(); }

  /* ---------------------- base ---------------------- */
  async function rpc(nome, args) {
    const { data, error } = await cliente.rpc(nome, args || {});
    if (error) throw error;
    return data;
  }
  const de = tabela => cliente.from(tabela);
  async function dados(consulta) {
    const { data, error } = await consulta;
    if (error) throw error;
    return data;
  }

  const ehPlataforma = () => !!perfil && perfil.papel === 'plataforma';
  const ehOperador = () => !!perfil && perfil.papel === 'operador';

  /* ---------------------- operadores ---------------------- */
  const listarOperadores = () => dados(de('operadores').select('*').order('nome'));
  const obterOperador = id => dados(de('operadores').select('*').eq('id', id).maybeSingle());
  async function salvarOperador(campos, id) {
    if (id) return dados(de('operadores').update(campos).eq('id', id).select().single());
    return dados(de('operadores').insert([campos]).select().single());
  }
  const excluirOperador = id => dados(de('operadores').delete().eq('id', id));

  /* ---------------------- lojas ---------------------- */
  const listarLojas = () => dados(de('lojas').select('*').order('nome'));
  const obterLoja = id => dados(de('lojas').select('*').eq('id', id).maybeSingle());
  async function salvarLoja(campos, id) {
    if (id) return dados(de('lojas').update(campos).eq('id', id).select().single());
    // Inserção nova usa RPC (que tem permissão com security definer)
    return rpc('criar_loja', {
      p_nome: campos.nome,
      p_operador_id: campos.operador_id,
      p_observacao: campos.observacao || null,
      p_wizard_etapa: campos.wizard_etapa || 1
    });
  }
  const excluirLoja = id => dados(de('lojas').delete().eq('id', id));

  /* ---------------------- unidades ---------------------- */
  function listarUnidades(lojaId) {
    let q = de('unidades').select('*').order('nome');
    if (lojaId) q = q.eq('loja_id', lojaId);
    return dados(q);
  }
  const obterUnidade = id => dados(de('unidades').select('*').eq('id', id).maybeSingle());
  async function salvarUnidade(campos, id) {
    if (id) return dados(de('unidades').update(campos).eq('id', id).select().single());
    return dados(de('unidades').insert([campos]).select().single());
  }
  const excluirUnidade = id => dados(de('unidades').delete().eq('id', id));

  /* ---------------------- vendedores ---------------------- */
  // Leitura pela view; criação usa Supabase Auth para senha.
  function listarVendedores(unidadeId) {
    let q = de('vendedores_painel').select('*').order('nome');
    if (unidadeId) q = q.eq('unidade_id', unidadeId);
    return dados(q);
  }
  // Cria o vendedor E o usuário no Supabase Auth numa só chamada (Edge Function,
  // única peça com a service_role key). Retorna { ok, vendedor_id, senha_temporaria }.
  async function criarVendedor(unidadeId, nome, email) {
    const { data: { session } } = await cliente.auth.getSession();
    const resp = await fetch(`${SUPABASE_URL}/functions/v1/criar-vendedor-auth`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
        'apikey': SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({ unidade_id: unidadeId, nome, email }),
    });
    const json = await resp.json();
    if (!resp.ok || !json.ok) throw new Error(json.detalhe || json.erro || 'Falha ao criar vendedor.');
    return json;
  }
  const atualizarVendedor = (id, campos) => dados(de('vendedores').update(campos).eq('id', id));
  const excluirVendedor = id => dados(de('vendedores').delete().eq('id', id));

  /* ---------------------- consumo / frota ---------------------- */
  const consumoUnidades = () => dados(de('consumo_unidade_mes').select('*'));
  const frotaOperadores = () => dados(de('frota_operador').select('*'));

  /* ---------------------- catálogo ---------------------- */
  const listarCatalogo = lojaId => dados(de('catalogo_loja').select('*').eq('loja_id', lojaId));
  const inserirPeca = registro => dados(de('catalogo_loja').insert([registro]));
  const atualizarPeca = (id, campos) => dados(de('catalogo_loja').update(campos).eq('id', id));
  const excluirPeca = id => dados(de('catalogo_loja').delete().eq('id', id));
  const upsertCatalogo = linhas => dados(de('catalogo_loja').upsert(linhas, { onConflict: 'loja_id,sku' }));

  /* ---------------------- usuários do painel ---------------------- */
  const listarUsuarios = () => rpc('listar_usuarios_painel');
  const vincularUsuario = (email, papel, operadorId, lojaId) =>
    rpc('vincular_usuario_painel', { p_email: email, p_papel: papel, p_operador: operadorId || null, p_loja: lojaId || null });
  const removerUsuario = userId => dados(de('usuarios_painel').delete().eq('user_id', userId));

  /* ---------------------- gerentes da loja ---------------------- */
  function listarGerentes(lojaId) {
    return dados(de('usuarios_painel')
      .select('user_id, user_email, status')
      .eq('loja_id', lojaId)
      .eq('papel', 'loja')
      .order('user_email'));
  }
  const adicionarGerente = (lojaId, email) =>
    rpc('vincular_usuario_painel', { p_email: email, p_papel: 'loja', p_operador: null, p_loja: lojaId });
  const removerGerente = (lojaId, userId) =>
    dados(de('usuarios_painel').delete().eq('user_id', userId).eq('loja_id', lojaId).eq('papel', 'loja'));

  /* ---------------------- storage ---------------------- */
  // Arquivos vivem em <loja_id>/... (o RLS do storage checa a pasta). URL versionada para furar cache.
  async function subirArquivo(bucket, caminho, blob, contentType) {
    const { error } = await cliente.storage.from(bucket).upload(caminho, blob, { upsert: true, contentType });
    if (error) throw error;
    const publica = cliente.storage.from(bucket).getPublicUrl(caminho).data.publicUrl;
    return `${publica}?v=${Date.now()}`;
  }
  async function removerArquivo(bucket, caminhos) {
    const { error } = await cliente.storage.from(bucket).remove(caminhos);
    if (error) throw error;
  }
  // Caminho dentro do bucket a partir da URL pública gravada (funciona para raiz legada e <loja_id>/...).
  function caminhoDeUrl(url, bucket) {
    const m = new RegExp(`/object/public/${bucket}/([^?]+)`).exec(String(url || ''));
    return m ? decodeURIComponent(m[1]) : null;
  }

  return {
    iniciar, onSessao, entrar, sair, rpc, de, dados,
    get cliente() { return cliente; }, get sessao() { return sessao; }, get perfil() { return perfil; },
    ehPlataforma, ehOperador,
    listarOperadores, obterOperador, salvarOperador, excluirOperador,
    listarLojas, obterLoja, salvarLoja, excluirLoja,
    listarUnidades, obterUnidade, salvarUnidade, excluirUnidade,
    listarVendedores, criarVendedor, atualizarVendedor, excluirVendedor,
    consumoUnidades, frotaOperadores,
    listarCatalogo, inserirPeca, atualizarPeca, excluirPeca, upsertCatalogo,
    listarUsuarios, vincularUsuario, removerUsuario,
    listarGerentes, adicionarGerente, removerGerente,
    subirArquivo, removerArquivo, caminhoDeUrl,
  };
})();
