/* ============================================
   Memories v2 — 核心引擎
   修复黑边 · 缩放灯箱 · 星图 · 热力图 · 可视化
   ============================================ */
(function(){
'use strict';

// ===== 工具 =====
function $(s,d){return(d||document).querySelector(s)}
function $$(s,d){return Array.from((d||document).querySelectorAll(s))}
function esc(s){return(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}
function rand(min,max){return min+Math.random()*(max-min)}
function randi(min,max){return Math.floor(rand(min,max+1))}

// ===== 路径处理（兼容字符串与对象） =====
const IMG_BASE='../images/';
const THUMB_BASE='../thumbs/';
function getPath(p){
  if(!p) return '';
  if(typeof p==='string') return p;
  return p.path||p.src||p.storage_path||p.url||p.filename||'';
}
// 缩略图：把 images/x.jpg 映射到 ../thumbs/x.webp（保留 _看图王 等后缀，只改扩展名）
// onerror 兜底：webp 加载失败时回退原图 .jpg
function thumb(p){
  const s=getPath(p); if(!s) return '';
  if(s.startsWith('http')) return s;
  let t = s;
  if(t.startsWith('images/')) t = t.slice(7);
  if(t.startsWith('thumbs/')) return '../'+t;
  t = t.replace(/\.jpg$/i, '.webp')
       .replace(/\.jpeg$/i, '.webp')
       .replace(/\.png$/i, '.webp');
  // 返回带 onerror 的对象（用 srcset/onerror 方式不可行，用包装函数生成 img 标签）
  return '../thumbs/'+t;
}
// 全图：灯箱用原图
function full(p){
  const s=getPath(p); if(!s) return '';
  if(s.startsWith('http')) return s;
  if(s.startsWith('images/')) return '../'+s;
  if(s.startsWith('thumbs/')){
    // thumbs/xxx.webp → images/xxx.jpg
    let t = s.replace(/^\.\.\/thumbs\//, 'images/').replace(/^thumbs\//, 'images/');
    t = t.replace(/\.webp$/i, '.jpg');
    return '../'+t;
  }
  return IMG_BASE+s;
}
// 音乐：优先本地 ../music/，CDN URL 保留作 fallback
function musicPath(m){
  if(!m) return '';
  let s = typeof m==='string' ? m : (m.url||m.path||m.storage_path||'');
  if(!s) return '';
  if(s.startsWith('http')) return s; // CDN URL 直用
  if(s.startsWith('music/')) return '../'+s;
  // 兜底：根据文件名拼本地路径
  return '../music/'+s;
}

// ===== 导航 =====
const nav=$('#nav');
const navLinks=$('#navLinks');
const navHamburger=$('#navHamburger');
navHamburger.onclick=()=>{ navHamburger.classList.toggle('open'); navLinks.classList.toggle('open'); };
$$('.nav-links a').forEach(a=>a.onclick=()=>{ navHamburger.classList.remove('open'); navLinks.classList.remove('open'); });

function onScroll(){
  const y=window.scrollY;
  nav.classList.toggle('scrolled', y>60);
  const heroBg=$('#heroBg');
  if(heroBg) heroBg.style.transform = `translate3d(0,${y*0.32}px,0)`;
  $$('.nav-links a').forEach(a=>{
    const id=a.getAttribute('href');
    if(!id||!id.startsWith('#')) return;
    const s=$(id); if(!s) return;
    const r=s.getBoundingClientRect();
    a.classList.toggle('active', r.top<=120 && r.bottom>120);
  });
}
window.addEventListener('scroll', onScroll, {passive:true});

// ===== Hero 星空 =====
function initHeroStars(){
  const c=$('#heroStars'); if(!c) return;
  const ctx=c.getContext('2d');
  let W, H, stars, mouseX=0, mouseY=0;
  const N=80;
  function resize(){
    W = c.parentElement.offsetWidth;
    H = c.parentElement.offsetHeight;
    c.width = W;
    c.height = H;
    stars = Array.from({length:N}, () => ({
      x: Math.random()*W,
      y: Math.random()*H,
      r: rand(0.4, 1.6),
      baseAlpha: rand(0.2, 0.8),
      twinkleSpeed: rand(0.005, 0.02),
      twinklePhase: Math.random()*Math.PI*2,
      driftX: rand(-0.2, 0.2),
      driftY: rand(-0.15, 0.15),
    }));
  }
  resize();
  window.addEventListener('resize', resize);
  c.parentElement.addEventListener('mousemove', e=>{
    const r = c.getBoundingClientRect();
    mouseX = e.clientX - r.left;
    mouseY = e.clientY - r.top;
  });
  let t=0;
  function draw(){
    t++;
    ctx.clearRect(0,0,W,H);
    for(const s of stars){
      // 闪烁
      const tw = Math.sin(t*s.twinkleSpeed + s.twinklePhase);
      const alpha = s.baseAlpha * (0.5 + 0.5*tw);
      // 鼠标视差：附近的星轻微漂移
      const dx = (mouseX - W/2) * 0.02 * s.driftX;
      const dy = (mouseY - H/2) * 0.02 * s.driftY;
      ctx.fillStyle = `rgba(232,228,218,${alpha})`;
      ctx.beginPath();
      ctx.arc(s.x + dx, s.y + dy, s.r, 0, Math.PI*2);
      ctx.fill();
      // 较亮的星加十字光
      if(s.r > 1.1 && tw > 0.3){
        ctx.strokeStyle = `rgba(124,155,126,${alpha*0.4})`;
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.moveTo(s.x+dx-s.r*3, s.y+dy);
        ctx.lineTo(s.x+dx+s.r*3, s.y+dy);
        ctx.moveTo(s.x+dx, s.y+dy-s.r*3);
        ctx.lineTo(s.x+dx, s.y+dy+s.r*3);
        ctx.stroke();
      }
    }
    requestAnimationFrame(draw);
  }
  draw();
}

// ===== 今日一句（开场） =====
function initDailyQuote(){
  const items = [];
  if(typeof essayCategories !== 'undefined'){
    essayCategories.forEach(cat => {
      (cat.articles||[]).forEach(a => {
        if(a.body) items.push({text: a.body, title: a.title, cat: cat.title});
      });
    });
  }
  if(typeof travels !== 'undefined'){
    travels.forEach(a => { if(a.body) items.push({text: a.body, title: a.title, cat: '旅行见闻'}); });
  }
  if(items.length === 0) return;
  // 选一个不太长、不太短的句子
  const sentences = [];
  items.forEach(it => {
    const sents = (it.body||'').split(/[。！？\n]/);
    sents.forEach(s => {
      const t = s.trim();
      if(t.length >= 12 && t.length <= 60) sentences.push({text: t, src: it});
    });
  });
  if(sentences.length === 0) return;
  const pick = sentences[randi(0, sentences.length-1)];
  const dq = $('#dailyQuote');
  const dqText = $('#dailyQuoteText');
  const dqAuthor = $('#dailyQuoteAuthor');
  if(!dq||!dqText) return;
  dqText.textContent = pick.text;
  dqAuthor.textContent = (pick.src.cat||'随笔') + ' · ' + (pick.src.title||'');
  // 显示
  setTimeout(() => dq.classList.add('show'), 800);
  // 5.5s 后淡出
  setTimeout(() => dq.classList.remove('show'), 5500);
  // 点击关闭
  dq.onclick = () => dq.classList.remove('show');
}

// ===== 时间线（随笔） =====
function buildTimeline(){
  const timeline=$('#timeline');
  if(!timeline) return;
  const items=[];
  if(typeof essayCategories !== 'undefined'){
    essayCategories.forEach(cat => (cat.articles||[]).forEach(art => items.push({...art, cat:cat.title, catId:cat.id})));
  }
  if(typeof travels !== 'undefined'){
    travels.forEach(art => items.push({...art, cat:'旅行见闻', catId:'travel'}));
  }
  items.sort((a,b)=>{
    const da=a.date||'', db=b.date||'';
    if(da>db) return -1; if(da<db) return 1;
    return (b.sort_order||0)-(a.sort_order||0);
  });
  if(items.length===0){
    timeline.innerHTML = '<div class="timeline-empty"># 暂无文章 #</div>';
    return;
  }
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
  $$('.timeline-card').forEach(card => {
    card.onclick = () => {
      const idx = parseInt(card.dataset.idx);
      if(!isNaN(idx)) openEssayModal(items[idx]);
    };
  });
  observeFadeUps();
}

// 文章阅读弹窗
let _timelineItems = [];
function openEssayModal(essay){
  const overlay=$('#essayModal');
  const content=$('#essayModalContent');
  if(!overlay||!content) return;
  const curIdx = _timelineItems.findIndex(t => t.title === essay.title);
  const hasPrev = curIdx > 0;
  const hasNext = curIdx < _timelineItems.length - 1;
  function fmtBody(b){
    if(!b) return '';
    return b.split('\n').filter(l=>l.trim()).map(l=>`<p>${esc(l)}</p>`).join('');
  }
  content.innerHTML = `
    <button class="modal-close" onclick="closeEssayModal()">×</button>
    <div class="modal-essay-title">${esc(essay.title)}</div>
    <div class="modal-essay-date">${essay.date||''} · ${essay.cat||''}</div>
    <div class="modal-essay-body">${fmtBody(essay.body)}</div>
    <div class="modal-nav">
      <button class="editor-btn editor-btn-secondary" ${hasPrev?'':'disabled'} onclick="${hasPrev?'openEssayModal(_timelineItems['+ (curIdx-1) +'])':'void 0'}">← 上一篇</button>
      <span style="color:var(--text-muted);font-size:.85rem">${curIdx+1}/${_timelineItems.length}</span>
      <button class="editor-btn editor-btn-secondary" ${hasNext?'':'disabled'} onclick="${hasNext?'openEssayModal(_timelineItems['+ (curIdx+1) +'])':'void 0'}">下一篇 →</button>
    </div>
  `;
  overlay.classList.add('active');
  document.body.style.overflow='hidden';
}
window.openEssayModal = openEssayModal;
function closeEssayModal(){
  $('#essayModal').classList.remove('active');
  document.body.style.overflow='';
}
window.closeEssayModal = closeEssayModal;
$('#essayModal').onclick = e => { if(e.target===e.currentTarget) closeEssayModal(); };

// ===== 记忆河流 · 散落拍立得 =====
let lightboxPhotos = [];
let lightboxIdx = 0;
let allGalleryPhotos = [];
let currentFilter = 'all';
const POLAROID_COUNT = 30;

function buildRiver(){
  allGalleryPhotos = [];
  albums.forEach(function(album){
    (album.photos||[]).forEach(function(photo){
      allGalleryPhotos.push({
        path: photo, src: photo,
        _albumTitle: album.title,
        _albumId: album.id,
        _worldId: album.world||'',
      });
    });
  });
  lightboxPhotos = allGalleryPhotos;
  currentFilter = 'all';
  buildRiverFilters();
  renderRiver();
}

function getFilteredRiver(){
  if(currentFilter === 'all') return allGalleryPhotos;
  return allGalleryPhotos.filter(function(p){
    return (p._worldId||p._albumId||'') === currentFilter || p._albumId === currentFilter;
  });
}

// ===== 记忆河流（队列模式 — 每次都不一样直到看完所有） =====
let _riverQueue = [];
let _riverCycle = 0;
let _riverTotal = 0;
let _riverPoolKey = null;

function ensureRiverQueue(pool){
  if(_riverQueue.length === 0){
    for(var i = 0; i < pool.length; i++) _riverQueue.push(i);
    for(var i = _riverQueue.length - 1; i > 0; i--){
      var j = Math.floor(Math.random() * (i + 1));
      var t = _riverQueue[i]; _riverQueue[i] = _riverQueue[j]; _riverQueue[j] = t;
    }
    _riverCycle++;
  }
}

function renderRiver(){
  var stream = document.getElementById('riverStream');
  if(!stream) return;
  var filtered = getFilteredRiver();
  var pool = filtered.length > 0 ? filtered : allGalleryPhotos;
  _riverTotal = pool.length;

  if(_riverPoolKey !== currentFilter){
    _riverQueue = [];
    _riverCycle = 0;
    _riverPoolKey = currentFilter;
  }

  ensureRiverQueue(pool);
  var n = Math.min(POLAROID_COUNT, pool.length);
  var indices = [];
  for(var i = 0; i < n && _riverQueue.length > 0; i++){
    indices.push(_riverQueue.shift());
  }

  var rotations = [];
  var seed = Date.now() % 10000;
  for(var i = 0; i < indices.length; i++){
    seed = (seed * 16807) % 2147483647;
    rotations.push(((seed % 12) - 6));
  }

  stream.innerHTML = indices.map(function(pi, i){
    var p = pool[pi];
    var rot = rotations[i];
    var name = (typeof p === 'string' ? p : (p.path||p.src||'')).split('/').pop().replace(/看图王\.jpg$|\.jpg$|\.jpeg$/i, '').replace(/^_+/, '');
    return '<div class="polaroid" data-idx="' + pi + '" style="transform:rotate(' + rot + 'deg);z-index:' + (POLAROID_COUNT - i) + '" data-label="' + esc(p._albumTitle||'') + '" data-missing="暂未上传 · ' + esc(name) + '">' +
      '<div class="polaroid-frame"><img src="' + thumb(p) + '" alt="" decoding="async" data-full="' + full(p) + '" data-name="' + esc(name) + '" onload="this.parentElement.parentElement.classList.remove(\'polaroid-loading\')" onerror="if(this.dataset.fb!==\'1\'){this.dataset.fb=\'1\';this.src=this.dataset.full;this.onerror=function(){this.style.display=\'none\';this.parentElement.parentElement.classList.add(\'img-fail-frame\')}"></div>' +
      '<div class="polaroid-caption">' + esc(name) + '</div>' +
    '</div>';
  }).join('');

  stream.querySelectorAll('.polaroid').forEach(function(el){
    el.classList.add('polaroid-loading');
    el.onclick = function(){
      var idx = parseInt(el.dataset.idx);
      if(isNaN(idx)) return;
      lightboxPhotos = pool;
      lightboxIdx = idx;
      openLightbox(idx);
    };
  });

  var hint = document.getElementById('riverHint');
  if(hint){
    var ce = Math.ceil(_riverTotal / POLAROID_COUNT);
    hint.textContent = '轮回 ' + _riverCycle + ' / 约 ' + ce + ' 次（剩余 ' + _riverQueue.length + ' / ' + _riverTotal + ' 张）';
  }

  stream.scrollLeft = 0;
}

function riverScroll(dir){
  var stream = document.getElementById('riverStream');
  if(!stream) return;
  stream.scrollBy({left: dir * 320, behavior: 'smooth'});
  if(window.SFX) window.SFX.flip();
}

function riverShuffle(){
  renderRiver();
  if(window.SFX) window.SFX.shutter();
}

function buildRiverFilters(){
  var container = document.getElementById('viewerFilters');
  if(!container) return;
  var groups = {};
  allGalleryPhotos.forEach(function(p){
    var key = p._albumId || p._worldId || '';
    if(!groups[key]) groups[key] = {id: key, title: p._albumTitle||key, count:0};
    groups[key].count++;
  });
  var filters = [{id:'all', title:'全部', count:allGalleryPhotos.length}];
  Object.keys(groups).forEach(function(k){ filters.push(groups[k]); });
  container.innerHTML = filters.map(function(f){
    return '<div class="river-filter' + (f.id === currentFilter ? ' active' : '') + '" data-filter="' + f.id + '">' + esc(f.title) + ' &#183; ' + f.count + '</div>';
  }).join('');
  container.querySelectorAll('.river-filter').forEach(function(el){
    el.onclick = function(){
      currentFilter = el.dataset.filter;
      container.querySelectorAll('.river-filter').forEach(function(e){ e.classList.remove('active'); });
      el.classList.add('active');
      if(window.SFX) window.SFX.tick();
      renderRiver();
    };
  });
  // 静音按钮
  var mute = document.getElementById('sfxMute');
  if(mute){
    mute.onclick = function(){
      if(window.SFX) window.SFX.toggle();
      mute.textContent = window.SFX && window.SFX.enabled() ? '🔊' : '🔇';
    };
  }
}

window.riverScroll = riverScroll;
window.riverShuffle = riverShuffle;

// ===== 灯箱 v2 =====// ===== 灯箱 v2 =====
let zoom = {scale: 1, x: 0, y: 0};
let lbHideTimer = null;
function lbAutoHideControls(){
  clearTimeout(lbHideTimer);
  $$('#lightbox button, #lightbox .lightbox-counter, #lightbox .lightbox-filmstrip').forEach(el => el.classList.remove('lb-hidden'));
  lbHideTimer = setTimeout(()=>{
    $$('#lightbox button, #lightbox .lightbox-counter, #lightbox .lightbox-filmstrip').forEach(el => el.classList.add('lb-hidden'));
  }, 3000);
}

function openLightbox(idx, kenBurns=false){
  if(idx<0||idx>=lightboxPhotos.length) return;
  lightboxIdx = idx;
  const lb = $('#lightbox');
  const counter = $('#lightboxCounter');

  lb.classList.add('active');
  lb.style.opacity = '1';
  lb.style.pointerEvents = 'auto';
  if(window.SFX) window.SFX.shutter();
  document.body.style.overflow = 'hidden';
  lbZoom = {scale:1, bgX:50, bgY:50, dragging:false, dragX:0, dragY:0};

  // 彻底清空 stage 里的 img（避免残留 src 在中央显示挡住背景图）
  const stage = $('#lightboxStage');
  if(stage) stage.style.display = 'none';
  const img = $('#lightboxImg');
  if(img){
    img.removeAttribute('src');
    img.removeAttribute('style');
  }

  // 关键：先显示"加载中"占位（避免大图加载过程中出现视觉撕裂）
  lb.style.background = '#0E1116 url("data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 40 40%22><circle cx=%2220%22 cy=%2220%22 r=%2214%22 fill=%22none%22 stroke=%22%237C9B7E%22 stroke-width=%223%22 stroke-dasharray=%2280%22><animateTransform attributeName=%22transform%22 type=%22rotate%22 from=%220 20 20%22 to=%22360 20 20%22 dur=%221s%22 repeatCount=%22indefinite%22/></circle></svg>") center/60px no-repeat';

  counter.textContent = (idx+1) + ' / ' + lightboxPhotos.length;
  lbAutoHideControls();

  // 预加载原图，加载完成后再切换背景
  const photo = lightboxPhotos[idx];
  const src = full(photo);
  lb.dataset.lbSrc = src;
  const pre = new Image();
  pre.onload = function(){
    lb.style.background = '#000 url(' + src + ') center/contain no-repeat';
  };
  pre.onerror = function(){
    lb.style.background = '#000 url(' + src + ') center/contain no-repeat';
  };
  pre.src = src;
}
window.openLightbox = openLightbox;

// 缩放状态
let lbZoom = {scale:1, bgX:50, bgY:50, dragging:false, dragX:0, dragY:0};

function applyBgZoom(lb){
  if(!lb) return;
  var src = lb.dataset.lbSrc;
  if(!src) return;
  if(lbZoom.scale <= 1.01){
    lb.style.background = '#000 url('+src+') center/contain no-repeat';
    lbZoom.bgX = 50; lbZoom.bgY = 50;
  } else {
    lb.style.background = '#000 url('+src+') '+lbZoom.bgX+'% '+lbZoom.bgY+'% / '+(lbZoom.scale*100)+'% no-repeat';
  }
  // 缩放指示器
  var zInd = document.getElementById('lightboxZoomIndicator');
  if(zInd){
    if(lbZoom.scale > 1.01){
      zInd.textContent = Math.round(lbZoom.scale*100)+'%';
      zInd.classList.add('show');
    } else {
      zInd.classList.remove('show');
    }
  }
}

function applyZoom(){
  const img = $('#lightboxImg');
  if(!img) return;
  img.style.transform = `translate(${zoom.x}px, ${zoom.y}px) scale(${zoom.scale})`;
}
function updateZoomIndicator(){
  const ind = $('#lightboxZoomIndicator');
  if(!ind) return;
  if(zoom.scale > 1.01){ ind.textContent = Math.round(zoom.scale*100)+'%'; ind.classList.add('show'); }
  else ind.classList.remove('show');
}

function renderFilmstrip(kenBurns){
  const strip = $('#lightboxFilmstrip');
  if(!strip || lightboxPhotos.length < 4){ if(strip) strip.classList.remove('show'); return; }
  strip.innerHTML = lightboxPhotos.map((p,i) =>
    `<div class="fs-item${i===lightboxIdx?' active':''}" data-fs="${i}"><img src="${thumb(p)}" alt=""></div>`
  ).join('');
  strip.classList.add('show');
  strip.querySelectorAll('[data-fs]').forEach(el => el.onclick = () => openLightbox(parseInt(el.dataset.fs)));
  const active = strip.querySelector('.fs-item.active');
  if(active) active.scrollIntoView({inline:'center', block:'nearest'});
}

function navLightbox(dir){
  lightboxIdx += dir;
  if(lightboxIdx < 0) lightboxIdx = lightboxPhotos.length - 1;
  if(lightboxIdx >= lightboxPhotos.length) lightboxIdx = 0;
  if(window.SFX) window.SFX.flip();
  openLightbox(lightboxIdx);
}
window.navLightbox = navLightbox;

function closeLightbox(){
  const lb = $('#lightbox');
  lb.classList.remove('active');
  lb.style.opacity = '0';
  lb.style.pointerEvents = 'none';
  lb.style.background = '#000';
  document.body.style.overflow = '';
  if(window.SFX) window.SFX.click();
  // 恢复 stage 显示（万一后续用）
  const stage = $('#lightboxStage');
  if(stage) stage.style.display = '';
  const img = $('#lightboxImg');
  if(img){
    img.removeAttribute('src');
    img.removeAttribute('style');
  }
  clearTimeout(lbHideTimer);
}
window.closeLightbox = closeLightbox;

// 灯箱交互
function bindLightboxInteractions(){
  const lb = $('#lightbox');
  if(!lb) return;

  // 双击：居中 2.5x 缩放
  lb.addEventListener('dblclick', e => {
    e.preventDefault();
    const r = lb.getBoundingClientRect();
    if(lbZoom.scale > 1.01){
      lbZoom.scale = 1;
    } else {
      lbZoom.scale = 2.5;
      lbZoom.bgX = ((e.clientX - r.left) / r.width * 100);
      lbZoom.bgY = ((e.clientY - r.top) / r.height * 100);
    }
    applyBgZoom(lb);
    lbAutoHideControls();
  });

  // 滚轮：光标居中缩放
  lb.addEventListener('wheel', e => {
    if(!lb.classList.contains('active')) return;
    e.preventDefault();
    const r = lb.getBoundingClientRect();
    const mx = ((e.clientX - r.left) / r.width * 100);
    const my = ((e.clientY - r.top) / r.height * 100);
    const factor = e.deltaY < 0 ? 1.2 : 1/1.2;
    const ns = Math.max(1, Math.min(5, lbZoom.scale * factor));
    lbZoom.bgX = mx - (mx - lbZoom.bgX) * (ns / lbZoom.scale);
    lbZoom.bgY = my - (my - lbZoom.bgY) * (ns / lbZoom.scale);
    lbZoom.scale = ns;
    applyBgZoom(lb);
    lbAutoHideControls();
  }, {passive:false});

  // 鼠标拖动（缩放时）
  lb.addEventListener('mousedown', e => {
    if(lbZoom.scale <= 1.01) return;
    lbZoom.dragging = true;
    lbZoom.dragX = e.clientX;
    lbZoom.dragY = e.clientY;
    lbAutoHideControls();
  });
  window.addEventListener('mousemove', e => {
    if(!lbZoom.dragging) return;
    var w = lb.offsetWidth || 1280, h = lb.offsetHeight || 720;
    var dx = (e.clientX - lbZoom.dragX) / w * 100 / lbZoom.scale;
    var dy = (e.clientY - lbZoom.dragY) / h * 100 / lbZoom.scale;
    lbZoom.bgX -= dx;
    lbZoom.bgY -= dy;
    lbZoom.dragX = e.clientX;
    lbZoom.dragY = e.clientY;
    applyBgZoom(lb);
  });
  window.addEventListener('mouseup', function(){ lbZoom.dragging = false; });

  // 触摸
  var tdMode='none', tdStartX=0, tdStartY=0, tdStartBgX=50, tdStartBgY=50, tdDistX=0, tdStartDist=0;
  lb.addEventListener('touchstart', function(e){
    lbAutoHideControls();
    if(e.touches.length === 1){
      tdStartX = e.touches[0].clientX;
      tdStartY = e.touches[0].clientY;
      tdStartBgX = lbZoom.bgX;
      tdStartBgY = lbZoom.bgY;
      tdDistX = 0;
      tdMode = lbZoom.scale > 1.01 ? 'pan' : 'swipe';
    } else if(e.touches.length === 2){
      var dx = e.touches[0].clientX - e.touches[1].clientX;
      var dy = e.touches[0].clientY - e.touches[1].clientY;
      tdStartDist = Math.hypot(dx, dy);
      tdMode = 'pinch';
    }
  }, {passive:false});
  lb.addEventListener('touchmove', function(e){
    var w = lb.offsetWidth || 1280, h = lb.offsetHeight || 720;
    if(tdMode === 'pan' && e.touches.length === 1){
      var dx = (e.touches[0].clientX - tdStartX) / w * 100 / lbZoom.scale;
      var dy = (e.touches[0].clientY - tdStartY) / h * 100 / lbZoom.scale;
      lbZoom.bgX = tdStartBgX - dx;
      lbZoom.bgY = tdStartBgY - dy;
      applyBgZoom(lb);
    } else if(tdMode === 'swipe' && e.touches.length === 1){
      tdDistX = e.touches[0].clientX - tdStartX;
    } else if(tdMode === 'pinch' && e.touches.length === 2){
      var dx2 = e.touches[0].clientX - e.touches[1].clientX;
      var dy2 = e.touches[0].clientY - e.touches[1].clientY;
      var d = Math.hypot(dx2, dy2);
      lbZoom.scale = Math.max(1, Math.min(5, lbZoom.scale * (d / tdStartDist)));
      applyBgZoom(lb);
    }
  }, {passive:false});
  lb.addEventListener('touchend', function(){
    if(tdMode === 'swipe' && Math.abs(tdDistX) > 50){
      navLightbox(tdDistX > 0 ? -1 : 1);
    }
    tdMode = 'none';
  });
}

// 键盘
document.addEventListener('keydown', e => {
  if($('#lightbox').classList.contains('active')){
    if(e.key === 'ArrowLeft') navLightbox(-1);
    else if(e.key === 'ArrowRight') navLightbox(1);
    else if(e.key === 'Escape' || e.key === ' ') closeLightbox();
  }
  if($('#essayModal').classList.contains('active') && e.key === 'Escape') closeEssayModal();
});

// ===== 随机回忆（Ken Burns） =====
function shuffleMemory(){
  if(allGalleryPhotos.length === 0) return;
  const idx = randi(0, allGalleryPhotos.length-1);
  lightboxPhotos = allGalleryPhotos;
  openLightbox(idx, false);
  // 自动播放音乐
  if(typeof togglePlay === 'function' && bgMusic && !isPlaying){
    bgMusic.play().catch(()=>{});
  }
}
window.shuffleMemory = shuffleMemory;

// ===== 年份热力图 =====
function buildYearHeatmap(){
  const grid = $('#heatmapGrid');
  if(!grid) return;
  // 统计每天的条目数（文章+照片，按日期）
  const counts = {};
  function addDate(d){
    if(!d) return;
    // d 形如 "2026.6.22" 或 "2026-06-22"
    const m = String(d).match(/(\d{4})[.\-/年](\d{1,2})[.\-/月](\d{1,2})/);
    if(!m) return;
    const key = `${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`;
    counts[key] = (counts[key]||0) + 1;
  }
  if(typeof essayCategories !== 'undefined'){
    essayCategories.forEach(cat => (cat.articles||[]).forEach(a => addDate(a.date)));
  }
  if(typeof travels !== 'undefined') travels.forEach(a => addDate(a.date));

  // 生成 52 周 × 7 天 的网格（最近一年）
  const today = new Date();
  const startDate = new Date(today);
  startDate.setDate(startDate.getDate() - 364);
  // 对齐到周日开始
  const dow = startDate.getDay();
  startDate.setDate(startDate.getDate() - dow);

  const maxCount = Math.max(1, ...Object.values(counts));
  const cells = [];
  const monthLabels = [];
  let lastMonth = -1;
  for(let week=0; week<53; week++){
    for(let day=0; day<7; day++){
      const d = new Date(startDate);
      d.setDate(d.getDate() + week*7 + day);
      if(d > today) continue;
      const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
      const c = counts[key] || 0;
      let level = 0;
      if(c > 0) level = Math.min(4, Math.ceil((c/maxCount)*4));
      cells.push({d, key, level, count: c});
      // 月份标签（每个月的第一格上方）
      const m = d.getMonth();
      if(d.getDate() <= 7 && m !== lastMonth){
        monthLabels.push({week, month: m});
        lastMonth = m;
      }
    }
  }

  const monthNames = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'];
  let html = '<div style="display:flex;flex-direction:column;gap:2px">';
  // 月份标签行
  html += '<div style="display:flex;gap:2px;padding-left:24px;font-size:.65rem;color:var(--text-muted)">';
  for(let i=0;i<53;i++) html += `<div style="flex:1">${monthLabels.find(m=>m.week===i) ? monthNames[monthLabels.find(m=>m.week===i).month] : ''}</div>`;
  html += '</div>';
  // 周日开始
  html += '<div style="display:flex;gap:2px"><div style="display:flex;flex-direction:column;gap:2px;font-size:.6rem;color:var(--text-muted);margin-right:4px"><span>日</span><span></span><span>一</span><span></span><span>二</span><span></span><span>三</span><span></span><span>四</span><span></span><span>五</span><span></span><span>六</span></div>';
  // 7 行（周日到周六）× 53 列
  for(let day=0; day<7; day++){
    html += '<div style="display:flex;flex-direction:column;gap:2px;flex:1;min-width:0">';
    for(let week=0; week<53; week++){
      const cell = cells.find(c => {
        const diff = Math.floor((c.d - startDate)/(1000*60*60*24));
        return diff === week*7 + day;
      });
      if(cell){
        html += `<div class="heatmap-cell" data-level="${cell.level}" data-key="${cell.key}" data-count="${cell.count}" data-date="${cell.d.getFullYear()}.${cell.d.getMonth()+1}.${cell.d.getDate()}" style="aspect-ratio:1;flex:1"></div>`;
      } else {
        html += '<div style="aspect-ratio:1;flex:1"></div>';
      }
    }
    html += '</div>';
  }
  html += '</div></div>';
  grid.innerHTML = html;

  // tooltip
  const tooltip = $('#heatmapTooltip');
  grid.querySelectorAll('.heatmap-cell').forEach(cell => {
    cell.addEventListener('mouseenter', e => {
      const date = cell.dataset.date;
      const count = cell.dataset.count;
      const level = cell.dataset.level;
      if(level === '0' && count === '0') return;
      tooltip.textContent = `${date} · ${count} 条`;
      tooltip.style.display = 'block';
    });
    cell.addEventListener('mousemove', e => {
      tooltip.style.left = (e.clientX - 30) + 'px';
      tooltip.style.top = (e.clientY - 36) + 'px';
    });
    cell.addEventListener('mouseleave', () => {
      tooltip.style.display = 'none';
    });
  });
}

// ===== 旧世界密码 =====
let pwdCallback=null;
function showPwdModal(cb){ pwdCallback=cb; $('#pwdOverlay').classList.add('active'); $('#pwdError').textContent=''; $('#pwdInput').value=''; setTimeout(()=>$('#pwdInput').focus(),100); }
window.showPwdModal=showPwdModal;
function closePwdModal(){ $('#pwdOverlay').classList.remove('active'); pwdCallback=null; }
window.closePwdModal=closePwdModal;
function checkPwd(){
  const input=$('#pwdInput').value.trim();
  const correct=(typeof sitePassword!=='undefined')?sitePassword:'郑天游';
  if(input===correct){
    try{localStorage.setItem('memories_oldworld','1')}catch(e){}
    closePwdModal();
    if(pwdCallback) pwdCallback();
    if(typeof window.openOldWorld==='function') window.openOldWorld();
  } else {
    $('#pwdError').textContent='密码不对喔';
  }
}
window.checkPwd=checkPwd;
$('#pwdInput').onkeydown=e=>{if(e.key==='Enter')checkPwd();};

function handleAlbumClick(albumId){
  const album = (albums||[]).find(a=>a.id===albumId);
  if(!album) return;
  if(typeof worlds!=='undefined'){
    const oldworld = worlds.find(w=>w.id==='oldworld');
    if(oldworld){
      const isOldWorld = (album.world==='oldworld')||(oldworld.children&&oldworld.children.includes(albumId));
      if(isOldWorld&&!localStorage.getItem('memories_oldworld')){
        showPwdModal(()=>openAlbumLightbox(albumId));
        return;
      }
    }
  }
  openAlbumLightbox(albumId);
}
function openAlbumLightbox(albumId){
  const album = (albums||[]).find(a=>a.id===albumId);
  if(!album||!album.photos||album.photos.length===0) return;
  lightboxPhotos = album.photos.map(p=>({path:p, src:p, _albumTitle:album.title}));
  openLightbox(0);
}

// ===== 音乐播放器 + 可视化 =====
let currentPlaylistId=null, currentSongIdx=0, isPlaying=false, bgMusic=null;
let audioCtx=null, analyser=null, audioSource=null, visBars;

function initMusic(){
  bgMusic=$('#bgMusic');
  if(!bgMusic) return;
  bgMusic.volume=0.5;
  bgMusic.addEventListener('timeupdate',()=>{
    if(bgMusic.duration){
      $('#playerProgress').style.width = (bgMusic.currentTime/bgMusic.duration)*100+'%';
    }
  });
  bgMusic.addEventListener('ended',nextSong);
  bgMusic.addEventListener('play',()=>{isPlaying=true;$('#playBtn').textContent='⏸';visStart();});
  bgMusic.addEventListener('pause',()=>{isPlaying=false;$('#playBtn').textContent='▶';visStop();});
  bgMusic.addEventListener('error',()=>nextSong());

  visBars = $$('#playerVisualizer span');

  if(typeof playlist!=='undefined'&&Array.isArray(playlist)&&playlist.length>0){
    switchPlaylist(playlist);
  }
}

function setupAudioAnalyser(){
  if(audioCtx) return;
  try{
    audioCtx = new (window.AudioContext||window.webkitAudioContext)();
    audioSource = audioCtx.createMediaElementSource(bgMusic);
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 64;
    audioSource.connect(analyser);
    analyser.connect(audioCtx.destination);
  }catch(e){ audioCtx=null; }
}
function visStart(){
  if(!audioCtx) setupAudioAnalyser();
  if(!analyser) return;
  if(audioCtx.state==='suspended') audioCtx.resume();
  $('#playerVisualizer').classList.add('active');
  visTick();
}
function visStop(){
  $('#playerVisualizer').classList.remove('active');
}
function visTick(){
  if(!isPlaying || !analyser) return;
  const data = new Uint8Array(analyser.frequencyBinCount);
  analyser.getByteFrequencyData(data);
  // 4 根柱：取 4 个频段
  const len = data.length;
  const seg = Math.floor(len/4);
  for(let i=0;i<4;i++){
    let sum=0;
    for(let j=0;j<seg;j++) sum += data[i*seg+j];
    const v = sum/seg/255; // 0~1
    const h = 4 + v*14;
    if(visBars[i]) visBars[i].style.height = h+'px';
  }
  requestAnimationFrame(visTick);
}

function switchPlaylist(songs){ window._currentSongs=songs; currentSongIdx=0; playSong(0); }
function playSong(idx){
  const songs=window._currentSongs;
  if(!songs||idx>=songs.length||idx<0) return;
  currentSongIdx=idx;
  const s=songs[idx];
  // 优先用本地 ../music/（CDN 偶尔不稳定），CDN 链接保留作 fallback
  const localUrl = musicPath((s.name||s.title)+'.mp3');
  const url = localUrl.includes('../music/') ? localUrl : (s.url || localUrl);
  if(bgMusic){
    bgMusic.src=url;
    bgMusic.load();
    bgMusic.play().catch(()=>{});
    $('#playerTitle').textContent=s.name||s.title||'未知';
  }
}
function togglePlay(){
  if(!bgMusic) return;
  if(isPlaying) bgMusic.pause();
  else bgMusic.play().catch(()=>{});
}
window.togglePlay=togglePlay;
function prevSong(){
  const songs=window._currentSongs;
  if(!songs||songs.length===0) return;
  let idx=currentSongIdx-1; if(idx<0) idx=songs.length-1;
  playSong(idx);
}
window.prevSong=prevSong;
function nextSong(){
  const songs=window._currentSongs;
  if(!songs||songs.length===0) return;
  let idx=currentSongIdx+1; if(idx>=songs.length) idx=0;
  playSong(idx);
}
window.nextSong=nextSong;
function seek(e){
  if(!bgMusic||!bgMusic.duration) return;
  const rect=e.currentTarget.getBoundingClientRect();
  const pct=(e.clientX-rect.left)/rect.width;
  bgMusic.currentTime=pct*bgMusic.duration;
}
window.seek=seek;
function togglePlayer(){ $('#player').classList.toggle('collapsed'); }
window.togglePlayer=togglePlayer;

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
  $$('.fade-up').forEach(el=>{ if(!el.classList.contains('visible')) observer.observe(el); });
  $$('.timeline-item').forEach(el=>{ if(!el.classList.contains('visible')) observer.observe(el); });
}

// ===== 时间线索引填充 =====
function fillTimelineIndex(){
  _timelineItems=[];
  if(typeof essayCategories !== 'undefined'){
    essayCategories.forEach(cat => (cat.articles||[]).forEach(art => _timelineItems.push({...art, cat:cat.title, catId:cat.id})));
  }
  if(typeof travels !== 'undefined'){
    travels.forEach(art => _timelineItems.push({...art, cat:'旅行见闻', catId:'travel'}));
  }
  // 排序：先按 sort_order（编辑器自定义），再按日期（新的在上）
  _timelineItems.sort((a,b)=>{
    var ao=a.sort_order!=null?a.sort_order:0, bo=b.sort_order!=null?b.sort_order:0;
    if(ao!==bo) return ao-bo;
    var da=a.date||'', db=b.date||'';
    if(da>db) return -1; if(da<db) return 1;
    return 0;
  });
  // 从 Supabase 同步 sort_order（如果已编辑过）
  loadSortOrderFromDB();
}
async function loadSortOrderFromDB(){
  var sb = window._supabaseClient;
  if(!sb && typeof supabase !== 'undefined'){
    try{
      sb = supabase.createClient('https://mvzbkuhwapdqcdkekczh.supabase.co','sb_publishable_1yOf4jtKqK1GApN3InC7Gg_TUD2Barb');
    }catch(e){}
    window._supabaseClient = sb;
  }
  if(!sb) return;
  try{
    var {data:items} = await sb.from('essays').select('title,date,sort_order');
    if(items && items.length > 0){
      items.forEach(function(dbItem){
        var found = _timelineItems.find(function(t){ return t.title === dbItem.title && t.date === dbItem.date; });
        if(found) found.sort_order = dbItem.sort_order;
      });
      // 重新排序
      _timelineItems.sort((a,b)=>{
        var ao=a.sort_order!=null?a.sort_order:0, bo=b.sort_order!=null?b.sort_order:0;
        if(ao!==bo) return ao-bo;
        var da=a.date||'', db=b.date||'';
        if(da>db) return -1; if(da<db) return 1;
        return 0;
      });
      buildTimeline();
    }
  }catch(e){}
}

// ===== Supabase 同步（把 data.js 现有内容同步到云端，让编辑器有真实数据可改） =====
const SB_URL = 'https://mvzbkuhwapdqcdkekczh.supabase.co';
const SB_KEY = 'sb_publishable_1yOf4jtKqK1GApN3InC7Gg_TUD2Barb';
let SB = null;
try { SB = supabase.createClient(SB_URL, SB_KEY); } catch(e) { SB = null; }

function dbQ(){
  if(SB) return SB;
  // 离线 mock
  const qb = r => new Proxy({},{get:(_,p)=>{
    if(['select','insert','update','delete','upsert','order','eq','limit','single','maybeSingle','filter','match'].includes(p)) return ()=>qb(r);
    if(p==='then') return res=>res(r);
    if(p==='catch') return ()=>{};
    return ()=>qb(r);
  }});
  return {from:()=>qb({data:[],error:null})};
}

// 把 data.js 现有内容灌到 Supabase（完整版：表空时 bulk insert，否则 per-item merge）
async function ensureSync(){
  if(!SB) return;
  try{
    // === 1. 文章：表空 bulk insert，否则 merge ===
    const {count:essaysCount} = await SB.from('essays').select('*', {count:'exact', head:true});
    const allEssays = [];
    if(typeof essayCategories !== 'undefined'){
      essayCategories.forEach(cat => (cat.articles||[]).forEach((art, i) => {
        allEssays.push({
          category: cat.id, category_title: cat.title,
          title: art.title, date: art.date || '', body: art.body || '',
          sort_order: i,
        });
      }));
    }
    if(typeof travels !== 'undefined'){
      travels.forEach((art, i) => {
        allEssays.push({
          category: 'travel', category_title: '旅行见闻',
          title: art.title, date: art.date || '', body: art.body || '',
          sort_order: -(i+1),
        });
      });
    }
    if(!essaysCount || essaysCount === 0){
      // 空表 → 批量插入
      for(let i=0; i<allEssays.length; i+=50){
        await SB.from('essays').insert(allEssays.slice(i, i+50));
      }
    } else {
      // 有数据 → merge：每条检查并补缺
      for(const e of allEssays){
        const {data:exist} = await SB.from('essays').select('id').eq('title', e.title).eq('category', e.category).limit(1);
        if(!exist || exist.length === 0){
          await SB.from('essays').insert(e);
        }
      }
    }

    // === 2. 相册 ===
    if(Array.isArray(albums)){
      const {count:albumsCount} = await SB.from('albums').select('*', {count:'exact', head:true});
      console.log('[memories] albums count before sync:', albumsCount);
      // albums 表当前 schema: id, title, cover, sort_order, created_at（无 photo_count）
      const allAlbums = albums.map((a, i) => ({
        title: a.title, sort_order: i,
        cover: a.cover || '',
      }));
      if(!albumsCount || albumsCount === 0){
        try{
          const r = await SB.from('albums').insert(allAlbums);
          console.log('[memories] albums insert result:', JSON.stringify(r));
        } catch(e){
          console.warn('[memories] albums insert error:', e.message, e.details);
        }
      } else {
        for(let i=0; i<allAlbums.length; i++){
          const a = allAlbums[i];
          const {data:exist} = await SB.from('albums').select('id').eq('title', a.title).limit(1);
          if(!exist || exist.length === 0){
            await SB.from('albums').insert(a);
          } else {
            await SB.from('albums').update({cover: a.cover, sort_order: i}).eq('id', exist[0].id);
          }
        }
      }
    }

    // === 3. 音乐 ===
    if(typeof playlist !== 'undefined' && Array.isArray(playlist)){
      const {count:musicCount} = await SB.from('music').select('*', {count:'exact', head:true});
      const allMusic = playlist.map((m, i) => ({
        title: m.name || m.title,
        artist: m.artist || '',
        storage_path: m.url || `music/${m.name || m.title}.mp3`,
        sort_order: i, album_id: null,
      })).filter(m => m.title);
      if(allMusic.length === 0) return;
      if(!musicCount || musicCount === 0){
        await SB.from('music').insert(allMusic);
      } else {
        for(const m of allMusic){
          const {data:exist} = await SB.from('music').select('id').eq('title', m.title).is('album_id', null).limit(1);
          if(!exist || exist.length === 0){
            await SB.from('music').insert(m);
          }
        }
      }
    }
    console.log('[memories] ensureSync done');
  } catch(e){
    console.warn('[memories] ensureSync failed:', e);
  }
}

// 从 Supabase 拉所有内容（编辑器打开前先拉一次，编辑器直接显示）
async function loadFromSupabase(){
  if(!SB) return null;
  try{
    const [{data:albumsData}, {data:essaysData}, {data:musicData}] = await Promise.all([
      SB.from('albums').select('*').order('sort_order', {ascending:true}),
      SB.from('essays').select('*').order('sort_order', {ascending:true}),
      SB.from('music').select('*').order('sort_order', {ascending:true}),
    ]);
    return {
      albums: albumsData || [],
      essays: essaysData || [],
      music: musicData || [],
    };
  } catch(e){
    return null;
  }
}

// ===== 初始化 =====
function init(){
  console.log('[memories] init() start');
  initHeroStars();
  initMusic();
  fillTimelineIndex();
  buildTimeline();
  buildRiver();
  buildYearHeatmap();
  bindLightboxInteractions();
  initDailyQuote();
  observeFadeUps();

  // 齿轮
  const gear=$('#navGear');
  if(gear) gear.onclick = () => { if(window.EDITOR && window.EDITOR.open) window.EDITOR.open(); };

  // 随机
  const shuffle=$('#navShuffle');
  if(shuffle) shuffle.onclick = shuffleMemory;

  // 同步 data.js → Supabase（让编辑器有真实数据）— 暴露 promise 给 editor 共享
  window.MemoriesReady = ensureSync();

  // 全局媒体观察
  const mo = new MutationObserver(()=>{ observeFadeUps(); });
  mo.observe(document.body,{childList:true,subtree:true});
}

if(document.readyState==='complete') init();
else window.addEventListener('load',init);

})();
