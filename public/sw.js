const CACHE_NAME = "ryos-cache-v2";
const ASSETS_TO_CACHE = [
  "/",
  "/index.html",
  "/styles.css",
  "/js/firebase.js",
  "/js/r2.js",
  "/js/livekit.js",
  "/js/app.js",
  "/logo/logo.png"
];

// Install event - cache core assets
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    }).then(() => self.skipWaiting())
  );
});

// Activate event - clean up old caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name))
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch event - Cache-First strategy for Google Fonts and Material Icons,
// Network-First for other requests (to ensure fresh data for APIs).
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Cache-First for Google Fonts & Material Symbols
  if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") {
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }
        return fetch(event.request).then((networkResponse) => {
          return caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, networkResponse.clone());
            return networkResponse;
          });
        });
      })
    );
    return;
  }

  // Stale-While-Revalidate for local static assets
  if (url.origin === location.origin && event.request.method === "GET" && !url.pathname.includes('/api/')) {
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        const fetchPromise = fetch(event.request).then((networkResponse) => {
          return caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, networkResponse.clone());
            return networkResponse;
          });
        }).catch(() => {});
        return cachedResponse || fetchPromise;
      })
    );
    return;
  }

  // Network-First for everything else
  event.respondWith(fetch(event.request));
});
