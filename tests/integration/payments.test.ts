import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import {
  GET as getOrderPaymentsHandler,
  POST as createOrderPaymentHandler,
} from '@/app/api/v1/orders/[id]/payments/route';
import {
  GET as getPaymentsQueueHandler,
  POST as createPaymentHandler,
} from '@/app/api/v1/payments/route';
import { POST as verifyPaymentHandler } from '@/app/api/v1/payments/[id]/verify/route';
import { POST as rejectPaymentHandler } from '@/app/api/v1/payments/[id]/reject/route';
import { POST as voidPaymentHandler } from '@/app/api/v1/payments/[id]/void/route';
import {
  createPayment,
  verifyPayment,
  rejectPayment,
  voidPayment,
  recalculateOrderPayments,
  maybeComplete,
  TxClient,
} from '@/lib/services/payment';
import {
  Role,
  OrderStatus,
  InvoiceStatus,
  InvoiceType,
  PaymentStatus,
  PaymentType,
  PaymentMethod,
  ShipStatus,
} from '@prisma/client';
import { DomainError } from '@/lib/domain/money';
import * as contextModule from '@/lib/auth/context';
import type { Ctx } from '@/lib/auth/context';

interface MockBusiness {
  id: string;
  name: string;
}

interface MockCustomer {
  id: string;
  businessId: string;
  code: string;
  name: string;
  deletedAt: Date | null;
}

interface MockOrder {
  id: string;
  businessId: string;
  customerId: string;
  salesId: string;
  status: OrderStatus;
  version: number;
  rev: number;
  orderNo: string | null;
  grandTotal: bigint;
  dpAmount: bigint;
  paidTotal: bigint;
  creditTotal: bigint;
  deletedAt: Date | null;
}

interface MockInvoice {
  id: string;
  businessId: string;
  orderId: string;
  type: InvoiceType;
  status: InvoiceStatus;
  version: number;
  number: string | null;
  amount: bigint;
  paidAmount: bigint;
  deletedAt: Date | null;
}

interface MockPayment {
  id: string;
  businessId: string;
  orderId: string;
  invoiceId: string | null;
  type: PaymentType;
  method: PaymentMethod;
  status: PaymentStatus;
  amount: bigint;
  paidAt: Date;
  reference: string | null;
  proofPath: string | null;
  notes: string | null;
  createdById: string;
  verifiedById: string | null;
  verifiedAt: Date | null;
  rejectReason: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

interface MockCustomerCreditEntry {
  id: string;
  businessId: string;
  customerId: string;
  amount: bigint;
  reason: string;
  orderId: string | null;
  paymentId: string | null;
  createdById: string;
  createdAt: Date;
}

interface MockShipment {
  id: string;
  businessId: string;
  orderId: string;
  status: ShipStatus;
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
  reason?: string;
}

interface MockNotification {
  id: string;
  businessId: string | null;
  userId: string;
  type: string;
  title: string;
  body: string;
  linkPath: string | null;
  dedupeKey: string;
}

let businesses: MockBusiness[] = [];
let customers: MockCustomer[] = [];
let orders: MockOrder[] = [];
let invoices: MockInvoice[] = [];
let payments: MockPayment[] = [];
let creditEntries: MockCustomerCreditEntry[] = [];
let shipments: MockShipment[] = [];
let auditLogs: MockAuditLog[] = [];
let notifications: MockNotification[] = [];

vi.mock('@/lib/db', () => {
  const mockPrisma = {
    business: {
      findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        return businesses.find((b) => b.id === where.id) || null;
      }),
      findUnique: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        return businesses.find((b) => b.id === where.id) || null;
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
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
        return customers.find((c) => c.id === where.id) || null;
      }),
    },
    user: {
      findMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        return [
          {
            id: 'admin_1',
            role: Role.SUPERADMIN,
            name: 'Super Admin',
            isActive: true,
          },
        ].filter((u) => {
          if (where.role && u.role !== where.role) return false;
          if (where.isActive !== undefined && u.isActive !== where.isActive) return false;
          return true;
        });
      }),
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
        if (where.id === 'sales_1') {
          return { id: 'sales_1', name: 'Sales Andi', role: Role.SALES };
        }
        return { id: 'admin_1', name: 'Super Admin', role: Role.SUPERADMIN };
      }),
    },
    order: {
      findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        return (
          orders.find((o) => {
            if (where.id && o.id !== where.id) return false;
            if (where.businessId && o.businessId !== where.businessId) return false;
            if (where.deletedAt === null && o.deletedAt !== null) return false;
            return true;
          }) || null
        );
      }),
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
        return orders.find((o) => o.id === where.id) || null;
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const idx = orders.findIndex((o) => o.id === where.id);
        if (idx === -1) throw new Error('Order not found');
        const existing = orders[idx];
        const updated = { ...existing };
        for (const [k, v] of Object.entries(data)) {
          if (k === 'rev' && typeof v === 'object' && v && 'increment' in v) {
            updated.rev += 1;
          } else {
            (updated as any)[k] = v;
          }
        }
        orders[idx] = updated;
        return updated;
      }),
      updateMany: vi.fn(async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        let count = 0;
        for (let i = 0; i < orders.length; i++) {
          if (where.id && orders[i].id !== where.id) continue;
          if (where.businessId && orders[i].businessId !== where.businessId) continue;
          const updated = { ...orders[i] };
          for (const [k, v] of Object.entries(data)) {
            if (k === 'rev' && typeof v === 'object' && v && 'increment' in v) {
              updated.rev += 1;
            } else {
              (updated as unknown as Record<string, unknown>)[k] = v;
            }
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
            if (where.status && inv.status !== where.status) return false;
            if (where.deletedAt === null && inv.deletedAt !== null) return false;
            return true;
          }) || null
        );
      }),
      findMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        return invoices.filter((inv) => {
          if (where.orderId && inv.orderId !== where.orderId) return false;
          if (where.businessId && inv.businessId !== where.businessId) return false;
          if (where.deletedAt === null && inv.deletedAt !== null) return false;
          return true;
        });
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const idx = invoices.findIndex((i) => i.id === where.id);
        if (idx === -1) throw new Error('Invoice not found');
        invoices[idx] = { ...invoices[idx], ...data };
        return invoices[idx];
      }),
      updateMany: vi.fn(async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        let count = 0;
        for (let i = 0; i < invoices.length; i++) {
          if (where.id && invoices[i].id !== where.id) continue;
          if (where.businessId && invoices[i].businessId !== where.businessId) continue;
          invoices[i] = { ...invoices[i], ...data };
          count++;
        }
        return { count };
      }),
    },
    payment: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const newPayment: MockPayment = {
          id: `pay_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          businessId: data.businessId as string,
          orderId: data.orderId as string,
          invoiceId: (data.invoiceId as string) || null,
          type: (data.type as PaymentType) || PaymentType.RECEIPT,
          method: (data.method as PaymentMethod) || PaymentMethod.TRANSFER,
          status: (data.status as PaymentStatus) || PaymentStatus.PENDING_VERIFICATION,
          amount: data.amount as bigint,
          paidAt: data.paidAt as Date,
          reference: (data.reference as string) || null,
          proofPath: (data.proofPath as string) || null,
          notes: (data.notes as string) || null,
          createdById: data.createdById as string,
          verifiedById: (data.verifiedById as string) || null,
          verifiedAt: (data.verifiedAt as Date) || null,
          rejectReason: (data.rejectReason as string) || null,
          createdAt: new Date(),
          updatedAt: new Date(),
          deletedAt: null,
        };
        payments.push(newPayment);
        return newPayment;
      }),
      findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        return (
          payments.find((p) => {
            if (where.id && p.id !== where.id) return false;
            if (where.businessId && p.businessId !== where.businessId) return false;
            if (where.orderId && p.orderId !== where.orderId) return false;
            if (where.status && p.status !== where.status) return false;
            if (where.deletedAt === null && p.deletedAt !== null) return false;
            return true;
          }) || null
        );
      }),
      findFirstOrThrow: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        const found = payments.find((p) => {
          if (where.id && p.id !== where.id) return false;
          if (where.businessId && p.businessId !== where.businessId) return false;
          if (where.orderId && p.orderId !== where.orderId) return false;
          if (where.status && p.status !== where.status) return false;
          if (where.deletedAt === null && p.deletedAt !== null) return false;
          return true;
        });
        if (!found) throw new Error('Payment not found');
        return found;
      }),
      findMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        return payments.filter((p) => {
          if (where.businessId && p.businessId !== where.businessId) return false;
          if (where.orderId && p.orderId !== where.orderId) return false;
          if (where.status && p.status !== where.status) return false;
          if (where.deletedAt === null && p.deletedAt !== null) return false;
          return true;
        });
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const idx = payments.findIndex((p) => p.id === where.id);
        if (idx === -1) throw new Error('Payment not found');
        payments[idx] = { ...payments[idx], ...data, updatedAt: new Date() };
        return payments[idx];
      }),
      updateMany: vi.fn(async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        let count = 0;
        for (let i = 0; i < payments.length; i++) {
          if (where.id && payments[i].id !== where.id) continue;
          if (where.businessId && payments[i].businessId !== where.businessId) continue;
          payments[i] = { ...payments[i], ...data, updatedAt: new Date() };
          count++;
        }
        return { count };
      }),
    },
    customerCreditEntry: {
      findMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        return creditEntries.filter((ce) => {
          if (where.businessId && ce.businessId !== where.businessId) return false;
          if (where.customerId && ce.customerId !== where.customerId) return false;
          return true;
        });
      }),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const entry: MockCustomerCreditEntry = {
          id: `ce_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          businessId: data.businessId as string,
          customerId: data.customerId as string,
          amount: data.amount as bigint,
          reason: data.reason as string,
          orderId: (data.orderId as string) || null,
          paymentId: (data.paymentId as string) || null,
          createdById: data.createdById as string,
          createdAt: new Date(),
        };
        creditEntries.push(entry);
        return entry;
      }),
    },
    shipment: {
      findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        return (
          shipments.find((s) => {
            if (where.orderId && s.orderId !== where.orderId) return false;
            if (where.businessId && s.businessId !== where.businessId) return false;
            return true;
          }) || null
        );
      }),
      findUnique: vi.fn(async ({ where }: { where: { orderId: string } }) => {
        return shipments.find((s) => s.orderId === where.orderId) || null;
      }),
    },
    auditLog: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const log: MockAuditLog = {
          id: `audit_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          businessId: (data.businessId as string) ?? null,
          actorId: (data.actorId as string) ?? null,
          actorRole: (data.actorRole as Role) ?? null,
          action: data.action as string,
          entityType: data.entityType as string,
          entityId: data.entityId as string,
          summary: (data.summary as string) ?? null,
          reason: (data.reason as string) ?? undefined,
        };
        auditLogs.push(log);
        return log;
      }),
    },
    notification: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const notif: MockNotification = {
          id: `notif_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          businessId: (data.businessId as string) ?? null,
          userId: data.userId as string,
          type: data.type as string,
          title: data.title as string,
          body: data.body as string,
          linkPath: (data.linkPath as string) || null,
          dedupeKey: data.dedupeKey as string,
        };
        notifications.push(notif);
        return notif;
      }),
    },
    $queryRaw: vi.fn(async () => {
      return [{ id: 'locked' }];
    }),
    $transaction: vi.fn(async (cb: (tx: unknown) => Promise<unknown>) => {
      return cb(mockPrisma);
    }),
  };

  return { prisma: mockPrisma };
});

describe('Integrasi Pencatatan dan Verifikasi Pembayaran (T3.3, Seksi 7.12, 8.2, 8.4, Tes 17.3 no 8)', () => {
  const APP_URL = 'http://localhost:3000';
  const BIZ_ID = 'biz_payment_1';

  const superAdminCtx: Ctx = {
    user: {
      id: 'admin_1',
      role: Role.SUPERADMIN,
      name: 'Owner Super Admin',
      businessId: null,
    },
    role: Role.SUPERADMIN,
    businessId: BIZ_ID,
    sessionId: 'sess_admin',
    ip: '127.0.0.1',
  };

  const salesACtx: Ctx = {
    user: {
      id: 'sales_1',
      role: Role.SALES,
      name: 'Sales Andi',
      businessId: BIZ_ID,
    },
    role: Role.SALES,
    businessId: BIZ_ID,
    sessionId: 'sess_sales_a',
    ip: '127.0.0.1',
  };

  const salesBCtx: Ctx = {
    user: {
      id: 'sales_2',
      role: Role.SALES,
      name: 'Sales Budi',
      businessId: BIZ_ID,
    },
    role: Role.SALES,
    businessId: BIZ_ID,
    sessionId: 'sess_sales_b',
    ip: '127.0.0.1',
  };

  beforeEach(() => {
    businesses = [{ id: BIZ_ID, name: 'Toko Sumber Barokah' }];
    customers = [
      {
        id: 'cust_1',
        businessId: BIZ_ID,
        code: 'CUST-001',
        name: 'PT Maju Terus',
        deletedAt: null,
      },
    ];
    orders = [];
    invoices = [];
    payments = [];
    creditEntries = [];
    shipments = [];
    auditLogs = [];
    notifications = [];
    vi.clearAllMocks();
  });

  async function getTx(): Promise<TxClient> {
    return (await import('@/lib/db')).prisma as unknown as TxClient;
  }

  function setupApprovedOrderWithDp(): { order: MockOrder; dpInvoice: MockInvoice } {
    const order: MockOrder = {
      id: 'ord_dp_1',
      businessId: BIZ_ID,
      customerId: 'cust_1',
      salesId: 'sales_1',
      status: OrderStatus.AWAITING_DP,
      version: 1,
      rev: 1,
      orderNo: 'CUST-001/08112026/0001',
      grandTotal: BigInt(1_000_000),
      dpAmount: BigInt(300_000),
      paidTotal: BigInt(0),
      creditTotal: BigInt(0),
      deletedAt: null,
    };
    orders.push(order);

    const dpInvoice: MockInvoice = {
      id: 'inv_dp_1',
      businessId: BIZ_ID,
      orderId: order.id,
      type: InvoiceType.DP,
      status: InvoiceStatus.APPROVED,
      version: 1,
      number: 'CUST-001/INV/08/11/2026/0001-DP',
      amount: BigInt(300_000),
      paidAmount: BigInt(0),
      deletedAt: null,
    };
    invoices.push(dpInvoice);

    return { order, dpInvoice };
  }

  it('1. Sales berhasil mencatat pembayaran DP pada status AWAITING_DP (PENDING_VERIFICATION)', async () => {
    const { order, dpInvoice } = setupApprovedOrderWithDp();
    const tx = await getTx();

    const created = await createPayment(tx, salesACtx, {
      orderId: order.id,
      invoiceId: dpInvoice.id,
      amount: 300_000,
      method: PaymentMethod.TRANSFER,
      paidAt: new Date(),
      reference: 'TRF-BCA-12345',
      proofPath: 'biz_payment_1/proof/sample.webp',
      notes: 'DP 30% via transfer BCA',
    });

    expect(created.status).toBe(PaymentStatus.PENDING_VERIFICATION);
    expect(created.amount).toBe(BigInt(300_000));
    expect(created.createdById).toBe(salesACtx.user.id);
    expect(created.verifiedById).toBeNull();

    // Pastikan paidTotal belum bertambah sebelum diverifikasi
    const currentOrder = orders.find((o) => o.id === order.id);
    expect(currentOrder?.paidTotal).toBe(BigInt(0));

    // Pastikan notifikasi terkirim ke Super Admin
    const pendingNotif = notifications.find((n) => n.type === 'PAYMENT_PENDING');
    expect(pendingNotif).toBeDefined();
    expect(pendingNotif?.userId).toBe('admin_1');

    // Pastikan audit log tercatat
    const auditLog = auditLogs.find((a) => a.action === 'PAYMENT_CREATE');
    expect(auditLog).toBeDefined();
  });

  it('2. Menolak overpayment: pembayaran melebihi sisa tagihan DP invoice (422 OVERPAYMENT)', async () => {
    const { order, dpInvoice } = setupApprovedOrderWithDp();
    const tx = await getTx();

    await expect(
      createPayment(tx, salesACtx, {
        orderId: order.id,
        invoiceId: dpInvoice.id,
        amount: 350_000, // Melebihi DP 300.000
        method: PaymentMethod.TRANSFER,
        paidAt: new Date(),
      })
    ).rejects.toThrow(DomainError);

    try {
      await createPayment(tx, salesACtx, {
        orderId: order.id,
        invoiceId: dpInvoice.id,
        amount: 350_000,
        method: PaymentMethod.TRANSFER,
        paidAt: new Date(),
      });
    } catch (e: any) {
      expect(e.code).toBe('OVERPAYMENT');
      expect(e.status).toBe(422);
    }
  });

  it('3. Menolak overpayment: pembayaran melebihi sisa tagihan pesanan (422 OVERPAYMENT)', async () => {
    const { order } = setupApprovedOrderWithDp();
    const tx = await getTx();

    // Coba bayar tanpa invoiceId tapi melebihi grandTotal (1.000.000)
    await expect(
      createPayment(tx, salesACtx, {
        orderId: order.id,
        amount: 1_200_000,
        method: PaymentMethod.TRANSFER,
        paidAt: new Date(),
      })
    ).rejects.toThrow(DomainError);

    try {
      await createPayment(tx, salesACtx, {
        orderId: order.id,
        amount: 1_200_000,
        method: PaymentMethod.TRANSFER,
        paidAt: new Date(),
      });
    } catch (e: any) {
      expect(e.code).toBe('OVERPAYMENT');
      expect(e.status).toBe(422);
    }
  });

  it('4. Otorisasi: Sales DITOLAK memverifikasi pembayaran (403 FORBIDDEN)', async () => {
    const { order, dpInvoice } = setupApprovedOrderWithDp();
    const tx = await getTx();

    const payment = await createPayment(tx, salesACtx, {
      orderId: order.id,
      invoiceId: dpInvoice.id,
      amount: 300_000,
      method: PaymentMethod.TRANSFER,
      paidAt: new Date(),
    });

    await expect(
      verifyPayment(tx, salesACtx, payment.id)
    ).rejects.toThrow(DomainError);

    try {
      await verifyPayment(tx, salesACtx, payment.id);
    } catch (e: any) {
      expect(e.code).toBe('FORBIDDEN');
      expect(e.status).toBe(403);
    }
  });

  it('5. Super Admin memverifikasi DP: Order.paidTotal bertambah dan status bertransisi AWAITING_DP -> IN_PROCESS', async () => {
    const { order, dpInvoice } = setupApprovedOrderWithDp();
    const tx = await getTx();

    const payment = await createPayment(tx, salesACtx, {
      orderId: order.id,
      invoiceId: dpInvoice.id,
      amount: 300_000,
      method: PaymentMethod.TRANSFER,
      paidAt: new Date(),
    });

    const verified = await verifyPayment(tx, superAdminCtx, payment.id);

    expect(verified.status).toBe(PaymentStatus.VERIFIED);
    expect(verified.verifiedById).toBe(superAdminCtx.user.id);
    expect(verified.verifiedAt).toBeDefined();

    // Cek Order
    const updatedOrder = orders.find((o) => o.id === order.id);
    expect(updatedOrder?.paidTotal).toBe(BigInt(300_000));
    expect(updatedOrder?.status).toBe(OrderStatus.IN_PROCESS);
    expect(updatedOrder?.rev).toBe(2);

    // Cek Invoice
    const updatedInvoice = invoices.find((i) => i.id === dpInvoice.id);
    expect(updatedInvoice?.paidAmount).toBe(BigInt(300_000));

    // Cek Notifikasi ke Sales
    const salesNotif = notifications.find(
      (n) => n.userId === salesACtx.user.id && n.type === 'PAYMENT_VERIFIED'
    );
    expect(salesNotif).toBeDefined();

    // Cek Audit Log
    const verifyAudit = auditLogs.find((a) => a.action === 'PAYMENT_VERIFY');
    expect(verifyAudit).toBeDefined();
  });

  it('6. Verifikasi dua kali TIDAK menghitung ganda (Idempoten & Seksi 8.4)', async () => {
    const { order, dpInvoice } = setupApprovedOrderWithDp();
    const tx = await getTx();

    const payment = await createPayment(tx, salesACtx, {
      orderId: order.id,
      invoiceId: dpInvoice.id,
      amount: 300_000,
      method: PaymentMethod.TRANSFER,
      paidAt: new Date(),
    });

    // Verifikasi pertama
    await verifyPayment(tx, superAdminCtx, payment.id);
    expect(orders.find((o) => o.id === order.id)?.paidTotal).toBe(BigInt(300_000));

    // Verifikasi kedua (klik ganda/retry)
    await verifyPayment(tx, superAdminCtx, payment.id);
    expect(orders.find((o) => o.id === order.id)?.paidTotal).toBe(BigInt(300_000));
    expect(invoices.find((i) => i.id === dpInvoice.id)?.paidAmount).toBe(BigInt(300_000));
  });

  it('7. Super Admin menolak pembayaran (Reject): status REJECTED, alasan min 5 karakter, paidTotal tidak berubah', async () => {
    const { order, dpInvoice } = setupApprovedOrderWithDp();
    const tx = await getTx();

    const payment = await createPayment(tx, salesACtx, {
      orderId: order.id,
      invoiceId: dpInvoice.id,
      amount: 300_000,
      method: PaymentMethod.TRANSFER,
      paidAt: new Date(),
    });

    // Validasi alasan min 5 karakter
    await expect(
      rejectPayment(tx, superAdminCtx, payment.id, { reason: 'bad' })
    ).rejects.toThrow(DomainError);

    // Tolak dengan alasan valid
    const rejected = await rejectPayment(tx, superAdminCtx, payment.id, {
      reason: 'Bukti transfer tidak terbaca dan tidak ada di rekening mutasi',
    });

    expect(rejected.status).toBe(PaymentStatus.REJECTED);
    expect(rejected.rejectReason).toContain('Bukti transfer tidak terbaca');

    // Pastikan paidTotal tetap 0 dan order tetap AWAITING_DP
    const currentOrder = orders.find((o) => o.id === order.id);
    expect(currentOrder?.paidTotal).toBe(BigInt(0));
    expect(currentOrder?.status).toBe(OrderStatus.AWAITING_DP);

    // Notifikasi penolakan ke sales
    const rejectNotif = notifications.find(
      (n) => n.userId === salesACtx.user.id && n.type === 'PAYMENT_REJECTED'
    );
    expect(rejectNotif).toBeDefined();
  });

  it('8. Super Admin membatalkan (Void) pembayaran terverifikasi: paidTotal dihitung ulang, status order kembali ke AWAITING_DP', async () => {
    const { order, dpInvoice } = setupApprovedOrderWithDp();
    const tx = await getTx();

    const payment = await createPayment(tx, salesACtx, {
      orderId: order.id,
      invoiceId: dpInvoice.id,
      amount: 300_000,
      method: PaymentMethod.TRANSFER,
      paidAt: new Date(),
    });

    await verifyPayment(tx, superAdminCtx, payment.id);
    expect(orders.find((o) => o.id === order.id)?.status).toBe(OrderStatus.IN_PROCESS);

    // Validasi alasan void min 5 karakter
    await expect(
      voidPayment(tx, superAdminCtx, payment.id, { reason: 'cls' })
    ).rejects.toThrow(DomainError);

    // Void pembayaran
    const voided = await voidPayment(tx, superAdminCtx, payment.id, {
      reason: 'Dana ditarik kembali oleh pihak bank / chargeback nasabah',
    });

    expect(voided.status).toBe(PaymentStatus.VOID);
    expect(voided.notes).toContain('[VOID]: Dana ditarik kembali');

    // Cek Order: paidTotal kembali 0 dan status kembali ke AWAITING_DP
    const updatedOrder = orders.find((o) => o.id === order.id);
    expect(updatedOrder?.paidTotal).toBe(BigInt(0));
    expect(updatedOrder?.status).toBe(OrderStatus.AWAITING_DP);
    expect(updatedOrder?.rev).toBe(3);

    // Cek Invoice: paidAmount kembali 0
    const updatedInvoice = invoices.find((i) => i.id === dpInvoice.id);
    expect(updatedInvoice?.paidAmount).toBe(BigInt(0));

    // Notifikasi void ke sales
    const voidNotif = notifications.find(
      (n) => n.userId === salesACtx.user.id && n.type === 'PAYMENT_VOIDED'
    );
    expect(voidNotif).toBeDefined();
  });

  it('9. Super Admin mencatat pembayaran dengan autoVerify: status langsung VERIFIED dan order terupdate atomik', async () => {
    const { order, dpInvoice } = setupApprovedOrderWithDp();
    const tx = await getTx();

    const payment = await createPayment(tx, superAdminCtx, {
      orderId: order.id,
      invoiceId: dpInvoice.id,
      amount: 300_000,
      method: PaymentMethod.CASH,
      paidAt: new Date(),
      autoVerify: true,
      notes: 'Diterima tunai di kantor',
    });

    expect(payment.status).toBe(PaymentStatus.VERIFIED);
    expect(payment.verifiedById).toBe(superAdminCtx.user.id);

    const updatedOrder = orders.find((o) => o.id === order.id);
    expect(updatedOrder?.paidTotal).toBe(BigInt(300_000));
    expect(updatedOrder?.status).toBe(OrderStatus.IN_PROCESS);
  });

  it('10. Isolasi Sales: Sales A tidak bisa mencatat atau melihat pembayaran order milik Sales B (404 ORDER_NOT_FOUND)', async () => {
    const { order } = setupApprovedOrderWithDp(); // order milik sales_1
    const tx = await getTx();

    // Sales B mencoba mencatat pembayaran untuk order Sales A
    await expect(
      createPayment(tx, salesBCtx, {
        orderId: order.id,
        amount: 100_000,
        method: PaymentMethod.TRANSFER,
        paidAt: new Date(),
      })
    ).rejects.toThrow(DomainError);

    try {
      await createPayment(tx, salesBCtx, {
        orderId: order.id,
        amount: 100_000,
        method: PaymentMethod.TRANSFER,
        paidAt: new Date(),
      });
    } catch (e: any) {
      expect(e.code).toBe('ORDER_NOT_FOUND');
      expect(e.status).toBe(404);
    }
  });

  it('11. Menolak pembayaran pada invoice yang sudah REJECTED / VOID / WITHDRAWN (409 INVALID_STATE)', async () => {
    const { order } = setupApprovedOrderWithDp();
    const tx = await getTx();

    const voidInvoice: MockInvoice = {
      id: 'inv_void_1',
      businessId: BIZ_ID,
      orderId: order.id,
      type: InvoiceType.FINAL,
      status: InvoiceStatus.VOID,
      version: 1,
      number: 'CUST-001/INV/08/11/2026/0001-LNS',
      amount: BigInt(700_000),
      paidAmount: BigInt(0),
      deletedAt: null,
    };
    invoices.push(voidInvoice);

    await expect(
      createPayment(tx, salesACtx, {
        orderId: order.id,
        invoiceId: voidInvoice.id,
        amount: 100_000,
        method: PaymentMethod.TRANSFER,
        paidAt: new Date(),
      })
    ).rejects.toThrow(DomainError);

    try {
      await createPayment(tx, salesACtx, {
        orderId: order.id,
        invoiceId: voidInvoice.id,
        amount: 100_000,
        method: PaymentMethod.TRANSFER,
        paidAt: new Date(),
      });
    } catch (e: any) {
      expect(e.code).toBe('INVALID_STATE');
      expect(e.status).toBe(409);
    }
  });

  it('12. Penyelesaian pesanan otomatis (maybeComplete): order AWAITING_FINAL_PAYMENT lunas dan SHIPPED menjadi COMPLETED', async () => {
    const finalOrder: MockOrder = {
      id: 'ord_final_1',
      businessId: BIZ_ID,
      customerId: 'cust_1',
      salesId: 'sales_1',
      status: OrderStatus.AWAITING_FINAL_PAYMENT,
      version: 1,
      rev: 2,
      orderNo: 'CUST-001/08112026/0002',
      grandTotal: BigInt(500_000),
      dpAmount: BigInt(0),
      paidTotal: BigInt(0),
      creditTotal: BigInt(0),
      deletedAt: null,
    };
    orders.push(finalOrder);

    const finalInvoice: MockInvoice = {
      id: 'inv_final_1',
      businessId: BIZ_ID,
      orderId: finalOrder.id,
      type: InvoiceType.FINAL,
      status: InvoiceStatus.APPROVED,
      version: 1,
      number: 'CUST-001/INV/08/11/2026/0002-LNS',
      amount: BigInt(500_000),
      paidAmount: BigInt(0),
      deletedAt: null,
    };
    invoices.push(finalInvoice);

    // Pengiriman sudah SHIPPED
    shipments.push({
      id: 'ship_1',
      businessId: BIZ_ID,
      orderId: finalOrder.id,
      status: ShipStatus.SHIPPED,
    });

    const tx = await getTx();

    // Catat pelunasan langsung oleh Super Admin
    await createPayment(tx, superAdminCtx, {
      orderId: finalOrder.id,
      invoiceId: finalInvoice.id,
      amount: 500_000,
      method: PaymentMethod.TRANSFER,
      paidAt: new Date(),
      autoVerify: true,
    });

    const completedOrder = orders.find((o) => o.id === finalOrder.id);
    expect(completedOrder?.paidTotal).toBe(BigInt(500_000));
    expect(completedOrder?.status).toBe(OrderStatus.COMPLETED);
    expect(completedOrder?.rev).toBe(3);

    const completeAudit = auditLogs.find((a) => a.action === 'ORDER_COMPLETE');
    expect(completeAudit).toBeDefined();

    const completeNotif = notifications.find(
      (n) => n.userId === salesACtx.user.id && n.type === 'ORDER_COMPLETED'
    );
    expect(completeNotif).toBeDefined();
  });
});
