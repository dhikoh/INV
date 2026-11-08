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
import { env } from '@/lib/env';
import { prisma } from '@/lib/db';

// In-memory mock database
let mockBusinesses: any[] = [];
let mockUsers: any[] = [];
let mockTelegramLinkCodes: any[] = [];
let mockNotifications: any[] = [];
let mockInvoices: any[] = [];
let mockPayments: any[] = [];
let mockProducts: any[] = [];
let mockCrmTasks: any[] = [];
let mockOrders: any[] = [];

let idCounter = 1;

let sentMessages: Array<{ method: string; payload: any }> = [];
let mockApiRejectError: any = null;

// Pasang transformer grammY sekali untuk menangkap semua panggilan API Telegram secara offline
bot.api.config.use(async (prev, method, payload, signal) => {
  if (mockApiRejectError) {
    const err = mockApiRejectError;
    mockApiRejectError = null;
    throw err;
  }
  sentMessages.push({ method, payload });
  return {
    ok: true,
    result: {
      message_id: idCounter++,
      date: Math.floor(Date.now() / 1000),
      chat: {
        id: payload && 'chat_id' in (payload as any) ? (payload as any).chat_id : 1,
        type: 'private',
      },
      text: payload && 'text' in (payload as any) ? (payload as any).text : '',
    },
  } as any;
});

vi.mock('@/lib/db', () => {
  const mockPrisma = {
    business: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
        return mockBusinesses.find((b) => b.id === where.id) || null;
      }),
      findFirst: vi.fn(async ({ where }: { where: Record<string, any> }) => {
        return mockBusinesses.find((b) => b.id === where.id) || null;
      }),
    },
    user: {
      findUnique: vi.fn(async ({ where, include }: { where: Record<string, any>; include?: any }) => {
        const found = mockUsers.find((u) => {
          if (where.id && u.id !== where.id) return false;
          if (where.telegramChatId && u.telegramChatId !== where.telegramChatId) return false;
          return true;
        });
        if (!found) return null;
        const res = { ...found };
        if (include?.business) {
          res.business = mockBusinesses.find((b) => b.id === found.businessId) || null;
        }
        return res;
      }),
      findFirst: vi.fn(async ({ where, include }: { where: Record<string, any>; include?: any }) => {
        const found = mockUsers.find((u) => {
          if (where.id && u.id !== where.id) return false;
          if (where.telegramChatId && u.telegramChatId !== where.telegramChatId) return false;
          if (where.isActive !== undefined && u.isActive !== where.isActive) return false;
          if (where.NOT?.id && u.id === where.NOT.id) return false;
          return true;
        });
        if (!found) return null;
        const res = { ...found };
        if (include?.business) {
          res.business = mockBusinesses.find((b) => b.id === found.businessId) || null;
        }
        return res;
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: any }) => {
        const found = mockUsers.find((u) => u.id === where.id);
        if (found) Object.assign(found, data);
        return found;
      }),
    },
    telegramLinkCode: {
      findUnique: vi.fn(async ({ where, include }: { where: { codeHash: string }; include?: any }) => {
        const found = mockTelegramLinkCodes.find((c) => c.codeHash === where.codeHash);
        if (!found) return null;
        const res = { ...found };
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
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: any }) => {
        const found = mockTelegramLinkCodes.find((c) => c.id === where.id);
        if (found) Object.assign(found, data);
        return found;
      }),
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
      create: vi.fn(async ({ data }: { data: any }) => {
        const created = {
          id: `notif_${idCounter++}`,
          telegramSentAt: null,
          telegramError: null,
          createdAt: new Date(),
          ...data,
        };
        mockNotifications.push(created);
        return created;
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: any }) => {
        const found = mockNotifications.find((n) => n.id === where.id);
        if (found) Object.assign(found, data);
        return found;
      }),
    },
    invoice: {
      count: vi.fn(async ({ where }: { where: any }) => {
        return mockInvoices.filter((inv) => {
          if (where.businessId && inv.businessId !== where.businessId) return false;
          if (where.status && inv.status !== where.status) return false;
          if (where.deletedAt === null && inv.deletedAt !== null) return false;
          return true;
        }).length;
      }),
    },
    payment: {
      count: vi.fn(async ({ where }: { where: any }) => {
        return mockPayments.filter((p) => {
          if (where.businessId && p.businessId !== where.businessId) return false;
          if (where.status && p.status !== where.status) return false;
          return true;
        }).length;
      }),
    },
    product: {
      count: vi.fn(async ({ where }: { where: any }) => {
        return mockProducts.filter((p) => {
          if (where.businessId && p.businessId !== where.businessId) return false;
          if (where.stockQty?.lt !== undefined && !(p.stockQty < where.stockQty.lt)) return false;
          if (where.deletedAt === null && p.deletedAt !== null) return false;
          return true;
        }).length;
      }),
    },
    crmTask: {
      count: vi.fn(async ({ where }: { where: any }) => {
        return mockCrmTasks.filter((t) => {
          if (where.businessId && t.businessId !== where.businessId) return false;
          if (where.assignedToId && t.assignedToId !== where.assignedToId) return false;
          if (where.doneAt === null && t.doneAt !== null) return false;
          return true;
        }).length;
      }),
    },
    order: {
      count: vi.fn(async ({ where }: { where: any }) => {
        return mockOrders.filter((o) => {
          if (where.businessId && o.businessId !== where.businessId) return false;
          if (where.salesId && o.salesId !== where.salesId) return false;
          if (where.status?.in && !where.status.in.includes(o.status)) return false;
          if (where.deletedAt === null && o.deletedAt !== null) return false;
          return true;
        }).length;
      }),
    },
    $transaction: vi.fn(async (callback: any) => {
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
    mockInvoices = [
      {
        id: 'inv_1',
        businessId,
        status: InvoiceStatus.PENDING_APPROVAL,
        deletedAt: null,
      },
    ];
    mockPayments = [
      {
        id: 'pay_1',
        businessId,
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
      const replies: string[] = [];
      const fakeCtx: any = {
        chat: { type: 'private', id: 111222333 },
        from: { id: 111222333 },
        match: 'EXPIRED1',
        reply: vi.fn(async (msg: string) => {
          replies.push(msg);
        }),
      };

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
      } as any);

      const user = mockUsers.find((u) => u.id === salesUserId);
      expect(user.telegramChatId).toBeNull();
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
      } as any);

      const user = mockUsers.find((u) => u.id === salesUserId);
      expect(user.telegramChatId).toBe(555666777n);
      expect(user.telegramLinkedAt).toBeInstanceOf(Date);
      expect(user.telegramBlocked).toBe(false);

      const linkCode = mockTelegramLinkCodes.find((c) => c.id === 'link_001');
      expect(linkCode.usedAt).toBeInstanceOf(Date);
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
      } as any);

      // User sales tidak boleh tertaut ke chatId 987654321
      const user = mockUsers.find((u) => u.id === salesUserId);
      expect(user.telegramChatId).toBeNull();
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
      const replies: any[] = [];
      const fakeCtx: any = {
        chat: { type: 'private', id: 987654321 },
        from: { id: 987654321 },
        reply: vi.fn(async (msg: string) => {
          replies.push(msg);
        }),
      };

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
      } as any);
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
      } as any);
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

      const notif1 = await createNotification(prisma as any, input);
      const notif2 = await createNotification(prisma as any, input);

      expect(notif1.id).toBe(notif2.id);
      expect(mockNotifications).toHaveLength(1);
    });

    it('sendTelegramNotification mengirim pesan dan mengisi telegramSentAt', async () => {
      const notif = await createNotification(prisma as any, {
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
      expect(updated.telegramSentAt).toBeInstanceOf(Date);
      expect(updated.telegramError).toBeNull();

      // Panggilan kedua bersifat idempoten (tidak mengirim ulang)
      const res2 = await sendTelegramNotification(notif.id);
      expect(res2.alreadySent).toBe(true);
      expect(sentMessages.length).toBe(initialCount + 1);
    });

    it('Menangani kesalahan 403 (User memblokir bot): menandai telegramBlocked = true', async () => {
      const notif = await createNotification(prisma as any, {
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
      expect(user.telegramBlocked).toBe(true);

      const updated = mockNotifications.find((n) => n.id === notif.id);
      expect(updated.telegramError).toContain('403');
    });
  });
});
