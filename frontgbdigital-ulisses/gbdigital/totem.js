// totem.js — bootstrap do app do tablet (Provva).
//
// Ordem de boot:
//   tela neutra de carregamento → token em localStorage? → rpc vendedor_sessao
//   → branding da loja aplicado nas variáveis CSS → app revelado.
// Sem token (ou token inválido) → tela de login do vendedor (rpc vendedor_login).
// Nada de branding é cacheado: só entra na tela depois que o servidor validou a sessão,
// para nunca "piscar" a identidade de outra loja num tablet reaproveitado.
//
// Expõe para script.js: window.TOTEM_READY (Promise resolvida com a sessão válida),
// window.TOTEM_SESSAO, window.TOTEM_LOJA_ID, window.registrarGeracao(origem),
// window.supabaseClient, window.getAuthState (stub anônimo) e window.IS_TOTEM.

const SUPABASE_URL = 'https://agzknkebggfytlqcsuuu.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFnemtua2ViZ2dmeXRscWNzdXV1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA4MDMzODUsImV4cCI6MjA4NjM3OTM4NX0.c2pFotvELY6ZopuQSMlzqUwluKc0HenIAvWuZVclQz0';

const BRANDING_PADRAO = {
    nome_exibicao: 'AI Looks',
    logo_url: null,
    cor_primaria: '#1A1A1A',
    cor_secundaria: '#8E8E93',
};

let resolverReady;
window.TOTEM_READY = new Promise(r => { resolverReady = r; });
window.IS_TOTEM = true;
window.TOTEM_SESSAO = null;
window.TOTEM_LOJA_ID = null;
window.getAuthState = async () => ({ isAnonymous: true, session: null });
window.openAuthModal = () => { };
window.logout = () => sairTotem();

const MODO_TESTE = new URLSearchParams(location.search).has('teste');

let cliente = null;
let primeiraSessao = true;
const avisosDados = new Set(); // dedupe dos avisos de 80% / 100% por mês

const $ = id => document.getElementById(id);

/* ------------------------------ utilidades ------------------------------ */
async function rpc(nome, args) {
    const { data, error } = await cliente.rpc(nome, args);
    if (error) throw error;
    return data;
}

function hexParaRgb(hex) {
    const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(hex || '').trim());
    if (!m) return null;
    let h = m[1];
    if (h.length === 3) h = h.split('').map(c => c + c).join('');
    const n = parseInt(h, 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

// Cor de texto legível sobre a cor dada (luminância relativa, WCAG).
function corContraste(hex) {
    const c = hexParaRgb(hex);
    if (!c) return '#FFFFFF';
    const lin = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    const L = 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
    return L > 0.4 ? '#1A1A1A' : '#FFFFFF';
}

function toast(mensagem, tipo = 'info') {
    let caixa = $('totemAvisos');
    if (!caixa) {
        caixa = document.createElement('div');
        caixa.id = 'totemAvisos';
        caixa.className = 'fixed left-1/2 -translate-x-1/2 bottom-6 z-[250] flex flex-col gap-2 items-center pointer-events-none';
        document.body.appendChild(caixa);
    }
    const el = document.createElement('div');
    const cor = tipo === 'alerta' ? 'bg-amber-600' : tipo === 'erro' ? 'bg-red-600' : 'bg-gray-900';
    el.className = `${cor} text-white text-xs font-medium px-4 py-3 rounded-xl shadow-lg max-w-[90vw] pointer-events-auto`;
    el.textContent = mensagem;
    caixa.appendChild(el);
    setTimeout(() => el.remove(), 6000);
}

/* ------------------------------- branding ------------------------------- */
// Aplica as cores/logo/nome da loja. Campos ausentes ou inválidos caem no padrão neutro.
function aplicarBranding(brandingLoja) {
    const b = { ...BRANDING_PADRAO, ...(brandingLoja || {}) };
    const primaria = hexParaRgb(b.cor_primaria) ? b.cor_primaria : BRANDING_PADRAO.cor_primaria;
    const secundaria = hexParaRgb(b.cor_secundaria) ? b.cor_secundaria : BRANDING_PADRAO.cor_secundaria;
    const p = hexParaRgb(primaria), s = hexParaRgb(secundaria);

    const raiz = document.documentElement.style;
    raiz.setProperty('--cor-primaria', primaria);
    raiz.setProperty('--cor-primaria-rgb', `${p.r} ${p.g} ${p.b}`);
    raiz.setProperty('--cor-primaria-contraste', corContraste(primaria));
    raiz.setProperty('--cor-secundaria', secundaria);
    raiz.setProperty('--cor-secundaria-rgb', `${s.r} ${s.g} ${s.b}`);
    raiz.setProperty('--cor-secundaria-contraste', corContraste(secundaria));

    const nome = (b.nome_exibicao || '').trim() || BRANDING_PADRAO.nome_exibicao;
    const logo = $('lojaLogo'), h1 = $('lojaNome'), rodape = $('rodapeNome');
    if (h1) h1.textContent = nome;
    if (rodape) rodape.textContent = nome;
    document.title = `${nome} | Provador virtual`;

    if (logo) {
        if (b.logo_url) {
            logo.src = b.logo_url;
            logo.alt = nome;
            logo.classList.remove('hidden');
            if (h1) h1.classList.add('hidden');
            logo.onerror = () => { logo.classList.add('hidden'); if (h1) h1.classList.remove('hidden'); };
        } else {
            logo.classList.add('hidden');
            logo.removeAttribute('src');
            if (h1) h1.classList.remove('hidden');
        }
    }
}

/* ------------------------------- créditos ------------------------------- */
function atualizarCreditos(creditos) {
    if (!creditos) return;
    if (window.TOTEM_SESSAO) window.TOTEM_SESSAO.creditos = creditos;

    const pill = $('creditosPill');
    if (pill) {
        const usadas = Number(creditos.usadas || 0), incl = Number(creditos.incluidas || 0);
        pill.textContent = `Gerações do mês: ${usadas.toLocaleString('pt-BR')} / ${incl.toLocaleString('pt-BR')}`;
        pill.classList.toggle('text-red-600', usadas >= incl && incl > 0);
        pill.classList.toggle('text-amber-600', usadas < incl && Number(creditos.percentual) >= 80);
        pill.title = creditos.excedente > 0
            ? `${creditos.excedente} geração(ões) excedente(s) neste mês`
            : `${creditos.saldo} geração(ões) restante(s) no pool da unidade`;
    }

    const pct = Number(creditos.percentual || 0);
    const mes = creditos.mes_ref || '';
    if (pct >= 100 && !avisosDados.has(`${mes}:100`)) {
        avisosDados.add(`${mes}:100`);
        toast('Pool de gerações do mês esgotado. As próximas gerações contam como excedente.', 'alerta');
    } else if (pct >= 80 && pct < 100 && !avisosDados.has(`${mes}:80`)) {
        avisosDados.add(`${mes}:80`);
        toast(`Atenção: ${pct}% do pool de gerações do mês já foi usado.`, 'alerta');
    }
}

// Chamado por script.js após uma geração bem-sucedida. Nunca lança: falha vira aviso.
async function registrarGeracao(origem) {
    try {
        const res = await rpc('registrar_geracao', { p_origem: origem });
        if (!res || res.ok === false) {
            if (res && res.erro === 'sessao') {
                toast('Sua sessão expirou. Entre novamente para continuar.', 'erro');
                await cliente.auth.signOut();
                mostrarLogin('Sessão expirada. Entre novamente.');
            } else {
                toast('Não foi possível registrar a geração no controle de créditos.', 'erro');
            }
            return null;
        }
        atualizarCreditos(res.creditos);
        return res.creditos;
    } catch (e) {
        console.warn('registrar_geracao falhou:', e);
        toast('Não foi possível registrar a geração no controle de créditos.', 'erro');
        return null;
    }
}
window.registrarGeracao = registrarGeracao;

/* -------------------------------- telas --------------------------------- */
function mostrarCarregando(on) {
    const t = $('telaCarregando');
    if (t) t.classList.toggle('hidden', !on);
}

// Login agora é só na porta de entrada (index.html): sem token válido, volta pra lá.
// _test_tablet.html continua testando o formulário embutido (#authOverlay) direto no dublê.
function mostrarLogin(mensagem) {
    if (!MODO_TESTE) { location.href = 'index.html' + (mensagem ? ('?erro=' + encodeURIComponent(mensagem)) : ''); return; }
    mostrarCarregando(false);
    const ov = $('authOverlay');
    if (ov) { ov.classList.remove('hidden'); ov.classList.add('flex'); }
    const erro = $('authError');
    if (erro) {
        erro.textContent = mensagem || '';
        erro.classList.toggle('hidden', !mensagem);
    }
    setTimeout(() => $('authEmail')?.focus(), 50);
}

function revelarApp() {
    const ov = $('authOverlay');
    if (ov) { ov.classList.add('hidden'); ov.classList.remove('flex'); }
    mostrarCarregando(false);
    const app = $('appContent');
    if (app) app.classList.remove('hidden');
}

function iniciarSessao(payload) {
    window.TOTEM_SESSAO = payload;
    window.TOTEM_LOJA_ID = payload.loja?.id || null;

    aplicarBranding(payload.loja?.branding);
    const un = $('unidadeNome');
    if (un) un.textContent = [payload.unidade?.nome, payload.vendedor?.nome].filter(Boolean).join(' · ');
    atualizarCreditos(payload.creditos);

    revelarApp();
    const primeira = primeiraSessao;
    primeiraSessao = false;
    window.dispatchEvent(new CustomEvent('totem:sessao', { detail: { primeira, sessao: payload } }));
    if (primeira) resolverReady(payload);
}

/* --------------------------------- auth --------------------------------- */
async function entrar(ev) {
    ev.preventDefault();
    const btn = $('authSubmitBtn'), erro = $('authError');
    if (erro) erro.classList.add('hidden');
    if (btn) { btn.disabled = true; btn.textContent = 'Entrando...'; }
    try {
        const email = ($('authEmail')?.value || '').trim();
        const senha = $('authPassword')?.value || '';

        const { error: erroAuth } = await cliente.auth.signInWithPassword({ email, password: senha });
        if (erroAuth) {
            if (erro) { erro.textContent = 'E-mail ou senha incorretos.'; erro.classList.remove('hidden'); }
            return;
        }

        const { data: { user } } = await cliente.auth.getUser();

        // Busca os dados do vendedor para iniciar a sessão.
        const { data: vendedor } = await cliente
            .from('vendedores')
            .select('id, nome, email, unidade_id')
            .eq('user_id', user.id)
            .single();

        if (!vendedor) {
            if (erro) { erro.textContent = 'Vendedor não encontrado.'; erro.classList.remove('hidden'); }
            await cliente.auth.signOut();
            return;
        }

        // Busca a unidade e loja para dados de contexto.
        const { data: unidade } = await cliente
            .from('unidades')
            .select('id, nome, loja_id')
            .eq('id', vendedor.unidade_id)
            .single();

        const { data: loja } = unidade
            ? await cliente.from('lojas').select('id, nome, branding').eq('id', unidade.loja_id).single()
            : { data: null };

        if ($('authPassword')) $('authPassword').value = '';
        iniciarSessao({
            ok: true,
            vendedor,
            unidade,
            loja,
            creditos: { incluidas: 0, usadas: 0, saldo: 0, excedente: 0, percentual: 0 },
        });
    } catch (e) {
        console.error('login:', e);
        if (erro) { erro.textContent = 'Sem conexão com o servidor. Tente novamente.'; erro.classList.remove('hidden'); }
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = 'Entrar'; }
    }
}

async function sairTotem() {
    try { await cliente.auth.signOut(); } catch (e) { /* ignorar erro ao sair */ }
    location.reload();
}

function ligarLogin() {
    // O overlay veio do B2C: some o que não faz sentido no tablet (fechar, criar conta, esqueci a senha).
    ['closeAuthBtn', 'forgotPasswordBtn', 'toggleAuthMode', 'skipAuthBtn', 'authSuccess'].forEach(id => $(id)?.classList.add('hidden'));
    $('authForm')?.addEventListener('submit', entrar);
    $('btnSair') && ($('btnSair').onclick = sairTotem);
    const olho = $('togglePasswordBtn');
    if (olho) olho.onclick = () => {
        const inp = $('authPassword');
        const mostrar = inp.type === 'password';
        inp.type = mostrar ? 'text' : 'password';
        $('eyeIconOpen')?.classList.toggle('hidden', mostrar);
        $('eyeIconClosed')?.classList.toggle('hidden', !mostrar);
    };
}

/* --------------------------------- boot --------------------------------- */
async function boot() {
    ligarLogin();
    mostrarCarregando(true);
    try {
        const { data: { session } } = await cliente.auth.getSession();
        if (!session) { mostrarLogin(''); return; }

        const { data: { user } } = await cliente.auth.getUser();
        if (!user) { mostrarLogin('Sessão inválida. Entre novamente.'); return; }

        // Busca os dados do vendedor.
        const { data: vendedor } = await cliente
            .from('vendedores')
            .select('id, nome, email, unidade_id')
            .eq('user_id', user.id)
            .single();

        if (!vendedor) { mostrarLogin('Vendedor não encontrado.'); return; }

        // Busca a unidade e loja.
        const { data: unidade } = await cliente
            .from('unidades')
            .select('id, nome, loja_id')
            .eq('id', vendedor.unidade_id)
            .single();

        const { data: loja } = unidade
            ? await cliente.from('lojas').select('id, nome, branding').eq('id', unidade.loja_id).single()
            : { data: null };

        iniciarSessao({
            ok: true,
            vendedor,
            unidade,
            loja,
            creditos: { incluidas: 0, usadas: 0, saldo: 0, excedente: 0, percentual: 0 },
        });
    } catch (e) {
        console.error('sessão:', e);
        mostrarLogin('Sem conexão com o servidor. Verifique a internet e tente de novo.');
    }
}

// Modo de teste (_test_tablet.html): o dublê do cliente entra por aqui e o boot é manual.
if (MODO_TESTE) {
    window.__totemTeste = {
        iniciarCom(dubles) { cliente = dubles; window.supabaseClient = dubles; return boot(); },
        aplicarBranding, atualizarCreditos, corContraste, hexParaRgb,
        estado: () => ({ sessao: window.TOTEM_SESSAO, lojaId: window.TOTEM_LOJA_ID, token: localStorage.getItem(CHAVE_TOKEN) }),
    };
} else {
    cliente = (typeof supabase !== 'undefined') ? supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;
    window.supabaseClient = cliente;
    if (cliente) boot();
    else mostrarLogin('Biblioteca do Supabase não carregou. Verifique a conexão.');
}
