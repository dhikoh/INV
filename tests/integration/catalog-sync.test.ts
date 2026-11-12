import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST as syncCatalogHandler } from '@/app/api/v1/catalogs/[id]/sync/route';
import { Role } from '@prisma/client';
import * as contextModule from '@/lib/auth/context';

interface MockCatalog {
  id: string;
  businessId: string;
  ownerId: string;
  customerId: string | null;
  title: string;
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
  sku: string;
  name: string;
  basePrice: bigint;
  minPrice: bigint;
  isActive: boolean;
  deletedAt: Date | null;
}

let mockCatalogs: MockCatalog[] = [];
let mockCatalogItems: MockCatalogItem[] = [];
let mockProducts: MockProduct[] = [];
const mockAuditLogs: Array<Record<string, unknown>> = [];

vi.mock('@/lib/db', () => {
  const mockPrisma = {
    $transaction: vi.fn(
      async (cb: (tx: unknown) => Promise<unknown>) => cb(mockPrisma)
    ),
    customerMinPrice: {
      findMany: vi.fn(async () => []),
    },
    catalog: {
      findFirst: vi.fn(
        async ({ where }: { where: Record<string, unknown> }) => {
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
        }
      ),
    },
    product: {
      findMany: vi.fn(
        async ({
          where,
        }: {
          where: {
            businessId?: string;
            deletedAt?: null;
            isActive?: boolean;
            id?: { in?: string[]; notIn?: string[] };
          };
        }) => {
          return mockProducts.filter((p) => {
            if (where.businessId && p.businessId !== where.businessId) return false;
            if (where.deletedAt === null && p.deletedAt !== null) return false;
            if (where.isActive !== undefined && p.isActive !== where.isActive) return false;
            if (where.id?.in && !where.id.in.includes(p.id)) return false;
            if (where.id?.notIn && where.id.notIn.includes(p.id)) return false;
            return true;
          });
        }
      ),
    },
    catalogItem: {
      createMany: vi.fn(
        async ({
          data,
        }: {
          data: Array<{
            catalogId: string;
            productId: string;
            price: number | bigint;
            sortOrder?: number;
          }>;
        }) => {
          let added = 0;
          data.forEach((d, idx) => {
            const exists = mockCatalogItems.some(
              (i) => i.catalogId === d.catalogId && i.productId === d.productId
            );
            if (!exists) {
              mockCatalogItems.push({
                id: `item_${Date.now()}_${idx}`,
                catalogId: d.catalogId,
                productId: d.productId,
                price: BigInt(d.price),
                sortOrder: d.sortOrder ?? idx,
              });
              added++;
            }
          });
          return { count: added };
        }
      ),
      update: vi.fn(
        async ({
          where,
          data,
        }: {
          where: { id: string };
          data: { price?: number | bigint };
        }) => {
          const item = mockCatalogItems.find((i) => i.id === where.id);
          if (item) {
            if (data.price !== undefined) item.price = BigInt(data.price);
          }
          return item;
        }
      ),
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

describe('T-A17: POST /api/v1/catalogs/:id/sync (Addendum v2 Seksi 13.6 & 14.8)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCatalogs = [
      {
        id: 'cat_test_1',
        businessId: 'biz_a',
        ownerId: 'sales_a1',
        customerId: null,
        title: 'Katalog Uji Sync',
        deletedAt: null,
      },
    ];

    mockCatalogItems = [
      {
        id: 'item_1',
        catalogId: 'cat_test_1',
        productId: 'prod_1',
        price: 80000n, // Di bawah minPrice baru (stale)
        sortOrder: 0,
      },
      {
        id: 'item_2',
        catalogId: 'cat_test_1',
        productId: 'prod_2',
        price: 150000n, // Di atas minPrice (tetap aman, tidak boleh ditimpa)
        sortOrder: 1,
      },
    ];

    mockProducts = [
      {
        id: 'prod_1',
        businessId: 'biz_a',
        sku: 'SKU-1',
        name: 'Produk Satu',
        basePrice: 100000n,
        minPrice: 90000n, // Naik ke 90rb (item_1 harganya 80rb)
        isActive: true,
        deletedAt: null,
      },
      {
        id: 'prod_2',
        businessId: 'biz_a',
        sku: 'SKU-2',
        name: 'Produk Dua',
        basePrice: 120000n,
        minPrice: 100000n,
        isActive: true,
        deletedAt: null,
      },
      {
        id: 'prod_new_3',
        businessId: 'biz_a',
        sku: 'SKU-3',
        name: 'Produk Baru Tiga',
        basePrice: 50000n,
        minPrice: 40000n,
        isActive: true,
        deletedAt: null,
      },
    ];
  });

  it('(a) addNewProducts menambah produk baru tanpa mengubah harga item yang sudah ada', async () => {
    vi.spyOn(contextModule, 'requireContext').mockResolvedValueOnce({
      user: { id: 'sales_a1', name: 'Sales A1', role: Role.SALES, businessId: 'biz_a' },
      role: Role.SALES,
      businessId: 'biz_a',
      sessionId: 'sess_1',
      ip: null,
    });

    const req = new NextRequest('http://localhost:3000/api/v1/catalogs/cat_test_1/sync', {
      method: 'POST',
      headers: { Origin: 'http://localhost:3000', 'Content-Type': 'application/json' },
      body: JSON.stringify({ addNewProducts: true, raiseToFloor: false }),
    });

    const res = await syncCatalogHandler(req, { params: Promise.resolve({ id: 'cat_test_1' }) });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.data.added).toBe(1);
    expect(mockCatalogItems).toHaveLength(3);
    // Harga item lama tidak berubah
    expect(Number(mockCatalogItems[0].price)).toBe(80000);
    expect(Number(mockCatalogItems[1].price)).toBe(150000);
    // Produk baru ditambahkan dengan basePrice
    expect(Number(mockCatalogItems[2].price)).toBe(50000);
  });

  it('(b) raiseToFloor hanya menaikkan item yang berada di bawah floor sampai tepat floor', async () => {
    vi.spyOn(contextModule, 'requireContext').mockResolvedValueOnce({
      user: { id: 'sales_a1', name: 'Sales A1', role: Role.SALES, businessId: 'biz_a' },
      role: Role.SALES,
      businessId: 'biz_a',
      sessionId: 'sess_1',
      ip: null,
    });

    const req = new NextRequest('http://localhost:3000/api/v1/catalogs/cat_test_1/sync', {
      method: 'POST',
      headers: { Origin: 'http://localhost:3000', 'Content-Type': 'application/json' },
      body: JSON.stringify({ addNewProducts: false, raiseToFloor: true }),
    });

    const res = await syncCatalogHandler(req, { params: Promise.resolve({ id: 'cat_test_1' }) });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.raised).toBe(1);
    // Item 1 yang tadinya 80rb dinaikkan tepat ke 90rb
    expect(Number(mockCatalogItems[0].price)).toBe(90000);
    // Item 2 yang tadinya 150rb (sudah di atas 100rb) tidak berubah
    expect(Number(mockCatalogItems[1].price)).toBe(150000);
  });

  it('(c) Kedua flag bernilai false ditolak 422 VALIDATION_ERROR', async () => {
    vi.spyOn(contextModule, 'requireContext').mockResolvedValueOnce({
      user: { id: 'sales_a1', name: 'Sales A1', role: Role.SALES, businessId: 'biz_a' },
      role: Role.SALES,
      businessId: 'biz_a',
      sessionId: 'sess_1',
      ip: null,
    });

    const req = new NextRequest('http://localhost:3000/api/v1/catalogs/cat_test_1/sync', {
      method: 'POST',
      headers: { Origin: 'http://localhost:3000', 'Content-Type': 'application/json' },
      body: JSON.stringify({ addNewProducts: false, raiseToFloor: false }),
    });

    const res = await syncCatalogHandler(req, { params: Promise.resolve({ id: 'cat_test_1' }) });
    const json = await res.json();

    expect(res.status).toBe(422);
    expect(json.ok).toBe(false);
    expect(json.error.code).toBe('VALIDATION_ERROR');
  });

  it('(d) Dua sinkronisasi serentak tidak membuat item ganda (skipDuplicates)', async () => {
    vi.spyOn(contextModule, 'requireContext').mockResolvedValue({
      user: { id: 'sales_a1', name: 'Sales A1', role: Role.SALES, businessId: 'biz_a' },
      role: Role.SALES,
      businessId: 'biz_a',
      sessionId: 'sess_1',
      ip: null,
    });

    const makeReq = () =>
      new NextRequest('http://localhost:3000/api/v1/catalogs/cat_test_1/sync', {
        method: 'POST',
        headers: { Origin: 'http://localhost:3000', 'Content-Type': 'application/json' },
        body: JSON.stringify({ addNewProducts: true }),
      });

    await Promise.all([
      syncCatalogHandler(makeReq(), { params: Promise.resolve({ id: 'cat_test_1' }) }),
      syncCatalogHandler(makeReq(), { params: Promise.resolve({ id: 'cat_test_1' }) }),
    ]);

    const prod3Items = mockCatalogItems.filter((i) => i.productId === 'prod_new_3');
    expect(prod3Items).toHaveLength(1);
  });
});
