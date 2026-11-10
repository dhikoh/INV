import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET as getPricingHandler } from '@/app/api/v1/customers/[id]/pricing/route';
import {
  GET as getMinPricesHandler,
  PUT as setMinPriceHandler,
  DELETE as deleteMinPriceHandler,
} from '@/app/api/v1/customers/[id]/min-prices/route';
import {
  GET as getPromosHandler,
  POST as createPromoHandler,
} from '@/app/api/v1/customers/[id]/promos/route';
import {
  GET as getPromoDetailHandler,
  PATCH as updatePromoHandler,
  DELETE as deletePromoHandler,
} from '@/app/api/v1/customer-promos/[id]/route';
import { GET as getPriceHistoryHandler } from '@/app/api/v1/customers/[id]/price-history/route';
import { Role, PipelineStage, DiscountSource, DiscountType, PriceField } from '@prisma/client';
import { DomainError } from '@/lib/domain/money';
import * as contextModule from '@/lib/auth/context';
import { assertNoSecretKeys } from '../helpers/leak';

interface MockCustomer {
  id: string;
  businessId: string;
  code: string;
  name: string;
  assignedSalesId: string | null;
  pipelineStage: PipelineStage;
  deletedAt: Date | null;
}

interface MockProduct {
  id: string;
  businessId: string;
  sku: string;
  name: string;
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
  note: string | null;
  updatedAt: Date;
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
  note: string | null;
  createdAt: Date;
  deletedAt: Date | null;
}

interface MockPriceHistory {
  id: string;
  businessId: string;
  productId: string;
  customerId: string | null;
  field: PriceField;
  oldValue: bigint | null;
  newValue: bigint;
  reason: string;
  changedById: string;
  createdAt: Date;
}

interface MockUser {
  id: string;
  name: string;
  username: string;
  role: Role;
  businessId: string | null;
}

interface MockAuditLog {
  id: string;
  businessId: string | null;
  action: string;
  entityType: string;
  entityId: string;
  summary: string | null;
}

let customers: MockCustomer[] = [];
let products: MockProduct[] = [];
let customerMinPrices: MockCustomerMinPrice[] = [];
let customerPromos: MockCustomerPromo[] = [];
let priceHistories: MockPriceHistory[] = [];
let users: MockUser[] = [];
let auditLogs: MockAuditLog[] = [];

vi.mock('@/lib/db', () => {
  const mockPrisma = {
    customer: {
      findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        return (
          customers.find((c) => {
            if (where.id && c.id !== where.id) return false;
            if (where.businessId && c.businessId !== where.businessId) return false;
            if (where.deletedAt === null && c.deletedAt !== null) return false;
            if (where.assignedSalesId && c.assignedSalesId !== where.assignedSalesId)
              return false;
            return true;
          }) || null
        );
      }),
    },
    product: {
      findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        return (
          products.find((p) => {
            if (where.id && p.id !== where.id) return false;
            if (where.businessId && p.businessId !== where.businessId) return false;
            if (where.deletedAt === null && p.deletedAt !== null) return false;
            return true;
          }) || null
        );
      }),
      findMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        return products.filter((p) => {
          if (where.businessId && p.businessId !== where.businessId) return false;
          if (where.deletedAt === null && p.deletedAt !== null) return false;
          if (where.isActive === true && !p.isActive) return false;
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
        return customerMinPrices.filter((m) => {
          if (where.businessId && m.businessId !== where.businessId) return false;
          if (where.customerId && m.customerId !== where.customerId) return false;
          return true;
        });
      }),
      findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        return (
          customerMinPrices.find((m) => {
            if (where.id && m.id !== where.id) return false;
            if (where.businessId && m.businessId !== where.businessId) return false;
            if (where.customerId && m.customerId !== where.customerId) return false;
            if (where.productId && m.productId !== where.productId) return false;
            return true;
          }) || null
        );
      }),
      findUnique: vi.fn(async ({ where }: { where: { customerId_productId?: { customerId: string; productId: string } } }) => {
        if (where.customerId_productId) {
          const { customerId, productId } = where.customerId_productId;
          return (
            customerMinPrices.find(
              (m) => m.customerId === customerId && m.productId === productId
            ) || null
          );
        }
        return null;
      }),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const item: MockCustomerMinPrice = {
          id: `cmp-${customerMinPrices.length + 1}`,
          businessId: data.businessId as string,
          customerId: data.customerId as string,
          productId: data.productId as string,
          minPrice: data.minPrice as bigint,
          note: (data.note as string) || null,
          updatedAt: new Date(),
        };
        customerMinPrices.push(item);
        return item;
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const idx = customerMinPrices.findIndex((m) => m.id === where.id);
        if (idx === -1) throw new Error('CustomerMinPrice not found');
        customerMinPrices[idx] = {
          ...customerMinPrices[idx],
          minPrice: (data.minPrice as bigint) ?? customerMinPrices[idx].minPrice,
          note: data.note !== undefined ? (data.note as string | null) : customerMinPrices[idx].note,
          updatedAt: new Date(),
        };
        return customerMinPrices[idx];
      }),
      updateMany: vi.fn(async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        let count = 0;
        customerMinPrices.forEach((m) => {
          if (where.id && m.id !== where.id) return;
          if (where.businessId && m.businessId !== where.businessId) return;
          if (data.minPrice !== undefined) m.minPrice = data.minPrice as bigint;
          if (data.note !== undefined) m.note = data.note as string | null;
          m.updatedAt = new Date();
          count++;
        });
        return { count };
      }),
      delete: vi.fn(async ({ where }: { where: { id: string } }) => {
        const idx = customerMinPrices.findIndex((m) => m.id === where.id);
        if (idx !== -1) {
          customerMinPrices.splice(idx, 1);
        }
        return { id: where.id };
      }),
      deleteMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        let count = 0;
        for (let i = customerMinPrices.length - 1; i >= 0; i--) {
          const m = customerMinPrices[i];
          if (where.id && m.id !== where.id) continue;
          if (where.businessId && m.businessId !== where.businessId) continue;
          customerMinPrices.splice(i, 1);
          count++;
        }
        return { count };
      }),
    },
    customerPromo: {
      findMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        const now = new Date();
        return customerPromos.filter((p) => {
          if (where.businessId && p.businessId !== where.businessId) return false;
          if (where.customerId && p.customerId !== where.customerId) return false;
          if (where.deletedAt === null && p.deletedAt !== null) return false;
          if (where.isActive === true && !p.isActive) return false;
          if (where.validFrom && typeof where.validFrom === 'object') {
            const vf = where.validFrom as { lte?: Date };
            if (vf.lte && p.validFrom > vf.lte) return false;
          }
          if (where.OR && Array.isArray(where.OR)) {
            const passes = p.validTo === null || p.validTo >= now;
            if (!passes) return false;
          }
          return true;
        });
      }),
      findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        return (
          customerPromos.find((p) => {
            if (where.id && p.id !== where.id) return false;
            if (where.businessId && p.businessId !== where.businessId) return false;
            if (where.deletedAt === null && p.deletedAt !== null) return false;
            return true;
          }) || null
        );
      }),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const item: MockCustomerPromo = {
          id: `promo-${customerPromos.length + 1}`,
          businessId: data.businessId as string,
          customerId: data.customerId as string,
          productId: (data.productId as string) || null,
          label: data.label as string,
          source: data.source as DiscountSource,
          type: data.type as DiscountType,
          valueBps: (data.valueBps as number) || null,
          valueAmount: (data.valueAmount as bigint) || null,
          validFrom: data.validFrom as Date,
          validTo: (data.validTo as Date) || null,
          isActive: (data.isActive as boolean) ?? true,
          note: (data.note as string) || null,
          createdAt: new Date(),
          deletedAt: null,
        };
        customerPromos.push(item);
        return item;
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const idx = customerPromos.findIndex((p) => p.id === where.id);
        if (idx === -1) throw new Error('CustomerPromo not found');
        customerPromos[idx] = {
          ...customerPromos[idx],
          ...(data.label !== undefined ? { label: data.label as string } : {}),
          ...(data.isActive !== undefined ? { isActive: data.isActive as boolean } : {}),
          ...(data.validTo !== undefined ? { validTo: data.validTo as Date | null } : {}),
          ...(data.note !== undefined ? { note: data.note as string | null } : {}),
          ...(data.deletedAt !== undefined ? { deletedAt: data.deletedAt as Date | null } : {}),
        };
        return customerPromos[idx];
      }),
    },
    priceHistory: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const item: MockPriceHistory = {
          id: `ph-${priceHistories.length + 1}`,
          businessId: data.businessId as string,
          productId: data.productId as string,
          customerId: (data.customerId as string) || null,
          field: data.field as PriceField,
          oldValue: (data.oldValue as bigint) || null,
          newValue: data.newValue as bigint,
          reason: data.reason as string,
          changedById: data.changedById as string,
          createdAt: new Date(),
        };
        priceHistories.push(item);
        return item;
      }),
      findMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        return priceHistories.filter((h) => {
          if (where.businessId && h.businessId !== where.businessId) return false;
          if (where.customerId && h.customerId !== where.customerId) return false;
          if (where.field && h.field !== where.field) return false;
          return true;
        });
      }),
    },
    user: {
      findMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        const idFilter = where.id as { in: string[] } | undefined;
        if (idFilter?.in) {
          return users.filter((u) => idFilter.in.includes(u.id));
        }
        return users;
      }),
    },
    auditLog: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const log: MockAuditLog = {
          id: `audit-${auditLogs.length + 1}`,
          businessId: (data.businessId as string) || null,
          action: data.action as string,
          entityType: data.entityType as string,
          entityId: data.entityId as string,
          summary: (data.summary as string) || null,
        };
        auditLogs.push(log);
        return log;
      }),
    },
    $transaction: vi.fn(async (cb: (tx: unknown) => Promise<unknown>) => {
      return cb(mockPrisma);
    }),
  };

  return {
    prisma: mockPrisma,
  };
});

describe('T2.3: Customer Pricing Integration Tests (Seksi 7.2, 10.5, 17.3 nomor 13)', () => {
  const APP_URL = 'http://localhost:3000';
  const businessA = 'biz-a';

  const userSA = {
    id: 'user-sa',
    name: 'Super Owner',
    username: 'superowner',
    role: Role.SUPERADMIN,
    businessId: null,
  };

  const userSales1 = {
    id: 'user-sales-1',
    name: 'Sales Budi',
    username: 'salesbudi',
    role: Role.SALES,
    businessId: businessA,
  };

  const userSales2 = {
    id: 'user-sales-2',
    name: 'Sales Citra',
    username: 'salescitra',
    role: Role.SALES,
    businessId: businessA,
  };

  const superAdminCtx: contextModule.Ctx = {
    user: userSA,
    sessionId: 'sess-sa',
    role: Role.SUPERADMIN,
    businessId: businessA,
    ip: '127.0.0.1',
  };

  const sales1Ctx: contextModule.Ctx = {
    user: userSales1,
    sessionId: 'sess-sales-1',
    role: Role.SALES,
    businessId: businessA,
    ip: '127.0.0.1',
  };

  const sales2Ctx: contextModule.Ctx = {
    user: userSales2,
    sessionId: 'sess-sales-2',
    role: Role.SALES,
    businessId: businessA,
    ip: '127.0.0.1',
  };

  let activeCtx: contextModule.Ctx;

  beforeEach(() => {
    customers = [
      {
        id: 'cust-1',
        businessId: businessA,
        code: 'CUST-001',
        name: 'Toko Makmur Sentosa',
        assignedSalesId: 'user-sales-1',
        pipelineStage: PipelineStage.PROSPECT,
        deletedAt: null,
      },
    ];

    products = [
      {
        id: 'prod-1',
        businessId: businessA,
        sku: 'CAT-001',
        name: 'Cat Tembok Putih 5kg',
        basePrice: BigInt(100000), // Rp 100.000
        minPrice: BigInt(80000), // Rp 80.000
        costPrice: BigInt(65000), // Rp 65.000 (HPP Rahasia)
        isActive: true,
        deletedAt: null,
      },
      {
        id: 'prod-2',
        businessId: businessA,
        sku: 'CAT-002',
        name: 'Cat Kayu Coklat 1kg',
        basePrice: BigInt(60000), // Rp 60.000
        minPrice: BigInt(45000), // Rp 45.000
        costPrice: BigInt(35000), // Rp 35.000 (HPP Rahasia)
        isActive: true,
        deletedAt: null,
      },
    ];

    customerMinPrices = [];
    customerPromos = [];
    priceHistories = [];
    users = [userSA, userSales1, userSales2];
    auditLogs = [];

    activeCtx = superAdminCtx;
    vi.clearAllMocks();

    vi.spyOn(contextModule, 'requireContext').mockImplementation(
      async (_req, roles) => {
        if (roles && !roles.includes(activeCtx.role)) {
          throw new DomainError('FORBIDDEN', 'Akses ditolak', 403);
        }
        return activeCtx;
      }
    );
  });

  describe('1. GET /customers/:id/pricing (Seksi 7.2, 10.5, 17.3 nomor 13)', () => {
    it('menghitung floor price efektif dan promo aktif tanpa membocorkan costPrice', async () => {
      // 1. Pasang CustomerMinPrice khusus pada prod-1: Rp 75.000 (lebih murah dari default Rp 80.000)
      customerMinPrices.push({
        id: 'cmp-1',
        businessId: businessA,
        customerId: 'cust-1',
        productId: 'prod-1',
        minPrice: BigInt(75000),
        note: 'Harga khusus loyal customer',
        updatedAt: new Date(),
      });

      // 2. Pasang CustomerPromo aktif (Diskon Rp 5.000 per unit pada prod-1)
      customerPromos.push({
        id: 'promo-1',
        businessId: businessA,
        customerId: 'cust-1',
        productId: 'prod-1',
        label: 'Promo Subsidi Cat',
        source: DiscountSource.SUBSIDY,
        type: DiscountType.AMOUNT,
        valueBps: null,
        valueAmount: BigInt(5000), // Rp 5.000
        validFrom: new Date('2026-11-01'),
        validTo: new Date('2026-11-30'),
        isActive: true,
        note: null,
        createdAt: new Date(),
        deletedAt: null,
      });

      // 3. Pasang CustomerPromo kedaluwarsa (harus otomatis terfilter / tidak aktif)
      customerPromos.push({
        id: 'promo-expired',
        businessId: businessA,
        customerId: 'cust-1',
        productId: 'prod-1',
        label: 'Promo Hangus',
        source: DiscountSource.PROMO,
        type: DiscountType.PERCENT,
        valueBps: 1000, // 10%
        valueAmount: null,
        validFrom: new Date('2026-10-01'),
        validTo: new Date('2026-10-15'), // Sudah lewat
        isActive: true,
        note: null,
        createdAt: new Date(),
        deletedAt: null,
      });

      // Akses oleh Sales 1
      activeCtx = sales1Ctx;

      const req = new NextRequest(
        'http://localhost:3000/api/v1/customers/cust-1/pricing',
        { method: 'GET' }
      );

      const res = await getPricingHandler(req, {
        params: Promise.resolve({ id: 'cust-1' }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.ok).toBe(true);

      const pricing = json.data.pricing;
      expect(pricing).toHaveLength(2);

      // Prod 1: Memiliki CustomerMinPrice khusus (75.000) yang menimpa default (80.000)
      const p1 = pricing.find((p: { productId: string }) => p.productId === 'prod-1');
      expect(p1.basePrice).toBe(100000);
      expect(p1.defaultMinPrice).toBe(80000);
      expect(p1.customerMinPrice).toBe(75000);
      expect(p1.effectiveFloorPrice).toBe(75000);
      expect(p1.hasCustomFloor).toBe(true);

      // Promo aktif pada Prod 1: Promo valid menurunkan floor (75.000 - 5.000 = 70.000)
      expect(p1.activePromos).toHaveLength(1);
      expect(p1.activePromos[0].label).toBe('Promo Subsidi Cat');
      expect(p1.activePromos[0].discountPerUnit).toBe(5000);
      expect(p1.activePromos[0].floorWithPromo).toBe(70000); // 75.000 - 5.000

      // Prod 2: Tidak memiliki CustomerMinPrice khusus, gunakan default (45.000)
      const p2 = pricing.find((p: { productId: string }) => p.productId === 'prod-2');
      expect(p2.customerMinPrice).toBeNull();
      expect(p2.effectiveFloorPrice).toBe(45000);
      expect(p2.hasCustomFloor).toBe(false);

      // UJI KEBOCORAN RAHASIA (Seksi 17.4 c & Golden Rules):
      // Pastikan HPP / costPrice sama sekali TIDAK ada di payload respons!
      expect(JSON.stringify(json)).not.toContain('costPrice');
      expect(JSON.stringify(json)).not.toContain('65000');
      assertNoSecretKeys(json);
    });

    it('sales tidak bisa mengakses pricing untuk customer sales lain (404)', async () => {
      activeCtx = sales2Ctx;

      const req = new NextRequest(
        'http://localhost:3000/api/v1/customers/cust-1/pricing',
        { method: 'GET' }
      );

      const res = await getPricingHandler(req, {
        params: Promise.resolve({ id: 'cust-1' }),
      });

      expect(res.status).toBe(404);
      const json = await res.json();
      expect(json.ok).toBe(false);
      expect(json.error.code).toBe('NOT_FOUND');
    });
  });

  describe('2. PUT & DELETE /customers/:id/min-prices (Seksi 7.2, 17.3 nomor 12 & 13)', () => {
    it('Super Admin dapat menetapkan harga minimal khusus, menulis PriceHistory dan audit log', async () => {
      activeCtx = superAdminCtx;

      const req = new NextRequest(
        'http://localhost:3000/api/v1/customers/cust-1/min-prices',
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Origin: APP_URL },
          body: JSON.stringify({
            productId: 'prod-1',
            minPrice: 70000,
            reason: 'Kesepakatan kontrak volume besar tahun 2026',
            note: 'Disetujui direksi',
          }),
        }
      );

      const res = await setMinPriceHandler(req, {
        params: Promise.resolve({ id: 'cust-1' }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.ok).toBe(true);
      expect(json.data.minPrice).toBe(70000);

      // Periksa PriceHistory wajib tercatat dengan field CUSTOMER_MIN
      expect(priceHistories).toHaveLength(1);
      expect(priceHistories[0].field).toBe(PriceField.CUSTOMER_MIN);
      expect(priceHistories[0].newValue).toBe(BigInt(70000));
      expect(priceHistories[0].reason).toBe('Kesepakatan kontrak volume besar tahun 2026');
      expect(priceHistories[0].customerId).toBe('cust-1');

      // Periksa Audit Log
      expect(auditLogs.some((l) => l.action === 'CUSTOMER_MIN_PRICE_SET')).toBe(true);
    });

    it('menolak (422) jika harga minimal khusus melebihi harga jual dasar produk', async () => {
      activeCtx = superAdminCtx;

      // prod-1 basePrice adalah Rp 100.000, coba set minPrice Rp 120.000
      const req = new NextRequest(
        'http://localhost:3000/api/v1/customers/cust-1/min-prices',
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Origin: APP_URL },
          body: JSON.stringify({
            productId: 'prod-1',
            minPrice: 120000,
            reason: 'Menaikkan harga minimal di atas harga dasar',
          }),
        }
      );

      const res = await setMinPriceHandler(req, {
        params: Promise.resolve({ id: 'cust-1' }),
      });

      expect(res.status).toBe(422);
      const json = await res.json();
      expect(json.ok).toBe(false);
      expect(json.error.code).toBe('PRICE_INVALID');
    });

    it('menolak (422) jika alasan (reason) kosong atau terlalu pendek', async () => {
      activeCtx = superAdminCtx;

      const req = new NextRequest(
        'http://localhost:3000/api/v1/customers/cust-1/min-prices',
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Origin: APP_URL },
          body: JSON.stringify({
            productId: 'prod-1',
            minPrice: 70000,
            reason: '  ', // Kosong
          }),
        }
      );

      const res = await setMinPriceHandler(req, {
        params: Promise.resolve({ id: 'cust-1' }),
      });

      expect(res.status).toBe(422);
    });

    it('Super Admin dapat mereset harga minimal khusus kembali ke harga default produk', async () => {
      activeCtx = superAdminCtx;

      customerMinPrices.push({
        id: 'cmp-existing',
        businessId: businessA,
        customerId: 'cust-1',
        productId: 'prod-1',
        minPrice: BigInt(70000),
        note: null,
        updatedAt: new Date(),
      });

      const req = new NextRequest(
        'http://localhost:3000/api/v1/customers/cust-1/min-prices',
        {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json', Origin: APP_URL },
          body: JSON.stringify({
            productId: 'prod-1',
            reason: 'Kontrak promo berakhir, kembalikan ke floor default',
          }),
        }
      );

      const res = await deleteMinPriceHandler(req, {
        params: Promise.resolve({ id: 'cust-1' }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.ok).toBe(true);

      expect(customerMinPrices).toHaveLength(0);
      // PriceHistory mencatat pengembalian ke default (80.000)
      expect(priceHistories).toHaveLength(1);
      expect(priceHistories[0].newValue).toBe(BigInt(80000));
    });
  });

  describe('3. Customer Promos CRUD (Seksi 7.2 & 10.5)', () => {
    it('Super Admin dapat membuat promo baru (PERCENT / AMOUNT)', async () => {
      activeCtx = superAdminCtx;

      const req = new NextRequest(
        'http://localhost:3000/api/v1/customers/cust-1/promos',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Origin: APP_URL },
          body: JSON.stringify({
            productId: 'prod-1',
            label: 'Diskon Spesial 10%',
            source: 'PROMO',
            type: 'PERCENT',
            valueBps: 1000, // 10%
            validFrom: '2026-11-01T00:00:00.000Z',
            validTo: '2026-12-31T23:59:59.000Z',
            note: 'Khusus pembelian akhir tahun',
          }),
        }
      );

      const res = await createPromoHandler(req, {
        params: Promise.resolve({ id: 'cust-1' }),
      });

      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.ok).toBe(true);
      expect(json.data.label).toBe('Diskon Spesial 10%');
      expect(json.data.valueBps).toBe(1000);

      expect(customerPromos).toHaveLength(1);
      expect(auditLogs.some((l) => l.action === 'CUSTOMER_PROMO_CREATE')).toBe(true);
    });

    it('Super Admin dapat memperbarui dan menghapus lunak promo', async () => {
      activeCtx = superAdminCtx;

      customerPromos.push({
        id: 'promo-123',
        businessId: businessA,
        customerId: 'cust-1',
        productId: null,
        label: 'Promo Awal',
        source: DiscountSource.PROMO,
        type: DiscountType.PERCENT,
        valueBps: 500,
        valueAmount: null,
        validFrom: new Date('2026-11-01'),
        validTo: null,
        isActive: true,
        note: null,
        createdAt: new Date(),
        deletedAt: null,
      });

      // 1. PATCH ubah label dan nonaktifkan
      const reqPatch = new NextRequest(
        'http://localhost:3000/api/v1/customer-promos/promo-123',
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Origin: APP_URL },
          body: JSON.stringify({
            label: 'Promo Diperbarui',
            isActive: false,
          }),
        }
      );

      const resPatch = await updatePromoHandler(reqPatch, {
        params: Promise.resolve({ id: 'promo-123' }),
      });
      expect(resPatch.status).toBe(200);
      const jsonPatch = await resPatch.json();
      expect(jsonPatch.data.label).toBe('Promo Diperbarui');
      expect(jsonPatch.data.isActive).toBe(false);

      // 2. DELETE hapus lunak
      const reqDelete = new NextRequest(
        'http://localhost:3000/api/v1/customer-promos/promo-123',
        {
          method: 'DELETE',
          headers: { Origin: APP_URL },
        }
      );

      const resDelete = await deletePromoHandler(reqDelete, {
        params: Promise.resolve({ id: 'promo-123' }),
      });
      expect(resDelete.status).toBe(200);

      expect(customerPromos[0].deletedAt).not.toBeNull();
      expect(customerPromos[0].isActive).toBe(false);
    });
  });
});
