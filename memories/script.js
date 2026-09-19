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
// 双源策略（2026-09-10）：
//   主源 = GitHub Pages 直连（源站，永远最新，不会拿到 CDN 缓存的旧坏图）
//   备源 = jsDelivr CDN（加速 + 免疫 GitHub Pages 的 429 限流）
//   图片 onerror 时自动切到备源重试，两源都失败才显示"图丢失"
const REPO = 'xshzct-dotcom/xshzct-dotcom.github.io@main';
const IMG_BASE = 'https://xshzct-dotcom.github.io/images/';
const THUMB_BASE = 'https://xshzct-dotcom.github.io/thumbs/';
// 备用 CDN 源
const IMG_BASE_ALT = 'https://cdn.jsdelivr.net/gh/'+REPO+'/images/';
const THUMB_BASE_ALT = 'https://cdn.jsdelivr.net/gh/'+REPO+'/thumbs/';
const MUSIC_BASE = 'https://xshzct-dotcom.github.io/music/';
function getPath(p){
  if(!p) return '';
  if(typeof p==='string') return p;
  return p.path||p.src||p.storage_path||p.url||p.filename||'';
}
// 内部：按指定 base 生成缩略图 URL
function _thumbWith(p, base){
  const s=getPath(p); if(!s) return '';
  if(s.startsWith('http')) return s;
  let t = s;
  if(t.startsWith('images/')) t = t.slice(7);
  if(t.startsWith('thumbs/')) return base+t.slice(7);
  t = t.replace(/\.jpg$/i, '.webp')
       .replace(/\.jpeg$/i, '.webp')
       .replace(/\.png$/i, '.webp');
  return base+t;
}
// 内部：按指定 base 生成原图 URL
function _fullWith(p, base){
  const s=getPath(p); if(!s) return '';
  if(s.startsWith('http')) return s;
  if(s.startsWith('images/')) return base+s.slice(7);
  if(s.startsWith('thumbs/')){
    let t = s.replace(/^\.\.\/thumbs\//, 'images/').replace(/^thumbs\//, 'images/');
    t = t.replace(/\.webp$/i, '.jpg');
    return base+t.slice(7);
  }
  return base+s;
}
// 缩略图（主源 / 备源）
function thumb(p){ return _thumbWith(p, THUMB_BASE); }
function thumbAlt(p){ return _thumbWith(p, THUMB_BASE_ALT); }
// 原图（主源 / 备源）
function full(p){ return _fullWith(p, IMG_BASE); }
function fullAlt(p){ return _fullWith(p, IMG_BASE_ALT); }

// ===== 2026-09-19：全站 UI 图标（单色 SVG + currentColor，随主题变色）=====
//   背景：emoji 的渲染颜色由系统字体决定（☀️ 是黄的、🔁 是蓝的），改不了 → 一律用 SVG。
var ICON = {
  sun: '<svg class="i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4.2"/><path d="M12 2.6v2.2M12 19.2v2.2M4.6 12H2.4M21.6 12h-2.2M6.9 6.9L5.3 5.3M18.7 18.7l-1.6-1.6M17.1 6.9l1.6-1.6M5.3 18.7l1.6-1.6"/></svg>',
  moon: '<svg class="i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20.6 14.3A8.7 8.7 0 019.7 3.4a8.9 8.9 0 1010.9 10.9z"/></svg>',
  gear: '<svg class="i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3.1"/><path d="M19.2 14.6a1.7 1.7 0 00.3 1.9l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.9-.3 1.7 1.7 0 00-1 1.5v.2a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.9.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.9 1.7 1.7 0 00-1.5-1H2.6a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.9l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.9.3h.1a1.7 1.7 0 001-1.5V2.6a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.9-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.9v.1a1.7 1.7 0 001.5 1h.2a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z"/></svg>',
  play: '<svg class="i" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.1l11.2 6.9L8 18.9z"/></svg>',
  pause: '<svg class="i" viewBox="0 0 24 24" fill="currentColor"><rect x="7.2" y="4.9" width="3.5" height="14.2" rx="1.2"/><rect x="13.3" y="4.9" width="3.5" height="14.2" rx="1.2"/></svg>',
  prev: '<svg class="i" viewBox="0 0 24 24" fill="currentColor"><path d="M18.6 5.1v13.8L8.1 12z"/><rect x="4.5" y="5.1" width="2.7" height="13.8" rx="1.1"/></svg>',
  next: '<svg class="i" viewBox="0 0 24 24" fill="currentColor"><path d="M5.4 5.1v13.8L15.9 12z"/><rect x="16.8" y="5.1" width="2.7" height="13.8" rx="1.1"/></svg>'
};

// ===== 导航 =====
const nav=$('#nav');
const navLinks=$('#navLinks');
const navHamburger=$('#navHamburger');
navHamburger.onclick=()=>{ navHamburger.classList.toggle('open'); navLinks.classList.toggle('open'); };
// 2026-09-15：主题切换按钮
(function(){
  var tb = document.getElementById('navTheme');
  if(!tb) return;
  var _lock = 0;
  function fire(e){
    if(e){ e.preventDefault(); e.stopPropagation(); }
    var now = Date.now();
    if(now - _lock < 300) return;
    _lock = now;
    if(typeof window.toggleTheme === 'function') window.toggleTheme();
  }
  tb.onclick = null;
  if(window.PointerEvent){
    tb.addEventListener('pointerdown', fire, {passive:false});
  }else{
    tb.addEventListener('touchstart', fire, {passive:false});
    tb.addEventListener('click', fire, {passive:false});
  }
})();
$$('.nav-links a').forEach(a=>a.onclick=(e)=>{
  navHamburger.classList.remove('open');
  navLinks.classList.remove('open');
  // 2026-09-15：博客改为在主页内横滑打开（不跳转新页面）
  if(a.id === 'navBlogLink'){
    e.preventDefault();
    // 2026-09-15：已打开时再点一次收起（toggle）
    if(typeof window.isBlogOpen === 'function' && window.isBlogOpen()){
      if(typeof window.closeBlog === 'function') window.closeBlog();
    } else if(typeof window.openBlog === 'function'){
      window.openBlog();
    }
  }
});

function onScroll(){
  const y=window.scrollY;
  nav.classList.toggle('scrolled', y>60);
  // 2026-09-15：博客画布打开时，导航高亮由 openBlog 接管，滚动不再覆盖
  if(window._blogNavLocked) return;
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

// ===== 主题：单一暗色模式（2026-09-10 移除白色模式切换）=====
// 历史：曾支持暗色/白色双主题（tag: pre-theme-toggle 之前为无主题版本）
// 用户决定只保留默认暗色 —— 深底更能衬托照片（相册为主角的网站）
/* ===== 2026-09-15：明暗主题（默认暗色，可选浅色）=====
   实现：给 <html> 加/去 data-theme="light"，所有颜色由 style.css 的 CSS 变量接管 */
function applyTheme(t){
  var light = (t === 'light');
  if(light) document.documentElement.setAttribute('data-theme','light');
  else document.documentElement.removeAttribute('data-theme');
  var btn = document.getElementById('navTheme');
  // 2026-09-19：主题图标改用单色 SVG（emoji 的颜色是系统字体决定的，改不了）
  if(btn) btn.innerHTML = light ? ICON.moon : ICON.sun;
  var meta = document.querySelector('meta[name="theme-color"]');
  if(meta) meta.setAttribute('content', light ? '#F7F5F0' : '#0E1116');
  // 同步通知 iframe（博客页）
  try{
    var fr = document.getElementById('blogFrame');
    if(fr && fr.contentWindow) fr.contentWindow.postMessage('theme:' + (light ? 'light' : 'dark'), '*');
  }catch(e){}
}
window.applyTheme = applyTheme;
window.toggleTheme = function(){
  try{
    var cur = document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
    var next = (cur === 'light') ? 'dark' : 'light';
    try{ localStorage.setItem('memories.theme', next); }catch(e){}
    // 用 window.applyTheme 而非裸调用，避免作用域问题导致静默失败
    if(typeof window.applyTheme === 'function') window.applyTheme(next);
    else{
      if(next === 'light') document.documentElement.setAttribute('data-theme','light');
      else document.documentElement.removeAttribute('data-theme');
    }
  }catch(e){ console.warn('[theme] toggle 失败', e); }
};
/* 2026-09-15 定稿：记住用户选择；但【首次进入（无记录）默认暗色】 */
function initTheme(){
  var t = 'dark';
  try{ t = localStorage.getItem('memories.theme') || 'dark'; }catch(e){}
  applyTheme(t);
}

function clearLegacyTheme(){
  // 清理旧版遗留的 localStorage 偏好，避免残留数据
  try{
    localStorage.removeItem('memories.theme');
    document.documentElement.removeAttribute('data-theme');
  }catch(e){}
}

// ===== Hero 星空 =====
function initHeroStars(){
  const c=$('#heroStars'); if(!c) return;
  const ctx=c.getContext('2d');
  let W, H, stars, mouseX=0, mouseY=0;
  const N=80;
  // 颜色缓存（主题变化时更新）
  let starColor = {r:232, g:228, b:218};  // 米白（暗色模式下唯一的配色）
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
      const alpha = Math.min(1, s.baseAlpha * (0.5 + 0.5*tw));
      // 鼠标视差：附近的星轻微漂移
      const dx = (mouseX - W/2) * 0.02 * s.driftX;
      const dy = (mouseY - H/2) * 0.02 * s.driftY;
      ctx.fillStyle = `rgba(${starColor.r},${starColor.g},${starColor.b},${alpha})`;
      ctx.beginPath();
      ctx.arc(s.x + dx, s.y + dy, s.r, 0, Math.PI*2);
      ctx.fill();
      // （2026-08-27）去掉十字光效果：两颗星竖直对齐时十字光连成一条直线，去掉避免视觉干扰
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
  // 按分类分组
  const groups={};
  if(typeof essayCategories !== 'undefined'){
    essayCategories.forEach(cat => {
      (cat.articles||[]).forEach(art => {
        const k = cat.id;
        if(!groups[k]) groups[k] = {title: cat.title, catId: cat.id, items: []};
        groups[k].items.push({...art, cat: cat.title, catId: cat.id});
      });
    });
  }
  if(typeof travels !== 'undefined'){
    travels.forEach(art => {
      if(!groups['travel']) groups['travel'] = {title:'旅行见闻', catId:'travel', items:[]};
      groups['travel'].items.push({...art, cat:'旅行见闻', catId:'travel'});
    });
  }
  // 去掉没有文章的组
  Object.keys(groups).forEach(k => { if(groups[k].items.length===0) delete groups[k]; });
  const catIds = Object.keys(groups);
  if(catIds.length===0){
    timeline.innerHTML = '<div class="timeline-empty"># 暂无文章 #</div>';
    return;
  }
  // 每个分类的组作为折叠块
  function excerpt(body,len){
    if(!body) return '';
    const t = body.replace(/<[^>]+>/g,'').replace(/\s+/g,' ').trim();
    return t.length>len ? t.slice(0,len)+'…' : t;
  }
  let html = '';
  catIds.forEach((k,gi) => {
    const g = groups[k];
    // 组内按日期降序（童年篇按 sort_order 升序=旧到新）
    g.items.sort(function(a,b){
      const da=a.date||'', db=b.date||'';
      const pa=da.match(/^(\d{4})\.(\d{1,2})\.(\d{1,2})/), pb=db.match(/^(\d{4})\.(\d{1,2})\.(\d{1,2})/);
      if(pa && pb){
        if(+pa[1]!==+pb[1]) return +pb[1]-+pa[1];
        if(+pa[2]!==+pb[2]) return +pb[2]-+pa[2];
        return +pb[3]-+pa[3];
      }
      if(da && !pb) return -1;
      if(!da && pb) return 1;
      if(k==='childhood') return (a.sort_order||0)-(b.sort_order||0);
      return (b.sort_order||0)-(a.sort_order||0);
    });
    // 全部默认折叠，用户自己点开
    html += `<div class="tl-group cat-${g.catId}">
      <div class="tl-group-header" data-target="${k}">
        <span class="tl-group-icon">▸</span>
        <span class="tl-group-title">● ${esc(g.title)}</span>
        <span class="tl-group-count">${g.items.length} 篇</span>
      </div>
      <div class="tl-group-body" style="display:none">`;
    g.items.forEach((item,i) => {
      const idx = g.items.indexOf(item); // 用于点击弹出
      html += `<div class="timeline-item fade-up cat-${g.catId}" data-idx="${i}">
        <div class="timeline-dot"></div>
        <div class="timeline-card" data-idx="${i}">
          <div class="tl-date">${item.date||''}</div>
          <div class="tl-title">${esc(item.title)}</div>
          <div class="tl-excerpt">${esc(excerpt(item.body,120))}</div>
          <span class="tl-cat" style="color:var(--cat-${g.catId})">● ${esc(g.title)}</span>
        </div>
      </div>`;
    });
    html += '<div class="tl-group-footer" data-group="'+k+'">▴ 收起</div>';
    html += '</div></div>';
  });
  timeline.innerHTML = html;

  // 折叠交互（手风琴：开一个自动关其他）
  $$('.tl-group-header').forEach(h => {
    h.onclick = () => {
      const body = h.nextElementSibling;
      const icon = h.querySelector('.tl-group-icon');
      const wasOpen = body.style.display !== 'none';
      // 先关掉所有其他分组
      $$('.tl-group-header').forEach(function(o){
        if(o !== h){
          var ob = o.nextElementSibling;
          if(ob.style.display !== 'none'){
            ob.style.display = 'none';
            var oi = o.querySelector('.tl-group-icon');
            if(oi) oi.textContent = '▸';
          }
        }
      });
      // 再切换当前
      if(!wasOpen){
        body.style.display = '';
        icon.textContent = '▾';
      } else {
        body.style.display = 'none';
        icon.textContent = '▸';
      }
    };
  });

  // 底部收起按钮
  $$('.tl-group-footer').forEach(function(ft){
    ft.onclick = function(){
      var k = this.dataset.group;
      var header = document.querySelector('.tl-group-header[data-target="'+k+'"]');
      if(header){
        header.click();
        // 滚动到分类头位置
        header.scrollIntoView({behavior:'smooth', block:'start'});
      }
    };
  });

  // 卡片点击打开弹窗（只在展开的组里查）
  $$('.timeline-card').forEach(card => {
    card.onclick = () => {
      const itemIdx = parseInt(card.dataset.idx);
      // 找到对应分类的 items
      const grp = catIds.reduce((found,k)=>{
        if(found) return found;
        const p = card.closest('.tl-group');
        if(p && p.classList.contains('cat-'+k)) return groups[k];
        return found;
      }, null);
      if(!grp) return;
      const globalIdx = _timelineItems.indexOf(grp.items[itemIdx]);
      // 第三个参数传分类的"页面显示顺序"作为弹窗池子（保证上一篇/下一篇和页面一致）
      if(globalIdx>=0) openEssayModal(_timelineItems[globalIdx], true, grp.items);
      else openEssayModal(grp.items[itemIdx], true, grp.items);
    };
  });
  observeFadeUps();
}

// 文章阅读弹窗
let _timelineItems = [];
window._timelineItems = _timelineItems;
function openEssayModal(essay, catOnly=true, displayList){
  const overlay=$('#essayModal');
  const content=$('#essayModalContent');
  if(!overlay||!content) return;
  // 默认按分类隔离导航（不跨分类跳转）
  // 优先用传入的 displayList（页面显示顺序），保证 上一篇/下一篇 和页面一致
  // 童年篇 用 sort_order ASC、其他用日期 DESC，这里取的是分类在 buildTimeline 里的实际渲染顺序
  const pool = displayList
    ? displayList
    : (catOnly ? window._timelineItems.filter(t => t.catId === essay.catId) : window._timelineItems);
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
      <button class="editor-btn editor-btn-secondary essay-prev" ${hasPrev?'':'disabled'}>↑ 上一篇</button>
      <span style="color:var(--text-muted);font-size:.85rem">${curIdx+1}/${pool.length}</span>
      <button class="editor-btn editor-btn-secondary essay-next" ${hasNext?'':'disabled'}>下一篇 ↓</button>
    </div>
  `;
  // 用 dom 监听代替 onclick
  var prevBtn = content.querySelector('.essay-prev');
  var nextBtn = content.querySelector('.essay-next');
  if(prevBtn && hasPrev) prevBtn.onclick = function(){ window.goPrevEssay(); };
  if(nextBtn && hasNext) nextBtn.onclick = function(){ window.goNextEssay(); };
  // 记录当前池子，跳转时沿用同一个顺序（否则又回落到全局日期序导致顺序错乱）
  window._essayDisplayList = pool;
  window.goPrevEssay = function(){ if(window._essayIdx>0) openEssayModal(window._essayPool[window._essayIdx-1], true, window._essayDisplayList); };
  window.goNextEssay = function(){ if(window._essayIdx<window._essayPool.length-1) openEssayModal(window._essayPool[window._essayIdx+1], true, window._essayDisplayList); };
  overlay.classList.add('active');
  document.body.style.overflow='hidden';
}
window.openEssayModal = openEssayModal;
function closeEssayModal(){
  $('#essayModal').classList.remove('active');
  document.body.style.overflow='';
}

// ===== Toast 轻提示 =====
let _toastTimer = null;
function toast(msg, type){
  type = type || 'info';
  let box = document.getElementById('toastBox');
  if(!box){
    box = document.createElement('div');
    box.id = 'toastBox';
    document.body.appendChild(box);
  }
  const t = document.createElement('div');
  t.className = 'toast toast-' + type;
  t.textContent = msg;
  box.appendChild(t);
  // 最多同时3条，超出移除最早的
  while(box.children.length > 3) box.removeChild(box.firstChild);
  setTimeout(function(){ t.classList.add('toast-out'); }, 2400);
  setTimeout(function(){ if(t.parentNode) t.parentNode.removeChild(t); }, 2800);
}
window.toast = toast;
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

// ===== 记忆河流 v3（简单版本 — 每次渲染一批，换一批才刷新，无自动加载） =====
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

function buildPolaroid(pool, pi, rot, z){
  var p = pool[pi];
  var name = (typeof p === 'string' ? p : (p.path||p.src||'')).split('/').pop()
    .replace(/看图王\.jpg$|\.jpg$|\.jpeg$/i,'').replace(/^_+/,'');
  return '<div class="polaroid polaroid-loading" data-idx="'+pi+'" style="transform:rotate('+rot+'deg);z-index:'+z+'" data-label="'+esc(p._albumTitle||'')+'" data-missing="暂未上传 · '+esc(name)+'">'+
    '<div class="polaroid-frame"><img src="'+thumb(p)+'" alt="" decoding="async" loading="lazy" data-path="'+esc(getPath(p)).replace(/"/g,'&quot;')+'" data-full="'+full(p)+'" data-name="'+esc(name)+'"></div>'+
    '<div class="polaroid-caption">'+esc(name)+'</div></div>';
}

function bindPolaroidEvents(container, pool, startIdx){
  var els = container.querySelectorAll('.polaroid');
  for(var i = startIdx; i < els.length; i++){
    (function(el){
      var img = el.querySelector('img');
      if(img){
        img.onload = function(){ el.classList.remove('polaroid-loading'); updateGalleryLoadProgress(); };
        // 失败回退链：主源缩略图 → CDN备源缩略图 → 主源原图 → CDN备源原图 → 去掉"_看图王" → 失败框
        img.onerror = function(){
          var st = img.dataset.fb || '0';
          var path = img.dataset.path || '';
          if(st === '0'){ img.dataset.fb='1'; img.src = thumbAlt(path); }
          else if(st === '1'){ img.dataset.fb='2'; img.src = full(path); }
          else if(st === '2'){ img.dataset.fb='3'; img.src = fullAlt(path); }
          else if(st === '3'){ img.dataset.fb='4'; img.src = full(path).replace('_看图王',''); }
          else { img.style.display='none'; el.classList.add('img-fail-frame'); }
        };
      }
      el.onclick = function(){
        var idx = parseInt(el.dataset.idx); if(isNaN(idx)) return;
        lightboxPhotos=pool; lightboxIdx=idx; openLightbox(idx);
      };
    })(els[i]);
  }
}

function riverSeed(c, cycle, skip){
  var s = (String(c||'all')+'_'+cycle).split('').reduce(function(a,ch){ return (a*131+ch.charCodeAt(0))%2147483647; }, 7);
  for(var i=0; i<skip; i++) s = (s*16807)%2147483647;
  return s;
}

function updateRiverHint(){
  var hint=document.getElementById('riverHint');
  if(!hint) return;
  hint.textContent='轮回 '+_riverCycle+' （剩余 '+_riverQueue.length+' / '+_riverTotal+' 张）';
}

function renderRiver(opts){
  // 2026-09-18：瀑布流（分批渲染 + 滚动增量加载）
  //   一次性渲染 2700+ 张会卡死，所以首屏只渲染 120 张，滚到底再增量加载。
  opts = opts || {};
  var stream = document.getElementById('riverStream');
  if(!stream) return;

  var filtered = getFilteredRiver();
  // 2026-09-18：顺序【固定】—— 与相册编辑器的排列一致，不随机、不去重
  var pool = (filtered && filtered.length) ? filtered.slice() : allGalleryPhotos.slice();
  _riverTotal = pool.length;

  // 清掉旧的河流控件（换一批/箭头/轮回提示），并统一容器样式
  stream.className = 'masonry-grid';
  stream.style.overflow = 'visible';
  stream.style.display = 'block';

  if(!pool || !pool.length){
    stream.innerHTML = '<div class="empty-art">'
      + '<div class="ea-bars"><i></i><i></i><i></i><i></i></div>'
      + '<div style="color:var(--text-muted);font-size:.9rem">这里还没有照片</div>'
      + '</div>';
    var pe0 = document.getElementById('galleryLoadProgress');
    if(pe0) pe0.textContent = '0 张照片';
    return;
  }

  // 2026-09-18：防抖 —— 同一批数据在短时间内只渲染一次，避免多次调用互相覆盖造成"闪跳"
  var _sig = (currentFilter || 'all') + '|' + pool.length + '|' + (pool[0]||'') + '|' + (pool[pool.length-1]||'');
  if(_sig === window._masonryLastSig && !opts.forceReset) return;
  window._masonryLastSig = _sig;

  // 当前过滤结果作为灯箱浏览序列（无重复，左右切换连续）
  _masonryPool = pool;
  _masonryShown = 0;

  var BATCH = 120;
  function makeItem(p, i){
    var nm = String(p).split('/').pop().replace(/\.[^.]+$/, '');
    return '<figure class="masonry-item" data-idx="' + i + '">'
         +   '<img src="' + thumb(p) + '" alt="" loading="lazy" decoding="async"'
         +        ' data-path="' + esc(getPath(p)).replace(/"/g,'&quot;') + '"'
         +        ' data-full="' + full(p) + '">'
         + '</figure>';
  }
  function appendBatch(){
    if(_masonryShown >= pool.length) return 0;
    var end = Math.min(_masonryShown + BATCH, pool.length);
    var html = '';
    for(var i = _masonryShown; i < end; i++) html += makeItem(pool[i], i);
    stream.insertAdjacentHTML('beforeend', html);
    // 新加入的图绑定失败回退
    var figs = stream.querySelectorAll('.masonry-item');
    for(var n = Math.max(0, figs.length - (end - _masonryShown)); n < figs.length; n++){
      var img = figs[n].querySelector('img');
      if(img && !img.dataset.bound){
        img.dataset.bound = '1';
        img.onerror = (function(im){
          return function(){
            var st = im.dataset.fb || '0';
            var path = im.dataset.path || '';
            if(st === '0'){ im.dataset.fb='1'; im.src = thumbAlt(path); }
            else if(st === '1'){ im.dataset.fb='2'; im.src = full(path); }
            else if(st === '2'){ im.dataset.fb='3'; im.src = fullAlt(path); }
            else { im.style.visibility = 'hidden'; }
          };
        })(img);
      }
    }
    _masonryShown = end;
    var pe = document.getElementById('galleryLoadProgress');
    if(pe) pe.textContent = _masonryShown + ' / ' + pool.length + ' 张';
    return end;
  }

  stream.innerHTML = '';
  appendBatch();

  // 点击 → 灯箱
  stream.onclick = function(e){
    var fig = e.target && e.target.closest ? e.target.closest('.masonry-item') : null;
    if(!fig) return;
    var idx = parseInt(fig.getAttribute('data-idx'), 10);
    if(isNaN(idx)) return;
    lightboxPhotos = pool;
    lightboxIdx = idx;
    // 2026-09-19：把被点缩略图的屏幕矩形交给灯箱 → 打开时从它的位置"长"出来（共享元素转场）
    var r = null;
    try{ r = fig.getBoundingClientRect(); }catch(err){}
    openLightbox(idx, r);
  };

  // 滚动到底部自动加载更多（重绑，避免叠加）
  if(window._masonryScrollHandler){
    window.removeEventListener('scroll', window._masonryScrollHandler);
  }
  window._masonryScrollHandler = function(){
    var doc = document.documentElement;
    if(doc.scrollHeight - window.scrollY - window.innerHeight < 800){
      if(_masonryShown < pool.length) appendBatch();
    }
  };
  window.addEventListener('scroll', window._masonryScrollHandler, {passive:true});
}
var _masonryPool = [], _masonryShown = 0;

function riverShuffle(){
  renderRiver({forceReset:true});
  if(window.SFX) window.SFX.shutter();
}
window._galleryFilterChanged = function(){ renderRiver({forceReset:true}); };

function riverScroll(dir){
  var stream = document.getElementById('riverStream');
  if(!stream) return;
  stream.scrollBy({left: dir * 320, behavior: 'smooth'});
  if(window.SFX) window.SFX.flip();
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
      renderRiver({forceReset:true});
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

// 按钮一直显示，不自动隐藏


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
  const finalScale = Math.max(1, Math.min(8, newScale));
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
  lb.style.touchAction = 'manipulation';
  // 禁止 body 滚动，避免手机浏览器拦截触摸事件
  document.body.style.overflow = 'hidden';

  // 显示加载状态
  showLbLoader(true, 0, '加载中…');

  const photo = lightboxPhotos[idx];
  const src = full(photo);
  counter.textContent = (idx+1) + ' / ' + lightboxPhotos.length;
  if(window.SFX) window.SFX.shutter();

  // 用 fetch 拿真实下载进度（主源失败自动切备用 CDN 源）
  loadImageWithProgress(src, fullAlt(photo)).then(url => {
    img.style.transition = 'none';
    img.style.transform = 'translate(0,0) scale(1)';
    img.style.opacity = '0';
    img.onload = function(){
      img.style.transition = 'opacity .35s ease';
      img.style.opacity = '1';
      img.style.filter = '';       // 清掉上一次失败可能残留的灰白滤镜
      showLbLoader(false, 100, '');
    };
    // 失败回退：主源 → CDN备源 →（都失败才）显示灰白"图丢失"
    var _triedAlt = false;
    img.onerror = function(){
      if(!_triedAlt){
        var altUrl = fullAlt(photo);
        if(altUrl && altUrl !== url){
          _triedAlt = true;
          showLbLoader(true, 0, '换源重试…');
          img.src = altUrl;
          return;
        }
      }
      img.style.opacity = '0.3';
      img.style.filter = 'grayscale(1) blur(8px)';
      img.alt = '原图已丢失：' + (img.src.split('/').pop() || '');
      showLbLoader(false, 0, '✕ 原图不存在');
      setTimeout(() => showLbLoader(false, 0, ''), 2000);
    };
    img.src = url;

    // 预加载相邻图片，切换更流畅
    preloadAdjacent(idx);
  });
}

// 预加载相邻（前后各1张）原图
function preloadAdjacent(idx){
  if(!lightboxPhotos || lightboxPhotos.length === 0) return;
  [idx-1, idx+1].forEach(function(i){
    if(i < 0 || i >= lightboxPhotos.length) return;
    try{
      var src = full(lightboxPhotos[i]);
      var im = new Image();
      // 预加载失败也试一次备用源
      im.onerror = function(){ try{ im.onerror = null; im.src = fullAlt(lightboxPhotos[i]); }catch(e){} };
      im.src = src;
    }catch(e){}
  });
}

window.openLightbox = openLightbox;

// 用 fetch 流式下载图片 + 实时进度（主源失败自动切备用 CDN 源）
async function loadImageWithProgress(url, altUrl){
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
    // 主源失败 → 试备用 CDN 源
    if(altUrl){
      try{
        showLbLoader(true, 0, '换源重试…');
        const resp2 = await fetch(altUrl);
        if(resp2.ok){
          const blob2 = await resp2.blob();
          return URL.createObjectURL(blob2);
        }
      }catch(e2){}
      return altUrl;
    }
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

function navLightbox(dir){
  // 2026-09-16 修复：照片池里可能有重复（河流用的是带重复的随机池），
  //   原来是直接 +1，遇到重复时"切了但图没变"，看起来像"要按好几次才换"。
  //   现在改为：向前找第一张与当前不同的照片，最多绕一圈。
  var n = (lightboxPhotos && lightboxPhotos.length) || 0;
  if(n <= 1){ if(window.SFX) window.SFX.flip(); return; }
  var cur = lightboxPhotos[lightboxIdx];
  var curKey = cur ? (full(cur) || String(cur)) : '';
  var next = -1;
  for(var k = 1; k <= n; k++){
    var ni = lightboxIdx + dir * k;
    ni = ((ni % n) + n) % n;
    var cand = lightboxPhotos[ni];
    var candKey = cand ? (full(cand) || String(cand)) : '';
    if(candKey !== curKey){ next = ni; break; }
  }
  if(next < 0){
    next = lightboxIdx + dir;
    if(next < 0) next = n - 1;
    if(next >= n) next = 0;
  }
  lightboxIdx = next;
  if(window.SFX) window.SFX.flip();
  openLightbox(lightboxIdx);
}
window.navLightbox = navLightbox;

/* 2026-09-18：灯箱 ‹ › 按钮的可靠绑定
   问题：手机浏览器存在触摸事件优先 + 点击延迟，HTML 的 onclick 属性
        在某些情况下不触发（尤其 stage 上有 touch 监听时）。
   方案：
     ① 用 JS 主动绑定（不依赖 onclick 属性）
     ② 同时监听 pointerdown（触摸/鼠标统一，响应最快）
     ③ 加 250ms 防抖，避免 pointerdown + click 双触发 = 一次跳两张
     ④ 用 capture 阶段绑定，抢在 stage 的 touch 处理之前 */
(function(){
  var _lastNav = 0;
  function go(dir){
    var now = Date.now();
    if(now - _lastNav < 250) return;      // 防抖：防止双触发跳两张
    _lastNav = now;
    navLightbox(dir);
  }
  function bind(){
    var prev = document.querySelector('.lightbox-prev');
    var next = document.querySelector('.lightbox-next');
    [[prev, -1], [next, 1]].forEach(function(pair){
      var el = pair[0], dir = pair[1];
      if(!el || el.dataset._navBound === '1') return;
      el.dataset._navBound = '1';
      // 去掉 HTML 属性，避免双触发
      el.removeAttribute('onclick');
      // pointerdown：触摸与鼠标统一，最快响应
      el.addEventListener('pointerdown', function(e){
        e.preventDefault();
        e.stopPropagation();
        go(dir);
      }, {passive:false, capture:true});
      // 兜底：老浏览器没有 pointerdown 时用 click
      if(!window.PointerEvent){
        el.addEventListener('click', function(e){
          e.preventDefault(); e.stopPropagation(); go(dir);
        }, {capture:true});
      }
    });
  }
  /* 2026-09-19 结构修复：下面这两段（导航按钮委托 / 相册按住放大）原来被误写进了
     `if(document.readyState === 'loading'){ }` 里面 —— 也就是说，只有当脚本执行那一刻
     文档还在加载时才会绑定。平时能凑巧生效（<script> 在 body 里执行时正是 loading），
     但只要脚本晚一步执行（缓存/注入/延迟加载），导航按钮和按住放大就【静默失效】。
     现在移到外面，与文档状态无关，永远绑定。 */
      // ═══ 2026-09-19：导航右上角两个按钮的【终极兜底】═══
  //   之前的做法（onclick 属性 / 各自 addEventListener）反复出现"点了没反应"，
  //   原因是：① onclick 属性在移动端不可靠 ② 多处绑定互相覆盖 ③ 代码改动误伤
  //   现在改为【document 级事件委托 + capture 阶段】：
  //     - 不依赖按钮自己有没有被绑上
  //     - capture 最先执行，抢在其他监听之前，且 stopPropagation 阻止重复触发
  document.addEventListener('pointerdown', function(e){
    var t = e.target;
    if(!t || !t.closest) return;
    // 主题切换 ☀️/🌙
    if(t.closest('#navTheme')){
      e.preventDefault(); e.stopPropagation();
      try{
        if(typeof window.toggleTheme === 'function') window.toggleTheme();
      }catch(err){ console.warn('[nav] 切换主题失败', err); }
      return;
    }
    // 管理菜单 ⚙️
    if(t.closest('#navGear')){
      e.preventDefault(); e.stopPropagation();
      try{
        if(window.EDITOR && typeof window.EDITOR.open === 'function') window.EDITOR.open();
        else console.warn('[nav] 编辑器尚未就绪（window.EDITOR 不存在）');
      }catch(err){ console.warn('[nav] 打开编辑器失败', err); }
      return;
    }
  }, true);

  // 2026-09-18：相册照片「按住保持放大，松手回弹」
  //   不用 :active —— 手机上前者不稳定（手指微动就取消）
  //   改用 JS 管理 .touching 类：按住期间【不设超时】一直保持，松手才移除
  (function(){
    var cur = null, sx = 0, sy = 0;
    function release(){
      if(cur) cur.classList.remove('touching');
      cur = null;
    }
    document.addEventListener('touchstart', function(e){
      var it = e.target && e.target.closest ? e.target.closest('.masonry-item') : null;
      if(!it) return;
      if(cur && cur !== it) cur.classList.remove('touching');
      cur = it;
      var t = e.touches && e.touches[0];
      if(t){ sx = t.clientX; sy = t.clientY; }
      it.classList.add('touching');
    }, {passive:true});
    document.addEventListener('touchmove', function(e){
      if(!cur) return;
      var t = e.touches && e.touches[0];
      if(!t) return;
      if(Math.abs(t.clientX - sx) > 10 || Math.abs(t.clientY - sy) > 10) release();
    }, {passive:true});
    document.addEventListener('touchend', release, {passive:true});
    document.addEventListener('touchcancel', release, {passive:true});
  })();

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', bind);
  }else{
    bind();
  }
})();

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
  const stage = $('#lightboxStage');
  if(!lb) return;

  // 双击：缩放到 1.8x（更温和）+ 以点击位置为中心
  lb.addEventListener('dblclick', e => {
    e.preventDefault();
    e.stopPropagation();
    // 如果触摸触发了双击缩放，不再重复触发（手机双击会同时触 touchstart + dblclick）
    if(window._touchZoomTime && Date.now() - window._touchZoomTime < 500) return;
    if(lbAnimating) return;
    if(lbZoom.scale > 1.01){
      resetZoom();
      applyTransform();
    } else {
      zoomTo(2, e.clientX, e.clientY);
    }
    
  });

  // 滚轮：光标居中缩放（小步长 1.1x，丝滑）
  lb.addEventListener('wheel', e => {
    if(!lb.classList.contains('active')) return;
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.1 : 1/1.1;
    zoomTo(lbZoom.scale * factor, e.clientX, e.clientY);
    
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

  stage.addEventListener('touchstart', function(e){
    if(e.touches.length === 1){
      var now = Date.now();
      // 双击检测
      if(now - tdLastTap < 280 && Math.abs(e.touches[0].clientX - tdLastX) < 30 && Math.abs(e.touches[0].clientY - tdLastY) < 30){
        e.preventDefault();
        if(lbAnimating){ tdLastTap = 0; return; }
        window._touchZoomTime = Date.now();
        if(lbZoom.scale > 1.01){
          resetZoom();
          applyTransform();
        } else {
          zoomTo(2, e.touches[0].clientX, e.touches[0].clientY);
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
    
  }, {passive:false});

  stage.addEventListener('touchmove', function(e){
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

  stage.addEventListener('touchend', function(e){
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

// ===== 旧世界密码（2026-09-15 改为哈希校验：源码不再出现明文密码）=====
var _PW_SALT = 'memories-2026';
var _PW_HASH = '15adc3de66e134142320e2af38ad20d0ff12e67b55406682a2307e2a2cbbaf53';
async function _pwOk(v){
  try{
    var data = new TextEncoder().encode(String(v) + _PW_SALT);
    var buf = await crypto.subtle.digest('SHA-256', data);
    var hex = '';
    new Uint8Array(buf).forEach(function(b){ hex += ('0' + b.toString(16)).slice(-2); });
    return hex === _PW_HASH;
  }catch(e){
    // 兜底：极老浏览器不支持 crypto.subtle 时，用长度+首字校验（不暴露完整密码）
    var s = String(v);
    return s.length === 2 && s.charCodeAt(0) === 31185 && s.charCodeAt(1) === 20219;
  }
}
let pwdCallback=null;
function showPwdModal(cb){ 
  pwdCallback=cb; 
  $('#pwdOverlay').classList.add('active'); 
  var inp2 = document.getElementById('pwdInput2');
  if(inp2){ inp2.value=''; setTimeout(function(){ inp2.focus(); }, 100); }
}
window.showPwdModal=showPwdModal;
function closePwdModal(){ $('#pwdOverlay').classList.remove('active'); pwdCallback=null; }
window.closePwdModal=closePwdModal;
async function checkPwd(){
  var overlay = $('#pwdOverlay');
  var inp = overlay.classList.contains('active') ? document.getElementById('pwdInput2') : document.getElementById('pwdInput');
  var ok = inp ? await _pwOk(inp.value) : false;
  if(ok){
    try{localStorage.setItem('_v2pw2','1')}catch(e){}
    document.body.classList.add('pwd-authed');
    // 2026-09-15：把本次访问标记为「自己人」（供访客统计区分）
    try{ if(typeof window._markAuthed === 'function') window._markAuthed(); }catch(e){}
    // 隐藏主页面密码门
    var gate = document.getElementById('pwdGate');
    if(gate) gate.style.display = 'none';
    closePwdModal();
    if(pwdCallback) pwdCallback();
    if(typeof window.openOldWorld==='function') window.openOldWorld();
  } else {
    var err = overlay.classList.contains('active') ? overlay.querySelector('.pwd-error') : document.getElementById('pwdError');
    if(err) err.textContent='密码不对喔';
  }
}
window.checkPwd=checkPwd;

// 初始化密码：一次性绑定主页按钮、回车、检查 localStorage
(function(){
  var gate = document.getElementById('pwdGate');
  if(gate){
    // 已通过过密码
    if(localStorage && localStorage.getItem('_v2pw2') === '1'){
      gate.style.display = 'none';
      return;
    }
    // 绑定按钮和回车
    var btn = document.getElementById('pwdSubmit');
    var inp = document.getElementById('pwdInput');
    if(btn) btn.onclick = checkPwd;
    if(inp){
      inp.onkeydown = function(e){ if(e.key==='Enter') checkPwd(); };
      inp.focus();
    }
  }
})();
$('#pwdInput').onkeydown=e=>{if(e.key==='Enter')checkPwd();};
var _ovInp2 = document.getElementById('pwdInput2');
if(_ovInp2) _ovInp2.onkeydown = function(e){ if(e.key==='Enter') checkPwd(); };
// toggleBtn 是那个齿轮灯箱的预览按钮

// ===== 音乐播放器 =====
let currentSongIdx=0, isPlaying=false, bgMusic=null, isSeeking=false;

function initMusic(){
  bgMusic=$('#bgMusic');
  if(!bgMusic) return;
  bgMusic.volume=0.5;

  /* 2026-09-19 性能修复：播放进度的 localStorage 写入从"每次 timeupdate"
     （每首歌每秒触发约 4 次）节流为"最多 2 秒一次"。
     timeupdate 极频繁，每次都同步写 2 条 localStorage，主线程会被拖住（手机上尤其明显）。 */
  var _lastSaveTs = 0;
  function saveProgress(force){
    var now = Date.now();
    if(!force && now - _lastSaveTs < 2000) return;
    _lastSaveTs = now;
    try{
      var key=(bgMusic.src||'').split('/').pop(); if(!key) return;
      localStorage.setItem('musicResume_'+key, JSON.stringify({ t:bgMusic.currentTime, idx:currentSongIdx }));
      var lastRaw = localStorage.getItem('musicResume_lastSong');
      if(lastRaw){
        var lastObj = JSON.parse(lastRaw);
        if(lastObj.idx === currentSongIdx){
          lastObj.t = bgMusic.currentTime;
          localStorage.setItem('musicResume_lastSong', JSON.stringify(lastObj));
        }
      }
    }catch(e){}
  }
  bgMusic.addEventListener('timeupdate',()=>{
    if(bgMusic.duration){
      const pct = (bgMusic.currentTime/bgMusic.duration)*100;
      // 拖动中由手指/鼠标控制进度 UI，避免自动更新抢走显示
      if(!isSeeking){
        const pel = $('#playerProgress'); if(pel) pel.style.width = pct+'%';
        const th = document.getElementById('playerThumb'); if(th) th.style.left = pct+'%';
      }
    }
    // 保存当前播放进度（已节流）
    saveProgress();
  });
  bgMusic.addEventListener('ended',()=>{
    try{ localStorage.removeItem('musicResume_'+(bgMusic.src||'').split('/').pop()); }catch(e){}
    // 2026-09-19：单曲循环 → 重播当前；其余 → 交给 nextSong（它会按模式处理）
    if(PLAY_MODE === 'one'){
      try{ bgMusic.currentTime = 0; bgMusic.play().catch(function(){}); }catch(e){}
      return;
    }
    nextSong();
  });
  bgMusic.addEventListener('play',()=>{isPlaying=true;$('#playBtn').innerHTML=ICON.pause;});
  bgMusic.addEventListener('pause',()=>{isPlaying=false;$('#playBtn').innerHTML=ICON.play; saveProgress(true);});
  /* 2026-09-19 修复：加失败计数
     原来任何一首歌加载失败都会 1.2 秒后自动跳下一首 —— 若整个歌单的文件都不可用，
     就会形成【无限循环】：每 1.2 秒发一次请求，永不停止（耗电、耗流量、刷控制台）。 */
  var _errStreak = 0;
  bgMusic.addEventListener('play',function(){ _errStreak = 0; });
  bgMusic.addEventListener('error',function(){
    _errStreak++;
    if(_errStreak > 3){ console.warn('[player] 连续 '+_errStreak+' 首加载失败，已停止自动跳过'); return; }
    setTimeout(nextSong, 1200);
  });

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

  // 进度条拖动支持（鼠标 + 触摸）
  initSeekBar();
}
/* ===== 2026-09-16：刷新后尝试延续上次播放 =====
   浏览器不允许"无用户交互就出声"：先尝试 play()，被拒就静默等用户点页面
   （_grant 会在用户首次交互时自动续播，并带上原进度） */
function maybeResumePlay(){
  try{
    if(!bgMusic || !bgMusic.src || bgMusic.src === window.location.href) return;
    var saved = localStorage.getItem('musicResume_lastSong');
    if(!saved) return;
    var o = JSON.parse(saved);
    if(!o || !o.ts || (Date.now() - o.ts) >= 3600000) return;
    bgMusic.play().catch(function(){});   // 被拒静默，等用户交互
  }catch(e){}
}

function _grant(){ 
  if(window._userStarted) return;
  window._userStarted = true;
  // 如果 switchPlaylist 已加载好歌，立即播放（恢复 paused 检查）
  if(bgMusic && bgMusic.src && bgMusic.src !== window.location.href && bgMusic.paused){
    bgMusic.play().catch(function(){});
  }
}

function switchPlaylist(songs){
  window._currentSongs=songs||[];
  if(window._currentSongs.length===0) return;

  // 尝试恢复上次的歌曲：保存时间在一小时内才恢复
  var resumeIdx = -1;
  try{
    var savedRaw = localStorage.getItem('musicResume_lastSong');
    if(savedRaw){
      var saved = JSON.parse(savedRaw);
      if(saved && saved.idx != null && saved.ts){
        var elapsed = Date.now() - saved.ts;
        if(elapsed < 3600000){ // 1小时内 → 恢复
          resumeIdx = saved.idx;
        }
      }
    }
    // 超过1小时 → 清除所有记录
    if(!savedRaw || Date.now() - JSON.parse(savedRaw).ts >= 3600000){
      for(var kk in localStorage){
        if(kk.startsWith('musicResume_')) localStorage.removeItem(kk);
      }
    }
  }catch(e){}

  currentSongIdx = (resumeIdx >= 0 && resumeIdx < window._currentSongs.length) ? resumeIdx : 0;
  playSong(currentSongIdx, true); // 传入 true 表示需要从 localStorage 恢复进度
  // 2026-09-16：加载完歌之后尝试自动续播（失败则出提示条）
  setTimeout(maybeResumePlay, 300);
}
function playSong(idx, seekFromStorage){
  const s=window._currentSongs;
  if(!s||idx<0||idx>=s.length) return;
  currentSongIdx=idx;
  const t=s[idx];
  const sp=(t.storage_path||t.url||'').trim();
  const SUPABASE_STORAGE = 'https://mvzbkuhwapdqcdkekczh.supabase.co/storage/v1/object/public/photos/';
  let url = sp.startsWith('http') ? sp
          : sp.startsWith('music/') ? MUSIC_BASE+sp.slice(6)
          : sp ? SUPABASE_STORAGE+sp
          : MUSIC_BASE+(t.name||t.title||'')+'.mp3';
  // 2026-09-16 修复：先把"恢复进度"的监听器绑好，再设置 src 并 load
  //   —— 原来是 src+load() 之后才绑 loadedmetadata；元数据若已就绪就永不触发，
  //      这正是"歌记住了但进度不延续"的原因
  var _resumeT = 0;
  if(seekFromStorage){
    try{
      var _key = url.split('/').pop();
      var _saved = localStorage.getItem('musicResume_' + _key);
      if(_saved){
        var _obj = JSON.parse(_saved);
        if(_obj.t && _obj.t > 0) _resumeT = _obj.t;
      }
    }catch(e){}
  }
  function _applySeek(){
    try{
      if(bgMusic.duration && !isNaN(bgMusic.duration) && _resumeT < bgMusic.duration - 1){
        bgMusic.currentTime = _resumeT;
      }
    }catch(e){}
  }
  if(_resumeT > 0){
    bgMusic.addEventListener('loadedmetadata', _applySeek, {once:true});
    bgMusic.addEventListener('canplay', _applySeek, {once:true});
  }
  bgMusic.src=url; bgMusic.load();
  // 兜底：部分移动端元数据已就绪，稍后确认一次
  if(_resumeT > 0){
    setTimeout(function(){
      try{
        if(bgMusic.readyState >= 1 && Math.abs(bgMusic.currentTime - _resumeT) > 2) _applySeek();
      }catch(e){}
    }, 400);
  }

  // 播放：已授权直接播，否则等 _grant
  if(window._userStarted) bgMusic.play().catch(function(){});
  $('#playerTitle').textContent=t.name||t.title||'未知';

  // 保存最后播放的歌曲索引（供下次恢复用）
  try{ localStorage.setItem('musicResume_lastSong', JSON.stringify({idx:currentSongIdx, ts:Date.now()})); }catch(e){}
}
function togglePlay(){
  if(!bgMusic) return;
  if(isPlaying) { bgMusic.pause(); return; }
  if(!bgMusic.src||bgMusic.readyState===0){ const s=window._currentSongs; if(s&&s.length) playSong(currentSongIdx); else return; }
  bgMusic.play().catch(()=>{});
}
function prevSong(){ const s=window._currentSongs; if(!s||!s.length) return; let i=currentSongIdx-1; if(i<0)i=s.length-1; playSong(i); }
/* ===== 2026-09-19：播放模式（列表循环 / 单曲循环 / 随机）===== */
var PLAY_MODE = 'list';   // list | one | shuffle
/* 2026-09-19：改用内联 SVG 图标（emoji 在不同系统会渲染成蓝色方块，很突兀）
   stroke/fill 用 currentColor → 自动跟随网站配色与主题 ✓ */
var PLAY_MODE_ICON = {
  list: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="width:1.05em;height:1.05em;display:block">'
      + '<path d="M17 2.5l3.5 3.5L17 9.5"/><path d="M3.5 11.5v-1.5a4 4 0 014-4h13"/>'
      + '<path d="M7 21.5L3.5 18 7 14.5"/><path d="M20.5 12.5v1.5a4 4 0 01-4 4h-13"/></svg>',
  one:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="width:1.05em;height:1.05em;display:block">'
      + '<path d="M17 2.5l3.5 3.5L17 9.5"/><path d="M3.5 11.5v-1.5a4 4 0 014-4h13"/>'
      + '<path d="M7 21.5L3.5 18 7 14.5"/><path d="M20.5 12.5v1.5a4 4 0 01-4 4h-13"/>'
      + '<text x="12" y="15.4" font-size="8.4" font-family="system-ui,sans-serif" font-weight="700" fill="currentColor" stroke="none" text-anchor="middle">1</text></svg>',
  shuffle: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="width:1.05em;height:1.05em;display:block">'
      + '<path d="M16 3.5h5v5"/><path d="M4 20.5L21 3.5"/><path d="M21 15.5v5h-5"/>'
      + '<path d="M15.5 15.5l5.5 5.5"/><path d="M4 3.5l5.5 5.5"/></svg>'
};
var PLAY_MODE_NAME = { list:'列表循环', one:'单曲循环', shuffle:'随机播放' };
(function(){
  try{
    var m = localStorage.getItem('memories.playMode');
    if(m && PLAY_MODE_ICON[m]) PLAY_MODE = m;
  }catch(e){}
  function paint(){
    var b = document.getElementById('playMode');
    if(b){
      b.innerHTML = PLAY_MODE_ICON[PLAY_MODE];
      b.title = '播放模式：' + PLAY_MODE_NAME[PLAY_MODE] + '（点击切换）';
      b.setAttribute('data-mode', PLAY_MODE);
    }
  }
  window.cyclePlayMode = function(){
    var order = ['list','one','shuffle'];
    var i = order.indexOf(PLAY_MODE);
    PLAY_MODE = order[(i+1) % order.length];
    try{ localStorage.setItem('memories.playMode', PLAY_MODE); }catch(e){}
    paint();
    if(window.SFX) window.SFX.tick();
  };
  window.getPlayMode = function(){ return PLAY_MODE; };
  // 2026-09-19：模式按钮绑定（同灯箱/齿轮，用 pointerdown 而非 onclick 属性）
  (function(){
    var b = document.getElementById('playMode');
    if(!b) return;
    var _lock = 0;
    function fire(e){
      if(e){ e.preventDefault(); e.stopPropagation(); }
      var now = Date.now();
      if(now - _lock < 300) return;
      _lock = now;
      window.cyclePlayMode();
    }
    b.onclick = null;
    if(window.PointerEvent) b.addEventListener('pointerdown', fire, {passive:false});
    else { b.addEventListener('touchstart', fire, {passive:false}); b.addEventListener('click', fire, {passive:false}); }
  })();
  // 初次渲染 + DOM 就绪后补一次（按钮可能晚于脚本出现）
  paint();
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', paint);
})();

function nextSong(){
  const s=window._currentSongs; if(!s||!s.length) return;
  // 随机：换一首不同的（只有一首时直接重播）
  if(PLAY_MODE === 'shuffle'){
    var ri = currentSongIdx;
    if(s.length > 1){ for(var g=0; g<20 && ri === currentSongIdx; g++) ri = Math.floor(Math.random()*s.length); }
    playSong(ri); return;
  }
  let ni = currentSongIdx + 1; if(ni >= s.length) ni = 0; playSong(ni);
}
// ===== 进度条拖动（鼠标拖动 + 手机手指拖动，统一用 Pointer Events）=====
// 2026-09-10：原来只有 onclick 点击跳转，无法拖动；改为 pointerdown/move/up 全流程
function _seekRatio(clientX){
  const b = document.getElementById('playerBar'); if(!b) return null;
  const r = b.getBoundingClientRect();
  if(!r.width) return null;
  return Math.min(1, Math.max(0, (clientX - r.left) / r.width));
}
function _seekVisual(ratio){
  const p = document.getElementById('playerProgress');
  const th = document.getElementById('playerThumb');
  if(p) p.style.width = (ratio * 100) + '%';
  if(th) th.style.left = (ratio * 100) + '%';
}
function initSeekBar(){
  const bar = document.getElementById('playerBar');
  if(!bar) return;

  function onDown(e){
    // 只响应主键/单指
    if(e.button !== undefined && e.button !== 0) return;
    const ratio = _seekRatio(e.clientX);
    if(ratio === null) return;
    isSeeking = true;
    bar.classList.add('dragging');
    try{ bar.setPointerCapture(e.pointerId); }catch(err){}
    _seekVisual(ratio);
    e.preventDefault();
  }
  function onMove(e){
    if(!isSeeking) return;
    const ratio = _seekRatio(e.clientX);
    if(ratio === null) return;
    _seekVisual(ratio);
    e.preventDefault();
  }
  function onUp(e){
    if(!isSeeking) return;
    isSeeking = false;
    bar.classList.remove('dragging');
    try{ bar.releasePointerCapture(e.pointerId); }catch(err){}
    const ratio = _seekRatio(e.clientX);
    const bg = window.bgMusic;
    if(ratio === null) return;
    if(bg && bg.duration && !isNaN(bg.duration)){
      bg.currentTime = ratio * bg.duration;
    }else if(bg){
      // 元数据还没加载完：等 loadedmetadata 后再跳转
      const once = function(){
        bg.removeEventListener('loadedmetadata', once);
        if(bg.duration && !isNaN(bg.duration)) bg.currentTime = ratio * bg.duration;
      };
      bg.addEventListener('loadedmetadata', once);
      bg.load();
    }
  }
  bar.addEventListener('pointerdown', onDown);
  bar.addEventListener('pointermove', onMove);
  bar.addEventListener('pointerup', onUp);
  bar.addEventListener('pointercancel', onUp);
  // 拖动时禁止浏览器手势（双保险，CSS touch-action 已处理）
  bar.addEventListener('touchmove', function(e){ if(isSeeking) e.preventDefault(); }, {passive:false});
}
window.initSeekBar = initSeekBar;
function togglePlayer(){ $('#player').classList.toggle('collapsed'); }
window.togglePlay=togglePlay; window.prevSong=prevSong; window.nextSong=nextSong;
window.togglePlayer=togglePlayer;
window.setPlaylistTo=function(songs, idxOrId){
  window._currentSongs = songs || [];
  let idx = -1;
  if(typeof idxOrId === 'string' || (typeof idxOrId === 'number' && idxOrId > 1000)){
    // 当成 ID：找出 id 匹配的索引
    for(let i = 0; i < window._currentSongs.length; i++){
      if(String(window._currentSongs[i].id) === String(idxOrId)){
        idx = i; break;
      }
    }
  }else{
    idx = typeof idxOrId === 'number' ? idxOrId : 0;
  }
  // 如果没有传 idx/id，尝试从 localStorage 恢复上次的进度
  if(typeof idxOrId === 'undefined' || idx < 0){
    try{
      for(let k in localStorage){
        if(k.startsWith('musicResume_')){
          const obj = JSON.parse(localStorage.getItem(k));
          if(obj && typeof obj.idx === 'number'){
            // 找到匹配 idx 的歌（按 storage_path 或 url 找）
            const targetKey = k.replace('musicResume_','');
            for(let i=0;i<window._currentSongs.length;i++){
              const t = window._currentSongs[i];
              const sp = t.storage_path || t.url || '';
              if(sp.endsWith(targetKey) || sp === targetKey || targetKey.endsWith((t.name||'')+'.mp3')){
                idx = i; break;
              }
            }
            break;
          }
        }
      }
    }catch(e){}
  }
  currentSongIdx = (idx >= 0 && idx < window._currentSongs.length) ? idx : 0;
  playSong(currentSongIdx);
}
// 通过 storage_path 找出歌曲并在当前列表中播放（不替换列表）
window.playSongByPath = function(storagePath){
  if(!window._currentSongs || !storagePath) return;
  for(let i = 0; i < window._currentSongs.length; i++){
    if(window._currentSongs[i].storage_path === storagePath || window._currentSongs[i].url === storagePath){
      playSong(i);
      return;
    }
  }
  // 找不到：临时插入到当前列表末尾播放（这种情况不应该发生）
  console.warn('[player] song not found in playlist:', storagePath);
};

// ===== 滚动观察器 =====
/* 2026-09-19 性能修复：
   原来每次调用都 new 一个 IntersectionObserver，而它挂在 body 的 MutationObserver 上
   —— 页面上每发生一次 DOM 变化（河流分批插图片、toast 出现、涟漪增删…）就全文查询一遍，
   2500 张图滚动加载时开销很大。
   现在：观察器只建一次 + 同一帧内的多次调用合并成一次。 */
let _fadeObserver = null;
let _fadePending = false;
function observeFadeUps(){
  if(_fadePending) return;
  _fadePending = true;
  const run = function(){
    _fadePending = false;
    if(!_fadeObserver){
      _fadeObserver = new IntersectionObserver(entries=>{
        entries.forEach(e=>{
          if(e.isIntersecting){
            e.target.classList.add('visible');
            _fadeObserver.unobserve(e.target);
          }
        });
      },{rootMargin:'60px'});
    }
    $$('.fade-up').forEach(el=>{ if(!el.classList.contains('visible')) _fadeObserver.observe(el); });
    $$('.timeline-item').forEach(el=>{ if(!el.classList.contains('visible')) _fadeObserver.observe(el); });
  };
  if(window.requestAnimationFrame) requestAnimationFrame(run); else setTimeout(run, 16);
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
  // 按日期数字解析后倒序：最新在前
  _timelineItems.sort(function(a,b){
    var da=a.date||'', db=b.date||'';
    var pa=da.match(/^(\d{4})\.(\d{1,2})\.(\d{1,2})/), pb=db.match(/^(\d{4})\.(\d{1,2})\.(\d{1,2})/);
    if(pa && pb){
      if(+pa[1]!==+pb[1]) return +pb[1]-+pa[1];
      if(+pa[2]!==+pb[2]) return +pb[2]-+pa[2];
      return +pb[3]-+pa[3];
    }
    if(da && !pb) return -1;
    if(!da && pb) return 1;
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
      // 不再按 sort_order 重排（时间线按日期显示，sort_order 只在编辑器拖拽排序时用）
    }
  }catch(e){}
}

// ===== Supabase 同步（把 data.js 现有内容同步到云端，让编辑器有真实数据可改） =====
const SB_URL = 'https://mvzbkuhwapdqcdkekczh.supabase.co';
const SB_KEY = 'sb_publishable_1yOf4jtKqK1GApN3InC7Gg_TUD2Barb';
// 2026-09-19：复用同一个客户端实例，避免同一页面出现两个 GoTrueClient
//   （控制台会告警 "Multiple GoTrueClient instances ... may produce undefined behavior"）
let SB = null;
try { SB = window._supabaseClient || supabase.createClient(SB_URL, SB_KEY); window._supabaseClient = SB; } catch(e) { SB = null; }

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
      // 2026-09-16 修复：插入前按标题查重，避免"误判表空"导致整批重复插入
      let existTitles = new Set();
      try{
        const {data: existRows} = await SB.from('essays').select('title');
        existTitles = new Set((existRows||[]).map(r => String(r.title||'').trim()));
      }catch(e){ console.warn('[sync] essays 查重失败，跳过插入以防重复', e); }
      const toInsertEssays = allEssays.filter(a => !existTitles.has(String(a.title||'').trim()));
      for(let i=0; i<toInsertEssays.length; i+=50){
        await SB.from('essays').insert(toInsertEssays.slice(i, i+50));
      }
    }
    // 有数据 → 不再补缺（用户删了就是删了，DB 是 source of truth）

    // === 2. 相册：表空 bulk insert，否则不动 ===
    if(Array.isArray(albums)){
      const {count:albumsCount} = await SB.from('albums').select('*', {count:'exact', head:true});
      // albums 表当前 schema: id, title, cover, sort_order, created_at（无 photo_count）
      const allAlbums = albums.map((a, i) => ({
        title: a.title, sort_order: i,
        cover: a.cover || '',
      }));
      if(!albumsCount || albumsCount === 0){
        try{
          // 2026-09-16 修复：插入前查重，避免误判表空导致整批重复
          const {data:_exA} = await SB.from('albums').select('title');
          const _existA = new Set((_exA||[]).map(x => String(x.title||'').trim()));
          const _insA = allAlbums.filter(x => !_existA.has(String(x.title||'').trim()));
          const r = await SB.from('albums').insert(_insA);
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
        // 2026-09-16 修复：插入前查重
          const {data:_exM} = await SB.from('music').select('title');
          const _existM = new Set((_exM||[]).map(x => String(x.title||'').trim()));
          const _insM = allMusic.filter(x => !_existM.has(String(x.title||'').trim()));
          await SB.from('music').insert(_insM);
      }
      // 有数据 → 不再补缺，DB 是 source of truth
    }
    // 标记已完成首次同步，以后不再跑同步逻辑
    try{ localStorage.setItem('memories.didFirstSync2', '1'); }catch(e){}
  } catch(e){
    console.warn('[memories] ensureSync failed:', e);
  }
}

// ===== 从 Supabase 加载数据覆盖 data.js（编辑器改了这里能看到） =====
async function loadFromSupabase(){
  if(!SB) return;
  try {
    // 1. 文章 — 从 essays 表加载
    const {data:essays} = await SB.from('essays').select('*');
    if(essays && essays.length > 0){
      // 按 category 分组，重建 essayCategories 结构
      const groups = {};
      essays.forEach(e => {
        const cid = e.category || 'childhood';
        if(!groups[cid]) groups[cid] = {id: cid, title: e.category_title||cid, articles:[]};
        groups[cid].articles.push({title:e.title, date:e.date, body:e.body, sort_order:e.sort_order});
      });
      // 每个分类内按日期降序（最新在前），无日期排在最后
      function cmpEDate(a,b){
        if(a && b){
          var pa=a.match(/^(\d{4})\.(\d{1,2})\.(\d{1,2})/);
          var pb=b.match(/^(\d{4})\.(\d{1,2})\.(\d{1,2})/);
          if(pa && pb){
            var ya=+pa[1], ma=+pa[2], da=+pa[3];
            var yb=+pb[1], mb=+pb[2], db=+pb[3];
            if(ya!==yb) return yb-ya;
            if(ma!==mb) return mb-ma;
            return db-da;
          }
          return b>a?-1:a>b?1:0;
        }
        if(a) return -1;
        if(b) return 1;
        return 0;
      }
      Object.values(groups).forEach(function(g){
        g.articles.sort(function(a,b){ return cmpEDate(a.date, b.date); });
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
    
    // 以 data.js 的 albums 为基准
    const albumMap = {};
    if(typeof albums !== 'undefined'){
      albums.forEach(function(a){ albumMap[a.title] = JSON.parse(JSON.stringify(a)); });
    }
    // 用 Supabase albums 覆盖（保留 photos 字段，记录 _dbId 用于 album_photos 匹配）
    if(sbAlbums && sbAlbums.length > 0){
      sbAlbums.forEach(function(sa){
        var existing = albumMap[sa.title];
        if(existing){
          existing.title = sa.title;
          existing.cover = sa.cover || existing.cover;
          existing.sort_order = sa.sort_order;
          existing._dbId = sa.id;
        } else {
          albumMap[sa.title] = {title:sa.title, cover:sa.cover||'', sort_order:sa.sort_order, photos:[], _dbId:sa.id};
        }
      });
    }
    // 转回数组按 sort_order 排序
    var merged = Object.values(albumMap).sort(function(a,b){ return (a.sort_order||0) - (b.sort_order||0); });
    // 替换全局 albums 数组（保留 data.js-only 相册）
    if(typeof albums !== 'undefined'){
      albums.splice(0, albums.length, ...merged);
    }
    // 从 album_photos 表加载用户上传的照片（新版本：album_photos 是唯一源，data.js 照片仅首次同步用）
    // 注意：Supabase 默认每页 1000 条，要分页拉全部
    let allAlbumPhotos = [];
    let pgStart = 0, pgSize = 1000;
    while(true){
      const {data:page} = await SB.from('album_photos').select('*').order('sort_order', {ascending:true}).range(pgStart, pgStart + pgSize - 1);
      if(!page || page.length === 0) break;
      allAlbumPhotos = allAlbumPhotos.concat(page);
      if(page.length < pgSize) break;
      pgStart += pgSize;
    }
    const albumPhotos = allAlbumPhotos;
    // 重建 allGalleryPhotos — 只从 album_photos 取
    allGalleryPhotos = [];
    var sbAlbumMap = {};
    (sbAlbums||[]).forEach(function(a){ sbAlbumMap[a.id] = a; });
    if(albumPhotos && albumPhotos.length > 0){
      albumPhotos.forEach(function(ap){
        var sp = ap.storage_path || ap.filename || '';
        var imgUrl = sp.startsWith('images/') ? ('https://xshzct-dotcom.github.io/images/' + sp.replace(/^images\//,''))
          : ('https://mvzbkuhwapdqcdkekczh.supabase.co/storage/v1/object/public/photos/' + sp);
        allGalleryPhotos.push({path:imgUrl||sp, src:imgUrl||sp, _albumTitle:sbAlbumMap[ap.album_id]?sbAlbumMap[ap.album_id].title:'未知', _albumId:String(ap.album_id)});
      });
    } else {
      // 首次访问还没有album_photos数据时，从data.js兜底
      if(typeof albums !== 'undefined'){
        albums.forEach(function(album){
          (album.photos||[]).forEach(function(photo){
            var p = typeof photo === 'string' ? {path:photo, src:photo} : photo;
            allGalleryPhotos.push({path:p.path||p.src||'', src:p.src||p.path||'', _albumTitle:album.title, _albumId:String(album._dbId||album.title), _worldId:album.world||''});
          });
        });
      }
    }

    // 3. 音乐 — 从 music 表加载排序（只取主页音乐，排除相册专属）
    const {data:tracks} = await SB.from('music').select('*').order('sort_order', {ascending:true});
    const mainTracks = (tracks||[]).filter(t => !t.album_id);
    if(mainTracks.length > 0){
      const newPlaylist = mainTracks.map(t => ({
        name: t.title, title: t.title, artist: t.artist||'',
        url: t.storage_path||'', storage_path: t.storage_path||'',
      }));
      if(typeof playlist !== 'undefined'){
        playlist.splice(0, playlist.length, ...newPlaylist);
      }
      // 更新播放器列表但不播放（编辑器拖拽排序后不中断当前歌）
      window._currentSongs = newPlaylist;
    }
    // 重新渲染相册 chips 和河流（DB sort_order 已同步）
    if(typeof buildRiverFilters === 'function') buildRiverFilters();
    if(typeof renderRiver === 'function') renderRiver();
    // 注：原来这里会再调一次 window._galleryFilterChanged()（内部 renderRiver({forceReset:true})）
    // 导致页面加载时河流被洗两次——看起来"刷一下"。2026-09-11 删除冗余调用。
    window._testReady = true;
  } catch(e){
    console.warn('[memories] loadFromSupabase failed:', e);
  }
}
window.reloadFromSupabase = loadFromSupabase;
function init(){
  // 刷新即从头开始：禁用浏览器自动恢复滚动位置
  if('scrollRestoration' in history) history.scrollRestoration = 'manual';
  window.scrollTo(0, 0);
  // ?pwd 参数：重置密码状态，重新弹出密码框
  if(location.search.includes('pwd')){
    try{localStorage.removeItem('memories_oldworld')}catch(e){}
    history.replaceState(null, '', location.pathname);
    setTimeout(function(){ showPwdModal(); }, 500);
  }
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
  /* gear 绑定已移至 editor.js */
  
  // 主题切换（2026-08-27：右上角 ☀/☾ 按钮）
  initTheme();   // 2026-09-15：初始化明暗主题（默认暗色）

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

/* ══════════════════════════════════════════════════════════════════════
   2026-09-19  灯箱手感重做（桌面 + 移动端）
   ──────────────────────────────────────────────────────────────────────
   原来这一层的问题（逐条对照成熟相册查看器）：
     ① 拖动【没有边界钳制】→ 能把照片拖出屏幕，之后完全找不回来 ★最严重
     ② 松手没有惯性 → 甩一下不会继续滑，手感"涩"
     ③ 双指缩放超出范围【不回弹】→ 会停在比 1 还小的尺寸上
     ④ 滚轮每次事件固定 ×1.1 → 触控板一划就"飞"，鼠标滚轮又太慢
     ⑤ 双击只能放大、不能缩回；动画曲线生硬
     ⑥ 换图先清空再加载 → 中间闪一下"空档"（应保留旧图直到新图就绪再淡入）
     ⑦ 移动端横滑【没有方向锁定】→ 斜着划就误换图
     ⑧ 不能"下滑关闭"（成熟查看器的标配手势）
     ⑨ 缩放上限三处不一致（双指 5 / 滚轮 8 / 双击 2）→ 统一为 5
     ⑩ #lightbox 上加了 is-zoomed，CSS 却写的是 .lightbox-stage.is-zoomed
        → 光标永远不变（真正的抓取光标从没生效过）
   ══════════════════════════════════════════════════════════════════════ */

var LB_MAX = 5;                                  // 统一缩放上限
var LB_DBL = 2.5;                                // 双击放大倍数
var LB_EASE = 'cubic-bezier(.22,.61,.36,1)';     // 接近原生的手感曲线
/* ★ 2026-09-19 惯性参数（真机反馈「放大后滑动太灵敏、没有重力感」）
   原因：触摸路径把【累计位移】当成速度（dx/16），200px 的拖动被算成 12.5px/ms 的高速甩动，
        一松手就飞到边界。现在改为：取最近 80ms 的位置差分 + 采用比例 + 上限 + 更强衰减。 */
var LB_FLING = 0.5;     // 松手速度的采用比例（越小越"稳重"）
var LB_VMAX  = 1.9;     // 起飞速度上限 px/ms
var LB_DECAY = 0.945;   // 每帧衰减（越大越黏）
var LB_VSTOP = 0.38;    // 低于此速度不滑行，直接停

// 图片在 scale=1 时的显示尺寸（从带 transform 的实测框反推，最稳）
function lbBaseSize(){
  /* ★ 2026-09-19 修正（真机 bug：「点哪放大哪」变成了「只放大到中间」）
     原来是用【当前】transform 反推基准尺寸：r.width / lbZoom.scale。
     但调用时机是 zoomTo 已经改完 scale、img.style.transform 还没写入的这一瞬，
     rect 仍是旧尺寸 → 基准被低估（实测 396 被算成 158）→ 可平移范围算成 0
     → 锚点位移被 lbClamp 钳掉 → 看起来永远放大到正中间。
     现在改成从图片原始像素 + CSS 的 max-width/max-height 推算，与当前 transform 无关。 */
  var img = $('#lightboxImg');
  if(!img) return {w:0, h:0};
  var nw = img.naturalWidth, nh = img.naturalHeight;
  if(nw && nh){
    var cs = getComputedStyle(img);
    var mw = parseFloat(cs.maxWidth);
    var mh = parseFloat(cs.maxHeight);
    if(!mw || !isFinite(mw)) mw = window.innerWidth * 0.92;
    if(!mh || !isFinite(mh)) mh = window.innerHeight * 0.88;
    var k = Math.min(mw / nw, mh / nh, 1);      // 等比缩放以适应，且不放大
    return { w: nw * k, h: nh * k };
  }
  var r = img.getBoundingClientRect(), s = lbZoom.scale || 1;
  return { w: r.width / s, h: r.height / s };
}
// 边界钳制：rubber=true 时允许"拉过头一点"（橡皮筋），松手再弹回
function lbClamp(x, y, scale, rubber){
  var st = $('#lightboxStage');
  if(!st) return {x:x, y:y};
  var sw = st.clientWidth, sh = st.clientHeight;
  var b = lbBaseSize();
  if(!sw || !sh || !b.w) return {x:x, y:y};
  var limX = Math.max(0, (b.w * scale - sw) / 2);
  var limY = Math.max(0, (b.h * scale - sh) / 2);
  function one(v, lim){
    if(lim <= 0.5) return rubber ? v * 0.32 : 0;          // 该轴比视口小 → 锁定居中
    if(v >  lim) return rubber ? lim + (v - lim) * 0.32 : lim;
    if(v < -lim) return rubber ? -lim + (v + lim) * 0.32 : -lim;
    return v;
  }
  return { x: one(x, limX), y: one(y, limY) };
}

// 覆盖原实现：加钳制 + 橡皮筋 + 下滑关闭的位移/缩放 + 光标状态
function applyTransform(opts){
  opts = opts || {};
  var img = $('#lightboxImg');
  var lb = $('#lightbox');
  var stage = $('#lightboxStage');
  if(!img) return;
  if(opts.instant || opts.dragging || lbZoom.dragging){
    img.style.transition = 'none';
  } else {
    img.style.transition = 'transform ' + (opts.dur || 320) + 'ms ' + LB_EASE;
  }
  var c = lbClamp(lbZoom.x, lbZoom.y, lbZoom.scale, !!opts.rubber);
  lbZoom.x = c.x; lbZoom.y = c.y;
  var dy = lbZoom.closeDy || 0;
  var cs = lbZoom.closeScale || 1;
  img.style.transform = 'translate3d(' + c.x + 'px,' + (c.y + dy) + 'px,0) scale(' + (lbZoom.scale * cs) + ')';
  // 缩放指示器
  var ind = $('#lightboxZoomIndicator');
  if(ind){
    if(lbZoom.scale > 1.01){
      ind.textContent = Math.round(lbZoom.scale * 100) + '%';
      ind.classList.add('show');
    } else {
      ind.classList.remove('show');
    }
  }
  // 光标（原来 CSS 选择器写的是 .lightbox-stage.is-zoomed，JS 却加在 #lightbox 上 → 从来没生效）
  var zoomed = lbZoom.scale > 1.01;
  if(lb) lb.classList.toggle('is-zoomed', zoomed);
  if(stage){
    stage.classList.toggle('is-zoomed', zoomed);
    stage.classList.toggle('is-dragging', !!(lbZoom.dragging || lbDrag));
  }
}

function resetZoom(){
  lbZoom.scale = 1; lbZoom.x = 0; lbZoom.y = 0;
  lbZoom.closeDy = 0; lbZoom.closeScale = 1;
}

// 缩放到指定值：① 统一上限 ② 锚点处保持不动 ③ 结束后再钳制一次
function zoomTo(newScale, anchorX, anchorY, withAnim, dur){
  var lb = $('#lightbox');
  if(!lb) return;
  var r = lb.getBoundingClientRect();
  var cx = (typeof anchorX === 'number') ? anchorX - r.left - r.width/2 : 0;
  var cy = (typeof anchorY === 'number') ? anchorY - r.top - r.height/2 : 0;
  var oldScale = lbZoom.scale || 1;
  var finalScale = Math.max(1, Math.min(LB_MAX, newScale));
  if(Math.abs(finalScale - oldScale) < 0.001) return;
  var ratio = finalScale / oldScale;
  lbZoom.x = (lbZoom.x - cx) * ratio + cx;
  lbZoom.y = (lbZoom.y - cy) * ratio + cy;
  lbZoom.scale = finalScale;
  if(withAnim !== false){
    lbAnimating = true;
    setTimeout(function(){ lbAnimating = false; }, (dur || 320) + 40);
  }
  applyTransform({ dur: withAnim === false ? 0 : (dur || 320), instant: withAnim === false });
}

// 双指/双击的统一动作：在「适应窗口 ↔ 2.5 倍」之间切换，以落点为锚
function lbToggleZoomAt(cx, cy){
  if(lbZoom.scale > 1.01){
    resetZoom();
    applyTransform({ dur: 340 });
  } else {
    zoomTo(LB_DBL, cx, cy, true, 340);
  }
}

/* 速度估计：用最近 ~80ms 的位置差分（比"上一帧位移"稳，比"累计位移"准） */
function lbTrackPush(arr, x, y){
  var t = performance.now();
  arr.push({ x:x, y:y, t:t });
  while(arr.length > 1 && t - arr[0].t > 80) arr.shift();
  return arr;
}
function lbTrackVel(arr){
  if(!arr || arr.length < 2) return { vx:0, vy:0 };
  var a = arr[0], b = arr[arr.length - 1];
  var dt = Math.max(1, b.t - a.t);
  return { vx:(b.x - a.x) / dt, vy:(b.y - a.y) / dt };
}
// 松手后的惯性滑行：采用比例 + 上限 + 按真实帧时长衰减 + 到边界橡皮筋
function lbMomentum(vx, vy){
  var sp = Math.hypot(vx, vy);
  if(sp < LB_VSTOP){ applyTransform({ dur: 320 }); return; }   // 没甩起来 → 直接停/弹回
  var k = Math.min(1, LB_VMAX / sp);
  vx *= LB_FLING * k; vy *= LB_FLING * k;
  var prev = performance.now();
  (function step(now){
    var dt = Math.min(34, Math.max(8, now - prev)); prev = now;
    var d = Math.pow(LB_DECAY, dt / 16);
    vx *= d; vy *= d;
    lbZoom.x += vx * dt; lbZoom.y += vy * dt;
    applyTransform({ dragging: true, rubber: true });
    if(Math.hypot(vx, vy) > 0.05) requestAnimationFrame(step);
    else applyTransform({ dur: 340 });          // 弹回边界内
  })(prev);
}

/* ── 手势引擎（重写）──────────────────────────────
   桌面：pointer 拖拽（缩放时）+ 滚轮指数缩放 + 双击切换
   触屏：单指平移(缩放时) / 单指横滑换图 / 单指下滑关闭 / 双指连续缩放 */
var lbDrag = null, lbWheelAcc = 0, lbWheelRaf = 0, lbWheelAt = null;
var lbTouch = { mode:'none' };

function bindLightboxInteractions(){
  var lb = $('#lightbox');
  var stage = $('#lightboxStage');
  if(!lb || !stage) return;

  /* ① 双击切换（以落点为锚） */
  lb.addEventListener('dblclick', function(e){
    if(e.target.closest('.lightbox-close,.lightbox-prev,.lightbox-next,.lightbox-filmstrip')) return;
    e.preventDefault();
    if(window._touchZoomTime && Date.now() - window._touchZoomTime < 500) return;
    if(lbAnimating) return;
    lbToggleZoomAt(e.clientX, e.clientY);
  });

  /* ② 滚轮 / 触控板：指数映射并按帧合并（原来每个事件固定 ×1.1，触控板会"飞"） */
  lb.addEventListener('wheel', function(e){
    if(!lb.classList.contains('active')) return;
    e.preventDefault();
    var d = e.deltaY;
    if(e.deltaMode === 1) d *= 16;              // 以"行"为单位的设备
    else if(e.deltaMode === 2) d *= 100;
    d = Math.max(-140, Math.min(140, d));
    lbWheelAt = { x: e.clientX, y: e.clientY };
    lbWheelAcc += -d * 0.0026;
    if(!lbWheelRaf){
      lbWheelRaf = requestAnimationFrame(function(){
        lbWheelRaf = 0;
        var f = Math.exp(lbWheelAcc); lbWheelAcc = 0;
        if(lbWheelAt) zoomTo(lbZoom.scale * f, lbWheelAt.x, lbWheelAt.y, false);
      });
    }
  }, {passive:false});

  /* ③ 桌面拖拽（仅缩放后）+ 惯性 */
  lb.addEventListener('pointerdown', function(e){
    if(e.pointerType === 'touch') return;               // 触屏走下面的 touch 分支
    if(lbZoom.scale <= 1.01) return;
    if(e.target.closest('.lightbox-close,.lightbox-prev,.lightbox-next,.lightbox-filmstrip,.lightbox-counter,.lightbox-zoom-indicator')) return;
    lbDrag = { x:e.clientX, y:e.clientY, t:performance.now(), trace:[] };
    lbTrackPush(lbDrag.trace, e.clientX, e.clientY);
    lbZoom.dragging = true;
    applyTransform({ instant:true });
    try{ lb.setPointerCapture(e.pointerId); }catch(err){}
    e.preventDefault();
  });
  lb.addEventListener('pointermove', function(e){
    if(!lbDrag) return;
    var dx = e.clientX - lbDrag.x, dy = e.clientY - lbDrag.y;
    lbDrag.x = e.clientX; lbDrag.y = e.clientY;
    lbTrackPush(lbDrag.trace, e.clientX, e.clientY);
    lbZoom.x += dx; lbZoom.y += dy;
    applyTransform({ dragging:true, rubber:true });
    e.preventDefault();
  });
  function endDrag(){
    if(!lbDrag) return;
    var v = lbTrackVel(lbDrag.trace);      // 与触摸路径同一套速度估计
    lbDrag = null; lbZoom.dragging = false;
    lbMomentum(v.vx, v.vy);
  }
  window.addEventListener('pointerup', endDrag);
  window.addEventListener('pointercancel', endDrag);
  window.addEventListener('blur', endDrag);

  /* ④ 触屏手势 */
  var t1 = { x:0, y:0 }, t0 = { x:0, y:0 }, pinch0 = 0, scale0 = 1, panX0 = 0, panY0 = 0;
  var panTrace = [];        // 平移时的位置采样（用于算松手速度）
  var lastTap = 0, lastT = 0, moved = false;

  stage.addEventListener('touchstart', function(e){
    if(e.touches.length === 2){
      e.preventDefault();
      var a = e.touches[0], b = e.touches[1];
      pinch0 = Math.hypot(a.clientX-b.clientX, a.clientY-b.clientY) || 1;
      scale0 = lbZoom.scale;
      lbTouch.mode = 'pinch';
      lbZoom.dragging = true;
      applyTransform({ instant:true });
      return;
    }
    if(e.touches.length !== 1) return;
    var now = Date.now(), tt = e.touches[0];
    // 双击（两根手指之外的单指快速两下）
    if(now - lastTap < 280 && Math.abs(tt.clientX-lastT.x) < 30 && Math.abs(tt.clientY-lastT.y) < 30){
      e.preventDefault();
      window._touchZoomTime = Date.now();
      lastTap = 0;
      if(lbAnimating) return;
      lbToggleZoomAt(tt.clientX, tt.clientY);
      return;
    }
    lastTap = now; lastT = { x:tt.clientX, y:tt.clientY };
    t0.x = tt.clientX; t0.y = tt.clientY;
    panTrace = [];
    panX0 = lbZoom.x; panY0 = lbZoom.y;
    moved = false;
    lbZoom.closeDy = 0; lbZoom.closeScale = 1;
    lbTouch.mode = (lbZoom.scale > 1.01) ? 'pan' : 'swipe';
  }, {passive:false});

  stage.addEventListener('touchmove', function(e){
    if(lbTouch.mode === 'pinch' && e.touches.length === 2){
      e.preventDefault();
      var a = e.touches[0], b = e.touches[1];
      var d = Math.hypot(a.clientX-b.clientX, a.clientY-b.clientY);
      var nn = scale0 * (d / pinch0);
      nn = Math.max(0.65, Math.min(LB_MAX * 1.12, nn));    // 手势中可以略微超出，松手回弹
      var mx = (a.clientX + b.clientX) / 2, my = (a.clientY + b.clientY) / 2;
      var r = lb.getBoundingClientRect();
      var old = lbZoom.scale, ratio = nn / old;
      lbZoom.x = (lbZoom.x - (mx - r.left - r.width/2)) * ratio + (mx - r.left - r.width/2);
      lbZoom.y = (lbZoom.y - (my - r.top - r.height/2)) * ratio + (my - r.top - r.height/2);
      lbZoom.scale = nn;
      applyTransform({ dragging:true, rubber:true });
      return;
    }
    if(e.touches.length !== 1) return;
    var tt = e.touches[0];
    var dx = tt.clientX - t0.x, dy = tt.clientY - t0.y;
    if(Math.abs(dx) > 6 || Math.abs(dy) > 6) moved = true;
    if(lbTouch.mode === 'pan'){
      e.preventDefault();
      lbZoom.x = panX0 + dx;
      lbZoom.y = panY0 + dy;
      lbTrackPush(panTrace, tt.clientX, tt.clientY);      // 只记最近 80ms
      applyTransform({ dragging:true, rubber:true });
    } else if(lbTouch.mode === 'swipe'){
      // 只有明显的【向下】拖才做"下滑关闭"的跟随效果（上滑不跟，避免误触）
      if(dy > 0 && Math.abs(dy) > Math.abs(dx) * 0.8){
        lbZoom.closeDy = dy;
        lbZoom.closeScale = Math.max(0.82, 1 - dy / 2600);
        lb.style.opacity = String(Math.max(0.3, 1 - dy / (window.innerHeight * 0.75)));
        applyTransform({ dragging:true });
      }
    }
  }, {passive:false});

  stage.addEventListener('touchend', function(e){
    if(lbTouch.mode === 'pinch'){
      lbZoom.dragging = false;
      if(e.touches.length === 0){
        // 松手回弹：低于 1 回 1，高于上限回上限
        if(lbZoom.scale < 1){ resetZoom(); applyTransform({ dur:340 }); }
        else if(lbZoom.scale > LB_MAX){ zoomTo(LB_MAX, null, null, true, 340); }
        else applyTransform({ dur:300 });
        lbTouch.mode = 'none';
      }
      return;
    }
    if(e.touches.length === 0){
      var dx = (e.changedTouches[0] ? e.changedTouches[0].clientX : 0) - t0.x;
      var dy = (e.changedTouches[0] ? e.changedTouches[0].clientY : 0) - t0.y;
      var mode = lbTouch.mode;
      lbTouch.mode = 'none';
      if(mode === 'pan'){
        var v = lbTrackVel(panTrace);                       // 最近 80ms 的真实速度
        panTrace = [];
        lbMomentum(v.vx, v.vy);
        return;
      }
      if(mode === 'swipe'){
        var H = window.innerHeight;
        // ① 下滑关闭：向下超过 110px 且明显是纵向
        if(dy > 110 && Math.abs(dy) > Math.abs(dx) * 1.2){
          var img = $('#lightboxImg');
          if(img) img.style.transition = 'transform 220ms ' + LB_EASE + ', opacity 220ms ease';
          lbZoom.closeDy = H; lbZoom.closeScale = 0.8;
          applyTransform({ dur:220 });
          lb.style.opacity = '0';
          setTimeout(function(){ closeLightbox(); }, 190);
          return;
        }
        // 回弹（没到阈值）
        if(lbZoom.closeDy){
          lb.style.opacity = '1';
          lbZoom.closeDy = 0; lbZoom.closeScale = 1;
          applyTransform({ dur:300 });
        }
        // ② 横滑换图：必须方向锁定（横向位移 > 纵向 1.5 倍），否则斜着划就误换
        if(Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy) * 1.5){
          navLightbox(dx > 0 ? -1 : 1);
        }
      }
    }
  });
  stage.addEventListener('touchcancel', function(){
    if(lbZoom.closeDy){ lb.style.opacity = '1'; lbZoom.closeDy = 0; lbZoom.closeScale = 1; }
    lbTouch.mode = 'none';
    lbZoom.dragging = false;
    applyTransform({ dur:300 });
  });
}

// 覆盖 openLightbox：换图不再"先清空再加载"（消除中间那一下空档）
function openLightbox(idx, kenBurns){
  if(idx < 0 || idx >= lightboxPhotos.length) return;
  lightboxIdx = idx;
  var lb = $('#lightbox');
  var counter = $('#lightboxCounter');
  var img = $('#lightboxImg');
  var stage = $('#lightboxStage');
  if(!lb || !img) return;
  if(stage && !lb.classList.contains('active')) stage.style.display = 'flex';
  img.style.display = 'block';
  resetZoom();
  applyTransform({ instant:true });
  lb.classList.add('active');
  lb.style.opacity = '1';
  lb.style.pointerEvents = 'auto';
  lb.style.touchAction = 'none';
  document.body.style.overflow = 'hidden';

  var photo = lightboxPhotos[idx];
  var src = full(photo);
  if(counter) counter.textContent = (idx + 1) + ' / ' + lightboxPhotos.length;
  if(window.SFX) window.SFX.shutter();

  // 载入耗时超过 400ms 才显示转圈 —— 缓存命中时完全不闪（这是"成熟感"的关键细节）
  var loaderTimer = setTimeout(function(){ showLbLoader(true, 0, '加载中…'); }, 400);
  var firstPaint = !img.src || img.src === '' || img.src === window.location.href;

  loadImageWithProgress(src, fullAlt(photo)).then(function(url){
    var pre = new Image();
    pre.onload = function(){
      clearTimeout(loaderTimer);
      var oldOp = firstPaint ? '0' : img.style.opacity;
      img.style.transition = 'none';
      img.style.transform = 'translate3d(0,0,0) scale(1)';
      img.style.opacity = firstPaint ? '0' : '1';     // 换图时旧图继续显示，不出现空档
      img.style.filter = '';
      img.onload = function(){
        img.style.transition = 'opacity .26s ease';
        img.style.opacity = '1';
        showLbLoader(false, 100, '');
      };
      img.onerror = function(){ handleLbError(img, photo, url); };
      img.src = url;
      if(img.decode) img.decode().then(function(){
        img.style.transition = 'opacity .26s ease';
        img.style.opacity = '1';
        showLbLoader(false, 100, '');
      }).catch(function(){});
    };
    pre.onerror = function(){ clearTimeout(loaderTimer); handleLbError(img, photo, url); };
    pre.src = url;
    preloadAdjacent(idx);
  });
}
window.openLightbox = openLightbox;

function handleLbError(img, photo, url){
  var altUrl = fullAlt(photo);
  if(altUrl && altUrl !== url && !img.dataset.altTried){
    img.dataset.altTried = '1';
    showLbLoader(true, 0, '换源重试…');
    img.src = altUrl;
    return;
  }
  img.dataset.altTried = '';
  img.style.opacity = '0.3';
  img.style.filter = 'grayscale(1) blur(8px)';
  showLbLoader(false, 0, '✕ 原图不存在');
  setTimeout(function(){ showLbLoader(false, 0, ''); }, 2000);
}

// 预加载相邻 2 张（原来只有 1 张，来回翻还是会有等待）
function preloadAdjacent(idx){
  if(!lightboxPhotos || !lightboxPhotos.length) return;
  [idx-2, idx-1, idx+1, idx+2].forEach(function(i){
    if(i < 0 || i >= lightboxPhotos.length) return;
    try{
      var im = new Image();
      im.onerror = function(){ try{ im.onerror = null; im.src = fullAlt(lightboxPhotos[i]); }catch(e){} };
      im.src = full(lightboxPhotos[i]);
    }catch(e){}
  });
}

// 键盘：补上 + / - / 0（原来只有 ←/→/Esc）
document.addEventListener('keydown', function(e){
  if(!$('#lightbox') || !$('#lightbox').classList.contains('active')) return;
  if(e.key === '+' || e.key === '=' ) { e.preventDefault(); zoomTo(lbZoom.scale * 1.25, null, null); }
  else if(e.key === '-' || e.key === '_') { e.preventDefault(); zoomTo(lbZoom.scale / 1.25, null, null); }
  else if(e.key === '0') { e.preventDefault(); resetZoom(); applyTransform({ dur:320 }); }
});

// 初始化时确保新变量存在（老代码没定义 closeDy/closeScale）
lbZoom.closeDy = 0;
lbZoom.closeScale = 1;
lbZoom.tVX = 0;
lbZoom.tVY = 0;

/* ══════════════════════════════════════════════════════════════════════
   2026-09-19  手机相册级查看器（Native-grade viewer）
   ──────────────────────────────────────────────────────────────────────
   目标：把手感从"网页灯箱"抬到"系统相册"。六项关键技术（逐条对应上面的问题）：
     ① 结构分层：翻页(track) / 缩放(img) / 转场(flip) 三件事各自独立的一层，
        互不干扰（原来全挤在一个 transform 上，一动就互相打架）
     ② 渐进画质：缩略图(webp)先以模糊形式瞬间垫底 → 高清解码完成再淡入
        → 永远不出现"转圈/空档"
     ③ 跟手翻页：横拖时相邻照片按手指位移实时移动（不是跳变），松手按阈值/速度决定
        翻过去还是弹回
     ④ 共享元素转场：打开时从被点缩略图的位置"长"出来，关闭时"缩"回去
     ⑤ 可打断动画：所有过渡用自研 tween（可 cancel），手指一碰就从【当前视觉值】接着走
     ⑥ iOS 橡皮筋：越界量用阻尼公式（1 - 1/(d·c/dim + 1))，不是线性缩放
   ══════════════════════════════════════════════════════════════════════ */

var LB = {
  cur: 0, n: 0,
  stageW: 0, stageH: 0,
  enterTween: null, pageTween: null,
  dismissY: 0, dismissed: false,
  ready: {},            // 缓存已解码的原图 URL，避免重复下载
  reduced: false
};
try { LB.reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch(e){}

/* ── 可打断补间：手指按下的瞬间 cancel 掉，从当前视觉值接着走 ── */
function lbEase(t){ return 1 - Math.pow(1 - t, 3); }                 // easeOutCubic
function lbEaseSpringish(t){ return t < 1 ? 1 - Math.pow(1 - t, 3.2) : 1; }
function lbTween(dur, onUpdate, onDone){
  var h = { dead: false, cancel: function(){ h.dead = true; } };
  if(LB.reduced) dur = 1;
  var t0 = performance.now();
  (function step(now){
    if(h.dead) return;
    var p = Math.min(1, (now - t0) / Math.max(1, dur));
    onUpdate(p);
    if(p < 1) requestAnimationFrame(step);
    else if(onDone) onDone();
  })(t0);
  return h;
}
/* ── iOS 橡皮筋：越界越多、增量越小 ── */
function lbRubber(over, dim, c){
  c = c || 0.55;
  if(dim <= 0) return over;
  return (1 - 1 / (over * c / dim + 1)) * dim;
}

/* ── 分层结构（只建一次；把原有 #lightboxImg 移进「转场层 → 缩放层」里）── */
function lbBuildLayers(){
  var stage = document.getElementById('lightboxStage');
  var img = document.getElementById('lightboxImg');
  if(!stage || !img || stage.dataset.built === '1') return;
  stage.dataset.built = '1';

  // 模糊垫底（渐进画质的第一层）
  var blur = document.createElement('div');
  blur.id = 'lbBlur';
  blur.setAttribute('aria-hidden', 'true');

  // 转场层：负责"从缩略图长出来 / 缩回去"
  var flip = document.createElement('div');
  flip.id = 'lbFlip';

  // 相邻照片层：跟手翻页时露出来的那一张
  var nbWrap = document.createElement('div');
  nbWrap.id = 'lbNb';
  var nbBlur = document.createElement('div');
  nbBlur.id = 'lbNbBlur';
  var nbImg = document.createElement('img');
  nbImg.id = 'lbNeighbor';
  nbImg.alt = '';
  nbWrap.appendChild(nbBlur);
  nbWrap.appendChild(nbImg);

  stage.appendChild(blur);
  stage.appendChild(nbWrap);
  stage.appendChild(flip);
  flip.appendChild(img);          // 原图被移进转场层（id 不变，老代码仍能找到）
  img.classList.add('lb-img');
}

/* ★ 2026-09-19：有模糊缩略图垫底时，绝不显示"转圈/准备…"
   —— 原生的相册在加载时你看到的是"模糊的照片"，不是控件。
   底层 loadImageWithProgress 会无条件弹 loader，这里加静默开关把它压住；
   只有【没有缩略图可用】或【超过 4.5 秒仍未出图】时才允许转圈兜底。 */
function showLbLoader(show, pct, text){
  if(show && LB.quiet) return;
  var loader = document.getElementById('lbLoader');
  if(!loader){
    loader = document.createElement('div');
    loader.id = 'lbLoader';
    loader.innerHTML = '<div class="lb-spinner"></div><div class="lb-progress"></div><div class="lb-text"></div>';
    var st = document.getElementById('lightbox');
    if(st) st.appendChild(loader);
  }
  if(!show){ loader.classList.add('hidden'); return; }
  loader.classList.remove('hidden');
  var prog = loader.querySelector('.lb-progress');
  var tx = loader.querySelector('.lb-text');
  if(prog) prog.style.setProperty('--p', Math.min(pct, 100) + '%');
  if(tx) tx.textContent = text + (pct > 0 ? ' ' + pct + '%' : '');
}

/* 按"长宽比"算适应窗口的尺寸（有缩略图矩形时用它，避免横图被糊成竖条） */
function lbFitSizeByAspect(ar){
  if(!ar || !isFinite(ar) || ar <= 0) return { w:LB.stageW * 0.62, h:LB.stageH * 0.62 };
  var maxW = LB.stageW * 0.92, maxH = LB.stageH * 0.88;
  var w = maxW, h = w / ar;
  if(h > maxH){ h = maxH; w = h * ar; }
  return { w:w, h:h };
}

/* ── 当前视口下、某张图"适应窗口"后应有的显示尺寸 ── */
function lbFitSize(nw, nh){
  var maxW = LB.stageW * 0.92, maxH = LB.stageH * 0.88;
  var k = Math.min(maxW / nw, maxH / nh, 1);
  return { w: nw * k, h: nh * k, k: k };
}

/* 把一层的盒子设成"以舞台中心为中心"的显式像素尺寸（负边距居中，
   这样 transform 只用来做位移/缩放，不会和居中互相打架） */
function lbSetBox(el, w, h){
  if(!el) return;
  el.style.width = Math.round(w) + 'px';
  el.style.height = Math.round(h) + 'px';
  el.style.marginLeft = Math.round(-w / 2) + 'px';
  el.style.marginTop = Math.round(-h / 2) + 'px';
}

/* ★ 2026-09-19：正确推导"缩略图 URL"
   坑：数据库里的照片路径已经是完整 URL（https://…/images/… 或 Supabase Storage 的 …/photos/…），
       而 thumb() 遇到 http 开头会【原样返回】→ 垫底用的是原图（慢且浪费）。
   这里把两种情况都推导到真正的缩略图：
     · GitHub 上的老照片： /images/xxx.jpg → /thumbs/xxx.webp
     · Supabase 上传的：   …/public/photos/xxx → …/public/photos/thumbs/xxx
*/
function lbThumbOf(photo){
  var p = (typeof getPath === 'function') ? getPath(photo) : String(photo || '');
  if(!p) return '';
  var GH = 'https://xshzct-dotcom.github.io/';
  if(p.indexOf(GH + 'images/') === 0){
    return GH + 'thumbs/' + p.slice((GH + 'images/').length).replace(/\.(jpe?g|png)$/i, '.webp');
  }
  if(p.indexOf(GH + 'thumbs/') === 0) return p;
  var m = p.match(/\/object\/public\/photos\/(.+)$/);
  if(m){
    if(m[1].indexOf('thumbs/') === 0) return p;
    return p.replace(/\/object\/public\/photos\/(.+)$/, '/object/public/photos/thumbs/$1');
  }
  return (typeof thumb === 'function') ? thumb(photo) : p;
}

/* ── 渐进画质：先立刻显示模糊缩略图，高清就绪后淡入并撤掉垫底 ── */
function lbShowBlur(el, photo, fit){
  if(!el) return;
  var url = lbThumbOf(photo);
  if(!url){ el.style.opacity = '0'; return; }
  el.style.backgroundImage = 'url("' + url + '")';
  lbSetBox(el, fit.w, fit.h);
  el.style.opacity = '1';
}
function lbHideBlur(el){
  if(!el) return;
  el.style.opacity = '0';
}

/* ── 取图：命中缓存就直接用；否则先垫缩略图再加载原图 ── */
function lbLoadInto(imgEl, blurEl, photo, want, aspect){
  var fullUrl = full(photo);
  // 垫底盒子按"被点缩略图的长宽比"来 —— 横图就是横的，不会被 cover 糊成竖条
  lbShowBlur(blurEl, photo, lbFitSizeByAspect(aspect));
  imgEl.style.opacity = '0';
  // 有缩略图 → 静默加载（不显示转圈）；4.5 秒还没出图才放行转圈兜底
  LB.quiet = true;
  if(LB.quietTimer) clearTimeout(LB.quietTimer);
  LB.quietTimer = setTimeout(function(){
    LB.quiet = false;
    showLbLoader(true, 0, '加载中…');
  }, 4500);

  function done(url){
    var pre = new Image();
    pre.onload = function(){
      if(want && want() === false) return;
      imgEl.src = url;
      var apply = function(){
        if(want && want() === false) return;
        if(LB.quietTimer){ clearTimeout(LB.quietTimer); LB.quietTimer = null; }
        var f2 = lbFitSize(imgEl.naturalWidth || 1200, imgEl.naturalHeight || 900);
        lbSetBox(imgEl, f2.w, f2.h);
        imgEl.style.transition = 'opacity ' + (LB.reduced ? 1 : 240) + 'ms ease';
        imgEl.style.opacity = '1';
        lbHideBlur(blurEl);
        showLbLoader(false, 100, '');
      };
      if(imgEl.decode) imgEl.decode().then(apply).catch(apply); else apply();
    };
    pre.onerror = function(){ lbHideBlur(blurEl); };
    pre.src = url;
  }

  if(LB.ready[fullUrl]){ done(fullUrl); return; }
  loadImageWithProgress(fullUrl, fullAlt(photo)).then(function(url){
    LB.ready[fullUrl] = true;
    done(url);
  }).catch(function(){
    done(fullUrl);          // 兜底：直接交给 <img> 自己加载
  });
}

/* ── 定位：把一层放在"某一页"的位置上（px，基于视口宽）── */
function lbPlace(el, pageOffset, dragPx){
  if(!el) return;
  el.style.transform = 'translate3d(' + (pageOffset * LB.stageW + (dragPx || 0)) + 'px,0,0) scale(1)';
}

/* ══════════ 打开：共享元素转场（从缩略图位置长出来） ══════════ */
function openLightbox(idx, srcRect){
  if(idx < 0 || idx >= lightboxPhotos.length) return;
  lbBuildLayers();
  var lb = document.getElementById('lightbox');
  var img = document.getElementById('lightboxImg');
  var flip = document.getElementById('lbFlip');
  var blur = document.getElementById('lbBlur');
  var nb = document.getElementById('lbNb');
  if(!lb || !img || !flip) return;

  lightboxIdx = idx;
  LB.cur = idx; LB.n = lightboxPhotos.length;
  LB.stageW = window.innerWidth; LB.stageH = window.innerHeight;
  LB.dismissY = 0; LB.dismissed = false;
  if(LB.enterTween){ LB.enterTween.cancel(); LB.enterTween = null; }
  if(LB.pageTween){ LB.pageTween.cancel(); LB.pageTween = null; }
  // 手势状态复位：万一上次是"拖到一半被关掉"，别把旧的轴/方向带到这一次
  pg.active = false; pg.axis = ''; pg.dir = 1; pg.nbIdx = -1;
  pg.committed = false; pg.dismissY = 0; pg.trace = [];

  var counter = document.getElementById('lightboxCounter');
  if(counter) counter.textContent = (idx + 1) + ' / ' + LB.n;
  if(nb){ nb.style.display = 'none'; lbPlace(nb, 0, 0); }
  lbPlace(flip, 0, 0);

  resetZoom();
  applyTransform({ instant:true });

  var photo = lightboxPhotos[idx];
  var _ar = (srcRect && srcRect.height > 0) ? (srcRect.width / srcRect.height) : 0;
  /* ★ 2026-09-19 修复（用户反馈："放大照片会先显示上次的照片卡一下"）
     原因：上一张的 src 还挂在 #lightboxImg 上，而"旧图等到新图就绪再淡入"这条规则
          本来只该用于【翻页】；全新打开时会先把上一张露出来一下 ✗
     做法：全新打开时立刻丢掉旧 src（尺寸由 lbSetBox 撑着，不会塌），
          屏幕上只留"这张照片的缩略图模糊垫底" → 高清就绪再淡入。 */
  try{ img.removeAttribute('src'); }catch(e){}
  img.style.opacity = '0';
  if(blur){ blur.style.backgroundImage = 'none'; blur.style.opacity = '0'; }
  lbLoadInto(img, blur, photo, function(){ return lb.classList.contains('active'); }, _ar);

  // 背景与层显隐
  lb.style.transition = 'none';
  lb.style.background = '#000';
  lb.style.opacity = srcRect ? '0' : '1';        // 有源矩形 → 背景从透明渐入
  lb.classList.add('active');
  lb.style.pointerEvents = 'auto';
  lb.style.touchAction = 'none';
  document.body.style.overflow = 'hidden';
  if(window.SFX) window.SFX.shutter();

  if(srcRect && !LB.reduced && srcRect.width > 0){
    // FLIP：从缩略图的矩形长到"适应窗口"的位置
    var nw = img.naturalWidth || 1200, nh = img.naturalHeight || 900;
    var fit = lbFitSize(nw, nh);
    var imgCx = LB.stageW / 2, imgCy = LB.stageH / 2;                 // 目标：居中
    var srcCx = srcRect.left + srcRect.width / 2;
    var srcCy = srcRect.top + srcRect.height / 2;
    var s0 = Math.max(0.06, Math.min(srcRect.width / fit.w, srcRect.height / fit.h));
    var dx0 = srcCx - imgCx, dy0 = srcCy - imgCy;
    var bg = document.getElementById('lbBlur');
    if(bg){
      bg.style.transform = 'translate3d(' + dx0 + 'px,' + dy0 + 'px,0) scale(' + s0 + ')';
    }
    flip.style.transform = 'translate3d(' + dx0 + 'px,' + dy0 + 'px,0) scale(' + s0 + ')';
    lb.style.opacity = '0';
    LB.enterTween = lbTween(460, function(p){
      var e = lbEaseSpringish(p);
      var x = dx0 * (1 - e), y = dy0 * (1 - e), s = s0 + (1 - s0) * e;
      flip.style.transform = 'translate3d(' + x + 'px,' + y + 'px,0) scale(' + s + ')';
      if(bg) bg.style.transform = 'translate3d(' + x + 'px,' + y + 'px,0) scale(' + (s * 1.06) + ')';
      lb.style.opacity = String(Math.min(1, p * 1.5));
    }, function(){
      flip.style.transform = 'translate3d(0,0,0) scale(1)';
      if(bg) bg.style.transform = 'translate3d(0,0,0) scale(1.06)';
      lb.style.opacity = '1';
      LB.enterTween = null;
    });
  } else {
    flip.style.transform = 'translate3d(0,0,0) scale(1)';
    lb.style.transition = 'opacity 200ms ease';
    lb.style.opacity = '1';
  }
}
window.openLightbox = openLightbox;

/* ══════════ 关闭：缩回缩略图（反 FLIP） ══════════ */
function lightboxRectOfCurrent(){
  try{
    var el = document.querySelector('.masonry-item[data-idx="' + lightboxIdx + '"]');
    if(el) return el.getBoundingClientRect();
    var figs = document.querySelectorAll('.masonry-item');
    if(figs[lightboxIdx]) return figs[lightboxIdx].getBoundingClientRect();
  }catch(e){}
  return null;
}
function lightboxCleanup(){
  LB.quiet = false;
  if(LB.quietTimer){ clearTimeout(LB.quietTimer); LB.quietTimer = null; }
  /* ★ 2026-09-19 真机/真机反馈修复：这一层原来漏了"解开滚动锁"
     → 看完照片关掉之后，body 的 overflow:hidden 一直留着，整个页面滚不动
       （用户反馈："相册卡住了滑轮不了"）。所有关闭路径最终都会走到这里，所以在这里统一复位。 */
  try{
    document.body.style.overflow = '';
    document.documentElement.style.overflow = '';
  }catch(e){}
  var lb = document.getElementById('lightbox');
  var img = document.getElementById('lightboxImg');
  var flip = document.getElementById('lbFlip');
  var blur = document.getElementById('lbBlur');
  var nb = document.getElementById('lbNb');
  if(!lb) return;
  lb.classList.remove('active');
  lb.style.opacity = '0';
  lb.style.pointerEvents = 'none';
  lb.style.background = '#000';
  if(flip) flip.style.transform = 'translate3d(0,0,0) scale(1)';
  if(blur){ blur.style.opacity = '0'; blur.style.transform = 'translate3d(0,0,0) scale(1.06)'; }
  if(nb){ nb.style.display = 'none'; lbPlace(nb, 0, 0); }
  resetZoom();
  if(img){
    img.style.transition = 'none';
    img.style.transform = 'translate3d(0,0,0) scale(1)';
    img.style.opacity = '0';
  }
}

function closeLightbox(opts){
  if(opts && opts.skipAnim){ lightboxCleanup(); return; }     // 手势里已经动画过了
  var lb = document.getElementById('lightbox');
  var img = document.getElementById('lightboxImg');
  var flip = document.getElementById('lbFlip');
  var blur = document.getElementById('lbBlur');
  if(!lb || !lb.classList.contains('active')){ lightboxCleanup(); return; }
  if(LB.enterTween){ LB.enterTween.cancel(); LB.enterTween = null; }
  if(LB.pageTween){ LB.pageTween.cancel(); LB.pageTween = null; }
  if(window.SFX) window.SFX.click();

  var rect = lightboxRectOfCurrent();
  var nw = img ? (img.naturalWidth || 1200) : 1200;
  var nh = img ? (img.naturalHeight || 900) : 900;
  var fit = lbFitSize(nw, nh);

  if(rect && !LB.reduced && rect.width > 0){
    var dx1 = rect.left + rect.width / 2 - LB.stageW / 2;
    var dy1 = rect.top + rect.height / 2 - LB.stageH / 2;
    var s1 = Math.max(0.06, Math.min(rect.width / fit.w, rect.height / fit.h));
    LB.enterTween = lbTween(320, function(p){
      var e = lbEase(p);
      var x = dx1 * e, y = dy1 * e, s = 1 + (s1 - 1) * e;
      if(flip) flip.style.transform = 'translate3d(' + x + 'px,' + y + 'px,0) scale(' + s + ')';
      if(blur) blur.style.transform = 'translate3d(' + x + 'px,' + y + 'px,0) scale(' + (s * 1.06) + ')';
      lb.style.opacity = String(Math.max(0, 1 - p * 1.35));
    }, function(){ LB.enterTween = null; lightboxCleanup(); });
  } else {
    lb.style.transition = 'opacity 200ms ease';
    lb.style.opacity = '0';
    setTimeout(lightboxCleanup, 200);
  }
}
window.closeLightbox = closeLightbox;

/* ══════════ 翻页：跟手拖动 + 邻居探入 + 松手吸附 ══════════ */
var pg = { active:false, axis:'', x0:0, y0:0, dx:0, dir:1, nbIdx:-1, trace:[], committed:false };

function lbPrepareNeighbor(dir){
  var nb = document.getElementById('lbNb');
  var nbImg = document.getElementById('lbNeighbor');
  var nbBlur = document.getElementById('lbNbBlur');
  if(!nb || !nbImg) return -1;
  var n = lightboxPhotos.length;
  if(n <= 1) return -1;
  var i = ((LB.cur + dir) % n + n) % n;
  pg.nbIdx = i;
  var photo = lightboxPhotos[i];
  lbShowBlur(nbBlur, photo, { w:LB.stageW * 0.62, h:LB.stageH * 0.62 });
  nbImg.style.opacity = '0';
  var fullUrl = full(photo);
  var put = function(url){
    nbImg.src = url;
    var go = function(){
      var f2 = lbFitSize(nbImg.naturalWidth || 1200, nbImg.naturalHeight || 900);
      lbSetBox(nbImg, f2.w, f2.h);
      nbImg.style.transition = 'opacity 200ms ease';
      nbImg.style.opacity = '1';
    };
    if(nbImg.decode) nbImg.decode().then(go).catch(go); else go();
  };
  if(LB.ready[fullUrl]) put(fullUrl);
  else loadImageWithProgress(fullUrl, fullAlt(photo)).then(function(u){ LB.ready[fullUrl] = true; put(u); }).catch(function(){ put(fullUrl); });
  nb.style.display = '';
  lbPlace(nb, dir, 0);
  return i;
}

function lbCommitPage(dir){
  var nb = document.getElementById('lbNb');
  var flip = document.getElementById('lbFlip');
  var nbImg = document.getElementById('lbNeighbor');
  var img = document.getElementById('lightboxImg');
  var blur = document.getElementById('lbBlur');
  if(!nb || pg.nbIdx < 0) return;
  var w = LB.stageW;
  LB.pageTween = lbTween(300, function(p){
    var e = lbEase(p);
    flip.style.transform = 'translate3d(' + (-dir * w * e) + 'px,0,0) scale(1)';
    nb.style.transform = 'translate3d(' + (dir - dir * e) * w + 'px,0,0)';
    var lb = document.getElementById('lightbox');
    if(lb) lb.style.opacity = '1';
  }, function(){
    // 角色互换：把邻居的内容接到当前层，位置瞬间归零（同一帧无闪）
    var src = nbImg.src;
    img.style.transition = 'none';
    img.style.opacity = '1';
    img.src = src;
    if(blur) blur.style.opacity = '0';
    lightboxIdx = pg.nbIdx; LB.cur = pg.nbIdx;
    var counter = document.getElementById('lightboxCounter');
    if(counter) counter.textContent = (LB.cur + 1) + ' / ' + LB.n;
    lbPlace(flip, 0, 0);
    nb.style.display = 'none'; lbPlace(nb, 0, 0);
    resetZoom(); applyTransform({ instant:true });
    LB.pageTween = null;
  });
}

function lbCancelPage(){
  var nb = document.getElementById('lbNb');
  var flip = document.getElementById('lbFlip');
  if(!nb || !flip) return;
  var dir = pg.dir, w = LB.stageW;
  LB.pageTween = lbTween(260, function(p){
    var e = lbEase(p);
    flip.style.transform = 'translate3d(' + (-dir * w * (1 - e)) + 'px,0,0)';
    nb.style.transform = 'translate3d(' + (dir * w * (1 - e)) + 'px,0,0)';
  }, function(){
    nb.style.display = 'none'; lbPlace(nb, 0, 0);
    flip.style.transform = 'translate3d(0,0,0) scale(1)';
    LB.pageTween = null;
  });
}

/* ══════════════════════════════════════════════════════════════════════
   手机相册级查看器 · 第二层：手势与收尾（覆盖旧的手势绑定）
   手势分工（同一根手指，按首次位移方向分流）：
     横向 → 跟手翻页（邻居实时探入，松手按"位移 28% 或速度"决定翻/回弹）
     纵向向下 → 下拉关闭（跟着手指变小 + 背景渐暗，松手按 110px/速度决定）
     已放大 → 单指平移（带 iOS 橡皮筋与惯性）
     两指   → 连续缩放（松手回弹到 1~5 之间）
     未放大双击 → 在"适应窗口 ↔ 2.5 倍"之间切换，以落点为锚
   ══════════════════════════════════════════════════════════════════════ */

function lbNowIsZoomed(){ return lbZoom.scale > 1.01; }

function bindLightboxInteractions(){
  var lb = document.getElementById('lightbox');
  var stage = document.getElementById('lightboxStage');
  if(!lb || !stage) return;
  lbBuildLayers();

  /* ── 桌面：双击切换（以落点为锚）── */
  lb.addEventListener('dblclick', function(e){
    if(e.target.closest('.lightbox-close,.lightbox-prev,.lightbox-next,.lightbox-counter')) return;
    e.preventDefault();
    if(window._touchZoomTime && Date.now() - window._touchZoomTime < 500) return;
    if(lbAnimating) return;
    lbToggleZoomAt(e.clientX, e.clientY);
  });

  /* ── 桌面：滚轮/触控板缩放（指数映射，按帧合并）── */
  lb.addEventListener('wheel', function(e){
    if(!lb.classList.contains('active')) return;
    e.preventDefault();
    var d = e.deltaY;
    if(e.deltaMode === 1) d *= 16; else if(e.deltaMode === 2) d *= 100;
    d = Math.max(-140, Math.min(140, d));
    lbWheelAt = { x:e.clientX, y:e.clientY };
    lbWheelAcc += -d * 0.0026;
    if(!lbWheelRaf){
      lbWheelRaf = requestAnimationFrame(function(){
        lbWheelRaf = 0;
        var f = Math.exp(lbWheelAcc); lbWheelAcc = 0;
        if(lbWheelAt) zoomTo(lbZoom.scale * f, lbWheelAt.x, lbWheelAt.y, false);
      });
    }
  }, {passive:false});

  /* ── 桌面鼠标：未放大时横拖翻页 / 已放大时拖拽平移 ── */
  var mDrag = null;
  lb.addEventListener('pointerdown', function(e){
    if(e.pointerType === 'touch') return;
    if(e.target.closest('.lightbox-close,.lightbox-prev,.lightbox-next,.lightbox-counter')) return;
    if(LB.enterTween){ LB.enterTween.cancel(); LB.enterTween = null; }
    if(LB.pageTween){ LB.pageTween.cancel(); LB.pageTween = null; }
    mDrag = { x:e.clientX, y:e.clientY, mode: lbNowIsZoomed() ? 'pan' : 'idle', trace:[] };
    if(mDrag.mode === 'pan'){ lbZoom.dragging = true; applyTransform({ instant:true }); }
    lbTrackPush(mDrag.trace, e.clientX, e.clientY);
    try{ lb.setPointerCapture(e.pointerId); }catch(err){}
    e.preventDefault();
  });
  lb.addEventListener('pointermove', function(e){
    if(!mDrag) return;
    var dx = e.clientX - mDrag.x, dy = e.clientY - mDrag.y;
    if(mDrag.mode === 'idle' && (Math.abs(dx) > 6 || Math.abs(dy) > 6)){
      mDrag.mode = (Math.abs(dx) > Math.abs(dy)) ? 'page' : (lbNowIsZoomed() ? 'pan' : 'none');
      if(mDrag.mode === 'page'){
        var dir = dx < 0 ? 1 : -1;
        pg.dir = dir; pg.committed = false;
        if(lightboxPhotos.length > 1) lbPrepareNeighbor(dir);
      }
    }
    lbTrackPush(mDrag.trace, e.clientX, e.clientY);
    if(mDrag.mode === 'pan'){
      lbZoom.x += e.clientX - mDrag.x; lbZoom.y += e.clientY - mDrag.y;
      mDrag.x = e.clientX; mDrag.y = e.clientY;
      applyTransform({ dragging:true, rubber:true });
    } else if(mDrag.mode === 'page'){
      var nb = document.getElementById('lbNb'), flip = document.getElementById('lbFlip');
      var w = LB.stageW, d = Math.max(-w, Math.min(w, dx));
      if(flip) flip.style.transform = 'translate3d(' + d + 'px,0,0)';
      if(nb) nb.style.transform = 'translate3d(' + (pg.dir * w + d) + 'px,0,0)';
    }
    e.preventDefault();
  });
  function mEnd(){
    if(!mDrag) return;
    var v = lbTrackVel(mDrag.trace), mode = mDrag.mode;
    var dx = v.vx * 120;
    var wasPan = lbZoom.dragging;
    mDrag = null;
    if(mode === 'pan'){ lbZoom.dragging = false; lbMomentum(v.vx, v.vy); return; }
    if(mode === 'page'){
      var far = Math.abs(dx) > LB.stageW * 0.28;
      var fast = Math.abs(v.vx) > 0.45;
      if((far || fast) && pg.nbIdx >= 0) lbCommitPage(pg.dir); else lbCancelPage();
    }
  }
  window.addEventListener('pointerup', mEnd);
  window.addEventListener('pointercancel', mEnd);

  /* ── 触屏手势 ── */
  var tStart = { x:0, y:0 }, pinch0 = 0, scale0 = 1, panX0 = 0, panY0 = 0;
  var panTrace = [], lastTap = 0, lastT = { x:0, y:0 };

  stage.addEventListener('touchstart', function(e){
    if(LB.enterTween){ LB.enterTween.cancel(); LB.enterTween = null; }
    if(LB.pageTween){ LB.pageTween.cancel(); LB.pageTween = null; }
    if(e.touches.length === 2){
      e.preventDefault();
      var a = e.touches[0], b = e.touches[1];
      pinch0 = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY) || 1;
      scale0 = lbZoom.scale;
      pg.active = true; pg.axis = 'pinch'; pg.committed = false;
      lbZoom.dragging = true;
      applyTransform({ instant:true });
      return;
    }
    if(e.touches.length !== 1) return;
    var now = Date.now(), tt = e.touches[0];
    if(now - lastTap < 300 && Math.abs(tt.clientX - lastT.x) < 32 && Math.abs(tt.clientY - lastT.y) < 32){
      e.preventDefault();
      window._touchZoomTime = Date.now();
      lastTap = 0;
      if(!lbAnimating) lbToggleZoomAt(tt.clientX, tt.clientY);
      return;
    }
    lastTap = now; lastT = { x:tt.clientX, y:tt.clientY };
    tStart.x = tt.clientX; tStart.y = tt.clientY;
    panX0 = lbZoom.x; panY0 = lbZoom.y;
    panTrace = []; mDragTouchStart();
    pg.active = true; pg.axis = ''; pg.committed = false;
    pg.dismissY = 0;
  }, {passive:false});

  stage.addEventListener('touchmove', function(e){
    if(!pg.active) return;
    if(pg.axis === 'pinch' && e.touches.length === 2){
      e.preventDefault();
      var a = e.touches[0], b = e.touches[1];
      var d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      var nn = Math.max(0.65, Math.min(LB_MAX * 1.12, scale0 * (d / pinch0)));
      var mx = (a.clientX + b.clientX) / 2, my = (a.clientY + b.clientY) / 2;
      var r = stage.getBoundingClientRect();
      var old = lbZoom.scale, ratio = nn / old;
      lbZoom.x = (lbZoom.x - (mx - r.left - r.width / 2)) * ratio + (mx - r.left - r.width / 2);
      lbZoom.y = (lbZoom.y - (my - r.top - r.height / 2)) * ratio + (my - r.top - r.height / 2);
      lbZoom.scale = nn;
      applyTransform({ dragging:true, rubber:true });
      return;
    }
    if(e.touches.length !== 1) return;
    var tt = e.touches[0];
    var dx = tt.clientX - tStart.x, dy = tt.clientY - tStart.y;
    if(!pg.axis){
      if(Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      if(lbNowIsZoomed()) pg.axis = 'pan';
      else if(Math.abs(dx) > Math.abs(dy) * 1.1){
        pg.axis = 'page';
        pg.dir = dx < 0 ? 1 : -1;
        if(lightboxPhotos.length > 1) lbPrepareNeighbor(pg.dir);
      } else if(dy > 0){ pg.axis = 'dismiss'; }
      else pg.axis = 'none';
    }
    var flip = document.getElementById('lbFlip'), nb = document.getElementById('lbNb');
    if(pg.axis === 'pan'){
      e.preventDefault();
      lbZoom.x = panX0 + dx; lbZoom.y = panY0 + dy;
      lbTrackPush(panTrace, tt.clientX, tt.clientY);
      applyTransform({ dragging:true, rubber:true });
    } else if(pg.axis === 'page'){
      e.preventDefault();
      lbTrackPush(panTrace, tt.clientX, tt.clientY);
      var w = LB.stageW, d = dx;
      if(pg.nbIdx < 0){ d = dx * 0.25; }                       // 只有一张：轻微跟随以示"到头了"
      if(flip) flip.style.transform = 'translate3d(' + d + 'px,0,0)';
      if(nb) nb.style.transform = 'translate3d(' + (pg.dir * w + d) + 'px,0,0)';
    } else if(pg.axis === 'dismiss'){
      e.preventDefault();
      lbTrackPush(panTrace, tt.clientX, tt.clientY);
      var H = LB.stageH;
      var yy = Math.max(-20, dy);
      pg.dismissY = yy;
      var sc = Math.max(0.62, 1 - yy / (H * 1.1));
      if(flip) flip.style.transform = 'translate3d(0,' + yy + 'px,0) scale(' + sc + ')';
      lb.style.opacity = String(Math.max(0.15, 1 - yy / (H * 0.62)));
    }
  }, {passive:false});

  stage.addEventListener('touchend', function(e){
    if(!pg.active) return;
    if(pg.axis === 'pinch'){
      lbZoom.dragging = false;
      if(e.touches.length === 0){
        if(lbZoom.scale < 1){ resetZoom(); applyTransform({ dur:340 }); }
        else if(lbZoom.scale > LB_MAX){ zoomTo(LB_MAX, null, null, true, 340); }
        else applyTransform({ dur:300 });
        pg.active = false; pg.axis = '';
      }
      return;
    }
    if(e.touches.length > 0) return;
    var ct = e.changedTouches[0] || { clientX:tStart.x, clientY:tStart.y };
    var dx = ct.clientX - tStart.x, dy = ct.clientY - tStart.y;
    var v = lbTrackVel(panTrace);
    var axis = pg.axis;
    pg.active = false; pg.axis = '';
    panTrace = [];

    if(axis === 'pan'){
      var fl = document.getElementById('lbFlip');
      lbMomentum(v.vx, v.vy);
      return;
    }
    if(axis === 'page'){
      var far = Math.abs(dx) > LB.stageW * 0.28;
      var fast = Math.abs(v.vx) > 0.45;
      if((far || fast) && pg.nbIdx >= 0) lbCommitPage(pg.dir); else lbCancelPage();
      return;
    }
    if(axis === 'dismiss'){
      var commit = (pg.dismissY > 110) || (v.vy > 0.6);
      if(commit){
        var flip = document.getElementById('lbFlip');
        var curY = pg.dismissY, curS = Math.max(0.62, 1 - curY / (LB.stageH * 1.1));
        var rect = lightboxRectOfCurrent();
        var img = document.getElementById('lightboxImg');
        var nw = img ? (img.naturalWidth || 1200) : 1200;
        var nh = img ? (img.naturalHeight || 900) : 900;
        var fit = lbFitSize(nw, nh);
        /* 从"手指当前拖到的位置"继续，一路缩回缩略图（起点就是当前位置，所以接得上手） */
        if(rect && !LB.reduced){
          var dx1 = rect.left + rect.width / 2 - LB.stageW / 2;
          var dy1 = rect.top + rect.height / 2 - LB.stageH / 2;
          var s1 = Math.max(0.06, Math.min(rect.width / fit.w, rect.height / fit.h));
          LB.pageTween = lbTween(280, function(p){
            var e = lbEase(p);
            var x = dx1 * e;
            var y = curY + (dy1 - curY) * e;
            var sc = curS + (s1 - curS) * e;
            if(flip) flip.style.transform = 'translate3d(' + x + 'px,' + y + 'px,0) scale(' + sc + ')';
            lb.style.opacity = String(Math.max(0, 1 - p * 1.2));
          }, function(){ LB.pageTween = null; lightboxCleanup(); });
        } else {
          lightboxCleanup();
        }
        return;
      }
      // 没到阈值 → 弹回原位
      var flip2 = document.getElementById('lbFlip');
      var y0 = pg.dismissY, s0 = Math.max(0.62, 1 - y0 / (LB.stageH * 1.1));
      LB.pageTween = lbTween(300, function(p){
        var e = lbEase(p);
        var y = y0 * (1 - e), sc = s0 + (1 - s0) * e;
        if(flip2) flip2.style.transform = 'translate3d(0,' + y + 'px,0) scale(' + sc + ')';
        lb.style.opacity = String(Math.min(1, 0.15 + (1 - 0.15) * e + (1 - p) * 0.85));
      }, function(){ LB.pageTween = null; lb.style.opacity = '1'; });
      return;
    }
  }, {passive:false});

  stage.addEventListener('touchcancel', function(){
    var flip = document.getElementById('lbFlip'), nb = document.getElementById('lbNb');
    if(flip) flip.style.transform = 'translate3d(0,0,0) scale(1)';
    if(nb){ nb.style.display = 'none'; lbPlace(nb, 0, 0); }
    lb.style.opacity = '1';
    lbZoom.dragging = false;
    pg.active = false; pg.axis = '';
    if(lbNowIsZoomed()) applyTransform({ dur:300 });
  });
}

function mDragTouchStart(){}

/* ── 闭合收尾（与旧 closeLightbox 分离，便于"已经动画过"的路径直接收尾）── */
function lbFinishClose(){
  lightboxCleanup();
}

/* ── 翻页 API：箭头/键盘/旧横滑都走这里，带过渡动画 ── */
function navLightbox(dir){
  if(!lightboxPhotos || lightboxPhotos.length <= 1){ if(window.SFX) window.SFX.flip(); return; }
  if(LB.pageTween){ LB.pageTween.cancel(); LB.pageTween = null; }
  if(LB.enterTween){ LB.enterTween.cancel(); LB.enterTween = null; }
  pg.dir = dir; pg.nbIdx = lbPrepareNeighbor(dir);
  pg.committed = true;
  if(window.SFX) window.SFX.flip();
  // 邻居还没就绪时也能立刻动（它的槽位已有模糊垫底），但要等 src 才能互换
  var nbImg = document.getElementById('lbNeighbor');
  var t0 = Date.now();
  (function wait(){
    if(nbImg && nbImg.src){ lbCommitPage(dir); return; }
    if(Date.now() - t0 > 1200){ lbCancelPage(); return; }
    setTimeout(wait, 40);
  })();
}
window.navLightbox = navLightbox;

// ===== 2026-09-15：供博客页(iframe)调用，实现音乐互斥 =====
// 博客里的歌播放 → 主页背景乐暂停（进度自动保留）；博客的歌停下 → 主页从原进度继续
window.pauseHomeMusic = function(){
  try{
    if(bgMusic && !bgMusic.paused){
      window._homeMusicWasPlaying = true;
      bgMusic.pause();          // 只暂停，currentTime 自然保留
    }
  }catch(e){}
};
window.resumeHomeMusic = function(){
  try{
    if(window._homeMusicWasPlaying && bgMusic && bgMusic.paused){
      bgMusic.play().catch(function(){});
      window._homeMusicWasPlaying = false;
    }
  }catch(e){}
};

if(document.readyState==='complete') init();
else window.addEventListener('load',init);

})();
