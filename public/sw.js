const CACHE_NAME = "ryos-cache-v4";
const ASSETS_TO_CACHE = [
  "/",
  "/index.html",
  "/styles.css",
  "/js/firebase.js",
  "/js/r2.js",
  "/js/livekit.js",
  "/js/app.js",
  "/js/pages/media.js",
  "/js/pages/backups.js",
  "/js/pages/devices.js",
  "/logo/logo.png"
];

// Install event - cache core assets.
// addAll is all-or-nothing: if any asset 404s the whole install rejects and
// the SW never activates, which can leave the page loading from a broken /
// half-cached state (the "html without css" symptom). We cache each asset
// individually so one missing file doesn't poison the whole cache.
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.all(
        ASSETS_TO_CACHE.map((url) =>
          cache.add(url).catch((err) => console.warn("[sw] cache miss:", url, err && err.message))
        )
      )
    ).then(() => self.skipWaiting())
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

// Fetch event
self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Never intercept API calls or non-GET requests — always go to network.
  if (url.pathname.includes("/api/") || req.method !== "GET") return;

  // Cache-First for Google Fonts & Material Symbols
  if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") {
    event.respondWith(
      caches.match(req).then((cached) =>
        cached ||
        fetch(req).then((resp) => {
          const clone = resp.clone();
          caches.open(CACHE_NAME).then((c) => c.put(req, clone)).catch(() => {});
          return resp;
        }).catch(() => new Response("", { status: 504 }))
      )
    );
    return;
  }

  // Browser navigations (HTML pages): network-first, fall back to cached
  // index.html so the SPA still loads offline / on flaky networks.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((resp) => {
          const clone = resp.clone();
          caches.open(CACHE_NAME).then((c) => c.put(req, clone)).catch(() => {});
          return resp;
        })
        .catch(() =>
          caches.match("/index.html").then(
            (r) => r ||
            caches.match(req).then(
              (r2) => r2 ||
              new Response("Offline", { status: 503, headers: { "Content-Type": "text/html" } })
            )
          )
        )
    );
    return;
  }

  // Same-origin static assets (css/js/img/...): stale-while-revalidate.
  // IMPORTANT: never return `undefined` — on cache-miss + network-fail that
  // resolves the response to undefined and the browser renders the page
  // without that asset (e.g. no CSS). Fall back to a clean 504 instead.
  if (url.origin === location.origin) {
    event.respondWith(
      caches.match(req).then((cached) => {
        const network = fetch(req)
          .then((resp) => {
            const clone = resp.clone();
            caches.open(CACHE_NAME).then((c) => c.put(req, clone)).catch(() => {});
            return resp;
          })
          .catch(() => cached || new Response("", { status: 504 }));
        return cached || network;
      })
    );
    return;
  }

  // Everything else: network, with a safe fallback.
  event.respondWith(fetch(req).catch(() => new Response("", { status: 504 })));
});
