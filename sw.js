/* Service worker Referry: aplikacja działa bez internetu. Nie buforuje żadnych zapytań do bazy ani logowania. */
const CACHE = 'referra-v2';
const SHELL = ['./', 'index.html', 'ui.css', 'style.css', 'scan.css', 'viewer.css', 'fonts.css', 'config.js', 'comfort-boot.js', 'auth.js', 'viewer.js', 'scan.js', 'app.js', 'contacts.js', 'logo.js', 'comfort.js', 'pwa.js', 'qrcode.js', 'icon.svg', 'manifest.webmanifest',
  'fonts/ibm-plex-sans-latin-400-normal.woff2', 'fonts/ibm-plex-sans-latin-600-normal.woff2', 'fonts/ibm-plex-serif-latin-700-normal.woff2', 'fonts/ibm-plex-mono-latin-400-normal.woff2'];

self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => Promise.all(SHELL.map(u => c.add(u).catch(() => {})))).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });

self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return; // baza, logowanie, CDN: zawsze prosto do sieci
  if (req.mode === 'navigate') { // strona: najpierw sieć (świeża wersja), offline: z pamięci
    e.respondWith(fetch(req).then(r => { if (r.ok && r.type === 'basic' && !r.redirected) { const copy = r.clone(); caches.open(CACHE).then(c => c.put('index.html', copy)); } return r; }).catch(() => caches.match('index.html').then(r => r || caches.match('./'))));
    return;
  }
  const fresh = /\.(js|css|html|webmanifest)$/.test(url.pathname); // kod: najpierw sieć, żeby poprawki bezpieczeństwa docierały od razu
  e.respondWith(caches.match(req).then(hit => {
    const net = fetch(req).then(r => { if (r.ok && r.type === 'basic') { const copy = r.clone(); caches.open(CACHE).then(c => c.put(req, copy)); } return r; }).catch(() => hit);
    return fresh ? net.then(r => r || hit) : (hit || net);
  }));
});
