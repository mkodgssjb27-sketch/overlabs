// Firebase Messaging no Service Worker
importScripts("https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyAc9Ews7WVz6GSBp9vzXF4sFI1SMwzklX0",
  authDomain: "carolampra.firebaseapp.com",
  projectId: "carolampra",
  storageBucket: "carolampra.firebasestorage.app",
  messagingSenderId: "821388549140",
  appId: "1:821388549140:web:3f60aa294f6f67949adb01"
});

const messaging = firebase.messaging();

// Notificação push recebida em background
messaging.onBackgroundMessage(payload => {
  const title = payload.data?.title || "🔔 OVER LABS";
  const options = {
    body: payload.data?.body || "",
    icon: "icon-192.png",
    badge: "icon-192.png",
    vibrate: [200, 100, 200],
    tag: "overlabs-push-" + Date.now(),
    renotify: true,
    data: payload.data || {}
  };
  return self.registration.showNotification(title, options);
});

const CACHE_NAME = "overlabs-v297";
const URLS_TO_CACHE = [
  "./aluno.html",
  "./manifest.json",
  "./logo.png",
  "./icon-192.png",
  "./icon-512.png",
  "./icon-maskable-192.png",
  "./icon-maskable-512.png"
];

// Instala e cacheia os arquivos base
self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(URLS_TO_CACHE))
      .then(() => self.skipWaiting())
  );
});

// Remove apenas caches antigos do aluno (overlabs-*) e limpa entradas de /prof/ e /cuts/
self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k.startsWith("overlabs-") && k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => caches.open(CACHE_NAME)).then(cache =>
      cache.keys().then(reqs => Promise.all(reqs.filter(r => r.url.includes("/prof/") || r.url.includes("/cuts/")).map(r => cache.delete(r))))
    ).then(() => self.clients.claim())
  );
});

// Escuta mensagem do app para ativar nova versão
self.addEventListener("message", event => {
  if (event.data === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

// Clique na notificação abre o app
self.addEventListener("notificationclick", event => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then(clientList => {
      for (const client of clientList) {
        if (client.url.includes("aluno.html") && "focus" in client) return client.focus();
      }
      return clients.openWindow("./aluno.html");
    })
  );
});

// Network first p/ HTML (atualizacoes instantaneas), stale-while-revalidate p/ assets (load instantaneo)
// Ignora requests do /prof/, /cuts/ e Firebase APIs
self.addEventListener("fetch", event => {
  const req = event.request;
  const url = req.url;
  if (req.method !== "GET") return;
  if (url.includes("/prof/")) return;
  if (url.includes("/cuts/")) return;
  if (url.includes("googleapis.com")) return;
  if (url.includes("firebaseio.com")) return;
  if (url.includes("firebaseinstallations")) return;
  if (url.includes("gstatic.com")) return;

  const isHTML = req.destination === "document" || url.endsWith(".html") || url.endsWith("/");
  if (isHTML) {
    // Network-first com fallback ao cache (mantem updates rapidos)
    event.respondWith(
      fetch(req).then(response => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(req, clone));
        }
        return response;
      }).catch(() => caches.match(req))
    );
    return;
  }

  // Stale-while-revalidate p/ JS/CSS/img: serve cache instantaneo, atualiza em background
  event.respondWith(
    caches.match(req).then(cached => {
      const fetchPromise = fetch(req).then(response => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(req, clone));
        }
        return response;
      }).catch(() => cached);
      return cached || fetchPromise;
    })
  );
});