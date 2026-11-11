import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { Role } from '@prisma/client';
import * as contextModule from '@/lib/auth/context';
import { unwrapList } from '@/lib/api/client';
import { assertNoSecretKeys } from '../helpers/leak';

const mockCustomers = [
  {
    id: 'cust_1',
    businessId: 'biz_bentocat_sales_01',
    code: 'CHERRY-CLP',
    name: 'Cherry Petshop',
    assignedSalesId: 'usr_sales_field_01',
    pipelineStage: 'LEAD',
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    assignedSales: { id: 'usr_sales_field_01', name: 'Sales Lapangan BentoCat', username: 'sales_bento' },
    _count: { orders: 2 },
  },
];

const mockProducts = [
  {
    id: 'prod_1',
    businessId: 'biz_bentocat_sales_01',
    sku: 'ZEO-01',
    name: 'Pasir Zeolite No 1',
    unit: 'SAK',
    costPrice: 9500n,
    basePrice: 11000n,
    minPrice: 10000n,
    stockQty: 50,
    isActive: true,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    category: { id: 'cat_1', name: 'Pasir' },
    defaultVendor: null,
    images: [],
  },
];

vi.mock('@/lib/db', () => ({
  prisma: {
    customer: {
      count: vi.fn(async () => mockCustomers.length),
      findMany: vi.fn(async () => mockCustomers),
      findFirst: vi.fn(async ({ where }: { where: { id: string } }) => {
        return mockCustomers.find((c) => c.id === where.id) || null;
      }),
    },
    product: {
      findMany: vi.fn(async () => mockProducts),
      findFirst: vi.fn(async ({ where }: { where: { id: string } }) => {
        return mockProducts.find((p) => p.id === where.id) || null;
      }),
    },
    customerPricing: {
      findMany: vi.fn(async () => []),
    },
    customerMinPrice: {
      findMany: vi.fn(async () => []),
    },
    customerPromo: {
      findMany: vi.fn(async () => []),
    },
    promoRule: {
      findMany: vi.fn(async () => []),
    },
    priceHistory: {
      findMany: vi.fn(async () => []),
    },
    auditLog: {
      create: vi.fn(async () => ({})),
    },
  },
}));

// Dynamic import of handlers after vi.mock
const { GET: getCustomersHandler } = await import('@/app/api/v1/customers/route');
const { GET: getProductsHandler } = await import('@/app/api/v1/products/route');
const { GET: getCustomerPricingHandler } = await import('@/app/api/v1/customers/[id]/pricing/route');

describe('Sales UI Bootstrap & Order Creation Contract (T1, T3, T7)', () => {
  const businessId = 'biz_bentocat_sales_01';
  const salesUserId = 'usr_sales_field_01';

  beforeEach(() => {
    vi.restoreAllMocks();

    vi.spyOn(contextModule, 'requireContext').mockImplementation(async (req, roles) => {
      if (roles && !roles.includes(Role.SALES)) {
        throw new Error('FORBIDDEN');
      }
      return {
        user: {
          id: salesUserId,
          role: Role.SALES,
          name: 'Sales Lapangan BentoCat',
          businessId,
        },
        role: Role.SALES,
        businessId,
        sessionId: 'sess_sales_01',
        ip: '127.0.0.1',
      };
    });

    vi.spyOn(contextModule, 'requireBusiness').mockReturnValue(businessId);
  });

  it('T1: Respons GET /api/v1/customers dan /api/v1/products dapat di-unwrapList oleh OrderForm', async () => {
    // 1. Bootstrap OrderForm: GET /api/v1/customers
    const custReq = new NextRequest('http://localhost:3000/api/v1/customers?limit=100', {
      method: 'GET',
    });
    const custRes = await getCustomersHandler(custReq);
    expect(custRes.status).toBe(200);

    const custJson = await custRes.json();
    const customers = unwrapList<{ id: string; name: string }>(custJson);
    expect(Array.isArray(customers)).toBe(true);
    expect(customers.length).toBeGreaterThan(0);
    expect(customers[0].name).toBe('Cherry Petshop');

    // 2. Bootstrap OrderForm: GET /api/v1/products
    const prodReq = new NextRequest('http://localhost:3000/api/v1/products?limit=100&active=true', {
      method: 'GET',
    });
    const prodRes = await getProductsHandler(prodReq);
    expect(prodRes.status).toBe(200);

    const prodJson = await prodRes.json();
    const products = unwrapList<{ id: string; name: string; basePrice: number }>(prodJson);
    expect(Array.isArray(products)).toBe(true);
    expect(products.length).toBeGreaterThan(0);
    expect(products[0].name).toBe('Pasir Zeolite No 1');

    // 3. Verifikasi DTO Sales tidak membocorkan HPP/costPrice
    assertNoSecretKeys(prodJson);
  });

  it('T3: Sales memanggil /api/v1/customers/:id/pricing berhasil HTTP 200 (bukan 403 /min-prices)', async () => {
    const pricingReq = new NextRequest('http://localhost:3000/api/v1/customers/cust_1/pricing', {
      method: 'GET',
    });

    const res = await getCustomerPricingHandler(pricingReq, {
      params: Promise.resolve({ id: 'cust_1' }),
    });
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.data.customer.id).toBe('cust_1');
    expect(json.data.pricing).toBeDefined();
  });
});
