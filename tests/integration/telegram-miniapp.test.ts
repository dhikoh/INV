import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import crypto from 'node:crypto';
import {
  Role,
  InvoiceStatus,
  InvoiceTheme,
} from '@prisma/client';
import { POST as authTelegramHandler, DELETE as unlinkTelegramHandler } from '@/app/api/v1/auth/telegram/route';
import { POST as generateDownloadHandler } from '@/app/api/v1/downloads/route';
import { GET as serveDownloadHandler } from '@/app/api/v1/dl/[token]/route';
import {
  validateInitData,
  generateTestInitData,
  TelegramUser,
} from '@/lib/telegram/initData';
import {
  createDownloadToken,
  verifyDownloadToken,
} from '@/lib/pdf/downloadToken';
import { env } from '@/lib/env';
import * as contextModule from '@/lib/auth/context';
import type { Ctx } from '@/lib/auth/context';
import { DomainError } from '@/lib/domain/money';

// Mock DB stores
let mockUsers: any[] = [];
let mockSessions: any[] = [];
let mockLoginAttempts: any[] = [];
let mockInvoices: any[] = [];
let mockOrders: any[] = [];
let mockCreditNotes: any[] = [];
let mockCatalogs: any[] = [];
let mockAuditLogs: any[] = [];

vi.mock('@/lib/db', () => ({
  prisma: {
    $transaction: vi.fn(async (cb: (tx: any) => any) => {
      return cb(prismaMock);
    }),
    user: {
      findFirst: vi.fn(async ({ where }: { where: Record<string, any> }) => {
        return (
          mockUsers.find((u) => {
            if (where.id && u.id !== where.id) return false;
            if (where.telegramChatId && u.telegramChatId !== where.telegramChatId) return false;
            if (where.isActive !== undefined && u.isActive !== where.isActive) return false;
            if (where.deletedAt === null && u.deletedAt !== null) return false;
            return true;
          }) || null
        );
      }),
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
        return mockUsers.find((u) => u.id === where.id) || null;
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: any }) => {
        const u = mockUsers.find((user) => user.id === where.id);
        if (u) {
          Object.assign(u, data);
        }
        return u;
      }),
    },
    session: {
      findMany: vi.fn(async ({ where }: { where: Record<string, any> }) => {
        return mockSessions.filter((s) => {
          if (where.userId && s.userId !== where.userId) return false;
          if (where.revokedAt === null && s.revokedAt !== null) return false;
          return true;
        });
      }),
      updateMany: vi.fn(async ({ where, data }: { where: Record<string, any>; data: any }) => {
        let count = 0;
        mockSessions.forEach((s) => {
          if (where.id && Array.isArray(where.id.in) && where.id.in.includes(s.id)) {
            Object.assign(s, data);
            count++;
          }
        });
        return { count };
      }),
      create: vi.fn(async ({ data }: { data: any }) => {
        const sess = {
          id: `sess_${Date.now()}_${Math.random().toString(36).substring(7)}`,
          ...data,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        mockSessions.push(sess);
        return sess;
      }),
    },
    loginAttempt: {
      count: vi.fn(async ({ where }: { where: Record<string, any> }) => {
        return mockLoginAttempts.filter((a) => {
          if (where.username && a.username !== where.username) return false;
          if (where.ip && a.ip !== where.ip) return false;
          if (where.success !== undefined && a.success !== where.success) return false;
          return true;
        }).length;
      }),
      create: vi.fn(async ({ data }: { data: any }) => {
        const record = {
          id: `att_${Date.now()}`,
          ...data,
          createdAt: new Date(),
        };
        mockLoginAttempts.push(record);
        return record;
      }),
    },
    invoice: {
      findFirst: vi.fn(async ({ where }: { where: Record<string, any> }) => {
        return (
          mockInvoices.find((i) => {
            if (where.id && i.id !== where.id) return false;
            if (where.businessId && i.businessId !== where.businessId) return false;
            if (where.deletedAt === null && i.deletedAt !== null) return false;
            return true;
          }) || null
        );
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: any }) => {
        const inv = mockInvoices.find((i) => i.id === where.id);
        if (inv) {
          if (data.printedCount?.increment) {
            inv.printedCount = (inv.printedCount || 0) + data.printedCount.increment;
          }
          if (data.lastPrintedAt) {
            inv.lastPrintedAt = data.lastPrintedAt;
          }
        }
        return inv;
      }),
    },
    order: {
      findFirst: vi.fn(async ({ where }: { where: Record<string, any> }) => {
        return (
          mockOrders.find((o) => {
            if (where.id && o.id !== where.id) return false;
            if (where.businessId && o.businessId !== where.businessId) return false;
            if (where.deletedAt === null && o.deletedAt !== null) return false;
            return true;
          }) || null
        );
      }),
    },
    creditNote: {
      findFirst: vi.fn(async ({ where }: { where: Record<string, any> }) => {
        return (
          mockCreditNotes.find((c) => {
            if (where.id && c.id !== where.id) return false;
            if (where.businessId && c.businessId !== where.businessId) return false;
            if (where.deletedAt === null && c.deletedAt !== null) return false;
            return true;
          }) || null
        );
      }),
    },
    catalog: {
      findFirst: vi.fn(async ({ where }: { where: Record<string, any> }) => {
        return (
          mockCatalogs.find((c) => {
            if (where.id && c.id !== where.id) return false;
            if (where.businessId && c.businessId !== where.businessId) return false;
            return true;
          }) || null
        );
      }),
    },
    auditLog: {
      create: vi.fn(async ({ data }: { data: any }) => {
        mockAuditLogs.push(data);
        return data;
      }),
    },
  },
}));

// Provide reference for transaction mock
const prismaMock = (await vi.importMock('@/lib/db') as any).prisma;

// Mock PDF render engine
vi.mock('@/lib/pdf/engine', () => ({
  renderReactToPdf: vi.fn(async () => Buffer.from('%PDF-1.4 mock pdf binary')),
}));

// Mock buildInvoiceSnapshot
vi.mock('@/lib/pdf/snapshot', () => ({
  buildInvoiceSnapshot: vi.fn(async () => ({
    number: 'INV/2026/01',
    issueDate: '2026-03-01',
    dueDate: '2026-03-31',
    business: {
      name: 'PT OmniCat Test',
      legalName: 'PT OmniCat Test Indo',
      address: 'Jl. Melawai No. 10',
      phone: '08123456789',
      email: 'biz@omnicat.id',
      npwp: '01.234.567.8-901.000',
      logoPath: null,
    },
    customer: {
      name: 'Toko Berkah',
      address: 'Jl. Pahlawan No. 5',
      phone: '081999888777',
      npwp: null,
    },
    lines: [],
    subtotal: 100000n,
    discountAmount: 0n,
    taxAmount: 11000n,
    total: 111000n,
    paidTotal: 0n,
    remainingDue: 111000n,
    theme: InvoiceTheme.PROFESIONAL,
    notes: 'Terima kasih',
    bankAccounts: [],
  })),
}));

describe('T4.3: Telegram Mini App, Autologin initData, dan Tautan Unduh Bertanda Tangan (Seksi 11.5, 12.3, 16.3)', () => {
  const BOT_TOKEN =
    env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_BOT_TOKEN.trim().length > 0
      ? env.TELEGRAM_BOT_TOKEN
      : '123456789:AAFakeTokenForLocalTesting00000000';

  const BIZ_ID = 'biz_test_01';
  const OTHER_BIZ_ID = 'biz_other_02';

  const superAdminUser = {
    id: 'usr_admin',
    username: 'superadmin',
    name: 'Super Admin',
    role: Role.SUPERADMIN,
    businessId: BIZ_ID,
    isActive: true,
    telegramChatId: 987654321n,
    telegramLinkedAt: new Date('2026-01-01'),
    telegramBlocked: false,
    mustChangePassword: false,
    deletedAt: null,
  };

  const salesUser = {
    id: 'usr_sales_1',
    username: 'sales1',
    name: 'Sales Lapangan 1',
    role: Role.SALES,
    businessId: BIZ_ID,
    isActive: true,
    telegramChatId: 1122334455n,
    telegramLinkedAt: new Date('2026-01-01'),
    telegramBlocked: false,
    mustChangePassword: false,
    deletedAt: null,
  };

  const salesUser2 = {
    id: 'usr_sales_2',
    username: 'sales2',
    name: 'Sales Lapangan 2',
    role: Role.SALES,
    businessId: BIZ_ID,
    isActive: true,
    telegramChatId: null,
    telegramLinkedAt: null,
    telegramBlocked: false,
    mustChangePassword: false,
    deletedAt: null,
  };

  let activeCtx: Ctx;

  beforeEach(() => {
    mockUsers = [
      { ...superAdminUser },
      { ...salesUser },
      { ...salesUser2 },
    ];
    mockSessions = [];
    mockLoginAttempts = [];
    mockInvoices = [
      {
        id: 'inv_approved_1',
        businessId: BIZ_ID,
        orderId: 'ord_sales_1',
        number: 'INV/2026/001',
        status: InvoiceStatus.APPROVED,
        amount: 500000n,
        paidAmount: 0n,
        printedCount: 0,
        lastPrintedAt: null,
        snapshot: null,
        theme: InvoiceTheme.PROFESIONAL,
        business: {
          id: BIZ_ID,
          name: 'PT OmniCat Test',
          legalName: 'PT OmniCat Test Indo',
          address: 'Jl. Melawai No. 10',
          phone: '08123456789',
          email: 'biz@omnicat.id',
          npwp: '01.234.567.8-901.000',
          logoPath: null,
        },
        deletedAt: null,
      },
      {
        id: 'inv_draft_1',
        businessId: BIZ_ID,
        orderId: 'ord_sales_1',
        number: 'INV/2026/DRAFT',
        status: InvoiceStatus.PENDING_APPROVAL,
        amount: 250000n,
        paidAmount: 0n,
        printedCount: 0,
        lastPrintedAt: null,
        snapshot: null,
        theme: InvoiceTheme.PROFESIONAL,
        business: {
          id: BIZ_ID,
          name: 'PT OmniCat Test',
          legalName: null,
          address: null,
          phone: null,
          email: null,
          npwp: null,
          logoPath: null,
        },
        deletedAt: null,
      },
      {
        id: 'inv_other_biz',
        businessId: OTHER_BIZ_ID,
        orderId: 'ord_other_biz',
        number: 'INV/2026/OTH',
        status: InvoiceStatus.APPROVED,
        amount: 1000000n,
        paidAmount: 0n,
        printedCount: 0,
        lastPrintedAt: null,
        snapshot: null,
        theme: InvoiceTheme.PROFESIONAL,
        business: {
          id: OTHER_BIZ_ID,
          name: 'Other Biz',
          legalName: null,
          address: null,
          phone: null,
          email: null,
          npwp: null,
          logoPath: null,
        },
        deletedAt: null,
      },
    ];
    mockOrders = [
      {
        id: 'ord_sales_1',
        orderNo: 'ORD-001',
        salesId: 'usr_sales_1',
        businessId: BIZ_ID,
        paidTotal: 0n,
        grandTotal: 500000n,
        dpAmount: 0n,
        items: [],
        customer: { name: 'Toko Berkah' },
        deletedAt: null,
      },
      {
        id: 'ord_other_biz',
        orderNo: 'ORD-OTH',
        salesId: 'usr_other',
        businessId: OTHER_BIZ_ID,
        paidTotal: 0n,
        grandTotal: 1000000n,
        dpAmount: 0n,
        items: [],
        customer: { name: 'Toko Lain' },
        deletedAt: null,
      },
    ];
    mockCreditNotes = [];
    mockCatalogs = [];
    mockAuditLogs = [];

    activeCtx = {
      user: {
        id: superAdminUser.id,
        role: superAdminUser.role,
        name: superAdminUser.name,
        businessId: superAdminUser.businessId,
      },
      businessId: BIZ_ID,
      role: Role.SUPERADMIN,
      sessionId: 'sess_admin_test',
      ip: '127.0.0.1',
    };

    vi.spyOn(contextModule, 'requireContext').mockImplementation(async (req, roles) => {
      if (roles && roles.length > 0 && !roles.includes(activeCtx.role)) {
        throw new DomainError('FORBIDDEN', 'Anda tidak punya akses', 403);
      }
      return activeCtx;
    });
    vi.spyOn(contextModule, 'requireBusiness').mockImplementation(() => activeCtx.businessId!);
  });

  describe('1. Validasi initData Telegram (HMAC-SHA256)', () => {
    it('berhasil memvalidasi initData yang ditandatangani dengan bot token', () => {
      const tgUser: TelegramUser = {
        id: 987654321,
        first_name: 'Super',
        last_name: 'Admin',
        username: 'superadmin_tg',
      };

      const initData = generateTestInitData(tgUser, BOT_TOKEN);
      const validated = validateInitData(initData, BOT_TOKEN);

      expect(validated.telegramUserId).toBe(987654321);
      expect(validated.user.username).toBe('superadmin_tg');
      expect(typeof validated.authDate).toBe('number');
    });

    it('menolak initData yang diubah atau dipalsukan (tampered hash)', () => {
      const tgUser: TelegramUser = {
        id: 987654321,
        first_name: 'Hacker',
      };

      const validInitData = generateTestInitData(tgUser, BOT_TOKEN);
      const tampered = validInitData.replace('987654321', '123456789');

      expect(() => validateInitData(tampered, BOT_TOKEN)).toThrow(DomainError);
      expect(() => validateInitData(tampered, BOT_TOKEN)).toThrow('Sesi Telegram tidak valid');
    });

    it('menolak initData yang ditandatangani bot token berbeda', () => {
      const tgUser: TelegramUser = { id: 987654321 };
      const foreignInitData = generateTestInitData(tgUser, 'different_token_12345');

      expect(() => validateInitData(foreignInitData, BOT_TOKEN)).toThrow(DomainError);
    });

    it('menolak initData yang sudah kedaluwarsa (auth_date > 3600 detik)', () => {
      const tgUser: TelegramUser = { id: 987654321 };
      const expiredTimestamp = Math.floor(Date.now() / 1000) - 3601;
      const expiredInitData = generateTestInitData(tgUser, BOT_TOKEN, {
        authDate: expiredTimestamp,
      });

      expect(() => validateInitData(expiredInitData, BOT_TOKEN, 3600)).toThrow(DomainError);
      expect(() => validateInitData(expiredInitData, BOT_TOKEN, 3600)).toThrow('Sesi Telegram tidak valid');
    });

    it('menolak string initData kosong atau tanpa hash', () => {
      expect(() => validateInitData('', BOT_TOKEN)).toThrow(DomainError);
      expect(() => validateInitData('auth_date=12345&user={}', BOT_TOKEN)).toThrow(DomainError);
    });
  });

  describe('2. Otentikasi Telegram Mini App (POST /api/v1/auth/telegram)', () => {
    it('berhasil login dan menerbitkan cookie sesi untuk akun yang sudah tertaut', async () => {
      const tgUser: TelegramUser = {
        id: 987654321,
        username: 'superadmin_tg',
      };
      const initData = generateTestInitData(tgUser, BOT_TOKEN);

      const req = new NextRequest('http://localhost:3000/api/v1/auth/telegram', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'origin': 'http://localhost:3000',
          'x-forwarded-for': '192.168.1.50',
          'user-agent': 'TelegramMiniApp/1.0',
        },
        body: JSON.stringify({ initData }),
      });

      const res = await authTelegramHandler(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);
      expect(json.data.user.id).toBe(superAdminUser.id);
      expect(json.data.user.username).toBe(superAdminUser.username);
      expect(json.data.user.role).toBe(Role.SUPERADMIN);

      // Verifikasi cookie sesi diterbitkan dengan aman
      const setCookie = res.headers.get('set-cookie');
      expect(setCookie).toBeTruthy();
      expect(setCookie).toContain(`${env.SESSION_COOKIE_NAME}=`);
      expect(setCookie?.toLowerCase()).toContain('httponly');
      expect(setCookie?.toLowerCase()).toContain('samesite=lax');

      // Verifikasi sesi tersimpan di database
      expect(mockSessions.length).toBe(1);
      expect(mockSessions[0].userId).toBe(superAdminUser.id);
    });

    it('mengembalikan 401 TELEGRAM_NOT_LINKED jika akun Telegram belum tertaut ke user OmniCat', async () => {
      const tgUser: TelegramUser = {
        id: 999999999,
        username: 'unknown_tg_user',
      };
      const initData = generateTestInitData(tgUser, BOT_TOKEN);

      const req = new NextRequest('http://localhost:3000/api/v1/auth/telegram', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'origin': 'http://localhost:3000',
        },
        body: JSON.stringify({ initData }),
      });

      const res = await authTelegramHandler(req);
      const json = await res.json();

      expect(res.status).toBe(401);
      expect(json.ok).toBe(false);
      expect(json.error.code).toBe('TELEGRAM_NOT_LINKED');
      expect(json.error.message).toContain('Akun Telegram ini belum terhubung');
    });

    it('menolak permintaan dengan initData palsu atau rusak', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/auth/telegram', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'origin': 'http://localhost:3000',
        },
        body: JSON.stringify({ initData: 'auth_date=123&hash=invalid_hex_string' }),
      });

      const res = await authTelegramHandler(req);
      const json = await res.json();

      expect(res.status).toBe(401);
      expect(json.ok).toBe(false);
      expect(json.error.code).toBe('INIT_DATA_INVALID');
    });

    it('menolak permintaan tanpa body initData (422 Unprocessable Entity)', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/auth/telegram', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'origin': 'http://localhost:3000',
        },
        body: JSON.stringify({}),
      });

      const res = await authTelegramHandler(req);
      const json = await res.json();

      expect(res.status).toBe(422);
      expect(json.ok).toBe(false);
      expect(json.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('3. Pemutusan Tautan Telegram (DELETE /api/v1/auth/telegram)', () => {
    it('berhasil memutuskan tautan akun telegram dan mencatat audit log', async () => {
      activeCtx = {
        user: {
          id: salesUser.id,
          role: salesUser.role,
          name: salesUser.name,
          businessId: salesUser.businessId,
        },
        businessId: BIZ_ID,
        role: Role.SALES,
        sessionId: 'sess_sales_test',
        ip: '127.0.0.1',
      };

      const req = new NextRequest('http://localhost:3000/api/v1/auth/telegram', {
        method: 'DELETE',
        headers: {
          'origin': 'http://localhost:3000',
        },
      });

      const res = await unlinkTelegramHandler(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);
      expect(json.data.success).toBe(true);

      const updatedUser = mockUsers.find((u) => u.id === salesUser.id);
      expect(updatedUser.telegramChatId).toBeNull();
      expect(updatedUser.telegramLinkedAt).toBeNull();

      expect(mockAuditLogs.some((a) => a.action === 'USER_TELEGRAM_UNLINK')).toBe(true);
    });
  });

  describe('4. Token Unduh Sekali Buka (createDownloadToken & verifyDownloadToken)', () => {
    it('membuat token dengan payload bertanda tangan HMAC-SHA256 yang valid', () => {
      const { token, expiresAt } = createDownloadToken(
        {
          type: 'INVOICE_PDF',
          id: 'inv_approved_1',
          userId: 'usr_admin',
        },
        env.APP_SECRET,
        300
      );

      expect(token).toContain('.');
      expect(expiresAt.getTime()).toBeGreaterThan(Date.now());

      const payload = verifyDownloadToken(token, env.APP_SECRET);
      expect(payload.type).toBe('INVOICE_PDF');
      expect(payload.id).toBe('inv_approved_1');
      expect(payload.userId).toBe('usr_admin');
    });

    it('menolak token yang tanda tangannya diubah atau dipalsukan', () => {
      const { token } = createDownloadToken(
        {
          type: 'INVOICE_PDF',
          id: 'inv_approved_1',
          userId: 'usr_admin',
        },
        env.APP_SECRET,
        300
      );

      const [payloadB64] = token.split('.');
      const fakeToken = `${payloadB64}.tampered_signature_string`;

      expect(() => verifyDownloadToken(fakeToken, env.APP_SECRET)).toThrow(DomainError);
    });

    it('menolak token yang dibuat dengan secret berbeda', () => {
      const { token } = createDownloadToken(
        {
          type: 'INVOICE_PDF',
          id: 'inv_approved_1',
          userId: 'usr_admin',
        },
        'wrong_secret_at_least_16_chars',
        300
      );

      expect(() => verifyDownloadToken(token, env.APP_SECRET)).toThrow(DomainError);
    });

    it('menolak token yang telah kedaluwarsa', () => {
      const { token } = createDownloadToken(
        {
          type: 'INVOICE_PDF',
          id: 'inv_approved_1',
          userId: 'usr_admin',
        },
        env.APP_SECRET,
        -10 // Expired 10 seconds ago
      );

      expect(() => verifyDownloadToken(token, env.APP_SECRET)).toThrow(DomainError);
    });
  });

  describe('5. Pembuatan Tautan Unduh Bertanda Tangan (POST /api/v1/downloads)', () => {
    it('Super Admin dapat membuat tautan unduh untuk invoice yang disetujui', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/downloads', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'origin': 'http://localhost:3000',
        },
        body: JSON.stringify({
          type: 'INVOICE_PDF',
          id: 'inv_approved_1',
        }),
      });

      const res = await generateDownloadHandler(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);
      expect(json.data.url).toContain('/api/v1/dl/');
      expect(json.data.expiresAt).toBeTruthy();
    });

    it('Sales dapat membuat tautan unduh untuk invoice miliknya yang APPROVED', async () => {
      activeCtx = {
        user: {
          id: salesUser.id,
          role: salesUser.role,
          name: salesUser.name,
          businessId: salesUser.businessId,
        },
        businessId: BIZ_ID,
        role: Role.SALES,
        sessionId: 'sess_sales_test',
        ip: '127.0.0.1',
      };

      const req = new NextRequest('http://localhost:3000/api/v1/downloads', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'origin': 'http://localhost:3000',
        },
        body: JSON.stringify({
          type: 'INVOICE_PDF',
          id: 'inv_approved_1',
        }),
      });

      const res = await generateDownloadHandler(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);
      expect(json.data.url).toContain('/api/v1/dl/');
    });

    it('Sales DITOLAK membuat tautan unduh untuk invoice yang belum APPROVED (DRAFT)', async () => {
      activeCtx = {
        user: {
          id: salesUser.id,
          role: salesUser.role,
          name: salesUser.name,
          businessId: salesUser.businessId,
        },
        businessId: BIZ_ID,
        role: Role.SALES,
        sessionId: 'sess_sales_test',
        ip: '127.0.0.1',
      };

      const req = new NextRequest('http://localhost:3000/api/v1/downloads', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'origin': 'http://localhost:3000',
        },
        body: JSON.stringify({
          type: 'INVOICE_PDF',
          id: 'inv_draft_1',
        }),
      });

      const res = await generateDownloadHandler(req);
      const json = await res.json();

      expect(res.status).toBe(409);
      expect(json.ok).toBe(false);
      expect(json.error.code).toBe('INVOICE_NOT_APPROVED');
    });

    it('Sales DITOLAK membuat tautan unduh untuk invoice dari sales lain', async () => {
      activeCtx = {
        user: {
          id: 'usr_sales_other',
          role: Role.SALES,
          name: 'Sales Lain',
          businessId: BIZ_ID,
        },
        businessId: BIZ_ID,
        role: Role.SALES,
        sessionId: 'sess_sales_other',
        ip: '127.0.0.1',
      };

      const req = new NextRequest('http://localhost:3000/api/v1/downloads', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'origin': 'http://localhost:3000',
        },
        body: JSON.stringify({
          type: 'INVOICE_PDF',
          id: 'inv_approved_1',
        }),
      });

      const res = await generateDownloadHandler(req);
      const json = await res.json();

      expect(res.status).toBe(403);
      expect(json.ok).toBe(false);
      expect(json.error.code).toBe('FORBIDDEN');
    });

    it('Ditolak jika dokumen milik bisnis berbeda (isolasi multi-usaha)', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/downloads', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'origin': 'http://localhost:3000',
        },
        body: JSON.stringify({
          type: 'INVOICE_PDF',
          id: 'inv_other_biz',
        }),
      });

      const res = await generateDownloadHandler(req);
      const json = await res.json();

      expect(res.status).toBe(403);
      expect(json.ok).toBe(false);
      expect(json.error.code).toBe('FORBIDDEN');
    });
  });

  describe('6. Penyajian Dokumen Bertanda Tangan (GET /api/v1/dl/[token])', () => {
    it('berhasil mengunduh PDF invoice APPROVED tanpa cookie sesi', async () => {
      const { token } = createDownloadToken(
        {
          type: 'INVOICE_PDF',
          id: 'inv_approved_1',
          userId: superAdminUser.id,
        },
        env.APP_SECRET,
        300
      );

      const req = new NextRequest(`http://localhost:3000/api/v1/dl/${token}`, {
        method: 'GET',
      });

      const res = await serveDownloadHandler(req, {
        params: Promise.resolve({ token }),
      });

      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toBe('application/pdf');
      expect(res.headers.get('cache-control')).toBe('private, no-store');
      expect(res.headers.get('content-disposition')).toContain('inline; filename=');

      // Verifikasi counter cetak naik dan audit log tercatat
      const inv = mockInvoices.find((i) => i.id === 'inv_approved_1');
      expect(inv.printedCount).toBe(1);
      expect(inv.lastPrintedAt).toBeTruthy();

      expect(
        mockAuditLogs.some(
          (a) => a.action === 'INVOICE_PRINT' && a.entityId === 'inv_approved_1'
        )
      ).toBe(true);
    });

    it('menolak unduhan jika token tidak valid atau dipalsukan', async () => {
      const fakeToken = 'invalid.payload.token';
      const req = new NextRequest(`http://localhost:3000/api/v1/dl/${fakeToken}`, {
        method: 'GET',
      });

      const res = await serveDownloadHandler(req, {
        params: Promise.resolve({ token: fakeToken }),
      });
      const json = await res.json();

      expect(res.status).toBe(401);
      expect(json.ok).toBe(false);
      expect(json.error.code).toBe('INVALID_DOWNLOAD_TOKEN');
    });

    it('menolak unduhan jika token sudah kedaluwarsa (> 5 menit)', async () => {
      const { token } = createDownloadToken(
        {
          type: 'INVOICE_PDF',
          id: 'inv_approved_1',
          userId: superAdminUser.id,
        },
        env.APP_SECRET,
        -5 // Expired
      );

      const req = new NextRequest(`http://localhost:3000/api/v1/dl/${token}`, {
        method: 'GET',
      });

      const res = await serveDownloadHandler(req, {
        params: Promise.resolve({ token }),
      });
      const json = await res.json();

      expect(res.status).toBe(401);
      expect(json.ok).toBe(false);
      expect(json.error.code).toBe('INVALID_DOWNLOAD_TOKEN');
    });

    it('mengevaluasi ulang hak akses: jika sales mencoba unduh invoice yang kembali DRAFT, unduhan ditolak', async () => {
      // Buat token atas nama Sales
      const { token } = createDownloadToken(
        {
          type: 'INVOICE_PDF',
          id: 'inv_draft_1',
          userId: salesUser.id,
        },
        env.APP_SECRET,
        300
      );

      const req = new NextRequest(`http://localhost:3000/api/v1/dl/${token}`, {
        method: 'GET',
      });

      const res = await serveDownloadHandler(req, {
        params: Promise.resolve({ token }),
      });
      const json = await res.json();

      expect(res.status).toBe(409);
      expect(json.ok).toBe(false);
      expect(json.error.code).toBe('INVOICE_NOT_APPROVED');
    });

    it('menolak unduhan jika user yang membuat token telah dinonaktifkan', async () => {
      const { token } = createDownloadToken(
        {
          type: 'INVOICE_PDF',
          id: 'inv_approved_1',
          userId: 'usr_inactive',
        },
        env.APP_SECRET,
        300
      );

      const req = new NextRequest(`http://localhost:3000/api/v1/dl/${token}`, {
        method: 'GET',
      });

      const res = await serveDownloadHandler(req, {
        params: Promise.resolve({ token }),
      });
      const json = await res.json();

      expect(res.status).toBe(401);
      expect(json.ok).toBe(false);
      expect(json.error.code).toBe('UNAUTHENTICATED');
    });
  });
});
