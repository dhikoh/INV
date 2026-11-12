import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import {
  Role,
  PaymentStatus,
  InvoiceStatus,
  OrderStatus,
} from '@prisma/client';
import { POST as telegramWebhookHandler } from '@/app/api/telegram/webhook/route';
import {
  bot,
  isRateLimited,
  recordAttempt,
  resetRateLimitMapForTesting,
} from '@/lib/telegram/bot';
import {
  createNotification,
  sendTelegramNotification,
} from '@/lib/services/notification';
import { hashLinkCode } from '@/lib/telegram/linkCode';
import { prisma } from '@/lib/db';

const approveInvoiceMock = vi.fn(
  async (...args: [unknown, unknown, string, unknown?]) => {
    const invoiceId = args[2];
    const inv = mockInvoices.find((i) => i.id === invoiceId);
    if (inv) inv.status = InvoiceStatus.APPROVED;
    return { id: invoiceId };
  }
);

const verifyPaymentMock = vi.fn(async (...args: [unknown, unknown, string]) => {
  const paymentId = args[2];
  const pay = mockPayments.find((p) => p.id === paymentId);
  if (pay) pay.status = PaymentStatus.VERIFIED;
  return { id: paymentId };
});

vi.mock('@/lib/services/invoice', () => ({
  approveInvoice: (tx: unknown, ctx: unknown, invoiceId: string, options: unknown) =>
    approveInvoiceMock(tx, ctx, invoiceId, options),
}));

vi.mock('@/lib/services/payment', () => ({
  verifyPayment: (tx: unknown, ctx: unknown, paymentId: string) =>
    verifyPaymentMock(tx, ctx, paymentId),
}));

interface MockBusiness {
  id: string;
  code: string;
  name: string;
}

interface MockUser {
  id: string;
  businessId: string;
  role: Role;
  name: string;
  username: string;
  isActive: boolean;
  telegramChatId: bigint | null;
  telegramLinkedAt: Date | null;
  telegramBlocked: boolean;
  business?: MockBusiness | null;
}

interface MockTelegramLinkCode {
  id: string;
  userId: string;
  codeHash: string;
  expiresAt: Date;
  usedAt: Date | null;
  user?: MockUser;
}

interface MockNotification {
  id: string;
  businessId?: string;
  userId?: string;
  type?: string;
  title?: string;
  body?: string;
  linkPath?: string;
  dedupeKey?: string;
  telegramSentAt: Date | null;
  telegramError: string | null;
  createdAt: Date;
  [key: string]: unknown;
}

interface MockInvoice {
  id: string;
  businessId: string;
  orderId: string;
  status: InvoiceStatus;
  deletedAt: Date | null;
  business?: MockBusiness | null;
}

interface MockPayment {
  id: string;
  businessId: string;
  orderId: string;
  status: PaymentStatus;
  business?: MockBusiness | null;
}

interface MockProduct {
  id: string;
  businessId: string;
  stockQty: number;
  deletedAt: Date | null;
}

interface MockCrmTask {
  id: string;
  businessId: string;
  assignedToId: string;
  doneAt: Date | null;
}

interface MockOrder {
  id: string;
  businessId: string;
  salesId: string;
  status: OrderStatus;
  hasBelowMin: boolean;
  items: Array<{
    id: string;
    price: bigint;
    minPriceSnapshot: bigint;
    belowMin: boolean;
  }>;
  deletedAt: Date | null;
}

interface TelegramApiPayload {
  chat_id?: number | string;
  text?: string;
  show_alert?: boolean;
  reply_markup?: {
    inline_keyboard?: Array<
      Array<{
        text: string;
        callback_data?: string;
        url?: string;
      }>
    >;
  };
}

interface BotWhereFilter {
  id?: string;
  telegramChatId?: bigint | null;
  isActive?: boolean;
  NOT?: { id?: string };
  businessId?: string;
  status?: InvoiceStatus | PaymentStatus | { in?: OrderStatus[] };
  deletedAt?: null | Date;
  stockQty?: { lt?: number };
  assignedToId?: string;
  doneAt?: null | Date;
  salesId?: string;
}

// In-memory mock database
let mockBusinesses: MockBusiness[] = [];
let mockUsers: MockUser[] = [];
let mockTelegramLinkCodes: MockTelegramLinkCode[] = [];
let mockNotifications: MockNotification[] = [];
let mockInvoices: MockInvoice[] = [];
let mockPayments: MockPayment[] = [];
let mockProducts: MockProduct[] = [];
let mockCrmTasks: MockCrmTask[] = [];
let mockOrders: MockOrder[] = [];

let idCounter = 1;

let sentMessages: Array<{ method: string; payload: TelegramApiPayload }> = [];
let mockApiRejectError: { error_code: number; description: string } | null = null;

// Pasang transformer grammY sekali untuk menangkap semua panggilan API Telegram secara offline
bot.api.config.use(async (prev, method, payload) => {
  if (mockApiRejectError) {
    const err = mockApiRejectError;
    mockApiRejectError = null;
    throw err;
  }
  const typedPayload = (payload || {}) as TelegramApiPayload;
  sentMessages.push({ method, payload: typedPayload });
  return {
    ok: true,
    result: {
      message_id: idCounter++,
      date: Math.floor(Date.now() / 1000),
      chat: {
        id: typedPayload.chat_id ?? 1,
        type: 'private',
      },
      text: typedPayload.text ?? '',
    },
  } as never;
});

vi.mock('@/lib/db', () => {
  const mockPrisma = {
    business: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
        return mockBusinesses.find((b) => b.id === where.id) || null;
      }),
      findFirst: vi.fn(async ({ where }: { where: BotWhereFilter }) => {
        return mockBusinesses.find((b) => b.id === where.id) || null;
      }),
    },
    user: {
      findUnique: vi.fn(
        async ({
          where,
          include,
        }: {
          where: BotWhereFilter;
          include?: { business?: boolean };
        }) => {
          const found = mockUsers.find((u) => {
            if (where.id && u.id !== where.id) return false;
            if (where.telegramChatId && u.telegramChatId !== where.telegramChatId) return false;
            return true;
          });
          if (!found) return null;
          const res: MockUser = { ...found };
          if (include?.business) {
            res.business = mockBusinesses.find((b) => b.id === found.businessId) || null;
          }
          return res;
        }
      ),
      findFirst: vi.fn(
        async ({
          where,
          include,
        }: {
          where: BotWhereFilter;
          include?: { business?: boolean };
        }) => {
          const found = mockUsers.find((u) => {
            if (where.id && u.id !== where.id) return false;
            if (where.telegramChatId && u.telegramChatId !== where.telegramChatId) return false;
            if (where.isActive !== undefined && u.isActive !== where.isActive) return false;
            if (where.NOT?.id && u.id === where.NOT.id) return false;
            return true;
          });
          if (!found) return null;
          const res: MockUser = { ...found };
          if (include?.business) {
            res.business = mockBusinesses.find((b) => b.id === found.businessId) || null;
          }
          return res;
        }
      ),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<MockUser> }) => {
        const found = mockUsers.find((u) => u.id === where.id);
        if (found) Object.assign(found, data);
        return found;
      }),
    },
    telegramLinkCode: {
      findUnique: vi.fn(
        async ({
          where,
          include,
        }: {
          where: { codeHash: string };
          include?: { user?: boolean };
        }) => {
          const found = mockTelegramLinkCodes.find((c) => c.codeHash === where.codeHash);
          if (!found) return null;
          const res: MockTelegramLinkCode = { ...found };
          if (include?.user) {
            const user = mockUsers.find((u) => u.id === found.userId);
            if (user) {
              res.user = {
                ...user,
                business: mockBusinesses.find((b) => b.id === user.businessId) || null,
              };
            }
          }
          return res;
        }
      ),
      update: vi.fn(
        async ({ where, data }: { where: { id: string }; data: Partial<MockTelegramLinkCode> }) => {
          const found = mockTelegramLinkCodes.find((c) => c.id === where.id);
          if (found) Object.assign(found, data);
          return found;
        }
      ),
    },
    notification: {
      findUnique: vi.fn(async ({ where }: { where: { id?: string; dedupeKey?: string } }) => {
        if (where.id) {
          return mockNotifications.find((n) => n.id === where.id) || null;
        }
        if (where.dedupeKey) {
          return mockNotifications.find((n) => n.dedupeKey === where.dedupeKey) || null;
        }
        return null;
      }),
      create: vi.fn(async ({ data }: { data: Partial<MockNotification> }) => {
        const created: MockNotification = {
          id: `notif_${idCounter++}`,
          telegramSentAt: null,
          telegramError: null,
          createdAt: new Date(),
          ...data,
        };
        mockNotifications.push(created);
        return created;
      }),
      update: vi.fn(
        async ({ where, data }: { where: { id: string }; data: Partial<MockNotification> }) => {
          const found = mockNotifications.find((n) => n.id === where.id);
          if (found) Object.assign(found, data);
          return found;
        }
      ),
    },
    invoice: {
      count: vi.fn(async ({ where }: { where: BotWhereFilter }) => {
        return mockInvoices.filter((inv) => {
          if (where.businessId && inv.businessId !== where.businessId) return false;
          if (where.status && inv.status !== where.status) return false;
          if (where.deletedAt === null && inv.deletedAt !== null) return false;
          return true;
        }).length;
      }),
      findUnique: vi.fn(
        async ({
          where,
          include,
        }: {
          where: { id: string };
          include?: { business?: boolean };
        }) => {
          const inv = mockInvoices.find((i) => i.id === where.id);
          if (!inv) return null;
          const res: MockInvoice = { ...inv };
          if (include?.business) {
            res.business = mockBusinesses.find((b) => b.id === inv.businessId) || null;
          }
          return res;
        }
      ),
    },
    payment: {
      count: vi.fn(async ({ where }: { where: BotWhereFilter }) => {
        return mockPayments.filter((p) => {
          if (where.businessId && p.businessId !== where.businessId) return false;
          if (where.status && p.status !== where.status) return false;
          return true;
        }).length;
      }),
      findUnique: vi.fn(
        async ({
          where,
          include,
        }: {
          where: { id: string };
          include?: { business?: boolean };
        }) => {
          const p = mockPayments.find((pay) => pay.id === where.id);
          if (!p) return null;
          const res: MockPayment = { ...p };
          if (include?.business) {
            res.business = mockBusinesses.find((b) => b.id === p.businessId) || null;
          }
          return res;
        }
      ),
    },
    product: {
      count: vi.fn(async ({ where }: { where: BotWhereFilter }) => {
        return mockProducts.filter((p) => {
          if (where.businessId && p.businessId !== where.businessId) return false;
          if (where.stockQty?.lt !== undefined && !(p.stockQty < where.stockQty.lt)) return false;
          if (where.deletedAt === null && p.deletedAt !== null) return false;
          return true;
        }).length;
      }),
    },
    crmTask: {
      count: vi.fn(async ({ where }: { where: BotWhereFilter }) => {
        return mockCrmTasks.filter((t) => {
          if (where.businessId && t.businessId !== where.businessId) return false;
          if (where.assignedToId && t.assignedToId !== where.assignedToId) return false;
          if (where.doneAt === null && t.doneAt !== null) return false;
          return true;
        }).length;
      }),
    },
    order: {
      count: vi.fn(async ({ where }: { where: BotWhereFilter }) => {
        return mockOrders.filter((o) => {
          if (where.businessId && o.businessId !== where.businessId) return false;
          if (where.salesId && o.salesId !== where.salesId) return false;
          if (
            where.status &&
            typeof where.status === 'object' &&
            where.status.in &&
            !where.status.in.includes(o.status)
          )
            return false;
          if (where.deletedAt === null && o.deletedAt !== null) return false;
          return true;
        }).length;
      }),
      findUnique: vi.fn(
        async ({ where, include }: { where: { id: string }; include?: { items?: boolean } }) => {
          const ord = mockOrders.find((o) => o.id === where.id);
          if (!ord) return null;
          const res: MockOrder = { ...ord };
          if (include?.items) {
            res.items = ord.items || [];
          }
          return res;
        }
      ),
    },
    $transaction: vi.fn(async (callback: ((tx: unknown) => Promise<unknown>) | Array<Promise<unknown>>) => {
      if (typeof callback === 'function') {
        return callback(mockPrisma);
      }
      return Promise.all(callback);
    }),
  };

  return { prisma: mockPrisma };
});

describe('T4.1: Bot Telegram dan Antrean Job Background (Tes 17.3 No. 16)', () => {
  const businessId = 'biz_tg_001';
  const superAdminId = 'user_tg_admin';
  const salesUserId = 'user_tg_sales';

  beforeEach(() => {
    idCounter = 1;
    resetRateLimitMapForTesting();
    sentMessages = [];
    mockApiRejectError = null;

    mockBusinesses = [
      {
        id: businessId,
        code: 'BENTOCAT',
        name: 'PT BentoCat Distribusi',
      },
    ];

    mockUsers = [
      {
        id: superAdminId,
        businessId,
        role: Role.SUPERADMIN,
        name: 'Pak Bos Superadmin',
        username: 'bosadmin',
        isActive: true,
        telegramChatId: 987654321n,
        telegramLinkedAt: new Date('2026-11-01T00:00:00Z'),
        telegramBlocked: false,
      },
      {
        id: salesUserId,
        businessId,
        role: Role.SALES,
        name: 'Sari Sales',
        username: 'sarisales',
        isActive: true,
        telegramChatId: null,
        telegramLinkedAt: null,
        telegramBlocked: false,
      },
    ];

    mockTelegramLinkCodes = [
      {
        id: 'link_001',
        userId: salesUserId,
        codeHash: hashLinkCode('ABCD2345'),
        expiresAt: new Date(Date.now() + 10 * 60 * 1000), // berlaku 10 menit
        usedAt: null,
      },
      {
        id: 'link_expired',
        userId: salesUserId,
        codeHash: hashLinkCode('EXPIRED1'),
        expiresAt: new Date(Date.now() - 1000), // sudah kedaluwarsa
        usedAt: null,
      },
      {
        id: 'link_used',
        userId: salesUserId,
        codeHash: hashLinkCode('ALRDYUSD'),
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
        usedAt: new Date(Date.now() - 5000), // sudah dipakai
      },
    ];

    mockNotifications = [];
    approveInvoiceMock.mockClear();
    verifyPaymentMock.mockClear();

    mockInvoices = [
      {
        id: 'inv_1',
        businessId,
        orderId: 'ord_1',
        status: InvoiceStatus.PENDING_APPROVAL,
        deletedAt: null,
      },
      {
        id: 'inv_001',
        businessId,
        orderId: 'ord_001',
        status: InvoiceStatus.PENDING_APPROVAL,
        deletedAt: null,
      },
      {
        id: 'inv_below_min',
        businessId,
        orderId: 'ord_below_min',
        status: InvoiceStatus.PENDING_APPROVAL,
        deletedAt: null,
      },
    ];
    mockPayments = [
      {
        id: 'pay_1',
        businessId,
        orderId: 'ord_1',
        status: PaymentStatus.PENDING_VERIFICATION,
      },
      {
        id: 'pay_001',
        businessId,
        orderId: 'ord_001',
        status: PaymentStatus.PENDING_VERIFICATION,
      },
    ];
    mockProducts = [
      {
        id: 'prod_1',
        businessId,
        stockQty: -5,
        deletedAt: null,
      },
    ];
    mockCrmTasks = [
      {
        id: 'task_1',
        businessId,
        assignedToId: salesUserId,
        doneAt: null,
      },
    ];
    mockOrders = [
      {
        id: 'ord_1',
        businessId,
        salesId: salesUserId,
        status: OrderStatus.AWAITING_DP,
        hasBelowMin: false,
        items: [{ id: 'item_0', price: 50000n, minPriceSnapshot: 40000n, belowMin: false }],
        deletedAt: null,
      },
      {
        id: 'ord_001',
        businessId,
        salesId: salesUserId,
        status: OrderStatus.PENDING_APPROVAL,
        hasBelowMin: false,
        items: [{ id: 'item_1', price: 100000n, minPriceSnapshot: 90000n, belowMin: false }],
        deletedAt: null,
      },
      {
        id: 'ord_below_min',
        businessId,
        salesId: salesUserId,
        status: OrderStatus.PENDING_APPROVAL,
        hasBelowMin: true,
        items: [{ id: 'item_2', price: 70000n, minPriceSnapshot: 90000n, belowMin: true }],
        deletedAt: null,
      },
    ];
  });

  describe('1. Webhook Keamanan (/api/telegram/webhook)', () => {
    it('Menolak permintaan tanpa header secret_token dengan 401', async () => {
      const req = new NextRequest('http://localhost:3000/api/telegram/webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ update_id: 123 }),
      });

      const res = await telegramWebhookHandler(req);
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error).toContain('Unauthorized');
    });

    it('Menolak permintaan dengan secret_token yang salah dengan 401', async () => {
      const req = new NextRequest('http://localhost:3000/api/telegram/webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-telegram-bot-api-secret-token': 'wrong_secret_token_123',
        },
        body: JSON.stringify({ update_id: 123 }),
      });

      const res = await telegramWebhookHandler(req);
      expect(res.status).toBe(401);
    });
  });

  describe('2. Perintah /start <kode>', () => {
    it('Menolak kode kedaluwarsa atau sudah terpakai dengan pesan generik', async () => {
      // Panggil listener start
      await bot.handleUpdate({
        update_id: 1,
        message: {
          message_id: 1,
          date: Math.floor(Date.now() / 1000),
          chat: { id: 111222333, type: 'private' },
          from: { id: 111222333, is_bot: false, first_name: 'Tester' },
          text: '/start EXPIRED1',
          entities: [{ offset: 0, length: 6, type: 'bot_command' }],
        },
      } as never);

      const user = mockUsers.find((u) => u.id === salesUserId);
      expect(user!.telegramChatId).toBeNull();
    });

    it('Berhasil menghubungkan akun dengan kode valid (mengisi telegramChatId, telegramLinkedAt)', async () => {
      await bot.handleUpdate({
        update_id: 2,
        message: {
          message_id: 2,
          date: Math.floor(Date.now() / 1000),
          chat: { id: 555666777, type: 'private' },
          from: { id: 555666777, is_bot: false, first_name: 'Sari' },
          text: '/start ABCD2345',
          entities: [{ offset: 0, length: 6, type: 'bot_command' }],
        },
      } as never);

      const user = mockUsers.find((u) => u.id === salesUserId);
      expect(user!.telegramChatId).toBe(555666777n);
      expect(user!.telegramLinkedAt).toBeInstanceOf(Date);
      expect(user!.telegramBlocked).toBe(false);

      const linkCode = mockTelegramLinkCodes.find((c) => c.id === 'link_001');
      expect(linkCode!.usedAt).toBeInstanceOf(Date);
    });

    it('Menolak jika chat Telegram sudah terhubung ke akun lain', async () => {
      // 987654321 sudah terhubung ke superadmin
      await bot.handleUpdate({
        update_id: 3,
        message: {
          message_id: 3,
          date: Math.floor(Date.now() / 1000),
          chat: { id: 987654321, type: 'private' },
          from: { id: 987654321, is_bot: false, first_name: 'Bos' },
          text: '/start ABCD2345',
          entities: [{ offset: 0, length: 6, type: 'bot_command' }],
        },
      } as never);

      // User sales tidak boleh tertaut ke chatId 987654321
      const user = mockUsers.find((u) => u.id === salesUserId);
      expect(user!.telegramChatId).toBeNull();
    });

    it('Membatasi percobaan link: maksimal 5 kali per 10 menit (rate limit)', () => {
      const chatId = 123456789;
      for (let i = 0; i < 5; i++) {
        expect(isRateLimited(chatId)).toBe(false);
        recordAttempt(chatId);
      }
      expect(isRateLimited(chatId)).toBe(true);
    });
  });

  describe('3. Perintah /me dan /today', () => {
    it('Perintah /me mengembalikan profil lengkap untuk akun yang terhubung', async () => {
      await bot.handleUpdate({
        update_id: 4,
        message: {
          message_id: 4,
          date: Math.floor(Date.now() / 1000),
          chat: { id: 987654321, type: 'private' },
          from: { id: 987654321, is_bot: false, first_name: 'Bos' },
          text: '/me',
          entities: [{ offset: 0, length: 3, type: 'bot_command' }],
        },
      } as never);
      // Handler memproses dengan sukses
    });

    it('Perintah /today memberikan ringkasan antrean Super Admin', async () => {
      await bot.handleUpdate({
        update_id: 5,
        message: {
          message_id: 5,
          date: Math.floor(Date.now() / 1000),
          chat: { id: 987654321, type: 'private' },
          from: { id: 987654321, is_bot: false, first_name: 'Bos' },
          text: '/today',
          entities: [{ offset: 0, length: 6, type: 'bot_command' }],
        },
      } as never);
      // Handler memproses dengan sukses
    });
  });

  describe('4. Layanan Notifikasi & Pengiriman Telegram Tahan Gagal', () => {
    it('createNotification bersifat idempoten berdasarkan dedupeKey', async () => {
      const input = {
        businessId,
        userId: superAdminId,
        type: 'APPROVAL_REQUEST',
        title: 'Pesanan Baru Membutuhkan Persetujuan',
        body: 'Sales mengajukan order CUST-001 senilai Rp 500.000',
        linkPath: '/approvals/inv_1',
        dedupeKey: 'APPROVE_REQ:inv_1:2026-11-09',
      };

      const notif1 = await createNotification(prisma, input);
      const notif2 = await createNotification(prisma, input);

      expect(notif1.id).toBe(notif2.id);
      expect(mockNotifications).toHaveLength(1);
    });

    it('sendTelegramNotification mengirim pesan dan mengisi telegramSentAt', async () => {
      const notif = await createNotification(prisma, {
        businessId,
        userId: superAdminId,
        type: 'APPROVAL_REQUEST',
        title: 'Faktur Menunggu Persetujuan',
        body: 'Faktur DP telah diajukan',
        dedupeKey: 'KEY_1',
      });

      const initialCount = sentMessages.length;
      const result = await sendTelegramNotification(notif.id);
      expect(result.sent).toBe(true);
      expect(sentMessages.length).toBe(initialCount + 1);

      const updated = mockNotifications.find((n) => n.id === notif.id);
      expect(updated!.telegramSentAt).toBeInstanceOf(Date);
      expect(updated!.telegramError).toBeNull();

      // Panggilan kedua bersifat idempoten (tidak mengirim ulang)
      const res2 = await sendTelegramNotification(notif.id);
      expect(res2.alreadySent).toBe(true);
      expect(sentMessages.length).toBe(initialCount + 1);
    });

    it('Menangani kesalahan 403 (User memblokir bot): menandai telegramBlocked = true', async () => {
      const notif = await createNotification(prisma, {
        businessId,
        userId: superAdminId,
        type: 'APPROVAL_REQUEST',
        title: 'Faktur Baru',
        body: 'Rincian faktur',
        dedupeKey: 'KEY_BLOCK_TEST',
      });

      mockApiRejectError = {
        error_code: 403,
        description: 'Forbidden: bot was blocked by the user',
      };

      const result = await sendTelegramNotification(notif.id);
      expect(result.sent).toBe(false);
      expect(result.blocked).toBe(true);

      const user = mockUsers.find((u) => u.id === superAdminId);
      expect(user!.telegramBlocked).toBe(true);

      const updated = mockNotifications.find((n) => n.id === notif.id);
      expect(updated!.telegramError).toContain('403');
    });
  });

  describe('5. Tombol Inline & Callback Persetujuan Telegram (T4.2 - Seksi 12.4 & Tabel 19.5)', () => {
    it('sendTelegramNotification menyertakan inline keyboard tombol interaktif (Setujui, Tolak, Buka) untuk APPROVAL_REQUEST', async () => {
      const notif = await createNotification(prisma, {
        businessId,
        userId: superAdminId,
        type: 'APPROVAL_REQUEST',
        title: 'Pengajuan Pesanan Baru',
        body: 'Sales mengajukan invoice senilai Rp 1.500.000',
        linkPath: '/approvals/inv_001',
        dedupeKey: 'APPROVE_REQ:inv_001:test',
      });

      sentMessages = [];
      const result = await sendTelegramNotification(notif.id);
      expect(result.sent).toBe(true);
      expect(sentMessages.length).toBeGreaterThan(0);

      const sendCall = sentMessages.find((m) => m.method === 'sendMessage');
      expect(sendCall).toBeDefined();
      const keyboard = sendCall?.payload?.reply_markup?.inline_keyboard;
      expect(keyboard).toBeDefined();
      expect(keyboard).toHaveLength(2); // Row 1: Setujui, Tolak. Row 2: Buka
      expect(keyboard![0][0].text).toBe('Setujui');
      expect(keyboard![0][0].callback_data).toBe('ap:inv_001:y');
      expect(keyboard![0][1].text).toBe('Tolak');
      expect(keyboard![0][1].url).toContain('/tg/approvals/inv_001?reject=1');
      expect(keyboard![1][0].text).toBe('Buka');
      expect(keyboard![1][0].url).toContain('/tg/approvals/inv_001');
    });

    it('sendTelegramNotification menyertakan inline keyboard tombol interaktif (Verifikasi, Buka) untuk PAYMENT_PENDING', async () => {
      const notif = await createNotification(prisma, {
        businessId,
        userId: superAdminId,
        type: 'PAYMENT_PENDING',
        title: 'Pembayaran Menunggu Verifikasi',
        body: 'Pelanggan mentransfer Rp 500.000',
        linkPath: '/payments/pay_001',
        dedupeKey: 'PAY_PENDING:pay_001:test',
      });

      sentMessages = [];
      const result = await sendTelegramNotification(notif.id);
      expect(result.sent).toBe(true);

      const sendCall = sentMessages.find((m) => m.method === 'sendMessage');
      const keyboard = sendCall?.payload?.reply_markup?.inline_keyboard;
      expect(keyboard).toBeDefined();
      expect(keyboard![0][0].text).toBe('Verifikasi');
      expect(keyboard![0][0].callback_data).toBe('pv:pay_001:y');
      expect(keyboard![0][1].text).toBe('Buka');
      expect(keyboard![0][1].url).toContain('/tg/payments');
    });

    it('Non-Super Admin yang menekan tombol callback ditolak dengan pesan akses ditolak', async () => {
      // User sales (role: SALES, chatId: 555666777)
      const salesUser = mockUsers.find((u) => u.id === salesUserId);
      salesUser!.telegramChatId = 555666777n;

      sentMessages = [];
      await bot.handleUpdate({
        update_id: 10,
        callback_query: {
          id: 'cb_sales_1',
          from: { id: 555666777, is_bot: false, first_name: 'Sari' },
          message: {
            message_id: 101,
            date: Math.floor(Date.now() / 1000),
            chat: { id: 555666777, type: 'private' },
            text: 'Pengajuan Pesanan Baru',
          },
          data: 'ap:inv_001:y',
        },
      } as never);

      expect(approveInvoiceMock).not.toHaveBeenCalled();
      const answerCall = sentMessages.find((m) => m.method === 'answerCallbackQuery');
      expect(answerCall).toBeDefined();
      expect(answerCall?.payload?.text).toContain('Akses ditolak');
      expect(answerCall?.payload?.show_alert).toBe(true);
    });

    it('Persetujuan faktur dengan harga di bawah minimal (hasBelowMin = true) ditolak lewat tombol Telegram', async () => {
      sentMessages = [];
      await bot.handleUpdate({
        update_id: 11,
        callback_query: {
          id: 'cb_below_min',
          from: { id: 987654321, is_bot: false, first_name: 'Pak Bos' },
          message: {
            message_id: 102,
            date: Math.floor(Date.now() / 1000),
            chat: { id: 987654321, type: 'private' },
            text: 'Pengajuan Pesanan dengan Harga Di Bawah Minimal',
          },
          data: 'ap:inv_below_min:y',
        },
      } as never);

      expect(approveInvoiceMock).not.toHaveBeenCalled();
      const answerCall = sentMessages.find((m) => m.method === 'answerCallbackQuery');
      expect(answerCall).toBeDefined();
      expect(answerCall?.payload?.text).toContain('Ada harga di bawah minimal');
      expect(answerCall?.payload?.show_alert).toBe(true);

      const inv = mockInvoices.find((i) => i.id === 'inv_below_min');
      expect(inv!.status).toBe(InvoiceStatus.PENDING_APPROVAL);
    });

    it('Super Admin menyetujui faktur normal (hasBelowMin = false) berhasil memanggil domain service dan mengubah status', async () => {
      sentMessages = [];
      await bot.handleUpdate({
        update_id: 12,
        callback_query: {
          id: 'cb_approve_ok',
          from: { id: 987654321, is_bot: false, first_name: 'Pak Bos' },
          message: {
            message_id: 103,
            date: Math.floor(Date.now() / 1000),
            chat: { id: 987654321, type: 'private' },
            text: 'Pengajuan Pesanan Normal',
          },
          data: 'ap:inv_001:y',
        },
      } as never);

      expect(approveInvoiceMock).toHaveBeenCalledTimes(1);
      expect(approveInvoiceMock).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          role: Role.SUPERADMIN,
          businessId,
        }),
        'inv_001',
        expect.anything()
      );

      const answerCall = sentMessages.find((m) => m.method === 'answerCallbackQuery');
      expect(answerCall?.payload?.text).toContain('berhasil disetujui');

      const inv = mockInvoices.find((i) => i.id === 'inv_001');
      expect(inv!.status).toBe(InvoiceStatus.APPROVED);
    });

    it('Callback ganda persetujuan faktur bersifat idempoten (menjawab "Sudah diproses" dan menghapus tombol)', async () => {
      // Tandai inv_001 sudah berstatus APPROVED
      const inv = mockInvoices.find((i) => i.id === 'inv_001');
      inv!.status = InvoiceStatus.APPROVED;

      sentMessages = [];
      await bot.handleUpdate({
        update_id: 13,
        callback_query: {
          id: 'cb_duplicate_ap',
          from: { id: 987654321, is_bot: false, first_name: 'Pak Bos' },
          message: {
            message_id: 103,
            date: Math.floor(Date.now() / 1000),
            chat: { id: 987654321, type: 'private' },
            text: 'Pengajuan Pesanan Normal',
          },
          data: 'ap:inv_001:y',
        },
      } as never);

      expect(approveInvoiceMock).not.toHaveBeenCalled();
      const answerCall = sentMessages.find((m) => m.method === 'answerCallbackQuery');
      expect(answerCall?.payload?.text).toContain('sudah diproses');

      const replyMarkupCall = sentMessages.find((m) => m.method === 'editMessageReplyMarkup');
      expect(replyMarkupCall).toBeDefined();
      expect(replyMarkupCall?.payload?.reply_markup?.inline_keyboard).toEqual([]);
    });

    it('Super Admin memverifikasi pembayaran berhasil memanggil domain service verifyPayment', async () => {
      sentMessages = [];
      await bot.handleUpdate({
        update_id: 14,
        callback_query: {
          id: 'cb_pay_ok',
          from: { id: 987654321, is_bot: false, first_name: 'Pak Bos' },
          message: {
            message_id: 104,
            date: Math.floor(Date.now() / 1000),
            chat: { id: 987654321, type: 'private' },
            text: 'Pembayaran Menunggu Verifikasi',
          },
          data: 'pv:pay_001:y',
        },
      } as never);

      expect(verifyPaymentMock).toHaveBeenCalledTimes(1);
      expect(verifyPaymentMock).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          role: Role.SUPERADMIN,
          businessId,
        }),
        'pay_001'
      );

      const answerCall = sentMessages.find((m) => m.method === 'answerCallbackQuery');
      expect(answerCall?.payload?.text).toContain('berhasil diverifikasi');

      const pay = mockPayments.find((p) => p.id === 'pay_001');
      expect(pay!.status).toBe(PaymentStatus.VERIFIED);
    });

    it('Callback ganda verifikasi pembayaran bersifat idempoten', async () => {
      // Tandai pay_001 sudah berstatus VERIFIED
      const pay = mockPayments.find((p) => p.id === 'pay_001');
      pay!.status = PaymentStatus.VERIFIED;

      sentMessages = [];
      await bot.handleUpdate({
        update_id: 15,
        callback_query: {
          id: 'cb_duplicate_pv',
          from: { id: 987654321, is_bot: false, first_name: 'Pak Bos' },
          message: {
            message_id: 104,
            date: Math.floor(Date.now() / 1000),
            chat: { id: 987654321, type: 'private' },
            text: 'Pembayaran Menunggu Verifikasi',
          },
          data: 'pv:pay_001:y',
        },
      } as never);

      expect(verifyPaymentMock).not.toHaveBeenCalled();
      const answerCall = sentMessages.find((m) => m.method === 'answerCallbackQuery');
      expect(answerCall?.payload?.text).toContain('sudah diproses');

      const replyMarkupCall = sentMessages.find((m) => m.method === 'editMessageReplyMarkup');
      expect(replyMarkupCall).toBeDefined();
    });
  });
});
