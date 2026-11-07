import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import {
  GET as getVendorsHandler,
  POST as createVendorHandler,
} from '@/app/api/v1/vendors/route';
import {
  GET as getVendorDetailHandler,
  PATCH as updateVendorHandler,
  DELETE as deleteVendorHandler,
} from '@/app/api/v1/vendors/[id]/route';
import { Role, VendorKind } from '@prisma/client';
import * as contextModule from '@/lib/auth/context';

interface MockVendor {
  id: string;
  businessId: string;
  kind: VendorKind;
  code: string;
  name: string;
  picName: string | null;
  phone: string | null;
  address: string | null;
  bankName: string | null;
  bankAccountNumber: string | null;
  bankAccountHolder: string | null;
  paymentTermDays: number;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

interface MockAuditLog {
  id: string;
  businessId: string | null;
  actorId: string | null;
  action: string;
  entityType: string;
  entityId: string;
  summary: string | null;
}

let vendors: MockVendor[] = [];
let auditLogs: MockAuditLog[] = [];

vi.mock('@/lib/db', () => ({
  prisma: {
    vendor: {
      findFirst: vi.fn(async ({ where }: { where: any }) => {
        return (
          vendors.find((v) => {
            if (where.id && typeof where.id === 'string' && v.id !== where.id) return false;
            if (where.id?.not && v.id === where.id.not) return false;
            if (where.businessId && v.businessId !== where.businessId) return false;
            if (where.code && v.code !== where.code) return false;
            if (where.deletedAt === null && v.deletedAt !== null) return false;
            return true;
          }) || null
        );
      }),
      findMany: vi.fn(async ({ where }: { where: any }) => {
        return vendors
          .filter((v) => {
            if (where.businessId && v.businessId !== where.businessId) return false;
            if (where.deletedAt === null && v.deletedAt !== null) return false;
            if (where.kind && v.kind !== where.kind) return false;
            if (where.OR) {
              const q = where.OR[0].code.contains.toLowerCase();
              const mCode = v.code.toLowerCase().includes(q);
              const mName = v.name.toLowerCase().includes(q);
              const mPic = v.picName ? v.picName.toLowerCase().includes(q) : false;
              if (!mCode && !mName && !mPic) return false;
            }
            return true;
          })
          .map((v) => ({
            ...v,
            _count: {
              products: 0,
              purchaseOrders: 0,
            },
          }));
      }),
      create: vi.fn(async ({ data }: { data: any }) => {
        const item: MockVendor = {
          id: `vnd_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          ...data,
          createdAt: new Date(),
          updatedAt: new Date(),
          deletedAt: null,
        };
        vendors.push(item);
        return {
          ...item,
          _count: {
            products: 0,
            purchaseOrders: 0,
          },
        };
      }),
      update: vi.fn(async ({ where, data }: { where: any; data: any }) => {
        const v = vendors.find((item) => item.id === where.id);
        if (!v) throw new Error('Vendor not found');
        const cleanData: Record<string, any> = {};
        for (const [key, val] of Object.entries(data)) {
          if (val !== undefined) cleanData[key] = val;
        }
        Object.assign(v, cleanData, { updatedAt: new Date() });
        return {
          ...v,
          _count: {
            products: 0,
            purchaseOrders: 0,
          },
        };
      }),
    },
    auditLog: {
      create: vi.fn(async ({ data }: { data: any }) => {
        const item: MockAuditLog = {
          id: `audit_${Date.now()}`,
          ...data,
        };
        auditLogs.push(item);
        return item;
      }),
    },
    $transaction: vi.fn(async (cb: any) => {
      const { prisma } = await import('@/lib/db');
      return cb(prisma);
    }),
  },
}));

describe('Master Vendor & Supplier (T1.7)', () => {
  const APP_URL = 'http://localhost:3000';

  const superAdminCtx = {
    user: {
      id: 'super_admin_id',
      username: 'owner',
      role: Role.SUPERADMIN,
      name: 'Super Administrator',
      businessId: null,
    },
    sessionId: 'sess_admin_1',
    role: Role.SUPERADMIN,
    businessId: 'biz_1',
    ip: '127.0.0.1',
  };

  const salesCtx = {
    user: {
      id: 'sales_user_id',
      username: 'salesbudi',
      role: Role.SALES,
      name: 'Sales Budi',
      businessId: 'biz_1',
    },
    sessionId: 'sess_sales_1',
    role: Role.SALES,
    businessId: 'biz_1',
    ip: '127.0.0.1',
  };

  beforeEach(() => {
    vendors = [];
    auditLogs = [];
    vi.clearAllMocks();

    vi.spyOn(contextModule, 'requireContext').mockResolvedValue(
      superAdminCtx as any
    );
  });

  describe('CRUD /api/v1/vendors', () => {
    it('berhasil membuat vendor baru dengan kode huruf besar dan mencatat audit log (201)', async () => {
      const req = new NextRequest(`${APP_URL}/api/v1/vendors`, {
        method: 'POST',
        headers: { origin: APP_URL, 'content-type': 'application/json' },
        body: JSON.stringify({
          kind: 'SUPPLIER',
          code: 'sumber-jaya',
          name: 'CV Sumber Jaya Abadi',
          picName: 'Hendra Setiawan',
          phone: '081234567890',
          bankName: 'BCA',
          bankAccountNumber: '1234567890',
          bankAccountHolder: 'CV Sumber Jaya Abadi',
          paymentTermDays: 30,
        }),
      });

      const res = await createVendorHandler(req);
      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.ok).toBe(true);
      expect(json.data.code).toBe('SUMBER-JAYA'); // Otomatis huruf besar
      expect(json.data.name).toBe('CV Sumber Jaya Abadi');
      expect(json.data.paymentTermDays).toBe(30);

      // Verifikasi audit log tercatat
      expect(auditLogs).toHaveLength(1);
      expect(auditLogs[0].action).toBe('VENDOR_CREATE');
    });

    it('menolak pembuatan vendor bila kode sudah digunakan di unit usaha yang sama (409 DUPLICATE)', async () => {
      vendors.push({
        id: 'vnd_existing',
        businessId: 'biz_1',
        kind: VendorKind.SUPPLIER,
        code: 'JAYA',
        name: 'PT Jaya Mandiri',
        picName: null,
        phone: null,
        address: null,
        bankName: null,
        bankAccountNumber: null,
        bankAccountHolder: null,
        paymentTermDays: 0,
        notes: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      });

      const req = new NextRequest(`${APP_URL}/api/v1/vendors`, {
        method: 'POST',
        headers: { origin: APP_URL, 'content-type': 'application/json' },
        body: JSON.stringify({
          code: 'jaya', // case insensitive check via uppercase transform
          name: 'Jaya Makmur Sejahtera',
        }),
      });

      const res = await createVendorHandler(req);
      expect(res.status).toBe(409);
      const json = await res.json();
      expect(json.error.code).toBe('DUPLICATE');
    });

    it('mengizinkan kode vendor yang sama pada unit usaha yang berbeda', async () => {
      vendors.push({
        id: 'vnd_biz_2',
        businessId: 'biz_2', // Di unit usaha lain
        kind: VendorKind.SUPPLIER,
        code: 'LOGISTIK',
        name: 'PT Logistik Maju',
        picName: null,
        phone: null,
        address: null,
        bankName: null,
        bankAccountNumber: null,
        bankAccountHolder: null,
        paymentTermDays: 0,
        notes: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      });

      const req = new NextRequest(`${APP_URL}/api/v1/vendors`, {
        method: 'POST',
        headers: { origin: APP_URL, 'content-type': 'application/json' },
        body: JSON.stringify({
          kind: 'TRANSPORT',
          code: 'LOGISTIK',
          name: 'Logistik Bento Ekspres',
        }),
      });

      const res = await createVendorHandler(req);
      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.data.code).toBe('LOGISTIK');
      expect(json.data.businessId).toBe('biz_1');
    });

    it('berhasil memfilter vendor berdasarkan jenis (SUPPLIER vs TRANSPORT)', async () => {
      vendors.push(
        {
          id: 'vnd_1',
          businessId: 'biz_1',
          kind: VendorKind.SUPPLIER,
          code: 'SUP-01',
          name: 'Pemasok Bahan',
          picName: null,
          phone: null,
          address: null,
          bankName: null,
          bankAccountNumber: null,
          bankAccountHolder: null,
          paymentTermDays: 14,
          notes: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          deletedAt: null,
        },
        {
          id: 'vnd_2',
          businessId: 'biz_1',
          kind: VendorKind.TRANSPORT,
          code: 'EXP-01',
          name: 'Jasa Kargo Cepat',
          picName: null,
          phone: null,
          address: null,
          bankName: null,
          bankAccountNumber: null,
          bankAccountHolder: null,
          paymentTermDays: 0,
          notes: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          deletedAt: null,
        }
      );

      // Cari jenis TRANSPORT
      const reqTransport = new NextRequest(
        `${APP_URL}/api/v1/vendors?kind=TRANSPORT`
      );
      const resTransport = await getVendorsHandler(reqTransport);
      expect(resTransport.status).toBe(200);
      const jsonTransport = await resTransport.json();
      expect(jsonTransport.data).toHaveLength(1);
      expect(jsonTransport.data[0].code).toBe('EXP-01');

      // Cari jenis SUPPLIER
      const reqSupplier = new NextRequest(
        `${APP_URL}/api/v1/vendors?kind=SUPPLIER`
      );
      const resSupplier = await getVendorsHandler(reqSupplier);
      expect(resSupplier.status).toBe(200);
      const jsonSupplier = await resSupplier.json();
      expect(jsonSupplier.data).toHaveLength(1);
      expect(jsonSupplier.data[0].code).toBe('SUP-01');
    });
  });

  describe('Detail, Ubah, dan Hapus Vendor (/api/v1/vendors/:id)', () => {
    beforeEach(() => {
      vendors.push({
        id: 'vnd_sample',
        businessId: 'biz_1',
        kind: VendorKind.SUPPLIER,
        code: 'VND-01',
        name: 'Vendor Sampel Awal',
        picName: 'Pak Joko',
        phone: '0811223344',
        address: 'Jl. Industri No. 5',
        bankName: 'Mandiri',
        bankAccountNumber: '987654321',
        bankAccountHolder: 'PT Sampel',
        paymentTermDays: 14,
        notes: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      });
    });

    it('berhasil mengambil detail vendor', async () => {
      const req = new NextRequest(`${APP_URL}/api/v1/vendors/vnd_sample`);
      const res = await getVendorDetailHandler(req, {
        params: Promise.resolve({ id: 'vnd_sample' }),
      });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data.name).toBe('Vendor Sampel Awal');
      expect(json.data.picName).toBe('Pak Joko');
    });

    it('berhasil memperbarui data vendor dan mencatat audit log', async () => {
      const req = new NextRequest(`${APP_URL}/api/v1/vendors/vnd_sample`, {
        method: 'PATCH',
        headers: { origin: APP_URL, 'content-type': 'application/json' },
        body: JSON.stringify({
          name: 'Vendor Sampel Diperbarui',
          paymentTermDays: 45,
          picName: 'Bu Siti',
        }),
      });

      const res = await updateVendorHandler(req, {
        params: Promise.resolve({ id: 'vnd_sample' }),
      });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data.name).toBe('Vendor Sampel Diperbarui');
      expect(json.data.paymentTermDays).toBe(45);
      expect(json.data.picName).toBe('Bu Siti');

      // Verifikasi audit log
      expect(auditLogs).toHaveLength(1);
      expect(auditLogs[0].action).toBe('VENDOR_UPDATE');
    });

    it('menolak pengubahan kode bila kode bentrok dengan vendor lain', async () => {
      vendors.push({
        id: 'vnd_other',
        businessId: 'biz_1',
        kind: VendorKind.SUPPLIER,
        code: 'DUPLIKAT',
        name: 'Vendor Lain',
        picName: null,
        phone: null,
        address: null,
        bankName: null,
        bankAccountNumber: null,
        bankAccountHolder: null,
        paymentTermDays: 0,
        notes: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      });

      const req = new NextRequest(`${APP_URL}/api/v1/vendors/vnd_sample`, {
        method: 'PATCH',
        headers: { origin: APP_URL, 'content-type': 'application/json' },
        body: JSON.stringify({
          code: 'DUPLIKAT',
        }),
      });

      const res = await updateVendorHandler(req, {
        params: Promise.resolve({ id: 'vnd_sample' }),
      });
      expect(res.status).toBe(409);
      const json = await res.json();
      expect(json.error.code).toBe('DUPLICATE');
    });

    it('berhasil melakukan soft delete vendor', async () => {
      const req = new NextRequest(`${APP_URL}/api/v1/vendors/vnd_sample`, {
        method: 'DELETE',
        headers: { origin: APP_URL },
      });

      const res = await deleteVendorHandler(req, {
        params: Promise.resolve({ id: 'vnd_sample' }),
      });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data.id).toBe('vnd_sample');
      expect(json.data.deletedAt).toBeDefined();

      // Pastikan vendor tidak muncul lagi di findMany
      const listReq = new NextRequest(`${APP_URL}/api/v1/vendors`);
      const listRes = await getVendorsHandler(listReq);
      const listJson = await listRes.json();
      expect(listJson.data).toHaveLength(0);

      // Verifikasi audit log
      expect(auditLogs).toHaveLength(1);
      expect(auditLogs[0].action).toBe('VENDOR_DELETE');
    });
  });

  describe('Proteksi Otorisasi Role Sales', () => {
    it('MENOLAK akun Sales memanggil endpoint vendor', async () => {
      vi.restoreAllMocks();
      const sessionModule = await import('@/lib/auth/session');
      vi.spyOn(sessionModule, 'findValidSession').mockResolvedValueOnce({
        id: 'sess_sales_1',
        userId: 'sales_user_1',
        tokenHash: 'h',
        activeBusinessId: null,
        userAgent: null,
        ip: '127.0.0.1',
        createdAt: new Date(),
        lastUsedAt: new Date(),
        expiresAt: new Date(Date.now() + 86400000),
        revokedAt: null,
        user: {
          id: 'sales_user_1',
          role: Role.SALES,
          name: 'Sales Lapangan',
          businessId: 'biz_1',
          isActive: true,
          mustChangePassword: false,
          deletedAt: null,
        } as any,
      });

      const req = new NextRequest(`${APP_URL}/api/v1/vendors`, {
        headers: {
          origin: APP_URL,
          cookie: 'sid=sales_session_token',
        },
      });
      const res = await getVendorsHandler(req);
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.error.code).toBe('FORBIDDEN');
    });
  });
});
