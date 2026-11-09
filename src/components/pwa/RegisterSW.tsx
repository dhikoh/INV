'use client';

import { useEffect } from 'react';

/**
 * RegisterSW: Mendaftarkan Service Worker PWA (/sw.js) di peramban.
 * Rujukan: Seksi 15.3 Dokumen Spesifikasi.
 */
export function RegisterSW() {
  useEffect(() => {
    if (typeof window === 'undefined') return;

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('/sw.js', { scope: '/' })
        .then((reg) => {
          // Periksa pembaruan service worker
          reg.onupdatefound = () => {
            const installing = reg.installing;
            if (installing) {
              installing.onstatechange = () => {
                if (installing.state === 'installed' && navigator.serviceWorker.controller) {
                  // Pembaruan service worker tersedia
                }
              };
            }
          };
        })
        .catch(() => {
          // Abaikan kegagalan registrasi di lingkungan non-HTTPS atau unsupported
        });
    }
  }, []);

  return null;
}
