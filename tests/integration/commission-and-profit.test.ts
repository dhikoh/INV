import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import {
  Role,
  OrderStatus,
  CommissionMode,
  CommissionStatus,
  CommissionTrigger,
} from '@prisma/client';
import * as contextModule from '@/lib/auth/context';
import { DomainError } from '@/lib/domain/money';
import { assertNoSecretKeys } from '../helpers/leak';
import { GET as getOrderProfitHandler } from '@/app/api/v1/orders/[id]/profit/route';
import {
  GET as listOrderCostsHandler,
  POST as createOrderCostHandler,
} from '@/app/api/v1/orders/[id]/costs/route';
import { DELETE as deleteOrderCostHandler } from '@/app/api/v1/orders/[id]/costs/[costId]/route';
import { GET as listCommissionEntriesHandler } from '@/app/api/v1/commission/entries/route';
import { POST as payCommissionEntryHandler } from '@/app/api/v1/commission/entries/[id]/pay/route';
import {
  GET as getCommissionTiersHandler,
  PUT as setCommissionTiersHandler,
} from '@/app/api/v1/commission/tiers/route';
import {
  evaluateOrderCommission,
  recalculateOrderCommission,
  reverseOrderCommission,
} from '@/lib/services/commission';

// In-memory mock database collections
let mockBusinesses: any[] = [];
let mockUsers: any[] = [];
let mockOrders: any[] = [];
let mockOrderItems: any[] = [];
let mockShipments: any[] = [];
let mockOrderCosts: any[] = [];
let mockCommissionEntries: any[] = [];
let mockCommissionTiers: any[] = [];
let mockSalesTargets: any[] = [];
let mockCreditNotes: any[] = [];
let mockAuditLogs: any[] = [];

let idCounter = 1;

const mockTx = {
  business: {
    findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
      return mockBusinesses.find((b) => b.id === where.id) || null;
    }),
  },
  user: {
    findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
      return mockUsers.find((u) => u.id === where.id) || null;
    }),
  },
  order: {
    findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
      const found = mockOrders.find((o) => o.id === where.id);
      if (!found) return null;
      const items = mockOrderItems.filter((i) => i.orderId === found.id);
      const shipment = mockShipments.find((s) => s.orderId === found.id) || null;
      const costs = mockOrderCosts.filter((c) => c.orderId === found.id);
      const business = mockBusinesses.find((b) => b.id === found.businessId) || null;
      return { ...found, items, shipment, costs, business };
    }),
    findFirst: vi.fn(async ({ where }: { where: Record<string, any> }) => {
      const found = mockOrders.find((o) => {
        if (where.id && o.id !== where.id) return false;
        if (where.businessId && o.businessId !== where.businessId) return false;
        if (where.deletedAt === null && o.deletedAt !== null) return false;
        return true;
      });
      if (!found) return null;
      const items = mockOrderItems.filter((i) => i.orderId === found.id);
      const shipment = mockShipments.find((s) => s.orderId === found.id) || null;
      const costs = mockOrderCosts.filter((c) => c.orderId === found.id);
      const business = mockBusinesses.find((b) => b.id === found.businessId) || null;
      return { ...found, items, shipment, costs, business };
    }),
    findFirstOrThrow: vi.fn(async ({ where }: { where: Record<string, any> }) => {
      const found = mockOrders.find((o) => {
        if (where.id && o.id !== where.id) return false;
        if (where.businessId && o.businessId !== where.businessId) return false;
        if (where.deletedAt === null && o.deletedAt !== null) return false;
        return true;
      });
      if (!found) throw new Error('Order not found');
      const items = mockOrderItems.filter((i) => i.orderId === found.id);
      const shipment = mockShipments.find((s) => s.orderId === found.id) || null;
      const costs = mockOrderCosts.filter((c) => c.orderId === found.id);
      const business = mockBusinesses.find((b) => b.id === found.businessId) || null;
      return { ...found, items, shipment, costs, business };
    }),
    findMany: vi.fn(async ({ where }: { where: Record<string, any> }) => {
      return mockOrders
        .filter((o) => {
          if (where.businessId && o.businessId !== where.businessId) return false;
          if (where.salesId && o.salesId !== where.salesId) return false;
          if (where.status?.not && o.status === where.status.not) return false;
          if (where.deletedAt === null && o.deletedAt !== null) return false;
          return true;
        })
        .map((o) => ({
          id: o.id,
          subtotal: o.subtotal,
          discountTotal: o.discountTotal,
          shippingCharge: o.shippingCharge,
          createdAt: o.createdAt,
        }));
    }),
    update: vi.fn(async ({ where, data }: { where: { id: string }; data: any }) => {
      const idx = mockOrders.findIndex((o) => o.id === where.id);
      if (idx === -1) throw new Error('Order not found');
      mockOrders[idx] = { ...mockOrders[idx], ...data };
      return mockOrders[idx];
    }),
  },
  orderItem: {
    findMany: vi.fn(async ({ where }: { where: Record<string, any> }) => {
      return mockOrderItems.filter((i) => {
        if (where.orderId && i.orderId !== where.orderId) return false;
        if (where.businessId && i.businessId !== where.businessId) return false;
        return true;
      });
    }),
  },
  shipment: {
    findFirst: vi.fn(async ({ where }: { where: Record<string, any> }) => {
      return (
        mockShipments.find((s) => {
          if (where.orderId && s.orderId !== where.orderId) return false;
          if (where.businessId && s.businessId !== where.businessId) return false;
          return true;
        }) || null
      );
    }),
  },
  orderCost: {
    create: vi.fn(async ({ data }: { data: any }) => {
      const created = {
        id: `cost_${idCounter++}`,
        ...data,
        createdAt: new Date(),
      };
      mockOrderCosts.push(created);
      return created;
    }),
    findFirst: vi.fn(async ({ where }: { where: Record<string, any> }) => {
      return (
        mockOrderCosts.find((c) => {
          if (where.id && c.id !== where.id) return false;
          if (where.businessId && c.businessId !== where.businessId) return false;
          if (where.orderId && c.orderId !== where.orderId) return false;
          return true;
        }) || null
      );
    }),
    findMany: vi.fn(async ({ where }: { where: Record<string, any> }) => {
      return mockOrderCosts
        .filter((c) => {
          if (where.businessId && c.businessId !== where.businessId) return false;
          if (where.orderId && c.orderId !== where.orderId) return false;
          return true;
        })
        .map((c) => {
          const user = mockUsers.find((u) => u.id === c.createdById);
          return { ...c, createdBy: user ? { id: user.id, name: user.name } : null };
        });
    }),
    delete: vi.fn(async ({ where }: { where: { id: string } }) => {
      const idx = mockOrderCosts.findIndex((c) => c.id === where.id);
      if (idx === -1) throw new Error('Cost not found');
      const [deleted] = mockOrderCosts.splice(idx, 1);
      return deleted;
    }),
    deleteMany: vi.fn(async ({ where }: { where: Record<string, any> }) => {
      let count = 0;
      for (let i = mockOrderCosts.length - 1; i >= 0; i--) {
        const c = mockOrderCosts[i];
        if (where.id && c.id !== where.id) continue;
        if (where.businessId && c.businessId !== where.businessId) continue;
        if (where.orderId && c.orderId !== where.orderId) continue;
        mockOrderCosts.splice(i, 1);
        count++;
      }
      return { count };
    }),
  },
  commissionEntry: {
    findUnique: vi.fn(async ({ where }: { where: { orderId: string } }) => {
      return mockCommissionEntries.find((ce) => ce.orderId === where.orderId) || null;
    }),
    findFirst: vi.fn(async ({ where }: { where: Record<string, any> }) => {
      return (
        mockCommissionEntries.find((ce) => {
          if (where.id && ce.id !== where.id) return false;
          if (where.orderId && ce.orderId !== where.orderId) return false;
          if (where.businessId && ce.businessId !== where.businessId) return false;
          return true;
        }) || null
      );
    }),
    create: vi.fn(async ({ data }: { data: any }) => {
      const created = {
        id: `comm_${idCounter++}`,
        ...data,
        earnedAt: new Date(),
        paidAt: null,
        reversedAt: null,
      };
      mockCommissionEntries.push(created);
      return created;
    }),
    update: vi.fn(async ({ where, data }: { where: { orderId?: string; id?: string }; data: any }) => {
      const idx = mockCommissionEntries.findIndex((ce) =>
        where.orderId ? ce.orderId === where.orderId : ce.id === where.id
      );
      if (idx === -1) throw new Error('Commission entry not found');
      mockCommissionEntries[idx] = { ...mockCommissionEntries[idx], ...data };
      return mockCommissionEntries[idx];
    }),
    updateMany: vi.fn(async ({ where, data }: { where: Record<string, any>; data: any }) => {
      let count = 0;
      mockCommissionEntries.forEach((ce) => {
        if (where.orderId && ce.orderId !== where.orderId) return;
        if (where.status?.not && ce.status === where.status.not) return;
        Object.assign(ce, data);
        count++;
      });
      return { count };
    }),
    findMany: vi.fn(async ({ where, skip, take }: { where?: any; skip?: number; take?: number }) => {
      let res = mockCommissionEntries.filter((ce) => {
        if (where?.businessId && ce.businessId !== where.businessId) return false;
        if (where?.salesId && ce.salesId !== where.salesId) return false;
        if (where?.status && ce.status !== where.status) return false;
        return true;
      });
      if (skip) res = res.slice(skip);
      if (take) res = res.slice(0, take);
      return res.map((ce) => {
        const sales = mockUsers.find((u) => u.id === ce.salesId);
        const order = mockOrders.find((o) => o.id === ce.orderId);
        return {
          ...ce,
          sales: sales ? { id: sales.id, name: sales.name, email: sales.email } : null,
          order: order ? { id: order.id, orderNo: order.orderNo, grandTotal: order.grandTotal } : null,
        };
      });
    }),
    count: vi.fn(async ({ where }: { where?: any }) => {
      return mockCommissionEntries.filter((ce) => {
        if (where?.businessId && ce.businessId !== where.businessId) return false;
        if (where?.salesId && ce.salesId !== where.salesId) return false;
        if (where?.status && ce.status !== where.status) return false;
        return true;
      }).length;
    }),
  },
  commissionTier: {
    findMany: vi.fn(async ({ where }: { where: { businessId: string } }) => {
      return mockCommissionTiers
        .filter((ct) => ct.businessId === where.businessId)
        .sort((a, b) => b.minAchievementBps - a.minAchievementBps);
    }),
    deleteMany: vi.fn(async ({ where }: { where: { businessId: string } }) => {
      mockCommissionTiers = mockCommissionTiers.filter(
        (ct) => ct.businessId !== where.businessId
      );
      return { count: 1 };
    }),
    create: vi.fn(async ({ data }: { data: any }) => {
      const created = { id: `tier_${idCounter++}`, ...data };
      mockCommissionTiers.push(created);
      return created;
    }),
  },
  salesTarget: {
    findFirst: vi.fn(async ({ where }: { where: Record<string, any> }) => {
      return (
        mockSalesTargets.find((st) => {
          if (where.businessId && st.businessId !== where.businessId) return false;
          if (where.salesId && st.salesId !== where.salesId) return false;
          if (where.month && st.month !== where.month) return false;
          return true;
        }) || null
      );
    }),
    findUnique: vi.fn(async ({ where }: { where: { salesId_month: { salesId: string; month: string } } }) => {
      return (
        mockSalesTargets.find(
          (st) =>
            st.salesId === where.salesId_month.salesId &&
            st.month === where.salesId_month.month
        ) || null
      );
    }),
  },
  creditNote: {
    findMany: vi.fn(async ({ where }: { where: Record<string, any> }) => {
      return mockCreditNotes.filter((cn) => {
        if (where.businessId && cn.businessId !== where.businessId) return false;
        if (where.orderId) {
          if (typeof where.orderId === 'string' && cn.orderId !== where.orderId) return false;
          if (where.orderId.in && !where.orderId.in.includes(cn.orderId)) return false;
        }
        if (where.voidedAt === null && cn.voidedAt !== null) return false;
        return true;
      });
    }),
  },
  payment: {
    findMany: vi.fn(async () => []),
  },
  auditLog: {
    create: vi.fn(async ({ data }: { data: any }) => {
      mockAuditLogs.push(data);
      return { id: `audit_${idCounter++}`, ...data };
    }),
  },
};

vi.mock('@/lib/db', () => ({
  prisma: {
    $transaction: vi.fn(async (callback: any) => callback(mockTx)),
  },
}));

describe('T3.7: Profit dan Komisi Sales (Integration Tests)', () => {
  const businessId = 'biz_test_001';
  const superAdminId = 'user_superadmin_001';
  const salesUserId = 'user_sales_001';

  beforeEach(() => {
    idCounter = 1;
    mockBusinesses = [
      {
        id: businessId,
        name: 'PT BentoCat Distribusi',
        commissionMode: CommissionMode.PERCENT_OF_PROFIT,
        commissionRateBps: 1000, // 10%
        commissionFixedAmount: 0n,
        commissionTrigger: CommissionTrigger.ON_FULL_PAID,
      },
    ];

    mockUsers = [
      {
        id: superAdminId,
        businessId,
        name: 'Super Admin',
        email: 'admin@bentocat.test',
        role: Role.SUPERADMIN,
      },
      {
        id: salesUserId,
        businessId,
        name: 'Sales Andi',
        email: 'andi@bentocat.test',
        role: Role.SALES,
        commissionMode: null, // Pakai default bisnis
        commissionRateBps: null,
        commissionFixedAmount: null,
      },
    ];

    mockOrders = [];
    mockOrderItems = [];
    mockShipments = [];
    mockOrderCosts = [];
    mockCommissionEntries = [];
    mockCommissionTiers = [];
    mockSalesTargets = [];
    mockCreditNotes = [];
    mockAuditLogs = [];
  });

  function setContext(user: { id: string; role: Role }) {
    vi.spyOn(contextModule, 'requireContext').mockImplementation(async (_req, roles) => {
      if (roles && roles.length > 0 && !roles.includes(user.role)) {
        throw new DomainError('FORBIDDEN', 'Anda tidak punya akses', 403);
      }
      return {
        user: {
          id: user.id,
          role: user.role,
          name: user.id === superAdminId ? 'Super Admin' : 'Sales Andi',
          businessId,
        },
        role: user.role,
        businessId,
        sessionId: 'sess_1',
        ip: '127.0.0.1',
      };
    });
  }

  function createTestOrder(opts?: {
    id?: string;
    subtotal?: bigint;
    discountTotal?: bigint;
    shippingCharge?: bigint;
    grandTotal?: bigint;
    status?: OrderStatus;
    items?: any[];
  }) {
    const oId = opts?.id || 'ord_001';
    const order = {
      id: oId,
      businessId,
      customerId: 'cust_001',
      salesId: salesUserId,
      status: opts?.status || OrderStatus.DRAFT,
      orderNo: 'ORD-202611-0001',
      subtotal: opts?.subtotal ?? 1000000n, // Rp 1.000.000
      discountTotal: opts?.discountTotal ?? 50000n, // Rp 50.000
      shippingCharge: opts?.shippingCharge ?? 25000n, // Rp 25.000
      ppnEnabled: false,
      ppnRateBps: 0,
      ppnAmount: 0n,
      grandTotal: opts?.grandTotal ?? 975000n, // 1jt - 50rb + 25rb = 975.000
      dpBps: 3000,
      dpAmount: 292500n,
      paidTotal: 0n,
      creditTotal: 0n,
      deletedAt: null,
      createdAt: new Date(),
    };
    mockOrders.push(order);

    const items = opts?.items || [
      {
        id: `oi_${oId}_1`,
        businessId,
        orderId: oId,
        productId: 'prod_1',
        qty: 10,
        unitPrice: 100000n,
        lineSubtotal: 1000000n,
        lineDiscount: 50000n,
        lineNet: 950000n,
        costPrice: 60000n, // HPP per unit = 60.000, total COGS = 600.000
        discountSource: 'MANUAL',
      },
    ];
    mockOrderItems.push(...items);

    return order;
  }

  it('1. Menghitung profit pesanan secara akurat via GET /api/v1/orders/:id/profit (Super Admin)', async () => {
    setContext({ id: superAdminId, role: Role.SUPERADMIN });
    const order = createTestOrder();

    // Actual shipping cost = 35.000 (Subsidi ongkir = 35.000 - 25.000 = 10.000)
    mockShipments.push({
      id: 'ship_001',
      businessId,
      orderId: order.id,
      actualCost: 35000n,
      status: 'SHIPPED',
    });

    // Biaya ekstra = 15.000 (Packing kayu)
    mockOrderCosts.push({
      id: 'cost_001',
      businessId,
      orderId: order.id,
      label: 'Packing Kayu Ekstra',
      amount: 15000n,
      createdById: superAdminId,
      createdAt: new Date(),
    });

    const req = new NextRequest(`http://localhost/api/v1/orders/${order.id}/profit`);
    const res = await getOrderProfitHandler(req, { params: Promise.resolve({ id: order.id }) });
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.ok).toBe(true);
    const data = json.data;

    // goodsRevenue: 950.000
    expect(data.goodsRevenue).toBe(950000);
    // shippingCharge: 25.000
    expect(data.shippingCharge).toBe(25000);
    // revenue: 950.000 + 25.000 = 975.000
    expect(data.revenue).toBe(975000);
    // cogs: 10 * 60.000 = 600.000
    expect(data.cogs).toBe(600000);
    // shippingActualCost: 35.000
    expect(data.shippingActualCost).toBe(35000);
    // shippingSubsidy: max(0, 35.000 - 25.000) = 10.000
    expect(data.shippingSubsidy).toBe(10000);
    // extraCosts: 15.000
    expect(data.extraCosts).toBe(15000);
    // profit: revenue (975.000) - cogs (600.000) - shippingActualCost (35.000) - extra (15.000) = 325.000
    expect(data.profit).toBe(325000);
    // marginBps: (325.000 * 10.000) / 975.000 = 3333 bps (33.33%)
    expect(data.marginBps).toBe(3333);
    // costs array
    expect(data.costs).toHaveLength(1);
    expect(data.costs[0].label).toBe('Packing Kayu Ekstra');
  });

  it('2. Anti-Leakage (Zero-Leakage): Sales role menerima 403 FORBIDDEN pada seluruh endpoint profit & komisi', async () => {
    setContext({ id: salesUserId, role: Role.SALES });
    const order = createTestOrder();

    // GET /orders/:id/profit
    const req1 = new NextRequest(`http://localhost/api/v1/orders/${order.id}/profit`);
    const res1 = await getOrderProfitHandler(req1, { params: Promise.resolve({ id: order.id }) });
    expect(res1.status).toBe(403);
    const json1 = await res1.json();
    assertNoSecretKeys(json1);

    // GET /orders/:id/costs
    const req2 = new NextRequest(`http://localhost/api/v1/orders/${order.id}/costs`);
    const res2 = await listOrderCostsHandler(req2, { params: Promise.resolve({ id: order.id }) });
    expect(res2.status).toBe(403);

    // POST /orders/:id/costs
    const req3 = new NextRequest(`http://localhost:3000/api/v1/orders/${order.id}/costs`, {
      method: 'POST',
      headers: { origin: 'http://localhost:3000', 'content-type': 'application/json' },
      body: JSON.stringify({ label: 'Biaya Gelap', amount: 50000 }),
    });
    const res3 = await createOrderCostHandler(req3, { params: Promise.resolve({ id: order.id }) });
    expect(res3.status).toBe(403);

    // DELETE /orders/:id/costs/:costId
    const req4 = new NextRequest(`http://localhost:3000/api/v1/orders/${order.id}/costs/cost_1`, {
      method: 'DELETE',
      headers: { origin: 'http://localhost:3000' },
    });
    const res4 = await deleteOrderCostHandler(req4, {
      params: Promise.resolve({ id: order.id, costId: 'cost_1' }),
    });
    expect(res4.status).toBe(403);

    // GET /commission/entries
    const req5 = new NextRequest(`http://localhost:3000/api/v1/commission/entries`);
    const res5 = await listCommissionEntriesHandler(req5);
    expect(res5.status).toBe(403);

    // POST /commission/entries/:id/pay
    const req6 = new NextRequest(`http://localhost:3000/api/v1/commission/entries/comm_1/pay`, {
      method: 'POST',
      headers: { origin: 'http://localhost:3000', 'content-type': 'application/json' },
      body: JSON.stringify({ note: 'Pay note' }),
    });
    const res6 = await payCommissionEntryHandler(req6, { params: Promise.resolve({ id: 'comm_1' }) });
    expect(res6.status).toBe(403);

    // GET & PUT /commission/tiers
    const req7 = new NextRequest(`http://localhost:3000/api/v1/commission/tiers`);
    const res7 = await getCommissionTiersHandler(req7);
    expect(res7.status).toBe(403);

    const req8 = new NextRequest(`http://localhost:3000/api/v1/commission/tiers`, {
      method: 'PUT',
      headers: { origin: 'http://localhost:3000', 'content-type': 'application/json' },
      body: JSON.stringify({ tiers: [{ minAchievementBps: 10000, rateBps: 500 }] }),
    });
    const res8 = await setCommissionTiersHandler(req8);
    expect(res8.status).toBe(403);
  });

  it('3. CRUD OrderCost dan otomatis rekalkulasi komisi sales berkurang', async () => {
    setContext({ id: superAdminId, role: Role.SUPERADMIN });
    const order = createTestOrder();

    // Set order lunas
    order.paidTotal = order.grandTotal;

    // Pemicu evaluasi komisi awal (Laba awal: 975.000 - 600.000 = 375.000. Komisi 10% = 37.500)
    const commEntry = await evaluateOrderCommission(mockTx as any, order.id);
    expect(commEntry).not.toBeNull();
    expect(commEntry?.status).toBe(CommissionStatus.EARNED);
    expect(Number(commEntry?.amount)).toBe(37500);

    // Tambahkan biaya ekstra Rp 25.000 lewat POST /api/v1/orders/:id/costs
    const createReq = new NextRequest(`http://localhost:3000/api/v1/orders/${order.id}/costs`, {
      method: 'POST',
      headers: { origin: 'http://localhost:3000', 'content-type': 'application/json' },
      body: JSON.stringify({ label: 'Asuransi Pengiriman', amount: 25000 }),
    });
    const createRes = await createOrderCostHandler(createReq, {
      params: Promise.resolve({ id: order.id }),
    });
    expect(createRes.status).toBe(201);
    const createJson = await createRes.json();
    const newCostId = createJson.data.id;

    // Periksa bahwa komisi otomatis berkurang:
    // Laba baru = 375.000 - 25.000 = 350.000. Komisi 10% = 35.000
    const updatedComm = mockCommissionEntries.find((c) => c.orderId === order.id);
    expect(Number(updatedComm?.amount)).toBe(35000);
    expect(Number(updatedComm?.basisAmount)).toBe(350000);

    // Hapus biaya ekstra via DELETE /api/v1/orders/:id/costs/:costId
    const delReq = new NextRequest(`http://localhost:3000/api/v1/orders/${order.id}/costs/${newCostId}`, {
      method: 'DELETE',
      headers: { origin: 'http://localhost:3000' },
    });
    const delRes = await deleteOrderCostHandler(delReq, {
      params: Promise.resolve({ id: order.id, costId: newCostId }),
    });
    expect(delRes.status).toBe(200);

    // Komisi kembali ke semula (37.500)
    const restoredComm = mockCommissionEntries.find((c) => c.orderId === order.id);
    expect(Number(restoredComm?.amount)).toBe(37500);
  });

  it('4. Evaluasi Pemicu Komisi: ON_DP_PAID vs ON_FULL_PAID', async () => {
    // Skenario A: Business setting ON_FULL_PAID
    mockBusinesses[0].commissionTrigger = CommissionTrigger.ON_FULL_PAID;
    const orderA = createTestOrder({ id: 'ord_trigger_a' });

    // Baru bayar DP (belum lunas)
    orderA.paidTotal = orderA.dpAmount; // 292.500 < 975.000

    const commA = await evaluateOrderCommission(mockTx as any, orderA.id);
    expect(commA).toBeNull(); // Belum lunas -> belum berhak komisi

    // Skenario B: Business setting ON_DP_PAID
    mockBusinesses[0].commissionTrigger = CommissionTrigger.ON_DP_PAID;
    const orderB = createTestOrder({ id: 'ord_trigger_b' });

    orderB.paidTotal = orderB.dpAmount; // DP terpenuhi

    const commB = await evaluateOrderCommission(mockTx as any, orderB.id);
    expect(commB).not.toBeNull();
    expect(commB?.status).toBe(CommissionStatus.EARNED);
    expect(Number(commB?.amount)).toBe(37500);
  });

  it('5. Skema 4 Mode Komisi: PERCENT_OF_PROFIT, PERCENT_OF_REVENUE, FIXED_PER_ORDER, TIERED_BY_TARGET', async () => {
    mockBusinesses[0].commissionTrigger = CommissionTrigger.ON_FULL_PAID;

    // Mode 1: PERCENT_OF_REVENUE (2% dari omzet 975.000 = 19.500)
    mockBusinesses[0].commissionMode = CommissionMode.PERCENT_OF_REVENUE;
    mockBusinesses[0].commissionRateBps = 200; // 2%
    const order1 = createTestOrder({ id: 'ord_rev_1' });
    order1.paidTotal = order1.grandTotal;

    const c1 = await evaluateOrderCommission(mockTx as any, order1.id);
    expect(Number(c1?.amount)).toBe(19500);

    // Mode 2: FIXED_PER_ORDER (Rp 50.000 flat)
    mockBusinesses[0].commissionMode = CommissionMode.FIXED_PER_ORDER;
    mockBusinesses[0].commissionFixedAmount = 50000n;
    const order2 = createTestOrder({ id: 'ord_fixed_1' });
    order2.paidTotal = order2.grandTotal;

    const c2 = await evaluateOrderCommission(mockTx as any, order2.id);
    expect(Number(c2?.amount)).toBe(50000);

    // Mode 3: TIERED_BY_TARGET
    mockBusinesses[0].commissionMode = CommissionMode.TIERED_BY_TARGET;
    // Set Target bulanan sales: Rp 12.000.000 omzet (Total omzet 3 pesanan = 10.450.000 -> 87% capaian)
    const currentMonth = '2026-11';
    mockSalesTargets.push({
      id: 'st_001',
      businessId,
      salesId: salesUserId,
      month: currentMonth,
      targetRevenue: 12000000n,
      targetProfit: 3000000n,
    });

    // Set Commission Tiers:
    // >= 100% target (10000 bps) -> 15% dari laba
    // >= 80% target (8000 bps) -> 10% dari laba
    // < 80% -> 5% dari laba (0 bps)
    mockCommissionTiers = [
      { id: 'tier_1', businessId, minAchievementBps: 10000, rateBps: 1500 },
      { id: 'tier_2', businessId, minAchievementBps: 8000, rateBps: 1000 },
      { id: 'tier_3', businessId, minAchievementBps: 0, rateBps: 500 },
    ];

    // Buat order bernilai omzet 8.500.000 (85% achievement -> tier 2 = 10%)
    // Laba = 8.500.000 - 5.000.000 = 3.500.000. Komisi 10% = 350.000
    const order3 = createTestOrder({
      id: 'ord_tiered_1',
      subtotal: 8500000n,
      discountTotal: 0n,
      shippingCharge: 0n,
      grandTotal: 8500000n,
      items: [
        {
          id: 'oi_tier_1',
          businessId,
          orderId: 'ord_tiered_1',
          productId: 'prod_1',
          qty: 1,
          unitPrice: 8500000n,
          lineSubtotal: 8500000n,
          lineDiscount: 0n,
          lineNet: 8500000n,
          costPrice: 5000000n,
          discountSource: 'MANUAL',
        },
      ],
    });
    order3.paidTotal = order3.grandTotal;

    const c3 = await evaluateOrderCommission(mockTx as any, order3.id);
    expect(c3).not.toBeNull();
    // 85% achievement matches tier_2 (>= 80% minAchievementBps) with 10% rate
    expect(c3?.rateBps).toBe(1000);
    expect(Number(c3?.amount)).toBe(350000);
  });

  it('6. Override Pengaturan Komisi pada tingkat Sales User mengesampingkan default Usaha', async () => {
    // Usaha default: PERCENT_OF_REVENUE 2%
    mockBusinesses[0].commissionMode = CommissionMode.PERCENT_OF_REVENUE;
    mockBusinesses[0].commissionRateBps = 200;

    // Sales Andi dikonfigurasi khusus: PERCENT_OF_PROFIT 20%
    const sales = mockUsers.find((u) => u.id === salesUserId);
    sales.commissionMode = CommissionMode.PERCENT_OF_PROFIT;
    sales.commissionRateBps = 2000; // 20%

    const order = createTestOrder({ id: 'ord_override_1' });
    order.paidTotal = order.grandTotal;

    const comm = await evaluateOrderCommission(mockTx as any, order.id);
    // Menggunakan 20% dari laba (375.000) = 75.000, bukan 2% omzet (19.500)
    expect(comm?.mode).toBe(CommissionMode.PERCENT_OF_PROFIT);
    expect(comm?.rateBps).toBe(2000);
    expect(Number(comm?.amount)).toBe(75000);
  });

  it('7. Rekalkulasi komisi saat retur penjualan (CreditNote) diterbitkan dan dipulihkan saat void CN', async () => {
    mockBusinesses[0].commissionMode = CommissionMode.PERCENT_OF_PROFIT;
    mockBusinesses[0].commissionRateBps = 1000; // 10%

    const order = createTestOrder({ id: 'ord_return_1' });
    order.paidTotal = order.grandTotal;

    // Komisi awal: 10% dari 375.000 = 37.500
    await evaluateOrderCommission(mockTx as any, order.id);
    let comm = mockCommissionEntries.find((c) => c.orderId === order.id);
    expect(Number(comm?.amount)).toBe(37500);

    // Terbitkan Nota Kredit (Retur barang: nilai retur 200.000 ex PPN, HPP dipulihkan 120.000)
    // Penurunan laba = 200.000 - 120.000 = 80.000
    // Laba baru = 375.000 - 80.000 = 295.000. Komisi baru = 29.500
    const cn = {
      id: 'cn_001',
      businessId,
      orderId: order.id,
      amountExPpn: 200000n,
      cogsReversed: 120000n,
      voidedAt: null as Date | null,
    };
    mockCreditNotes.push(cn);

    await recalculateOrderCommission(mockTx as any, order.id);
    comm = mockCommissionEntries.find((c) => c.orderId === order.id);
    expect(Number(comm?.amount)).toBe(29500);
    expect(Number(comm?.basisAmount)).toBe(295000);

    // Batalkan (Void) Nota Kredit: laba dan komisi kembali normal
    cn.voidedAt = new Date();
    await recalculateOrderCommission(mockTx as any, order.id);
    comm = mockCommissionEntries.find((c) => c.orderId === order.id);
    expect(Number(comm?.amount)).toBe(37500);
  });

  it('8. Status komisi dikunci setelah PAID dan berstatus REVERSED saat pesanan dibatalkan / dihapus', async () => {
    setContext({ id: superAdminId, role: Role.SUPERADMIN });
    const order = createTestOrder({ id: 'ord_paid_1' });
    order.paidTotal = order.grandTotal;

    await evaluateOrderCommission(mockTx as any, order.id);
    let comm = mockCommissionEntries.find((c) => c.orderId === order.id);
    expect(comm?.status).toBe(CommissionStatus.EARNED);

    // Super Admin menandai komisi PAID via API
    const payReq = new NextRequest(`http://localhost:3000/api/v1/commission/entries/${comm?.id}/pay`, {
      method: 'POST',
      headers: { origin: 'http://localhost:3000', 'content-type': 'application/json' },
      body: JSON.stringify({ note: 'Dibayar via Transfer Bank' }),
    });
    const payRes = await payCommissionEntryHandler(payReq, {
      params: Promise.resolve({ id: comm!.id }),
    });
    expect(payRes.status).toBe(200);

    comm = mockCommissionEntries.find((c) => c.orderId === order.id);
    expect(comm?.status).toBe(CommissionStatus.PAID);
    expect(comm?.paidAt).not.toBeNull();
    expect(comm?.note).toBe('Dibayar via Transfer Bank');

    // Karena sudah PAID, penambahan biaya ekstra tidak akan mengubah nominal komisi (dikunci)
    mockOrderCosts.push({
      id: 'cost_locked',
      businessId,
      orderId: order.id,
      label: 'Biaya Terlambat',
      amount: 100000n,
      createdById: superAdminId,
      createdAt: new Date(),
    });
    await recalculateOrderCommission(mockTx as any, order.id);
    comm = mockCommissionEntries.find((c) => c.orderId === order.id);
    expect(Number(comm?.amount)).toBe(37500); // Tetap 37.500

    // Saat pesanan dibatalkan / dihapus, status komisi menjadi REVERSED
    await reverseOrderCommission(mockTx as any, order.id, 'Pesanan dibatalkan');
    comm = mockCommissionEntries.find((c) => c.orderId === order.id);
    expect(comm?.status).toBe(CommissionStatus.REVERSED);
    expect(comm?.reversedAt).not.toBeNull();
  });
});
