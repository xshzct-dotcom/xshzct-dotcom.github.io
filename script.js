// ==================== 状态 ====================
let modalStack = [];
let currentAlbumPhotos = [];
let currentPhotoIndex = 0;
let currentSong = 0;
let isPlaying = false;
let albumZoomLevel = 3; // 1-5，对应 2/3/4/5/6 列
const audio = document.getElementById('bgMusic');
const playBtn = document.getElementById('playBtn');
const musicTitle = document.getElementById('musicTitle');
const musicProgress = document.getElementById('musicProgress');
const musicPlayer = document.getElementById('musicPlayer');

function loadSong(index, seekTo) {
  currentSong = (index + currentPlaylist.length) % currentPlaylist.length;
  var url = currentPlaylist[currentSong].url;
  // #t= 是HTML5标准媒体片段，所有浏览器原生支持seek到指定秒数
  url = url.split('#')[0]; // 清除旧的#t=
  if (seekTo != null && seekTo > 1) url += '#t=' + seekTo;
  audio.src = url;
  musicTitle.textContent = currentPlaylist[currentSong].name;
}
function onSongReady() {
  if (isPlaying) audio.play().catch(() => {});
}
function togglePlay() {
  if (isPlaying) { audio.pause(); playBtn.textContent = '▶'; isPlaying = false; }
  else {
    isPlaying = true; playBtn.textContent = '⏸';
    if (audio.paused) audio.play().catch(() => {});
  }
}
function nextSong() { loadAndPlay(currentSong + 1); }
function prevSong() { loadAndPlay(currentSong - 1); }
function togglePlayer() { var el = document.getElementById('musicPlayer'); if (el) el.classList.toggle('expanded'); }
function preloadNext() { 
  // 预加载当前列表所有歌曲
  for (var i = 0; i < currentPlaylist.length; i++) {
    var link = document.createElement('link');
    link.rel = 'preload'; link.as = 'audio'; link.href = currentPlaylist[i].url;
    document.head.appendChild(link);
  }
  // 预加载两个群组的歌单
  oldworldGroups.forEach(function(g) {
    if (g.songs) g.songs.forEach(function(s) {
      var link = document.createElement('link');
      link.rel = 'preload'; link.as = 'audio'; link.href = s.url;
      document.head.appendChild(link);
    });
  });
}
var savedPlaylist = null, savedSong = 0;
var groupState = {};
function saveGroupState(groupId) {
  if (groupId) {
    groupState[groupId] = { songIndex: currentSong, currentTime: audio.currentTime || 0 };
  }
}
// 核心：利用HTML5 #t= 媒体片段实现浏览器原生seek，兼容所有设备
function loadAndPlay(idx, seekTo) {
  loadSong(idx, seekTo);
  audio.load();
  // JS fallback seek: #t= 在某些浏览器（如小米）可能不生效，额外保底
  if (seekTo != null && seekTo > 1) {
    var doSeek = function() { audio.currentTime = Math.min(seekTo, audio.duration || Infinity); audio.removeEventListener('canplay', doSeek); };
    audio.addEventListener('canplay', doSeek);
  }
  var p = audio.play();
  if (p) {
    p.then(function() {
      isPlaying = true;
      playBtn.textContent = '⏸';
    }).catch(function(){});
  }
}
// 非手势场景（自动下一首、首屏加载）靠 canplay 触发播放
audio.addEventListener('canplay', function() {
  if (isPlaying) audio.play().catch(function(){});
});
function switchPlaylist(newList) {
  savedPlaylist = playlist;
  savedSong = currentSong;
  currentPlaylist = newList;
  currentSong = 0;
  loadAndPlay(0);
}
function switchToGroupPlaylist(groupId, newList) {
  var st = groupState[groupId];
  if (st && st.songIndex < newList.length) {
    savedPlaylist = playlist;
    savedSong = currentSong;
    currentPlaylist = newList;
    currentSong = st.songIndex;
    loadAndPlay(st.songIndex, st.currentTime);
  } else {
    switchPlaylist(newList);
  }
}
function restorePlaylist() {
  if (savedPlaylist) {
    currentPlaylist = savedPlaylist;
    currentSong = savedSong;
    savedPlaylist = null;
    loadAndPlay(savedSong);
  }
}

let currentPlaylist = playlist;
loadSong(0);
audio.load();
audio.addEventListener('ended', () => { nextSong(); preloadNext(); });
audio.addEventListener('timeupdate', function() { 
  if (audio.duration && !progressDragging) { 
    var el = document.getElementById('musicProgress'); 
    if (el) { var pct = (audio.currentTime / audio.duration) * 100; el.style.width = pct + '%'; var th = document.getElementById('musicThumb'); if (th) th.style.left = pct + '%'; } 
  } 
  // 记住当前群组的歌曲进度
  if (savedPlaylist && modalStack.length > 0) { var top = modalStack[modalStack.length - 1]; if (top && top.type === 'subGroup') { groupState[top.groupId] = { songIndex: currentSong, currentTime: audio.currentTime }; } }
});
audio.addEventListener('play', () => { preloadNext(); });
// 可拖拽进度条
var progressDragging = false;
function seekTo(e) {
  var track = document.getElementById('musicTrack');
  if (!track || !audio.duration) return;
  var rect = track.getBoundingClientRect();
  var x = (e.clientX || (e.touches && e.touches[0].clientX)) - rect.left;
  var pct = Math.min(1, Math.max(0, x / rect.width));
  audio.currentTime = pct * audio.duration;
}
var musicTrack = document.getElementById('musicTrack');
if (musicTrack) {
  musicTrack.addEventListener('mousedown', function(e) { progressDragging = true; this.classList.add('dragging'); seekTo(e); });
  musicTrack.addEventListener('touchstart', function(e) { progressDragging = true; this.classList.add('dragging'); seekTo(e); }, {passive:true});
  document.addEventListener('mousemove', function(e) { if (progressDragging) seekTo(e); });
  document.addEventListener('touchmove', function(e) { if (progressDragging) seekTo(e); }, {passive:true});
  document.addEventListener('mouseup', function() { if (progressDragging) { progressDragging = false; var t = document.getElementById('musicTrack'); if (t) t.classList.remove('dragging'); } });
  document.addEventListener('touchend', function() { if (progressDragging) { progressDragging = false; var t = document.getElementById('musicTrack'); if (t) t.classList.remove('dragging'); } });
}
// 音乐播放器自由拖拽（带屏幕边界约束）
(function(){
  var player = document.getElementById('musicPlayer');
  var panel = document.getElementById('musicPanel');
  if (!player || !panel) return;
  var dragging = false, startX, startY, origLeft, origTop;
  function startDrag(e) {
    var t = e.target;
    if (t.closest('.music-act') || t.closest('.music-track')) return;
    dragging = true;
    var p = e.touches ? e.touches[0] : e;
    startX = p.clientX; startY = p.clientY;
    origLeft = player.offsetLeft; origTop = player.offsetTop;
    player.style.transition = 'none';
    panel.style.cursor = 'grabbing';
    e.preventDefault();
  }
  function doDrag(e) {
    if (!dragging) return;
    var p = e.touches ? e.touches[0] : e;
    var dx = p.clientX - startX, dy = p.clientY - startY;
    var pw = player.offsetWidth, ph = player.offsetHeight;
    var vw = window.innerWidth, vh = window.innerHeight;
    player.style.left = Math.max(4, Math.min(vw - pw - 4, origLeft + dx)) + 'px';
    player.style.top = Math.max(4, Math.min(vh - ph - 4, origTop + dy)) + 'px';
    player.style.right = 'auto'; player.style.bottom = 'auto';
  }
  function endDrag() { dragging = false; player.style.transition = ''; if (panel) panel.style.cursor = 'grab'; }
  panel.addEventListener('mousedown', startDrag);
  panel.addEventListener('touchstart', startDrag, {passive:false});
  document.addEventListener('mousemove', doDrag);
  document.addEventListener('touchmove', doDrag, {passive:true});
  document.addEventListener('mouseup', endDrag);
  document.addEventListener('touchend', endDrag);
})();
// 首屏：尝试自动播放（手机端会被拦截，等用户第一次点击触发 loadAndPlay）
window.addEventListener('load', function() {
  isPlaying = true;
  playBtn.textContent = '⏸';
  audio.play().catch(function() {
    isPlaying = false;
    playBtn.textContent = '▶';
  });
  // 密码弹窗键盘监听
  document.getElementById('pwdInput').addEventListener('keydown', pwdKeyHandler);
});

// ==================== 渲染 ====================
const albumGrid = document.getElementById('album-grid');
albumGrid.classList.add('world-grid');
worlds.forEach((world, index) => {
  const card = document.createElement('div');
  card.className = 'world-card fade-up';
  card.style.transitionDelay = `${index * 0.12}s`;
  if (world.type === 'placeholder') {
    card.classList.add('world-new');
    card.innerHTML = `
      <div class="world-content">
        <div class="world-title">${world.title}</div>
      </div>`;
    card.onclick = () => openWorldView(world.id);
  } else {
    // 旧世界：使用川西封面作为高质量背景
    const coverUrl = 'images/covers/oldworld_cover_v2.jpg';
    card.classList.add('world-old');
    card.style.backgroundImage = `url('${coverUrl}')`;
    card.innerHTML = `
      <div class="world-content">
        <div class="world-title">${world.title}</div>
      </div>`;
    card.onclick = () => openWorldView(world.id);
  }
  albumGrid.appendChild(card);
});

// ==================== 旧世界密码弹窗 ====================
var _pendingWorldId = null;
function showPwdModal(worldId) {
  _pendingWorldId = worldId;
  document.getElementById('pwdInput').value = '';
  document.getElementById('pwdError').textContent = '';
  var overlay = document.getElementById('pwdOverlay');
  overlay.style.display = 'flex';
  // 强制重排触发动画
  void overlay.offsetWidth;
  overlay.classList.add('active');
  document.getElementById('pwdInput').focus();
}
function closePwdModal() {
  var overlay = document.getElementById('pwdOverlay');
  overlay.classList.remove('active');
  setTimeout(function() { overlay.style.display = 'none'; }, 300);
  _pendingWorldId = null;
}
function checkPwd() {
  var input = document.getElementById('pwdInput').value.trim();
  if (input === '陈科任') {
    localStorage.setItem('oldworld_unlocked', '1');
    closePwdModal();
    if (_pendingWorldId) {
      openWorldViewDirect(_pendingWorldId);
    }
  } else {
    document.getElementById('pwdError').textContent = '密码错误';
    document.getElementById('pwdInput').value = '';
    document.getElementById('pwdInput').focus();
  }
}
// 监听回车键
function pwdKeyHandler(e) {
  if (e.key === 'Enter') checkPwd();
  if (e.key === 'Escape') closePwdModal();
}

// ==================== 模态窗口 ====================
function openCardModal(type) {
  modalStack = [{ type, index: -1 }];
  updateModalView();
}
function openWorldView(worldId) {
  const world = worlds.find(w => w.id === worldId);
  if (!world) return;
  // 旧世界密码保护：一次输入，浏览器记住
  if (worldId === 'oldworld' && !localStorage.getItem('oldworld_unlocked')) {
    showPwdModal(worldId);
    return;
  }
  openWorldViewDirect(worldId);
}
function openWorldViewDirect(worldId) {
  const world = worlds.find(w => w.id === worldId);
  if (!world) return;
  if (world.type === 'placeholder') {
    modalStack = [{ type: 'worldPlaceholder', worldId }];
    updateModalView();
  } else if (world.type === 'group') {
    // 旧世界：使用 oldworldGroups 显示分层
    modalStack = [{ type: 'worldGroup', worldId }];
    updateModalView();
  }
}
function openOldworldGroup(groupId) {
  const group = oldworldGroups.find(g => g.id === groupId);
  if (!group) return;
  modalStack.push({ type: 'subGroup', groupId });
  // 切换到群组的专属歌单（记住上次进度）
  if (group.songs && group.songs.length > 0) {
    switchToGroupPlaylist(groupId, group.songs);
  }
  updateModalView();
}
function openAlbumModal(albumId) {
  const album = albums.find(a => a.id === albumId);
  if (!album || album.photos.length === 0) return;
  currentAlbumPhotos = album.photos;
  modalStack.push({ type: 'album', albumId, index: -1 });
  updateModalView();
  // 预加载缩略图和首张大图
  currentAlbumPhotos.slice(0, 20).forEach(p => preloader.load(getThumb(p)));
  currentAlbumPhotos.slice(0, 4).forEach(p => preloader.load(getFull(p)));
}

// ===== 相册照片分批渲染（IntersectionObserver 按需加载） =====
var _albumPhotoObserver = null;
function renderAlbumPhotos(photos, grid) {
  // 清除旧 observer
  if (_albumPhotoObserver) { _albumPhotoObserver.disconnect(); _albumPhotoObserver = null; }
  grid.innerHTML = '';
  
  // 先创建空的占位 div
  photos.forEach(function(photo, i) {
    var item = document.createElement('div');
    item.className = 'album-photo-item';
    item.setAttribute('data-index', i);
    item.onclick = function() { openLightbox(i); };
    grid.appendChild(item);
  });
  
  // 用 IntersectionObserver 按需加载图片
  _albumPhotoObserver = new IntersectionObserver(function(entries) {
    entries.forEach(function(entry) {
      if (!entry.isIntersecting) return;
      var item = entry.target;
      var i = parseInt(item.getAttribute('data-index'));
      if (isNaN(i)) return;
      var photo = photos[i];
      var img = document.createElement('img');
      img.src = getThumb(photo);
      img.alt = '照片 ' + (i + 1);
      img.loading = 'lazy';
      img.decoding = 'async';
      img.onload = function() {
        img.classList.add('loaded');
        item.classList.add('item-loaded');
      };
      img.onerror = function() {
        img.onerror = null;
        img.src = getFull(photo);
        img.classList.add('loaded');
        item.classList.add('item-loaded');
      };
      item.appendChild(img);
      _albumPhotoObserver.unobserve(item);
    });
  }, { rootMargin: '300px' }); // 提前 300px 开始加载
  
  // 观察所有占位项
  var items = grid.querySelectorAll('.album-photo-item');
  for (var j = 0; j < items.length; j++) _albumPhotoObserver.observe(items[j]);
}
function openCategory(catIndex) {
  modalStack.push({ type: 'essayCategory', catIndex, index: -1 });
  updateModalView();
}
function openContent(type, index) { modalStack.push({ type, index }); updateModalView(); }
function modalGoBack() {
  if (modalStack.length > 1) {
    // 退出群组前保存专属歌单进度
    var cur = modalStack[modalStack.length - 1];
    if (cur && cur.type === 'subGroup' && savedPlaylist) {
      saveGroupState(cur.groupId);
      restorePlaylist();
    }
    modalStack.pop();
    updateModalView();
  }
}

function updateModalView() {
  const modal = document.getElementById('cardModal');
  const title = document.getElementById('modalTitle');
  const body = document.getElementById('modalBody');
  const backBtn = document.getElementById('modalBack');
  // 内容过渡动画
  body.classList.remove('content-enter');
  void body.offsetWidth; // 强制回流触发重播
  setTimeout(function() { body.classList.add('content-enter'); }, 10);
  const current = modalStack[modalStack.length - 1];
  backBtn.style.visibility = modalStack.length > 1 ? 'visible' : 'hidden';

  // 文字内容居中窄栏，相册全宽
  body.classList.toggle('album-view', current.type === 'album');

  if (current.type === 'essay') {
    if (current.index === -1) {
      title.textContent = '随笔';
      body.innerHTML = `<div class="article-list">${essayCategories.map((cat, i) => `<div class="article-item" onclick="openCategory(${i})"><div><div class="title">${cat.title}</div><div class="meta">${cat.articles.length} 篇</div></div><div class="arrow">→</div></div>`).join('')}</div>`;
    }
  } else if (current.type === 'essayCategory') {
    const cat = essayCategories[current.catIndex];
    if (current.index === -1) {
      title.textContent = cat.title;
      if (cat.articles.length === 0) body.innerHTML = `<div style="text-align:center;padding:3rem 0;color:rgba(255,255,255,0.4);font-size:1.1rem;">暂无内容，待更新</div>`;
      else body.innerHTML = `<div class="article-list">${cat.articles.map((e, i) => `<div class="article-item" onclick="openEssayArticle(${current.catIndex}, ${i})"><div><div class="title">${e.title}</div><div class="meta">${e.date || ''}</div></div><div class="arrow">→</div></div>`).join('')}</div>`;
    }
  } else if (current.type === 'essayArticle') {
    const cat = essayCategories[current.catIndex];
    const essay = cat.articles[current.index];
    title.textContent = essay.title;
    body.innerHTML = `<div class="content-header"><div class="content-title">${essay.title}</div><div class="content-date">${essay.date || ''}</div><div class="font-controls"><span class="font-size-label">字号</span><button onclick="changeEssayFontSize(-0.15)" title="缩小">A−</button><button onclick="changeEssayFontSize(0.15)" title="放大">A+</button></div></div><div class="content-body" style="font-size:${window.getEssayFontSize ? window.getEssayFontSize() : 1.5}rem">${formatBody(essay.body)}</div><div class="content-nav"><button onclick="prevEssayArticle(${current.catIndex}, ${current.index})" ${current.index === 0 ? 'disabled' : ''}>← 上一篇</button><span style="color:rgba(255,255,255,0.5);font-size:0.85rem;">${current.index + 1} / ${cat.articles.length}</span><button onclick="nextEssayArticle(${current.catIndex}, ${current.index})" ${current.index === cat.articles.length - 1 ? 'disabled' : ''}>下一篇 →</button></div>`;
  } else if (current.type === 'travel') {
    if (current.index === -1) {
      title.textContent = '旅行见闻';
      body.innerHTML = `<div class="article-list">${travels.map((t, i) => `<div class="article-item" onclick="openContent('travel', ${i})"><div><div class="title">${t.title}</div><div class="meta">${t.date}</div></div><div class="arrow">→</div></div>`).join('')}</div>`;
    } else {
      const travel = travels[current.index];
      title.textContent = travel.title;
      body.innerHTML = `<div class="content-header"><div class="content-meta">${travel.date}</div></div><div class="content-body">${formatBody(travel.body)}</div><div class="content-nav"><button disabled>← 上一篇</button><span style="color:rgba(255,255,255,0.5);font-size:0.85rem;">1 / 1</span><button disabled>下一篇 →</button></div>`;
    }
  } else if (current.type === 'worldPlaceholder') {
    const w = worlds.find(x => x.id === current.worldId);
    title.textContent = w ? w.title : '';
    body.innerHTML = `<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:50vh;color:rgba(255,255,255,0.5);text-align:center;padding:3rem 1.5rem"><div style="font-size:3rem;margin-bottom:1.5rem;opacity:0.3">📸</div><div style="font-size:1.3rem;line-height:2">${w ? w.message.replace(/\n/g,'<br>') : ''}</div></div>`;
    body.classList.remove('album-view');
      } else if (current.type === 'albumGroup') {
    title.textContent = current.title || '相册';
    body.innerHTML = `<div class="sub-album-wrap"><div class="album-grid">${(current.children || []).map((aid, i) => {
      const a = albums.find(x => x.id === aid);
      if (!a) return '';
      const cover = a.cover ? getFull(a.cover) : '';
      return '<div class="album-card" onclick="openAlbumModal(\'' + a.id + '\')" style="background-image:url(\'' + cover + '\');background-size:cover;background-position:center;transition-delay:' + (i * 0.1) + 's"><div class="album-overlay"><div class="album-title">' + a.title + '</div><div class="album-count">' + (a.photos.length || '') + ' 张</div></div></div>';
    }).join('')}</div></div>`;
    body.classList.add('album-view');
      } else if (current.type === 'subGroup') {
    const group = oldworldGroups.find(g => g.id === current.groupId);
    title.textContent = group ? group.title : '';
    body.innerHTML = `<div class="sub-album-wrap"><div class="album-grid">${(group ? group.children : []).map((child, i) => {
      if (child.type === 'album') {
        const a = albums.find(x => x.id === child.ref);
        if (!a) return '';
        const cover = a.cover ? getFull(a.cover) : (a.photos && a.photos[0] ? getFull(a.photos[0]) : '');
        return '<div class="album-card" onclick="openAlbumModal(\'' + child.ref + '\')" style="background-image:url(\'' + cover + '\');background-size:cover;background-position:center;transition-delay:' + (i * 0.1) + 's"><div class="album-overlay"><div class="album-title">' + child.title + '</div><div class="album-count">' + (a.photos ? a.photos.length + ' 张' : '') + '</div></div></div>';
      }
      return '';
    }).join('')}</div></div>`;
    body.classList.add('album-view');
} else if (current.type === 'worldGroup') {
    const w = worlds.find(x => x.id === current.worldId);
    title.textContent = w ? w.title : '';
    body.innerHTML = `<div class="sub-album-wrap"><div class="album-grid">${(w ? w.children : []).map((gid, i) => {
      const g = oldworldGroups.find(x => x.id === gid);
      if (!g) return '';
      // Use group's own cover if specified, otherwise use first child album's cover
      let cover = 'images/covers/chuanxi.png';
      if (g.cover) {
        cover = getFull(g.cover);
      } else {
        const firstChild = g.children && g.children.length > 0 ? g.children[0] : null;
        if (firstChild && firstChild.type === 'album') {
          const a = albums.find(x => x.id === firstChild.ref);
          if (a && a.cover) cover = getFull(a.cover);
        }
      }
      return '<div class="album-card" onclick="openOldworldGroup(\'' + g.id + '\')" style="background-image:url(\'' + cover + '\');background-size:cover;background-position:center;transition-delay:' + (i * 0.1) + 's"><div class="album-overlay"><div class="album-title">' + g.title + '</div></div></div>';
    }).join('')}</div></div>`;
    body.classList.add('album-view');

  } else if (current.type === 'album') {
    title.textContent = albums.find(a => a.id === current.albumId)?.title || '相册';
    body.innerHTML = `
      <div class="album-photos-grid zoom-${albumZoomLevel}" id="albumPhotosGrid"></div>
      <div class="album-scrollbar" id="albumScrollbar">
        <div class="album-scrollbar-track"></div>
        <div class="album-scrollbar-thumb" id="albumScrollbarThumb"></div>
      </div>`;
    // 分批渲染照片（而非一次性创建所有DOM）
    renderAlbumPhotos(currentAlbumPhotos, body.querySelector('#albumPhotosGrid'));
    // 初始化触摸滚动条
    initAlbumScrollbar(body);
  }
  // 手机端：边缘右滑返回上一级
  initModalSwipeBack(body);
  modal.classList.add('active');
  document.body.style.overflow = 'hidden';
}

function nextContent(type, currentIndex) { const items = travels; if (currentIndex < items.length - 1) { modalStack[modalStack.length - 1].index = currentIndex + 1; updateModalView(); } }
function prevContent(type, currentIndex) { if (currentIndex > 0) { modalStack[modalStack.length - 1].index = currentIndex - 1; updateModalView(); } }
function openEssayArticle(catIndex, artIndex) { modalStack.push({ type: 'essayArticle', catIndex, index: artIndex }); updateModalView(); }
function nextEssayArticle(catIndex, currentIndex) { const cat = essayCategories[catIndex]; if (currentIndex < cat.articles.length - 1) { modalStack[modalStack.length - 1].index = currentIndex + 1; updateModalView(); } }
function prevEssayArticle(catIndex, currentIndex) { if (currentIndex > 0) { modalStack[modalStack.length - 1].index = currentIndex - 1; updateModalView(); } }
function closeModal() { 
  if (modalStack.length > 1) { modalGoBack(); return; }
  if (modalSwipeCleanup) { modalSwipeCleanup(); modalSwipeCleanup = null; }
  if (savedPlaylist) restorePlaylist();
  document.getElementById('cardModal').classList.remove('active'); 
  document.body.style.overflow = ''; 
  modalStack = []; 
  // 关闭时退出文章编辑模式
  if (window.BLOG && typeof window.BLOG.exit === 'function') window.BLOG.exit();
}

// ===== 手机端：边缘右滑返回上一级（兼容全屏手势导航） =====
var modalSwipeCleanup = null;
function initModalSwipeBack(body) {
  if (modalSwipeCleanup) { modalSwipeCleanup(); modalSwipeCleanup = null; }
  var startX = 0, startY = 0, startTime = 0;
  var overlay = null;

  function onTouchStart(e) {
    if (modalStack.length <= 1) return;
    var x = e.touches[0].clientX;
    if (x > 35) return; // 仅限左侧边缘 35px 内触发
    startX = x;
    startY = e.touches[0].clientY;
    startTime = Date.now();
  }

  function onTouchMove(e) {
    if (!startX || modalStack.length <= 1) return;
    var dx = e.touches[0].clientX - startX;
    if (dx <= 0) return; // 向左滑忽略

    // 阻止页面横向滑动，避免干扰
    if (dx > 10) e.preventDefault();

    // 视觉反馈：左侧阴影条随手指移动
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.style.cssText = 'position:fixed;left:0;top:0;bottom:0;width:2px;background:rgba(255,255,255,0.15);border-radius:2px;z-index:9999;pointer-events:none';
      document.body.appendChild(overlay);
    }
    var progress = Math.min(dx / 80, 1);
    overlay.style.left = Math.min(dx, 80) + 'px';
    overlay.style.opacity = 0.15 + progress * 0.7;
  }

  function onTouchEnd(e) {
    if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
    overlay = null;
    if (!startX || modalStack.length <= 1) { startX = 0; return; }

    var dx = e.changedTouches[0].clientX - startX;
    var dt = Date.now() - startTime;

    if (dx > 60 || (dx > 30 && dt < 300)) {
      modalGoBack();
    }
    startX = 0;
  }

  body.addEventListener('touchstart', onTouchStart, { passive: true });
  body.addEventListener('touchmove', onTouchMove, { passive: false });
  body.addEventListener('touchend', onTouchEnd, { passive: true });

  modalSwipeCleanup = function () {
    body.removeEventListener('touchstart', onTouchStart);
    body.removeEventListener('touchmove', onTouchMove);
    body.removeEventListener('touchend', onTouchEnd);
    if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
    overlay = null;
  };
}

// 相册触摸滚动条：点在右侧边任意位置都能拖拽
var albumScrollCleanup = null;
function initAlbumScrollbar(body) {
  // 清理上次绑定
  if (albumScrollCleanup) { albumScrollCleanup(); albumScrollCleanup = null; }
  var bar = document.getElementById('albumScrollbar');
  var thumb = document.getElementById('albumScrollbarThumb');
  if (!bar || !thumb) return;
  function updateThumb() {
    requestAnimationFrame(function() {
      var ratio = body.scrollTop / (body.scrollHeight - body.clientHeight);
      if (isNaN(ratio)) ratio = 0;
      var trackH = body.clientHeight - 8;
      var thumbH = Math.max(40, trackH * (body.clientHeight / body.scrollHeight));
      thumb.style.height = thumbH + 'px';
      thumb.style.top = (ratio * (trackH - thumbH)) + 'px';
    });
  }
  var dragging = false;
  function onStart(e) {
    var y = e.touches ? e.touches[0].clientY : e.clientY;
    var rect = bar.getBoundingClientRect();
    var trackH = body.clientHeight - 8;
    var r = (y - rect.top - 4) / trackH;
    body.scrollTop = r * (body.scrollHeight - body.clientHeight);
    dragging = true;
    e.preventDefault();
  }
  function onMove(e) {
    if (!dragging) return;
    var y = e.touches ? e.touches[0].clientY : e.clientY;
    var rect = bar.getBoundingClientRect();
    var trackH = body.clientHeight - 8;
    var r = (y - rect.top - 4) / trackH;
    body.scrollTop = r * (body.scrollHeight - body.clientHeight);
    e.preventDefault();
  }
  function onEnd() { dragging = false; }
  bar.addEventListener('mousedown', onStart);
  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onEnd);
  bar.addEventListener('touchstart', onStart, { passive: false });
  document.addEventListener('touchmove', onMove, { passive: false });
  document.addEventListener('touchend', onEnd);
  body.addEventListener('scroll', updateThumb, { passive: true });
  updateThumb();
  // 清理函数
  albumScrollCleanup = function() {
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onEnd);
    document.removeEventListener('touchmove', onMove);
    document.removeEventListener('touchend', onEnd);
  };
}

// ==================== 灯箱（大图查看）====================
let lightboxCurrentBlobUrl = null;
let lightboxAbortController = null;
let lightboxIsLoading = false;
let lightboxChangeTimer = null;
let lightboxExitTimer = null;  // 退出动画定时器，防止快速点击叠加
let lightboxTouchStartX = 0;
let lightboxTouchStartY = 0;
let lightboxTouchStartTime = 0;
let lightboxLastTapTime = 0;
let lightboxZoomed = false;
let lightboxKeyboardCooldown = false;
// 缩放与平移状态
let lightboxScale = 1;
let lightboxPanX = 0;
let lightboxPanY = 0;
let lightboxPinchStartDist = 0;
let lightboxPinchStartScale = 1;
let lightboxControlsVis = true;  // 手机端控制条显隐
let lightboxLastChangeTime = 0;  // 防止按钮与边缘触摸重复触发跳张

// 重置缩放/平移状态（换片时调用）
function resetLightboxZoom() {
  lightboxScale = 1;
  lightboxPanX = 0;
  lightboxPanY = 0;
  lightboxZoomed = false;
  lightboxControlsVis = true;
  const img = document.getElementById('lightboxImg');
  if (img) { img.style.transform = ''; img.classList.remove('zoomed'); }
  const lb = document.getElementById('lightbox');
  if (lb) lb.classList.remove('lightbox-controls-hidden');
}

// 应用缩放/平移变换到图片
function updateImageTransform(smooth) {
  const img = document.getElementById('lightboxImg');
  if (!img) return;
  img.classList.toggle('zoomed', lightboxScale > 1);
  if (lightboxScale > 1) {
    img.style.transition = smooth ? 'transform 0.35s cubic-bezier(0.22,1,0.36,1)' : 'none';
    img.style.transform = 'translate3d(' + lightboxPanX + 'px, ' + lightboxPanY + 'px, 0) scale3d(' + lightboxScale + ', ' + lightboxScale + ', 1)';
    img.style.willChange = 'transform';
  } else {
    img.style.transition = smooth ? 'transform 0.3s ease' : 'none';
    img.style.transform = '';
    img.style.willChange = '';
  }
}

function setLightboxProgress(percent) {
  const bar = document.getElementById('progressRingBar');
  const text = document.getElementById('lightboxProgressText');
  if (!bar || !text) return;
  const circumference = 125.6; // 2 * PI * 20
  const offset = circumference - (Math.max(0, Math.min(100, percent)) / 100) * circumference;
  bar.style.strokeDashoffset = offset;
  text.textContent = percent + '%';
}

function showLightboxLoader(show) {
  const loader = document.getElementById('lightboxLoader');
  const text = document.getElementById('lightboxLoadingText');
  if (!loader || !text) return;
  loader.classList.toggle('visible', show);
  text.classList.toggle('visible', show);
}

function showLightboxThumb(photoPath) {
  const thumb = document.getElementById('lightboxThumb');
  if (!thumb) return;
  const thumbUrl = getThumb(photoPath);
  if (thumbUrl) thumb.style.backgroundImage = `url('${thumbUrl}')`;
  thumb.classList.add('visible');
}

function hideLightboxThumb() {
  const thumb = document.getElementById('lightboxThumb');
  if (!thumb) return;
  thumb.classList.remove('visible');
}

function revokeCurrentBlob() {
  if (lightboxCurrentBlobUrl) {
    URL.revokeObjectURL(lightboxCurrentBlobUrl);
    lightboxCurrentBlobUrl = null;
  }
}

function abortLightboxLoad() {
  if (lightboxAbortController) {
    try { lightboxAbortController.abort(); } catch(e) {}
    lightboxAbortController = null;
  }
}

// 带进度追踪的图片加载（使用 fetch + ReadableStream）
function loadImageWithProgress(url, onProgress, onComplete, onError) {
  const controller = new AbortController();
  lightboxAbortController = controller;

  fetch(url, { signal: controller.signal })
    .then(response => {
      if (!response.ok) throw new Error('HTTP ' + response.status);
      if (!response.body) throw new Error('No body');
      const total = parseInt(response.headers.get('content-length')) || 0;
      const reader = response.body.getReader();
      let loaded = 0;
      const chunks = [];

      function pump() {
        return reader.read().then(({ done, value }) => {
          if (controller.signal.aborted) return;
          if (done) {
            onProgress(100);
            const blob = new Blob(chunks);
            const blobUrl = URL.createObjectURL(blob);
            onComplete(blobUrl);
            return;
          }
          if (value) {
            chunks.push(value);
            loaded += value.length;
            if (total > 0) {
              onProgress(Math.min(99, Math.round((loaded / total) * 100)));
            } else {
              // 未知大小：按每 512KB 增加 15% 模拟进度
              const simulated = Math.min(90, Math.round((loaded / (512 * 1024)) * 15));
              onProgress(simulated);
            }
          }
          return pump();
        });
      }
      return pump();
    })
    .catch(err => {
      if (err.name === 'AbortError') return;
      onError();
    });
}

function fallbackLoadImage(img, url, onDone) {
  img.onload = function() {
    this.classList.add('loaded');
    showLightboxLoader(false);
    hideLightboxThumb();
    if (onDone) onDone();
  };
  img.onerror = function() {
    showLightboxLoader(false);
    this.alt = '图片加载失败';
    this.classList.add('loaded');
    if (onDone) onDone();
  };
  img.src = url;
}

function loadCurrentPhoto(animateExit) {
  const lb = document.getElementById('lightbox');
  const img = document.getElementById('lightboxImg');
  if (!lb.classList.contains('active') || !currentAlbumPhotos.length) return;

  abortLightboxLoad();
  revokeCurrentBlob();
  // 清除之前的退出动画定时器，防止快速点击叠加导致跳张
  if (lightboxExitTimer) { clearTimeout(lightboxExitTimer); lightboxExitTimer = null; }

  const doLoad = () => {
    img.classList.remove('loaded', 'zoomed', 'is-exit');
    lightboxZoomed = false;
    setLightboxProgress(0);
    showLightboxLoader(true);
    showLightboxThumb(currentAlbumPhotos[currentPhotoIndex]);
    resetLightboxZoom();

    const photoPath = currentAlbumPhotos[currentPhotoIndex];
    const fullUrl = getFull(photoPath);

    img.onload = function() {
      this.classList.add('loaded');
      showLightboxLoader(false);
      hideLightboxThumb();
      setLightboxProgress(100);
      lightboxIsLoading = false;
    };
    img.onerror = function() {
      showLightboxLoader(false);
      this.alt = '图片加载失败';
      this.classList.add('loaded');
      lightboxIsLoading = false;
    };

    loadImageWithProgress(fullUrl,
      (percent) => setLightboxProgress(percent),
      (blobUrl) => {
        lightboxCurrentBlobUrl = blobUrl;
        if (!lb.classList.contains('active')) {
          revokeCurrentBlob();
          return;
        }
        img.src = blobUrl;
      },
      () => {
        fallbackLoadImage(img, fullUrl, () => { lightboxIsLoading = false; });
      }
    );

    // 预加载相邻图片
    if (preloader && typeof preloader.preloadAdjacent === 'function') {
      preloader.preloadAdjacent(currentPhotoIndex, currentAlbumPhotos, 3);
    }
  };

  if (animateExit) {
    img.classList.add('is-exit');
    lightboxExitTimer = setTimeout(doLoad, 40);
  } else {
    doLoad();
  }
}

function openLightbox(index) {
  if (!currentAlbumPhotos || !currentAlbumPhotos.length) return;
  currentPhotoIndex = Math.max(0, Math.min(index, currentAlbumPhotos.length - 1));

  const lb = document.getElementById('lightbox');
  const counter = document.getElementById('lightboxCounter');

  counter.textContent = `${currentPhotoIndex + 1} / ${currentAlbumPhotos.length}`;

  // 灯箱全屏覆盖，隐藏背后的大 DOM（旧世界 1778 张图）释放 GPU/内存
  const modal = document.getElementById('cardModal');
  if (modal) modal.classList.add('lb-hidden');

  lb.classList.add('active');
  lightboxIsLoading = true;
  loadCurrentPhoto(false);
}

function closeLightbox() {
  const lb = document.getElementById('lightbox');
  const modal = document.getElementById('cardModal');

  // 立即恢复相册模态框（在 lightbox 淡出期间就已准备好，z-index 保证 lightbox 在上层）
  if (modal) modal.classList.remove('lb-hidden');

  lb.classList.remove('active');
  if (lightboxChangeTimer) {
    clearTimeout(lightboxChangeTimer);
    lightboxChangeTimer = null;
  }
  if (lightboxExitTimer) {
    clearTimeout(lightboxExitTimer);
    lightboxExitTimer = null;
  }
  setTimeout(() => {
    const img = document.getElementById('lightboxImg');
    if (img) {
      img.classList.remove('loaded', 'zoomed', 'is-exit');
      img.src = '';
      img.alt = '';
    }
    abortLightboxLoad();
    revokeCurrentBlob();
    hideLightboxThumb();
    showLightboxLoader(false);
    lightboxIsLoading = false;
    resetLightboxZoom();
  }, 300);
}

function changePhoto(dir) {
  if (!currentAlbumPhotos || !currentAlbumPhotos.length) return;
  // 防跳保护：250ms 内重复调用忽略（防止手机端按钮+边缘触摸双重触发）
  const now = Date.now();
  if (now - lightboxLastChangeTime < 250) return;
  lightboxLastChangeTime = now;
  // 立即更新索引，零延迟
  const newIndex = (currentPhotoIndex + dir + currentAlbumPhotos.length) % currentAlbumPhotos.length;
  currentPhotoIndex = newIndex;

  const counter = document.getElementById('lightboxCounter');
  if (counter) counter.textContent = `${currentPhotoIndex + 1} / ${currentAlbumPhotos.length}`;

  // 按钮动画，即时可见
  const btnClass = dir > 0 ? 'lightbox-next' : 'lightbox-prev';
  const btn = document.querySelector('.' + btnClass);
  if (btn) {
    btn.classList.remove('clicked');
    void btn.offsetWidth;
    btn.classList.add('clicked');
    setTimeout(() => btn.classList.remove('clicked'), 350);
  }

  // 清除队列中的加载（如果有），然后立即加载，不做防抖
  if (lightboxChangeTimer) { clearTimeout(lightboxChangeTimer); lightboxChangeTimer = null; }
  loadCurrentPhoto(true);
}

// 灯箱手势与交互
document.addEventListener('keydown', (e) => {
  if (document.getElementById('lightbox').classList.contains('active')) {
    if (lightboxKeyboardCooldown) return;
    if (e.key === 'ArrowLeft') { changePhoto(-1); lightboxKeyboardCooldown = true; }
    if (e.key === 'ArrowRight') { changePhoto(1); lightboxKeyboardCooldown = true; }
    if (e.key === 'Escape') closeLightbox();
    if (lightboxKeyboardCooldown) {
      setTimeout(() => lightboxKeyboardCooldown = false, 250);
    }
  }
  if (document.getElementById('cardModal').classList.contains('active')) {
    if (e.key === 'Escape') closeModal();
  }
});

function handleLightboxDoubleTap(e) {
  e.preventDefault();
  const img = document.getElementById('lightboxImg');
  if (!img) return;
  if (lightboxScale > 1) {
    // 还原
    lightboxScale = 1;
    lightboxPanX = 0;
    lightboxPanY = 0;
    updateImageTransform(true);
  } else {
    // 双击位置放大：把点击点作为新的视觉中心
    const rect = img.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const clientX = e.changedTouches ? e.changedTouches[0].clientX : e.clientX;
    const clientY = e.changedTouches ? e.changedTouches[0].clientY : e.clientY;
    const oldScale = lightboxScale;
    lightboxScale = 2.5;
    const dx = clientX - cx;
    const dy = clientY - cy;
    lightboxPanX += dx * (1 - lightboxScale / oldScale);
    lightboxPanY += dy * (1 - lightboxScale / oldScale);
    updateImageTransform(true);
  }
}

function handleSwipeEnd(x, y) {
  const dx = x - lightboxTouchStartX;
  const dy = y - lightboxTouchStartY;
  const dt = Date.now() - lightboxTouchStartTime;

  // 单点轻触（非滑动）→ 边缘切图 or 控制栏显隐
  if (Math.abs(dx) < 12 && Math.abs(dy) < 12 && dt < 280) {
    // 手机端：单点击中边缘切图，否则切换控制栏
    if (window.innerWidth <= 600) {
      const stage = document.getElementById('lightboxStage');
      const rect = stage ? stage.getBoundingClientRect() : { left: 0, width: window.innerWidth };
      const relX = x - rect.left;
      const edgeWidth = rect.width * 0.14;
      if (relX < edgeWidth) { changePhoto(-1); return; }
      if (relX > rect.width - edgeWidth) { changePhoto(1); return; }
      // 中间区域：切换控制栏
      lightboxControlsVis = !lightboxControlsVis;
      document.getElementById('lightbox').classList.toggle('lightbox-controls-hidden', !lightboxControlsVis);
      return;
    }
    // 桌面端边缘点击
    const stage = document.getElementById('lightboxStage');
    const rect = stage ? stage.getBoundingClientRect() : { left: 0, width: window.innerWidth };
    const relX = x - rect.left;
    const edgeWidth = rect.width * 0.22;
    if (relX < edgeWidth) { changePhoto(-1); return; }
    if (relX > rect.width - edgeWidth) { changePhoto(1); return; }
    return;
  }

  // 滑动切换（仅在未缩放时）
  if (lightboxScale <= 1 && Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 50) {
    if (dx > 0) changePhoto(-1);
    else changePhoto(1);
  }
}

function initLightboxGestures() {
  const stage = document.getElementById('lightboxStage');
  if (!stage) return;

  // ===== 触摸事件（手机端） =====
  stage.addEventListener('touchstart', (e) => {
    // 双指 → 开始捏合
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      lightboxPinchStartDist = Math.sqrt(dx * dx + dy * dy);
      lightboxPinchStartScale = lightboxScale;
      lightboxTouchStartX = 0; // 放弃滑动跟踪
      return;
    }
    // 单指 → 记录起点
    lightboxTouchStartX = e.touches[0].clientX;
    lightboxTouchStartY = e.touches[0].clientY;
    lightboxTouchStartTime = Date.now();
  }, { passive: true });

  stage.addEventListener('touchmove', (e) => {
    // 双指 → 缩放
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (lightboxPinchStartDist > 0) {
        const newScale = Math.max(1, Math.min(5, lightboxPinchStartScale * (dist / lightboxPinchStartDist)));
        lightboxScale = newScale;
        updateImageTransform(false);
      }
      e.preventDefault();
      return;
    }
    // 缩放状态下单指 → 平移
    if (lightboxScale > 1 && lightboxTouchStartX) {
      const dx = e.touches[0].clientX - lightboxTouchStartX;
      const dy = e.touches[0].clientY - lightboxTouchStartY;
      lightboxPanX += dx;
      lightboxPanY += dy;
      lightboxTouchStartX = e.touches[0].clientX;
      lightboxTouchStartY = e.touches[0].clientY;
      updateImageTransform(false);
      e.preventDefault();
      return;
    }
    // 未缩放：阻止横向滚动
    if (lightboxScale <= 1 && lightboxTouchStartX) {
      const dx = e.touches[0].clientX - lightboxTouchStartX;
      if (Math.abs(dx) > 10) e.preventDefault();
    }
  }, { passive: false });

  stage.addEventListener('touchend', (e) => {
    // 还有手指在屏幕就不处理（双指松开一根时）
    if (e.touches.length > 0) {
      lightboxTouchStartX = 0;
      return;
    }
    // 双指缩放结束
    if (lightboxPinchStartDist > 0) {
      lightboxPinchStartDist = 0;
      lightboxTouchStartX = 0;
      return;
    }
    if (!lightboxTouchStartX) return;
    const touch = e.changedTouches[0];

    // 双击检测：放大/缩小
    const now = Date.now();
    if (now - lightboxLastTapTime < 300 && Math.abs(touch.clientX - lightboxTouchStartX) < 20) {
      handleLightboxDoubleTap(e);
      lightboxLastTapTime = 0;
    } else {
      lightboxLastTapTime = now;
      // 仅在未缩放时处理滑动/边缘点击切换照片
      if (lightboxScale <= 1) {
        handleSwipeEnd(touch.clientX, touch.clientY);
      }
    }
    lightboxTouchStartX = 0;
  }, { passive: true });

  // ===== 鼠标事件（桌面端） =====
  // 双击缩放
  stage.addEventListener('dblclick', (e) => {
    if (window.innerWidth <= 600) return; // 手机上走 touch 事件
    handleLightboxDoubleTap(e);
  });

  // 鼠标滚轮缩放（以光标位置为锚点）
  stage.addEventListener('wheel', (e) => {
    e.preventDefault();
    const img = document.getElementById('lightboxImg');
    if (!img) return;
    const oldScale = lightboxScale;
    const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    const newScale = Math.max(1, Math.min(6, lightboxScale * factor));
    if (newScale === oldScale) return;
    // 让光标下的图片点在缩放后仍位于光标下
    const rect = img.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = e.clientX - cx;
    const dy = e.clientY - cy;
    lightboxScale = newScale;
    lightboxPanX += dx * (1 - newScale / oldScale);
    lightboxPanY += dy * (1 - newScale / oldScale);
    if (lightboxScale === 1) { lightboxPanX = 0; lightboxPanY = 0; }
    updateImageTransform(false);
  }, { passive: false });

  // 鼠标拖动
  let mouseDown = false;
  let dragStartX = 0, dragStartY = 0;
  let dragPanX = 0, dragPanY = 0;
  stage.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    mouseDown = true;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    dragPanX = lightboxPanX;
    dragPanY = lightboxPanY;
    lightboxTouchStartX = e.clientX;
    lightboxTouchStartY = e.clientY;
    lightboxTouchStartTime = Date.now();
    if (lightboxScale > 1) {
      e.preventDefault();
      const img = document.getElementById('lightboxImg');
      if (img) img.classList.add('grabbing');
    }
  });
  window.addEventListener('mousemove', (e) => {
    if (!mouseDown) return;
    if (lightboxScale > 1) {
      // 放大状态下拖动平移
      const dx = e.clientX - dragStartX;
      const dy = e.clientY - dragStartY;
      lightboxPanX = dragPanX + dx;
      lightboxPanY = dragPanY + dy;
      updateImageTransform(false);
    }
  });
  window.addEventListener('mouseup', (e) => {
    if (!mouseDown) return;
    mouseDown = false;
    const img = document.getElementById('lightboxImg');
    if (img) img.classList.remove('grabbing');
    if (lightboxScale <= 1) handleSwipeEnd(e.clientX, e.clientY);
  });
}

initLightboxGestures();

// ==================== 相册缩略图 Ctrl+滚轮缩放 ====================
function applyAlbumZoom() {
  document.querySelectorAll('.album-photos-grid').forEach(grid => {
    grid.className = grid.className.replace(/zoom-\d/g, '').trim() + ' zoom-' + albumZoomLevel;
  });
}

function showZoomHint(text) {
  const hint = document.getElementById('zoomHint');
  if (!hint) return;
  hint.textContent = text;
  hint.style.opacity = '1';
  if (hint._timer) clearTimeout(hint._timer);
  hint._timer = setTimeout(() => { hint.style.opacity = '0'; }, 1200);
}

document.addEventListener('wheel', (e) => {
  if (!e.ctrlKey) return;
  const modal = document.getElementById('cardModal');
  if (!modal.classList.contains('active')) return;
  e.preventDefault();
  if (e.deltaY < 0 && albumZoomLevel < 5) {
    albumZoomLevel++;
  } else if (e.deltaY > 0 && albumZoomLevel > 1) {
    albumZoomLevel--;
  }
  applyAlbumZoom();
  const labels = {1: '放大', 2: '较大', 3: '适中', 4: '较小', 5: '最小'};
  showZoomHint(`缩略图：${labels[albumZoomLevel]} (${2 + albumZoomLevel}列)`);
}, { passive: false });

// ==================== 动画 ====================
const fadeElements = document.querySelectorAll('.fade-up');
const observer = new IntersectionObserver((entries) => {
  entries.forEach((entry, index) => {
    if (entry.isIntersecting) {
      setTimeout(() => { entry.target.classList.add('visible'); }, Math.min(index * 60, 300));
      observer.unobserve(entry.target);
    }
  });
}, { threshold: 0.1 });
fadeElements.forEach(el => observer.observe(el));

document.querySelectorAll('nav a').forEach(anchor => {
  anchor.addEventListener('click', function(e) {
    e.preventDefault();
    const target = document.querySelector(this.getAttribute('href'));
    if (target) target.scrollIntoView({ behavior: 'smooth' });
  });
});

// 相册模态框滚动条自动隐藏：滚动时显示，停止滚动后渐隐
(function setupModalScrollAutoHide() {
  const modalBody = document.getElementById('modalBody');
  if (!modalBody) return;
  let scrollTimeout;
  modalBody.addEventListener('scroll', function() {
    modalBody.classList.add('scrolling');
    clearTimeout(scrollTimeout);
    scrollTimeout = setTimeout(() => {
      modalBody.classList.remove('scrolling');
    }, 1000);
  }, { passive: true });
})();

// ==================== 暗黑模式 ====================
(function() {
  const toggle = document.getElementById('themeToggle');
  if (!toggle) return;
  const saved = localStorage.getItem('theme');
  if (saved === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark');
    toggle.textContent = '🌙';
  }
  toggle.addEventListener('click', function() {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    if (isDark) {
      document.documentElement.removeAttribute('data-theme');
      localStorage.setItem('theme', 'light');
      toggle.textContent = '☀️';
    } else {
      document.documentElement.setAttribute('data-theme', 'dark');
      localStorage.setItem('theme', 'dark');
      toggle.textContent = '🌙';
    }
  });
})();

// ==================== 回到顶部 + 滚动进度 ====================
(function() {
  const btn = document.getElementById('backToTop');
  const progress = document.getElementById('readProgress');
  if (!btn) return;
  let ticking = false;
  window.addEventListener('scroll', function() {
    if (!ticking) {
      requestAnimationFrame(function() {
        const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
        const docHeight = document.documentElement.scrollHeight - window.innerHeight;
        const scrollPercent = docHeight > 0 ? (scrollTop / docHeight) * 100 : 0;
        if (progress) {
          progress.style.width = scrollPercent + '%';
          progress.classList.toggle('visible', scrollPercent > 2);
        }
        btn.classList.toggle('visible', scrollTop > 400);
        ticking = false;
      });
      ticking = true;
    }
  }, { passive: true });
  btn.addEventListener('click', function() {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
})();

// ==================== 键盘快捷键 ====================
(function() {
  document.addEventListener('keydown', function(e) {
    // Esc - 关闭弹窗/灯箱
    if (e.key === 'Escape') {
      e.preventDefault();
      if (document.querySelector('.lightbox.active')) {
        closeLightbox();
      } else {
        closeModal();
      }
      return;
    }
    // ← → 导航
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      const lb = document.getElementById('lightbox');
      if (lb && lb.classList.contains('active')) {
        e.preventDefault();
        if (e.key === 'ArrowLeft') changePhoto(-1);
        else changePhoto(1);
        return;
      }
      // 文章导航
      const modal = document.getElementById('cardModal');
      if (modal && modal.classList.contains('active')) {
        const cur = modalStack[modalStack.length - 1];
        if (cur && cur.type === 'essayArticle') {
          e.preventDefault();
          if (e.key === 'ArrowLeft') {
            // 上一篇（更旧）
            var prevBtn = document.querySelector('.content-nav button:first-child');
            if (prevBtn && !prevBtn.disabled) prevBtn.click();
          } else {
            // 下一篇（更新）
            var nextBtn = document.querySelector('.content-nav button:last-child');
            if (nextBtn && !nextBtn.disabled) nextBtn.click();
          }
        }
      }
    }
  });
})();

// ==================== 文章字体大小调节 ====================
(function() {
  let currentFontSize = 1.5; // rem
  const FONT_KEY = 'essayFontSize';
  const saved = localStorage.getItem(FONT_KEY);
  if (saved) {
    currentFontSize = parseFloat(saved);
  }
  window.getEssayFontSize = function() { return currentFontSize; };
  window.changeEssayFontSize = function(delta) {
    currentFontSize = Math.max(1.0, Math.min(2.5, currentFontSize + delta));
    localStorage.setItem(FONT_KEY, currentFontSize);
    const body = document.querySelector('.modal-body .content-body');
    if (body) body.style.fontSize = currentFontSize + 'rem';
  };
  // 在文章渲染后应用字体大小
  var origUpdate = updateModalView;
  if (origUpdate) {
    var origRender = updateModalView;
    updateModalView = function() {
      origRender.apply(this, arguments);
      var cb = document.querySelector('.modal-body .content-body');
      if (cb) cb.style.fontSize = currentFontSize + 'rem';
    };
  }
})();

// ==================== 页面过渡动画 ====================
(function() {
  const overlay = document.getElementById('pageTransition');
  if (!overlay) return;
  // 淡入
  overlay.classList.add('active');
  setTimeout(function() {
    overlay.classList.remove('active');
  }, 300);
  // 监听导航链接
  document.querySelectorAll('nav a[href^="#"]').forEach(function(a) {
    a.addEventListener('click', function(e) {
      // 锚点导航 - 支持平滑滚动
      var target = document.querySelector(this.getAttribute('href'));
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth' });
      }
    });
  });
})();

