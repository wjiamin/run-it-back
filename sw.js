/* Service worker: lets the installed app open offline.

   Network first: when online, every app file is fetched fresh (revalidated with the server), so after an update a
   phone never mixes old and new files. The saved copy is only used when there is no connection. Videos come from
   YouTube and still need the internet.

   Other sites (YouTube) are left alone. Other projects can live on the same web address, so only caches named
   "run-it-back-..." are ever touched. When the list of files changes, change CACHE so old copies are cleared. */

const CACHE = 'run-it-back-v9';
const FILES = [
  './', 'index.html', 'privacy.html', 'styles.css', 'manifest.webmanifest',
  'js/app.js', 'js/beats.js', 'js/camera.js', 'js/grid.js', 'js/log.js', 'js/plan.js', 'js/practice.js', 'js/pwa.js', 'js/recorder.js', 'js/share.js', 'js/site.js', 'js/storage.js', 'js/util.js', 'js/wakelock.js', 'js/zoom.js',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png',
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith('run-it-back-') && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET' || new URL(request.url).origin !== location.origin) return;
  event.respondWith(
    fetch(request, {cache: 'no-cache'})
      .then(response => {
        if (response.ok){ const copy = response.clone(); caches.open(CACHE).then(cache => cache.put(request, copy)); }
        return response;
      })
      .catch(() => caches.match(request, {ignoreSearch: true})
        .then(saved => saved || (request.mode === 'navigate' ? caches.match('index.html') : Response.error())))
  );
});
