/* Bump this cache name whenever a shell asset changes. Installation is all-or-nothing;
   old caches remain available until a replacement worker activates successfully. */
const CACHE_NAME = "markdays-shell-v3";
const ASSETS = [
  "./",
  "./index.html",
  "./css/style.css",
  "./js/storage.js",
  "./js/calendar.js",
  "./js/csv.js",
  "./js/app.js",
  "./manifest.json",
  "./icons/icon.svg"
];
const SCOPE_URL = new URL("./", self.location.href);

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(ASSETS.map(asset => new URL(asset, SCOPE_URL).href)))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(names => Promise.all(names.filter(name => name.startsWith("markdays-shell-") && name !== CACHE_NAME).map(name => caches.delete(name))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;
  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin || !requestUrl.href.startsWith(SCOPE_URL.href)) return;
  if (event.request.mode === "navigate") {
    event.respondWith(fetch(event.request).then(response => {
      if (response.ok) {
        const copy = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(new URL("./index.html", SCOPE_URL).href, copy));
      }
      return response;
    }).catch(() => caches.match(new URL("./index.html", SCOPE_URL).href)));
    return;
  }
  event.respondWith(caches.match(event.request).then(cached => {
    if (cached) return cached;
    return fetch(event.request).then(response => {
      if (response.ok && response.type === "basic") {
        const copy = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
      }
      return response;
    });
  }));
});
