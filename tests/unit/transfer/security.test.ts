import { describe, it, expect, vi, beforeEach } from 'vitest';
import { zipSync, strToU8 } from 'fflate';
import { importData } from '@/lib/transfer/import';
import { prisma } from '@/lib/db';
import { env } from '@/lib/env';

describe('Unit Transfer: Keamanan Impor Data (Bagian 10 Butir C)', () => {
  const dummyMigration = '20261110000003_catalog_same_business_guard';

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(prisma, '$queryRaw').mockResolvedValue([
      { migration_name: dummyMigration },
    ] as any);
  });

  function createValidBaseManifest(overrides: Record<string, any> = {}) {
    return {
      format: 'omnicat-export',
      formatVersion: 1,
      appVersion: '1.0.0',
      lastMigration: dummyMigration,
      exportedAt: new Date().toISOString(),
      exportedBy: 'tester',
      scope: 'system',
      businessIds: ['biz_01'],
      businessCodes: ['TRB'],
      options: { includeUploads: false },
      tables: {},
      uploads: { fileCount: 0, totalBytes: 0, files: [], missing: [] },
      containsSecrets: true,
      ...overrides,
    };
  }

  it('menolak berkas ZIP yang mengandung entri Zip-Slip (.. atau \\ atau awalan /)', async () => {
    const manifest = createValidBaseManifest();
    const maliciousZip = zipSync({
      'manifest.json': strToU8(JSON.stringify(manifest)),
      '../outside.txt': strToU8('evil'),
    });

    const report = await importData(maliciousZip, {
      dryRun: true,
      replaceSeedSuperadmin: false,
      actor: null,
      uploadDir: env.UPLOAD_DIR,
    });

    expect(report.ok).toBe(false);
    expect(report.errors.some((e) => e.includes('zip-slip'))).toBe(true);
  });

  it('menolak entri upload dengan kind yang tidak diizinkan atau ekstensi berbahaya (.exe)', async () => {
    const manifest = createValidBaseManifest({ options: { includeUploads: true } });
    const maliciousZip = zipSync({
      'manifest.json': strToU8(JSON.stringify(manifest)),
      'uploads/biz_01/malware/script.exe': strToU8('not_allowed'),
    });

    const report = await importData(maliciousZip, {
      dryRun: true,
      replaceSeedSuperadmin: false,
      actor: null,
      uploadDir: env.UPLOAD_DIR,
    });

    expect(report.ok).toBe(false);
    expect(report.errors.some((e) => e.includes('tidak diizinkan') || e.includes('tidak valid'))).toBe(true);
  });

  it('menolak entri upload jika businessId tidak tercantum di manifest.businessIds', async () => {
    const manifest = createValidBaseManifest({
      businessIds: ['biz_resmi'],
      options: { includeUploads: true },
    });

    const maliciousZip = zipSync({
      'manifest.json': strToU8(JSON.stringify(manifest)),
      'uploads/biz_palsu/logo/logo.png': strToU8('data'),
    });

    const report = await importData(maliciousZip, {
      dryRun: true,
      replaceSeedSuperadmin: false,
      actor: null,
      uploadDir: env.UPLOAD_DIR,
    });

    expect(report.ok).toBe(false);
    expect(report.errors.some((e) => e.includes('tidak terdaftar di manifest.businessIds'))).toBe(true);
  });

  it('menolak impor bila checksum SHA-256 berkas ndjson telah diubah/korup', async () => {
    const manifest = createValidBaseManifest({
      tables: {
        Business: {
          file: 'data/Business.ndjson',
          rows: 1,
          sha256: 'valid_sha256_checksum_hash_here',
        },
      },
    });

    const zip = zipSync({
      'manifest.json': strToU8(JSON.stringify(manifest)),
      'data/Business.ndjson': strToU8('{"id":"biz_01","name":"Modified"}\n'),
    });

    const report = await importData(zip, {
      dryRun: true,
      replaceSeedSuperadmin: false,
      actor: null,
      uploadDir: env.UPLOAD_DIR,
    });

    expect(report.ok).toBe(false);
    expect(report.errors.some((e) => e.includes('checksum SHA-256 tidak cocok'))).toBe(true);
  });

  it('menolak impor bila lastMigration target tidak identik dengan sumber', async () => {
    const manifest = createValidBaseManifest({
      lastMigration: '20261107000001_old_migration',
    });

    // Database target mengembalikan migrasi yang lebih baru
    vi.spyOn(prisma, '$queryRaw').mockResolvedValue([
      { migration_name: dummyMigration },
    ] as any);

    const zip = zipSync({
      'manifest.json': strToU8(JSON.stringify(manifest)),
    });

    const report = await importData(zip, {
      dryRun: true,
      replaceSeedSuperadmin: false,
      actor: null,
      uploadDir: env.UPLOAD_DIR,
    });

    expect(report.ok).toBe(false);
    expect(report.errors.some((e) => e.includes('Versi migrasi database sumber'))).toBe(true);
  });

  it('menolak berkas upload bila magic bytes bukan gambar atau PDF yang sah', async () => {
    const fakeContent = 'THIS IS PLAIN TEXT PRETENDING TO BE PNG';
    const fakeCrypto = await import('crypto');
    const fakeHash = fakeCrypto.createHash('sha256').update(fakeContent).digest('hex');

    const manifest = createValidBaseManifest({
      businessIds: ['biz_01'],
      options: { includeUploads: true },
      uploads: {
        fileCount: 1,
        totalBytes: fakeContent.length,
        files: [{ path: 'uploads/biz_01/logo/fake.png', sha256: fakeHash }],
        missing: [],
      },
    });

    const zip = zipSync({
      'manifest.json': strToU8(JSON.stringify(manifest)),
      'uploads/biz_01/logo/fake.png': strToU8(fakeContent),
    });

    const report = await importData(zip, {
      dryRun: true,
      replaceSeedSuperadmin: false,
      actor: null,
      uploadDir: env.UPLOAD_DIR,
    });

    expect(report.ok).toBe(false);
    expect(report.errors.some((e) => e.includes('bukan format gambar/PDF yang sah'))).toBe(true);
  });
});

