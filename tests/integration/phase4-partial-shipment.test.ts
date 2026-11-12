import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import {
  Role,
  OrderStatus,
  ShipStatus,
  InvoiceType,
  InvoiceStatus,
  CreditSettlement,
  OrderRevisionStatus,
} from '@prisma/client';
import type { Ctx } from '@/lib/auth/context';
import * as contextModule from '@/lib/auth/context';
import { shipOrder, deliverOrder, listOrderShipments } from '@/lib/services/shipment';
import { createCreditNote } from '@/lib/services/credit-note';
import { maybeComplete } from '@/lib/services/payment';
import { GET as getDeliveryNotePdf } from '@/app/api/v1/orders/[id]/delivery-note/pdf/route';

const capturedPdfData = vi.hoisted(() => ({
  lastData: null as Record<string, unknown> | null,
}));

interface MockOrder {
  id: string;
  businessId: string;
  customerId: string;
  status: OrderStatus;
  grandTotal: bigint;
  creditTotal: bigint;
  rev: number;
  deletedAt: Date | null;
  [key: string]: unknown;
}

interface MockOrderItem {
  id: string;
  orderId: string;
  productId?: string;
  qty?: number;
  sortOrder?: number;
  [key: string]: unknown;
}

interface MockOrderRevision {
  id: string;
  orderId: string;
  businessId: string;
  status: OrderRevisionStatus;
  [key: string]: unknown;
}

interface MockInvoice {
  id: string;
  orderId: string;
  businessId: string;
  type: InvoiceType;
  status: InvoiceStatus;
  deletedAt: Date | null;
  [key: string]: unknown;
}

interface MockShipment {
  id: string;
  orderId: string;
  businessId: string;
  kloterNo: number;
  status?: ShipStatus;
  [key: string]: unknown;
}

interface MockShipmentItem {
  id: string;
  shipmentId: string;
  orderItemId: string;
  qty: number;
}

interface MockCreditNote {
  id: string;
  orderId: string;
  businessId?: string;
  voidedAt: Date | null;
  [key: string]: unknown;
}

interface MockCreditNoteItem {
  id: string;
  creditNoteId: string;
  [key: string]: unknown;
}

type WhereArg<T = Record<string, unknown>> = { where?: T };
type UpdateArg<W = Record<string, unknown>, D = Record<string, unknown>> = {
  where?: W;
  data: D;
};
type CreateArg<D = Record<string, unknown>> = { data: D };

const db = vi.hoisted(() => ({
  business: {
    id: 'biz_p4',
    code: 'BC',
    name: 'BentoCat',
    legalName: 'PT BentoCat Nusantara',
    address: 'Jl. Industri No. 1',
    phone: '021-555123',
    email: 'admin@bentocat.id',
    npwp: '01.234.567.8-999.000',
    logoPath: null as string | null,
    ppnEnabled: false,
    ppnRateBps: 1100,
    defaultDpBps: 3000,
    allowNegativeStock: false,
    requirePaidBeforeShip: false,
    allowPartialShipment: true,
    allowShipBeforeFinalInvoice: false,
    commissionMode: 'PROFIT',
  },
  users: [
    { id: 'sa_1', businessId: 'biz_p4', role: 'SUPERADMIN' as Role, name: 'Super Admin', isActive: true },
    { id: 'sales_1', businessId: 'biz_p4', role: 'SALES' as Role, name: 'Sales Andi', isActive: true },
  ],
  customers: [
    {
      id: 'cust_1',
      businessId: 'biz_p4',
      code: 'C001',
      name: 'Petshop Jaya',
      contactName: 'Rina',
      phone: '08123456789',
      address: 'Jl. Pahlawan No. 9',
      assignedSalesId: 'sales_1',
      creditBalance: BigInt(0),
      deletedAt: null,
    },
  ],
  products: [
    {
      id: 'prod_1',
      businessId: 'biz_p4',
      name: 'BentoCat Salmon 10kg',
      sku: 'BC-SLM-10',
      unit: 'Zak',
      basePrice: BigInt(100_000),
      minPrice: BigInt(90_000),
      costPrice: BigInt(70_000),
      stockQty: 25,
      reservedQty: 10,
      isActive: true,
      deletedAt: null,
    },
  ],
  orders: [] as MockOrder[],
  orderItems: [] as MockOrderItem[],
  orderRevisions: [] as MockOrderRevision[],
  invoices: [] as MockInvoice[],
  shipments: [] as MockShipment[],
  shipmentItems: [] as MockShipmentItem[],
  creditNotes: [] as MockCreditNote[],
  creditNoteItems: [] as MockCreditNoteItem[],
  notifications: [] as Record<string, unknown>[],
  auditLogs: [] as Record<string, unknown>[],
  stockMovements: [] as Record<string, unknown>[],
  counters: [{ id: 'cnt_sj', lastSeq: 0 }, { id: 'cnt_cn', lastSeq: 0 }],
}));

vi.mock('@/lib/pdf/logo', () => ({
  getLogoDataUri: vi.fn(async () => undefined),
}));

vi.mock('@/lib/pdf/DeliveryNoteDocument', () => ({
  DeliveryNoteDocument: (props: { data: Record<string, unknown> }) => {
    capturedPdfData.lastData = props.data;
    return null;
  },
}));

vi.mock('@/lib/pdf/engine', () => ({
  renderReactToPdf: vi.fn(async (element: { props?: { data?: Record<string, unknown> } }) => {
    capturedPdfData.lastData = element?.props?.data ?? null;
    return Buffer.from('%PDF-1.4\n%MockSJ\n');
  }),
  renderReactToHtml: vi.fn(() => '<html><body>SJ</body></html>'),
}));

vi.mock('@/lib/services/stock', () => ({
  shipOrderStock: vi.fn(async (_tx: unknown, _order: unknown, items: Array<{ productId: string; qty: number }>) => {
    for (const item of items) {
      const prod = db.products.find((p) => p.id === item.productId);
      if (prod) {
        prod.stockQty -= item.qty;
        prod.reservedQty = Math.max(0, prod.reservedQty - item.qty);
      }
    }
  }),
  restockFromCreditNote: vi.fn(async () => {}),
  lockProducts: vi.fn(async () => {}),
  reserveOrderStock: vi.fn(async () => {}),
  releaseOrderStock: vi.fn(async () => {}),
}));

vi.mock('@/lib/services/orderGuard', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/services/orderGuard')>();
  return {
    ...actual,
    lockOrder: vi.fn(async () => {}),
  };
});

vi.mock('@/lib/services/order', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/services/order')>();
  return {
    ...actual,
    lockOrder: vi.fn(async () => {}),
    reserveCustomerCredit: vi.fn(async () => {}),
    releaseCustomerCredit: vi.fn(async () => {}),
  };
});

vi.mock('@/lib/db', () => {
  function attachOrder(ord: MockOrder) {
    return {
      ...ord,
      customer: db.customers.find((c) => c.id === ord.customerId) ?? null,
      business: db.business,
      items: db.orderItems
        .filter((oi) => oi.orderId === ord.id)
        .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)),
      shipment: db.shipments.find((s) => s.orderId === ord.id) ?? null,
    };
  }

  function attachShipment(s: MockShipment) {
    return {
      ...s,
      items: db.shipmentItems
        .filter((si) => si.shipmentId === s.id)
        .map((si) => ({
          ...si,
          orderItem: db.orderItems.find((oi) => oi.id === si.orderItemId) ?? null,
        })),
    };
  }

  interface MockPrismaClient {
    $transaction: <T>(cb: (tx: MockPrismaClient) => Promise<T>) => Promise<T>;
    $queryRaw: ReturnType<typeof vi.fn>;
    business: Record<string, ReturnType<typeof vi.fn>>;
    order: Record<string, ReturnType<typeof vi.fn>>;
    orderRevision: Record<string, ReturnType<typeof vi.fn>>;
    shipment: Record<string, ReturnType<typeof vi.fn>>;
    shipmentItem: Record<string, ReturnType<typeof vi.fn>>;
    invoice: Record<string, ReturnType<typeof vi.fn>>;
    creditNote: Record<string, ReturnType<typeof vi.fn>>;
    customerCreditEntry: Record<string, ReturnType<typeof vi.fn>>;
    notification: Record<string, ReturnType<typeof vi.fn>>;
    auditLog: Record<string, ReturnType<typeof vi.fn>>;
  }

  const client: MockPrismaClient = {
    $transaction: async <T>(cb: (tx: MockPrismaClient) => Promise<T>) => cb(client),
    $queryRaw: vi.fn(async () => {
      db.counters[0].lastSeq += 1;
      return [{ lastSeq: db.counters[0].lastSeq }];
    }),
    business: {
      findUnique: vi.fn(async () => db.business),
      findFirst: vi.fn(async () => db.business),
    },
    order: {
      findFirst: vi.fn(async (args?: WhereArg<{ id?: string; businessId?: string }>) => {
        const ord = db.orders.find(
          (o) =>
            (!args?.where?.id || o.id === args.where.id) &&
            (!args?.where?.businessId || o.businessId === args.where.businessId) &&
            !o.deletedAt
        );
        return ord ? attachOrder(ord) : null;
      }),
      findFirstOrThrow: vi.fn(async (args?: WhereArg<{ id?: string }>) => {
        const ord = db.orders.find((o) => o.id === args?.where?.id);
        if (!ord) throw new Error('Order not found');
        return attachOrder(ord);
      }),
      updateMany: vi.fn(
        async (
          args: UpdateArg<
            { id?: string; businessId?: string },
            {
              status?: OrderStatus;
              rev?: { increment?: number };
              creditTotal?: { increment?: bigint };
            }
          >
        ) => {
          const ord = db.orders.find(
            (o) => o.id === args?.where?.id && o.businessId === args?.where?.businessId
          );
          if (!ord) return { count: 0 };
          if (args.data.status !== undefined) ord.status = args.data.status;
          if (args.data.rev?.increment) ord.rev += args.data.rev.increment;
          if (args.data.creditTotal?.increment) {
            ord.creditTotal = ord.creditTotal + args.data.creditTotal.increment;
          }
          return { count: 1 };
        }
      ),
    },
    orderRevision: {
      findFirst: vi.fn(
        async (
          args?: WhereArg<{ orderId?: string; businessId?: string; status?: OrderRevisionStatus }>
        ) => {
          return (
            db.orderRevisions.find(
              (r) =>
                r.orderId === args?.where?.orderId &&
                r.businessId === args?.where?.businessId &&
                (!args?.where?.status || r.status === args.where.status)
            ) ?? null
          );
        }
      ),
    },
    shipment: {
      findMany: vi.fn(
        async (args?: WhereArg<{ orderId?: string; businessId?: string; id?: string }>) => {
          return db.shipments
            .filter(
              (s) =>
                s.orderId === args?.where?.orderId &&
                (!args?.where?.businessId || s.businessId === args.where.businessId) &&
                (!args?.where?.id || s.id === args.where.id)
            )
            .sort((a, b) => a.kloterNo - b.kloterNo)
            .map(attachShipment);
        }
      ),
      findFirst: vi.fn(
        async (args?: WhereArg<{ id?: string; orderId?: string; businessId?: string }>) => {
          const match = db.shipments.find(
            (s) =>
              (!args?.where?.id || s.id === args.where.id) &&
              (!args?.where?.orderId || s.orderId === args.where.orderId) &&
              (!args?.where?.businessId || s.businessId === args.where.businessId)
          );
          return match ? attachShipment(match) : null;
        }
      ),
      findFirstOrThrow: vi.fn(async (args?: WhereArg<{ id?: string }>) => {
        const match = db.shipments.find((s) => s.id === args?.where?.id);
        if (!match) throw new Error('Shipment not found');
        return attachShipment(match);
      }),
      create: vi.fn(async (args: CreateArg<Omit<MockShipment, 'id'>>) => {
        const now = new Date();
        const row = {
          id: `ship_${db.shipments.length + 1}`,
          transporterId: null,
          trackingNo: null,
          driverName: null,
          vehiclePlate: null,
          receiverName: null,
          deliveryNo: null,
          actualCost: BigInt(0),
          shippedAt: null,
          deliveredAt: null,
          notes: null,
          createdAt: now,
          updatedAt: now,
          ...args.data,
        } as unknown as MockShipment;
        db.shipments.push(row);
        return attachShipment(row);
      }),
      updateMany: vi.fn(
        async (args: UpdateArg<{ id?: string; businessId?: string }, Partial<MockShipment>>) => {
          const row = db.shipments.find(
            (s) => s.id === args?.where?.id && s.businessId === args?.where?.businessId
          );
          if (!row) return { count: 0 };
          Object.assign(row, args.data, { updatedAt: new Date() });
          return { count: 1 };
        }
      ),
    },
    shipmentItem: {
      createMany: vi.fn(
        async (args: CreateArg<Array<{ shipmentId: string; orderItemId: string; qty: number }>>) => {
          const rows = args.data;
          for (const r of rows) {
            db.shipmentItems.push({
              id: `si_${db.shipmentItems.length + 1}`,
              ...r,
            });
          }
          return { count: rows.length };
        }
      ),
    },
    invoice: {
      findMany: vi.fn(
        async (
          args?: WhereArg<{ orderId?: string; businessId?: string; status?: InvoiceStatus }>
        ) => {
          return db.invoices.filter(
            (i) =>
              i.orderId === args?.where?.orderId &&
              i.businessId === args?.where?.businessId &&
              !i.deletedAt &&
              (!args?.where?.status || i.status === args.where.status)
          );
        }
      ),
    },
    creditNote: {
      findMany: vi.fn(async (args?: WhereArg<{ orderId?: string }>) => {
        return db.creditNotes
          .filter((cn) => cn.orderId === args?.where?.orderId && !cn.voidedAt)
          .map((cn) => ({
            ...cn,
            items: db.creditNoteItems.filter((ci) => ci.creditNoteId === cn.id),
          }));
      }),
      findUniqueOrThrow: vi.fn(async (args?: WhereArg<{ id?: string }>) => {
        const cn = db.creditNotes.find((c) => c.id === args?.where?.id);
        if (!cn) throw new Error('CreditNote not found');
        return {
          ...cn,
          items: db.creditNoteItems.filter((ci) => ci.creditNoteId === cn.id),
        };
      }),
      create: vi.fn(
        async (
          args: CreateArg<
            Omit<MockCreditNote, 'id' | 'createdAt' | 'voidedAt'> & {
              items?: { create?: Array<Omit<MockCreditNoteItem, 'id' | 'creditNoteId'>> };
            }
          >
        ) => {
          const { items: itemsRel, ...restData } = args.data;
          const cn = {
            id: `cn_${db.creditNotes.length + 1}`,
            createdAt: new Date(),
            voidedAt: null,
            ...restData,
          } as unknown as MockCreditNote;
          const itemsCreate = itemsRel?.create ?? [];
          db.creditNotes.push(cn);
          for (const ci of itemsCreate) {
            db.creditNoteItems.push({
              id: `cni_${db.creditNoteItems.length + 1}`,
              creditNoteId: cn.id,
              ...ci,
            });
          }
          return {
            ...cn,
            items: db.creditNoteItems.filter((ci) => ci.creditNoteId === cn.id),
          };
        }
      ),
    },
    customerCreditEntry: {
      create: vi.fn(async (args: CreateArg<Record<string, unknown>>) => ({
        id: 'cce_1',
        ...args.data,
      })),
    },
    notification: {
      create: vi.fn(async (args: CreateArg<Record<string, unknown>>) => {
        const n = { id: `notif_${db.notifications.length + 1}`, ...args.data };
        db.notifications.push(n);
        return n;
      }),
    },
    auditLog: {
      create: vi.fn(async (args: CreateArg<Record<string, unknown>>) => {
        const a = { id: `audit_${db.auditLogs.length + 1}`, ...args.data };
        db.auditLogs.push(a);
        return a;
      }),
    },
  };

  return { prisma: client };
});

function makeCtx(role: Role): Ctx {
  const u = db.users.find((x) => x.role === role)!;
  return {
    user: { id: u.id, role: u.role, name: u.name, businessId: u.businessId },
    role: u.role,
    businessId: db.business.id,
    sessionId: `sess_${u.id}`,
    ip: '127.0.0.1',
  };
}

describe('Fase 4 Integration Tests — Kebijakan Pengiriman & Multi-Kloter Parsial', () => {
  beforeEach(() => {
    db.business.allowPartialShipment = true;
    db.business.allowShipBeforeFinalInvoice = false;
    db.business.requirePaidBeforeShip = false;
    db.products[0].stockQty = 25;
    db.products[0].reservedQty = 10;
    db.orderRevisions = [];
    db.shipments = [];
    db.shipmentItems = [];
    db.creditNotes = [];
    db.creditNoteItems = [];
    db.notifications = [];
    db.auditLogs = [];
    db.counters[0].lastSeq = 0;
    capturedPdfData.lastData = null;

    db.orders = [
      {
        id: 'ord_p4',
        businessId: 'biz_p4',
        orderNo: 'BC/SO/12/11/2026/0011',
        customerSeq: 1,
        orderDate: new Date('2026-11-12T00:00:00Z'),
        customerId: 'cust_1',
        salesId: 'sales_1',
        status: OrderStatus.AWAITING_FINAL_PAYMENT,
        subtotal: BigInt(1_000_000),
        discountTotal: BigInt(0),
        shippingCharge: BigInt(0),
        ppnEnabled: false,
        ppnRateBps: 0,
        ppnAmount: BigInt(0),
        grandTotal: BigInt(1_000_000),
        dpBps: 3000,
        dpAmount: BigInt(300_000),
        paidTotal: BigInt(300_000),
        creditTotal: BigInt(0),
        stockReserved: true,
        deliveryAddress: 'Jl. Pahlawan No. 9',
        version: 1,
        rev: 2,
        deletedAt: null,
      },
    ];
    db.orderItems = [
      {
        id: 'oi_1',
        businessId: 'biz_p4',
        orderId: 'ord_p4',
        productId: 'prod_1',
        productName: 'BentoCat Salmon 10kg',
        sku: 'BC-SLM-10',
        unit: 'Zak',
        qty: 10,
        unitPrice: BigInt(100_000),
        listPrice: BigInt(100_000),
        lineSubtotal: BigInt(1_000_000),
        lineDiscount: BigInt(0),
        lineNet: BigInt(1_000_000),
        costPrice: BigInt(70_000),
        floorPrice: BigInt(90_000),
        belowMin: false,
        sortOrder: 0,
      },
    ];
    db.invoices = [
      {
        id: 'inv_dp',
        businessId: 'biz_p4',
        orderId: 'ord_p4',
        type: InvoiceType.DP,
        status: InvoiceStatus.APPROVED,
        number: 'BC/INV-DP/12/11/2026/0001',
        amount: BigInt(300_000),
        deletedAt: null,
      },
    ];
  });

  it('Menegakkan toggle allowPartialShipment, allowShipBeforeFinalInvoice, requirePaidBeforeShip, dan blokir REVISION_PENDING', async () => {
    const adminCtx = makeCtx(Role.SUPERADMIN);

    // 1. allowPartialShipment = false menolak pengiriman kurang dari sisa qty
    db.business.allowPartialShipment = false;
    await expect(
      shipOrder(
        (await import('@/lib/db')).prisma as never,
        adminCtx,
        'ord_p4',
        { items: [{ orderItemId: 'oi_1', qty: 4 }] }
      )
    ).rejects.toMatchObject({ code: 'PARTIAL_SHIPMENT_DISABLED', status: 409 });

    // 2. IN_PROCESS ditolak jika allowShipBeforeFinalInvoice = false
    db.orders[0].status = OrderStatus.IN_PROCESS;
    db.business.allowPartialShipment = true;
    db.business.allowShipBeforeFinalInvoice = false;
    await expect(
      shipOrder(
        (await import('@/lib/db')).prisma as never,
        adminCtx,
        'ord_p4',
        { items: [{ orderItemId: 'oi_1', qty: 4 }] }
      )
    ).rejects.toMatchObject({ code: 'INVALID_STATE', status: 409 });

    // 3. Jika allowShipBeforeFinalInvoice = true tetapi requirePaidBeforeShip = true dan belum lunas -> PAYMENT_REQUIRED
    db.business.allowShipBeforeFinalInvoice = true;
    db.business.requirePaidBeforeShip = true;
    await expect(
      shipOrder(
        (await import('@/lib/db')).prisma as never,
        adminCtx,
        'ord_p4',
        { items: [{ orderItemId: 'oi_1', qty: 4 }] }
      )
    ).rejects.toMatchObject({ code: 'PAYMENT_REQUIRED', status: 409 });

    // 4. Jika ada revisi PENDING_APPROVAL -> REVISION_PENDING
    db.business.requirePaidBeforeShip = false;
    db.orderRevisions.push({
      id: 'rev_pending',
      businessId: 'biz_p4',
      orderId: 'ord_p4',
      status: OrderRevisionStatus.PENDING_APPROVAL,
    });
    await expect(
      shipOrder(
        (await import('@/lib/db')).prisma as never,
        adminCtx,
        'ord_p4',
        { items: [{ orderItemId: 'oi_1', qty: 4 }] }
      )
    ).rejects.toMatchObject({ code: 'REVISION_PENDING', status: 409 });

    // 5. Tanpa revisi pending dan allowShipBeforeFinalInvoice = true -> sukses kirim kloter pertama dari IN_PROCESS
    db.orderRevisions = [];
    const k1 = await shipOrder(
      (await import('@/lib/db')).prisma as never,
      adminCtx,
      'ord_p4',
      { items: [{ orderItemId: 'oi_1', qty: 3 }] }
    );
    expect(k1.kloterNo).toBe(1);
    expect(k1.status).toBe(ShipStatus.SHIPPED);
    expect(k1.deliveryNo).toBeTruthy();
    expect(k1.deliveryNo?.endsWith('-K2')).toBe(false);
    expect(db.products[0].stockQty).toBe(22);
    expect(db.products[0].reservedQty).toBe(7);
  });

  it('Multi-kloter (4 + 6), OVER_SHIP_QTY ditolak, Credit Note dibatasi qty terkirim, dan maybeComplete menunggu semua kloter terkirim', async () => {
    const prisma = (await import('@/lib/db')).prisma as never;
    const adminCtx = makeCtx(Role.SUPERADMIN);

    // Pesanan sudah lunas penuh namun dikirim bertahap
    db.orders[0].paidTotal = BigInt(1_000_000);

    // Kloter 1: kirim 4 dari 10 Zak
    const k1 = await shipOrder(prisma, adminCtx, 'ord_p4', {
      items: [{ orderItemId: 'oi_1', qty: 4 }],
    });
    expect(k1.kloterNo).toBe(1);
    expect(k1.deliveryNo).toBeTruthy();
    expect(k1.items?.[0].qty).toBe(4);
    expect(db.products[0].stockQty).toBe(21);
    expect(db.products[0].reservedQty).toBe(6);

    // Belum COMPLETE karena sisa 6 unit belum dikirim
    await maybeComplete(prisma, adminCtx, 'ord_p4');
    expect(db.orders[0].status).toBe(OrderStatus.AWAITING_FINAL_PAYMENT);

    // Over-ship 7 unit (sisa hanya 6) ditolak 422 OVER_SHIP_QTY
    await expect(
      shipOrder(prisma, adminCtx, 'ord_p4', {
        items: [{ orderItemId: 'oi_1', qty: 7 }],
      })
    ).rejects.toMatchObject({ code: 'OVER_SHIP_QTY', status: 422 });

    // Credit Note 6 unit sebelum Kloter 2 dikirim harus ditolak karena baru terkirim 4
    await expect(
      createCreditNote(prisma, adminCtx, 'ord_p4', {
        reason: 'Rusak saat pengiriman kloter 1',
        settlement: CreditSettlement.CUSTOMER_CREDIT,
        items: [{ orderItemId: 'oi_1', qty: 6, restock: false }],
      })
    ).rejects.toMatchObject({ status: 422 });

    // Credit Note 2 unit (<= 4 terkirim) sukses
    const cn = await createCreditNote(prisma, adminCtx, 'ord_p4', {
      reason: 'Rusak 2 zak kloter 1',
      settlement: CreditSettlement.CUSTOMER_CREDIT,
      items: [{ orderItemId: 'oi_1', qty: 2, restock: false }],
    });
    expect(cn.total).toBe(200_000);

    // Kloter 2: kirim sisa 6 Zak -> deliveryNo unik -K2, reservedQty 0, order COMPLETE (lunas + semua terkirim)
    const k2 = await shipOrder(prisma, adminCtx, 'ord_p4', {
      items: [{ orderItemId: 'oi_1', qty: 6 }],
    });
    expect(k2.kloterNo).toBe(2);
    expect(k2.deliveryNo).toBe(`${k1.deliveryNo}-K2`);
    expect(k2.items?.[0].qty).toBe(6);
    expect(db.products[0].stockQty).toBe(15);
    expect(db.products[0].reservedQty).toBe(0);
    expect(db.orders[0].status).toBe(OrderStatus.COMPLETED);

    // Deliver per shipmentId masing-masing
    const del1 = await deliverOrder(prisma, adminCtx, 'ord_p4', {
      shipmentId: k1.id,
      receiverName: 'Penerima Kloter 1',
    });
    expect(del1.status).toBe(ShipStatus.DELIVERED);
    const listed = await listOrderShipments(prisma, adminCtx, 'ord_p4');
    expect(listed.shipments).toHaveLength(2);
    expect(listed.itemProgress[0]).toMatchObject({ orderedQty: 10, shippedQty: 10, remainingQty: 0 });
  });

  it('PDF Surat Jalan (?shipmentId=) merender qty kloter tersebut & catatan Kloter #N', async () => {
    const prisma = (await import('@/lib/db')).prisma as never;
    const adminCtx = makeCtx(Role.SUPERADMIN);
    vi.spyOn(contextModule, 'requireContext').mockResolvedValue(adminCtx);
    vi.spyOn(contextModule, 'requireBusiness').mockReturnValue('biz_p4');

    const k1 = await shipOrder(prisma, adminCtx, 'ord_p4', {
      items: [{ orderItemId: 'oi_1', qty: 4 }],
    });
    const k2 = await shipOrder(prisma, adminCtx, 'ord_p4', {
      items: [{ orderItemId: 'oi_1', qty: 6 }],
    });

    const req1 = new NextRequest(`http://localhost/api/v1/orders/ord_p4/delivery-note/pdf?shipmentId=${k1.id}`);
    const res1 = await getDeliveryNotePdf(req1, { params: Promise.resolve({ id: 'ord_p4' }) });
    expect(res1.status).toBe(200);
    expect((capturedPdfData.lastData?.items as Array<{ qty: number }>)[0].qty).toBe(4);
    expect(capturedPdfData.lastData?.deliveryNo).toBe(k1.deliveryNo);

    const req2 = new NextRequest(`http://localhost/api/v1/orders/ord_p4/delivery-note/pdf?shipmentId=${k2.id}`);
    const res2 = await getDeliveryNotePdf(req2, { params: Promise.resolve({ id: 'ord_p4' }) });
    expect(res2.status).toBe(200);
    const items2 = capturedPdfData.lastData?.items as Array<{ qty: number; note?: string | null }>;
    expect(items2[0].qty).toBe(6);
    expect(String(items2[0].note)).toContain('Kloter #2');
  });
});
