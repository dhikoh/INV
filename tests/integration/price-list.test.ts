import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET as getPriceListHandler } from '@/app/api/v1/price-list/route';
import { Role } from '@prisma/client';
import * as contextModule from '@/lib/auth/context';
import { assertNoSecretKeys } from '../helpers/leak';

interface MockProduct {
  id: string;
  businessId: string;
  categoryId: string | null;
  sku: string;
  name: string;
  unit: string;
  costPrice: bigint;
  basePrice: bigint;
  minPrice: bigint;
  stockQty: number;
  reservedQty: number;
  isActive: boolean;
  deletedAt: Date | null;
  images: Array<{ id: string; path: string; isPrimary: boolean; sortOrder: number }>;
}

interface MockCustomer {
  id: string;
  businessId: string;
  assignedSalesId: string;
  code: string;
  name: string;
  deletedAt: Date | null;
}

interface MockCustomerMinPrice {
  id: string;
  businessId: string;
  customerId: string;
  productId: string;
  minPrice: bigint;
}

let mockProducts: MockProduct[] = [];
let mockCustomers: MockCustomer[] = [];
let mockCustomerMinPrices: MockCustomerMinPrice[] = [];

interface CustomerWhere {
  id?: string;
  businessId?: string;
  assignedSalesId?: string;
  deletedAt?: null;
}

interface ProductOrCondition {
  name?: { contains?: string };
  sku?: { contains?: string };
}

interface ProductWhere {
  businessId?: string;
  deletedAt?: null;
  isActive?: boolean;
  categoryId?: string;
  OR?: ProductOrCondition[];
}

interface CustomerMinPriceWhere {
  businessId?: string;
  customerId?: string;
  productId?: { in?: string[] };
}

vi.mock('@/lib/db', () => {
  const mockPrisma = {
    customer: {
      findFirst: vi.fn(async ({ where }: { where: CustomerWhere }) => {
        return (
          mockCustomers.find((c) => {
            if (where.id && c.id !== where.id) return false;
            if (where.businessId && c.businessId !== where.businessId) return false;
            if (where.assignedSalesId && c.assignedSalesId !== where.assignedSalesId) return false;
            if (where.deletedAt === null && c.deletedAt !== null) return false;
            return true;
          }) || null
        );
      }),
    },
    product: {
      count: vi.fn(async ({ where }: { where: ProductWhere }) => {
        return mockProducts.filter((p) => {
          if (where.businessId && p.businessId !== where.businessId) return false;
          if (where.deletedAt === null && p.deletedAt !== null) return false;
          if (where.isActive !== undefined && p.isActive !== where.isActive) return false;
          if (where.categoryId && p.categoryId !== where.categoryId) return false;
          if (where.OR) {
            const matches = where.OR.some((cond: ProductOrCondition) => {
              if (cond.name?.contains && p.name.toLowerCase().includes(cond.name.contains.toLowerCase())) return true;
              if (cond.sku?.contains && p.sku.toLowerCase().includes(cond.sku.contains.toLowerCase())) return true;
              return false;
            });
            if (!matches) return false;
          }
          return true;
        }).length;
      }),
      findMany: vi.fn(async ({ where, skip = 0, take = 20, orderBy }: { where: ProductWhere; skip?: number; take?: number; orderBy?: Record<string, 'asc' | 'desc'> }) => {
        const filtered = mockProducts.filter((p) => {
          if (where.businessId && p.businessId !== where.businessId) return false;
          if (where.deletedAt === null && p.deletedAt !== null) return false;
          if (where.isActive !== undefined && p.isActive !== where.isActive) return false;
          if (where.categoryId && p.categoryId !== where.categoryId) return false;
          if (where.OR) {
            const matches = where.OR.some((cond: ProductOrCondition) => {
              if (cond.name?.contains && p.name.toLowerCase().includes(cond.name.contains.toLowerCase())) return true;
              if (cond.sku?.contains && p.sku.toLowerCase().includes(cond.sku.contains.toLowerCase())) return true;
              return false;
            });
            if (!matches) return false;
          }
          return true;
        });

        if (orderBy) {
          const field = Object.keys(orderBy)[0] as keyof MockProduct;
          const dir = orderBy[field] === 'desc' ? -1 : 1;
          filtered.sort((a: MockProduct, b: MockProduct) => {
            const aVal = a[field] as string | number;
            const bVal = b[field] as string | number;
            if (aVal < bVal) return -1 * dir;
            if (aVal > bVal) return 1 * dir;
            return 0;
          });
        }

        return filtered.slice(skip, skip + take);
      }),
    },
    customerMinPrice: {
      findMany: vi.fn(async ({ where }: { where: CustomerMinPriceWhere }) => {
        return mockCustomerMinPrices.filter((m) => {
          if (where.businessId && m.businessId !== where.businessId) return false;
          if (where.customerId && m.customerId !== where.customerId) return false;
          if (where.productId?.in && !where.productId.in.includes(m.productId)) return false;
          return true;
        });
      }),
    },
  };
  return { prisma: mockPrisma };
});

describe('T-A17: GET /api/v1/price-list (Addendum v2 Seksi 13.7 & 14.8)', () => {
  const SECRET_HPP = 7313737;

  beforeEach(() => {
    vi.clearAllMocks();

    mockProducts = [
      {
        id: 'prod_a1',
        businessId: 'biz_a',
        categoryId: null,
        sku: 'SKU-A1',
        name: 'Produk Usaha A Satu',
        unit: 'DUS',
        costPrice: BigInt(SECRET_HPP),
        basePrice: 100000n,
        minPrice: 85000n,
        stockQty: 50,
        reservedQty: 10,
        isActive: true,
        deletedAt: null,
        images: [{ id: 'img_1', path: 'biz_a/p1.webp', isPrimary: true, sortOrder: 0 }],
      },
      {
        id: 'prod_a2_inactive',
        businessId: 'biz_a',
        categoryId: null,
        sku: 'SKU-A2',
        name: 'Produk Usaha A Nonaktif',
        unit: 'DUS',
        costPrice: 50000n,
        basePrice: 80000n,
        minPrice: 65000n,
        stockQty: 10,
        reservedQty: 0,
        isActive: false,
        deletedAt: null,
        images: [],
      },
      {
        id: 'prod_b1',
        businessId: 'biz_b',
        categoryId: null,
        sku: 'SKU-B1',
        name: 'Produk Usaha B',
        unit: 'PCS',
        costPrice: 40000n,
        basePrice: 60000n,
        minPrice: 50000n,
        stockQty: 100,
        reservedQty: 0,
        isActive: true,
        deletedAt: null,
        images: [],
      },
    ];

    mockCustomers = [
      {
        id: 'cust_a1',
        businessId: 'biz_a',
        assignedSalesId: 'sales_a1',
        code: 'CUSTA1',
        name: 'Pelanggan Sales A1',
        deletedAt: null,
      },
      {
        id: 'cust_a2',
        businessId: 'biz_a',
        assignedSalesId: 'sales_a2',
        code: 'CUSTA2',
        name: 'Pelanggan Sales A2',
        deletedAt: null,
      },
    ];

    mockCustomerMinPrices = [
      {
        id: 'cmp_1',
        businessId: 'biz_a',
        customerId: 'cust_a1',
        productId: 'prod_a1',
        minPrice: 90000n, // harga paten khusus customer
      },
    ];
  });

  it('(a) Sales A1 hanya menerima produk usaha A dan produk nonaktif tidak tampil', async () => {
    vi.spyOn(contextModule, 'requireContext').mockResolvedValueOnce({
      user: { id: 'sales_a1', name: 'Sales A1', role: Role.SALES, businessId: 'biz_a' },
      role: Role.SALES,
      businessId: 'biz_a',
      sessionId: 'sess_1',
      ip: null,
    });

    const req = new NextRequest('http://localhost:3000/api/v1/price-list', {
      headers: { Origin: 'http://localhost:3000' },
    });

    const res = await getPriceListHandler(req, { params: Promise.resolve({}) });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.data).toHaveLength(1);
    expect(json.data[0].id).toBe('prod_a1');
    expect(json.data.some((p: { id: string }) => p.id === 'prod_b1')).toBe(false);
    expect(json.data.some((p: { id: string }) => p.id === 'prod_a2_inactive')).toBe(false);
  });

  it('(b) Tidak ada kunci terlarang dan tidak ada nilai HPP unik pada respons', async () => {
    vi.spyOn(contextModule, 'requireContext').mockResolvedValueOnce({
      user: { id: 'sales_a1', name: 'Sales A1', role: Role.SALES, businessId: 'biz_a' },
      role: Role.SALES,
      businessId: 'biz_a',
      sessionId: 'sess_1',
      ip: null,
    });

    const req = new NextRequest('http://localhost:3000/api/v1/price-list', {
      headers: { Origin: 'http://localhost:3000' },
    });

    const res = await getPriceListHandler(req, { params: Promise.resolve({}) });
    const json = await res.json();

    assertNoSecretKeys(json);
    expect(JSON.stringify(json)).not.toContain(String(SECRET_HPP));
  });

  it('(c) Respons produk memiliki whitelist persis 11 kunci (Seksi 13.7)', async () => {
    vi.spyOn(contextModule, 'requireContext').mockResolvedValueOnce({
      user: { id: 'sales_a1', name: 'Sales A1', role: Role.SALES, businessId: 'biz_a' },
      role: Role.SALES,
      businessId: 'biz_a',
      sessionId: 'sess_1',
      ip: null,
    });

    const req = new NextRequest('http://localhost:3000/api/v1/price-list', {
      headers: { Origin: 'http://localhost:3000' },
    });

    const res = await getPriceListHandler(req, { params: Promise.resolve({}) });
    const json = await res.json();
    const item = json.data[0];

    const expectedKeys = [
      'id',
      'sku',
      'name',
      'unit',
      'categoryId',
      'imageUrl',
      'available',
      'basePrice',
      'floorPrice',
      'floorSource',
      'suggestedPrice',
    ];

    expect(Object.keys(item).sort()).toEqual(expectedKeys.sort());
    expect(item.available).toBe(40); // stockQty (50) - reservedQty (10)
    expect(item.basePrice).toBe(100000);
    expect(item.floorPrice).toBe(85000);
    expect(item.floorSource).toBe('PRODUCT');
    expect(item.suggestedPrice).toBe(100000);
  });

  it('(d) customerId milik sales lain ditolak 404 NOT_FOUND', async () => {
    vi.spyOn(contextModule, 'requireContext').mockResolvedValueOnce({
      user: { id: 'sales_a1', name: 'Sales A1', role: Role.SALES, businessId: 'biz_a' },
      role: Role.SALES,
      businessId: 'biz_a',
      sessionId: 'sess_1',
      ip: null,
    });

    const req = new NextRequest('http://localhost:3000/api/v1/price-list?customerId=cust_a2', {
      headers: { Origin: 'http://localhost:3000' },
    });

    const res = await getPriceListHandler(req, { params: Promise.resolve({}) });
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json.ok).toBe(false);
    expect(json.error.code).toBe('NOT_FOUND');
  });

  it('(e) Customer berharga paten khusus: floorSource = CUSTOMER dan angka paten sesuai', async () => {
    vi.spyOn(contextModule, 'requireContext').mockResolvedValueOnce({
      user: { id: 'sales_a1', name: 'Sales A1', role: Role.SALES, businessId: 'biz_a' },
      role: Role.SALES,
      businessId: 'biz_a',
      sessionId: 'sess_1',
      ip: null,
    });

    const req = new NextRequest('http://localhost:3000/api/v1/price-list?customerId=cust_a1', {
      headers: { Origin: 'http://localhost:3000' },
    });

    const res = await getPriceListHandler(req, { params: Promise.resolve({}) });
    const json = await res.json();
    const item = json.data[0];

    expect(res.status).toBe(200);
    expect(item.floorPrice).toBe(90000);
    expect(item.floorSource).toBe('CUSTOMER');
    expect(item.suggestedPrice).toBe(100000); // max(100000, 90000)
  });

  it('(f) businessId di query ditolak 422 VALIDATION_ERROR (.strict)', async () => {
    vi.spyOn(contextModule, 'requireContext').mockResolvedValueOnce({
      user: { id: 'sales_a1', name: 'Sales A1', role: Role.SALES, businessId: 'biz_a' },
      role: Role.SALES,
      businessId: 'biz_a',
      sessionId: 'sess_1',
      ip: null,
    });

    const req = new NextRequest('http://localhost:3000/api/v1/price-list?businessId=biz_b', {
      headers: { Origin: 'http://localhost:3000' },
    });

    const res = await getPriceListHandler(req, { params: Promise.resolve({}) });
    const json = await res.json();

    expect(res.status).toBe(422);
    expect(json.ok).toBe(false);
    expect(json.error.code).toBe('VALIDATION_ERROR');
  });

  it('(g) sort=costPrice:asc ditolak 422 VALIDATION_ERROR', async () => {
    vi.spyOn(contextModule, 'requireContext').mockResolvedValueOnce({
      user: { id: 'sales_a1', name: 'Sales A1', role: Role.SALES, businessId: 'biz_a' },
      role: Role.SALES,
      businessId: 'biz_a',
      sessionId: 'sess_1',
      ip: null,
    });

    const req = new NextRequest('http://localhost:3000/api/v1/price-list?sort=costPrice:asc', {
      headers: { Origin: 'http://localhost:3000' },
    });

    const res = await getPriceListHandler(req, { params: Promise.resolve({}) });
    const json = await res.json();

    expect(res.status).toBe(422);
    expect(json.ok).toBe(false);
    expect(json.error.code).toBe('VALIDATION_ERROR');
  });

  it('(h) Super Admin tanpa usaha aktif ditolak 400 BUSINESS_REQUIRED; dengan usaha aktif A hanya melihat produk A', async () => {
    // Tanpa usaha aktif
    vi.spyOn(contextModule, 'requireContext').mockResolvedValueOnce({
      user: { id: 'sa', name: 'Owner', role: Role.SUPERADMIN, businessId: null },
      role: Role.SUPERADMIN,
      businessId: null,
      sessionId: 'sess_sa',
      ip: null,
    });

    const req1 = new NextRequest('http://localhost:3000/api/v1/price-list', {
      headers: { Origin: 'http://localhost:3000' },
    });

    const res1 = await getPriceListHandler(req1, { params: Promise.resolve({}) });
    const json1 = await res1.json();

    expect(res1.status).toBe(400);
    expect(json1.error.code).toBe('BUSINESS_REQUIRED');

    // Dengan usaha A aktif
    vi.spyOn(contextModule, 'requireContext').mockResolvedValueOnce({
      user: { id: 'sa', name: 'Owner', role: Role.SUPERADMIN, businessId: null },
      role: Role.SUPERADMIN,
      businessId: 'biz_a',
      sessionId: 'sess_sa',
      ip: null,
    });

    const req2 = new NextRequest('http://localhost:3000/api/v1/price-list', {
      headers: { Origin: 'http://localhost:3000' },
    });

    const res2 = await getPriceListHandler(req2, { params: Promise.resolve({}) });
    const json2 = await res2.json();

    expect(res2.status).toBe(200);
    expect(json2.data).toHaveLength(1);
    expect(json2.data[0].id).toBe('prod_a1');
  });

  it('(j) pageSize melebihi 100 ditolak 422 VALIDATION_ERROR', async () => {
    vi.spyOn(contextModule, 'requireContext').mockResolvedValueOnce({
      user: { id: 'sales_a1', name: 'Sales A1', role: Role.SALES, businessId: 'biz_a' },
      role: Role.SALES,
      businessId: 'biz_a',
      sessionId: 'sess_1',
      ip: null,
    });

    const req = new NextRequest('http://localhost:3000/api/v1/price-list?pageSize=101', {
      headers: { Origin: 'http://localhost:3000' },
    });

    const res = await getPriceListHandler(req, { params: Promise.resolve({}) });
    const json = await res.json();

    expect(res.status).toBe(422);
    expect(json.ok).toBe(false);
    expect(json.error.code).toBe('VALIDATION_ERROR');
  });
});
