// totem.js — substitui auth.js no modo Demo Totem.
// Sem login: o totem entra direto. Mantém o cliente Supabase (para ler catalogo_loja)
// e expõe os mesmos globais que script.js espera de auth.js.
const SUPABASE_URL = 'https://agzknkebggfytlqcsuuu.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFnemtua2ViZ2dmeXRscWNzdXV1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA4MDMzODUsImV4cCI6MjA4NjM3OTM4NX0.c2pFotvELY6ZopuQSMlzqUwluKc0HenIAvWuZVclQz0';

// Loja exibida no totem (mesmo default do SQL em supabase/01_catalogo_loja.sql)
const TOTEM_LOJA_ID = '00000000-0000-0000-0000-000000000001';

const supabaseClient = (typeof supabase !== 'undefined')
    ? supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    : null;

// script.js chama window.getAuthState() antes de gerar; no totem é sempre anônimo.
window.getAuthState = async () => ({ isAnonymous: true, session: null });
window.supabaseClient = supabaseClient;
window.TOTEM_LOJA_ID = TOTEM_LOJA_ID;
window.IS_TOTEM = true;

// Funções que a UI antiga referencia via onclick; viram no-op no totem.
window.logout = () => { };
window.openAuthModal = () => { };
