import type { MetadataRoute } from 'next';

/**
 * Web App Manifest (PWA)
 * Rujukan: Seksi 15.3 Dokumen Spesifikasi.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'BentoCat Order dan CRM',
    short_name: 'BentoCat CRM',
    description: 'Aplikasi Manajemen Order, CRM, Katalog & Piutang Petshop B2B',
    start_url: '/dashboard',
    scope: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#1F3A5F',
    lang: 'id',
    icons: [
      {
        src: '/icons/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: '/icons/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
      },
      {
        src: '/icons/icon-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
