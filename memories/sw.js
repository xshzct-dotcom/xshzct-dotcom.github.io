// ============================================
// Service Worker - memories/ 站点（v2）
// 策略：network-first（每次都拿最新），离线时回退缓存
// 2026-08-11：从根目录 sw.js 复制到 memories/ 并修正路径；移除旧版编辑器死文件的预缓存
// ============================================
const CACHE = 'memories-v58';
const STATIC_ASSETS = [
  '/memories/', '/memories/index.html',
  '/memories/style.css', '/data.js', '/memories/script.js',
  '/memories/editor.js', '/memories/sound.js'
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
          // 保留 Supabase 读缓存，其它旧缓存删除
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

  // Supabase REST 读请求（GET）：stale-while-revalidate
  // 5分钟内的缓存直接用（快），同时后台刷新；无缓存或过期就走网络
  if (e.request.method === 'GET' && url.href.startsWith(SUPABASE_REST)) {
    e.respondWith(
      caches.open(SUPABASE_CACHE).then(function(cache){
        return cache.match(e.request).then(function(cached){
          if(cacheIsFresh(cached)){
            // 命中缓存：立即返回 + 后台刷新
            fetch(e.request).then(function(fresh){
              if(fresh && fresh.status === 200){
                var clone = fresh.clone();
                cache.put(e.request, new Response(clone.body, {
                  status: clone.status, statusText: clone.statusText,
                  headers: Object.assign({}, toObj(clone.headers), {'x-cache-time': String(Date.now())})
                }));
              }
            }).catch(function(){});
            return cached;
          }
          // 无缓存：走网络，成功后存缓存
          return fetch(e.request).then(function(fresh){
            if(fresh && fresh.status === 200){
              var clone = fresh.clone();
              cache.put(e.request, new Response(clone.body, {
                status: clone.status, statusText: clone.statusText,
                headers: Object.assign({}, toObj(clone.headers), {'x-cache-time': String(Date.now())})
              }));
            }
            return fresh;
          }).catch(function(){
            return cached || Response.error();
          });
        });
      })
    );
    return;
  }

  // 仅处理同源 GET
  if (!url.href.startsWith(self.location.origin)) return;
  if (e.request.method !== 'GET') return;

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
