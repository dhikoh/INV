import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { Role } from '@prisma/client';
import { zipSync, strToU8 } from 'fflate';
import * as contextModule from '@/lib/auth/context';
import { env } from '@/lib/env';
import { POST as postImport } from '@/app/api/v1/data-transfer/import/route';
import { importData } from '@/lib/transfer/import';
import { prisma } from '@/lib/db';
import { toJsonLine } from '@/lib/transfer/serialize';
import crypto from 'node:crypto';

describe('Unit Transfer: API Impor Mode Usaha & RBAC (Bagian 10 Butir F)', () => {
  const dummyMigration = '20261110000003_catalog_same_business_guard';

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(prisma, '$queryRaw').mockResolvedValue([
      { migration_name: dummyMigration },
    ] as any);
    if (!prisma.shipment) {
      (prisma as any).shipment = {};
    }
    prisma.shipment.findFirst = vi.fn().mockResolvedValue(null);
  });

  function createFormData(zipBuffer: Uint8Array): FormData {
    const formData = new FormData();
    const blob = new Blob([zipBuffer], { type: 'application/zip' });
    formData.append('file', blob, 'import.zip');
    return formData;
  }

  it('menolak akses pengguna dengan peran SALES (403 Forbidden)', async () => {
    vi.spyOn(contextModule, 'requireContext').mockRejectedValue({
      status: 403,
      message: 'Akses ditolak: role tidak memiliki izin untuk resource ini',
      code: 'FORBIDDEN',
    });

    const dummyZip = zipSync({ 'test.txt': strToU8('abc') });
    const formData = createFormData(dummyZip);

    const req = new NextRequest('http://localhost:3000/api/v1/data-transfer/import', {
      method: 'POST',
      headers: { origin: env.APP_URL },
      body: formData,
    });

    const res = await postImport(req, { params: Promise.resolve({}) });
    expect(res.status).toBe(403);

    const json = await res.json();
    expect(json.ok).toBe(false);
  });

  it('menolak akses tanpa otentikasi (401 Unauthorized)', async () => {
    vi.spyOn(contextModule, 'requireContext').mockRejectedValue({
      status: 401,
      message: 'Sesi tidak valid atau telah berakhir',
      code: 'UNAUTHENTICATED',
    });

    const dummyZip = zipSync({ 'test.txt': strToU8('abc') });
    const formData = createFormData(dummyZip);

    const req = new NextRequest('http://localhost:3000/api/v1/data-transfer/import', {
      method: 'POST',
      headers: { origin: env.APP_URL },
      body: formData,
    });

    const res = await postImport(req, { params: Promise.resolve({}) });
    expect(res.status).toBe(401);

    const json = await res.json();
    expect(json.ok).toBe(false);
  });

  it('menolak impor melalui API jika berkas ZIP adalah scope system (mengarahkan ke CLI)', async () => {
    const superAdminCtx: any = {
      user: { id: 'admin_1', role: Role.SUPERADMIN, name: 'Super Admin', businessId: null },
      role: Role.SUPERADMIN,
      session: { id: 'sess_1', activeBusinessId: null },
    };

    vi.spyOn(contextModule, 'requireContext').mockResolvedValue(superAdminCtx);

    const manifest = {
      format: 'omnicat-export',
      formatVersion: 1,
      appVersion: '1.0.0',
      lastMigration: '20261110000003_catalog_same_business_guard',
      exportedAt: new Date().toISOString(),
      exportedBy: 'tester',
      scope: 'system', // Scope system
      businessIds: ['biz_01'],
      businessCodes: ['TRB'],
      options: { includeUploads: false },
      tables: {},
      uploads: { fileCount: 0, totalBytes: 0, files: [], missing: [] },
      containsSecrets: true,
    };

    const zip = zipSync({
      'manifest.json': strToU8(JSON.stringify(manifest)),
    });
    const formData = createFormData(zip);

    const req = new NextRequest('http://localhost:3000/api/v1/data-transfer/import', {
      method: 'POST',
      headers: { origin: env.APP_URL },
      body: formData,
    });

    const res = await postImport(req, { params: Promise.resolve({}) });
    expect(res.status).toBe(422);

    const json = await res.json();
    expect(json.ok).toBe(false);
    expect(json.error.message).toContain('scripts/import-json.ts');
  });

  it('menolak impor mode usaha bila Shipment.deliveryNo sudah digunakan oleh unit usaha lain di database', async () => {
    const shipmentData = toJsonLine({
      id: 'shp_01',
      businessId: 'biz_01',
      orderId: 'ord_01',
      deliveryNo: 'SJ-2026-0001',
    }) + '\n';

    const sha = crypto.createHash('sha256').update(shipmentData).digest('hex');

    const manifest = {
      format: 'omnicat-export',
      formatVersion: 1,
      appVersion: '1.0.0',
      lastMigration: dummyMigration,
      exportedAt: new Date().toISOString(),
      exportedBy: 'tester',
      scope: 'business',
      businessIds: ['biz_01'],
      businessCodes: ['TRB'],
      options: { includeUploads: false },
      tables: {
        Shipment: { file: 'data/Shipment.ndjson', rows: 1, sha256: sha },
      },
      uploads: { fileCount: 0, totalBytes: 0, files: [], missing: [] },
      containsSecrets: true,
    };

    const zip = zipSync({
      'manifest.json': strToU8(JSON.stringify(manifest)),
      'data/Shipment.ndjson': strToU8(shipmentData),
    });

    // Mock prisma bahwa deliveryNo sudah ada di database pada usaha lain
    vi.spyOn(prisma.shipment, 'findFirst').mockResolvedValue({
      id: 'shp_other',
      businessId: 'biz_other',
    } as any);

    const report = await importData(zip, {
      dryRun: true,
      replaceSeedSuperadmin: false,
      actor: null,
      uploadDir: env.UPLOAD_DIR,
    });

    expect(report.ok).toBe(false);
    expect(report.errors).toContain(
      "Nomor surat jalan 'SJ-2026-0001' sudah terpakai oleh unit usaha lain di target."
    );
  });

  it('menolak impor mode usaha bila Shipment.deliveryNo duplikat di dalam berkas impor', async () => {
    const shipmentData =
      toJsonLine({
        id: 'shp_01',
        businessId: 'biz_01',
        orderId: 'ord_01',
        deliveryNo: 'SJ-2026-DUP',
      }) +
      '\n' +
      toJsonLine({
        id: 'shp_02',
        businessId: 'biz_01',
        orderId: 'ord_02',
        deliveryNo: 'SJ-2026-DUP',
      }) +
      '\n';

    const sha = crypto.createHash('sha256').update(shipmentData).digest('hex');

    const manifest = {
      format: 'omnicat-export',
      formatVersion: 1,
      appVersion: '1.0.0',
      lastMigration: dummyMigration,
      exportedAt: new Date().toISOString(),
      exportedBy: 'tester',
      scope: 'business',
      businessIds: ['biz_01'],
      businessCodes: ['TRB'],
      options: { includeUploads: false },
      tables: {
        Shipment: { file: 'data/Shipment.ndjson', rows: 2, sha256: sha },
      },
      uploads: { fileCount: 0, totalBytes: 0, files: [], missing: [] },
      containsSecrets: true,
    };

    const zip = zipSync({
      'manifest.json': strToU8(JSON.stringify(manifest)),
      'data/Shipment.ndjson': strToU8(shipmentData),
    });

    const report = await importData(zip, {
      dryRun: true,
      replaceSeedSuperadmin: false,
      actor: null,
      uploadDir: env.UPLOAD_DIR,
    });

    expect(report.ok).toBe(false);
    expect(report.errors).toContain(
      "Nomor surat jalan 'SJ-2026-DUP' duplikat di dalam berkas impor."
    );
  });

  it('menolak impor jika unit usaha sudah ada saat overwrite=false', async () => {
    const bizData =
      toJsonLine({
        id: 'biz_01',
        code: 'TRB',
        name: 'Toko Terobos',
      }) + '\n';
    const sha = crypto.createHash('sha256').update(bizData).digest('hex');

    const manifest = {
      format: 'omnicat-export',
      formatVersion: 1,
      appVersion: '1.0.0',
      lastMigration: dummyMigration,
      exportedAt: new Date().toISOString(),
      exportedBy: 'tester',
      scope: 'business',
      businessIds: ['biz_01'],
      businessCodes: ['TRB'],
      options: { includeUploads: false },
      tables: {
        Business: { file: 'data/Business.ndjson', rows: 1, sha256: sha },
      },
      uploads: { fileCount: 0, totalBytes: 0, files: [], missing: [] },
      containsSecrets: true,
    };

    const zip = zipSync({
      'manifest.json': strToU8(JSON.stringify(manifest)),
      'data/Business.ndjson': strToU8(bizData),
    });

    vi.spyOn(prisma.business, 'findFirst').mockResolvedValue({
      id: 'biz_01',
      code: 'TRB',
      name: 'Toko Terobos',
    } as any);

    const report = await importData(zip, {
      dryRun: true,
      overwrite: false,
      replaceSeedSuperadmin: false,
      actor: null,
      uploadDir: env.UPLOAD_DIR,
    });

    expect(report.ok).toBe(false);
    expect(report.errors).toContain(
      "Unit usaha dengan ID 'biz_01' atau Kode 'TRB' sudah terdaftar di sistem target."
    );
  });

  it('mengizinkan impor dan mencatat peringatan penimpaan saat overwrite=true', async () => {
    const bizData =
      toJsonLine({
        id: 'biz_01',
        code: 'TRB',
        name: 'Toko Terobos',
      }) + '\n';
    const sha = crypto.createHash('sha256').update(bizData).digest('hex');

    const manifest = {
      format: 'omnicat-export',
      formatVersion: 1,
      appVersion: '1.0.0',
      lastMigration: dummyMigration,
      exportedAt: new Date().toISOString(),
      exportedBy: 'tester',
      scope: 'business',
      businessIds: ['biz_01'],
      businessCodes: ['TRB'],
      options: { includeUploads: false },
      tables: {
        Business: { file: 'data/Business.ndjson', rows: 1, sha256: sha },
      },
      uploads: { fileCount: 0, totalBytes: 0, files: [], missing: [] },
      containsSecrets: true,
    };

    const zip = zipSync({
      'manifest.json': strToU8(JSON.stringify(manifest)),
      'data/Business.ndjson': strToU8(bizData),
    });

    vi.spyOn(prisma.business, 'findFirst').mockResolvedValue({
      id: 'biz_01',
      code: 'TRB',
      name: 'Toko Terobos',
    } as any);

    // Mock query dan transaction untuk dry-run execution
    vi.spyOn(prisma.user, 'findMany').mockResolvedValue([]);
    vi.spyOn(prisma, '$transaction').mockImplementation(async (cb: any) => {
      const mockTx: any = {
        $executeRaw: vi.fn().mockResolvedValue(1),
        user: { findMany: vi.fn().mockResolvedValue([]), deleteMany: vi.fn() },
        session: { deleteMany: vi.fn() },
        telegramLinkCode: vi.fn(),
        notification: { deleteMany: vi.fn() },
        business: { deleteMany: vi.fn(), createMany: vi.fn().mockResolvedValue({ count: 1 }) },
        auditLog: { create: vi.fn() },
      };
      return await cb(mockTx);
    });

    const report = await importData(zip, {
      dryRun: true,
      overwrite: true,
      replaceSeedSuperadmin: false,
      actor: null,
      uploadDir: env.UPLOAD_DIR,
    });

    expect(report.ok).toBe(true);
    expect(report.warnings.some((w) => w.includes('akan ditimpa'))).toBe(true);
  });
});
