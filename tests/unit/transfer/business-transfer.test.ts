import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { Role } from '@prisma/client';
import { zipSync, strToU8 } from 'fflate';
import * as contextModule from '@/lib/auth/context';
import { env } from '@/lib/env';
import { POST as postImport } from '@/app/api/v1/data-transfer/import/route';

describe('Unit Transfer: API Impor Mode Usaha & RBAC (Bagian 10 Butir F)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
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
});
