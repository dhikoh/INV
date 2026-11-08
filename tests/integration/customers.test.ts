import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import {
  GET as getCustomersHandler,
  POST as createCustomerHandler,
} from '@/app/api/v1/customers/route';
import {
  GET as getCustomerDetailHandler,
  PATCH as updateCustomerHandler,
  DELETE as deleteCustomerHandler,
} from '@/app/api/v1/customers/[id]/route';
import { POST as reassignCustomerHandler } from '@/app/api/v1/customers/[id]/reassign/route';
import { Role, PipelineStage, OrderStatus } from '@prisma/client';
import { DomainError } from '@/lib/domain/money';
import * as contextModule from '@/lib/auth/context';
import { assertNoSecretKeys } from '../helpers/leak';

interface MockCustomer {
  id: string;
  businessId: string;
  code: string;
  name: string;
  contactName: string | null;
  phone: string | null;
  address: string | null;
  shippingAddress: string | null;
  billingAddress: string | null;
  npwp: string | null;
  assignedSalesId: string | null;
  pipelineStage: PipelineStage;
  tags: string[];
  notes: string | null;
  rev: number;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

interface MockUser {
  id: string;
  businessId: string | null;
  role: Role;
  name: string;
  username: string;
  isActive: boolean;
  deletedAt: Date | null;
}

interface MockOrder {
  id: string;
  businessId: string;
  customerId: string;
  salesId: string;
  status: OrderStatus;
  deletedAt: Date | null;
}

interface MockInvoice {
  id: string;
  businessId: string;
  customerId: string;
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

let customers: MockCustomer[] = [];
let users: MockUser[] = [];
let orders: MockOrder[] = [];
let invoices: MockInvoice[] = [];
let auditLogs: MockAuditLog[] = [];

vi.mock('@/lib/db', () => ({
  prisma: {
    customer: {
      findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        return (
          customers.find((c) => {
            if (where.id && typeof where.id === 'string' && c.id !== where.id)
              return false;
            if (where.id && typeof where.id === 'object' && 'not' in where.id) {
              if (c.id === (where.id as { not: string }).not) return false;
            }
            if (where.businessId && c.businessId !== where.businessId)
              return false;
            if (where.code && c.code !== where.code) return false;
            if (where.deletedAt === null && c.deletedAt !== null) return false;
            if (
              where.assignedSalesId &&
              c.assignedSalesId !== where.assignedSalesId
            )
              return false;
            return true;
          }) || null
        );
      }),
      findMany: vi.fn(
        async ({
          where,
        }: {
          where: Record<string, unknown>;
          skip?: number;
          take?: number;
        }) => {
          return customers
            .filter((c) => {
              if (where.businessId && c.businessId !== where.businessId)
                return false;
              if (where.deletedAt === null && c.deletedAt !== null) return false;
              if (
                where.assignedSalesId &&
                c.assignedSalesId !== where.assignedSalesId
              )
                return false;
              if (where.pipelineStage && c.pipelineStage !== where.pipelineStage)
                return false;
              if (where.tags && typeof where.tags === 'object' && 'has' in where.tags) {
                if (!c.tags.includes((where.tags as { has: string }).has))
                  return false;
              }
              if (where.OR && Array.isArray(where.OR)) {
                const q = String(where.OR[0].code.contains).toLowerCase();
                const mCode = c.code.toLowerCase().includes(q);
                const mName = c.name.toLowerCase().includes(q);
                const mContact = c.contactName
                  ? c.contactName.toLowerCase().includes(q)
                  : false;
                const mPhone = c.phone ? c.phone.includes(q) : false;
                if (!mCode && !mName && !mContact && !mPhone) return false;
              }
              return true;
            })
            .map((c) => ({
              ...c,
              assignedSales:
                users.find((u) => u.id === c.assignedSalesId) || null,
              _count: {
                orders: orders.filter((o) => o.customerId === c.id).length,
                invoices: invoices.filter((inv) => inv.customerId === c.id)
                  .length,
              },
            }));
        }
      ),
      count: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        return customers.filter((c) => {
          if (where.businessId && c.businessId !== where.businessId)
            return false;
          if (where.deletedAt === null && c.deletedAt !== null) return false;
          if (
            where.assignedSalesId &&
            c.assignedSalesId !== where.assignedSalesId
          )
            return false;
          return true;
        }).length;
      }),
      create: vi.fn(
        async ({
          data,
        }: {
          data: Omit<MockCustomer, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'>;
        }) => {
          const item: MockCustomer = {
            id: `cust_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
            ...data,
            createdAt: new Date(),
            updatedAt: new Date(),
            deletedAt: null,
          };
          customers.push(item);
          return {
            ...item,
            assignedSales:
              users.find((u) => u.id === item.assignedSalesId) || null,
            _count: { orders: 0, invoices: 0 },
          };
        }
      ),
      update: vi.fn(
        async ({
          where,
          data,
        }: {
          where: { id: string };
          data: Partial<MockCustomer>;
        }) => {
          const c = customers.find((item) => item.id === where.id);
          if (!c) throw new Error('Customer not found');
          Object.assign(c, data, { updatedAt: new Date() });
          return {
            ...c,
            assignedSales:
              users.find((u) => u.id === c.assignedSalesId) || null,
            _count: {
              orders: orders.filter((o) => o.customerId === c.id).length,
              invoices: invoices.filter((inv) => inv.customerId === c.id).length,
            },
          };
        }
      ),
    },
    user: {
      findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        return (
          users.find((u) => {
            if (where.id && u.id !== where.id) return false;
            if (where.businessId && u.businessId !== where.businessId)
              return false;
            if (where.role && u.role !== where.role) return false;
            if (where.isActive !== undefined && u.isActive !== where.isActive)
              return false;
            if (where.deletedAt === null && u.deletedAt !== null) return false;
            return true;
          }) || null
        );
      }),
    },
    order: {
      count: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        return orders.filter((o) => {
          if (where.customerId && o.customerId !== where.customerId)
            return false;
          if (where.businessId && o.businessId !== where.businessId)
            return false;
          if (where.deletedAt === null && o.deletedAt !== null) return false;
          if (where.status && typeof where.status === 'object' && 'notIn' in where.status) {
            const notIn = (where.status as { notIn: OrderStatus[] }).notIn;
            if (notIn.includes(o.status)) return false;
          }
          return true;
        }).length;
      }),
      updateMany: vi.fn(
        async ({
          where,
          data,
        }: {
          where: Record<string, unknown>;
          data: { salesId: string };
        }) => {
          let count = 0;
          for (const o of orders) {
            if (where.customerId && o.customerId !== where.customerId) continue;
            if (where.businessId && o.businessId !== where.businessId) continue;
            if (where.deletedAt === null && o.deletedAt !== null) continue;
            if (where.status && typeof where.status === 'object' && 'notIn' in where.status) {
              const notIn = (where.status as { notIn: OrderStatus[] }).notIn;
              if (notIn.includes(o.status)) continue;
            }
            o.salesId = data.salesId;
            count++;
          }
          return { count };
        }
      ),
    },
    invoice: {
      count: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        return invoices.filter((inv) => {
          if (where.customerId && inv.customerId !== where.customerId)
            return false;
          if (where.businessId && inv.businessId !== where.businessId)
            return false;
          return true;
        }).length;
      }),
    },
    reminder: {
      updateMany: vi.fn(async () => ({ count: 0 })),
    },
    crmTask: {
      updateMany: vi.fn(async () => ({ count: 0 })),
    },
    auditLog: {
      create: vi.fn(
        async ({
          data,
        }: {
          data: {
            actorId: string | null;
            action: string;
            entityType: string;
            entityId: string;
            summary?: string | null;
            businessId?: string | null;
          };
        }) => {
          const item: MockAuditLog = {
            id: `audit_${Date.now()}`,
            businessId: data.businessId ?? null,
            actorId: data.actorId,
            action: data.action,
            entityType: data.entityType,
            entityId: data.entityId,
            summary: data.summary ?? null,
          };
          auditLogs.push(item);
          return item;
        }
      ),
    },
    $transaction: vi.fn(async (cb: (tx: unknown) => unknown) => {
      const { prisma } = await import('@/lib/db');
      return cb(prisma);
    }),
  },
}));

describe('Manajemen Pelanggan & CRM (T2.1 & Seksi 16.2, 17.4 d, 18.1)', () => {
  const APP_URL = 'http://localhost:3000';

  const superAdminCtx: contextModule.Ctx = {
    user: {
      id: 'super_admin_id',
      role: Role.SUPERADMIN,
      name: 'Super Administrator',
      businessId: null,
    },
    sessionId: 'sess_admin_1',
    role: Role.SUPERADMIN,
    businessId: 'biz_1',
    ip: '127.0.0.1',
  };

  const sales1Ctx: contextModule.Ctx = {
    user: {
      id: 'sales_user_1',
      role: Role.SALES,
      name: 'Sales Andi',
      businessId: 'biz_1',
    },
    sessionId: 'sess_sales_1',
    role: Role.SALES,
    businessId: 'biz_1',
    ip: '127.0.0.1',
  };

  const sales2Ctx: contextModule.Ctx = {
    user: {
      id: 'sales_user_2',
      role: Role.SALES,
      name: 'Sales Budi',
      businessId: 'biz_1',
    },
    sessionId: 'sess_sales_2',
    role: Role.SALES,
    businessId: 'biz_1',
    ip: '127.0.0.1',
  };

  let activeCtx: contextModule.Ctx = superAdminCtx;

  beforeEach(() => {
    customers = [];
    orders = [];
    invoices = [];
    auditLogs = [];
    users = [
      {
        id: 'super_admin_id',
        businessId: null,
        role: Role.SUPERADMIN,
        name: 'Super Administrator',
        username: 'admin',
        isActive: true,
        deletedAt: null,
      },
      {
        id: 'sales_user_1',
        businessId: 'biz_1',
        role: Role.SALES,
        name: 'Sales Andi',
        username: 'andi',
        isActive: true,
        deletedAt: null,
      },
      {
        id: 'sales_user_2',
        businessId: 'biz_1',
        role: Role.SALES,
        name: 'Sales Budi',
        username: 'budi',
        isActive: true,
        deletedAt: null,
      },
    ];
    activeCtx = superAdminCtx;
    vi.clearAllMocks();

    vi.spyOn(contextModule, 'requireContext').mockImplementation(
      async (_req, roles) => {
        if (roles && !roles.includes(activeCtx.role)) {
          throw new DomainError('FORBIDDEN', 'Akses ditolak', 403);
        }
        return activeCtx;
      }
    );
  });

  it('Super Admin dapat membuat pelanggan dengan kode unik kapital dan dicatat di audit log', async () => {
    activeCtx = superAdminCtx;

    const req = new NextRequest(`${APP_URL}/api/v1/customers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: APP_URL },
      body: JSON.stringify({
        code: 'terobos',
        name: 'Toko Terobos Jaya',
        contactName: 'Pak Hendra',
        phone: '08123456789',
        pipelineStage: 'PROSPECT',
        tags: ['grosir', 'jawa timur'],
        assignedSalesId: 'sales_user_1',
      }),
    });

    const res = await createCustomerHandler(req);
    expect(res.status).toBe(201);
    const body = await res.json();

    expect(body.ok).toBe(true);
    expect(body.data.code).toBe('TEROBOS'); // Huruf besar otomatis
    expect(body.data.name).toBe('Toko Terobos Jaya');
    expect(body.data.assignedSalesId).toBe('sales_user_1');
    expect(body.data.rev).toBe(0);

    // Verifikasi audit log
    const audit = auditLogs.find((a) => a.action === 'CUSTOMER_CREATE');
    expect(audit).toBeDefined();
    expect(audit?.entityId).toBe(body.data.id);
  });

  it('Sales membuat pelanggan: otomatis assignedSalesId = dirinya sendiri (Seksi 10.3)', async () => {
    activeCtx = sales1Ctx;

    const req = new NextRequest(`${APP_URL}/api/v1/customers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: APP_URL },
      body: JSON.stringify({
        code: 'BERKAH',
        name: 'Toko Berkah Utama',
        phone: '08567890123',
        assignedSalesId: 'sales_user_2', // Sales mencoba assign ke orang lain
      }),
    });

    const res = await createCustomerHandler(req);
    expect(res.status).toBe(201);
    const body = await res.json();

    expect(body.ok).toBe(true);
    // Otomatis dikunci ke sales1Ctx.user.id
    expect(body.data.assignedSalesId).toBe('sales_user_1');
  });

  it('ISOLASI SALES (Seksi 16.2 & 17.4 d): Sales hanya melihat customer miliknya, customer sales lain 404', async () => {
    customers.push(
      {
        id: 'cust_andi',
        businessId: 'biz_1',
        code: 'ANDI-1',
        name: 'Pelanggan Andi',
        contactName: null,
        phone: null,
        address: null,
        shippingAddress: null,
        billingAddress: null,
        npwp: null,
        assignedSalesId: 'sales_user_1',
        pipelineStage: PipelineStage.LEAD,
        tags: [],
        notes: null,
        rev: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      },
      {
        id: 'cust_budi',
        businessId: 'biz_1',
        code: 'BUDI-1',
        name: 'Pelanggan Budi',
        contactName: null,
        phone: null,
        address: null,
        shippingAddress: null,
        billingAddress: null,
        npwp: null,
        assignedSalesId: 'sales_user_2',
        pipelineStage: PipelineStage.DEAL,
        tags: [],
        notes: null,
        rev: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      }
    );

    // Sales 1 request GET /customers: hanya melihat cust_andi
    activeCtx = sales1Ctx;
    const req1 = new NextRequest(`${APP_URL}/api/v1/customers`);
    const res1 = await getCustomersHandler(req1);
    expect(res1.status).toBe(200);
    const body1 = await res1.json();
    expect(body1.data.length).toBe(1);
    expect(body1.data[0].id).toBe('cust_andi');

    // Sales 1 mencoba buka detail cust_budi -> 404 NOT_FOUND
    const reqDetailBudi = new NextRequest(
      `${APP_URL}/api/v1/customers/cust_budi`
    );
    const resDetailBudi = await getCustomerDetailHandler(reqDetailBudi, {
      params: Promise.resolve({ id: 'cust_budi' }),
    });
    expect(resDetailBudi.status).toBe(404);

    // Sales 1 mencoba PATCH cust_budi -> 404 NOT_FOUND
    const reqPatchBudi = new NextRequest(
      `${APP_URL}/api/v1/customers/cust_budi`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Origin: APP_URL },
        body: JSON.stringify({ rev: 0, name: 'Nama Bajakan' }),
      }
    );
    const resPatchBudi = await updateCustomerHandler(reqPatchBudi, {
      params: Promise.resolve({ id: 'cust_budi' }),
    });
    expect(resPatchBudi.status).toBe(404);

    // Sales 1 mencoba DELETE cust_budi -> 404 NOT_FOUND
    const reqDeleteBudi = new NextRequest(
      `${APP_URL}/api/v1/customers/cust_budi`,
      {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', Origin: APP_URL },
        body: JSON.stringify({ confirm: 'BUDI-1' }),
      }
    );
    const resDeleteBudi = await deleteCustomerHandler(reqDeleteBudi, {
      params: Promise.resolve({ id: 'cust_budi' }),
    });
    expect(resDeleteBudi.status).toBe(404);

    // Super Admin melihat kedua customer
    activeCtx = superAdminCtx;
    const saReq = new NextRequest(`${APP_URL}/api/v1/customers`);
    const saRes = await getCustomersHandler(saReq);
    expect(saRes.status).toBe(200);
    const saBody = await saRes.json();
    expect(saBody.data.length).toBe(2);
  });

  it('ISOLASI UNIT USAHA (Seksi 17.4 d): Pelanggan di Usaha B tidak dapat diakses dari Usaha A (404)', async () => {
    customers.push({
      id: 'cust_biz2',
      businessId: 'biz_2', // Usaha berbeda
      code: 'BIZ2-CUST',
      name: 'Pelanggan Usaha 2',
      contactName: null,
      phone: null,
      address: null,
      shippingAddress: null,
      billingAddress: null,
      npwp: null,
      assignedSalesId: null,
      pipelineStage: PipelineStage.LEAD,
      tags: [],
      notes: null,
      rev: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    });

    // Super Admin yang sedang aktif di biz_1 mencoba akses cust_biz2 -> 404
    activeCtx = superAdminCtx;
    const req = new NextRequest(`${APP_URL}/api/v1/customers/cust_biz2`);
    const res = await getCustomerDetailHandler(req, {
      params: Promise.resolve({ id: 'cust_biz2' }),
    });
    expect(res.status).toBe(404);
  });

  it('IMUTABILITAS KODE (Seksi 18.1 nomor 15): Kode pelanggan DITOLAK diubah bila sudah memiliki faktur/invoice (409)', async () => {
    customers.push({
      id: 'cust_invoiced',
      businessId: 'biz_1',
      code: 'CUST-INV',
      name: 'Pelanggan Berfaktur',
      contactName: null,
      phone: null,
      address: null,
      shippingAddress: null,
      billingAddress: null,
      npwp: null,
      assignedSalesId: 'sales_user_1',
      pipelineStage: PipelineStage.DEAL,
      tags: [],
      notes: null,
      rev: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    });

    // Tambahkan 1 invoice untuk customer ini
    invoices.push({
      id: 'inv_1',
      businessId: 'biz_1',
      customerId: 'cust_invoiced',
    });

    activeCtx = superAdminCtx;

    // Mencoba ubah kode dari CUST-INV ke CUST-NEW
    const req = new NextRequest(`${APP_URL}/api/v1/customers/cust_invoiced`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Origin: APP_URL },
      body: JSON.stringify({
        rev: 0,
        code: 'CUST-NEW',
      }),
    });

    const res = await updateCustomerHandler(req, {
      params: Promise.resolve({ id: 'cust_invoiced' }),
    });

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe('INVALID_STATE');
  });

  it('PENGUNCIAN OPTIMISTIK (rev): Menolak update jika rev tidak cocok (409 OPTIMISTIC_LOCK_ERROR)', async () => {
    customers.push({
      id: 'cust_lock',
      businessId: 'biz_1',
      code: 'LOCK-1',
      name: 'Pelanggan Lock',
      contactName: null,
      phone: null,
      address: null,
      shippingAddress: null,
      billingAddress: null,
      npwp: null,
      assignedSalesId: 'sales_user_1',
      pipelineStage: PipelineStage.LEAD,
      tags: [],
      notes: null,
      rev: 3, // Versi 3
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    });

    activeCtx = sales1Ctx;

    const req = new NextRequest(`${APP_URL}/api/v1/customers/cust_lock`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Origin: APP_URL },
      body: JSON.stringify({
        rev: 2, // Mengirimkan rev basi (stale)
        name: 'Nama Baru',
      }),
    });

    const res = await updateCustomerHandler(req, {
      params: Promise.resolve({ id: 'cust_lock' }),
    });

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe('OPTIMISTIC_LOCK_ERROR');
  });

  it('PENGALIHAN SALES (Seksi 18.1 nomor 16 & 18.2): Super Admin mengalihkan pelanggan dan memindahkan order berjalan', async () => {
    customers.push({
      id: 'cust_pindah',
      businessId: 'biz_1',
      code: 'PINDAH',
      name: 'Pelanggan Pindah',
      contactName: null,
      phone: null,
      address: null,
      shippingAddress: null,
      billingAddress: null,
      npwp: null,
      assignedSalesId: 'sales_user_1',
      pipelineStage: PipelineStage.DEAL,
      tags: [],
      notes: null,
      rev: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    });

    // 1 order berjalan status IN_PROCESS milik sales 1
    orders.push({
      id: 'order_open',
      businessId: 'biz_1',
      customerId: 'cust_pindah',
      salesId: 'sales_user_1',
      status: OrderStatus.IN_PROCESS,
      deletedAt: null,
    });

    // 1 order selesai status COMPLETED
    orders.push({
      id: 'order_done',
      businessId: 'biz_1',
      customerId: 'cust_pindah',
      salesId: 'sales_user_1',
      status: OrderStatus.COMPLETED,
      deletedAt: null,
    });

    // Sales mencoba panggil reassign -> 403 FORBIDDEN
    activeCtx = sales1Ctx;
    const salesReassignReq = new NextRequest(
      `${APP_URL}/api/v1/customers/cust_pindah/reassign`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: APP_URL },
        body: JSON.stringify({ salesId: 'sales_user_2' }),
      }
    );
    const salesReassignRes = await reassignCustomerHandler(salesReassignReq, {
      params: Promise.resolve({ id: 'cust_pindah' }),
    });
    expect(salesReassignRes.status).toBe(403);

    // Super Admin reassign ke sales 2 dengan moveOpenOrders = true
    activeCtx = superAdminCtx;
    const saReq = new NextRequest(
      `${APP_URL}/api/v1/customers/cust_pindah/reassign`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: APP_URL },
        body: JSON.stringify({
          salesId: 'sales_user_2',
          moveOpenOrders: true,
        }),
      }
    );
    const saRes = await reassignCustomerHandler(saReq, {
      params: Promise.resolve({ id: 'cust_pindah' }),
    });
    expect(saRes.status).toBe(200);

    // Verifikasi customer berpindah
    expect(
      customers.find((c) => c.id === 'cust_pindah')?.assignedSalesId
    ).toBe('sales_user_2');

    // Order berjalan berpindah ke sales 2
    expect(orders.find((o) => o.id === 'order_open')?.salesId).toBe(
      'sales_user_2'
    );
    // Order selesai tetap di sales 1
    expect(orders.find((o) => o.id === 'order_done')?.salesId).toBe(
      'sales_user_1'
    );

    // Verifikasi audit log
    const audit = auditLogs.find((a) => a.action === 'CUSTOMER_REASSIGN');
    expect(audit).toBeDefined();
  });

  it('PROTEKSI SOFT DELETE (Seksi 18.1 nomor 19): Ditolak 409 HAS_ACTIVE_ORDERS jika masih ada order berjalan', async () => {
    customers.push({
      id: 'cust_active_order',
      businessId: 'biz_1',
      code: 'AKTIF-1',
      name: 'Pelanggan Order Aktif',
      contactName: null,
      phone: null,
      address: null,
      shippingAddress: null,
      billingAddress: null,
      npwp: null,
      assignedSalesId: 'sales_user_1',
      pipelineStage: PipelineStage.DEAL,
      tags: [],
      notes: null,
      rev: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    });

    // Tambahkan order aktif status AWAITING_DP
    orders.push({
      id: 'order_1',
      businessId: 'biz_1',
      customerId: 'cust_active_order',
      salesId: 'sales_user_1',
      status: OrderStatus.AWAITING_DP,
      deletedAt: null,
    });

    activeCtx = superAdminCtx;

    // Coba hapus dengan konfirmasi kode yang valid
    const req = new NextRequest(
      `${APP_URL}/api/v1/customers/cust_active_order`,
      {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', Origin: APP_URL },
        body: JSON.stringify({ confirm: 'AKTIF-1' }),
      }
    );

    const res = await deleteCustomerHandler(req, {
      params: Promise.resolve({ id: 'cust_active_order' }),
    });

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe('HAS_ACTIVE_ORDERS');

    // Ubah status order menjadi COMPLETED
    orders[0].status = OrderStatus.COMPLETED;

    // Hapus kembali dengan request baru -> Berhasil
    const req2 = new NextRequest(
      `${APP_URL}/api/v1/customers/cust_active_order`,
      {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', Origin: APP_URL },
        body: JSON.stringify({ confirm: 'AKTIF-1' }),
      }
    );

    const res2 = await deleteCustomerHandler(req2, {
      params: Promise.resolve({ id: 'cust_active_order' }),
    });
    expect(res2.status).toBe(200);
    expect(
      customers.find((c) => c.id === 'cust_active_order')?.deletedAt
    ).not.toBeNull();
  });

  it('KEBOCORAN KUNCI RAHASIA (Seksi 17.4 a): Respons GET /customers untuk Sales tidak membocorkan kunci rahasia', async () => {
    customers.push({
      id: 'cust_leak_test',
      businessId: 'biz_1',
      code: 'LEAK-TEST',
      name: 'Pelanggan Bebas Bocor',
      contactName: 'PIC',
      phone: '08123',
      address: 'Alamat',
      shippingAddress: null,
      billingAddress: null,
      npwp: null,
      assignedSalesId: 'sales_user_1',
      pipelineStage: PipelineStage.LEAD,
      tags: ['test'],
      notes: 'Catatan',
      rev: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    });

    activeCtx = sales1Ctx;

    // Test list
    const listReq = new NextRequest(`${APP_URL}/api/v1/customers`);
    const listRes = await getCustomersHandler(listReq);
    const listJson = await listRes.json();
    expect(() => assertNoSecretKeys(listJson)).not.toThrow();

    // Test detail
    const detailReq = new NextRequest(
      `${APP_URL}/api/v1/customers/cust_leak_test`
    );
    const detailRes = await getCustomerDetailHandler(detailReq, {
      params: Promise.resolve({ id: 'cust_leak_test' }),
    });
    const detailJson = await detailRes.json();
    expect(() => assertNoSecretKeys(detailJson)).not.toThrow();
  });
});
