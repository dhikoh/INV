import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST as submitOrderHandler } from '@/app/api/v1/orders/[id]/submit/route';
import { POST as withdrawOrderHandler } from '@/app/api/v1/orders/[id]/withdraw/route';
import { GET as getApprovalsHandler } from '@/app/api/v1/approvals/route';
import {
  submitOrder,
  withdrawOrder,
  TxClient,
} from '@/lib/services/order';
import {
  Role,
  OrderStatus,
  InvoiceStatus,
  InvoiceType,
  DiscountSource,
  DiscountType,
} from '@prisma/client';
import { DomainError } from '@/lib/domain/money';
import * as contextModule from '@/lib/auth/context';
import type { Ctx } from '@/lib/auth/context';

interface MockBusiness {
  id: string;
  name: string;
  ppnEnabled: boolean;
  ppnRateBps: number;
  defaultDpBps: number;
}

interface MockCustomer {
  id: string;
  businessId: string;
  code: string;
  name: string;
  phone: string;
  address: string | null;
  assignedSalesId: string | null;
  deletedAt: Date | null;
}

interface MockUser {
  id: string;
  businessId: string;
  role: Role;
  name: string;
  username: string;
  isActive: boolean;
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
  amount: bigint;
  requestedById: string;
  requestedAt: Date;
  approvedById: string | null;
  approvedAt: Date | null;
  rejectedById: string | null;
  rejectedAt: Date | null;
  rejectReason: string | null;
  paidAt: Date | null;
  receiptNumber: string | null;
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
let users: MockUser[] = [];
let orders: MockOrder[] = [];
let orderItems: MockOrderItem[] = [];
let invoices: MockInvoice[] = [];
let auditLogs: MockAuditLog[] = [];
let notifications: MockNotification[] = [];

vi.mock('@/lib/db', () => {
  const mockPrisma = {
    $queryRaw: vi.fn(async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const orderId = values[0] as string;
      const businessId = values[1] as string;
      const found = orders.find(
        (o) => o.id === orderId && o.businessId === businessId && o.deletedAt === null
      );
      if (found) {
        return [{ id: found.id }];
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
      findMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        return users.filter((u) => {
          if (where.role && u.role !== where.role) return false;
          if (where.isActive !== undefined && u.isActive !== where.isActive) return false;
          if (where.id && typeof where.id === 'object' && 'in' in (where.id as Record<string, unknown>)) {
            const inList = (where.id as { in: string[] }).in;
            if (!inList.includes(u.id)) return false;
          }
          return true;
        });
      }),
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
        return users.find((u) => u.id === where.id) || null;
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
    order: {
      count: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        return orders.filter((o) => {
          if (where.businessId && o.businessId !== where.businessId) return false;
          if (where.deletedAt === null && o.deletedAt !== null) return false;
          if (where.hasBelowMin !== undefined && o.hasBelowMin !== where.hasBelowMin) return false;
          if (where.status && typeof where.status === 'object' && 'in' in (where.status as Record<string, unknown>)) {
            const inList = (where.status as { in: OrderStatus[] }).in;
            if (!inList.includes(o.status)) return false;
          } else if (where.status && o.status !== where.status) {
            return false;
          }
          return true;
        }).length;
      }),
      findMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        const filtered = orders.filter((o) => {
          if (where.businessId && o.businessId !== where.businessId) return false;
          if (where.deletedAt === null && o.deletedAt !== null) return false;
          if (where.hasBelowMin !== undefined && o.hasBelowMin !== where.hasBelowMin) return false;
          if (where.status && typeof where.status === 'object' && 'in' in (where.status as Record<string, unknown>)) {
            const inList = (where.status as { in: OrderStatus[] }).in;
            if (!inList.includes(o.status)) return false;
          } else if (where.status && o.status !== where.status) {
            return false;
          }

          if (where.OR && Array.isArray(where.OR)) {
            const orMatched = (where.OR as Array<Record<string, unknown>>).some((cond) => {
              if (cond.orderNo && typeof cond.orderNo === 'object' && 'contains' in (cond.orderNo as Record<string, unknown>)) {
                const term = ((cond.orderNo as { contains: string }).contains || '').toLowerCase();
                if (o.orderNo?.toLowerCase().includes(term)) return true;
              }
              if (cond.customer && typeof cond.customer === 'object') {
                const cCust = customers.find((c) => c.id === o.customerId);
                const custCond = cond.customer as Record<string, { contains: string }>;
                if (custCond.name?.contains && cCust?.name.toLowerCase().includes(custCond.name.contains.toLowerCase())) return true;
                if (custCond.code?.contains && cCust?.code.toLowerCase().includes(custCond.code.contains.toLowerCase())) return true;
              }
              return false;
            });
            if (!orMatched) return false;
          }

          return true;
        });

        // FIFO sorting by createdAt asc
        filtered.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

        return filtered.map((o) => {
          const cust = customers.find((c) => c.id === o.customerId);
          const items = orderItems.filter((i) => i.orderId === o.id);
          return {
            ...o,
            customer: cust || undefined,
            items,
          };
        });
      }),
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
            if (where.status && inv.status !== where.status) return false;
            if (where.deletedAt === null && inv.deletedAt !== null) return false;
            return true;
          }) || null
        );
      }),
      findMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        return invoices.filter((inv) => {
          if (where.businessId && inv.businessId !== where.businessId) return false;
          if (where.deletedAt === null && inv.deletedAt !== null) return false;
          if (where.status && inv.status !== where.status) return false;
          if (where.orderId && typeof where.orderId === 'object' && 'in' in (where.orderId as Record<string, unknown>)) {
            const inList = (where.orderId as { in: string[] }).in;
            if (!inList.includes(inv.orderId)) return false;
          }
          return true;
        });
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
          amount: data.amount as bigint,
          requestedById: data.requestedById as string,
          requestedAt: (data.requestedAt as Date) || new Date(),
          approvedById: null,
          approvedAt: null,
          rejectedById: null,
          rejectedAt: null,
          rejectReason: null,
          paidAt: null,
          receiptNumber: null,
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

          invoices[i] = {
            ...inv,
            ...data,
          };
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

describe('T3.1: Alur Pengajuan dan Penarikan Pesanan (Workflow Approval, Invoice & Antrean)', () => {
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

  const sales1Ctx: Ctx = {
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

  const sales2Ctx: Ctx = {
    user: {
      id: 'usr_sales_2',
      role: Role.SALES,
      name: 'Sales Lapangan 2',
      businessId: BIZ_ID,
    },
    businessId: BIZ_ID,
    role: Role.SALES,
    sessionId: 'sess_sales_2',
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
        ppnEnabled: false,
        ppnRateBps: 0,
        defaultDpBps: 3000, // 30%
      },
      {
        id: OTHER_BIZ_ID,
        name: 'Other Business',
        ppnEnabled: false,
        ppnRateBps: 0,
        defaultDpBps: 0,
      },
    ];

    users = [
      {
        id: 'usr_admin',
        businessId: BIZ_ID,
        role: Role.SUPERADMIN,
        name: 'Super Admin',
        username: 'superadmin',
        isActive: true,
      },
      {
        id: 'usr_sales_1',
        businessId: BIZ_ID,
        role: Role.SALES,
        name: 'Sales Lapangan 1',
        username: 'sales1',
        isActive: true,
      },
      {
        id: 'usr_sales_2',
        businessId: BIZ_ID,
        role: Role.SALES,
        name: 'Sales Lapangan 2',
        username: 'sales2',
        isActive: true,
      },
    ];

    customers = [
      {
        id: 'cust_1',
        businessId: BIZ_ID,
        code: 'CUST-001',
        name: 'PT Maju Bersama',
        phone: '081234567890',
        address: 'Jl. Sudirman No. 10',
        assignedSalesId: 'usr_sales_1',
        deletedAt: null,
      },
    ];

    orders = [];
    orderItems = [];
    invoices = [];
    auditLogs = [];
    notifications = [];
  });

  function createTestOrder(overrides: Partial<MockOrder> = {}): MockOrder {
    const oId = overrides.id || `ord_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const newOrd: MockOrder = {
      id: oId,
      businessId: BIZ_ID,
      customerId: 'cust_1',
      salesId: 'usr_sales_1',
      status: OrderStatus.DRAFT,
      version: 1,
      rev: 0,
      customerSeq: 1,
      orderNo: 'ORD-202611-0001',
      orderDate: new Date('2026-11-08'),
      deliveryAddress: 'Jl. Merdeka 45',
      notes: null,
      repeatIntervalDays: null,
      subtotal: BigInt(1_000_000),
      discountTotal: BigInt(0),
      shippingCharge: BigInt(50_000),
      ppnEnabled: false,
      ppnRateBps: 0,
      ppnAmount: BigInt(0),
      grandTotal: BigInt(1_050_000),
      dpBps: 3000, // 30%
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

    // Default 1 line item
    const item: MockOrderItem = {
      id: `item_${oId}_1`,
      businessId: BIZ_ID,
      orderId: oId,
      productId: 'prod_1',
      productName: 'Nasi Box Komplit',
      sku: 'NB-01',
      unit: 'porsi',
      qty: 20,
      listPrice: BigInt(50_000),
      unitPrice: BigInt(50_000),
      discountType: DiscountType.AMOUNT,
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

    return newOrd;
  }

  describe('1. orderService.submit', () => {
    it('berhasil mengajukan pesanan dengan DP (dpBps > 0) -> Order PENDING_APPROVAL & Invoice DP v1', async () => {
      const ord = createTestOrder({ dpBps: 3000, dpAmount: BigInt(315_000) });

      const tx = (await import('@/lib/db')).prisma as unknown as TxClient;
      const res = await submitOrder(tx, sales1Ctx, ord.id);

      expect(res.order.status).toBe(OrderStatus.PENDING_APPROVAL);
      expect(res.order.rev).toBe(1);

      // Verifikasi invoice
      expect(res.invoice.type).toBe(InvoiceType.DP);
      expect(res.invoice.status).toBe(InvoiceStatus.PENDING_APPROVAL);
      expect(res.invoice.version).toBe(1);
      expect(res.invoice.amount).toBe(315_000);

      // Verifikasi database invoice
      const invInDb = invoices.find((i) => i.orderId === ord.id);
      expect(invInDb).toBeDefined();
      expect(invInDb?.type).toBe(InvoiceType.DP);
      expect(invInDb?.version).toBe(1);

      // Verifikasi audit log
      const audit = auditLogs.find((a) => a.entityId === ord.id && a.action === 'ORDER_SUBMIT');
      expect(audit).toBeDefined();
      expect(audit?.actorId).toBe('usr_sales_1');

      // Verifikasi notifikasi Super Admin
      const notif = notifications.find((n) => n.userId === 'usr_admin');
      expect(notif).toBeDefined();
      expect(notif?.type).toBe('APPROVAL_REQUEST');
      expect(notif?.linkPath).toBe('/approvals');
    });

    it('berhasil mengajukan pesanan tanpa DP (dpBps = 0) -> Invoice FINAL v1 sebesar grandTotal', async () => {
      const ord = createTestOrder({ dpBps: 0, dpAmount: BigInt(0), grandTotal: BigInt(1_050_000) });

      const tx = (await import('@/lib/db')).prisma as unknown as TxClient;
      const res = await submitOrder(tx, sales1Ctx, ord.id);

      expect(res.order.status).toBe(OrderStatus.PENDING_APPROVAL);
      expect(res.invoice.type).toBe(InvoiceType.FINAL);
      expect(res.invoice.amount).toBe(1_050_000);
      expect(res.invoice.version).toBe(1);
    });

    it('menolak pengajuan kedua saat status sudah PENDING_APPROVAL dengan 409 INVOICE_ALREADY_PENDING', async () => {
      const ord = createTestOrder({ status: OrderStatus.PENDING_APPROVAL });

      const tx = (await import('@/lib/db')).prisma as unknown as TxClient;
      await expect(submitOrder(tx, sales1Ctx, ord.id)).rejects.toThrow(
        expect.objectContaining({
          code: 'INVOICE_ALREADY_PENDING',
          status: 409,
        })
      );
    });

    it('menolak jika order tidak memiliki baris produk dengan 422 EMPTY_ITEMS', async () => {
      const ord = createTestOrder();
      // Kosongkan item
      orderItems = orderItems.filter((i) => i.orderId !== ord.id);

      const tx = (await import('@/lib/db')).prisma as unknown as TxClient;
      await expect(submitOrder(tx, sales1Ctx, ord.id)).rejects.toThrow(
        expect.objectContaining({
          code: 'EMPTY_ITEMS',
          status: 422,
        })
      );
    });

    it('menolak jika terdapat produk duplikat dengan 422 DUPLICATE_PRODUCT', async () => {
      const ord = createTestOrder();
      // Tambah item dengan productId sama
      orderItems.push({
        id: `item_dup`,
        businessId: BIZ_ID,
        orderId: ord.id,
        productId: 'prod_1', // duplikat
        productName: 'Nasi Box Komplit 2',
        sku: 'NB-01-2',
        unit: 'porsi',
        qty: 10,
        listPrice: BigInt(50_000),
        unitPrice: BigInt(50_000),
        discountType: DiscountType.AMOUNT,
        discountValue: BigInt(0),
        discountSource: DiscountSource.MANUAL,
        lineSubtotal: BigInt(500_000),
        lineDiscount: BigInt(0),
        lineNet: BigInt(500_000),
        costPrice: BigInt(30_000),
        floorPrice: BigInt(45_000),
        belowMin: false,
        sortOrder: 1,
      });

      const tx = (await import('@/lib/db')).prisma as unknown as TxClient;
      await expect(submitOrder(tx, sales1Ctx, ord.id)).rejects.toThrow(
        expect.objectContaining({
          code: 'DUPLICATE_PRODUCT',
          status: 422,
        })
      );
    });

    it('menolak jika hasBelowMin = true dan alasan < 5 karakter dengan 422 BELOW_MIN_REASON_REQUIRED', async () => {
      const ord = createTestOrder({ hasBelowMin: true, belowMinReason: null });

      const tx = (await import('@/lib/db')).prisma as unknown as TxClient;
      // Tanpa options
      await expect(submitOrder(tx, sales1Ctx, ord.id)).rejects.toThrow(
        expect.objectContaining({
          code: 'BELOW_MIN_REASON_REQUIRED',
          status: 422,
        })
      );

      // Alasan kurang dari 5 karakter
      await expect(
        submitOrder(tx, sales1Ctx, ord.id, { belowMinReason: 'abc' })
      ).rejects.toThrow(
        expect.objectContaining({
          code: 'BELOW_MIN_REASON_REQUIRED',
          status: 422,
        })
      );
    });

    it('berhasil jika hasBelowMin = true dan alasan >= 5 karakter', async () => {
      const ord = createTestOrder({ hasBelowMin: true, belowMinReason: null });

      const tx = (await import('@/lib/db')).prisma as unknown as TxClient;
      const res = await submitOrder(tx, sales1Ctx, ord.id, {
        belowMinReason: 'Diskon perkenalan outlet baru',
      });

      expect(res.order.status).toBe(OrderStatus.PENDING_APPROVAL);
      expect(res.order.belowMinReason).toBe('Diskon perkenalan outlet baru');
    });

    it('menolak Sales lain mengajukan order yang bukan miliknya dengan 403 FORBIDDEN', async () => {
      const ord = createTestOrder({ salesId: 'usr_sales_1' });

      const tx = (await import('@/lib/db')).prisma as unknown as TxClient;
      await expect(submitOrder(tx, sales2Ctx, ord.id)).rejects.toThrow(
        expect.objectContaining({
          code: 'FORBIDDEN',
          status: 403,
        })
      );
    });

    it('Super Admin dapat mengajukan order milik siapa pun', async () => {
      const ord = createTestOrder({ salesId: 'usr_sales_1' });

      const tx = (await import('@/lib/db')).prisma as unknown as TxClient;
      const res = await submitOrder(tx, superAdminCtx, ord.id);
      expect(res.order.status).toBe(OrderStatus.PENDING_APPROVAL);
    });
  });

  describe('2. orderService.withdraw', () => {
    it('berhasil menarik kembali pengajuan: status kembali DRAFT & invoice menjadi WITHDRAWN', async () => {
      const ord = createTestOrder({ status: OrderStatus.DRAFT });
      const tx = (await import('@/lib/db')).prisma as unknown as TxClient;

      // Submit terlebih dahulu
      await submitOrder(tx, sales1Ctx, ord.id);
      expect(orders.find((o) => o.id === ord.id)?.status).toBe(OrderStatus.PENDING_APPROVAL);

      // Lakukan withdraw
      const withdrawRes = await withdrawOrder(tx, sales1Ctx, ord.id);
      expect(withdrawRes.order.status).toBe(OrderStatus.DRAFT);
      expect(withdrawRes.order.rev).toBe(2);

      // Verifikasi invoice berstatus WITHDRAWN
      const inv = invoices.find((i) => i.id === withdrawRes.withdrawnInvoiceId);
      expect(inv).toBeDefined();
      expect(inv?.status).toBe(InvoiceStatus.WITHDRAWN);

      // Verifikasi audit log
      const audit = auditLogs.find((a) => a.entityId === ord.id && a.action === 'ORDER_WITHDRAW');
      expect(audit).toBeDefined();
    });

    it('menolak withdraw jika status order bukan PENDING_APPROVAL dengan 409 INVALID_STATE', async () => {
      const ord = createTestOrder({ status: OrderStatus.DRAFT });
      const tx = (await import('@/lib/db')).prisma as unknown as TxClient;

      await expect(withdrawOrder(tx, sales1Ctx, ord.id)).rejects.toThrow(
        expect.objectContaining({
          code: 'INVALID_STATE',
          status: 409,
        })
      );
    });

    it('menolak Sales lain menarik pengajuan order milik sales lain dengan 403 FORBIDDEN', async () => {
      const ord = createTestOrder({ salesId: 'usr_sales_1' });
      const tx = (await import('@/lib/db')).prisma as unknown as TxClient;

      await submitOrder(tx, sales1Ctx, ord.id);

      await expect(withdrawOrder(tx, sales2Ctx, ord.id)).rejects.toThrow(
        expect.objectContaining({
          code: 'FORBIDDEN',
          status: 403,
        })
      );
    });

    it('pengajuan ulang setelah withdraw menghasilkan invoice baru dengan version = 2', async () => {
      const ord = createTestOrder({ status: OrderStatus.DRAFT });
      const tx = (await import('@/lib/db')).prisma as unknown as TxClient;

      // Submit 1 -> Invoice v1
      const sub1 = await submitOrder(tx, sales1Ctx, ord.id);
      expect(sub1.invoice.version).toBe(1);

      // Withdraw
      await withdrawOrder(tx, sales1Ctx, ord.id);

      // Submit 2 -> Invoice v2
      const sub2 = await submitOrder(tx, sales1Ctx, ord.id);
      expect(sub2.invoice.version).toBe(2);

      // Kedua invoice tercatat di database
      const orderInvoices = invoices.filter((i) => i.orderId === ord.id);
      expect(orderInvoices.length).toBe(2);
      expect(orderInvoices[0].status).toBe(InvoiceStatus.WITHDRAWN);
      expect(orderInvoices[0].version).toBe(1);
      expect(orderInvoices[1].status).toBe(InvoiceStatus.PENDING_APPROVAL);
      expect(orderInvoices[1].version).toBe(2);
    });
  });

  describe('3. GET /api/v1/approvals (Antrean Persetujuan Super Admin)', () => {
    it('mengembalikan antrean pending orders dengan profit simulation & pending invoice (FIFO)', async () => {
      // Buat 2 order pending
      const ord1 = createTestOrder({
        id: 'ord_1',
        orderNo: 'ORD-001',
        status: OrderStatus.PENDING_APPROVAL,
        createdAt: new Date('2026-11-08T08:00:00Z'),
      });
      const ord2 = createTestOrder({
        id: 'ord_2',
        orderNo: 'ORD-002',
        status: OrderStatus.PENDING_APPROVAL,
        hasBelowMin: true,
        belowMinReason: 'Diskon khusus rekanan',
        createdAt: new Date('2026-11-08T09:00:00Z'),
      });

      invoices.push({
        id: 'inv_1',
        businessId: BIZ_ID,
        orderId: ord1.id,
        customerId: 'cust_1',
        type: InvoiceType.DP,
        status: InvoiceStatus.PENDING_APPROVAL,
        version: 1,
        amount: BigInt(315_000),
        requestedById: 'usr_sales_1',
        requestedAt: new Date(),
        approvedById: null,
        approvedAt: null,
        rejectedById: null,
        rejectedAt: null,
        rejectReason: null,
        paidAt: null,
        receiptNumber: null,
        deletedAt: null,
      });

      invoices.push({
        id: 'inv_2',
        businessId: BIZ_ID,
        orderId: ord2.id,
        customerId: 'cust_1',
        type: InvoiceType.FINAL,
        status: InvoiceStatus.PENDING_APPROVAL,
        version: 1,
        amount: BigInt(1_050_000),
        requestedById: 'usr_sales_1',
        requestedAt: new Date(),
        approvedById: null,
        approvedAt: null,
        rejectedById: null,
        rejectedAt: null,
        rejectReason: null,
        paidAt: null,
        receiptNumber: null,
        deletedAt: null,
      });

      const req = new NextRequest('http://localhost:3000/api/v1/approvals');
      const res = await getApprovalsHandler(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.data.items.length).toBe(2);
      expect(json.data.summary.totalPending).toBe(2);
      expect(json.data.summary.totalBelowMin).toBe(1);

      // FIFO check: ord1 first
      expect(json.data.items[0].id).toBe('ord_1');
      expect(json.data.items[0].pendingInvoice?.type).toBe(InvoiceType.DP);
      expect(json.data.items[0].profit).toBeDefined();
      expect(json.data.items[0].sales?.name).toBe('Sales Lapangan 1');

      expect(json.data.items[1].id).toBe('ord_2');
      expect(json.data.items[1].hasBelowMin).toBe(true);
    });

    it('mendukung filter hasBelowMin=true', async () => {
      createTestOrder({
        id: 'ord_normal',
        status: OrderStatus.PENDING_APPROVAL,
        hasBelowMin: false,
      });
      createTestOrder({
        id: 'ord_below',
        status: OrderStatus.PENDING_APPROVAL,
        hasBelowMin: true,
      });

      const req = new NextRequest('http://localhost:3000/api/v1/approvals?hasBelowMin=true');
      const res = await getApprovalsHandler(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.data.items.length).toBe(1);
      expect(json.data.items[0].id).toBe('ord_below');
    });

    it('mendukung filter pencarian nomor order', async () => {
      createTestOrder({
        id: 'ord_a',
        orderNo: 'ORD-ALPHA-99',
        status: OrderStatus.PENDING_APPROVAL,
      });
      createTestOrder({
        id: 'ord_b',
        orderNo: 'ORD-BETA-77',
        status: OrderStatus.PENDING_APPROVAL,
      });

      const req = new NextRequest('http://localhost:3000/api/v1/approvals?search=ALPHA');
      const res = await getApprovalsHandler(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.data.items.length).toBe(1);
      expect(json.data.items[0].id).toBe('ord_a');
    });
  });

  describe('4. Endpoint Routes (Submit & Withdraw via HTTP Handler)', () => {
    it('POST /api/v1/orders/:id/submit melalui NextRequest berhasil', async () => {
      const ord = createTestOrder({ status: OrderStatus.DRAFT });

      const req = new NextRequest(`http://localhost:3000/api/v1/orders/${ord.id}/submit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          origin: 'http://localhost:3000',
        },
        body: JSON.stringify({}),
      });

      const res = await submitOrderHandler(req, { params: Promise.resolve({ id: ord.id }) });
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.data.order.status).toBe(OrderStatus.PENDING_APPROVAL);
      expect(json.data.invoice.status).toBe(InvoiceStatus.PENDING_APPROVAL);
    });

    it('POST /api/v1/orders/:id/withdraw melalui NextRequest berhasil', async () => {
      const ord = createTestOrder({ status: OrderStatus.DRAFT });
      const tx = (await import('@/lib/db')).prisma as unknown as TxClient;
      await submitOrder(tx, superAdminCtx, ord.id);

      const req = new NextRequest(`http://localhost:3000/api/v1/orders/${ord.id}/withdraw`, {
        method: 'POST',
        headers: {
          origin: 'http://localhost:3000',
        },
      });

      const res = await withdrawOrderHandler(req, { params: Promise.resolve({ id: ord.id }) });
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.data.order.status).toBe(OrderStatus.DRAFT);
      expect(json.data.withdrawnInvoiceId).toBeDefined();
    });
  });
});
