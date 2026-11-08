import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import {
  Role,
  OrderStatus,
  InvoiceStatus,
  PaymentStatus,
  ReminderStatus,
  ReminderSource,
} from '@prisma/client';
import {
  suggestInterval,
  daysUntil,
  wibDayIndex,
} from '@/lib/domain/reminder';
import {
  getAgingBucket,
  getDaysOverdue,
  calculateReceivableBalance,
  AgingBucket,
} from '@/lib/domain/receivable';
import {
  updateRemindersForCompletedOrder,
  rebuildRemindersForCustomer,
  scanRepeatReminders,
  scanInvoicesDue,
  scanCrmTasks,
  scanOwnerDigest,
  runHousekeeping,
  formatWibDate,
} from '@/lib/services/reminder';
import {
  GET as getRemindersHandler,
  POST as createReminderHandler,
} from '@/app/api/v1/reminders/route';
import {
  PATCH as updateReminderHandler,
  DELETE as deleteReminderHandler,
} from '@/app/api/v1/reminders/[id]/route';
import { GET as getReceivablesHandler } from '@/app/api/v1/receivables/route';
import * as contextModule from '@/lib/auth/context';
import type { Ctx } from '@/lib/auth/context';
import { assertNoSecretKeys } from '../helpers/leak';
import { DomainError } from '@/lib/domain/money';

// Mock DB in-memory stores
let mockReminders: any[] = [];
let mockOrders: any[] = [];
let mockCustomers: any[] = [];
let mockProducts: any[] = [];
let mockInvoices: any[] = [];
let mockPayments: any[] = [];
let mockCrmTasks: any[] = [];
let mockUsers: any[] = [];
let mockBusinesses: any[] = [];
let mockNotifications: any[] = [];
let mockSessions: any[] = [];
let mockLoginAttempts: any[] = [];
let mockTelegramLinkCodes: any[] = [];

vi.mock('@/lib/db', () => ({
  prisma: {
    $transaction: vi.fn(async (cb: (tx: any) => any) => cb(prismaMock)),
    reminder: {
      findMany: vi.fn(async ({ where }: { where: Record<string, any> }) => {
        return mockReminders.filter((r) => {
          if (where.businessId && r.businessId !== where.businessId) return false;
          if (where.salesId && r.salesId !== where.salesId) return false;
          if (where.customerId && r.customerId !== where.customerId) return false;
          if (where.status && r.status !== where.status) return false;
          if (where.OR) {
            const matchesOr = where.OR.some((cond: any) => {
              if (cond.snoozedUntil === null) return !r.snoozedUntil;
              if (cond.snoozedUntil?.lte) return r.snoozedUntil && r.snoozedUntil <= cond.snoozedUntil.lte;
              return false;
            });
            if (!matchesOr) return false;
          }
          return true;
        });
      }),
      findFirst: vi.fn(async ({ where }: { where: Record<string, any> }) => {
        return (
          mockReminders.find((r) => {
            if (where.id && r.id !== where.id) return false;
            if (where.businessId && r.businessId !== where.businessId) return false;
            if (where.customerId && r.customerId !== where.customerId) return false;
            if (where.productId && r.productId !== where.productId) return false;
            return true;
          }) || null
        );
      }),
      create: vi.fn(async ({ data }: { data: any }) => {
        const item = {
          id: `rem_${Date.now()}_${Math.random().toString(36).substring(7)}`,
          snoozedUntil: null,
          lastNotifiedAt: null,
          escalatedAt: null,
          note: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          ...data,
        };
        mockReminders.push(item);
        return item;
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: any }) => {
        const item = mockReminders.find((r) => r.id === where.id);
        if (item) {
          Object.assign(item, data, { updatedAt: new Date() });
        }
        return item;
      }),
      updateMany: vi.fn(async ({ where, data }: { where: Record<string, any>; data: any }) => {
        let count = 0;
        mockReminders.forEach((r) => {
          if (where.id && r.id !== where.id) return;
          if (where.customerId && r.customerId !== where.customerId) return;
          if (where.businessId && r.businessId !== where.businessId) return;
          Object.assign(r, data, { updatedAt: new Date() });
          count++;
        });
        return { count };
      }),
    },
    order: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
        return mockOrders.find((o) => o.id === where.id) || null;
      }),
      findFirst: vi.fn(async ({ where }: { where: Record<string, any> }) => {
        return (
          mockOrders.find((o) => {
            if (where.id && o.id !== where.id) return false;
            if (where.customerId && o.customerId !== where.customerId) return false;
            if (where.createdAt?.gt && o.createdAt <= where.createdAt.gt) return false;
            if (where.status?.not && o.status === where.status.not) return false;
            if (where.deletedAt === null && o.deletedAt !== null) return false;
            if (where.items?.some?.productId) {
              const hasProd = o.items?.some((i: any) => i.productId === where.items.some.productId);
              if (!hasProd) return false;
            }
            return true;
          }) || null
        );
      }),
      findMany: vi.fn(async ({ where }: { where: Record<string, any> }) => {
        return mockOrders.filter((o) => {
          if (where.id?.in && !where.id.in.includes(o.id)) return false;
          if (where.businessId && o.businessId !== where.businessId) return false;
          if (where.salesId && o.salesId !== where.salesId) return false;
          if (where.customerId && o.customerId !== where.customerId) return false;
          if (where.status) {
            if (typeof where.status === 'object' && 'not' in where.status) {
              if (o.status === where.status.not) return false;
            } else if (o.status !== where.status) {
              return false;
            }
          }
          if (where.deletedAt === null && o.deletedAt !== null) return false;
          if (where.items?.some?.productId) {
            const hasProd = o.items?.some((i: any) => i.productId === where.items.some.productId);
            if (!hasProd) return false;
          }
          return true;
        });
      }),
    },
    customer: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
        return mockCustomers.find((c) => c.id === where.id) || null;
      }),
      findFirst: vi.fn(async ({ where }: { where: Record<string, any> }) => {
        return (
          mockCustomers.find((c) => {
            if (where.id && c.id !== where.id) return false;
            if (where.businessId && c.businessId !== where.businessId) return false;
            if (where.deletedAt === null && c.deletedAt !== null) return false;
            return true;
          }) || null
        );
      }),
    },
    product: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
        return mockProducts.find((p) => p.id === where.id) || null;
      }),
      findFirst: vi.fn(async ({ where }: { where: Record<string, any> }) => {
        return (
          mockProducts.find((p) => {
            if (where.id && p.id !== where.id) return false;
            return true;
          }) || null
        );
      }),
      findMany: vi.fn(async ({ where }: { where?: Record<string, any> }) => {
        if (!where) return mockProducts;
        return mockProducts.filter((p) => {
          if (where.id?.in && !where.id.in.includes(p.id)) return false;
          return true;
        });
      }),
      count: vi.fn(async ({ where }: { where: Record<string, any> }) => {
        return mockProducts.filter((p) => {
          if (where.businessId && p.businessId !== where.businessId) return false;
          if (where.stockQty?.lte !== undefined && p.stockQty > where.stockQty.lte) return false;
          return true;
        }).length;
      }),
    },
    invoice: {
      findMany: vi.fn(async ({ where }: { where: Record<string, any> }) => {
        return mockInvoices.filter((inv) => {
          if (where.businessId && inv.businessId !== where.businessId) return false;
          if (where.status && inv.status !== where.status) return false;
          if (where.deletedAt === null && inv.deletedAt !== null) return false;
          if (where.orderId?.in && !where.orderId.in.includes(inv.orderId)) return false;
          if (where.customerId && inv.customerId !== where.customerId) return false;
          return true;
        });
      }),
      count: vi.fn(async ({ where }: { where: Record<string, any> }) => {
        return mockInvoices.filter((inv) => {
          if (where.businessId && inv.businessId !== where.businessId) return false;
          if (where.status && inv.status !== where.status) return false;
          if (where.deletedAt === null && inv.deletedAt !== null) return false;
          return true;
        }).length;
      }),
    },
    payment: {
      count: vi.fn(async ({ where }: { where: Record<string, any> }) => {
        return mockPayments.filter((p) => {
          if (where.businessId && p.businessId !== where.businessId) return false;
          if (where.status && p.status !== where.status) return false;
          return true;
        }).length;
      }),
    },
    crmTask: {
      findMany: vi.fn(async ({ where }: { where: Record<string, any> }) => {
        return mockCrmTasks.filter((t) => {
          if (where.doneAt === null && t.doneAt !== null) return false;
          return true;
        });
      }),
    },
    user: {
      findMany: vi.fn(async ({ where }: { where: Record<string, any> }) => {
        return mockUsers.filter((u) => {
          if (where.id?.in && !where.id.in.includes(u.id)) return false;
          if (where.businessId && u.businessId !== where.businessId) return false;
          if (where.role && u.role !== where.role) return false;
          if (where.isActive !== undefined && u.isActive !== where.isActive) return false;
          if (where.deletedAt === null && u.deletedAt !== null) return false;
          return true;
        });
      }),
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
        return mockUsers.find((u) => u.id === where.id) || null;
      }),
      findFirst: vi.fn(async ({ where }: { where: Record<string, any> }) => {
        return (
          mockUsers.find((u) => {
            if (where.id && u.id !== where.id) return false;
            return true;
          }) || null
        );
      }),
    },
    business: {
      findMany: vi.fn(async () => mockBusinesses),
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
        return mockBusinesses.find((b) => b.id === where.id) || null;
      }),
    },
    notification: {
      findUnique: vi.fn(async ({ where }: { where: { dedupeKey: string } }) => {
        return mockNotifications.find((n) => n.dedupeKey === where.dedupeKey) || null;
      }),
      create: vi.fn(async ({ data }: { data: any }) => {
        const notif = {
          id: `notif_${Date.now()}_${Math.random().toString(36).substring(7)}`,
          createdAt: new Date(),
          readAt: null,
          telegramSentAt: null,
          telegramError: null,
          ...data,
        };
        mockNotifications.push(notif);
        return notif;
      }),
    },
    session: {
      deleteMany: vi.fn(async ({ where }: { where: Record<string, any> }) => {
        const initial = mockSessions.length;
        mockSessions = mockSessions.filter((s) => {
          if (where.OR) {
            const matches = where.OR.some((cond: any) => {
              if (cond.expiresAt?.lt && s.expiresAt < cond.expiresAt.lt) return true;
              if (cond.revokedAt?.lt && s.revokedAt && s.revokedAt < cond.revokedAt.lt) return true;
              return false;
            });
            return !matches;
          }
          return true;
        });
        return { count: initial - mockSessions.length };
      }),
    },
    loginAttempt: {
      deleteMany: vi.fn(async ({ where }: { where: Record<string, any> }) => {
        const initial = mockLoginAttempts.length;
        mockLoginAttempts = mockLoginAttempts.filter((a) => {
          if (where.createdAt?.lt && a.createdAt < where.createdAt.lt) return false;
          return true;
        });
        return { count: initial - mockLoginAttempts.length };
      }),
    },
    telegramLinkCode: {
      deleteMany: vi.fn(async ({ where }: { where: Record<string, any> }) => {
        const initial = mockTelegramLinkCodes.length;
        mockTelegramLinkCodes = mockTelegramLinkCodes.filter((c) => {
          if (where.OR) {
            const matches = where.OR.some((cond: any) => {
              if (cond.usedAt?.lt && c.usedAt && c.usedAt < cond.usedAt.lt) return true;
              if (cond.expiresAt?.lt && c.expiresAt < cond.expiresAt.lt) return true;
              return false;
            });
            return !matches;
          }
          return true;
        });
        return { count: initial - mockTelegramLinkCodes.length };
      }),
    },
  },
}));

const prismaMock = (await vi.importMock('@/lib/db') as any).prisma;

describe('T4.4: Pengingat Otomatis Siklus Repeat Order, Job Background 13.2, dan Piutang (Seksi 13 & 17.3 nomor 15)', () => {
  const BIZ_ID = 'biz_omnicat_01';
  const OTHER_BIZ_ID = 'biz_other_02';

  const superAdminUser = {
    id: 'usr_admin',
    username: 'superadmin',
    name: 'Super Admin',
    role: Role.SUPERADMIN,
    businessId: BIZ_ID,
    isActive: true,
    deletedAt: null,
  };

  const salesUser = {
    id: 'usr_sales_1',
    username: 'sales1',
    name: 'Budi Sales',
    role: Role.SALES,
    businessId: BIZ_ID,
    isActive: true,
    deletedAt: null,
  };

  let activeCtx: Ctx;

  beforeEach(() => {
    mockReminders = [];
    mockOrders = [];
    mockCustomers = [
      {
        id: 'cust_01',
        businessId: BIZ_ID,
        code: 'CUST-001',
        name: 'Toko Berkah Abadi',
        phone: '08123456789',
        address: 'Jl. Rungkut No. 10',
        assignedSalesId: 'usr_sales_1',
        deletedAt: null,
        business: {
          id: BIZ_ID,
          name: 'OmniCat Pet Feeds',
          defaultRepeatDays: 30,
        },
      },
    ];
    mockProducts = [
      {
        id: 'prod_01',
        businessId: BIZ_ID,
        name: 'BentoCat Tuna 1kg',
        sku: 'BC-TUNA-1K',
        unit: 'Pouch',
        stockQty: 50,
        deletedAt: null,
      },
      {
        id: 'prod_low_stock',
        businessId: BIZ_ID,
        name: 'BentoCat Salmon 500g',
        sku: 'BC-SALMON-500',
        unit: 'Pouch',
        stockQty: 0, // Kritis
        deletedAt: null,
      },
    ];
    mockInvoices = [];
    mockPayments = [];
    mockCrmTasks = [];
    mockUsers = [{ ...superAdminUser }, { ...salesUser }];
    mockBusinesses = [
      {
        id: BIZ_ID,
        name: 'OmniCat Pet Feeds',
        defaultRepeatDays: 30,
      },
    ];
    mockNotifications = [];
    mockSessions = [];
    mockLoginAttempts = [];
    mockTelegramLinkCodes = [];

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

  describe('1. Logika Domain Umur Piutang (src/lib/domain/receivable.ts)', () => {
    it('mengelompokkan faktur ke dalam 5 bucket umur piutang sesuai Seksi 13.3', () => {
      const now = new Date('2026-11-10T08:00:00Z');

      // Belum jatuh tempo (hari ini atau masa depan)
      const futureDue = new Date('2026-11-15T08:00:00Z');
      expect(getAgingBucket(futureDue, now)).toBe('CURRENT');

      // Terlambat 3 hari (1-7 hari)
      const due3DaysAgo = new Date('2026-11-07T08:00:00Z');
      expect(getAgingBucket(due3DaysAgo, now)).toBe('DAYS_1_7');
      expect(getDaysOverdue(due3DaysAgo, now)).toBe(3);

      // Terlambat 15 hari (8-30 hari)
      const due15DaysAgo = new Date('2026-10-26T08:00:00Z');
      expect(getAgingBucket(due15DaysAgo, now)).toBe('DAYS_8_30');

      // Terlambat 45 hari (31-60 hari)
      const due45DaysAgo = new Date('2026-09-26T08:00:00Z');
      expect(getAgingBucket(due45DaysAgo, now)).toBe('DAYS_31_60');

      // Terlambat 75 hari (>60 hari)
      const due75DaysAgo = new Date('2026-08-27T08:00:00Z');
      expect(getAgingBucket(due75DaysAgo, now)).toBe('DAYS_OVER_60');
    });

    it('menghitung sisa piutang secara akurat', () => {
      const inv = { amount: 1000000n, paidAmount: 400000n };
      expect(calculateReceivableBalance(inv)).toBe(600000n);

      const paidOff = { amount: 500000n, paidAmount: 500000n };
      expect(calculateReceivableBalance(paidOff)).toBe(0n);
    });
  });

  describe('2. Pembuatan Otomatis Pengingat saat Order COMPLETED (Seksi 13.1 & Tes 17.3 nomor 15)', () => {
    it('order selesai berjarak 30 hari memberi interval 30 dan membuat pengingat AUTO', async () => {
      const d1 = new Date('2026-09-01T08:00:00Z');
      const d2 = new Date('2026-10-01T08:00:00Z');
      const d3 = new Date('2026-10-31T08:00:00Z'); // gap: 30 hari, 30 hari -> interval 30

      mockOrders.push(
        {
          id: 'ord_c1',
          businessId: BIZ_ID,
          customerId: 'cust_01',
          salesId: 'usr_sales_1',
          status: OrderStatus.COMPLETED,
          createdAt: d1,
          updatedAt: d1,
          deletedAt: null,
          items: [{ productId: 'prod_01', qty: 10 }],
          shipment: { shippedAt: d1 },
          business: { defaultRepeatDays: 30 },
        },
        {
          id: 'ord_c2',
          businessId: BIZ_ID,
          customerId: 'cust_01',
          salesId: 'usr_sales_1',
          status: OrderStatus.COMPLETED,
          createdAt: d2,
          updatedAt: d2,
          deletedAt: null,
          items: [{ productId: 'prod_01', qty: 10 }],
          shipment: { shippedAt: d2 },
          business: { defaultRepeatDays: 30 },
        },
        {
          id: 'ord_c3',
          businessId: BIZ_ID,
          customerId: 'cust_01',
          salesId: 'usr_sales_1',
          status: OrderStatus.COMPLETED,
          createdAt: d3,
          updatedAt: d3,
          deletedAt: null,
          items: [{ productId: 'prod_01', qty: 10 }],
          shipment: { shippedAt: d3 },
          business: { defaultRepeatDays: 30 },
        }
      );

      await updateRemindersForCompletedOrder(prismaMock, 'ord_c3');

      expect(mockReminders.length).toBe(1);
      const rem = mockReminders[0];
      expect(rem.customerId).toBe('cust_01');
      expect(rem.productId).toBe('prod_01');
      expect(rem.intervalDays).toBe(30);
      expect(rem.source).toBe(ReminderSource.AUTO);
      expect(rem.status).toBe(ReminderStatus.ACTIVE);
      // nextDueDate = lastOrderDate (d3) + 30 hari
      expect(wibDayIndex(rem.nextDueDate) - wibDayIndex(d3)).toBe(30);
    });

    it('mempertahankan interval MANUAL saat order baru selesai', async () => {
      const dOld = new Date('2026-10-01T08:00:00Z');
      const dNew = new Date('2026-11-01T08:00:00Z');

      // Reminder yang diubah sales menjadi MANUAL interval 14 hari
      mockReminders.push({
        id: 'rem_manual',
        businessId: BIZ_ID,
        customerId: 'cust_01',
        productId: 'prod_01',
        salesId: 'usr_sales_1',
        intervalDays: 14,
        source: ReminderSource.MANUAL,
        status: ReminderStatus.ACTIVE,
        lastOrderDate: dOld,
        nextDueDate: new Date(dOld.getTime() + 14 * 86_400_000),
      });

      mockOrders.push({
        id: 'ord_new',
        businessId: BIZ_ID,
        customerId: 'cust_01',
        salesId: 'usr_sales_1',
        status: OrderStatus.COMPLETED,
        createdAt: dNew,
        updatedAt: dNew,
        deletedAt: null,
        items: [{ productId: 'prod_01', qty: 10 }],
        shipment: { shippedAt: dNew },
        business: { defaultRepeatDays: 30 },
      });

      await updateRemindersForCompletedOrder(prismaMock, 'ord_new');

      expect(mockReminders.length).toBe(1);
      const rem = mockReminders[0];
      // Interval MANUAL 14 hari harus dipertahankan!
      expect(rem.intervalDays).toBe(14);
      expect(rem.source).toBe(ReminderSource.MANUAL);
      expect(rem.lastOrderDate).toEqual(dNew);
      // Tanggal jatuh tempo bertambah 14 hari dari order baru
      expect(wibDayIndex(rem.nextDueDate) - wibDayIndex(dNew)).toBe(14);
    });

    it('rebuildRemindersForCustomer membatalkan pengingat jika semua order COMPLETED produk tersebut dibatalkan', async () => {
      mockReminders.push({
        id: 'rem_to_cancel',
        businessId: BIZ_ID,
        customerId: 'cust_01',
        productId: 'prod_01',
        salesId: 'usr_sales_1',
        intervalDays: 14,
        source: ReminderSource.AUTO,
        status: ReminderStatus.ACTIVE,
      });

      // Tidak ada order COMPLETED yang tersisa di mockOrders
      await rebuildRemindersForCustomer(prismaMock, 'cust_01');

      expect(mockReminders[0].status).toBe(ReminderStatus.CANCELLED);
    });
  });

  describe('3. Job reminders.repeat.scan (Seksi 13.2 & Tes 17.3 nomor 15)', () => {
    it('scanRepeatReminders(now) menghasilkan notifikasi H-3, H-0, dan terlambat', async () => {
      const now = new Date('2026-11-10T08:00:00Z');

      // Reminder 1: Jatuh tempo 3 hari lagi (H-3 -> 2026-11-13)
      mockReminders.push({
        id: 'rem_h3',
        businessId: BIZ_ID,
        customerId: 'cust_01',
        productId: 'prod_01',
        salesId: 'usr_sales_1',
        status: ReminderStatus.ACTIVE,
        nextDueDate: new Date('2026-11-13T08:00:00Z'),
        lastOrderDate: new Date('2026-10-14T08:00:00Z'),
        customer: mockCustomers[0],
      });

      // Reminder 2: Jatuh tempo hari ini (H-0 -> 2026-11-10)
      mockReminders.push({
        id: 'rem_h0',
        businessId: BIZ_ID,
        customerId: 'cust_01',
        productId: 'prod_01',
        salesId: 'usr_sales_1',
        status: ReminderStatus.ACTIVE,
        nextDueDate: new Date('2026-11-10T08:00:00Z'),
        lastOrderDate: new Date('2026-10-11T08:00:00Z'),
        customer: mockCustomers[0],
      });

      // Reminder 3: Terlambat 1 hari (2026-11-09)
      mockReminders.push({
        id: 'rem_overdue_1',
        businessId: BIZ_ID,
        customerId: 'cust_01',
        productId: 'prod_01',
        salesId: 'usr_sales_1',
        status: ReminderStatus.ACTIVE,
        nextDueDate: new Date('2026-11-09T08:00:00Z'),
        lastOrderDate: new Date('2026-10-10T08:00:00Z'),
        customer: mockCustomers[0],
      });

      const res = await scanRepeatReminders(now, prismaMock);

      expect(res.notified).toBe(3);
      expect(mockNotifications.length).toBe(3);

      expect(mockNotifications.some((n) => n.dedupeKey.startsWith('REPEAT_DUE:rem_h3'))).toBe(true);
      expect(mockNotifications.some((n) => n.dedupeKey.startsWith('REPEAT_DUE:rem_h0'))).toBe(true);
      expect(mockNotifications.some((n) => n.dedupeKey.startsWith('REPEAT_DUE:rem_overdue_1'))).toBe(true);
    });

    it('dijalankan dua kali pada hari yang sama hanya menghasilkan satu notifikasi per hari (idempoten dedupe)', async () => {
      const now = new Date('2026-11-10T08:00:00Z');
      mockReminders.push({
        id: 'rem_dedupe',
        businessId: BIZ_ID,
        customerId: 'cust_01',
        productId: 'prod_01',
        salesId: 'usr_sales_1',
        status: ReminderStatus.ACTIVE,
        nextDueDate: new Date('2026-11-10T08:00:00Z'),
        lastOrderDate: new Date('2026-10-11T08:00:00Z'),
        customer: mockCustomers[0],
      });

      // Jalankan pertama kali
      await scanRepeatReminders(now, prismaMock);
      expect(mockNotifications.length).toBe(1);

      // Jalankan kedua kali pada hari yang sama
      await scanRepeatReminders(now, prismaMock);
      // Jumlah notifikasi tetap 1 karena dedupeKey dicek secara idempoten
      expect(mockNotifications.length).toBe(1);
    });

    it('eskalasi ke Super Admin muncul setelah 3 hari terlambat', async () => {
      const now = new Date('2026-11-10T08:00:00Z');
      // Terlambat 3 hari (jatuh tempo 2026-11-07)
      mockReminders.push({
        id: 'rem_escalate',
        businessId: BIZ_ID,
        customerId: 'cust_01',
        productId: 'prod_01',
        salesId: 'usr_sales_1',
        status: ReminderStatus.ACTIVE,
        nextDueDate: new Date('2026-11-07T08:00:00Z'),
        lastOrderDate: new Date('2026-10-08T08:00:00Z'),
        customer: mockCustomers[0],
        escalatedAt: null,
      });

      const res = await scanRepeatReminders(now, prismaMock);

      expect(res.escalated).toBe(1);
      // Notifikasi eskalasi ditujukan ke Super Admin
      const escNotif = mockNotifications.find((n) => n.type === 'REPEAT_ESCALATION');
      expect(escNotif).toBeTruthy();
      expect(escNotif.userId).toBe(superAdminUser.id);
      expect(escNotif.title).toContain('Eskalasi');

      // Reminder ditandai sudah dieskalasikan
      const updatedRem = mockReminders.find((r) => r.id === 'rem_escalate');
      expect(updatedRem.escalatedAt).toBeTruthy();
    });

    it('tidak mengirim notifikasi bila sudah ada order baru setelah lastOrderDate', async () => {
      const now = new Date('2026-11-10T08:00:00Z');
      const lastOrderDate = new Date('2026-10-10T08:00:00Z');

      mockReminders.push({
        id: 'rem_with_new_order',
        businessId: BIZ_ID,
        customerId: 'cust_01',
        productId: 'prod_01',
        salesId: 'usr_sales_1',
        status: ReminderStatus.ACTIVE,
        nextDueDate: new Date('2026-11-10T08:00:00Z'),
        lastOrderDate,
        customer: mockCustomers[0],
      });

      // Ada order baru setelah tanggal order terakhir pengingat
      mockOrders.push({
        id: 'ord_newer',
        customerId: 'cust_01',
        status: OrderStatus.IN_PROCESS,
        createdAt: new Date('2026-11-05T08:00:00Z'),
        deletedAt: null,
        items: [{ productId: 'prod_01' }],
      });

      const res = await scanRepeatReminders(now, prismaMock);

      expect(res.notified).toBe(0);
      expect(mockNotifications.length).toBe(0);
    });
  });

  describe('4. Job invoices.due.scan, crm.tasks.scan, owner.digest & housekeeping (Seksi 13.2)', () => {
    it('scanInvoicesDue mengirim notifikasi H-3, H-0, dan hari terlambat genap', async () => {
      const now = new Date('2026-11-10T08:00:00Z'); // Selasa
      mockOrders.push({
        id: 'ord_due_0',
        businessId: BIZ_ID,
        salesId: 'usr_sales_1',
        status: OrderStatus.IN_PROCESS,
        customer: { id: 'cust_01', name: 'Toko Berkah' },
        deletedAt: null,
      });
      mockInvoices.push({
        id: 'inv_due_0',
        businessId: BIZ_ID,
        orderId: 'ord_due_0',
        number: 'INV/2026/001',
        amount: 1000000n,
        paidAmount: 200000n,
        status: InvoiceStatus.APPROVED,
        dueDate: new Date('2026-11-10T08:00:00Z'), // H-0
        deletedAt: null,
      });

      const res = await scanInvoicesDue(now, prismaMock);
      expect(res.notified).toBe(1);
      expect(mockNotifications.some((n) => n.type === 'INVOICE_DUE')).toBe(true);
    });

    it('scanCrmTasks mengirim notifikasi tugas CRM yang jatuh tempo hari ini (WIB)', async () => {
      const now = new Date('2026-11-10T08:00:00Z');
      mockCrmTasks.push({
        id: 'task_today',
        businessId: BIZ_ID,
        assignedToId: 'usr_sales_1',
        title: 'Telepon konfirmasi pesanan mingguan',
        dueAt: new Date('2026-11-10T08:00:00Z'),
        doneAt: null,
        customer: { name: 'Toko Berkah' },
      });

      const res = await scanCrmTasks(now, prismaMock);
      expect(res.notified).toBe(1);
      expect(mockNotifications.some((n) => n.type === 'CRM_TASK_DUE')).toBe(true);
    });

    it('scanOwnerDigest mengirim ringkasan ke Super Admin jika ada data operasional pending', async () => {
      const now = new Date('2026-11-10T08:00:00Z');
      // Terdapat produk dengan stok <= 0 (prod_low_stock di beforeEach)
      const res = await scanOwnerDigest(now, prismaMock);
      expect(res.notified).toBe(1);
      expect(mockNotifications.some((n) => n.type === 'OWNER_DIGEST')).toBe(true);
    });

    it('runHousekeeping membersihkan sesi dan data kedaluwarsa', async () => {
      const now = new Date('2026-11-10T08:00:00Z');
      const oldDate = new Date(now.getTime() - 35 * 86_400_000); // 35 hari lalu

      mockSessions.push({
        id: 'sess_old',
        expiresAt: oldDate,
        revokedAt: null,
      });

      mockLoginAttempts.push({
        id: 'att_old',
        createdAt: oldDate,
      });

      mockTelegramLinkCodes.push({
        id: 'code_old',
        expiresAt: new Date(now.getTime() - 2 * 86_400_000), // 2 hari lalu
        usedAt: null,
      });

      const res = await runHousekeeping(now, prismaMock);
      expect(res.deletedSessions).toBe(1);
      expect(res.deletedLoginAttempts).toBe(1);
      expect(res.deletedLinkCodes).toBe(1);
    });
  });

  describe('5. Endpoint API Pengingat (GET, POST, PATCH, DELETE /api/v1/reminders)', () => {
    it('GET /api/v1/reminders mengembalikan daftar pengingat terisolasi sesuai hak akses', async () => {
      mockReminders.push({
        id: 'rem_1',
        businessId: BIZ_ID,
        customerId: 'cust_01',
        productId: 'prod_01',
        salesId: 'usr_sales_1',
        intervalDays: 14,
        lastOrderDate: new Date('2026-10-01'),
        nextDueDate: new Date('2026-10-15'),
        status: ReminderStatus.ACTIVE,
        source: ReminderSource.AUTO,
        customer: mockCustomers[0],
      });

      const req = new NextRequest('http://localhost:3000/api/v1/reminders?due=all');
      const res = await getRemindersHandler(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);
      expect(json.data.length).toBe(1);
      expect(json.data[0].customer.name).toBe('Toko Berkah Abadi');
    });

    it('POST /api/v1/reminders membuat pengingat manual', async () => {
      activeCtx = {
        user: {
          id: salesUser.id,
          role: salesUser.role,
          name: salesUser.name,
          businessId: salesUser.businessId,
        },
        businessId: BIZ_ID,
        role: Role.SALES,
        sessionId: 'sess_sales',
        ip: '127.0.0.1',
      };

      const req = new NextRequest('http://localhost:3000/api/v1/reminders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'origin': 'http://localhost:3000',
        },
        body: JSON.stringify({
          customerId: 'cust_01',
          productId: 'prod_01',
          intervalDays: 20,
          note: 'Pelanggan minta diingatkan tiap 20 hari',
        }),
      });

      const res = await createReminderHandler(req);
      const json = await res.json();

      expect(res.status).toBe(201);
      expect(json.ok).toBe(true);
      expect(json.data.intervalDays).toBe(20);
      expect(json.data.source).toBe(ReminderSource.MANUAL);
    });

    it('PATCH /api/v1/reminders/:id memperbarui interval menjadi MANUAL', async () => {
      mockReminders.push({
        id: 'rem_edit',
        businessId: BIZ_ID,
        customerId: 'cust_01',
        productId: 'prod_01',
        salesId: superAdminUser.id,
        intervalDays: 30,
        lastOrderDate: new Date('2026-10-01'),
        nextDueDate: new Date('2026-10-31'),
        status: ReminderStatus.ACTIVE,
        source: ReminderSource.AUTO,
      });

      const req = new NextRequest('http://localhost:3000/api/v1/reminders/rem_edit', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'origin': 'http://localhost:3000',
        },
        body: JSON.stringify({
          intervalDays: 25,
        }),
      });

      const res = await updateReminderHandler(req, {
        params: Promise.resolve({ id: 'rem_edit' }),
      });
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);
      expect(json.data.intervalDays).toBe(25);
      expect(json.data.source).toBe(ReminderSource.MANUAL);
    });

    it('DELETE /api/v1/reminders/:id membatalkan status pengingat', async () => {
      mockReminders.push({
        id: 'rem_del',
        businessId: BIZ_ID,
        customerId: 'cust_01',
        salesId: superAdminUser.id,
        status: ReminderStatus.ACTIVE,
      });

      const req = new NextRequest('http://localhost:3000/api/v1/reminders/rem_del', {
        method: 'DELETE',
        headers: {
          'origin': 'http://localhost:3000',
        },
      });

      const res = await deleteReminderHandler(req, {
        params: Promise.resolve({ id: 'rem_del' }),
      });
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);

      const del = mockReminders.find((r) => r.id === 'rem_del');
      expect(del.status).toBe(ReminderStatus.CANCELLED);
    });
  });

  describe('5. Endpoint API Piutang (GET /api/v1/receivables) & Zero-Leakage (Seksi 13.3 & 17.4)', () => {
    it('mengembalikan daftar piutang dengan umur piutang tanpa kebocoran data rahasia', async () => {
      mockOrders.push({
        id: 'ord_01',
        businessId: BIZ_ID,
        orderNo: 'ORD-001',
        salesId: salesUser.id,
        status: OrderStatus.IN_PROCESS,
        deletedAt: null,
        customer: {
          id: 'cust_01',
          code: 'CUST-001',
          name: 'Toko Berkah Abadi',
          phone: '08123456789',
        },
      });
      mockUsers.push(salesUser);

      mockInvoices.push({
        id: 'inv_rec_1',
        businessId: BIZ_ID,
        number: 'INV/2026/001',
        type: 'FINAL',
        amount: 1500000n,
        paidAmount: 500000n,
        status: InvoiceStatus.APPROVED,
        issueDate: new Date('2026-10-01T08:00:00Z'),
        dueDate: new Date('2026-10-15T08:00:00Z'),
        deletedAt: null,
        orderId: 'ord_01',
        order: {
          id: 'ord_01',
          orderNo: 'ORD-001',
          salesId: salesUser.id,
          sales: { id: salesUser.id, name: salesUser.name },
          status: OrderStatus.IN_PROCESS,
          customer: {
            id: 'cust_01',
            code: 'CUST-001',
            name: 'Toko Berkah Abadi',
            phone: '08123456789',
          },
        },
      });

      // Panggil sebagai Sales
      activeCtx = {
        user: {
          id: salesUser.id,
          role: salesUser.role,
          name: salesUser.name,
          businessId: salesUser.businessId,
        },
        businessId: BIZ_ID,
        role: Role.SALES,
        sessionId: 'sess_sales',
        ip: '127.0.0.1',
      };

      const req = new NextRequest('http://localhost:3000/api/v1/receivables');
      const res = await getReceivablesHandler(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);
      expect(json.data.length).toBe(1);

      const item = json.data[0];
      expect(item.remainingAmount).toBe(1000000); // 1.5jt - 500rb
      expect(item.agingBucket).toBeTruthy();
      expect(item.agingLabel).toBeTruthy();

      // Uji kebocoran data rahasia: pastikan tidak ada costPrice, hpp, margin, profit di seluruh struktur respons
      assertNoSecretKeys(json);
    });

    it('Sales tidak dapat melihat piutang milik pesanan sales lain', async () => {
      mockOrders.push({
        id: 'ord_other',
        businessId: BIZ_ID,
        orderNo: 'ORD-OTH',
        salesId: 'usr_other_sales',
        status: OrderStatus.IN_PROCESS,
        deletedAt: null,
        customer: {
          id: 'cust_01',
          code: 'CUST-001',
          name: 'Toko Berkah Abadi',
          phone: '08123456789',
        },
      });

      mockInvoices.push({
        id: 'inv_other_sales',
        businessId: BIZ_ID,
        number: 'INV/2026/OTHER',
        type: 'FINAL',
        amount: 2000000n,
        paidAmount: 0n,
        status: InvoiceStatus.APPROVED,
        dueDate: new Date('2026-10-15T08:00:00Z'),
        deletedAt: null,
        orderId: 'ord_other',
        order: {
          id: 'ord_other',
          orderNo: 'ORD-OTH',
          salesId: 'usr_other_sales', // Sales lain
          sales: { id: 'usr_other_sales', name: 'Sales Lain' },
          status: OrderStatus.IN_PROCESS,
          customer: {
            id: 'cust_01',
            code: 'CUST-001',
            name: 'Toko Berkah Abadi',
            phone: '08123456789',
          },
        },
      });

      // Panggil sebagai Sales 1
      activeCtx = {
        user: {
          id: salesUser.id,
          role: salesUser.role,
          name: salesUser.name,
          businessId: salesUser.businessId,
        },
        businessId: BIZ_ID,
        role: Role.SALES,
        sessionId: 'sess_sales',
        ip: '127.0.0.1',
      };

      const req = new NextRequest('http://localhost:3000/api/v1/receivables');
      const res = await getReceivablesHandler(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);
      expect(json.data.length).toBe(0); // Terisolasi!
    });
  });
});
