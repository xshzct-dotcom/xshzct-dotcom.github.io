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

// 工具提前声明
function $(s,d){return(d||document).querySelector(s)}
function $$(s,d){return Array.from((d||document).querySelectorAll(s))}
function esc(s){return(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}

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
  const cats=['童年篇','初恋篇','所思所想','旅行见闻'];
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

  function renderList(){
    const list=$('#eeList');
    list.innerHTML=all.map((a,i)=>`
      <div class="ee-list-item" draggable="true" data-idx="${i}" data-sid="${a.id}">
        <span class="ee-drag">⠿</span>
        <span class="e-title">${esc(a.title)}</span>
        <span class="e-meta">${a.category_title||''} · ${a.date||''}</span>
        <div class="ee-actions">
          <button class="ee-btn" data-edit="${i}">✎</button>
          <button class="ee-btn del" data-del="${i}">🗑</button>
        </div>
      </div>
    `).join('');

    list.querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>editEssay(all[parseInt(b.dataset.edit)]));
    list.querySelectorAll('[data-del]').forEach(b=>b.onclick=()=>delEssay(all[parseInt(b.dataset.del)]));

    // 拖拽排序
    bindDragSort(list, all, 'essays', 'sort_order', ()=>renderList());
  }

  // 编辑/新建
  function editEssay(a){
    const isNew=!a;
    const category=a?a.category:'thoughts';
    const title=a?a.title:'';
    const date=a?a.date||'':new Date().toLocaleDateString('zh-CN').replace(/\//g,'.');
    const body=a?a.body:'';

    body.innerHTML=`
      <div class="editor-form-group"><label>分类</label><select id="eeCat">${catIds.map((c,i)=>`<option value="${c}" ${c===category?'selected':''}>${cats[i]}</option>`).join('')}</select></div>
      <div class="editor-form-group"><label>标题</label><input id="eeTitle" value="${esc(title)}" placeholder="文章标题"></div>
      <div class="editor-form-group"><label>日期</label><input id="eeDate" value="${date}" placeholder="2026.7.21"></div>
      <div class="editor-form-group"><label>正文</label><textarea id="eeBody" placeholder="写点什么...">${esc(body)}</textarea></div>
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
      if(typeof buildTimeline==='function') buildTimeline();
    };

    if(!isNew) $('#eeDelBtn').onclick=async()=>{
      if(!confirm('确定删除「'+title+'」？'))return;
      await db().from('essays').delete().eq('id',a.id);
      renderEssayTab();
      if(typeof buildTimeline==='function') buildTimeline();
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
      <div class="editor-list-item" draggable="true" data-idx="${i}" data-id="${a.id}">
        <span class="editor-drag-handle">⠿</span>
        <div class="info"><div class="title">${esc(a.title)}</div><div class="meta">${a.sort_order!==undefined?'排序:'+a.sort_order:''}</div></div>
        <div class="actions">
          <button class="editor-btn-sm" data-ae-open="${i}">📂</button>
          <button class="editor-btn-sm" data-ae-rename="${i}">✎</button>
          <button class="editor-btn-sm del" data-ae-del="${i}">🗑</button>
        </div>
      </div>
    `).join('')||'<div class="editor-empty">暂无相册</div>';

    el.querySelectorAll('[data-ae-open]').forEach(b=>b.onclick=()=>renderAlbumPhotos(list[parseInt(b.dataset['ae-open'])]));
    el.querySelectorAll('[data-ae-rename]').forEach(b=>b.onclick=()=>{
      const a=list[parseInt(b.dataset['ae-rename'])];
      const n=prompt('新名称:',a.title);if(!n)return;
      db().from('albums').update({title:n.trim()}).eq('id',a.id).then(()=>renderAlbumTab());
    });
    el.querySelectorAll('[data-ae-del]').forEach(b=>b.onclick=()=>{
      const a=list[parseInt(b.dataset['ae-del'])];
      if(!confirm('删除相册「'+a.title+'」？'))return;
      db().from('albums').delete().eq('id',a.id).then(()=>renderAlbumTab());
    });
    // 拖拽排序
    bindDragSort(el, list, 'albums', 'sort_order', ()=>renderList());
  }

  function renderAlbumPhotos(album){
    db().from('album_photos').select('*').eq('album_id',album.id).order('sort_order',{ascending:true}).then(({data:photos})=>{
      const plist=photos||[];
      body.innerHTML=`
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px">
          <button class="editor-btn editor-btn-secondary" onclick="renderAlbumTab()">← 返回</button>
          <span style="color:var(--text);flex:1">📸 ${esc(album.title)} (${plist.length}张)</span>
          <label class="editor-btn editor-btn-primary" style="cursor:pointer">上传照片<input type="file" accept="image/*" multiple style="display:none" id="aeUpload"></label>
        </div>
        <div id="aePhotoList"></div>
      `;
      function renderPhotos(){
        const el=$('#aePhotoList');
        el.innerHTML=plist.map((p,i)=>`
          <div class="editor-list-item">
            <span class="editor-drag-handle" draggable="true">⠿</span>
            <div class="info"><div class="title">${p.storage_path||p.filename||'照片'+(i+1)}</div></div>
            <div class="actions">
              <button class="editor-btn-sm" data-ae-preview="${i}">👁</button>
              <button class="editor-btn-sm del" data-ae-pdel="${i}">🗑</button>
            </div>
          </div>
        `).join('')||'<div class="editor-empty">暂无照片，上传一些吧</div>';

        el.querySelectorAll('[data-ae-preview]').forEach(b=>{
          b.onclick=()=>{
            const p=plist[parseInt(b.dataset['ae-preview'])];
            const src=p.storage_path?(STORAGE_URL+'/'+p.storage_path):('../images/'+(p.filename||''));
            window.open(src); // 简单预览
          };
        });
        el.querySelectorAll('[data-ae-pdel]').forEach(b=>b.onclick=()=>{
          const p=plist[parseInt(b.dataset['ae-pdel'])];
          if(!confirm('删除该照片？'))return;
          db().from('album_photos').delete().eq('id',p.id).then(()=>renderAlbumPhotos(album));
          if(p.storage_path) db().storage.from('photos').remove([p.storage_path]).catch(()=>{});
        });
      }
      renderPhotos();

      // Upload
      $('#aeUpload').onchange=async (e)=>{
        const files=e.target.files;
        for(const f of files){
          const fname=Date.now()+'_'+f.name.replace(/[^a-zA-Z0-9._-]/g,'_');
          const {error:upErr}=await db().storage.from('photos').upload(fname,f);
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
      <div class="editor-list-item" draggable="true" data-idx="${i}" data-id="${t.id}">
        <span class="editor-drag-handle">⠿</span>
        <div class="info"><div class="title">${esc(t.title)}</div><div class="meta">${t.artist||''} · 歌单:${t.album_id||'主页'}</div></div>
        <div class="actions">
          <button class="editor-btn-sm" data-me-play="${i}">▶</button>
          <button class="editor-btn-sm" data-me-edit="${i}">✎</button>
          <button class="editor-btn-sm del" data-me-del="${i}">🗑</button>
        </div>
      </div>
    `).join('')||'<div class="editor-empty">暂无音乐</div>';

    el.querySelectorAll('[data-me-play]').forEach(b=>b.onclick=()=>{
      const t=list[parseInt(b.dataset['me-play'])];
      const url=t.storage_path?(STORAGE_URL+'/'+t.storage_path):('../music/'+(t.storage_path||t.title+'.mp3'));
      const a=new Audio(url);a.play();
    });
    el.querySelectorAll('[data-me-edit]').forEach(b=>b.onclick=()=>{
      const t=list[parseInt(b.dataset['me-edit'])];
      const nt=prompt('歌曲名:',t.title);if(!nt)return;
      db().from('music').update({title:nt.trim()}).eq('id',t.id).then(()=>renderMusicTab());
    });
    el.querySelectorAll('[data-me-del]').forEach(b=>b.onclick=()=>{
      const t=list[parseInt(b.dataset['me-del'])];
      if(!confirm('删除「'+t.title+'」？'))return;
      db().from('music').delete().eq('id',t.id).then(()=>renderMusicTab());
      if(t.storage_path) db().storage.from('photos').remove([t.storage_path]).catch(()=>{});
    });
    // 拖拽排序
    bindDragSort(el, list, 'music', 'sort_order', ()=>renderList());
  }
  renderList();

  // 上传（延迟绑定，等 DOM 就绪）
  setTimeout(()=>{
    const uploadEl = $('#meUpload');
    if(uploadEl) uploadEl.onchange = async (e)=>{
      const files = e.target.files;
      for(const f of files){
        const fname = 'music_'+Date.now()+'_'+f.name.replace(/[^a-zA-Z0-9._-]/g,'_');
        try{
          const {error:upErr} = await sb.storage.from('photos').upload(fname, f);
          if(!upErr){
            await sb.from('music').insert({title:f.name.replace(/\.[^.]+$/,''), artist:'', storage_path:fname, sort_order:-Date.now(), album_id:null});
          }
        }catch(err){ console.warn('[music upload]', err); }
      }
      e.target.value = '';
      renderMusicTab();
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
