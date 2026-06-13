const CACHE_NAME_PROF = "overhost-v224";
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

// Network-first p/ HTML, stale-while-revalidate p/ assets estaticos
self.addEventListener("fetch", event => {
  const req = event.request;
  const url = req.url;
  if (req.method !== "GET") return;
  if (url.includes("googleapis.com")) return;
  if (url.includes("firebaseio.com")) return;
  if (url.includes("firebaseinstallations")) return;
  if (url.includes("gstatic.com")) return;
  if (url.includes("unpkg.com")) return;

  const isHTML = req.destination === "document" || url.endsWith(".html") || url.endsWith("/");
  if (isHTML) {
    event.respondWith(
      fetch(req).then(response => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME_PROF).then(cache => cache.put(req, clone));
        }
        return response;
      }).catch(() => caches.match(req))
    );
    return;
  }

  // Stale-while-revalidate
  event.respondWith(
    caches.match(req).then(cached => {
      const fetchPromise = fetch(req).then(response => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME_PROF).then(cache => cache.put(req, clone));
        }
        return response;
      }).catch(() => cached);
      return cached || fetchPromise;
    })
  );
});
