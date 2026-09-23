const CACHE = 'dzwonek-shell-v4';
const SHELL = ['/', '/static/style.css', '/static/app.js', '/static/theme.js', '/static/icon-192.png', '/static/icon-512.png', '/static/apple-touch-icon.png', '/static/manifest.webmanifest'];
// cache:'reload' bypasses the HTTP cache so a new version never stores stale files.
self.addEventListener('install', event => { event.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL.map(u => new Request(u, {cache: 'reload'})))).then(() => self.skipWaiting())); });
self.addEventListener('activate', event => { event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
// Private API data and photos never enter the browser cache.
// Shell files: network first so updates show immediately; the cache is only an offline fallback.
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return;
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).catch(() => caches.match('/')));
  } else if (SHELL.includes(url.pathname)) {
    event.respondWith(fetch(event.request, {cache: 'no-cache'}).then(response => {
      if (response.ok) { const copy = response.clone(); caches.open(CACHE).then(c => c.put(event.request, copy)); }
      return response;
    }).catch(() => caches.match(event.request)));
  }
});
