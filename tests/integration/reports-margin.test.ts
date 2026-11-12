import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import {
  Role,
  OrderStatus,
  CreditSettlement,
  DiscountSource,
} from '@prisma/client';
import * as contextModule from '@/lib/auth/context';
import { assertNoSecretKeys } from '../helpers/leak';
import { DomainError } from '@/lib/domain/money';
import { GET as getMarginReportHandler } from '@/app/api/v1/reports/margin/route';

interface MockOrder {
  id: string;
  businessId: string;
  orderNo: string;
  customerId: string;
  salesId: string;
  status: OrderStatus;
  orderDate: Date;
  shippingCharge: bigint;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  items: Array<{
    id: string;
    productId: string;
    productName: string;
    sku: string;
    unit: string;
    qty: number;
    costPrice: bigint;
    unitPrice: bigint;
    lineNet: bigint;
    discountSource: DiscountSource;
    lineDiscount: bigint;
  }>;
}

interface MockCreditNote {
  id: string;
  businessId: string;
  orderId: string;
  customerId: string;
  number: string;
  reason: string;
  settlement: CreditSettlement;
  amountExPpn: bigint;
  cogsReversed: bigint;
  voidedAt: Date | null;
  createdAt: Date;
}

interface MockShipment {
  id: string;
  businessId: string;
  orderId: string;
  actualCost: bigint;
  createdAt: Date;
}

interface MockOrderCost {
  id: string;
  businessId: string;
  orderId: string;
  label: string;
  amount: bigint;
  createdAt: Date;
}

interface MockCustomer {
  id: string;
  businessId: string;
  code: string;
  name: string;
}

interface MockUser {
  id: string;
  businessId: string;
  name: string;
  role: Role;
}

let mockOrders: MockOrder[] = [];
let mockCreditNotes: MockCreditNote[] = [];
let mockShipments: MockShipment[] = [];
let mockOrderCosts: MockOrderCost[] = [];
let mockCustomers: MockCustomer[] = [];
let mockUsers: MockUser[] = [];

interface MarginWhereFilter {
  id?: string;
  businessId?: string;
  deletedAt?: null | Date;
  status?: { in?: OrderStatus[] };
  salesId?: string;
  createdAt?: { gte?: Date; lte?: Date };
  orderId?: { in?: string[] };
  voidedAt?: null | Date;
  role?: Role;
}

vi.mock('@/lib/db', () => {
  const mockPrisma = {
    order: {
      findMany: vi.fn(async ({ where }: { where: MarginWhereFilter }) => {
        return mockOrders
          .filter((o) => {
            if (where.businessId && o.businessId !== where.businessId) return false;
            if (where.deletedAt === null && o.deletedAt !== null) return false;
            if (where.status?.in && !where.status.in.includes(o.status)) return false;
            if (where.salesId && o.salesId !== where.salesId) return false;
            if (where.createdAt?.gte && o.createdAt < where.createdAt.gte) return false;
            if (where.createdAt?.lte && o.createdAt > where.createdAt.lte) return false;
            return true;
          })
          .map((o) => {
            const cust = mockCustomers.find((c) => c.id === o.customerId) || {
              id: o.customerId,
              name: 'Customer',
              code: 'CUST-0',
            };
            return {
              ...o,
              customer: cust,
            };
          });
      }),
    },
    creditNote: {
      findMany: vi.fn(async ({ where }: { where: MarginWhereFilter }) => {
        return mockCreditNotes.filter((cn) => {
          if (where.businessId && cn.businessId !== where.businessId) return false;
          if (where.orderId?.in && !where.orderId.in.includes(cn.orderId)) return false;
          if (where.voidedAt === null && cn.voidedAt !== null) return false;
          return true;
        });
      }),
    },
    shipment: {
      findMany: vi.fn(async ({ where }: { where: MarginWhereFilter }) => {
        return mockShipments.filter((sh) => {
          if (where.businessId && sh.businessId !== where.businessId) return false;
          if (where.orderId?.in && !where.orderId.in.includes(sh.orderId)) return false;
          return true;
        });
      }),
    },
    orderCost: {
      findMany: vi.fn(async ({ where }: { where: MarginWhereFilter }) => {
        return mockOrderCosts.filter((oc) => {
          if (where.businessId && oc.businessId !== where.businessId) return false;
          if (where.orderId?.in && !where.orderId.in.includes(oc.orderId)) return false;
          return true;
        });
      }),
    },
    user: {
      findMany: vi.fn(async ({ where }: { where: MarginWhereFilter }) => {
        return mockUsers.filter((u) => {
          if (where.businessId && u.businessId !== where.businessId) return false;
          if (where.role && u.role !== where.role) return false;
          return true;
        });
      }),
    },
    business: {
      findFirst: vi.fn(async ({ where }: { where: MarginWhereFilter }) => {
        return { id: where.id, name: 'Bento Pet Shop Pusat' };
      }),
    },
  };
  return { prisma: mockPrisma };
});

describe('T5.2: Laporan Margin & Profitabilitas Usaha (Seksi 7.4, 9.2, 17.3 nomor 22, 18.1 nomor 33)', () => {
  const BIZ_ID = 'biz_margin_01';
  const SUPERADMIN_ID = 'sa_margin_usr';
  const SALES_1_ID = 'sales_margin_01';
  const SALES_2_ID = 'sales_margin_02';

  const superAdminCtx: contextModule.Ctx = {
    user: { id: SUPERADMIN_ID, name: 'Owner Toko', role: Role.SUPERADMIN, businessId: BIZ_ID },
    role: Role.SUPERADMIN,
    businessId: BIZ_ID,
    sessionId: 'sess_sa',
    ip: '127.0.0.1',
  };

  const salesCtx: contextModule.Ctx = {
    user: { id: SALES_1_ID, name: 'Sales Doni', role: Role.SALES, businessId: BIZ_ID },
    role: Role.SALES,
    businessId: BIZ_ID,
    sessionId: 'sess_sales',
    ip: '127.0.0.1',
  };

  let activeCtx: contextModule.Ctx = superAdminCtx;

  beforeEach(() => {
    mockOrders = [];
    mockCreditNotes = [];
    mockShipments = [];
    mockOrderCosts = [];
    mockCustomers = [];
    mockUsers = [];

    activeCtx = superAdminCtx;
    vi.spyOn(contextModule, 'requireContext').mockImplementation(async (_req, roles) => {
      if (roles && roles.length > 0 && !roles.includes(activeCtx.role)) {
        throw new DomainError('FORBIDDEN', 'Akses ditolak: Hanya Super Admin yang berhak', 403);
      }
      return activeCtx;
    });
    vi.spyOn(contextModule, 'requireBusiness').mockImplementation(() => activeCtx.businessId!);

    // Setup Master Users & Customer
    mockUsers.push(
      { id: SUPERADMIN_ID, businessId: BIZ_ID, name: 'Owner Toko', role: Role.SUPERADMIN },
      { id: SALES_1_ID, businessId: BIZ_ID, name: 'Sales Doni', role: Role.SALES },
      { id: SALES_2_ID, businessId: BIZ_ID, name: 'Sales Rina', role: Role.SALES }
    );

    mockCustomers.push(
      { id: 'cust_1', businessId: BIZ_ID, code: 'CUST-001', name: 'Pet Grooming Sejahtera' },
      { id: 'cust_2', businessId: BIZ_ID, code: 'CUST-002', name: 'Klinik Hewan Sehat' }
    );
  });

  describe('1. Hak Akses & Strict Zero-Leakage', () => {
    it('Super Admin berhasil mengambil laporan margin (200 OK)', async () => {
      activeCtx = superAdminCtx;
      const req = new NextRequest('http://localhost/api/v1/reports/margin?groupBy=order');
      const res = await getMarginReportHandler(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);
      expect(json.data.summary).toBeDefined();
    });

    it('Sales ditolak 403 Forbidden dan tidak ada kunci rahasia yang bocor (Seksi 17.4 a)', async () => {
      activeCtx = salesCtx;
      const req = new NextRequest('http://localhost/api/v1/reports/margin?groupBy=order');
      const res = await getMarginReportHandler(req);
      const json = await res.json();

      expect(res.status).toBe(403);
      expect(json.ok).toBe(false);
      expect(json.error.code).toBe('FORBIDDEN');
      assertNoSecretKeys(json);
    });
  });

  describe('2. Invarian Laporan & Penanganan Order Dibatalkan (Seksi 9.2 & Table 19.7)', () => {
    beforeEach(() => {
      const now = new Date();

      // Order 1: Selesai, Omzet Barang 1.000.000, HPP 700.000, Ongkir tagih 50.000, Ongkir aktual 40.000, Biaya lain 10.000
      // goodsRevenue = 1.000.000, revenue = 1.050.000
      // cogs = 700.000
      // profit = 1.050.000 - 700.000 - 40.000 - 10.000 = 300.000
      mockOrders.push({
        id: 'ord_1',
        businessId: BIZ_ID,
        orderNo: 'KODE/ORD/0001',
        customerId: 'cust_1',
        salesId: SALES_1_ID,
        status: OrderStatus.COMPLETED,
        orderDate: now,
        shippingCharge: 50000n,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
        items: [
          {
            id: 'it_1',
            productId: 'prod_cat_food',
            productName: 'Cat Food Premium 2kg',
            sku: 'CAT-PREM',
            unit: 'pack',
            qty: 10,
            costPrice: 70000n,
            unitPrice: 100000n,
            lineNet: 1000000n,
            discountSource: DiscountSource.MANUAL,
            lineDiscount: 0n,
          },
        ],
      });
      mockShipments.push({
        id: 'sh_1',
        businessId: BIZ_ID,
        orderId: 'ord_1',
        actualCost: 40000n,
        createdAt: now,
      });
      mockOrderCosts.push({
        id: 'cost_1',
        businessId: BIZ_ID,
        orderId: 'ord_1',
        label: 'Packing Kayu',
        amount: 10000n,
        createdAt: now,
      });

      // Order 2: Selesai, ada retur credit note.
      // Barang: 2.000.000, HPP: 1.400.000. Retur credit note: amountExPpn = 200.000, cogsReversed = 140.000.
      // goodsRevenue = 2.000.000 - 200.000 = 1.800.000.
      // Ongkir tagih = 0, revenue = 1.800.000.
      // cogs = 1.400.000 - 140.000 = 1.260.000.
      // Ongkir aktual = 0, biaya lain = 0.
      // profit = 1.800.000 - 1.260.000 = 540.000.
      mockOrders.push({
        id: 'ord_2',
        businessId: BIZ_ID,
        orderNo: 'KODE/ORD/0002',
        customerId: 'cust_2',
        salesId: SALES_2_ID,
        status: OrderStatus.COMPLETED,
        orderDate: now,
        shippingCharge: 0n,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
        items: [
          {
            id: 'it_2',
            productId: 'prod_snack',
            productName: 'Snack Kucing Creamy',
            sku: 'CAT-SNACK',
            unit: 'box',
            qty: 20,
            costPrice: 70000n,
            unitPrice: 100000n,
            lineNet: 2000000n,
            discountSource: DiscountSource.MANUAL,
            lineDiscount: 0n,
          },
        ],
      });
      mockCreditNotes.push({
        id: 'cn_1',
        businessId: BIZ_ID,
        orderId: 'ord_2',
        customerId: 'cust_2',
        number: 'KODE/CN/0001',
        reason: 'Kemasan rusak',
        settlement: CreditSettlement.OFFSET,
        amountExPpn: 200000n,
        cogsReversed: 140000n,
        voidedAt: null,
        createdAt: now,
      });

      // Order 3: CANCELLED TANPA PENGELUARAN AKTUAL -> Wajib dikecualikan sepenuhnya dari laporan!
      mockOrders.push({
        id: 'ord_cancel_noop',
        businessId: BIZ_ID,
        orderNo: 'KODE/ORD/CANCEL-NOOP',
        customerId: 'cust_1',
        salesId: SALES_1_ID,
        status: OrderStatus.CANCELLED,
        orderDate: now,
        shippingCharge: 0n,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
        items: [],
      });

      // Order 4: CANCELLED DENGAN BIAYA SUDAH KELUAR (Seksi 9.2: Kerugian Pembatalan)
      // Ongkir aktual = 35.000, Biaya lain = 15.000 -> Total kerugian pembatalan = 50.000.
      // Revenue = 0, Cogs = 0, profit = -50.000.
      mockOrders.push({
        id: 'ord_cancel_loss',
        businessId: BIZ_ID,
        orderNo: 'KODE/ORD/CANCEL-LOSS',
        customerId: 'cust_1',
        salesId: SALES_1_ID,
        status: OrderStatus.CANCELLED,
        orderDate: now,
        shippingCharge: 0n,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
        items: [],
      });
      mockShipments.push({
        id: 'sh_cancel',
        businessId: BIZ_ID,
        orderId: 'ord_cancel_loss',
        actualCost: 35000n,
        createdAt: now,
      });
      mockOrderCosts.push({
        id: 'cost_cancel',
        businessId: BIZ_ID,
        orderId: 'ord_cancel_loss',
        label: 'Biaya Retur Kurir Ekspedisi',
        amount: 15000n,
        createdAt: now,
      });
    });

    it('groupBy=order: Total profit laporan SAMA PERSIS dengan jumlah profit baris order (termasuk baris kerugian pembatalan)', async () => {
      activeCtx = superAdminCtx;
      const req = new NextRequest('http://localhost/api/v1/reports/margin?groupBy=order');
      const res = await getMarginReportHandler(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);
      const { summary, items } = json.data;

      // Verifikasi Jumlah Order
      // Order 1 (aktif), Order 2 (aktif), Order 4 (cancelled with loss). Order 3 (cancelled tanpa loss) diabaikan!
      expect(summary.totalOrders).toBe(2);
      expect(summary.cancelledOrdersWithLossCount).toBe(1);
      expect(items).toHaveLength(3);

      // Verifikasi Nilai Finansial
      // Revenue total = 1.050.000 (ord 1) + 1.800.000 (ord 2) + 0 (ord 4) = 2.850.000
      expect(summary.revenue).toBe(2850000);
      // HPP total = 700.000 (ord 1) + 1.260.000 (ord 2) = 1.960.000
      expect(summary.cogs).toBe(1960000);
      // Kerugian pembatalan = 35.000 + 15.000 = 50.000
      expect(summary.cancellationLoss).toBe(50000);

      // Profit Total:
      // Profit Order 1 = 300.000
      // Profit Order 2 = 540.000
      // Loss Order 4 = -50.000
      // Total Profit = 300.000 + 540.000 - 50.000 = 790.000
      expect(summary.profit).toBe(790000);

      // BUKTI INVARIAN T5.2: Total profit laporan sama persis dengan jumlah profit per baris
      const sumRowsProfit = items.reduce(
        (acc: number, row: { profit: number }) => acc + row.profit,
        0
      );
      expect(summary.profit).toBe(sumRowsProfit);

      // BUKTI INVARIAN: Total profit = total profit order aktif - kerugian pembatalan
      const activeRowsProfit = items
        .filter((r: { isCancellationLoss?: boolean }) => !r.isCancellationLoss)
        .reduce((acc: number, row: { profit: number }) => acc + row.profit, 0);
      expect(summary.profit).toBe(activeRowsProfit - summary.cancellationLoss);

      // Verifikasi baris kerugian pembatalan
      const cancelRow = items.find((r: { orderId: string }) => r.orderId === 'ord_cancel_loss');
      expect(cancelRow).toBeDefined();
      expect(cancelRow.isCancellationLoss).toBe(true);
      expect(cancelRow.profit).toBe(-50000);
      expect(cancelRow.shippingActualCost).toBe(35000);
      expect(cancelRow.extraCosts).toBe(15000);
    });

    it('groupBy=product: Menghitung agregasi penjualan, HPP modal, laba kotor, dan margin produk', async () => {
      activeCtx = superAdminCtx;
      const req = new NextRequest('http://localhost/api/v1/reports/margin?groupBy=product');
      const res = await getMarginReportHandler(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);
      const { items } = json.data;

      expect(items).toHaveLength(2); // CAT-PREM & CAT-SNACK

      const snackProduct = items.find((p: { sku: string }) => p.sku === 'CAT-SNACK');
      expect(snackProduct).toBeDefined();
      expect(snackProduct.qtySold).toBe(20);
      expect(snackProduct.grossRevenue).toBe(2000000);
      expect(snackProduct.cogs).toBe(1400000);
      expect(snackProduct.profit).toBe(600000);
      expect(snackProduct.marginBps).toBe(3000); // 600rb / 2jt = 30.00%
    });

    it('groupBy=sales: Mengagregasikan omzet, HPP, biaya, dan kerugian pembatalan per staf sales', async () => {
      activeCtx = superAdminCtx;
      const req = new NextRequest('http://localhost/api/v1/reports/margin?groupBy=sales');
      const res = await getMarginReportHandler(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);
      const { items } = json.data;

      // Sales 1 (ord_1 profit 300rb, ord_cancel_loss -50rb -> profit bersih 250rb)
      const sales1 = items.find((s: { salesId: string }) => s.salesId === SALES_1_ID);
      expect(sales1).toBeDefined();
      expect(sales1.orderCount).toBe(1);
      expect(sales1.revenue).toBe(1050000);
      expect(sales1.cogs).toBe(700000);
      expect(sales1.cancellationLoss).toBe(50000);
      expect(sales1.profit).toBe(250000);

      // Sales 2 (ord_2 profit 540rb)
      const sales2 = items.find((s: { salesId: string }) => s.salesId === SALES_2_ID);
      expect(sales2).toBeDefined();
      expect(sales2.orderCount).toBe(1);
      expect(sales2.revenue).toBe(1800000);
      expect(sales2.cogs).toBe(1260000);
      expect(sales2.cancellationLoss).toBe(0);
      expect(sales2.profit).toBe(540000);

      // Total profit sales sama dengan summary profit
      const totalSalesProfit = items.reduce(
        (acc: number, s: { profit: number }) => acc + s.profit,
        0
      );
      expect(totalSalesProfit).toBe(790000);
    });

    it('groupBy=business: Mengembalikan ringkasan komprehensif tingkat unit usaha', async () => {
      activeCtx = superAdminCtx;
      const req = new NextRequest('http://localhost/api/v1/reports/margin?groupBy=business');
      const res = await getMarginReportHandler(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);
      const { items, summary } = json.data;

      expect(items).toHaveLength(1);
      const bizRow = items[0];
      expect(bizRow.businessId).toBe(BIZ_ID);
      expect(bizRow.revenue).toBe(summary.revenue);
      expect(bizRow.cogs).toBe(summary.cogs);
      expect(bizRow.profit).toBe(summary.profit);
      expect(bizRow.cancellationLoss).toBe(summary.cancellationLoss);
    });

    it('Filter rentang tanggal (from & to) membatasi order yang dihitung', async () => {
      activeCtx = superAdminCtx;
      // Filter tanggal di masa lalu sehingga tidak ada order yang cocok
      const req = new NextRequest(
        'http://localhost/api/v1/reports/margin?groupBy=order&from=2020-01-01&to=2020-01-31'
      );
      const res = await getMarginReportHandler(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);
      expect(json.data.summary.totalOrders).toBe(0);
      expect(json.data.summary.profit).toBe(0);
      expect(json.data.items).toHaveLength(0);
    });
  });
});
