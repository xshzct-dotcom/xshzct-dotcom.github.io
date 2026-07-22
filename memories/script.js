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
// 用 jsdelivr CDN 加速 — GitHub Pages 限流会 429
const REPO = 'xshzct-dotcom/xshzct-dotcom.github.io@main';
const IMG_BASE = 'https://cdn.jsdelivr.net/gh/'+REPO+'/images/';
const THUMB_BASE = 'https://cdn.jsdelivr.net/gh/'+REPO+'/thumbs/';
const MUSIC_BASE = 'https://xshzct-dotcom.github.io/music/';
function getPath(p){
  if(!p) return '';
  if(typeof p==='string') return p;
  return p.path||p.src||p.storage_path||p.url||p.filename||'';
}
// 缩略图：images/x.jpg → thumbs CDN 路径/x.webp（CDN 加速，免 429）
function thumb(p){
  const s=getPath(p); if(!s) return '';
  if(s.startsWith('http')) return s;
  let t = s;
  if(t.startsWith('images/')) t = t.slice(7);
  if(t.startsWith('thumbs/')) return THUMB_BASE+t.slice(7);
  t = t.replace(/\.jpg$/i, '.webp')
       .replace(/\.jpeg$/i, '.webp')
       .replace(/\.png$/i, '.webp');
  return THUMB_BASE+t;
}
// 全图：灯箱用原图
function full(p){
  const s=getPath(p); if(!s) return '';
  if(s.startsWith('http')) return s;
  if(s.startsWith('images/')) return IMG_BASE+s.slice(7);
  if(s.startsWith('thumbs/')){
    // thumbs/xxx.webp → images/xxx.jpg
    let t = s.replace(/^\.\.\/thumbs\//, 'images/').replace(/^thumbs\//, 'images/');
    t = t.replace(/\.webp$/i, '.jpg');
    return IMG_BASE+t.slice(7);
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
    <div class="timeline-item fade-up cat-${item.catId}" data-idx="${i}">
      <div class="timeline-dot"></div>
      <div class="timeline-card" data-idx="${i}">
        <div class="tl-date">${item.date||''}</div>
        <div class="tl-title">${esc(item.title)}</div>
        <div class="tl-excerpt">${esc(excerpt(item.body,120))}</div>
        <span class="tl-cat" style="color:var(--cat-${item.catId})">● ${item.cat}</span>
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
window._timelineItems = _timelineItems;
function openEssayModal(essay, catOnly){
  const overlay=$('#essayModal');
  const content=$('#essayModalContent');
  if(!overlay||!content) return;
  // 如果 catOnly 为 true，只在同分类内导航
  const pool = catOnly ? window._timelineItems.filter(t => t.catId === essay.catId) : window._timelineItems;
  const curIdx = pool.findIndex(t => t.title === essay.title);
  const hasPrev = curIdx >= 0 && curIdx > 0;
  const hasNext = curIdx >= 0 && curIdx < pool.length - 1;
  // 存数据和函数到 window，供按钮回调
  window._essayPool = pool;
  window._essayIdx = curIdx;
  function fmtBody(b){
    if(!b) return '';
    return b.split('\n').filter(l=>l.trim()).map(l=>`<p>${esc(l)}</p>`).join('');
  }
  content.innerHTML = `
    <button class="modal-close" onclick="closeEssayModal()">×</button>
    <div class="modal-essay-title">${esc(essay.title)}</div>
    <div class="modal-essay-date">${essay.date||''} · <span style="color:var(--cat-${essay.catId})">● ${esc(essay.cat||'')}</span></div>
    <div class="modal-essay-body">${fmtBody(essay.body)}</div>
    <div class="modal-nav">
      <button class="editor-btn editor-btn-secondary essay-prev" ${hasPrev?'':'disabled'}>← 上一篇</button>
      <span style="color:var(--text-muted);font-size:.85rem">${curIdx+1}/${pool.length}</span>
      <button class="editor-btn editor-btn-secondary essay-next" ${hasNext?'':'disabled'}>下一篇 →</button>
    </div>
  `;
  // 用 dom 监听代替 onclick
  var prevBtn = content.querySelector('.essay-prev');
  var nextBtn = content.querySelector('.essay-next');
  if(prevBtn && hasPrev) prevBtn.onclick = function(){ window.goPrevEssay(); };
  if(nextBtn && hasNext) nextBtn.onclick = function(){ window.goNextEssay(); };
  window.goPrevEssay = function(){ if(window._essayIdx>0) openEssayModal(window._essayPool[window._essayIdx-1], true); };
  window.goNextEssay = function(){ if(window._essayIdx<window._essayPool.length-1) openEssayModal(window._essayPool[window._essayIdx+1], true); };
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

// ===== 全局加载进度 =====
let _galleryLoadTotal = 0;
let _galleryLoadDone = 0;
function updateGalleryLoadProgress(){
  _galleryLoadDone++;
  const el = document.getElementById('galleryLoadProgress');
  if(el) el.textContent = _galleryLoadDone + ' / ' + _galleryLoadTotal + ' 张已加载';
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

  _galleryLoadTotal += indices.length;
  stream.innerHTML = indices.map(function(pi, i){
    var p = pool[pi];
    var rot = rotations[i];
    var name = (typeof p === 'string' ? p : (p.path||p.src||'')).split('/').pop().replace(/看图王\.jpg$|\.jpg$|\.jpeg$/i, '').replace(/^_+/, '');
    return '<div class="polaroid" data-idx="' + pi + '" style="transform:rotate(' + rot + 'deg);z-index:' + (POLAROID_COUNT - i) + '" data-label="' + esc(p._albumTitle||'') + '" data-missing="暂未上传 · ' + esc(name) + '">' +
      '<div class="polaroid-frame"><img src="' + thumb(p) + '" alt="" decoding="async" data-full="' + full(p) + '" data-name="' + esc(name) + '"></div>' +
      '<div class="polaroid-caption">' + esc(name) + '</div>' +
    '</div>';
  }).join('');

  // 绑定 onload/onerror（分离绑定避免转义问题）
  stream.querySelectorAll('.polaroid img').forEach(function(img){
    var polaroid = img.parentElement.parentElement;
    img.onload = function(){
      polaroid.classList.remove('polaroid-loading');
      updateGalleryLoadProgress();
    };
    img.onerror = function(){
      if(img.dataset.fb !== '1'){
        img.dataset.fb = '1';
        img.src = img.dataset.full;
      } else if(img.dataset.fb !== '2'){
        // 第三级回退：去掉 _看图王 后缀
        img.dataset.fb = '2';
        img.src = img.dataset.full.replace('_看图王', '');
      } else {
        img.style.display = 'none';
        polaroid.classList.add('img-fail-frame');
      }
    };
  });

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
// 按钮一直显示，不自动隐藏
function lbAutoHideControls(){
  clearTimeout(lbHideTimer);
  $$('#lightbox button, #lightbox .lightbox-counter, #lightbox .lightbox-filmstrip').forEach(el => el.classList.remove('lb-hidden'));
}

// ===== 灯箱（用 <img> + transform 实现 Windows Photo Viewer 风格平滑缩放） =====
let lbZoom = {scale:1, x:0, y:0, dragging:false, lastX:0, lastY:0};
let lbAnimating = false;  // 防止过渡期间重复触发

function applyTransform(){
  const img = $('#lightboxImg');
  if(!img) return;
  // 拖动时立刻响应，缩放时用 transition
  if(lbZoom.dragging){
    img.style.transition = 'none';
  } else {
    img.style.transition = 'transform .28s cubic-bezier(.2,0,.2,1)';
  }
  img.style.transform = 'translate(' + lbZoom.x + 'px,' + lbZoom.y + 'px) scale(' + lbZoom.scale + ')';
  // 缩放指示器
  const ind = $('#lightboxZoomIndicator');
  if(ind){
    if(lbZoom.scale > 1.01){
      ind.textContent = Math.round(lbZoom.scale*100) + '%';
      ind.classList.add('show');
    } else {
      ind.classList.remove('show');
    }
  }
  // 调整光标
  if(lbZoom.scale > 1.01){
    $('#lightbox').classList.add('is-zoomed');
  } else {
    $('#lightbox').classList.remove('is-zoomed');
  }
}

// 重置缩放
function resetZoom(){
  lbZoom.scale = 1;
  lbZoom.x = 0;
  lbZoom.y = 0;
}

// 平滑缩放到指定值（以光标位置为中心）
function zoomTo(newScale, anchorX, anchorY, withAnim){
  const lb = $('#lightbox');
  if(!lb) return;
  const r = lb.getBoundingClientRect();
  // 光标在屏幕上的位置（相对灯箱中心）
  const cx = (typeof anchorX === 'number') ? anchorX - r.left - r.width/2 : 0;
  const cy = (typeof anchorY === 'number') ? anchorY - r.top - r.height/2 : 0;
  const oldScale = lbZoom.scale;
  const finalScale = Math.max(1, Math.min(5, newScale));
  // 缩放后保持光标位置不变
  // 公式：x_new = cx - cx * (scale_new/scale_old) + x_old * (scale_new/scale_old)
  // 简化：x_new = (x_old - cx) * (finalScale/oldScale) + cx
  const ratio = finalScale / oldScale;
  lbZoom.x = (lbZoom.x - cx) * ratio + cx;
  lbZoom.y = (lbZoom.y - cy) * ratio + cy;
  lbZoom.scale = finalScale;
  // 防止双击动画中又触发
  if(withAnim !== false){
    lbAnimating = true;
    setTimeout(function(){ lbAnimating = false; }, 300);
  }
  applyTransform();
}

function openLightbox(idx, kenBurns){
  if(idx < 0 || idx >= lightboxPhotos.length) return;
  lightboxIdx = idx;
  const lb = $('#lightbox');
  const counter = $('#lightboxCounter');
  const img = $('#lightboxImg');
  const stage = $('#lightboxStage');

  if(stage) stage.style.display = 'flex';
  if(img) img.style.display = 'block';

  resetZoom();
  applyTransform();
  lb.classList.add('active');
  lb.style.opacity = '1';
  lb.style.pointerEvents = 'auto';

  // 显示加载状态
  showLbLoader(true, 0, '加载中…');

  const photo = lightboxPhotos[idx];
  const src = full(photo);
  counter.textContent = (idx+1) + ' / ' + lightboxPhotos.length;
  if(window.SFX) window.SFX.shutter();

  // 用 fetch 拿真实下载进度
  loadImageWithProgress(src).then(url => {
    img.style.transition = 'none';
    img.style.transform = 'translate(0,0) scale(1)';
    img.style.opacity = '0';
    img.onload = function(){
      img.style.transition = 'opacity .35s ease';
      img.style.opacity = '1';
      showLbLoader(false, 100, '');
    };
    img.onerror = function(){
      img.style.opacity = '1';
      showLbLoader(false, 0, '✕ 加载失败');
      setTimeout(() => showLbLoader(false, 0, ''), 1500);
    };
    img.src = url;
  });
}

window.openLightbox = openLightbox;

// 用 fetch 流式下载图片 + 实时进度
async function loadImageWithProgress(url){
  showLbLoader(true, 0, '准备…');
  try {
    const resp = await fetch(url);
    if(!resp.ok) throw new Error('HTTP ' + resp.status);
    const total = parseInt(resp.headers.get('content-length') || '0');
    const reader = resp.body.getReader();
    const chunks = [];
    let received = 0;
    while(true){
      const {done, value} = await reader.read();
      if(done) break;
      chunks.push(value);
      received += value.length;
      if(total > 0){
        const pct = Math.round(received * 100 / total);
        const mb = (received/1024/1024).toFixed(1);
        showLbLoader(true, pct, mb + ' MB');
      } else {
        showLbLoader(true, 0, (received/1024/1024).toFixed(1) + ' MB');
      }
    }
    const blob = new Blob(chunks);
    return URL.createObjectURL(blob);
  } catch(e){
    showLbLoader(true, 0, '直接加载…');
    return url;  // 失败时回退到直接 src
  }
}

function showLbLoader(show, pct, text){
  let loader = document.getElementById('lbLoader');
  if(!loader){
    loader = document.createElement('div');
    loader.id = 'lbLoader';
    loader.innerHTML = '<div class="lb-spinner"></div><div class="lb-progress"></div><div class="lb-text"></div>';
    document.getElementById('lightbox').appendChild(loader);
  }
  if(!show){
    loader.classList.add('hidden');
    return;
  }
  loader.classList.remove('hidden');
  const prog = loader.querySelector('.lb-progress');
  const tx = loader.querySelector('.lb-text');
  if(prog) prog.style.setProperty('--p', Math.min(pct, 100) + '%');
  if(tx) tx.textContent = text + (pct > 0 ? ' ' + pct + '%' : '');
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
  document.body.style.overflow = '';
  if(window.SFX) window.SFX.click();
  resetZoom();
}
window.closeLightbox = closeLightbox;

// 灯箱交互
function bindLightboxInteractions(){
  const lb = $('#lightbox');
  if(!lb) return;

  // 双击：缩放到 1.8x（更温和）+ 以点击位置为中心
  lb.addEventListener('dblclick', e => {
    e.preventDefault();
    e.stopPropagation();
    if(lbAnimating) return;
    if(lbZoom.scale > 1.01){
      resetZoom();
      applyTransform();
    } else {
      zoomTo(1.8, e.clientX, e.clientY);
    }
    lbAutoHideControls();
  });

  // 滚轮：光标居中缩放（小步长 1.1x，丝滑）
  lb.addEventListener('wheel', e => {
    if(!lb.classList.contains('active')) return;
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.1 : 1/1.1;
    zoomTo(lbZoom.scale * factor, e.clientX, e.clientY);
    lbAutoHideControls();
  }, {passive:false});

  // 鼠标拖动（缩放时平移）
  lb.addEventListener('mousedown', e => {
    if(lbZoom.scale <= 1.01) return;
    if(e.target.closest('.lightbox-close') || e.target.closest('.lightbox-prev') || e.target.closest('.lightbox-next') || e.target.closest('.lightbox-filmstrip')) return;
    e.preventDefault();
    lbZoom.dragging = true;
    lbZoom.lastX = e.clientX;
    lbZoom.lastY = e.clientY;
    applyTransform();
    lbAutoHideControls();
  });
  window.addEventListener('mousemove', e => {
    if(!lbZoom.dragging) return;
    lbZoom.x += e.clientX - lbZoom.lastX;
    lbZoom.y += e.clientY - lbZoom.lastY;
    lbZoom.lastX = e.clientX;
    lbZoom.lastY = e.clientY;
    applyTransform();
  });
  window.addEventListener('mouseup', function(){
    if(lbZoom.dragging){
      lbZoom.dragging = false;
      applyTransform();  // 恢复 transition
    }
  });

  // 触摸：单击切图 / 双指缩放 / 单指平移
  var tdMode = 'none', tdStartX = 0, tdStartY = 0, tdStartZoomX = 0, tdStartZoomY = 0;
  var tdDist = 0, tdScaleAtStart = 1, tdLastTap = 0, tdLastX = 0, tdLastY = 0;
  var tdSwipeDist = 0;

  lb.addEventListener('touchstart', function(e){
    if(e.touches.length === 1){
      var now = Date.now();
      // 双击检测
      if(now - tdLastTap < 280 && Math.abs(e.touches[0].clientX - tdLastX) < 30 && Math.abs(e.touches[0].clientY - tdLastY) < 30){
        e.preventDefault();
        if(lbAnimating){ tdLastTap = 0; return; }
        if(lbZoom.scale > 1.01){
          resetZoom();
          applyTransform();
        } else {
          zoomTo(1.8, e.touches[0].clientX, e.touches[0].clientY);
        }
        tdLastTap = 0;
        return;
      }
      tdLastTap = now;
      tdLastX = e.touches[0].clientX;
      tdLastY = e.touches[0].clientY;
      tdStartX = e.touches[0].clientX;
      tdStartY = e.touches[0].clientY;
      tdStartZoomX = lbZoom.x;
      tdStartZoomY = lbZoom.y;
      tdSwipeDist = 0;
      tdMode = lbZoom.scale > 1.01 ? 'pan' : 'swipe';
    } else if(e.touches.length === 2){
      e.preventDefault();
      var dx = e.touches[0].clientX - e.touches[1].clientX;
      var dy = e.touches[0].clientY - e.touches[1].clientY;
      tdDist = Math.hypot(dx, dy);
      tdScaleAtStart = lbZoom.scale;
      tdMode = 'pinch';
    }
    lbAutoHideControls();
  }, {passive:false});

  lb.addEventListener('touchmove', function(e){
    if(tdMode === 'pan' && e.touches.length === 1){
      e.preventDefault();
      lbZoom.x = tdStartZoomX + (e.touches[0].clientX - tdStartX);
      lbZoom.y = tdStartZoomY + (e.touches[0].clientY - tdStartY);
      applyTransform();
    } else if(tdMode === 'swipe' && e.touches.length === 1){
      tdSwipeDist = e.touches[0].clientX - tdStartX;
    } else if(tdMode === 'pinch' && e.touches.length === 2){
      e.preventDefault();
      var dx2 = e.touches[0].clientX - e.touches[1].clientX;
      var dy2 = e.touches[0].clientY - e.touches[1].clientY;
      var d = Math.hypot(dx2, dy2);
      var ns = Math.max(1, Math.min(5, tdScaleAtStart * (d / tdDist)));
      // 双指中心
      var cx = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      var cy = (e.touches[0].clientY + e.touches[1].clientY) / 2;
      zoomTo(ns, cx, cy, false);
    }
  }, {passive:false});

  lb.addEventListener('touchend', function(e){
    if(tdMode === 'swipe' && Math.abs(tdSwipeDist) > 50){
      navLightbox(tdSwipeDist > 0 ? -1 : 1);
    }
    if(e.touches.length === 0) tdMode = 'none';
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

// ===== 音乐播放器 =====
let currentSongIdx=0, isPlaying=false, bgMusic=null;

function initMusic(){
  bgMusic=$('#bgMusic');
  if(!bgMusic) return;
  bgMusic.volume=0.5;
  bgMusic.addEventListener('timeupdate',()=>{
    if(bgMusic.duration)
      $('#playerProgress').style.width = (bgMusic.currentTime/bgMusic.duration)*100+'%';
  });
  bgMusic.addEventListener('ended',nextSong);
  bgMusic.addEventListener('play',()=>{isPlaying=true;$('#playBtn').textContent='⏸';});
  bgMusic.addEventListener('pause',()=>{isPlaying=false;$('#playBtn').textContent='▶';});
  bgMusic.addEventListener('error',()=>{ setTimeout(nextSong,1200); });

  // 立即用 data.js 初始化 _currentSongs（只当后备，不设标题不预加载）
  if(typeof playlist!=='undefined' && playlist.length>0){
    window._currentSongs = playlist.map(m=>({
      name:m.name,title:m.name,artist:m.artist||'',url:m.url||'',storage_path:m.url||''
    }));
    currentSongIdx = 0;
  }
  // 标题由 switchPlaylist 设定，这里不设防止闪一下 data.js 的歌名

  // 首次点击 → 授权播放手势（不播歌，等 DB 加载完毕再播）
  document.addEventListener('click', _grant); document.addEventListener('keydown', _grant); document.addEventListener('touchstart', _grant);
}
function _grant(){ 
  if(window._userStarted) return;
  window._userStarted = true;
  // 如果 switchPlaylist 已加载好歌，立即播放
  if(bgMusic && bgMusic.src && bgMusic.src !== window.location.href && bgMusic.paused){
    bgMusic.play().catch(()=>{});
  }
}

function switchPlaylist(songs){
  window._currentSongs=songs||[];
  currentSongIdx=0;
  if(window._currentSongs.length) playSong(0);
}
function playSong(idx){
  const s=window._currentSongs;
  if(!s||idx<0||idx>=s.length) return;
  currentSongIdx=idx;
  const t=s[idx];
  const sp=(t.storage_path||t.url||'').trim();
  let url = sp.startsWith('http') ? sp
          : sp.startsWith('music/') ? MUSIC_BASE+sp.slice(6)
          : sp ? 'https://mvzbkuhwapdqcdkekczh.supabase.co/storage/v1/object/public/photos/'+sp
          : MUSIC_BASE+(t.name||t.title||'')+'.mp3';
  bgMusic.src=url; bgMusic.load();
  // 用户已点过页面（授权手势）→ play；否则等用户点
  if(window._userStarted) bgMusic.play().catch(()=>{});
  $('#playerTitle').textContent=t.name||t.title||'未知';
}
function togglePlay(){
  if(!bgMusic) return;
  if(isPlaying) { bgMusic.pause(); return; }
  if(!bgMusic.src||bgMusic.readyState===0){ const s=window._currentSongs; if(s&&s.length) playSong(currentSongIdx); else return; }
  bgMusic.play().catch(()=>{});
}
function prevSong(){ const s=window._currentSongs; if(!s||!s.length) return; let i=currentSongIdx-1; if(i<0)i=s.length-1; playSong(i); }
function nextSong(){ const s=window._currentSongs; if(!s||!s.length) return; let i=currentSongIdx+1; if(i>=s.length)i=0; playSong(i); }
function seek(e){
  const bg=window.bgMusic; if(!bg) return;
  const b=document.getElementById('playerBar'); if(!b) return;
  // 如果 duration 还没拿到（歌没加载完），先加载再跳转
  if(!bg.duration || isNaN(bg.duration) || bg.readyState===0){
    const loadSeek=()=>{
      bg.removeEventListener('loadedmetadata', loadSeek);
      setTimeout(()=>{ seek(e); },100);
    };
    bg.addEventListener('loadedmetadata', loadSeek);
    bg.load();
    return;
  }
  const r=b.getBoundingClientRect();
  bg.currentTime=((e.clientX-r.left)/r.width)*bg.duration;
}
window.seek=seek;
function togglePlayer(){ $('#player').classList.toggle('collapsed'); }
window.togglePlay=togglePlay; window.prevSong=prevSong; window.nextSong=nextSong;
window.togglePlayer=togglePlayer;
window.setPlaylistTo=function(s,i){ window._currentSongs=s; currentSongIdx=i>=0?i:0; playSong(currentSongIdx); };

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
  window._timelineItems=_timelineItems;
  if(typeof essayCategories !== 'undefined'){
    essayCategories.forEach(cat => (cat.articles||[]).forEach(art => _timelineItems.push({...art, cat:cat.title, catId:cat.id})));
  }
  if(typeof travels !== 'undefined'){
    travels.forEach(art => _timelineItems.push({...art, cat:'旅行见闻', catId:'travel'}));
  }
  // 排序：按日期新的在上，同日期按 sort_order
  _timelineItems.sort((a,b)=>{
    var da=a.date||'', db=b.date||'';
    if(da>db) return -1; if(da<db) return 1;
    return (b.sort_order||0)-(a.sort_order||0);
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
  // 用 localStorage 记录是否已经做过首次同步，避免每次刷新又把删的歌补回来
  if(localStorage.getItem('memories.didFirstSync2') === '1') return;
  try{
    // === 1. 文章：表空 bulk insert，否则不动 ===
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
      for(let i=0; i<allEssays.length; i+=50){
        await SB.from('essays').insert(allEssays.slice(i, i+50));
      }
    }
    // 有数据 → 不再补缺（用户删了就是删了，DB 是 source of truth）

    // === 2. 相册：表空 bulk insert，否则不动 ===
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
      }
      // 有数据 → 不再补缺，DB 是 source of truth
      // 同步相册照片到 album_photos（仅首次）
      if(albums.some(a=>a.photos&&a.photos.length>0)){
        const {count:pc}=await SB.from('album_photos').select('*',{count:'exact',head:true});
        if(!pc||pc===0){
          const {data:ea}=await SB.from('albums').select('id,title');
          if(ea){
            const am={}; ea.forEach(a=>{am[a.title]=a.id;});
            const ap=[];
            albums.forEach(a=>{
              const aid=am[a.title];
              if(aid&&a.photos) a.photos.forEach((p,i)=>ap.push({album_id:aid,storage_path:p,sort_order:i}));
            });
            if(ap.length>0){ for(let i=0;i<ap.length;i+=50) await SB.from('album_photos').insert(ap.slice(i,i+50)).catch(e=>console.warn('[sync] photo:',e.message)); }
          }
        }
      }
    }

    // === 3. 音乐：表空 bulk insert，否则不动 ===
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
      }
      // 有数据 → 不再补缺，DB 是 source of truth
    }
    // 标记已完成首次同步，以后不再跑同步逻辑
    try{ localStorage.setItem('memories.didFirstSync2', '1'); }catch(e){}
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

// ===== 从 Supabase 加载数据覆盖 data.js（编辑器改了这里能看到） =====
async function loadFromSupabase(){
  if(!SB) return;
  try {
    // 1. 文章 — 从 essays 表加载
    const {data:essays} = await SB.from('essays').select('*').order('sort_order', {ascending:true});
    if(essays && essays.length > 0){
      // 按 category 分组，重建 essayCategories 结构
      const groups = {};
      essays.forEach(e => {
        const cid = e.category || 'thoughts';
        if(!groups[cid]) groups[cid] = {id: cid, title: e.category_title||cid, articles:[]};
        groups[cid].articles.push({title:e.title, date:e.date, body:e.body, sort_order:e.sort_order});
      });
      const cats = Object.values(groups);
      // 覆盖全局变量（用 splice 原地替换，因为 data.js 声明是 const）
      if(typeof essayCategories !== 'undefined'){
        essayCategories.splice(0, essayCategories.length, ...cats);
      }
      // 重建时间线索引 + 显示
      fillTimelineIndex();
      buildTimeline();
    }

    // 2. 相册 — 从 albums 表加载
    const {data:sbAlbums} = await SB.from('albums').select('*').order('sort_order', {ascending:true});
    if(sbAlbums && sbAlbums.length > 0){
      // 覆盖全局 albums（保留 photos 从 data.js）
      const oldMap = {};
      if(typeof albums !== 'undefined') albums.forEach(a => { oldMap[a.title] = a; });
      const merged = sbAlbums.map(sa => ({
        ...(oldMap[sa.title]||{}),
        id: sa.title === (oldMap[sa.title]||{}).title ? oldMap[sa.title].id : sa.title,
        title: sa.title,
        cover: sa.cover||'',
        sort_order: sa.sort_order,
      }));
      // 按 sort_order 重新排序
      merged.sort((a,b) => (a.sort_order||0) - (b.sort_order||0));
      if(typeof albums !== 'undefined'){
        const mergedLen = albums.length;
        albums.splice(0, mergedLen, ...merged);
      }
      // 重建 allGalleryPhotos
      allGalleryPhotos = [];
      merged.forEach(album => {
        (album.photos||[]).forEach(photo => {
          const p = typeof photo === 'string' ? {path:photo, src:photo} : photo;
          allGalleryPhotos.push({path:p.path||p.src||'', src:p.src||p.path||'', _albumTitle:album.title, _albumId:album.id, _worldId:album.world||''});
        });
      });
      // 从 album_photos 表加载用户上传的照片补充到相册
      const {data:albumPhotos} = await SB.from('album_photos').select('*').order('sort_order', {ascending:true});
      if(albumPhotos && albumPhotos.length > 0){
        const photoMap = {};
        albumPhotos.forEach(ap => {
          if(!photoMap[ap.album_id]) photoMap[ap.album_id] = [];
          photoMap[ap.album_id].push(ap);
        });
        // 按 album.id 分配照片到对应相册
        merged.forEach(album => {
          const aid = album.id;
          if(aid && photoMap[aid]){
            photoMap[aid].forEach(ap => {
              const sp = ap.storage_path || ap.filename || '';
              // 照片可能是在 Supabase Storage 或 images/
              const imgUrl = sp.startsWith('images/') ? ('https://xshzct-dotcom.github.io/images/' + sp.replace(/^images\//,''))
                : ('https://mvzbkuhwapdqcdkekczh.supabase.co/storage/v1/object/public/photos/' + sp);
              if(!album.photos) album.photos = [];
              if(!album.photos.includes(imgUrl) && !album.photos.includes(sp)){
                album.photos.push(imgUrl || sp);
                allGalleryPhotos.push({path:imgUrl||sp, src:imgUrl||sp, _albumTitle:album.title, _albumId:album.id});
              }
            });
          }
        });
      }
    }

    // 3. 音乐 — 从 music 表加载排序
    const {data:tracks} = await SB.from('music').select('*').order('sort_order', {ascending:true});
    if(tracks && tracks.length > 0){
      const newPlaylist = tracks.map(t => ({
        name: t.title, title: t.title, artist: t.artist||'',
        url: t.storage_path||'', storage_path: t.storage_path||'',
      }));
      if(typeof playlist !== 'undefined'){
        playlist.splice(0, playlist.length, ...newPlaylist);
      }
      // 更新播放器列表但不播放（编辑器拖拽排序后不中断当前歌）
      window._currentSongs = newPlaylist;
    }

    console.log('[memories] loadFromSupabase done');
    window._testReady = true;
  } catch(e){
    console.warn('[memories] loadFromSupabase failed:', e);
  }
}
window.reloadFromSupabase = loadFromSupabase;
function init(){
  console.log('[memories] init() start');
  initHeroStars();
  initMusic();
  // 歌单同步在下面 init() 末尾统一处理（带 data.js 兜底）
  fillTimelineIndex();
  buildTimeline();
  buildRiver();
  bindLightboxInteractions();
  initDailyQuote();
  observeFadeUps();

  // 齿轮
  const gear=$('#navGear');
  if(gear) gear.onclick = () => { if(window.EDITOR && window.EDITOR.open) window.EDITOR.open(); };

  // 同步 data.js → Supabase（让编辑器有真实数据）— 暴露 promise 给 editor 共享
  window.MemoriesReady = ensureSync();

  // 拉 DB 歌单 + 播放第一首（用户手势授权后才播放）
  ensureSync().then(() => loadFromSupabase()).then(() => {
    if(window._currentSongs && window._currentSongs.length > 0){
      switchPlaylist(window._currentSongs);
    }
  }).catch(e => console.warn('[memories] init playlist failed:', e));

  // 全局媒体观察
  const mo = new MutationObserver(()=>{ observeFadeUps(); });
  mo.observe(document.body,{childList:true,subtree:true});
}

if(document.readyState==='complete') init();
else window.addEventListener('load',init);

})();
