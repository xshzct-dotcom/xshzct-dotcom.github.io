/* ══════════════════════════════════════════════════════════════════
   2026-09-19：根目录这个 Service Worker 是【v1 老站】留下的，作用域是 "/"，
   它会缓存旧文件、并且和 memories/sw.js 共用同一个 Supabase 读缓存桶
   （supabase-reads-v1）—— 两个 SW 抢同一个缓存，很容易出现"改了看不到"。
   v1 站现在只剩一个跳转页，不再需要 SW，所以这里改成【自杀式注销】：
   任何浏览器只要还装着它，下次更新检查时就会自动清空缓存并注销自己。
   ══════════════════════════════════════════════════════════════════ */
self.addEventListener('install', function(e){ self.skipWaiting(); });

self.addEventListener('activate', function(e){
  e.waitUntil((async function(){
    // 1) 删掉本 SW 建过的所有缓存
    try{
      var keys = await caches.keys();
      await Promise.all(keys.map(function(k){ return caches.delete(k); }));
    }catch(err){}
    // 2) 注销自己
    try{ await self.registration.unregister(); }catch(err){}
    // 3) 让当前受控页面解脱（不带 SW 重新加载一次，之后本文件不会再被使用）
    try{
      var cs = await self.clients.matchAll({type:'window'});
      cs.forEach(function(c){ try{ c.navigate(c.url); }catch(e){} });
    }catch(err){}
  })());
});

// 不再拦截任何请求（全部直连网络）
self.addEventListener('fetch', function(){});
