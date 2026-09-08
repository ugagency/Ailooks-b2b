// auth.js - Gerenciamento de Autenticação Supabase
const SUPABASE_URL = 'https://agzknkebggfytlqcsuuu.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFnemtua2ViZ2dmeXRscWNzdXV1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA4MDMzODUsImV4cCI6MjA4NjM3OTM4NX0.c2pFotvELY6ZopuQSMlzqUwluKc0HenIAvWuZVclQz0';

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Elementos da UI de Auth
const authOverlay = document.getElementById('authOverlay');
const closeAuthBtn = document.getElementById('closeAuthBtn');
const headerAuthMenu = document.getElementById('headerAuthMenu');
const authForm = document.getElementById('authForm');
const authEmail = document.getElementById('authEmail');
const authPassword = document.getElementById('authPassword');
const authSubmitBtn = document.getElementById('authSubmitBtn');
const toggleAuthMode = document.getElementById('toggleAuthMode');
const authError = document.getElementById('authError');
const authSuccess = document.getElementById('authSuccess');
const authSuccessBtn = document.getElementById('authSuccessBtn');

let isLoginMode = true;
let isAnonymous = true; // Default to anonymous

// --- FUNÇÕES DE AUTH ---

async function handleAuth(e) {
    e.preventDefault();
    const email = authEmail.value;
    const password = authPassword.value;

    authError.classList.add('hidden');
    authSubmitBtn.disabled = true;
    authSubmitBtn.textContent = isLoginMode ? 'Acessando...' : 'Criando conta...';

    try {
        if (isLoginMode) {
            const { data, error } = await supabaseClient.auth.signInWithPassword({
                email,
                password,
            });
            if (error) throw error;
            authOverlay.classList.add('hidden');
        } else {
            const { data, error } = await supabaseClient.auth.signUp({
                email,
                password,
            });
            if (error) throw error;

            authForm.classList.add('hidden');
            authSuccess.classList.remove('hidden');
        }
    } catch (error) {
        authError.textContent = error.message;
        authError.classList.remove('hidden');
    } finally {
        authSubmitBtn.disabled = false;
        authSubmitBtn.textContent = isLoginMode ? 'Acessar Sistema' : 'Criar Conta';
    }
}

async function logout() {
    isAnonymous = true;
    await supabaseClient.auth.signOut();
    window.location.reload();
}

function openAuthModal(mode = 'login') {
    isLoginMode = mode === 'login';
    authForm.classList.remove('hidden');
    authSuccess.classList.add('hidden');

    authSubmitBtn.textContent = isLoginMode ? 'Acessar Sistema' : 'Criar Conta';
    toggleAuthMode.textContent = isLoginMode
        ? 'Não tem uma conta? Criar conta'
        : 'Já tem uma conta? Entrar';

    authOverlay.classList.remove('hidden');
    authOverlay.classList.add('flex');
}

// --- CONTROLE DE ESTADO ---

function updateAuthState(session) {
    const authElements = document.querySelectorAll('.auth-only');
    const mainNav = document.getElementById('main-nav');

    if (session) {
        isAnonymous = false;
        authOverlay.classList.add('hidden');
        mainNav.innerHTML = `
            <div onclick="openAvatarManager()" class="nav-item" title="Meus Bonecos">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                <span>Bonecos</span>
            </div>
            <div onclick="openCloset()" class="nav-item" title="Meu Closet">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                </svg>
                <span>Closet</span>
            </div>
            <div onclick="openHistory()" class="nav-item" title="Histórico">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>Histórico</span>
            </div>
            <div class="nav-separator"></div>
            <div onclick="logout()" class="nav-item" title="Sair">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                <span>Sair</span>
            </div>
        `;
        // Mostrar elementos apenas para logados (como as Tabs)
        authElements.forEach(el => {
            el.classList.remove('hidden');
            if (el.tagName === 'DIV' && el.classList.contains('auth-only')) el.classList.add('flex');
        });
    } else {
        isAnonymous = true;
        mainNav.innerHTML = `
            <div onclick="openAuthModal('login')" class="nav-item" title="Entrar">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                <span>Entrar</span>
            </div>
            <div onclick="openAuthModal('signup')" class="nav-item" style="color: #C78D75;" title="Criar Conta">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                </svg>
                <span>Criar</span>
            </div>
        `;
        // Esconder elementos exclusivos para logados
        authElements.forEach(el => {
            el.classList.add('hidden');
            if (el.tagName === 'DIV' && el.classList.contains('auth-only')) el.classList.remove('flex');
        });
    }

    // Animate in
    setTimeout(() => {
        mainNav.classList.add('nav-visible');
        mainNav.style.transform = 'translateX(-50%) translateY(0)';
        mainNav.style.opacity = '1';
    }, 100);

    // Notify script.js
    window.dispatchEvent(new CustomEvent('auth:change', { detail: { isAnonymous, session } }));
}

// --- EVENT LISTENERS ---

authForm.addEventListener('submit', handleAuth);

closeAuthBtn.addEventListener('click', () => {
    authOverlay.classList.add('hidden');
});

toggleAuthMode.addEventListener('click', () => {
    isLoginMode = !isLoginMode;
    authSubmitBtn.textContent = isLoginMode ? 'Acessar Sistema' : 'Criar Conta';
    toggleAuthMode.textContent = isLoginMode
        ? 'Não tem uma conta? Criar conta'
        : 'Já tem uma conta? Entrar';
});

authSuccessBtn.addEventListener('click', () => {
    isLoginMode = true;
    authForm.classList.remove('hidden');
    authSuccess.classList.add('hidden');
    toggleAuthMode.click();
});

// Novos Elementos Improved Auth
const togglePasswordBtn = document.getElementById('togglePasswordBtn');
const eyeIconOpen = document.getElementById('eyeIconOpen');
const eyeIconClosed = document.getElementById('eyeIconClosed');
const forgotPasswordBtn = document.getElementById('forgotPasswordBtn');

// Alternar Visibilidade da Senha
togglePasswordBtn?.addEventListener('click', () => {
    const isPassword = authPassword.type === 'password';
    authPassword.type = isPassword ? 'text' : 'password';
    eyeIconOpen.classList.toggle('hidden', !isPassword);
    eyeIconClosed.classList.toggle('hidden', isPassword);
});

// Esqueci Minha Senha
forgotPasswordBtn?.addEventListener('click', async () => {
    const email = authEmail.value;
    if (!email) {
        authError.textContent = "Por favor, digite seu e-mail primeiro.";
        authError.classList.remove('hidden');
        return;
    }

    try {
        const { error } = await supabaseClient.auth.resetPasswordForEmail(email, {
            redirectTo: window.location.href,
        });
        if (error) throw error;

        notificationTitle.textContent = "Recuperação de Senha";
        notificationMessage.textContent = "Se este e-mail estiver cadastrado, você receberá um link para redefinir sua senha em instantes.";
        notificationModal.classList.remove('hidden');
        notificationModal.classList.add('flex');
    } catch (err) {
        authError.textContent = err.message;
        authError.classList.remove('hidden');
    }
});

supabaseClient.auth.onAuthStateChange((event, session) => {
    updateAuthState(session);
});

(async () => {
    const { data: { session } } = await supabaseClient.auth.getSession();
    updateAuthState(session);
})();

// Expõe globalmente
window.logout = logout;
window.openAuthModal = openAuthModal;
window.getAuthState = async () => {
    const { data: { session } } = await supabaseClient.auth.getSession();
    return { isAnonymous, session };
};
window.supabaseClient = supabaseClient; // Para que o script.js possa usar
