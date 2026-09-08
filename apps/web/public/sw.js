// Deliberately does not cache anything: this app shows live tank/alert data, so serving a
// stale cached response would be actively wrong. Its only job is to exist with a fetch
// handler, which is what makes the site installable as a desktop/home-screen app.
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  event.respondWith(fetch(event.request));
});
