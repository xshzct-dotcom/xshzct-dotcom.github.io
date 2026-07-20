/* =========================================
   音乐管理器（上传、分配到相册/主页、排序）
   ========================================= */
(function() {
  'use strict';

  const SB_URL = 'https://mvzbkuhwapdqcdkekczh.supabase.co';
  const SB_KEY = 'sb_publishable_1yOf4jtKqK1GApN3InC7Gg_TUD2Barb';
  const STORAGE_URL = SB_URL + '/storage/v1/object/public';
  let sb;
  try { sb = supabase.createClient(SB_URL, SB_KEY); }
  catch(e) { console.warn('[music]', e); return; }

  let tracks = [];
  let playlists = [];  // 播放列表: { id: 'main'|albumId, title }
  let currentPlaylist = null;
  let loaded = false;
  let editMode = false;

  const CSS = document.createElement('style');
  CSS.textContent = `
.music-overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,.8);z-index:10002;flex-direction:column;backdrop-filter:blur(6px)}
.music-overlay.show{display:flex}
.music-header{display:flex;align-items:center;padding:14px 18px;background:rgba(0,0,0,.3);flex-shrink:0;border-bottom:1px solid rgba(255,255,255,.06)}
.music-header h2{color:#fff;font-size:17px;font-weight:600;margin:0;flex:1}
.music-header button{width:34px;height:34px;border:none;border-radius:8px;background:rgba(255,255,255,.08);color:rgba(255,255,255,.6);font-size:16px;cursor:pointer;display:flex;align-items:center;justify-content:center;margin-left:8px}
.music-header button:hover{background:rgba(255,255,255,.16);color:#fff}
.music-body{flex:1;overflow-y:auto;padding:16px}
.music-toolbar{display:flex;gap:6px;padding:10px 16px;background:rgba(0,0,0,.2);flex-shrink:0;flex-wrap:wrap;border-top:1px solid rgba(255,255,255,.05)}
.music-toolbar button{padding:8px 16px;border:1px solid rgba(255,255,255,.15);border-radius:8px;background:rgba(255,255,255,.06);color:rgba(255,255,255,.7);font-size:13px;cursor:pointer;transition:all .2s;font-family:inherit}
.music-toolbar button:hover{background:rgba(255,255,255,.12);color:#fff}
.music-toolbar .pri{background:#fff;color:#1a1a1a;border:none}
.music-toolbar .pri:hover{background:#e8e8e8!important;color:#1a1a1a!important}

.playlist-list{display:flex;flex-direction:column;gap:8px}
.playlist-item{display:flex;align-items:center;gap:10px;padding:12px 14px;background:rgba(255,255,255,.04);border-radius:10px;cursor:pointer;transition:all .2s;border:1px solid rgba(255,255,255,.05)}
.playlist-item:hover{background:rgba(255,255,255,.08);border-color:rgba(255,255,255,.12)}
.playlist-item .icon{font-size:24px;width:36px;text-align:center}
.playlist-item .info{flex:1}
.playlist-item .info .name{color:#fff;font-size:15px;font-weight:500}
.playlist-item .info .count{color:rgba(255,255,255,.4);font-size:12px;margin-top:2px}
.playlist-item .arrow{color:rgba(255,255,255,.3);font-size:18px}

.track-list{display:flex;flex-direction:column;gap:6px}
.track-item{display:flex;align-items:center;gap:10px;padding:10px 12px;background:rgba(255,255,255,.04);border-radius:8px;border:1px solid rgba(255,255,255,.05)}
.track-item.dragging{opacity:.5}
.track-item .num{color:rgba(255,255,255,.3);font-size:12px;width:20px;text-align:center}
.track-item .info{flex:1}
.track-item .info .title{color:#fff;font-size:14px}
.track-item .info .artist{color:rgba(255,255,255,.4);font-size:12px;margin-top:1px}
.track-item .actions{display:flex;gap:4px}
.track-item .actions button{padding:4px 8px;border:1px solid rgba(255,255,255,.1);border-radius:4px;background:transparent;color:rgba(255,255,255,.5);font-size:11px;cursor:pointer;transition:all .2s}
.track-item .actions button:hover{color:#fff;background:rgba(255,255,255,.1)}
.track-item .actions .del{border-color:rgba(255,80,80,.25);color:rgba(255,130,130,.7)}
.track-item .actions .del:hover{background:rgba(255,50,50,.15)!important;color:#ff7a7a}

input[type=file].music-upload{display:none}
`;
  document.head.appendChild(CSS);

  // ===== DOM =====
  const HTML = `
  <div class="music-overlay" id="musicOverlay">
    <div class="music-header">
      <h2 id="musicTitle">🎵 音乐管理</h2>
      <button id="musicCloseBtn">✕</button>
    </div>
    <div class="music-body" id="musicBody"></div>
    <div class="music-toolbar" id="musicToolbar"></div>
  </div>
  <input type="file" class="music-upload" id="musicUploadInput" accept="audio/*">`;
  const d = document.createElement('div');
  d.innerHTML = HTML;
  document.body.appendChild(d.firstElementChild);
  document.body.appendChild(d.lastElementChild);

  // ===== 数据 =====
  async function loadTracks() {
    const { data } = await sb.from('music').select('*').order('sort_order');
    tracks = data || [];
    // 整理播放列表
    const plMap = { 'main': { id: 'main', title: '🏠 主页', icon: '🏠', items: [] } };
    // 加载相册列表
    const { data: albums } = await sb.from('albums').select('id,title');
    (albums || []).forEach(a => {
      plMap[a.id] = { id: a.id, title: a.title, icon: '📸', items: [] };
    });
    tracks.forEach(t => {
      const key = t.album_id || 'main';
      if (plMap[key]) plMap[key].items.push(t);
      else plMap['main'].items.push(t);
    });
    playlists = Object.values(plMap);
    for (const pl of playlists) {
      // 排序
      pl.items.sort((a, b) => a.sort_order - b.sort_order);
    }
  }

  // ===== 渲染 =====
  function renderPlaylists() {
    const body = document.getElementById('musicBody');
    const tb = document.getElementById('musicToolbar');
    currentPlaylist = null;
    document.getElementById('musicTitle').textContent = '🎵 音乐管理';

    body.innerHTML = '<div class="playlist-list">' + playlists.map(pl => `
      <div class="playlist-item" onclick="MUSIC.open('${pl.id}')">
        <div class="icon">${pl.icon}</div>
        <div class="info">
          <div class="name">${pl.title}</div>
          <div class="count">${pl.items.length} 首</div>
        </div>
        <div class="arrow">›</div>
      </div>`).join('') + '</div>';
    tb.innerHTML = '<button class="pri" onclick="MUSIC.upload()">📤 上传音乐</button>';
  }

  async function renderPlaylist(playlistId) {
    currentPlaylist = playlistId;
    const pl = playlists.find(p => p.id == playlistId);
    if (!pl) return;
    document.getElementById('musicTitle').textContent = '🎵 ' + pl.title;

    const body = document.getElementById('musicBody');
    const tb = document.getElementById('musicToolbar');

    if (pl.items.length === 0) {
      body.innerHTML = '<div style="text-align:center;padding:60px 20px;color:rgba(255,255,255,.3)"><div style="font-size:48px;margin-bottom:16px">🎶</div><p>暂无音乐<br><span style="font-size:13px">点击下方上传</span></p></div>';
    } else {
      body.innerHTML = '<div class="track-list">' + pl.items.map((t, i) => `
        <div class="track-item" draggable="true" data-id="${t.id}"
             ondragstart="MUSIC.dragStart(event,${i})"
             ondragover="event.preventDefault()"
             ondrop="MUSIC.dragDrop(event,${i})">
          <div class="num">${i + 1}</div>
          <div class="info">
            <div class="title">${esc(t.title)}</div>
            <div class="artist">${esc(t.artist || '未知')}</div>
          </div>
          <div class="actions">
            <button onclick="MUSIC.play('${t.storage_path}')">▶</button>
            <button class="del" onclick="MUSIC.del(${t.id})">🗑</button>
          </div>
        </div>`).join('') + '</div>';
    }

    tb.innerHTML = `
      <button class="pri" onclick="MUSIC.upload()">📤 上传</button>
      <button onclick="MUSIC.back()">← 返回</button>
    `;
  }

  // ===== 操作 =====
  function show() { document.getElementById('musicOverlay').classList.add('show'); renderPlaylists(); }
  function hide() { document.getElementById('musicOverlay').classList.remove('show'); }
  function back() { renderPlaylists(); }

  document.getElementById('musicCloseBtn').onclick = hide;

  async function uploadMusic() {
    document.getElementById('musicUploadInput').click();
  }

  document.getElementById('musicUploadInput').onchange = async (e) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    for (const file of files) {
      try {
        const fname = 'music/' + Date.now() + '_' + Math.random().toString(36).slice(2, 8) + '.mp3';
        const { error: upErr } = await sb.storage.from('photos').upload(fname, file, {
          contentType: file.type || 'audio/mpeg',
          upsert: false,
        });
        if (upErr) { alert('上传失败: ' + upErr.message); continue; }

        const target = currentPlaylist || 'main';
        const { error: dbErr } = await sb.from('music').insert({
          title: file.name.replace(/\.\w+$/, ''),
          artist: '',
          album_id: target === 'main' ? null : target,
          storage_path: fname,
          sort_order: -(Date.now()),
        });
        if (dbErr) alert('记录失败: ' + dbErr.message);
      } catch(err) { console.warn(err); }
    }
    e.target.value = '';
    await loadTracks();
    if (currentPlaylist) renderPlaylist(currentPlaylist);
    else renderPlaylists();
  };

  function playTrack(storagePath) {
    const url = `${STORAGE_URL}/photos/${storagePath}`;
    const audio = new Audio(url);
    audio.play();
  }

  async function delTrack(id) {
    if (!confirm('确定删除这首音乐？')) return;
    const t = tracks.find(x => x.id === id);
    if (t) await sb.storage.from('photos').remove([t.storage_path]);
    await sb.from('music').delete().eq('id', id);
    await loadTracks();
    if (currentPlaylist) renderPlaylist(currentPlaylist);
    else renderPlaylists();
  }

  // ===== 拖拽排序 =====
  let dragTrackIdx = null;

  function dragStart(e, idx) {
    dragTrackIdx = idx;
    e.dataTransfer.effectAllowed = 'move';
    e.currentTarget.classList.add('dragging');
  }

  async function dragDrop(e, dropIdx) {
    e.preventDefault();
    document.querySelectorAll('.track-item.dragging').forEach(el => el.classList.remove('dragging'));
    if (dragTrackIdx === null || dragTrackIdx === dropIdx) return;

    const pl = playlists.find(p => p.id == currentPlaylist);
    if (!pl) return;

    const from = pl.items[dragTrackIdx];
    const to = pl.items[dropIdx];
    if (from && to) {
      const fromOrder = from.sort_order;
      const toOrder = to.sort_order;
      await sb.from('music').update({ sort_order: toOrder }).eq('id', from.id);
      await sb.from('music').update({ sort_order: fromOrder }).eq('id', to.id);
      await loadTracks();
      renderPlaylist(currentPlaylist);
    }
    dragTrackIdx = null;
  }

  // ===== 触发按钮 =====
  function addTrigger() {
    if (document.getElementById('music-pen')) return;
    const pen = document.createElement('div');
    pen.id = 'music-pen';
    pen.textContent = '🎵';
    pen.title = '音乐管理';
    pen.style.cssText = 'position:fixed;bottom:124px;right:24px;width:44px;height:44px;border-radius:50%;border:1px solid rgba(255,255,255,.15);background:rgba(255,255,255,.07);color:rgba(255,255,255,.4);font-size:20px;cursor:pointer;z-index:9999;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);transition:all .3s;user-select:none;-webkit-user-select:none;box-shadow:0 2px 12px rgba(0,0,0,.2);touch-action:manipulation';
    pen.onmouseenter = () => { pen.style.background = 'rgba(255,255,255,.18)'; pen.style.color = '#fff'; };
    pen.onmouseleave = () => { pen.style.background = 'rgba(255,255,255,.07)'; pen.style.color = 'rgba(255,255,255,.4)'; };
    pen.onclick = () => MUSIC.show();
    document.body.appendChild(pen);
  }

  // ===== 工具 =====
  function esc(s) { return (s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  // ===== 暴露 =====
  window.MUSIC = {
    show, hide, back,
    open: renderPlaylist,
    upload: uploadMusic,
    play: playTrack,
    del: delTrack,
    dragStart, dragDrop,
  };

  async function init() {
    if (loaded) return;
    loaded = true;
    await loadTracks();
    // 检查是否需要导入现有音乐
    const { count } = await sb.from('music').select('id', { count: 'exact', head: true });
    if (count === 0) {
      // 导入 data.js 里的现有音乐
      if (typeof playlist !== 'undefined' && playlist.length > 0) {
        for (const s of playlist) {
          const filename = decodeURIComponent(s.url.split('/').pop());
          const mp3Path = 'music/' + filename;
          const { error } = await sb.from('music').insert({
            title: s.name, artist: '',
            album_id: null, storage_path: mp3Path,
            sort_order: -Date.now(),
          });
        }
        console.log('[music] 导入主页音乐');
      }
      // 导入相册音乐（data.js 里的 firstlove.songs / friends.songs）
      if (typeof albums !== 'undefined') {
        for (const album of albums) {
          if (album.albums) {
            for (const sub of album.albums) {
              if (sub.songs && sub.songs.length > 0) {
                for (const s of sub.songs) {
                  const { error } = await sb.from('music').insert({
                    title: s.artist + ' - ' + s.name,
                    artist: s.artist,
                    album_id: null,
                    storage_path: 'music/' + encodeURIComponent(s.name) + '.mp3',
                    sort_order: -(Date.now()),
                  });
                }
                console.log('[music] 导入相册音乐:', sub.name);
              }
            }
          }
        }
      }
      await loadTracks();
    }
    addTrigger();
  }

  if (document.readyState === 'complete') init();
  else window.addEventListener('load', init);
})();
