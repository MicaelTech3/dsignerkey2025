// Firebase
const firebaseConfig = {
  apiKey:"AIzaSyBhj6nv3QcIHyuznWPNM4t_0NjL0ghMwFw",
  authDomain:"dsignertv.firebaseapp.com",
  databaseURL:"https://dsignertv-default-rtdb.firebaseio.com",
  projectId:"dsignertv",
  storageBucket:"dsignertv.firebasestorage.app",
  messagingSenderId:"930311416952",
  appId:"1:930311416952:web:d0e7289f0688c46492d18d"
};
firebase.initializeApp(firebaseConfig);
const db = firebase.database();

// Estado
class AppState{
  constructor(){
    this.currentKey=this.loadKey();
    this.unsubscribe=null;
    this.currentMedia=null;
    this.backButtonTimeout=null;
    this.isInPlayerMode=false;
    this.isOnline=navigator.onLine;
  }
  loadKey(){
    let key=localStorage.getItem('deviceKey');
    if(!key){ key=this.generateKey(); localStorage.setItem('deviceKey',key); }
    return key;
  }
  generateKey(){
    const chars='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const p=()=>Array.from({length:3},()=>chars[Math.floor(Math.random()*chars.length)]).join('');
    return `${p()}-${p()}`;
  }
}

// DOM
class DOMManager{
  constructor(){
    this.elements={
      generatorMode:document.getElementById('generator-mode'),
      playerMode:document.getElementById('player-mode'),
      activationKey:document.getElementById('activation-key'),
      exitBtn:document.getElementById('exit-btn'),
      mediaDisplay:document.getElementById('media-display'),
      backBtn:document.getElementById('back-btn'),
      keyOverlay:document.getElementById('key-overlay'),
    };
    this.progressIndicator=document.createElement('div');
    this.progressIndicator.id='download-progress';
    document.body.appendChild(this.progressIndicator);
    this.progressIndicator.style.display='none';
  }
  initialize(state){
    if(this.elements.activationKey) this.elements.activationKey.textContent=state.currentKey;
    this.setKeyOverlay(state.currentKey,false);
    this.updateGenStatus('Pronto para uso','online');
    this.setupEventListeners(state);
    this.handleNetworkChange(state);
  }
  setupEventListeners(state){
    document.addEventListener('DOMContentLoaded',()=>this.checkMediaOnLoad(state));
    this.elements.exitBtn?.addEventListener('click',()=>this.exitPlayerMode(state));
    this.elements.mediaDisplay.addEventListener('click',()=>this.showBackButton(state));
    this.elements.backBtn.addEventListener('click',()=>this.exitPlayerMode(state));
    window.addEventListener('online',()=>this.handleNetworkChange(state));
    window.addEventListener('offline',()=>this.handleNetworkChange(state));
    document.addEventListener('keydown',(e)=>{ if(e.key==='Escape'||e.key==='Backspace') this.exitPlayerMode(state); });
  }
  updateGenStatus(msg,st){ const el=document.getElementById('gen-status'); if(!el) return; el.textContent=msg; el.className=`connection-status ${st}`;}
  updatePlayerStatus(msg,st){ const el=document.getElementById('player-status'); if(!el) return; el.textContent=msg; el.className=`connection-status ${st}`;}
  setKeyOverlay(key,visible=true,extra=''){ const el=this.elements.keyOverlay; if(!el) return; el.innerHTML=`<strong>${key}</strong>${extra?` <span style="opacity:.8">${extra}</span>`:''}`; el.style.display=visible?'block':'none'; }
  showError(msg){ this.elements.mediaDisplay.innerHTML=`<div class="error-message">${msg}</div>`; }
  showBackButton(state){ this.elements.backBtn.style.display='block'; clearTimeout(state.backButtonTimeout); state.backButtonTimeout=setTimeout(()=>{this.elements.backBtn.style.display='none';},7000); }
  checkMediaOnLoad(state){
    if(!state.isOnline){ this.enterPlayerMode(state); this.updatePlayerStatus('Offline','offline'); this.setKeyOverlay(state.currentKey,true,'sem conteúdo'); return; }
    db.ref('midia/'+state.currentKey).once('value').then(snap=>{
      this.enterPlayerMode(state);
      if(snap.exists()) this.updatePlayerStatus('Conectando…','online');
      else { this.updatePlayerStatus('Sem conteúdo para esta chave','online'); this.setKeyOverlay(state.currentKey,true,'sem conteúdo'); this.clearMedia(); }
    }).catch(()=>{ this.enterPlayerMode(state); this.updatePlayerStatus('Erro ao verificar','offline'); this.setKeyOverlay(state.currentKey,true,'erro'); });
  }
  enterPlayerMode(state){
    this.elements.generatorMode.style.display='none';
    this.elements.playerMode.style.display='block';
    state.isInPlayerMode=true;
    if(!state.unsubscribe) new MediaPlayer(this,state).initPlayerMode();
  }
  exitPlayerMode(state){
    this.elements.playerMode.style.display='none';
    this.elements.generatorMode.style.display='flex';
    this.stopListening(state);
    clearTimeout(state.backButtonTimeout);
    this.elements.backBtn.style.display='none';
    this.setKeyOverlay(state.currentKey,false);
    state.isInPlayerMode=false;
  }
  stopListening(state){ if(state.unsubscribe){ db.ref('midia/'+state.currentKey).off('value',state.unsubscribe); state.unsubscribe=null; } this.clearMedia(); }
  clearMedia(){ this.elements.mediaDisplay.innerHTML=''; this.progressIndicator.style.display='none'; }
  updateProgress(p){ this.progressIndicator.style.display='block'; this.progressIndicator.textContent=`${p}%`; if(p>=100) setTimeout(()=>this.progressIndicator.style.display='none',800); }
  handleNetworkChange(state){ state.isOnline=navigator.onLine; this.updateGenStatus(state.isOnline?'Pronto para uso':'Offline', state.isOnline?'online':'offline'); }
}

// Cache de vídeo (IndexedDB)
class MediaCache{
  static async initDB(){ return new Promise((res,rej)=>{ const r=indexedDB.open('VideoCacheDB',1); r.onupgradeneeded=e=>{const db=e.target.result;if(!db.objectStoreNames.contains('videos')) db.createObjectStore('videos');}; r.onsuccess=()=>res(r.result); r.onerror=()=>rej(r.error); }); }
  static async cacheVideo(url,dom){ const key=`cached-video-${encodeURIComponent(url)}`; try{ const idb=await this.initDB(); const resp=await fetch(url,{mode:'cors'}); if(!resp.ok) throw new Error('HTTP '+resp.status); const reader=resp.body.getReader(); const total=+resp.headers.get('content-length')||1; let got=0, chunks=[]; while(true){ const {done,value}=await reader.read(); if(done) break; chunks.push(value); got+=value.length; dom.updateProgress(Math.round(got/total*100)); } const blob=new Blob(chunks); const tx=idb.transaction('videos','readwrite'); tx.objectStore('videos').put(blob,key); dom.updateProgress(100); }catch{ dom.updateProgress(0); } }
  static async getCachedVideo(url){ const key=`cached-video-${encodeURIComponent(url)}`; try{ const idb=await this.initDB(); return await new Promise(res=>{ const tx=idb.transaction('videos','readonly'); const g=tx.objectStore('videos').get(key); g.onsuccess=()=>res(g.result||null); g.onerror=()=>res(null); }); }catch{ return null; } }
}

// Player
class MediaPlayer{
  constructor(dom,state){ this.domManager=dom; this.state=state; }
  initPlayerMode(){ this.domManager.updatePlayerStatus('Conectando…','offline'); window.addEventListener('online',()=>this.handleOnline()); window.addEventListener('offline',()=>this.handleOffline()); this.startListening(); }
  handleOnline(){ this.domManager.updatePlayerStatus('✔ Online','online'); if(!this.state.unsubscribe) this.startListening(); }
  handleOffline(){ this.domManager.updatePlayerStatus('⚡ Offline','offline'); this.domManager.setKeyOverlay(this.state.currentKey,true,'offline'); }
  startListening(){
    this.stopListening();
    const ref=db.ref('midia/'+this.state.currentKey);
    this.state.unsubscribe=ref.on('value',
      (snap)=>{
        if(snap.exists()){
          this.handleMediaUpdate(snap);
          this.domManager.setKeyOverlay(this.state.currentKey,false);
        }else{
          // Sem conteúdo → fica no player, limpa e exibe a chave
          this.state.currentMedia=null;
          this.pauseAndCleanMedia();
          this.domManager.clearMedia();
          this.domManager.updatePlayerStatus('Sem conteúdo para esta chave','online');
          this.domManager.setKeyOverlay(this.state.currentKey,true,'sem conteúdo');
        }
      },
      (err)=>{
        console.error('Erro no listener:',err);
        this.domManager.updatePlayerStatus('Erro de conexão','offline');
        this.domManager.setKeyOverlay(this.state.currentKey,true,'erro');
      }
    );
  }
  stopListening(){ if(this.state.unsubscribe){ db.ref('midia/'+this.state.currentKey).off('value',this.state.unsubscribe); this.state.unsubscribe=null; this.domManager.clearMedia(); } }

  // NOVO: parar qualquer mídia que esteja tocando
  pauseAndCleanMedia(){
    const root=this.domManager.elements.mediaDisplay;
    try{
      root.querySelectorAll('video').forEach(v=>{ try{ v.pause(); v.removeAttribute('src'); v.load(); }catch{} });
      root.querySelectorAll('iframe').forEach(f=>{ try{ f.src='about:blank'; }catch{} f.remove(); });
    }catch{}
  }

  async handleMediaUpdate(snapshot){
    const media=snapshot.val();
    if(JSON.stringify(this.state.currentMedia)===JSON.stringify(media)) return;

    this.state.currentMedia=media;
    this.domManager.updatePlayerStatus('✔ Online - Conteúdo recebido','online');

    // antes de renderizar: parar e limpar
    this.pauseAndCleanMedia();
    this.domManager.clearMedia();

    // NOVO: STOP → tela preta + chave no canto
    if(media.tipo==='stop'){
      const black=document.createElement('div');
      black.style.cssText='position:absolute;inset:0;background:#000;';
      this.domManager.elements.mediaDisplay.appendChild(black);
      this.domManager.setKeyOverlay(this.state.currentKey,true,'sem conteúdo');
      return;
    }

    // TEXT
    if(media.tipo==='text'){
      const el=document.createElement('div');
      el.className='text-message';
      el.textContent=media.content||'';
      el.style.backgroundColor=media.bgColor||'#2a2f5b';
      el.style.color=media.color||'#fff';
      el.style.fontSize=`${media.fontSize||24}px`;
      this.domManager.elements.mediaDisplay.appendChild(el);
      return;
    }

    // IMAGE
    if(media.tipo==='image'){
      const img=document.createElement('img');
      img.src=media.url;
      img.onerror=()=>{ this.domManager.showError('Erro ao carregar a imagem'); this.domManager.setKeyOverlay(this.state.currentKey,true,'erro'); };
      this.domManager.elements.mediaDisplay.appendChild(img);
      return;
    }

    // VIDEO
    if(media.tipo==='video'){
      if(media.url?.includes('youtube.com')||media.url?.includes('youtu.be')){
        const id=media.url.match(/(?:v=|\/)([0-9A-Za-z_-]{11})/)?.[1];
        if(id){
          const iframe=document.createElement('iframe');
          const loop=media.loop?`&loop=1&playlist=${id}`:'';
          iframe.src=`https://www.youtube.com/embed/${id}?autoplay=1&mute=1${loop}`;
          iframe.allow='autoplay; encrypted-media';
          iframe.style.cssText='position:absolute;inset:0;width:100%;height:100%;';
          this.domManager.elements.mediaDisplay.appendChild(iframe);
        }else{
          this.domManager.showError('URL do YouTube inválida');
          this.domManager.setKeyOverlay(this.state.currentKey,true,'erro url');
        }
        return;
      }
      const video=await this.createVideoElement(media.url,media);
      this.domManager.elements.mediaDisplay.appendChild(video);
      return;
    }

    // PLAYLIST
    if(media.tipo==='playlist' && Array.isArray(media.items) && media.items.length>0){
      this.playPlaylist(media.items);
      return;
    }

    // desconhecido
    this.domManager.showError('Tipo de mídia desconhecido');
    this.domManager.setKeyOverlay(this.state.currentKey,true,'desconhecido');
  }

  async createVideoElement(url,media){
    const cached=await MediaCache.getCachedVideo(url);
    const v=document.createElement('video');
    this.setVideoAttributes(v,media);
    v.src=cached?URL.createObjectURL(cached):url;

    v.onplaying=()=>{ if(!cached && navigator.onLine) MediaCache.cacheVideo(url,this.domManager); };
    v.onerror=()=>{ this.pauseAndCleanMedia(); this.domManager.clearMedia(); this.domManager.updatePlayerStatus('Erro ao carregar o vídeo (404)','online'); this.domManager.setKeyOverlay(this.state.currentKey,true,'sem conteúdo'); };
    return v;
  }
  setVideoAttributes(v,media){
    v.autoplay=true; v.muted=true; v.playsInline=true; v.controls=false; v.loop=!!media.loop;
    v.onloadeddata=()=>v.play().catch(()=>this.domManager.showError('Falha ao reproduzir o vídeo'));
    v.style.cssText='position:absolute;inset:0;width:100%;height:100%;object-fit:contain;';
  }

  playPlaylist(items){
    let i=0;
    const arr=items.slice().sort((a,b)=>(a.order||0)-(b.order||0));
    const next=()=>{
      if(i>=arr.length) i=0;
      const it=arr[i++];

      this.pauseAndCleanMedia();
      this.domManager.clearMedia();

      if(it.type==='image'){
        const img=document.createElement('img');
        img.src=it.url;
        img.onerror=()=>next();
        this.domManager.elements.mediaDisplay.appendChild(img);
        setTimeout(next,(it.duration||10)*1000);
      }else if(it.type==='video'){
        if(it.url?.includes('youtube.com')||it.url?.includes('youtu.be')){
          const id=it.url.match(/(?:v=|\/)([0-9A-Za-z_-]{11})/)?.[1];
          if(!id) return next();
          const iframe=document.createElement('iframe');
          iframe.src=`https://www.youtube.com/embed/${id}?autoplay=1&mute=1&loop=1&playlist=${id}`;
          iframe.allow='autoplay; encrypted-media';
          iframe.style.cssText='position:absolute;inset:0;width:100%;height:100%;';
          this.domManager.elements.mediaDisplay.appendChild(iframe);
          setTimeout(next,5*60*1000); // segurança
        }else{
          this.createVideoElement(it.url,it).then(v=>{ v.onended=()=>next(); this.domManager.elements.mediaDisplay.appendChild(v); }).catch(next);
        }
      }else{ next(); }
    };
    next();
  }
}

// Boot
(()=>{ const state=new AppState(); const dom=new DOMManager(); dom.initialize(state); dom.checkMediaOnLoad(state); })();
