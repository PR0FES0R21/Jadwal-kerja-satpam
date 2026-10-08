const CACHE='jaga-shell-__JAGA_BUILD__';
const SHELL_FILES=[/*__JAGA_PRECACHE__*/'/', '/offline.html', '/favicon.svg', '/manifest.webmanifest', '/icon-192.png', '/icon-512.png'];
const SHELL_PATHS=new Set(SHELL_FILES);
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL_FILES.map(path=>new Request(path,{cache:'reload'}))))));
self.addEventListener('message',event=>{if(event.data?.type==='SKIP_WAITING')self.skipWaiting();});
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('jaga-shell-')&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
  const request=event.request,url=new URL(request.url);
  if(request.method!=='GET'||url.origin!==self.location.origin||/^\/(api|auth|state|versions|health|ready)(\/|$)/.test(url.pathname))return;
  if(request.mode==='navigate'){
    // Each worker serves the HTML that was cached with its matching assets.
    // A new build becomes active after the visitor chooses to update.
    event.respondWith(caches.open(CACHE).then(async cache=>{
      const saved=await cache.match('/');if(saved)return saved;
      try{return await fetch(request);}catch{return await cache.match('/offline.html')||new Response('Jaga belum tersimpan untuk offline. Buka aplikasi saat terhubung internet.',{status:503,headers:{'content-type':'text/plain;charset=utf-8'}});}
    }));return;
  }
  if(SHELL_PATHS.has(url.pathname)||url.pathname.startsWith('/assets/'))event.respondWith(caches.open(CACHE).then(async cache=>{
    const saved=await cache.match(request);if(saved)return saved;
    const response=await fetch(request);if(response.ok&&response.type==='basic')await cache.put(request,response.clone());return response;
  }));
});
