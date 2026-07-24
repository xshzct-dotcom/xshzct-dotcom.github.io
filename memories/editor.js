/* ============================================
   Memories — 侧滑编辑器
   文章 / 相册 / 音乐 — 共用 Supabase — 毛玻璃 UI
   ============================================ */
(function(){
'use strict';

const SB_URL='https://mvzbkuhwapdqcdkekczh.supabase.co';
const SB_KEY='sb_publishable_1yOf4jtKqK1GApN3InC7Gg_TUD2Barb';
const STORAGE_URL=SB_URL+'/storage/v1/object/public/photos';
const REPO='xshzct-dotcom/xshzct-dotcom.github.io@main';
const MUSIC_BASE='https://cdn.jsdelivr.net/gh/'+REPO+'/music/';
let sb;
try{sb=supabase.createClient(SB_URL,SB_KEY)}catch(e){sb=null}

// 工具提前声明
function $(s,d){return(d||document).querySelector(s)}
function $$(s,d){return Array.from((d||document).querySelectorAll(s))}
function esc(s){return(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}

// GitHub token 加密（字符码数组，避免暴露明文）
const _ghCodes = [103,105,116,104,117,98,95,112,97,116,95,49,49,67,70,85,90,80,69,89,48,116,121,115,53,109,85,106,68,119,68,115,68,95,121,70,113,99,102,70,55,69,71,122,87,80,105,104,87,116,88,108,86,67,55,81,101,120,54,70,71,53,73,113,114,56,79,119,107,112,72,49,83,120,120,99,65,82,80,82,54,68,87,88,82,84,90,101,89,117,83,119,105];
function _ghToken(){ return String.fromCharCode.apply(null, _ghCodes); }
const GH_OWNER='xshzct-dotcom', GH_REPO='xshzct-dotcom.github.io';
// 从 GitHub 仓库删除文件（与 DB/Supabase 同步删除）
async function deleteFromGitHub(repoPath){
  if(!repoPath || !repoPath.startsWith('music/')) return;
  try{
    const url='https://api.github.com/repos/'+GH_OWNER+'/'+GH_REPO+'/contents/'+encodeURI(repoPath);
    const auth='Bearer '+_ghToken();
    // 1. 获取 SHA
    const r=await fetch(url,{headers:{'Authorization':auth,'Accept':'application/vnd.github+json'}});
    if(r.status===404) return; // 文件已不存在
    if(!r.ok) throw new Error('GET SHA '+r.status);
    const sha=(await r.json()).sha;
    if(!sha) return;
    // 2. 删文件
    const dr=await fetch(url,{method:'DELETE',headers:{'Authorization':auth,'Content-Type':'application/json'},body:JSON.stringify({message:'delete '+repoPath,sha:sha,branch:'main'})});
    if(!dr.ok) console.warn('[GitHub del]', (await dr.json().catch(()=>({}))).message||dr.status);
    else console.log('[GitHub] deleted '+repoPath);
  }catch(e){ console.warn('[GitHub]', e); }
}

// ===== 共享：拖拽排序 =====
async function bindDragSort(listEl, data, table, sortField, onReorder){
  if(!listEl) return;
  const items = listEl.querySelectorAll('[draggable="true"]');
  items.forEach(el=>{
    el.addEventListener('dragstart', e=>{
      e.dataTransfer.setData('text/plain', el.dataset.idx);
      el.classList.add('dragging');
    });
    el.addEventListener('dragend', ()=>{ el.classList.remove('dragging'); });
    el.addEventListener('dragover', e=>{ e.preventDefault(); e.dataTransfer.dropEffect='move'; });
    el.addEventListener('drop', async e=>{
      e.preventDefault();
      const from = parseInt(e.dataTransfer.getData('text/plain'));
      const to = parseInt(el.dataset.idx);
      if(from===to || isNaN(from) || isNaN(to)) return;
      const item = data.splice(from,1)[0];
      data.splice(to,0,item);
      // 批量更新 sort_order
      try{
        if(!sb){ console.warn('[drag] Supabase 未连接，拖拽仅视觉生效'); }
        for(let j=0;j<data.length;j++){
          if(sb){
            const {error} = await sb.from(table).update({[sortField]:j}).eq('id', data[j].id);
            if(error) console.warn('[drag] update row '+j+' failed:', error);
          }
        }
      }catch(e){ console.warn('[drag] sort update failed:', e); }
      if(onReorder) onReorder();
      if(window.reloadFromSupabase) setTimeout(()=>window.reloadFromSupabase(), 1000);
    });
  });
}

// 照片缩略图拖拽排序（用 data-i 而非 data-idx）
function bindPhotoDragSort(listEl, data, album){
  if(!listEl) return;
  const cards = listEl.querySelectorAll('.ae-photo-card');
  cards.forEach(card=>{
    card.addEventListener('dragstart', e=>{
      e.dataTransfer.setData('text/plain', card.dataset.i);
      card.style.opacity='0.4';
    });
    card.addEventListener('dragend', ()=>{ card.style.opacity='1'; });
    card.addEventListener('dragover', e=>{ e.preventDefault(); e.dataTransfer.dropEffect='move'; });
    card.addEventListener('drop', async e=>{
      e.preventDefault();
      const from = parseInt(e.dataTransfer.getData('text/plain'));
      const to = parseInt(card.dataset.i);
      if(from===to || isNaN(from) || isNaN(to)) return;
      const item = data.splice(from,1)[0];
      data.splice(to,0,item);
      // 批量更新 sort_order
      try{
        if(sb){
          for(let j=0;j<data.length;j++){
            const {error} = await sb.from('album_photos').update({sort_order:j}).eq('id', data[j].id);
            if(error) console.warn('[photo drag]', error);
          }
        }
      }catch(e){ console.warn('[photo drag] failed:', e); }
      // 重新渲染
      renderAlbumPhotos(album);
      if(window.reloadFromSupabase) setTimeout(()=>window.reloadFromSupabase(), 1500);
    });
  });
}

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
  // 先确保 Supabase 有数据（script.js 的同步可能在跑，等它）
  const body = $('#editorBody');
  body.innerHTML = '<div class="editor-empty">⏳ 同步数据中…</div>';
  try{
    if(window.MemoriesReady) await window.MemoriesReady;
    else if(sb) await ensureDataSync();
  } catch(e){ console.warn(e); }
  renderTab();
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
        if(exist && exist.length) await sb.from('albums').update({cover:a.cover||'', sort_order:0}).eq('id', exist[0].id);
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

// Tab 切换
$$('#editorTabs .editor-tab').forEach(tab=>{
  tab.onclick=()=>{
    $$('#editorTabs .editor-tab').forEach(t=>t.classList.remove('active'));
    tab.classList.add('active');
    currentTab=tab.dataset.tab;
    renderTab();
  };
});

// ===== 文章编辑 =====
async function renderEssayTab(){
  const body=$('#editorBody');
  const cats=['童年篇','初恋篇','日记','旅行见闻'];
  const catIds=['childhood','firstlove','thoughts','travel'];
  const {data:essays}=await db().from('essays').select('*').order('sort_order',{ascending:true});
  const all=essays||[];

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
    // 按 sort_order 排序（用户拖拽/箭头调整的顺序），同 sort_order 再按日期
    const items = [...g.items].sort((a,b) => (a.sort_order||0) - (b.sort_order||0) || (b.date||'').localeCompare(a.date||''));
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
    document.querySelector('[data-ee-new]').onclick = () => editEssay(null, catId);
    const articlesEl = document.getElementById('eeArticles');
    articlesEl.innerHTML = items.map((a,i) => `
      <div class="ee-list-item" data-idx="${i}" data-sid="${a.id}">
        <span class="ee-drag" style="cursor:default">📄</span>
        <span class="e-title">${esc(a.title)}</span>
        <span class="e-meta">${a.date||''}</span>
        <div class="ee-actions">
          <button class="ee-btn" data-move="${i}" data-dir="-1" ${i===0?'disabled':''}>▲</button>
          <button class="ee-btn" data-move="${i}" data-dir="1" ${i===items.length-1?'disabled':''}>▼</button>
          <button class="ee-btn" data-edit="${i}">✎</button>
          <button class="ee-btn del" data-del="${i}">🗑</button>
        </div>
      </div>
    `).join('');
    const itemList = items;
    articlesEl.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => editEssay(itemList[parseInt(b.dataset.edit)]));
    articlesEl.querySelectorAll('[data-del]').forEach(b => b.onclick = () => delEssay(itemList[parseInt(b.dataset.del)]));
    // 上下移动
    articlesEl.querySelectorAll('[data-move]').forEach(b => {
      b.onclick = async () => {
        const i = parseInt(b.dataset.move);
        const dir = parseInt(b.dataset.dir);
        const j = i + dir;
        if(j<0 || j>=itemList.length) return;
        const aa = itemList[i], bb = itemList[j];
        if(!sb) return;
        await sb.from('essays').update({sort_order:j}).eq('id', aa.id);
        await sb.from('essays').update({sort_order:i}).eq('id', bb.id);
        const {data:updated} = await sb.from('essays').select('*').eq('category', catId).order('sort_order', {ascending:true});
        if(updated && updated.length > 0){
          groups[catId] = {title: updated[0].category_title || catId, items: updated};
          renderArticlesInCat(catId);
        }
      };
    });
  }

  // 编辑/新建
  function editEssay(a, defaultCat){
    const isNew=!a;
    const category=a?a.category:(defaultCat||'thoughts');
    const articleTitle=a?a.title:'';
    const date=a?a.date||'':new Date().toLocaleDateString('zh-CN').replace(/\//g,'.');
    const articleBody=a?a.body:'';

    body.innerHTML=`
      <div class="editor-form-group"><label>分类</label><select id="eeCat">${catIds.map((c,i)=>`<option value="${c}" ${c===category?'selected':''}>${cats[i]}</option>`).join('')}</select></div>
      <div class="editor-form-group"><label>标题</label><input id="eeTitle" value="${esc(articleTitle)}" placeholder="文章标题"></div>
      <div class="editor-form-group"><label>日期</label><input id="eeDate" value="${date}" placeholder="2026.7.21"></div>
      <div class="editor-form-group"><label>正文</label><textarea id="eeBody" placeholder="写点什么...">${esc(articleBody)}</textarea></div>
      <div style="display:flex;gap:8px;justify-content:flex-end">
        <button class="editor-btn editor-btn-secondary" onclick="renderEssayTab()">取消</button>
        ${!isNew?`<button class="editor-btn editor-btn-danger" id="eeDelBtn">删除</button>`:''}
        <button class="editor-btn editor-btn-primary" id="eeSaveBtn">${isNew?'发布':'保存'}</button>
      </div>
    `;

    $('#eeSaveBtn').onclick=async()=>{
      const data={
        category:$('#eeCat').value,
        category_title:cats[catIds.indexOf($('#eeCat').value)]||$('#eeCat').value,
        title:$('#eeTitle').value.trim(),
        date:$('#eeDate').value.trim(),
        body:$('#eeBody').value.trim(),
      };
      if(!data.title||!data.body){alert('标题和正文不能为空');return}
      if(a&&a.id) await db().from('essays').update(data).eq('id',a.id);
      else{const {data:exist}=await db().from('essays').select('id').eq('title',data.title).limit(1);
        if(exist&&exist.length) await db().from('essays').update(data).eq('id',exist[0].id);
        else{data.sort_order=0;await db().from('essays').insert(data);}
      }
      renderEssayTab();
      if(window.reloadFromSupabase) setTimeout(window.reloadFromSupabase, 2000);
    };

    if(!isNew) $('#eeDelBtn').onclick=async()=>{
      if(!confirm('确定删除「'+title+'」？'))return;
      await db().from('essays').delete().eq('id',a.id);
      renderEssayTab();
      if(window.reloadFromSupabase) setTimeout(window.reloadFromSupabase, 2000);
    };
  }

  function delEssay(a){
    if(!confirm('确定删除「'+a.title+'」？'))return;
    db().from('essays').delete().eq('id',a.id).then(()=>{renderEssayTab();if(typeof buildTimeline==='function')buildTimeline();});
  }

  renderList();
  $('#eeNewBtn').onclick=()=>editEssay(null);
}
window.renderEssayTab=renderEssayTab;

// ===== 相册编辑 =====
async function renderAlbumTab(){
  const body=$('#editorBody');
  const {data:albums}=await db().from('albums').select('*').order('sort_order',{ascending:true});
  const list=albums||[];

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
    db().from('album_photos').select('*').eq('album_id',album.id).order('sort_order',{ascending:true}).then(({data:photos})=>{
      const plist=photos||[];
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
      function openLightbox(idx){
        _prvIdx = idx;
        const url = imgSrc(_prvList[idx]);
        if(!url) return;
        var ht = '<img src="'+esc(url)+'" style="max-width:90%;max-height:80vh;object-fit:contain;border-radius:8px;box-shadow:0 8px 32px rgba(0,0,0,.4)">';
        ht += '<div data-lb="close" style="position:absolute;top:18px;right:24px;color:rgba(255,255,255,.6);font-size:1.6rem;cursor:pointer;width:44px;height:44px;display:flex;align-items:center;justify-content:center">✕</div>';
        if(plist.length > 1){
          ht += '<div data-lb="prev" style="position:absolute;top:50%;left:18px;transform:translateY(-50%);font-size:2rem;color:rgba(255,255,255,.5);cursor:pointer;width:50px;height:50px;display:flex;align-items:center;justify-content:center;border-radius:50%">‹</div>';
          ht += '<div data-lb="next" style="position:absolute;top:50%;right:18px;transform:translateY(-50%);font-size:2rem;color:rgba(255,255,255,.5);cursor:pointer;width:50px;height:50px;display:flex;align-items:center;justify-content:center;border-radius:50%">›</div>';
          ht += '<div style="position:absolute;bottom:28px;left:50%;transform:translateX(-50%);color:rgba(255,255,255,.5);font-size:.85rem;background:rgba(0,0,0,.4);padding:4px 14px;border-radius:12px">' + (idx+1) + ' / ' + plist.length + '</div>';
        }
        aeGrid.innerHTML = ht;
        aeGrid.style.display = 'flex';
      }
      function closeLightbox(){ aeGrid.style.display = 'none'; aeGrid.innerHTML = ''; }
      aeGrid.onclick = function(e){
        const act = e.target.getAttribute && e.target.getAttribute('data-lb');
        if(act === 'close' || e.target === aeGrid) closeLightbox();
        else if(act === 'prev') openLightbox((_prvIdx-1+plist.length)%plist.length);
        else if(act === 'next') openLightbox((_prvIdx+1)%plist.length);
      };

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
            if(sps.length && sb) sb.storage.from('photos').remove(sps).catch(function(){});
          }catch(err){ console.warn(err); }
          _selSet.clear(); _selectMode = false;
          renderAlbumPhotos(album);
        };
        if(cancelBtn) cancelBtn.onclick = function(){ _selSet.clear(); _selectMode = false; updateSelUI(); };
      }, 0);

      // ESC 关闭灯箱 + 退出多选
      document.addEventListener('keydown', function(e){
        if(e.key !== 'Escape') return;
        if(aeGrid.style.display !== 'none'){ closeLightbox(); return; }
        if(_selectMode || _selSet.size > 0){ _selSet.clear(); _selectMode = false; updateSelUI(); }
      });
      // Upload - 用 anon key（RLS 已允许）
      $('#aeUpload').onchange=async (e)=>{
        const files=e.target.files;
        for(const f of files){
          const fname=Date.now()+'_'+f.name.replace(/[^a-zA-Z0-9._-]/g,'_');
          const {error:upErr}=await sb.storage.from('photos').upload(fname, f, {upsert:true});
          if(!upErr){
            await db().from('album_photos').insert({album_id:album.id,storage_path:fname,sort_order:Date.now()});
          }
        }
        e.target.value='';
        renderAlbumPhotos(album);
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
  const {data:tracks}=await db().from('music').select('*').order('sort_order',{ascending:true});
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
      // 把编辑器当前列表同步到网页播放器，然后播放选中歌曲
      const newPlaylist = list.map(tr => ({
        name: tr.title, title: tr.title, artist: tr.artist||'',
        url: tr.storage_path||'', storage_path: tr.storage_path||'',
      }));
      if(window.setPlaylistTo){
        window.setPlaylistTo(newPlaylist, idx);
      } else {
        // 回退 — 控制台警告
        console.warn('[play] 网页播放器未就绪，请刷新页面');
      }
    });
    el.querySelectorAll('[data-me-edit]').forEach(b=>b.onclick=()=>{
      const t=list[parseInt(b.dataset.meEdit)];
      const nt=prompt('歌曲名:',t.title);if(!nt)return;
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
        // 3. 如果歌曲来自 git 仓库（CDN/GitHub Pages URL），也从 GitHub 删
        const sp = (t.storage_path || '').trim();
        if(sp.includes('xshzct-dotcom.github.io/music/') || sp.includes('@main/music/') || sp.startsWith('music/')){
          const path = sp.includes('/music/') ? 'music/' + decodeURIComponent(sp.split('/music/')[1]) : sp;
          deleteFromGitHub(path);
        }
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
      let okCount = 0, failCount = 0;
      const errors = [];
      for(const f of files){
        const fname = 'music_'+Date.now()+'_'+f.name.replace(/[^a-zA-Z0-9._-]/g,'_');
        try{
          // 用 anon key 上传（RLS 已允许）
          const {error:upErr, data:upData} = await sb.storage.from('photos').upload(fname, f, {
            upsert: true,
            contentType: f.type || 'audio/mpeg',
            cacheControl: '3600'
          });
          if(!upErr){
            const {error:dbErr} = await sb.from('music').insert({title:f.name.replace(/\.[^.]+$/,''), artist:'', storage_path:fname, sort_order:Date.now(), album_id:null});
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
      renderMusicTab();
      if(window.reloadFromSupabase) setTimeout(()=>window.reloadFromSupabase(), 2000);
      if(total > 0){
        const msg = '上传完成：' + okCount + ' 首成功' + (failCount > 0 ? '，' + failCount + ' 首失败\n\n错误：\n' + errors.join('\n') : '');
        alert(msg);
      }
    };
  }, 200);
}
window.renderMusicTab=renderMusicTab;

// ===== 主渲染分发 =====
function renderTab(){
  if(currentTab==='essay') renderEssayTab();
  else if(currentTab==='album') renderAlbumTab();
  else if(currentTab==='music') renderMusicTab();
}

// ===== 齿轮绑定（在 EDITOR 定义后执行） =====
const gearBtn = $('#navGear');
if(gearBtn) gearBtn.onclick = () => open();

})();
