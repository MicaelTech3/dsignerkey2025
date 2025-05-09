const firebaseConfig = {
    apiKey: "AIzaSyBhj6nv3QcIHyuznWPNM4t_0NjL0ghMwFw",
    authDomain: "dsignertv.firebaseapp.com",
    databaseURL: "https://dsignertv-default-rtdb.firebaseio.com",
    projectId: "dsignertv",
    storageBucket: "dsignertv.firebasestorage.app",
    messagingSenderId: "930311416952",
    appId: "1:930311416952:web:d0e7289f0688c46492d18d"
};

// Inicializa o Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.database();

// Elementos do DOM
const elements = {
    generatorMode: document.getElementById('generator-mode'),
    playerMode: document.getElementById('player-mode'),
    activationKey: document.getElementById('activation-key'),
    viewBtn: document.getElementById('view-btn'),
    exitBtn: document.getElementById('exit-btn'),
    mediaDisplay: document.getElementById('media-display'),
    backBtn: document.getElementById('back-btn')
};

// Variáveis de estado
let currentKey = loadKey();
let unsubscribe = null;
let currentMedia = null;
let backButtonTimeout = null;
let isInPlayerMode = false;

// Configuração inicial
document.addEventListener('DOMContentLoaded', () => {
    elements.activationKey.textContent = currentKey;
    updateGenStatus('Pronto para uso', 'online');

    // Verifica se há mídia associada à chave ao carregar a página
    checkMediaOnLoad();

    // Listeners de eventos
    elements.viewBtn.addEventListener('click', () => {
        console.log('Visualizar Conteúdo clicado');
        enterFullscreen();
        enterPlayerMode();
    });
    elements.exitBtn.addEventListener('click', () => {
        console.log('Botão Sair clicado');
        exitPlayerMode();
    });
    elements.mediaDisplay.addEventListener('click', showBackButton);
    elements.backBtn.addEventListener('click', () => {
        console.log('Botão Voltar clicado');
        exitPlayerMode();
    });
    document.addEventListener('keydown', handleKeyboardShortcuts);

    // Debug: Verificar se o botão Voltar está no DOM
    console.log('Botão Voltar encontrado:', elements.backBtn);
});

// Funções utilitárias
function loadKey() {
    let key = localStorage.getItem('deviceKey');
    if (!key) {
        key = generateKey();
        localStorage.setItem('deviceKey', key);
    }
    return key;
}

function generateKey() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let key = '';
    for (let i = 0; i < 3; i++) {
        key += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    key += '-';
    for (let i = 0; i < 3; i++) {
        key += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return key;
}

function checkMediaOnLoad() {
    console.log('Verificando mídia ao carregar a página para a chave:', currentKey);
    db.ref('midia/' + currentKey).once('value', (snapshot) => {
        if (snapshot.exists()) {
            console.log('Mídia encontrada, entrando no modo player diretamente');
            enterFullscreen();
            enterPlayerMode();
        } else {
            console.log('Nenhuma mídia encontrada, mostrando o modo gerador');
            elements.generatorMode.style.display = 'flex';
        }
    }).catch(error => {
        console.error('Erro ao verificar mídia:', error);
        updateGenStatus('Erro ao verificar mídia', 'offline');
        elements.generatorMode.style.display = 'flex';
    });
}

function enterPlayerMode() {
    console.log('Entrando no modo player');
    elements.generatorMode.style.display = 'none';
    elements.playerMode.style.display = 'block';
    isInPlayerMode = true;
    initPlayerMode(currentKey);
}

function exitPlayerMode() {
    console.log('Saindo do modo player - Início');
    exitFullscreen();
    elements.playerMode.style.display = 'none';
    elements.generatorMode.style.display = 'flex';
    stopListening();
    clearTimeout(backButtonTimeout);
    elements.backBtn.style.display = 'none';
    isInPlayerMode = false;
    console.log('Saindo do modo player - Fim');
}

function enterFullscreen() {
    const element = document.documentElement;
    if (element.requestFullscreen) {
        element.requestFullscreen().catch(err => {
            console.error('Erro ao entrar em fullscreen:', err.message);
            updateGenStatus('Erro: Não foi possível entrar em modo tela cheia', 'offline');
        });
    } else if (element.mozRequestFullScreen) {
        element.mozRequestFullScreen();
    } else if (element.webkitRequestFullscreen) {
        element.webkitRequestFullscreen();
    } else if (element.msRequestFullscreen) {
        element.msRequestFullscreen();
    }

    document.body.classList.add('fullscreen-mode');
}

function exitFullscreen() {
    console.log('Saindo do fullscreen');
    if (document.fullscreenElement || document.mozFullScreenElement || 
        document.webkitFullscreenElement || document.msFullscreenElement) {
        if (document.exitFullscreen) document.exitFullscreen();
        else if (document.mozCancelFullScreen) document.mozCancelFullScreen();
        else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
        else if (document.msExitFullscreen) document.msExitFullscreen();
    }

    document.body.classList.remove('fullscreen-mode');
}

function updateGenStatus(message, status) {
    const el = document.getElementById('gen-status');
    el.textContent = message;
    el.className = `connection-status ${status}`;
}

function stopListening() {
    if (unsubscribe) {
        db.ref('midia/' + currentKey).off('value', unsubscribe);
        unsubscribe = null;
    }
    clearMedia();
}

function clearMedia() {
    elements.mediaDisplay.innerHTML = '';
    currentMedia = null;
}

function showBackButton() {
    console.log('Mostrando botão Voltar');
    elements.backBtn.style.display = 'block';
    clearTimeout(backButtonTimeout);
    backButtonTimeout = setTimeout(() => {
        elements.backBtn.style.display = 'none';
        console.log('Botão Voltar escondido após timeout');
    }, 7000);
}

// Funções do modo Player
function initPlayerMode(key) {
    updatePlayerStatus('Conectando...', 'offline');
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    startPublicListening(key);
}

function handleOnline() {
    updatePlayerStatus('✔ Online', 'online');
    if (!unsubscribe) startPublicListening(currentKey);
}

function handleOffline() {
    updatePlayerStatus('⚡ Offline', 'offline');
}

function startPublicListening(key) {
    console.log('Ouvindo:', 'midia/' + key);
    updatePlayerStatus('Conectando...', 'offline');
    stopListening();

    unsubscribe = db.ref('midia/' + key).on('value', 
        (snapshot) => {
            if (snapshot.exists()) {
                handleMediaUpdate(snapshot);
                if (!isInPlayerMode) {
                    console.log('Mídia detectada, entrando no modo player');
                    enterFullscreen();
                    enterPlayerMode();
                }
            } else {
                console.log('Mídia removida ou não encontrada, voltando ao modo gerador');
                if (isInPlayerMode) {
                    exitPlayerMode();
                }
                showError('Nenhum conteúdo encontrado para esta chave');
            }
        },
        (error) => {
            console.error('Erro ao acessar mídia:', error);
            updatePlayerStatus('Erro de conexão: ' + error.message, 'offline');
            if (isInPlayerMode) {
                exitPlayerMode();
            }
        }
    );
}

function handleMediaUpdate(snapshot) {
    const media = snapshot.val();
    if (JSON.stringify(currentMedia) === JSON.stringify(media)) return;
    currentMedia = media;
    console.log('Mídia recebida:', media);

    updatePlayerStatus('✔ Online - Conteúdo recebido', 'online');
    elements.mediaDisplay.innerHTML = '';

    if (media.tipo === 'text') {
        const textDiv = document.createElement('div');
        textDiv.className = 'text-message';
        textDiv.textContent = media.content;
        textDiv.style.background = media.bgColor || '#2a2f5b';
        textDiv.style.color = media.color || 'white';
        textDiv.style.fontSize = `${media.fontSize || 24}px`;
        elements.mediaDisplay.appendChild(textDiv);
    } else if (media.tipo === 'image') {
        const img = document.createElement('img');
        img.src = media.url;
        img.onerror = () => showError('Erro ao carregar a imagem');
        elements.mediaDisplay.appendChild(img);
    } else if (media.tipo === 'video') {
        const video = document.createElement('video');
        video.src = media.url;
        setVideoAttributes(video, media);
        elements.mediaDisplay.appendChild(video);
        updatePlayerStatus('⚠ Reproduzindo da rede', 'online');
    } else if (media.tipo === 'playlist' && media.items && media.items.length > 0) {
        playPlaylist(media.items);
    } else if (media.tipo === 'activation' || media.tipo === 'status') {
        showError('Nenhum conteúdo para exibir (ativação ou status)');
    } else {
        showError('Tipo de mídia desconhecido');
    }
}

function setVideoAttributes(video, media) {
    video.autoplay = true;
    video.muted = true;
    video.playsinline = true;
    video.controls = false;
    video.loop = media.loop || false;
    video.onerror = () => showError('Erro ao carregar o vídeo');
    video.onloadeddata = function() {
        video.play().catch(function(error) {
            showError('Falha ao reproduzir o vídeo');
        });
    };
}

function playPlaylist(items) {
    let currentIndex = 0;
    const sortedItems = items.slice().sort((a, b) => (a.order || 0) - (b.order || 0));

    function showNextItem() {
        if (currentIndex >= sortedItems.length) currentIndex = 0;
        const item = sortedItems[currentIndex];
        console.log('Exibindo item da playlist:', item);

        elements.mediaDisplay.innerHTML = '';

        if (item.type === 'image') {
            const img = document.createElement('img');
            img.src = item.url;
            img.onerror = () => {
                console.error('Erro ao carregar imagem:', item.url);
                currentIndex++;
                showNextItem();
            };
            elements.mediaDisplay.appendChild(img);
            setTimeout(() => {
                currentIndex++;
                showNextItem();
            }, (item.duration || 10) * 1000);
        } else if (item.type === 'video') {
            const video = document.createElement('video');
            video.src = item.url;
            setPlaylistVideoAttributes(video, item);
            elements.mediaDisplay.appendChild(video);
            updatePlayerStatus('⚠ Reproduzindo da rede', 'online');
        } else {
            console.log('Tipo de item desconhecido:', item.type);
            currentIndex++;
            showNextItem();
        }
    }

    function setPlaylistVideoAttributes(video, item) {
        video.autoplay = true;
        video.muted = true;
        video.playsinline = true;
        video.controls = false;
        video.onerror = () => {
            console.error('Erro ao carregar vídeo:', item.url);
            currentIndex++;
            showNextItem();
        };
        video.onended = () => {
            currentIndex++;
            showNextItem();
        };
        video.onloadeddata = () => video.play().catch(e => {
            console.error('Erro ao reproduzir vídeo:', e);
            currentIndex++;
            showNextItem();
        });
    }

    showNextItem();
}

function showError(message) {
    elements.mediaDisplay.innerHTML = `<div class="error-message">${message}</div>`;
}

function handleKeyboardShortcuts(e) {
    if (e.key === 'Escape' || e.key === 'Backspace') {
        console.log('Tecla Escape ou Backspace pressionada');
        exitPlayerMode();
    }
}

function updatePlayerStatus(message, status) {
    console.log(`Status: ${message} (${status})`);
    const statusEl = document.getElementById('player-status');
    if (statusEl) {
        statusEl.textContent = message;
        statusEl.className = `connection-status ${status}`;
    }
}

// Estilos CSS adicionais
const style = document.createElement('style');
style.textContent = `
    .error-message {
        color: #ff5555;
        font-size: 24px;
        text-align: center;
        padding: 20px;
    }
    .text-message {
        padding: 20px;
        border-radius: 10px;
        max-width: 80%;
        margin: 0 auto;
        text-align: center;
        word-break: break-word;
    }
    #media-display {
        width: 100%;
        height: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
    }
    video, img {
        max-width: 100%;
        max-height: 100%;
        object-fit: contain;
    }
`;
document.head.appendChild(style);