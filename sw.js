// ============================================
// Service Worker - 照片从 Supabase Storage 加载
// 策略：network-first（每次都拿最新），离线时回退缓存
// 2026-07-21 升级：从 cache-first 改为 network-first，解决"改了却看不到"的缓存锁死
// ============================================
const CACHE = 'blog-v6';
const STATIC_ASSETS = [
  '/', '/index.html',
  '/style.css', '/data.js', '/script.js',
  '/essay-editor.js', '/album-editor.js', '/music-editor.js', '/settings-menu.js'
];

const SUPABASE_STORAGE = 'https://mvzbkuhwapdqcdkekczh.supabase.co/storage/v1/object/public/photos';

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
          if (name !== CACHE) return caches.delete(name);
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', function(e) {
  const url = new URL(e.request.url);

  // 图片请求 → 转到 Supabase Storage（缓存作为兜底）
  if (url.pathname.startsWith('/images/') || url.pathname.startsWith('/thumbs/')) {
    const supabaseUrl = SUPABASE_STORAGE + url.pathname;
    e.respondWith(
      fetch(supabaseUrl).then(function(resp) {
        if (resp && resp.ok) {
          var clone = resp.clone();
          caches.open(CACHE).then(function(cache) { cache.put(e.request, clone); });
        }
        return resp;
      }).catch(function() {
        return caches.match(e.request);
      })
    );
    return;
  }

  // 仅处理同源 GET
  if (!url.href.startsWith(self.location.origin)) return;
  if (e.request.method !== 'GET') return;

  // network-first：先取网络最新，失败再回退缓存（离线可用）
  e.respondWith(
    fetch(e.request).then(function(resp) {
      if (resp && resp.status === 200) {
        var clone = resp.clone();
        caches.open(CACHE).then(function(cache) { cache.put(e.request, clone); });
      }
      return resp;
    }).catch(function() {
      return caches.match(e.request).then(function(r) {
        return r || (e.request.mode === 'navigate' ? caches.match('/index.html') : null);
      });
    })
  );
});
