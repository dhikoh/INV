import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import {
  Role,
  OrderStatus,
  InvoiceStatus,
  InvoiceType,
  PaymentStatus,
  PaymentMethod,
  ShipStatus,
} from '@prisma/client';
import {
  GET as getCollectiveInvoicesHandler,
  POST as createCollectivePaymentHandler,
} from '@/app/api/v1/payments/collective/route';
import { GET as getPaymentsQueueHandler } from '@/app/api/v1/payments/route';
import { POST as verifyPaymentHandler } from '@/app/api/v1/payments/[id]/verify/route';
import { POST as rejectPaymentHandler } from '@/app/api/v1/payments/[id]/reject/route';
import { POST as voidPaymentHandler } from '@/app/api/v1/payments/[id]/void/route';
import { GET as getCustomerTransactionPricesHandler } from '@/app/api/v1/customers/[id]/transaction-prices/route';
import * as contextModule from '@/lib/auth/context';
import type { Ctx } from '@/lib/auth/context';
import { assertNoSecretKeys } from '../helpers/leak';
import { buildWhere, TABLES } from '@/lib/transfer/registry';

vi.mock('@/lib/services/reminder', () => ({
  updateRemindersForCompletedOrder: vi.fn(async () => {}),
}));

interface MockCustomer {
  id: string;
  businessId: string;
  code?: string;
  name?: string;
  assignedSalesId?: string | null;
  deletedAt: Date | null;
}

interface MockOrder {
  id: string;
  businessId: string;
  customerId: string;
  salesId?: string | null;
  status: OrderStatus;
  version?: number;
  dpAmount?: bigint;
  grandTotal: bigint;
  paidTotal: bigint;
  creditTotal: bigint;
  rev: number;
  orderDate?: Date;
  createdAt?: Date;
  deletedAt: Date | null;
  orderNo?: string;
}

interface MockOrderItem {
  id: string;
  orderId: string;
  productId?: string;
  sku?: string;
  productName?: string;
  unit?: string;
  qty?: number;
  listPrice?: bigint;
  unitPrice?: bigint;
  discountType?: string;
  discountSource?: string;
  lineDiscount?: bigint;
  lineNet?: bigint;
  lineTotal?: bigint;
  costPrice?: bigint;
}

interface MockInvoice {
  id: string;
  businessId: string;
  orderId: string;
  number?: string | null;
  invoiceNo?: string;
  type: InvoiceType;
  status: InvoiceStatus;
  amount: bigint;
  paidAmount: bigint;
  deletedAt: Date | null;
  dueDate?: Date | null;
}

interface MockPayment {
  id: string;
  businessId: string;
  orderId: string;
  invoiceId: string | null;
  batchId?: string | null;
  status: PaymentStatus;
  method?: PaymentMethod;
  amount: bigint;
  createdAt?: Date;
  updatedAt?: Date;
  [key: string]: unknown;
}

interface MockPaymentBatch {
  id: string;
  businessId: string;
  customerId?: string;
  totalAmount?: bigint;
  status?: PaymentStatus;
  createdAt?: Date;
  updatedAt?: Date;
  [key: string]: unknown;
}

interface MockPaymentAllocation {
  id: string;
  batchId: string;
  paymentId?: string;
  invoiceId?: string;
  orderId?: string;
  amount?: bigint;
  createdAt?: Date;
  [key: string]: unknown;
}

interface MockCreditEntry {
  id: string;
  businessId: string;
  customerId: string;
  amount?: bigint;
  createdAt?: Date;
  [key: string]: unknown;
}

interface MockShipment {
  id: string;
  businessId: string;
  orderId: string;
  status?: ShipStatus;
}

type WhereArg<T = Record<string, unknown>> = { where?: T };
type UpdateArg<W = Record<string, unknown>, D = Record<string, unknown>> = {
  where?: W;
  data: D;
};
type CreateArg<D = Record<string, unknown>> = { data: D };

const db = vi.hoisted(() => ({
  businesses: [
    {
      id: 'biz_p5',
      code: 'BC',
      name: 'BentoCat',
      allowSalesCashPayment: false,
      requireTransferProofForSales: true,
    },
  ],
  users: [
    { id: 'sa_1', role: 'SUPERADMIN' as Role, name: 'Super Admin', isActive: true },
    { id: 'sales_1', role: 'SALES' as Role, name: 'Andi Sales', isActive: true },
    { id: 'sales_2', role: 'SALES' as Role, name: 'Budi Sales', isActive: true },
  ],
  customers: [] as MockCustomer[],
  orders: [] as MockOrder[],
  orderItems: [] as MockOrderItem[],
  invoices: [] as MockInvoice[],
  payments: [] as MockPayment[],
  paymentBatches: [] as MockPaymentBatch[],
  paymentAllocations: [] as MockPaymentAllocation[],
  creditEntries: [] as MockCreditEntry[],
  shipments: [] as MockShipment[],
  auditLogs: [] as Record<string, unknown>[],
  notifications: [] as Record<string, unknown>[],
}));

let idSeq = 1;
function nextId(prefix: string) {
  return `${prefix}_${idSeq++}`;
}

vi.mock('@/lib/db', () => {
  function attachBatch(batch: MockPaymentBatch) {
    return {
      ...batch,
      allocations: db.paymentAllocations.filter((a) => a.batchId === batch.id),
      payments: db.payments.filter((p) => p.batchId === batch.id),
    };
  }

  interface MockPrismaClient {
    $transaction: <T>(cb: (tx: MockPrismaClient) => Promise<T>) => Promise<T>;
    $queryRaw: ReturnType<typeof vi.fn>;
    business: Record<string, ReturnType<typeof vi.fn>>;
    customer: Record<string, ReturnType<typeof vi.fn>>;
    user: Record<string, ReturnType<typeof vi.fn>>;
    order: Record<string, ReturnType<typeof vi.fn>>;
    invoice: Record<string, ReturnType<typeof vi.fn>>;
    payment: Record<string, ReturnType<typeof vi.fn>>;
    paymentBatch: Record<string, ReturnType<typeof vi.fn>>;
    paymentAllocation: Record<string, ReturnType<typeof vi.fn>>;
    customerCreditEntry: Record<string, ReturnType<typeof vi.fn>>;
    shipment: Record<string, ReturnType<typeof vi.fn>>;
    creditNote: Record<string, ReturnType<typeof vi.fn>>;
    orderRevision: Record<string, ReturnType<typeof vi.fn>>;
    auditLog: Record<string, ReturnType<typeof vi.fn>>;
    notification: Record<string, ReturnType<typeof vi.fn>>;
  }

  const client: MockPrismaClient = {
    $transaction: async <T>(cb: (tx: MockPrismaClient) => Promise<T>) => cb(client),
    $queryRaw: vi.fn(async () => [{ id: 'locked' }]),
    business: {
      findFirst: vi.fn(async ({ where }: WhereArg<{ id?: string }>) =>
        db.businesses.find((b) => !where?.id || b.id === where.id) ?? null
      ),
      findUnique: vi.fn(async ({ where }: WhereArg<{ id?: string }>) =>
        db.businesses.find((b) => !where?.id || b.id === where.id) ?? null
      ),
    },
    customer: {
      findFirst: vi.fn(
        async ({
          where,
        }: WhereArg<{
          id?: string;
          businessId?: string;
          assignedSalesId?: string;
          deletedAt?: Date | null;
        }>) => {
          return (
            db.customers.find((c) => {
              if (where?.id && c.id !== where.id) return false;
              if (where?.businessId && c.businessId !== where.businessId) return false;
              if (where?.assignedSalesId && c.assignedSalesId !== where.assignedSalesId)
                return false;
              if (where?.deletedAt === null && c.deletedAt !== null) return false;
              return true;
            }) ?? null
          );
        }
      ),
    },
    user: {
      findMany: vi.fn(
        async ({
          where,
        }: WhereArg<{
          role?: Role;
          isActive?: boolean;
          id?: { in?: string[] };
        }>) =>
          db.users.filter((u) => {
            if (where?.role && u.role !== where.role) return false;
            if (where?.isActive !== undefined && u.isActive !== where.isActive) return false;
            if (where?.id?.in && !where.id.in.includes(u.id)) return false;
            return true;
          })
      ),
      findFirst: vi.fn(async ({ where }: WhereArg<{ id?: string }>) =>
        db.users.find((u) => !where?.id || u.id === where.id) ?? null
      ),
      findUnique: vi.fn(async ({ where }: WhereArg<{ id?: string }>) =>
        db.users.find((u) => !where?.id || u.id === where.id) ?? null
      ),
    },
    order: {
      findFirst: vi.fn(
        async ({
          where,
        }: WhereArg<{
          id?: string;
          businessId?: string;
          deletedAt?: Date | null;
        }>) => {
          const ord =
            db.orders.find((o) => {
              if (where?.id && o.id !== where.id) return false;
              if (where?.businessId && o.businessId !== where.businessId) return false;
              if (where?.deletedAt === null && o.deletedAt !== null) return false;
              return true;
            }) ?? null;
          if (!ord) return null;
          return {
            ...ord,
            items: db.orderItems.filter((oi) => oi.orderId === ord.id),
          };
        }
      ),
      findFirstOrThrow: vi.fn(
        async ({ where }: WhereArg<{ id?: string; businessId?: string }>) => {
          const ord = db.orders.find((o) => {
            if (where?.id && o.id !== where.id) return false;
            if (where?.businessId && o.businessId !== where.businessId) return false;
            return true;
          });
          if (!ord) throw new Error('Order not found');
          return {
            ...ord,
            items: db.orderItems.filter((oi) => oi.orderId === ord.id),
          };
        }
      ),
      findMany: vi.fn(
        async ({
          where,
        }: WhereArg<{
          businessId?: string;
          customerId?: string;
          salesId?: string;
          id?: { in?: string[] };
          status?: { in?: OrderStatus[]; notIn?: OrderStatus[] };
          deletedAt?: Date | null;
        }>) => {
          return db.orders
            .filter((o) => {
              if (where?.businessId && o.businessId !== where.businessId) return false;
              if (where?.customerId && o.customerId !== where.customerId) return false;
              if (where?.salesId && o.salesId !== where.salesId) return false;
              if (where?.id?.in && !where.id.in.includes(o.id)) return false;
              if (where?.status?.notIn && where.status.notIn.includes(o.status)) return false;
              if (where?.status?.in && !where.status.in.includes(o.status)) return false;
              if (where?.deletedAt === null && o.deletedAt !== null) return false;
              return true;
            })
            .map((o) => ({
              ...o,
              items: db.orderItems.filter((oi) => oi.orderId === o.id),
            }));
        }
      ),
      updateMany: vi.fn(
        async ({
          where,
          data,
        }: UpdateArg<
          { id?: string; businessId?: string },
          {
            status?: OrderStatus;
            paidTotal?: bigint;
            creditTotal?: bigint;
            rev?: { increment?: number };
          }
        >) => {
          let count = 0;
          for (const o of db.orders) {
            if (where?.id && o.id !== where.id) continue;
            if (where?.businessId && o.businessId !== where.businessId) continue;
            if (data.status !== undefined) o.status = data.status;
            if (data.paidTotal !== undefined) o.paidTotal = data.paidTotal;
            if (data.creditTotal !== undefined) o.creditTotal = data.creditTotal;
            if (data.rev?.increment) o.rev += data.rev.increment;
            count++;
          }
          return { count };
        }
      ),
      update: vi.fn(
        async ({
          where,
          data,
        }: UpdateArg<
          { id: string },
          { status?: OrderStatus; paidTotal?: bigint; rev?: { increment?: number } }
        >) => {
          const o = db.orders.find((item) => item.id === where?.id);
          if (!o) throw new Error('Order not found');
          if (data.status !== undefined) o.status = data.status;
          if (data.paidTotal !== undefined) o.paidTotal = data.paidTotal;
          if (data.rev?.increment) o.rev += data.rev.increment;
          return o;
        }
      ),
    },
    invoice: {
      findFirst: vi.fn(
        async ({
          where,
        }: WhereArg<{
          id?: string;
          businessId?: string;
          orderId?: string;
          deletedAt?: Date | null;
        }>) => {
          return (
            db.invoices.find((inv) => {
              if (where?.id && inv.id !== where.id) return false;
              if (where?.businessId && inv.businessId !== where.businessId) return false;
              if (where?.orderId && inv.orderId !== where.orderId) return false;
              if (where?.deletedAt === null && inv.deletedAt !== null) return false;
              return true;
            }) ?? null
          );
        }
      ),
      findMany: vi.fn(
        async ({
          where,
        }: WhereArg<{
          businessId?: string;
          orderId?: string | { in?: string[] };
          id?: { in?: string[] };
          status?: InvoiceStatus | { in?: InvoiceStatus[] };
          deletedAt?: Date | null;
          order?: {
            customerId?: string;
            salesId?: string;
            status?: { notIn?: OrderStatus[] };
          };
        }>) => {
          return db.invoices
            .filter((inv) => {
              if (where?.businessId && inv.businessId !== where.businessId) return false;
              if (typeof where?.orderId === 'string' && inv.orderId !== where.orderId)
                return false;
              if (
                typeof where?.orderId === 'object' &&
                where.orderId?.in &&
                !where.orderId.in.includes(inv.orderId)
              )
                return false;
              if (where?.id?.in && !where.id.in.includes(inv.id)) return false;
              if (typeof where?.status === 'string' && inv.status !== where.status)
                return false;
              if (
                typeof where?.status === 'object' &&
                where.status?.in &&
                !where.status.in.includes(inv.status)
              )
                return false;
              if (where?.deletedAt === null && inv.deletedAt !== null) return false;
              if (where?.order) {
                const ord = db.orders.find((o) => o.id === inv.orderId);
                if (!ord || ord.deletedAt !== null) return false;
                if (where.order.customerId && ord.customerId !== where.order.customerId)
                  return false;
                if (where.order.salesId && ord.salesId !== where.order.salesId) return false;
                if (where.order.status?.notIn && where.order.status.notIn.includes(ord.status))
                  return false;
              }
              return true;
            })
            .map((inv) => ({
              ...inv,
              order: db.orders.find((o) => o.id === inv.orderId) ?? null,
            }));
        }
      ),
      updateMany: vi.fn(
        async ({
          where,
          data,
        }: UpdateArg<{ id?: string; businessId?: string }, { paidAmount?: bigint }>) => {
          let count = 0;
          for (const inv of db.invoices) {
            if (where?.id && inv.id !== where.id) continue;
            if (where?.businessId && inv.businessId !== where.businessId) continue;
            if (data.paidAmount !== undefined) inv.paidAmount = data.paidAmount;
            count++;
          }
          return { count };
        }
      ),
      update: vi.fn(async ({ where, data }: UpdateArg<{ id: string }, { paidAmount?: bigint }>) => {
        const inv = db.invoices.find((i) => i.id === where?.id);
        if (!inv) throw new Error('Invoice not found');
        if (data.paidAmount !== undefined) inv.paidAmount = data.paidAmount;
        return inv;
      }),
    },
    payment: {
      findFirst: vi.fn(
        async ({
          where,
        }: WhereArg<{
          id?: string;
          businessId?: string;
          orderId?: string;
          invoiceId?: string;
          status?: PaymentStatus;
        }>) => {
          return (
            db.payments.find((p) => {
              if (where?.id && p.id !== where.id) return false;
              if (where?.businessId && p.businessId !== where.businessId) return false;
              if (where?.orderId && p.orderId !== where.orderId) return false;
              if (where?.invoiceId && p.invoiceId !== where.invoiceId) return false;
              if (where?.status && p.status !== where.status) return false;
              return true;
            }) ?? null
          );
        }
      ),
      findFirstOrThrow: vi.fn(
        async ({
          where,
        }: WhereArg<{
          id?: string;
          businessId?: string;
          orderId?: string;
          status?: PaymentStatus;
        }>) => {
          const found = db.payments.find((p) => {
            if (where?.id && p.id !== where.id) return false;
            if (where?.businessId && p.businessId !== where.businessId) return false;
            if (where?.orderId && p.orderId !== where.orderId) return false;
            if (where?.status && p.status !== where.status) return false;
            return true;
          });
          if (!found) throw new Error('Payment not found');
          return found;
        }
      ),
      findMany: vi.fn(
        async ({
          where,
        }: WhereArg<{
          businessId?: string;
          orderId?: string | { in?: string[] };
          invoiceId?: string;
          batchId?: string;
          status?: PaymentStatus | { in?: PaymentStatus[] };
        }>) => {
          return db.payments.filter((p) => {
            if (where?.businessId && p.businessId !== where.businessId) return false;
            if (typeof where?.orderId === 'string' && p.orderId !== where.orderId)
              return false;
            if (
              typeof where?.orderId === 'object' &&
              where.orderId?.in &&
              !where.orderId.in.includes(p.orderId)
            )
              return false;
            if (typeof where?.invoiceId === 'string' && p.invoiceId !== where.invoiceId)
              return false;
            if (typeof where?.batchId === 'string' && p.batchId !== where.batchId)
              return false;
            if (typeof where?.status === 'string' && p.status !== where.status)
              return false;
            if (
              typeof where?.status === 'object' &&
              where.status?.in &&
              !where.status.in.includes(p.status)
            )
              return false;
            return true;
          });
        }
      ),
      create: vi.fn(async ({ data }: CreateArg<Omit<MockPayment, 'id'>>) => {
        const row = {
          ...data,
          id: nextId('pay'),
          createdAt: new Date(),
          updatedAt: new Date(),
        } as MockPayment;
        db.payments.push(row);
        return row;
      }),
      updateMany: vi.fn(
        async ({
          where,
          data,
        }: UpdateArg<{ id?: string; batchId?: string; businessId?: string }, Partial<MockPayment>>) => {
          let count = 0;
          for (const p of db.payments) {
            if (where?.id && p.id !== where.id) continue;
            if (where?.batchId && p.batchId !== where.batchId) continue;
            if (where?.businessId && p.businessId !== where.businessId) continue;
            Object.assign(p, data, { updatedAt: new Date() });
            count++;
          }
          return { count };
        }
      ),
    },
    paymentBatch: {
      findFirst: vi.fn(async ({ where }: WhereArg<{ id?: string; businessId?: string }>) => {
        const batch = db.paymentBatches.find((b) => {
          if (where?.id && b.id !== where.id) return false;
          if (where?.businessId && b.businessId !== where.businessId) return false;
          return true;
        });
        return batch ? attachBatch(batch) : null;
      }),
      findFirstOrThrow: vi.fn(
        async ({ where }: WhereArg<{ id?: string; businessId?: string }>) => {
          const batch = db.paymentBatches.find((b) => {
            if (where?.id && b.id !== where.id) return false;
            if (where?.businessId && b.businessId !== where.businessId) return false;
            return true;
          });
          if (!batch) throw new Error('PaymentBatch not found');
          return attachBatch(batch);
        }
      ),
      findMany: vi.fn(
        async ({ where }: WhereArg<{ businessId?: string; id?: { in?: string[] } }>) => {
          return db.paymentBatches
            .filter((b) => {
              if (where?.businessId && b.businessId !== where.businessId) return false;
              if (where?.id?.in && !where.id.in.includes(b.id)) return false;
              return true;
            })
            .map(attachBatch);
        }
      ),
      create: vi.fn(async ({ data }: CreateArg<Omit<MockPaymentBatch, 'id'>>) => {
        const row = {
          ...data,
          id: nextId('batch'),
          createdAt: new Date(),
          updatedAt: new Date(),
        } as MockPaymentBatch;
        db.paymentBatches.push(row);
        return row;
      }),
      updateMany: vi.fn(
        async ({
          where,
          data,
        }: UpdateArg<{ id?: string; businessId?: string }, Partial<MockPaymentBatch>>) => {
          let count = 0;
          for (const b of db.paymentBatches) {
            if (where?.id && b.id !== where.id) continue;
            if (where?.businessId && b.businessId !== where.businessId) continue;
            Object.assign(b, data, { updatedAt: new Date() });
            count++;
          }
          return { count };
        }
      ),
    },
    paymentAllocation: {
      create: vi.fn(async ({ data }: CreateArg<Omit<MockPaymentAllocation, 'id'>>) => {
        const row = {
          ...data,
          id: nextId('alloc'),
          createdAt: new Date(),
        } as MockPaymentAllocation;
        db.paymentAllocations.push(row);
        return row;
      }),
    },
    customerCreditEntry: {
      findMany: vi.fn(
        async ({ where }: WhereArg<{ businessId?: string; customerId?: string }>) =>
          db.creditEntries.filter((e) => {
            if (where?.businessId && e.businessId !== where.businessId) return false;
            if (where?.customerId && e.customerId !== where.customerId) return false;
            return true;
          })
      ),
      create: vi.fn(async ({ data }: CreateArg<Omit<MockCreditEntry, 'id'>>) => {
        const row = {
          ...data,
          id: nextId('cred'),
          createdAt: new Date(),
        } as MockCreditEntry;
        db.creditEntries.push(row);
        return row;
      }),
    },
    shipment: {
      findFirst: vi.fn(async ({ where }: WhereArg<{ orderId?: string }>) =>
        db.shipments.find((s) => s.orderId === where?.orderId) ?? null
      ),
      findMany: vi.fn(async ({ where }: WhereArg<{ orderId?: string; businessId?: string }>) =>
        db.shipments
          .filter((s) => {
            if (where?.orderId && s.orderId !== where.orderId) return false;
            if (where?.businessId && s.businessId !== where.businessId) return false;
            return true;
          })
          .map((s) => ({ ...s, items: [] }))
      ),
    },
    creditNote: {
      findMany: vi.fn(async () => []),
    },
    orderRevision: {
      findFirst: vi.fn(async () => null),
    },
    auditLog: {
      create: vi.fn(async ({ data }: CreateArg<Record<string, unknown>>) => {
        const row = { id: nextId('audit'), ...data };
        db.auditLogs.push(row);
        return row;
      }),
    },
    notification: {
      create: vi.fn(async ({ data }: CreateArg<Record<string, unknown>>) => {
        const row = { id: nextId('notif'), ...data };
        db.notifications.push(row);
        return row;
      }),
    },
  };
  return { prisma: client };
});

function setAuth(role: Role, userId: string) {
  const ctx: Ctx = {
    user: {
      id: userId,
      name: role === Role.SUPERADMIN ? 'Super Admin' : 'Andi Sales',
      role,
      businessId: 'biz_p5',
    },
    role,
    businessId: 'biz_p5',
    sessionId: `sess_${userId}`,
    ip: '127.0.0.1',
  };
  vi.spyOn(contextModule, 'requireContext').mockImplementation(
    async (_req, roles?: Role[]) => {
      if (roles && roles.length > 0 && !roles.includes(ctx.role)) {
        throw new Error('FORBIDDEN');
      }
      return ctx;
    }
  );
  vi.spyOn(contextModule, 'requireBusiness').mockReturnValue('biz_p5');
}

function makeReq(url: string, method: string, body?: unknown) {
  const fullUrl = url.replace('http://localhost/', 'http://localhost:3000/');
  return new NextRequest(fullUrl, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Origin: 'http://localhost:3000',
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

describe('Fase 5 Integration Tests — Pembayaran Kolektif, Kredit Kelebihan, Void Guard, Backup Registry, & Riwayat Harga', () => {
  beforeEach(() => {
    idSeq = 1;
    db.customers = [
      {
        id: 'cust_1',
        businessId: 'biz_p5',
        code: 'C001',
        name: 'Petshop Harmoni',
        assignedSalesId: 'sales_1',
        deletedAt: null,
      },
    ];
    db.orders = [
      {
        id: 'ord_1',
        businessId: 'biz_p5',
        customerId: 'cust_1',
        salesId: 'sales_1',
        orderNo: 'SO-001',
        orderDate: new Date('2026-11-01T10:00:00Z'),
        createdAt: new Date('2026-11-01T10:00:00Z'),
        status: OrderStatus.AWAITING_DP,
        version: 1,
        rev: 1,
        grandTotal: BigInt(1_000_000),
        dpAmount: BigInt(300_000),
        paidTotal: BigInt(0),
        creditTotal: BigInt(0),
        deletedAt: null,
      },
      {
        id: 'ord_2',
        businessId: 'biz_p5',
        customerId: 'cust_1',
        salesId: 'sales_1',
        orderNo: 'SO-002',
        orderDate: new Date('2026-11-05T10:00:00Z'),
        createdAt: new Date('2026-11-05T10:00:00Z'),
        status: OrderStatus.AWAITING_FINAL_PAYMENT,
        version: 1,
        rev: 1,
        grandTotal: BigInt(500_000),
        dpAmount: BigInt(0),
        paidTotal: BigInt(0),
        creditTotal: BigInt(0),
        deletedAt: null,
      },
    ];
    db.orderItems = [
      {
        id: 'oi_1',
        orderId: 'ord_1',
        productId: 'prod_1',
        sku: 'BC-SLM',
        productName: 'BentoCat Salmon 10kg',
        unit: 'Zak',
        qty: 10,
        listPrice: BigInt(100_000),
        unitPrice: BigInt(100_000),
        discountType: 'NONE',
        discountSource: 'NONE',
        lineDiscount: BigInt(0),
        lineNet: BigInt(1_000_000),
        costPrice: BigInt(65_000), // Rahasia tidak boleh keluar di transaction-prices
      },
    ];
    db.invoices = [
      {
        id: 'inv_dp',
        businessId: 'biz_p5',
        orderId: 'ord_1',
        type: InvoiceType.DP,
        status: InvoiceStatus.APPROVED,
        number: 'DP-2026-0001',
        amount: BigInt(300_000),
        paidAmount: BigInt(0),
        dueDate: new Date('2026-11-10T00:00:00Z'),
        deletedAt: null,
      },
      {
        id: 'inv_fin',
        businessId: 'biz_p5',
        orderId: 'ord_2',
        type: InvoiceType.FINAL,
        status: InvoiceStatus.APPROVED,
        number: 'INV-2026-0002',
        amount: BigInt(500_000),
        paidAmount: BigInt(0),
        dueDate: new Date('2026-11-15T00:00:00Z'),
        deletedAt: null,
      },
    ];
    db.payments = [];
    db.paymentBatches = [];
    db.paymentAllocations = [];
    db.creditEntries = [];
    db.shipments = [
      {
        id: 'ship_2',
        businessId: 'biz_p5',
        orderId: 'ord_2',
        status: ShipStatus.DELIVERED,
      },
    ];
    db.auditLogs = [];
    db.notifications = [];
  });

  it('menolak overpayment tanpa creditOption=true (422 OVERPAYMENT), lalu memproses & memverifikasi batch + kredit kelebihan dalam 1 klik', async () => {
    setAuth(Role.SALES, 'sales_1');

    // GET list unpaid invoices
    const listRes = await getCollectiveInvoicesHandler(
      makeReq('http://localhost/api/v1/payments/collective?customerId=cust_1', 'GET'),
      { params: Promise.resolve({}) }
    );
    const listJson = await listRes.json();
    expect(listRes.status).toBe(200);
    expect(listJson.data).toHaveLength(2);

    // Reject excess payment when creditOption is false
    const badRes = await createCollectivePaymentHandler(
      makeReq('http://localhost/api/v1/payments/collective', 'POST', {
        customerId: 'cust_1',
        totalPaid: 850_000,
        creditOption: false,
        method: PaymentMethod.TRANSFER,
        paidAt: '2026-11-12T10:00:00Z',
        proofPath: '/uploads/proof-1.png',
        allocations: [
          { invoiceId: 'inv_dp', amount: 300_000 },
          { invoiceId: 'inv_fin', amount: 500_000 },
        ],
      }),
      { params: Promise.resolve({}) }
    );
    expect(badRes.status).toBe(422);
    const badJson = await badRes.json();
    expect(badJson.error.code).toBe('OVERPAYMENT');

    // Submit collective batch with creditOption=true (excess 50_000)
    const okRes = await createCollectivePaymentHandler(
      makeReq('http://localhost/api/v1/payments/collective', 'POST', {
        customerId: 'cust_1',
        totalPaid: 850_000,
        creditOption: true,
        method: PaymentMethod.TRANSFER,
        paidAt: '2026-11-12T10:00:00Z',
        reference: 'TRF-850',
        proofPath: '/uploads/proof-1.png',
        allocations: [
          { invoiceId: 'inv_dp', amount: 300_000 },
          { invoiceId: 'inv_fin', amount: 500_000 },
        ],
      }),
      { params: Promise.resolve({}) }
    );
    expect(okRes.status).toBe(201);
    const okJson = await okRes.json();
    expect(okJson.data.status).toBe(PaymentStatus.PENDING_VERIFICATION);
    expect(okJson.data.creditAmount).toBe(50_000);
    expect(db.payments).toHaveLength(2);
    expect(db.creditEntries).toHaveLength(0);

    // Super Admin sees 1 collapsed batch card in GET /api/v1/payments
    setAuth(Role.SUPERADMIN, 'sa_1');
    const queueRes = await getPaymentsQueueHandler(
      makeReq('http://localhost/api/v1/payments?status=PENDING_VERIFICATION', 'GET'),
      { params: Promise.resolve({}) }
    );
    const queueJson = await queueRes.json();
    expect(queueRes.status).toBe(200);
    expect(queueJson.data).toHaveLength(1);
    expect(queueJson.data[0].isBatch).toBe(true);
    expect(queueJson.data[0].batchCreditAmount).toBe(50_000);
    expect(queueJson.data[0].allocations).toHaveLength(2);

    // 1-click Verify delegates atomically to full batch
    const childPaymentId = queueJson.data[0].id;
    const verifyRes = await verifyPaymentHandler(
      makeReq(`http://localhost/api/v1/payments/${childPaymentId}/verify`, 'POST', {}),
      { params: Promise.resolve({ id: childPaymentId }) }
    );
    expect(verifyRes.status).toBe(200);

    expect(db.paymentBatches[0].status).toBe(PaymentStatus.VERIFIED);
    expect(db.payments.every((p) => p.status === PaymentStatus.VERIFIED)).toBe(true);
    expect(db.orders[0].status).toBe(OrderStatus.IN_PROCESS);
    expect(db.orders[0].paidTotal).toBe(BigInt(300_000));
    expect(db.orders[1].status).toBe(OrderStatus.COMPLETED);
    expect(db.orders[1].paidTotal).toBe(BigInt(500_000));
    expect(db.invoices[0].paidAmount).toBe(BigInt(300_000));
    expect(db.invoices[1].paidAmount).toBe(BigInt(500_000));
    expect(db.creditEntries).toHaveLength(1);
    expect(db.creditEntries[0].amount).toBe(BigInt(50_000));
  });

  it('menolak batch pending secara atomik & memblokir void jika saldo kredit terlanjur terpakai', async () => {
    setAuth(Role.SUPERADMIN, 'sa_1');

    // Create auto-pending batch with 40_000 excess credit
    const createRes = await createCollectivePaymentHandler(
      makeReq('http://localhost/api/v1/payments/collective', 'POST', {
        customerId: 'cust_1',
        totalPaid: 340_000,
        creditOption: true,
        method: PaymentMethod.TRANSFER,
        paidAt: '2026-11-12T10:00:00Z',
        allocations: [{ invoiceId: 'inv_dp', amount: 300_000 }],
      }),
      { params: Promise.resolve({}) }
    );
    expect(createRes.status).toBe(201);
    const pId1 = db.payments[0].id;

    // Verify it -> adds +40_000 credit
    const verifyRes = await verifyPaymentHandler(
      makeReq(`http://localhost/api/v1/payments/${pId1}/verify`, 'POST', {}),
      { params: Promise.resolve({ id: pId1 }) }
    );
    expect(verifyRes.status).toBe(200);
    expect(db.orders[0].status).toBe(OrderStatus.IN_PROCESS);

    // Spend part of customer credit (-15_000 -> remaining 25_000 < batch.creditAmount 40_000)
    db.creditEntries.push({
      id: 'cred_used',
      businessId: 'biz_p5',
      customerId: 'cust_1',
      amount: BigInt(-15_000),
      reason: 'Dipakai ke order lain',
      createdById: 'sa_1',
      createdAt: new Date(),
    });

    // Attempting VOID must return 409 CREDIT_ALREADY_USED
    const blockedVoidRes = await voidPaymentHandler(
      makeReq(`http://localhost/api/v1/payments/${pId1}/void`, 'POST', {
        reason: 'Salah input nominal transfer',
      }),
      { params: Promise.resolve({ id: pId1 }) }
    );
    expect(blockedVoidRes.status).toBe(409);
    const blockedJson = await blockedVoidRes.json();
    expect(blockedJson.error.code).toBe('CREDIT_ALREADY_USED');

    // Refund the spent 15_000 -> balance back to 40_000 -> VOID succeeds atomically
    db.creditEntries.push({
      id: 'cred_restored',
      businessId: 'biz_p5',
      customerId: 'cust_1',
      amount: BigInt(15_000),
      reason: 'Pembalikan kredit',
      createdById: 'sa_1',
      createdAt: new Date(),
    });

    const okVoidRes = await voidPaymentHandler(
      makeReq(`http://localhost/api/v1/payments/${pId1}/void`, 'POST', {
        reason: 'Salah input nominal transfer',
      }),
      { params: Promise.resolve({ id: pId1 }) }
    );
    expect(okVoidRes.status).toBe(200);
    expect(db.paymentBatches[0].status).toBe(PaymentStatus.VOID);
    expect(db.orders[0].status).toBe(OrderStatus.AWAITING_DP);
    expect(db.orders[0].paidTotal).toBe(BigInt(0));
    expect(db.creditEntries[db.creditEntries.length - 1].amount).toBe(BigInt(-40_000));

    // Reject test on new batch
    await createCollectivePaymentHandler(
      makeReq('http://localhost/api/v1/payments/collective', 'POST', {
        customerId: 'cust_1',
        totalPaid: 300_000,
        creditOption: false,
        method: PaymentMethod.TRANSFER,
        paidAt: '2026-11-12T11:00:00Z',
        allocations: [{ invoiceId: 'inv_dp', amount: 300_000 }],
      }),
      { params: Promise.resolve({}) }
    );
    const pendingChildId = db.payments[db.payments.length - 1].id;
    const rejRes = await rejectPaymentHandler(
      makeReq(`http://localhost/api/v1/payments/${pendingChildId}/reject`, 'POST', {
        reason: 'Bukti transfer buram tidak terbaca',
      }),
      { params: Promise.resolve({ id: pendingChildId }) }
    );
    expect(rejRes.status).toBe(200);
    expect(db.paymentBatches[1].status).toBe(PaymentStatus.REJECTED);
  });

  it('memastikan PaymentBatch & PaymentAllocation terdaftar di backup/restore registry serta transaction-prices bebas HPP & terisolasi per Sales', async () => {
    const batchDef = TABLES.find((t) => t.model === 'PaymentBatch');
    const allocDef = TABLES.find((t) => t.model === 'PaymentAllocation');
    expect(batchDef).toBeDefined();
    expect(allocDef).toBeDefined();
    expect(buildWhere(batchDef!, 'business', 'biz_p5')).toEqual({ businessId: 'biz_p5' });
    expect(buildWhere(allocDef!, 'business', 'biz_p5')).toEqual({ batch: { businessId: 'biz_p5' } });

    // Sales 1 gets customer's historical prices with zero HPP/margin leakage
    setAuth(Role.SALES, 'sales_1');
    const salesOk = await getCustomerTransactionPricesHandler(
      makeReq('http://localhost/api/v1/customers/cust_1/transaction-prices', 'GET'),
      { params: Promise.resolve({ id: 'cust_1' }) }
    );
    expect(salesOk.status).toBe(200);
    const salesJson = await salesOk.json();
    expect(salesJson.data).toHaveLength(1);
    expect(salesJson.data[0].effectiveUnitPrice).toBe(100_000);
    assertNoSecretKeys(salesJson, 'http-sales-transaction-prices');

    // Sales 2 (non-assigned) gets 404
    setAuth(Role.SALES, 'sales_2');
    const salesDenied = await getCustomerTransactionPricesHandler(
      makeReq('http://localhost/api/v1/customers/cust_1/transaction-prices', 'GET'),
      { params: Promise.resolve({ id: 'cust_1' }) }
    );
    expect(salesDenied.status).toBe(404);
  });
});
