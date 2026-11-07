import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import {
  GET as getProductsHandler,
  POST as createProductHandler,
} from '@/app/api/v1/products/route';
import {
  GET as getProductDetailHandler,
  PATCH as updateProductHandler,
  DELETE as deleteProductHandler,
} from '@/app/api/v1/products/[id]/route';
import { POST as uploadImagesHandler } from '@/app/api/v1/products/[id]/images/route';
import {
  PATCH as updateImageHandler,
  DELETE as deleteImageHandler,
} from '@/app/api/v1/products/[id]/images/[imageId]/route';
import { GET as getPriceHistoryHandler } from '@/app/api/v1/products/[id]/price-history/route';
import {
  GET as getCategoriesHandler,
  POST as createCategoryHandler,
} from '@/app/api/v1/categories/route';
import {
  GET as getCategoryDetailHandler,
  PATCH as updateCategoryHandler,
  DELETE as deleteCategoryHandler,
} from '@/app/api/v1/categories/[id]/route';
import { Role, PriceField } from '@prisma/client';
import * as contextModule from '@/lib/auth/context';
import { assertNoSecretKeys } from '../helpers/leak';

interface MockProduct {
  id: string;
  businessId: string;
  categoryId: string | null;
  defaultVendorId: string | null;
  sku: string;
  name: string;
  description: string | null;
  unit: string;
  costPrice: bigint;
  basePrice: bigint;
  minPrice: bigint;
  stockQty: number;
  reservedQty: number;
  minStockAlert: number;
  isActive: boolean;
  rev: number;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

interface MockProductImage {
  id: string;
  businessId: string;
  productId: string;
  path: string;
  sortOrder: number;
  isPrimary: boolean;
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

interface MockCategory {
  id: string;
  businessId: string;
  name: string;
  sortOrder: number;
  deletedAt: Date | null;
}

interface MockAuditLog {
  id: string;
  businessId: string | null;
  actorId: string | null;
  action: string;
  entityType: string;
  entityId: string;
  summary: string | null;
}

let products: MockProduct[] = [];
let productImages: MockProductImage[] = [];
let priceHistories: MockPriceHistory[] = [];
let categories: MockCategory[] = [];
let auditLogs: MockAuditLog[] = [];

vi.mock('@/lib/db', () => ({
  prisma: {
    product: {
      findFirst: vi.fn(async ({ where }: { where: any }) => {
        const p = products.find((item) => {
          if (where.id && typeof where.id === 'string' && item.id !== where.id) return false;
          if (where.id?.not && item.id === where.id.not) return false;
          if (where.businessId && item.businessId !== where.businessId) return false;
          if (where.sku && item.sku !== where.sku) return false;
          if (where.deletedAt === null && item.deletedAt !== null) return false;
          if (where.isActive !== undefined && item.isActive !== where.isActive) return false;
          return true;
        });
        if (!p) return null;
        return {
          ...p,
          category: categories.find((c) => c.id === p.categoryId) || null,
          defaultVendor: null,
          images: productImages
            .filter((img) => img.productId === p.id)
            .sort((a, b) => (b.isPrimary ? 1 : 0) - (a.isPrimary ? 1 : 0) || a.sortOrder - b.sortOrder),
        };
      }),
      findMany: vi.fn(async ({ where }: { where: any }) => {
        return products
          .filter((item) => {
            if (where.businessId && item.businessId !== where.businessId) return false;
            if (where.deletedAt === null && item.deletedAt !== null) return false;
            if (where.categoryId && item.categoryId !== where.categoryId) return false;
            if (where.isActive !== undefined && item.isActive !== where.isActive) return false;
            if (where.OR) {
              const q = where.OR[0].name.contains.toLowerCase();
              const mName = item.name.toLowerCase().includes(q);
              const mSku = item.sku.toLowerCase().includes(q);
              if (!mName && !mSku) return false;
            }
            return true;
          })
          .map((p) => ({
            ...p,
            category: categories.find((c) => c.id === p.categoryId) || null,
            defaultVendor: null,
            images: productImages.filter((img) => img.productId === p.id),
          }));
      }),
      create: vi.fn(async ({ data }: { data: any }) => {
        const item: MockProduct = {
          id: `prod_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          ...data,
          createdAt: new Date(),
          updatedAt: new Date(),
          deletedAt: null,
        };
        products.push(item);
        return {
          ...item,
          category: categories.find((c) => c.id === item.categoryId) || null,
          defaultVendor: null,
          images: [],
        };
      }),
      update: vi.fn(async ({ where, data }: { where: any; data: any }) => {
        const p = products.find((item) => item.id === where.id);
        if (!p) throw new Error('Product not found');
        const cleanData: Record<string, any> = {};
        for (const [key, val] of Object.entries(data)) {
          if (val !== undefined) cleanData[key] = val;
        }
        Object.assign(p, cleanData, { updatedAt: new Date() });
        return {
          ...p,
          category: categories.find((c) => c.id === p.categoryId) || null,
          defaultVendor: null,
          images: productImages.filter((img) => img.productId === p.id),
        };
      }),
    },
    category: {
      findFirst: vi.fn(async ({ where }: { where: any }) => {
        return (
          categories.find((c) => {
            if (where.id && typeof where.id === 'string' && c.id !== where.id) return false;
            if (where.id?.not && c.id === where.id.not) return false;
            if (where.businessId && c.businessId !== where.businessId) return false;
            if (where.name?.equals && c.name.toLowerCase() !== where.name.equals.toLowerCase()) return false;
            if (where.deletedAt === null && c.deletedAt !== null) return false;
            return true;
          }) || null
        );
      }),
      findMany: vi.fn(async ({ where }: { where: any }) => {
        return categories
          .filter((c) => {
            if (where?.businessId && c.businessId !== where.businessId) return false;
            if (where?.deletedAt === null && c.deletedAt !== null) return false;
            return true;
          })
          .map((c) => ({
            ...c,
            _count: {
              products: products.filter(
                (p) => p.categoryId === c.id && p.deletedAt === null
              ).length,
            },
          }));
      }),
      create: vi.fn(async ({ data }: { data: any }) => {
        const item: MockCategory = {
          id: `cat_${Date.now()}`,
          ...data,
          deletedAt: null,
        };
        categories.push(item);
        return { ...item };
      }),
      update: vi.fn(async ({ where, data }: { where: any; data: any }) => {
        const c = categories.find((item) => item.id === where.id);
        if (!c) throw new Error('Category not found');
        const cleanData: Record<string, any> = {};
        for (const [key, val] of Object.entries(data)) {
          if (val !== undefined) cleanData[key] = val;
        }
        Object.assign(c, cleanData);
        return { ...c };
      }),
    },
    productImage: {
      findFirst: vi.fn(async ({ where }: { where: any }) => {
        return (
          productImages.find((img) => {
            if (where.id && img.id !== where.id) return false;
            if (where.productId && img.productId !== where.productId) return false;
            return true;
          }) || null
        );
      }),
      create: vi.fn(async ({ data }: { data: any }) => {
        const item: MockProductImage = {
          id: `img_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          ...data,
        };
        productImages.push(item);
        return { ...item };
      }),
      update: vi.fn(async ({ where, data }: { where: any; data: any }) => {
        const img = productImages.find((item) => item.id === where.id);
        if (!img) throw new Error('Image not found');
        Object.assign(img, data);
        return { ...img };
      }),
      updateMany: vi.fn(async ({ where, data }: { where: any; data: any }) => {
        let count = 0;
        for (const img of productImages) {
          if (where.productId && img.productId !== where.productId) continue;
          if (where.id?.not && img.id === where.id.not) continue;
          if (where.isPrimary !== undefined && img.isPrimary !== where.isPrimary) continue;
          Object.assign(img, data);
          count++;
        }
        return { count };
      }),
      delete: vi.fn(async ({ where }: { where: any }) => {
        const idx = productImages.findIndex((img) => img.id === where.id);
        if (idx !== -1) {
          const removed = productImages.splice(idx, 1)[0];
          return removed;
        }
        throw new Error('Image not found');
      }),
    },
    priceHistory: {
      create: vi.fn(async ({ data }: { data: any }) => {
        const item: MockPriceHistory = {
          id: `ph_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          ...data,
          createdAt: new Date(),
        };
        priceHistories.push(item);
        return item;
      }),
      createMany: vi.fn(async ({ data }: { data: any[] }) => {
        for (const d of data) {
          priceHistories.push({
            id: `ph_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
            ...d,
            createdAt: new Date(),
          });
        }
        return { count: data.length };
      }),
      findMany: vi.fn(async ({ where }: { where: any }) => {
        return priceHistories.filter((h) => {
          if (where.productId && h.productId !== where.productId) return false;
          if (where.businessId && h.businessId !== where.businessId) return false;
          return true;
        });
      }),
    },
    vendor: {
      findFirst: vi.fn(async () => null),
    },
    auditLog: {
      create: vi.fn(async ({ data }: { data: any }) => {
        const item: MockAuditLog = {
          id: `audit_${Date.now()}`,
          ...data,
        };
        auditLogs.push(item);
        return item;
      }),
    },
    $transaction: vi.fn(async (cb: any) => {
      const { prisma } = await import('@/lib/db');
      return cb(prisma);
    }),
  },
}));

describe('Katalog Produk & Kategori (T1.5 & Seksi 10.3)', () => {
  const APP_URL = 'http://localhost:3000';

  const superAdminCtx = {
    user: {
      id: 'super_admin_id',
      username: 'owner',
      role: Role.SUPERADMIN,
      name: 'Super Administrator',
      businessId: null,
    },
    sessionId: 'sess_admin_1',
    role: Role.SUPERADMIN,
    businessId: 'biz_1',
    ip: '127.0.0.1',
  };

  const salesCtx = {
    user: {
      id: 'sales_user_id',
      username: 'salesbudi',
      role: Role.SALES,
      name: 'Sales Budi',
      businessId: 'biz_1',
    },
    sessionId: 'sess_sales_1',
    role: Role.SALES,
    businessId: 'biz_1',
    ip: '127.0.0.1',
  };

  beforeEach(() => {
    products = [];
    productImages = [];
    priceHistories = [];
    categories = [];
    auditLogs = [];
    vi.clearAllMocks();

    vi.spyOn(contextModule, 'requireContext').mockResolvedValue(
      superAdminCtx as any
    );
  });

  describe('CRUD Kategori Produk (/api/v1/categories)', () => {
    it('membuat kategori baru dengan nama unik per usaha (201)', async () => {
      const req = new NextRequest(`${APP_URL}/api/v1/categories`, {
        method: 'POST',
        headers: { origin: APP_URL, 'content-type': 'application/json' },
        body: JSON.stringify({
          name: 'Makanan Kucing Basah',
          sortOrder: 1,
        }),
      });

      const res = await createCategoryHandler(req);
      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.ok).toBe(true);
      expect(json.data.name).toBe('Makanan Kucing Basah');

      const audit = auditLogs.find(
        (a) => a.action === 'CATEGORY_CREATE' && a.entityId === json.data.id
      );
      expect(audit).toBeDefined();
    });

    it('menolak duplikasi nama kategori dalam satu unit usaha (409 DUPLICATE)', async () => {
      categories.push({
        id: 'cat_1',
        businessId: 'biz_1',
        name: 'Makanan Kucing Basah',
        sortOrder: 1,
        deletedAt: null,
      });

      const req = new NextRequest(`${APP_URL}/api/v1/categories`, {
        method: 'POST',
        headers: { origin: APP_URL, 'content-type': 'application/json' },
        body: JSON.stringify({
          name: 'makanan kucing basah',
        }),
      });

      const res = await createCategoryHandler(req);
      expect(res.status).toBe(409);
      const json = await res.json();
      expect(json.error.code).toBe('DUPLICATE');
    });

    it('mengambil daftar kategori beserta jumlah produk', async () => {
      categories.push({
        id: 'cat_snack',
        businessId: 'biz_1',
        name: 'Snack Kucing',
        sortOrder: 2,
        deletedAt: null,
      });

      products.push({
        id: 'prod_1',
        businessId: 'biz_1',
        categoryId: 'cat_snack',
        defaultVendorId: null,
        sku: 'SNK-01',
        name: 'Creamy Treat',
        description: null,
        unit: 'PCS',
        costPrice: 5000n,
        basePrice: 10000n,
        minPrice: 8000n,
        stockQty: 50,
        reservedQty: 0,
        minStockAlert: 10,
        isActive: true,
        rev: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      });

      const req = new NextRequest(`${APP_URL}/api/v1/categories`);
      const res = await getCategoriesHandler(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data).toHaveLength(1);
      expect(json.data[0]._count.products).toBe(1);
    });
  });

  describe('CRUD Produk & Validasi Harga (/api/v1/products)', () => {
    it('membuat produk baru dan mencatat PriceHistory awal (201)', async () => {
      const req = new NextRequest(`${APP_URL}/api/v1/products`, {
        method: 'POST',
        headers: { origin: APP_URL, 'content-type': 'application/json' },
        body: JSON.stringify({
          sku: 'dry-01',
          name: 'BentoCat Dry Food Salmon 1kg',
          unit: 'BAG',
          costPrice: 40000,
          basePrice: 65000,
          minPrice: 55000,
          stockQty: 100,
          minStockAlert: 15,
        }),
      });

      const res = await createProductHandler(req);
      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.ok).toBe(true);
      expect(json.data.sku).toBe('DRY-01'); // Uppercase
      expect(json.data.costPrice).toBe(40000); // Admin melihat HPP
      expect(json.data.marginAmount).toBe(25000); // 65000 - 40000
      expect(json.data.marginBps).toBe(3846); // Math.round((25000*10000)/65000)

      // Verifikasi riwayat harga awal tertulis
      const histories = priceHistories.filter((h) => h.productId === json.data.id);
      expect(histories).toHaveLength(3); // COST, BASE, MIN
      expect(histories.map((h) => h.field)).toContain(PriceField.COST);
      expect(histories.map((h) => h.field)).toContain(PriceField.BASE);
      expect(histories.map((h) => h.field)).toContain(PriceField.MIN);
    });

    it('MENOLAK pembuatan produk bila minPrice > basePrice (422 VALIDATION_ERROR)', async () => {
      const req = new NextRequest(`${APP_URL}/api/v1/products`, {
        method: 'POST',
        headers: { origin: APP_URL, 'content-type': 'application/json' },
        body: JSON.stringify({
          sku: 'ERR-01',
          name: 'Produk Salah Harga',
          costPrice: 40000,
          basePrice: 50000,
          minPrice: 55000, // Melebihi basePrice!
        }),
      });

      const res = await createProductHandler(req);
      expect(res.status).toBe(422);
      const json = await res.json();
      expect(json.error.code).toBe('VALIDATION_ERROR');
      expect(json.error.message).toContain(
        'Harga minimal tidak boleh melebihi harga dasar'
      );
    });

    it('MENOLAK pembuatan produk bila SKU duplikat di unit usaha yang sama (409 DUPLICATE)', async () => {
      products.push({
        id: 'p_existing',
        businessId: 'biz_1',
        categoryId: null,
        defaultVendorId: null,
        sku: 'DUPLICATE-SKU',
        name: 'Produk A',
        description: null,
        unit: 'PCS',
        costPrice: 10000n,
        basePrice: 15000n,
        minPrice: 12000n,
        stockQty: 10,
        reservedQty: 0,
        minStockAlert: 2,
        isActive: true,
        rev: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      });

      const req = new NextRequest(`${APP_URL}/api/v1/products`, {
        method: 'POST',
        headers: { origin: APP_URL, 'content-type': 'application/json' },
        body: JSON.stringify({
          sku: 'duplicate-sku',
          name: 'Produk B',
          costPrice: 10000,
          basePrice: 15000,
          minPrice: 12000,
        }),
      });

      const res = await createProductHandler(req);
      expect(res.status).toBe(409);
      const json = await res.json();
      expect(json.error.code).toBe('DUPLICATE');
    });
  });

  describe('Tes Kebocoran Kunci Rahasia untuk Sales (Seksi 17.4 a & 10.3)', () => {
    beforeEach(() => {
      products.push({
        id: 'prod_leak_check',
        businessId: 'biz_1',
        categoryId: null,
        defaultVendorId: null,
        sku: 'LEAK-01',
        name: 'Produk Uji Rahasia',
        description: 'Deskripsi uji',
        unit: 'PCS',
        costPrice: 25000n,
        basePrice: 50000n,
        minPrice: 40000n,
        stockQty: 100,
        reservedQty: 10,
        minStockAlert: 5,
        isActive: true,
        rev: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      });
    });

    it('MEMASTIKAN respons GET /api/v1/products untuk Sales TIDAK membocorkan HPP/margin', async () => {
      vi.spyOn(contextModule, 'requireContext').mockResolvedValueOnce(
        salesCtx as any
      );

      const req = new NextRequest(`${APP_URL}/api/v1/products`);
      const res = await getProductsHandler(req);
      expect(res.status).toBe(200);
      const json = await res.json();

      // Uji melalui helper resmi assertNoSecretKeys
      expect(() => assertNoSecretKeys(json)).not.toThrow();

      // Verifikasi eksplisit field rahasia tidak ada
      const firstProduct = json.data[0];
      expect(firstProduct.costPrice).toBeUndefined();
      expect(firstProduct.marginAmount).toBeUndefined();
      expect(firstProduct.marginBps).toBeUndefined();
      expect(firstProduct.stockQty).toBeUndefined(); // Sales hanya melihat `available`

      // Field yang boleh dilihat sales
      expect(firstProduct.basePrice).toBe(50000);
      expect(firstProduct.minPrice).toBe(40000);
      expect(firstProduct.available).toBe(90); // 100 - 10
    });

    it('MEMASTIKAN respons GET /api/v1/products/:id untuk Sales TIDAK membocorkan HPP/margin', async () => {
      vi.spyOn(contextModule, 'requireContext').mockResolvedValueOnce(
        salesCtx as any
      );

      const req = new NextRequest(`${APP_URL}/api/v1/products/prod_leak_check`);
      const res = await getProductDetailHandler(req, {
        params: Promise.resolve({ id: 'prod_leak_check' }),
      });
      expect(res.status).toBe(200);
      const json = await res.json();

      expect(() => assertNoSecretKeys(json)).not.toThrow();
      expect(json.data.costPrice).toBeUndefined();
      expect(json.data.marginAmount).toBeUndefined();
      expect(json.data.marginBps).toBeUndefined();
    });
  });

  describe('Penguncian Optimistik (rev) & Perubahan Harga (priceReason)', () => {
    beforeEach(() => {
      products.push({
        id: 'prod_rev_test',
        businessId: 'biz_1',
        categoryId: null,
        defaultVendorId: null,
        sku: 'REV-01',
        name: 'Produk Versi 1',
        description: null,
        unit: 'PCS',
        costPrice: 20000n,
        basePrice: 35000n,
        minPrice: 30000n,
        stockQty: 20,
        reservedQty: 0,
        minStockAlert: 5,
        isActive: true,
        rev: 1, // Sedang berada di rev 1
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      });
    });

    it('MENOLAK update bila rev tidak cocok / basi (409 OPTIMISTIC_LOCK_ERROR)', async () => {
      const req = new NextRequest(`${APP_URL}/api/v1/products/prod_rev_test`, {
        method: 'PATCH',
        headers: { origin: APP_URL, 'content-type': 'application/json' },
        body: JSON.stringify({
          name: 'Produk Nama Baru',
          rev: 0, // rev basi (database berada di rev 1)
        }),
      });

      const res = await updateProductHandler(req, {
        params: Promise.resolve({ id: 'prod_rev_test' }),
      });
      expect(res.status).toBe(409);
      const json = await res.json();
      expect(json.error.code).toBe('OPTIMISTIC_LOCK_ERROR');
    });

    it('MENOLAK perubahan harga bila priceReason tidak diisi (422 VALIDATION_ERROR)', async () => {
      const req = new NextRequest(`${APP_URL}/api/v1/products/prod_rev_test`, {
        method: 'PATCH',
        headers: { origin: APP_URL, 'content-type': 'application/json' },
        body: JSON.stringify({
          basePrice: 40000, // Harga diubah dari 35000 ke 40000
          rev: 1,
          // priceReason sengaja tidak diisi
        }),
      });

      const res = await updateProductHandler(req, {
        params: Promise.resolve({ id: 'prod_rev_test' }),
      });
      expect(res.status).toBe(422);
      const json = await res.json();
      expect(json.error.code).toBe('VALIDATION_ERROR');
      expect(json.error.message).toContain('priceReason');
    });

    it('berhasil mengubah harga dengan priceReason, menaikkan rev, dan menulis PriceHistory', async () => {
      const req = new NextRequest(`${APP_URL}/api/v1/products/prod_rev_test`, {
        method: 'PATCH',
        headers: { origin: APP_URL, 'content-type': 'application/json' },
        body: JSON.stringify({
          basePrice: 40000,
          minPrice: 32000,
          rev: 1,
          priceReason: 'Penyesuaian kenaikan tarif logistik nasional',
        }),
      });

      const res = await updateProductHandler(req, {
        params: Promise.resolve({ id: 'prod_rev_test' }),
      });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data.rev).toBe(2); // rev bertambah 1
      expect(json.data.basePrice).toBe(40000);
      expect(json.data.minPrice).toBe(32000);

      // Verifikasi PriceHistory tercatat
      const histories = priceHistories.filter(
        (h) => h.productId === 'prod_rev_test'
      );
      expect(histories).toHaveLength(2); // BASE dan MIN
      expect(histories[0].reason).toBe(
        'Penyesuaian kenaikan tarif logistik nasional'
      );
    });
  });

  describe('Soft Delete dengan Konfirmasi Nama Produk', () => {
    beforeEach(() => {
      products.push({
        id: 'prod_del_test',
        businessId: 'biz_1',
        categoryId: null,
        defaultVendorId: null,
        sku: 'DEL-01',
        name: 'Barang Mau Dihapus',
        description: null,
        unit: 'PCS',
        costPrice: 10000n,
        basePrice: 20000n,
        minPrice: 15000n,
        stockQty: 0,
        reservedQty: 0,
        minStockAlert: 0,
        isActive: true,
        rev: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      });
    });

    it('MENOLAK soft delete bila teks konfirmasi tidak cocok (422)', async () => {
      const req = new NextRequest(`${APP_URL}/api/v1/products/prod_del_test`, {
        method: 'DELETE',
        headers: { origin: APP_URL, 'content-type': 'application/json' },
        body: JSON.stringify({
          confirm: 'Salah Nama',
        }),
      });

      const res = await deleteProductHandler(req, {
        params: Promise.resolve({ id: 'prod_del_test' }),
      });
      expect(res.status).toBe(422);
    });

    it('berhasil soft delete bila teks konfirmasi persis cocok dengan nama produk', async () => {
      const req = new NextRequest(`${APP_URL}/api/v1/products/prod_del_test`, {
        method: 'DELETE',
        headers: { origin: APP_URL, 'content-type': 'application/json' },
        body: JSON.stringify({
          confirm: 'Barang Mau Dihapus',
        }),
      });

      const res = await deleteProductHandler(req, {
        params: Promise.resolve({ id: 'prod_del_test' }),
      });
      expect(res.status).toBe(200);

      const p = products.find((item) => item.id === 'prod_del_test');
      expect(p?.deletedAt).not.toBeNull();
      expect(p?.isActive).toBe(false);
    });
  });

  describe('Foto Produk & Batas Maksimal 8 Foto (Seksi 10.3 & T1.5)', () => {
    beforeEach(() => {
      products.push({
        id: 'prod_img_test',
        businessId: 'biz_1',
        categoryId: null,
        defaultVendorId: null,
        sku: 'IMG-01',
        name: 'Produk Banyak Foto',
        description: null,
        unit: 'PCS',
        costPrice: 10000n,
        basePrice: 20000n,
        minPrice: 15000n,
        stockQty: 0,
        reservedQty: 0,
        minStockAlert: 0,
        isActive: true,
        rev: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      });
    });

    it('MENOLAK unggah bila jumlah total foto melebihi batas maksimal 8 (422)', async () => {
      // Pasang 7 foto awal
      for (let i = 0; i < 7; i++) {
        productImages.push({
          id: `img_init_${i}`,
          businessId: 'biz_1',
          productId: 'prod_img_test',
          path: `biz_1/product/img_${i}.webp`,
          sortOrder: i,
          isPrimary: i === 0,
        });
      }

      // Coba upload 2 foto lagi (7 + 2 = 9 > 8)
      const pngBase64 =
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
      const file1 = new Blob([Buffer.from(pngBase64, 'base64')], {
        type: 'image/png',
      });
      const file2 = new Blob([Buffer.from(pngBase64, 'base64')], {
        type: 'image/png',
      });

      const formData = new FormData();
      formData.append('files', file1, 'foto1.png');
      formData.append('files', file2, 'foto2.png');

      const req = new NextRequest(
        `${APP_URL}/api/v1/products/prod_img_test/images`,
        {
          method: 'POST',
          headers: { origin: APP_URL },
          body: formData,
        }
      );

      const res = await uploadImagesHandler(req, {
        params: Promise.resolve({ id: 'prod_img_test' }),
      });
      expect(res.status).toBe(422);
      const json = await res.json();
      expect(json.error.code).toBe('VALIDATION_ERROR');
      expect(json.error.message).toContain('Maksimal 8 foto per produk');
    });

    it('mengubah foto utama (isPrimary) via PATCH', async () => {
      productImages.push(
        {
          id: 'img_a',
          businessId: 'biz_1',
          productId: 'prod_img_test',
          path: 'biz_1/product/a.webp',
          sortOrder: 0,
          isPrimary: true,
        },
        {
          id: 'img_b',
          businessId: 'biz_1',
          productId: 'prod_img_test',
          path: 'biz_1/product/b.webp',
          sortOrder: 1,
          isPrimary: false,
        }
      );

      const req = new NextRequest(
        `${APP_URL}/api/v1/products/prod_img_test/images/img_b`,
        {
          method: 'PATCH',
          headers: { origin: APP_URL, 'content-type': 'application/json' },
          body: JSON.stringify({
            isPrimary: true,
          }),
        }
      );

      const res = await updateImageHandler(req, {
        params: Promise.resolve({ id: 'prod_img_test', imageId: 'img_b' }),
      });
      expect(res.status).toBe(200);

      const imgA = productImages.find((i) => i.id === 'img_a');
      const imgB = productImages.find((i) => i.id === 'img_b');
      expect(imgB?.isPrimary).toBe(true);
      expect(imgA?.isPrimary).toBe(false);
    });
  });
});
