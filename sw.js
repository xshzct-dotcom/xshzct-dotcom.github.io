// ============================================
// Service Worker - 照片从 Supabase Storage 加载
// ============================================
const CACHE = 'blog-v5';
const STATIC_ASSETS = ['/','/index.html','/style.css','/data.js','/script.js','/essay-editor.js'];

const SUPABASE_STORAGE = 'https://mvzbkuhwapdqcdkekczh.supabase.co/storage/v1/object/public/photos';

self.addEventListener('install', function(e) {
  e.waitUntil(
    caches.open(CACHE).then(function(cache) {
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
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

// 拦截请求
self.addEventListener('fetch', function(e) {
  const url = new URL(e.request.url);

  // 图片请求 → 转到 Supabase Storage
  if (url.pathname.startsWith('/images/') || url.pathname.startsWith('/thumbs/')) {
    const supabaseUrl = SUPABASE_STORAGE + url.pathname;
    e.respondWith(
      fetch(supabaseUrl).then(function(resp) {
        if (resp && resp.ok) {
          var clone = resp.clone();
          caches.open(CACHE).then(function(cache) {
            cache.put(e.request, clone);
          });
        }
        return resp;
      }).catch(function() {
        return caches.match(e.request);
      })
    );
    return;
  }

  // 其他请求：缓存优先
  if (!url.href.startsWith(self.location.origin)) return;

  e.respondWith(
    caches.match(e.request).then(function(response) {
      return response || fetch(e.request).then(function(resp) {
        if (resp && resp.status === 200) {
          var clone = resp.clone();
          caches.open(CACHE).then(function(cache) {
            cache.put(e.request, clone);
          });
        }
        return resp;
      }).catch(function() {
        if (e.request.mode === 'navigate') return caches.match('/index.html');
      });
    })
  );
});
