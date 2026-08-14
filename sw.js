// ============================================================
//  sw.js  —  Service Worker für Schulungs-App (Offline-Modus)
//  v3.2 – Vereinfacht: Network-First für alles außer Supabase
// ============================================================
const CACHE_NAME = 'schulung-v136';

// ── INSTALL: Sofort aktivieren ───────────────────────────────
self.addEventListener('install', event => {
  self.skipWaiting();
});

// ── ACTIVATE: Alle alten Caches löschen ─────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// ── FETCH: Network-First für alles ──────────────────────────
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Supabase API → immer netzwerk, nie cachen
  if (url.hostname.includes('supabase.co') || url.hostname.includes('supabase.io')) {
    event.respondWith(
      fetch(event.request).catch(() =>
        new Response(JSON.stringify({ error: 'Offline' }),
          { status: 503, headers: { 'Content-Type': 'application/json' } })
      )
    );
    return;
  }

  // Alles andere → Network-First, Cache als Fallback
  event.respondWith(
    fetch(event.request, { cache: 'no-store' }).then(response => {
      if (response && response.status === 200 && event.request.method === 'GET') {
        const toCache = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, toCache));
      }
      return response;
    }).catch(() => caches.match(event.request))
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
