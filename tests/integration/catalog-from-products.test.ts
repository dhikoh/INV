import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST as createFromProductsHandler } from '@/app/api/v1/catalogs/from-products/route';
import {
  GET as getCatalogHandler,
} from '@/app/api/v1/catalogs/[id]/route';
import { Role } from '@prisma/client';
import * as contextModule from '@/lib/auth/context';

interface MockCatalog {
  id: string;
  businessId: string;
  ownerId: string;
  customerId: string | null;
  title: string;
  note: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

interface MockCatalogItem {
  id: string;
  catalogId: string;
  productId: string;
  price: bigint;
  sortOrder: number;
}

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

let mockCatalogs: MockCatalog[] = [];
let mockCatalogItems: MockCatalogItem[] = [];
let mockProducts: MockProduct[] = [];
let mockCustomers: MockCustomer[] = [];
let mockCustomerMinPrices: MockCustomerMinPrice[] = [];
let mockAuditLogs: Array<Record<string, unknown>> = [];

vi.mock('@/lib/db', () => {
  const mockPrisma = {
    $transaction: vi.fn(async <T>(cb: (tx: never) => Promise<T>): Promise<T> => cb(mockPrisma as never)),
    customer: {
      findFirst: vi.fn(async ({ where }: { where: { id?: string; businessId?: string; assignedSalesId?: string; deletedAt?: Date | null } }) => {
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
    user: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
        if (where.id === 'sales_a1') return { id: 'sales_a1', name: 'Sales A1' };
        if (where.id === 'sales_a2') return { id: 'sales_a2', name: 'Sales A2' };
        return { id: where.id, name: 'User' };
      }),
    },
    product: {
      count: vi.fn(async ({ where }: { where: { businessId?: string; deletedAt?: Date | null; isActive?: boolean; id?: { notIn?: string[] } } }) => {
        return mockProducts.filter((p) => {
          if (where.businessId && p.businessId !== where.businessId) return false;
          if (where.deletedAt === null && p.deletedAt !== null) return false;
          if (where.isActive !== undefined && p.isActive !== where.isActive) return false;
          if (where.id?.notIn && where.id.notIn.includes(p.id)) return false;
          return true;
        }).length;
      }),
      findMany: vi.fn(async ({ where, take }: { where: { businessId?: string; deletedAt?: Date | null; isActive?: boolean; id?: { in?: string[]; notIn?: string[] } }; take?: number }) => {
        const filtered = mockProducts.filter((p) => {
          if (where.businessId && p.businessId !== where.businessId) return false;
          if (where.deletedAt === null && p.deletedAt !== null) return false;
          if (where.isActive !== undefined && p.isActive !== where.isActive) return false;
          if (where.id?.in && !where.id.in.includes(p.id)) return false;
          if (where.id?.notIn && where.id.notIn.includes(p.id)) return false;
          return true;
        });
        return take ? filtered.slice(0, take) : filtered;
      }),
    },
    customerMinPrice: {
      findMany: vi.fn(async ({ where }: { where: { businessId?: string; customerId?: string; productId?: { in?: string[] } } }) => {
        return mockCustomerMinPrices.filter((m) => {
          if (where.businessId && m.businessId !== where.businessId) return false;
          if (where.customerId && m.customerId !== where.customerId) return false;
          if (where.productId?.in && !where.productId.in.includes(m.productId)) return false;
          return true;
        });
      }),
    },
    catalog: {
      create: vi.fn(async ({ data }: { data: { businessId: string; ownerId: string; customerId?: string | null; title: string; note?: string | null } }) => {
        const newCat: MockCatalog = {
          id: `cat_${Date.now()}_${Math.random().toString(36).substring(7)}`,
          businessId: data.businessId,
          ownerId: data.ownerId,
          customerId: data.customerId ?? null,
          title: data.title,
          note: data.note ?? null,
          createdAt: new Date(),
          updatedAt: new Date(),
          deletedAt: null,
        };
        mockCatalogs.push(newCat);
        return newCat;
      }),
      findFirst: vi.fn(async ({ where }: { where: { id?: string; businessId?: string; ownerId?: string; deletedAt?: Date | null } }) => {
        const c = mockCatalogs.find((cat) => {
          if (where.id && cat.id !== where.id) return false;
          if (where.businessId && cat.businessId !== where.businessId) return false;
          if (where.ownerId && cat.ownerId !== where.ownerId) return false;
          if (where.deletedAt === null && cat.deletedAt !== null) return false;
          return true;
        });
        if (!c) return null;
        return {
          ...c,
          items: mockCatalogItems.filter((i) => i.catalogId === c.id),
        };
      }),
      updateMany: vi.fn(async ({ where, data }: { where: { id?: string; businessId?: string }; data: { deletedAt?: Date | null; title?: string } }) => {
        let count = 0;
        mockCatalogs.forEach((c) => {
          if (where.id && c.id !== where.id) return;
          if (where.businessId && c.businessId !== where.businessId) return;
          if (data.deletedAt !== undefined) c.deletedAt = data.deletedAt;
          if (data.title !== undefined) c.title = data.title;
          count++;
        });
        return { count };
      }),
    },
    catalogItem: {
      createMany: vi.fn(async ({ data }: { data: Array<{ catalogId: string; productId: string; price: bigint | number; sortOrder?: number }> }) => {
        data.forEach((d, idx) => {
          mockCatalogItems.push({
            id: `item_${Date.now()}_${idx}`,
            catalogId: d.catalogId,
            productId: d.productId,
            price: BigInt(d.price),
            sortOrder: d.sortOrder ?? idx,
          });
        });
        return { count: data.length };
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: { price?: bigint | number } }) => {
        const item = mockCatalogItems.find((i) => i.id === where.id);
        if (item) {
          if (data.price !== undefined) item.price = BigInt(data.price);
        }
        return item;
      }),
    },
    auditLog: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        mockAuditLogs.push(data);
        return { id: `audit_${Date.now()}`, ...data };
      }),
    },
  };
  return { prisma: mockPrisma };
});

describe('T-A17: POST /api/v1/catalogs/from-products (Addendum v2 Seksi 13.6 & 14.8)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCatalogs = [];
    mockCatalogItems = [];
    mockAuditLogs = [];

    mockProducts = [
      {
        id: 'prod_a1',
        businessId: 'biz_a',
        categoryId: 'cat_snack',
        sku: 'SKU-A1',
        name: 'Produk A1',
        unit: 'DUS',
        costPrice: 70000n,
        basePrice: 100000n,
        minPrice: 85000n,
        isActive: true,
        deletedAt: null,
        images: [],
      },
      {
        id: 'prod_a2',
        businessId: 'biz_a',
        categoryId: 'cat_drink',
        sku: 'SKU-A2',
        name: 'Produk A2',
        unit: 'DUS',
        costPrice: 50000n,
        basePrice: 80000n,
        minPrice: 65000n,
        isActive: true,
        deletedAt: null,
        images: [],
      },
      {
        id: 'prod_a3_inactive',
        businessId: 'biz_a',
        categoryId: null,
        sku: 'SKU-A3',
        name: 'Produk A3 Nonaktif',
        unit: 'DUS',
        costPrice: 30000n,
        basePrice: 50000n,
        minPrice: 40000n,
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
        costPrice: 20000n,
        basePrice: 35000n,
        minPrice: 28000n,
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
        name: 'Pelanggan Toko A1',
        deletedAt: null,
      },
      {
        id: 'cust_a2',
        businessId: 'biz_a',
        assignedSalesId: 'sales_a2',
        code: 'CUSTA2',
        name: 'Pelanggan Toko A2',
        deletedAt: null,
      },
    ];

    mockCustomerMinPrices = [
      {
        id: 'cmp_special',
        businessId: 'biz_a',
        customerId: 'cust_a1',
        productId: 'prod_a1',
        minPrice: 120000n, // Lebih tinggi dari basePrice 100.000 (D-6)
      },
    ];
  });

  it('(a) Tanpa productIds: membuat katalog berisi semua produk aktif usaha dengan initialPrice = suggestedPrice', async () => {
    vi.spyOn(contextModule, 'requireContext').mockResolvedValueOnce({
      user: { id: 'sales_a1', name: 'Sales A1', role: Role.SALES, businessId: 'biz_a' },
      role: Role.SALES,
      businessId: 'biz_a',
      sessionId: 'sess_1',
      ip: null,
    });

    const req = new NextRequest('http://localhost:3000/api/v1/catalogs/from-products', {
      method: 'POST',
      headers: { Origin: 'http://localhost:3000', 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Katalog Semua Produk Aktif' }),
    });

    const res = await createFromProductsHandler(req, { params: Promise.resolve({}) });
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.ok).toBe(true);
    expect(json.data.title).toBe('Katalog Semua Produk Aktif');
    expect(json.data.items).toHaveLength(2); // prod_a1 dan prod_a2 (prod_a3 nonaktif, prod_b1 usaha B)
    expect(mockCatalogItems).toHaveLength(2);
    expect(Number(mockCatalogItems[0].price)).toBe(100000);
    expect(Number(mockCatalogItems[1].price)).toBe(80000);
  });

  it('(b) Customer dengan floor lebih tinggi dari basePrice: harga awal = floor', async () => {
    vi.spyOn(contextModule, 'requireContext').mockResolvedValueOnce({
      user: { id: 'sales_a1', name: 'Sales A1', role: Role.SALES, businessId: 'biz_a' },
      role: Role.SALES,
      businessId: 'biz_a',
      sessionId: 'sess_1',
      ip: null,
    });

    const req = new NextRequest('http://localhost:3000/api/v1/catalogs/from-products', {
      method: 'POST',
      headers: { Origin: 'http://localhost:3000', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Katalog Khusus Pelanggan A1',
        customerId: 'cust_a1',
        productIds: ['prod_a1'],
      }),
    });

    const res = await createFromProductsHandler(req, { params: Promise.resolve({}) });
    await res.json();

    expect(res.status).toBe(201);
    expect(mockCatalogItems[0].productId).toBe('prod_a1');
    expect(Number(mockCatalogItems[0].price)).toBe(120000); // initialPrice(100000, 120000) = 120000
  });

  it('(c) productIds berisi produk usaha B ditolak 404 NOT_FOUND', async () => {
    vi.spyOn(contextModule, 'requireContext').mockResolvedValueOnce({
      user: { id: 'sales_a1', name: 'Sales A1', role: Role.SALES, businessId: 'biz_a' },
      role: Role.SALES,
      businessId: 'biz_a',
      sessionId: 'sess_1',
      ip: null,
    });

    const req = new NextRequest('http://localhost:3000/api/v1/catalogs/from-products', {
      method: 'POST',
      headers: { Origin: 'http://localhost:3000', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Katalog Ilegal Lintas Usaha',
        productIds: ['prod_b1'],
      }),
    });

    const res = await createFromProductsHandler(req, { params: Promise.resolve({}) });
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json.ok).toBe(false);
    expect(mockCatalogs).toHaveLength(0);
  });

  it('(d) productIds berisi produk nonaktif ditolak 422 PRODUCT_INACTIVE', async () => {
    vi.spyOn(contextModule, 'requireContext').mockResolvedValueOnce({
      user: { id: 'sales_a1', name: 'Sales A1', role: Role.SALES, businessId: 'biz_a' },
      role: Role.SALES,
      businessId: 'biz_a',
      sessionId: 'sess_1',
      ip: null,
    });

    const req = new NextRequest('http://localhost:3000/api/v1/catalogs/from-products', {
      method: 'POST',
      headers: { Origin: 'http://localhost:3000', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Katalog Produk Nonaktif',
        productIds: ['prod_a3_inactive'],
      }),
    });

    const res = await createFromProductsHandler(req, { params: Promise.resolve({}) });
    const json = await res.json();

    expect(res.status).toBe(422);
    expect(json.error.code).toBe('PRODUCT_INACTIVE');
  });

  it('(f) customerId milik sales lain ditolak 404 NOT_FOUND', async () => {
    vi.spyOn(contextModule, 'requireContext').mockResolvedValueOnce({
      user: { id: 'sales_a1', name: 'Sales A1', role: Role.SALES, businessId: 'biz_a' },
      role: Role.SALES,
      businessId: 'biz_a',
      sessionId: 'sess_1',
      ip: null,
    });

    const req = new NextRequest('http://localhost:3000/api/v1/catalogs/from-products', {
      method: 'POST',
      headers: { Origin: 'http://localhost:3000', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Katalog Pakai Customer Sales Lain',
        customerId: 'cust_a2',
      }),
    });

    const res = await createFromProductsHandler(req, { params: Promise.resolve({}) });
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json.error.code).toBe('NOT_FOUND');
  });

  it('(g) Sales A2 tidak bisa membuka detail katalog milik Sales A1 (404 NOT_FOUND)', async () => {
    // Buat katalog milik Sales A1
    mockCatalogs.push({
      id: 'cat_sales_a1',
      businessId: 'biz_a',
      ownerId: 'sales_a1',
      customerId: null,
      title: 'Katalog Rahasia Sales A1',
      note: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    });

    vi.spyOn(contextModule, 'requireContext').mockResolvedValueOnce({
      user: { id: 'sales_a2', name: 'Sales A2', role: Role.SALES, businessId: 'biz_a' },
      role: Role.SALES,
      businessId: 'biz_a',
      sessionId: 'sess_2',
      ip: null,
    });

    const req = new NextRequest('http://localhost:3000/api/v1/catalogs/cat_sales_a1', {
      headers: { Origin: 'http://localhost:3000' },
    });

    const res = await getCatalogHandler(req, { params: Promise.resolve({ id: 'cat_sales_a1' }) });
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json.error.code).toBe('NOT_FOUND');
  });
});
