/* ============================
   v3 — 记忆碎片 (Memory Shards)
   碎片重构：散落 → 拼合
   ============================ */
(function(){
'use strict';

function $(s,d){return(d||document).querySelector(s)}
function $$(s,d){return(d||document).querySelectorAll(s)}
function esc(s){return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}

const CDN = 'https://xshzct-dotcom.github.io';
const SB_URL = 'https://mvzbkuhwapdqcdkekczh.supabase.co';
const SB_KEY = 'sb_publishable_1yOf4jtKqK1GApN3InC7Gg_TUD2Barb';
let SB = null;

function initSupabase(){
  if(window.supabase && !SB){
    SB = window.supabase.createClient(SB_URL, SB_KEY);
  }
  if(!SB) setTimeout(initSupabase, 200);
}

// ===== 数据 =====
let allItems = []; // {title, date, body, cat, catId, type}
let allPhotos = [];
let playSongs = [];

function loadData(){
  if(typeof essayCategories === 'undefined') return;
  allItems = [];
  essayCategories.forEach(cat => {
    (cat.articles||[]).forEach(art => {
      allItems.push({...art, cat: cat.title, catId: cat.id, type: 'essay'});
    });
  });
  if(typeof travels !== 'undefined'){
    travels.forEach(art => allItems.push({...art, cat:'旅行见闻', catId:'travel', type:'essay'}));
  }
  // 排序：最新在前
  allItems.sort((a,b) => (b.date||'')>(a.date||'')?1:-1);
  // 照片
  if(typeof albums !== 'undefined'){
    albums.forEach(album => {
      (album.photos||[]).forEach(p => {
        const src = typeof p==='string' ? p : p.src||p.path;
        allPhotos.push({src, album: album.title, albumId: album.id});
      });
    });
  }
  scatterFragments();
  initMusic();
  loadFromSupabase();
}

// ===== 碎片墙核心 =====
const catAccents = {childhood:'#7F77DD', firstlove:'#C47B5A', thoughts:'#7C9B7E', travel:'#D4A853'};

function scatterFragments(){
  const wall = $('#fragWall');
  if(!wall) return;
  // 混合文章 + 照片 + 音乐
  const pieces = [];
  allItems.slice(0,25).forEach(item => {
    pieces.push({type:'essay', data:item, catId: item.catId, color: catAccents[item.catId]||'#888780', label: item.title, sub: item.date||''});
  });
  allPhotos.slice(0,15).forEach(p => {
    pieces.push({type:'photo', data:p, catId:'photo', color: '#7C9B7E', label: p.album, sub: '', src: p.src});
  });
  // 打乱
  for(let i=pieces.length-1;i>0;i--){
    const j=Math.floor(Math.random()*(i+1));
    [pieces[i],pieces[j]]=[pieces[j],pieces[i]];
  }

  const w = wall.offsetWidth || 900;
  const h = Math.max(500, pieces.length * 36);
  wall.style.height = h+'px';
  wall.innerHTML = '';

  // 随机散落位置
  const used = [];
  function randPos(wid,hei){
    for(let t=0;t<50;t++){
      const x = 10 + Math.random() * (w - wid - 20);
      const y = 20 + Math.random() * (h - hei - 20);
      if(used.every(u => Math.abs(u.x-x)>10 && Math.abs(u.y-y)>10)){
        used.push({x,y}); return {x,y};
      }
    }
    return {x:10+Math.random()*(w-wid-20), y:20+Math.random()*(h-hei-20)};
  }

  pieces.forEach((p,i) => {
    const el = document.createElement('div');
    el.className = 'fragment scattered';
    el.dataset.idx = i;
    const baseW = p.type==='photo' ? 120 : 160;
    const baseH = p.type==='photo' ? 130 : 80;
    const pos = randPos(baseW+20, baseH+20);
    const rot = (Math.random()*8-4).toFixed(1);
    el.style.cssText = `left:${pos.x}px;top:${pos.y}px;width:${baseW}px;transform:rotate(${rot}deg);--r:${rot}deg;border-left:3px solid ${p.color}`;
    el.style.animationDelay = (i*0.04)+'s';

    if(p.type==='photo'){
      const src = p.src.startsWith('http') ? p.src : CDN+'/'+p.src;
      el.innerHTML = `<div style="height:80px;background:var(--border);border-radius:4px;overflow:hidden;margin-bottom:6px">
        <img src="${esc(src)}" style="width:100%;height:100%;object-fit:cover" loading="lazy" onerror="this.style.display='none'">
      </div><div class="frag-title" style="font-size:.78rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(p.label)}</div>`;
    } else {
      el.innerHTML = `<span class="frag-type">${esc(p.data.cat)}</span>
        <div class="frag-title">${esc(p.label)}</div>
        <div class="frag-excerpt">${esc(excerpt(p.data.body,60))}</div>`;
    }
    el.onclick = () => assembleFragment(i, pieces);
    wall.appendChild(el);
  });

  window._fragPieces = pieces;
}

// ===== 拼合 =====
function assembleFragment(idx, pieces){
  const wall = $('#fragWall');
  const p = pieces[idx];
  if(!p) return;

  // 照片 → 灯箱
  if(p.type==='photo'){
    openLightbox(allPhotos.findIndex(ph => ph.src===p.data.src));
    return;
  }

  // 文章 → 弹窗
  openEssayModal(p.data);
}

// ===== 文章弹窗 =====
function openEssayModal(essay){
  const overlay=$('#essayModal');
  const content=$('#essayModalContent');
  if(!overlay||!content) return;
  const pool = allItems;
  const curIdx = pool.findIndex(t => t.title===essay.title);
  const hasPrev = curIdx>0;
  const hasNext = curIdx<pool.length-1;
  function fmtBody(b){
    if(!b) return '';
    return b.split('\n').filter(l=>l.trim()).map(l=>`<p>${esc(l)}</p>`).join('');
  }
  content.innerHTML = `
    <button class="modal-close" onclick="document.getElementById('essayModal').classList.remove('active')">✕</button>
    <div class="modal-title">${esc(essay.title)}</div>
    <div class="modal-date">${esc(essay.date||'')} · <span style="color:${catAccents[essay.catId]||'#888780'}">● ${esc(essay.cat||'')}</span></div>
    <div class="modal-body">${fmtBody(essay.body)}</div>
    <div class="modal-nav">
      <button class="modal-nav-btn" id="prevEssayBtn" ${hasPrev?'':'disabled'}>← 上一篇</button>
      <span style="color:var(--text-muted);font-size:.8rem">${curIdx+1}/${pool.length}</span>
      <button class="modal-nav-btn" id="nextEssayBtn" ${hasNext?'':'disabled'}>下一篇 →</button>
    </div>
  `;
  if(hasPrev) content.querySelector('#prevEssayBtn').onclick = () => openEssayModal(pool[curIdx-1]);
  if(hasNext) content.querySelector('#nextEssayBtn').onclick = () => openEssayModal(pool[curIdx+1]);
  overlay.classList.add('active');
  document.body.style.overflow = 'hidden';
}

function closeEssayModal(){
  $('#essayModal').classList.remove('active');
  document.body.style.overflow = '';
}

$('#essayModal').onclick = e => { if(e.target===e.currentTarget) closeEssayModal(); };
window.openEssayModal = openEssayModal;

// ===== 灯箱 =====
let _lbIdx=0, _lbPhotos=[];

function openLightbox(idx){
  const lb=$('#lightbox'), img=$('#lbImg');
  if(!lb||!img) return;
  _lbIdx = idx;
  _lbPhotos = allPhotos;
  const p = allPhotos[idx];
  if(!p) return;
  img.src = p.src.startsWith('http') ? p.src : CDN+'/'+p.src;
  lb.classList.add('active');
}

function closeLightbox(){ $('#lightbox').classList.remove('active'); }
function lbNav(d){
  _lbIdx = (_lbIdx+d+_lbPhotos.length)%_lbPhotos.length;
  openLightbox(_lbIdx);
}

$('#lightbox').onclick = e => { if(e.target===e.currentTarget) closeLightbox(); };
$('#lbClose').onclick = closeLightbox;
$('#lbPrev').onclick = () => lbNav(-1);
$('#lbNext').onclick = () => lbNav(1);
document.addEventListener('keydown', e => {
  if(e.key==='Escape') closeLightbox();
  else if(e.key==='ArrowLeft') lbNav(-1);
  else if(e.key==='ArrowRight') lbNav(1);
});

// ===== 音乐播放器 =====
function initMusic(){
  if(typeof playlist === 'undefined') return;
  const audio=$('#bgMusic'), playBtn=$('#playBtn'), title=$('#playerTitle');
  const bar=$('#playerBar'), progress=$('#playerProgress'), nextBtn=$('#nextBtn');
  if(!audio) return;
  audio.volume = 0.6;
  let songs=[], current=0, isPlaying=false;

  function loadSongs(){
    if(typeof playlist !== 'undefined' && playlist.length){
      songs = playlist.map(m => ({name:m.name, url:m.url}));
      if(songs.length && (!audio.src||audio.src===window.location.href)) playSong(0);
    }
  }

  function playSong(idx){
    if(!songs.length) return;
    current = (idx+songs.length)%songs.length;
    const s = songs[current];
    let url = s.url;
    if(url && !url.startsWith('http')) url = CDN+'/music/'+encodeURIComponent(s.name+'.mp3');
    audio.src = url; audio.load();
    if(isPlaying) audio.play().catch(()=>{});
    title.textContent = s.name||'';
  }

  function togglePlay(){
    if(!songs.length) return;
    if(isPlaying){ audio.pause(); return; }
    isPlaying = true;
    if(!audio.src||audio.readyState===0) playSong(current);
    else audio.play().catch(()=>{});
  }

  audio.addEventListener('play',()=>{isPlaying=true;playBtn.textContent='⏸';});
  audio.addEventListener('pause',()=>{isPlaying=false;playBtn.textContent='▶';});
  audio.addEventListener('ended',()=>playSong(current+1));
  audio.addEventListener('timeupdate',()=>{if(audio.duration)progress.style.width=(audio.currentTime/audio.duration*100)+'%';});
  audio.addEventListener('error',()=>setTimeout(()=>playSong(current+1),1500));
  bar.onclick = function(e){
    if(!audio.duration) return;
    var rect=bar.getBoundingClientRect();
    audio.currentTime = (e.clientX-rect.left)/rect.width*audio.duration;
  };
  playBtn.onclick = togglePlay;
  nextBtn.onclick = () => playSong(current+1);
  loadSongs();
  document.addEventListener('click',()=>{if(!isPlaying&&songs.length&&!audio.src)playSong(0);},{once:true});
}

// ===== 工具 =====
function excerpt(body,len){
  if(!body) return '';
  const t = body.replace(/<[^>]+>/g,'').replace(/\s+/g,' ').trim();
  return t.length>len ? t.slice(0,len)+'…' : t;
}

// ===== Supabase =====
async function loadFromSupabase(){
  if(!SB) return;
  try{
    const {data:essays}=await SB.from('essays').select('*').order('sort_order',{ascending:true});
    if(essays&&essays.length>0){
      const groups={};
      essays.forEach(e=>{const c=e.category||'thoughts';if(!groups[c])groups[c]={id:c,title:e.category_title||c,articles:[]};groups[c].articles.push({title:e.title,date:e.date,body:e.body});});
      const cats=Object.values(groups);
      if(typeof essayCategories!=='undefined') essayCategories.splice(0,essayCategories.length,...cats);
      loadData();
    }
    const {data:tracks}=await SB.from('music').select('*').order('sort_order',{ascending:true});
    if(tracks&&tracks.length>0){
      const nl=tracks.filter(t=>!t.album_id).map(t=>({name:t.title,url:t.storage_path.startsWith('http')?t.storage_path:t.storage_path.startsWith('music/')?CDN+'/music/'+t.storage_path.slice(6):SB_URL+'/storage/v1/object/public/photos/'+t.storage_path}));
      if(typeof playlist!=='undefined') playlist.splice(0,playlist.length,...nl);
      initMusic();
    }
  }catch(e){console.warn('[v3] loadFromSupabase:',e);}
}

initSupabase();

// ===== 导航 =====
$$('.nav-links a').forEach(a=>{a.onclick=function(){$$('.nav-links a').forEach(x=>x.classList.remove('active'));this.classList.add('active');};});

// ===== 齿轮 =====
$('#navGear').onclick=()=>{if(window.EDITOR&&window.EDITOR.open)window.EDITOR.open();};

// ===== 访客 =====
(function(){
  var key=SB_KEY,base=SB_URL+'/rest/v1/visits',entered=Date.now();
  fetch(base,{method:'POST',headers:{'apikey':key,'Authorization':'Bearer '+key,'Content-Type':'application/json','Prefer':'return=representation'},body:JSON.stringify({path:location.pathname,ref:document.referrer||'',visited_at:new Date().toISOString()})})
  .then(function(r){return r.json();}).then(function(data){
    if(data&&data[0]&&data[0].id){
      var vid=data[0].id,sent=false;
      function snd(){if(sent)return;sent=true;fetch(base+'?id=eq.'+vid,{method:'PATCH',headers:{'apikey':key,'Authorization':'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify({left_at:new Date().toISOString(),duration:Math.round((Date.now()-entered)/1000)})}).catch(function(){});}
      window.addEventListener('beforeunload',snd);
      document.addEventListener('visibilitychange',function(){if(document.hidden)snd();});
      setInterval(function(){if(!sent)fetch(base+'?id=eq.'+vid,{method:'PATCH',headers:{'apikey':key,'Authorization':'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify({duration:Math.round((Date.now()-entered)/1000)})}).catch(function(){});},10000);
    }
  }).catch(function(){});
})();

if(document.readyState==='complete') loadData();
else window.addEventListener('load',loadData);

})();
