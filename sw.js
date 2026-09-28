const CACHE = 'pomcare-v7';
const ASSETS = [
  '.',
  'index.html',
  'styles.css',
  'app.js',
  'firebase-config.js',
  'manifest.webmanifest',
  'icon-512.png',
  'teddy.png',
  'pomi.png',
];
const CDN_ASSETS = [
  'https://www.gstatic.com/firebasejs/10.12.5/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth-compat.js',
  'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore-compat.js',
  'https://www.gstatic.com/firebasejs/10.12.5/firebase-storage-compat.js',
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) {
      const all = ASSETS.map(function (u) { return c.add(u).catch(function () {}); })
        .concat(CDN_ASSETS.map(function (u) { return c.add(u).catch(function () {}); }));
      return Promise.all(all);
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys()
      .then(function (keys) {
        return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) {
          return caches.delete(k);
        }));
      })
      .then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  e.respondWith(
    caches.match(e.request).then(function (r) { return r || fetch(e.request); })
  );
});
