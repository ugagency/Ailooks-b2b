// script.js - Lógica AI Look (Versão v5.0 - Full Management & History)
const webhookUrl = 'https://automacoes-n8n.infrassys.com/webhook-test/ailooks-lojas';
const chatWebhookUrl = 'https://automacoes-n8n.infrassys.com/webhook/webchat';

// Elementos da Interface
const inputMain = document.getElementById('input-main');
const inputRef = document.getElementById('input-ref');
const previewMain = document.getElementById('preview-main');
const previewRef = document.getElementById('preview-ref');
const placeholderMain = document.getElementById('upload-placeholder-main');
const iconRef = document.getElementById('icon-ref');
const scanLine = document.getElementById('scan-main');
const fileRefName = document.getElementById('file-ref-name');
const removeMain = document.getElementById('remove-main');
const removeRef = document.getElementById('remove-ref');
const generateBtn = document.getElementById('generateBtn');
const resetBtn = document.getElementById('resetBtn');
const promptEl = document.getElementById('prompt');
const loadingOverlay = document.getElementById('loadingOverlay');
const resultSection = document.getElementById('resultSection');
const resultGrid = document.getElementById('resultGrid');
const regenerateBtn = document.getElementById('regenerateBtn');
const imageLightbox = document.getElementById('imageLightbox');
const lightboxImage = document.getElementById('lightboxImage');
const lightboxDownload = document.getElementById('lightboxDownload');
const lightboxClose = document.getElementById('lightboxClose');
const lightboxPrev = document.getElementById('lightboxPrev');
const lightboxNext = document.getElementById('lightboxNext');

// Estado do resultado da geração
let currentCarouselIndex = 0;
let carouselImages = [];

// Elementos Phase 2 & 3 (Guarda-Roupa & Avatar)
const saveAvatarBtn = document.getElementById('saveAvatarBtn');
const saveWardrobeBtn = document.getElementById('saveWardrobeBtn');
const avatarGallery = document.getElementById('avatar-gallery');
const wardrobeGallery = document.getElementById('wardrobe-gallery');

// Tabs
const tabAvatarUpload = document.getElementById('tab-avatar-upload');
const tabAvatarSaved = document.getElementById('tab-avatar-saved');
const tabAvatarManequin = document.getElementById('tab-avatar-manequin');
const sectionAvatarUpload = document.getElementById('section-avatar-upload');
const sectionAvatarSaved = document.getElementById('section-avatar-saved');
const sectionAvatarManequin = document.getElementById('section-avatar-manequin');
const tabWardrobeUpload = document.getElementById('tab-wardrobe-upload');
const tabWardrobeSaved = document.getElementById('tab-wardrobe-saved');
const sectionWardrobeUpload = document.getElementById('section-wardrobe-upload');
const sectionWardrobeSaved = document.getElementById('section-wardrobe-saved');

// Modais
const notificationModal = document.getElementById('notificationModal');
const notificationTitle = document.getElementById('notificationTitle');
const notificationMessage = document.getElementById('notificationMessage');
const confirmModal = document.getElementById('confirmModal');
const confirmMessage = document.getElementById('confirmMessage');
const confirmSuccessBtn = document.getElementById('confirmSuccessBtn');
const confirmCancelBtn = document.getElementById('confirmCancelBtn');

// Closet, Avatar & History Full Views
const wardrobeFullView = document.getElementById('wardrobeFullView');
const fullWardrobeGrid = document.getElementById('full-wardrobe-grid');
const addClosetItemBtn = document.getElementById('addClosetItemBtn');
const inputClosetAdd = document.getElementById('input-closet-add');

const avatarFullView = document.getElementById('avatarFullView');
const fullAvatarGrid = document.getElementById('full-avatar-grid');
const addAvatarBtn = document.getElementById('addAvatarBtn');
const inputAvatarAdd = document.getElementById('input-avatar-add');

const historyFullView = document.getElementById('historyFullView');
const fullHistoryGrid = document.getElementById('full-history-grid');

// Estado Global
let fileMain = null;
let fileRef = null;
const AVATAR_LIMIT = 3;
const ANON_LIMIT = window.IS_TOTEM ? 999999 : 3; // Totem: sem limite anônimo

// Totem: seleção múltipla de peças do catálogo. Independente do fileRef (seleção única do closet B2C).
const CATALOGO_LIMITES = { top: 2, bottom: 1, calcado: 1, acessorio: 1 };
const CATALOGO_MAX_TOTAL = 5;
let selectedPecas = []; // [{ sku, nome, categoria, imagem_url, ... }] na ordem em que foram tocadas

// --- CUSTOM ALERTS ---
function showAlert(message, title = 'Aviso') {
    if (!notificationModal) return alert(message);
    notificationTitle.textContent = title;
    notificationMessage.textContent = message;
    notificationModal.classList.remove('hidden');
    notificationModal.classList.add('flex');
}

function showConfirm(message, title = 'Tem certeza?') {
    if (!confirmModal) return Promise.resolve(confirm(message));
    return new Promise((resolve) => {
        confirmMessage.textContent = message;
        const cTitle = document.getElementById('confirmTitle');
        if (cTitle) cTitle.textContent = title;
        confirmModal.classList.remove('hidden');
        confirmModal.classList.add('flex');
        const end = (res) => {
            confirmModal.classList.add('hidden');
            confirmSuccessBtn.onclick = null;
            confirmCancelBtn.onclick = null;
            resolve(res);
        };
        confirmSuccessBtn.onclick = () => end(true);
        confirmCancelBtn.onclick = () => end(false);
    });
}

// --- LOGICA DO ROLETE (WHEEL PICKER) ---
const wheelModal = document.getElementById('wheelPickerModal');
const summaryContexto = document.getElementById('summary-contexto');
const summaryMomento = document.getElementById('summary-momento');
const summaryClima = document.getElementById('summary-clima');
const summaryFormalidade = document.getElementById('summary-formalidade');
const summaryEstilo = document.getElementById('summary-estilo');

const currentWheelSelection = { momento: 'Dia', clima: 'Calor', formalidade: '1', estilo: 'Old Money' };

function openWheelPicker() {
    if (!wheelModal) return;
    wheelModal.classList.remove('hidden');
    // Sincronizar roletes com estado atual ao abrir
    syncWheel('wheel-momento', currentWheelSelection.momento);
    syncWheel('wheel-clima', currentWheelSelection.clima);
    syncWheel('wheel-formalidade', currentWheelSelection.formalidade);
    syncWheel('wheel-estilo', currentWheelSelection.estilo);
}

function closeWheelPicker() {
    if (wheelModal) wheelModal.classList.add('hidden');
}

function syncWheel(id, val) {
    const el = document.getElementById(id);
    if (!el) return;
    const item = Array.from(el.children).find(c => c.getAttribute('data-val') === val);
    if (item) {
        el.scrollTop = item.offsetTop - el.offsetTop - 80; // Centraliza aprox.
    }
}

function confirmWheelSelection() {
    const m = getCenterValue('wheel-momento');
    const c = getCenterValue('wheel-clima');
    const f = getCenterValue('wheel-formalidade');
    const e = getCenterValue('wheel-estilo');

    if (m) currentWheelSelection.momento = m;
    if (c) currentWheelSelection.clima = c;
    if (f) currentWheelSelection.formalidade = f;
    if (e) currentWheelSelection.estilo = e;

    // Atualizar os resumos na interface
    if (summaryMomento) summaryMomento.innerText = currentWheelSelection.momento;
    if (summaryClima) summaryClima.innerText = currentWheelSelection.clima;
    if (summaryFormalidade) summaryFormalidade.innerText = currentWheelSelection.formalidade;
    if (summaryEstilo) summaryEstilo.innerText = currentWheelSelection.estilo;

    saveFormState();
    closeWheelPicker();
    updateGenerateState();
}

window.openWheelPicker = openWheelPicker;
window.closeWheelPicker = closeWheelPicker;
window.confirmWheelSelection = confirmWheelSelection;
window.filterManequin = filterManequin;
window.setManequin = setManequin;

// --- TOTEM: SELETOR ÚNICO DE OCASIÃO ---
// Substitui as 4 rodas. Cada ocasião fixa formalidade; momento/clima/estilo ficam fixos no prompt.
// "Estilo: Old Money" é obrigatório: é o único ramo do Switch do n8n com as 3 variações ligadas.
const OCASIOES = {
    'Casual': { formalidade: '1', momento: 'Dia', clima: 'Ameno' },
    'Trabalho': { formalidade: '2', momento: 'Dia', clima: 'Ameno' },
    'Encontro': { formalidade: '2', momento: 'Noite', clima: 'Ameno' },
    'Evento': { formalidade: '3', momento: 'Noite', clima: 'Ameno' },
};
const TOTEM_ESTILO = 'Old Money';
let ocasiaoSelecionada = localStorage.getItem('totem_ocasiao') || 'Casual';

function setOcasiao(nome) {
    if (!OCASIOES[nome]) return;
    ocasiaoSelecionada = nome;
    localStorage.setItem('totem_ocasiao', nome);
    document.querySelectorAll('[data-ocasiao]').forEach(btn => {
        const on = btn.dataset.ocasiao === nome;
        btn.className = on
            ? 'px-4 py-3 rounded-xl text-xs font-bold uppercase tracking-widest bg-primary text-white transition-all'
            : 'px-4 py-3 rounded-xl text-xs font-bold uppercase tracking-widest bg-bg text-muted hover:bg-gray-100 transition-all';
    });
}
window.setOcasiao = setOcasiao;

// --- PERSISTÊNCIA DE ESTADO ---
function saveFormState() {
    const state = {
        wheel: currentWheelSelection,
        fileRefName: fileRefName?.textContent,
        lastGenTime: localStorage.getItem('last_gen_attempt')
    };
    localStorage.setItem('ailooks_form_state', JSON.stringify(state));
}

function loadFormState() {
    const saved = localStorage.getItem('ailooks_form_state');
    if (!saved) return;
    try {
        const state = JSON.parse(saved);
        Object.assign(currentWheelSelection, state.wheel);
        if (summaryMomento) summaryMomento.innerText = currentWheelSelection.momento;
        if (summaryClima) summaryClima.innerText = currentWheelSelection.clima;
        if (summaryFormalidade) summaryFormalidade.innerText = currentWheelSelection.formalidade;
        if (summaryEstilo) summaryEstilo.innerText = currentWheelSelection.estilo;
        if (fileRefName && state.fileRefName) fileRefName.textContent = state.fileRefName;
    } catch (e) { console.error("Erro ao carregar estado salvo", e); }
}

// Aviso ao sair se estiver gerando
window.onbeforeunload = function () {
    if (loadingOverlay && !loadingOverlay.classList.contains('hidden')) {
        return "Sua geração está em andamento. Se sair agora, poderá perder o resultado.";
    }
};
function updateVisuals(el) {
    const center = el.scrollTop + el.offsetHeight / 2;
    Array.from(el.querySelectorAll('.wheel-item')).forEach(child => {
        const childCenter = child.offsetTop - el.offsetTop + child.offsetHeight / 2;
        const dist = Math.abs(childCenter - center);
        const ratio = Math.max(0, 1 - dist / 110);
        child.style.opacity = 0.3 + (ratio * 0.7);
        child.style.transform = `scale(${0.8 + (ratio * 0.2)}) rotateX(${(childCenter - center) / 1.5}deg)`;
    });
}

function getCenterValue(id) {
    const el = document.getElementById(id);
    if (!el) return null;
    const center = el.scrollTop + el.offsetHeight / 2;
    let closest = null;
    let minDiff = Infinity;

    Array.from(el.querySelectorAll('.wheel-item')).forEach(child => {
        const val = child.getAttribute('data-val');
        const childCenter = child.offsetTop - el.offsetTop + child.offsetHeight / 2;
        const diff = Math.abs(childCenter - center);
        if (diff < minDiff) {
            minDiff = diff;
            closest = val;
        }
    });
    return closest;
}

// Adicionar ouvintes de scroll para efeito visual em tempo real
['wheel-momento', 'wheel-clima', 'wheel-formalidade', 'wheel-estilo'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.onscroll = () => updateVisuals(el);
});

// --- CLOSET DIGITAL ---
function openCloset() {
    const modal = document.getElementById('wardrobeFullView');
    if (!modal) return;
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    loadFullWardrobe();
}
window.openCloset = openCloset;

async function loadFullWardrobe() {
    if (!window.supabaseClient || !fullWardrobeGrid) return;
    fullWardrobeGrid.innerHTML = '<div class="col-span-full py-20 text-center animate-pulse text-muted">Carregando seu closet...</div>';

    const { data, error } = await window.supabaseClient.from('user_wardrobe').select('*').order('created_at', { ascending: false });
    if (error) {
        fullWardrobeGrid.innerHTML = '<p class="col-span-full text-center py-20">Erro ao carregar.</p>';
        return;
    }

    fullWardrobeGrid.innerHTML = data.length ? '' : '<p class="col-span-full text-center py-20 italic">Seu closet está vazio. Clique no botão acima para adicionar peças!</p>';
    data.forEach(item => {
        const div = document.createElement('div');
        div.className = 'group relative bg-white rounded-2xl overflow-hidden shadow-sm aspect-[3/4] cursor-pointer border border-gray-100';
        div.innerHTML = `
            <img src="${item.image_url}" class="w-full h-full object-cover transition-transform group-hover:scale-105">
            <div class="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-2">
                <button class="bg-white text-primary px-4 py-1.5 rounded-full text-[10px] font-bold uppercase use-btn">Usar Peça</button>
                <button class="bg-red-500 text-white p-1.5 rounded-full delete-full-btn"><svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button>
            </div>`;
        div.onclick = (e) => {
            if (e.target.closest('.delete-full-btn')) { deleteWardrobeItem(item.id, item.image_url, true); return; }
            fileRef = item.image_url; previewRef.src = item.image_url; previewRef.classList.remove('hidden'); if (iconRef) iconRef.classList.add('hidden'); removeRef.classList.remove('hidden'); if (fileRefName) fileRefName.textContent = "Peça do Closet"; updateGenerateState(); wardrobeFullView.classList.add('hidden');
            switchTab('wardrobe', 'upload');
        };
        fullWardrobeGrid.appendChild(div);
    });
}

// --- AVATAR MANAGER ---
function openAvatarManager() {
    const modal = document.getElementById('avatarFullView');
    if (!modal) return;
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    loadFullAvatars();
}
window.openAvatarManager = openAvatarManager;

async function loadFullAvatars() {
    if (!window.supabaseClient || !fullAvatarGrid) return;
    fullAvatarGrid.innerHTML = '<div class="col-span-full py-20 text-center animate-pulse text-muted">Carregando seus bonecos...</div>';

    const { data, error } = await window.supabaseClient.from('user_avatars').select('*').order('created_at', { ascending: false });
    if (error) {
        fullAvatarGrid.innerHTML = '<p class="col-span-full text-center py-20">Erro ao carregar.</p>';
        return;
    }

    fullAvatarGrid.innerHTML = data.length ? '' : '<p class="col-span-full text-center py-20 italic">Você não tem bonecos salvos. Clique no botão acima para adicionar!</p>';
    data.forEach(item => {
        const div = document.createElement('div');
        div.className = 'group relative bg-white rounded-2xl overflow-hidden shadow-sm aspect-[3/4] cursor-pointer border border-gray-100';
        div.innerHTML = `
            <img src="${item.image_url}" class="w-full h-full object-cover transition-transform group-hover:scale-105">
            <div class="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-2">
                <button class="bg-white text-primary px-4 py-1.5 rounded-full text-[10px] font-bold uppercase use-btn">Usar Boneco</button>
                <button class="bg-red-500 text-white p-1.5 rounded-full delete-full-btn"><svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button>
            </div>`;
        div.onclick = (e) => {
            if (e.target.closest('.delete-full-btn')) { deleteAvatar(item.id, item.image_url, true); return; }
            fileMain = item.image_url; previewMain.src = item.image_url; previewMain.classList.remove('hidden'); if (placeholderMain) placeholderMain.classList.add('hidden'); removeMain.classList.remove('hidden'); updateGenerateState(); avatarFullView.classList.add('hidden');
            switchTab('avatar', 'upload');
        };
        fullAvatarGrid.appendChild(div);
    });
}

// --- HISTORY MANAGER ---
function openHistory() {
    if (!historyFullView) return;
    historyFullView.classList.remove('hidden');
    historyFullView.classList.add('flex');
    loadHistory();
}
window.openHistory = openHistory;

async function loadHistory() {
    if (!window.supabaseClient || !fullHistoryGrid) return;
    fullHistoryGrid.innerHTML = '<div class="col-span-full py-20 text-center animate-pulse text-muted">Carregando seu histórico...</div>';

    const { data, error } = await window.supabaseClient.from('user_history').select('*').order('created_at', { ascending: false });
    if (error) {
        fullHistoryGrid.innerHTML = '<p class="col-span-full text-center py-20">Erro ao carregar histórico.</p>';
        return;
    }

    fullHistoryGrid.innerHTML = data.length ? '' : '<p class="col-span-full text-center py-20 italic">Nenhuma geração encontrada. Comece a criar para ver suas fotos aqui!</p>';
    data.forEach(item => {
        const date = new Date(item.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
        const div = document.createElement('div');
        div.className = 'group flex flex-col bg-white rounded-2xl overflow-hidden shadow-sm border border-gray-100 hover:shadow-xl transition-all';
        div.innerHTML = `
            <div class="relative aspect-square overflow-hidden bg-gray-50">
                <img src="${item.image_url}" class="w-full h-full object-contain transition-transform group-hover:scale-105">
                <div class="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
                    <a href="${item.image_url}" download class="bg-white text-primary p-2 rounded-full hover:bg-black hover:text-white transition-colors">
                        <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                    </a>
                    <button class="bg-red-500 text-white p-2 rounded-full delete-history-btn hover:bg-black transition-colors">
                        <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                    </button>
                </div>
            </div>
            <div class="p-4 bg-white">
                <p class="text-[10px] text-muted uppercase font-bold tracking-widest mb-1">${date}</p>
                <p class="text-xs text-primary line-clamp-2 italic leading-relaxed">"${item.prompt || 'Sem descrição'}"</p>
            </div>`;
        div.querySelector('.delete-history-btn').onclick = () => deleteHistoryItem(item.id, item.image_url);
        fullHistoryGrid.appendChild(div);
    });
}

async function deleteHistoryItem(id, url) {
    if (await showConfirm("Remover esta geração do histórico permanentemente?")) {
        try {
            const path = url.split('/public/history/')[1];
            await window.supabaseClient.from('user_history').delete().eq('id', id);
            if (path) await window.supabaseClient.storage.from('history').remove([path]);
            loadHistory();
        } catch (e) { showAlert("Erro ao deletar."); }
    }
}

// --- UTILITÁRIOS ---
function updateGenerateState() {
    const temPeca = selectedPecas.length > 0 || fileRef !== null;
    const can = (fileMain !== null && temPeca);
    if (generateBtn) {
        generateBtn.disabled = !can;
        generateBtn.classList.toggle('opacity-50', !can);
    }
}

// --- CONFIGURAÇÃO DE MANEQUINS ---
const MANEQUIN_URLS = {
    male_athletic: 'manequins/male_athletic.png',
    male_average: 'manequins/male_average.png',
    male_robust: 'manequins/male_robust.png',
    female_athletic: 'manequins/female_athletic.png',
    female_average: 'manequins/female_average.png',
    female_robust: 'manequins/female_robust.png'
};

// Injetar caminhos dos artifacts se disponíveis
window.ManequinPaths = {};

function initManequins(paths) {
    window.ManequinPaths = paths;
    Object.keys(paths).forEach(key => {
        const img = document.getElementById(`img_${key}`);
        if (img) img.src = paths[key];
    });
}

function filterManequin(gender) {
    const btnM = document.getElementById('btn-manequin-male');
    const btnF = document.getElementById('btn-manequin-female');
    const gridM = document.getElementById('grid-manequin-male');
    const gridF = document.getElementById('grid-manequin-female');

    if (gender === 'male') {
        btnM.className = 'flex-1 py-1.5 text-[10px] font-bold uppercase tracking-widest bg-primary text-white rounded-lg transition-all';
        btnF.className = 'flex-1 py-1.5 text-[10px] font-bold uppercase tracking-widest bg-gray-100 text-muted rounded-lg hover:bg-gray-200 transition-all';
        gridM.classList.remove('hidden');
        gridF.classList.add('hidden');
    } else {
        btnF.className = 'flex-1 py-1.5 text-[10px] font-bold uppercase tracking-widest bg-primary text-white rounded-lg transition-all';
        btnM.className = 'flex-1 py-1.5 text-[10px] font-bold uppercase tracking-widest bg-gray-100 text-muted rounded-lg hover:bg-gray-200 transition-all';
        gridF.classList.remove('hidden');
        gridM.classList.add('hidden');
    }
}

async function setManequin(key) {
    const url = window.ManequinPaths[key] || MANEQUIN_URLS[key];
    try {
        const response = await fetch(url);
        const blob = await response.blob();
        fileMain = new File([blob], `${key}.png`, { type: 'image/png' });
        previewMain.src = url;
        previewMain.classList.remove('hidden');
        placeholderMain?.classList.add('hidden');
        removeMain?.classList.remove('hidden');
        saveAvatarBtn?.classList.add('hidden'); // Não salva manequim genérico nos avatares
        updateGenerateState();
        switchTab('avatar', 'upload');
    } catch (e) {
        console.error("Erro ao carregar manequim:", e);
        showAlert("Erro ao carregar o manequim selecionado.");
    }
}

function handleFileSelection(file, type) {
    if (!file) return;
    const url = URL.createObjectURL(file);
    if (type === 'main') {
        fileMain = file; previewMain.src = url; previewMain.classList.remove('hidden'); placeholderMain?.classList.add('hidden'); removeMain?.classList.remove('hidden');
        if (saveAvatarBtn) saveAvatarBtn.classList.remove('hidden');
    } else {
        fileRef = file; previewRef.src = url; previewRef.classList.remove('hidden'); iconRef?.classList.add('hidden'); removeRef?.classList.remove('hidden');
        if (fileRefName) fileRefName.textContent = file.name;
        if (saveWardrobeBtn) saveWardrobeBtn.classList.remove('hidden');
    }
    updateGenerateState();
}

// --- SUPABASE OPS ---
async function uploadToSupabase(file, bucket) {
    const user = (await window.supabaseClient.auth.getUser()).data.user;
    const fileName = `${user.id}/${Date.now()}.${file.name?.split('.').pop() || 'png'}`;
    await window.supabaseClient.storage.from(bucket).upload(fileName, file);
    return window.supabaseClient.storage.from(bucket).getPublicUrl(fileName).data.publicUrl;
}

async function saveAvatar() {
    try {
        saveAvatarBtn.disabled = true;
        const originalText = saveAvatarBtn.textContent;
        saveAvatarBtn.innerHTML = '<span class="animate-spin mr-2">...</span> Salvando...';

        const { count } = await window.supabaseClient.from('user_avatars').select('*', { count: 'exact', head: true });
        if (count >= AVATAR_LIMIT) {
            showAlert(`Limite de ${AVATAR_LIMIT} bonecos atingido.`);
            saveAvatarBtn.innerHTML = originalText;
            saveAvatarBtn.disabled = false;
            return;
        }

        const url = await uploadToSupabase(fileMain, 'avatars');
        await window.supabaseClient.from('user_avatars').insert([{
            user_id: (await window.supabaseClient.auth.getUser()).data.user.id,
            image_url: url
        }]);

        showAlert("Boneco salvo com sucesso!", "Sucesso");
        loadAvatars();
        saveAvatarBtn.classList.add('hidden');
    } catch (e) {
        console.error("Save Avatar Error:", e);
        showAlert("Erro ao salvar boneco.");
    } finally {
        saveAvatarBtn.disabled = false;
    }
}

async function saveWardrobe() {
    try {
        saveWardrobeBtn.disabled = true;
        const originalText = saveWardrobeBtn.textContent;
        saveWardrobeBtn.innerHTML = '<span class="animate-spin mr-2">...</span> Salvando...';

        const url = await uploadToSupabase(fileRef, 'wardrobe');
        await window.supabaseClient.from('user_wardrobe').insert([{
            user_id: (await window.supabaseClient.auth.getUser()).data.user.id,
            image_url: url
        }]);

        showAlert("Peça salva no closet!", "Sucesso");
        loadWardrobe();
        saveWardrobeBtn.classList.add('hidden');
    } catch (e) {
        console.error("Save Wardrobe Error:", e);
        showAlert("Erro ao salvar peça no closet.");
    } finally {
        saveWardrobeBtn.disabled = false;
    }
}

async function handleClosetAdd(file) {
    if (!file) return;
    try {
        addClosetItemBtn.disabled = true;
        addClosetItemBtn.innerHTML = '<span class="animate-spin text-xs">...</span>';
        const url = await uploadToSupabase(file, 'wardrobe');
        await window.supabaseClient.from('user_wardrobe').insert([{ user_id: (await window.supabaseClient.auth.getUser()).data.user.id, image_url: url }]);
        showAlert("Nova peça adicionada!", "Sucesso");
        loadFullWardrobe(); loadWardrobe();
    } catch (err) { showAlert("Erro ao adicionar."); }
    finally { addClosetItemBtn.disabled = false; addClosetItemBtn.innerHTML = '<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-width="2" d="M12 4v16m8-8H4" /></svg> Adicionar Peça'; }
}

async function handleAvatarAddInManager(file) {
    if (!file) return;
    try {
        addAvatarBtn.disabled = true;
        addAvatarBtn.innerHTML = '<span class="animate-spin text-xs">...</span>';
        const { count } = await window.supabaseClient.from('user_avatars').select('*', { count: 'exact', head: true });
        if (count >= AVATAR_LIMIT) return showAlert(`Limite atingido.`);
        const url = await uploadToSupabase(file, 'avatars');
        await window.supabaseClient.from('user_avatars').insert([{ user_id: (await window.supabaseClient.auth.getUser()).data.user.id, image_url: url }]);
        showAlert("Novo boneco adicionado!", "Sucesso");
        loadFullAvatars(); loadAvatars();
    } catch (err) { showAlert("Erro ao adicionar."); }
    finally { addAvatarBtn.disabled = false; addAvatarBtn.innerHTML = '<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-width="2" d="M12 4v16m8-8H4" /></svg> Adicionar Boneco'; }
}

async function deleteAvatar(id, url, isFull = false) {
    if (await showConfirm("Excluir permanentemente?")) {
        try {
            const path = url.split('/public/avatars/')[1];
            await window.supabaseClient.from('user_avatars').delete().eq('id', id);
            if (path) await window.supabaseClient.storage.from('avatars').remove([path]);
            if (isFull) loadFullAvatars(); loadAvatars();
            if (fileMain === url) removeMain.click();
        } catch (e) { }
    }
}

async function deleteWardrobeItem(id, url, isFull = false) {
    if (await showConfirm("Excluir do closet?")) {
        try {
            const path = url.split('/public/wardrobe/')[1];
            await window.supabaseClient.from('user_wardrobe').delete().eq('id', id);
            if (path) await window.supabaseClient.storage.from('wardrobe').remove([path]);
            if (isFull) loadFullWardrobe(); loadWardrobe();
            if (fileRef === url) removeRef.click();
        } catch (e) { }
    }
}

async function loadAvatars() {
    if (!window.supabaseClient || !avatarGallery) return;
    const { data } = await window.supabaseClient.from('user_avatars').select('*').order('created_at', { ascending: false });
    avatarGallery.innerHTML = data?.length ? '' : '<p class="col-span-full py-4 text-center text-[10px] text-muted italic">Vazio.</p>';
    data?.forEach(item => {
        const div = document.createElement('div');
        div.className = 'aspect-[3/4] relative rounded-lg overflow-hidden cursor-pointer border-2 border-transparent hover:border-secondary transition-all group';
        div.innerHTML = `<img src="${item.image_url}" class="w-full h-full object-cover">
            <button class="absolute top-1 right-1 bg-red-500 text-white p-1 rounded-full opacity-0 group-hover:opacity-100 delete-btn"><svg class="h-3 w-3" fill="currentColor" viewBox="0 0 20 20"><path d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"/></svg></button>`;
        div.onclick = (e) => {
            if (e.target.closest('.delete-btn')) { deleteAvatar(item.id, item.image_url); return; }
            fileMain = item.image_url; previewMain.src = item.image_url; previewMain.classList.remove('hidden'); placeholderMain?.classList.add('hidden'); removeMain?.classList.remove('hidden'); updateGenerateState();
            switchTab('avatar', 'upload');
        };
        avatarGallery.appendChild(div);
    });
}

async function loadWardrobe() {
    if (!window.supabaseClient || !wardrobeGallery) return;
    const { data } = await window.supabaseClient.from('user_wardrobe').select('*').order('created_at', { ascending: false });
    wardrobeGallery.innerHTML = data?.length ? '' : '<p class="col-span-full py-4 text-center text-[10px] text-muted italic">Vazio.</p>';
    data?.forEach(item => {
        const div = document.createElement('div');
        div.className = 'aspect-square relative rounded-lg overflow-hidden cursor-pointer border-2 border-transparent hover:border-secondary transition-all group';
        div.innerHTML = `<img src="${item.image_url}" class="w-full h-full object-cover">
            <button class="absolute top-1 right-1 bg-red-500 text-white p-1 rounded-full opacity-0 group-hover:opacity-100 delete-btn"><svg class="h-3 w-3" fill="currentColor" viewBox="0 0 20 20"><path d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"/></svg></button>`;
        div.onclick = (e) => {
            if (e.target.closest('.delete-btn')) { deleteWardrobeItem(item.id, item.image_url); return; }
            fileRef = item.image_url; previewRef.src = item.image_url; previewRef.classList.remove('hidden'); iconRef?.classList.add('hidden'); removeRef?.classList.remove('hidden'); if (fileRefName) fileRefName.textContent = "Peça Salva"; updateGenerateState();
            switchTab('wardrobe', 'upload');
        };
        wardrobeGallery.appendChild(div);
    });
}

// --- TOTEM: CATÁLOGO DA LOJA ---
// Mesma lógica do closet (loadWardrobe): clicar numa peça seta fileRef com a URL da imagem.
// Fonte: tabela catalogo_loja (leitura pública). Fallback: catalogo.json local, para o demo não depender do banco.
const catalogoGrid = document.getElementById('catalogo-grid');
const CATEGORIA_LABEL = { top: 'Parte de cima', bottom: 'Parte de baixo', calcado: 'Calçados', acessorio: 'Acessórios' };
const CATEGORIA_ORDEM = ['top', 'bottom', 'calcado', 'acessorio'];

async function fetchCatalogo() {
    if (window.supabaseClient) {
        try {
            let q = window.supabaseClient.from('catalogo_loja').select('*').eq('ativo', true)
                .order('categoria').order('ordem').order('nome');
            if (window.TOTEM_LOJA_ID) q = q.eq('loja_id', window.TOTEM_LOJA_ID);
            const { data, error } = await q;
            if (!error && data?.length) return { items: data, fonte: 'supabase' };
            if (error) console.warn('catalogo_loja indisponível, usando catalogo.json:', error.message);
        } catch (e) { console.warn('Erro ao ler catalogo_loja:', e); }
    }
    const r = await fetch('catalogo.json', { cache: 'no-store' });
    return { items: await r.json(), fonte: 'local' };
}

// Toque na peça: marca / desmarca. Teto por categoria (CATALOGO_LIMITES) com comportamento de troca:
// ao estourar o teto, sai a peça mais antiga daquela categoria e entra a nova. Sem alert.
function toggleSelecionarPeca(item, card) {
    const idx = selectedPecas.findIndex(p => p.sku === item.sku);
    if (idx !== -1) {
        selectedPecas.splice(idx, 1); // já estava selecionada -> desmarca
    } else {
        const limite = CATALOGO_LIMITES[item.categoria] ?? 1;
        const mesmaCat = selectedPecas.filter(p => p.categoria === item.categoria); // preserva ordem de seleção
        if (mesmaCat.length >= limite) {
            const maisAntiga = mesmaCat[0];
            selectedPecas.splice(selectedPecas.findIndex(p => p.sku === maisAntiga.sku), 1);
            flashTroca(card);
        }
        if (selectedPecas.length >= CATALOGO_MAX_TOTAL) selectedPecas.shift(); // guarda: os tetos somam 5, não deve acontecer
        selectedPecas.push(item);
    }
    syncCatalogoVisual();
    renderSelectedStrip();
    updateGenerateState();
}

function flashTroca(card) {
    if (!card || !card.animate) return;
    card.animate([{ transform: 'scale(1.06)' }, { transform: 'scale(1)' }], { duration: 220, easing: 'ease-out' });
}

function findCard(sku) {
    return Array.from(document.querySelectorAll('.catalogo-card')).find(c => c.dataset.sku === sku) || null;
}

function syncCatalogoVisual() {
    document.querySelectorAll('.catalogo-card').forEach(c => {
        const on = selectedPecas.some(p => p.sku === c.dataset.sku);
        ['ring-2', 'ring-secondary', 'border-secondary'].forEach(k => c.classList.toggle(k, on));
        c.querySelector('.catalogo-check')?.classList.toggle('hidden', !on);
    });
}

const pecasCounterEl = document.getElementById('pecas-counter');
const pecasSelecionadasEl = document.getElementById('pecas-selecionadas');
function renderSelectedStrip() {
    if (pecasCounterEl) pecasCounterEl.textContent = `${selectedPecas.length} de ${CATALOGO_MAX_TOTAL} peças`;
    if (!pecasSelecionadasEl) return;
    if (selectedPecas.length === 0) {
        pecasSelecionadasEl.innerHTML = '<p class="text-[10px] text-muted italic">Nenhuma peça selecionada ainda.</p>';
        return;
    }
    pecasSelecionadasEl.innerHTML = '';
    selectedPecas.forEach(item => {
        const chip = document.createElement('div');
        chip.className = 'flex items-center gap-2 bg-white border border-gray-200 rounded-full pl-1 pr-2 py-1';
        chip.innerHTML = `<img src="${item.imagem_url}" alt="" class="w-6 h-6 rounded-full object-cover">
            <span class="text-[10px] font-bold text-primary max-w-[110px] truncate">${item.nome}</span>
            <button type="button" class="text-muted hover:text-red-500 text-sm leading-none px-1" aria-label="Remover ${item.nome}">&times;</button>`;
        chip.querySelector('button').onclick = () => toggleSelecionarPeca(item, findCard(item.sku));
        pecasSelecionadasEl.appendChild(chip);
    });
}

// Ordem de envio ao backend: top, bottom, calcado, acessorio. Dentro da mesma categoria mantém a ordem de seleção
// (Array.prototype.sort é estável por spec desde ES2019). image_reference* e pecas_nomes saem desta MESMA lista.
function pecasOrdenadas() {
    const idx = c => { const i = CATEGORIA_ORDEM.indexOf(c); return i === -1 ? CATEGORIA_ORDEM.length : i; };
    return [...selectedPecas].sort((a, b) => idx(a.categoria) - idx(b.categoria));
}

async function loadCatalogo() {
    if (!catalogoGrid) return;
    catalogoGrid.innerHTML = '<div class="py-10 text-center animate-pulse text-muted text-xs uppercase tracking-widest">Carregando catálogo...</div>';
    let items = [], fonte = '';
    try { ({ items, fonte } = await fetchCatalogo()); }
    catch (e) { console.error('Catálogo:', e); catalogoGrid.innerHTML = '<p class="py-6 text-center text-xs text-red-500">Não foi possível carregar o catálogo.</p>'; return; }

    const porCategoria = {};
    items.forEach(it => { (porCategoria[it.categoria] ||= []).push(it); });
    const categorias = [...CATEGORIA_ORDEM.filter(c => porCategoria[c]), ...Object.keys(porCategoria).filter(c => !CATEGORIA_ORDEM.includes(c))];

    catalogoGrid.innerHTML = '';
    categorias.forEach(cat => {
        const sec = document.createElement('div');
        sec.className = 'mb-5';
        sec.innerHTML = `<p class="text-[10px] uppercase tracking-[0.2em] text-muted font-bold mb-2">${CATEGORIA_LABEL[cat] || cat}</p>
            <div class="grid grid-cols-3 sm:grid-cols-4 gap-2"></div>`;
        const grid = sec.querySelector('div');
        porCategoria[cat].forEach(item => {
            const card = document.createElement('div');
            card.className = 'catalogo-card aspect-[3/4] relative rounded-lg overflow-hidden cursor-pointer border-2 border-transparent hover:border-secondary transition-all bg-white';
            const preco = item.preco_centavos ? (item.preco_centavos / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '';
            card.dataset.sku = item.sku;
            const semEstoque = Number(item.estoque) === 0;
            card.innerHTML = `<img src="${item.imagem_url}" alt="${item.nome}" class="w-full h-full object-cover">
                <div class="catalogo-check hidden absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-secondary text-white flex items-center justify-center shadow">
                    <svg class="h-3 w-3" fill="none" stroke="currentColor" stroke-width="3" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" /></svg>
                </div>
                ${semEstoque ? '<span class="absolute top-1.5 left-1.5 bg-white/90 text-[8px] font-bold uppercase tracking-widest text-muted px-1.5 py-0.5 rounded">Sem estoque</span>' : ''}
                <div class="absolute inset-x-0 bottom-0 bg-white/90 px-2 py-1.5">
                    <p class="text-[10px] font-bold text-primary truncate">${item.nome}</p>
                    ${preco ? `<p class="text-[9px] text-muted">${preco}</p>` : ''}
                </div>`;
            card.onclick = () => toggleSelecionarPeca(item, card);
            grid.appendChild(card);
        });
        catalogoGrid.appendChild(sec);
    });
    syncCatalogoVisual();
    renderSelectedStrip();
    if (fonte === 'local') {
        const aviso = document.createElement('p');
        aviso.className = 'text-[9px] text-muted italic text-center mt-1';
        aviso.textContent = 'Catálogo local (catalogo.json). Rode supabase/01_catalogo_loja.sql para usar o banco.';
        catalogoGrid.appendChild(aviso);
    }
}

// Justificativa da IA exibida junto do resultado (o chat está oculto no totem)
const resultJustificativa = document.getElementById('resultJustificativa');
function clearJustificativas() { if (resultJustificativa) { resultJustificativa.innerHTML = ''; resultJustificativa.classList.add('hidden'); } }
function renderJustificativa(texto, numero) {
    if (!resultJustificativa || !texto) return;
    const primeiro = texto.split(/\n\s*\n/).filter(p => p.trim())[0] || texto;
    const div = document.createElement('div');
    div.className = 'bg-bg rounded-xl p-4 text-sm leading-relaxed';
    div.innerHTML = `<p class="text-[10px] uppercase tracking-widest text-secondary font-bold mb-1">Look ${numero}</p><p>${primeiro.replace(/\n/g, '<br>')}</p>`;
    resultJustificativa.appendChild(div);
    resultJustificativa.classList.remove('hidden');
}

// --- EVENTS ---
inputMain?.addEventListener('change', e => handleFileSelection(e.target.files[0], 'main'));
inputRef?.addEventListener('change', e => handleFileSelection(e.target.files[0], 'ref'));
if (removeMain) removeMain.onclick = () => { fileMain = null; previewMain.classList.add('hidden'); placeholderMain?.classList.remove('hidden'); removeMain.classList.add('hidden'); saveAvatarBtn?.classList.add('hidden'); updateGenerateState(); };
if (removeRef) removeRef.onclick = () => { fileRef = null; previewRef.classList.add('hidden'); iconRef?.classList.remove('hidden'); if (fileRefName) fileRefName.textContent = 'Adicionar roupa'; removeRef.classList.add('hidden'); saveWardrobeBtn?.classList.add('hidden'); updateGenerateState(); };
if (resetBtn) resetBtn.onclick = () => {
    removeMain?.click();
    removeRef?.click();
    selectedPecas = [];
    syncCatalogoVisual();
    renderSelectedStrip();
    clearJustificativas();
    if (promptEl) promptEl.value = '';
    resultSection?.classList.add('hidden');
    updateGenerateState();
};

if (addClosetItemBtn) addClosetItemBtn.onclick = () => inputClosetAdd?.click();
if (inputClosetAdd) inputClosetAdd.onchange = e => handleClosetAdd(e.target.files[0]);
if (addAvatarBtn) addAvatarBtn.onclick = () => inputAvatarAdd?.click();
if (inputAvatarAdd) inputAvatarAdd.onchange = e => handleAvatarAddInManager(e.target.files[0]);

if (saveAvatarBtn) saveAvatarBtn.onclick = saveAvatar;
if (saveWardrobeBtn) saveWardrobeBtn.onclick = saveWardrobe;

function switchTab(type, target) {
    const isAv = type === 'avatar';
    const tabU = isAv ? tabAvatarUpload : tabWardrobeUpload;
    const tabS = isAv ? tabAvatarSaved : tabWardrobeSaved;
    const tabM = isAv ? tabAvatarManequin : null;

    const secU = isAv ? sectionAvatarUpload : sectionWardrobeUpload;
    const secS = isAv ? sectionAvatarSaved : sectionWardrobeSaved;
    const secM = isAv ? sectionAvatarManequin : null;

    if (!tabU || !tabS) return;

    // Reset classes
    [tabU, tabS, tabM].filter(Boolean).forEach(t => {
        t.className = 'flex-1 pb-2 text-[8px] md:text-xs font-bold uppercase tracking-wider text-muted border-b-2 border-transparent';
    });
    [secU, secS, secM].filter(Boolean).forEach(s => {
        s.classList.add('hidden');
    });

    // Set active
    if (target === 'upload') {
        tabU.className = 'flex-1 pb-2 text-[8px] md:text-xs font-bold uppercase tracking-wider text-primary border-b-2 border-primary';
        secU.classList.remove('hidden');
    } else if (target === 'saved') {
        tabS.className = 'flex-1 pb-2 text-[8px] md:text-xs font-bold uppercase tracking-wider text-primary border-b-2 border-primary';
        secS.classList.remove('hidden');
        isAv ? loadAvatars() : loadWardrobe();
    } else if (target === 'manequin' && tabM) {
        tabM.className = 'flex-1 pb-2 text-[8px] md:text-xs font-bold uppercase tracking-wider text-primary border-b-2 border-primary';
        secM.classList.remove('hidden');
    }
}

tabAvatarUpload && (tabAvatarUpload.onclick = () => switchTab('avatar', 'upload'));
tabAvatarSaved && (tabAvatarSaved.onclick = () => switchTab('avatar', 'saved'));
tabAvatarManequin && (tabAvatarManequin.onclick = () => switchTab('avatar', 'manequin'));
tabWardrobeUpload && (tabWardrobeUpload.onclick = () => switchTab('wardrobe', 'upload'));
tabWardrobeSaved && (tabWardrobeSaved.onclick = () => switchTab('wardrobe', 'saved'));

// --- GENERATION ---
// URL (catálogo/closet) vira Blob; File/Blob (upload) passa direto.
async function toBlob(src) {
    if (typeof src === 'string') { const r = await fetch(src); return await r.blob(); }
    return src;
}

async function sendGenerate() {
    // Peças do catálogo (totem) ou, no legado B2C, a peça única do closet/upload
    const pecas = selectedPecas.length > 0
        ? pecasOrdenadas()
        : (fileRef ? [{ nome: fileRefName?.textContent?.trim() || 'Peça', imagem_url: fileRef }] : []);
    if (!fileMain || pecas.length === 0) return showAlert("Tire uma foto e escolha ao menos uma peça.");
    const auth = await window.getAuthState();
    if (auth.isAnonymous && parseInt(localStorage.getItem('anon_gen_count') || '0') >= ANON_LIMIT) return document.getElementById('limitModal')?.classList.remove('hidden');

    try {
        localStorage.setItem('last_gen_attempt', Date.now().toString());
        loadingOverlay?.classList.remove('hidden');
        loadingOverlay?.classList.add('flex');

        // Constrói prompt final a partir dos seletores do rolete e opção de armário
        const prioritizeStatus = 'on'; // Fixado como ON conforme solicitado
        // Totem: uma ocasião define o resto. Mantém o formato "Chave: Valor, ..." que o Code node do n8n parseia.
        // "Contexto" já é lido pelo backend (data["contexto"]) mas nunca era enviado pelo B2C.
        const oc = OCASIOES[ocasiaoSelecionada] || OCASIOES['Casual'];
        const finalPrompt = window.IS_TOTEM
            ? `Modo: Gerar Look, Contexto: ${ocasiaoSelecionada}, Momento: ${oc.momento}, Clima: ${oc.clima}, Nível de Formalidade: ${oc.formalidade}, Estilo: ${TOTEM_ESTILO}, Priorizar meu armário: ${prioritizeStatus}`
            : `Modo: Gerar Look, Momento: ${currentWheelSelection.momento}, Clima: ${currentWheelSelection.clima}, Nível de Formalidade: ${currentWheelSelection.formalidade}, Estilo: ${currentWheelSelection.estilo}, Priorizar meu armário: ${prioritizeStatus}`;
        clearJustificativas();

        const fd = new FormData();
        fd.append('image_base', await toBlob(fileMain), 'image_base.png');
        // image_reference, image_reference_2..5 na ordem de pecasOrdenadas(); pecas_nomes sai do mesmo array.
        // nr_imagem = 1 -> fluxo do estilista; > 1 -> fluxo multi-peça (o backend decide).
        for (let i = 0; i < pecas.length; i++) {
            const campo = i === 0 ? 'image_reference' : `image_reference_${i + 1}`;
            fd.append(campo, await toBlob(pecas[i].imagem_url), `image_ref_${i + 1}.png`);
        }
        fd.append('nr_imagem', String(pecas.length));
        fd.append('pecas_nomes', pecas.map(p => p.nome).join('|'));
        fd.append('prompt', finalPrompt);
        fd.append('mode', 'generate');

        console.log("Enviando para Webhook:", webhookUrl);
        const res = await fetch(webhookUrl, { method: 'POST', body: fd });

        if (!res.ok) {
            const errText = await res.text();
            throw new Error(`Servidor retornou erro ${res.status}: ${errText}`);
        }

        // Detecta o tipo de conteúdo para decidir como ler o stream
        const contentType = res.headers.get("content-type") || "";
        console.log("Headers recebidos:", Object.fromEntries(res.headers.entries()));
        console.log("Content-Type detectado:", contentType);

        let blob;
        let finalUrl;

        try {
            if (contentType.toLowerCase().includes("application/json")) {
                console.log("Iniciando processamento JSON...");
                const data = await res.json();

                // Converter para array se não for
                const items = Array.isArray(data) ? data : [data];
                carouselImages = [];

                for (const item of items) {
                    const edited = item.edited || item.Edited;
                    const justificativa = item.justificativa || item.Justificativa;

                    if (justificativa) {
                        addChatMessage(justificativa, 'ai', true);
                        renderJustificativa(justificativa, carouselImages.length + 1);
                    }

                    if (edited) {
                        const imgUrl = edited.startsWith('http') || edited.startsWith('data:') ? edited : `data:image/png;base64,${edited}`;
                        carouselImages.push(imgUrl);
                    }
                }

                if (carouselImages.length > 0) {
                    renderResultGrid(carouselImages);
                    // Salvar no histórico (apenas a primeira se houver limitação de banco, ou todas se preferir)
                    if (!auth.isAnonymous && auth.session) {
                        for (const imgUrl of carouselImages) {
                            try {
                                const r = await fetch(imgUrl);
                                const b = await r.blob();
                                const historyUrl = await uploadToSupabase(b, 'history');
                                await window.supabaseClient.from('user_history').insert([{
                                    user_id: auth.session.user.id,
                                    prompt: promptEl?.value || 'Geração via IA',
                                    image_url: historyUrl
                                }]);
                            } catch (hErr) { console.error("Erro ao salvar no histórico:", hErr); }
                        }
                    }
                }
            } else {
                console.log("Iniciando processamento BINÁRIO...");
                const hJust = res.headers.get("x-justificativa") || res.headers.get("justificativa");
                if (hJust) {
                    const decoded = decodeURIComponent(hJust.replace(/\+/g, ' '));
                    addChatMessage(decoded, 'ai', true);
                    renderJustificativa(decoded, 1);
                }

                const blob = await res.blob();
                if (blob.size === 0) throw new Error("A IA retornou um arquivo vazio.");

                const finalUrl = URL.createObjectURL(blob);
                carouselImages = [finalUrl];
                renderResultGrid(carouselImages);

                if (!auth.isAnonymous && auth.session) {
                    const historyUrl = await uploadToSupabase(blob, 'history');
                    await window.supabaseClient.from('user_history').insert([{
                        user_id: auth.session.user.id,
                        prompt: promptEl?.value || 'Geração via IA',
                        image_url: historyUrl
                    }]);
                }
            }
        } catch (err) {
            console.error("Erro crítico no processamento da resposta:", err);
            throw err;
        }

        console.log("Exibindo seção de resultado (#resultSection)");
        resultSection.classList.remove('hidden');

        // Permanentemente Salva no Histórico se estiver logado
        if (!auth.isAnonymous && auth.session && blob) {
            try {
                const historyUrl = await uploadToSupabase(blob, 'history');
                await window.supabaseClient.from('user_history').insert([{
                    user_id: auth.session.user.id,
                    prompt: promptEl?.value || 'Geração via IA',
                    image_url: historyUrl
                }]);
            } catch (historyErr) { console.error("History Save Error:", historyErr); }
        }

        if (auth.isAnonymous) {
            const count = (parseInt(localStorage.getItem('anon_gen_count') || '0') + 1);
            localStorage.setItem('anon_gen_count', count.toString());
        }
    } catch (e) {
        console.error("Erro na Geração:", e);
        showAlert(e.message || "Erro na conexão com o servidor de IA.", "Falha na Geração");
    } finally {
        loadingOverlay?.classList.add('hidden');
        updateGenerateState();
    }
}
function renderResultGrid(images) {
    if (!resultGrid || images.length === 0) return;

    resultGrid.innerHTML = '';

    images.forEach((imgUrl, index) => {
        const card = document.createElement('div');
        card.className = 'relative group rounded-2xl overflow-hidden bg-gray-100 shadow-inner cursor-pointer';
        card.innerHTML = `
            <img src="${imgUrl}" class="w-full h-auto object-contain max-h-[420px] rounded-2xl" />
            <a href="${imgUrl}" download
                class="absolute top-2 right-2 p-2 bg-white/90 rounded-full shadow-lg opacity-90 hover:opacity-100 transition-opacity z-10"
                title="Baixar imagem" onclick="event.stopPropagation()">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-primary" viewBox="0 0 20 20" fill="currentColor">
                    <path fill-rule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clip-rule="evenodd" />
                </svg>
            </a>`;
        card.onclick = () => openLightbox(index);
        resultGrid.appendChild(card);
    });

    resultSection.classList.remove('hidden');
    resultSection.scrollIntoView({ behavior: 'smooth' });
}

function openLightbox(index) {
    if (!imageLightbox || carouselImages.length === 0) return;
    currentCarouselIndex = index;
    updateLightbox();
    imageLightbox.classList.remove('hidden');
    imageLightbox.classList.add('flex');
}

function closeLightbox() {
    if (!imageLightbox) return;
    imageLightbox.classList.add('hidden');
    imageLightbox.classList.remove('flex');
}

function updateLightbox() {
    const imgUrl = carouselImages[currentCarouselIndex];
    lightboxImage.src = imgUrl;
    lightboxDownload.href = imgUrl;
    const hasMultiple = carouselImages.length > 1;
    lightboxPrev.classList.toggle('hidden', !hasMultiple);
    lightboxNext.classList.toggle('hidden', !hasMultiple);
}

if (lightboxClose) lightboxClose.onclick = closeLightbox;

if (lightboxPrev) lightboxPrev.onclick = () => {
    currentCarouselIndex = (currentCarouselIndex > 0) ? currentCarouselIndex - 1 : carouselImages.length - 1;
    updateLightbox();
};

if (lightboxNext) lightboxNext.onclick = () => {
    currentCarouselIndex = (currentCarouselIndex < carouselImages.length - 1) ? currentCarouselIndex + 1 : 0;
    updateLightbox();
};

generateBtn && (generateBtn.onclick = sendGenerate);
regenerateBtn && (regenerateBtn.onclick = sendGenerate);

// --- CHAT ---
const chatInput = document.getElementById('chat-input');
const sendChatBtn = document.getElementById('send-chat-btn');
const chatMessagesContainer = document.getElementById('chat-messages');

/**
 * Adiciona uma mensagem ao chat
 * @param {string} content - Texto da mensagem
 * @param {string} sender - 'user' ou 'ai'
 * @param {boolean} isAI - Se é uma mensagem da consultora
 */
function addChatMessage(content, sender, isAI = false) {
    if (!chatMessagesContainer) return;

    const div = document.createElement('div');
    div.className = isAI ? 'flex justify-start mb-4 animate-fade-in' : 'flex justify-end mb-4 animate-fade-in';

    if (isAI) {
        // Divide o conteúdo em parágrafos (considerando \n\n como separador)
        const paragraphs = content.split(/\n\s*\n/).filter(p => p.trim());

        if (paragraphs.length > 1) {
            const firstPara = paragraphs[0];
            const restOfContent = paragraphs.slice(1).join('\n\n');

            div.innerHTML = `
                <div class="bg-white border border-gray-100 text-gray-800 rounded-2xl rounded-tl-none py-3 px-4 text-sm shadow-sm max-w-[85%]">
                    <p class="font-serif font-bold text-gray-900 mb-1">Consultoria AI ✨</p>
                    <div class="leading-relaxed">${firstPara.replace(/\n/g, '<br>')}</div>
                    
                    <div class="hidden-content hidden mt-2 pt-2 border-t border-gray-50 animate-fade-in">
                        <div class="leading-relaxed">${restOfContent.replace(/\n/g, '<br>')}</div>
                    </div>
                    
                    <button class="read-more-btn text-secondary font-bold text-xs mt-2 hover:underline flex items-center gap-1 transition-all">
                        <span>Ler mais...</span>
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                        </svg>
                    </button>
                </div>
            `;

            // Lógica para expandir o conteúdo
            const btn = div.querySelector('.read-more-btn');
            const target = div.querySelector('.hidden-content');
            btn.onclick = () => {
                target.classList.remove('hidden');
                btn.remove();
                // Scroll para garantir que o conteúdo novo seja visto
                chatMessagesContainer.scrollTo({
                    top: chatMessagesContainer.scrollHeight,
                    behavior: 'smooth'
                });
            };
        } else {
            // Mensagem curta (parágrafo único)
            div.innerHTML = `
                <div class="bg-white border border-gray-100 text-gray-800 rounded-2xl rounded-tl-none py-3 px-4 text-sm shadow-sm max-w-[85%]">
                    <p class="font-serif font-bold text-gray-900 mb-1">Consultoria AI ✨</p>
                    <div class="leading-relaxed">${content.replace(/\n/g, '<br>')}</div>
                </div>
            `;
        }
    } else {
        div.innerHTML = `
            <div class="bg-primary text-white rounded-2xl rounded-tr-none py-3 px-4 text-sm shadow-card max-w-[85%]">
                <p class="leading-relaxed">${content}</p>
            </div>
        `;
    }

    chatMessagesContainer.appendChild(div);

    // Scroll suave para o final
    chatMessagesContainer.scrollTo({
        top: chatMessagesContainer.scrollHeight,
        behavior: 'smooth'
    });
}

async function sendChatMessage() {
    const text = chatInput.value.trim();
    if (!text) return;

    addChatMessage(text, 'user');
    chatInput.value = '';

    try {
        const res = await fetch(chatWebhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: text })
        });
        const data = await res.json();
        addChatMessage(data.text || "Ok!", 'ai', true);
    } catch (e) {
        console.error("Erro no chat:", e);
        addChatMessage("Desculpe, tive um problema ao processar sua mensagem. Tente novamente em instantes.", 'ai', true);
    }
}
sendChatBtn && (sendChatBtn.onclick = sendChatMessage);

// Recuperar última geração se for recente (< 5 min)
async function recoverLatestGeneration() {
    const { data } = await window.supabaseClient
        .from('user_history')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(10);

    if (data && data.length > 0) {
        const lastItem = data[0];
        const lastTime = new Date(lastItem.created_at).getTime();
        const now = Date.now();

        // Se a geração foi nos últimos 5 minutos, exibe no topo
        if (now - lastTime < 5 * 60 * 1000) {
            // Agrupar imagens que foram criadas num intervalo de 10 segundos (mesma leva)
            const sameGenerationImages = data
                .filter(item => {
                    const diff = Math.abs(new Date(item.created_at).getTime() - lastTime);
                    return diff < 10000; // 10 segundos
                })
                .map(item => item.image_url);

            carouselImages = sameGenerationImages;
            renderResultGrid(carouselImages);
        }
    }
}

window.addEventListener('auth:change', (e) => {
    const { isAnonymous, session } = e.detail;
    if (!isAnonymous && session) {
        loadAvatars();
        loadWardrobe();
        recoverLatestGeneration();
    }
    const counter = document.getElementById('anonymousCounter');
    if (counter) counter.classList.toggle('hidden', !isAnonymous);
});

loadFormState();
updateGenerateState();

// Totem: catálogo + ocasião entram sem login
if (window.IS_TOTEM) {
    setOcasiao(ocasiaoSelecionada);
    if (sectionWardrobeUpload) sectionWardrobeUpload.style.display = 'none'; // linha de peça única: substituída pela faixa de seleção
    renderSelectedStrip();
    loadCatalogo();
}

// Inicialização de Modelos (Usando caminhos relativos na pasta manequins/)
initManequins({
    male_athletic: 'manequins/male_athletic.png',
    male_average: 'manequins/male_average.png',
    male_robust: 'manequins/male_robust.png',
    female_athletic: 'manequins/female_athletic.png',
    female_average: 'manequins/female_average.png',
    female_robust: 'manequins/female_robust.png'
});
