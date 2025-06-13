// Firebase Configuration
const firebaseConfig = {
  apiKey: "AIzaSyBhj6nv3QcIHyuznWPNM4t_0NjL0ghMwFw",
  authDomain: "dsignertv.firebaseapp.com",
  databaseURL: "https://dsignertv-default-rtdb.firebaseio.com",
  projectId: "dsignertv",
  storageBucket: "dsignertv.firebasestorage.app",
  messagingSenderId: "930311416952",
  appId: "1:930311416952:web:d0e7289f0688c46492d18d"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.database();

// State Management
class AppState {
  constructor() {
    this.currentKey = this.loadKey();
    this.unsubscribe = null;
    this.currentMedia = null;
    this.backButtonTimeout = null;
    this.isInPlayerMode = false;
  }

  loadKey() {
    let key = localStorage.getItem('deviceKey');
    if (!key) {
      key = this.generateKey();
      localStorage.setItem('deviceKey', key);
    }
    return key;
  }

  generateKey() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    return Array.from({ length: 3 }, () => 
      chars.charAt(Math.floor(Math.random() * chars.length))
    ).join('') + '-' +
    Array.from({ length: 3 }, () => 
      chars.charAt(Math.floor(Math.random() * chars.length))
    ).join('');
  }
}

// DOM Management
class DOMManager {
  constructor() {
    this.elements = {
      generatorMode: document.getElementById('generator-mode'),
      playerMode: document.getElementById('player-mode'),
      activationKey: document.getElementById('activation-key'),
      viewBtn: document.getElementById('view-btn'),
      exitBtn: document.getElementById('exit-btn'),
      mediaDisplay: document.getElementById('media-display'),
      backBtn: document.getElementById('back-btn')
    };
  }

  initialize(state) {
    this.elements.activationKey.textContent = state.currentKey;
    this.updateGenStatus('Pronto para uso', 'online');
    this.setupEventListeners(state);
  }

  setupEventListeners(state) {
    document.addEventListener('DOMContentLoaded', () => this.checkMediaOnLoad(state));
    this.elements.viewBtn.addEventListener('click', () => this.enterPlayerMode(state));
    this.elements.exitBtn.addEventListener('click', () => this.exitPlayerMode(state));
    this.elements.mediaDisplay.addEventListener('click', () => this.showBackButton(state));
    this.elements.backBtn.addEventListener('click', () => this.exitPlayerMode(state));
    document.addEventListener('keydown', (e) => this.handleKeyboardShortcuts(e, state));
  }

  updateGenStatus(message, status) {
    const el = document.getElementById('gen-status');
    el.textContent = message;
    el.className = `connection-status ${status}`;
  }

  updatePlayerStatus(message, status) {
    const statusEl = document.getElementById('player-status');
    if (statusEl) {
      statusEl.textContent = message;
      statusEl.className = `connection-status ${status}`;
    }
  }

  showError(message) {
    this.elements.mediaDisplay.innerHTML = `<div class="error-message">${message}</div>`;
  }

  showBackButton(state) {
    this.elements.backBtn.style.display = 'block';
    clearTimeout(state.backButtonTimeout);
    state.backButtonTimeout = setTimeout(() => {
      this.elements.backBtn.style.display = 'none';
    }, 7000);
  }

  checkMediaOnLoad(state) {
    db.ref('midia/' + state.currentKey).once('value')
      .then(snapshot => {
        if (snapshot.exists()) {
          FullscreenManager.enterFullscreen();
          this.enterPlayerMode(state);
        } else {
          this.elements.generatorMode.style.display = 'flex';
        }
      })
      .catch(error => {
        console.error('Erro ao verificar mídia:', error);
        this.updateGenStatus('Erro ao verificar mídia', 'offline');
        this.elements.generatorMode.style.display = 'flex';
      });
  }

  enterPlayerMode(state) {
    this.elements.generatorMode.style.display = 'none';
    this.elements.playerMode.style.display = 'block';
    state.isInPlayerMode = true;
    this.initPlayerMode(state);
  }

  exitPlayerMode(state) {
    FullscreenManager.exitFullscreen();
    this.elements.playerMode.style.display = 'none';
    this.elements.generatorMode.style.display = 'flex';
    this.stopListening(state);
    clearTimeout(state.backButtonTimeout);
    this.elements.backBtn.style.display = 'none';
    state.isInPlayerMode = false;
  }

  handleKeyboardShortcuts(e, state) {
    if (e.key === 'Escape' || e.key === 'Backspace') {
      this.exitPlayerMode(state);
    }
  }
}

// Fullscreen Management
class FullscreenManager {
  static enterFullscreen() {
    const element = document.documentElement;
    const requestFullscreen = element.requestFullscreen || 
                             element.mozRequestFullScreen || 
                             element.webkitRequestFullscreen || 
                             element.msRequestFullscreen;
    
    if (requestFullscreen) {
      requestFullscreen.call(element).catch(err => {
        console.error('Erro ao entrar em fullscreen:', err.message);
      });
    }
    document.body.classList.add('fullscreen-mode');
  }

  static exitFullscreen() {
    const exitFullscreen = document.exitFullscreen || 
                           document.mozCancelFullScreen || 
                           document.webkitExitFullscreen || 
                           document.msExitFullscreen;
    
    if (exitFullscreen && (document.fullscreenElement || document.mozFullScreenElement || 
        document.webkitFullscreenElement || document.msFullscreenElement)) {
      exitFullscreen.call(document);
    }
    document.body.classList.remove('fullscreen-mode');
  }
}

// Media Cache Management
class MediaCache {
  static async initDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open("VideoCacheDB", 1);
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains("videos")) {
          db.createObjectStore("videos");
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  static async cacheAndPlayVideo(videoUrl, callback) {
    const fileName = encodeURIComponent(videoUrl);
    const cacheKey = `cached-video-${fileName}`;
    
    try {
      const db = await this.initDB();
      const transaction = db.transaction("videos", "readonly");
      const store = transaction.objectStore("videos");
      const getRequest = store.get(cacheKey);

      getRequest.onsuccess = () => {
        if (getRequest.result) {
          callback(URL.createObjectURL(getRequest.result));
        } else {
          fetch(videoUrl)
            .then(res => res.blob())
            .then(blob => {
              const saveTx = db.transaction("videos", "readwrite");
              saveTx.objectStore("videos").put(blob, cacheKey);
              callback(URL.createObjectURL(blob));
            })
            .catch(err => {
              console.error("Erro ao baixar vídeo:", err);
              callback(videoUrl);
            });
        }
      };
    } catch (err) {
      console.error("Erro ao acessar cache:", err);
      callback(videoUrl);
    }
  }
}

// Media Player Management
class MediaPlayer {
  constructor(domManager, state) {
    this.domManager = domManager;
    this.state = state;
  }

  initPlayerMode() {
    this.domManager.updatePlayerStatus('Conectando...', 'offline');
    window.addEventListener('online', () => this.handleOnline());
    window.addEventListener('offline', () => this.handleOffline());
    this.startPublicListening();
  }

  handleOnline() {
    this.domManager.updatePlayerStatus('✔ Online', 'online');
    if (!this.state.unsubscribe) {
      this.startPublicListening();
    }
  }

  handleOffline() {
    this.domManager.updatePlayerStatus('⚡ Offline', 'offline');
  }

  startPublicListening() {
    this.domManager.updatePlayerStatus('Conectando...', 'offline');
    this.stopListening();

    this.state.unsubscribe = db.ref('midia/' + this.state.currentKey).on('value', 
      (snapshot) => {
        if (snapshot.exists()) {
          this.handleMediaUpdate(snapshot);
          if (!this.state.isInPlayerMode) {
            FullscreenManager.enterFullscreen();
            this.domManager.enterPlayerMode(this.state);
          }
        } else if (this.state.isInPlayerMode) {
          this.domManager.exitPlayerMode(this.state);
          this.domManager.showError('Nenhum conteúdo encontrado para esta chave');
        }
      },
      (error) => {
        console.error('Erro ao acessar mídia:', error);
        this.domManager.updatePlayerStatus('Erro de conexão: ' + error.message, 'offline');
        if (this.state.isInPlayerMode) {
          this.domManager.exitPlayerMode(this.state);
        }
      }
    );
  }

  stopListening() {
    if (this.state.unsubscribe) {
      db.ref('midia/' + this.state.currentKey).off('value', this.state.unsubscribe);
      this.state.unsubscribe = null;
      this.clearMedia();
    }
  }

  clearMedia() {
    this.domManager.elements.mediaDisplay.innerHTML = '';
    this.state.currentMedia = null;
  }

  handleMediaUpdate(snapshot) {
    const media = snapshot.val();
    if (JSON.stringify(this.state.currentMedia) === JSON.stringify(media)) return;

    this.state.currentMedia = media;
    this.domManager.updatePlayerStatus('✔ Online - Conteúdo recebido', 'online');
    this.domManager.elements.mediaDisplay.innerHTML = '';

    if (media.tipo === 'text') {
      const textDiv = document.createElement('div');
      textDiv.className = 'text-message';
      textDiv.textContent = media.content;
      textDiv.style.backgroundColor = media.bgColor || '#2a2f5b';
      textDiv.style.color = media.color || 'white';
      textDiv.style.fontSize = `${media.fontSize || 24}px`;
      this.domManager.elements.mediaDisplay.appendChild(textDiv);
    } else if (media.tipo === 'image') {
      const img = document.createElement('img');
      img.src = media.url;
      img.onerror = () => this.domManager.showError('Erro ao carregar a imagem');
      this.domManager.elements.mediaDisplay.appendChild(img);
    } else if (media.tipo === 'video') {
      if (media.url.includes('youtube.com') || media.url.includes('youtu.be')) {
        const videoId = media.url.match(/(?:v=|\/)([0-9A-Za-z_-]{11})/)?.[1];
        if (videoId) {
          const iframe = document.createElement('iframe');
          iframe.src = `https://www.youtube.com/embed/${videoId}?autoplay=1&mute=1&loop=1&playlist=${videoId}`;
          iframe.style.width = '100%';
          iframe.style.height = '100%';
          iframe.frameBorder = '0';
          iframe.allow = 'autoplay; encrypted-media';
          this.domManager.elements.mediaDisplay.appendChild(iframe);
        } else {
          this.domManager.showError('URL do YouTube inválida');
        }
      } else {
        const video = this.createCachedVideoElement(media.url, media);
        this.domManager.elements.mediaDisplay.appendChild(video);
      }
    } else if (media.tipo === 'playlist' && media.items && media.items.length > 0) {
      this.playPlaylist(media.items);
    } else {
      this.domManager.showError('Tipo de mídia desconhecido');
    }
  }

  createCachedVideoElement(url, media) {
    const video = document.createElement('video');
    this.setVideoAttributes(video, media);
    MediaCache.cacheAndPlayVideo(url, (localUrl) => {
      video.src = localUrl;
    });
    return video;
  }

  setVideoAttributes(video, media) {
    video.autoplay = true;
    video.muted = true;
    video.playsInline = true;
    video.controls = false;
    video.loop = true;
    video.onerror = () => this.domManager.showError('Erro ao carregar o vídeo');
    video.onloadeddata = () => video.play().catch(() => this.domManager.showError('Falha ao reproduzir o vídeo'));
  }

  playPlaylist(items) {
    let currentIndex = 0;
    const sortedItems = items.slice().sort((a, b) => (a.order || 0) - (b.order || 0));

    const showNextItem = () => {
      if (currentIndex >= sortedItems.length) currentIndex = 0;
      const item = sortedItems[currentIndex];
      this.domManager.elements.mediaDisplay.innerHTML = '';

      if (item.type === 'image') {
        const img = document.createElement('img');
        img.src = item.url;
        img.onerror = () => {
          currentIndex++;
          showNextItem();
        };
        this.domManager.elements.mediaDisplay.appendChild(img);
        setTimeout(() => {
          currentIndex++;
          showNextItem();
        }, (item.duration || 10) * 1000);
      } else if (item.type === 'video') {
        if (item.url.includes('youtube.com') || item.url.includes('youtu.be')) {
          const videoId = item.url.match(/(?:v=|\/)([0-9A-Za-z_-]{11})/)?.[1];
          if (videoId) {
            const iframe = document.createElement('iframe');
            iframe.src = `https://www.youtube.com/embed/${videoId}?autoplay=1&mute=1&loop=1&playlist=${videoId}`;
            iframe.style.width = '100%';
            iframe.style.height = '100%';
            iframe.frameBorder = '0';
            iframe.allow = 'autoplay; encrypted-media';
            this.domManager.elements.mediaDisplay.appendChild(iframe);
          } else {
            currentIndex++;
            showNextItem();
          }
        } else {
          const video = this.createCachedVideoElement(item.url, item);
          video.onended = () => {
            currentIndex++;
            showNextItem();
          };
          this.domManager.elements.mediaDisplay.appendChild(video);
        }
      } else {
        currentIndex++;
        showNextItem();
      }
    };

    showNextItem();
  }
}

// CSS Styling
const styleSheet = document.createElement('style');
styleSheet.textContent = `
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
  video, img, iframe {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
  }
`;
document.head.appendChild(styleSheet);

// Initialize Application
(() => {
  const appState = new AppState();
  const domManager = new DOMManager();
  const mediaPlayer = new MediaPlayer(domManager, appState);
  domManager.initialize(appState);
  mediaPlayer.checkMediaOnLoad(); // Ensure media check runs on load
})();