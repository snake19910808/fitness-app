/* 離線快取 Service Worker */
const CACHE = "fitapp-v0.6.2";
const ASSETS = ["./", "./index.html", "./style.css", "./app.js", "./manifest.json", "./icon.svg", "./plan.json"];

self.addEventListener("install", (e) => {
  // cache:"reload" 繞過 HTTP 快取，確保預快取的所有檔案是同一版本（避免 index 新、app.js 舊的錯版混搭）
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS.map((u) => new Request(u, { cache: "reload" })))));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

/* 網路優先、失敗用快取：確保改版即時，離線仍可用 */
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  e.respondWith(
    fetch(e.request, { cache: "no-cache" })
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
