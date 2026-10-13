/* ══════════════════════════════════════════════════════════════
   向天游 · v4 · 应用逻辑
   ──────────────────────────────────────────────────────────────
   设计要点（都是这些天踩坑换来的）：
   1. 单一数据源：只用数据库，不再让 data.js 和 DB 各画一遍 → 零闪烁
   2. 本地缓存优先：上次的清单先画出来，DB 回来只做"对账"，一样就不重画
   3. 照片走【签名直链】：不依赖 Service Worker → 手机自带浏览器也能看
   4. 音乐走【公开桶直链】：同上
   5. 所有点击区域互不遮挡（层级用令牌，不用裸数字）
   ══════════════════════════════════════════════════════════════ */
(function(){
'use strict';

/* ══ 配置 ══ */
var SB_URL   = 'https://mvzbkuhwapdqcdkekczh.supabase.co';
var SB_KEY   = 'sb_publishable_1yOf4jtKqK1GApN3InC7Gg_TUD2Barb';
var OWNER    = 'owner@julian678.site';
var DATA_KEY = 'v4.data.v1';
var SIGN_KEY = 'v4.sign.v1';
var PREF_KEY = 'v4.prefs.v1';
var SIGN_TTL = 21600;              /* 签名有效期 6 小时 */
var SIGN_KEEP = 5 * 3600 * 1000;   /* 本地留 5 小时（留 1 小时余量） */
var PAGE_SIZE = 120;               /* 照片首屏/每批张数 */

/* ══ 小工具 ══ */
function $(s, r){ return (r||document).querySelector(s); }
function $$(s, r){ return Array.prototype.slice.call((r||document).querySelectorAll(s)); }
function esc(s){
  return String(s==null?'':s).replace(/[&<>"']/g, function(c){
    return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
  });
}
function fmtTime(iso){
  var d = new Date(iso); if(isNaN(d)) return '';
  var p = function(n){ return (n<10?'0':'')+n; };
  return d.getFullYear()+'年'+(d.getMonth()+1)+'月'+d.getDate()+'日 '+p(d.getHours())+':'+p(d.getMinutes());
}
function fmtDay(iso){
  var d = new Date(iso); if(isNaN(d)) return '';
  return d.getFullYear()+'.'+(d.getMonth()+1)+'.'+d.getDate();
}
function fmtDur(s){
  if(!isFinite(s) || s < 0) s = 0;
  var m = Math.floor(s/60), ss = Math.floor(s%60);
  return m + ':' + (ss<10?'0':'') + ss;
}
function todayStr(){
  var d = new Date();
  return d.getFullYear() + '-' + (d.getMonth()+1<10?'0':'') + (d.getMonth()+1) + '-' + (d.getDate()<10?'0':'') + d.getDate();
}
function shuffle(arr, seed){
  var a = arr.slice(), s = seed || 1;
  function rnd(){ s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; }
  for(var i=a.length-1;i>0;i--){ var j=Math.floor(rnd()*(i+1)); var t=a[i]; a[i]=a[j]; a[j]=t; }
  return a;
}

/* ══ 桶 key 编码：非 ASCII 逐字节编成 _XX（与现有网站一致，桶里就是这么存的）══ */
function safeKey(path){
  return String(path||'').split('/').map(function(seg){
    var out = '';
    for(var i=0;i<seg.length;){
      var cp = seg.codePointAt(i), ch = String.fromCodePoint(cp);
      i += ch.length;
      if(cp < 128 && /[A-Za-z0-9._-]/.test(ch)){ out += ch; }
      else{
        var bytes = unescape(encodeURIComponent(ch));
        for(var k=0;k<bytes.length;k++){
          out += '_' + ('0'+bytes.charCodeAt(k).toString(16).toUpperCase()).slice(-2);
        }
      }
    }
    return out;
  }).join('/');
}
function thumbKey(sp){
  var rel = String(sp||'').replace(/^images\//,'').replace(/\.(jpe?g|png|heic|heif|webp)$/i, '.webp');
  return 'thumbs/' + safeKey(rel);
}
function fullKey(sp){ return safeKey(String(sp||'')); }

/* ══ 状态 ══ */
var S = {
  albums: [], photos: [], essays: [], posts: [], music: [],
  signed: {},        /* 桶内 key → 签名直链 */
  ready: false,
  dbSig: '',         /* 进入时的数据指纹 */
  filter: 'all',
  seed: Math.floor(Math.random()*2147483647)+1,  /* 本次会话的随机种子 */
  shown: 0
};
var sb = null;

/* ══ 本地存储 ══ */
function lsGet(k, d){
  try{ var v = localStorage.getItem(k); return v ? JSON.parse(v) : d; }catch(e){ return d; }
}
function lsSet(k, v){
  try{ localStorage.setItem(k, JSON.stringify(v)); return true; }catch(e){ return false; }
}

/* ══ 提示 ══ */
var _tstAt = 0;
function toast(msg){
  var now = Date.now(); if(now - _tstAt < 600) return; _tstAt = now;
  var box = $('#toast'); if(!box) return;
  var el = document.createElement('div');
  el.className = 'tst'; el.textContent = msg;
  box.appendChild(el);
  setTimeout(function(){ el.classList.add('out'); }, 2200);
  setTimeout(function(){ if(el.parentNode) el.parentNode.removeChild(el); }, 2600);
}

/* ══ 签名直链：一次批量生成、本地缓存 ══
   —— 这是"照片不依赖 Service Worker"的关键：
      签名链接自带通行证，<img src> 直接用，任何浏览器都能取到。 */
function loadSigned(){
  var o = lsGet(SIGN_KEY, null);
  if(o && o.map && o.ts && (Date.now() - o.ts) < SIGN_KEEP){
    S.signed = o.map || {};
  }
}
function saveSigned(){
  /* 只存还没过期的 */
  lsSet(SIGN_KEY, { ts: Date.now(), map: S.signed });
}
var _signPending = {};
function signKeys(keys, cb){
  if(!sb || !keys || !keys.length){ if(cb) cb(); return; }
  var todo = [];
  keys.forEach(function(k){
    if(k && !S.signed[k] && !_signPending[k]){ _signPending[k] = 1; todo.push(k); }
  });
  if(!todo.length){ if(cb) cb(); return; }
  Promise.resolve(sb.storage.from('private').createSignedUrls(todo, SIGN_TTL)).then(function(r){
    var list = (r && r.data) || [];
    list.forEach(function(x){
      if(x && x.path && x.signedUrl && !x.error) S.signed[x.path] = x.signedUrl;
    });
    todo.forEach(function(k){ delete _signPending[k]; });
    saveSigned();
    if(cb) cb();
  }).catch(function(){
    todo.forEach(function(k){ delete _signPending[k]; });
    if(cb) cb();
  });
}
/* 全部照片（缩略图+原图）一次性把签名拿好 —— 分批，避免一次请求太大 */
function primeAllSigns(){
  var keys = [];
  S.photos.forEach(function(p){
    keys.push(thumbKey(p.storage_path));
    keys.push(fullKey(p.storage_path));
  });
  /* 帖子里的图 */
  S.posts.forEach(function(t){
    (t.images || []).forEach(function(x){ keys.push(fullKey(x)); });
    (t.blocks || []).forEach(function(b){ if(b && b.t === 'img' && b.src) keys.push(fullKey(b.src)); });
  });
  var uniq = [], seen = {};
  keys.forEach(function(k){ if(k && !seen[k]){ seen[k] = 1; uniq.push(k); } });
  var i = 0, BATCH = 120;
  (function step(){
    if(i >= uniq.length){ console.log('[sign] 全部签名就绪 ' + Object.keys(S.signed).length + ' 条'); return; }
    var batch = uniq.slice(i, i + BATCH); i += BATCH;
    signKeys(batch, function(){ setTimeout(step, 30); });
  })();
}
/* 同步取 URL：有签名用签名，没有先用私有桶直链（SW 可用时也能显示）并触发补签 */
function thumbUrl(sp){
  var k = thumbKey(sp);
  if(S.signed[k]) return S.signed[k];
  signKeys([k]);
  return SB_URL + '/storage/v1/object/authenticated/private/' + k;
}
function fullUrl(sp){
  var k = fullKey(sp);
  if(S.signed[k]) return S.signed[k];
  signKeys([k]);
  return SB_URL + '/storage/v1/object/authenticated/private/' + k;
}

/* ══ 数据 ══ */
function dataSig(){
  return [S.albums.length, S.photos.length, S.essays.length, S.posts.length, S.music.length,
          (S.photos[0]||{}).storage_path || '', (S.photos[S.photos.length-1]||{}).storage_path || ''].join('|');
}
function saveData(){
  lsSet(DATA_KEY, {
    ts: Date.now(), sig: dataSig(),
    albums: S.albums, photos: S.photos, essays: S.essays, posts: S.posts, music: S.music
  });
}
function loadData(){
  var o = lsGet(DATA_KEY, null);
  if(!o || !o.photos || !o.photos.length) return false;
  S.albums = o.albums || []; S.photos = o.photos || [];
  S.essays = o.essays || []; S.posts = o.posts || []; S.music = o.music || [];
  S.dbSig = o.sig || '';
  S.ready = true;
  return true;
}
function fetchAll(){
  return Promise.all([
    sb.from('albums').select('*').order('id', {ascending:true}),
    sb.from('album_photos').select('id,album_id,storage_path,sort_order').order('sort_order', {ascending:true}),
    sb.from('essays').select('*').order('sort_order', {ascending:true}),
    sb.from('posts').select('*').order('created_at', {ascending:false}).limit(300),
    sb.from('music').select('*').order('sort_order', {ascending:true})
  ]).then(function(rs){
    S.albums = (rs[0].data||[]);
    /* 照片：一次最多 1000 条，翻页取全 */
    var first = (rs[1].data||[]);
    S.essays = (rs[2].data||[]);
    S.posts  = (rs[3].data||[]);
    S.music  = ((rs[4].data||[]).filter(function(m){ return !m.album_id; }));
    if(first.length >= 1000){
      var more = [], start = 1000;
      var chain = Promise.resolve();
      for(var i=0;i<6;i++){
        (function(st){
          chain = chain.then(function(){
            return sb.from('album_photos').select('id,album_id,storage_path,sort_order')
              .order('sort_order', {ascending:true}).range(st, st+999)
              .then(function(r){
                var d = r.data || [];
                d.forEach(function(x){ more.push(x); });
                if(d.length < 1000) return null;
                return true;
              });
          });
        })(start + i*1000);
      }
      return chain.then(function(){
        S.photos = first.concat(more);
        S.ready = true;
      });
    }
    S.photos = first;
    S.ready = true;
  });
}

/* ══ 主题 ══ */
function applyTheme(t){
  document.documentElement.setAttribute('data-theme', t);
  var m = document.querySelector('meta[name=theme-color]');
  if(m) m.setAttribute('content', t === 'light' ? '#F7F5F1' : '#0A0C0F');
}
function initTheme(){
  var p = lsGet(PREF_KEY, {});
  applyTheme(p.theme === 'light' ? 'light' : 'dark');   /* 默认深色 */
}
function toggleTheme(){
  var cur = document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
  var next = cur === 'light' ? 'dark' : 'light';
  applyTheme(next);
  var p = lsGet(PREF_KEY, {}); p.theme = next; lsSet(PREF_KEY, p);
}

/* ══ 相册分组的照片（含"全部"随机）══ */
function albumOf(id){
  for(var i=0;i<S.albums.length;i++) if(String(S.albums[i].id) === String(id)) return S.albums[i];
  return null;
}
function currentPhotos(){
  if(S.filter === 'all') return shuffle(S.photos, S.seed);   /* 全部：每次进来换一批 */
  return S.photos.filter(function(p){ return String(p.album_id) === String(S.filter); });
}

/* ══ 路由 ══ */
function route(){
  var h = (location.hash || '#/').replace(/^#\/?/, '');
  var seg = h.split('/').filter(Boolean);
  var view = seg[0] || 'home';
  var arg = seg[1] ? decodeURIComponent(seg[1]) : '';

  $$('#navLinks a').forEach(function(a){ a.classList.toggle('on', a.dataset.nav === view); });

  var app = $('#app');
  app.innerHTML = '';

  if(view === 'photos') renderPhotos(app, arg);
  else if(view === 'words') renderWords(app, arg);
  else if(view === 'blog') renderBlog(app, arg);
  else renderHome(app);
  window.scrollTo(0, 0);
}

/* ══ 视图：首页 ══ */
function renderHome(app){
  var wrap = document.createElement('div');
  wrap.className = 'view';
  var heroImg = fullUrl('images/hero_bg.jpg');
  var hi = 0;
  S.photos.forEach(function(p){ if(/hero_bg/i.test(p.storage_path)) hi = 1; });
  wrap.innerHTML =
    '<section class="hero">' +
      (hi ? '<div class="hero-bg" style="background-image:url(\'' + esc(heroImg) + '\')"></div>' : '') +
      '<div class="hero-in">' +
        '<div class="hero-mark">✦</div>' +
        '<h1>至少<em>留下</em>过些东西</h1>' +
        '<div class="hero-sub">照片 · 文字 · 音乐</div>' +
        '<div class="hero-stats">' +
          '<div class="hero-stat"><b>' + S.photos.length + '</b><span>照片</span></div>' +
          '<div class="hero-stat"><b>' + (S.essays.length + S.posts.length) + '</b><span>篇文字</span></div>' +
          '<div class="hero-stat"><b>' + S.music.length + '</b><span>首歌</span></div>' +
        '</div>' +
        '<div class="hero-down">⌄</div>' +
      '</div>' +
    '</section>' +
    '<div class="wrap"><section class="sec">' +
      '<div class="sec-head"><h2>最近</h2><a class="more" href="#/photos">全部照片 →</a></div>' +
      '<div class="grid" id="homeGrid"></div>' +
    '</section></div>';
  app.appendChild(wrap);

  /* 首页放最近的一批（打乱后的前 24 张） */
  var g = $('#homeGrid', wrap);
  var picks = shuffle(S.photos, S.seed).slice(0, 24);
  picks.forEach(function(p, i){
    var el = document.createElement('button');
    el.className = 'ph';
    el.innerHTML = '<img loading="lazy" alt="" src="' + esc(thumbUrl(p.storage_path)) + '">' +
                   '<div class="cap">' + esc(albumOf(p.album_id) ? albumOf(p.album_id).title : '') + '</div>';
    el.onclick = function(){ openLb(picks, i); };
    g.appendChild(el);
  });
  markImgs(g);
}

/* ══ 视图：照片 ══ */
function renderPhotos(app, albumId){
  if(albumId){ S.filter = albumId; } else { S.filter = 'all'; }
  var wrap = document.createElement('div');
  wrap.className = 'view';
  var chips = '<div class="chips">' +
    '<button class="chip' + (S.filter === 'all' ? ' on' : '') + '" data-f="all">全部<span class="n">' + S.photos.length + '</span></button>';
  S.albums.forEach(function(a){
    var n = S.photos.filter(function(p){ return String(p.album_id) === String(a.id); }).length;
    if(!n) return;
    chips += '<button class="chip' + (String(S.filter) === String(a.id) ? ' on' : '') + '" data-f="' + esc(a.id) + '">' +
      esc(a.title) + '<span class="n">' + n + '</span></button>';
  });
  chips += '</div>';

  wrap.innerHTML = '<div class="wrap">' +
    '<section class="sec"><div class="sec-head"><h2>' +
      (S.filter === 'all' ? '全部照片' : esc((albumOf(S.filter)||{}).title || '照片')) +
      '</h2><span class="more" id="phCount"></span></div>' +
    chips +
    '<div class="grid" id="pgrid"></div>' +
    '<div class="loading" id="pload"><i></i><i></i><i></i></div>' +
    '<div class="empty" id="pend" hidden><div class="mark">✦</div>到底了</div>' +
    '</section></div>';
  app.appendChild(wrap);

  $$('.chip', wrap).forEach(function(c){
    c.onclick = function(){
      var f = c.dataset.f;
      location.hash = f === 'all' ? '#/photos' : '#/photos/' + f;
    };
  });

  var list = currentPhotos();
  S.shown = 0;
  var grid = $('#pgrid', wrap);
  var load = $('#pload', wrap);
  var end = $('#pend', wrap);
  var cnt = $('#phCount', wrap);

  function more(){
    if(S.shown >= list.length){ load.style.display = 'none'; end.hidden = false; return; }
    var slice = list.slice(S.shown, S.shown + PAGE_SIZE);
    S.shown += slice.length;
    var base = S.shown - slice.length;
    slice.forEach(function(p, i){
      var el = document.createElement('button');
      el.className = 'ph';
      el.innerHTML = '<img loading="lazy" alt="" src="' + esc(thumbUrl(p.storage_path)) + '">';
      el.onclick = function(){ openLb(list, base + i); };
      grid.appendChild(el);
    });
    markImgs(grid);
    cnt.textContent = S.shown + ' / ' + list.length;
    if(S.shown >= list.length){ load.style.display = 'none'; end.hidden = false; }
  }
  more();
  /* 滚动到底自动接上（用 IntersectionObserver，比 scroll 事件省） */
  if(window.IntersectionObserver){
    var io = new IntersectionObserver(function(es){
      es.forEach(function(e){ if(e.isIntersecting) more(); });
    }, { rootMargin: '600px' });
    io.observe(load);
  } else {
    window.addEventListener('scroll', function(){
      if(window.innerHeight + window.scrollY > document.body.scrollHeight - 800) more();
    });
  }
}
/* 图片：加载完才淡入（避免"半张图"的突兀） */
function markImgs(root){
  $$('img', root).forEach(function(img){
    if(img.dataset.bound) return;
    img.dataset.bound = '1';
    var done = function(){
      img.classList.add('rdy');
      var p = img.closest('.ph'); if(p) p.classList.add('rdy');
    };
    if(img.complete && img.naturalWidth > 0) done();
    else img.addEventListener('load', done, {once:true});
    img.addEventListener('error', function(){ /* 失败就留占位，不闪烁 */ }, {once:true});
  });
}

/* ══ 视图：文字 ══ */
function renderWords(app, id){
  if(id){ return renderReader(app, id); }
  var wrap = document.createElement('div');
  wrap.className = 'view';
  var byCat = {};
  S.essays.forEach(function(e){
    var k = e.category || 'other';
    (byCat[k] = byCat[k] || { title: e.category_title || '未分类', items: [] }).items.push(e);
  });
  var html = '<div class="wrap"><section class="sec"><div class="sec-head"><h2>文字</h2>' +
             '<span class="more">' + S.essays.length + ' 篇</span></div>';
  Object.keys(byCat).forEach(function(k){
    var c = byCat[k];
    c.items.sort(function(a,b){ return String(b.date||'').localeCompare(String(a.date||'')); });
    html += '<div class="cat"><div class="cat-head"><span class="cat-dot"></span><h3>' + esc(c.title) +
            '</h3><span class="n">' + c.items.length + ' 篇</span></div><div class="art-list">';
    c.items.forEach(function(e){
      html += '<button class="art" data-id="' + esc(e.id) + '"><span class="t">' + esc(e.title) +
              '</span><span class="d">' + esc(e.date || '') + '</span></button>';
    });
    html += '</div></div>';
  });
  html += '</section></div>';
  wrap.innerHTML = html;
  app.appendChild(wrap);
  $$('.art', wrap).forEach(function(b){
    b.onclick = function(){ location.hash = '#/words/' + b.dataset.id; };
  });
}
function renderReader(app, id){
  var e = null;
  S.essays.forEach(function(x){ if(String(x.id) === String(id)) e = x; });
  var wrap = document.createElement('div');
  wrap.className = 'view';
  if(!e){
    wrap.innerHTML = '<div class="wrap"><div class="empty"><div class="mark">✦</div>没找到这篇</div></div>';
    app.appendChild(wrap); return;
  }
  wrap.innerHTML = '<div class="reader">' +
    '<a class="back" href="#/words">← 返回</a>' +
    '<h1>' + esc(e.title) + '</h1>' +
    '<div class="meta">' + esc(e.category_title || '') + (e.date ? ' · ' + esc(e.date) : '') + '</div>' +
    '<div class="body">' + paras(e.body) + '</div></div>';
  app.appendChild(wrap);
}
function paras(txt){
  return String(txt||'').split(/\n{2,}/).map(function(p){
    p = p.trim(); if(!p) return '';
    return '<p>' + esc(p).replace(/\n/g, '<br>') + '</p>';
  }).join('');
}

/* ══ 视图：博客 ══ */
function renderBlog(app, id){
  if(id){ return renderPost(app, id); }
  var wrap = document.createElement('div');
  wrap.className = 'view';
  var html = '<div class="wrap"><section class="sec"><div class="sec-head"><h2>博客</h2>' +
             '<span class="more">' + S.posts.length + ' 条</span></div><div class="feed">';
  S.posts.forEach(function(t){
    var imgs = (t.images || []).slice(0, 2);
    var text = String(t.content || '').replace(/\s+/g, ' ').slice(0, 120);
    html += '<article class="post" data-id="' + esc(t.id) + '">' +
      '<div class="post-time">' + esc(fmtTime(t.created_at)) +
        (t.pinned ? ' <span class="pin">✦ 置顶</span>' : '') + '</div>' +
      '<div class="post-card">' +
        (t.title ? '<div class="post-title">' + esc(t.title) + '</div>' : '') +
        (text ? '<div class="post-text">' + esc(text) + (String(t.content||'').length > 120 ? '…' : '') + '</div>' : '') +
        (imgs.length ? '<div class="post-media' + (imgs.length > 1 ? ' g2' : '') + '">' +
          imgs.map(function(x){ return '<img loading="lazy" alt="" src="' + esc(thumbUrl(x)) + '">'; }).join('') + '</div>' : '') +
        '<div class="post-foot">' +
          (t.music_title ? '<span class="tag">♪ ' + esc(t.music_title) + '</span>' : '') +
          (t.mood ? '<span class="tag">' + esc(t.mood) + '</span>' : '') +
          (t.weather ? '<span class="tag">' + esc(t.weather) + '</span>' : '') +
          (t.location ? '<span class="tag">' + esc(t.location) + '</span>' : '') +
        '</div>' +
      '</div></article>';
  });
  html += '</div></section></div>';
  wrap.innerHTML = html;
  app.appendChild(wrap);
  markImgs(wrap);
  $$('.post', wrap).forEach(function(p){
    $('.post-card', p).onclick = function(){ location.hash = '#/blog/' + p.dataset.id; };
  });
}
function renderPost(app, id){
  var t = null;
  S.posts.forEach(function(x){ if(String(x.id) === String(id)) t = x; });
  var wrap = document.createElement('div');
  wrap.className = 'view';
  if(!t){
    wrap.innerHTML = '<div class="wrap"><div class="empty"><div class="mark">✦</div>没找到这条</div></div>';
    app.appendChild(wrap); return;
  }
  var body = '';
  if(t.blocks && t.blocks.length){
    t.blocks.forEach(function(b){
      if(!b) return;
      if(b.t === 'p') body += paras(b.text);
      else if(b.t === 'h') body += '<h3>' + esc(b.text) + '</h3>';
      else if(b.t === 'img') body += '<figure style="margin:var(--s5) 0"><img loading="lazy" alt="" src="' +
        esc(thumbUrl(b.src || b.path)) + '"><figcaption style="font-size:var(--fs-xs);color:var(--mute);text-align:center;margin-top:var(--s2)">' +
        esc(b.cap || '') + '</figcaption></figure>';
    });
  } else {
    body = paras(t.content);
    (t.images || []).forEach(function(x){
      body += '<img loading="lazy" alt="" src="' + esc(thumbUrl(x)) + '">';
    });
  }
  wrap.innerHTML = '<div class="reader">' +
    '<a class="back" href="#/blog">← 返回</a>' +
    (t.title ? '<h1>' + esc(t.title) + '</h1>' : '') +
    '<div class="meta">' + esc(fmtTime(t.created_at)) +
      (t.mood ? ' · ' + esc(t.mood) : '') +
      (t.weather ? ' · ' + esc(t.weather) : '') +
      (t.location ? ' · ' + esc(t.location) : '') + '</div>' +
    '<div class="body">' + body + '</div>' +
    (t.music_path ? '<div style="margin-top:var(--s6)"><button class="chip" id="postPlay">♪ 播放配乐：' +
      esc(t.music_title || '音乐') + '</button></div>' : '') +
    '</div>';
  app.appendChild(wrap);
  markImgs(wrap);
  if(t.music_path){
    $('#postPlay', wrap).onclick = function(){
      var i = -1;
      S.music.forEach(function(m, k){ if(m.storage_path === t.music_path) i = k; });
      if(i < 0){ S.music.push({ title: t.music_title || '配乐', storage_path: t.music_path }); i = S.music.length - 1; }
      playAt(i);
    };
  }
}

/* ══ 灯箱 ══ */
var LB = { list: [], i: 0, open: false };
function openLb(list, i){
  LB.list = list || []; LB.i = i || 0; LB.open = true;
  var el = $('#lb');
  el.classList.add('on');
  document.body.style.overflow = 'hidden';
  showLb();
  window.dispatchEvent(new CustomEvent('lb-open'));
}
function closeLb(){
  LB.open = false;
  $('#lb').classList.remove('on');
  document.body.style.overflow = '';
  $('#lb-img').removeAttribute('src');
  window.dispatchEvent(new CustomEvent('lb-close'));
}
function showLb(){
  var p = LB.list[LB.i]; if(!p) return;
  var img = $('#lb-img');
  $('#lb-count').textContent = (LB.i + 1) + ' / ' + LB.list.length;
  var alb = albumOf(p.album_id);
  $('#lb-name').textContent = (alb ? alb.title + ' · ' : '') + String(p.storage_path||'').split('/').pop();
  $('#lb-spin').classList.add('on');
  img.style.opacity = '0';
  var full = fullUrl(p.storage_path);
  var tmp = new Image();
  tmp.onload = function(){
    img.src = full; img.style.opacity = '1'; $('#lb-spin').classList.remove('on');
  };
  tmp.onerror = function(){
    img.src = thumbUrl(p.storage_path); img.style.opacity = '1'; $('#lb-spin').classList.remove('on');
  };
  tmp.src = full;
  $('#lbOpen').onclick = function(){ window.open(full, '_blank'); };
  /* 预取相邻两张 */
  [LB.i-1, LB.i+1].forEach(function(k){
    if(k >= 0 && k < LB.list.length){ var n = new Image(); n.src = fullUrl(LB.list[k].storage_path); }
  });
}
function lbStep(d){
  if(!LB.open) return;
  var n = LB.list.length; if(!n) return;
  LB.i = (LB.i + d + n) % n;
  showLb();
}
function initLb(){
  $('#lbClose').onclick = closeLb;
  $('#lbPrev').onclick = function(){ lbStep(-1); };
  $('#lbNext').onclick = function(){ lbStep(1); };
  $('#lb-stage').addEventListener('click', function(e){ if(e.target === this || e.target.id === 'lb-img') closeLb(); });
  document.addEventListener('keydown', function(e){
    if(!LB.open) return;
    if(e.key === 'Escape') closeLb();
    else if(e.key === 'ArrowLeft') lbStep(-1);
    else if(e.key === 'ArrowRight') lbStep(1);
    else if(e.key === ' ') { e.preventDefault(); plToggle(); }
  });
  /* 触屏左右滑 */
  var x0 = 0, y0 = 0, moving = false;
  var st = $('#lb-stage');
  st.addEventListener('touchstart', function(e){
    if(e.touches.length !== 1) return;
    x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; moving = true;
  }, {passive:true});
  st.addEventListener('touchend', function(e){
    if(!moving) return; moving = false;
    var t = e.changedTouches[0]; if(!t) return;
    var dx = t.clientX - x0, dy = t.clientY - y0;
    if(Math.abs(dx) > 46 && Math.abs(dx) > Math.abs(dy)) lbStep(dx > 0 ? -1 : 1);
    else if(dy > 90 && Math.abs(dy) > Math.abs(dx)) closeLb();   /* 下滑关闭 */
  }, {passive:true});
}

/* ══ 播放器（音乐走公开桶，不依赖 SW）══ */
var A = $('#audio');
var MODES = ['list','one','shuffle'];
var MODE_TIP = { list:'列表循环', one:'单曲循环', shuffle:'随机播放' };
var mode = (lsGet(PREF_KEY, {}).mode) || 'list';
var idx = 0, seeking = false, gotUser = false;
function musicUrl(m){
  var p = String((m && (m.storage_path || m.url)) || '');
  if(!p) return '';
  if(/^https?:/i.test(p)) return p;
  return SB_URL + '/storage/v1/object/public/music/' + safeKey(p);
}
function plTitle(t){
  $('#plTitle').textContent = t.title || '—';
  $('#plArtist').textContent = t.artist || '';
  $('#player').classList.add('show');
  document.body.style.paddingBottom = 'var(--player-h)';
}
function playAt(i){
  if(!S.music.length) return;
  idx = (i + S.music.length) % S.music.length;
  var m = S.music[idx];
  plTitle(m);
  var u = musicUrl(m);
  if(A.getAttribute('src') !== u){ A.src = u; }
  A.play().catch(function(){ /* 浏览器拦截：等用户点一下 */ });
  lsSet(PREF_KEY, Object.assign(lsGet(PREF_KEY, {}), { lastSong: m.storage_path, mode: mode }));
}
function plToggle(){
  gotUser = true;
  if(!S.music.length) return;
  if(!A.src){ playAt(idx); return; }
  if(A.paused){
    if(A.error){ try{ A.load(); }catch(e){} }
    A.play().catch(function(){});
  } else A.pause();
}
function plNext(auto){
  if(!S.music.length) return;
  if(mode === 'shuffle' && S.music.length > 1){
    var r = idx; var g = 0;
    while(r === idx && g++ < 30) r = Math.floor(Math.random() * S.music.length);
    playAt(r); return;
  }
  playAt(idx + 1);
}
function plPrev(){ playAt(idx - 1); }
function initPlayer(){
  $('#plPlay').onclick = plToggle;
  $('#plNext').onclick = function(){ plNext(false); };
  $('#plPrev').onclick = plPrev;
  var mb = $('#plMode');
  function paintMode(){
    mb.textContent = mode === 'one' ? '①' : (mode === 'shuffle' ? '⤨' : '↻');
    mb.title = '播放模式：' + MODE_TIP[mode] + '（点击切换）';
  }
  mb.onclick = function(){
    mode = MODES[(MODES.indexOf(mode) + 1) % MODES.length];
    paintMode();
    lsSet(PREF_KEY, Object.assign(lsGet(PREF_KEY, {}), { mode: mode }));
    toast(MODE_TIP[mode]);
  };
  paintMode();

  var track = $('#plTrack');
  function ratioOf(e){
    var r = track.getBoundingClientRect();
    var x = (e.clientX != null ? e.clientX : (e.touches && e.touches[0] ? e.touches[0].clientX : 0));
    return Math.max(0, Math.min(1, (x - r.left) / r.width));
  }
  function seek(e){
    if(!isFinite(A.duration)) return;
    A.currentTime = ratioOf(e) * A.duration;
  }
  track.addEventListener('pointerdown', function(e){
    gotUser = true;
    seeking = true; track.classList.add('drag');
    seek(e);
    try{ track.setPointerCapture(e.pointerId); }catch(err){}
  });
  track.addEventListener('pointermove', function(e){ if(seeking) seek(e); });
  track.addEventListener('pointerup', function(){ seeking = false; track.classList.remove('drag'); });
  track.addEventListener('pointercancel', function(){ seeking = false; track.classList.remove('drag'); });
  track.addEventListener('keydown', function(e){
    if(e.key === 'ArrowRight'){ A.currentTime = Math.min(A.duration||0, A.currentTime + 5); }
    else if(e.key === 'ArrowLeft'){ A.currentTime = Math.max(0, A.currentTime - 5); }
  });

  A.addEventListener('timeupdate', function(){
    if(A.duration){
      var pct = (A.currentTime / A.duration) * 100;
      if(!seeking){ $('#plProg').style.width = pct + '%'; $('#plKnob').style.left = pct + '%'; }
      $('#plTime').textContent = fmtDur(A.currentTime) + ' / ' + fmtDur(A.duration);
    }
  });
  A.addEventListener('play', function(){
    $('#plPlay').innerHTML = '<svg class="icon" viewBox="0 0 24 24" style="width:19px;height:19px"><path d="M7.5 5h3v14h-3zM13.5 5h3v14h-3z" fill="currentColor" stroke="none"/></svg>';
    errStreak = 0;
  });
  A.addEventListener('pause', function(){
    $('#plPlay').innerHTML = '<svg class="icon" viewBox="0 0 24 24" style="width:19px;height:19px"><path d="M7 4.5l12 7.5-12 7.5z" fill="currentColor" stroke="none"/></svg>';
  });
  A.addEventListener('ended', function(){
    if(mode === 'one'){ A.currentTime = 0; A.play().catch(function(){}); return; }
    plNext(true);
  });
  var errStreak = 0;
  A.addEventListener('error', function(){
    errStreak++;
    if(errStreak >= 2){ toast('音乐加载失败，请检查网络'); return; }
    setTimeout(function(){ plNext(true); }, 1200);
  });
  A.addEventListener('playing', function(){ errStreak = 0; });
}
/* 首次点击页面时尝试续上（浏览器不允许无交互出声） */
function armGrant(){
  function grant(){
    if(gotUser) return;
    gotUser = true;
    if(S.music.length && !A.src){ playAt(idx); }
  }
  document.addEventListener('pointerdown', function(e){
    if(e.target && e.target.closest && e.target.closest('#player')) return;   /* 播放器自己的点击交给它 */
    grant();
  }, {once:false});
}

/* ══ 密码门 ══ */
function hasSession(){
  try{
    for(var i=0;i<localStorage.length;i++){
      var k = localStorage.key(i);
      if(/^sb-.*-auth-token$/.test(k) && localStorage.getItem(k)) return true;
    }
  }catch(e){}
  return false;
}
function initGate(){
  var gate = $('#gate');
  if(hasSession()){ gate.classList.add('hide'); return true; }
  var go = function(){
    var v = $('#gatePwd').value;
    if(!v) return;
    $('#gateErr').textContent = '验证中…';
    sb.auth.signInWithPassword({ email: OWNER, password: v }).then(function(r){
      if(r && r.error){ $('#gateErr').textContent = '密码不对'; return; }
      location.reload();
    }).catch(function(){ $('#gateErr').textContent = '网络错误，再试试'; });
  };
  $('#gateGo').onclick = go;
  $('#gatePwd').addEventListener('keydown', function(e){ if(e.key === 'Enter') go(); });
  setTimeout(function(){ $('#gatePwd').focus(); }, 200);
  return false;
}

/* ══ 启动 ══ */
function boot(){
  initTheme();
  initLb();
  initPlayer();
  armGrant();
  loadSigned();
  $('#themeBtn').onclick = toggleTheme;

  try{ sb = window.supabase.createClient(SB_URL, SB_KEY); }catch(e){ sb = null; }

  if(!sb){ toast('无法连接云端'); return; }
  if(!initGate()) return;

  window.addEventListener('hashchange', route);

  var had = loadData();
  if(had){
    route();                 /* 有缓存：立即画（内容与数据库一致 → 不闪） */
    console.log('[v4] 用本地缓存立即渲染 ' + S.photos.length + ' 张');
    primeAllSigns();
  } else {
    $('#app').innerHTML = '<div class="loading" style="padding-top:20vh"><i></i><i></i><i></i></div>';
  }

  /* 拉数据库：回来只"对账"，一样就不重画（消除闪烁） */
  fetchAll().then(function(){
    primeAllSigns();
    var sig = dataSig();
    if(!had || sig !== S.dbSig){
      route();
      saveData();
      console.log('[v4] 数据已更新并渲染');
    } else {
      console.log('[v4] 数据与缓存一致 → 跳过重画');
    }
    /* 续上上次的歌（不自动播放，等用户碰页面） */
    var p = lsGet(PREF_KEY, {});
    if(p.lastSong){
      var i = -1;
      S.music.forEach(function(m,k){ if(m.storage_path === p.lastSong) i = k; });
      if(i >= 0){ idx = i; plTitle(S.music[i]); }
    } else if(S.music.length){ plTitle(S.music[0]); }
  }).catch(function(e){
    console.warn('[v4] 拉取失败', e);
    if(!had){ $('#app').innerHTML = '<div class="empty" style="padding-top:20vh"><div class="mark">✦</div>暂时读不到数据，刷新试试</div>'; }
  });
}

/* 顶栏滚动加深 */
window.addEventListener('scroll', function(){
  var t = $('#topbar');
  if(t) t.classList.toggle('scrolled', window.scrollY > 8);
}, {passive:true});

if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();

})();
