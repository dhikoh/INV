import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import manifest from '@/app/manifest';

describe('T4.6: PWA Web App Manifest & Service Worker Contract (Seksi 15.3)', () => {
  describe('1. Web App Manifest', () => {
    it('menghasilkan manifest valid sesuai spesifikasi Seksi 15.3', () => {
      const m = manifest();

      expect(m.name).toContain('BentoCat');
      expect(m.short_name).toBe('BentoCat CRM');
      expect(m.start_url).toBe('/dashboard');
      expect(m.scope).toBe('/');
      expect(m.display).toBe('standalone');
      expect(m.background_color).toBe('#ffffff');
      expect(m.theme_color).toBe('#1F3A5F');
      expect(m.lang).toBe('id');

      expect(m.icons).toBeDefined();
      expect(Array.isArray(m.icons)).toBe(true);
      expect(m.icons?.length).toBeGreaterThanOrEqual(3);

      const icon192 = m.icons?.find((i) => i.sizes === '192x192');
      const icon512 = m.icons?.find((i) => i.sizes === '512x512' && !i.purpose);
      const iconMaskable = m.icons?.find((i) => i.purpose === 'maskable');

      expect(icon192).toBeDefined();
      expect(icon192?.src).toBe('/icons/icon-192.png');
      expect(icon512).toBeDefined();
      expect(icon512?.src).toBe('/icons/icon-512.png');
      expect(iconMaskable).toBeDefined();
      expect(iconMaskable?.src).toBe('/icons/icon-maskable-512.png');
    });

    it('memastikan berkas ikon PWA fisik tersedia di direktori public/icons', () => {
      const publicDir = path.resolve(process.cwd(), 'public/icons');
      expect(fs.existsSync(publicDir)).toBe(true);

      const icon192 = path.join(publicDir, 'icon-192.png');
      const icon512 = path.join(publicDir, 'icon-512.png');
      const iconMaskable = path.join(publicDir, 'icon-maskable-512.png');

      expect(fs.existsSync(icon192)).toBe(true);
      expect(fs.statSync(icon192).size).toBeGreaterThan(0);

      expect(fs.existsSync(icon512)).toBe(true);
      expect(fs.statSync(icon512).size).toBeGreaterThan(0);

      expect(fs.existsSync(iconMaskable)).toBe(true);
      expect(fs.statSync(iconMaskable).size).toBeGreaterThan(0);
    });
  });

  describe('2. Kontrak & Aturan Keamanan Service Worker (public/sw.js)', () => {
    const swPath = path.resolve(process.cwd(), 'public/sw.js');

    it('memastikan berkas public/sw.js ada dan memiliki konfigurasi versi yang tepat', () => {
      expect(fs.existsSync(swPath)).toBe(true);
      const content = fs.readFileSync(swPath, 'utf8');

      expect(content).toContain('const VERSION =');
      expect(content).toContain('const STATIC_CACHE =');
      expect(content).toContain('const OFFLINE_URL =');
    });

    it('memastikan isolasi cache per pengguna (catalog-<userId>) untuk mencegah kebocoran antar akun di HP yang sama', () => {
      const content = fs.readFileSync(swPath, 'utf8');

      // Wajib menggunakan penamaan cache per user
      expect(content).toContain("'catalog-' + msg.userId");
      expect(content).toContain("k.startsWith('catalog-')");
    });

    it('mendukung penanganan pesan CLEAR untuk pembersihan cache saat logout', () => {
      const content = fs.readFileSync(swPath, 'utf8');

      expect(content).toContain("msg.type === 'CLEAR'");
      expect(content).toContain("msg.type === 'SAVE_CATALOG'");
    });

    it('menerapkan strategi offline fallback untuk navigasi dan API katalog', () => {
      const content = fs.readFileSync(swPath, 'utf8');

      expect(content).toContain('apiStrategy');
      expect(content).toContain('staticStrategy');
      expect(content).toContain("req.mode === 'navigate'");
      expect(content).toContain('OFFLINE_URL');
    });
  });
});
