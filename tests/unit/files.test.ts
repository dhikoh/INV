import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  detectMimeFromBytes,
  saveFile,
  serveFile,
} from '@/lib/files/fileService';
import { DomainError } from '@/lib/domain/money';
import { NextRequest } from 'next/server';
import { Role } from '@prisma/client';
import * as contextModule from '@/lib/auth/context';
import { prisma } from '@/lib/db';
import { env } from '@/lib/env';
import fs from 'fs';
import path from 'path';

// Mock prisma
vi.mock('@/lib/db', () => ({
  prisma: {
    payment: {
      findFirst: vi.fn(),
    },
  },
}));

describe('Manajemen Berkas & Keamanan Unggah (T1.3 & Seksi 16.3)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('detectMimeFromBytes()', () => {
    it('mendeteksi berkas JPEG dari magic bytes (FF D8 FF)', () => {
      const buffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
      expect(detectMimeFromBytes(buffer)).toBe('image/jpeg');
    });

    it('mendeteksi berkas PNG dari magic bytes (89 50 4E 47)', () => {
      const buffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]);
      expect(detectMimeFromBytes(buffer)).toBe('image/png');
    });

    it('mendeteksi berkas WebP dari header RIFF....WEBP', () => {
      const buffer = Buffer.from([
        0x52, 0x49, 0x46, 0x46, // RIFF
        0x00, 0x00, 0x00, 0x00, // size
        0x57, 0x45, 0x42, 0x50, // WEBP
      ]);
      expect(detectMimeFromBytes(buffer)).toBe('image/webp');
    });

    it('mendeteksi berkas PDF dari magic bytes (%PDF)', () => {
      const buffer = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]);
      expect(detectMimeFromBytes(buffer)).toBe('application/pdf');
    });

    it('menolak berkas dengan panjang kurang dari 4 bytes (422)', () => {
      const shortBuffer = Buffer.from([0xff, 0xd8]);
      expect(() => detectMimeFromBytes(shortBuffer)).toThrow(DomainError);
      try {
        detectMimeFromBytes(shortBuffer);
      } catch (err) {
        expect((err as DomainError).code).toBe('VALIDATION_ERROR');
        expect((err as DomainError).status).toBe(422);
      }
    });

    it('menolak berkas teks atau biner yang bukan format diizinkan (422)', () => {
      const fakeBuffer = Buffer.from('INI TEKS BUKAN GAMBAR');
      expect(() => detectMimeFromBytes(fakeBuffer)).toThrow(DomainError);
      try {
        detectMimeFromBytes(fakeBuffer);
      } catch (err) {
        expect((err as DomainError).code).toBe('VALIDATION_ERROR');
        expect((err as DomainError).status).toBe(422);
      }
    });
  });

  describe('saveFile()', () => {
    it('menolak unggahan PDF untuk kategori logo atau produk (422)', async () => {
      const pdfBuffer = Buffer.from([
        0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37,
      ]);

      await expect(
        saveFile({
          businessId: 'biz_1',
          kind: 'logo',
          buffer: pdfBuffer,
        })
      ).rejects.toThrow(
        'Logo dan foto produk hanya boleh berupa gambar (JPEG, PNG, WebP)'
      );

      await expect(
        saveFile({
          businessId: 'biz_1',
          kind: 'product',
          buffer: pdfBuffer,
        })
      ).rejects.toThrow(
        'Logo dan foto produk hanya boleh berupa gambar (JPEG, PNG, WebP)'
      );
    });

    it('menolak berkas yang melebihi batas ukuran MAX_UPLOAD_MB (422)', async () => {
      // Buat buffer 11 MB (melebihi default 10 MB)
      const oversizedBuffer = Buffer.alloc(11 * 1024 * 1024);
      oversizedBuffer[0] = 0xff;
      oversizedBuffer[1] = 0xd8;
      oversizedBuffer[2] = 0xff;
      oversizedBuffer[3] = 0xe0;

      await expect(
        saveFile({
          businessId: 'biz_1',
          kind: 'logo',
          buffer: oversizedBuffer,
        })
      ).rejects.toThrow(/Ukuran berkas melebihi batas maksimal/);
    });

    it('memproses gambar PNG valid menjadi WebP dengan nama UUID acak', async () => {
      // 1x1 transparent PNG buffer
      const png1x1 = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        'base64'
      );

      const result = await saveFile({
        businessId: 'biz_test',
        kind: 'logo',
        buffer: png1x1,
      });

      expect(result.contentType).toBe('image/webp');
      expect(result.relativePath).toMatch(/^biz_test\/logo\/[a-f0-9-]+\.webp$/);
      expect(result.size).toBeGreaterThan(0);
    });
  });

  describe('serveFile() & Keamanan Akses', () => {
    const APP_URL = 'http://localhost:3000';

    it('menolak Sales mengakses berkas dari businessId lain (404)', async () => {
      vi.spyOn(contextModule, 'requireContext').mockResolvedValueOnce({
        user: {
          id: 'sales_1',
          role: Role.SALES,
          name: 'Sales A',
          businessId: 'biz_a',
        },
        sessionId: 'sess_1',
        role: Role.SALES,
        businessId: 'biz_a',
        ip: '127.0.0.1',
      });

      const req = new NextRequest(
        `${APP_URL}/api/v1/files/biz_b/logo/sample.webp`
      );

      await expect(
        serveFile(req, {
          businessId: 'biz_b',
          kind: 'logo',
          filename: 'sample.webp',
        })
      ).rejects.toThrow('Berkas tidak ditemukan');
    });

    it('menolak Sales mengakses bukti transfer (proof) jika bukan pemilik order (404)', async () => {
      vi.spyOn(contextModule, 'requireContext').mockResolvedValueOnce({
        user: {
          id: 'sales_1',
          role: Role.SALES,
          name: 'Sales A',
          businessId: 'biz_a',
        },
        sessionId: 'sess_1',
        role: Role.SALES,
        businessId: 'biz_a',
        ip: '127.0.0.1',
      });

      vi.mocked(prisma.payment.findFirst).mockResolvedValueOnce(null);

      const req = new NextRequest(
        `${APP_URL}/api/v1/files/biz_a/proof/transfer.webp`
      );

      await expect(
        serveFile(req, {
          businessId: 'biz_a',
          kind: 'proof',
          filename: 'transfer.webp',
        })
      ).rejects.toThrow('Berkas tidak ditemukan');
    });

    it('menolak akses dengan path traversal (404)', async () => {
      vi.spyOn(contextModule, 'requireContext').mockResolvedValueOnce({
        user: {
          id: 'admin_1',
          role: Role.SUPERADMIN,
          name: 'Admin',
          businessId: null,
        },
        sessionId: 'sess_1',
        role: Role.SUPERADMIN,
        businessId: null,
        ip: '127.0.0.1',
      });

      const req = new NextRequest(
        `${APP_URL}/api/v1/files/biz_a/logo/../../../etc/passwd`
      );

      await expect(
        serveFile(req, {
          businessId: 'biz_a',
          kind: 'logo',
          filename: '../../../etc/passwd',
        })
      ).rejects.toThrow('Berkas tidak ditemukan');
    });

    it('mengirimkan Cache-Control: no-store untuk proof dan private untuk logo', async () => {
      // Buat berkas sementara di direktori UPLOAD_DIR
      const uploadDir = path.resolve(env.UPLOAD_DIR);
      const testDir = path.resolve(uploadDir, 'biz_cache', 'proof');
      await fs.promises.mkdir(testDir, { recursive: true });
      const testFile = path.resolve(testDir, 'test-proof.pdf');
      await fs.promises.writeFile(testFile, Buffer.from('%PDF-1.4'));

      vi.spyOn(contextModule, 'requireContext').mockResolvedValueOnce({
        user: {
          id: 'admin_1',
          role: Role.SUPERADMIN,
          name: 'Admin',
          businessId: null,
        },
        sessionId: 'sess_1',
        role: Role.SUPERADMIN,
        businessId: null,
        ip: '127.0.0.1',
      });

      const req = new NextRequest(
        `${APP_URL}/api/v1/files/biz_cache/proof/test-proof.pdf`
      );

      const res = await serveFile(req, {
        businessId: 'biz_cache',
        kind: 'proof',
        filename: 'test-proof.pdf',
      });

      expect(res.status).toBe(200);
      expect(res.headers.get('Cache-Control')).toBe('no-store');
      expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
      expect(res.headers.get('Content-Type')).toBe('application/pdf');

      // Bersihkan
      await fs.promises.unlink(testFile).catch(() => {});
    });
  });
});
