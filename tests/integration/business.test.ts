import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import {
  GET as getBusinessesHandler,
  POST as createBusinessHandler,
} from '@/app/api/v1/businesses/route';
import {
  GET as getBusinessDetailHandler,
  PATCH as updateBusinessHandler,
  DELETE as deleteBusinessHandler,
} from '@/app/api/v1/businesses/[id]/route';
import {
  GET as getBankAccountsHandler,
  POST as createBankAccountHandler,
} from '@/app/api/v1/businesses/[id]/bank-accounts/route';
import {
  GET as getBankAccountHandler,
  PATCH as updateBankAccountHandler,
  DELETE as deleteBankAccountHandler,
} from '@/app/api/v1/bank-accounts/[id]/route';
import { POST as uploadLogoHandler } from '@/app/api/v1/businesses/[id]/logo/route';
import { Role } from '@prisma/client';
import * as contextModule from '@/lib/auth/context';

interface MockBusiness {
  id: string;
  code: string;
  name: string;
  legalName: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  npwp: string | null;
  logoPath: string | null;
  invoiceTheme: any;
  invoiceFooterNote: string | null;
  ppnEnabled: boolean;
  ppnRateBps: number;
  allowNegativeStock: boolean;
  requirePaidBeforeShip: boolean;
  defaultDpBps: number;
  dueDays: number;
  defaultRepeatDays: number;
  commissionMode: any;
  commissionRateBps: number;
  commissionFixedAmount: bigint;
  commissionTrigger: any;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

interface MockBankAccount {
  id: string;
  businessId: string;
  bankName: string;
  accountNumber: string;
  accountHolder: string;
  isDefault: boolean;
  deletedAt: Date | null;
}

interface MockAuditLog {
  id: string;
  businessId: string | null;
  actorId: string | null;
  actorRole: Role | null;
  action: string;
  entityType: string;
  entityId: string;
  summary: string | null;
  before: any;
  after: any;
  reason: string | null;
  ip: string | null;
}

let businesses: MockBusiness[] = [];
let bankAccounts: MockBankAccount[] = [];
let auditLogs: MockAuditLog[] = [];
let orderCountByBusiness: Record<string, number> = {};

vi.mock('@/lib/db', () => ({
  prisma: {
    business: {
      findUnique: vi.fn(
        async ({ where }: { where: { code?: string; id?: string } }) => {
          if (where.code) {
            const found = businesses.find(
              (b) => b.code === where.code && b.deletedAt === null
            );
            return found ? { ...found } : null;
          }
          if (where.id) {
            const found = businesses.find(
              (b) => b.id === where.id && b.deletedAt === null
            );
            return found ? { ...found } : null;
          }
          return null;
        }
      ),
      findFirst: vi.fn(async ({ where }: { where: any }) => {
        const found = businesses.find((b) => {
          if (where.id && typeof where.id === 'string' && b.id !== where.id)
            return false;
          if (where.id?.not && b.id === where.id.not) return false;
          if (where.code && b.code !== where.code) return false;
          if (where.deletedAt === null && b.deletedAt !== null) return false;
          return true;
        });
        return found ? { ...found } : null;
      }),
      findMany: vi.fn(async ({ where }: { where: any }) => {
        return businesses
          .filter((b) => {
            if (where?.deletedAt === null && b.deletedAt !== null) return false;
            return true;
          })
          .map((b) => ({ ...b }));
      }),
      create: vi.fn(async ({ data }: { data: any }) => {
        const item: MockBusiness = {
          id: `biz_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          ...data,
          createdAt: new Date(),
          updatedAt: new Date(),
          deletedAt: null,
        };
        businesses.push(item);
        return { ...item };
      }),
      update: vi.fn(async ({ where, data }: { where: any; data: any }) => {
        const b = businesses.find((item) => item.id === where.id);
        if (!b) throw new Error('Business not found');
        Object.assign(b, data, { updatedAt: new Date() });
        return { ...b };
      }),
    },
    bankAccount: {
      findFirst: vi.fn(async ({ where }: { where: any }) => {
        const found = bankAccounts.find((a) => {
          if (where.id && a.id !== where.id) return false;
          if (where.businessId && a.businessId !== where.businessId)
            return false;
          if (where.deletedAt === null && a.deletedAt !== null) return false;
          return true;
        });
        return found ? { ...found } : null;
      }),
      findMany: vi.fn(async ({ where }: { where: any }) => {
        return bankAccounts
          .filter((a) => {
            if (where?.businessId && a.businessId !== where.businessId)
              return false;
            if (where?.deletedAt === null && a.deletedAt !== null) return false;
            return true;
          })
          .map((a) => ({ ...a }));
      }),
      create: vi.fn(async ({ data }: { data: any }) => {
        const item: MockBankAccount = {
          id: `bank_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          ...data,
          deletedAt: null,
        };
        bankAccounts.push(item);
        return { ...item };
      }),
      update: vi.fn(async ({ where, data }: { where: any; data: any }) => {
        const a = bankAccounts.find((item) => item.id === where.id);
        if (!a) throw new Error('Bank account not found');
        Object.assign(a, data);
        return { ...a };
      }),
      updateMany: vi.fn(async ({ where, data }: { where: any; data: any }) => {
        let count = 0;
        for (const a of bankAccounts) {
          if (where.businessId && a.businessId !== where.businessId) continue;
          if (where.id?.not && a.id === where.id.not) continue;
          if (where.isDefault !== undefined && a.isDefault !== where.isDefault)
            continue;
          if (where.deletedAt === null && a.deletedAt !== null) continue;
          Object.assign(a, data);
          count++;
        }
        return { count };
      }),
    },
    order: {
      count: vi.fn(async ({ where }: { where: any }) => {
        return orderCountByBusiness[where.businessId] || 0;
      }),
    },
    auditLog: {
      create: vi.fn(async ({ data }: { data: any }) => {
        const log: MockAuditLog = {
          id: `audit_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          ...data,
        };
        auditLogs.push(log);
        return log;
      }),
    },
    $transaction: vi.fn(async (cb: any) => {
      // Execute the callback with mocked prisma
      const { prisma } = await import('@/lib/db');
      return cb(prisma);
    }),
  },
}));

describe('Integrasi Pengaturan Usaha, Rekening Bank, Berkas & Audit (T1.3)', () => {
  const APP_URL = 'http://localhost:3000';

  const superAdminCtx = {
    user: {
      id: 'super_admin_1',
      username: 'superadmin',
      role: Role.SUPERADMIN,
      name: 'Super Administrator',
      businessId: null,
      mustChangePassword: false,
    },
    session: {
      id: 'sess_1',
      userId: 'super_admin_1',
      tokenHash: 'token123',
      activeBusinessId: null,
      userAgent: null,
      ip: '127.0.0.1',
      createdAt: new Date(),
      lastUsedAt: new Date(),
      expiresAt: new Date(),
      revokedAt: null,
    },
    role: Role.SUPERADMIN,
    businessId: null,
    ip: '127.0.0.1',
    userAgent: 'Vitest/3.0',
  };

  beforeEach(() => {
    businesses = [];
    bankAccounts = [];
    auditLogs = [];
    orderCountByBusiness = {};
    vi.clearAllMocks();

    vi.spyOn(contextModule, 'requireContext').mockResolvedValue(
      superAdminCtx as any
    );
  });

  describe('CRUD Unit Usaha (/api/v1/businesses)', () => {
    it('membuat unit usaha baru dengan kode uppercase dan mencatat audit log', async () => {
      const req = new NextRequest(`${APP_URL}/api/v1/businesses`, {
        method: 'POST',
        headers: { origin: APP_URL, 'content-type': 'application/json' },
        body: JSON.stringify({
          code: 'cat',
          name: 'BentoCat Pet Food',
          legalName: 'PT BentoCat Nusantara',
          address: 'Jl. Kucing Bahagia No. 12',
          phone: '08123456789',
          email: 'halo@bentocat.com',
          ppnEnabled: true,
          ppnRateBps: 1100,
        }),
      });

      const res = await createBusinessHandler(req);
      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.ok).toBe(true);
      expect(json.data.code).toBe('CAT'); // Diubah menjadi uppercase
      expect(json.data.name).toBe('BentoCat Pet Food');
      expect(json.data.ppnEnabled).toBe(true);

      // Verifikasi audit log tertulis
      const createAudit = auditLogs.find(
        (a) => a.action === 'BUSINESS_CREATE' && a.entityId === json.data.id
      );
      expect(createAudit).toBeDefined();
      expect(createAudit?.actorId).toBe('super_admin_1');
      expect(createAudit?.after.code).toBe('CAT');
    });

    it('menolak pembuatan unit usaha bila kode duplikat (409 DUPLICATE)', async () => {
      // Usaha pertama
      businesses.push({
        id: 'biz_1',
        code: 'CAT',
        name: 'First Biz',
        legalName: null,
        address: null,
        phone: null,
        email: null,
        npwp: null,
        logoPath: null,
        invoiceTheme: 'PROFESIONAL',
        invoiceFooterNote: null,
        ppnEnabled: false,
        ppnRateBps: 1100,
        allowNegativeStock: false,
        requirePaidBeforeShip: false,
        defaultDpBps: 5000,
        dueDays: 7,
        defaultRepeatDays: 30,
        commissionMode: 'PERCENT_OF_PROFIT',
        commissionRateBps: 1000,
        commissionFixedAmount: 0n,
        commissionTrigger: 'ON_FULL_PAID',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      });

      const req = new NextRequest(`${APP_URL}/api/v1/businesses`, {
        method: 'POST',
        headers: { origin: APP_URL, 'content-type': 'application/json' },
        body: JSON.stringify({
          code: 'CAT',
          name: 'Second Biz with Same Code',
        }),
      });

      const res = await createBusinessHandler(req);
      expect(res.status).toBe(409);
      const json = await res.json();
      expect(json.error.code).toBe('DUPLICATE');
    });

    it('mengambil daftar seluruh unit usaha aktif', async () => {
      businesses.push(
        {
          id: 'biz_1',
          code: 'CAT',
          name: 'Cat Shop',
          legalName: null,
          address: null,
          phone: null,
          email: null,
          npwp: null,
          logoPath: null,
          invoiceTheme: 'PROFESIONAL',
          invoiceFooterNote: null,
          ppnEnabled: false,
          ppnRateBps: 1100,
          allowNegativeStock: false,
          requirePaidBeforeShip: false,
          defaultDpBps: 5000,
          dueDays: 7,
          defaultRepeatDays: 30,
          commissionMode: 'PERCENT_OF_PROFIT',
          commissionRateBps: 1000,
          commissionFixedAmount: 0n,
          commissionTrigger: 'ON_FULL_PAID',
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
          deletedAt: null,
        },
        {
          id: 'biz_deleted',
          code: 'DEL',
          name: 'Deleted Shop',
          legalName: null,
          address: null,
          phone: null,
          email: null,
          npwp: null,
          logoPath: null,
          invoiceTheme: 'PROFESIONAL',
          invoiceFooterNote: null,
          ppnEnabled: false,
          ppnRateBps: 1100,
          allowNegativeStock: false,
          requirePaidBeforeShip: false,
          defaultDpBps: 5000,
          dueDays: 7,
          defaultRepeatDays: 30,
          commissionMode: 'PERCENT_OF_PROFIT',
          commissionRateBps: 1000,
          commissionFixedAmount: 0n,
          commissionTrigger: 'ON_FULL_PAID',
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
          deletedAt: new Date(),
        }
      );

      const req = new NextRequest(`${APP_URL}/api/v1/businesses`);
      const res = await getBusinessesHandler(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data).toHaveLength(1);
      expect(json.data[0].code).toBe('CAT');
    });
  });

  describe('Aturan Immutability Kode Usaha & Update Pengaturan (Seksi 10.5)', () => {
    beforeEach(() => {
      businesses.push({
        id: 'biz_lock',
        code: 'ORIGINAL',
        name: 'Original Name',
        legalName: null,
        address: null,
        phone: null,
        email: null,
        npwp: null,
        logoPath: null,
        invoiceTheme: 'PROFESIONAL',
        invoiceFooterNote: null,
        ppnEnabled: false,
        ppnRateBps: 1100,
        allowNegativeStock: false,
        requirePaidBeforeShip: false,
        defaultDpBps: 5000,
        dueDays: 7,
        defaultRepeatDays: 30,
        commissionMode: 'PERCENT_OF_PROFIT',
        commissionRateBps: 1000,
        commissionFixedAmount: 0n,
        commissionTrigger: 'ON_FULL_PAID',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      });
    });

    it('MENOLAK pengubahan kode usaha bila sudah ada order di usaha tersebut (409 INVALID_STATE)', async () => {
      // Simulasikan sudah ada order untuk biz_lock
      orderCountByBusiness['biz_lock'] = 3;

      const req = new NextRequest(`${APP_URL}/api/v1/businesses/biz_lock`, {
        method: 'PATCH',
        headers: { origin: APP_URL, 'content-type': 'application/json' },
        body: JSON.stringify({
          code: 'CHANGED',
        }),
      });

      const res = await updateBusinessHandler(req, {
        params: Promise.resolve({ id: 'biz_lock' }),
      });
      expect(res.status).toBe(409);
      const json = await res.json();
      expect(json.error.code).toBe('INVALID_STATE');
      expect(json.error.message).toContain(
        'Kode usaha tidak bisa diubah setelah ada transaksi order'
      );
    });

    it('MENGIZINKAN pengubahan kode usaha bila orderCount = 0 dan mencatat audit log', async () => {
      orderCountByBusiness['biz_lock'] = 0;

      const req = new NextRequest(`${APP_URL}/api/v1/businesses/biz_lock`, {
        method: 'PATCH',
        headers: { origin: APP_URL, 'content-type': 'application/json' },
        body: JSON.stringify({
          code: 'NEWCODE',
          name: 'Updated Name',
          ppnEnabled: true,
          ppnRateBps: 1100,
        }),
      });

      const res = await updateBusinessHandler(req, {
        params: Promise.resolve({ id: 'biz_lock' }),
      });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.ok).toBe(true);
      expect(json.data.code).toBe('NEWCODE');
      expect(json.data.name).toBe('Updated Name');

      const auditEntry = auditLogs.find(
        (a) => a.action === 'BUSINESS_UPDATE' && a.entityId === 'biz_lock'
      );
      expect(auditEntry).toBeDefined();
      expect(auditEntry?.before.code).toBe('ORIGINAL');
      expect(auditEntry?.after.code).toBe('NEWCODE');
    });

    it('menolak soft delete unit usaha jika tidak ditemukan (404)', async () => {
      const req = new NextRequest(`${APP_URL}/api/v1/businesses/unknown_biz`, {
        method: 'DELETE',
        headers: { origin: APP_URL },
      });

      const res = await deleteBusinessHandler(req, {
        params: Promise.resolve({ id: 'unknown_biz' }),
      });
      expect(res.status).toBe(404);
    });
  });

  describe('Aturan Rekening Bank: Satu Rekening Default per Usaha', () => {
    beforeEach(() => {
      vi.spyOn(contextModule, 'requireContext').mockResolvedValue({
        ...superAdminCtx,
        businessId: 'biz_bank_test',
        session: { ...superAdminCtx.session, activeBusinessId: 'biz_bank_test' },
      } as any);

      businesses.push({
        id: 'biz_bank_test',
        code: 'BNK',
        name: 'Bank Test Biz',
        legalName: null,
        address: null,
        phone: null,
        email: null,
        npwp: null,
        logoPath: null,
        invoiceTheme: 'PROFESIONAL',
        invoiceFooterNote: null,
        ppnEnabled: false,
        ppnRateBps: 1100,
        allowNegativeStock: false,
        requirePaidBeforeShip: false,
        defaultDpBps: 5000,
        dueDays: 7,
        defaultRepeatDays: 30,
        commissionMode: 'PERCENT_OF_PROFIT',
        commissionRateBps: 1000,
        commissionFixedAmount: 0n,
        commissionTrigger: 'ON_FULL_PAID',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      });
    });

    it('menyetel rekening baru sebagai default dan menonaktifkan default pada rekening lama', async () => {
      // 1. Tambah Rekening A (default: true)
      const req1 = new NextRequest(
        `${APP_URL}/api/v1/businesses/biz_bank_test/bank-accounts`,
        {
          method: 'POST',
          headers: { origin: APP_URL, 'content-type': 'application/json' },
          body: JSON.stringify({
            bankName: 'BCA',
            accountNumber: '1111111111',
            accountHolder: 'BentoCat BCA',
            isDefault: true,
          }),
        }
      );

      const res1 = await createBankAccountHandler(req1, {
        params: Promise.resolve({ id: 'biz_bank_test' }),
      });
      expect(res1.status).toBe(201);
      const acc1 = (await res1.json()).data;
      expect(acc1.isDefault).toBe(true);

      // 2. Tambah Rekening B (default: true)
      const req2 = new NextRequest(
        `${APP_URL}/api/v1/businesses/biz_bank_test/bank-accounts`,
        {
          method: 'POST',
          headers: { origin: APP_URL, 'content-type': 'application/json' },
          body: JSON.stringify({
            bankName: 'Mandiri',
            accountNumber: '2222222222',
            accountHolder: 'BentoCat Mandiri',
            isDefault: true,
          }),
        }
      );

      const res2 = await createBankAccountHandler(req2, {
        params: Promise.resolve({ id: 'biz_bank_test' }),
      });
      expect(res2.status).toBe(201);
      const acc2 = (await res2.json()).data;
      expect(acc2.isDefault).toBe(true);

      // Verifikasi Rekening A otomatis menjadi isDefault = false
      const foundAcc1 = bankAccounts.find((a) => a.id === acc1.id);
      expect(foundAcc1?.isDefault).toBe(false);

      // Hanya ada 1 default
      const defaultAccounts = bankAccounts.filter(
        (a) => a.businessId === 'biz_bank_test' && a.isDefault
      );
      expect(defaultAccounts).toHaveLength(1);
      expect(defaultAccounts[0].id).toBe(acc2.id);
    });

    it('memperbarui rekening bank via PATCH dan mencatat audit log', async () => {
      const bank = {
        id: 'bank_edit_1',
        businessId: 'biz_bank_test',
        bankName: 'BRI',
        accountNumber: '3333333333',
        accountHolder: 'Lama',
        isDefault: false,
        deletedAt: null,
      };
      bankAccounts.push(bank);

      const req = new NextRequest(
        `${APP_URL}/api/v1/bank-accounts/bank_edit_1`,
        {
          method: 'PATCH',
          headers: { origin: APP_URL, 'content-type': 'application/json' },
          body: JSON.stringify({
            accountHolder: 'Baru',
            isDefault: true,
          }),
        }
      );

      const res = await updateBankAccountHandler(req, {
        params: Promise.resolve({ id: 'bank_edit_1' }),
      });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data.accountHolder).toBe('Baru');
      expect(json.data.isDefault).toBe(true);

      const auditEntry = auditLogs.find(
        (a) =>
          a.action === 'BANK_ACCOUNT_UPDATE' && a.entityId === 'bank_edit_1'
      );
      expect(auditEntry).toBeDefined();
    });

    it('menghapus (soft delete) rekening bank via DELETE', async () => {
      const bank = {
        id: 'bank_del_1',
        businessId: 'biz_bank_test',
        bankName: 'BNI',
        accountNumber: '4444444444',
        accountHolder: 'Hapus Me',
        isDefault: true,
        deletedAt: null,
      };
      bankAccounts.push(bank);

      const req = new NextRequest(
        `${APP_URL}/api/v1/bank-accounts/bank_del_1`,
        {
          method: 'DELETE',
          headers: { origin: APP_URL },
        }
      );

      const res = await deleteBankAccountHandler(req, {
        params: Promise.resolve({ id: 'bank_del_1' }),
      });
      expect(res.status).toBe(200);

      const found = bankAccounts.find((a) => a.id === 'bank_del_1');
      expect(found?.deletedAt).not.toBeNull();
      expect(found?.isDefault).toBe(false);

      const auditEntry = auditLogs.find(
        (a) =>
          a.action === 'BANK_ACCOUNT_DELETE' && a.entityId === 'bank_del_1'
      );
      expect(auditEntry).toBeDefined();
    });
  });

  describe('Unggah Logo (/api/v1/businesses/:id/logo)', () => {
    it('memperbarui logoPath unit usaha dan mencatat audit BUSINESS_UPDATE', async () => {
      businesses.push({
        id: 'biz_logo_test',
        code: 'LOGO',
        name: 'Logo Shop',
        legalName: null,
        address: null,
        phone: null,
        email: null,
        npwp: null,
        logoPath: null,
        invoiceTheme: 'PROFESIONAL',
        invoiceFooterNote: null,
        ppnEnabled: false,
        ppnRateBps: 1100,
        allowNegativeStock: false,
        requirePaidBeforeShip: false,
        defaultDpBps: 5000,
        dueDays: 7,
        defaultRepeatDays: 30,
        commissionMode: 'PERCENT_OF_PROFIT',
        commissionRateBps: 1000,
        commissionFixedAmount: 0n,
        commissionTrigger: 'ON_FULL_PAID',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      });

      // 1x1 valid PNG image
      const pngBase64 =
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
      const fileBlob = new Blob([Buffer.from(pngBase64, 'base64')], {
        type: 'image/png',
      });

      const formData = new FormData();
      formData.append('file', fileBlob, 'logo.png');

      const req = new NextRequest(
        `${APP_URL}/api/v1/businesses/biz_logo_test/logo`,
        {
          method: 'POST',
          headers: { origin: APP_URL },
          body: formData,
        }
      );

      const res = await uploadLogoHandler(req, {
        params: Promise.resolve({ id: 'biz_logo_test' }),
      });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.ok).toBe(true);
      expect(json.data.logoPath).toMatch(/^biz_logo_test\/logo\/[a-f0-9-]+\.webp$/);

      const biz = businesses.find((b) => b.id === 'biz_logo_test');
      expect(biz?.logoPath).toBe(json.data.logoPath);

      const auditEntry = auditLogs.find(
        (a) =>
          a.action === 'BUSINESS_UPDATE' &&
          a.entityId === 'biz_logo_test' &&
          a.summary === 'Unggah logo unit usaha'
      );
      expect(auditEntry).toBeDefined();
    });
  });
});
