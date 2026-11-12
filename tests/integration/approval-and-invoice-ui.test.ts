import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import {
  Role,
  OrderStatus,
  InvoiceStatus,
  InvoiceType,
  InvoiceTheme,
} from '@prisma/client';
import * as contextModule from '@/lib/auth/context';
import { assertNoSecretKeys } from '../helpers/leak';
import { GET as listInvoicesHandler } from '@/app/api/v1/invoices/route';
import { GET as getInvoiceDetailHandler } from '@/app/api/v1/invoices/[id]/route';
import { POST as rejectInvoiceHandler } from '@/app/api/v1/invoices/[id]/reject/route';
import { GET as getInvoicePdfHandler } from '@/app/api/v1/invoices/[id]/pdf/route';

interface MockBusiness {
  id: string;
  name: string;
  legalName: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  npwp: string | null;
  logoPath: string | null;
  invoiceTheme: InvoiceTheme;
  allowNegativeStock: boolean;
  ppnEnabled: boolean;
  ppnRateBps: number;
  [key: string]: unknown;
}

interface MockUser {
  id: string;
  businessId: string;
  role: Role;
  name: string;
  username: string;
  email: string;
}

interface MockCustomer {
  id: string;
  businessId: string;
  code: string;
  name: string;
  phone: string | null;
  address: string | null;
  deletedAt: Date | null;
}

interface MockProduct {
  id: string;
  businessId: string;
  reservedQty: number;
  [key: string]: unknown;
}

interface MockOrder {
  id: string;
  businessId: string;
  customerId: string;
  salesId: string;
  status: OrderStatus;
  orderNo: string | null;
  deletedAt: Date | null;
  customer?: MockCustomer | null;
  items?: MockOrderItem[];
  sales?: MockUser | null;
  [key: string]: unknown;
}

interface MockOrderItem {
  id: string;
  orderId: string;
  businessId: string;
  [key: string]: unknown;
}

interface MockInvoice {
  id: string;
  businessId: string;
  orderId: string;
  customerId?: string;
  number: string | null;
  type: InvoiceType;
  status: InvoiceStatus;
  rejectReason?: string | null;
  deletedAt: Date | null;
  business?: MockBusiness | null;
  [key: string]: unknown;
}

interface MockBankAccount {
  id: string;
  businessId: string;
  deletedAt: Date | null;
  [key: string]: unknown;
}

interface CustomerOrClause {
  name?: { contains: string };
  code?: { contains: string };
}

interface InvoiceOrClause {
  number?: { contains: string };
  customerId?: { in: string[] };
  orderId?: { in: string[] };
}

interface WhereFilter {
  id?: string | { in?: string[] };
  businessId?: string;
  salesId?: string;
  customerId?: string;
  orderId?: string | { in?: string[] };
  deletedAt?: Date | null;
  status?: InvoiceStatus | OrderStatus | { in?: OrderStatus[]; not?: OrderStatus };
  type?: InvoiceType;
  orderNo?: { contains: string };
  OR?: CustomerOrClause[];
}

interface InvoiceWhereFilter {
  id?: string;
  businessId?: string;
  deletedAt?: Date | null;
  status?: InvoiceStatus;
  type?: InvoiceType;
  orderId?: { in?: string[] };
  OR?: InvoiceOrClause[];
}

// In-memory mock database collections
let mockBusinesses: MockBusiness[] = [];
let mockUsers: MockUser[] = [];
let mockCustomers: MockCustomer[] = [];
let mockProducts: MockProduct[] = [];
let mockOrders: MockOrder[] = [];
let mockOrderItems: MockOrderItem[] = [];
let mockInvoices: MockInvoice[] = [];
let mockBankAccounts: MockBankAccount[] = [];
const mockAuditLogs: Record<string, unknown>[] = [];

let idCounter = 1;

vi.mock('@/lib/db', () => {
  const mockPrisma = {
    business: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
        return mockBusinesses.find((b) => b.id === where.id) || null;
      }),
      findFirst: vi.fn(async ({ where }: { where: { id?: string } }) => {
        return mockBusinesses.find((b) => b.id === where.id) || null;
      }),
    },
    user: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
        return mockUsers.find((u) => u.id === where.id) || null;
      }),
      findFirst: vi.fn(async ({ where }: { where: { id?: string } }) => {
        return mockUsers.find((u) => u.id === where.id) || null;
      }),
      findMany: vi.fn(async ({ where }: { where?: { id?: { in?: string[] } } }) => {
        if (where?.id?.in) {
          return mockUsers.filter((u) => where.id!.in!.includes(u.id));
        }
        return mockUsers;
      }),
    },
    customer: {
      findMany: vi.fn(async ({ where }: { where: WhereFilter }) => {
        return mockCustomers.filter((c) => {
          if (where.businessId && c.businessId !== where.businessId) return false;
          if (where.OR) {
            const match = where.OR.some((clause) => {
              if (clause.name?.contains) {
                return c.name.toLowerCase().includes(clause.name.contains.toLowerCase());
              }
              if (clause.code?.contains) {
                return c.code.toLowerCase().includes(clause.code.contains.toLowerCase());
              }
              return false;
            });
            if (!match) return false;
          }
          return true;
        });
      }),
    },
    product: {
      findMany: vi.fn(async ({ where }: { where?: { businessId?: string; id?: { in?: string[] } } }) => {
        return mockProducts.filter((p) => {
          if (where?.businessId && p.businessId !== where.businessId) return false;
          if (where?.id?.in && !where.id.in.includes(p.id)) return false;
          return true;
        });
      }),
      findFirst: vi.fn(async ({ where }: { where: { id?: string } }) => {
        return mockProducts.find((p) => p.id === where.id) || null;
      }),
      updateMany: vi.fn(async ({ where, data }: { where: { id?: string }; data: { reservedQty?: { increment?: number } } }) => {
        let count = 0;
        mockProducts.forEach((p) => {
          if (where.id === p.id) {
            if (data.reservedQty?.increment) {
              p.reservedQty += data.reservedQty.increment;
            }
            count++;
          }
        });
        return { count };
      }),
    },
    order: {
      findFirst: vi.fn(async ({ where, include }: { where: WhereFilter; include?: { customer?: boolean; items?: boolean; sales?: boolean } }) => {
        const found = mockOrders.find((o) => {
          if (where.id && o.id !== where.id) return false;
          if (where.businessId && o.businessId !== where.businessId) return false;
          if (where.deletedAt === null && o.deletedAt !== null) return false;
          return true;
        });
        if (!found) return null;
        const res = { ...found };
        if (include?.customer) {
          res.customer = mockCustomers.find((c) => c.id === found.customerId) || null;
        }
        if (include?.items) {
          res.items = mockOrderItems.filter((i) => i.orderId === found.id);
        }
        if (include?.sales) {
          res.sales = mockUsers.find((u) => u.id === found.salesId) || null;
        }
        return res;
      }),
      findFirstOrThrow: vi.fn(async ({ where }: { where: WhereFilter }) => {
        const found = mockOrders.find((o) => {
          if (where.id && o.id !== where.id) return false;
          if (where.businessId && o.businessId !== where.businessId) return false;
          return true;
        });
        if (!found) throw new Error('Order not found');
        return found;
      }),
      findMany: vi.fn(async ({ where }: { where: WhereFilter }) => {
        return mockOrders.filter((o) => {
          if (where.businessId && o.businessId !== where.businessId) return false;
          if (where.salesId && o.salesId !== where.salesId) return false;
          if (where.customerId && o.customerId !== where.customerId) return false;
          if (where.deletedAt === null && o.deletedAt !== null) return false;
          if (typeof where.id === 'object' && where.id?.in && !where.id.in.includes(o.id)) return false;
          if (typeof where.status === 'object' && where.status?.in && !where.status.in.includes(o.status)) return false;
          if (typeof where.status === 'object' && where.status?.not && o.status === where.status.not) return false;
          if (where.orderNo?.contains) {
            return o.orderNo?.toLowerCase().includes(where.orderNo.contains.toLowerCase());
          }
          return true;
        });
      }),
      count: vi.fn(async ({ where }: { where: WhereFilter }) => {
        return mockOrders.filter((o) => {
          if (where.businessId && o.businessId !== where.businessId) return false;
          if (where.customerId && o.customerId !== where.customerId) return false;
          if (where.deletedAt === null && o.deletedAt !== null) return false;
          if (typeof where.status === 'object' && where.status?.not && o.status === where.status.not) return false;
          return true;
        }).length;
      }),
      updateMany: vi.fn(async ({ where, data }: { where: { id?: string }; data: Partial<MockOrder> }) => {
        let count = 0;
        mockOrders.forEach((o) => {
          if (where.id === o.id) {
            Object.assign(o, data);
            count++;
          }
        });
        return { count };
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<MockOrder> }) => {
        const found = mockOrders.find((o) => o.id === where.id);
        if (found) Object.assign(found, data);
        return found;
      }),
    },
    orderItem: {
      findMany: vi.fn(async ({ where }: { where: { orderId?: string; businessId?: string } }) => {
        return mockOrderItems.filter((i) => {
          if (where.orderId && i.orderId !== where.orderId) return false;
          if (where.businessId && i.businessId !== where.businessId) return false;
          return true;
        });
      }),
    },
    invoice: {
      findFirst: vi.fn(async ({ where, include }: { where: InvoiceWhereFilter; include?: { business?: boolean } }) => {
        const found = mockInvoices.find((inv) => {
          if (where.id && inv.id !== where.id) return false;
          if (where.businessId && inv.businessId !== where.businessId) return false;
          if (where.deletedAt === null && inv.deletedAt !== null) return false;
          return true;
        });
        if (!found) return null;
        const res = { ...found };
        if (include?.business) {
          res.business = mockBusinesses.find((b) => b.id === found.businessId) || null;
        }
        return res;
      }),
      findFirstOrThrow: vi.fn(async ({ where }: { where: InvoiceWhereFilter }) => {
        const found = mockInvoices.find((inv) => {
          if (where.id && inv.id !== where.id) return false;
          if (where.businessId && inv.businessId !== where.businessId) return false;
          return true;
        });
        if (!found) throw new Error('Invoice not found');
        return found;
      }),
      findMany: vi.fn(async ({ where, skip, take }: { where: InvoiceWhereFilter; skip?: number; take?: number }) => {
        let res = mockInvoices.filter((inv) => {
          if (where.businessId && inv.businessId !== where.businessId) return false;
          if (where.status && inv.status !== where.status) return false;
          if (where.type && inv.type !== where.type) return false;
          if (where.deletedAt === null && inv.deletedAt !== null) return false;
          if (where.orderId?.in && !where.orderId.in.includes(inv.orderId)) return false;
          if (where.OR) {
            const match = where.OR.some((clause) => {
              if (clause.number?.contains) {
                return inv.number?.toLowerCase().includes(clause.number.contains.toLowerCase());
              }
              if (clause.customerId?.in) {
                return inv.customerId ? clause.customerId.in.includes(inv.customerId) : false;
              }
              if (clause.orderId?.in) {
                return clause.orderId.in.includes(inv.orderId);
              }
              return false;
            });
            if (!match) return false;
          }
          return true;
        });
        if (skip) res = res.slice(skip);
        if (take) res = res.slice(0, take);
        return res;
      }),
      count: vi.fn(async ({ where }: { where: InvoiceWhereFilter }) => {
        return mockInvoices.filter((inv) => {
          if (where.businessId && inv.businessId !== where.businessId) return false;
          if (where.status && inv.status !== where.status) return false;
          if (where.type && inv.type !== where.type) return false;
          if (where.deletedAt === null && inv.deletedAt !== null) return false;
          if (where.orderId?.in && !where.orderId.in.includes(inv.orderId)) return false;
          return true;
        }).length;
      }),
      updateMany: vi.fn(async ({ where, data }: { where: { id?: string }; data: Partial<MockInvoice> }) => {
        let count = 0;
        mockInvoices.forEach((inv) => {
          if (where.id === inv.id) {
            Object.assign(inv, data);
            count++;
          }
        });
        return { count };
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<MockInvoice> }) => {
        const found = mockInvoices.find((inv) => inv.id === where.id);
        if (found) Object.assign(found, data);
        return found;
      }),
    },
    bankAccount: {
      findMany: vi.fn(async ({ where }: { where: { businessId?: string; deletedAt?: Date | null } }) => {
        return mockBankAccounts.filter((b) => {
          if (where.businessId && b.businessId !== where.businessId) return false;
          if (where.deletedAt === null && b.deletedAt !== null) return false;
          return true;
        });
      }),
    },
    shipment: {
      findFirst: vi.fn(async () => null),
    },
    orderCost: {
      findMany: vi.fn(async () => []),
    },
    creditNote: {
      findMany: vi.fn(async () => []),
    },
    commissionEntry: {
      findFirst: vi.fn(async () => null),
    },
    auditLog: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        mockAuditLogs.push(data);
        return { id: `audit_${idCounter++}`, ...data };
      }),
    },
    notification: {
      create: vi.fn(async () => ({})),
    },
    counter: {
      findUnique: vi.fn(async () => null),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ ...data, seq: 1 })),
      update: vi.fn(async () => ({ seq: 2 })),
    },
    $queryRaw: vi.fn(async (strings: unknown, ...values: unknown[]) => {
      const sql = Array.isArray(strings) ? strings.join('?') : String(strings);
      if (sql.includes('SELECT "id" FROM "Order"')) {
        const orderId = values[0];
        const ord = mockOrders.find((o) => o.id === orderId);
        return ord ? [{ id: ord.id }] : [];
      }
      return [];
    }),
    $transaction: vi.fn(async <T>(callback: (tx: unknown) => Promise<T>): Promise<T> => callback(mockPrisma)),
  };

  return { prisma: mockPrisma };
});

// Mock PDF render engine
vi.mock('@/lib/pdf/engine', () => ({
  renderReactToPdf: vi.fn(async () => Buffer.from('%PDF-1.4 Mock PDF Stream')),
}));

describe('T3.8: UI Persetujuan, Invoice, dan Alur Pelunasan Terpadu', () => {
  const businessId = 'biz_t38_001';
  const superAdminId = 'user_sa_001';
  const salesId1 = 'user_sales_001';
  const salesId2 = 'user_sales_002';

  beforeEach(() => {
    idCounter = 1;

    mockBusinesses = [
      {
        id: businessId,
        name: 'PT Bento Distribusi Utama',
        legalName: 'PT Bento Distribusi Utama Mandiri',
        address: 'Jl. Merdeka No. 45, Jakarta',
        phone: '021-5550123',
        email: 'billing@bentocat.id',
        npwp: '01.234.567.8-901.000',
        logoPath: null,
        invoiceTheme: InvoiceTheme.KLASIK,
        allowNegativeStock: true,
        ppnEnabled: false,
        ppnRateBps: 0,
      },
    ];

    mockUsers = [
      {
        id: superAdminId,
        businessId,
        role: Role.SUPERADMIN,
        name: 'Budi Superadmin',
        username: 'superadmin',
        email: 'superadmin@bentocat.id',
      },
      {
        id: salesId1,
        businessId,
        role: Role.SALES,
        name: 'Siti Sales 1',
        username: 'sales1',
        email: 'sales1@bentocat.id',
      },
      {
        id: salesId2,
        businessId,
        role: Role.SALES,
        name: 'Joko Sales 2',
        username: 'sales2',
        email: 'sales2@bentocat.id',
      },
    ];

    mockCustomers = [
      {
        id: 'cust_001',
        businessId,
        code: 'CUST-ALPHA',
        name: 'Toko Sumber Jaya',
        phone: '08123456789',
        address: 'Pasar Baru Blok A No. 12',
        deletedAt: null,
      },
      {
        id: 'cust_002',
        businessId,
        code: 'CUST-BETA',
        name: 'Warung Berkah Abadi',
        phone: '08987654321',
        address: 'Jl. Melati No. 5',
        deletedAt: null,
      },
    ];

    mockProducts = [
      {
        id: 'prod_001',
        businessId,
        sku: 'BENTO-KCS',
        name: 'Bento Box Kecil 300ml',
        unit: 'dus',
        stockQty: 100,
        reservedQty: 0,
        costPrice: 50000n, // HPP Rahasia
        basePrice: 80000n,
        minPrice: 70000n,
      },
    ];

    mockBankAccounts = [
      {
        id: 'bank_001',
        businessId,
        bankName: 'BCA',
        accountNumber: '1234567890',
        accountHolder: 'PT Bento Distribusi Utama',
        isDefault: true,
        deletedAt: null,
      },
    ];

    // Order 1: Milik Sales 1 (hasBelowMin = true)
    mockOrders = [
      {
        id: 'order_001',
        businessId,
        customerId: 'cust_001',
        salesId: salesId1,
        status: OrderStatus.PENDING_APPROVAL,
        version: 1,
        rev: 0,
        orderNo: null,
        orderDate: new Date('2026-11-09T08:00:00Z'),
        subtotal: 650000n,
        discountTotal: 0n,
        shippingCharge: 25000n,
        ppnEnabled: false,
        ppnRateBps: 0,
        ppnAmount: 0n,
        grandTotal: 675000n,
        dpBps: 3000, // 30%
        dpAmount: 202500n,
        hasBelowMin: true,
        belowMinReason: 'Diskon perkenalan pelanggan baru',
        overrideNote: null,
        paidTotal: 0n,
        deletedAt: null,
      },
      // Order 2: Milik Sales 2 (Normal, Approved)
      {
        id: 'order_002',
        businessId,
        customerId: 'cust_002',
        salesId: salesId2,
        status: OrderStatus.AWAITING_DP,
        version: 1,
        rev: 1,
        orderNo: 'BETA/INV/09/11/2026/0001',
        orderDate: new Date('2026-11-09T09:00:00Z'),
        subtotal: 800000n,
        discountTotal: 0n,
        shippingCharge: 0n,
        ppnEnabled: false,
        ppnRateBps: 0,
        ppnAmount: 0n,
        grandTotal: 800000n,
        dpBps: 5000,
        dpAmount: 400000n,
        hasBelowMin: false,
        belowMinReason: null,
        overrideNote: null,
        paidTotal: 0n,
        deletedAt: null,
      },
    ];

    mockOrderItems = [
      {
        id: 'item_001',
        businessId,
        orderId: 'order_001',
        productId: 'prod_001',
        productName: 'Bento Box Kecil 300ml',
        sku: 'BENTO-KCS',
        unit: 'dus',
        qty: 10,
        listPrice: 80000n,
        unitPrice: 65000n, // di bawah minPrice 70000
        discountType: 'NONE',
        discountValue: 0n,
        discountSource: 'MANUAL',
        lineSubtotal: 650000n,
        lineDiscount: 0n,
        lineNet: 650000n,
        costPrice: 50000n,
        floorPrice: 70000n,
        belowMin: true,
        sortOrder: 0,
      },
    ];

    mockInvoices = [
      // Invoice 1: Pending Approval for Order 1 (DP)
      {
        id: 'inv_001',
        businessId,
        orderId: 'order_001',
        customerId: 'cust_001',
        type: InvoiceType.DP,
        status: InvoiceStatus.PENDING_APPROVAL,
        version: 1,
        number: null,
        amount: 202500n,
        paidAmount: 0n,
        issueDate: null,
        dueDate: null,
        theme: InvoiceTheme.KLASIK,
        snapshot: null,
        requestedById: salesId1,
        requestedAt: new Date('2026-11-09T08:05:00Z'),
        approvedById: null,
        approvedAt: null,
        rejectReason: null,
        voidReason: null,
        rev: 0,
        createdAt: new Date('2026-11-09T08:05:00Z'),
        updatedAt: new Date('2026-11-09T08:05:00Z'),
        deletedAt: null,
      },
      // Invoice 2: Approved for Order 2 (DP)
      {
        id: 'inv_002',
        businessId,
        orderId: 'order_002',
        customerId: 'cust_002',
        type: InvoiceType.DP,
        status: InvoiceStatus.APPROVED,
        version: 1,
        number: 'BETA/INV/09/11/2026/0001-DP',
        amount: 400000n,
        paidAmount: 0n,
        issueDate: new Date('2026-11-09T09:10:00Z'),
        dueDate: new Date('2026-11-16T09:10:00Z'),
        theme: InvoiceTheme.KLASIK,
        snapshot: {
          invoiceNo: 'BETA/INV/09/11/2026/0001-DP',
          business: { name: 'PT Bento Distribusi Utama' },
          customer: { name: 'Warung Berkah Abadi' },
          items: [],
          totals: { grandTotal: 800000, invoiceAmount: 400000 },
        },
        requestedById: salesId2,
        requestedAt: new Date('2026-11-09T09:05:00Z'),
        approvedById: superAdminId,
        approvedAt: new Date('2026-11-09T09:10:00Z'),
        rejectReason: null,
        voidReason: null,
        rev: 1,
        createdAt: new Date('2026-11-09T09:05:00Z'),
        updatedAt: new Date('2026-11-09T09:10:00Z'),
        deletedAt: null,
      },
    ];
  });

  describe('1. GET /api/v1/invoices (Daftar Faktur)', () => {
    it('Super Admin dapat melihat semua invoice di unit usahanya', async () => {
      vi.spyOn(contextModule, 'requireContext').mockResolvedValueOnce({
        user: { id: superAdminId, role: Role.SUPERADMIN, businessId },
        businessId,
      } as never);

      const req = new NextRequest('http://localhost:3000/api/v1/invoices?page=1&limit=20');
      const res = await listInvoicesHandler(req, { params: Promise.resolve({}) });
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.ok).toBe(true);
      expect(body.data.items).toHaveLength(2);
      expect(body.data.pagination.total).toBe(2);
    });

    it('Sales HANYA melihat invoice dari pesanannya sendiri (isolasi data)', async () => {
      vi.spyOn(contextModule, 'requireContext').mockResolvedValueOnce({
        user: { id: salesId1, role: Role.SALES, businessId },
        businessId,
      } as never);

      const req = new NextRequest('http://localhost:3000/api/v1/invoices');
      const res = await listInvoicesHandler(req, { params: Promise.resolve({}) });
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.ok).toBe(true);
      expect(body.data.items).toHaveLength(1);
      expect(body.data.items[0].id).toBe('inv_001');
      expect(body.data.items[0].order.id).toBe('order_001');
    });

    it('Filter berdasarkan status (PENDING_APPROVAL) dan type (DP)', async () => {
      vi.spyOn(contextModule, 'requireContext').mockResolvedValueOnce({
        user: { id: superAdminId, role: Role.SUPERADMIN, businessId },
        businessId,
      } as never);

      const req = new NextRequest(
        'http://localhost:3000/api/v1/invoices?status=APPROVED&type=DP'
      );
      const res = await listInvoicesHandler(req, { params: Promise.resolve({}) });
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.data.items).toHaveLength(1);
      expect(body.data.items[0].id).toBe('inv_002');
      expect(body.data.items[0].status).toBe('APPROVED');
    });
  });

  describe('2. GET /api/v1/invoices/:id (Detail Faktur & Data Persetujuan)', () => {
    it('Super Admin menerima inspeksi lengkap: profitSimulation, belowMin, stockAvailability, customerStats', async () => {
      vi.spyOn(contextModule, 'requireContext').mockResolvedValueOnce({
        user: { id: superAdminId, role: Role.SUPERADMIN, businessId },
        businessId,
      } as never);

      const req = new NextRequest('http://localhost:3000/api/v1/invoices/inv_001');
      const res = await getInvoiceDetailHandler(req, {
        params: Promise.resolve({ id: 'inv_001' }),
      });
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.ok).toBe(true);
      const inv = body.data;

      expect(inv.id).toBe('inv_001');
      expect(inv.profitSimulation).toBeDefined();
      expect(inv.profitSimulation.revenue).toBeGreaterThan(0);
      expect(inv.belowMinItems).toHaveLength(1);
      expect(inv.belowMinItems[0].priceGap).toBe(5000); // 70000 - 65000
      expect(inv.stockAvailability).toBeDefined();
      expect(inv.customerStats).toBeDefined();
      expect(inv.bankAccounts).toHaveLength(1);
    });

    it('Sales dapat melihat detail invoice miliknya, tapi profitSimulation dan floorPrice TIDAK DIBOCORKAN (anti-leak)', async () => {
      vi.spyOn(contextModule, 'requireContext').mockResolvedValueOnce({
        user: { id: salesId1, role: Role.SALES, businessId },
        businessId,
      } as never);

      const req = new NextRequest('http://localhost:3000/api/v1/invoices/inv_001');
      const res = await getInvoiceDetailHandler(req, {
        params: Promise.resolve({ id: 'inv_001' }),
      });
      expect(res.status).toBe(200);

      const body = await res.json();
      const inv = body.data;

      expect(inv.id).toBe('inv_001');
      expect(inv.profitSimulation).toBeNull();
      expect(inv.belowMinItems).toBeNull();
      expect(inv.customerStats).toBeNull();
      expect(inv.stockAvailability).toBeNull();

      // Pastikan zero secret keys leakage pada respons sales
      assertNoSecretKeys(inv);
      inv.order.items.forEach((item: Record<string, unknown>) => {
        expect(item.costPrice).toBeUndefined();
        expect(item.floorPrice).toBeUndefined();
      });
    });

    it('Sales DITOLAK (403) saat mengakses invoice milik sales lain', async () => {
      vi.spyOn(contextModule, 'requireContext').mockResolvedValueOnce({
        user: { id: salesId1, role: Role.SALES, businessId },
        businessId,
      } as never);

      const req = new NextRequest('http://localhost:3000/api/v1/invoices/inv_002');
      const res = await getInvoiceDetailHandler(req, {
        params: Promise.resolve({ id: 'inv_002' }),
      });
      expect(res.status).toBe(403);
    });

    it('ID invoice tidak ditemukan mengembalikan 404', async () => {
      vi.spyOn(contextModule, 'requireContext').mockResolvedValueOnce({
        user: { id: superAdminId, role: Role.SUPERADMIN, businessId },
        businessId,
      } as never);

      const req = new NextRequest('http://localhost:3000/api/v1/invoices/non_existent');
      const res = await getInvoiceDetailHandler(req, {
        params: Promise.resolve({ id: 'non_existent' }),
      });
      expect(res.status).toBe(404);
    });
  });

  describe('3. Kontrol Tombol Cetak PDF (/api/v1/invoices/:id/pdf)', () => {
    it('Sales DILARANG mencetak faktur jika invoice masih PENDING_APPROVAL (409)', async () => {
      vi.spyOn(contextModule, 'requireContext').mockResolvedValueOnce({
        user: { id: salesId1, role: Role.SALES, businessId },
        businessId,
      } as never);

      const req = new NextRequest('http://localhost:3000/api/v1/invoices/inv_001/pdf');
      const res = await getInvoicePdfHandler(req, {
        params: Promise.resolve({ id: 'inv_001' }),
      });
      expect(res.status).toBe(409);
      const json = await res.json();
      expect(json.error.code).toBe('INVOICE_NOT_APPROVED');
    });

    it('Sales dapat mencetak faktur jika status sudah APPROVED', async () => {
      vi.spyOn(contextModule, 'requireContext').mockResolvedValueOnce({
        user: { id: salesId2, role: Role.SALES, businessId },
        businessId,
      } as never);

      const req = new NextRequest('http://localhost:3000/api/v1/invoices/inv_002/pdf');
      const res = await getInvoicePdfHandler(req, {
        params: Promise.resolve({ id: 'inv_002' }),
      });
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toBe('application/pdf');
    });

    it('Super Admin dapat melihat pratinjau faktur pending dengan parameter ?preview=1', async () => {
      vi.spyOn(contextModule, 'requireContext').mockResolvedValueOnce({
        user: { id: superAdminId, role: Role.SUPERADMIN, businessId },
        businessId,
      } as never);

      const req = new NextRequest('http://localhost:3000/api/v1/invoices/inv_001/pdf?preview=1');
      const res = await getInvoicePdfHandler(req, {
        params: Promise.resolve({ id: 'inv_001' }),
      });
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toBe('application/pdf');
    });
  });

  describe('4. Alur Penolakan dan Revisi Faktur (Tolak & Revisi)', () => {
    it('Penolakan faktur memerlukan alasan minimal 5 karakter', async () => {
      vi.spyOn(contextModule, 'requireContext').mockResolvedValueOnce({
        user: { id: superAdminId, role: Role.SUPERADMIN, businessId },
        businessId,
      } as never);

      const req = new NextRequest('http://localhost:3000/api/v1/invoices/inv_001/reject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', origin: 'http://localhost:3000' },
        body: JSON.stringify({ reason: 'No' }), // kurang dari 5 karakter
      });

      const res = await rejectInvoiceHandler(req, {
        params: Promise.resolve({ id: 'inv_001' }),
      });
      expect(res.status).toBe(422); // Zod validation error
    });

    it('Penolakan faktur yang valid mengubah invoice menjadi REJECTED dan order menjadi REVISION_REQUIRED', async () => {
      vi.spyOn(contextModule, 'requireContext').mockResolvedValueOnce({
        user: { id: superAdminId, role: Role.SUPERADMIN, businessId },
        businessId,
      } as never);

      const req = new NextRequest('http://localhost:3000/api/v1/invoices/inv_001/reject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', origin: 'http://localhost:3000' },
        body: JSON.stringify({ reason: 'Harga kemurahan, harap sesuaikan harga normal' }),
      });

      const res = await rejectInvoiceHandler(req, {
        params: Promise.resolve({ id: 'inv_001' }),
      });
      expect(res.status).toBe(200);

      const inv = mockInvoices.find((i) => i.id === 'inv_001');
      const ord = mockOrders.find((o) => o.id === 'order_001');

      expect(inv?.status).toBe(InvoiceStatus.REJECTED);
      expect(inv?.rejectReason).toBe('Harga kemurahan, harap sesuaikan harga normal');
      expect(ord?.status).toBe(OrderStatus.REVISION_REQUIRED);
    });
  });
});
