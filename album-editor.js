/* =========================================
   云相册管理器（相册CRUD + 上传压缩 + 排序）
   ========================================= */
(function() {
  'use strict';

  // 保存网站全局相册引用（data.js 的 const albums）
  // 注意：下面有 let albums 会遮蔽全局变量，这里用 globalThis 访问
  const SITE_ALBUMS = (typeof globalThis !== 'undefined' && globalThis.albums && Array.isArray(globalThis.albums)) ? globalThis.albums : [];

  const SB_URL = 'https://mvzbkuhwapdqcdkekczh.supabase.co';
  const SB_KEY = 'sb_publishable_1yOf4jtKqK1GApN3InC7Gg_TUD2Barb';
  const STORAGE_URL = SB_URL + '/storage/v1/object/public/photos';
  let sb;
  try { sb = supabase.createClient(SB_URL, SB_KEY); }
  catch(e) { console.warn('[album]', e); sb = null; }

  // 延迟初始化 sb（如果首次创建失败则重试）
  function getSb() {
    if (sb) return sb;
    try {
      if (typeof supabase !== 'undefined' && supabase.createClient) {
        sb = supabase.createClient(SB_URL, SB_KEY);
      }
    } catch(e) { console.warn('[album] sb retry fail', e); }
    return sb;
  }
  // 安全的 db 访问，sb 不可用时返回空数据的 mock
  function db() {
    const client = getSb();
    if (client) return client;
    // 链式 mock：所有过滤方法返回自身，最终 await 时返回空数据
    const chain = (result) => new Proxy({}, {
      get: (_, prop) => {
        if (prop === 'then') return (resolve) => resolve(result);
        if (prop === 'catch') return (reject) => Promise.reject(result);
        return () => chain(result);
      }
    });
    const qb = (defaultResult) => new Proxy({}, {
      get: (_, prop) => {
        if (['select','insert','update','delete','maybeSingle','single','limit','order','eq','filter','match'].includes(prop)) {
          return () => qb(defaultResult);
        }
        if (prop === 'then') return (resolve) => resolve(defaultResult);
        if (prop === 'catch') return () => {};
        return () => qb(defaultResult);
      }
    });
    return {
      from: () => qb({ data: [], error: null }),
      storage: { from: () => ({ upload: async () => ({ error: null }), remove: async () => ({ error: null }) }) },
    };
  }

  // ===== 状态 =====
  let albums = [];
  let currentAlbum = null;       // 当前查看的相册
  let currentPhotos = [];        // 当前相册的照片
  let editMode = false;
  let loaded = false;

  // ===== 样式 =====
  const CSS = document.createElement('style');
  CSS.textContent = `
.album-overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,.8);z-index:10002;flex-direction:column;backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px)}
.album-overlay.show{display:flex}
.album-header{display:flex;align-items:center;padding:14px 18px;background:rgba(0,0,0,.3);flex-shrink:0;border-bottom:1px solid rgba(255,255,255,.06)}
.album-header h2{color:#fff;font-size:17px;font-weight:600;margin:0;flex:1}
.album-header button{width:34px;height:34px;border:none;border-radius:8px;background:rgba(255,255,255,.08);color:rgba(255,255,255,.6);font-size:16px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all .2s;margin-left:8px}
.album-header button:hover{background:rgba(255,255,255,.16);color:#fff}
.album-body{flex:1;overflow-y:auto;padding:16px}

/* 相册网格 */
.album-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:12px}
.album-card{border-radius:12px;overflow:hidden;cursor:pointer;position:relative;aspect-ratio:1;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.06);transition:all .2s}
.album-card:hover{border-color:rgba(255,255,255,.2)}
.album-card .cover{width:100%;height:100%;object-fit:cover;display:block}
.album-card .info{position:absolute;bottom:0;left:0;right:0;padding:10px 12px;background:linear-gradient(transparent,rgba(0,0,0,.8));color:#fff}
.album-card .info .name{font-size:14px;font-weight:500}
.album-card .info .count{font-size:11px;color:rgba(255,255,255,.6);margin-top:2px}

/* 照片网格 */
.photo-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:6px}
.photo-item{position:relative;aspect-ratio:1;overflow:hidden;border-radius:6px;cursor:pointer;background:rgba(255,255,255,.03);touch-action:manipulation}
.photo-item img{width:100%;height:100%;object-fit:cover;display:block;transition:transform .2s}
.photo-item:hover img{transform:scale(1.05)}
.photo-item .check{position:absolute;top:6px;right:6px;width:22px;height:22px;border-radius:50%;border:2px solid rgba(255,255,255,.5);background:rgba(0,0,0,.3);display:none;align-items:center;justify-content:center;color:#fff;font-size:12px}
.photo-item.selected .check{display:flex;background:#2d7eff;border-color:#2d7eff}
.photo-item.dragging{opacity:0.4}
.photo-item .del-btn{position:absolute;top:4px;right:4px;width:24px;height:24px;border:none;border-radius:50%;background:rgba(255,50,50,.8);color:#fff;font-size:12px;cursor:pointer;display:none;align-items:center;justify-content:center}
.photo-item.editing .del-btn{display:flex}

/* 工具栏 */
.album-toolbar{display:flex;gap:6px;padding:10px 16px;background:rgba(0,0,0,.2);flex-shrink:0;flex-wrap:wrap;border-top:1px solid rgba(255,255,255,.05)}
.album-toolbar button,.ab-btn{padding:8px 16px;border:1px solid rgba(255,255,255,.15);border-radius:8px;background:rgba(255,255,255,.06);color:rgba(255,255,255,.7);font-size:13px;cursor:pointer;transition:all .2s;font-family:inherit}
.album-toolbar button:hover,.ab-btn:hover{background:rgba(255,255,255,.12);color:#fff}
.ab-btn-pri{background:#fff;color:#1a1a1a;border:none}
.ab-btn-pri:hover{background:#e8e8e8!important;color:#1a1a1a!important}
.ab-btn-del{border-color:rgba(255,80,80,.3);color:rgba(255,130,130,.8)}
.ab-btn-del:hover{background:rgba(255,50,50,.2)!important;color:#ff7a7a!important}

@media(max-width:600px){
  .album-grid{grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:10px}
  .photo-grid{grid-template-columns:repeat(3,1fr);gap:4px}
}
`;
  document.head.appendChild(CSS);

  // ===== 构建DOM =====
  const HTML = `
  <div class="album-overlay" id="albumOverlay">
    <div class="album-header">
      <h2 id="albumTitle">📸 相册</h2>
      <button id="albumRefreshBtn" title="刷新">🔄</button>
      <button id="albumCloseBtn" title="关闭">✕</button>
    </div>
    <div class="album-body" id="albumBody"></div>
    <div class="album-toolbar" id="albumToolbar"></div>
  </div>
  <input type="file" id="photoUploadInput" accept="image/*" multiple style="display:none">`;
  const d = document.createElement('div');
  d.innerHTML = HTML;
  document.body.appendChild(d.firstElementChild);
  document.body.appendChild(d.lastElementChild);

  // ===== 数据处理 =====
  async function loadAlbums() {
    const { data, error } = await db().from('albums').select('*').order('sort_order');
    if (error) { console.warn('[album]', error); return []; }
    return data || [];
  }

  async function loadPhotos(albumId) {
    const { data, error } = await db().from('album_photos').select('*').eq('album_id', albumId).order('sort_order');
    if (error) return [];
    return data || [];
  }

  // ===== 获取照片URL（支持 Supabase 存储路径和完整 URL）=====
  function photoUrl(p) {
    if (!p || !p.storage_path) return '';
    // 完整 URL → 直接用
    if (p.storage_path.startsWith('http://') || p.storage_path.startsWith('https://')) return p.storage_path;
    // 相对路径（如 images/chuanxi/xxx.jpg）→ 用 GitHub Pages 同源路径
    if (p.storage_path.startsWith('images/') || p.storage_path.startsWith('music/')) return p.storage_path;
    // Supabase 存储路径 → 拼 STORAGE_URL
    return STORAGE_URL + '/' + p.storage_path;
  }

  // ===== 渲染 =====
  async function renderAlbumList() {
    const body = document.getElementById('albumBody');
    const tb = document.getElementById('albumToolbar');
    albums = await loadAlbums();

    if (albums.length === 0) {
      body.innerHTML = '<div style="text-align:center;padding:60px 20px;color:rgba(255,255,255,.3)"><div style="font-size:48px;margin-bottom:16px">📸</div><p>还没有相册</p></div>';
    } else {
      body.innerHTML = '<div class="album-grid" id="albumGrid">' + albums.map((a, i) => `
        <div class="album-card" draggable="${editMode}" data-id="${a.id}" data-idx="${i}"
             onclick="ALBUM.openById(${a.id})"
             ondragstart="ALBUM.dragAlbumStart(event,${i})"
             ondragover="ALBUM.dragAlbumOver(event,${i})"
             ondragend="ALBUM.dragAlbumEnd(event)">
          <img class="cover" src="${a.cover || STORAGE_URL + '/covers/placeholder.png'}" loading="lazy" onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 200 200%22><rect fill=%22%23222%22 width=%22200%22 height=%22200%22/><text x=%2250%%22 y=%2250%%22 text-anchor=%22middle%22 dy=%22.3em%22 fill=%22%23555%22 font-size=%2230%22>📷</text></svg>'">
          <div class="info"><div class="name">${esc(a.title)}</div><div class="count">${a._count || 0} 张</div></div>
          ${editMode ? '<span class="album-drag" style="position:absolute;top:6px;left:6px;color:rgba(255,255,255,.3);font-size:16px;cursor:grab;text-shadow:0 1px 3px rgba(0,0,0,.5)">⠿</span>' : ''}
        </div>`).join('') + '</div>';
      // 拖拽排序实时视觉反馈
      if (editMode) initAlbumDrag();
    }
    tb.innerHTML = '<button onclick="ALBUM.add()">+ 新建相册</button>' +
      (editMode ? '' : '<button onclick="ALBUM.toggleEdit()">✎ 编辑排序</button>');
    document.getElementById('albumTitle').textContent = '📸 相册';
    currentAlbum = null;
  }

  async function renderAlbumPhotos(album) {
    currentAlbum = album;
    const body = document.getElementById('albumBody');
    const tb = document.getElementById('albumToolbar');
    currentPhotos = await loadPhotos(album.id);

    document.getElementById('albumTitle').textContent = '📸 ' + album.title;

    if (currentPhotos.length === 0) {
      body.innerHTML = '<div style="text-align:center;padding:60px 20px;color:rgba(255,255,255,.3)"><div style="font-size:48px;margin-bottom:16px">🖼</div><p>暂无照片<br><span style="font-size:13px">点击下方上传</span></p></div>';
    } else {
      body.innerHTML = '<div class="photo-grid" id="photoGrid">' + currentPhotos.map((p, i) => `
        <div class="photo-item ${editMode ? 'editing' : ''}" draggable="${editMode}" data-id="${p.id}" data-idx="${i}"
             ondragstart="ALBUM.photoDragStart(event,${i})"
             ondragover="ALBUM.photoDragOver(event,${i})"
             ondragend="ALBUM.photoDragEnd(event)"
             ontouchstart="${editMode ? 'ALBUM.touchDragStart(event,' + i + ')' : ''}"
             ontouchmove="${editMode ? 'ALBUM.touchDragMove(event)' : ''}"
             ontouchend="${editMode ? 'ALBUM.touchDragEnd(event)' : ''}">
          <img src="${photoUrl(p)}" loading="lazy" onclick="${editMode ? '' : 'ALBUM.preview(' + i + ')'}">
          ${editMode ? `<button class="del-btn" onclick="event.stopPropagation();ALBUM.delPhoto(${p.id})">✕</button>
          <span class="drag-handle" style="position:absolute;bottom:4px;left:50%;transform:translateX(-50%);color:rgba(255,255,255,.3);font-size:16px;cursor:grab">⠿</span>` : ''}
        </div>`).join('') + '</div>';
    }

    tb.innerHTML = `
      <button class="ab-btn ab-btn-pri" onclick="ALBUM.upload()">📤 上传照片</button>
      ${editMode ? '<button class="ab-btn" onclick="ALBUM.toggleEdit()">✅ 完成排序</button>' : '<button class="ab-btn" onclick="ALBUM.toggleEdit()">✎ 编辑排序</button>'}
      <button onclick="ALBUM.rename()">✏️ 重命名</button>
      <button class="ab-btn-del" onclick="ALBUM.del()">🗑 删除相册</button>
      <button onclick="ALBUM.back()">← 返回</button>
    `;
  }

  // ===== 相册操作 =====
  function show() {
    // 如果 Supabase 还没初始化，等一会儿再试
    if (!sb) {
      setTimeout(show, 500);
      return;
    }
    const ov = document.getElementById('albumOverlay');
    if (!ov) {
      alert('相册管理器加载失败（请检查网络，刷新页面重试）');
      console.warn('[album] 找不到弹窗DOM，Supabase SDK可能未加载');
      return;
    }
    ov.classList.add('show');
    renderAlbumList().catch(e => {
      console.warn('[album] 渲染失败', e);
      ov.innerHTML = '<div style="padding:40px;text-align:center;color:rgba(255,255,255,.6)"><p>加载失败: ' + e.message + '</p><button onclick="ALBUM.show()" style="padding:8px 20px;border:1px solid rgba(255,255,255,.2);border-radius:8px;background:transparent;color:#fff;cursor:pointer">重试</button></div>';
    });
  }
  function hide() {
    const ov = document.getElementById('albumOverlay');
    if (ov) ov.classList.remove('show');
  }

  async function addAlbum() {
    const title = prompt('相册名称:');
    if (!title) return;
    const { error } = await db().from('albums').insert({
      title: title.trim(),
      sort_order: -(Date.now()),
    });
    if (error) { alert('❌ ' + error.message); return; }
    renderAlbumList();
  }

  async function renameAlbum() {
    if (!currentAlbum) return;
    const title = prompt('新名称:', currentAlbum.title);
    if (!title) return;
    const { error } = await db().from('albums').update({ title: title.trim() }).eq('id', currentAlbum.id);
    if (error) { alert('❌ ' + error.message); return; }
    renderAlbumPhotos({ ...currentAlbum, title: title.trim() });
  }

  async function delAlbum() {
    if (!currentAlbum) return;
    if (!confirm('确定删除相册「' + currentAlbum.title + '」？\n相册内的照片也会被删除。')) return;
    // 先删照片文件（从Storage）
    const photos = await loadPhotos(currentAlbum.id);
    for (const p of photos) {
      await db().storage.from('photos').remove([p.storage_path]);
    }
    // 删数据库记录
    await db().from('album_photos').delete().eq('album_id', currentAlbum.id);
    await db().from('albums').delete().eq('id', currentAlbum.id);
    renderAlbumList();
  }

  function back() {
    renderAlbumList();
  }

  // ===== 上传（带智能压缩） =====
  async function uploadPhotos() {
    document.getElementById('photoUploadInput').click();
  }

  async function handleFileSelect(e) {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    if (!currentAlbum) { alert('请先选择相册'); return; }

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        const compressed = await compressImage(file);
        const ext = file.name.split('.').pop() || 'jpg';
        const fname = Date.now() + '_' + Math.random().toString(36).slice(2, 8) + '.' + ext;
        const storagePath = currentAlbum.id + '/' + fname;

        // 上传到 Supabase
        const { error: upErr } = await db().storage.from('photos').upload(storagePath, compressed, {
          contentType: 'image/jpeg',
          upsert: false,
        });
        if (upErr) { console.warn('[album] upload fail:', upErr); continue; }

        // 记录到数据库
        await db().from('album_photos').insert({
          album_id: currentAlbum.id,
          filename: file.name,
          storage_path: storagePath,
          file_size: compressed.size,
          sort_order: -(Date.now() + i),
        });
      } catch(err) {
        console.warn('[album] process fail:', file.name, err);
      }
    }
    e.target.value = '';
    renderAlbumPhotos(currentAlbum);
  }

  document.getElementById('photoUploadInput').onchange = handleFileSelect;

  // ===== 智能压缩 =====
  async function compressImage(file) {
    // 小文件不压
    if (file.size < 100 * 1024) return file;

    const img = await createImageBitmap(file);
    const canvas = document.createElement('canvas');
    let w = img.width, h = img.height;

    // 根据文件大小决定最大尺寸
    let maxDim = 4000;
    if (file.size > 10 * 1024 * 1024) maxDim = 2000;
    else if (file.size > 5 * 1024 * 1024) maxDim = 2800;
    else if (file.size > 1 * 1024 * 1024) maxDim = 3500;

    if (maxDim && (w > maxDim || h > maxDim)) {
      if (w > h) { h = Math.round(h * maxDim / w); w = maxDim; }
      else { w = Math.round(w * maxDim / h); h = maxDim; }
    }

    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, w, h);
    img.close();

    // 根据原大小决定质量
    let quality = 0.90;
    if (file.size > 10 * 1024 * 1024) quality = 0.75;
    else if (file.size > 5 * 1024 * 1024) quality = 0.82;
    else if (file.size > 1 * 1024 * 1024) quality = 0.88;

    return new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', quality));
  }

  // ===== 删除照片 =====
  async function delPhoto(photoId) {
    if (!confirm('确定删除这张照片？')) return;
    const photo = currentPhotos.find(p => p.id === photoId);
    if (!photo) return;
    await db().storage.from('photos').remove([photo.storage_path]);
    await db().from('album_photos').delete().eq('id', photoId);
    renderAlbumPhotos(currentAlbum);
  }

  // ===== 照片预览（简单版） =====
  function previewPhoto(idx) {
    const photo = currentPhotos[idx];
    if (!photo) return;
    const url = photoUrl(photo);
    const ov = document.createElement('div');
    ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.9);z-index:10003;display:flex;align-items:center;justify-content:center;cursor:pointer';
    ov.innerHTML = `<img src="${url}" style="max-width:95%;max-height:95%;object-fit:contain;border-radius:8px">`;
    ov.onclick = () => ov.remove();
    document.body.appendChild(ov);
  }

  // ===== 拖拽排序 =====
  let dragState = null;
  let _dragAlbumId = null;

  // 编辑模式切换
  function toggleEdit() {
    editMode = !editMode;
    if (currentAlbum) renderAlbumPhotos(currentAlbum);
    else renderAlbumList();
  }

  // 照片 HTML5 拖拽
  function photoDragStart(e, idx) {
    if (!editMode) { e.preventDefault(); return; }
    dragState = { idx, from: idx };
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', idx);
    e.currentTarget.classList.add('dragging');
  }
  function photoDragOver(e, idx) {
    if (!editMode || dragState === null) return;
    e.preventDefault();
    if (idx === dragState.idx) return;
    const grid = document.getElementById('photoGrid');
    const items = grid.querySelectorAll('.photo-item');
    if (idx < dragState.idx) grid.insertBefore(items[dragState.idx], items[idx]);
    else grid.insertBefore(items[dragState.idx], items[idx + 1]);
    dragState.idx = idx;
  }
  async function photoDragEnd(e) {
    e.currentTarget.classList.remove('dragging');
    if (!dragState || dragState.idx === dragState.from) { dragState = null; return; }
    const from = currentPhotos[dragState.from];
    const to = currentPhotos[dragState.idx];
    if (from && to) {
      const fo = from.sort_order, to2 = to.sort_order;
      await db().from('album_photos').update({ sort_order: to2 }).eq('id', from.id);
      await db().from('album_photos').update({ sort_order: fo }).eq('id', to.id);
      currentPhotos = await loadPhotos(currentAlbum.id);
      renderAlbumPhotos(currentAlbum);
    }
    dragState = null;
  }

  // 触摸拖拽（照片，手机用）
  function touchDragStart(e, idx) {
    if (!editMode) return;
    const touch = e.touches[0];
    dragState = { idx, startY: touch.clientY, moved: false, el: e.currentTarget, from: idx };
    e.currentTarget.style.transition = 'none';
  }
  function touchDragMove(e) {
    if (!dragState) return;
    e.preventDefault();
    const touch = e.touches[0];
    const diff = touch.clientY - dragState.startY;
    if (Math.abs(diff) > 10) dragState.moved = true;
    dragState.el.style.transform = 'translateY(' + diff + 'px)';
    dragState.el.style.zIndex = '10';
    // 检测位置
    const items = document.querySelectorAll('#photoGrid .photo-item');
    for (let i = 0; i < items.length; i++) {
      if (i === dragState.idx) continue;
      const r = items[i].getBoundingClientRect();
      if (touch.clientY >= r.top && touch.clientY <= r.bottom) {
        if (i !== dragState.swapIdx) dragState.swapIdx = i;
        break;
      }
    }
  }
  async function touchDragEnd(e) {
    if (!dragState) return;
    dragState.el.style.transition = '';
    dragState.el.style.transform = '';
    dragState.el.style.zIndex = '';
    if (dragState.moved && dragState.swapIdx !== undefined && dragState.swapIdx !== dragState.idx) {
      const from = currentPhotos[dragState.idx];
      const to = currentPhotos[dragState.swapIdx];
      if (from && to) {
        const fo = from.sort_order, to2 = to.sort_order;
        await db().from('album_photos').update({ sort_order: to2 }).eq('id', from.id);
        await db().from('album_photos').update({ sort_order: fo }).eq('id', to.id);
        currentPhotos = await loadPhotos(currentAlbum.id);
        renderAlbumPhotos(currentAlbum);
      }
    }
    dragState = null;
  }

  // 相册 HTML5 拖拽排序
  function dragAlbumStart(e, idx) {
    if (!editMode) { e.preventDefault(); return; }
    _dragAlbumId = idx;
    e.dataTransfer.effectAllowed = 'move';
    e.currentTarget.style.opacity = '0.4';
  }
  function dragAlbumOver(e, idx) {
    if (!editMode || _dragAlbumId === null) return;
    e.preventDefault();
    if (idx === _dragAlbumId) return;
    const grid = document.getElementById('albumGrid');
    const items = grid.querySelectorAll('.album-card');
    if (idx < _dragAlbumId) grid.insertBefore(items[_dragAlbumId], items[idx]);
    else grid.insertBefore(items[_dragAlbumId], items[idx + 1]);
    _dragAlbumId = idx;
  }
  async function dragAlbumEnd(e) {
    e.currentTarget.style.opacity = '';
    if (_dragAlbumId === null) return;
    // 根据 DOM 顺序重新计算 sort_order
    const grid = document.getElementById('albumGrid');
    const cards = grid.querySelectorAll('.album-card');
    const newOrder = [];
    cards.forEach(c => { const id = parseInt(c.dataset.id); if (!isNaN(id)) newOrder.push(id); });
    for (let i = 0; i < newOrder.length; i++) {
      await db().from('albums').update({ sort_order: i }).eq('id', newOrder[i]);
    }
    albums = await loadAlbums();
    _dragAlbumId = null;
  }

  // 初始化相册拖动高亮
  function initAlbumDrag() {
    document.querySelectorAll('.album-card').forEach(el => {
      el.addEventListener('dragenter', e => e.preventDefault());
      el.addEventListener('dragleave', e => e.preventDefault());
    });
  }

  // 按 ID 打开相册（供模板 onclick 使用）
  function openAlbumById(id) {
    const album = albums.find(a => a.id === id);
    if (album) renderAlbumPhotos(album);
  }

  // ===== 暴露全局 =====
  window.ALBUM = {
    show,
    hide,
    add: addAlbum,
    open: renderAlbumPhotos,
    openById: openAlbumById,
    rename: renameAlbum,
    del: delAlbum,
    back,
    upload: uploadPhotos,
    delPhoto,
    preview: previewPhoto,
    toggleEdit,
    photoDragStart, photoDragOver, photoDragEnd,
    touchDragStart, touchDragMove, touchDragEnd,
    dragAlbumStart, dragAlbumOver, dragAlbumEnd,
  };

  // ===== 关闭按钮 =====
  document.getElementById('albumCloseBtn').onclick = hide;
  document.getElementById('albumRefreshBtn').onclick = () => {
    if (currentAlbum) renderAlbumPhotos(currentAlbum);
    else renderAlbumList();
  };

  // ===== 编辑模式切换 + 注入入口 =====
  let globalEditMode = false;

  function toggleEditMode() {
    globalEditMode = !globalEditMode;
    const pen = document.getElementById('album-pen');
    if (pen) {
      pen.classList.toggle('active', globalEditMode);
      pen.style.color = globalEditMode ? '#fff' : 'rgba(255,255,255,.4)';
    }
    // 显示/隐藏相册入口
    const entry = document.getElementById('album-entry');
    if (entry) entry.style.display = globalEditMode ? 'flex' : 'none';

    // 注入相册管理入口（在相册卡片上）
    if (globalEditMode) injectAlbumEntry();
  }

  function injectAlbumEntry() {
    // 在相册页面添加管理入口
    const section = document.querySelector('.section#albums, #albums');
    if (!section) return;
    const postsGrid = section.querySelector('.posts-grid');
    if (!postsGrid) return;

    // 添加相册管理卡片
    if (!document.getElementById('album-entry')) {
      const card = document.createElement('div');
      card.id = 'album-entry';
      card.className = 'post-card fade-up';
      card.style.cssText = 'background:linear-gradient(135deg,#2a2a2a,#1a1a1a);cursor:pointer;display:flex;align-items:center;justify-content:center;min-height:200px';
      card.innerHTML = '<div style="text-align:center;color:rgba(255,255,255,.6)"><div style="font-size:40px;margin-bottom:8px">📸</div><div style="font-size:16px">管理相册</div></div>';
      card.onclick = () => { ALBUM.show(); };
      postsGrid.appendChild(card);
    }
  }

  // 由 settings-menu 统一管理入口
  function addAlbumPen() { /* 已迁移到 settings-menu */ }

  // ===== 工具 =====
  function esc(s) { return (s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  // ===== 启动 =====
  async function importFromSite() {
    if (!SITE_ALBUMS || SITE_ALBUMS.length === 0) {
      console.log('[album] 没有可导入的网站相册');
      return;
    }
    console.log('[album] 从网站导入', SITE_ALBUMS.length, '个相册...');
    for (const sa of SITE_ALBUMS) {
      // 创建相册并获取 ID
      const { data: newAlbum, error: aErr } = await db().from('albums').insert({
        title: sa.title,
        sort_order: -(Date.now()),
      }).select('id').single();
      if (aErr || !newAlbum) { console.warn('[album] 导入失败:', sa.title, aErr); continue; }
      // 导入照片
      if (sa.photos && sa.photos.length > 0) {
        const batch = sa.photos.map((url, i) => ({
          album_id: newAlbum.id,
          filename: url.split('/').pop() || 'photo_' + i + '.jpg',
          storage_path: url,  // 存原始 URL（GitHub 路径）
          sort_order: i,
        }));
        const { error: pErr } = await db().from('album_photos').insert(batch);
        if (pErr) console.warn('[album] 照片导入失败:', sa.title, pErr);
      }
    }
    console.log('[album] 网站相册导入完成');
  }

  async function init() {
    if (loaded) return;
    loaded = true;
    addAlbumPen();
    // 检查是否有数据库
    const test = await loadAlbums();
    if (test.length === 0) {
      // 从网站导入现有相册
      try { await importFromSite(); } catch(e) { console.warn('[album] 导入失败', e); }
      const test2 = await loadAlbums();
      if (test2.length === 0) {
        console.log('[album] 尚无相册，请先在管理页面创建');
      } else {
        albums = test2;
        for (const a of albums) {
          const { count } = await db().from('album_photos').select('id', { count: 'exact', head: true }).eq('album_id', a.id);
          a._count = count;
        }
      }
    } else {
      for (const a of test) {
        const { count } = await db().from('album_photos').select('id', { count: 'exact', head: true }).eq('album_id', a.id);
        a._count = count;
      }
      albums = test;
    }
  }

  if (document.readyState === 'complete') init();
  else window.addEventListener('load', init);
})();
