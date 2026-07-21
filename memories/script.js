/* ============================================
   Memories — Core Engine
   Navigation · Hero Parallax · Timeline · Masonry
   Lightbox · Music Player · Scroll Animations
   ============================================ */
(function(){
'use strict';

// ===== 工具函数 =====
function $(s,d){return(d||document).querySelector(s)}
function $$(s,d){return(d||document).querySelectorAll(s)}
function esc(s){return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}

// 图片路径（父级 images/thumbs 目录）
const IMG_BASE = '../images/';
const THUMB_BASE = '../thumbs/';
function thumb(p){ if(!p)return'';if(p.startsWith('http'))return p;if(p.startsWith('images/'))return '../'+p;if(p.startsWith('thumbs/'))return '../'+p;return THUMB_BASE + p; }
function full(p){ if(!p)return'';if(p.startsWith('http'))return p;if(p.startsWith('images/'))return '../'+p;return IMG_BASE + p; }
function musicPath(m){ if(!m)return'';if(m.startsWith('http'))return m;if(m.startsWith('music/'))return '../'+m;return '../music/'+m; }

// ===== 导航 =====
const nav = $('#nav');
const navLinks = $('#navLinks');
const navHamburger = $('#navHamburger');

navHamburger.onclick = () => {
  navHamburger.classList.toggle('open');
  navLinks.classList.toggle('open');
};

$$('.nav-links a').forEach(link => {
  link.onclick = () => { navHamburger.classList.remove('open'); navLinks.classList.remove('open'); };
});

let lastScrollY = 0;
function onScroll(){
  const y = window.scrollY;
  nav.classList.toggle('scrolled', y > 60);

  // Hero parallax
  const heroBg = $('#heroBg');
  if(heroBg) heroBg.style.transform = `translate3d(0,${y*0.35}px,0)`;

  // Active nav link
  $$('.nav-links a').forEach(a => {
    const id = a.getAttribute('href');
    if(!id || !id.startsWith('#')) return;
    const section = $(id);
    if(!section) return;
    const rect = section.getBoundingClientRect();
    a.classList.toggle('active', rect.top <= 120 && rect.bottom > 120);
  });

  lastScrollY = y;
}
window.addEventListener('scroll', onScroll, {passive:true});

// ===== Hero 视差 (requestAnimationFrame) =====
// handled in onScroll above

// ===== 时间线（随笔） =====
function buildTimeline(){
  const timeline = $('#timeline');
  if(!timeline) return;

  const items = [];

  // 从 essayCategories 收集
  if(typeof essayCategories !== 'undefined'){
    essayCategories.forEach(cat => {
      (cat.articles||[]).forEach(art => {
        items.push({...art,cat:cat.title,catId:cat.id});
      });
    });
  }
  // 从 travels 收集
  if(typeof travels !== 'undefined'){
    travels.forEach(art => items.push({...art,cat:'旅行见闻',catId:'travel'}));
  }

  // 按日期降序排列
  items.sort((a,b) => {
    const da = a.date||'', db = b.date||'';
    if(da>db) return -1; if(da<db) return 1;
    return (b.sort_order||0)-(a.sort_order||0);
  });

  if(items.length===0){
    timeline.innerHTML = '<div class="timeline-empty"># 暂无文章 #</div>';
    return;
  }

  // 提取摘要
  function excerpt(body,len){
    if(!body) return '';
    const t = body.replace(/<[^>]+>/g,'').replace(/\s+/g,' ').trim();
    return t.length>len ? t.slice(0,len)+'…' : t;
  }

  timeline.innerHTML = items.map((item,i) => `
    <div class="timeline-item fade-up" data-idx="${i}">
      <div class="timeline-dot"></div>
      <div class="timeline-card" data-idx="${i}">
        <div class="tl-date">${item.date||''}</div>
        <div class="tl-title">${esc(item.title)}</div>
        <div class="tl-excerpt">${esc(excerpt(item.body,120))}</div>
        <span class="tl-cat">${item.cat}</span>
      </div>
    </div>
  `).join('');

  // 点击打开文章弹窗
  $$('.timeline-card').forEach(card => {
    card.onclick = () => {
      const idx = parseInt(card.dataset.idx);
      if(isNaN(idx)) return;
      const essay = items[idx];
      openEssayModal(essay);
    };
  });

  observeFadeUps();
}

// 文章阅读弹窗
function openEssayModal(essay){
  const overlay = $('#essayModal');
  const content = $('#essayModalContent');
  if(!overlay||!content) return;

  // 寻找上一篇/下一篇
  const allCards = $$('.timeline-card');
  const idx = allCards.length>0 ? parseInt(allCards[0].dataset.idx) : 0;
  // 从所有 items 中找当前
  const timelineItems = [];
  if(typeof essayCategories !== 'undefined'){
    essayCategories.forEach(cat => {
      (cat.articles||[]).forEach(art => timelineItems.push({...art,cat:cat.title,catId:cat.id}));
    });
  }
  if(typeof travels !== 'undefined'){
    travels.forEach(art => timelineItems.push({...art,cat:'旅行见闻',catId:'travel'}));
  }
  timelineItems.sort((a,b)=>{
    const da=a.date||'',db=b.date||'';
    if(da>db)return-1;if(da<db)return 1;
    return(b.sort_order||0)-(a.sort_order||0);
  });

  const curIdx = timelineItems.findIndex(t => t.title===essay.title);
  const hasPrev = curIdx>0;
  const hasNext = curIdx<timelineItems.length-1;

  function fmtBody(b){
    if(!b)return'';
    return b.split('\n').filter(l=>l.trim()).map(l=>`<p>${esc(l)}</p>`).join('');
  }

  content.innerHTML = `
    <button class="modal-close" onclick="closeEssayModal()">×</button>
    <div class="modal-essay-title">${esc(essay.title)}</div>
    <div class="modal-essay-date">${essay.date||''} · ${essay.cat||''}</div>
    <div class="modal-essay-body">${fmtBody(essay.body)}</div>
    <div class="modal-nav">
      <button class="editor-btn editor-btn-secondary" ${hasPrev?'':'disabled'} onclick="(${hasPrev?'openEssayModal(window._timelineItems['+ (curIdx-1) +'])':'void 0'})()">← 上一篇</button>
      <span style="color:var(--text-muted);font-size:.85rem">${curIdx+1}/${timelineItems.length}</span>
      <button class="editor-btn editor-btn-secondary" ${hasNext?'':'disabled'} onclick="(${hasNext?'openEssayModal(window._timelineItems['+ (curIdx+1) +'])':'void 0'})()">下一篇 →</button>
    </div>
  `;
  overlay.classList.add('active');
  document.body.style.overflow = 'hidden';

  // 存储供翻页
  window._timelineItems = timelineItems;
}
window.openEssayModal = openEssayModal;

function closeEssayModal(){
  $('#essayModal').classList.remove('active');
  document.body.style.overflow = '';
}
window.closeEssayModal = closeEssayModal;

$('#essayModal').onclick = e => { if(e.target===e.currentTarget) closeEssayModal(); };

// ===== 瀑布流画廊 =====
let lightboxPhotos = [];
let lightboxIdx = 0;

function buildGallery(){
  const masonry = $('#masonry');
  const filtersEl = $('#galleryFilters');
  if(!masonry) return;

  if(!Array.isArray(albums)||albums.length===0){
    masonry.innerHTML = '<div class="timeline-empty"># 暂无相册 #</div>';
    return;
  }

  // 收集所有照片
  const allPhotos = [];
  albums.forEach(album => {
    (album.photos||[]).forEach(photo => {
      allPhotos.push({
        ...photo,
        _albumTitle: album.title,
        _albumId: album.id,
        _worldId: album.world||'',
      });
    });
  });

  // 构建筛选器
  const groups = {};
  allPhotos.forEach(p => {
    const k = p._worldId||p._albumId||'';
    if(!groups[k]) groups[k] = {id:k,title:p._albumTitle,photos:[]};
    groups[k].photos.push(p);
  });

  const filterKeys = Object.keys(groups);
  if(filterKeys.length>1){
    filtersEl.innerHTML = '<button class="gallery-filter active" data-filter="all">全部</button>'+filterKeys.map(k =>
      `<button class="gallery-filter" data-filter="${k}">${groups[k].title}</button>`
    ).join('');
    $$('.gallery-filter').forEach(btn => {
      btn.onclick = () => {
        $$('.gallery-filter').forEach(b=>b.classList.remove('active'));
        btn.classList.add('active');
        renderMasonry(allPhotos, btn.dataset.filter);
      };
    });
  }else{
    filtersEl.innerHTML = '';
  }

  renderMasonry(allPhotos,'all');
}

function renderMasonry(photos,filter){
  const masonry = $('#masonry');
  if(!masonry) return;

  let filtered = filter==='all' ? photos : photos.filter(p=> (p._worldId||p._albumId||'')===filter||p._albumId===filter);

  if(filtered.length===0){
    masonry.innerHTML = '<div class="timeline-empty"># 暂无照片 #</div>';
    return;
  }

  masonry.innerHTML = filtered.map((p,i) => {
    const src = thumb(p);
    const fullSrc = full(p);
    return `<div class="masonry-item fade-up" data-idx="${i}">
      <img src="${src}" alt="" loading="lazy" decoding="async" onerror="this.style.display='none'" onclick="openLightbox(${i})">
      <div class="masonry-overlay"><span>${p._albumTitle||''}</span></div>
    </div>`;
  }).join('');

  lightboxPhotos = filtered;
  observeFadeUps();
}

// ===== 灯箱 =====
function openLightbox(idx){
  if(idx<0||idx>=lightboxPhotos.length) return;
  lightboxIdx = idx;
  const lb = $('#lightbox');
  const img = $('#lightboxImg');
  const counter = $('#lightboxCounter');
  const loader = $('#lightboxLoader');

  lb.classList.add('active');
  document.body.style.overflow = 'hidden';

  const photo = lightboxPhotos[idx];
  const src = full(photo);
  loader.classList.add('show');
  img.style.opacity = '0';
  img.src = src;
  counter.textContent = `${idx+1} / ${lightboxPhotos.length}`;

  img.onload = () => {
    loader.classList.remove('show');
    img.style.opacity = '1';
    img.style.transition = 'opacity .3s';
  };
  img.onerror = () => {
    loader.classList.remove('show');
    counter.textContent = '加载失败';
  };
}
window.openLightbox = openLightbox;

function navLightbox(dir){
  let idx = lightboxIdx + dir;
  if(idx<0) idx = lightboxPhotos.length-1;
  if(idx>=lightboxPhotos.length) idx = 0;
  openLightbox(idx);
}
window.navLightbox = navLightbox;

function closeLightbox(){
  const lb = $('#lightbox');
  lb.classList.remove('active');
  document.body.style.overflow = '';
  $('#lightboxImg').src = '';
}
window.closeLightbox = closeLightbox;

$('#lightbox').onclick = e => { if(e.target===e.currentTarget||e.target.classList.contains('lightbox-img')) closeLightbox(); };

// 键盘导航
document.addEventListener('keydown',e=>{
  if($('#lightbox').classList.contains('active')){
    if(e.key==='ArrowLeft') navLightbox(-1);
    else if(e.key==='ArrowRight') navLightbox(1);
    else if(e.key==='Escape') closeLightbox();
  }
  if($('#essayModal').classList.contains('active')&&e.key==='Escape'){
    closeEssayModal();
  }
});

// ===== 音乐播放器 =====
let currentPlaylistId = null;
let currentSongIdx = 0;
let isPlaying = false;
let bgMusic = null;

function initMusic(){
  bgMusic = $('#bgMusic');
  if(!bgMusic) return;
  bgMusic.volume = 0.5;

  bgMusic.addEventListener('timeupdate',()=>{
    if(bgMusic.duration){
      const pct = (bgMusic.currentTime/bgMusic.duration)*100;
      $('#playerProgress').style.width = pct+'%';
    }
  });
  bgMusic.addEventListener('ended',nextSong);
  bgMusic.addEventListener('play',()=>{isPlaying=true;$('#playBtn').textContent='⏸'});
  bgMusic.addEventListener('pause',()=>{isPlaying=false;$('#playBtn').textContent='▶'});
  bgMusic.addEventListener('error',()=>{nextSong()});

  // 加载默认播放列表
  if(typeof playlist!=='undefined'&&Array.isArray(playlist)&&playlist.length>0){
    switchPlaylist(playlist);
  }
}

function switchPlaylist(songs){
  window._currentSongs = songs;
  currentSongIdx = 0;
  playSong(0);
}

function playSong(idx){
  const songs = window._currentSongs;
  if(!songs||idx>=songs.length||idx<0) return;
  currentSongIdx = idx;
  const s = songs[idx];
  const url = s.url||musicPath(s.name+'.mp3');
  if(bgMusic){
    bgMusic.src = url;
    bgMusic.load();
    bgMusic.play().catch(()=>{});
    $('#playerTitle').textContent = s.name||s.title||'未知';
  }
}

function togglePlay(){
  if(!bgMusic) return;
  if(isPlaying) bgMusic.pause();
  else bgMusic.play().catch(()=>{});
}
window.togglePlay = togglePlay;

function prevSong(){
  const songs = window._currentSongs;
  if(!songs||songs.length===0) return;
  let idx = currentSongIdx-1;
  if(idx<0) idx = songs.length-1;
  playSong(idx);
}
window.prevSong = prevSong;

function nextSong(){
  const songs = window._currentSongs;
  if(!songs||songs.length===0) return;
  let idx = currentSongIdx+1;
  if(idx>=songs.length) idx = 0;
  playSong(idx);
}
window.nextSong = nextSong;

function seek(e){
  if(!bgMusic||!bgMusic.duration) return;
  const rect = e.currentTarget.getBoundingClientRect();
  const pct = (e.clientX-rect.left)/rect.width;
  bgMusic.currentTime = pct*bgMusic.duration;
}
window.seek = seek;

function togglePlayer(){
  $('#player').classList.toggle('collapsed');
}
window.togglePlayer = togglePlayer;

// ===== 旧世界密码 =====
let pwdCallback = null;
function showPwdModal(cb){
  pwdCallback = cb;
  $('#pwdOverlay').classList.add('active');
  $('#pwdError').textContent = '';
  $('#pwdInput').value = '';
  setTimeout(()=>$('#pwdInput').focus(),100);
}
window.showPwdModal = showPwdModal;

function closePwdModal(){
  $('#pwdOverlay').classList.remove('active');
  pwdCallback = null;
}
window.closePwdModal = closePwdModal;

function checkPwd(){
  const input = $('#pwdInput').value.trim();
  // 简单密码: 作者名字（从 data.js 取或默认）
  const correct = (typeof sitePassword !== 'undefined') ? sitePassword : '郑天游';
  if(input===correct){
    try{localStorage.setItem('memories_oldworld','1')}catch(e){}
    closePwdModal();
    if(pwdCallback) pwdCallback();
    // 渲染旧世界内容
    if(typeof window.openOldWorld==='function') window.openOldWorld();
  }else{
    $('#pwdError').textContent = '密码不对喔';
  }
}
window.checkPwd = checkPwd;

$('#pwdInput').onkeydown = e => { if(e.key==='Enter') checkPwd(); };

// ===== 相册点击（带密码保护） =====
// 旧世界的 albums 可能需要密码
// data.js 中 worlds 定义了哪些相册属于旧世界
function handleAlbumClick(albumId){
  const album = (albums||[]).find(a=>a.id===albumId);
  if(!album) return;

  // 检查是否需要密码
  if(typeof worlds!=='undefined'){
    const oldworld = worlds.find(w=>w.id==='oldworld');
    if(oldworld){
      const isOldWorld = (album.world==='oldworld')||
        (oldworld.children&&oldworld.children.includes(albumId));
      if(isOldWorld&&!localStorage.getItem('memories_oldworld')){
        showPwdModal(()=>{openAlbumLightbox(albumId)});
        return;
      }
    }
  }
  openAlbumLightbox(albumId);
}

function openAlbumLightbox(albumId){
  const album = (albums||[]).find(a=>a.id===albumId);
  if(!album||!album.photos||album.photos.length===0) return;
  lightboxPhotos = album.photos.map(p=>({...p,_albumTitle:album.title}));
  openLightbox(0);
}

// ===== 滚动观察器 =====
function observeFadeUps(){
  const observer = new IntersectionObserver(entries=>{
    entries.forEach(e=>{
      if(e.isIntersecting){
        e.target.classList.add('visible');
        observer.unobserve(e.target);
      }
    });
  },{rootMargin:'60px'});

  $$('.fade-up').forEach(el=>{
    if(!el.classList.contains('visible')) observer.observe(el);
  });
  // 也处理 masonry-items
  $$('.masonry-item').forEach(el=>{
    if(!el.classList.contains('visible')) observer.observe(el);
  });
}

// ===== 初始化 =====
function init(){
  initMusic();
  buildTimeline();
  buildGallery();
  observeFadeUps();

  // 齿轮由 editor.js 接管
  // observe masonry items as they lazy-load
  const mediaObserver = new MutationObserver(()=>{
    observeFadeUps();
  });
  mediaObserver.observe(document.body,{childList:true,subtree:true});
}

if(document.readyState==='complete') init();
else window.addEventListener('load',init);

})();
