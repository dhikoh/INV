import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import {
  Role,
  OrderStatus,
  InvoiceType,
  InvoiceStatus,
  PaymentStatus,
  PaymentType,
  PaymentMethod,
  ShipStatus,
  InvoiceTheme,
} from '@prisma/client';
import { DomainError } from '@/lib/domain/money';
import type { Ctx } from '@/lib/auth/context';
import * as contextModule from '@/lib/auth/context';
import { createPayment } from '@/lib/services/payment';
import { cancelOrder } from '@/lib/services/order';
import { DELETE as deleteOrderHandler } from '@/app/api/v1/orders/[id]/route';
import { POST as cancelOrderHandler } from '@/app/api/v1/orders/[id]/cancel/route';
import { GET as getProformaPdfHandler } from '@/app/api/v1/orders/[id]/proforma/pdf/route';

vi.mock('@/lib/pdf/response', () => ({
  renderElementToPdfResponse: vi.fn(async (_el: unknown, filename: string) => {
    return new Response(new Uint8Array([37, 80, 68, 70, 45]), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${filename}"`,
      },
    });
  }),
}));

interface MockOrder {
  id: string;
  businessId: string;
  customerId?: string;
  deletedAt: Date | null;
  status?: OrderStatus;
  paidTotal?: number | bigint;
  stockReserved?: boolean;
  items?: unknown[];
  [key: string]: unknown;
}

interface MockInvoice {
  id: string;
  orderId: string;
  status: InvoiceStatus;
  paidAmount?: bigint;
  deletedAt: Date | null;
  [key: string]: unknown;
}

interface MockPayment {
  id: string;
  orderId: string;
  status: PaymentStatus;
  type?: PaymentType;
  amount: bigint;
  createdAt?: Date;
  updatedAt?: Date;
  [key: string]: unknown;
}

interface MockShipment {
  id: string;
  orderId: string;
  status: ShipStatus;
}

interface MockProduct {
  id: string;
  businessId?: string;
  reservedQty: number;
}

type WhereArg<T = Record<string, unknown>> = { where?: T };
type UpdateArg<W = Record<string, unknown>, D = Record<string, unknown>> = { where: W; data: D };
type CreateArg<D = Record<string, unknown>> = { data: D };
type TxArg = Parameters<typeof createPayment>[0];

const db = vi.hoisted(() => ({
  business: {
    id: 'biz_p1',
    code: 'BC',
    name: 'BentoCat',
    legalName: 'CV BentoCat Mandiri',
    address: 'Jl. Soekandar 5',
    phone: '0812345',
    email: 'admin@bentocat.id',
    npwp: null,
    logoPath: null,
    invoiceTheme: 'PROFESIONAL' as InvoiceTheme,
    invoiceFooterNote: null,
    dueDays: 7,
    showBankOnProforma: false,
    paymentLegalNotice: null as string | null,
    allowSalesCashPayment: false,
    requireTransferProofForSales: true,
  },
  orders: [] as MockOrder[],
  invoices: [] as MockInvoice[],
  payments: [] as MockPayment[],
  shipments: [] as MockShipment[],
  products: [] as MockProduct[],
  creditEntries: [] as Array<Record<string, unknown> & { amount?: bigint }>,
  commissions: [] as Array<{ id?: string; orderId: string; status: string; note?: string | null }>,
  auditLogs: [] as Record<string, unknown>[],
  notifications: [] as Record<string, unknown>[],
  counters: [{ id: 'cnt_1', lastSeq: 4 }],
  remindersRebuiltFor: [] as string[],
}));

vi.mock('@/lib/services/reminder', () => ({
  updateRemindersForCompletedOrder: vi.fn(async () => {}),
  rebuildRemindersForCustomer: vi.fn(async (_tx: unknown, customerId: string) => {
    db.remindersRebuiltFor.push(customerId);
  }),
}));

vi.mock('@/lib/services/commission', () => ({
  evaluateOrderCommission: vi.fn(async () => null),
  reverseOrderCommission: vi.fn(async (_tx: unknown, orderId: string, _b: string, note?: string) => {
    for (const c of db.commissions) {
      if (c.orderId === orderId) {
        c.status = 'REVERSED';
        c.note = note;
      }
    }
  }),
}));

interface MockTxClient {
  $queryRaw: ReturnType<typeof vi.fn>;
  business: Record<string, ReturnType<typeof vi.fn>>;
  bankAccount: Record<string, ReturnType<typeof vi.fn>>;
  order: Record<string, ReturnType<typeof vi.fn>>;
  invoice: Record<string, ReturnType<typeof vi.fn>>;
  payment: Record<string, ReturnType<typeof vi.fn>>;
  shipment: Record<string, ReturnType<typeof vi.fn>>;
  user: Record<string, ReturnType<typeof vi.fn>>;
  customer: Record<string, ReturnType<typeof vi.fn>>;
  product: Record<string, ReturnType<typeof vi.fn>>;
  customerCreditEntry: Record<string, ReturnType<typeof vi.fn>>;
  auditLog: Record<string, ReturnType<typeof vi.fn>>;
  notification: Record<string, ReturnType<typeof vi.fn>>;
  $transaction: <T>(cb: (client: MockTxClient) => Promise<T>) => Promise<T>;
}

vi.mock('@/lib/db', () => {
  const tx: MockTxClient = {
    $queryRaw: vi.fn(async () => db.orders.map((o) => ({ id: o.id }))),
    business: {
      findFirst: vi.fn(async ({ where }: WhereArg<{ id?: string }>) =>
        where?.id === db.business.id ? db.business : null
      ),
      findUnique: vi.fn(async ({ where }: WhereArg<{ id?: string }>) =>
        where?.id === db.business.id ? db.business : null
      ),
    },
    bankAccount: {
      findMany: vi.fn(async () => [
        { bankName: 'BCA', accountNumber: '888000111', accountHolder: 'CV BentoCat' },
      ]),
    },
    order: {
      findFirst: vi.fn(
        async ({
          where,
        }: WhereArg<{ id?: string; businessId?: string; deletedAt?: Date | null }>) => {
          const found =
            db.orders.find((o) => {
              if (where?.id && o.id !== where.id) return false;
              if (where?.businessId && o.businessId !== where.businessId) return false;
              if (where?.deletedAt === null && o.deletedAt !== null) return false;
              return true;
            }) || null;
          if (!found) return null;
          return { ...found, _count: { items: (found.items ?? []).length } };
        }
      ),
      findFirstOrThrow: vi.fn(async ({ where }: WhereArg<{ id?: string }>) => {
        const found = db.orders.find((o) => o.id === where?.id);
        if (!found) throw new Error('Order not found');
        return found;
      }),
      update: vi.fn(async ({ where, data }: UpdateArg<{ id: string }, Record<string, unknown>>) => {
        const found = db.orders.find((o) => o.id === where.id);
        if (found) Object.assign(found, data);
        return found;
      }),
      updateMany: vi.fn(
        async ({
          where,
          data,
        }: UpdateArg<{ id: string; businessId?: string }, Record<string, unknown>>) => {
          const matched = db.orders.filter(
            (o) => o.id === where.id && (!where.businessId || o.businessId === where.businessId)
          );
          for (const o of matched) {
            for (const [k, v] of Object.entries(data)) {
              if (v && typeof v === 'object' && 'increment' in v) {
                const inc = Number((v as { increment: number | bigint }).increment);
                o[k] = Number(o[k] ?? 0) + inc;
              } else {
                o[k] = v;
              }
            }
          }
          return { count: matched.length };
        }
      ),
    },
    invoice: {
      findFirst: vi.fn(
        async ({
          where,
        }: WhereArg<{
          id?: string;
          orderId?: string;
          status?: InvoiceStatus;
          deletedAt?: Date | null;
        }>) => {
          return (
            db.invoices.find((i) => {
              if (where?.id && i.id !== where.id) return false;
              if (where?.orderId && i.orderId !== where.orderId) return false;
              if (where?.status && i.status !== where.status) return false;
              if (where?.deletedAt === null && i.deletedAt !== null) return false;
              return true;
            }) || null
          );
        }
      ),
      findMany: vi.fn(
        async ({
          where,
        }: WhereArg<{ orderId?: string; status?: InvoiceStatus; deletedAt?: Date | null }>) => {
          return db.invoices.filter((i) => {
            if (where?.orderId && i.orderId !== where.orderId) return false;
            if (where?.status && i.status !== where.status) return false;
            if (where?.deletedAt === null && i.deletedAt !== null) return false;
            return true;
          });
        }
      ),
      updateMany: vi.fn(
        async ({
          where,
          data,
        }: UpdateArg<{ orderId?: string; status?: InvoiceStatus }, Record<string, unknown>>) => {
          const matched = db.invoices.filter((i) => {
            if (where?.orderId && i.orderId !== where.orderId) return false;
            if (where?.status && i.status !== where.status) return false;
            return true;
          });
          for (const inv of matched) {
            for (const [k, v] of Object.entries(data)) {
              if (v && typeof v === 'object' && 'increment' in v) {
                const inc = (v as { increment: bigint }).increment;
                inv[k] = ((inv[k] as bigint | undefined) ?? BigInt(0)) + inc;
              } else {
                inv[k] = v;
              }
            }
          }
          return { count: matched.length };
        }
      ),
    },
    payment: {
      findFirst: vi.fn(async ({ where }: WhereArg<{ orderId?: string; status?: PaymentStatus }>) => {
        return (
          db.payments.find((p) => {
            if (where?.orderId && p.orderId !== where.orderId) return false;
            if (where?.status && p.status !== where.status) return false;
            return true;
          }) || null
        );
      }),
      findMany: vi.fn(async ({ where }: WhereArg<{ orderId?: string; status?: PaymentStatus }>) => {
        return db.payments.filter((p) => {
          if (where?.orderId && p.orderId !== where.orderId) return false;
          if (where?.status && p.status !== where.status) return false;
          return true;
        });
      }),
      create: vi.fn(async ({ data }: CreateArg<Omit<MockPayment, 'id'>>) => {
        const created = {
          id: `pay_${db.payments.length + 1}`,
          createdAt: new Date(),
          updatedAt: new Date(),
          ...data,
        } as MockPayment;
        db.payments.push(created);
        return created;
      }),
    },
    shipment: {
      findFirst: vi.fn(async ({ where }: WhereArg<{ orderId?: string }>) => {
        return db.shipments.find((s) => !where?.orderId || s.orderId === where.orderId) || null;
      }),
    },
    user: {
      findMany: vi.fn(async ({ where }: WhereArg<{ role?: Role; isActive?: boolean }>) => {
        const users = [
          { id: 'admin_1', role: Role.SUPERADMIN, name: 'Super Admin', isActive: true },
          { id: 'sales_1', role: Role.SALES, name: 'Sales Tester', isActive: true },
        ];
        return users.filter(
          (u) => (!where?.role || u.role === where.role) && (where?.isActive === undefined || u.isActive === where.isActive)
        );
      }),
      findUnique: vi.fn(async ({ where }: WhereArg<{ id?: string }>) => {
        if (where?.id === 'sales_1') return { id: 'sales_1', name: 'Sales Tester', role: Role.SALES };
        return { id: 'admin_1', name: 'Super Admin', role: Role.SUPERADMIN };
      }),
    },
    customer: {
      findUnique: vi.fn(async ({ where }: WhereArg<{ id?: string }>) => {
        if (where?.id === 'cust_1') return { id: 'cust_1', name: 'Petshop Jaya' };
        return null;
      }),
    },
    product: {
      updateMany: vi.fn(
        async ({ where, data }: UpdateArg<{ id: string }, { reservedQty?: { decrement?: number } }>) => {
          const prod = db.products.find((p) => p.id === where.id);
          if (prod && data?.reservedQty?.decrement) {
            prod.reservedQty -= data.reservedQty.decrement;
          }
          return { count: prod ? 1 : 0 };
        }
      ),
    },
    customerCreditEntry: {
      create: vi.fn(async ({ data }: CreateArg<Record<string, unknown> & { amount?: bigint }>) => {
        const entry = { id: `cc_${db.creditEntries.length + 1}`, ...data };
        db.creditEntries.push(entry);
        return entry;
      }),
    },
    auditLog: {
      create: vi.fn(async ({ data }: CreateArg<Record<string, unknown>>) => {
        db.auditLogs.push(data);
        return data;
      }),
    },
    notification: {
      create: vi.fn(async ({ data }: CreateArg<Record<string, unknown>>) => {
        db.notifications.push(data);
        return data;
      }),
    },
    $transaction: async <T>(cb: (client: MockTxClient) => Promise<T>) => cb(tx),
  };

  return { prisma: tx };
});

function ctxFor(role: Role, userId: string): Ctx {
  return {
    user: {
      id: userId,
      name: role === Role.SUPERADMIN ? 'Super Admin' : 'Sales Tester',
      role,
      businessId: 'biz_p1',
    },
    role,
    businessId: 'biz_p1',
    sessionId: `sess_${userId}`,
    ip: '127.0.0.1',
  };
}

function mockAuth(role: Role, userId: string) {
  const c = ctxFor(role, userId);
  return vi
    .spyOn(contextModule, 'requireContext')
    .mockImplementation(async (_req, allowedRoles) => {
      if (allowedRoles && allowedRoles.length > 0 && !allowedRoles.includes(c.role)) {
        throw new DomainError('FORBIDDEN', 'Anda tidak punya akses', 403);
      }
      return c;
    });
}

describe('Fase 1 Integration Tests: Proforma PDF, Anti-Fraud Policy Payment, Cancel Order & Delete Guard', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    db.business.allowSalesCashPayment = false;
    db.business.requireTransferProofForSales = true;
    db.business.showBankOnProforma = false;
    db.orders = [
      {
        id: 'ord_draft_1',
        businessId: 'biz_p1',
        customerId: 'cust_1',
        salesId: 'sales_1',
        status: OrderStatus.DRAFT,
        version: 1,
        rev: 0,
        customerSeq: null,
        orderNo: null,
        orderDate: new Date('2026-11-12T00:00:00Z'),
        deliveryAddress: 'Surabaya',
        notes: null,
        repeatIntervalDays: null,
        subtotal: BigInt(1_000_000),
        discountTotal: BigInt(0),
        shippingCharge: BigInt(0),
        ppnEnabled: false,
        ppnRateBps: 0,
        ppnAmount: BigInt(0),
        grandTotal: BigInt(1_000_000),
        dpBps: 5000,
        dpAmount: BigInt(500_000),
        hasBelowMin: false,
        belowMinReason: null,
        overrideNote: null,
        rejectReason: null,
        paidTotal: BigInt(0),
        creditTotal: BigInt(0),
        stockReserved: false,
        cancelReason: null,
        cancelledAt: null,
        deletedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        customer: {
          id: 'cust_1',
          code: 'C01',
          name: 'Petshop Jaya',
          contactName: 'Budi',
          address: 'Surabaya',
          billingAddress: 'Surabaya',
          shippingAddress: 'Surabaya',
          npwp: null,
        },
        items: [
          {
            id: 'oi_1',
            productId: 'prod_1',
            productName: 'Pasir Kucing 10L',
            sku: 'PK-10',
            unit: 'zak',
            qty: 5,
            listPrice: BigInt(200_000),
            unitPrice: BigInt(200_000),
            discountType: 'NONE',
            discountValue: BigInt(0),
            discountSource: 'MANUAL',
            lineSubtotal: BigInt(1_000_000),
            lineDiscount: BigInt(0),
            lineNet: BigInt(1_000_000),
            costPrice: BigInt(120_000),
            floorPrice: BigInt(150_000),
            belowMin: false,
            sortOrder: 0,
          },
        ],
      },
      {
        id: 'ord_inproc_dp',
        businessId: 'biz_p1',
        customerId: 'cust_1',
        salesId: 'sales_1',
        status: OrderStatus.IN_PROCESS,
        version: 1,
        rev: 3,
        customerSeq: 1,
        orderNo: 'C01/INV/12/11/2026/0001',
        orderDate: new Date('2026-11-12T00:00:00Z'),
        deliveryAddress: 'Surabaya',
        notes: null,
        repeatIntervalDays: null,
        subtotal: BigInt(1_000_000),
        discountTotal: BigInt(0),
        shippingCharge: BigInt(0),
        ppnEnabled: false,
        ppnRateBps: 0,
        ppnAmount: BigInt(0),
        grandTotal: BigInt(1_000_000),
        dpBps: 5000,
        dpAmount: BigInt(500_000),
        hasBelowMin: false,
        belowMinReason: null,
        overrideNote: null,
        rejectReason: null,
        paidTotal: BigInt(500_000),
        creditTotal: BigInt(0),
        stockReserved: true,
        cancelReason: null,
        cancelledAt: null,
        deletedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        customer: {
          id: 'cust_1',
          code: 'C01',
          name: 'Petshop Jaya',
        },
        items: [
          {
            id: 'oi_2',
            productId: 'prod_1',
            productName: 'Pasir Kucing 10L',
            sku: 'PK-10',
            unit: 'zak',
            qty: 5,
            listPrice: BigInt(200_000),
            unitPrice: BigInt(200_000),
            discountType: 'NONE',
            discountValue: BigInt(0),
            discountSource: 'MANUAL',
            lineSubtotal: BigInt(1_000_000),
            lineDiscount: BigInt(0),
            lineNet: BigInt(1_000_000),
            costPrice: BigInt(120_000),
            floorPrice: BigInt(150_000),
            belowMin: false,
            sortOrder: 0,
          },
        ],
      },
    ];
    db.invoices = [
      {
        id: 'inv_dp_1',
        businessId: 'biz_p1',
        orderId: 'ord_inproc_dp',
        type: InvoiceType.DP,
        status: InvoiceStatus.APPROVED,
        number: 'C01/INV/12/11/2026/0001-DP',
        amount: BigInt(500_000),
        paidAmount: BigInt(500_000),
        deletedAt: null,
        rev: 1,
      },
    ];
    db.payments = [
      {
        id: 'pay_dp_1',
        businessId: 'biz_p1',
        orderId: 'ord_inproc_dp',
        invoiceId: 'inv_dp_1',
        type: PaymentType.RECEIPT,
        method: PaymentMethod.TRANSFER,
        status: PaymentStatus.VERIFIED,
        amount: BigInt(500_000),
        paidAt: new Date('2026-11-12T00:00:00Z'),
        reference: 'BCA-DP-1',
        proofPath: 'proof/dp1.jpg',
        notes: null,
        createdById: 'sales_1',
        verifiedById: 'admin_1',
        verifiedAt: new Date('2026-11-12T01:00:00Z'),
        rejectReason: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];
    db.products = [{ id: 'prod_1', businessId: 'biz_p1', reservedQty: 5 }];
    db.shipments = [];
    db.creditEntries = [];
    db.commissions = [{ id: 'com_1', orderId: 'ord_inproc_dp', status: 'EARNED', note: null }];
    db.auditLogs = [];
    db.notifications = [];
    db.counters = [{ id: 'cnt_1', lastSeq: 4 }];
    db.remindersRebuiltFor = [];
  });

  it('GET /api/v1/orders/:id/proforma/pdf: mengizinkan Sales pemilik pada DRAFT, mencatat AuditLog tanpa mengubah counter, dan memblokir Sales lain / status aktif', async () => {
    mockAuth(Role.SALES, 'sales_1');
    const res = await getProformaPdfHandler(
      new NextRequest('http://localhost/api/v1/orders/ord_draft_1/proforma/pdf'),
      { params: Promise.resolve({ id: 'ord_draft_1' }) }
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('application/pdf');
    expect(db.counters[0].lastSeq).toBe(4);
    expect(db.auditLogs.some((a) => a.action === 'PROFORMA_PRINT' && a.entityId === 'ord_draft_1')).toBe(true);

    // Sales lain diblokir 403
    mockAuth(Role.SALES, 'sales_2');
    const resOther = await getProformaPdfHandler(
      new NextRequest('http://localhost/api/v1/orders/ord_draft_1/proforma/pdf'),
      { params: Promise.resolve({ id: 'ord_draft_1' }) }
    );
    expect(resOther.status).toBe(403);

    // Order sudah IN_PROCESS tidak bisa cetak Proforma lagi (409)
    mockAuth(Role.SALES, 'sales_1');
    const resActive = await getProformaPdfHandler(
      new NextRequest('http://localhost/api/v1/orders/ord_inproc_dp/proforma/pdf'),
      { params: Promise.resolve({ id: 'ord_inproc_dp' }) }
    );
    expect(resActive.status).toBe(409);
  });

  it('createPayment menegakkan blokir CASH & wajib bukti TRANSFER untuk SALES sesuai kebijakan usaha', async () => {
    const { prisma } = await import('@/lib/db');

    // 1. Sales pakai CASH saat allowSalesCashPayment=false -> 403 CASH_DISABLED_FOR_SALES
    await expect(
      createPayment(prisma as unknown as TxArg, ctxFor(Role.SALES, 'sales_1'), {
        orderId: 'ord_inproc_dp',
        amount: 250_000,
        method: PaymentMethod.CASH,
        paidAt: new Date(),
      })
    ).rejects.toMatchObject({ code: 'CASH_DISABLED_FOR_SALES', status: 403 });

    // 2. Sales pakai TRANSFER tanpa proofPath saat requireTransferProofForSales=true -> 422 TRANSFER_PROOF_REQUIRED
    await expect(
      createPayment(prisma as unknown as TxArg, ctxFor(Role.SALES, 'sales_1'), {
        orderId: 'ord_inproc_dp',
        amount: 250_000,
        method: PaymentMethod.TRANSFER,
        paidAt: new Date(),
      })
    ).rejects.toMatchObject({ code: 'TRANSFER_PROOF_REQUIRED', status: 422 });

    // 3. Sales pakai TRANSFER dengan proofPath -> BERHASIL
    const okPay = await createPayment(prisma as unknown as TxArg, ctxFor(Role.SALES, 'sales_1'), {
      orderId: 'ord_inproc_dp',
      amount: 250_000,
      method: PaymentMethod.TRANSFER,
      paidAt: new Date(),
      proofPath: 'proof/pelunasan.png',
    });
    expect(okPay.status).toBe(PaymentStatus.PENDING_VERIFICATION);

    // 4. Super Admin pakai CASH tetap diizinkan meskipun allowSalesCashPayment=false
    const saCash = await createPayment(prisma as unknown as TxArg, ctxFor(Role.SUPERADMIN, 'admin_1'), {
      orderId: 'ord_inproc_dp',
      amount: 250_000,
      method: PaymentMethod.CASH,
      paidAt: new Date(),
    });
    expect(saCash.method).toBe(PaymentMethod.CASH);

    // 5. Jika allowSalesCashPayment=true, Sales boleh CASH
    db.business.allowSalesCashPayment = true;
    const salesCashOk = await createPayment(prisma as unknown as TxArg, ctxFor(Role.SALES, 'sales_1'), {
      orderId: 'ord_inproc_dp',
      amount: 100_000,
      method: PaymentMethod.CASH,
      paidAt: new Date(),
    });
    expect(salesCashOk.method).toBe(PaymentMethod.CASH);
  });

  it('DELETE /api/v1/orders/:id menolak hapus order aktif (IN_PROCESS / faktur resmi / stok reserved) dan mengizinkan hapus draf bersih', async () => {
    mockAuth(Role.SUPERADMIN, 'admin_1');
    const sameOriginHeaders = {
      'content-type': 'application/json',
      origin: 'http://localhost',
      host: 'localhost',
    };

    // Order IN_PROCESS -> 409 INVALID_STATE
    const delActive = await deleteOrderHandler(
      new NextRequest('http://localhost/api/v1/orders/ord_inproc_dp', {
        method: 'DELETE',
        headers: sameOriginHeaders,
        body: JSON.stringify({ confirm: 'C01/INV/12/11/2026/0001' }),
      }),
      { params: Promise.resolve({ id: 'ord_inproc_dp' }) }
    );
    expect(delActive.status).toBe(409);

    // Order DRAFT tapi stockReserved = true -> 409 INVALID_STATE
    db.orders[0].stockReserved = true;
    const delReserved = await deleteOrderHandler(
      new NextRequest('http://localhost/api/v1/orders/ord_draft_1', {
        method: 'DELETE',
        headers: sameOriginHeaders,
        body: JSON.stringify({ confirm: 'ord_draft_1' }),
      }),
      { params: Promise.resolve({ id: 'ord_draft_1' }) }
    );
    expect(delReserved.status).toBe(409);

    // Order DRAFT bersih -> 200
    db.orders[0].stockReserved = false;
    const delClean = await deleteOrderHandler(
      new NextRequest('http://localhost/api/v1/orders/ord_draft_1', {
        method: 'DELETE',
        headers: sameOriginHeaders,
        body: JSON.stringify({ confirm: 'ord_draft_1' }),
      }),
      { params: Promise.resolve({ id: 'ord_draft_1' }) }
    );
    expect(delClean.status).toBe(200);
    expect(db.orders[0].deletedAt).not.toBeNull();
  });

  it('POST /api/v1/orders/:id/cancel menolak Sales (403) dan menolak tanpa dpSettlement saat ada DP (422)', async () => {
    const sameOriginHeaders = {
      'content-type': 'application/json',
      origin: 'http://localhost',
      host: 'localhost',
    };
    mockAuth(Role.SALES, 'sales_1');
    const salesRes = await cancelOrderHandler(
      new NextRequest('http://localhost/api/v1/orders/ord_inproc_dp/cancel', {
        method: 'POST',
        headers: sameOriginHeaders,
        body: JSON.stringify({ reason: 'Customer minta batal mendadak' }),
      }),
      { params: Promise.resolve({ id: 'ord_inproc_dp' }) }
    );
    expect(salesRes.status).toBe(403);

    mockAuth(Role.SUPERADMIN, 'admin_1');
    const noSettleRes = await cancelOrderHandler(
      new NextRequest('http://localhost/api/v1/orders/ord_inproc_dp/cancel', {
        method: 'POST',
        headers: sameOriginHeaders,
        body: JSON.stringify({ reason: 'Customer minta batal mendadak' }),
      }),
      { params: Promise.resolve({ id: 'ord_inproc_dp' }) }
    );
    expect(noSettleRes.status).toBe(422);
    const body = await noSettleRes.json();
    expect(body.error?.code).toBe('DP_SETTLEMENT_REQUIRED');
  });

  it('cancelOrder dengan dpSettlement = REFUND mem-void faktur, melepas stok, mencatat REFUND hingga paidTotal=0, membalik komisi, dan mengirim notifikasi', async () => {
    const { prisma } = await import('@/lib/db');
    const cancelled = await cancelOrder(prisma as unknown as TxArg, ctxFor(Role.SUPERADMIN, 'admin_1'), 'ord_inproc_dp', {
      reason: 'Customer pindah vendor mendadak',
      dpSettlement: 'REFUND',
      refundMethod: 'TRANSFER',
      refundReference: 'TRF-REF-001',
      rev: 3,
    });

    expect(cancelled.status).toBe(OrderStatus.CANCELLED);
    expect(cancelled.cancelReason).toBe('Customer pindah vendor mendadak');
    expect(cancelled.paidTotal).toBe(0);
    expect(cancelled.stockReserved).toBe(false);
    expect(db.products[0].reservedQty).toBe(0);
    expect(db.invoices[0].status).toBe(InvoiceStatus.VOID);
    expect(db.invoices[0].paidAmount).toBe(BigInt(0));
    expect(db.payments.some((p) => p.type === PaymentType.REFUND && p.amount === BigInt(500_000))).toBe(true);
    expect(db.commissions[0].status).toBe('REVERSED');
    expect(db.remindersRebuiltFor).toContain('cust_1');
    expect(db.auditLogs.some((a) => a.action === 'ORDER_CANCEL')).toBe(true);
    expect(db.notifications.some((n) => n.userId === 'sales_1' && n.type === 'ORDER_CANCELLED')).toBe(true);
  });

  it('cancelOrder dengan dpSettlement = CUSTOMER_CREDIT mengonversi DP menjadi saldo kredit pelanggan & menolak bila sudah SHIPPED', async () => {
    const { prisma } = await import('@/lib/db');
    const cancelled = await cancelOrder(prisma as unknown as TxArg, ctxFor(Role.SUPERADMIN, 'admin_1'), 'ord_inproc_dp', {
      reason: 'Simpan DP untuk PO bulan depan',
      dpSettlement: 'CUSTOMER_CREDIT',
    });

    expect(cancelled.status).toBe(OrderStatus.CANCELLED);
    expect(db.creditEntries).toHaveLength(1);
    expect(db.creditEntries[0].amount).toBe(BigInt(500_000));
    expect(db.invoices[0].status).toBe(InvoiceStatus.VOID);

    // Uji blokir saat sudah SHIPPED
    db.orders[1].status = OrderStatus.AWAITING_FINAL_PAYMENT;
    db.shipments = [{ id: 'ship_1', orderId: 'ord_inproc_dp', status: ShipStatus.SHIPPED }];
    await expect(
      cancelOrder(prisma as unknown as TxArg, ctxFor(Role.SUPERADMIN, 'admin_1'), 'ord_inproc_dp', {
        reason: 'Telat batal',
        dpSettlement: 'REFUND',
      })
    ).rejects.toThrowError(DomainError);
  });
});
