/* public/sw-dev.js
 * Self-disarming shim. This app registers NO service worker (verified: zero
 * serviceWorker calls in src/, no next-pwa/SW plugin in package.json). A
 * development service worker from another project that previously ran on the
 * localhost:3000 origin persists PER-ORIGIN in the browser and keeps fetching
 * its old script from whichever app currently owns that port — surfacing as
 * `500 GET /sw-dev.js` noise (and, while any route in the layout graph
 * throws, as an unhandled 500 instead of a clean miss).
 *
 * Serving this file (rather than 404-ing HTML to a script fetch) lets the
 * stale registration's update check complete against a valid
 * application/javascript body; the new worker unregisters itself on
 * activation, so the next reload is service-worker-free and the fetches
 * stop entirely. Nothing here runs for normal pages.
 */
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.registration.unregister());
});
