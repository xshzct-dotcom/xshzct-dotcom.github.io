// ===== 音乐星图 =====
(function(){
'use strict';
var starCtx, starW, starH, stars=[], satPositions=[], animId;
var SAT_COLORS = ['#ff6b6b','#ffa94d','#ffd43b','#69db7c','#4dabf7','#845ef7','#e599f7'];
var _previewTimer=null;

function initStarMap(){
  var btn = document.getElementById('navStarMap');
  if(!btn) return console.warn('[star] no button');
  btn.onclick = function(){ openStarMap(); };
  var close = document.getElementById('starMapClose');
  if(close) close.onclick = function(){ closeStarMap(); };
  var map = document.getElementById('starMap');
  if(map) map.onclick = function(e){ if(e.target===this) closeStarMap(); };
}

function openStarMap(){
  var el = document.getElementById('starMap');
  if(!el) return;
  el.classList.add('active');
  if(!starCtx) setupStarMap();
}

function closeStarMap(){
  var el = document.getElementById('starMap');
  if(el) el.classList.remove('active');
  stopStarPreview();
  if(animId){ cancelAnimationFrame(animId); animId=null; }
}

function setupStarMap(){
  try {
    var canvas = document.getElementById('starMapCanvas');
    if(!canvas) return;
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    starCtx = canvas.getContext('2d');
    starW = canvas.width; starH = canvas.height;
    // 星星
    stars = [];
    for(var i=0;i<300;i++){
      stars.push({
        x: Math.random()*starW, y: Math.random()*starH,
        r: Math.random()*1.8+0.3, a: Math.random()*0.7+0.3, s: 0.005+Math.random()*0.015
      });
    }
    positionSatellites();
    renderSatellites();
    animateStars();
    window.addEventListener('resize', onResize);
  } catch(e) { console.error('[star] setup error:', e); }
}

function onResize(){
  var canvas = document.getElementById('starMapCanvas');
  if(!canvas) return;
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  starW = canvas.width; starH = canvas.height;
  if(satPositions.length) positionSatellites();
}

function positionSatellites(){
  var songs = window._currentSongs;
  if(!songs || !songs.length){
    satPositions = [];
    return;
  }
  var cx = starW*0.5, cy = starH*0.5;
  var rx = Math.min(starW*0.32, 300), ry = Math.min(starH*0.25, 200);
  satPositions = [];
  for(var i=0;i<songs.length;i++){
    var angle = i/songs.length*Math.PI*2 - Math.PI/2;
    var x = cx + rx*Math.cos(angle);
    var y = cy + ry*Math.sin(angle);
    // 加一点随机偏移
    x += (Math.random()-0.5)*40;
    y += (Math.random()-0.5)*30;
    satPositions.push({
      x:x, y:y,
      color: SAT_COLORS[i % SAT_COLORS.length],
      size: 24 + Math.sin(i*1.5)*6,
      idx: i,
      song: songs[i]
    });
  }
}

function renderSatellites(){
  var container = document.getElementById('starMapSatellites');
  if(!container) return;
  container.innerHTML = '';
  if(!satPositions.length){
    container.innerHTML = '<div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);color:rgba(255,255,255,.3);font-size:.9rem;text-align:center">暂无音乐<br><span style="font-size:.7rem">上传几首歌再来吧</span></div>';
    return;
  }
  for(var i=0;i<satPositions.length;i++){
    var s = satPositions[i];
    var el = document.createElement('div');
    el.className = 'satellite';
    el.style.left = (s.x - s.size/2) + 'px';
    el.style.top = (s.y - s.size/2) + 'px';
    var name = (s.song.name || s.song.title || '');
    el.innerHTML = '<div class="satellite-orb" style="--size:'+s.size+'px;--color:'+s.color+';--glow-size:'+(s.size*3)+'px"></div>'
      + '<div class="satellite-label">'+name+'</div>'
      + '<div class="satellite-sub">'+(s.song.artist||'点击播放')+'</div>';
    // 鼠标事件
    (function(song, satEl){
      var previewActive = false;
      satEl.addEventListener('mouseenter', function(){
        if(previewActive) return;
        previewActive = true;
        satEl.classList.add('hovered');
        startStarPreview(song);
      });
      satEl.addEventListener('mouseleave', function(){
        previewActive = false;
        satEl.classList.remove('hovered');
        stopStarPreview();
      });
      satEl.addEventListener('click', function(e){
        e.stopPropagation();
        if(window.setPlaylistTo && window._currentSongs){
          window.setPlaylistTo(window._currentSongs, s.idx);
        }
        showStarPhotos(s.idx, e.clientX, e.clientY);
      });
    })(s.song, el);
    container.appendChild(el);
    // 入场动画
    (function(el2){
      setTimeout(function(){ el2.classList.add('visible'); }, 100 + i*120);
    })(el);
  }
}

function animateStars(){
  if(!starCtx) return;
  animId = requestAnimationFrame(animateStars);
  starCtx.clearRect(0, 0, starW, starH);
  // 画星星
  for(var i=0;i<stars.length;i++){
    var st = stars[i];
    st.a += st.s;
    var alpha = Math.abs(Math.sin(st.a)) * st.a * 2;
    var a = Math.min(alpha, 0.8);
    starCtx.fillStyle = 'rgba(255,255,255,'+a+')';
    starCtx.beginPath();
    starCtx.arc(st.x, st.y, st.r, 0, Math.PI*2);
    starCtx.fill();
  }
  // 画星座线
  if(satPositions.length > 1){
    starCtx.strokeStyle = 'rgba(255,255,255,.04)';
    starCtx.lineWidth = 0.5;
    for(var i=0;i<satPositions.length;i++){
      for(var j=i+1;j<satPositions.length;j++){
        var dx = satPositions[i].x - satPositions[j].x;
        var dy = satPositions[i].y - satPositions[j].y;
        var dist = Math.sqrt(dx*dx + dy*dy);
        if(dist < 400){
          starCtx.globalAlpha = Math.max(0, 0.08 - dist/5000);
          starCtx.beginPath();
          starCtx.moveTo(satPositions[i].x, satPositions[i].y);
          starCtx.lineTo(satPositions[j].x, satPositions[j].y);
          starCtx.stroke();
        }
      }
    }
    starCtx.globalAlpha = 1;
  }
}

// 副歌预览
function startStarPreview(song){
  if(!window.bgMusic) return;
  stopStarPreview();
  var bg = window.bgMusic;
  // 保存当前状态
  window._starPrevState = {
    src: bg.src,
    isPlaying: window.isPlaying || false,
    wasPaused: !window.isPlaying
  };
  // 构造 URL
  var sp = (song.storage_path || song.url || '').trim();
  var url;
  if(sp.startsWith('http')) url = sp;
  else {
    var base = window.MUSIC_BASE || 'https://xshzct-dotcom.github.io/music/';
    if(sp.startsWith('music/')) url = base + sp.slice(6);
    else if(sp) url = 'https://mvzbkuhwapdqcdkekczh.supabase.co/storage/v1/object/public/photos/' + sp;
    else url = base + (song.name || song.title || '') + '.mp3';
  }
  bg.src = url;
  bg.load();
  bg.play().then(function(){
    // 跳到 35% 副歌位置
    function seekCtx(){
      if(bg.duration) bg.currentTime = bg.duration * 0.35;
    }
    if(bg.duration) seekCtx();
    else bg.addEventListener('loadedmetadata', seekCtx, {once:true});
    _previewTimer = setTimeout(function(){ stopStarPreview(); }, 15000);
  }).catch(function(e){ console.log('[star] preview:', e.message); window._starPrevState = null; });
}

function stopStarPreview(){
  if(_previewTimer){ clearTimeout(_previewTimer); _previewTimer = null; }
  if(!window.bgMusic || !window._starPrevState) return;
  var bg = window.bgMusic;
  bg.pause();
  var st = window._starPrevState;
  if(st.src && st.src !== bg.src && st.isPlaying){
    bg.src = st.src;
    bg.load();
    bg.play().catch(function(){});
  } else if(st.wasPaused){
    bg.src = st.src || '';
    bg.load();
  }
  window._starPrevState = null;
}

// 点击卫星显示照片漩涡
function showStarPhotos(idx, cx, cy){
  var container = document.getElementById('starPhotos');
  if(!container) return;
  container.innerHTML = '';
  var pool = window.allGalleryPhotos || [];
  if(!pool.length) return;
  // 随机选 8 张
  var picked = [];
  var used = {};
  while(picked.length < 8 && picked.length < pool.length){
    var r = Math.floor(Math.random() * pool.length);
    if(!used[r]){ used[r] = true; picked.push(pool[r]); }
  }
  for(var i=0;i<picked.length;i++){
    var img = document.createElement('img');
    img.className = 'star-photo';
    var path = picked[i].path || '';
    img.src = (window.full || function(p){ return p; })(path);
    var angle = i / picked.length * Math.PI * 2;
    var dist = 120 + Math.random() * 80;
    var x = cx + dist * Math.cos(angle) - 40;
    var y = cy + dist * Math.sin(angle) - 40;
    img.style.left = x + 'px';
    img.style.top = y + 'px';
    img.style.transform = 'rotate('+((Math.random()-0.5)*20)+'deg)';
    img.style.transitionDelay = (i*0.08) + 's';
    container.appendChild(img);
    // 延迟触发动画
    (function(im){
      setTimeout(function(){ im.classList.add('show'); }, 50);
    })(img);
  }
  // 5 秒后清空
  setTimeout(function(){ container.innerHTML = ''; }, 5000);
}

// 初始化
document.addEventListener('DOMContentLoaded', function(){
  initStarMap();
});
})();
