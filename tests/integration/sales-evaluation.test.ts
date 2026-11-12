import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import {
  Role,
  OrderStatus,
  CommissionMode,
  CommissionStatus,
  PipelineStage,
  DiscountSource,
} from '@prisma/client';
import * as contextModule from '@/lib/auth/context';
import { DomainError } from '@/lib/domain/money';

// Handlers
import {
  GET as getSalesNotesHandler,
  POST as createSalesNoteHandler,
} from '@/app/api/v1/sales/[id]/notes/route';
import {
  GET as getSalesTargetHandler,
  PUT as setSalesTargetHandler,
} from '@/app/api/v1/sales/[id]/targets/[month]/route';
import { GET as getSalesPerformanceReportHandler } from '@/app/api/v1/reports/sales-performance/route';
import { GET as getCommissionReportHandler } from '@/app/api/v1/reports/commissions/route';
import { POST as payCommissionHandler } from '@/app/api/v1/commissions/[id]/pay/route';

interface MockUser {
  id: string;
  businessId: string;
  name: string;
  username: string;
  role: Role;
  deletedAt: Date | null;
}

interface MockSalesTarget {
  id: string;
  businessId: string;
  salesId: string;
  month: string;
  targetRevenue: bigint;
  targetProfit: bigint;
  createdAt: Date;
  updatedAt: Date;
}

interface MockOwnerSalesNote {
  id: string;
  businessId: string;
  salesId: string;
  authorId: string;
  note: string;
  createdAt: Date;
  updatedAt: Date;
}

interface MockCustomer {
  id: string;
  businessId: string;
  name: string;
  assignedSalesId: string | null;
  pipelineStage: PipelineStage;
  deletedAt: Date | null;
}

interface MockOrder {
  id: string;
  businessId: string;
  orderNo: string;
  customerId: string;
  salesId: string;
  status: OrderStatus;
  orderDate: Date;
  shippingCharge: bigint;
  rejectReason?: string | null;
  createdAt: Date;
  deletedAt: Date | null;
  items: Array<{
    id: string;
    qty: number;
    costPrice: bigint;
    unitPrice: bigint;
    lineNet: bigint;
    discountSource: DiscountSource;
    lineDiscount: bigint;
  }>;
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
  paidAt: Date | null;
  reversedAt: Date | null;
  note: string | null;
}

interface MockAuditLog {
  [key: string]: unknown;
}

interface MockCustomerTask {
  businessId: string;
  assignedToId: string;
  [key: string]: unknown;
}

interface MockCustomerInteraction {
  businessId: string;
  salesId: string;
  [key: string]: unknown;
}

interface MockReminder {
  businessId: string;
  userId?: string;
  status?: string;
  [key: string]: unknown;
}

interface SalesEvalWhereFilter {
  id?: string | { in?: string[] };
  businessId?: string;
  role?: Role;
  deletedAt?: null | Date;
  salesId?: string | { in?: string[] };
  month?: string;
  assignedSalesId?: string | { in?: string[] };
  createdAt?: { gte?: Date; lte?: Date };
  orderId?: string;
  status?: CommissionStatus | string;
  earnedAt?: { gte?: Date; lte?: Date };
  assignedToId?: string | { in?: string[] };
  userId?: string;
}

let mockUsers: MockUser[] = [];
let mockSalesTargets: MockSalesTarget[] = [];
let mockOwnerSalesNotes: MockOwnerSalesNote[] = [];
let mockCustomers: MockCustomer[] = [];
let mockOrders: MockOrder[] = [];
let mockCommissionEntries: MockCommissionEntry[] = [];
let mockAuditLogs: MockAuditLog[] = [];
let mockCustomerTasks: MockCustomerTask[] = [];
let mockCustomerInteractions: MockCustomerInteraction[] = [];
let mockReminders: MockReminder[] = [];

let idCounter = 1;

vi.mock('@/lib/db', () => {
  const mockPrisma = {
    user: {
      findFirst: vi.fn(async ({ where }: { where: SalesEvalWhereFilter }) => {
        return (
          mockUsers.find((u) => {
            if (where.id && u.id !== where.id) return false;
            if (where.businessId && u.businessId !== where.businessId) return false;
            if (where.role && u.role !== where.role) return false;
            if (where.deletedAt === null && u.deletedAt !== null) return false;
            return true;
          }) || null
        );
      }),
      findUnique: vi.fn(async ({ where }: { where: SalesEvalWhereFilter }) => {
        return mockUsers.find((u) => u.id === where.id) || null;
      }),
      findMany: vi.fn(async ({ where }: { where: SalesEvalWhereFilter }) => {
        return mockUsers.filter((u) => {
          if (where.businessId && u.businessId !== where.businessId) return false;
          if (where.role && u.role !== where.role) return false;
          if (where.id && u.id !== where.id) return false;
          if (where.deletedAt === null && u.deletedAt !== null) return false;
          return true;
        });
      }),
    },
    salesTarget: {
      findFirst: vi.fn(async ({ where }: { where: SalesEvalWhereFilter }) => {
        return (
          mockSalesTargets.find((t) => {
            if (where.id && t.id !== where.id) return false;
            if (where.businessId && t.businessId !== where.businessId) return false;
            if (where.salesId && t.salesId !== where.salesId) return false;
            if (where.month && t.month !== where.month) return false;
            return true;
          }) || null
        );
      }),
      findMany: vi.fn(async ({ where }: { where: SalesEvalWhereFilter }) => {
        return mockSalesTargets.filter((t) => {
          if (where.businessId && t.businessId !== where.businessId) return false;
          if (where.month && t.month !== where.month) return false;
          if (where.salesId && typeof where.salesId === 'object' && where.salesId.in && !where.salesId.in.includes(t.salesId))
            return false;
          return true;
        });
      }),
      create: vi.fn(
        async ({
          data,
        }: {
          data: {
            businessId: string;
            salesId: string;
            month: string;
            targetRevenue: bigint | number;
            targetProfit: bigint | number;
          };
        }) => {
          const item: MockSalesTarget = {
            id: `tgt_${idCounter++}`,
            businessId: data.businessId,
            salesId: data.salesId,
            month: data.month,
            targetRevenue: BigInt(data.targetRevenue),
            targetProfit: BigInt(data.targetProfit),
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          mockSalesTargets.push(item);
          return item;
        }
      ),
      updateMany: vi.fn(
        async ({
          where,
          data,
        }: {
          where: SalesEvalWhereFilter;
          data: { targetRevenue?: bigint | number; targetProfit?: bigint | number };
        }) => {
          let count = 0;
          for (const t of mockSalesTargets) {
            if (where.id && t.id !== where.id) continue;
            if (where.businessId && t.businessId !== where.businessId) continue;
            if (data.targetRevenue !== undefined) t.targetRevenue = BigInt(data.targetRevenue);
            if (data.targetProfit !== undefined) t.targetProfit = BigInt(data.targetProfit);
            t.updatedAt = new Date();
            count++;
          }
          return { count };
        }
      ),
    },
    ownerSalesNote: {
      findMany: vi.fn(async ({ where }: { where: SalesEvalWhereFilter }) => {
        return mockOwnerSalesNotes
          .filter((n) => {
            if (where.businessId && n.businessId !== where.businessId) return false;
            if (where.salesId && n.salesId !== where.salesId) return false;
            return true;
          })
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      }),
      create: vi.fn(
        async ({
          data,
        }: {
          data: { businessId: string; salesId: string; authorId: string; note: string };
        }) => {
          const item: MockOwnerSalesNote = {
            id: `note_${idCounter++}`,
            businessId: data.businessId,
            salesId: data.salesId,
            authorId: data.authorId,
            note: data.note,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          mockOwnerSalesNotes.push(item);
          return item;
        }
      ),
    },
    customer: {
      findMany: vi.fn(async ({ where }: { where: SalesEvalWhereFilter }) => {
        return mockCustomers.filter((c) => {
          if (where.businessId && c.businessId !== where.businessId) return false;
          if (
            where.assignedSalesId &&
            typeof where.assignedSalesId === 'object' &&
            where.assignedSalesId.in &&
            (!c.assignedSalesId || !where.assignedSalesId.in.includes(c.assignedSalesId))
          )
            return false;
          if (typeof where.assignedSalesId === 'string' && c.assignedSalesId !== where.assignedSalesId)
            return false;
          if (where.deletedAt === null && c.deletedAt !== null) return false;
          return true;
        });
      }),
    },
    order: {
      findFirst: vi.fn(async ({ where }: { where: SalesEvalWhereFilter }) => {
        return (
          mockOrders.find((o) => {
            if (where.id && o.id !== where.id) return false;
            if (where.businessId && o.businessId !== where.businessId) return false;
            return true;
          }) || null
        );
      }),
      findMany: vi.fn(async ({ where }: { where: SalesEvalWhereFilter }) => {
        return mockOrders
          .filter((o) => {
            if (where.businessId && o.businessId !== where.businessId) return false;
            if (where.deletedAt === null && o.deletedAt !== null) return false;
            if (
              where.salesId &&
              typeof where.salesId === 'object' &&
              where.salesId.in &&
              !where.salesId.in.includes(o.salesId)
            )
              return false;
            if (typeof where.salesId === 'string' && o.salesId !== where.salesId) return false;
            if (
              where.id &&
              typeof where.id === 'object' &&
              where.id.in &&
              !where.id.in.includes(o.id)
            )
              return false;
            if (where.createdAt?.gte && o.createdAt < where.createdAt.gte) return false;
            if (where.createdAt?.lte && o.createdAt > where.createdAt.lte) return false;
            return true;
          })
          .map((o) => {
            const cust = mockCustomers.find((c) => c.id === o.customerId) || {
              id: o.customerId,
              name: 'Customer Dummy',
            };
            return {
              ...o,
              customer: cust,
            };
          });
      }),
    },
    orderItem: {
      findMany: vi.fn(async ({ where }: { where: SalesEvalWhereFilter }) => {
        const ord = mockOrders.find((o) => o.id === where.orderId);
        return ord ? ord.items : [];
      }),
    },
    creditNote: {
      findMany: vi.fn(async () => []),
    },
    shipment: {
      findFirst: vi.fn(async () => null),
      findMany: vi.fn(async () => []),
    },
    orderCost: {
      findMany: vi.fn(async () => []),
    },
    commissionEntry: {
      findFirst: vi.fn(async ({ where }: { where: SalesEvalWhereFilter }) => {
        return (
          mockCommissionEntries.find((c) => {
            if (where.id && c.id !== where.id) return false;
            if (where.businessId && c.businessId !== where.businessId) return false;
            return true;
          }) || null
        );
      }),
      findMany: vi.fn(
        async ({
          where,
          skip,
          take,
        }: {
          where?: SalesEvalWhereFilter;
          skip?: number;
          take?: number;
        }) => {
          const filtered = mockCommissionEntries.filter((c) => {
            if (where?.businessId && c.businessId !== where.businessId) return false;
            if (
              where?.salesId &&
              typeof where.salesId === 'object' &&
              where.salesId.in &&
              !where.salesId.in.includes(c.salesId)
            )
              return false;
            if (typeof where?.salesId === 'string' && c.salesId !== where.salesId) return false;
            if (where?.status && c.status !== where.status) return false;
            if (where?.earnedAt?.gte && c.earnedAt < where.earnedAt.gte) return false;
            if (where?.earnedAt?.lte && c.earnedAt > where.earnedAt.lte) return false;
            return true;
          });

          if (skip !== undefined && take !== undefined) {
            return filtered.slice(skip, skip + take);
          }
          return filtered;
        }
      ),
      count: vi.fn(async ({ where }: { where?: SalesEvalWhereFilter }) => {
        return mockCommissionEntries.filter((c) => {
          if (where?.businessId && c.businessId !== where.businessId) return false;
          if (
            where?.salesId &&
            typeof where.salesId === 'object' &&
            where.salesId.in &&
            !where.salesId.in.includes(c.salesId)
          )
            return false;
          if (typeof where?.salesId === 'string' && c.salesId !== where.salesId) return false;
          if (where?.status && c.status !== where.status) return false;
          if (where?.earnedAt?.gte && c.earnedAt < where.earnedAt.gte) return false;
          if (where?.earnedAt?.lte && c.earnedAt > where.earnedAt.lte) return false;
          return true;
        }).length;
      }),
      updateMany: vi.fn(
        async ({
          where,
          data,
        }: {
          where: SalesEvalWhereFilter;
          data: Partial<MockCommissionEntry>;
        }) => {
          let count = 0;
          for (const c of mockCommissionEntries) {
            if (where.id && c.id !== where.id) continue;
            if (where.businessId && c.businessId !== where.businessId) continue;
            if (data.status) c.status = data.status;
            if (data.paidAt !== undefined) c.paidAt = data.paidAt;
            if (data.note !== undefined) c.note = data.note;
            count++;
          }
          return { count };
        }
      ),
    },
    crmTask: {
      findMany: vi.fn(async ({ where }: { where?: SalesEvalWhereFilter }) => {
        return mockCustomerTasks.filter((t) => {
          if (where?.businessId && t.businessId !== where.businessId) return false;
          if (
            where?.assignedToId &&
            typeof where.assignedToId === 'object' &&
            where.assignedToId.in &&
            !where.assignedToId.in.includes(t.assignedToId)
          )
            return false;
          if (typeof where?.assignedToId === 'string' && t.assignedToId !== where.assignedToId)
            return false;
          return true;
        });
      }),
    },
    crmInteraction: {
      findMany: vi.fn(async ({ where }: { where?: SalesEvalWhereFilter }) => {
        return mockCustomerInteractions.filter((i) => {
          if (where?.businessId && i.businessId !== where.businessId) return false;
          if (
            where?.salesId &&
            typeof where.salesId === 'object' &&
            where.salesId.in &&
            !where.salesId.in.includes(i.salesId)
          )
            return false;
          if (typeof where?.salesId === 'string' && i.salesId !== where.salesId) return false;
          return true;
        });
      }),
    },
    reminder: {
      findMany: vi.fn(async ({ where }: { where?: SalesEvalWhereFilter }) => {
        return mockReminders.filter((r) => {
          if (where?.businessId && r.businessId !== where.businessId) return false;
          if (where?.userId && r.userId !== where.userId) return false;
          if (where?.status && r.status !== where.status) return false;
          return true;
        });
      }),
    },
    auditLog: {
      create: vi.fn(async ({ data }: { data: MockAuditLog }) => {
        mockAuditLogs.push(data);
        return data;
      }),
    },
    $transaction: vi.fn(async (cb: (tx: unknown) => Promise<unknown>) => {
      return cb(mockPrisma);
    }),
  };

  return { prisma: mockPrisma };
});

describe('T5.3: Evaluasi Sales, SalesTarget, OwnerSalesNote, Laporan Kinerja & Komisi (Seksi 8, 17.3 nomor 23, 18.1 nomor 35)', () => {
  const APP_URL = 'http://localhost:3000';
  const BIZ_ID = 'biz_eval_01';
  const SUPERADMIN_ID = 'sa_eval_usr';
  const SALES_1_ID = 'sales_eval_01';
  const SALES_2_ID = 'sales_eval_02';

  const superAdminCtx: contextModule.Ctx = {
    user: {
      id: SUPERADMIN_ID,
      name: 'Owner Usaha',
      role: Role.SUPERADMIN,
      businessId: BIZ_ID,
    },
    role: Role.SUPERADMIN,
    businessId: BIZ_ID,
    sessionId: 'sess_sa',
    ip: '127.0.0.1',
  };

  beforeEach(() => {
    mockUsers = [
      {
        id: SUPERADMIN_ID,
        businessId: BIZ_ID,
        name: 'Owner Usaha',
        username: 'owner',
        role: Role.SUPERADMIN,
        deletedAt: null,
      },
      {
        id: SALES_1_ID,
        businessId: BIZ_ID,
        name: 'Andi Sales',
        username: 'andi',
        role: Role.SALES,
        deletedAt: null,
      },
      {
        id: SALES_2_ID,
        businessId: BIZ_ID,
        name: 'Budi Sales',
        username: 'budi',
        role: Role.SALES,
        deletedAt: null,
      },
    ];

    mockSalesTargets = [];
    mockOwnerSalesNotes = [];
    mockCustomers = [
      {
        id: 'cust_1',
        businessId: BIZ_ID,
        name: 'Pet Shop Kemang',
        assignedSalesId: SALES_1_ID,
        pipelineStage: PipelineStage.DEAL,
        deletedAt: null,
      },
      {
        id: 'cust_2',
        businessId: BIZ_ID,
        name: 'Klinik Hewan Sehat',
        assignedSalesId: SALES_1_ID,
        pipelineStage: PipelineStage.PROSPECT,
        deletedAt: null,
      },
      {
        id: 'cust_3',
        businessId: BIZ_ID,
        name: 'Grooming Ceria',
        assignedSalesId: SALES_2_ID,
        pipelineStage: PipelineStage.LEAD,
        deletedAt: null,
      },
    ];

    mockOrders = [
      {
        id: 'ord_1',
        businessId: BIZ_ID,
        orderNo: 'ORD-202611-001',
        customerId: 'cust_1',
        salesId: SALES_1_ID,
        status: OrderStatus.COMPLETED,
        orderDate: new Date('2026-11-05T10:00:00Z'),
        shippingCharge: 0n,
        rejectReason: null,
        createdAt: new Date('2026-11-05T10:00:00Z'),
        deletedAt: null,
        items: [
          {
            id: 'item_1',
            qty: 10,
            costPrice: 50000n,
            unitPrice: 75000n,
            lineNet: 750000n,
            discountSource: DiscountSource.MANUAL,
            lineDiscount: 0n,
          },
        ],
      },
      {
        id: 'ord_2',
        businessId: BIZ_ID,
        orderNo: 'ORD-202611-002',
        customerId: 'cust_1',
        salesId: SALES_1_ID,
        status: OrderStatus.REVISION_REQUIRED,
        orderDate: new Date('2026-11-06T11:00:00Z'),
        shippingCharge: 0n,
        rejectReason: 'Diskon melebihi batas ketentuan',
        createdAt: new Date('2026-11-06T11:00:00Z'),
        deletedAt: null,
        items: [],
      },
    ];

    mockCommissionEntries = [
      {
        id: 'comm_earned_1',
        businessId: BIZ_ID,
        orderId: 'ord_1',
        salesId: SALES_1_ID,
        mode: CommissionMode.PERCENT_OF_REVENUE,
        basisAmount: 750000n,
        rateBps: 200,
        amount: 15000n,
        status: CommissionStatus.EARNED,
        earnedAt: new Date('2026-11-05T10:00:00Z'),
        paidAt: null,
        reversedAt: null,
        note: null,
      },
      {
        id: 'comm_needs_return_1',
        businessId: BIZ_ID,
        orderId: 'ord_1',
        salesId: SALES_1_ID,
        mode: CommissionMode.PERCENT_OF_REVENUE,
        basisAmount: 1000000n,
        rateBps: 200,
        amount: 20000n,
        status: CommissionStatus.REVERSED,
        earnedAt: new Date('2026-11-01T10:00:00Z'),
        paidAt: new Date('2026-11-02T10:00:00Z'), // Sudah pernah dibayar sebelum di-reversed
        reversedAt: new Date('2026-11-04T12:00:00Z'),
        note: 'Order di-void setelah komisi dibayar',
      },
    ];

    mockAuditLogs = [];
    mockCustomerTasks = [];
    mockCustomerInteractions = [];
    mockReminders = [];
    idCounter = 1;
  });

  describe('1. SalesTarget (Target Bulanan Sales)', () => {
    it('mengatur dan memperbarui target omzet & profit bulanan (PUT)', async () => {
      vi.spyOn(contextModule, 'requireContext').mockResolvedValue(superAdminCtx);

      const req = new NextRequest(
        `${APP_URL}/api/v1/sales/${SALES_1_ID}/targets/2026-11`,
        {
          method: 'PUT',
          headers: { origin: APP_URL, 'content-type': 'application/json' },
          body: JSON.stringify({
            targetRevenue: 50000000,
            targetProfit: 12000000,
          }),
        }
      );

      const res = await setSalesTargetHandler(req, {
        params: Promise.resolve({ id: SALES_1_ID, month: '2026-11' }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.ok).toBe(true);
      expect(json.data.targetRevenue).toBe(50000000);
      expect(json.data.targetProfit).toBe(12000000);
      expect(json.data.month).toBe('2026-11');
    });

    it('mengambil target bulanan sales yang telah disimpan (GET)', async () => {
      vi.spyOn(contextModule, 'requireContext').mockResolvedValue(superAdminCtx);

      mockSalesTargets.push({
        id: 'tgt_existing',
        businessId: BIZ_ID,
        salesId: SALES_1_ID,
        month: '2026-11',
        targetRevenue: 40000000n,
        targetProfit: 10000000n,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const req = new NextRequest(
        `${APP_URL}/api/v1/sales/${SALES_1_ID}/targets/2026-11`,
        {
          method: 'GET',
          headers: { origin: APP_URL },
        }
      );

      const res = await getSalesTargetHandler(req, {
        params: Promise.resolve({ id: SALES_1_ID, month: '2026-11' }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.ok).toBe(true);
      expect(json.data.targetRevenue).toBe(40000000);
      expect(json.data.targetProfit).toBe(10000000);
    });

    it('menolak format bulan yang tidak valid (400 Bad Request)', async () => {
      vi.spyOn(contextModule, 'requireContext').mockResolvedValue(superAdminCtx);

      const req = new NextRequest(
        `${APP_URL}/api/v1/sales/${SALES_1_ID}/targets/invalid-month`,
        {
          method: 'GET',
          headers: { origin: APP_URL },
        }
      );

      const res = await getSalesTargetHandler(req, {
        params: Promise.resolve({ id: SALES_1_ID, month: 'invalid-month' }),
      });

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.ok).toBe(false);
      expect(json.error.code).toBe('BAD_REQUEST');
    });
  });

  describe('2. OwnerSalesNote (Catatan Rahasia Pemilik Usaha)', () => {
    it('membuat catatan evaluasi rahasia pemilik usaha (POST)', async () => {
      vi.spyOn(contextModule, 'requireContext').mockResolvedValue(superAdminCtx);

      const req = new NextRequest(`${APP_URL}/api/v1/sales/${SALES_1_ID}/notes`, {
        method: 'POST',
        headers: { origin: APP_URL, 'content-type': 'application/json' },
        body: JSON.stringify({
          note: 'Staf Andi sangat gigih, namun perlu bimbingan negosiasi margin.',
        }),
      });

      const res = await createSalesNoteHandler(req, {
        params: Promise.resolve({ id: SALES_1_ID }),
      });

      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.ok).toBe(true);
      expect(json.data.note).toContain('Staf Andi sangat gigih');
      expect(json.data.authorId).toBe(SUPERADMIN_ID);
      expect(mockOwnerSalesNotes).toHaveLength(1);
    });

    it('mengambil riwayat catatan rahasia pemilik untuk staf sales (GET)', async () => {
      vi.spyOn(contextModule, 'requireContext').mockResolvedValue(superAdminCtx);

      mockOwnerSalesNotes.push({
        id: 'note_1',
        businessId: BIZ_ID,
        salesId: SALES_1_ID,
        authorId: SUPERADMIN_ID,
        note: 'Evaluasi bulan lalu: bagus.',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const req = new NextRequest(`${APP_URL}/api/v1/sales/${SALES_1_ID}/notes`, {
        method: 'GET',
        headers: { origin: APP_URL },
      });

      const res = await getSalesNotesHandler(req, {
        params: Promise.resolve({ id: SALES_1_ID }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.ok).toBe(true);
      expect(json.data).toHaveLength(1);
      expect(json.data[0].note).toBe('Evaluasi bulan lalu: bagus.');
    });
  });

  describe('3. GET /reports/sales-performance (Laporan Kinerja Sales)', () => {
    it('menghitung performa omzet, profit, konversi pipeline, dan komisi', async () => {
      vi.spyOn(contextModule, 'requireContext').mockResolvedValue(superAdminCtx);

      mockSalesTargets.push({
        id: 'tgt_1',
        businessId: BIZ_ID,
        salesId: SALES_1_ID,
        month: '2026-11',
        targetRevenue: 1000000n,
        targetProfit: 250000n,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const req = new NextRequest(
        `${APP_URL}/api/v1/reports/sales-performance?month=2026-11`,
        {
          method: 'GET',
          headers: { origin: APP_URL },
        }
      );

      const res = await getSalesPerformanceReportHandler(req);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.ok).toBe(true);
      expect(json.data.summary.totalSalesCount).toBe(2);
      expect(json.data.summary.totalRevenue).toBe(750000);
      expect(json.data.summary.totalProfit).toBe(250000);

      const andi = json.data.items.find((i: { salesId: string }) => i.salesId === SALES_1_ID);
      expect(andi).toBeDefined();
      expect(andi.revenue).toBe(750000);
      expect(andi.profit).toBe(250000);
      expect(andi.orderCount).toBe(1);
      expect(andi.rejectedOrderCount).toBe(1);
      expect(andi.rejectedPercent).toBe(50); // 1 deal + 1 rejected = 50%
      expect(andi.achievementPercent).toBe(75); // 750.000 / 1.000.000 = 75%
      expect(andi.earnedCommission).toBe(15000);
      expect(andi.pipelineConversionPercent).toBe(50); // 1 deal / 2 customers = 50%
    });
  });

  describe('4. GET /reports/commissions & Penanda "Perlu Dikembalikan" (Seksi 18.1 nomor 35)', () => {
    it('memberikan tanda needsReturn = true untuk komisi REVERSED yang sebelumnya sudah PAID', async () => {
      vi.spyOn(contextModule, 'requireContext').mockResolvedValue(superAdminCtx);

      const req = new NextRequest(`${APP_URL}/api/v1/reports/commissions`, {
        method: 'GET',
        headers: { origin: APP_URL },
      });

      const res = await getCommissionReportHandler(req);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.ok).toBe(true);
      expect(json.data.summary.totalNeedsReturn).toBe(20000);
      expect(json.data.summary.needsReturnCount).toBe(1);

      const needsReturnEntry = json.data.data.find(
        (e: { id: string }) => e.id === 'comm_needs_return_1'
      );
      expect(needsReturnEntry).toBeDefined();
      expect(needsReturnEntry.needsReturn).toBe(true);
      expect(needsReturnEntry.status).toBe(CommissionStatus.REVERSED);
      expect(needsReturnEntry.paidAt).not.toBeNull();

      const earnedEntry = json.data.data.find(
        (e: { id: string }) => e.id === 'comm_earned_1'
      );
      expect(earnedEntry.needsReturn).toBe(false);
    });
  });

  describe('5. POST /commissions/:id/pay (Pembayaran Komisi)', () => {
    it('menandai status komisi menjadi PAID dan mencatat waktu bayar', async () => {
      vi.spyOn(contextModule, 'requireContext').mockResolvedValue(superAdminCtx);

      const req = new NextRequest(
        `${APP_URL}/api/v1/commissions/comm_earned_1/pay`,
        {
          method: 'POST',
          headers: { origin: APP_URL, 'content-type': 'application/json' },
          body: JSON.stringify({
            note: 'Dibayar tunai di kantor',
          }),
        }
      );

      const res = await payCommissionHandler(req, {
        params: Promise.resolve({ id: 'comm_earned_1' }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.ok).toBe(true);
      expect(json.data.status).toBe(CommissionStatus.PAID);
      expect(json.data.paidAt).not.toBeNull();

      const updated = mockCommissionEntries.find((c) => c.id === 'comm_earned_1');
      expect(updated?.status).toBe(CommissionStatus.PAID);
    });

    it('menolak pembayaran jika komisi sudah berstatus REVERSED (409 Conflict)', async () => {
      vi.spyOn(contextModule, 'requireContext').mockResolvedValue(superAdminCtx);

      const req = new NextRequest(
        `${APP_URL}/api/v1/commissions/comm_needs_return_1/pay`,
        {
          method: 'POST',
          headers: { origin: APP_URL, 'content-type': 'application/json' },
          body: JSON.stringify({ note: 'Coba bayar komisi reversed' }),
        }
      );

      const res = await payCommissionHandler(req, {
        params: Promise.resolve({ id: 'comm_needs_return_1' }),
      });

      expect(res.status).toBe(409);
      const json = await res.json();
      expect(json.ok).toBe(false);
      expect(json.error.code).toBe('INVALID_STATE');
    });
  });

  describe('6. Zero-Leakage & Hak Akses (Role SALES Ditolak 403 Forbidden)', () => {
    it('menolak Sales mengakses GET /reports/sales-performance (403)', async () => {
      vi.spyOn(contextModule, 'requireContext').mockRejectedValue(
        new DomainError('FORBIDDEN', 'Hanya Super Admin yang berhak', 403)
      );

      const req = new NextRequest(
        `${APP_URL}/api/v1/reports/sales-performance`,
        {
          method: 'GET',
          headers: { origin: APP_URL },
        }
      );

      const res = await getSalesPerformanceReportHandler(req);
      expect(res.status).toBe(403);
    });

    it('menolak Sales mengakses GET /reports/commissions (403)', async () => {
      vi.spyOn(contextModule, 'requireContext').mockRejectedValue(
        new DomainError('FORBIDDEN', 'Hanya Super Admin yang berhak', 403)
      );

      const req = new NextRequest(`${APP_URL}/api/v1/reports/commissions`, {
        method: 'GET',
        headers: { origin: APP_URL },
      });

      const res = await getCommissionReportHandler(req);
      expect(res.status).toBe(403);
    });

    it('menolak Sales mengakses catatan pemilik usaha (403)', async () => {
      vi.spyOn(contextModule, 'requireContext').mockRejectedValue(
        new DomainError('FORBIDDEN', 'Hanya Super Admin yang berhak', 403)
      );

      const req = new NextRequest(`${APP_URL}/api/v1/sales/${SALES_1_ID}/notes`, {
        method: 'GET',
        headers: { origin: APP_URL },
      });

      const res = await getSalesNotesHandler(req, {
        params: Promise.resolve({ id: SALES_1_ID }),
      });
      expect(res.status).toBe(403);
    });

    it('menolak Sales mengatur target sales (403)', async () => {
      vi.spyOn(contextModule, 'requireContext').mockRejectedValue(
        new DomainError('FORBIDDEN', 'Hanya Super Admin yang berhak', 403)
      );

      const req = new NextRequest(
        `${APP_URL}/api/v1/sales/${SALES_1_ID}/targets/2026-11`,
        {
          method: 'PUT',
          headers: { origin: APP_URL, 'content-type': 'application/json' },
          body: JSON.stringify({ targetRevenue: 1000000 }),
        }
      );

      const res = await setSalesTargetHandler(req, {
        params: Promise.resolve({ id: SALES_1_ID, month: '2026-11' }),
      });
      expect(res.status).toBe(403);
    });

    it('menolak Sales membayar komisi (403)', async () => {
      vi.spyOn(contextModule, 'requireContext').mockRejectedValue(
        new DomainError('FORBIDDEN', 'Hanya Super Admin yang berhak', 403)
      );

      const req = new NextRequest(
        `${APP_URL}/api/v1/commissions/comm_earned_1/pay`,
        {
          method: 'POST',
          headers: { origin: APP_URL },
        }
      );

      const res = await payCommissionHandler(req, {
        params: Promise.resolve({ id: 'comm_earned_1' }),
      });
      expect(res.status).toBe(403);
    });
  });
});
