/**
 * Service Worker — offline support and caching for The Edge PWA.
 *
 * CACHE_NAME must be bumped on each deploy so that the activate event
 * purges stale caches.  Change the version string (e.g. edge-v3, edge-v4)
 * whenever you ship new assets.  A CI step can automate this.
 */

const CACHE_NAME = "edge-v2";

const SHELL_ASSETS = [
  "/",
  "/login",
  "/manifest.json",
  "/icon-192.png",
  "/icon-512.png",
];

// ---------------------------------------------------------------------------
// Offline fallback HTML — self-contained, no external dependencies
// ---------------------------------------------------------------------------
const OFFLINE_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>The Edge — Offline</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700&display=swap');

    * { margin: 0; padding: 0; box-sizing: border-box; }

    body {
      font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI',
                   Roboto, Helvetica, Arial, sans-serif;
      background: #FAF9F6;
      color: #1a1a1a;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100dvh;
      padding: 24px;
      text-align: center;
    }

    .container {
      max-width: 400px;
    }

    .icon {
      font-size: 48px;
      margin-bottom: 16px;
      opacity: 0.7;
    }

    h1 {
      font-size: 24px;
      font-weight: 700;
      margin-bottom: 8px;
      color: #1a1a1a;
    }

    p {
      font-size: 16px;
      color: #555;
      line-height: 1.5;
      margin-bottom: 24px;
    }

    button {
      font-family: inherit;
      font-size: 16px;
      font-weight: 500;
      padding: 12px 32px;
      border: none;
      border-radius: 8px;
      background: #5A52E0;
      color: #fff;
      cursor: pointer;
      transition: background 0.15s ease;
    }

    button:hover, button:focus-visible {
      background: #4840c4;
    }

    button:active {
      transform: scale(0.97);
    }

    .brand {
      margin-top: 40px;
      font-size: 13px;
      font-weight: 500;
      color: #aaa;
      letter-spacing: 0.5px;
      text-transform: uppercase;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="icon" aria-hidden="true">&#x1F310;</div>
    <h1>You're offline</h1>
    <p>It looks like you've lost your internet connection. Check your Wi-Fi or mobile data and try again.</p>
    <button onclick="location.reload()">Try again</button>
    <div class="brand">The Edge</div>
  </div>
</body>
</html>`;

// ---------------------------------------------------------------------------
// Install — cache app shell
// ---------------------------------------------------------------------------
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS))
  );
  self.skipWaiting();
});

// ---------------------------------------------------------------------------
// Activate — delete every cache that doesn't match the current CACHE_NAME
// ---------------------------------------------------------------------------
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== CACHE_NAME)
          .map((k) => {
            console.log("[SW] Deleting old cache:", k);
            return caches.delete(k);
          })
      )
    )
  );
  self.clients.claim();
});

// ---------------------------------------------------------------------------
// Fetch — network-first, fall back to cache, then offline page
// ---------------------------------------------------------------------------
self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Skip non-GET and API requests
  if (request.method !== "GET" || request.url.includes("/api/")) {
    return;
  }

  event.respondWith(
    fetch(request)
      .then((response) => {
        // Cache successful responses for static assets
        if (
          response.ok &&
          (request.url.includes("/_next/") ||
            SHELL_ASSETS.some((a) => request.url.endsWith(a)))
        ) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return response;
      })
      .catch(() => {
        // Offline — try cache first
        return caches.match(request).then((cached) => {
          if (cached) return cached;

          // For navigation requests, serve branded offline page
          if (request.mode === "navigate") {
            return new Response(OFFLINE_HTML, {
              status: 503,
              headers: { "Content-Type": "text/html; charset=utf-8" },
            });
          }

          return new Response("Offline", {
            status: 503,
            headers: { "Content-Type": "text/plain" },
          });
        });
      })
  );
});
