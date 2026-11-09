import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { Role, InvoiceTheme } from '@prisma/client';
import * as contextModule from '@/lib/auth/context';
import { assertNoSecretKeys } from '../helpers/leak';
import { DomainError } from '@/lib/domain/money';
import { env } from '@/lib/env';

import { GET as getCatalogPresetsHandler } from '@/app/api/v1/catalog-presets/route';
import {
  GET as getCatalogsHandler,
  POST as createCatalogHandler,
} from '@/app/api/v1/catalogs/route';
import {
  GET as getCatalogDetailHandler,
  PATCH as updateCatalogHandler,
  DELETE as deleteCatalogHandler,
} from '@/app/api/v1/catalogs/[id]/route';
import { PUT as replaceCatalogItemsHandler } from '@/app/api/v1/catalogs/[id]/items/route';
import { POST as adjustCatalogMinHandler } from '@/app/api/v1/catalogs/[id]/adjust-min/route';
import { GET as getCatalogPdfHandler } from '@/app/api/v1/catalogs/[id]/pdf/route';

// Mock in-memory DB tables
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
  sku: string;
  name: string;
  unit: string;
  basePrice: bigint;
  minPrice: bigint;
  costPrice: bigint;
  stockQty: number;
  isActive: boolean;
  deletedAt: Date | null;
  images: Array<{ id: string; path: string; isPrimary: boolean }>;
}

interface MockCustomer {
  id: string;
  businessId: string;
  code: string;
  name: string;
  assignedSalesId: string | null;
  deletedAt: Date | null;
}

interface MockCustomerMinPrice {
  id: string;
  businessId: string;
  customerId: string;
  productId: string;
  minPrice: bigint;
}

interface MockUser {
  id: string;
  name: string;
  username: string;
  role: Role;
  businessId: string | null;
}

interface MockBusiness {
  id: string;
  name: string;
  invoiceTheme: InvoiceTheme;
  ppnEnabled: boolean;
  ppnRateBps: number;
  phone: string | null;
  address: string | null;
  logoPath: string | null;
  deletedAt: Date | null;
}

let mockCatalogs: MockCatalog[] = [];
let mockCatalogItems: MockCatalogItem[] = [];
let mockProducts: MockProduct[] = [];
let mockCustomers: MockCustomer[] = [];
let mockCustomerMinPrices: MockCustomerMinPrice[] = [];
let mockUsers: MockUser[] = [];
let mockBusinesses: MockBusiness[] = [];

// Mock engine PDF to avoid chromium launch
vi.mock('@/lib/pdf/engine', async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    renderHtmlToPdf: vi.fn(async () => Buffer.from('%PDF-1.4 mock catalog pdf data')),
  };
});

// Mock DB
vi.mock('@/lib/db', () => {
  const mockPrisma = {
    $transaction: vi.fn(async (cb: (tx: any) => Promise<any>) => cb(mockPrisma)),
    catalog: {
      count: vi.fn(async ({ where }: { where: Record<string, any> }) => {
        return mockCatalogs.filter((c) => {
          if (where.businessId && c.businessId !== where.businessId) return false;
          if (where.deletedAt === null && c.deletedAt !== null) return false;
          if (where.ownerId && c.ownerId !== where.ownerId) return false;
          if (where.customerId && c.customerId !== where.customerId) return false;
          if (where.OR) {
            const matches = where.OR.some((cond: any) => {
              if (cond.title && c.title.toLowerCase().includes(cond.title.contains.toLowerCase())) return true;
              if (cond.note && c.note && c.note.toLowerCase().includes(cond.note.contains.toLowerCase())) return true;
              return false;
            });
            if (!matches) return false;
          }
          return true;
        }).length;
      }),
      findMany: vi.fn(async ({ where, skip = 0, take = 20 }: { where: Record<string, any>; skip?: number; take?: number }) => {
        const filtered = mockCatalogs.filter((c) => {
          if (where.businessId && c.businessId !== where.businessId) return false;
          if (where.deletedAt === null && c.deletedAt !== null) return false;
          if (where.ownerId && c.ownerId !== where.ownerId) return false;
          if (where.customerId && c.customerId !== where.customerId) return false;
          if (where.OR) {
            const matches = where.OR.some((cond: any) => {
              if (cond.title && c.title.toLowerCase().includes(cond.title.contains.toLowerCase())) return true;
              if (cond.note && c.note && c.note.toLowerCase().includes(cond.note.contains.toLowerCase())) return true;
              return false;
            });
            if (!matches) return false;
          }
          return true;
        });
        const slice = filtered.slice(skip, skip + take);
        return slice.map((c) => ({
          ...c,
          _count: {
            items: mockCatalogItems.filter((i) => i.catalogId === c.id).length,
          },
        }));
      }),
      findFirst: vi.fn(async ({ where, include }: { where: Record<string, any>; include?: Record<string, any> }) => {
        const c = mockCatalogs.find((cat) => {
          if (where.id && cat.id !== where.id) return false;
          if (where.businessId && cat.businessId !== where.businessId) return false;
          if (where.deletedAt === null && cat.deletedAt !== null) return false;
          if (where.ownerId && cat.ownerId !== where.ownerId) return false;
          return true;
        });
        if (!c) return null;

        if (include?.items) {
          const items = mockCatalogItems
            .filter((i) => i.catalogId === c.id)
            .sort((a, b) => a.sortOrder - b.sortOrder);
          return { ...c, items };
        }
        return c;
      }),
      create: vi.fn(async ({ data }: { data: any }) => {
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

        if (data.items?.createMany?.data) {
          data.items.createMany.data.forEach((itemData: any, idx: number) => {
            mockCatalogItems.push({
              id: `item_${Date.now()}_${idx}`,
              catalogId: newCat.id,
              productId: itemData.productId,
              price: BigInt(itemData.price),
              sortOrder: itemData.sortOrder ?? idx,
            });
          });
        }
        return newCat;
      }),
      updateMany: vi.fn(async ({ where, data }: { where: Record<string, any>; data: any }) => {
        let count = 0;
        mockCatalogs.forEach((c) => {
          if (where.id && c.id !== where.id) return;
          if (where.businessId && c.businessId !== where.businessId) return;
          if (where.deletedAt === null && c.deletedAt !== null) return;
          if (data.title !== undefined) c.title = data.title;
          if (data.customerId !== undefined) c.customerId = data.customerId;
          if (data.note !== undefined) c.note = data.note;
          if (data.deletedAt !== undefined) c.deletedAt = data.deletedAt;
          c.updatedAt = new Date();
          count++;
        });
        return { count };
      }),
      deleteMany: vi.fn(async ({ where }: { where: Record<string, any> }) => {
        let count = 0;
        mockCatalogs.forEach((c) => {
          if (where.id && c.id !== where.id) return;
          if (where.businessId && c.businessId !== where.businessId) return;
          c.deletedAt = new Date();
          count++;
        });
        return { count };
      }),
    },
    catalogItem: {
      findMany: vi.fn(async ({ where }: { where: Record<string, any> }) => {
        return mockCatalogItems.filter((i) => {
          if (where.catalogId && i.catalogId !== where.catalogId) return false;
          return true;
        });
      }),
      createMany: vi.fn(async ({ data }: { data: any[] }) => {
        data.forEach((itemData, idx) => {
          mockCatalogItems.push({
            id: `item_${Date.now()}_${idx}`,
            catalogId: itemData.catalogId,
            productId: itemData.productId,
            price: BigInt(itemData.price),
            sortOrder: itemData.sortOrder ?? idx,
          });
        });
        return { count: data.length };
      }),
      deleteMany: vi.fn(async ({ where }: { where: Record<string, any> }) => {
        const initialLen = mockCatalogItems.length;
        mockCatalogItems = mockCatalogItems.filter((i) => {
          if (where.catalogId && i.catalogId === where.catalogId) return false;
          return true;
        });
        return { count: initialLen - mockCatalogItems.length };
      }),
      updateMany: vi.fn(async ({ where, data }: { where: Record<string, any>; data: any }) => {
        let count = 0;
        mockCatalogItems.forEach((i) => {
          if (where.id && i.id !== where.id) return;
          if (where.catalogId && i.catalogId !== where.catalogId) return;
          if (where.productId && i.productId !== where.productId) return;
          if (data.price !== undefined) i.price = BigInt(data.price);
          count++;
        });
        return { count };
      }),
    },
    product: {
      findMany: vi.fn(async ({ where }: { where: Record<string, any> }) => {
        return mockProducts.filter((p) => {
          if (where.businessId && p.businessId !== where.businessId) return false;
          if (where.deletedAt === null && p.deletedAt !== null) return false;
          if (where.id?.in && !where.id.in.includes(p.id)) return false;
          return true;
        });
      }),
      findFirst: vi.fn(async ({ where }: { where: Record<string, any> }) => {
        return (
          mockProducts.find((p) => {
            if (where.id && p.id !== where.id) return false;
            if (where.businessId && p.businessId !== where.businessId) return false;
            if (where.deletedAt === null && p.deletedAt !== null) return false;
            return true;
          }) || null
        );
      }),
    },
    customer: {
      findMany: vi.fn(async ({ where }: { where: Record<string, any> }) => {
        return mockCustomers.filter((c) => {
          if (where.businessId && c.businessId !== where.businessId) return false;
          if (where.id?.in && !where.id.in.includes(c.id)) return false;
          return true;
        });
      }),
      findFirst: vi.fn(async ({ where }: { where: Record<string, any> }) => {
        return (
          mockCustomers.find((c) => {
            if (where.id && c.id !== where.id) return false;
            if (where.businessId && c.businessId !== where.businessId) return false;
            return true;
          }) || null
        );
      }),
    },
    customerMinPrice: {
      findMany: vi.fn(async ({ where }: { where: Record<string, any> }) => {
        return mockCustomerMinPrices.filter((cmp) => {
          if (where.businessId && cmp.businessId !== where.businessId) return false;
          if (where.customerId && cmp.customerId !== where.customerId) return false;
          if (where.productId?.in && !where.productId.in.includes(cmp.productId)) return false;
          return true;
        });
      }),
    },
    user: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
        return mockUsers.find((u) => u.id === where.id) || null;
      }),
      findMany: vi.fn(async ({ where }: { where: Record<string, any> }) => {
        return mockUsers.filter((u) => {
          if (where.id?.in && !where.id.in.includes(u.id)) return false;
          return true;
        });
      }),
    },
    business: {
      findFirst: vi.fn(async ({ where }: { where: Record<string, any> }) => {
        return (
          mockBusinesses.find((b) => {
            if (where.id && b.id !== where.id) return false;
            if (where.deletedAt === null && b.deletedAt !== null) return false;
            return true;
          }) || null
        );
      }),
    },
  };
  return { prisma: mockPrisma };
});

describe('T4.5: Manajemen Katalog Harga, Validasi Floor, dan PDF (Seksi 15 & 17.3 nomor 18)', () => {
  const BIZ_ID = 'biz_cat_test_01';
  const SALES_1_ID = 'usr_sales_01';
  const SALES_2_ID = 'usr_sales_02';
  const SUPERADMIN_ID = 'usr_admin_01';

  const sales1Ctx = {
    user: { id: SALES_1_ID, name: 'Sales Satu', username: 'sales1', role: Role.SALES, businessId: BIZ_ID, mustChangePassword: false },
    role: Role.SALES,
    businessId: BIZ_ID,
    sessionId: 'sess_sales_1',
    ip: '127.0.0.1',
  };

  const sales2Ctx = {
    user: { id: SALES_2_ID, name: 'Sales Dua', username: 'sales2', role: Role.SALES, businessId: BIZ_ID, mustChangePassword: false },
    role: Role.SALES,
    businessId: BIZ_ID,
    sessionId: 'sess_sales_2',
    ip: '127.0.0.1',
  };

  const adminCtx = {
    user: { id: SUPERADMIN_ID, name: 'Super Admin', username: 'admin', role: Role.SUPERADMIN, businessId: BIZ_ID, mustChangePassword: false },
    role: Role.SUPERADMIN,
    businessId: BIZ_ID,
    sessionId: 'sess_admin',
    ip: '127.0.0.1',
  };

  let activeCtx: any = sales1Ctx;

  beforeEach(() => {
    mockCatalogs = [];
    mockCatalogItems = [];
    mockProducts = [];
    mockCustomers = [];
    mockCustomerMinPrices = [];
    mockUsers = [];
    mockBusinesses = [];

    // Setup initial users
    mockUsers.push(
      { id: SALES_1_ID, name: 'Sales Satu', username: 'sales1', role: Role.SALES, businessId: BIZ_ID },
      { id: SALES_2_ID, name: 'Sales Dua', username: 'sales2', role: Role.SALES, businessId: BIZ_ID },
      { id: SUPERADMIN_ID, name: 'Super Admin', username: 'admin', role: Role.SUPERADMIN, businessId: BIZ_ID }
    );

    // Setup initial business
    mockBusinesses.push({
      id: BIZ_ID,
      name: 'PT Kucing Sejahtera',
      invoiceTheme: InvoiceTheme.MODERN,
      ppnEnabled: false,
      ppnRateBps: 1100,
      phone: '08123456789',
      address: 'Jl. Melati No. 10 Jakarta',
      logoPath: null,
      deletedAt: null,
    });

    // Setup initial products
    mockProducts.push(
      {
        id: 'prod_1',
        businessId: BIZ_ID,
        sku: 'CAT-001',
        name: 'Makanan Kucing Salmon 1kg',
        unit: 'pack',
        basePrice: BigInt(50000),
        minPrice: BigInt(40000), // Default floor 40.000
        costPrice: BigInt(30000), // Zero-leakage: HPP 30.000
        stockQty: 100,
        isActive: true,
        deletedAt: null,
        images: [{ id: 'img_1', path: 'uploads/cat-salmon.jpg', isPrimary: true }],
      },
      {
        id: 'prod_2',
        businessId: BIZ_ID,
        sku: 'CAT-002',
        name: 'Pasir Kucing Wangi 5L',
        unit: 'sak',
        basePrice: BigInt(75000),
        minPrice: BigInt(60000), // Default floor 60.000
        costPrice: BigInt(45000),
        stockQty: 50,
        isActive: true,
        deletedAt: null,
        images: [],
      }
    );

    // Setup initial customers
    mockCustomers.push(
      {
        id: 'cust_vip',
        businessId: BIZ_ID,
        code: 'CUST-VIP-01',
        name: 'Toko Hewan Bahagia',
        assignedSalesId: SALES_1_ID,
        deletedAt: null,
      },
      {
        id: 'cust_other',
        businessId: BIZ_ID,
        code: 'CUST-REG-02',
        name: 'Petshop Sebelah',
        assignedSalesId: SALES_2_ID,
        deletedAt: null,
      }
    );

    // Setup special customer min price for cust_vip on prod_1: 35.000 (lower floor for VIP)
    mockCustomerMinPrices.push({
      id: 'cmp_1',
      businessId: BIZ_ID,
      customerId: 'cust_vip',
      productId: 'prod_1',
      minPrice: BigInt(35000),
    });

    activeCtx = sales1Ctx;

    vi.spyOn(contextModule, 'requireContext').mockImplementation(async (_req, roles) => {
      if (roles && roles.length > 0 && !roles.includes(activeCtx.role)) {
        throw new DomainError('FORBIDDEN', 'Anda tidak punya akses', 403);
      }
      return activeCtx;
    });
    vi.spyOn(contextModule, 'requireBusiness').mockImplementation(() => activeCtx.businessId);
  });

  describe('1. Preset Judul Katalog (Seksi 15.1)', () => {
    it('mengembalikan preset standar: Grosir, Distributor Tunggal, Ecer', async () => {
      const req = new NextRequest('http://localhost/api/v1/catalog-presets');
      const res = await getCatalogPresetsHandler(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);
      expect(json.data.presets).toEqual(['Grosir', 'Distributor Tunggal', 'Ecer']);
      assertNoSecretKeys(json);
    });
  });

  describe('2. Validasi Harga Minimal & Pembuatan Katalog (Seksi 15.1 & Tes 17.3 nomor 18)', () => {
    it('menolak pembuatan katalog jika harga item di bawah minPrice produk umum (422 PRICE_BELOW_MIN)', async () => {
      const body = {
        title: 'Grosir',
        items: [
          { productId: 'prod_1', price: 38000 }, // minPrice = 40.000 -> melanggar!
        ],
      };

      const req = new NextRequest('http://localhost/api/v1/catalogs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: env.APP_URL },
        body: JSON.stringify(body),
      });

      const res = await createCatalogHandler(req);
      const json = await res.json();

      expect(res.status).toBe(422);
      expect(json.ok).toBe(false);
      expect(json.error.code).toBe('PRICE_BELOW_MIN');
      expect(json.error.details).toHaveLength(1);
      expect(json.error.details[0].productId).toBe('prod_1');
      expect(json.error.details[0].floorPrice).toBe(40000);
    });

    it('memakai harga minimal khusus customer (CustomerMinPrice) jika katalog dikaitkan ke customer', async () => {
      // cust_vip memiliki CustomerMinPrice untuk prod_1 = 35.000 (default minPrice prod_1 = 40.000)
      const body = {
        title: 'Katalog Khusus VIP',
        customerId: 'cust_vip',
        note: 'Harga spesial mitra VIP',
        items: [
          { productId: 'prod_1', price: 36000 }, // 36.000 >= 35.000 -> Valid!
        ],
      };

      const req = new NextRequest('http://localhost/api/v1/catalogs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: env.APP_URL },
        body: JSON.stringify(body),
      });

      const res = await createCatalogHandler(req);
      const json = await res.json();

      expect(res.status).toBe(201);
      expect(json.ok).toBe(true);
      expect(json.data.title).toBe('Katalog Khusus VIP');
      expect(json.data.customerId).toBe('cust_vip');
      expect(mockCatalogs).toHaveLength(1);
      expect(mockCatalogItems).toHaveLength(1);
      expect(Number(mockCatalogItems[0].price)).toBe(36000);

      // Verifikasi zero leakage
      assertNoSecretKeys(json);
    });

    it('menolak produk duplikat dalam satu katalog (422 DUPLICATE_PRODUCT)', async () => {
      const body = {
        title: 'Ecer',
        items: [
          { productId: 'prod_1', price: 45000 },
          { productId: 'prod_1', price: 46000 },
        ],
      };

      const req = new NextRequest('http://localhost/api/v1/catalogs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: env.APP_URL },
        body: JSON.stringify(body),
      });

      const res = await createCatalogHandler(req);
      const json = await res.json();

      expect(res.status).toBe(422);
      expect(json.error.code).toBe('DUPLICATE_PRODUCT');
    });

    it('menolak jika sales mencoba mengaitkan katalog ke customer milik sales lain (403 FORBIDDEN)', async () => {
      // cust_other ditugaskan ke SALES_2_ID, sedangkan requester adalah SALES_1_ID
      const body = {
        title: 'Katalog Bajakan',
        customerId: 'cust_other',
        items: [{ productId: 'prod_1', price: 45000 }],
      };

      const req = new NextRequest('http://localhost/api/v1/catalogs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: env.APP_URL },
        body: JSON.stringify(body),
      });

      const res = await createCatalogHandler(req);
      const json = await res.json();

      expect(res.status).toBe(403);
      expect(json.error.code).toBe('FORBIDDEN');
    });
  });

  describe('3. Daftar dan Detail Katalog (Seksi 15.1 & Isolasi Sales)', () => {
    beforeEach(async () => {
      // Buat katalog untuk Sales 1
      mockCatalogs.push({
        id: 'cat_sales_1',
        businessId: BIZ_ID,
        ownerId: SALES_1_ID,
        customerId: 'cust_vip',
        title: 'Katalog Grosir 1',
        note: 'Catatan katalog 1',
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      });
      mockCatalogItems.push({
        id: 'item_1',
        catalogId: 'cat_sales_1',
        productId: 'prod_1',
        price: BigInt(45000),
        sortOrder: 0,
      });

      // Buat katalog untuk Sales 2
      mockCatalogs.push({
        id: 'cat_sales_2',
        businessId: BIZ_ID,
        ownerId: SALES_2_ID,
        customerId: 'cust_other',
        title: 'Katalog Grosir 2',
        note: 'Catatan katalog 2',
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      });
      mockCatalogItems.push({
        id: 'item_2',
        catalogId: 'cat_sales_2',
        productId: 'prod_2',
        price: BigInt(70000),
        sortOrder: 0,
      });
    });

    it('Sales hanya melihat katalog miliknya sendiri pada list', async () => {
      activeCtx = sales1Ctx;

      const req = new NextRequest('http://localhost/api/v1/catalogs');
      const res = await getCatalogsHandler(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.data).toHaveLength(1);
      expect(json.data[0].id).toBe('cat_sales_1');
      assertNoSecretKeys(json);
    });

    it('Super Admin melihat seluruh katalog dari seluruh sales pada usaha aktif', async () => {
      activeCtx = adminCtx;

      const req = new NextRequest('http://localhost/api/v1/catalogs');
      const res = await getCatalogsHandler(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.data).toHaveLength(2);
      assertNoSecretKeys(json);
    });

    it('Sales tidak dapat membuka detail katalog milik sales lain (404 NOT_FOUND)', async () => {
      activeCtx = sales1Ctx;

      const req = new NextRequest('http://localhost/api/v1/catalogs/cat_sales_2');
      const res = await getCatalogDetailHandler(req, { params: Promise.resolve({ id: 'cat_sales_2' }) });
      const json = await res.json();

      expect(res.status).toBe(404);
    });

    it('Detail katalog tidak membocorkan HPP, margin, stok fisik, atau riwayat harga (Zero-Leakage)', async () => {
      activeCtx = sales1Ctx;

      const req = new NextRequest('http://localhost/api/v1/catalogs/cat_sales_1');
      const res = await getCatalogDetailHandler(req, { params: Promise.resolve({ id: 'cat_sales_1' }) });
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.data.id).toBe('cat_sales_1');
      expect(json.data.items).toHaveLength(1);
      expect(json.data.items[0].price).toBe(45000);
      expect(json.data.hasStaleItems).toBe(false);

      // Pastikan HPP dan stok tidak pernah bocor
      assertNoSecretKeys(json);
      const str = JSON.stringify(json);
      expect(str).not.toContain('costPrice');
      expect(str).not.toContain('stockQty');
      expect(str).not.toContain('30000'); // HPP prod_1
    });
  });

  describe('4. Penggantian Item & Pembaruan Metadata Katalog', () => {
    beforeEach(() => {
      mockCatalogs.push({
        id: 'cat_edit',
        businessId: BIZ_ID,
        ownerId: SALES_1_ID,
        customerId: null,
        title: 'Katalog Awal',
        note: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      });
      mockCatalogItems.push({
        id: 'item_old',
        catalogId: 'cat_edit',
        productId: 'prod_1',
        price: BigInt(45000),
        sortOrder: 0,
      });
      activeCtx = sales1Ctx;
    });

    it('memperbarui metadata katalog (title dan note)', async () => {
      const req = new NextRequest('http://localhost/api/v1/catalogs/cat_edit', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Origin: env.APP_URL },
        body: JSON.stringify({ title: 'Katalog Diperbarui', note: 'Catatan baru' }),
      });

      const res = await updateCatalogHandler(req, { params: Promise.resolve({ id: 'cat_edit' }) });
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.data.title).toBe('Katalog Diperbarui');
      expect(json.data.note).toBe('Catatan baru');
    });

    it('mengganti seluruh item katalog dengan validasi floor harga', async () => {
      const req = new NextRequest('http://localhost/api/v1/catalogs/cat_edit/items', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Origin: env.APP_URL },
        body: JSON.stringify({
          items: [
            { productId: 'prod_2', price: 65000, sortOrder: 0 }, // minPrice prod_2 = 60.000 -> Lolos
          ],
        }),
      });

      const res = await replaceCatalogItemsHandler(req, { params: Promise.resolve({ id: 'cat_edit' }) });
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(mockCatalogItems.filter((i) => i.catalogId === 'cat_edit')).toHaveLength(1);
      expect(Number(mockCatalogItems[0].price)).toBe(65000);
    });

    it('menolak penggantian item jika ada yang di bawah harga minimal', async () => {
      const req = new NextRequest('http://localhost/api/v1/catalogs/cat_edit/items', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Origin: env.APP_URL },
        body: JSON.stringify({
          items: [
            { productId: 'prod_2', price: 55000, sortOrder: 0 }, // minPrice prod_2 = 60.000 -> Pelanggaran!
          ],
        }),
      });

      const res = await replaceCatalogItemsHandler(req, { params: Promise.resolve({ id: 'cat_edit' }) });
      const json = await res.json();

      expect(res.status).toBe(422);
      expect(json.error.code).toBe('PRICE_BELOW_MIN');
    });
  });

  describe('5. Kedaluwarsa (Stale), PDF, dan Penyesuaian ke Harga Minimal (Seksi 15.1 & 15.2)', () => {
    beforeEach(() => {
      // Buat katalog dengan prod_1 di harga 42.000 (saat floor prod_1 masih 40.000)
      mockCatalogs.push({
        id: 'cat_stale_test',
        businessId: BIZ_ID,
        ownerId: SALES_1_ID,
        customerId: null,
        title: 'Katalog Eceran Kucing',
        note: 'Berlaku segera',
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      });
      mockCatalogItems.push({
        id: 'item_stale_1',
        catalogId: 'cat_stale_test',
        productId: 'prod_1',
        price: BigInt(42000),
        sortOrder: 0,
      });
      activeCtx = sales1Ctx;
    });

    it('berhasil mengunduh PDF saat seluruh item di atas floor price', async () => {
      const req = new NextRequest('http://localhost/api/v1/catalogs/cat_stale_test/pdf');
      const res = await getCatalogPdfHandler(req, { params: Promise.resolve({ id: 'cat_stale_test' }) });

      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toBe('application/pdf');
      expect(res.headers.get('content-disposition')).toContain('Katalog-Katalog-Eceran-Kucing');
    });

    it('menolak PDF dengan 422 CATALOG_STALE jika Super Admin menaikkan harga minimal melebihi harga katalog', async () => {
      // Super Admin menaikkan minPrice prod_1 dari 40.000 menjadi 45.000
      // Harga di katalog adalah 42.000 -> Sekarang jatuh di bawah floor (stale)!
      const prod = mockProducts.find((p) => p.id === 'prod_1');
      if (prod) {
        prod.minPrice = BigInt(45000);
      }

      const req = new NextRequest('http://localhost/api/v1/catalogs/cat_stale_test/pdf');
      const res = await getCatalogPdfHandler(req, { params: Promise.resolve({ id: 'cat_stale_test' }) });
      const json = await res.json();

      expect(res.status).toBe(422);
      expect(json.ok).toBe(false);
      expect(json.error.code).toBe('CATALOG_STALE');
      expect(json.error.details).toHaveLength(1);
      expect(json.error.details[0].productId).toBe('prod_1');
      expect(json.error.details[0].currentPrice).toBe(42000);
      expect(json.error.details[0].floorPrice).toBe(45000);
    });

    it('dapat menyesuaikan seluruh item stale ke harga minimal terbaru via adjust-min, lalu PDF bisa dicetak kembali', async () => {
      // Super Admin menaikkan minPrice prod_1 menjadi 45.000
      const prod = mockProducts.find((p) => p.id === 'prod_1');
      if (prod) {
        prod.minPrice = BigInt(45000);
      }

      // Panggil POST /api/v1/catalogs/:id/adjust-min
      const adjustReq = new NextRequest('http://localhost/api/v1/catalogs/cat_stale_test/adjust-min', {
        method: 'POST',
        headers: { Origin: env.APP_URL },
      });
      const adjustRes = await adjustCatalogMinHandler(adjustReq, { params: Promise.resolve({ id: 'cat_stale_test' }) });
      const adjustJson = await adjustRes.json();

      expect(adjustRes.status).toBe(200);
      expect(adjustJson.ok).toBe(true);
      expect(adjustJson.data.hasStaleItems).toBe(false);
      expect(adjustJson.data.items[0].price).toBe(45000);

      // Verifikasi harga di DB berubah menjadi 45.000
      const updatedItem = mockCatalogItems.find((i) => i.catalogId === 'cat_stale_test');
      expect(Number(updatedItem?.price)).toBe(45000);

      // Sekarang cetak PDF harus berhasil (200 OK)
      const pdfReq = new NextRequest('http://localhost/api/v1/catalogs/cat_stale_test/pdf');
      const pdfRes = await getCatalogPdfHandler(pdfReq, { params: Promise.resolve({ id: 'cat_stale_test' }) });

      expect(pdfRes.status).toBe(200);
      expect(pdfRes.headers.get('content-type')).toBe('application/pdf');
    });
  });

  describe('6. Penghapusan Katalog (Soft Delete)', () => {
    beforeEach(() => {
      mockCatalogs.push({
        id: 'cat_del',
        businessId: BIZ_ID,
        ownerId: SALES_1_ID,
        customerId: null,
        title: 'Katalog Hapus',
        note: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      });
      activeCtx = sales1Ctx;
    });

    it('melakukan soft delete pada katalog', async () => {
      const req = new NextRequest('http://localhost/api/v1/catalogs/cat_del', {
        method: 'DELETE',
        headers: { Origin: env.APP_URL },
      });
      const res = await deleteCatalogHandler(req, { params: Promise.resolve({ id: 'cat_del' }) });
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.data.success).toBe(true);

      // Cek bahwa katalog tidak lagi muncul di getCatalogById
      const detailReq = new NextRequest('http://localhost/api/v1/catalogs/cat_del');
      const detailRes = await getCatalogDetailHandler(detailReq, { params: Promise.resolve({ id: 'cat_del' }) });
      expect(detailRes.status).toBe(404);
    });
  });
});
