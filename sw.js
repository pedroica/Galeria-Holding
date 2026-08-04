// Service worker — cache básico para abrir rápido e funcionar offline (consulta).
const CACHE = "crm-galeria-v3-3";
const ASSETS = ["/", "/index.html", "/seed.json", "/gh-core.js",
  "/block0_util.js", "/block1.js", "/block2.js", "/block3.js", "/block6.js", "/block7.js", "/block4.js", "/block5.js", "/block_blocklist.js", "/block_agente.js"];
self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS).catch(()=>{})));
  self.skipWaiting();
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener("fetch", e => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.pathname.startsWith("/api/")) return;
  // network-first com fallback de cache: sempre pega a versão nova quando online
  e.respondWith(
    fetch(e.request).then(r => {
      const copy = r.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy));
      return r;
    }).catch(() => caches.match(e.request))
  );
});
