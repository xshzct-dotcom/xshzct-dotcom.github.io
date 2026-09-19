// ============================================
// Service Worker - memories/ 站点（v2）
// 策略：network-first（每次都拿最新），离线时回退缓存
// 2026-08-11：从根目录 sw.js 复制到 memories/ 并修正路径；移除旧版编辑器死文件的预缓存
// ============================================
const CACHE = 'memories-v180';
const STATIC_ASSETS = [
  '/memories/', '/memories/index.html',
  '/memories/style.css', '/data.js', '/memories/script.js',
  '/memories/editor.js', '/memories/sound.js',
  '/memories/vendor/supabase.js'   // 2026-09-10：本地托管的 Supabase SDK，预缓存保证离线/快速可用
];

const SUPABASE_STORAGE = 'https://mvzbkuhwapdqcdkekczh.supabase.co/storage/v1/object/public/photos';
const SUPABASE_REST = 'https://mvzbkuhwapdqcdkekczh.supabase.co/rest/v1';
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
          // 2026-09-19：旧读缓存桶（supabase-reads-v1）可能存着过期数据，一并清掉
          if (name !== CACHE && name !== SUPABASE_CACHE) return caches.delete(name);
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
