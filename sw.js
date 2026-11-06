// Kassabuch Service Worker: hält die App offline verfügbar. Finanzdaten liegen in IndexedDB, nicht hier.
// Bei jedem Release CACHE und version.json/APP_VERSION gemeinsam erhöhen.
const CACHE = 'kassabuch-2026.11.06-13';
const SHELL = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png', './apple-touch-icon.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL.map(u => new Request(u, {cache: 'reload'})))).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return; // API-Aufrufe nie cachen
  if (url.pathname.endsWith('/version.json')) return;                    // Update-Prüfung immer live
  if (req.mode === 'navigate') {                                          // App-Seite: erst Netz, offline aus dem Cache
    e.respondWith((async () => {
      const c = await caches.open(CACHE);
      try {
        const r = await Promise.race([fetch(req, {cache: 'no-store'}), new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 4000))]);
        if (!r.ok) throw new Error('status ' + r.status);   // 404/500 vom Server: lieber die gespeicherte App zeigen
        c.put('./index.html', r.clone());
        return r;
      } catch (_) { return (await c.match('./index.html')) || (await c.match('./')) || Response.error(); }
    })());
    return;
  }
  e.respondWith(caches.open(CACHE).then(async c => {
    const hit = await c.match(req, {ignoreSearch: true});
    const net = fetch(req).then(r => { if (r.ok) c.put(req, r.clone()); return r; }).catch(() => hit);
    return hit || net;
  }));
});
