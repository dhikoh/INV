import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import {
  Role,
  OrderStatus,
  OrderRevisionStatus,
  InvoiceType,
  InvoiceStatus,
  DiscountType,
  DiscountSource,
  ShipStatus,
} from '@prisma/client';
import type { Ctx } from '@/lib/auth/context';
import * as contextModule from '@/lib/auth/context';
import {
  submitOrderRevision,
  approveOrderRevision,
  rejectOrderRevision,
} from '@/lib/services/revision';
import { requestFinalOrder } from '@/lib/services/order';
import {
  GET as getRevisionsRoute,
  POST as postRevisionRoute,
} from '@/app/api/v1/orders/[id]/revisions/route';
import { POST as approveRevisionRoute } from '@/app/api/v1/order-revisions/[id]/approve/route';
import { POST as rejectRevisionRoute } from '@/app/api/v1/order-revisions/[id]/reject/route';

interface MockOrder {
  id: string;
  businessId: string;
  customerId: string;
  deletedAt: Date | null;
  rev?: number;
  [key: string]: unknown;
}

interface MockOrderItem {
  id: string;
  orderId: string;
  businessId?: string;
  [key: string]: unknown;
}

interface MockOrderRevision {
  id: string;
  orderId: string;
  businessId: string;
  revisionNo: number;
  status: OrderRevisionStatus;
  [key: string]: unknown;
}

interface MockOrderRevisionItem {
  id: string;
  revisionId: string;
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
  status: ShipStatus;
  [key: string]: unknown;
}

type WhereArg<T = Record<string, unknown>> = { where: T; include?: { items?: boolean; customer?: boolean } };
type UpdateArg<W = Record<string, unknown>, D = Record<string, unknown>> = { where: W; data: D };
type CreateArg<D = Record<string, unknown>> = { data: D };
type ServiceTx = Parameters<typeof submitOrderRevision>[0];

const db = vi.hoisted(() => ({
  business: {
    id: 'biz_p3',
    code: 'BC',
    name: 'BentoCat',
    ppnEnabled: false,
    ppnRateBps: 1100,
    defaultDpBps: 3000,
    allowNegativeStock: false,
    allowPriceBelowMin: true,
    commissionMode: 'PROFIT',
  },
  users: [
    { id: 'sa_1', businessId: 'biz_p3', role: 'SUPERADMIN' as Role, name: 'Super Admin', isActive: true },
    { id: 'sales_1', businessId: 'biz_p3', role: 'SALES' as Role, name: 'Sales Andi', isActive: true },
    { id: 'sales_2', businessId: 'biz_p3', role: 'SALES' as Role, name: 'Sales Budi', isActive: true },
  ],
  customers: [
    {
      id: 'cust_1',
      businessId: 'biz_p3',
      code: 'C001',
      name: 'Petshop Makmur',
      assignedSalesId: 'sales_1',
      address: 'Jl. Merdeka 10',
      priceListId: null,
      deletedAt: null,
    },
  ],
  products: [
    {
      id: 'prod_a',
      businessId: 'biz_p3',
      name: 'BentoCat Tuna 5kg',
      sku: 'BC-TUN-5',
      unit: 'Zak',
      basePrice: BigInt(100000),
      minPrice: BigInt(90000),
      costPrice: BigInt(70000),
      stockQty: 20,
      reservedQty: 5,
      isActive: true,
      deletedAt: null,
    },
    {
      id: 'prod_b',
      businessId: 'biz_p3',
      name: 'BentoCat Chicken 5kg',
      sku: 'BC-CHK-5',
      unit: 'Zak',
      basePrice: BigInt(120000),
      minPrice: BigInt(100000),
      costPrice: BigInt(80000),
      stockQty: 10,
      reservedQty: 4,
      isActive: true,
      deletedAt: null,
    },
  ],
  orders: [] as MockOrder[],
  orderItems: [] as MockOrderItem[],
  orderRevisions: [] as MockOrderRevision[],
  orderRevisionItems: [] as MockOrderRevisionItem[],
  invoices: [] as MockInvoice[],
  shipments: [] as MockShipment[],
  notifications: [] as Record<string, unknown>[],
  auditLogs: [] as Record<string, unknown>[],
  commissions: [] as Record<string, unknown>[],
  counters: [{ id: 'cnt_inv', lastSeq: 10 }],
}));

vi.mock('@/lib/services/commission', () => ({
  evaluateOrderCommission: vi.fn(async () => {}),
  reverseOrderCommission: vi.fn(async () => {}),
}));

vi.mock('@/lib/domain/numbering', async () => {
  const actual = await vi.importActual<typeof import('@/lib/domain/numbering')>('@/lib/domain/numbering');
  return {
    ...actual,
    nextSequence: vi.fn(async () => {
      db.counters[0].lastSeq += 1;
      return db.counters[0].lastSeq;
    }),
  };
});

interface MockTxClient {
  $queryRawUnsafe: ReturnType<typeof vi.fn>;
  $queryRaw: ReturnType<typeof vi.fn>;
  business: Record<string, ReturnType<typeof vi.fn>>;
  user: Record<string, ReturnType<typeof vi.fn>>;
  customer: Record<string, ReturnType<typeof vi.fn>>;
  customerMinPrice: Record<string, ReturnType<typeof vi.fn>>;
  customerPromo: Record<string, ReturnType<typeof vi.fn>>;
  customerProductPrice: Record<string, ReturnType<typeof vi.fn>>;
  priceListItem: Record<string, ReturnType<typeof vi.fn>>;
  promo: Record<string, ReturnType<typeof vi.fn>>;
  product: Record<string, ReturnType<typeof vi.fn>>;
  order: Record<string, ReturnType<typeof vi.fn>>;
  orderItem: Record<string, ReturnType<typeof vi.fn>>;
  orderRevision: Record<string, ReturnType<typeof vi.fn>>;
  shipment: Record<string, ReturnType<typeof vi.fn>>;
  invoice: Record<string, ReturnType<typeof vi.fn>>;
  notification: Record<string, ReturnType<typeof vi.fn>>;
  auditLog: Record<string, ReturnType<typeof vi.fn>>;
}

function createTx(): MockTxClient {
  const tx: MockTxClient = {
    $queryRawUnsafe: vi.fn(async () => []),
    $queryRaw: vi.fn(async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const sql = strings.join(' ');
      if (sql.includes('FROM "Order"')) {
        const orderId = String(values[0] ?? '');
        const found = db.orders.find((o) => o.id === orderId && o.deletedAt === null);
        return found ? [{ id: found.id }] : [];
      }
      if (sql.includes('FROM "Product"')) {
        return db.products.map((p) => ({ id: p.id }));
      }
      return [{ id: 'locked' }];
    }),
    business: {
      findFirstOrThrow: vi.fn(async () => db.business),
      findFirst: vi.fn(async () => db.business),
      findUnique: vi.fn(async () => db.business),
    },
    user: {
      findMany: vi.fn(async ({ where }: WhereArg<{ role?: Role; isActive?: boolean }>) =>
        db.users.filter((u) => (!where?.role || u.role === where.role) && (!where?.isActive || u.isActive))
      ),
    },
    customer: {
      findFirst: vi.fn(async ({ where }: WhereArg<{ id?: string; businessId?: string }>) =>
        db.customers.find((c) => c.id === where.id && c.businessId === where.businessId) ?? null
      ),
    },
    customerMinPrice: {
      findMany: vi.fn(async () => []),
    },
    customerPromo: {
      findMany: vi.fn(async () => []),
    },
    customerProductPrice: {
      findMany: vi.fn(async () => []),
    },
    priceListItem: {
      findMany: vi.fn(async () => []),
    },
    promo: {
      findMany: vi.fn(async () => []),
    },
    product: {
      findMany: vi.fn(async ({ where }: WhereArg<{ businessId?: string; id?: { in?: string[] } }>) => {
        const ids = where?.id?.in;
        return db.products.filter((p) => p.businessId === where.businessId && (!ids || ids.includes(p.id)));
      }),
      updateMany: vi.fn(
        async ({
          where,
          data,
        }: UpdateArg<{ id: string; businessId: string }, { reservedQty?: { increment?: number } }>) => {
          let count = 0;
          for (const p of db.products) {
            if (p.id === where.id && p.businessId === where.businessId) {
              if (typeof data.reservedQty?.increment === 'number') {
                p.reservedQty += data.reservedQty.increment;
              }
              count += 1;
            }
          }
          return { count };
        }
      ),
    },
    order: {
      findFirst: vi.fn(
        async ({
          where,
          include,
        }: WhereArg<{ id?: string; businessId?: string; deletedAt?: Date | null }>) => {
          const row = db.orders.find(
            (o) =>
              o.id === where.id &&
              o.businessId === where.businessId &&
              (where.deletedAt !== null || o.deletedAt === null)
          );
          if (!row) return null;
          return {
            ...row,
            ...(include?.items ? { items: db.orderItems.filter((i) => i.orderId === row.id) } : {}),
            ...(include?.customer ? { customer: db.customers.find((c) => c.id === row.customerId) } : {}),
          };
        }
      ),
      findFirstOrThrow: vi.fn(async ({ where, include }: WhereArg<{ id?: string; businessId?: string }>) => {
        const row = db.orders.find(
          (o) => o.id === where.id && o.businessId === where.businessId && o.deletedAt === null
        );
        if (!row) throw new Error('Order not found');
        return {
          ...row,
          ...(include?.items ? { items: db.orderItems.filter((i) => i.orderId === row.id) } : {}),
          ...(include?.customer ? { customer: db.customers.find((c) => c.id === row.customerId) } : {}),
        };
      }),
      updateMany: vi.fn(async ({ where, data }: UpdateArg<{ id: string; businessId: string }, Record<string, unknown>>) => {
        let count = 0;
        for (const o of db.orders) {
          if (o.id === where.id && o.businessId === where.businessId) {
            for (const [k, v] of Object.entries(data)) {
              if (v && typeof v === 'object' && 'increment' in v) {
                const inc = (v as { increment: number }).increment;
                o[k] = Number(o[k] ?? 0) + Number(inc);
              } else {
                o[k] = v;
              }
            }
            count += 1;
          }
        }
        return { count };
      }),
    },
    orderItem: {
      deleteMany: vi.fn(async ({ where }: WhereArg<{ orderId?: string; businessId?: string }>) => {
        const before = db.orderItems.length;
        db.orderItems = db.orderItems.filter(
          (it) => !(it.orderId === where.orderId && it.businessId === where.businessId)
        );
        return { count: before - db.orderItems.length };
      }),
      createMany: vi.fn(async ({ data }: CreateArg<Array<Omit<MockOrderItem, 'id'>>>) => {
        data.forEach((row, idx) => {
          db.orderItems.push({ ...row, id: `oi_new_${Date.now()}_${idx}` } as MockOrderItem);
        });
        return { count: data.length };
      }),
    },
    orderRevision: {
      findFirst: vi.fn(
        async ({
          where,
          include,
        }: WhereArg<{ id?: string; orderId?: string; businessId?: string; status?: OrderRevisionStatus }>) => {
          const found = db.orderRevisions.find(
            (r) =>
              (!where.id || r.id === where.id) &&
              (!where.orderId || r.orderId === where.orderId) &&
              (!where.businessId || r.businessId === where.businessId) &&
              (!where.status || r.status === where.status)
          );
          if (!found) return null;
          return {
            ...found,
            ...(include?.items
              ? { items: db.orderRevisionItems.filter((i) => i.revisionId === found.id) }
              : {}),
          };
        }
      ),
      findFirstOrThrow: vi.fn(
        async ({ where, include }: WhereArg<{ id: string; businessId: string }>) => {
          const found = db.orderRevisions.find(
            (r) => r.id === where.id && r.businessId === where.businessId
          );
          if (!found) throw new Error('Revision not found');
          return {
            ...found,
            ...(include?.items
              ? { items: db.orderRevisionItems.filter((i) => i.revisionId === found.id) }
              : {}),
          };
        }
      ),
      findMany: vi.fn(
        async ({
          where,
          include,
        }: WhereArg<{ orderId?: string; businessId?: string; status?: OrderRevisionStatus }>) => {
          return db.orderRevisions
            .filter(
              (r) =>
                (!where.orderId || r.orderId === where.orderId) &&
                (!where.businessId || r.businessId === where.businessId) &&
                (!where.status || r.status === where.status)
            )
            .sort((a, b) => b.revisionNo - a.revisionNo)
            .map((r) => ({
              ...r,
              ...(include?.items
                ? { items: db.orderRevisionItems.filter((i) => i.revisionId === r.id) }
                : {}),
            }));
        }
      ),
      count: vi.fn(async ({ where }: WhereArg<{ orderId?: string; businessId?: string }>) =>
        db.orderRevisions.filter((r) => r.orderId === where.orderId && r.businessId === where.businessId).length
      ),
      create: vi.fn(
        async ({
          data,
        }: CreateArg<
          Omit<MockOrderRevision, 'id'> & {
            overrideNote?: string | null;
            rejectReason?: string | null;
            items?: { create?: Array<Omit<MockOrderRevisionItem, 'id' | 'revisionId'>> };
          }
        >) => {
          const now = new Date();
          const revId = `rev_${db.orderRevisions.length + 1}`;
          const { items: itemsRel, ...rest } = data;
          const itemsToCreate = itemsRel?.create ?? [];
          const createdRev = {
            ...rest,
            id: revId,
            overrideNote: rest.overrideNote ?? null,
            rejectReason: rest.rejectReason ?? null,
            requestedAt: now,
            reviewedById: null,
            reviewedAt: null,
            createdAt: now,
          } as unknown as MockOrderRevision;
          db.orderRevisions.push(createdRev);
          const createdItems = itemsToCreate.map((it, idx) => {
            const item = { ...it, id: `rvi_${revId}_${idx}`, revisionId: revId } as MockOrderRevisionItem;
            db.orderRevisionItems.push(item);
            return item;
          });
          return { ...createdRev, items: createdItems };
        }
      ),
      updateMany: vi.fn(
        async ({
          where,
          data,
        }: UpdateArg<{ id: string; businessId: string; status?: OrderRevisionStatus }, Partial<MockOrderRevision>>) => {
          let count = 0;
          for (const r of db.orderRevisions) {
            if (
              r.id === where.id &&
              r.businessId === where.businessId &&
              (!where.status || r.status === where.status)
            ) {
              Object.assign(r, data);
              count += 1;
            }
          }
          return { count };
        }
      ),
    },
    shipment: {
      findFirst: vi.fn(
        async ({
          where,
        }: WhereArg<{ orderId?: string; businessId?: string; status?: { in?: ShipStatus[] } }>) =>
          db.shipments.find(
            (s) =>
              s.orderId === where.orderId &&
              s.businessId === where.businessId &&
              (!where.status?.in || where.status.in.includes(s.status))
          ) ?? null
      ),
    },
    invoice: {
      findFirst: vi.fn(
        async ({
          where,
        }: WhereArg<{
          orderId?: string;
          businessId?: string;
          type?: InvoiceType;
          status?: { in?: InvoiceStatus[] };
        }>) =>
          db.invoices.find(
            (inv) =>
              inv.orderId === where.orderId &&
              inv.businessId === where.businessId &&
              (!where.type || inv.type === where.type) &&
              (!where.status?.in || where.status.in.includes(inv.status)) &&
              inv.deletedAt === null
          ) ?? null
      ),
      findFirstOrThrow: vi.fn(async ({ where }: WhereArg<{ id: string; businessId: string }>) => {
        const inv = db.invoices.find((i) => i.id === where.id && i.businessId === where.businessId);
        if (!inv) throw new Error('Invoice not found');
        return inv;
      }),
      count: vi.fn(
        async ({
          where,
        }: WhereArg<{
          orderId?: string;
          businessId?: string;
          type?: InvoiceType;
          status?: { in?: InvoiceStatus[] };
        }>) =>
          db.invoices.filter(
            (inv) =>
              inv.orderId === where.orderId &&
              inv.businessId === where.businessId &&
              (!where.type || inv.type === where.type) &&
              (!where.status?.in || where.status.in.includes(inv.status)) &&
              inv.deletedAt === null
          ).length
      ),
      create: vi.fn(async ({ data }: CreateArg<Omit<MockInvoice, 'id' | 'deletedAt'>>) => {
        const created = {
          ...data,
          id: `inv_${db.invoices.length + 1}`,
          createdAt: new Date(),
          deletedAt: null,
        } as unknown as MockInvoice;
        db.invoices.push(created);
        return created;
      }),
    },
    notification: {
      create: vi.fn(async ({ data }: CreateArg<Record<string, unknown>>) => {
        db.notifications.push({ id: `notif_${db.notifications.length + 1}`, ...data });
        return data;
      }),
    },
    auditLog: {
      create: vi.fn(async ({ data }: CreateArg<Record<string, unknown>>) => {
        db.auditLogs.push({ id: `audit_${db.auditLogs.length + 1}`, ...data });
        return data;
      }),
    },
  };
  return tx;
}

const txMock = createTx();

vi.mock('@/lib/db', () => ({
  prisma: {
    $transaction: vi.fn(async <T>(cb: (tx: MockTxClient) => Promise<T>) => cb(txMock)),
    order: {
      findFirst: (args: WhereArg<{ id?: string; businessId?: string; deletedAt?: Date | null }>) =>
        txMock.order.findFirst(args),
    },
    orderRevision: {
      findMany: (args: WhereArg<{ orderId?: string; businessId?: string; status?: OrderRevisionStatus }>) =>
        txMock.orderRevision.findMany(args),
    },
  },
}));

function makeCtx(role: Role, userId: string): Ctx {
  return {
    user: {
      id: userId,
      name: userId === 'sa_1' ? 'Super Admin' : userId === 'sales_1' ? 'Sales Andi' : 'Sales Budi',
      role,
      businessId: 'biz_p3',
    },
    role,
    businessId: 'biz_p3',
    sessionId: `sess_${userId}`,
    ip: '127.0.0.1',
  };
}

const salesCtx = makeCtx(Role.SALES, 'sales_1');
const otherSalesCtx = makeCtx(Role.SALES, 'sales_2');
const adminCtx = makeCtx(Role.SUPERADMIN, 'sa_1');

describe('Fase 3 Integration Tests — Workflow Revisi Item Saat IN_PROCESS', () => {
  beforeEach(() => {
    db.products[0].stockQty = 20;
    db.products[0].reservedQty = 5;
    db.products[1].stockQty = 10;
    db.products[1].reservedQty = 4;

    db.orders = [
      {
        id: 'ord_inproc',
        businessId: 'biz_p3',
        orderNo: 'BC/SO/12/11/2026/0001',
        customerId: 'cust_1',
        salesId: 'sales_1',
        status: OrderStatus.IN_PROCESS,
        subtotal: BigInt(980000),
        discountTotal: BigInt(0),
        shippingCharge: BigInt(20000),
        ppnEnabled: false,
        ppnRateBps: 1100,
        ppnAmount: BigInt(0),
        grandTotal: BigInt(1000000),
        dpBps: 3000,
        dpAmount: BigInt(300000),
        paidTotal: BigInt(300000),
        creditTotal: BigInt(0),
        stockReserved: true,
        deliveryAddress: 'Jl. Merdeka 10',
        hasBelowMin: false,
        belowMinReason: null,
        overrideNote: null,
        version: 1,
        rev: 3,
        deletedAt: null,
      },
    ];

    // Item awal: 5 x prod_a (@100k = 500k) + 4 x prod_b (@120k = 480k) = 980k + 20k ongkir = 1.000.000
    db.orderItems = [
      {
        id: 'oi_1',
        businessId: 'biz_p3',
        orderId: 'ord_inproc',
        productId: 'prod_a',
        productName: 'BentoCat Tuna 5kg',
        sku: 'BC-TUN-5',
        unit: 'Zak',
        qty: 5,
        listPrice: BigInt(100000),
        unitPrice: BigInt(100000),
        discountType: DiscountType.NONE,
        discountValue: BigInt(0),
        discountSource: DiscountSource.MANUAL,
        lineSubtotal: BigInt(500000),
        lineDiscount: BigInt(0),
        lineNet: BigInt(500000),
        costPrice: BigInt(70000),
        floorPrice: BigInt(90000),
        belowMin: false,
        sortOrder: 0,
      },
      {
        id: 'oi_2',
        businessId: 'biz_p3',
        orderId: 'ord_inproc',
        productId: 'prod_b',
        productName: 'BentoCat Chicken 5kg',
        sku: 'BC-CHK-5',
        unit: 'Zak',
        qty: 4,
        listPrice: BigInt(120000),
        unitPrice: BigInt(120000),
        discountType: DiscountType.NONE,
        discountValue: BigInt(0),
        discountSource: DiscountSource.MANUAL,
        lineSubtotal: BigInt(480000),
        lineDiscount: BigInt(0),
        lineNet: BigInt(480000),
        costPrice: BigInt(80000),
        floorPrice: BigInt(100000),
        belowMin: false,
        sortOrder: 1,
      },
    ];

    db.orderRevisions = [];
    db.orderRevisionItems = [];
    db.invoices = [];
    db.shipments = [];
    db.notifications = [];
    db.auditLogs = [];
  });

  it('Sales mengajukan revisi tambah/kurang item -> disetujui Super Admin -> delta reservedQty akurat & DP tetap aman', async () => {
    const svcTx = txMock as unknown as ServiceTx;
    // Sales ubah: prod_a 5 -> 8 (+3), prod_b 4 -> 2 (-2), ongkir 20k -> 30k
    // Total baru = 800k + 240k + 30k = 1.070.000
    const submitted = await submitOrderRevision(svcTx, salesCtx, 'ord_inproc', {
      rev: 3,
      reason: 'Customer tambah 3 zak Tuna dan kurangi Chicken 2 zak',
      shippingCharge: 30000,
      items: [
        { productId: 'prod_a', qty: 8, unitPrice: 100000 },
        { productId: 'prod_b', qty: 2, unitPrice: 120000 },
      ],
    });

    expect(submitted.status).toBe(OrderRevisionStatus.PENDING_APPROVAL);
    expect(submitted.newGrandTotal).toBe(1070000);
    expect(submitted.deltaGrandTotal).toBe(70000);
    // HPP tidak bocor ke Sales
    expect(submitted.items[0].costPrice).toBeUndefined();
    // Stok reserved BELUM berubah sebelum approve
    expect(db.products[0].reservedQty).toBe(5);
    expect(db.products[1].reservedQty).toBe(4);
    expect(db.orders[0].rev).toBe(4);
    expect(db.notifications.some((n) => n.userId === 'sa_1' && n.type === 'APPROVAL_REQUEST')).toBe(true);

    // Ajukan final invoice saat revisi masih pending wajib diblokir 409
    await expect(
      requestFinalOrder(svcTx, salesCtx, 'ord_inproc', {})
    ).rejects.toMatchObject({ code: 'REVISION_PENDING', status: 409 });

    // Super Admin menyetujui revisi via endpoint API POST /approve
    vi.spyOn(contextModule, 'requireContext').mockResolvedValue(adminCtx);
    const approveReq = new NextRequest('http://localhost/api/v1/order-revisions/rev_1/approve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', origin: 'http://localhost' },
      body: JSON.stringify({ overrideNote: 'Disetujui sesuai stok gudang' }),
    });
    const approveRes = await approveRevisionRoute(approveReq, {
      params: Promise.resolve({ id: submitted.id }),
    });
    expect(approveRes.status).toBe(200);
    const approveBody = await approveRes.json();
    expect(approveBody.data.status).toBe(OrderRevisionStatus.APPROVED);
    expect(approveBody.data.overrideNote).toBe('Disetujui sesuai stok gudang');

    // Delta stok reserved: prod_a 5 + 3 = 8, prod_b 4 - 2 = 2
    expect(db.products[0].reservedQty).toBe(8);
    expect(db.products[1].reservedQty).toBe(2);

    // Order diperbarui tanpa menghilangkan DP yang sudah terbayar
    expect(Number(db.orders[0].grandTotal)).toBe(1070000);
    expect(Number(db.orders[0].dpAmount)).toBe(300000);
    expect(Number(db.orders[0].paidTotal)).toBe(300000);
    expect(db.orders[0].version).toBe(2);

    // Concurrent second approval gagal 409
    await expect(
      approveOrderRevision(svcTx, adminCtx, submitted.id)
    ).rejects.toMatchObject({ code: 'REVISION_ALREADY_PROCESSED', status: 409 });

    // Ajukan pelunasan setelah revisi disetujui menghitung sisa dari newGrandTotal - settledDp = 1.070.000 - 300.000 = 770.000
    const finalRes = await requestFinalOrder(svcTx, salesCtx, 'ord_inproc', {});
    expect(finalRes.invoice.type).toBe(InvoiceType.FINAL);
    expect(finalRes.invoice.amount).toBe(770000);
    expect(finalRes.invoice.status).toBe(InvoiceStatus.PENDING_APPROVAL);
  });

  it('Menolak revisi mempertahankan item, total pesanan, dan reservasi stok seperti semula', async () => {
    const svcTx = txMock as unknown as ServiceTx;
    const rev = await submitOrderRevision(svcTx, salesCtx, 'ord_inproc', {
      rev: 3,
      reason: 'Revisi pengurangan drastis',
      shippingCharge: 20000,
      items: [{ productId: 'prod_a', qty: 4, unitPrice: 100000 }],
    });

    const rejected = await rejectOrderRevision(svcTx, adminCtx, rev.id, 'Customer berubah pikiran lewat telepon');
    expect(rejected.status).toBe(OrderRevisionStatus.REJECTED);
    expect(rejected.rejectReason).toBe('Customer berubah pikiran lewat telepon');

    expect(Number(db.orders[0].grandTotal)).toBe(1000000);
    expect(db.orderItems).toHaveLength(2);
    expect(db.products[0].reservedQty).toBe(5);
    expect(db.products[1].reservedQty).toBe(4);
    expect(db.notifications.some((n) => n.userId === 'sales_1' && n.type === 'ORDER_REVISION_REJECTED')).toBe(true);
  });

  it('Menjaga aturan batas: TOTAL_BELOW_PAID (422), INSUFFICIENT_STOCK (409), ITEM_ALREADY_SHIPPED (409), dan RBAC Sales (403)', async () => {
    const svcTx = txMock as unknown as ServiceTx;
    // 1. Isolasi Sales lain (403 FORBIDDEN pada service)
    await expect(
      submitOrderRevision(svcTx, otherSalesCtx, 'ord_inproc', {
        rev: 3,
        reason: 'Coba ubah order orang lain',
        shippingCharge: 0,
        items: [{ productId: 'prod_a', qty: 5, unitPrice: 100000 }],
      })
    ).rejects.toMatchObject({ status: 403 });

    // 2. Total baru < paidTotal (300.000) -> 422 TOTAL_BELOW_PAID
    await expect(
      submitOrderRevision(svcTx, salesCtx, 'ord_inproc', {
        rev: 3,
        reason: 'Turunkan jadi 2 zak saja',
        shippingCharge: 0,
        items: [{ productId: 'prod_a', qty: 2, unitPrice: 100000 }],
      })
    ).rejects.toMatchObject({ code: 'TOTAL_BELOW_PAID', status: 422 });

    // 3. Stok tidak cukup untuk kenaikan qty (prod_a stock 20, reserved 5 => available 15; butuh delta +18 -> 409 INSUFFICIENT_STOCK)
    await expect(
      submitOrderRevision(svcTx, salesCtx, 'ord_inproc', {
        rev: 3,
        reason: 'Tambah banyak sekali melebihi stok',
        shippingCharge: 0,
        items: [{ productId: 'prod_a', qty: 23, unitPrice: 100000 }],
      })
    ).rejects.toMatchObject({ code: 'INSUFFICIENT_STOCK', status: 409 });

    // 4. Sales tidak boleh memanggil route approve atau reject (403 FORBIDDEN)
    vi.spyOn(contextModule, 'requireContext').mockResolvedValue(salesCtx);
    const rejRes = await rejectRevisionRoute(
      new NextRequest('http://localhost/api/v1/order-revisions/rev_1/reject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', origin: 'http://localhost' },
        body: JSON.stringify({ reason: 'Coba reject sebagai sales' }),
      }),
      { params: Promise.resolve({ id: 'rev_1' }) }
    );
    expect(rejRes.status).toBe(403);

    // 5. Barang sudah SHIPPED mencegah penurunan qty di bawah qty terkirim
    db.shipments.push({
      id: 'ship_1',
      businessId: 'biz_p3',
      orderId: 'ord_inproc',
      status: ShipStatus.SHIPPED,
    });
    await expect(
      submitOrderRevision(svcTx, salesCtx, 'ord_inproc', {
        rev: 3,
        reason: 'Kurangi prod_a padahal sudah terkirim',
        shippingCharge: 20000,
        items: [
          { productId: 'prod_a', qty: 3, unitPrice: 100000 },
          { productId: 'prod_b', qty: 4, unitPrice: 120000 },
        ],
      })
    ).rejects.toMatchObject({ code: 'ITEM_ALREADY_SHIPPED', status: 409 });
  });

  it('Endpoint GET & POST /api/v1/orders/:id/revisions mengisolasi Sales dan menyaring field rahasia', async () => {
    vi.spyOn(contextModule, 'requireContext').mockResolvedValue(salesCtx);
    const postRes = await postRevisionRoute(
      new NextRequest('http://localhost/api/v1/orders/ord_inproc/revisions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', origin: 'http://localhost' },
        body: JSON.stringify({
          rev: 3,
          reason: 'Customer konfirmasi tambahan via WA',
          items: [
            { productId: 'prod_a', qty: 6, unitPrice: 100000 },
            { productId: 'prod_b', qty: 4, unitPrice: 120000 },
          ],
          shippingCharge: 20000,
        }),
      }),
      { params: Promise.resolve({ id: 'ord_inproc' }) }
    );
    expect(postRes.status).toBe(201);

    const getRes = await getRevisionsRoute(
      new NextRequest('http://localhost/api/v1/orders/ord_inproc/revisions'),
      { params: Promise.resolve({ id: 'ord_inproc' }) }
    );
    expect(getRes.status).toBe(200);
    const getBody = await getRes.json();
    expect(getBody.data.items).toHaveLength(1);
    expect(getBody.data.items[0].newGrandTotal).toBe(1100000);
    expect(getBody.data.items[0].items[0].costPrice).toBeUndefined();

    // Sales lain mendapat 404 agar order tidak terdeteksi
    vi.spyOn(contextModule, 'requireContext').mockResolvedValue(otherSalesCtx);
    const forbiddenGet = await getRevisionsRoute(
      new NextRequest('http://localhost/api/v1/orders/ord_inproc/revisions'),
      { params: Promise.resolve({ id: 'ord_inproc' }) }
    );
    expect(forbiddenGet.status).toBe(404);
  });
});
