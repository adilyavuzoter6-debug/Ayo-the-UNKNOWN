// Deliberately does almost nothing. This app shows live tank/alert data, so caching would be
// actively wrong, and the only reason a service worker exists at all is that browsers want one
// present before offering "install as app".
//
// The fetch listener MUST NOT call event.respondWith(). It used to do
// `event.respondWith(fetch(event.request))`, which looks like a harmless pass-through but isn't:
// re-issuing a navigation request from inside the worker loses the browser's own redirect
// handling, and Clerk refreshes its short-lived session token via a redirect handshake through
// clerk.piscatiotechnologies.com on page load. Mangle that redirect and the refreshed session
// cookie never lands — the user looks signed out and gets asked to log in again, over and over,
// on a device that has a perfectly valid 7-day session. Leaving the handler empty keeps the
// worker present (installability) while the browser handles every request natively.
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", () => {
  // Intentionally empty — see above. Do not add respondWith here.
});
