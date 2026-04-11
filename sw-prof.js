const CACHE_NAME_PROF = "overlabs-prof-v10";
const URLS_TO_CACHE_PROF = [
  "./professor.html",
  "./manifest-prof.json",
  "./logo.png",
  "./icon-192.png",
  "./icon-512.png",
  "./icon-maskable-192.png",
  "./icon-maskable-512.png"
];

// Instala e cacheia os arquivos base
self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME_PROF)
      .then(cache => cache.addAll(URLS_TO_CACHE_PROF))
      .then(() => self.skipWaiting())
  );
});

// Remove caches antigos e avisa os clientes
self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME_PROF).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Escuta mensagem do app para ativar nova versão
self.addEventListener("message", event => {
  if (event.data === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

// Network first, fallback to cache
self.addEventListener("fetch", event => {
  event.respondWith(
    fetch(event.request)
      .then(response => {
        if (response.ok && event.request.method === "GET") {
          const clone = response.clone();
          caches.open(CACHE_NAME_PROF).then(cache => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
