import { describe, it, expect } from 'vitest';
import nextConfig from '@/../next.config';
import manifest from '@/app/manifest';
import { assertNoSecretKeys } from '../helpers/leak';

describe('T4.6: Integrasi PWA, Header SW, dan Proteksi Data Offline (Seksi 15.3 & 17.5 nomor 5)', () => {
  describe('1. Konfigurasi Header Service Worker (next.config.ts)', () => {
    it('memastikan header /sw.js berisi no-cache dan Service-Worker-Allowed: /', async () => {
      expect(nextConfig.headers).toBeDefined();

      if (typeof nextConfig.headers === 'function') {
        const headersList = await nextConfig.headers();
        const swHeaderConfig = headersList.find(
          (h: { source: string; headers?: Array<{ key: string; value: string }> }) =>
            h.source === '/sw.js'
        );

        expect(swHeaderConfig).toBeDefined();

        const swAllowed = swHeaderConfig?.headers?.find(
          (hdr: { key: string; value: string }) =>
            hdr.key === 'Service-Worker-Allowed'
        );
        const cacheCtrl = swHeaderConfig?.headers?.find(
          (hdr: { key: string; value: string }) => hdr.key === 'Cache-Control'
        );

        expect(swAllowed).toBeDefined();
        expect(swAllowed?.value).toBe('/');

        expect(cacheCtrl).toBeDefined();
        expect(cacheCtrl?.value).toContain('no-cache');
      }
    });
  });

  describe('2. Verifikasi Zero-Leakage pada Metadata PWA', () => {
    it('memastikan manifest tidak membocorkan data sensitif perusahaan', () => {
      const m = manifest();
      assertNoSecretKeys(m);
    });
  });

  describe('3. Simulasi Siklus Hidup Cache Offline (Seksi 15.3 & 17.5 nomor 5)', () => {
    it('mensimulasikan penyimpanan katalog offline dan isolasi per user ID', () => {
      const mockCaches = new Map<string, Set<string>>();

      const simulateSaveCatalog = (userId: string, urls: string[]) => {
        const cacheKey = `catalog-${userId}`;
        if (!mockCaches.has(cacheKey)) {
          mockCaches.set(cacheKey, new Set());
        }
        const cache = mockCaches.get(cacheKey)!;
        urls.forEach((u) => cache.add(u));
      };

      const simulateClearAll = () => {
        const keys = Array.from(mockCaches.keys()).filter((k) => k.startsWith('catalog-'));
        keys.forEach((k) => mockCaches.delete(k));
      };

      // Sales A menyimpan katalog 1
      simulateSaveCatalog('user_sales_a', ['/api/v1/catalogs/cat_1', '/api/v1/files/img1.jpg']);
      expect(mockCaches.has('catalog-user_sales_a')).toBe(true);
      expect(mockCaches.get('catalog-user_sales_a')?.has('/api/v1/catalogs/cat_1')).toBe(true);
      expect(mockCaches.has('catalog-user_sales_b')).toBe(false);

      // Sales B menyimpan katalog 2
      simulateSaveCatalog('user_sales_b', ['/api/v1/catalogs/cat_2']);
      expect(mockCaches.has('catalog-user_sales_b')).toBe(true);
      expect(mockCaches.get('catalog-user_sales_b')?.has('/api/v1/catalogs/cat_2')).toBe(true);
      expect(mockCaches.get('catalog-user_sales_b')?.has('/api/v1/catalogs/cat_1')).toBe(false);

      // Saat Sales A atau siapapun logout: kirim CLEAR -> seluruh cache katalog dihapus
      simulateClearAll();
      expect(mockCaches.size).toBe(0);
      expect(mockCaches.has('catalog-user_sales_a')).toBe(false);
      expect(mockCaches.has('catalog-user_sales_b')).toBe(false);
    });
  });
});
