import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST as approveInvoiceHandler } from '@/app/api/v1/invoices/[id]/approve/route';
import { POST as rejectInvoiceHandler } from '@/app/api/v1/invoices/[id]/reject/route';
import { approveInvoice, rejectInvoice, TxClient } from '@/lib/services/invoice';
import { submitOrder } from '@/lib/services/order';
import { buildInvoiceSnapshot } from '@/lib/pdf/snapshot';
import {
  Role,
  OrderStatus,
  InvoiceStatus,
  InvoiceType,
  InvoiceTheme,
  DiscountSource,
  DiscountType,
} from '@prisma/client';
import { assertNoSecretKeys } from '../helpers/leak';
import * as contextModule from '@/lib/auth/context';
import type { Ctx } from '@/lib/auth/context';

interface MockBusiness {
  id: string;
  name: string;
  legalName: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  npwp: string | null;
  logoPath: string | null;
  invoiceTheme: InvoiceTheme;
  invoiceFooterNote: string | null;
  ppnEnabled: boolean;
  ppnRateBps: number;
  allowNegativeStock: boolean;
  dueDays: number;
  defaultDpBps: number;
}

interface MockCustomer {
  id: string;
  businessId: string;
  code: string;
  name: string;
  contactName: string | null;
  phone: string | null;
  address: string | null;
  billingAddress: string | null;
  shippingAddress: string | null;
  npwp: string | null;
  assignedSalesId: string | null;
  deletedAt: Date | null;
}

interface MockProduct {
  id: string;
  businessId: string;
  sku: string;
  name: string;
  unit: string;
  stockQty: number;
  reservedQty: number;
  deletedAt: Date | null;
}

interface MockBankAccount {
  id: string;
  businessId: string;
  bankName: string;
  accountNumber: string;
  accountHolder: string;
  isDefault: boolean;
  createdAt: Date;
  deletedAt: Date | null;
}

interface MockOrderItem {
  id: string;
  businessId: string;
  orderId: string;
  productId: string;
  productName: string;
  sku: string;
  unit: string;
  qty: number;
  listPrice: bigint;
  unitPrice: bigint;
  discountType: DiscountType;
  discountValue: bigint;
  discountSource: DiscountSource;
  lineSubtotal: bigint;
  lineDiscount: bigint;
  lineNet: bigint;
  costPrice: bigint;
  floorPrice: bigint;
  belowMin: boolean;
  sortOrder: number;
}

interface MockOrder {
  id: string;
  businessId: string;
  customerId: string;
  salesId: string;
  status: OrderStatus;
  version: number;
  rev: number;
  customerSeq: number | null;
  orderNo: string | null;
  orderDate: Date;
  deliveryAddress: string | null;
  notes: string | null;
  repeatIntervalDays: number | null;
  subtotal: bigint;
  discountTotal: bigint;
  shippingCharge: bigint;
  ppnEnabled: boolean;
  ppnRateBps: number;
  ppnAmount: bigint;
  grandTotal: bigint;
  dpBps: number;
  dpAmount: bigint;
  hasBelowMin: boolean;
  belowMinReason: string | null;
  overrideNote: string | null;
  rejectReason: string | null;
  paidTotal: bigint;
  creditTotal: bigint;
  stockReserved: boolean;
  cancelReason: string | null;
  cancelledAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

interface MockInvoice {
  id: string;
  businessId: string;
  orderId: string;
  customerId: string;
  type: InvoiceType;
  status: InvoiceStatus;
  version: number;
  number: string | null;
  amount: bigint;
  paidAmount: bigint;
  issueDate: Date | null;
  dueDate: Date | null;
  theme: InvoiceTheme | null;
  snapshot: unknown;
  requestedById: string;
  requestedAt: Date;
  approvedById: string | null;
  approvedAt: Date | null;
  rejectedById: string | null;
  rejectedAt: Date | null;
  rejectReason: string | null;
  rev: number;
  deletedAt: Date | null;
}

interface MockAuditLog {
  id: string;
  businessId: string;
  actorId: string;
  actorRole: Role;
  action: string;
  entityType: string;
  entityId: string;
  summary: string;
  reason?: string;
  createdAt: Date;
}

interface MockNotification {
  id: string;
  businessId: string;
  userId: string;
  type: string;
  title: string;
  body: string;
  linkPath: string;
  dedupeKey: string;
  createdAt: Date;
}

let businesses: MockBusiness[] = [];
let customers: MockCustomer[] = [];
let products: MockProduct[] = [];
let bankAccounts: MockBankAccount[] = [];
let orders: MockOrder[] = [];
let orderItems: MockOrderItem[] = [];
let invoices: MockInvoice[] = [];
let auditLogs: MockAuditLog[] = [];
let notifications: MockNotification[] = [];
const counters: Map<string, number> = new Map();

vi.mock('@/lib/db', () => {
  const mockPrisma = {
    $queryRaw: vi.fn(async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const sql = strings.join('?');

      // 1. Counter allocation: DocumentCounter
      if (sql.includes('DocumentCounter')) {
        const businessId = values[1] as string;
        const scope = values[2] as string;
        const scopeId = values[3] as string;
        const key = `${businessId}:${scope}:${scopeId}`;
        const current = (counters.get(key) || 0) + 1;
        counters.set(key, current);
        return [{ lastSeq: current }];
      }

      // 2. Lock Order: SELECT "id" FROM "Order" FOR UPDATE
      if (sql.includes('"Order"') && sql.includes('FOR UPDATE')) {
        const orderId = values[0] as string;
        const businessId = values[1] as string;
        const found = orders.find(
          (o) => o.id === orderId && o.businessId === businessId && o.deletedAt === null
        );
        if (found) {
          return [{ id: found.id }];
        }
        return [];
      }

      // 3. Lock Products: SELECT "id" FROM "Product" FOR UPDATE
      if (sql.includes('"Product"') && sql.includes('FOR UPDATE')) {
        return [];
      }

      return [];
    }),
    $transaction: vi.fn(async (cb: (tx: unknown) => unknown) => {
      return cb(mockPrisma);
    }),
    business: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
        return businesses.find((b) => b.id === where.id) || null;
      }),
    },
    user: {
      findMany: vi.fn(async () => {
        return [{ id: 'usr_admin', name: 'Super Admin', role: Role.SUPERADMIN, isActive: true }];
      }),
    },
    customer: {
      findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        return (
          customers.find((c) => {
            if (where.id && c.id !== where.id) return false;
            if (where.businessId && c.businessId !== where.businessId) return false;
            if (where.deletedAt === null && c.deletedAt !== null) return false;
            return true;
          }) || null
        );
      }),
    },
    bankAccount: {
      findMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        return bankAccounts.filter((b) => {
          if (where.businessId && b.businessId !== where.businessId) return false;
          if (where.deletedAt === null && b.deletedAt !== null) return false;
          return true;
        });
      }),
    },
    product: {
      findMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        return products.filter((p) => {
          if (where.businessId && p.businessId !== where.businessId) return false;
          if (where.deletedAt === null && p.deletedAt !== null) return false;
          if (where.id && typeof where.id === 'object' && 'in' in (where.id as Record<string, unknown>)) {
            const inList = (where.id as { in: string[] }).in;
            if (!inList.includes(p.id)) return false;
          }
          return true;
        });
      }),
      findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        return products.find((p) => p.id === where.id) || null;
      }),
      updateMany: vi.fn(async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        let count = 0;
        for (let i = 0; i < products.length; i++) {
          const p = products[i];
          if (where.id && p.id !== where.id) continue;
          if (where.businessId && p.businessId !== where.businessId) continue;

          if (data.reservedQty && typeof data.reservedQty === 'object' && 'increment' in (data.reservedQty as Record<string, unknown>)) {
            p.reservedQty += (data.reservedQty as { increment: number }).increment;
          }
          count++;
        }
        return { count };
      }),
    },
    order: {
      findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        const found = orders.find((o) => {
          if (where.id && o.id !== where.id) return false;
          if (where.businessId && o.businessId !== where.businessId) return false;
          if (where.deletedAt === null && o.deletedAt !== null) return false;
          return true;
        });
        if (!found) return null;

        const cust = customers.find((c) => c.id === found.customerId);
        const items = orderItems.filter((i) => i.orderId === found.id);
        return {
          ...found,
          customer: cust || undefined,
          items,
        };
      }),
      findFirstOrThrow: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        const found = orders.find((o) => {
          if (where.id && o.id !== where.id) return false;
          if (where.businessId && o.businessId !== where.businessId) return false;
          if (where.deletedAt === null && o.deletedAt !== null) return false;
          return true;
        });
        if (!found) throw new Error('Order not found');

        const cust = customers.find((c) => c.id === found.customerId);
        const items = orderItems.filter((i) => i.orderId === found.id);
        return {
          ...found,
          customer: cust || undefined,
          items,
        };
      }),
      updateMany: vi.fn(async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        let count = 0;
        for (let i = 0; i < orders.length; i++) {
          const o = orders[i];
          if (where.id && o.id !== where.id) continue;
          if (where.businessId && o.businessId !== where.businessId) continue;

          const updated: MockOrder = {
            ...o,
            ...data,
            updatedAt: new Date(),
          };

          if (data.rev && typeof data.rev === 'object' && 'increment' in (data.rev as Record<string, unknown>)) {
            updated.rev = o.rev + ((data.rev as { increment: number }).increment || 1);
          }

          orders[i] = updated;
          count++;
        }
        return { count };
      }),
    },
    invoice: {
      findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        return (
          invoices.find((inv) => {
            if (where.id && inv.id !== where.id) return false;
            if (where.orderId && inv.orderId !== where.orderId) return false;
            if (where.businessId && inv.businessId !== where.businessId) return false;
            if (where.type && inv.type !== where.type) return false;
            if (where.status && typeof where.status === 'object' && 'in' in (where.status as Record<string, unknown>)) {
              const inList = (where.status as { in: string[] }).in;
              if (!inList.includes(inv.status)) return false;
            } else if (where.status && inv.status !== where.status) {
              return false;
            }
            if (where.deletedAt === null && inv.deletedAt !== null) return false;
            return true;
          }) || null
        );
      }),
      findFirstOrThrow: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        const found = invoices.find((inv) => {
          if (where.id && inv.id !== where.id) return false;
          if (where.businessId && inv.businessId !== where.businessId) return false;
          return true;
        });
        if (!found) throw new Error('Invoice not found');
        return found;
      }),
      count: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        return invoices.filter((inv) => {
          if (where.orderId && inv.orderId !== where.orderId) return false;
          if (where.businessId && inv.businessId !== where.businessId) return false;
          if (where.type && inv.type !== where.type) return false;
          if (where.status && typeof where.status === 'object' && 'in' in (where.status as Record<string, unknown>)) {
            const inList = (where.status as { in: InvoiceStatus[] }).in;
            if (!inList.includes(inv.status)) return false;
          }
          return true;
        }).length;
      }),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const newInvoice: MockInvoice = {
          id: `inv_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          businessId: data.businessId as string,
          orderId: data.orderId as string,
          customerId: data.customerId as string,
          type: data.type as InvoiceType,
          status: data.status as InvoiceStatus,
          version: data.version as number,
          number: (data.number as string) ?? null,
          amount: data.amount as bigint,
          paidAmount: BigInt(0),
          issueDate: (data.issueDate as Date) ?? null,
          dueDate: (data.dueDate as Date) ?? null,
          theme: (data.theme as InvoiceTheme) ?? null,
          snapshot: data.snapshot ?? null,
          requestedById: data.requestedById as string,
          requestedAt: (data.requestedAt as Date) || new Date(),
          approvedById: null,
          approvedAt: null,
          rejectedById: null,
          rejectedAt: null,
          rejectReason: null,
          rev: 0,
          deletedAt: null,
        };
        invoices.push(newInvoice);
        return newInvoice;
      }),
      updateMany: vi.fn(async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        let count = 0;
        for (let i = 0; i < invoices.length; i++) {
          const inv = invoices[i];
          if (where.id && inv.id !== where.id) continue;
          if (where.businessId && inv.businessId !== where.businessId) continue;

          const updated: MockInvoice = {
            ...inv,
            ...data,
          };

          if (data.rev && typeof data.rev === 'object' && 'increment' in (data.rev as Record<string, unknown>)) {
            updated.rev = inv.rev + ((data.rev as { increment: number }).increment || 1);
          }

          invoices[i] = updated;
          count++;
        }
        return { count };
      }),
    },
    auditLog: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const log: MockAuditLog = {
          id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          businessId: data.businessId as string,
          actorId: data.actorId as string,
          actorRole: data.actorRole as Role,
          action: data.action as string,
          entityType: data.entityType as string,
          entityId: data.entityId as string,
          summary: data.summary as string,
          reason: data.reason as string | undefined,
          createdAt: new Date(),
        };
        auditLogs.push(log);
        return log;
      }),
    },
    notification: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const notif: MockNotification = {
          id: `notif_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          businessId: data.businessId as string,
          userId: data.userId as string,
          type: data.type as string,
          title: data.title as string,
          body: data.body as string,
          linkPath: data.linkPath as string,
          dedupeKey: data.dedupeKey as string,
          createdAt: new Date(),
        };
        notifications.push(notif);
        return notif;
      }),
    },
  };

  return { prisma: mockPrisma };
});

describe('T3.2: Persetujuan, Penolakan, dan Alokasi Nomor Faktur (Invoice Approve & Reject)', () => {
  const BIZ_ID = 'biz_main';
  const OTHER_BIZ_ID = 'biz_other';

  const superAdminCtx: Ctx = {
    user: {
      id: 'usr_admin',
      role: Role.SUPERADMIN,
      name: 'Super Admin',
      businessId: BIZ_ID,
    },
    businessId: BIZ_ID,
    role: Role.SUPERADMIN,
    sessionId: 'sess_admin',
    ip: '127.0.0.1',
  };

  const salesCtx: Ctx = {
    user: {
      id: 'usr_sales_1',
      role: Role.SALES,
      name: 'Sales Lapangan 1',
      businessId: BIZ_ID,
    },
    businessId: BIZ_ID,
    role: Role.SALES,
    sessionId: 'sess_sales_1',
    ip: '127.0.0.1',
  };

  let activeCtx: Ctx = superAdminCtx;

  beforeEach(() => {
    activeCtx = superAdminCtx;
    vi.spyOn(contextModule, 'requireContext').mockImplementation(async () => activeCtx);

    businesses = [
      {
        id: BIZ_ID,
        name: 'Bento Catering',
        legalName: 'PT Bento Katering Nusantara',
        address: 'Jl. Melawai No. 12, Jakarta',
        phone: '021-5551234',
        email: 'billing@bentocat.com',
        npwp: '01.234.567.8-901.000',
        logoPath: '/uploads/logo.png',
        invoiceTheme: InvoiceTheme.PROFESIONAL,
        invoiceFooterNote: 'Terima kasih atas kepercayaan Anda bermitra dengan kami.',
        ppnEnabled: false,
        ppnRateBps: 0,
        allowNegativeStock: false,
        dueDays: 7,
        defaultDpBps: 3000, // 30%
      },
      {
        id: OTHER_BIZ_ID,
        name: 'Other Business',
        legalName: null,
        address: null,
        phone: null,
        email: null,
        npwp: null,
        logoPath: null,
        invoiceTheme: InvoiceTheme.PROFESIONAL,
        invoiceFooterNote: null,
        ppnEnabled: false,
        ppnRateBps: 0,
        allowNegativeStock: false,
        dueDays: 7,
        defaultDpBps: 0,
      },
    ];

    customers = [
      {
        id: 'cust_1',
        businessId: BIZ_ID,
        code: 'TEROBOS',
        name: 'PT Terobos Sukses Mandiri',
        contactName: 'Budi Santoso',
        phone: '081234567890',
        address: 'Jl. Sudirman No. 45, Jakarta',
        billingAddress: 'Jl. Sudirman No. 45, Jakarta',
        shippingAddress: 'Gedung Terobos Lt. 5, Jakarta',
        npwp: '09.876.543.2-109.000',
        assignedSalesId: 'usr_sales_1',
        deletedAt: null,
      },
    ];

    products = [
      {
        id: 'prod_1',
        businessId: BIZ_ID,
        sku: 'NB-01',
        name: 'Nasi Box Premium',
        unit: 'porsi',
        stockQty: 100,
        reservedQty: 0,
        deletedAt: null,
      },
    ];

    bankAccounts = [
      {
        id: 'bank_1',
        businessId: BIZ_ID,
        bankName: 'BCA',
        accountNumber: '1234567890',
        accountHolder: 'PT Bento Katering Nusantara',
        isDefault: true,
        createdAt: new Date('2026-01-01'),
        deletedAt: null,
      },
    ];

    orders = [];
    orderItems = [];
    invoices = [];
    auditLogs = [];
    notifications = [];
    counters.clear();
  });

  function setupPendingOrder(overrides: Partial<MockOrder> = {}) {
    const oId = overrides.id || `ord_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const newOrd: MockOrder = {
      id: oId,
      businessId: BIZ_ID,
      customerId: 'cust_1',
      salesId: 'usr_sales_1',
      status: OrderStatus.PENDING_APPROVAL,
      version: 1,
      rev: 1,
      customerSeq: null,
      orderNo: null,
      orderDate: new Date('2026-11-08'),
      deliveryAddress: 'Gedung Terobos Lt. 5, Jakarta',
      notes: 'Penyajian hangat sebelum jam 11:30',
      repeatIntervalDays: null,
      subtotal: BigInt(1_000_000),
      discountTotal: BigInt(0),
      shippingCharge: BigInt(50_000),
      ppnEnabled: false,
      ppnRateBps: 0,
      ppnAmount: BigInt(0),
      grandTotal: BigInt(1_050_000),
      dpBps: 3000,
      dpAmount: BigInt(315_000),
      hasBelowMin: false,
      belowMinReason: null,
      overrideNote: null,
      rejectReason: null,
      paidTotal: BigInt(0),
      creditTotal: BigInt(0),
      stockReserved: false,
      cancelReason: null,
      cancelledAt: null,
      createdAt: new Date('2026-11-08T10:00:00Z'),
      updatedAt: new Date('2026-11-08T10:00:00Z'),
      deletedAt: null,
      ...overrides,
    };
    orders.push(newOrd);

    const item: MockOrderItem = {
      id: `item_${oId}_1`,
      businessId: BIZ_ID,
      orderId: oId,
      productId: 'prod_1',
      productName: 'Nasi Box Premium',
      sku: 'NB-01',
      unit: 'porsi',
      qty: 20,
      listPrice: BigInt(50_000),
      unitPrice: BigInt(50_000),
      discountType: DiscountType.NONE,
      discountValue: BigInt(0),
      discountSource: DiscountSource.MANUAL,
      lineSubtotal: BigInt(1_000_000),
      lineDiscount: BigInt(0),
      lineNet: BigInt(1_000_000),
      costPrice: BigInt(30_000),
      floorPrice: BigInt(45_000),
      belowMin: overrides.hasBelowMin || false,
      sortOrder: 0,
    };
    orderItems.push(item);

    const inv: MockInvoice = {
      id: `inv_${oId}_dp`,
      businessId: BIZ_ID,
      orderId: oId,
      customerId: 'cust_1',
      type: newOrd.dpBps > 0 ? InvoiceType.DP : InvoiceType.FINAL,
      status: InvoiceStatus.PENDING_APPROVAL,
      version: 1,
      number: null,
      amount: newOrd.dpBps > 0 ? newOrd.dpAmount : newOrd.grandTotal,
      paidAmount: BigInt(0),
      issueDate: null,
      dueDate: null,
      theme: null,
      snapshot: null,
      requestedById: 'usr_sales_1',
      requestedAt: new Date('2026-11-08T10:05:00Z'),
      approvedById: null,
      approvedAt: null,
      rejectedById: null,
      rejectedAt: null,
      rejectReason: null,
      rev: 0,
      deletedAt: null,
    };
    invoices.push(inv);

    return { order: newOrd, invoice: inv, item };
  }

  describe('1. invoiceService.approve & Alokasi Nomor Resmi (Seksi 7.8, 8.2)', () => {
    it('berhasil menyetujui invoice DP: alokasi nomor resmi, transisi AWAITING_DP, reservasi stok, snapshot', async () => {
      const { invoice } = setupPendingOrder();
      const tx = (await import('@/lib/db')).prisma as unknown as TxClient;

      const res = await approveInvoice(tx, superAdminCtx, invoice.id);

      // Verifikasi status invoice & order
      expect(res.invoice.status).toBe(InvoiceStatus.APPROVED);
      expect(res.order.status).toBe(OrderStatus.AWAITING_DP);

      // Verifikasi alokasi nomor resmi: TEROBOS/INV/08/11/2026/0001-DP
      expect(res.order.customerSeq).toBe(1);
      expect(res.order.orderNo).toMatch(/^TEROBOS\/INV\/\d{2}\/\d{2}\/\d{4}\/0001$/);
      expect(res.invoice.number).toBe(`${res.order.orderNo}-DP`);

      // Verifikasi reservasi stok produk
      const prod = products.find((p) => p.id === 'prod_1');
      expect(prod?.reservedQty).toBe(20);
      expect(res.order.stockReserved).toBe(true);

      // Verifikasi AuditLog & Notifikasi
      const audit = auditLogs.find((a) => a.entityId === invoice.id && a.action === 'INVOICE_APPROVE');
      expect(audit).toBeDefined();

      const notif = notifications.find((n) => n.userId === 'usr_sales_1' && n.type === 'APPROVAL_RESULT');
      expect(notif).toBeDefined();
      expect(notif?.title).toContain('Disetujui');
    });

    it('berhasil menyetujui invoice FINAL (tanpa DP, dpBps = 0) -> order AWAITING_FINAL_PAYMENT & nomor -LNS', async () => {
      const { invoice } = setupPendingOrder({ dpBps: 0, dpAmount: BigInt(0) });
      const tx = (await import('@/lib/db')).prisma as unknown as TxClient;

      const res = await approveInvoice(tx, superAdminCtx, invoice.id);

      expect(res.invoice.status).toBe(InvoiceStatus.APPROVED);
      expect(res.order.status).toBe(OrderStatus.AWAITING_FINAL_PAYMENT);
      expect(res.invoice.number).toBe(`${res.order.orderNo}-LNS`);
    });

    it('persetujuan paralel berurutan mengalokasikan nomor urut tanpa celah (Seksi 7.8)', async () => {
      const setup1 = setupPendingOrder({ id: 'ord_seq_1' });
      const setup2 = setupPendingOrder({ id: 'ord_seq_2' });

      const tx = (await import('@/lib/db')).prisma as unknown as TxClient;

      const res1 = await approveInvoice(tx, superAdminCtx, setup1.invoice.id);
      const res2 = await approveInvoice(tx, superAdminCtx, setup2.invoice.id);

      expect(res1.order.customerSeq).toBe(1);
      expect(res1.order.orderNo).toContain('/0001');
      expect(res2.order.customerSeq).toBe(2);
      expect(res2.order.orderNo).toContain('/0002');
    });

    it('menolak menyetujui jika invoice tidak berstatus PENDING_APPROVAL dengan 409 INVALID_STATE', async () => {
      const { invoice } = setupPendingOrder();
      invoice.status = InvoiceStatus.APPROVED;

      const tx = (await import('@/lib/db')).prisma as unknown as TxClient;
      await expect(approveInvoice(tx, superAdminCtx, invoice.id)).rejects.toThrow(
        expect.objectContaining({
          code: 'INVALID_STATE',
          status: 409,
        })
      );
    });

    it('menolak Sales menyetujui invoice dengan 403 FORBIDDEN', async () => {
      const { invoice } = setupPendingOrder();
      const tx = (await import('@/lib/db')).prisma as unknown as TxClient;

      await expect(approveInvoice(tx, salesCtx, invoice.id)).rejects.toThrow(
        expect.objectContaining({
          code: 'FORBIDDEN',
          status: 403,
        })
      );
    });
  });

  describe('2. Tes 17.3 nomor 4: Penegakan Catatan Override Harga di Bawah Minimal (Seksi 7.11)', () => {
    it('menolak persetujuan jika hasBelowMin = true tanpa overrideNote dengan 422 OVERRIDE_NOTE_REQUIRED', async () => {
      const { invoice } = setupPendingOrder({
        hasBelowMin: true,
        belowMinReason: 'Diskon pembukaan cabang baru',
      });
      const tx = (await import('@/lib/db')).prisma as unknown as TxClient;

      // Tanpa options
      await expect(approveInvoice(tx, superAdminCtx, invoice.id)).rejects.toThrow(
        expect.objectContaining({
          code: 'OVERRIDE_NOTE_REQUIRED',
          status: 422,
        })
      );

      // overrideNote kurang dari 5 karakter
      await expect(
        approveInvoice(tx, superAdminCtx, invoice.id, { overrideNote: 'ok' })
      ).rejects.toThrow(
        expect.objectContaining({
          code: 'OVERRIDE_NOTE_REQUIRED',
          status: 422,
        })
      );
    });

    it('berhasil jika hasBelowMin = true dan overrideNote >= 5 karakter', async () => {
      const { invoice } = setupPendingOrder({
        hasBelowMin: true,
        belowMinReason: 'Diskon pembukaan cabang baru',
      });
      const tx = (await import('@/lib/db')).prisma as unknown as TxClient;

      const res = await approveInvoice(tx, superAdminCtx, invoice.id, {
        overrideNote: 'Disetujui untuk pengikatan kontrak jangka panjang',
      });

      expect(res.invoice.status).toBe(InvoiceStatus.APPROVED);
      expect(res.order.overrideNote).toBe('Disetujui untuk pengikatan kontrak jangka panjang');
    });
  });

  describe('3. Tes 17.3 nomor 7 (Stok): Reservasi Stok saat Approve', () => {
    it('menolak persetujuan dengan 409 INSUFFICIENT_STOCK jika allowNegativeStock mati dan stok kurang', async () => {
      const { invoice } = setupPendingOrder();
      // Stok fisik hanya 10, sedangkan order butuh 20
      const prod = products.find((p) => p.id === 'prod_1')!;
      prod.stockQty = 10;
      prod.reservedQty = 0;

      const tx = (await import('@/lib/db')).prisma as unknown as TxClient;
      await expect(approveInvoice(tx, superAdminCtx, invoice.id)).rejects.toThrow(
        expect.objectContaining({
          code: 'INSUFFICIENT_STOCK',
          status: 409,
        })
      );
    });

    it('berhasil jika allowNegativeStock aktif meskipun stok kurang, saldo tersedia menjadi minus', async () => {
      const { invoice } = setupPendingOrder();
      const b = businesses.find((biz) => biz.id === BIZ_ID)!;
      b.allowNegativeStock = true;

      const prod = products.find((p) => p.id === 'prod_1')!;
      prod.stockQty = 5;
      prod.reservedQty = 0;

      const tx = (await import('@/lib/db')).prisma as unknown as TxClient;
      const res = await approveInvoice(tx, superAdminCtx, invoice.id);

      expect(res.invoice.status).toBe(InvoiceStatus.APPROVED);
      expect(prod.reservedQty).toBe(20);
      // available = 5 - 20 = -15
      expect(prod.stockQty - prod.reservedQty).toBe(-15);
    });
  });

  describe('4. Tes 17.3 nomor 3: Tolak lalu Revisi & Akhiran Nomor -DP-R1', () => {
    it('penolakan order memindahkan ke REVISION_REQUIRED, submit ulang dan persetujuan menghasilkan nomor berakhiran -DP-R1', async () => {
      const { order, invoice } = setupPendingOrder();
      const tx = (await import('@/lib/db')).prisma as unknown as TxClient;

      // 1. Tolak invoice tanpa alasan -> 422
      await expect(
        rejectInvoice(tx, superAdminCtx, invoice.id, { reason: 'abc' })
      ).rejects.toThrow(
        expect.objectContaining({
          code: 'REJECT_REASON_REQUIRED',
          status: 422,
        })
      );

      // 2. Tolak invoice dengan alasan sah
      const rejRes = await rejectInvoice(tx, superAdminCtx, invoice.id, {
        reason: 'Alamat pengiriman belum lengkap, mohon perbaiki.',
      });

      expect(rejRes.invoice.status).toBe(InvoiceStatus.REJECTED);
      expect(rejRes.order.status).toBe(OrderStatus.REVISION_REQUIRED);
      expect(rejRes.order.version).toBe(2); // Order.version naik
      expect(rejRes.order.rejectReason).toBe('Alamat pengiriman belum lengkap, mohon perbaiki.');

      // 3. Sales mengajukan ulang (submitOrder)
      const subRes = await submitOrder(tx, salesCtx, order.id);
      expect(subRes.order.status).toBe(OrderStatus.PENDING_APPROVAL);
      expect(subRes.invoice.version).toBe(2); // Invoice versi 2

      // 4. Super Admin menyetujui invoice versi 2
      const appRes = await approveInvoice(tx, superAdminCtx, subRes.invoice.id);
      expect(appRes.invoice.status).toBe(InvoiceStatus.APPROVED);
      // Akhiran -DP-R1 karena version = 2
      expect(appRes.invoice.number).toMatch(/-DP-R1$/);
    });
  });

  describe('5. Tes 17.3 nomor 20: Snapshot Memenuhi Tes Kebocoran (Seksi 14.1 & leak.ts)', () => {
    it('InvoiceSnapshot statis dibangun dan tidak membocorkan satu pun kunci rahasia', async () => {
      const { invoice } = setupPendingOrder();
      const tx = (await import('@/lib/db')).prisma as unknown as TxClient;

      const snapshot = await buildInvoiceSnapshot(tx, invoice.id, {
        businessId: invoice.businessId,
        number: 'TEROBOS/INV/08/11/2026/0001-DP',
        theme: InvoiceTheme.PROFESIONAL,
      });

      // Uji kebocoran rahasia perusahaan (assertNoSecretKeys)
      expect(() => assertNoSecretKeys(snapshot)).not.toThrow();

      // Verifikasi struktur data publik
      expect(snapshot.schemaVersion).toBe(1);
      expect(snapshot.number).toBe('TEROBOS/INV/08/11/2026/0001-DP');
      expect(snapshot.type).toBe('DP');
      expect(snapshot.customer.code).toBe('TEROBOS');
      expect(snapshot.items.length).toBe(1);
      expect(snapshot.items[0].name).toBe('Nasi Box Premium');
      expect(snapshot.items[0].unitPrice).toBe(50_000);
      expect(snapshot.banks.length).toBe(1);
      expect(snapshot.banks[0].bankName).toBe('BCA');

      // Pastikan field terlarang tidak pernah ada
      const rawJson = JSON.stringify(snapshot);
      expect(rawJson).not.toContain('costPrice');
      expect(rawJson).not.toContain('floorPrice');
      expect(rawJson).not.toContain('belowMin');
      expect(rawJson).not.toContain('salesId');
    });
  });

  describe('6. Endpoint Routes via NextRequest (Approve & Reject HTTP Handlers)', () => {
    it('POST /api/v1/invoices/:id/approve berhasil menyetujui invoice', async () => {
      const { invoice } = setupPendingOrder();

      const req = new NextRequest(`http://localhost:3000/api/v1/invoices/${invoice.id}/approve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          origin: 'http://localhost:3000',
        },
        body: JSON.stringify({
          dueDate: '2026-11-20',
          theme: 'MODERN',
        }),
      });

      const res = await approveInvoiceHandler(req, { params: Promise.resolve({ id: invoice.id }) });
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.data.invoice.status).toBe(InvoiceStatus.APPROVED);
      expect(json.data.order.status).toBe(OrderStatus.AWAITING_DP);
    });

    it('POST /api/v1/invoices/:id/reject berhasil menolak invoice', async () => {
      const { invoice } = setupPendingOrder();

      const req = new NextRequest(`http://localhost:3000/api/v1/invoices/${invoice.id}/reject`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          origin: 'http://localhost:3000',
        },
        body: JSON.stringify({
          reason: 'Kuantitas pesanan melebihi batas kapasitas harian catering',
        }),
      });

      const res = await rejectInvoiceHandler(req, { params: Promise.resolve({ id: invoice.id }) });
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.data.invoice.status).toBe(InvoiceStatus.REJECTED);
      expect(json.data.order.status).toBe(OrderStatus.REVISION_REQUIRED);
    });
  });
});
