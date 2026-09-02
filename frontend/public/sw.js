const CACHE_NAME = "estoq-v25";
const ASSETS_TO_CACHE = [
  "/",
  "/index.html",
  "/manifest.json",
  "/estoq.svg",
  "/pwa-icons/icon-72x72.svg",
  "/pwa-icons/icon-96x96.svg",
  "/pwa-icons/icon-128x128.svg",
  "/pwa-icons/icon-144x144.svg",
  "/pwa-icons/icon-152x152.svg",
  "/pwa-icons/icon-192x192.svg",
  "/pwa-icons/icon-384x384.svg",
  "/pwa-icons/icon-512x512.svg",
];

// Install — cache assets
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(ASSETS_TO_CACHE))
      .then(() => self.skipWaiting())
  );
});

// Activate — clean old caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

// Fetch — network-first untuk navigasi (HTML), cache-first untuk aset statis
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // API requests — network only
  if (url.pathname.startsWith("/api/")) {
    return;
  }

  // Navigasi (HTML) — selalu ambil versi terbaru dari server,
  // fallback ke cache hanya saat offline.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.status === 200 && response.type === "basic") {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() =>
          caches
            .match(request)
            .then((cached) => cached || caches.match("/index.html"))
        )
    );
    return;
  }

  // Static assets — cache first
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) {
        return cached;
      }
      return fetch(request).then((response) => {
        // Don't cache non-success responses
        if (!response || response.status !== 200 || response.type !== "basic") {
          return response;
        }
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        return response;
      });
    })
  );
});
