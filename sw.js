// ============================================================
//  sw.js  —  Service Worker für Schulungs-App (Offline-Modus)
//  v3.1 – Push-Benachrichtigungen + Offline-Modus
// ============================================================
const CACHE_NAME = 'schulung-v13';
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

// ── PUSH: Benachrichtigung empfangen und anzeigen ─────────────
self.addEventListener('push', event => {
  let data = { title: 'Schulungsmanagement', body: 'Neue Benachrichtigung', icon: '/csc-logo.png' };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch(e) {
    if (event.data) data.body = event.data.text();
  }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body:    data.body,
      icon:    data.icon || '/csc-logo.png',
      badge:   '/csc-logo.png',
      tag:     data.tag || 'schulung',
      data:    data.url ? { url: data.url } : {},
      vibrate: [200, 100, 200]
    })
  );
});

// ── NOTIFICATION CLICK: App öffnen ────────────────────────────
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(wins => {
      const existing = wins.find(w => w.url.includes(self.location.origin));
      if (existing) { existing.focus(); return existing.navigate(url); }
      return clients.openWindow(url);
    })
  );
});

// ── PUSH SUBSCRIPTION CHANGE ──────────────────────────────────
self.addEventListener('pushsubscriptionchange', event => {
  event.waitUntil(self.registration.pushManager.subscribe({ userVisibleOnly: true }));
});
