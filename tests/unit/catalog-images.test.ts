import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('NAV-001: Verifikasi URL Gambar Katalog Resmi & Integrasi File Route', () => {
  const catalogPagePath = path.resolve(__dirname, '../../src/app/(app)/catalogs/[id]/page.tsx');

  it('memastikan berkas detail katalog tidak menggunakan rute fiktif /api/v1/uploads', () => {
    expect(fs.existsSync(catalogPagePath)).toBe(true);
    const content = fs.readFileSync(catalogPagePath, 'utf8');

    // Membuktikan bahwa rute fiktif /api/v1/uploads tidak lagi digunakan
    const usesUploadsRoute = content.includes('/api/v1/uploads');
    expect(
      usesUploadsRoute,
      'Ditemukan pemanggilan rute fiktif /api/v1/uploads di catalogs/[id]/page.tsx (seharusnya /api/v1/files)'
    ).toBe(false);
  });

  it('memastikan berkas detail katalog menggunakan rute resmi /api/v1/files untuk gambar item dan cache offline PWA', () => {
    const content = fs.readFileSync(catalogPagePath, 'utf8');

    // Wajib menggunakan rute resmi file handler
    expect(content).toContain('/api/v1/files/${it.imagePath}');
    expect(content).toContain('/api/v1/files/${item.imagePath}');
  });
});
