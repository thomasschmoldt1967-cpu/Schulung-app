// ============================================================
//  sw.js  —  Service Worker für Schulungs-App (Offline-Modus)
//  Caches: App-Shell (HTML/CSS/JS), Bilder, Fonts
// ============================================================
const CACHE_NAME = 'schulung-v2';
const OFFLINE_URL = '/';

const APP_SHELL = [
  '/',
  '/index.html',
  '/app.js',
  '/style.css',
  '/csc-logo.png',
  '/anleitung.html',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/bcryptjs/2.4.3/bcrypt.min.js'
];

// ── INSTALL: App-Shell cachen ────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(APP_SHELL.map(url => new Request(url, { cache: 'reload' })))
        .catch(e => console.warn('SW Cache partial fail:', e));
    }).then(() => self.skipWaiting())
  );
});

// ── ACTIVATE: Alte Caches aufräumen ─────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// ── FETCH: Cache-First für App-Shell, Network-First für API ──
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Supabase API → immer netzwerk, nie cachen
  if (url.hostname.includes('supabase.co') || url.hostname.includes('supabase.io')) {
    event.respondWith(
      fetch(event.request).catch(() =>
        new Response(JSON.stringify({ error: 'Offline – keine Verbindung zur Datenbank' }),
          { status: 503, headers: { 'Content-Type': 'application/json' } })
      )
    );
    return;
  }

  // App-Shell → Cache-First
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        // Nur GET-Requests cachen
        if (event.request.method !== 'GET' || !response || response.status !== 200) return response;
        const toCache = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, toCache));
        return response;
      }).catch(() => {
        // Offline-Fallback: App-Shell zurückgeben
        if (event.request.headers.get('accept')?.includes('text/html')) {
          return caches.match('/index.html');
        }
      });
    })
  );
});
