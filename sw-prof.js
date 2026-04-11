// SW-PROF auto-destruição: limpa caches antigos e desregistra a si mesmo
// O professor agora usa sw.js como Service Worker
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k.includes("prof")).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
    .then(() => self.registration.unregister())
  );
});
