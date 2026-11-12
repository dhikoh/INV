import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST as previewOrderHandler } from '@/app/api/v1/orders/preview/route';
import {
  GET as getOrdersHandler,
  POST as createOrderHandler,
} from '@/app/api/v1/orders/route';
import {
  GET as getOrderDetailHandler,
  PATCH as updateOrderHandler,
  DELETE as deleteOrderHandler,
} from '@/app/api/v1/orders/[id]/route';
import {
  Role,
  OrderStatus,
  DiscountSource,
  DiscountType,
} from '@prisma/client';
import * as contextModule from '@/lib/auth/context';
import { assertNoSecretKeys } from '../helpers/leak';

interface MockBusiness {
  id: string;
  code: string;
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
  assignedSalesId: string | null;
  deletedAt: Date | null;
}

interface MockProduct {
  id: string;
  businessId: string;
  sku: string;
  name: string;
  unit: string;
  basePrice: bigint;
  minPrice: bigint;
  costPrice: bigint;
  isActive: boolean;
  deletedAt: Date | null;
}

interface MockCustomerMinPrice {
  id: string;
  businessId: string;
  customerId: string;
  productId: string;
  minPrice: bigint;
}

interface MockCustomerPromo {
  id: string;
  businessId: string;
  customerId: string;
  productId: string | null;
  label: string;
  source: DiscountSource;
  type: DiscountType;
  valueBps: number | null;
  valueAmount: bigint | null;
  validFrom: Date;
  validTo: Date | null;
  isActive: boolean;
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
  items?: MockOrderItem[];
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
}

let businesses: MockBusiness[] = [];
let customers: MockCustomer[] = [];
let products: MockProduct[] = [];
let customerMinPrices: MockCustomerMinPrice[] = [];
let customerPromos: MockCustomerPromo[] = [];
let orders: MockOrder[] = [];
let orderItems: MockOrderItem[] = [];
let auditLogs: MockAuditLog[] = [];

vi.mock('@/lib/db', () => {
  const mockPrisma = {
    business: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
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
    },
    product: {
      findMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        return products.filter((p) => {
          if (where.businessId && p.businessId !== where.businessId) return false;
          if (where.deletedAt === null && p.deletedAt !== null) return false;
          if (where.isActive !== undefined && p.isActive !== where.isActive) return false;
          if (where.id && typeof where.id === 'object' && 'in' in (where.id as Record<string, unknown>)) {
            const inList = (where.id as { in: string[] }).in;
            if (!inList.includes(p.id)) return false;
          }
          return true;
        });
      }),
    },
    customerMinPrice: {
      findMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        return customerMinPrices.filter((mp) => {
          if (where.businessId && mp.businessId !== where.businessId) return false;
          if (where.customerId && mp.customerId !== where.customerId) return false;
          return true;
        });
      }),
    },
    customerPromo: {
      findMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        return customerPromos.filter((pr) => {
          if (where.businessId && pr.businessId !== where.businessId) return false;
          if (where.customerId && pr.customerId !== where.customerId) return false;
          if (where.deletedAt === null && pr.deletedAt !== null) return false;
          if (where.isActive !== undefined && pr.isActive !== where.isActive) return false;
          return true;
        });
      }),
    },
    order: {
      count: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        return orders.filter((o) => {
          if (where.businessId && o.businessId !== where.businessId) return false;
          if (where.deletedAt === null && o.deletedAt !== null) return false;
          if (where.salesId && o.salesId !== where.salesId) return false;
          if (where.customerId && o.customerId !== where.customerId) return false;
          if (where.status && o.status !== where.status) return false;
          return true;
        }).length;
      }),
      findMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        const filtered = orders.filter((o) => {
          if (where.businessId && o.businessId !== where.businessId) return false;
          if (where.deletedAt === null && o.deletedAt !== null) return false;
          if (where.salesId && o.salesId !== where.salesId) return false;
          if (where.customerId && o.customerId !== where.customerId) return false;
          if (where.status && o.status !== where.status) return false;
          return true;
        });

        return filtered.map((o) => {
          const cust = customers.find((c) => c.id === o.customerId);
          const items = orderItems.filter((i) => i.orderId === o.id);
          return {
            ...o,
            customer: cust ? { id: cust.id, code: cust.code, name: cust.name } : undefined,
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
          customer: cust ? { id: cust.id, code: cust.code, name: cust.name } : undefined,
          items,
        };
      }),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const newId = `ord_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        const itemsData = (data.items as { create: Record<string, unknown>[] })?.create ?? [];

        const newOrder: MockOrder = {
          id: newId,
          businessId: data.businessId as string,
          customerId: data.customerId as string,
          salesId: data.salesId as string,
          status: data.status as OrderStatus,
          version: data.version as number,
          rev: data.rev as number,
          customerSeq: null,
          orderNo: null,
          orderDate: data.orderDate as Date,
          deliveryAddress: (data.deliveryAddress as string) ?? null,
          notes: (data.notes as string) ?? null,
          repeatIntervalDays: (data.repeatIntervalDays as number) ?? null,
          subtotal: data.subtotal as bigint,
          discountTotal: data.discountTotal as bigint,
          shippingCharge: data.shippingCharge as bigint,
          ppnEnabled: data.ppnEnabled as boolean,
          ppnRateBps: data.ppnRateBps as number,
          ppnAmount: data.ppnAmount as bigint,
          grandTotal: data.grandTotal as bigint,
          dpBps: data.dpBps as number,
          dpAmount: data.dpAmount as bigint,
          hasBelowMin: data.hasBelowMin as boolean,
          belowMinReason: (data.belowMinReason as string) ?? null,
          overrideNote: null,
          rejectReason: null,
          paidTotal: BigInt(0),
          creditTotal: BigInt(0),
          stockReserved: false,
          cancelReason: null,
          cancelledAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          deletedAt: null,
        };

        orders.push(newOrder);

        const createdItems: MockOrderItem[] = [];
        for (const itm of itemsData) {
          const itemObj: MockOrderItem = {
            id: `item_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
            businessId: itm.businessId as string,
            orderId: newId,
            productId: itm.productId as string,
            productName: itm.productName as string,
            sku: itm.sku as string,
            unit: itm.unit as string,
            qty: itm.qty as number,
            listPrice: itm.listPrice as bigint,
            unitPrice: itm.unitPrice as bigint,
            discountType: itm.discountType as DiscountType,
            discountValue: itm.discountValue as bigint,
            discountSource: itm.discountSource as DiscountSource,
            lineSubtotal: itm.lineSubtotal as bigint,
            lineDiscount: itm.lineDiscount as bigint,
            lineNet: itm.lineNet as bigint,
            costPrice: itm.costPrice as bigint,
            floorPrice: itm.floorPrice as bigint,
            belowMin: itm.belowMin as boolean,
            sortOrder: itm.sortOrder as number,
          };
          orderItems.push(itemObj);
          createdItems.push(itemObj);
        }

        const cust = customers.find((c) => c.id === newOrder.customerId);
        return {
          ...newOrder,
          customer: cust ? { id: cust.id, code: cust.code, name: cust.name } : undefined,
          items: createdItems,
        };
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const idx = orders.findIndex((o) => o.id === where.id);
        if (idx === -1) throw new Error('Order not found');

        const existing = orders[idx];
        const itemsData = (data.items as { create: Record<string, unknown>[] })?.create;

        const updated: MockOrder = {
          ...existing,
          ...data,
          items: undefined,
          updatedAt: new Date(),
        };
        orders[idx] = updated;

        if (itemsData) {
          for (const itm of itemsData) {
            orderItems.push({
              id: `item_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
              businessId: itm.businessId as string,
              orderId: existing.id,
              productId: itm.productId as string,
              productName: itm.productName as string,
              sku: itm.sku as string,
              unit: itm.unit as string,
              qty: itm.qty as number,
              listPrice: itm.listPrice as bigint,
              unitPrice: itm.unitPrice as bigint,
              discountType: itm.discountType as DiscountType,
              discountValue: itm.discountValue as bigint,
              discountSource: itm.discountSource as DiscountSource,
              lineSubtotal: itm.lineSubtotal as bigint,
              lineDiscount: itm.lineDiscount as bigint,
              lineNet: itm.lineNet as bigint,
              costPrice: itm.costPrice as bigint,
              floorPrice: itm.floorPrice as bigint,
              belowMin: itm.belowMin as boolean,
              sortOrder: itm.sortOrder as number,
            });
          }
        }

        const cust = customers.find((c) => c.id === updated.customerId);
        const currentItems = orderItems.filter((i) => i.orderId === updated.id);
        return {
          ...updated,
          customer: cust ? { id: cust.id, code: cust.code, name: cust.name } : undefined,
          items: currentItems,
        };
      }),
    },
    orderItem: {
      deleteMany: vi.fn(async ({ where }: { where: { orderId: string } }) => {
        orderItems = orderItems.filter((i) => i.orderId !== where.orderId);
        return { count: 1 };
      }),
    },
    invoice: {
      findFirst: vi.fn(async () => null),
      findMany: vi.fn(async () => []),
    },
    auditLog: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const log = {
          id: `log_${Date.now()}`,
          businessId: (data.businessId as string) ?? null,
          actorId: (data.actorId as string) ?? null,
          actorRole: (data.actorRole as Role) ?? null,
          action: data.action as string,
          entityType: data.entityType as string,
          entityId: data.entityId as string,
          summary: (data.summary as string) ?? null,
        };
        auditLogs.push(log);
        return log;
      }),
    },
    $transaction: vi.fn(async (cb: (tx: unknown) => Promise<unknown>) => {
      return cb(mockPrisma);
    }),
  };

  return { prisma: mockPrisma };
});

describe('Integrasi Draf Order, Preview, dan Penegakan DTO per Role (T2.5, Seksi 10.4, 7.7)', () => {
  const APP_URL = 'http://localhost:3000';
  const BIZ_ID = 'biz_1';

  const superAdminCtx: contextModule.Ctx = {
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

  const salesACtx: contextModule.Ctx = {
    user: {
      id: 'sales_user_A',
      role: Role.SALES,
      name: 'Sales Andi',
      businessId: BIZ_ID,
    },
    role: Role.SALES,
    businessId: BIZ_ID,
    sessionId: 'sess_sales_a',
    ip: '127.0.0.1',
  };

  const salesBCtx: contextModule.Ctx = {
    user: {
      id: 'sales_user_B',
      role: Role.SALES,
      name: 'Sales Budi',
      businessId: BIZ_ID,
    },
    role: Role.SALES,
    businessId: BIZ_ID,
    sessionId: 'sess_sales_b',
    ip: '127.0.0.1',
  };
  void salesBCtx;

  let activeCtx = superAdminCtx;

  beforeEach(() => {
    vi.restoreAllMocks();
    activeCtx = superAdminCtx;
    vi.spyOn(contextModule, 'requireContext').mockImplementation(async () => activeCtx);

    businesses = [
      {
        id: BIZ_ID,
        code: 'TRB',
        name: 'Usaha Terobos',
        ppnEnabled: true,
        ppnRateBps: 1100, // 11%
        defaultDpBps: 5000, // 50%
      },
    ];

    customers = [
      {
        id: 'cust_1',
        businessId: BIZ_ID,
        code: 'CUST-ANDI',
        name: 'Toko Makmur Andi',
        assignedSalesId: 'sales_user_A',
        deletedAt: null,
      },
      {
        id: 'cust_2',
        businessId: BIZ_ID,
        code: 'CUST-BUDI',
        name: 'Toko Berkah Budi',
        assignedSalesId: 'sales_user_B',
        deletedAt: null,
      },
    ];

    products = [
      {
        id: 'prod_A',
        businessId: BIZ_ID,
        sku: 'SKU-A',
        name: 'Barang A',
        unit: 'PCS',
        basePrice: BigInt(100000),
        minPrice: BigInt(80000),
        costPrice: BigInt(70000),
        isActive: true,
        deletedAt: null,
      },
      {
        id: 'prod_B',
        businessId: BIZ_ID,
        sku: 'SKU-B',
        name: 'Barang B',
        unit: 'BOX',
        basePrice: BigInt(40000),
        minPrice: BigInt(30000),
        costPrice: BigInt(25000),
        isActive: true,
        deletedAt: null,
      },
    ];

    customerMinPrices = [];
    customerPromos = [];
    orders = [];
    orderItems = [];
    auditLogs = [];
  });

  it('POST /orders/preview: Perhitungan tepat cocok dengan Fixture 7.7 angka demi angka', async () => {
    // Fixture 7.7:
    // Baris A: qty 10, unitPrice 100.000, diskon 5% (500 bps), HPP 70.000
    // Baris B: qty 5, unitPrice 40.000, diskon nominal 10.000 (total baris), HPP 25.000
    // Ongkir: 50.000, PPN: 11% (1100 bps), DP: 50% (5000 bps)
    const req = new NextRequest(`${APP_URL}/api/v1/orders/preview`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: APP_URL,
      },
      body: JSON.stringify({
        customerId: 'cust_1',
        items: [
          {
            productId: 'prod_A',
            qty: 10,
            unitPrice: 100000,
            discount: {
              source: 'MANUAL',
              type: 'PERCENT',
              value: 500, // 5%
            },
          },
          {
            productId: 'prod_B',
            qty: 5,
            unitPrice: 40000,
            discount: {
              source: 'MANUAL',
              type: 'AMOUNT',
              value: 10000, // 10.000 total baris
            },
          },
        ],
        shippingCharge: 50000,
        dpBps: 5000,
      }),
    });

    const res = await previewOrderHandler(req);
    expect(res.status).toBe(200);

    const json = await res.json();
    const data = json.data;

    // Baris A: subtotal 1.000.000, diskon 50.000, net 950.000
    expect(data.lines[0].lineSubtotal).toBe(1000000);
    expect(data.lines[0].lineDiscount).toBe(50000);
    expect(data.lines[0].lineNet).toBe(950000);

    // Baris B: subtotal 200.000, diskon 10.000, net 190.000
    expect(data.lines[1].lineSubtotal).toBe(200000);
    expect(data.lines[1].lineDiscount).toBe(10000);
    expect(data.lines[1].lineNet).toBe(190000);

    // Totals Fixture 7.7
    expect(data.totals.subtotal).toBe(1200000);
    expect(data.totals.discountTotal).toBe(60000);
    expect(data.totals.goodsNet).toBe(1140000);
    expect(data.totals.shippingCharge).toBe(50000);
    expect(data.totals.ppnAmount).toBe(130900); // 11% dari (1.140.000 + 50.000)
    expect(data.totals.grandTotal).toBe(1320900);
    expect(data.totals.dpAmount).toBe(660450); // 50% dari 1.320.900

    // Super Admin: mencakup profit dan costPrice
    expect(data.profit).toBeDefined();
    expect(data.lines[0].costPrice).toBe(70000);
    expect(data.lines[1].costPrice).toBe(25000);
  });

  it('DTO per Role: Sales TIDAK PERNAH menerima costPrice, HPP, atau objek profit', async () => {
    activeCtx = salesACtx;

    const payload = {
      customerId: 'cust_1',
      items: [
        {
          productId: 'prod_A',
          qty: 2,
          unitPrice: 100000,
        },
      ],
      shippingCharge: 15000,
    };

    // 1. Preview oleh Sales
    const previewReq = new NextRequest(`${APP_URL}/api/v1/orders/preview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: APP_URL },
      body: JSON.stringify(payload),
    });
    const previewRes = await previewOrderHandler(previewReq);
    expect(previewRes.status).toBe(200);
    const previewJson = await previewRes.json();

    // Verifikasi anti-kebocoran rahasia
    assertNoSecretKeys(previewJson.data);
    expect(previewJson.data.profit).toBeUndefined();
    expect(previewJson.data.lines[0].costPrice).toBeUndefined();
    // Tapi floorPrice dan belowMin harus ada agar sales tahu batas minimalnya
    expect(previewJson.data.lines[0].floorPrice).toBe(80000);
    expect(previewJson.data.lines[0].belowMin).toBe(false);

    // 2. Buat Draf Order oleh Sales
    const createReq = new NextRequest(`${APP_URL}/api/v1/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: APP_URL },
      body: JSON.stringify(payload),
    });
    const createRes = await createOrderHandler(createReq);
    expect(createRes.status).toBe(201);
    const createJson = await createRes.json();
    assertNoSecretKeys(createJson.data);
    expect(createJson.data.profit).toBeUndefined();
    expect(createJson.data.items[0].costPrice).toBeUndefined();

    const orderId = createJson.data.id;

    // 3. Lihat Detail Order oleh Sales
    const getReq = new NextRequest(`${APP_URL}/api/v1/orders/${orderId}`, {
      method: 'GET',
    });
    const getRes = await getOrderDetailHandler(getReq, {
      params: Promise.resolve({ id: orderId }),
    });
    expect(getRes.status).toBe(200);
    const getJson = await getRes.json();
    assertNoSecretKeys(getJson.data);
    expect(getJson.data.profit).toBeUndefined();

    // 4. Daftar Order oleh Sales
    const listReq = new NextRequest(`${APP_URL}/api/v1/orders`, {
      method: 'GET',
    });
    const listRes = await getOrdersHandler(listReq);
    expect(listRes.status).toBe(200);
    const listJson = await listRes.json();
    assertNoSecretKeys(listJson.data);
  });

  it('menolak produk ganda dalam order dengan 422 DUPLICATE_PRODUCT', async () => {
    const req = new NextRequest(`${APP_URL}/api/v1/orders/preview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: APP_URL },
      body: JSON.stringify({
        customerId: 'cust_1',
        items: [
          { productId: 'prod_A', qty: 2, unitPrice: 100000 },
          { productId: 'prod_A', qty: 5, unitPrice: 95000 }, // ID duplikat!
        ],
      }),
    });

    const res = await previewOrderHandler(req);
    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.error.code).toBe('DUPLICATE_PRODUCT');
  });

  it('validasi promo: promo kedaluwarsa ditolak 422 PROMO_NOT_VALID', async () => {
    customerPromos.push({
      id: 'promo_expired',
      businessId: BIZ_ID,
      customerId: 'cust_1',
      productId: 'prod_A',
      label: 'Promo Hangus',
      source: DiscountSource.PROMO,
      type: DiscountType.PERCENT,
      valueBps: 1000,
      valueAmount: null,
      validFrom: new Date('2026-01-01'),
      validTo: new Date('2026-01-15'), // sudah lewat
      isActive: true,
      deletedAt: null,
    });

    const req = new NextRequest(`${APP_URL}/api/v1/orders/preview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: APP_URL },
      body: JSON.stringify({
        customerId: 'cust_1',
        items: [
          {
            productId: 'prod_A',
            qty: 2,
            unitPrice: 100000,
            discount: {
              source: 'PROMO',
              promoId: 'promo_expired',
            },
          },
        ],
      }),
    });

    const res = await previewOrderHandler(req);
    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.error.code).toBe('PROMO_NOT_VALID');
  });

  it('promo valid menurunkan floor dan menghitung potongan otomatis dari server', async () => {
    // Promo potongan Rp 5.000 per unit untuk prod_A
    customerPromos.push({
      id: 'promo_valid_subsidy',
      businessId: BIZ_ID,
      customerId: 'cust_1',
      productId: 'prod_A',
      label: 'Subsidi Pabrik 5rb',
      source: DiscountSource.SUBSIDY,
      type: DiscountType.AMOUNT,
      valueBps: null,
      valueAmount: BigInt(5000),
      validFrom: new Date('2026-01-01'),
      validTo: new Date('2026-12-31'),
      isActive: true,
      deletedAt: null,
    });

    const req = new NextRequest(`${APP_URL}/api/v1/orders/preview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: APP_URL },
      body: JSON.stringify({
        customerId: 'cust_1',
        items: [
          {
            productId: 'prod_A',
            qty: 4,
            unitPrice: 100000,
            discount: {
              source: 'SUBSIDY',
              promoId: 'promo_valid_subsidy',
            },
          },
        ],
      }),
    });

    const res = await previewOrderHandler(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    const line = json.data.lines[0];

    // Diskon total baris = 5.000 * 4 = 20.000
    expect(line.lineDiscount).toBe(20000);
    expect(line.discountSource).toBe('SUBSIDY');
    // Floor berkurang dari 80.000 menjadi 75.000
    expect(line.floorPrice).toBe(75000);
    expect(line.belowMin).toBe(false);
  });

  it('deteksi harga di bawah minimal: baris ditandai belowMin dan warnings terisi', async () => {
    // Harga dasar prod_A = 100.000, floor = 80.000
    // Sales memberikan unitPrice 75.000 (di bawah floor 80.000)
    const req = new NextRequest(`${APP_URL}/api/v1/orders/preview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: APP_URL },
      body: JSON.stringify({
        customerId: 'cust_1',
        items: [
          {
            productId: 'prod_A',
            qty: 2,
            unitPrice: 75000, // di bawah floor 80.000!
          },
        ],
      }),
    });

    const res = await previewOrderHandler(req);
    expect(res.status).toBe(200);
    const json = await res.json();

    expect(json.data.hasBelowMin).toBe(true);
    expect(json.data.lines[0].belowMin).toBe(true);
    expect(json.data.warnings).toHaveLength(1);
    expect(json.data.warnings[0].productId).toBe('prod_A');
    expect(json.data.warnings[0].floorPrice).toBe(80000);
  });

  it('siklus hidup draf order: create -> get -> patch -> delete (soft delete)', async () => {
    // 1. Create order draft
    const createReq = new NextRequest(`${APP_URL}/api/v1/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: APP_URL },
      body: JSON.stringify({
        customerId: 'cust_1',
        items: [
          {
            productId: 'prod_A',
            qty: 1,
            unitPrice: 100000,
          },
        ],
        notes: 'Draf pertama',
      }),
    });

    const createRes = await createOrderHandler(createReq);
    expect(createRes.status).toBe(201);
    const created = (await createRes.json()).data;
    expect(created.status).toBe('DRAFT');
    expect(created.version).toBe(1);
    expect(created.rev).toBe(0);
    expect(created.items).toHaveLength(1);

    const orderId = created.id;

    // 2. Patch order draft (ubah qty dan tambah item)
    const patchReq = new NextRequest(`${APP_URL}/api/v1/orders/${orderId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Origin: APP_URL },
      body: JSON.stringify({
        customerId: 'cust_1',
        items: [
          {
            productId: 'prod_A',
            qty: 2,
            unitPrice: 100000,
          },
          {
            productId: 'prod_B',
            qty: 3,
            unitPrice: 40000,
          },
        ],
        shippingCharge: 10000,
        notes: 'Draf revisi',
        rev: 0, // cocok dengan rev saat ini
      }),
    });

    const patchRes = await updateOrderHandler(patchReq, {
      params: Promise.resolve({ id: orderId }),
    });
    expect(patchRes.status).toBe(200);
    const patched = (await patchRes.json()).data;
    expect(patched.rev).toBe(1);
    expect(patched.items).toHaveLength(2);
    expect(patched.notes).toBe('Draf revisi');

    // 3. Optimistic locking: Patch dengan rev lama harus ditolak 409
    const stalePatchReq = new NextRequest(`${APP_URL}/api/v1/orders/${orderId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Origin: APP_URL },
      body: JSON.stringify({
        customerId: 'cust_1',
        items: [{ productId: 'prod_A', qty: 2, unitPrice: 100000 }],
        rev: 0, // stale rev (sekarang sudah 1)
      }),
    });
    const staleRes = await updateOrderHandler(stalePatchReq, {
      params: Promise.resolve({ id: orderId }),
    });
    expect(staleRes.status).toBe(409);
    const staleJson = await staleRes.json();
    expect(staleJson.error.code).toBe('OPTIMISTIC_LOCK_ERROR');

    // 4. Delete: confirm salah -> 422 CONFIRM_MISMATCH
    const deleteWrongReq = new NextRequest(`${APP_URL}/api/v1/orders/${orderId}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', Origin: APP_URL },
      body: JSON.stringify({ confirm: 'SALAH_KETIK' }),
    });
    const deleteWrongRes = await deleteOrderHandler(deleteWrongReq, {
      params: Promise.resolve({ id: orderId }),
    });
    expect(deleteWrongRes.status).toBe(422);

    // 5. Delete: confirm benar -> 200 dan soft delete
    const deleteOkReq = new NextRequest(`${APP_URL}/api/v1/orders/${orderId}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', Origin: APP_URL },
      body: JSON.stringify({ confirm: orderId }),
    });
    const deleteOkRes = await deleteOrderHandler(deleteOkReq, {
      params: Promise.resolve({ id: orderId }),
    });
    expect(deleteOkRes.status).toBe(200);

    const deletedOrder = orders.find((o) => o.id === orderId);
    expect(deletedOrder?.deletedAt).not.toBeNull();
  });

  it('isolasi Sales: Sales A tidak dapat mengakses atau memodifikasi order milik Sales B (404)', async () => {
    // Buat order milik Sales B
    const orderB: MockOrder = {
      id: 'ord_sales_b',
      businessId: BIZ_ID,
      customerId: 'cust_2', // customer milik Sales B
      salesId: 'sales_user_B',
      status: OrderStatus.DRAFT,
      version: 1,
      rev: 0,
      customerSeq: null,
      orderNo: null,
      orderDate: new Date(),
      deliveryAddress: null,
      notes: null,
      repeatIntervalDays: null,
      subtotal: BigInt(100000),
      discountTotal: BigInt(0),
      shippingCharge: BigInt(0),
      ppnEnabled: false,
      ppnRateBps: 0,
      ppnAmount: BigInt(0),
      grandTotal: BigInt(100000),
      dpBps: 0,
      dpAmount: BigInt(0),
      hasBelowMin: false,
      belowMinReason: null,
      overrideNote: null,
      rejectReason: null,
      paidTotal: BigInt(0),
      creditTotal: BigInt(0),
      stockReserved: false,
      cancelReason: null,
      cancelledAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    };
    orders.push(orderB);

    // Sales A mencoba melihat order Sales B
    activeCtx = salesACtx;

    const getReq = new NextRequest(`${APP_URL}/api/v1/orders/ord_sales_b`, {
      method: 'GET',
    });
    const getRes = await getOrderDetailHandler(getReq, {
      params: Promise.resolve({ id: 'ord_sales_b' }),
    });
    expect(getRes.status).toBe(404);

    // Sales A mencoba PATCH order Sales B
    const patchReq = new NextRequest(`${APP_URL}/api/v1/orders/ord_sales_b`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Origin: APP_URL },
      body: JSON.stringify({
        customerId: 'cust_2',
        items: [{ productId: 'prod_A', qty: 1, unitPrice: 100000 }],
        rev: 0,
      }),
    });
    const patchRes = await updateOrderHandler(patchReq, {
      params: Promise.resolve({ id: 'ord_sales_b' }),
    });
    expect(patchRes.status).toBe(404);

    // Sales A mencoba buat order untuk customer Sales B -> 404
    const createCrossReq = new NextRequest(`${APP_URL}/api/v1/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: APP_URL },
      body: JSON.stringify({
        customerId: 'cust_2', // customer milik Sales B!
        items: [{ productId: 'prod_A', qty: 1, unitPrice: 100000 }],
      }),
    });
    const createCrossRes = await createOrderHandler(createCrossReq);
    expect(createCrossRes.status).toBe(404);
  });
});
