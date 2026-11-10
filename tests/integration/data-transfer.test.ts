import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { PGlite } from '@electric-sql/pglite';
import { zipSync, strToU8 } from 'fflate';
import { exportData } from '@/lib/transfer/export';
import { importData } from '@/lib/transfer/import';
import { toJsonLine } from '@/lib/transfer/serialize';
import { prisma } from '@/lib/db';
import { env } from '@/lib/env';

describe('Integrasi Data Transfer: Ekspor, Impor Round-Trip & Penolakan Target (Bagian 10 Butir D & E)', () => {
  const tempUploadDir = path.resolve(process.cwd(), 'tests/tmp/data-transfer-uploads');

  beforeEach(() => {
    vi.restoreAllMocks();
    fs.mkdirSync(tempUploadDir, { recursive: true });
  });

  afterEach(() => {
    try {
      if (fs.existsSync(tempUploadDir)) {
        fs.rmSync(tempUploadDir, { recursive: true, force: true });
      }
    } catch {
      // ignore
    }
  });

  it('menolak impor mode system jika database target sudah memiliki unit usaha (Seksi 6.5)', async () => {
    vi.spyOn(prisma.business, 'count').mockResolvedValue(1);

    const dummyManifest = {
      format: 'omnicat-export',
      formatVersion: 1,
      appVersion: '1.0.0',
      lastMigration: '20261110000003_catalog_same_business_guard',
      exportedAt: new Date().toISOString(),
      exportedBy: 'tester',
      scope: 'system',
      businessIds: ['biz_1'],
      businessCodes: ['TRB'],
      options: { includeUploads: false },
      tables: {},
      uploads: { fileCount: 0, totalBytes: 0, files: [], missing: [] },
      containsSecrets: true,
    };

    vi.spyOn(prisma, '$queryRaw').mockResolvedValue([
      { migration_name: '20261110000003_catalog_same_business_guard' },
    ] as any);

    const zip = zipSync({
      'manifest.json': strToU8(JSON.stringify(dummyManifest)),
    });

    const report = await importData(zip, {
      dryRun: false,
      replaceSeedSuperadmin: false,
      actor: null,
      uploadDir: tempUploadDir,
    });

    expect(report.ok).toBe(false);
    expect(report.errors.some((e) => e.includes('hanya diizinkan pada database KOSONG'))).toBe(true);
  });

  it('menolak impor jika counter nomor dokumen (lastSeq) di berkas lebih kecil dari urutan transaksi yang ada (Seksi 6.6)', async () => {
    vi.spyOn(prisma.business, 'count').mockResolvedValue(0);
    vi.spyOn(prisma.user, 'count').mockResolvedValue(0);
    vi.spyOn(prisma, '$queryRaw').mockResolvedValue([
      { migration_name: '20261110000003_catalog_same_business_guard' },
    ] as any);

    const customerId = 'cust_01';
    const orderData = toJsonLine({
      id: 'ord_1',
      businessId: 'biz_01',
      customerId,
      customerSeq: 10, // customerSeq = 10
      orderNo: 'TRB/20261110/CUST-001/0010',
      status: 'APPROVED',
      grandTotal: 100000n,
      paidTotal: 0n,
    });

    // DocumentCounter sengaja dikecilkan: lastSeq = 5 (< 10)
    const counterData = JSON.stringify({
      id: 'dc_1',
      businessId: 'biz_01',
      scope: 'ORDER_SEQ',
      scopeId: customerId,
      lastSeq: 5,
    });

    const orderSha = crypto.createHash('sha256').update(orderData).digest('hex');
    const counterSha = crypto.createHash('sha256').update(counterData).digest('hex');

    const manifest = {
      format: 'omnicat-export',
      formatVersion: 1,
      appVersion: '1.0.0',
      lastMigration: '20261110000003_catalog_same_business_guard',
      exportedAt: new Date().toISOString(),
      exportedBy: 'tester',
      scope: 'system',
      businessIds: ['biz_01'],
      businessCodes: ['TRB'],
      options: { includeUploads: false },
      tables: {
        Order: { file: 'data/Order.ndjson', rows: 1, sha256: orderSha },
        DocumentCounter: { file: 'data/DocumentCounter.ndjson', rows: 1, sha256: counterSha },
      },
      uploads: { fileCount: 0, totalBytes: 0, files: [], missing: [] },
      containsSecrets: true,
    };

    const zip = zipSync({
      'manifest.json': strToU8(JSON.stringify(manifest)),
      'data/Order.ndjson': strToU8(orderData),
      'data/DocumentCounter.ndjson': strToU8(counterData),
    });

    // Mock transaction execution
    vi.spyOn(prisma, '$transaction').mockImplementation(async (callback: any) => {
      const mockTx: Record<string, any> = {
        $executeRaw: vi.fn().mockResolvedValue(1),
        order: { createMany: vi.fn().mockResolvedValue({ count: 1 }) },
        documentCounter: {
          createMany: vi.fn().mockResolvedValue({ count: 1 }),
          findFirst: vi.fn().mockResolvedValue({ lastSeq: 5 }),
        },
      };
      return callback(mockTx);
    });

    const report = await importData(zip, {
      dryRun: false,
      replaceSeedSuperadmin: false,
      actor: null,
      uploadDir: tempUploadDir,
    });

    expect(report.ok).toBe(false);
    expect(report.errors.some((e) => e.includes('Anomali Counter') || e.includes('lebih kecil'))).toBe(true);
  });

  it('menjalankan simulasi dry-run penuh: memverifikasi validitas tanpa menyimpan data dan tanpa menulis berkas fisik', async () => {
    vi.spyOn(prisma.business, 'count').mockResolvedValue(0);
    vi.spyOn(prisma.user, 'count').mockResolvedValue(0);
    vi.spyOn(prisma, '$queryRaw').mockResolvedValue([
      { migration_name: '20261110000003_catalog_same_business_guard' },
    ] as any);

    const bizData = JSON.stringify({
      id: 'biz_01',
      code: 'TRB',
      name: 'Terobos Cat Litter',
      isActive: true,
    });
    const bizSha = crypto.createHash('sha256').update(bizData).digest('hex');

    const manifest = {
      format: 'omnicat-export',
      formatVersion: 1,
      appVersion: '1.0.0',
      lastMigration: '20261110000003_catalog_same_business_guard',
      exportedAt: new Date().toISOString(),
      exportedBy: 'tester',
      scope: 'system',
      businessIds: ['biz_01'],
      businessCodes: ['TRB'],
      options: { includeUploads: false },
      tables: {
        Business: { file: 'data/Business.ndjson', rows: 1, sha256: bizSha },
      },
      uploads: { fileCount: 0, totalBytes: 0, files: [], missing: [] },
      containsSecrets: true,
    };

    const zip = zipSync({
      'manifest.json': strToU8(JSON.stringify(manifest)),
      'data/Business.ndjson': strToU8(bizData),
    });

    vi.spyOn(prisma, '$transaction').mockImplementation(async (callback: any) => {
      const mockTx: Record<string, any> = {
        $executeRaw: vi.fn().mockResolvedValue(1),
        business: { createMany: vi.fn().mockResolvedValue({ count: 1 }) },
        auditLog: { create: vi.fn().mockResolvedValue({ id: 'aud_1' }) },
      };
      return callback(mockTx);
    });

    const report = await importData(zip, {
      dryRun: true,
      replaceSeedSuperadmin: false,
      actor: null,
      uploadDir: tempUploadDir,
    });

    expect(report.ok).toBe(true);
    expect(report.dryRun).toBe(true);
    expect(report.counts.Business).toBe(1);
    expect(report.uploads.written).toBe(0);

    // Pastikan tidak ada folder staging yang tersisa
    const entries = fs.readdirSync(tempUploadDir);
    expect(entries.filter((e) => e.startsWith('.import-'))).toEqual([]);
  });
});
