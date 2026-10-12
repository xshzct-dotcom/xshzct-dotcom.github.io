// ============================================
// Service Worker - memories/ 站点（v2）
// 策略：network-first（每次都拿最新），离线时回退缓存
// 2026-08-11：从根目录 sw.js 复制到 memories/ 并修正路径；移除旧版编辑器死文件的预缓存
// ============================================
const CACHE = 'memories-v204';
const STATIC_ASSETS = [
  '/memories/', '/memories/index.html',
  '/memories/style.css', '/data.js', '/memories/script.js',
  '/memories/editor.js', '/memories/sound.js',
  '/memories/vendor/supabase.js'   // 2026-09-10：本地托管的 Supabase SDK，预缓存保证离线/快速可用
];

/* 2026-10-12：这行是旧的公开桶常量，代码里已无人使用，删除以免误导（桶 photos 仍存在，只是前端不再依赖它） */
const SUPABASE_REST = 'https://mvzbkuhwapdqcdkekczh.supabase.co/rest/v1';
/* ★ 2026-10-12 私有媒体：图片不再放公开仓库，改放 Supabase 私有桶 ★
   URL 是固定的（/storage/v1/object/authenticated/private/<key>），
   但直接请求会被 Storage 拒（实测未登录一律 404）。
   所以由 SW 在转发时补上登录态：Authorization: Bearer <access_token>。
   —— 为什么不用官方"签名 URL"？实测签名 URL 每次都不一样（token 里带时间戳），
      URL 一变浏览器缓存就全失效，每张图都要重新下载，流量会炸。
      固定 URL + SW 补头 → URL 稳定 → 缓存命中率最高。 */
const SUPABASE_MEDIA = 'https://mvzbkuhwapdqcdkekczh.supabase.co/storage/v1/object/authenticated/private/';
const SB_ANON_KEY = 'sb_publishable_1yOf4jtKqK1GApN3InC7Gg_TUD2Barb';
const MEDIA_TOKEN_TTL = 25 * 60 * 1000;   // access_token 有效期 1 小时，这里提前 35 分钟刷新

let MEDIA_TOKEN = null, MEDIA_TOKEN_AT = 0;

/* ★ 2026-10-12：私有媒体【本地缓存】★
   为什么必须加：实测从 Supabase 拉一张 5KB 缩略图要 0.33~1.2s（项目在悉尼，
   国内到 Cloudflare 边缘节点的往返就是这个数），而浏览器同域只能并发 6 个
   → 120 张缩略图要排 20 轮 ≈ 6 秒。加了本地缓存后第二次访问基本秒开。
   响应头实测有 `CF-Cache-Status: HIT` + `Cache-Control: max-age=3600`，
   说明 CDN 层已经缓存了，瓶颈纯粹在"每张图都要付一次往返"。
   安全说明：缓存只存在【这台设备的浏览器里】，且只有登录后才会产生；
   缓存键是固定 URL、存的是图片内容本身，不含任何凭证。 */
const MEDIA_CACHE = 'private-media-v1';
/* ★ 2026-10-12：缓存配额【按类型分开】（原来是"所有资源一共 900 条"）★
   用户反馈"这次大改之后打开什么都慢了一点"，根因就在这个 900：
     缩略图（~30KB）和灯箱原图（0.5~3MB）混在同一个池子里按【条数】淘汰。
     用户在相册里点开十几张原图，就会把几十上百条缩略图挤出缓存；
     回到列表要重新下载 → 表现就是"越用越慢"，而且用的越多越明显。
   修法：分开配额 ——
     · 缩略图小、复用率最高 → 给足，能覆盖整个相册（约 2494 张）
     · 原图 / 音乐 大 → 只留最近看的一小批，防止把磁盘吃掉
   按【条数】而不是字节是因为读每条 response 的大小代价太高（要遍历 body），
   而这两类的大小量级稳定（缩略图几十 KB、原图几百 KB~几 MB），条数就够精确。 */
const MEDIA_MAX_THUMBS = 2400;   // thumbs/ 前缀：约 75MB
const MEDIA_MAX_OTHER  = 120;    // 原图 / 音乐：约 120MB

/* ★ 2026-10-12：节流 —— 原来每存一张图就 await 一次 cache.keys()（900+ 条要全量列举），
   滚动时几百次 put 就是几百次全量列举，纯浪费。现在同一时刻只跑一次，收尾时若期间又有
   新写入则再补跑一轮。 */
var _trimRunning = false, _trimAgain = false;
function trimMediaCache(cache){
  if (_trimRunning) { _trimAgain = true; return; }
  _trimRunning = true;
  cache.keys().then(function(keys){
    if (!keys.length) return;
    // 分开归类（缓存键是完整 URL，缩略图一定在 /thumbs/ 下）
    var thumbs = [], other = [];
    keys.forEach(function(k){
      if (k.url.indexOf('/thumbs/') >= 0) thumbs.push(k); else other.push(k);
    });
    var drop = [];
    if (thumbs.length > MEDIA_MAX_THUMBS) drop = drop.concat(thumbs.slice(0, thumbs.length - MEDIA_MAX_THUMBS));
    if (other.length  > MEDIA_MAX_OTHER)  drop = drop.concat(other.slice(0, other.length - MEDIA_MAX_OTHER));
    if (!drop.length) return;
    // 分批删（每批 60）—— 原来一次性 Promise.all 几百个 cache.delete，会卡住 SW
    var i = 0;
    function step(){
      if (i >= drop.length) return;
      var batch = drop.slice(i, i + 60); i += 60;
      return Promise.all(batch.map(function(k){ return cache.delete(k); })).then(step);
    }
    return step();
  }).catch(function(){}).then(function(){
    _trimRunning = false;
    if (_trimAgain) { _trimAgain = false; trimMediaCache(cache); }
  });
}

// 页面把登录后的 access_token 推给 SW
self.addEventListener('message', function(e){
  var d = e.data;
  if(d && d.type === 'media-token' && d.token){
    MEDIA_TOKEN = d.token; MEDIA_TOKEN_AT = Date.now();
  }
});

// SW 被浏览器休眠重启后内存会清空 → 向页面要一次
function askClientsForToken(){
  return self.clients.matchAll({ includeUncontrolled: true, type: 'window' }).then(function(cs){
    if(!cs.length) return null;
    return new Promise(function(resolve){
      var settled = false;
      var ch = new MessageChannel();
      var t = setTimeout(function(){ if(!settled){ settled = true; resolve(null); } }, 2000);
      ch.port1.onmessage = function(ev){
        if(settled) return; settled = true; clearTimeout(t);
        resolve((ev.data && ev.data.token) || null);
      };
      try{ cs[0].postMessage({ type: 'get-media-token' }, [ch.port2]); }
      catch(err){ if(!settled){ settled = true; clearTimeout(t); resolve(null); } }
    });
  });
}

/* ★ 2026-10-12：并发去重 ★
   页面冷启动时 SW 内存里没有 token，而首屏上百张图几乎是同时到达 ——
   原来每个请求都走一遍 askClientsForToken()，等于打 N 次 postMessage、
   建 N 个 MessageChannel。这是"打开什么都慢一点"的主因之一。
   现在共用同一个在途 Promise：第一个去要，其余都等它。 */
var _tokenPending = null;
function getMediaToken(){
  var tok = (MEDIA_TOKEN && (Date.now() - MEDIA_TOKEN_AT) < MEDIA_TOKEN_TTL) ? MEDIA_TOKEN : null;
  if (tok) return Promise.resolve(tok);
  if (_tokenPending) return _tokenPending;
  _tokenPending = askClientsForToken().then(function(t){
    if (t) { MEDIA_TOKEN = t; MEDIA_TOKEN_AT = Date.now(); }
    _tokenPending = null;
    return t;
  }).catch(function(){ _tokenPending = null; return null; });
  return _tokenPending;
}
function fetchWithToken(url, t, rangeHeader){
  var h = { 'Authorization': 'Bearer ' + t, 'apikey': SB_ANON_KEY };
  if (rangeHeader) h['Range'] = rangeHeader;
  return fetch(url, { headers: h });
}

/* ══ ★ 2026-10-12：Range 请求支持（音乐/视频播放与拖进度条）★ ══
   背景：<audio>/<video> 播放和 seek 时会发 `Range: bytes=N-`，期望拿到
        206 Partial Content。而原来 SW 对这两种情况都只给【完整 200】：
          · 缓存命中   → 直接 return hit（整文件 200）
          · 缓存未命中 → fetchWithToken() 重新构造请求，把 Range 头丢了
        后果：浏览器认为该资源"不可跳转" → 拖进度条只能从头播；
              移动端浏览器更严格，直接拒绝加载（用户实测：手机播不了、电脑才行）。
   修法：· 缓存里已有整文件 → 自己按 Range 切出 206（零网络，秒跳）
        · 缓存没有        → 带 token 把 Range 原样透传，拿服务器真正的 206
        · 206 响应【绝不】写进缓存，否则会缓存下一段残缺文件 */
function parseRange(header, size){
  var m = /bytes=(\d*)-(\d*)/.exec(header || '');
  var start = 0, end = size - 1;
  if (m) {
    if (m[1]) {                        // bytes=1000-2000 / bytes=1000-
      start = parseInt(m[1], 10);
      if (m[2]) end = parseInt(m[2], 10);
    } else if (m[2]) {                 // bytes=-1000（最后 1000 字节）
      start = Math.max(0, size - parseInt(m[2], 10));
    }
  }
  if (isNaN(start) || start < 0) start = 0;
  if (isNaN(end) || end > size - 1) end = size - 1;
  if (start > end) { start = 0; end = size - 1; }
  return { start: start, end: end };
}
function rangeFromCache(full, rangeHeader){
  return full.blob().then(function(blob){
    var size = blob.size;
    var r = parseRange(rangeHeader, size);
    var chunk = blob.slice(r.start, r.end + 1, blob.type);
    /* ⚠️ 必须原样保留原始响应头（尤其 Access-Control-Allow-Origin）——
       Media 是跨域资源，若新 Response 丢掉 CORS 头，浏览器会直接拒收。
       只改与"片段"相关的三个，再删掉 Content-Encoding（原文件若被压缩过，
       切片后的长度与它矛盾）。Content-Length 由浏览器按 body 自动算。 */
    var h = new Headers(full.headers);
    h.set('Content-Range', 'bytes ' + r.start + '-' + r.end + '/' + size);
    h.set('Accept-Ranges', 'bytes');
    h.delete('Content-Encoding');
    return new Response(chunk, { status: 206, statusText: 'Partial Content', headers: h });
  }).catch(function(){ return full; });   // 切不出来就退回整文件，至少能播
}

/* ★ 2026-10-12：缓存句柄复用 —— 原来每个请求都 caches.open() 一次 */
var _mediaCachePromise = null;
function mediaCache(){
  if (!_mediaCachePromise) _mediaCachePromise = caches.open(MEDIA_CACHE);
  return _mediaCachePromise;
}

function mediaFetch(req){
  var rangeHeader = null;
  try { rangeHeader = req.headers.get('range'); } catch(e) {}

  return mediaCache().then(function(cache){
    return cache.match(req.url).then(function(hit){

      // ① Range 请求（音频/视频 seek）→ 必须回 206，详见 rangeFromCache 上方说明
      if (rangeHeader) {
        if (hit) return rangeFromCache(hit, rangeHeader);
        return getMediaToken().then(function(t){
          if (!t) return new Response('', { status: 404, statusText: 'Not Found' });
          return fetchWithToken(req.url, t, rangeHeader).then(function(r){
            if (r.status === 400 || r.status === 401 || r.status === 403) {
              return askClientsForToken().then(function(t2){
                if (!t2) return r;
                MEDIA_TOKEN = t2; MEDIA_TOKEN_AT = Date.now();
                return fetchWithToken(req.url, t2, rangeHeader);
              });
            }
            return r;   // 206 不写缓存
          });
        });
      }

      // ② 普通整文件请求：缓存优先
      if (hit) return hit;

      // ③ 没命中 → 用登录态去取
      return getMediaToken().then(function(t){
        if (!t) return new Response('', { status: 404, statusText: 'Not Found' });
        return fetchWithToken(req.url, t).then(function(r){
          // token 可能刚好过期 → 重新要一次再试
          if (r.status === 400 || r.status === 401 || r.status === 403) {
            return askClientsForToken().then(function(t2){
              if (!t2) return r;
              MEDIA_TOKEN = t2; MEDIA_TOKEN_AT = Date.now();
              return fetchWithToken(req.url, t2);
            });
          }
          // ④ 成功就存进本地缓存（下次直接命中）
          if (r && r.status === 200) {
            var copy = r.clone();
            cache.put(req.url, copy).then(function(){ trimMediaCache(cache); }).catch(function(){});
          }
          return r;
        });
      });
    });
  });
}
// Supabase 读请求缓存名 + 有效期（5分钟内直接用缓存，后台再刷新）
const SUPABASE_CACHE = 'supabase-reads-v1';
const SUPABASE_TTL = 5 * 60 * 1000;

// Headers → 普通对象
function toObj(headers){
  const o = {};
  if(!headers || !headers.forEach) return o;
  headers.forEach(function(v, k){ o[k] = v; });
  return o;
}

self.addEventListener('install', function(e) {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE).then(function(cache) {
      // 失败也不阻塞安装
      return cache.addAll(STATIC_ASSETS).catch(function() {});
    })
  );
});

self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys().then(function(names) {
      return Promise.all(
        names.map(function(name) {
          // ★ 注意：MEDIA_CACHE（私有媒体本地缓存）必须保留，否则每次升级 SW 都要重新下载全部照片
          if (name === CACHE || name === SUPABASE_CACHE || name === MEDIA_CACHE) return;
          return caches.delete(name);
        })
      );
    })
  );
  self.clients.claim();
});

// 用时间戳判断缓存是否过期
function cacheIsFresh(cacheResp){
  if(!cacheResp) return false;
  const ts = cacheResp.headers.get('x-cache-time');
  if(!ts) return false;
  return (Date.now() - parseInt(ts)) < SUPABASE_TTL;
}

self.addEventListener('fetch', function(e) {
  const url = new URL(e.request.url);

  /* ★ 私有媒体：必须在下面"仅处理同源"那句【之前】，因为它是跨域请求 ★ */
  if (e.request.method === 'GET' && url.href.startsWith(SUPABASE_MEDIA)) {
    e.respondWith(mediaFetch(e.request));
    return;
  }

  /* ═══ 2026-09-19 ★修复★：Supabase 读请求改为【network-first】 ═══
     原来是 stale-while-revalidate —— 5 分钟内的旧结果直接返回、后台才刷新。
     后果：在编辑器里改完文章 / 发布完博客后，页面（含博客画布 iframe）立刻去查数据，
     拿到的却是 5 分钟前的旧结果 → 表现为"改了看不到 / 发布了不显示 / 刷新一下才有"✗
     现在：优先走网络（永远最新），网络失败才回退缓存（离线仍可用）。 */
  if (e.request.method === 'GET' && url.href.startsWith(SUPABASE_REST)) {
    e.respondWith(
      fetch(e.request).then(function(fresh){
        if(fresh && fresh.status === 200){
          var clone = fresh.clone();
          caches.open(SUPABASE_CACHE).then(function(cache){
            cache.put(e.request, new Response(clone.body, {
              status: clone.status, statusText: clone.statusText,
              headers: Object.assign({}, toObj(clone.headers), {'x-cache-time': String(Date.now())})
            }));
          });
        }
        return fresh;
      }).catch(function(){
        return caches.open(SUPABASE_CACHE).then(function(cache){
          return cache.match(e.request).then(function(cached){ return cached || Response.error(); });
        });
      })
    );
    return;
  }

  // 仅处理同源 GET
  if (!url.href.startsWith(self.location.origin)) return;
  if (e.request.method !== 'GET') return;

  /* ═══ 2026-09-19 ★重要★：HTML 导航请求【绕过 HTTP 缓存】 ═══
     GitHub Pages 给 .html 的响应头是 Cache-Control: max-age=600（10 分钟）。
     后果：我这边刚改完代码、甚至刚刷新，浏览器仍会用缓存里的旧 HTML →
           旧 HTML 里引的是旧的 ?v=xxx → 于是拿到的还是旧 CSS/JS →
           表现就是"我明明改了/刷了，怎么还是旧的、按钮还是点了没反应"✗
     现在：导航请求强制 cache:'no-store'，永远拿最新 HTML（只是几 KB，很快）。
     ★ 以后不会再出现"改了看不到，等十分钟才好"这种情况。 */
  if (e.request.mode === 'navigate' || url.pathname.endsWith('.html') || url.pathname.endsWith('/')) {
    e.respondWith(
      fetch(e.request, { cache: 'no-store' }).catch(function(){
        return caches.match(e.request).then(function(r){
          return r || (e.request.mode === 'navigate' ? caches.match('/memories/index.html') : null);
        });
      })
    );
    return;
  }

  // 图片（/thumbs/, /images/）：**只走网络，不缓存**
  // 之前错误地重定向到 Supabase Storage，但照片都在 GitHub 仓库里，导致 404
  if (url.pathname.startsWith('/images/') || url.pathname.startsWith('/thumbs/')) {
    e.respondWith(
      fetch(e.request, { cache: 'no-store' }).then(function(resp) {
        return resp;
      }).catch(function() {
        // 离线时回退缓存（如果之前缓存过）
        return caches.match(e.request);
      })
    );
    return;
  }

  // CSS 永远走网络、不缓存（避免旧 CSS 导致主题切换错乱）
  if(url.pathname.endsWith('.css')){
    e.respondWith(
      fetch(e.request, { cache: 'no-store' }).then(function(resp){
        return resp;
      }).catch(function(){
        return caches.match(e.request);
      })
    );
    return;
  }

  // stats.html（独立访问统计页）：走网络不缓存，确保错误诊断代码能立即生效
  if(url.pathname.endsWith('/stats.html')){
    e.respondWith(
      fetch(e.request, { cache: 'no-store' }).then(function(resp){
        return resp;
      }).catch(function(){
        return caches.match(e.request);
      })
    );
    return;
  }

  // 其他资源：network-first（先网络后缓存）
  e.respondWith(
    fetch(e.request).then(function(resp) {
      if (resp && resp.status === 200) {
        var clone = resp.clone();
        caches.open(CACHE).then(function(cache) { cache.put(e.request, clone); });
      }
      return resp;
    }).catch(function() {
      return caches.match(e.request).then(function(r) {
        return r || (e.request.mode === 'navigate' ? caches.match('/memories/index.html') : null);
      });
    })
  );
});
