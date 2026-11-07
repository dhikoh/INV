import { Role, InvoiceTheme, OrderStatus } from '@prisma/client';

export function createBusiness(overrides: Record<string, unknown> = {}) {
  return {
    id: 'biz_' + Math.random().toString(36).substring(7),
    code: 'TRB',
    name: 'Usaha Terobos',
    legalName: 'PT Terobos Sukses Mandiri',
    invoiceTheme: InvoiceTheme.PROFESIONAL,
    ppnEnabled: false,
    ppnRateBps: 1100,
    allowNegativeStock: false,
    defaultDpBps: 5000,
    requirePaidBeforeShip: false,
    defaultRepeatDays: 14,
    ...overrides,
  };
}

export function createUser(
  role: Role = Role.SALES,
  overrides: Record<string, unknown> = {}
) {
  return {
    id: 'usr_' + Math.random().toString(36).substring(7),
    username: 'sales_user_' + Math.random().toString(36).substring(7),
    name: 'Budi Lapangan',
    role,
    isActive: true,
    businessId: 'biz_1',
    ...overrides,
  };
}

export function createCustomer(
  businessId: string,
  overrides: Record<string, unknown> = {}
) {
  return {
    id: 'cust_' + Math.random().toString(36).substring(7),
    businessId,
    code: 'TEROBOS',
    name: 'Toko Terobos Jaya',
    phone: '081234567890',
    shippingAddress: 'Jl. Merdeka No. 45, Jakarta',
    ...overrides,
  };
}

export function createProduct(
  businessId: string,
  overrides: Record<string, unknown> = {}
) {
  return {
    id: 'prod_' + Math.random().toString(36).substring(7),
    businessId,
    sku: 'SKU-' + Math.random().toString(36).substring(7).toUpperCase(),
    name: 'Produk Unggulan',
    unit: 'PCS',
    costPrice: 70000,
    basePrice: 100000,
    minPrice: 85000,
    stockQty: 50,
    reservedQty: 0,
    isActive: true,
    ...overrides,
  };
}

export function createDraftOrder(
  businessId: string,
  customerId: string,
  salesId: string,
  overrides: Record<string, unknown> = {}
) {
  return {
    id: 'ord_' + Math.random().toString(36).substring(7),
    businessId,
    customerId,
    salesId,
    status: OrderStatus.DRAFT,
    subtotal: 100000,
    discountTotal: 0,
    shippingCharge: 0,
    grandTotal: 100000,
    dpAmount: 0,
    ...overrides,
  };
}

export function ctxFor(
  user: ReturnType<typeof createUser>,
  businessId: string
) {
  return {
    user: {
      id: user.id,
      username: user.username,
      name: user.name,
      role: user.role,
    },
    role: user.role,
    businessId,
    ip: '127.0.0.1',
    userAgent: 'vitest-agent',
  };
}
