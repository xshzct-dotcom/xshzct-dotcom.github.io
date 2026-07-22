// ===== 音乐星图 =====
(function(){
let starCtx, starW, starH, stars=[], satellites=[], satPositions=[], animId;
const SAT_COLORS = ['#ff6b6b','#ffa94d','#ffd43b','#69db7c','#4dabf7','#845ef7','#e599f7'];
function initStarMap(){
  const btn=$('#navStarMap'); if(!btn)return;
  btn.onclick = ()=>{ const el=$('#starMap'); if(el) el.classList.add('active'); if(!starCtx) setupStarMap(); };
  $('#starMapClose').onclick = ()=>{ $('#starMap').classList.remove('active'); stopStarPreview(); if(animId) cancelAnimationFrame(animId); };
  $('#starMap').onclick = function(e){ if(e.target===this) this.classList.remove('active'); };
}
function setupStarMap(){
  const canvas=$('#starMapCanvas'); if(!canvas)return;
  canvas.width=window.innerWidth; canvas.height=window.innerHeight;
  starCtx=canvas.getContext('2d');
  starW=canvas.width; starH=canvas.height;
  stars=[]; for(let i=0;i<300;i++) stars.push({x:Math.random()*starW, y:Math.random()*starH, r:Math.random()*1.8+.3, a:Math.random()*.7+.3, s:.005+Math.random()*.015});
  positionSatellites();
  renderSatellites();
  animateStars();
  window.addEventListener('resize',()=>{ canvas.width=window.innerWidth; canvas.height=window.innerHeight; starW=canvas.width; starH=canvas.height; if(satellites.length) positionSatellites(); });
}
function positionSatellites(){
  const songs=window._currentSongs||[];
  if(!songs.length) return;
  const cx=starW*.5, cy=starH*.5;
  const rx=Math.min(starW*.32, 300), ry=Math.min(starH*.25, 200);
  satPositions=[];
  satellites=songs.map((s,i)=>{
    const angle=i/songs.length*Math.PI*2-Math.PI/2;
    const x=cx+rx*Math.cos(angle), y=cy+ry*Math.sin(angle);
    const ox=(Math.random()-.5)*40, oy=(Math.random()-.5)*30;
    satPositions.push({x:x+ox, y:y+oy});
    const color=SAT_COLORS[i%SAT_COLORS.length];
    const size=24+Math.sin(i*1.5)*6;
    return {song:s, idx:i, color,size,glow:size*3};
  });
}
function renderSatellites(){
  const container=$('#starMapSatellites'); if(!container)return;
  container.innerHTML='';
  satellites.forEach((s,i)=>{
    const pos=satPositions[i];
    const el=document.createElement('div');
    el.className='satellite';
    el.style.left=(pos.x-s.size/2)+'px'; el.style.top=(pos.y-s.size/2)+'px';
    const name = esc(s.song.name||s.song.title||'');
    el.innerHTML='<div class="satellite-orb" style="--size:'+s.size+'px;--color:'+s.color+';--glow-size:'+s.glow+'px"></div><div class="satellite-label">'+name+'</div><div class="satellite-sub">'+(s.song.artist||'点击播放')+'</div>';
    let previewActive=false;
    el.addEventListener('mouseenter',()=>{ if(previewActive) return; previewActive=true; el.classList.add('hovered'); startStarPreview(s.song); });
    el.addEventListener('mouseleave',()=>{ previewActive=false; el.classList.remove('hovered'); stopStarPreview(); });
    el.addEventListener('click',(e)=>{ e.stopPropagation(); if(window.setPlaylistTo&&window._currentSongs) window.setPlaylistTo(window._currentSongs, s.idx); if(window.reloadFromSupabase) setTimeout(window.reloadFromSupabase,200); showStarPhotos(s.idx, e.clientX, e.clientY); });
    container.appendChild(el);
    requestAnimationFrame(()=>{ el.classList.add('visible'); });
  });
}
function animateStars(){
  if(!starCtx) return;
  starCtx.clearRect(0,0,starW,starH);
  stars.forEach(st=>{ st.a+=st.s; const a=Math.abs(Math.sin(st.a))*st.a*2; starCtx.fillStyle='rgba(255,255,255,'+Math.min(a,.8)+')'; starCtx.beginPath(); starCtx.arc(st.x,st.y,st.r,0,Math.PI*2); starCtx.fill(); });
  if(satPositions.length>1){
    starCtx.strokeStyle='rgba(255,255,255,.04)'; starCtx.lineWidth=.5;
    for(let i=0;i<satPositions.length;i++){
      for(let j=i+1;j<satPositions.length;j++){
        const dx=satPositions[i].x-satPositions[j].x, dy=satPositions[i].y-satPositions[j].y;
        const dist=Math.sqrt(dx*dx+dy*dy);
        if(dist<400){ starCtx.globalAlpha=Math.max(0,.08-dist/5000); starCtx.beginPath(); starCtx.moveTo(satPositions[i].x,satPositions[i].y); starCtx.lineTo(satPositions[j].x,satPositions[j].y); starCtx.stroke(); }
      }
    }
    starCtx.globalAlpha=1;
  }
  animId=requestAnimationFrame(animateStars);
}
let _previewTimer=null;
function startStarPreview(song){
  if(!bgMusic) return;
  stopStarPreview();
  window._starPrevState={isPlaying, currentIdx:currentSongIdx, src:bgMusic.src, wasPaused:!isPlaying};
  const sp=(song.storage_path||song.url||'').trim();
  let url;
  if(sp.startsWith('http')) url=sp;
  else if(sp.startsWith('music/')) url=MUSIC_BASE+sp.slice(6);
  else if(sp) url='https://mvzbkuhwapdqcdkekczh.supabase.co/storage/v1/object/public/photos/'+sp;
  else url=MUSIC_BASE+(song.name||song.title||'')+'.mp3';
  bgMusic.src=url; bgMusic.load();
  bgMusic.play().then(()=>{
    const seek=()=>{ if(bgMusic.duration){ bgMusic.currentTime=bgMusic.duration*.35; } };
    if(bgMusic.duration) seek(); else bgMusic.addEventListener('loadedmetadata', seek, {once:true});
    _previewTimer=setTimeout(()=>{ stopStarPreview(); },15000);
  }).catch(()=>{});
}
function stopStarPreview(){
  if(_previewTimer){ clearTimeout(_previewTimer); _previewTimer=null; }
  if(bgMusic&&window._starPrevState){
    bgMusic.pause();
    const st=window._starPrevState;
    if(st.src&&st.src!==bgMusic.src&&st.isPlaying){
      bgMusic.src=st.src; bgMusic.load(); bgMusic.play().catch(()=>{});
    } else if(st.wasPaused){
      bgMusic.src=st.src||''; bgMusic.load();
    }
    window._starPrevState=null;
  }
}
function showStarPhotos(songIdx, cx, cy){
  const container=$('#starPhotos'); if(!container) return;
  container.innerHTML='';
  const pool=window.allGalleryPhotos||[];
  if(pool.length===0) return;
  const picks=[]; const picked=new Set();
  while(picks.length<10&&picks.length<pool.length){
    const r=Math.floor(Math.random()*pool.length);
    if(!picked.has(r)){ picked.add(r); picks.push(pool[r]); }
  }
  picks.forEach((p,i)=>{
    const img=document.createElement('img');
    img.className='star-photo';
    img.src=full(p.path);
    const angle=i/picks.length*Math.PI*2;
    const dist=120+Math.random()*80;
    const x=cx+dist*Math.cos(angle)-40, y=cy+dist*Math.sin(angle)-40;
    img.style.left=x+'px'; img.style.top=y+'px';
    img.style.transform='rotate('+((Math.random()-.5)*20)+'deg)';
    img.style.transitionDelay=(i*.08)+'s';
    container.appendChild(img);
    requestAnimationFrame(()=> requestAnimationFrame(()=> img.classList.add('show')));
  });
  setTimeout(()=>{ container.innerHTML=''; },5000);
}
window.initStarMap=initStarMap;
setTimeout(()=>{ if(typeof initMusic==='function') initStarMap(); },100);
})();
