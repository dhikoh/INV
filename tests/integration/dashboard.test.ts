import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import {
  Role,
  OrderStatus,
  InvoiceStatus,
  PaymentStatus,
  ReminderStatus,
  CommissionStatus,
  CommissionMode,
} from '@prisma/client';
import * as contextModule from '@/lib/auth/context';
import type { Ctx } from '@/lib/auth/context';
import { assertNoSecretKeys } from '../helpers/leak';
import { DomainError } from '@/lib/domain/money';
import { GET as getDashboardHandler } from '@/app/api/v1/dashboard/route';

// Mock in-memory DB tables
interface MockOrder {
  id: string;
  businessId: string;
  orderNo: string;
  customerId: string;
  salesId: string;
  status: OrderStatus;
  subtotal: bigint;
  discountTotal: bigint;
  goodsNet: bigint;
  grandTotal: bigint;
  cogsTotal: bigint;
  profit: bigint;
  marginBps: number;
  hasBelowMin: boolean;
  belowMinReason: string | null;
  rejectReason: string | null;
  items?: Array<{ qty: number; lineNet: bigint; costPrice: bigint }>;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

interface MockInvoice {
  id: string;
  businessId: string;
  orderId: string;
  customerId: string;
  number: string;
  amount: bigint;
  paidAmount: bigint;
  status: InvoiceStatus;
  dueDate: Date | null;
  createdAt: Date;
  deletedAt: Date | null;
}

interface MockPayment {
  id: string;
  businessId: string;
  orderId: string;
  amount: bigint;
  status: PaymentStatus;
  method: string;
  proofPath: string | null;
  createdAt: Date;
}

interface MockProduct {
  id: string;
  businessId: string;
  sku: string;
  name: string;
  unit: string;
  stockQty: number;
  reservedQty: number;
  minStockAlert: number;
  isActive: boolean;
  deletedAt: Date | null;
}

interface MockCustomer {
  id: string;
  businessId: string;
  code: string;
  name: string;
  phone: string | null;
  assignedSalesId: string | null;
  deletedAt: Date | null;
}

interface MockReminder {
  id: string;
  businessId: string;
  customerId: string;
  salesId: string;
  status: ReminderStatus;
  intervalDays: number;
  lastOrderDate: Date;
  nextDueDate: Date;
  snoozedUntil: Date | null;
  note: string | null;
}

interface MockCrmTask {
  id: string;
  businessId: string;
  customerId: string;
  assignedToId: string;
  title: string;
  dueAt: Date;
  doneAt: Date | null;
}

interface MockSalesTarget {
  id: string;
  businessId: string;
  salesId: string;
  month: string;
  targetRevenue: bigint;
  targetProfit: bigint;
}

interface MockCommissionEntry {
  id: string;
  businessId: string;
  orderId: string;
  salesId: string;
  mode: CommissionMode;
  basisAmount: bigint;
  rateBps: number;
  amount: bigint;
  status: CommissionStatus;
  earnedAt: Date;
}

interface MockUser {
  id: string;
  businessId: string | null;
  name: string;
  username: string;
  role: Role;
  isActive: boolean;
  deletedAt: Date | null;
}

let mockOrders: MockOrder[] = [];
let mockInvoices: MockInvoice[] = [];
let mockPayments: MockPayment[] = [];
let mockProducts: MockProduct[] = [];
let mockCustomers: MockCustomer[] = [];
let mockReminders: MockReminder[] = [];
let mockCrmTasks: MockCrmTask[] = [];
let mockSalesTargets: MockSalesTarget[] = [];
let mockCommissions: MockCommissionEntry[] = [];
let mockUsers: MockUser[] = [];

// Mock DB
interface OrderWhere {
  businessId?: string;
  deletedAt?: null;
  id?: { in?: string[] };
  salesId?: string;
  status?: OrderStatus | { in?: OrderStatus[] };
  createdAt?: { gte?: Date; lte?: Date };
}

interface PaymentWhere {
  businessId?: string;
  status?: PaymentStatus;
}

interface ProductWhere {
  businessId?: string;
  isActive?: boolean;
  deletedAt?: null;
}

interface CustomerWhere {
  businessId?: string;
  deletedAt?: null;
  assignedSalesId?: string | null;
}

interface InvoiceWhere {
  businessId?: string;
  deletedAt?: null;
  status?: InvoiceStatus | { notIn?: InvoiceStatus[] };
  dueDate?: { lt?: Date; lte?: Date };
  customerId?: { in?: string[] };
  order?: { salesId?: string };
}

interface ReminderOrCondition {
  nextDueDate?: { lte?: Date };
  snoozedUntil?: { lte?: Date };
}

interface ReminderWhere {
  businessId?: string;
  salesId?: string;
  status?: ReminderStatus;
  OR?: ReminderOrCondition[];
}

interface CrmTaskWhere {
  businessId?: string;
  assignedToId?: string;
  doneAt?: null;
  dueAt?: { lte?: Date };
}

interface SalesTargetWhere {
  businessId?: string;
  salesId?: string;
  month?: string;
}

interface CommissionWhere {
  businessId?: string;
  salesId?: string;
  status?: { in?: CommissionStatus[] };
  earnedAt?: { gte?: Date; lte?: Date };
}

interface UserWhere {
  businessId?: string;
  role?: Role;
  isActive?: boolean;
  deletedAt?: null;
}

vi.mock('@/lib/db', () => {
  const mockPrisma = {
    order: {
      count: vi.fn(async ({ where }: { where: OrderWhere }) => {
        return mockOrders.filter((o) => {
          if (where.businessId && o.businessId !== where.businessId) return false;
          if (where.deletedAt === null && o.deletedAt !== null) return false;
          if (where.salesId && o.salesId !== where.salesId) return false;
          if (where.status) {
            if (typeof where.status === 'object' && where.status.in) {
              if (!where.status.in.includes(o.status)) return false;
            } else if (o.status !== where.status) {
              return false;
            }
          }
          return true;
        }).length;
      }),
      findMany: vi.fn(async ({ where, take }: { where: OrderWhere; select?: Record<string, unknown>; take?: number }) => {
        const filtered = mockOrders.filter((o) => {
          if (where.businessId && o.businessId !== where.businessId) return false;
          if (where.deletedAt === null && o.deletedAt !== null) return false;
          if (where.id?.in && !where.id.in.includes(o.id)) return false;
          if (where.salesId && o.salesId !== where.salesId) return false;
          if (where.status) {
            if (typeof where.status === 'object' && where.status.in) {
              if (!where.status.in.includes(o.status)) return false;
            } else if (o.status !== where.status) {
              return false;
            }
          }
          if (where.createdAt?.gte && o.createdAt < where.createdAt.gte) return false;
          if (where.createdAt?.lte && o.createdAt > where.createdAt.lte) return false;
          return true;
        });

        const sliced = take ? filtered.slice(0, take) : filtered;
        return sliced.map((o) => {
          const cust = mockCustomers.find((c) => c.id === o.customerId) || { id: o.customerId, name: 'Customer', code: 'CUST-0' };
          const sales = mockUsers.find((u) => u.id === o.salesId) || { id: o.salesId, name: 'Sales' };
          return {
            ...o,
            customer: cust,
            sales,
          };
        });
      }),
    },
    payment: {
      count: vi.fn(async ({ where }: { where: PaymentWhere }) => {
        return mockPayments.filter((p) => {
          if (where.businessId && p.businessId !== where.businessId) return false;
          if (where.status && p.status !== where.status) return false;
          return true;
        }).length;
      }),
      findMany: vi.fn(async ({ where, take }: { where: PaymentWhere; take?: number }) => {
        const filtered = mockPayments.filter((p) => {
          if (where.businessId && p.businessId !== where.businessId) return false;
          if (where.status && p.status !== where.status) return false;
          return true;
        });
        const sliced = take ? filtered.slice(0, take) : filtered;
        return sliced.map((p) => {
          const ord = mockOrders.find((o) => o.id === p.orderId);
          const cust = ord ? mockCustomers.find((c) => c.id === ord.customerId) : null;
          return {
            ...p,
            method: p.method,
            order: {
              orderNo: ord?.orderNo || 'ORD-000',
              customer: { name: cust?.name || 'Customer' },
            },
          };
        });
      }),
    },
    product: {
      findMany: vi.fn(async ({ where }: { where: ProductWhere }) => {
        return mockProducts.filter((p) => {
          if (where.businessId && p.businessId !== where.businessId) return false;
          if (where.isActive !== undefined && p.isActive !== where.isActive) return false;
          if (where.deletedAt === null && p.deletedAt !== null) return false;
          return true;
        });
      }),
    },
    customer: {
      findMany: vi.fn(async ({ where }: { where: CustomerWhere }) => {
        return mockCustomers.filter((c) => {
          if (where.businessId && c.businessId !== where.businessId) return false;
          if (where.deletedAt === null && c.deletedAt !== null) return false;
          if (where.assignedSalesId && c.assignedSalesId !== where.assignedSalesId) return false;
          return true;
        });
      }),
      count: vi.fn(async ({ where }: { where: CustomerWhere }) => {
        return mockCustomers.filter((c) => {
          if (where.businessId && c.businessId !== where.businessId) return false;
          if (where.deletedAt === null && c.deletedAt !== null) return false;
          if (where.assignedSalesId === null && c.assignedSalesId !== null) return false;
          if (where.assignedSalesId && c.assignedSalesId !== where.assignedSalesId) return false;
          return true;
        }).length;
      }),
    },
    invoice: {
      findMany: vi.fn(async ({ where, take }: { where: InvoiceWhere; take?: number }) => {
        const filtered = mockInvoices.filter((inv) => {
          if (where.businessId && inv.businessId !== where.businessId) return false;
          if (where.deletedAt === null && inv.deletedAt !== null) return false;
          if (where.status) {
            if (typeof where.status === 'string') {
              if (inv.status !== where.status) return false;
            } else if (where.status.notIn && where.status.notIn.includes(inv.status)) {
              return false;
            }
          }
          if (where.dueDate?.lt && (!inv.dueDate || inv.dueDate >= where.dueDate.lt)) return false;
          if (where.dueDate?.lte && (!inv.dueDate || inv.dueDate > where.dueDate.lte)) return false;
          if (where.customerId?.in && !where.customerId.in.includes(inv.customerId)) return false;
          if (where.order?.salesId) {
            const ord = mockOrders.find((o) => o.id === inv.orderId);
            if (!ord || ord.salesId !== where.order.salesId) return false;
          }
          return true;
        });
        const sliced = take ? filtered.slice(0, take) : filtered;
        return sliced.map((inv) => {
          const ord = mockOrders.find((o) => o.id === inv.orderId);
          const cust = ord ? mockCustomers.find((c) => c.id === ord.customerId) : null;
          return {
            ...inv,
            order: {
              id: ord?.id || inv.orderId,
              orderNo: ord?.orderNo || 'ORD-000',
              customer: {
                id: cust?.id || 'cust-0',
                name: cust?.name || 'Customer',
                phone: cust?.phone || null,
              },
            },
          };
        });
      }),
    },
    reminder: {
      findMany: vi.fn(async ({ where, take }: { where: ReminderWhere; take?: number }) => {
        const filtered = mockReminders.filter((r) => {
          if (where.businessId && r.businessId !== where.businessId) return false;
          if (where.salesId && r.salesId !== where.salesId) return false;
          if (where.status && r.status !== where.status) return false;
          if (where.OR) {
            const matches = where.OR.some((cond: ReminderOrCondition) => {
              if (cond.nextDueDate?.lte && r.nextDueDate <= cond.nextDueDate.lte) return true;
              if (cond.snoozedUntil?.lte && r.snoozedUntil && r.snoozedUntil <= cond.snoozedUntil.lte) return true;
              return false;
            });
            if (!matches) return false;
          }
          return true;
        });
        const sliced = take ? filtered.slice(0, take) : filtered;
        return sliced.map((r) => {
          const cust = mockCustomers.find((c) => c.id === r.customerId) || { id: r.customerId, name: 'Customer', phone: '0812' };
          return {
            ...r,
            customer: cust,
          };
        });
      }),
    },
    crmTask: {
      findMany: vi.fn(async ({ where, take }: { where: CrmTaskWhere; take?: number }) => {
        const filtered = mockCrmTasks.filter((t) => {
          if (where.businessId && t.businessId !== where.businessId) return false;
          if (where.assignedToId && t.assignedToId !== where.assignedToId) return false;
          if (where.doneAt === null && t.doneAt !== null) return false;
          if (where.dueAt?.lte && t.dueAt > where.dueAt.lte) return false;
          return true;
        });
        const sliced = take ? filtered.slice(0, take) : filtered;
        return sliced.map((t) => {
          const cust = mockCustomers.find((c) => c.id === t.customerId) || { id: t.customerId, name: 'Customer', phone: '0812' };
          return {
            ...t,
            customer: cust,
          };
        });
      }),
    },
    salesTarget: {
      findFirst: vi.fn(async ({ where }: { where: SalesTargetWhere }) => {
        return (
          mockSalesTargets.find((st) => {
            if (where.businessId && st.businessId !== where.businessId) return false;
            if (where.salesId && st.salesId !== where.salesId) return false;
            if (where.month && st.month !== where.month) return false;
            return true;
          }) || null
        );
      }),
    },
    commissionEntry: {
      aggregate: vi.fn(async ({ where }: { where: CommissionWhere }) => {
        const filtered = mockCommissions.filter((c) => {
          if (where.businessId && c.businessId !== where.businessId) return false;
          if (where.salesId && c.salesId !== where.salesId) return false;
          if (where.status?.in && !where.status.in.includes(c.status)) return false;
          if (where.earnedAt?.gte && c.earnedAt < where.earnedAt.gte) return false;
          if (where.earnedAt?.lte && c.earnedAt > where.earnedAt.lte) return false;
          return true;
        });
        const total = filtered.reduce((acc, curr) => acc + curr.amount, 0n);
        return {
          _sum: {
            amount: total,
          },
        };
      }),
    },
    user: {
      findMany: vi.fn(async ({ where }: { where: UserWhere }) => {
        return mockUsers.filter((u) => {
          if (where.businessId && u.businessId !== where.businessId) return false;
          if (where.role && u.role !== where.role) return false;
          if (where.isActive !== undefined && u.isActive !== where.isActive) return false;
          if (where.deletedAt === null && u.deletedAt !== null) return false;
          return true;
        });
      }),
    },
  };
  return { prisma: mockPrisma };
});

type MockAuthCtx = Ctx & {
  businessId: string;
  user: Ctx['user'] & { username: string; mustChangePassword: boolean };
};

describe('T5.1: Operasional Dashboard Bisnis (Seksi 11 & 17.3 nomor 21)', () => {
  const BIZ_ID = 'biz_dash_01';
  const SALES_1_ID = 'sales_usr_01';
  const SALES_2_ID = 'sales_usr_02';
  const SUPERADMIN_ID = 'sa_usr_01';

  const superAdminCtx: MockAuthCtx = {
    user: { id: SUPERADMIN_ID, name: 'Pak Boss', username: 'owner', role: Role.SUPERADMIN, businessId: BIZ_ID, mustChangePassword: false },
    role: Role.SUPERADMIN,
    businessId: BIZ_ID,
    sessionId: 'sess_sa',
    ip: '127.0.0.1',
  };

  const sales1Ctx: MockAuthCtx = {
    user: { id: SALES_1_ID, name: 'Sales Budi', username: 'budi', role: Role.SALES, businessId: BIZ_ID, mustChangePassword: false },
    role: Role.SALES,
    businessId: BIZ_ID,
    sessionId: 'sess_sales1',
    ip: '127.0.0.1',
  };

  const sales2Ctx: MockAuthCtx = {
    user: { id: SALES_2_ID, name: 'Sales Siti', username: 'siti', role: Role.SALES, businessId: BIZ_ID, mustChangePassword: false },
    role: Role.SALES,
    businessId: BIZ_ID,
    sessionId: 'sess_sales2',
    ip: '127.0.0.1',
  };

  let activeCtx: MockAuthCtx = superAdminCtx;

  beforeEach(() => {
    mockOrders = [];
    mockInvoices = [];
    mockPayments = [];
    mockProducts = [];
    mockCustomers = [];
    mockReminders = [];
    mockCrmTasks = [];
    mockSalesTargets = [];
    mockCommissions = [];
    mockUsers = [];

    // Setup initial users
    mockUsers.push(
      { id: SUPERADMIN_ID, businessId: BIZ_ID, name: 'Pak Boss', username: 'owner', role: Role.SUPERADMIN, isActive: true, deletedAt: null },
      { id: SALES_1_ID, businessId: BIZ_ID, name: 'Sales Budi', username: 'budi', role: Role.SALES, isActive: true, deletedAt: null },
      { id: SALES_2_ID, businessId: BIZ_ID, name: 'Sales Siti', username: 'siti', role: Role.SALES, isActive: true, deletedAt: null }
    );

    // Setup customers
    mockCustomers.push(
      { id: 'cust_1', businessId: BIZ_ID, code: 'CUST-001', name: 'Toko Petshop Jaya', phone: '0812345678', assignedSalesId: SALES_1_ID, deletedAt: null },
      { id: 'cust_2', businessId: BIZ_ID, code: 'CUST-002', name: 'Klinik Satwa Mandiri', phone: '0812987654', assignedSalesId: SALES_2_ID, deletedAt: null },
      { id: 'cust_orphan', businessId: BIZ_ID, code: 'CUST-003', name: 'Pet Center Blitar', phone: '0812112233', assignedSalesId: null, deletedAt: null } // Unassigned customer
    );

    // Setup products (normal, negative stock, and low stock alert)
    mockProducts.push(
      { id: 'prod_1', businessId: BIZ_ID, sku: 'CAT-01', name: 'Cat Food Salmon 1kg', unit: 'pack', stockQty: 100, reservedQty: 10, minStockAlert: 20, isActive: true, deletedAt: null },
      { id: 'prod_minus', businessId: BIZ_ID, sku: 'CAT-MINUS', name: 'Pasir Gumpal 10L', unit: 'sak', stockQty: 2, reservedQty: 5, minStockAlert: 10, isActive: true, deletedAt: null }, // Available = -3 (Stok Minus!)
      { id: 'prod_low', businessId: BIZ_ID, sku: 'CAT-LOW', name: 'Snack Kucing Creamy', unit: 'pcs', stockQty: 8, reservedQty: 2, minStockAlert: 10, isActive: true, deletedAt: null } // Available = 6 <= 10 (Stok Menipis!)
    );

    // Context mock
    activeCtx = superAdminCtx;
    vi.spyOn(contextModule, 'requireContext').mockImplementation(async (_req, roles) => {
      if (roles && roles.length > 0 && !roles.includes(activeCtx.role)) {
        throw new DomainError('FORBIDDEN', 'Akses ditolak', 403);
      }
      return activeCtx;
    });
    vi.spyOn(contextModule, 'requireBusiness').mockImplementation(() => activeCtx.businessId);
  });

  describe('1. Dashboard Super Admin (DTO Lengkap Operasional & Keuangan)', () => {
    beforeEach(() => {
      const now = new Date();

      // Buat order pending approval (antrean approval)
      mockOrders.push({
        id: 'ord_sub_1',
        businessId: BIZ_ID,
        orderNo: 'KODE/ORD/0001',
        customerId: 'cust_1',
        salesId: SALES_1_ID,
        status: OrderStatus.PENDING_APPROVAL,
        subtotal: 1500000n,
        discountTotal: 50000n,
        goodsNet: 1450000n,
        grandTotal: 1450000n,
        cogsTotal: 1000000n,
        profit: 450000n,
        marginBps: 3103,
        hasBelowMin: true,
        belowMinReason: 'Permintaan diskon kuantiti besar',
        rejectReason: null,
        items: [{ qty: 10, lineNet: 1450000n, costPrice: 100000n }],
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      });

      // Buat pembayaran pending verifikasi
      mockPayments.push({
        id: 'pay_pend_1',
        businessId: BIZ_ID,
        orderId: 'ord_sub_1',
        amount: 500000n,
        status: PaymentStatus.PENDING_VERIFICATION,
        method: 'TRANSFER',
        proofPath: 'proofs/transfer-1.jpg',
        createdAt: now,
      });

      // Buat order approved bulan ini untuk omzet & profit
      mockOrders.push({
        id: 'ord_app_1',
        businessId: BIZ_ID,
        orderNo: 'KODE/ORD/0002',
        customerId: 'cust_2',
        salesId: SALES_2_ID,
        status: OrderStatus.COMPLETED,
        subtotal: 2000000n,
        discountTotal: 0n,
        goodsNet: 2000000n,
        grandTotal: 2000000n,
        cogsTotal: 1400000n,
        profit: 600000n,
        marginBps: 3000,
        hasBelowMin: false,
        belowMinReason: null,
        rejectReason: null,
        items: [{ qty: 20, lineNet: 2000000n, costPrice: 70000n }],
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      });

      // Buat piutang jatuh tempo (overdue)
      const pastDue = new Date(now.getTime() - 5 * 86_400_000); // 5 hari lalu
      mockInvoices.push({
        id: 'inv_overdue_1',
        businessId: BIZ_ID,
        orderId: 'ord_app_1',
        customerId: 'cust_2',
        number: 'KODE/INV/0001-LNS',
        amount: 2000000n,
        paidAmount: 500000n, // sisa 1.500.000
        status: InvoiceStatus.APPROVED,
        dueDate: pastDue,
        createdAt: pastDue,
        deletedAt: null,
      });
    });

    it('mengembalikan antrean persetujuan, pembayaran pending, stok minus, piutang overdue, omzet dan profit', async () => {
      activeCtx = superAdminCtx;
      const req = new NextRequest('http://localhost/api/v1/dashboard');
      const res = await getDashboardHandler(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);
      expect(json.data.role).toBe(Role.SUPERADMIN);

      // Verifikasi Summary Antrean & Alert
      expect(json.data.summary.pendingApprovalsCount).toBe(1);
      expect(json.data.summary.pendingPaymentsCount).toBe(1);
      expect(json.data.summary.negativeStockCount).toBe(1); // prod_minus
      expect(json.data.summary.lowStockCount).toBe(1); // prod_low
      expect(json.data.summary.overdueInvoicesCount).toBe(1);
      expect(json.data.summary.overdueAmount).toBe(1500000);
      expect(json.data.summary.unassignedCustomersCount).toBe(1); // cust_orphan

      // Verifikasi Metrik Keuangan Bulan Ini
      expect(json.data.monthlyMetrics.orderCount).toBe(1); // Hanya ord_app_1 yang COMPLETED/APPROVED
      expect(json.data.monthlyMetrics.netRevenue).toBe(2000000);
      expect(json.data.monthlyMetrics.cogs).toBe(1400000);
      expect(json.data.monthlyMetrics.netProfit).toBe(600000);
      expect(json.data.monthlyMetrics.marginBps).toBe(3000);

      // Verifikasi Rincian Action Items
      expect(json.data.actionItems.pendingApprovals).toHaveLength(1);
      expect(json.data.actionItems.pendingApprovals[0].hasBelowMin).toBe(true);
      expect(json.data.actionItems.pendingApprovals[0].belowMinReason).toBe('Permintaan diskon kuantiti besar');

      expect(json.data.actionItems.pendingPayments).toHaveLength(1);
      expect(json.data.actionItems.pendingPayments[0].proofPath).toBe('proofs/transfer-1.jpg');

      // Verifikasi Leaderboard
      expect(json.data.leaderboard).toHaveLength(2);
      expect(json.data.leaderboard[0].salesId).toBe(SALES_2_ID);
      expect(json.data.leaderboard[0].revenue).toBe(2000000);
      expect(json.data.leaderboard[0].profit).toBe(600000);
    });
  });

  describe('2. Dashboard Sales (Fokus Hari Ini & STRICT ZERO-LEAKAGE)', () => {
    beforeEach(() => {
      const now = new Date();
      const pastDue = new Date(now.getTime() - 2 * 86_400_000);

      // Pengingat repeat order hari ini untuk Sales 1
      mockReminders.push({
        id: 'rem_1',
        businessId: BIZ_ID,
        customerId: 'cust_1',
        salesId: SALES_1_ID,
        status: ReminderStatus.ACTIVE,
        intervalDays: 14,
        lastOrderDate: pastDue,
        nextDueDate: now,
        snoozedUntil: null,
        note: 'Customer rutin order cat salmon',
      });

      // Pengingat Sales 2 (tidak boleh terlihat oleh Sales 1)
      mockReminders.push({
        id: 'rem_2',
        businessId: BIZ_ID,
        customerId: 'cust_2',
        salesId: SALES_2_ID,
        status: ReminderStatus.ACTIVE,
        intervalDays: 30,
        lastOrderDate: pastDue,
        nextDueDate: now,
        snoozedUntil: null,
        note: 'Customer sales 2',
      });

      // Tugas CRM Sales 1
      mockCrmTasks.push({
        id: 'task_1',
        businessId: BIZ_ID,
        customerId: 'cust_1',
        assignedToId: SALES_1_ID,
        title: 'Follow up penawaran katalog baru',
        dueAt: now,
        doneAt: null,
      });

      // Order Sales 1 yang ditolak (REVISION_REQUIRED) dengan alasan penolakan
      mockOrders.push({
        id: 'ord_rejected',
        businessId: BIZ_ID,
        orderNo: 'KODE/ORD/0003',
        customerId: 'cust_1',
        salesId: SALES_1_ID,
        status: OrderStatus.REVISION_REQUIRED,
        subtotal: 1000000n,
        discountTotal: 0n,
        goodsNet: 1000000n,
        grandTotal: 1000000n,
        cogsTotal: 700000n,
        profit: 300000n,
        marginBps: 3000,
        hasBelowMin: true,
        belowMinReason: 'Minta diskon',
        rejectReason: 'Margin terlalu tipis, naikkan harga 10%',
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      });

      // Order Sales 1 yang selesai bulan ini
      mockOrders.push({
        id: 'ord_sales1_done',
        businessId: BIZ_ID,
        orderNo: 'KODE/ORD/0004',
        customerId: 'cust_1',
        salesId: SALES_1_ID,
        status: OrderStatus.COMPLETED,
        subtotal: 5000000n,
        discountTotal: 0n,
        goodsNet: 5000000n,
        grandTotal: 5000000n,
        cogsTotal: 3500000n,
        profit: 1500000n,
        marginBps: 3000,
        hasBelowMin: false,
        belowMinReason: null,
        rejectReason: null,
        items: [{ qty: 50, lineNet: 5000000n, costPrice: 70000n }],
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      });

      // Target sales bulan ini: 10.000.000
      const currentMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      mockSalesTargets.push({
        id: 'target_1',
        businessId: BIZ_ID,
        salesId: SALES_1_ID,
        month: currentMonthStr,
        targetRevenue: 10000000n,
        targetProfit: 3000000n,
      });

      // Komisi sales 1 yang didapat bulan ini: 250.000
      mockCommissions.push({
        id: 'comm_1',
        businessId: BIZ_ID,
        orderId: 'ord_sales1_done',
        salesId: SALES_1_ID,
        mode: CommissionMode.PERCENT_OF_REVENUE,
        basisAmount: 5000000n,
        rateBps: 500, // 5%
        amount: 250000n,
        status: CommissionStatus.EARNED,
        earnedAt: now,
      });

      // Faktur jatuh tempo customer sales 1
      mockInvoices.push({
        id: 'inv_cust1',
        businessId: BIZ_ID,
        orderId: 'ord_sales1_done',
        customerId: 'cust_1',
        number: 'KODE/INV/0004-LNS',
        amount: 5000000n,
        paidAmount: 2000000n, // sisa 3.000.000
        status: InvoiceStatus.APPROVED,
        dueDate: now,
        createdAt: now,
        deletedAt: null,
      });
    });

    it('Sales menerima fokus Hari Ini (pengingat, tugas CRM, order ditolak dengan alasan penolakan, piutang customer)', async () => {
      activeCtx = sales1Ctx;
      const req = new NextRequest('http://localhost/api/v1/dashboard');
      const res = await getDashboardHandler(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);
      expect(json.data.role).toBe(Role.SALES);

      // Verifikasi pengingat & CRM Sales 1 saja
      expect(json.data.todayFocus.remindersCount).toBe(1);
      expect(json.data.todayFocus.reminders[0].id).toBe('rem_1');
      expect(json.data.todayFocus.tasksCount).toBe(1);
      expect(json.data.todayFocus.tasks[0].title).toBe('Follow up penawaran katalog baru');

      // Verifikasi order approval alerts (ada alasan penolakan jelas)
      expect(json.data.todayFocus.approvalAlertsCount).toBe(1);
      expect(json.data.todayFocus.orderApprovals[0].orderNo).toBe('KODE/ORD/0003');
      expect(json.data.todayFocus.orderApprovals[0].status).toBe(OrderStatus.REVISION_REQUIRED);
      expect(json.data.todayFocus.orderApprovals[0].rejectReason).toBe('Margin terlalu tipis, naikkan harga 10%');

      // Verifikasi piutang customernya
      expect(json.data.todayFocus.dueReceivablesCount).toBe(1);
      expect(json.data.todayFocus.dueReceivables[0].balanceDue).toBe(3000000);

      // Verifikasi performa pribadi
      expect(json.data.performance.revenue).toBe(5000000);
      expect(json.data.performance.targetRevenue).toBe(10000000);
      expect(json.data.performance.achievementPercent).toBe(50); // 5jt / 10jt = 50%
      expect(json.data.performance.estimatedCommission).toBe(250000);
      expect(json.data.performance.myCustomersCount).toBe(1);
    });

    it('STRICT ZERO-LEAKAGE: DTO dashboard sales tidak memuat HPP, profit, margin, atau kunci rahasia apa pun (Seksi 17.4 a)', async () => {
      activeCtx = sales1Ctx;
      const req = new NextRequest('http://localhost/api/v1/dashboard');
      const res = await getDashboardHandler(req);
      const json = await res.json();

      // Gunakan helper leak detection
      assertNoSecretKeys(json);

      // Stringified check
      const rawString = JSON.stringify(json);
      expect(rawString).not.toContain('cogs');
      expect(rawString).not.toContain('profit');
      expect(rawString).not.toContain('margin');
      expect(rawString).not.toContain('costPrice');
      expect(rawString).not.toContain('hpp');
      expect(rawString).not.toContain('targetProfit');
      expect(rawString).not.toContain('1500000'); // angka profit dari ord_sales1_done tidak boleh bocor!
    });

    it('ISOLASI SALES: Sales 2 tidak melihat data aktivitas dan order milik Sales 1', async () => {
      activeCtx = sales2Ctx;
      const req = new NextRequest('http://localhost/api/v1/dashboard');
      const res = await getDashboardHandler(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.data.todayFocus.remindersCount).toBe(1);
      expect(json.data.todayFocus.reminders[0].id).toBe('rem_2'); // Milik sales 2
      expect(json.data.todayFocus.tasksCount).toBe(0); // Task sales 1 tidak terlihat
      expect(json.data.todayFocus.approvalAlertsCount).toBe(0); // Order rejected sales 1 tidak terlihat
    });
  });
});
