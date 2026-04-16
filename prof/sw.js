const CACHE_NAME_PROF = "overhost-v166";
const URLS_TO_CACHE = [
  "./",
  "./index.html",
  "./manifest.json",
  "../logo.png",
  "../icon-192.png",
  "../icon-512.png",
  "../icon-maskable-192.png",
  "../icon-maskable-512.png"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME_PROF)
      .then(cache => cache.addAll(URLS_TO_CACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k.startsWith("overhost-") && k !== CACHE_NAME_PROF).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("message", event => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", event => {
  if (event.request.url.includes("googleapis.com")) return;
  if (event.request.url.includes("firebaseio.com")) return;
  if (event.request.url.includes("firebaseinstallations")) return;
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
