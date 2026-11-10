import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { Role } from '@prisma/client';
import { unzipSync, strFromU8 } from 'fflate';
import { exportData } from '@/lib/transfer/export';
import { prisma } from '@/lib/db';
import * as contextModule from '@/lib/auth/context';
import { GET as getBusinessExport } from '@/app/api/v1/businesses/[id]/export/route';
import { GET as getSystemExport } from '@/app/api/v1/data-transfer/export/route';

describe('Unit Transfer: Ekspor Data & Route Handler RBAC (Bagian 10 Butir D Sisi Ekspor & F)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('menghasilkan berkas ZIP lengkap dengan manifest.json dan ndjson yang valid', async () => {
    // Mock prisma.$transaction dan queries
    const mockBiz = {
      id: 'biz_001',
      code: 'BENTOCAT',
      name: 'BentoCat Litter',
      logoPath: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    };

    vi.spyOn(prisma.business, 'findFirst').mockResolvedValue(mockBiz as any);

    vi.spyOn(prisma, '$transaction').mockImplementation(async (callback: any) => {
      const mockTx: Record<string, any> = {
        $queryRaw: vi.fn().mockResolvedValue([
          { migration_name: '20261110000003_catalog_same_business_guard' },
        ]),
        business: {
          findMany: vi.fn().mockResolvedValue([mockBiz]),
        },
      };

      // Mock semua delegate di TABLES agar mengembalikan array kosong kecuali business
      const { TABLES } = await import('@/lib/transfer/registry');
      for (const t of TABLES) {
        if (!mockTx[t.delegate]) {
          mockTx[t.delegate] = {
            findMany: vi.fn().mockResolvedValue([]),
          };
        }
      }

      return callback(mockTx);
    });

    const result = await exportData({
      scope: 'business',
      businessId: 'biz_001',
      actorName: 'superadmin',
      includeUploads: false,
    });

    expect(result.filename).toMatch(/^omnicat-export-business-BENTOCAT-\d{8}-\d{6}\.zip$/);
    expect(result.data).toBeInstanceOf(Uint8Array);
    expect(result.manifest.format).toBe('omnicat-export');
    expect(result.manifest.scope).toBe('business');
    expect(result.manifest.businessCodes).toEqual(['BENTOCAT']);

    // Unzip dan periksa isi entri
    const unzipped = unzipSync(result.data);
    expect(unzipped['manifest.json']).toBeDefined();
    expect(unzipped['data/Business.ndjson']).toBeDefined();

    const manifestContent = JSON.parse(strFromU8(unzipped['manifest.json']));
    expect(manifestContent.formatVersion).toBe(1);
    expect(manifestContent.tables.Business.rows).toBe(1);

    const businessNdjson = strFromU8(unzipped['data/Business.ndjson']);
    expect(businessNdjson).toContain('"code":"BENTOCAT"');
  });

  it('menolak akses pengguna dengan peran SALES (403 Forbidden)', async () => {
    const salesCtx: any = {
      user: { id: 'sales_1', role: Role.SALES, businessId: 'biz_001' },
      role: Role.SALES,
      session: { id: 'sess_1', activeBusinessId: 'biz_001' },
    };

    vi.spyOn(contextModule, 'requireContext').mockRejectedValue({
      status: 403,
      message: 'Akses ditolak: role tidak memiliki izin untuk resource ini',
      code: 'FORBIDDEN',
    });

    const req = new NextRequest('http://localhost:3000/api/v1/businesses/biz_001/export');
    const res = await getBusinessExport(req, {
      params: Promise.resolve({ id: 'biz_001' }),
    });

    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.ok).toBe(false);
  });

  it('menolak akses tanpa sesi otentikasi (401 Unauthorized)', async () => {
    vi.spyOn(contextModule, 'requireContext').mockRejectedValue({
      status: 401,
      message: 'Sesi tidak valid atau telah berakhir',
      code: 'UNAUTHORIZED',
    });

    const req = new NextRequest('http://localhost:3000/api/v1/data-transfer/export');
    const res = await getSystemExport(req);

    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.ok).toBe(false);
  });
});

