// public/sw.js
// Service Worker untuk PWA BentoCat (Seksi 15.3 & 17.5 nomor 5)
// Aturan Keamanan:
// 1. Tidak ada respons API yang disimpan kecuali katalog yang sengaja disimpan pengguna.
// 2. Cache offline dinamai per user (catalog-<userId>) dan dihapus saat logout agar akun lain di HP yang sama tidak melihat data.
// 3. Naikkan VERSION di sw.js setiap rilis yang mengubah aset statis.

const VERSION = 'v1.0.0';
const STATIC_CACHE = 'static-' + VERSION;
const OFFLINE_URL = '/offline';

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((c) => c.add(OFFLINE_URL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k.startsWith('static-') && k !== STATIC_CACHE)
            .map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

async function apiStrategy(req) {
  const keys = (await caches.keys()).filter((k) => k.startsWith('catalog-'));
  try {
    const res = await fetch(req);
    if (res.ok) {
      for (const k of keys) {
        const c = await caches.open(k);
        if (await c.match(req)) {
          await c.put(req, res.clone()); // segarkan hanya yang sudah disimpan sebelumnya
        }
      }
    }
    return res;
  } catch (err) {
    for (const k of keys) {
      const hit = await (await caches.open(k)).match(req);
      if (hit) return hit;
    }
    return new Response(
      JSON.stringify({
        ok: false,
        error: { code: 'OFFLINE', message: 'Anda sedang offline' },
      }),
      {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}

async function staticStrategy(req) {
  const c = await caches.open(STATIC_CACHE);
  const hit = await c.match(req);
  if (hit) return hit;
  try {
    const res = await fetch(req);
    if (res.ok) await c.put(req, res.clone());
    return res;
  } catch {
    return hit || new Response('', { status: 408 });
  }
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.startsWith('/icons/')
  ) {
    e.respondWith(staticStrategy(req));
  } else if (url.pathname.startsWith('/api/')) {
    e.respondWith(apiStrategy(req));
  } else if (req.mode === 'navigate') {
    e.respondWith(fetch(req).catch(() => caches.match(OFFLINE_URL)));
  }
});

// Pesan dari halaman: simpan katalog untuk offline, atau hapus semuanya saat logout
self.addEventListener('message', (e) => {
  const msg = e.data || {};

  if (msg.type === 'SAVE_CATALOG' && msg.userId && Array.isArray(msg.urls)) {
    e.waitUntil(
      caches
        .open('catalog-' + msg.userId)
        .then((c) => c.addAll(msg.urls))
    );
  }

  if (msg.type === 'CLEAR') {
    e.waitUntil(
      caches
        .keys()
        .then((keys) =>
          Promise.all(
            keys
              .filter((k) => k.startsWith('catalog-'))
              .map((k) => caches.delete(k))
          )
        )
    );
  }

  if (msg.type === 'DELETE_CATALOG' && msg.userId && Array.isArray(msg.urls)) {
    e.waitUntil(
      caches
        .open('catalog-' + msg.userId)
        .then((c) => Promise.all(msg.urls.map((u) => c.delete(u))))
    );
  }
});
