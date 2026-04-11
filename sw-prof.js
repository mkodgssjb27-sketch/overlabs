const CACHE_NAME_PROF = "overlabs-prof-v15";
const URLS_TO_CACHE_PROF = [
  "./professor.html",
  "./manifest-prof.json",
  "./logo.png",
  "./icon-192.png",
  "./icon-512.png",
  "./icon-maskable-192.png",
  "./icon-maskable-512.png"
];

// Instala e cacheia os arquivos do professor
self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME_PROF)
      .then(cache => cache.addAll(URLS_TO_CACHE_PROF))
      .then(() => self.skipWaiting())
  );
});

// Remove apenas caches antigos do PROFESSOR (overlabs-prof-*), nunca do aluno
self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k.startsWith("overlabs-prof-") && k !== CACHE_NAME_PROF).map(k => caches.delete(k)))
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
