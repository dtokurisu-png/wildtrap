const CACHE='wildtrap-mobile-shell-v1';
const CORE=['./mobile.html','./mobile.mjs','./mobile-cliffs.mjs','./mobile-install.mjs','./manifest.webmanifest'];
self.addEventListener('install',e=>e.waitUntil((async()=>{
 const c=await caches.open(CACHE);await Promise.all(CORE.map(x=>c.add(x).catch(()=>{})));await self.skipWaiting();
})()));
self.addEventListener('activate',e=>e.waitUntil((async()=>{
 await Promise.all((await caches.keys()).filter(x=>x.startsWith('wildtrap-mobile-shell-')&&x!==CACHE).map(x=>caches.delete(x)));
 await self.clients.claim();
})()));
self.addEventListener('fetch',e=>{
 if(e.request.method!=='GET')return;
 const u=new URL(e.request.url);
 if(u.origin!==self.location.origin||!u.pathname.startsWith(new URL(self.registration.scope).pathname))return;
 if(u.pathname.includes('/assets/')||u.pathname.endsWith('/version.json'))return;
 if(e.request.mode!=='navigate'&&!/\.(?:html|mjs|js|css|webmanifest)$/i.test(u.pathname))return;
 e.respondWith((async()=>{
  try{const response=await fetch(e.request,{cache:'no-store'});
   if(response.ok)(await caches.open(CACHE)).put(e.request,response.clone());
   return response;
  }catch(_){return await caches.match(e.request)||Response.error()}
 })());
});
