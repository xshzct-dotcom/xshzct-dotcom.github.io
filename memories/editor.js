/* ============================================
   Memories — 侧滑编辑器
   文章 / 相册 / 音乐 — 共用 Supabase — 毛玻璃 UI
   ============================================ */
(function(){
'use strict';

const SB_URL='https://mvzbkuhwapdqcdkekczh.supabase.co';
const SB_KEY='sb_publishable_1yOf4jtKqK1GApN3InC7Gg_TUD2Barb';
const STORAGE_URL=SB_URL+'/storage/v1/object/public/photos';
let sb;
try{sb=supabase.createClient(SB_URL,SB_KEY)}catch(e){sb=null}

// ===== 编辑器相册灯箱：全局事件只绑一次（修 ESC 关不掉 + 事件累积泄漏） =====
// window._aeGrid 由 renderAlbumPhotos 创建时设置，离开相册时置空
let _aeDragging = false;
document.addEventListener('keydown', function(e){
  if(e.key !== 'Escape') return;
  var grid = window._aeGrid;
  if(grid && grid.style.display !== 'none') grid.style.display = 'none';
});
document.addEventListener('mousemove', function(e){
  if(!_aeDragging) return;
  var z = window._aeZoom;
  var grid = window._aeGrid;
  if(!z || !grid || grid.style.display === 'none'){ _aeDragging = false; return; }
  z.x += e.clientX - z.lastX;
  z.y += e.clientY - z.lastY;
  z.lastX = e.clientX; z.lastY = e.clientY;
  var img = document.getElementById('aeLbImg');
  if(img){ img.style.transition = 'none'; img.style.transform = 'translate('+z.x+'px,'+z.y+'px) scale('+z.scale+')'; }
});
document.addEventListener('mouseup', function(){ _aeDragging = false; });

// 工具提前声明
function $(s,d){return(d||document).querySelector(s)}
function $$(s,d){return Array.from((d||document).querySelectorAll(s))}
function esc(s){return(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}

// 日期比较（YYYY.M.D 格式，a<b 返正数，即降序用 cmpDate(a,b)）
function cmpDate(a,b){
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

// 【安全】已移除 GitHub token 硬编码和 GitHub 仓库删除功能（2026-08-11）
// 原因：token 暴露在公开网页代码里，任何人可解码后操作仓库。
// 删除歌曲现在只清理 Supabase 数据库记录（不再动 GitHub 仓库文件）。

function db(){
  if(sb)return sb;
  const qb=r=>new Proxy({},{get:(_,p)=>{
    if(['select','insert','update','delete','upsert','order','eq','limit','single','maybeSingle','filter','match'].includes(p))return()=>qb(r);
    if(p==='then')return res=>res(r);
    if(p==='catch')return()=>{};
    return()=>qb(r);
  }});
  return{from:()=>qb({data:[],error:null}),storage:{from:()=>({upload:async()=>({error:null}),remove:async()=>({error:null})})}};
}

// ===== 全局面板 =====
let currentTab='essay';
async function open(){
  $('#editorPanel').classList.add('open');
  $('#editorBackdrop').classList.add('active');
  document.body.style.overflow='hidden';
  // 2026-09-11 性能优化：
  // 原来这里 await 同步流程（MemoriesReady/ensureDataSync）才渲染 → 打开慢、切 tab 又要等
  // 现在：立即渲染（命中缓存秒开，未命中只花 1 次往返），数据同步与另外两个 tab 的预取都放后台并行跑
  const body = $('#editorBody');
  if(!body.innerHTML || body.querySelector('.editor-empty')){
    body.innerHTML = '<div class="editor-empty">加载中…</div>';
  }
  if(sb){
    const wasSynced = _synced;
    (window.MemoriesReady || Promise.resolve())
      .then(function(){ return ensureDataSync(); })
      .then(function(){
        // 仅当本次真正做了首次同步时刷新视图；且用户已开始写内容时不重建（避免清空）
        if(!wasSynced && $('#editorPanel').classList.contains('open')){
          var _ta = document.getElementById('postText');
          var _busy = (_ta && _ta.value && _ta.value.trim()) || (_postDraft.images || []).length;
          invalidateCache();
          if(!_busy) renderTab();
        }
      })
      .catch(function(){});
  }
  renderTab();
  prefetchAllTabs();   // 并行预取三个 tab 的数据（切 tab 秒开）
}
function close(){ $('#editorPanel').classList.remove('open');$('#editorBackdrop').classList.remove('active');document.body.style.overflow=''; }
window.EDITOR={open,close};

// 兜底同步：script.js 没跑时，editor 自己从 data.js 拉数据同步（bulk insert）
let _synced = false;
async function ensureDataSync(){
  if(_synced || !sb) return;
  _synced = true;
  try{
    // 文章
    const {count:ec} = await sb.from('essays').select('*', {count:'exact', head:true});
    if((!ec || ec === 0)){
      const all = [];
      if(typeof essayCategories !== 'undefined'){
        essayCategories.forEach(cat => (cat.articles||[]).forEach((art, i) => all.push({category:cat.id, category_title:cat.title, title:art.title, date:art.date||'', body:art.body||'', sort_order:i})));
      }
      if(typeof travels !== 'undefined'){
        travels.forEach((art, i) => all.push({category:'travel', category_title:'旅行见闻', title:art.title, date:art.date||'', body:art.body||'', sort_order:-(i+1)}));
      }
      for(let i=0;i<all.length;i+=50) await sb.from('essays').insert(all.slice(i, i+50));
    }
    // 相册（schema: id, title, cover, sort_order, created_at — 无 photo_count）
    const {count:ac} = await sb.from('albums').select('*', {count:'exact', head:true});
    if((!ac || ac === 0) && typeof albums !== 'undefined'){
      const allA = albums.map((a, i) => ({title:a.title, sort_order:i, cover:a.cover||''}));
      for(let i=0;i<allA.length;i+=50) await sb.from('albums').insert(allA.slice(i, i+50));
    } else if(typeof albums !== 'undefined'){
      for(const a of albums){
        const {data:exist} = await sb.from('albums').select('id').eq('title', a.title).limit(1);
        // 只补 cover，不再改 sort_order（否则覆盖用户在编辑器里排好的相册顺序）
        if(exist && exist.length) await sb.from('albums').update({cover:a.cover||''}).eq('id', exist[0].id);
      }
    }
    // 音乐
    const {count:mc} = await sb.from('music').select('*', {count:'exact', head:true});
    if((!mc || mc === 0) && typeof playlist !== 'undefined'){
      const allM = playlist.map((m, i) => ({title:m.name||m.title, artist:m.artist||'', storage_path:m.url||`music/${m.name||m.title}.mp3`, sort_order:i, album_id:null})).filter(m=>m.title);
      if(allM.length) await sb.from('music').insert(allM);
    }
  }catch(e){ console.warn('[editor] ensureDataSync failed:', e); _synced = false; }
}

$('#editorClose').onclick=close;
$('#editorBackdrop').onclick=close;
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&$('#editorPanel').classList.contains('open'))close()});

// Tab 切换（带缓存）
var _editorCache = {essay: null, album: null, music: null, post: null};
var _cacheTime = {essay: 0, album: 0, music: 0, post: 0};
var _CACHE_TTL = 180000; // 2026-09-11 优化：15秒 → 3分钟（编辑器内改动会 invalidateCache，延长安全）
function invalidateCache(tab){
  if(tab && _cacheTime[tab]!==undefined) _cacheTime[tab]=0;
  else{_cacheTime={essay:0,album:0,music:0,post:0};}
  // 2026-09-16：本地缓存失效的同时，通知博客画布也重新拉取（免手动刷新）
  try{ if(typeof window.notifyBlogDataChanged === 'function') window.notifyBlogDataChanged(); }catch(e){}
}

// ===== 2026-09-11 加载优化：统一加载入口（复用进行中的请求）+ 三 tab 并行预取 =====
// 原来三个 tab 串行加载 + open() 等待同步流程，切换时每次都要等一个跨境往返
var _pending = {essay: null, album: null, music: null, post: null};
function loadTabData(tab){
  const now = Date.now();
  // 1) 命中内存缓存
  if(_editorCache[tab] && now - _cacheTime[tab] < _CACHE_TTL){
    return Promise.resolve(_editorCache[tab]);
  }
  // 2) 已有进行中的请求 → 复用（避免重复往返）
  if(_pending[tab]) return _pending[tab];
  var q;
  if(tab === 'essay')      q = db().from('essays').select('*');
  else if(tab === 'album') q = db().from('albums').select('*').order('sort_order', {ascending: true});
  else if(tab === 'post')  q = db().from('posts').select('*').order('created_at', {ascending: false}).limit(200);
  else                     q = db().from('music').select('*').order('sort_order', {ascending: true});
  _pending[tab] = Promise.resolve(q).then(function(r){
    const d = (r && r.data) || null;
    if(d){ _editorCache[tab] = d; _cacheTime[tab] = Date.now(); }
    _pending[tab] = null;
    return d;
  }).catch(function(){
    _pending[tab] = null;
    return null;
  });
  return _pending[tab];
}
// 并行预取全部 tab（切 tab 秒开）
function prefetchAllTabs(){
  return Promise.all([loadTabData('essay'), loadTabData('album'), loadTabData('music'), loadTabData('post')]).catch(function(){});
}
function afterMutation(tab, renderFn){
  invalidateCache(tab);
  if(typeof renderFn==='function') renderFn();
}

function showTabLoading(){
  const body=$('#editorBody');
  body.innerHTML='<div style="padding:40px;text-align:center;color:var(--text-muted);font-size:.9rem">加载中...</div>';
}
$$('#editorTabs .editor-tab').forEach(tab=>{
  tab.onclick=()=>{
    $$('#editorTabs .editor-tab').forEach(t=>t.classList.remove('active'));
    tab.classList.add('active');
    currentTab=tab.dataset.tab;
    // 2026-09-11：已缓存（被预取过）则直接渲染，不闪"加载中"
    if(!(_editorCache[currentTab] && Date.now()-_cacheTime[currentTab] < _CACHE_TTL)){
      showTabLoading();
    }
    renderTab();
  };
});

// ===== 文章编辑 =====
async function renderEssayTab(){
  const body=$('#editorBody');
  // 2026-09-15：「日记」分类已迁移到博客（posts 表），此处移除
  const cats=['童年篇','初恋篇','旅行见闻'];
  const catIds=['childhood','firstlove','travel'];
  var essays = await loadTabData('essay');
  // 文章按日期降序（最新在前），无日期文章按sort_order排在最后
  const all=(essays||[]).slice().sort(function(a,b){
    return cmpDate(a.date, b.date);
  });

  body.innerHTML=`
    <style>
      .ee-list-item{display:flex;align-items:center;padding:12px 14px;background:rgba(255,255,255,.03);border:1px solid var(--border);border-radius:var(--radius-sm);margin-bottom:8px;transition:all .2s}
      .ee-list-item:hover{border-color:var(--border-hover)}
      .ee-list-item .e-title{flex:1;font-size:.88rem;color:var(--text);min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .ee-list-item .e-meta{font-size:.72rem;color:var(--text-muted);margin-right:10px;white-space:nowrap}
      .ee-actions{display:flex;gap:4px;flex-shrink:0}
      .ee-btn{padding:5px 12px;border-radius:6px;font-size:.78rem;font-weight:500;transition:all .2s;border:1px solid var(--border);background:rgba(255,255,255,.04);color:var(--text-dim);cursor:pointer}
      .ee-btn:hover{background:rgba(255,255,255,.1);color:var(--text)}
      .ee-btn.del{border-color:rgba(255,80,80,.2);color:rgba(255,120,120,.7)}
      .ee-btn.del:hover{background:rgba(255,50,50,.15);color:var(--danger)}
      .ee-drag{cursor:grab;color:var(--text-muted);margin-right:8px;user-select:none;font-size:1rem}
      .ee-drag:active{cursor:grabbing}
    </style>
    <div style="margin-bottom:16px"><button class="editor-btn editor-btn-primary" id="eeNewBtn">✏️ 写新文章</button></div>
    <div id="eeList"></div>
  `;

  // 按分类分组
  const groups = {};
  all.forEach(a => {
    const cid = a.category || 'other';
    if(!groups[cid]) groups[cid] = {title: a.category_title || cid, items: []};
    groups[cid].items.push(a);
  });

  function renderList(){
    const list=$('#eeList');
    // 两层菜单：第一层是分类卡片，第二层是分类下的文章
    list.innerHTML = '<div id="eeCats"></div>';
    const catsEl = list.querySelector('#eeCats');
    // 计算每个分类的排序：按文章数降序
    const sortedCats = Object.entries(groups).sort((a,b) => b[1].items.length - a[1].items.length);
    catsEl.innerHTML = sortedCats.map(([cid, g]) => {
      const col = `var(--cat-${cid}, var(--cat-default))`;
      return `<div class="ee-cat-card" data-cat="${cid}" style="border-left:4px solid ${col};padding:14px 16px;background:rgba(255,255,255,.03);border:1px solid var(--border);border-radius:var(--radius-sm);margin-bottom:8px;cursor:pointer;transition:all .2s;display:flex;align-items:center;gap:12px">
        <span style="color:${col};font-size:1.2rem">●</span>
        <div style="flex:1">
          <div style="font-size:1rem;font-weight:600;color:var(--text)">${esc(g.title)}</div>
          <div style="font-size:.75rem;color:var(--text-muted);margin-top:2px">${g.items.length} 篇 · ${g.items[0]?.date || ''} ~ ${g.items[g.items.length-1]?.date || ''}</div>
        </div>
        <span style="color:var(--text-muted);font-size:1.2rem">›</span>
      </div>`;
    }).join('');
    // 点击分类进入二级
    catsEl.querySelectorAll('.ee-cat-card').forEach(c => {
      c.onclick = () => renderArticlesInCat(c.dataset.cat);
    });
  }

  // 显示某分类下的文章
  function renderArticlesInCat(catId){
    const g = groups[catId];
    if(!g) return;
    // 按日期降序（最新在前），无日期排在最后
    const items = [...g.items].sort(function(a,b){ return cmpDate(a.date, b.date); });
    const list=$('#eeList');
    const col = `var(--cat-${catId}, var(--cat-default))`;
    list.innerHTML = `
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px">
        <button class="ee-btn" id="eeBack">← 返回分类</button>
        <span style="color:${col};font-size:1.05rem;font-weight:600;flex:1">● ${esc(g.title)} (${items.length} 篇)</span>
        <button class="editor-btn editor-btn-primary" data-ee-new>✏️ 写新文章</button>
      </div>
      <div id="eeArticles"></div>
    `;
    document.getElementById('eeBack').onclick = () => renderList();
    document.querySelector('[data-ee-new]').onclick = function(){ window._essayReturnTo = function(){ renderEssayTab().then(function(){ setTimeout(renderArticlesInCat.bind(null, catId), 50); }); }; editEssay(null, catId); };
    const articlesEl = document.getElementById('eeArticles');
    articlesEl.innerHTML = items.map((a,i) => `
      <div class="ee-list-item" data-idx="${i}" data-sid="${a.id}">
        <span class="ee-drag" style="cursor:default">📄</span>
        <span class="e-title">${esc(a.title)}</span>
        <span class="e-meta">${a.date||''}</span>
        <div class="ee-actions">
          <button class="ee-btn" data-edit="${i}">✎</button>
          <button class="ee-btn del" data-del="${i}">🗑</button>
        </div>
      </div>
    `).join('');
    const itemList = items;
    articlesEl.querySelectorAll('[data-edit]').forEach(function(b){ b.onclick = function(){ window._essayReturnTo = function(){ renderEssayTab().then(function(){ setTimeout(renderArticlesInCat.bind(null, catId), 50); }); }; editEssay(itemList[parseInt(b.dataset.edit)]); }; });
    articlesEl.querySelectorAll('[data-del]').forEach(b => b.onclick = () => delEssay(itemList[parseInt(b.dataset.del)]));
    // 上移/下移按钮已移除：列表按日期排序，sort_order 交换无效（2026-08-11）
  }

  // 编辑/新建
  function editEssay(a, defaultCat){
    const isNew=!a;
    const category=a?a.category:(defaultCat||'childhood');
    const articleTitle=a?a.title:'';
    const date=a?(a.date||''):new Date().toLocaleDateString('zh-CN').replace(/\//g,'.');
    const articleBody=a?a.body:'';

    // 把 "2026.4.26" 转成 "2026-04-26" 给 <input type="date">
    function toDateInputValue(v){
      if(!v) return '';
      var m=v.match(/^(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})/);
      if(!m) return '';
      return m[1]+'-'+String(m[2]).padStart(2,'0')+'-'+String(m[3]).padStart(2,'0');
    }
    // 从 input 读取时，把 "2026-04-26" 还原成 "2026.4.26"
    function fromDateInputValue(v){
      if(!v) return '';
      var m=v.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if(!m) return v;
      return m[1]+'.'+parseInt(m[2])+'.'+parseInt(m[3]);
    }

    body.innerHTML=`
      <div class="editor-form-group"><label>分类</label><select id="eeCat">${catIds.map((c,i)=>`<option value="${c}" ${c===category?'selected':''}>${cats[i]}</option>`).join('')}</select></div>
      <div class="editor-form-group"><label>标题</label><input id="eeTitle" value="${esc(articleTitle)}" placeholder="文章标题"></div>
      <div class="editor-form-group"><label>日期</label>
        <div style="display:flex;gap:8px;align-items:center">
          <input id="eeDate" type="date" value="${esc(toDateInputValue(date))}" placeholder="无日期" style="flex:1;padding:12px 16px;background:rgba(232,228,218,.06);border:1px solid rgba(232,228,218,.12);border-radius:10px;color:var(--text,#E8E4DA);font-size:.95rem;outline:none;text-align:left;font-family:inherit">
          <button id="eeDateToday" type="button" class="editor-btn editor-btn-secondary" style="font-size:.8rem">今天</button>
          <button id="eeDateClear" type="button" class="editor-btn editor-btn-secondary" style="font-size:.8rem">无</button>
        </div>
      </div>
      <div class="editor-form-group"><label>正文</label><textarea id="eeBody" placeholder="写点什么...">${esc(articleBody)}</textarea></div>
      <div style="display:flex;gap:8px;justify-content:flex-end">
        <button class="editor-btn editor-btn-secondary" id="eeCancelBtn">取消</button>
        ${!isNew?`<button class="editor-btn editor-btn-danger" id="eeDelBtn">删除</button>`:''}
        <button class="editor-btn editor-btn-primary" id="eeSaveBtn">${isNew?'发布':'保存'}</button>
      </div>
    `;

    // 取消按钮：返回到上一级（如果在分类视图里编辑，就返回分类视图）
    $('#eeCancelBtn').onclick=function(){
      if(window._essayReturnTo) window._essayReturnTo();
      else renderEssayTab();
    };

    // 日期选择器逻辑
    // 日期快捷按钮
    var dateEl=$('#eeDate');
    var titleEl=$('#eeTitle');
    function syncDateToTitle(){
      if(!dateEl.value) return;
      var m=dateEl.value.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if(!m) return;
      var fmt=m[1]+'.'+parseInt(m[2])+'.'+parseInt(m[3]);
      // 标题为空或本身就是日期 → 自动同步
      var cur=titleEl.value.trim();
      if(!cur || cur.match(/^\d+\.\d+\.\d+$/)){
        titleEl.value=fmt;
      }
    }
    if($('#eeDateToday')) $('#eeDateToday').onclick=function(){
      var n=new Date();
      dateEl.value=n.getFullYear()+'-'+String(n.getMonth()+1).padStart(2,'0')+'-'+String(n.getDate()).padStart(2,'0');
      syncDateToTitle();
    };
    if($('#eeDateClear')) $('#eeDateClear').onclick=function(){ dateEl.value=''; };
    dateEl.onchange=syncDateToTitle;

    $('#eeSaveBtn').onclick=async()=>{
      var dateVal=$('#eeDate').value.trim();
      if(dateVal){
        // 把 "2026-04-26" 还原成 "2026.4.26"
        var m=dateVal.match(/^(\d{4})-(\d{2})-(\d{2})/);
        if(m) dateVal=m[1]+'.'+parseInt(m[2])+'.'+parseInt(m[3]);
      }
      const data={
        category:$('#eeCat').value,
        category_title:cats[catIds.indexOf($('#eeCat').value)]||$('#eeCat').value,
        title:$('#eeTitle').value.trim(),
        date:dateVal,
        body:$('#eeBody').value.trim(),
      };
      if(!data.title||!data.body){ if(window.toast) toast('标题和正文不能为空','warn'); else alert('标题和正文不能为空'); return }
      if(a&&a.id) await db().from('essays').update(data).eq('id',a.id);
      else{const {data:exist}=await db().from('essays').select('id').eq('category',data.category).eq('title',data.title).limit(1);
        if(exist&&exist.length) await db().from('essays').update(data).eq('id',exist[0].id);
        else{data.sort_order=0;await db().from('essays').insert(data);}
      }
      if(window.toast) toast('已保存 ✓','success');
      // 保存后返回上一级 + 清除缓存
      invalidateCache('essay');
      if(window._essayReturnTo) window._essayReturnTo();
      else renderEssayTab();
      if(window.reloadFromSupabase) setTimeout(window.reloadFromSupabase, 2000);
    };

    if(!isNew) $('#eeDelBtn').onclick=async()=>{
      if(!confirm('确定删除「'+title+'」？'))return;
      await db().from('essays').delete().eq('id',a.id);
      invalidateCache('essay');
      if(window._essayReturnTo) window._essayReturnTo();
      else renderEssayTab();
      if(window.reloadFromSupabase) setTimeout(window.reloadFromSupabase, 2000);
    };
  }

  function delEssay(a){
    if(!confirm('确定删除「'+a.title+'」？'))return;
    db().from('essays').delete().eq('id',a.id).then(()=>{invalidateCache('essay');renderEssayTab();if(typeof buildTimeline==='function')buildTimeline();});
  }

  renderList();
  $('#eeNewBtn').onclick=()=>editEssay(null);
}
window.renderEssayTab=renderEssayTab;

// ===== 相册编辑 =====
async function renderAlbumTab(){
  window._aeGrid = null;  // 离开相册视图，释放灯箱引用
  const body=$('#editorBody');
  var albums = await loadTabData('album');
  const list=albums||[];
  body.style.paddingTop = '';
  body.innerHTML=`
    <div style="margin-bottom:16px"><button class="editor-btn editor-btn-primary" id="aeNewBtn">+ 新建相册</button></div>
    <div id="aeList"></div>
  `;

function renderList(){
    const el=$('#aeList');
    el.innerHTML=list.map((a,i)=>`
      <div class="editor-list-item" data-idx="${i}" data-id="${a.id}">
        <div class="info"><div class="title">${esc(a.title)}</div><div class="meta">${a.sort_order!==undefined?'排序:'+a.sort_order:''}</div></div>
        <div class="actions">
          <button class="editor-btn-sm" data-ae-move="${i}" data-dir="-1" ${i===0?'disabled':''} title="上移">▲</button>
          <button class="editor-btn-sm" data-ae-move="${i}" data-dir="1" ${i===list.length-1?'disabled':''} title="下移">▼</button>
          <button class="editor-btn-sm" data-ae-open="${i}">📂</button>
          <button class="editor-btn-sm" data-ae-rename="${i}">✎</button>
          <button class="editor-btn-sm del" data-ae-del="${i}">🗑</button>
        </div>
      </div>
    `).join('')||'<div class="editor-empty">暂无相册</div>';

    el.querySelectorAll('[data-ae-open]').forEach(b=>b.onclick=()=>renderAlbumPhotos(list[parseInt(b.dataset.aeOpen)]));
    el.querySelectorAll('[data-ae-rename]').forEach(b=>b.onclick=()=>{
      const a=list[parseInt(b.dataset.aeRename)];
      const n=prompt('新名称:',a.title);if(!n)return;
      db().from('albums').update({title:n.trim()}).eq('id',a.id).then(()=>renderAlbumTab());
    });
    el.querySelectorAll('[data-ae-del]').forEach(b=>b.onclick=()=>{
      const a=list[parseInt(b.dataset.aeDel)];
      if(!confirm('删除相册「'+a.title+'」？'))return;
      db().from('albums').delete().eq('id',a.id).then(()=>{
        renderAlbumTab();
        if(window.reloadFromSupabase) window.reloadFromSupabase();
      });
    });
    // 上下移动
    el.querySelectorAll('[data-ae-move]').forEach(b=>b.onclick=async ()=>{
      const i = parseInt(b.dataset.aeMove);
      const dir = parseInt(b.dataset.dir);
      const j = i + dir;
      if(j<0 || j>=list.length) return;
      const a = list[i], c = list[j];
      if(!a || !c) return;
      try{
        if(sb){
          await sb.from('albums').update({sort_order:j}).eq('id', a.id);
          await sb.from('albums').update({sort_order:i}).eq('id', c.id);
        }
        const tmp = list[i]; list[i] = list[j]; list[j] = tmp;
        renderList();
        if(window.reloadFromSupabase) setTimeout(()=>window.reloadFromSupabase(), 1000);
      } catch(err){ console.warn('[album move]', err); }
    });
  }

  function renderAlbumPhotos(album){
    if(!album || !album.id){
      console.warn('[album] renderAlbumPhotos called with invalid album:', album);
      return;
    }
    console.log('[album] loading photos for album.id:', album.id, 'title:', album.title);
    db().from('album_photos').select('*').eq('album_id',album.id).then(({data:photos})=>{
      console.log('[album] got', (photos||[]).length, 'photos for album', album.id);
      // 混合排序：用户新上传的（sort_order 是 Date.now() 大数字）排最前（按时间倒序），
      // 其余老照片保持原始顺序（sort_order 升序）
      const NEW_THRESHOLD = 1000000000; // 大于 10 亿的都是上传接口写入的 Date.now()
      const plist=(photos||[]).slice().sort(function(a,b){
        var aNew = (a.sort_order||0) > NEW_THRESHOLD;
        var bNew = (b.sort_order||0) > NEW_THRESHOLD;
        if(aNew !== bNew) return aNew ? -1 : 1;      // 新上传优先
        if(aNew) return (b.sort_order||0)-(a.sort_order||0); // 新上传之间：最新在前
        return (a.sort_order||0)-(b.sort_order||0);  // 老照片：保持原始顺序
      });
      body.style.paddingTop = '0';
      body.innerHTML = `
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;position:sticky;top:0;background:var(--bg);padding:8px 0;z-index:5">
          <button class="editor-btn editor-btn-secondary" onclick="renderAlbumTab()">← 返回</button>
          <span style="color:var(--text);flex:1">📸 ${esc(album.title)} (${plist.length}张)</span>
          <button class="editor-btn editor-btn-secondary" id="aeSelectToggle" style="font-size:.8rem">选择</button>
          <label class="editor-btn editor-btn-primary" style="cursor:pointer">上传照片<input type="file" accept="image/*" multiple style="display:none" id="aeUpload"></label>
        </div>
        <div id="aePhotoToolbar" style="display:none;background:var(--bg-secondary);border:1px solid var(--glass-border);border-radius:8px;padding:10px 14px;margin-bottom:12px;gap:8px;align-items:center;flex-wrap:wrap">
          <span style="color:var(--text-dim);font-size:.82rem;flex:1" id="aeSelectedInfo">已选 0 张</span>
          <button class="editor-btn" id="aeDeleteBtn" title="删除" style="background:rgba(220,38,38,.7);border-color:rgba(220,38,38,.5);color:#fff">🗑 删除</button>
          <button class="editor-btn editor-btn-secondary" id="aeCancelSelBtn" title="取消">✕ 取消</button>
        </div>
        <div id="aePhotoList"></div>
      `;
      // 灯箱容器直接挂 body，用 inline 事件隔离脏代码
      const aeGrid = document.createElement('div');
      aeGrid.id = 'aeLightbox';
      window._aeGrid = aeGrid;   // 供模块级 ESC / mousemove 使用
      aeGrid.style.cssText = 'display:none;position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.94);align-items:center;justify-content:center;flex-direction:column';
      // 移除已有的重复灯箱
      var oldGrid = document.getElementById('aeLightbox');
      if(oldGrid) oldGrid.parentNode.removeChild(oldGrid);
      document.body.appendChild(aeGrid);
      // 同样清理旧照片弹窗（编辑器旧版本残留）
      var oldPrv = document.getElementById('aePhotoPreview');
      if(oldPrv) oldPrv.parentNode.removeChild(oldPrv);

      let _pressTimer = null;
      let _pressCard = null;
      let _pressMoved = false;
      let _longPressFired = false;
      const _selSet = new Set();
      let _selectMode = false;
      let _prvIdx = 0;
      const _prvList = plist;

      function imgSrc(p){
        if(!p || !p.storage_path) return '';
        const sp = p.storage_path;
        return sp.startsWith('images/') ? ('https://xshzct-dotcom.github.io/images/' + sp.replace(/^images\//,'')) : (STORAGE_URL + '/' + sp);
      }
      // ===== 独立灯箱缩放（1:1 复刻主页） =====
      var aeZoom = {scale:1, x:0, y:0, dragging:false, lastX:0, lastY:0};
      window._aeZoom = aeZoom;   // 供模块级 mousemove 使用
      var aeAnim = false;
      function aeApply(){
        var img = document.getElementById('aeLbImg');
        if(!img) return;
        if(aeZoom.dragging) img.style.transition = 'none';
        else img.style.transition = 'transform .28s cubic-bezier(.2,0,.2,1)';
        img.style.transform = 'translate('+aeZoom.x+'px,'+aeZoom.y+'px) scale('+aeZoom.scale+')';
      }
      function aeReset(){ aeZoom.scale=1; aeZoom.x=0; aeZoom.y=0; aeApply(); }
      function aeZoomTo(ns, ax, ay){
        var r = aeGrid.getBoundingClientRect();
        var cx = typeof ax==='number' ? ax-r.left-r.width/2 : 0;
        var cy = typeof ay==='number' ? ay-r.top-r.height/2 : 0;
        var os = aeZoom.scale, fs = Math.max(1,Math.min(8,ns)), r0 = fs/os;
        aeZoom.x = (aeZoom.x-cx)*r0+cx; aeZoom.y = (aeZoom.y-cy)*r0+cy; aeZoom.scale = fs;
        aeAnim = true; setTimeout(function(){ aeAnim = false; }, 300);
        aeApply();
      }
      function openLightbox(idx){
        _prvIdx = idx;
        var url = imgSrc(_prvList[idx]);
        if(!url) return;
        aeReset();
        aeGrid.innerHTML = (
          '<div id="aeLbStage" style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;overflow:hidden;cursor:zoom-in">' +
          '<img id="aeLbImg" src="'+esc(url)+'" style="max-width:92vw;max-height:88vh;object-fit:contain;user-select:none;-webkit-user-drag:none;transition:transform .28s cubic-bezier(.2,0,.2,1);transform-origin:center;will-change:transform;backface-visibility:hidden">' +
          '</div>' +
          '<button class="aelb-close" style="position:fixed;top:20px;right:24px;width:44px;height:44px;border-radius:50%;font-size:1.5rem;color:var(--text);background:rgba(255,255,255,.05);display:flex;align-items:center;justify-content:center;z-index:99999;transition:opacity .4s;border:1px solid rgba(255,255,255,.1);cursor:pointer" onclick="document.getElementById(\'aeLightbox\').style.display=\'none\'">\u00d7</button>' +
          (plist.length>1 ? (
            '<button class="aelb-prev" style="position:fixed;top:50%;left:20px;transform:translateY(-50%);width:54px;height:54px;border-radius:50%;font-size:1.8rem;color:var(--text);background:rgba(255,255,255,.05);display:flex;align-items:center;justify-content:center;z-index:99999;transition:opacity .4s;border:1px solid rgba(255,255,255,.1);cursor:pointer">\u2039</button>' +
            '<button class="aelb-next" style="position:fixed;top:50%;right:20px;transform:translateY(-50%);width:54px;height:54px;border-radius:50%;font-size:1.8rem;color:var(--text);background:rgba(255,255,255,.05);display:flex;align-items:center;justify-content:center;z-index:99999;transition:opacity .4s;border:1px solid rgba(255,255,255,.1);cursor:pointer">\u203A</button>' +
            '<div style="position:fixed;bottom:24px;left:50%;transform:translateX(-50%);color:var(--text-dim);font-size:.85rem;z-index:99999;background:rgba(0,0,0,.4);padding:4px 12px;border-radius:12px;backdrop-filter:blur(8px)">'+(idx+1)+'/'+plist.length+'</div>'
          ):'') +
          '<div id="aeLbZi" style="position:fixed;top:24px;left:24px;color:var(--text-dim);font-size:.85rem;z-index:99999;background:rgba(0,0,0,.4);padding:2px 8px;border-radius:8px;display:none">100%</div>'
        );
        aeGrid.style.display = 'flex';
        aeGrid.onclick = function(e){ var t=e.target; if(t.classList.contains('aelb-prev')) openLightbox((_prvIdx-1+plist.length)%plist.length); else if(t.classList.contains('aelb-next')) openLightbox((_prvIdx+1)%plist.length); };
        aeBind();
      }
      function aeBind(){
        var stage = document.getElementById('aeLbStage');
        if(!stage) return;
        // 双击
        stage.addEventListener('dblclick', function(e){
          e.preventDefault();
          if(aeAnim) return;
          if(aeZoom.scale > 1.01){ aeReset(); return; }
          aeZoomTo(2, e.clientX, e.clientY);
        });
        // 滚轮
        stage.addEventListener('wheel', function(e){
          e.preventDefault();
          var factor = e.deltaY < 0 ? 1.1 : 1/1.1;
          aeZoomTo(aeZoom.scale*factor, e.clientX, e.clientY);
        }, {passive:false});
        // 鼠标拖动（mousemove/mouseup 已在模块级只绑一次，这里只标记开始）
        stage.addEventListener('mousedown', function(e){
          if(aeZoom.scale <= 1.01) return;
          if(e.target.closest('.aelb-close,.aelb-prev,.aelb-next')) return;
          aeZoom.dragging = true; _aeDragging = true; aeZoom.lastX = e.clientX; aeZoom.lastY = e.clientY; aeApply();
        });
        // 触摸
        var tdM='none',tdSX=0,tdSY=0,tdZX=0,tdZY=0,tdD=0,tdSA=1,tdLT=0,tdLX=0,tdLY=0,tdSD=0;
        stage.addEventListener('touchstart', function(e){
          if(e.touches.length===1){
            var n=Date.now();
            if(n-tdLT<280&&Math.abs(e.touches[0].clientX-tdLX)<30&&Math.abs(e.touches[0].clientY-tdLY)<30){
              e.preventDefault();
              if(aeAnim){ tdLT=0; return; }
              if(aeZoom.scale>1.01) aeReset(); else aeZoomTo(2,e.touches[0].clientX,e.touches[0].clientY);
              tdLT=0; return;
            }
            tdLT=n;tdLX=e.touches[0].clientX;tdLY=e.touches[0].clientY;
            tdSX=e.touches[0].clientX;tdSY=e.touches[0].clientY;tdZX=aeZoom.x;tdZY=aeZoom.y;tdSD=0;
            tdM = aeZoom.scale>1.01 ? 'pan' : 'swipe';
          } else if(e.touches.length===2){
            e.preventDefault();
            var dx=e.touches[0].clientX-e.touches[1].clientX,dy=e.touches[0].clientY-e.touches[1].clientY;
            tdD=Math.hypot(dx,dy);tdSA=aeZoom.scale;tdM='pinch';
          }
        }, {passive:false});
        stage.addEventListener('touchmove', function(e){
          if(tdM==='pan'&&e.touches.length===1){
            e.preventDefault();
            aeZoom.x=tdZX+(e.touches[0].clientX-tdSX);aeZoom.y=tdZY+(e.touches[0].clientY-tdSY);aeApply();
          } else if(tdM==='swipe'&&e.touches.length===1){
            tdSD=e.touches[0].clientX-tdSX;
          } else if(tdM==='pinch'&&e.touches.length===2){
            e.preventDefault();
            var dx2=e.touches[0].clientX-e.touches[1].clientX,dy2=e.touches[0].clientY-e.touches[1].clientY;
            var ns=Math.max(1,Math.min(5,tdSA*Math.hypot(dx2,dy2)/tdD));
            var cx=(e.touches[0].clientX+e.touches[1].clientX)/2,cy=(e.touches[0].clientY+e.touches[1].clientY)/2;
            aeZoomTo(ns,cx,cy,false);
          }
        }, {passive:false});
        stage.addEventListener('touchend', function(e){
          if(tdM==='swipe'&&Math.abs(tdSD)>50) openLightbox((_prvIdx+(tdSD>0?-1:1)+plist.length)%plist.length);
          if(e.touches.length===0) tdM='none';
        });
      }

      function updateSelUI(){
        var inMulti = _selectMode || _selSet.size > 0;
        var cards = document.querySelectorAll('.ae-photo-card');
        for(var i=0;i<cards.length;i++){
          var ci = parseInt(cards[i].dataset.idx);
          var checked = _selSet.has(ci);
          cards[i].style.border = '2px solid ' + (checked ? 'var(--accent,#7C9B7E)' : 'transparent');
          var checkEl = cards[i].querySelector('.ae-check');
          if(checkEl){
            checkEl.style.display = inMulti ? 'flex' : 'none';
            checkEl.style.background = checked ? 'var(--accent,#7C9B7E)' : 'rgba(0,0,0,.5)';
            checkEl.style.borderColor = checked ? 'var(--accent,#7C9B7E)' : 'rgba(255,255,255,.5)';
          }
        }
        var tb = document.getElementById('aePhotoToolbar');
        var info = document.getElementById('aeSelectedInfo');
        var delBtn = document.getElementById('aeDeleteBtn');
        var toggleBtn = document.getElementById('aeSelectToggle');
        if(tb && info){
          if(_selSet.size > 0){
            tb.style.display = 'flex';
            info.textContent = '已选 '+_selSet.size+' 张';
            if(delBtn) delBtn.textContent = '🗑 删除 × '+_selSet.size;
            if(toggleBtn) toggleBtn.textContent = '退出';
          } else if(_selectMode){
            tb.style.display = 'flex';
            info.textContent = '选择模式 - 点击切换';
            if(delBtn) delBtn.textContent = '🗑 删除';
            if(toggleBtn) toggleBtn.textContent = '完成';
          } else {
            tb.style.display = 'none';
            if(toggleBtn) toggleBtn.textContent = '选择';
          }
        }
      }

      function renderGrid(){
        var el = document.getElementById('aePhotoList');
        if(!el) return;
        el.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:10px;padding:0 0 30px;align-content:start';
        var html = '';
        for(var i=0;i<plist.length;i++){
          var sp = plist[i].storage_path || '';
          var imgUrl = imgSrc(plist[i]);
          if(!imgUrl) imgUrl = '';
          html += '<div class="ae-photo-card" data-idx="'+i+'" draggable="true" style="position:relative;aspect-ratio:1;background:var(--bg-secondary);border:2px solid '+(_selSet.has(i)?'var(--accent,#7C9B7E)':'transparent')+';border-radius:8px;overflow:hidden;cursor:pointer;transition:border .15s;user-select:none">';
          html += '<img src="'+esc(imgUrl)+'" loading="lazy" style="width:100%;height:100%;object-fit:cover;display:block;background:#1a1d2e;pointer-events:none;user-select:none;-webkit-user-drag:none" onerror="this.style.opacity=.2">';
          html += '<div style="position:absolute;top:4px;left:4px;background:rgba(0,0,0,.6);color:#fff;font-size:.65rem;padding:2px 6px;border-radius:3px;pointer-events:none">'+(i+1)+'</div>';
          html += '<div class="ae-check" style="display:'+((_selectMode||_selSet.size>0)?'flex':'none')+';position:absolute;top:6px;right:6px;width:24px;height:24px;border-radius:50%;background:'+(_selSet.has(i)?'var(--accent,#7C9B7E)':'rgba(0,0,0,.5)')+';border:2px solid '+(_selSet.has(i)?'var(--accent,#7C9B7E)':'rgba(255,255,255,.5)')+';color:#fff;font-size:.85rem;align-items:center;justify-content:center;z-index:3">✓</div>';
          html += '</div>';
        }
        if(plist.length === 0) html = '<div class="editor-empty" style="grid-column:1/-1">暂无照片</div>';
        el.innerHTML = html;

        // 给每张照片绑事件
        var cards = el.querySelectorAll('.ae-photo-card');
        for(var ci=0; ci<cards.length; ci++){
          (function(card, i){
            // 长按检测
            function startPress(){
              _pressCard = card; _pressMoved = false;
              _pressTimer = setTimeout(function(){
                if(!_pressMoved && _pressCard === card){
                  _selectMode = true;
                  _selSet.add(i);
                  _longPressFired = true;
                  updateSelUI();
                }
              }, 500);
            }
            function cancelPress(){
              if(_pressTimer){ clearTimeout(_pressTimer); _pressTimer = null; }
              _pressCard = null;
            }
            // 鼠标/触摸事件
            card.addEventListener('mousedown', function(e){ if(e.button===0) startPress(); });
            card.addEventListener('touchstart', function(){ startPress(); }, {passive: true});
            card.addEventListener('mousemove', function(){ _pressMoved = true; cancelPress(); });
            card.addEventListener('touchmove', function(){ _pressMoved = true; cancelPress(); }, {passive: true});
            // 单击
            card.addEventListener('click', function(e){
              e.stopPropagation();
              cancelPress();
              // 长按已经触发了选择，这次点击不再切换，也不打开预览
              if(_longPressFired){
                _longPressFired = false;
                return;
              }
              if(_selectMode || _selSet.size > 0){
                if(_selSet.has(i)) _selSet.delete(i); else _selSet.add(i);
                if(_selSet.size === 0){ _selectMode = false; }
                updateSelUI();
                return;
              }
              // 普通模式：打开灯箱
              openLightbox(i);
            });
            // 拖拽
            var dragging = false;
            card.addEventListener('dragstart', function(e){
              cancelPress();
              if(_selectMode || _selSet.size > 0){ e.preventDefault(); return; }
              dragging = true;
              card.style.opacity = '0.3';
              card.dataset.dragIdx = i;
              e.dataTransfer.effectAllowed = 'move';
              try{ e.dataTransfer.setData('text/plain', 'x'); }catch(_){}
            });
            card.addEventListener('dragend', function(){ card.style.opacity = ''; dragging = false; delete card.dataset.dragIdx; });
            card.addEventListener('dragover', function(e){
              if(!dragging) return;
              e.preventDefault();
              var from = parseInt(card.dataset.dragIdx);
              var to = i;
              if(isNaN(from) || from === to) return;
              var cards2 = el.querySelectorAll('.ae-photo-card');
              for(var k=0;k<cards2.length;k++){
                var idx2 = parseInt(cards2[k].dataset.idx);
                var baseBorder = _selSet.has(idx2) ? 'var(--accent,#7C9B7E)' : 'transparent';
                cards2[k].style.borderTopColor = '';
                cards2[k].style.borderBottomColor = '';
                cards2[k].style.border = '2px solid ' + baseBorder;
                if(idx2 > from && idx2 <= to){ cards2[k].style.borderBottomColor = 'var(--accent,#7C9B7E)'; }
                else if(idx2 >= to && idx2 < from){ cards2[k].style.borderTopColor = 'var(--accent,#7C9B7E)'; }
              }
            });
            card.addEventListener('drop', async function(e){
              if(!dragging) return;
              e.preventDefault();
              e.stopPropagation();
              var from = parseInt(card.dataset.dragIdx);
              var to = i;
              if(isNaN(from) || from === to) return;
              var item = plist.splice(from, 1)[0];
              plist.splice(to, 0, item);
              try{
                if(sb){
                  var updates = [];
                  for(var j=0;j<plist.length;j++) updates.push(sb.from('album_photos').update({sort_order:j}).eq('id', plist[j].id));
                  await Promise.all(updates);
                }
              }catch(err){ console.warn(err); }
              renderGrid();
              if(window.reloadFromSupabase) setTimeout(function(){ window.reloadFromSupabase(); }, 1000);
            });
          })(cards[ci], ci);
        }

        // 边缘自动滚动
        el.ondragover = function(e){
          if(!document.querySelector('.ae-photo-card[data-drag-idx]')) return;
          var eb = document.getElementById('editorBody');
          if(!eb) return;
          var rect = eb.getBoundingClientRect();
          var m = 60;
          if(e.clientY - rect.top < m) eb.scrollTop -= 10;
          else if(rect.bottom - e.clientY < m) eb.scrollTop += 10;
        };
      }

      renderGrid();

      // 工具栏按钮（一次设置）
      setTimeout(function(){
        var toggleBtn = document.getElementById('aeSelectToggle');
        var delBtn = document.getElementById('aeDeleteBtn');
        var cancelBtn = document.getElementById('aeCancelSelBtn');
        if(toggleBtn) toggleBtn.onclick = function(){
          if(_selSet.size > 0){ _selSet.clear(); _selectMode = false; }
          else { _selectMode = !_selectMode; }
          updateSelUI();
        };
        if(delBtn) delBtn.onclick = async function(){
          if(_selSet.size === 0){ alert('请先长按或点击「选择」进入多选模式，再点击照片选中'); return; }
          if(!confirm('删除选中的 '+_selSet.size+' 张？')) return;
          var ids = [];
          var sps = [];
          _selSet.forEach(function(i){ if(plist[i]){ ids.push(plist[i].id); sps.push(plist[i].storage_path); } });
          try{
            if(sb) await sb.from('album_photos').delete().in('id', ids);
            // 2026-09-16：连缩略图一起删，避免"删了照片但 thumbs/ 还占着空间"
            var spsAll = sps.concat(sps.map(function(x){ return 'thumbs/' + x; }));
            if(spsAll.length && sb) sb.storage.from('photos').remove(spsAll).catch(function(){});
          }catch(err){ console.warn(err); }
          _selSet.clear(); _selectMode = false;
          invalidateCache('album');   // 删除照片后清相册列表缓存（返回时张数正确）
          renderAlbumPhotos(album);
        };
        if(cancelBtn) cancelBtn.onclick = function(){ _selSet.clear(); _selectMode = false; updateSelUI(); };
      }, 0);

      // ESC 关闭灯箱已由模块级 keydown 统一处理（不再每次新增监听）；
      // 这里只处理"退出多选模式"
      document.addEventListener('keydown', function(e){
        if(e.key !== 'Escape') return;
        if(_selectMode || _selSet.size > 0){ _selSet.clear(); _selectMode = false; updateSelUI(); }
      });
      // Upload - 用 anon key（RLS 已允许）
      $('#aeUpload').onchange=async (e)=>{
        const files=e.target.files;
        if(!files || files.length===0) return;
        if(!sb){ alert('⚠️ 无法连接 Supabase 存储，上传失败'); return; }
        // 检查 album.id 是否有效
        if(!album || album.id === undefined || album.id === null){
          alert('⚠️ 当前相册 ID 无效（'+JSON.stringify(album)+'），无法上传。请重新打开相册');
          e.target.value='';
          return;
        }
        const lbl=document.querySelector('label[for=aeUpload],label.editor-btn');
        if(lbl) lbl.textContent='⏳ 上传中…';
        // 先测试连通性
        try{
          var testResp=await fetch(SB_URL+'/rest/v1/',{method:'HEAD',headers:{apikey:SB_KEY}});
          console.log('[upload] Supabase reachable:', testResp.ok);
        }catch(testErr){
          console.warn('[upload] Supabase unreachable:', testErr);
          if(lbl) lbl.textContent='上传照片';
          alert('❌ 无法连接到 Supabase 服务器，请检查网络');
          return;
        }
        let ok=0, fail=0;
        for(const f of files){
          try{
            // 2026-09-12 新增：上传前自动压缩照片
            // 手机原图 3~5MB → 约 300~600KB，肉眼几乎无差别，省 Supabase 免费额度（1GB）
            var upFile = f;
            try{
              if(/^image\//i.test(f.type || '') || /\.(jpe?g|png|webp|heic|heif)$/i.test(f.name)){
                if(lbl) lbl.textContent = '⏳ 压缩 ' + (ok + fail + 1) + '/' + files.length + '…';
                var compressed = await compressImage(f, 1920, 0.85);
                if(compressed && compressed !== f) upFile = compressed;
              }
            }catch(cErr){ console.warn('[upload] compress failed, use original:', cErr); upFile = f; }
            var isCompressed = (upFile !== f);
            var fname = Date.now() + '_' + Math.random().toString(36).slice(2, 6) + '.' +
                        (isCompressed ? 'jpg' : (f.name.split('.').pop() || 'jpg'));
            console.log('[upload] starting', fname, 'orig:', f.size, 'upload:', upFile.size);
            var uploadPromise = sb.storage.from('photos').upload(fname, upFile, {upsert:true});
            // 2026-09-15：同步生成并上传缩略图（thumbs/ 前缀，~400px）。异步执行，失败不影响主上传
            makeThumbBlob(upFile, 400, 0.8).then(function(tb){
              if(tb) return sb.storage.from('photos').upload('thumbs/' + fname, tb, {upsert:true, contentType:'image/jpeg'});
            }).catch(function(e){ console.warn('[thumb] upload failed', e); });
            // 超时按体积动态计算（每 MB 3 秒，最少 30 秒；原来固定 12 秒，大图容易误判失败）
            var toMs = Math.max(30000, Math.ceil(upFile.size / 1048576) * 3000);
            var timeoutPromise = new Promise(function(_,rej){ setTimeout(function(){ rej(new Error('上传超时')); }, toMs); });
            var result=await Promise.race([uploadPromise, timeoutPromise]);
            if(!result || result.error){
              fail++; console.warn('[upload] upload error:', result&&result.error);
              continue;
            }
            console.log('[upload] insert album_photos', {album_id:album.id,filename:f.name,storage_path:fname});
            var insResp = await db().from('album_photos').insert({album_id:album.id, filename:f.name, storage_path:fname, file_size:upFile.size, sort_order:Date.now()}).select();
            console.log('[upload] insert result:', JSON.stringify(insResp));
            if(!insResp || insResp.error || (insResp.data && insResp.data.length===0)){
              fail++; console.warn('[upload] insert failed:', insResp&&insResp.error);
              continue;
            }
            ok++; console.log('[upload] done');
          } catch(err){ fail++; console.warn('[upload] error:', err.message||err); }
        }
        if(lbl) lbl.textContent='上传照片';
        e.target.value='';
        invalidateCache('album');   // 上传后清相册列表缓存（返回时张数正确）
        renderAlbumPhotos(album);
        // 同步刷新主页
        if(window.reloadFromSupabase) setTimeout(function(){ window.reloadFromSupabase(); }, 500);
        if(ok>0 && fail===0){ if(window.toast) toast('✅ '+ok+'张照片上传成功','success'); else alert('✅ '+ok+'张照片上传成功！'); }
        else if(fail>0) alert('上传完成：'+ok+'张成功，'+fail+'张失败（F12看Console详情）');
        else if(ok===0 && fail===0) alert('⚠️ 没有上传任何文件');
      };
    });
  }

  renderList();
  $('#aeNewBtn').onclick=()=>{
    const t=prompt('相册名称:','新相册');if(!t)return;
    db().from('albums').insert({title:t.trim(),sort_order:Date.now()}).then(()=>renderAlbumTab());
  };
}
window.renderAlbumTab=renderAlbumTab;

// ===== 音乐编辑 =====
async function renderMusicTab(){
  const body=$('#editorBody');
  var tracks = await loadTabData('music');
  const list=tracks||[];

  body.innerHTML=`
    <div style="margin-bottom:16px"><label class="editor-btn editor-btn-primary" style="cursor:pointer">上传音乐<input type="file" accept="audio/*" multiple style="display:none" id="meUpload"></label></div>
    <div id="meList"></div>
  `;

  function renderList(){
    const el=$('#meList');
    el.innerHTML=list.map((t,i)=>`
      <div class="editor-list-item" data-idx="${i}" data-id="${t.id}">
        <div class="info"><div class="title">${esc(t.title)}</div><div class="meta">${t.artist||''} · 歌单:${t.album_id||'主页'}</div></div>
        <div class="actions">
          <button class="editor-btn-sm" data-me-move="${i}" data-dir="-1" ${i===0?'disabled':''} title="上移">▲</button>
          <button class="editor-btn-sm" data-me-move="${i}" data-dir="1" ${i===list.length-1?'disabled':''} title="下移">▼</button>
          <button class="editor-btn-sm" data-me-play="${i}">▶</button>
          <button class="editor-btn-sm" data-me-edit="${i}">✎</button>
          <button class="editor-btn-sm del" data-me-del="${i}">🗑</button>
        </div>
      </div>
    `).join('')||'<div class="editor-empty">暂无音乐</div>';

    el.querySelectorAll('[data-me-play]').forEach(b=>b.onclick=()=>{
      const idx = parseInt(b.dataset.mePlay);
      const t = list[idx];
      if(!t){ console.warn('[play] song not found at idx', idx); return; }
      // 编辑器与播放器现在都是 ASC 排序，直接同步播放
      const newPlaylist = list.map(function(tr){ return {
        name: tr.title, title: tr.title, artist: tr.artist||'',
        url: tr.storage_path||'', storage_path: tr.storage_path||'',
      };});
      if(window.setPlaylistTo){
        window.setPlaylistTo(newPlaylist, idx);
      } else {
        console.warn('[play] 网页播放器未就绪，请刷新页面');
      }
    });
    el.querySelectorAll('[data-me-edit]').forEach(b=>b.onclick=()=>{
      const t=list[parseInt(b.dataset.meEdit)];
      const nt=prompt('歌曲名:',t.title);if(!nt)return;
      invalidateCache('music');
      db().from('music').update({title:nt.trim()}).eq('id',t.id).then(()=>renderMusicTab());
    });
    el.querySelectorAll('[data-me-del]').forEach(b=>b.onclick=async ()=>{
      const idx = parseInt(b.dataset.meDel);
      const t = list[idx];
      if(!t || !t.id){ console.warn('[del] song not found or no id'); return; }
      if(!confirm('删除「'+t.title+'」？'))return;
      try{
        // 1. 删 Supabase DB
        const {error} = await sb.from('music').delete().eq('id', t.id);
        if(error){
          console.error('[del] delete failed:', error.message);
          alert('删除失败：' + error.message);
          return;
        }
        // 2. 删 Supabase Storage 里的文件
        if(t.storage_path){
          const sp = (t.storage_path || '').trim();
          // 如果 storage_path 是完整 URL（https://xxx/photos/yyy.mp3），提取文件名
          const objName = sp.includes('photos/') ? sp.split('photos/')[1] : sp;
          sb.storage.from('photos').remove([objName]).catch(()=>{});
        }
        // 3. 歌曲文件在 Supabase storage 里已在上一步删了
        //   （GitHub 仓库里的旧文件不再删——安全起见不携带仓库写权限）
        invalidateCache('music');
        renderMusicTab();
        if(window.reloadFromSupabase) setTimeout(()=>window.reloadFromSupabase(), 500);
      } catch(e){
        console.error('[del] error:', e);
        alert('删除出错：' + e.message);
      }
    });
    // 上下移动
    el.querySelectorAll('[data-me-move]').forEach(b=>b.onclick=async ()=>{
      const i = parseInt(b.dataset.meMove);
      const dir = parseInt(b.dataset.dir);
      const j = i + dir;
      if(j<0 || j>=list.length) return;
      const a = list[i], c = list[j];
      if(!a || !c) return;
      try{
        if(sb){
          await sb.from('music').update({sort_order:j}).eq('id', a.id);
          await sb.from('music').update({sort_order:i}).eq('id', c.id);
        }
        const tmp = list[i]; list[i] = list[j]; list[j] = tmp;
        renderList();
        if(window.reloadFromSupabase) setTimeout(()=>window.reloadFromSupabase(), 1000);
      } catch(err){ console.warn('[music move]', err); }
    });
  }
  renderList();

  // 上传（延迟绑定，等 DOM 就绪）
  setTimeout(()=>{
    const uploadEl = $('#meUpload');
    if(uploadEl) uploadEl.onchange = async (e)=>{
      const files = e.target.files;
      const total = files.length;
      if(!files || files.length===0) return;
      console.log('[music] uploading', total, 'files');
      // 连通性检查
      if(!sb){ alert('⚠️ 无法连接 Supabase 存储，上传失败'); return; }
      try{
        var testResp=await fetch(SB_URL+'/rest/v1/',{method:'HEAD',headers:{apikey:SB_KEY}});
        console.log('[music] Supabase reachable:', testResp.ok);
      }catch(testErr){
        console.warn('[music] Supabase unreachable:', testErr);
        alert('❌ 无法连接到 Supabase 服务器，请检查网络');
        return;
      }
      let okCount = 0, failCount = 0;
      const errors = [];
      for(const f of files){
        const fname = 'music_'+Date.now()+'_'+f.name.replace(/[^a-zA-Z0-9._-]/g,'_');
        console.log('[music] uploading', fname, 'size:', f.size);
        try{
          // 15秒超时
          const upPromise = sb.storage.from('photos').upload(fname, f, {
            upsert: true,
            contentType: f.type || 'audio/mpeg',
            cacheControl: '3600'
          });
          // 2026-09-12：超时改为按体积动态计算（每 MB 3 秒，最少 30 秒；原来固定 15 秒，稍大的歌会误判失败）
          const toMs = Math.max(30000, Math.ceil(f.size / 1048576) * 3000);
          const timeoutPromise = new Promise(function(_,rej){ setTimeout(function(){ rej(new Error('上传超时')); }, toMs); });
          const {error:upErr} = await Promise.race([upPromise, timeoutPromise]);
          if(!upErr){
            // 新音乐放到最前面：全部已有 sort_order +1，新歌 = 0
            try{
              const {data:allMusic} = await sb.from('music').select('id, sort_order');
              if(allMusic && allMusic.length){
                for(var m of allMusic){
                  if(m.sort_order != null) await sb.from('music').update({sort_order: m.sort_order + 1}).eq('id', m.id);
                }
              }
            }catch(e){ console.warn(e); }
            const {error:dbErr} = await sb.from('music').insert({title:f.name.replace(/\.[^.]+$/,''), artist:'', storage_path:fname, sort_order:0, album_id:null});
            if(dbErr){
              failCount++;
              errors.push(f.name + ': DB - ' + dbErr.message);
            } else {
              okCount++;
            }
          } else {
            failCount++;
            errors.push(f.name + ': Storage - ' + (upErr.message||JSON.stringify(upErr)));
          }
        }catch(err){ errors.push(f.name + ': ' + err.message); failCount++; }
      }
      e.target.value = '';
      invalidateCache('music');   // 上传后清缓存，立即显示新歌
      renderMusicTab();
      if(window.reloadFromSupabase) setTimeout(()=>window.reloadFromSupabase(), 2000);
      if(total > 0){
        const msg = '上传完成：'+okCount+' 首成功'+(failCount > 0 ? '，'+failCount+' 首失败\n\n错误：\n' + errors.join('\n') : '');
        alert(msg);
      }
    };
  }, 200);
}
window.renderMusicTab=renderMusicTab;

// ===== 主渲染分发 =====
// ===== 「动态」帖子（2026-09-11 新增）=====
var _postDraft = { images: [], existing: [], music: null, musicKeep: null, musicKeepTitle: null, editingId: null };

// 图片压缩：最大边 1600px、质量 0.82（手机照片 3~5MB → 约 200~400KB）
function compressImage(file, maxSide, quality){
  return new Promise(function(resolve){
    var url = null;
    try{
      url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function(){
        try{
          var w = img.naturalWidth, h = img.naturalHeight;
          var longSide = Math.max(w, h);
          var sizeKB = (file.size || 0) / 1024;

          // ===== 2026-09-14 按原图大小分级：小图温柔、大图下手重 =====
          var targetSide = maxSide || 1600;
          var q = quality || 0.85;

          if(longSide <= 1280 && sizeKB <= 400){
            // ① 本来就小 → 原样上传，不损失画质
            if(url) URL.revokeObjectURL(url);
            resolve(file);
            return;
          }
          if(longSide <= 2000 && sizeKB <= 1200){
            // ② 中等 → 温柔处理（少缩、质量高）
            targetSide = Math.max(targetSide, 1800);
            q = Math.max(q, 0.92);
          }else if(longSide > 4000 || sizeKB > 4000){
            // ④ 超大（相机原片）→ 下手重一点，省额度
            q = Math.min(q, 0.8);
          }
          // ③ 其余走调用方给的标准参数

          var scale = Math.min(1, targetSide / longSide);
          var cw = Math.round(w * scale), ch = Math.round(h * scale);
          var cv = document.createElement('canvas');
          cv.width = cw; cv.height = ch;
          cv.getContext('2d').drawImage(img, 0, 0, cw, ch);
          if(url) URL.revokeObjectURL(url);
          // PNG 保持 PNG（避免丢透明/变糊），其余用 JPEG
          var isPng = /png/i.test(file.type || '') || /\.png$/i.test(file.name || '');
          cv.toBlob(function(blob){
            if(blob && blob.size && blob.size < file.size) resolve(blob);
            else resolve(file);   // 压完反而更大 → 用原图
          }, isPng ? 'image/png' : 'image/jpeg', q);
        }catch(e){ if(url) URL.revokeObjectURL(url); resolve(file); }
      };
      img.onerror = function(){ if(url) URL.revokeObjectURL(url); resolve(file); };
      img.src = url;
    }catch(e){ resolve(file); }
  });
}

function _postStatus(msg, color){
  var el = document.getElementById('postStatus');
  if(el){ el.textContent = msg || ''; el.style.color = color || 'var(--text-muted)'; }
}

async function uploadToStorage(path, blobOrFile){
  var up = sb.storage.from('photos').upload(path, blobOrFile, {upsert: true, contentType: blobOrFile.type || undefined});
  var to = new Promise(function(_, rej){ setTimeout(function(){ rej(new Error('上传超时')); }, 45000); });
  var r = await Promise.race([up, to]);
  if(!r || r.error) throw new Error((r && r.error && r.error.message) || '上传失败');
  return path;
}

function _storageUrl(p){
  if(!p) return '';
  return /^https?:/i.test(p) ? p : (STORAGE_URL + '/' + p);
}

function renderPostAttachments(){
  var box = document.getElementById('postAttachments');
  if(!box) return;
  var ex = _postDraft.existing || [];
  var html = '';
  if(ex.length || _postDraft.images.length){
    html += '<div style="display:flex;gap:6px;flex-wrap:wrap">';
    html += ex.map(function(p, i){
      return '<div style="position:relative;width:64px;height:64px;border-radius:8px;overflow:hidden;border:1px solid var(--border)">' +
        '<img src="' + _storageUrl(p) + '" style="width:100%;height:100%;object-fit:cover">' +
        '<button data-rm-ex="' + i + '" title="移除这张" style="position:absolute;top:2px;right:2px;width:18px;height:18px;border-radius:50%;background:rgba(0,0,0,.7);color:#fff;font-size:.7rem;line-height:1;display:flex;align-items:center;justify-content:center">×</button>' +
      '</div>';
    }).join('');
    html += _postDraft.images.map(function(it, i){
      return '<div style="position:relative;width:64px;height:64px;border-radius:8px;overflow:hidden;border:1px solid var(--accent)">' +
        '<img src="' + it.preview + '" style="width:100%;height:100%;object-fit:cover">' +
        '<button data-rm-img="' + i + '" title="移除这张" style="position:absolute;top:2px;right:2px;width:18px;height:18px;border-radius:50%;background:rgba(0,0,0,.7);color:#fff;font-size:.7rem;line-height:1;display:flex;align-items:center;justify-content:center">×</button>' +
      '</div>';
    }).join('');
    html += '</div>';
  }
  if(_postDraft.music){
    html += '<div style="margin-top:8px;display:flex;align-items:center;gap:8px;font-size:.8rem;color:var(--text-dim)">' +
      '🎵 ' + _postDraft.music.name + ' <span style="color:var(--accent);font-size:.72rem">(新)</span>' +
      '<button data-rm-music="1" style="color:var(--danger);font-size:.75rem">移除</button></div>';
  } else if(_postDraft.musicKeep){
    html += '<div style="margin-top:8px;display:flex;align-items:center;gap:8px;font-size:.8rem;color:var(--text-dim)">' +
      '🎵 ' + (_postDraft.musicKeepTitle || '已有音乐') +
      '<button data-rm-music="1" style="color:var(--danger);font-size:.75rem">移除</button></div>';
  }
  box.innerHTML = html;
  box.querySelectorAll('[data-rm-img]').forEach(function(b){
    b.onclick = function(){ _postDraft.images.splice(parseInt(b.getAttribute('data-rm-img')), 1); renderPostAttachments(); };
  });
  box.querySelectorAll('[data-rm-ex]').forEach(function(b){
    b.onclick = function(){ _postDraft.existing.splice(parseInt(b.getAttribute('data-rm-ex')), 1); renderPostAttachments(); };
  });
  box.querySelectorAll('[data-rm-music]').forEach(function(b){
    b.onclick = function(){ _postDraft.music = null; _postDraft.musicKeep = null; _postDraft.musicKeepTitle = null; renderPostAttachments(); };
  });
}

function renderPostOldList(posts){
  var el = document.getElementById('postOldList');
  if(!el) return;
  var list = posts || [];
  if(!list.length){
    el.innerHTML = '<div style="font-size:.82rem;color:var(--text-muted);padding:10px 0">还没有博客，写第一篇吧</div>';
    return;
  }
  el.innerHTML = list.map(function(p){
    var t = new Date(p.created_at);
    var ts = isNaN(t.getTime()) ? '' :
      (t.getFullYear() + '年' + (t.getMonth() + 1) + '月' + t.getDate() + '日 ' +
       ('0' + t.getHours()).slice(-2) + ':' + ('0' + t.getMinutes()).slice(-2));
    var title = (p.title || '').trim();
    var txt = (p.content || '').replace(/\s+/g, ' ').slice(0, 40);
    var cnt = (p.images && p.images.length) ? ' 🖼' + p.images.length : '';
    if(p.music_path) cnt += ' 🎵';
    var extra = [p.mood, p.weather, p.location].filter(Boolean).join(' · ');
    // 有标题 → 主行显示标题（醒目），下面小字跟正文摘要；无标题 → 只显示摘要
    var mainLine = title
      ? ('<div style="font-size:.93rem;color:var(--text);font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(title) + cnt + '</div>' +
         (txt ? '<div style="font-size:.74rem;color:var(--text-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-top:3px">' + esc(txt) + '…</div>' : ''))
      : ('<div style="font-size:.86rem;color:var(--text-dim);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + (esc(txt) || '（无文字）') + cnt + '</div>');
    return '<div style="display:flex;gap:10px;align-items:center;padding:9px 0;border-bottom:1px solid var(--border)">' +
      '<div style="flex:1;min-width:0">' +
        '<div style="font-size:.72rem;color:var(--text-muted);margin-bottom:3px">' + ts + '</div>' +
        mainLine +
        (extra ? '<div style="font-size:.7rem;color:var(--text-muted);margin-top:3px">' + extra + '</div>' : '') +
      '</div>' +
      '<div style="display:flex;gap:6px;flex-shrink:0">' +
        '<button class="editor-btn-sm" data-edit-post="' + p.id + '">编辑</button>' +
        '<button class="editor-btn-sm" data-del-post="' + p.id + '">删除</button>' +
      '</div>' +
    '</div>';
  }).join('');
  el.querySelectorAll('[data-edit-post]').forEach(function(b){
    b.onclick = function(){
      var id = b.getAttribute('data-edit-post');
      var p = list.filter(function(x){ return String(x.id) === String(id); })[0];
      if(p) startEditPost(p);
    };
  });
  el.querySelectorAll('[data-del-post]').forEach(function(b){
    b.onclick = async function(){
      var id = b.getAttribute('data-del-post');
      if(!confirm('确定删除这篇博客吗？（不可恢复）')) return;
      b.textContent = '…';
      var p = (list.filter(function(x){ return String(x.id) === String(id); })[0]) || {};
      try{
        await db().from('posts').delete().eq('id', id);
        // 顺手清理存储里的附件
        var rm = [];
        (p.images || []).forEach(function(x){ rm.push(x); });
        if(p.music_path) rm.push(p.music_path);
        if(rm.length && sb) sb.storage.from('photos').remove(rm).catch(function(){});
        invalidateCache('post');
        renderTab();
      }catch(e){ b.textContent = '删除'; alert('删除失败：' + e.message); }
    };
  });
}

// 进入编辑模式（2026-09-12 新增）
function startEditPost(p){
  _postDraft = {
    images: [],
    videos: [],
    music: null,
    musicKeep: p.music_path || null,
    musicKeepTitle: p.music_title || '已有音乐',
    editingId: p.id
  };
  var art = pbArticleFromPost(p);
  _postDraft.images = art.images;
  _postDraft.videos = art.videos;
  pbRenderVideoList();
  var ti0 = document.getElementById('postTitle'); if(ti0) ti0.value = p.title || '';
  var ta = document.getElementById('postText');
  if(ta) ta.value = art.text;
  pbRenderImgList();
  var m = document.getElementById('postMood');       if(m) m.value = p.mood || '';
  var w = document.getElementById('postWeather');    if(w) w.value = p.weather || '';
  var l = document.getElementById('postLocation');   if(l) l.value = p.location || '';
  var btn = document.getElementById('postPublish');
  if(btn) btn.textContent = '保存修改';
  var bar = document.getElementById('postEditBar');
  if(bar){
    bar.style.display = 'flex';
    var info = bar.querySelector('.post-edit-info');
    if(info) info.textContent = '正在编辑：' + ((p.content || '（无文字）').replace(/\s+/g,' ').slice(0, 20));
  }
  var mp = document.getElementById('postMusicPreview');
  if(mp){
    mp.innerHTML = _postDraft.musicKeep
      ? '<div style="font-size:.8rem;color:var(--text-dim)">🎵 ' + esc(_postDraft.musicKeepTitle || '已有音乐') + ' <button type="button" id="postRmMusic" style="color:var(--danger);font-size:.75rem">移除</button></div>'
      : '';
    var rm = document.getElementById('postRmMusic');
    if(rm) rm.onclick = function(){ _postDraft.musicKeep = null; _postDraft.musicKeepTitle = null; mp.innerHTML = ''; };
  }
  var body = document.getElementById('editorBody');
  if(body) body.scrollTop = 0;
  _postStatus('改完点「保存修改」', 'var(--accent)');
}

// 取消编辑，回到新建模式
function cancelEditPost(){
  _postDraft = { images: [], videos: [], music: null, musicKeep: null, musicKeepTitle: null, editingId: null };
  var tiC = document.getElementById('postTitle'); if(tiC) tiC.value = '';
  var ta = document.getElementById('postText'); if(ta) ta.value = '';
  pbRenderImgList();
  pbRenderVideoList();
  ['postMood','postWeather','postLocation'].forEach(function(id){
    var e = document.getElementById(id); if(e) e.value = '';
  });
  var btn = document.getElementById('postPublish'); if(btn) btn.textContent = '发布';
  var bar = document.getElementById('postEditBar'); if(bar) bar.style.display = 'none';
  var mp = document.getElementById('postMusicPreview'); if(mp) mp.innerHTML = '';
  _postStatus('');
}

// ===== 块式图文编辑（2026-09-14 新增，参考 thelongestway.com 杂志式排版）=====
// 块类型：p=段落 / img=图片(可带说明) / h=小标题
var _postBlocks = [];
var _pbPickIndex = -1;

function postBlocksInit(p){
  _postBlocks = [];
  if(p && p.blocks && p.blocks.length){
    _postBlocks = JSON.parse(JSON.stringify(p.blocks)).map(function(b){
      if(b.t === 'img' && b.src) b.url = _storageUrl(b.src);
      return b;
    });
  }else if(p){
    // 旧数据兼容：content → 段落块，images → 图片块
    if(p.content) _postBlocks.push({t:'p', text:p.content});
    (p.images || []).forEach(function(s){ _postBlocks.push({t:'img', src:s, url:_storageUrl(s), cap:''}); });
  }
  if(!_postBlocks.length) _postBlocks.push({t:'p', text:''});
}

function postBlocksCollect(){
  var wrap = document.getElementById('postBlocks');
  if(!wrap) return;
  wrap.querySelectorAll('.pb-item').forEach(function(el){
    var i = +el.getAttribute('data-i'); var b = _postBlocks[i]; if(!b) return;
    if(b.t === 'p'){ var ta = el.querySelector('textarea'); if(ta) b.text = ta.value; }
    else if(b.t === 'h'){ var inp = el.querySelector('input.pb-heading'); if(inp) b.text = inp.value; }
    else if(b.t === 'img'){ var ci = el.querySelector('input.pb-cap'); if(ci) b.cap = ci.value; }
  });
}

function postBlocksRender(){
  var wrap = document.getElementById('postBlocks');
  if(!wrap) return;
  wrap.innerHTML = _postBlocks.map(function(b, i){
    var bar = '<div class="pb-bar"><span class="pb-type">' +
      (b.t === 'p' ? '段落' : b.t === 'h' ? '小标题' : '图片') + '</span>' +
      '<span class="pb-ops">' +
      '<button type="button" class="pb-op" data-op="up" data-i="' + i + '" title="上移">↑</button>' +
      '<button type="button" class="pb-op" data-op="down" data-i="' + i + '" title="下移">↓</button>' +
      '<button type="button" class="pb-op pb-op-del" data-op="del" data-i="' + i + '" title="删除">×</button>' +
      '</span></div>';
    if(b.t === 'p'){
      return '<div class="pb-item" data-i="' + i + '" data-t="p">' + bar +
        '<textarea class="pb-text" rows="3" placeholder="写一段文字…">' + esc(b.text || '') + '</textarea></div>';
    }
    if(b.t === 'h'){
      return '<div class="pb-item pb-item-h" data-i="' + i + '" data-t="h">' + bar +
        '<input class="pb-heading" placeholder="小标题，例如：它是什么" value="' + esc(b.text || '') + '"></div>';
    }
    var img = b.preview || b.url || '';
    return '<div class="pb-item pb-item-img" data-i="' + i + '" data-t="img">' + bar +
      (img ? '<img class="pb-thumb" src="' + img + '" alt="">'
           : '<button type="button" class="pb-pick" data-i="' + i + '">点击选择图片</button>') +
      '<input class="pb-cap" placeholder="图片说明（可留空）" value="' + esc(b.cap || '') + '"></div>';
  }).join('');
  postBlocksBind();
}

function postBlocksBind(){
  var wrap = document.getElementById('postBlocks');
  if(!wrap) return;
  wrap.querySelectorAll('.pb-op').forEach(function(btn){
    btn.onclick = function(){
      postBlocksCollect();
      var i = +btn.getAttribute('data-i'), op = btn.getAttribute('data-op');
      if(op === 'del'){
        _postBlocks.splice(i, 1);
        if(!_postBlocks.length) _postBlocks.push({t:'p', text:''});
      }else if(op === 'up' && i > 0){
        var t1 = _postBlocks[i-1]; _postBlocks[i-1] = _postBlocks[i]; _postBlocks[i] = t1;
      }else if(op === 'down' && i < _postBlocks.length - 1){
        var t2 = _postBlocks[i+1]; _postBlocks[i+1] = _postBlocks[i]; _postBlocks[i] = t2;
      }
      postBlocksRender();
    };
  });
  function pickImage(i){
    postBlocksCollect();
    _pbPickIndex = i;
    var inp = document.getElementById('postImgInput');
    if(inp){ inp.value = ''; inp.click(); }
  }
  wrap.querySelectorAll('.pb-pick').forEach(function(btn){
    btn.onclick = function(){ pickImage(+btn.getAttribute('data-i')); };
  });
  wrap.querySelectorAll('.pb-thumb').forEach(function(im){
    im.onclick = function(){
      var el = im.closest('.pb-item');
      if(el) pickImage(+el.getAttribute('data-i'));
    };
  });
}

function postBlocksAdd(t){
  postBlocksCollect();
  _postBlocks.push(t === 'img' ? {t:'img', src:'', cap:''} : {t:t, text:''});
  postBlocksRender();
  if(t !== 'img'){
    var items = document.querySelectorAll('#postBlocks .pb-item');
    var last = items[items.length - 1];
    if(last){ var f = last.querySelector('textarea,input'); if(f) f.focus(); }
  }
}

// ===== 文章式编辑（2026-09-14 简化版）：一个大文本框 + 在光标处插入照片 =====
// 文本里用 [照片1] [照片2] 标记图片位置，发布时解析成 blocks 存储（前端仍按 blocks 渲染）
function pbInsertAtCursor(ta, str){
  if(!ta) return;
  var s = ta.selectionStart || 0, e = ta.selectionEnd || 0;
  var v = ta.value;
  ta.value = v.slice(0, s) + str + v.slice(e);
  var pos = s + str.length;
  try{ ta.selectionStart = ta.selectionEnd = pos; }catch(err){}
  ta.focus();
}

function pbRenderImgList(){
  var box = document.getElementById('postImgList');
  if(!box) return;
  var imgs = _postDraft.images || [];
  if(!imgs.length){ box.innerHTML = ''; return; }
  box.innerHTML = '<div style="font-size:.78rem;color:var(--text-muted);margin-bottom:6px">文中已插入的照片（可填说明）</div>' +
    imgs.map(function(it, i){
      return '<div class="pi-row">' +
        '<img class="pi-thumb" src="' + it.preview + '" alt="">' +
        '<div class="pi-info">' +
          '<div class="pi-name">照片' + (i + 1) + '<span class="pi-file">' + esc(it.name || '') + '</span></div>' +
          '<input class="pi-cap" data-cap="' + i + '" placeholder="照片说明（可留空）" value="' + esc(it.cap || '') + '">' +
        '</div>' +
        '<button type="button" class="pb-op pb-op-del" data-rm="' + i + '" title="移除这张">×</button>' +
      '</div>';
    }).join('');
  box.querySelectorAll('[data-cap]').forEach(function(inp){
    inp.oninput = function(){
      var i = +inp.getAttribute('data-cap');
      if(_postDraft.images[i]) _postDraft.images[i].cap = inp.value;
      pbSaveDraftSoon();
    };
  });
  box.querySelectorAll('[data-rm]').forEach(function(btn){
    btn.onclick = function(){
      var i = +btn.getAttribute('data-rm');
      var ta = document.getElementById('postText');
      var cur = ta ? ta.value : '';
      var parts = cur.split(/\[照片\d+\]/);
      var order = (cur.match(/\[照片(\d+)\]/g) || []).map(function(s){ return parseInt(s.match(/\d+/)[0], 10); });
      _postDraft.images.splice(i, 1);
      var newOrder = order.filter(function(n){ return n !== (i + 1); });
      if(newOrder.length !== order.length - 1){
        // 该照片没有在文中插过，只需重排剩余
        newOrder = order.filter(function(_, k){ return k !== i; });
      }
      var out = parts[0] || '';
      newOrder.forEach(function(oldN, k){ out += '[照片' + (k + 1) + ']' + (parts[k + 1] || ''); });
      if(ta) ta.value = out;
      pbRenderImgList();
      _postStatus('已移除照片');
    };
  });
}

// ===== 视频（2026-09-15）：粘贴链接即可，不占 Supabase 空间 =====
function pbRenderVideoList(){
  var box = document.getElementById('postVideoList');
  if(!box) return;
  var vids = _postDraft.videos || [];
  if(!vids.length){ box.innerHTML = ''; return; }
  box.innerHTML = '<div style="font-size:.78rem;color:var(--text-muted);margin-bottom:6px">文中已插入的视频</div>' +
    vids.map(function(v, i){
      var tag = v.kind === 'direct' ? '视频直链' : (v.kind === 'youtube' ? 'YouTube 播放器' : 'B站播放器');
      return '<div class="pi-row">' +
        '<div class="pi-info">' +
          '<div class="pi-name">视频' + (i + 1) + '<span class="pi-file">' + tag + '</span></div>' +
          '<div style="font-size:.72rem;color:var(--text-muted);word-break:break-all;line-height:1.5">' + esc(v.src) + '</div>' +
        '</div>' +
        '<button type="button" class="pb-op pb-op-del" data-rmv="' + i + '" title="移除">×</button>' +
      '</div>';
    }).join('');
  box.querySelectorAll('[data-rmv]').forEach(function(btn){
    btn.onclick = function(){
      var i = +btn.getAttribute('data-rmv');
      var ta = document.getElementById('postText');
      var cur = ta ? ta.value : '';
      var parts = cur.split(/\[视频\d+\]/);
      var order = (cur.match(/\[视频(\d+)\]/g) || []).map(function(s){ return parseInt(s.match(/\d+/)[0], 10); });
      (_postDraft.videos || []).splice(i, 1);
      var newOrder = order.filter(function(_, k){ return k !== i; });
      var out = parts[0] || '';
      newOrder.forEach(function(oldN, k){ out += '[视频' + (k + 1) + ']' + (parts[k + 1] || ''); });
      if(ta) ta.value = out;
      pbRenderVideoList();
      pbSaveDraftSoon();
      _postStatus('已移除视频');
    };
  });
}

// 识别链接类型（2026-09-15 扩展多平台）
function pbVideoKind(url){
  var u = String(url || '').trim();
  if(/youtube\.com\/(watch|shorts)|youtu\.be\//i.test(u)) return 'youtube';
  if(/bilibili\.com\/video\/|b23\.tv\//i.test(u)) return 'bilibili';
  if(/vimeo\.com\//i.test(u)) return 'vimeo';
  if(/v\.qq\.com\//i.test(u)) return 'qq';
  if(/youku\.com\//i.test(u)) return 'youku';
  if(/iqiyi\.com\//i.test(u)) return 'iqiyi';
  if(/ixigua\.com\//i.test(u)) return 'ixigua';
  if(/weibo\.com\/|weibo\.cn\//i.test(u)) return 'weibo';
  if(/\.(mp4|webm|ogv|m4v|mov)(\?|$)/i.test(u)) return 'direct';
  if(/^<iframe/i.test(u)) return 'iframe';
  return 'direct';
}

// 各平台链接 → 可嵌入的播放器地址
function pbVideoEmbedUrl(url){
  var u = String(url || '').trim(), m;
  // YouTube
  if((m = u.match(/youtube\.com\/watch\?v=([\w-]+)/i)) || (m = u.match(/youtu\.be\/([\w-]+)/i))){
    return 'https://www.youtube.com/embed/' + m[1];
  }
  if((m = u.match(/youtube\.com\/shorts\/([\w-]+)/i))){
    return 'https://www.youtube.com/embed/' + m[1];
  }
  // B站
  if((m = u.match(/bilibili\.com\/video\/(BV[\w]+)/i)) || (m = u.match(/b23\.tv\/(BV[\w]+)/i))){
    return 'https://player.bilibili.com/player.html?bvid=' + m[1] + '&autoplay=0&high_quality=1';
  }
  // Vimeo
  if((m = u.match(/vimeo\.com\/(?:video\/)?(\d+)/i))){
    return 'https://player.vimeo.com/video/' + m[1];
  }
  // 腾讯视频
  if((m = u.match(/v\.qq\.com\/x\/cover\/[^/]+\/([\w]+)\.html/i)) || (m = u.match(/v\.qq\.com\/x\/page\/([\w]+)\.html/i))){
    return 'https://v.qq.com/txp/iframe/player.html?vid=' + m[1];
  }
  // 优酷
  if((m = u.match(/youku\.com\/v_show\/id_([\w=]+)\.html/i))){
    return 'https://player.youku.com/embed/' + m[1];
  }
  // 爱奇艺
  if((m = u.match(/iqiyi\.com\/v_([\w]+)\.html/i))){
    return 'https://open.iqiyi.com/developer/player_js/coopPlayerIndex.html?vid=' + m[1];
  }
  // 西瓜视频
  if((m = u.match(/ixigua\.com\/(\d+)/i))){
    return 'https://www.ixigua.com/iframe/' + m[1];
  }
  // 微博视频
  if((m = u.match(/weibo\.(?:com|cn)\/(?:tv\/show\/|detail\/|[^/]+\/[^/]+\/)([\w:]+)/i))){
    return 'https://weibo.com/tv/show/' + m[1];
  }
  // 直接粘的 iframe 代码 → 抠出 src
  if(/^<iframe/i.test(u)){
    var s = u.match(/src\s*=\s*["']([^"']+)["']/i);
    if(s) return s[1];
  }
  return u;
}

function pbParseArticle(text, images, videos){
  var blocks = [];
  // 同时匹配 [照片N] 与 [视频N]，按出现顺序切分（2026-09-15 支持视频）
  var re = /\[(照片|视频)(\d+)\]/g;
  var last = 0, m;
  while((m = re.exec(text)) !== null){
    var before = text.slice(last, m.index).trim();
    if(before) blocks.push({t:'p', text:before});
    var idx = parseInt(m[2], 10) - 1;
    if(m[1] === '照片'){
      var im = images[idx];
      if(im) blocks.push({t:'img', _idx: idx, cap: (im.cap || '').trim()});
    }else{
      var vd = (videos || [])[idx];
      if(vd) blocks.push({t:'video', _vidx: idx});
    }
    last = m.index + m[0].length;
  }
  var after = text.slice(last).trim();
  if(after) blocks.push({t:'p', text:after});
  return blocks;
}

function pbArticleFromPost(p){
  var text = '', images = [], videos = [];
  var blocks = (p && p.blocks && p.blocks.length) ? p.blocks : [];
  if(!blocks.length && p){
    if(p.content) blocks.push({t:'p', text:p.content});
    (p.images || []).forEach(function(s){ blocks.push({t:'img', src:s, cap:''}); });
  }
  blocks.forEach(function(b){
    if(b.t === 'img' && b.src){
      images.push({ src: b.src, preview: _storageUrl(b.src), cap: b.cap || '', name: '' });
      text += '[照片' + images.length + ']';
    }else if(b.t === 'video' && b.src){
      videos.push({ src: b.src, kind: b.kind || pbVideoKind(b.src), embed: b.embed || pbVideoEmbedUrl(b.src) });
      text += '[视频' + videos.length + ']';
    }else if(b.t !== 'img' && b.t !== 'video'){
      text += (text && !/\n$/.test(text) ? '\n\n' : '') + (b.text || '');
    }
  });
  return { text: text, images: images, videos: videos };
}

// 生成缩略图 Blob（2026-09-15）：上传照片时同步生成 ~400px 小图，列表/网格加载更快
function makeThumbBlob(fileOrBlob, maxSide, quality){
  return new Promise(function(resolve){
    try{
      var url = URL.createObjectURL(fileOrBlob);
      var img = new Image();
      img.onload = function(){
        try{
          var w = img.naturalWidth, h = img.naturalHeight;
          var scale = Math.min(1, (maxSide || 400) / Math.max(w, h));
          var cw = Math.max(1, Math.round(w * scale));
          var ch = Math.max(1, Math.round(h * scale));
          var cv = document.createElement('canvas');
          cv.width = cw; cv.height = ch;
          cv.getContext('2d').drawImage(img, 0, 0, cw, ch);
          URL.revokeObjectURL(url);
          cv.toBlob(function(b){ resolve(b); }, 'image/jpeg', quality || 0.8);
        }catch(e){ try{ URL.revokeObjectURL(url); }catch(_){} resolve(null); }
      };
      img.onerror = function(){ try{ URL.revokeObjectURL(url); }catch(_){} resolve(null); };
      img.src = url;
    }catch(e){ resolve(null); }
  });
}

// ===== 音频转 MP3（2026-09-15）=====
// 背景：用户上传的 WAV 是无压缩格式（6.9MB 仅约 40 秒），浏览器流式播放支持差 → 卡顿
// 处理：非 mp3/m4a/aac/ogg 的音频 → 浏览器内转成 128kbps MP3 再上传（体积约缩到 1/6）
function pAudioNeedsConvert(file){
  var name = (file.name || '').toLowerCase();
  var type = (file.type || '').toLowerCase();
  if(/\.(mp3|m4a|aac|ogg|opus)$/.test(name)) return false;
  if(/audio\/(mpeg|mp4|aac|ogg|opus)/.test(type)) return false;
  return true;   // wav / flac / 其他 → 需要转
}

function pConvertToMp3(file, onProgress){
  return new Promise(function(resolve, reject){
    if(typeof lamejs === 'undefined'){ reject(new Error('转码组件未加载')); return; }
    var AC = window.AudioContext || window.webkitAudioContext;
    if(!AC){ reject(new Error('浏览器不支持音频转码')); return; }
    file.arrayBuffer().then(function(buf){
      var ctx = new AC();
      var done = false;
      function finish(fn, arg){ if(!done){ done = true; try{ ctx.close(); }catch(e){} fn(arg); } }
      ctx.decodeAudioData(buf, function(audioBuf){
        try{
          var ch = Math.min(2, audioBuf.numberOfChannels);
          var sr = audioBuf.sampleRate;
          var enc = new lamejs.Mp3Encoder(ch, sr, 128);
          var L = audioBuf.getChannelData(0);
          var R = ch > 1 ? audioBuf.getChannelData(1) : null;
          var n = L.length;
          var l16 = new Int16Array(n), r16 = R ? new Int16Array(n) : null;
          for(var i = 0; i < n; i++){
            l16[i] = Math.max(-1, Math.min(1, L[i])) * 0x7FFF;
            if(r16) r16[i] = Math.max(-1, Math.min(1, R[i])) * 0x7FFF;
          }
          var chunks = [];
          var BS = 1152 * 20;
          for(var k = 0; k < n; k += BS){
            var lb = l16.subarray(k, k + BS);
            var rb = r16 ? r16.subarray(k, k + BS) : null;
            var m = rb ? enc.encodeBuffer(lb, rb) : enc.encodeBuffer(lb);
            if(m.length) chunks.push(new Int8Array(m));
            if(onProgress && (k % (BS * 20) === 0)){ try{ onProgress(Math.min(99, Math.round(k / n * 100))); }catch(e){} }
          }
          var tail = enc.flush();
          if(tail.length) chunks.push(new Int8Array(tail));
          if(onProgress){ try{ onProgress(100); }catch(e){} }
          finish(resolve, new Blob(chunks, {type:'audio/mpeg'}));
        }catch(err){ finish(reject, err); }
      }, function(err){ finish(reject, err || new Error('音频解码失败')); });
    }).catch(function(e){ reject(e); });
  });
}

// ===== 草稿自动保存（2026-09-14）：防止手机选图后页面被系统重载导致内容丢失 =====
var _PB_DRAFT_KEY = 'memories.post_draft';
var _pbDraftTimer = null;

function pbSaveDraft(){
  try{
    var ta = document.getElementById('postText');
    var moodEl = document.getElementById('postMood');
    var weaEl = document.getElementById('postWeather');
    var locEl = document.getElementById('postLocation');
    var d = {
      title: (document.getElementById('postTitle') || {}).value || '',
      text: ta ? ta.value : '',
      images: (_postDraft.images || []).map(function(it){
        return { path: it.path || '', src: it.src || '', cap: it.cap || '', name: it.name || '' };
      }),
      videos: (_postDraft.videos || []).map(function(v){
        return { src: v.src || '', kind: v.kind || '', embed: v.embed || '' };
      }),
      musicPath: _postDraft.musicKeep || null,
      musicTitle: _postDraft.musicKeepTitle || null,
      mood: moodEl ? moodEl.value : '',
      weather: weaEl ? weaEl.value : '',
      location: locEl ? locEl.value : '',
      editingId: _postDraft.editingId || null,
      savedAt: Date.now()
    };
    var hasAny = (d.text && d.text.trim()) || d.images.length || d.musicPath;
    if(!hasAny){ localStorage.removeItem(_PB_DRAFT_KEY); return; }
    localStorage.setItem(_PB_DRAFT_KEY, JSON.stringify(d));
  }catch(e){}
}

function pbSaveDraftSoon(){
  if(_pbDraftTimer) clearTimeout(_pbDraftTimer);
  _pbDraftTimer = setTimeout(pbSaveDraft, 700);
}

function pbLoadDraft(){
  try{
    var raw = localStorage.getItem(_PB_DRAFT_KEY);
    if(!raw) return null;
    var d = JSON.parse(raw);
    if(!d) return null;
    if(!(d.text && d.text.trim()) && !(d.images || []).length) return null;
    return d;
  }catch(e){ return null; }
}

function pbClearDraft(){
  try{ localStorage.removeItem(_PB_DRAFT_KEY); }catch(e){}
}

function pbRestoreDraft(d){
  if(!d) return;
  _postDraft.editingId = d.editingId || null;
  _postDraft.musicKeep = d.musicPath || null;
  _postDraft.musicKeepTitle = d.musicTitle || null;
  _postDraft.images = (d.images || []).map(function(it){
    return {
      path: it.path || '', src: it.src || '', cap: it.cap || '', name: it.name || '',
      preview: _storageUrl(it.path || it.src || '')
    };
  });
  _postDraft.videos = (d.videos || []).map(function(v){
    return { src: v.src || '', kind: v.kind || pbVideoKind(v.src), embed: v.embed || pbVideoEmbedUrl(v.src) };
  });
  pbRenderVideoList();
  var tiR = document.getElementById('postTitle'); if(tiR) tiR.value = d.title || '';
  var ta = document.getElementById('postText'); if(ta) ta.value = d.text || '';
  var m = document.getElementById('postMood');    if(m) m.value = d.mood || '';
  var w = document.getElementById('postWeather'); if(w) w.value = d.weather || '';
  var l = document.getElementById('postLocation');if(l) l.value = d.location || '';
  pbRenderImgList();
}

async function renderPostTab(){
  const body = $('#editorBody');
  const posts = await loadTabData('post');
  _postDraft = { images: [], existing: [], videos: [], music: null, musicKeep: null, musicKeepTitle: null, editingId: null };

  body.innerHTML = `
    <div>
      <div id="postEditBar" style="display:none;align-items:center;gap:10px;padding:9px 12px;margin-bottom:10px;background:var(--accent-glow);border:1px solid var(--accent);border-radius:10px;font-size:.8rem">
        <span class="post-edit-info" style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--text)"></span>
        <button id="postCancelEdit" class="editor-btn-sm" style="flex-shrink:0">取消编辑</button>
      </div>
      <input id="postTitle" class="post-title-input" placeholder="标题">
      <textarea id="postText" rows="12"></textarea>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;align-items:center">
        <button type="button" class="editor-btn editor-btn-secondary" id="postInsertImg">🖼 插入照片</button>
        <button type="button" class="editor-btn editor-btn-secondary" id="postInsertVideo">🎬 插入视频</button>
        <label class="editor-btn editor-btn-secondary" style="cursor:pointer">🎵 加音乐
          <input type="file" accept="audio/*" style="display:none" id="postMusicInput"></label>
        <input type="file" accept="image/*" style="display:none" id="postImgInput">
      </div>
      <div id="postMusicPreview" style="margin-top:8px"></div>
      <div id="postImgList" style="margin-top:12px"></div>
      <div id="postVideoList" style="margin-top:10px"></div>
      <button class="editor-btn editor-btn-primary" id="postPublish" style="width:100%;margin-top:12px">发布</button>
      <div id="postStatus" style="font-size:.78rem;color:var(--text-muted);margin-top:8px;text-align:center"></div>
    </div>
    <div style="border-top:1px solid var(--border);margin-top:16px;padding-top:14px">
      <div style="font-size:.8rem;color:var(--text-muted);margin-bottom:8px">已发布 ${(posts||[]).length} 条</div>
      <div id="postOldList"></div>
    </div>
  `;
  var _pbCaret = null;
  var insertBtn = document.getElementById('postInsertImg');
  if(insertBtn){
    insertBtn.onclick = function(){
      var ta = document.getElementById('postText');
      _pbCaret = ta ? (ta.selectionStart || 0) : null;
      var inp = document.getElementById('postImgInput');
      if(inp){ inp.value = ''; inp.click(); }
    };
  }
  // 插入视频（2026-09-15）：粘贴链接即可，不占存储空间
  var insertVidBtn = document.getElementById('postInsertVideo');
  if(insertVidBtn){
    insertVidBtn.onclick = function(){
      var ta = document.getElementById('postText');
      _pbCaret = ta ? (ta.selectionStart || 0) : null;
      var url = prompt('粘贴视频链接：\n\n· YouTube / B站链接 → 自动变成播放器\n· 或 .mp4 直链（如 GitHub Releases 的地址）');
      if(!url || !url.trim()) return;
      var u = url.trim();
      _postDraft.videos = _postDraft.videos || [];
      _postDraft.videos.push({ src: u, kind: pbVideoKind(u), embed: pbVideoEmbedUrl(u) });
      var n = _postDraft.videos.length;
      var marker = '[视频' + n + ']';
      if(ta){
        var pos = (_pbCaret == null) ? ta.value.length : Math.min(_pbCaret, ta.value.length);
        ta.value = ta.value.slice(0, pos) + marker + ta.value.slice(pos);
      }
      pbRenderVideoList();
      pbSaveDraft();
      _postStatus('视频' + n + ' 已插入 ✓');
    };
  }
  // 内容变动自动存草稿（防止手机选图/切后台被系统重载导致内容丢失）
  var taMain = document.getElementById('postText');
  var tiMain = document.getElementById('postTitle');
  if(tiMain) tiMain.oninput = pbSaveDraftSoon;
  if(taMain) taMain.oninput = pbSaveDraftSoon;
  ['postMood','postWeather','postLocation'].forEach(function(id){
    var e = document.getElementById(id); if(e) e.oninput = pbSaveDraftSoon;
  });
  // 检测到未完成的草稿 → 询问是否接着写
  var _draft = pbLoadDraft();
  if(_draft){
    var _age = Date.now() - (_draft.savedAt || 0);
    if(_age < 30 * 60 * 1000){
      // 30 分钟内（典型场景：写文章时切了个 tab 又切回来）→ 静默自动恢复，不打扰
      pbRestoreDraft(_draft);
      _postStatus('已自动恢复刚才写的内容 ✓', 'var(--accent)');
    }else{
      var st = new Date(_draft.savedAt || Date.now());
      var hh = ('0' + st.getHours()).slice(-2), mm = ('0' + st.getMinutes()).slice(-2);
      var when = (st.getMonth() + 1) + '月' + st.getDate() + '日 ' + hh + ':' + mm;
      if(confirm('发现一篇没写完的内容（' + when + ' 保存的）\n\n要接着写吗？\n\n点「确定」恢复；点「取消」丢弃')){
        pbRestoreDraft(_draft);
        _postStatus('已恢复上次没写完的内容 ✓', 'var(--accent)');
      }else{
        pbClearDraft();
      }
    }
  }
  var _previewMusic = function(){
    var el = document.getElementById('postMusicPreview');
    if(!el) return;
    if(_postDraft.music){ el.innerHTML = '<div style="font-size:.8rem;color:var(--text-dim)">🎵 ' + esc(_postDraft.music.name) + ' <button type="button" id="postRmMusic" style="color:var(--danger);font-size:.75rem">移除</button></div>'; }
    else if(_postDraft.musicKeep){ el.innerHTML = '<div style="font-size:.8rem;color:var(--text-dim)">🎵 ' + esc(_postDraft.musicKeepTitle || '已有音乐') + ' <button type="button" id="postRmMusic" style="color:var(--danger);font-size:.75rem">移除</button></div>'; }
    else { el.innerHTML = ''; }
    var rm = document.getElementById('postRmMusic');
    if(rm) rm.onclick = function(){ _postDraft.music = null; _postDraft.musicKeep = null; _postDraft.musicKeepTitle = null; _previewMusic(); };
  };
  _previewMusic();
  var cancelBtn = document.getElementById('postCancelEdit');
  if(cancelBtn) cancelBtn.onclick = cancelEditPost;

  var imgInput = document.getElementById('postImgInput');
  var musicInput = document.getElementById('postMusicInput');

  imgInput.onchange = async function(){
    var f = imgInput.files && imgInput.files[0];
    imgInput.value = '';
    if(!f) return;
    _postStatus('压缩照片中…');
    try{
      var blob = await compressImage(f, 1600, 0.85);
      var ext = (blob === f) ? (f.name.split('.').pop() || 'jpg') : 'jpg';
      var path = 'posts/img_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7) + '.' + ext;
      _postStatus('上传照片…（稍等，不要切走）');
      await uploadToStorage(path, blob);
      // 2026-09-15：同步生成缩略图（thumbs/posts/...）
      // 博客列表卡片用缩略图作淡化背景，缺失会导致卡片背景空白
      makeThumbBlob(blob, 420, 0.78).then(function(tb){
        if(tb) return sb.storage.from('photos').upload('thumbs/' + path, tb, {upsert:true, contentType:'image/jpeg'});
      }).catch(function(e){ console.warn('[thumb] post thumb upload failed', e); });
      _postDraft.images.push({ path: path, cap: '', name: f.name, preview: URL.createObjectURL(blob) });
      var n = _postDraft.images.length;
      var ta = document.getElementById('postText');
      var marker = '[照片' + n + ']';
      if(ta){
        var pos = (_pbCaret == null) ? ta.value.length : Math.min(_pbCaret, ta.value.length);
        ta.value = ta.value.slice(0, pos) + marker + ta.value.slice(pos);
        try{ ta.selectionStart = ta.selectionEnd = pos + marker.length; }catch(err){}
      }
      pbRenderImgList();
      pbSaveDraft();
      _postStatus('照片' + n + ' 已插入 ✓ 可在下方填写说明');
    }catch(e){ _postStatus('照片上传失败：' + (e.message || '请重试'), 'var(--danger)'); }
    _pbCaret = null;
  };

  musicInput.onchange = async function(){
    var f = musicInput.files && musicInput.files[0];
    if(!f) return;
    musicInput.value = '';
    var sizeMB = f.size / 1024 / 1024;
    var useFile = f;

    // 1) 非 mp3/m4a 等可流式格式 → 先转成 MP3
    if(pAudioNeedsConvert(f)){
      _postStatus('正在转换音频格式…（' + sizeMB.toFixed(1) + ' MB，稍等）');
      try{
        var mp3blob = await pConvertToMp3(f, function(pct){
          _postStatus('转换中… ' + pct + '%');
        });
        var base = (f.name || 'audio').replace(/\.[^.]+$/, '');
        useFile = new File([mp3blob], base + '.mp3', {type: 'audio/mpeg'});
        _postStatus('已转成 MP3：' + sizeMB.toFixed(1) + 'MB → ' + (useFile.size / 1024 / 1024).toFixed(1) + 'MB ✓');
      }catch(err){
        console.warn('[music] convert failed', err);
        _postStatus('转换失败，改传原文件（可能播放较慢）', 'var(--danger)');
        useFile = f;
      }
    }

    // 2) 立即上传（和照片一致：选完就传，草稿里存路径，不怕页面重载）
    var nameLow = (useFile.name || '').toLowerCase();
    var mext = (nameLow.split('.').pop() || 'mp3').toLowerCase();
    var path = 'posts/music_' + Date.now() + '.' + mext;
    _postStatus('上传音乐中…（' + (useFile.size / 1024 / 1024).toFixed(1) + ' MB）');
    try{
      await uploadToStorage(path, useFile);
      _postDraft.music = { path: path, name: useFile.name };
      _previewMusic();
      pbSaveDraft();
      _postStatus('✅ 音乐已上传：' + useFile.name + '（' + (useFile.size / 1024 / 1024).toFixed(1) + ' MB）', 'var(--success)');
    }catch(e){
      _postStatus('❌ 音乐上传失败：' + (e.message || '请重试'), 'var(--danger)');
    }
  };

  document.getElementById('postPublish').onclick = async function(){
    var btn = this;
    var isEdit = !!_postDraft.editingId;
    var ta = document.getElementById('postText');
    var text = ta ? ta.value : '';
    var titleEl = document.getElementById('postTitle');
    var title = titleEl ? titleEl.value.trim() : '';
    // 心情/天气/地点输入框已于 2026-09-15 移除；字段保留以兼容旧数据展示
    var mood = '', weather = '', location = '';

    var imgs = _postDraft.images || [];
    var vids = _postDraft.videos || [];
    if(!text.trim() && !imgs.length && !vids.length && !_postDraft.music && !_postDraft.musicKeep){
      _postStatus('写点内容或加张照片吧', 'var(--danger)'); return;
    }
    btn.disabled = true; btn.textContent = isEdit ? '保存中…' : '发布中…';

    try{
      for(var i = 0; i < imgs.length; i++){
        if(imgs[i].blob){
          _postStatus('上传照片 ' + (i + 1) + '/' + imgs.length + '…');
          await uploadToStorage(imgs[i].path, imgs[i].blob);
        }
      }
      var finalBlocks = pbParseArticle(text, imgs, vids).map(function(b){
        if(b.t === 'img'){
          var im = imgs[b._idx];
          if(!im) return null;
          return {t:'img', src: im.path || im.src, cap: (im.cap || '').trim()};
        }
        if(b.t === 'video'){
          var vd = vids[b._vidx];
          if(!vd) return null;
          return {t:'video', src: vd.src, kind: vd.kind || pbVideoKind(vd.src)};
        }
        return b;
      }).filter(function(x){ return !!x; });

      var musicPath = _postDraft.musicKeep || null;
      var musicTitle = _postDraft.musicKeepTitle || null;
      if(_postDraft.music && _postDraft.music.path){
        // 2026-09-15：音乐在"选择时"已上传（含格式转换），这里直接引用路径
        musicPath = _postDraft.music.path;
        musicTitle = (_postDraft.music.name || '音乐').replace(/\.[^.]+$/, '');
      }

      var plainText = finalBlocks.filter(function(x){ return x.t !== 'img'; })
                                 .map(function(x){ return x.text; }).join('\n\n');
      var imgList = finalBlocks.filter(function(x){ return x.t === 'img'; })
                               .map(function(x){ return x.src; });
      if(!finalBlocks.length && !musicPath){
        _postStatus('内容是空的哦', 'var(--danger)');
        btn.disabled = false; btn.textContent = isEdit ? '保存修改' : '发布';
        return;
      }
      _postStatus('保存…');
      var payload = {
        title: title || null,
        blocks: finalBlocks,
        content: plainText,
        images: imgList,
        music_path: musicPath,
        music_title: musicTitle,
        mood: mood || null,
        weather: weather || null,
        location: location || null
      };
      var res;
      if(isEdit){
        payload.updated_at = new Date().toISOString();
        res = await db().from('posts').update(payload).eq('id', _postDraft.editingId);
      }else{
        payload.created_at = new Date().toISOString();
        res = await db().from('posts').insert(payload);
      }
      if(res && res.error){
        var msg = res.error.message || '';
        if(/blocks/i.test(msg) && /column|field/i.test(msg)) throw new Error('posts 表缺少 blocks 字段');
        throw new Error(msg);
      }
      invalidateCache('post');
      _postDraft.editingId = null;
      pbClearDraft();
      _postStatus(isEdit ? '✅ 修改已保存' : '✅ 发布成功', 'var(--success)');
      renderTab();
    }catch(e){
      _postStatus('❌ ' + (e.message || '保存失败'), 'var(--danger)');
      btn.disabled = false; btn.textContent = isEdit ? '保存修改' : '发布';
      return;
    }
    btn.disabled = false; btn.textContent = '发布';
  };

  pbRenderImgList();
  pbRenderVideoList();
  renderPostOldList(posts);
}

function renderTab(){
  // 2026-09-10：Supabase SDK 未加载成功时明确提示（避免误以为数据丢了）
  if(!sb){
    const body = $('#editorBody');
    if(body) body.innerHTML = '<div style="padding:40px 24px;text-align:center;color:var(--text-muted);font-size:.9rem;line-height:2">'+
      '<div style="font-size:1.6rem;margin-bottom:12px">⚠️</div>'+
      '<div style="color:var(--text);margin-bottom:8px">云端数据暂时读不到</div>'+
      '<div style="font-size:.8rem">Supabase 客户端未加载成功<br>（网络或外部资源被拦截）</div>'+
      '<div style="font-size:.8rem;margin-top:12px">你的数据没有丢，页面刷新后重试即可</div>'+
      '<button class="editor-btn editor-btn-secondary" style="margin-top:18px" onclick="location.reload()">刷新重试</button>'+
      '</div>';
    return;
  }
  if(currentTab==='essay') renderEssayTab();
  else if(currentTab==='album') renderAlbumTab();
  else if(currentTab==='music') renderMusicTab();
  else if(currentTab==='post') renderPostTab();
}

// ===== 齿轮绑定（在 EDITOR 定义后执行） =====
const gearBtn = $('#navGear');
if(gearBtn) gearBtn.onclick = () => open();

})();
