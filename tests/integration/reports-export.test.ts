import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import ExcelJS from 'exceljs';
import {
  Role,
  OrderStatus,
  InvoiceStatus,
  PipelineStage,
  InteractionType,
  ReminderStatus,
} from '@prisma/client';
import * as contextModule from '@/lib/auth/context';
import { DomainError } from '@/lib/domain/money';

// Handlers
import { GET as getReceivablesAgingHandler } from '@/app/api/v1/reports/receivables-aging/route';
import { GET as getCrmReportHandler } from '@/app/api/v1/reports/crm/route';
import { GET as exportReportHandler } from '@/app/api/v1/reports/export/route';

interface MockUser {
  id: string;
  businessId: string;
  name: string;
  username: string;
  role: Role;
  deletedAt: Date | null;
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
  createdAt: Date;
  deletedAt: Date | null;
}

interface MockInvoice {
  id: string;
  businessId: string;
  orderId: string;
  customerId: string;
  invoiceNo: string;
  status: InvoiceStatus;
  amount: bigint;
  paidAmount: bigint;
  issueDate: Date;
  dueDate: Date;
  deletedAt: Date | null;
}

interface MockCrmTask {
  id: string;
  businessId: string;
  customerId: string;
  assignedToId: string;
  title: string;
  dueAt: Date;
  doneAt: Date | null;
  createdAt: Date;
}

interface MockCrmInteraction {
  id: string;
  businessId: string;
  customerId: string;
  salesId: string;
  type: InteractionType;
  summary: string;
  occurredAt: Date;
  nextFollowUpAt: Date | null;
  createdAt: Date;
}

interface MockReminder {
  id: string;
  businessId: string;
  salesId: string;
  status: ReminderStatus;
}

let mockUsers: MockUser[] = [];
let mockCustomers: MockCustomer[] = [];
let mockOrders: MockOrder[] = [];
let mockInvoices: MockInvoice[] = [];
let mockCrmTasks: MockCrmTask[] = [];
let mockCrmInteractions: MockCrmInteraction[] = [];
let mockReminders: MockReminder[] = [];

interface ExportWhereFilter {
  businessId?: string;
  role?: Role;
  id?: { in?: string[] };
  assignedSalesId?: string;
  deletedAt?: null | Date;
  status?: InvoiceStatus | { not?: OrderStatus };
  salesId?: string;
  customerId?: string;
  orderId?: { in?: string[] };
  assignedToId?: string;
  dueAt?: { gte?: Date; lte?: Date };
  occurredAt?: { gte?: Date; lte?: Date };
}

vi.mock('@/lib/db', () => {
  const mockPrisma = {
    user: {
      findMany: vi.fn(async ({ where }: { where: ExportWhereFilter }) => {
        return mockUsers.filter((u) => {
          if (where.businessId && u.businessId !== where.businessId) return false;
          if (where.role && u.role !== where.role) return false;
          if (where.id?.in && !where.id.in.includes(u.id)) return false;
          return true;
        });
      }),
    },
    customer: {
      findMany: vi.fn(async ({ where }: { where: ExportWhereFilter }) => {
        return mockCustomers.filter((c) => {
          if (where.businessId && c.businessId !== where.businessId) return false;
          if (where.assignedSalesId && c.assignedSalesId !== where.assignedSalesId) return false;
          if (where.deletedAt === null && c.deletedAt !== null) return false;
          return true;
        });
      }),
    },
    order: {
      findMany: vi.fn(async ({ where }: { where: ExportWhereFilter }) => {
        return mockOrders
          .filter((o) => {
            if (where.businessId && o.businessId !== where.businessId) return false;
            if (where.deletedAt === null && o.deletedAt !== null) return false;
            if (
              where.status &&
              typeof where.status === 'object' &&
              where.status.not &&
              o.status === where.status.not
            )
              return false;
            if (where.salesId && o.salesId !== where.salesId) return false;
            if (where.customerId && o.customerId !== where.customerId) return false;
            if (where.id?.in && !where.id.in.includes(o.id)) return false;
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
    invoice: {
      findMany: vi.fn(async ({ where }: { where: ExportWhereFilter }) => {
        return mockInvoices.filter((inv) => {
          if (where.businessId && inv.businessId !== where.businessId) return false;
          if (where.deletedAt === null && inv.deletedAt !== null) return false;
          if (where.status && typeof where.status === 'string' && inv.status !== where.status)
            return false;
          if (where.orderId?.in && !where.orderId.in.includes(inv.orderId)) return false;
          if (where.customerId && inv.customerId !== where.customerId) return false;
          return true;
        });
      }),
    },
    crmTask: {
      findMany: vi.fn(async ({ where }: { where: ExportWhereFilter }) => {
        return mockCrmTasks
          .filter((t) => {
            if (where.businessId && t.businessId !== where.businessId) return false;
            if (where.assignedToId && t.assignedToId !== where.assignedToId) return false;
            if (where.dueAt?.gte && t.dueAt < where.dueAt.gte) return false;
            if (where.dueAt?.lte && t.dueAt > where.dueAt.lte) return false;
            return true;
          })
          .map((t) => {
            const cust = mockCustomers.find((c) => c.id === t.customerId) || {
              id: t.customerId,
              name: 'Customer Dummy',
            };
            return { ...t, customer: cust };
          });
      }),
    },
    crmInteraction: {
      findMany: vi.fn(async ({ where }: { where: ExportWhereFilter }) => {
        return mockCrmInteractions
          .filter((i) => {
            if (where.businessId && i.businessId !== where.businessId) return false;
            if (where.salesId && i.salesId !== where.salesId) return false;
            if (where.occurredAt?.gte && i.occurredAt < where.occurredAt.gte) return false;
            if (where.occurredAt?.lte && i.occurredAt > where.occurredAt.lte) return false;
            return true;
          })
          .map((i) => {
            const cust = mockCustomers.find((c) => c.id === i.customerId) || {
              id: i.customerId,
              name: 'Customer Dummy',
            };
            return { ...i, customer: cust };
          });
      }),
    },
    reminder: {
      findMany: vi.fn(async ({ where }: { where: ExportWhereFilter }) => {
        return mockReminders.filter((r) => {
          if (where.businessId && r.businessId !== where.businessId) return false;
          if (where.salesId && r.salesId !== where.salesId) return false;
          return true;
        });
      }),
    },
  };

  return { prisma: mockPrisma };
});

describe('T5.4: Piutang, Laporan CRM, Ekspor Excel & PDF dengan Perlindungan Rumus (Seksi 13.3, 16.2, 16.4)', () => {
  const APP_URL = 'http://localhost:3000';
  const BIZ_ID = 'biz_export_01';
  const SUPERADMIN_ID = 'sa_usr_01';
  const SALES_1_ID = 'sales_usr_01';
  const SALES_2_ID = 'sales_usr_02';

  const superAdminCtx: contextModule.Ctx = {
    user: {
      id: SUPERADMIN_ID,
      name: 'Owner Toko',
      role: Role.SUPERADMIN,
      businessId: BIZ_ID,
    },
    role: Role.SUPERADMIN,
    businessId: BIZ_ID,
    sessionId: 'sess_sa',
    ip: '127.0.0.1',
  };

  const sales1Ctx: contextModule.Ctx = {
    user: {
      id: SALES_1_ID,
      name: 'Sales Andi',
      role: Role.SALES,
      businessId: BIZ_ID,
    },
    role: Role.SALES,
    businessId: BIZ_ID,
    sessionId: 'sess_sales1',
    ip: '127.0.0.1',
  };

  beforeEach(() => {
    mockUsers = [
      {
        id: SUPERADMIN_ID,
        businessId: BIZ_ID,
        name: 'Owner Toko',
        username: 'owner',
        role: Role.SUPERADMIN,
        deletedAt: null,
      },
      {
        id: SALES_1_ID,
        businessId: BIZ_ID,
        name: 'Sales Andi',
        username: 'andi',
        role: Role.SALES,
        deletedAt: null,
      },
      {
        id: SALES_2_ID,
        businessId: BIZ_ID,
        name: 'Sales Budi',
        username: 'budi',
        role: Role.SALES,
        deletedAt: null,
      },
    ];

    // Data dengan potensi Formula Injection (Seksi 16.4)
    mockCustomers = [
      {
        id: 'cust_normal',
        businessId: BIZ_ID,
        name: 'Pet Shop Bintaro',
        assignedSalesId: SALES_1_ID,
        pipelineStage: PipelineStage.DEAL,
        deletedAt: null,
      },
      {
        id: 'cust_formula_equals',
        businessId: BIZ_ID,
        name: '=cmd|’ /C calc’!A0', // Uji sel berawalan '='
        assignedSalesId: SALES_1_ID,
        pipelineStage: PipelineStage.PROSPECT,
        deletedAt: null,
      },
      {
        id: 'cust_formula_plus',
        businessId: BIZ_ID,
        name: '+1234567890', // Uji sel berawalan '+'
        assignedSalesId: SALES_2_ID,
        pipelineStage: PipelineStage.LEAD,
        deletedAt: null,
      },
      {
        id: 'cust_formula_at',
        businessId: BIZ_ID,
        name: '@SUM(1,2,3)', // Uji sel berawalan '@'
        assignedSalesId: SALES_2_ID,
        pipelineStage: PipelineStage.REPEAT,
        deletedAt: null,
      },
    ];

    mockOrders = [
      {
        id: 'ord_1',
        businessId: BIZ_ID,
        orderNo: 'ORD-202611-001',
        customerId: 'cust_normal',
        salesId: SALES_1_ID,
        status: OrderStatus.COMPLETED,
        createdAt: new Date('2026-11-01T10:00:00Z'),
        deletedAt: null,
      },
      {
        id: 'ord_formula',
        businessId: BIZ_ID,
        orderNo: '=DDE("cmd";"";"calc")', // No order jahat
        customerId: 'cust_formula_equals',
        salesId: SALES_1_ID,
        status: OrderStatus.IN_PROCESS,
        createdAt: new Date('2026-11-02T10:00:00Z'),
        deletedAt: null,
      },
      {
        id: 'ord_cancelled',
        businessId: BIZ_ID,
        orderNo: 'ORD-CANCELLED-99',
        customerId: 'cust_normal',
        salesId: SALES_1_ID,
        status: OrderStatus.CANCELLED, // Harus diabaikan dari umur piutang
        createdAt: new Date('2026-11-03T10:00:00Z'),
        deletedAt: null,
      },
    ];

    const today = new Date();
    // Invoice 1: Belum jatuh tempo (CURRENT)
    const futureDue = new Date(today.getTime() + 5 * 86_400_000);
    // Invoice 2: Terlambat 5 hari (DAYS_1_7)
    const overdue5Days = new Date(today.getTime() - 5 * 86_400_000);
    // Invoice 3: Terlambat 15 hari (DAYS_8_30)
    const overdue15Days = new Date(today.getTime() - 15 * 86_400_000);

    mockInvoices = [
      {
        id: 'inv_1',
        businessId: BIZ_ID,
        orderId: 'ord_1',
        customerId: 'cust_normal',
        invoiceNo: 'TRB/INV/01/11/2026/0001-DP',
        status: InvoiceStatus.APPROVED,
        amount: 5000000n,
        paidAmount: 2000000n, // sisa 3jt
        issueDate: new Date('2026-11-01'),
        dueDate: futureDue,
        deletedAt: null,
      },
      {
        id: 'inv_formula',
        businessId: BIZ_ID,
        orderId: 'ord_formula',
        customerId: 'cust_formula_equals',
        invoiceNo: 'TRB/INV/02/11/2026/0002-DP',
        status: InvoiceStatus.APPROVED,
        amount: 4000000n,
        paidAmount: 0n, // sisa 4jt
        issueDate: new Date('2026-10-25'),
        dueDate: overdue5Days,
        deletedAt: null,
      },
      {
        id: 'inv_paid',
        businessId: BIZ_ID,
        orderId: 'ord_1',
        customerId: 'cust_normal',
        invoiceNo: 'TRB/INV/01/11/2026/0003-LUNAS',
        status: InvoiceStatus.APPROVED,
        amount: 2000000n,
        paidAmount: 2000000n, // sisa 0 (lunas, tidak boleh masuk umur piutang)
        issueDate: new Date('2026-10-20'),
        dueDate: overdue15Days,
        deletedAt: null,
      },
      {
        id: 'inv_cancelled_ord',
        businessId: BIZ_ID,
        orderId: 'ord_cancelled',
        customerId: 'cust_normal',
        invoiceNo: 'TRB/INV/01/11/2026/0004-BATAL',
        status: InvoiceStatus.APPROVED,
        amount: 1000000n,
        paidAmount: 0n,
        issueDate: new Date('2026-10-20'),
        dueDate: overdue15Days,
        deletedAt: null,
      },
    ];

    mockCrmTasks = [
      {
        id: 'task_1',
        businessId: BIZ_ID,
        customerId: 'cust_normal',
        assignedToId: SALES_1_ID,
        title: 'Follow-up order pakan kucing',
        dueAt: new Date(),
        doneAt: null, // PENDING
        createdAt: new Date(),
      },
      {
        id: 'task_2',
        businessId: BIZ_ID,
        customerId: 'cust_formula_plus',
        assignedToId: SALES_2_ID,
        title: '+Kirim proposal diskon spesial',
        dueAt: new Date(),
        doneAt: new Date(), // COMPLETED
        createdAt: new Date(),
      },
    ];

    mockCrmInteractions = [
      {
        id: 'inter_1',
        businessId: BIZ_ID,
        customerId: 'cust_normal',
        salesId: SALES_1_ID,
        type: InteractionType.WHATSAPP,
        summary: 'Menanyakan ketersediaan stok pasir gumpal',
        occurredAt: new Date(),
        nextFollowUpAt: null,
        createdAt: new Date(),
      },
      {
        id: 'inter_2',
        businessId: BIZ_ID,
        customerId: 'cust_formula_equals',
        salesId: SALES_1_ID,
        type: InteractionType.CALL,
        summary: '=Konfirmasi tanggal kirim pesanan',
        occurredAt: new Date(),
        nextFollowUpAt: null,
        createdAt: new Date(),
      },
    ];

    mockReminders = [
      {
        id: 'rem_1',
        businessId: BIZ_ID,
        salesId: SALES_1_ID,
        status: ReminderStatus.ACTIVE,
      },
      {
        id: 'rem_2',
        businessId: BIZ_ID,
        salesId: SALES_2_ID,
        status: ReminderStatus.DONE,
      },
    ];
  });

  describe('1. GET /reports/receivables-aging (Laporan Umur Piutang)', () => {
    it('mengelompokkan invoice ke dalam bucket umur piutang yang tepat (Seksi 13.3)', async () => {
      vi.spyOn(contextModule, 'requireContext').mockResolvedValue(superAdminCtx);

      const req = new NextRequest(`${APP_URL}/api/v1/reports/receivables-aging`, {
        method: 'GET',
        headers: { origin: APP_URL },
      });

      const res = await getReceivablesAgingHandler(req);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.ok).toBe(true);

      const summary = json.data.summary;
      expect(summary.totalReceivables).toBe(7000000); // 3jt (inv_1) + 4jt (inv_formula)
      expect(summary.totalOverdue).toBe(4000000); // 4jt (inv_formula terlambat 5 hari)
      expect(summary.totalInvoicesCount).toBe(2); // inv_paid (sisa 0) & inv_cancelled_ord (order batal) dikecualikan
      expect(summary.overdueInvoicesCount).toBe(1);

      const buckets = json.data.buckets;
      expect(buckets.CURRENT.count).toBe(1);
      expect(buckets.CURRENT.totalRemaining).toBe(3000000);
      expect(buckets.DAYS_1_7.count).toBe(1);
      expect(buckets.DAYS_1_7.totalRemaining).toBe(4000000);
    });

    it('menolak role Sales mengakses laporan umur piutang (403 FORBIDDEN)', async () => {
      vi.spyOn(contextModule, 'requireContext').mockRejectedValue(
        new DomainError('FORBIDDEN', 'Hanya Super Admin yang berhak', 403)
      );

      const req = new NextRequest(`${APP_URL}/api/v1/reports/receivables-aging`, {
        method: 'GET',
        headers: { origin: APP_URL },
      });

      const res = await getReceivablesAgingHandler(req);
      expect(res.status).toBe(403);
    });
  });

  describe('2. GET /reports/crm (Laporan Aktivitas & Pipeline CRM)', () => {
    it('Super Admin melihat seluruh aktivitas dan pipeline lintas staf sales', async () => {
      vi.spyOn(contextModule, 'requireContext').mockResolvedValue(superAdminCtx);

      const req = new NextRequest(`${APP_URL}/api/v1/reports/crm`, {
        method: 'GET',
        headers: { origin: APP_URL },
      });

      const res = await getCrmReportHandler(req);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.ok).toBe(true);

      expect(json.data.summary.totalCustomers).toBe(4);
      expect(json.data.summary.tasks.total).toBe(2);
      expect(json.data.summary.tasks.pending).toBe(1);
      expect(json.data.summary.tasks.completed).toBe(1);
      expect(json.data.summary.interactions.total).toBe(2);
      expect(json.data.summary.reminders.total).toBe(2);
      expect(json.data.recentActivities.length).toBe(4);
    });

    it('Sales hanya melihat aktivitas dan pelanggan miliknya sendiri (Zero-Leakage & Tenant Scoping)', async () => {
      vi.spyOn(contextModule, 'requireContext').mockResolvedValue(sales1Ctx);

      const req = new NextRequest(`${APP_URL}/api/v1/reports/crm`, {
        method: 'GET',
        headers: { origin: APP_URL },
      });

      const res = await getCrmReportHandler(req);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.ok).toBe(true);

      // Hanya customer milik Sales Andi (cust_normal & cust_formula_equals)
      expect(json.data.summary.totalCustomers).toBe(2);
      expect(json.data.salesId).toBe(SALES_1_ID);

      // Memastikan aktivitas milik Sales Budi tidak bocor
      const hasOtherSalesActivities = json.data.recentActivities.some(
        (a: { salesId: string }) => a.salesId === SALES_2_ID
      );
      expect(hasOtherSalesActivities).toBe(false);
    });
  });

  describe('3. GET /reports/export (Ekspor Excel & PDF dengan Perlindungan Formula Injection 16.4)', () => {
    it('menghasilkan berkas Excel XLSX valid dan menetralkan karakter formula spreadsheet (=, +, -, @) dengan awalan tanda petik tunggal', async () => {
      vi.spyOn(contextModule, 'requireContext').mockResolvedValue(superAdminCtx);

      const req = new NextRequest(
        `${APP_URL}/api/v1/reports/export?type=receivables-aging&format=xlsx`,
        {
          method: 'GET',
          headers: { origin: APP_URL },
        }
      );

      const res = await exportReportHandler(req);
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('spreadsheetml.sheet');
      expect(res.headers.get('content-disposition')).toContain('laporan_umur_piutang_');

      const arrayBuffer = await res.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      // Validasi struktur Excel dengan ExcelJS
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);

      const worksheet = workbook.getWorksheet('Umur Piutang');
      expect(worksheet).toBeDefined();

      // Cari baris data yang mengandung input berbahaya
      let foundFormulaRow = false;
      worksheet?.eachRow((row) => {
        const orderNoVal = String(row.getCell(2).value || '');
        const custNameVal = String(row.getCell(3).value || '');

        if (orderNoVal.includes('calc') || custNameVal.includes('calc')) {
          foundFormulaRow = true;
          // Pembuktian Seksi 16.4: Sel berawalan '=' wajib memiliki awalan tanda petik tunggal (')
          expect(orderNoVal.startsWith("'=")).toBe(true);
          expect(custNameVal.startsWith("'=")).toBe(true);
        }
      });

      expect(foundFormulaRow).toBe(true);
    });

    it('menetralkan sel berawalan formula pada ekspor laporan CRM XLSX', async () => {
      vi.spyOn(contextModule, 'requireContext').mockResolvedValue(superAdminCtx);

      const req = new NextRequest(
        `${APP_URL}/api/v1/reports/export?type=crm&format=xlsx`,
        {
          method: 'GET',
          headers: { origin: APP_URL },
        }
      );

      const res = await exportReportHandler(req);
      expect(res.status).toBe(200);

      const arrayBuffer = await res.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);

      const ws = workbook.getWorksheet('Aktivitas CRM');
      expect(ws).toBeDefined();

      let sanitizedCount = 0;
      ws?.eachRow((row) => {
        const summaryVal = String(row.getCell(6).value || '');
        if (summaryVal.startsWith("'=") || summaryVal.startsWith("'+")) {
          sanitizedCount++;
        }
      });

      expect(sanitizedCount).toBeGreaterThanOrEqual(1);
    });

    it('mengizinkan Sales mengekspor laporan CRM miliknya sendiri (200 OK)', async () => {
      vi.spyOn(contextModule, 'requireContext').mockResolvedValue(sales1Ctx);

      const req = new NextRequest(
        `${APP_URL}/api/v1/reports/export?type=crm&format=xlsx`,
        {
          method: 'GET',
          headers: { origin: APP_URL },
        }
      );

      const res = await exportReportHandler(req);
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('spreadsheetml.sheet');
    });

    it('menolak Sales mengekspor laporan keuangan/margin (403 FORBIDDEN)', async () => {
      vi.spyOn(contextModule, 'requireContext').mockResolvedValue(sales1Ctx);

      const req = new NextRequest(
        `${APP_URL}/api/v1/reports/export?type=margin&format=xlsx`,
        {
          method: 'GET',
          headers: { origin: APP_URL },
        }
      );

      const res = await exportReportHandler(req);
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.ok).toBe(false);
      expect(json.error.code).toBe('FORBIDDEN');
    });

    it('menolak Sales mengekspor laporan umur piutang (403 FORBIDDEN)', async () => {
      vi.spyOn(contextModule, 'requireContext').mockResolvedValue(sales1Ctx);

      const req = new NextRequest(
        `${APP_URL}/api/v1/reports/export?type=receivables-aging&format=xlsx`,
        {
          method: 'GET',
          headers: { origin: APP_URL },
        }
      );

      const res = await exportReportHandler(req);
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.ok).toBe(false);
      expect(json.error.code).toBe('FORBIDDEN');
    });
  });
});
