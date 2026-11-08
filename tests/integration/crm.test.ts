import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET as getTimelineHandler } from '@/app/api/v1/customers/[id]/timeline/route';
import {
  GET as getInteractionsHandler,
  POST as createInteractionHandler,
} from '@/app/api/v1/customers/[id]/interactions/route';
import {
  GET as getTasksHandler,
  POST as createTaskHandler,
} from '@/app/api/v1/crm/tasks/route';
import {
  GET as getTaskDetailHandler,
  PATCH as updateTaskHandler,
  DELETE as deleteTaskHandler,
} from '@/app/api/v1/crm/tasks/[id]/route';
import { Role, PipelineStage, OrderStatus, InteractionType } from '@prisma/client';
import { DomainError } from '@/lib/domain/money';
import * as contextModule from '@/lib/auth/context';
import { assertNoSecretKeys } from '../helpers/leak';

interface MockCustomer {
  id: string;
  businessId: string;
  code: string;
  name: string;
  assignedSalesId: string | null;
  pipelineStage: PipelineStage;
  deletedAt: Date | null;
}

interface MockUser {
  id: string;
  businessId: string | null;
  role: Role;
  name: string;
  username: string;
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

interface MockOrder {
  id: string;
  businessId: string;
  customerId: string;
  salesId: string;
  orderNo: string | null;
  orderDate: Date;
  status: OrderStatus;
  grandTotal: bigint;
  deletedAt: Date | null;
  createdAt: Date;
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
let interactions: MockCrmInteraction[] = [];
let tasks: MockCrmTask[] = [];
let orders: MockOrder[] = [];
let auditLogs: MockAuditLog[] = [];

vi.mock('@/lib/db', () => ({
  prisma: {
    customer: {
      findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        return (
          customers.find((c) => {
            if (where.id && c.id !== where.id) return false;
            if (where.businessId && c.businessId !== where.businessId) return false;
            if (where.deletedAt === null && c.deletedAt !== null) return false;
            if (where.assignedSalesId && c.assignedSalesId !== where.assignedSalesId)
              return false;
            return true;
          }) || null
        );
      }),
    },
    user: {
      findMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        const idFilter = where.id as { in: string[] } | undefined;
        if (idFilter?.in) {
          return users.filter((u) => idFilter.in.includes(u.id));
        }
        return users;
      }),
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
        return users.find((u) => u.id === where.id) || null;
      }),
    },
    crmInteraction: {
      findMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        return interactions
          .filter((i) => {
            if (where.businessId && i.businessId !== where.businessId) return false;
            if (where.customerId && i.customerId !== where.customerId) return false;
            return true;
          })
          .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime());
      }),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const item: MockCrmInteraction = {
          id: `interaction-${interactions.length + 1}`,
          businessId: data.businessId as string,
          customerId: data.customerId as string,
          salesId: data.salesId as string,
          type: data.type as InteractionType,
          summary: data.summary as string,
          occurredAt: (data.occurredAt as Date) || new Date(),
          nextFollowUpAt: (data.nextFollowUpAt as Date) || null,
          createdAt: new Date(),
        };
        interactions.push(item);
        return item;
      }),
    },
    crmTask: {
      findMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        return tasks
          .filter((t) => {
            if (where.businessId && t.businessId !== where.businessId) return false;
            if (where.customerId && t.customerId !== where.customerId) return false;
            if (where.assignedToId && t.assignedToId !== where.assignedToId)
              return false;
            if (where.doneAt) {
              const doneFilter = where.doneAt as Record<string, unknown>;
              if ('not' in doneFilter && t.doneAt === null) return false;
            } else if (where.doneAt === null) {
              if (t.doneAt !== null) return false;
            }
            if (where.dueAt) {
              const dueFilter = where.dueAt as Record<string, Date>;
              if (dueFilter.gte && t.dueAt < dueFilter.gte) return false;
              if (dueFilter.lt && t.dueAt >= dueFilter.lt) return false;
            }
            return true;
          })
          .map((t) => {
            const cust = customers.find((c) => c.id === t.customerId);
            return {
              ...t,
              customer: cust ? { id: cust.id, code: cust.code, name: cust.name, phone: null } : null,
            };
          });
      }),
      findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        const found = tasks.find((t) => {
          if (where.id && t.id !== where.id) return false;
          if (where.businessId && t.businessId !== where.businessId) return false;
          return true;
        });
        if (!found) return null;
        const cust = customers.find((c) => c.id === found.customerId);
        return {
          ...found,
          customer: cust ? { id: cust.id, code: cust.code, name: cust.name, phone: null } : null,
        };
      }),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const item: MockCrmTask = {
          id: `task-${tasks.length + 1}`,
          businessId: data.businessId as string,
          customerId: data.customerId as string,
          assignedToId: data.assignedToId as string,
          title: data.title as string,
          dueAt: data.dueAt as Date,
          doneAt: null,
          createdAt: new Date(),
        };
        tasks.push(item);
        const cust = customers.find((c) => c.id === item.customerId);
        return {
          ...item,
          customer: cust ? { id: cust.id, code: cust.code, name: cust.name } : null,
        };
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const idx = tasks.findIndex((t) => t.id === where.id);
        if (idx === -1) throw new Error('Task not found');
        tasks[idx] = {
          ...tasks[idx],
          ...(data.doneAt !== undefined ? { doneAt: data.doneAt as Date | null } : {}),
          ...(data.title !== undefined ? { title: data.title as string } : {}),
          ...(data.dueAt !== undefined ? { dueAt: data.dueAt as Date } : {}),
          ...(data.assignedToId !== undefined ? { assignedToId: data.assignedToId as string } : {}),
        };
        const cust = customers.find((c) => c.id === tasks[idx].customerId);
        return {
          ...tasks[idx],
          customer: cust ? { id: cust.id, code: cust.code, name: cust.name } : null,
        };
      }),
      delete: vi.fn(async ({ where }: { where: { id: string } }) => {
        const idx = tasks.findIndex((t) => t.id === where.id);
        if (idx !== -1) {
          tasks.splice(idx, 1);
        }
        return { id: where.id };
      }),
    },
    order: {
      findMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        return orders
          .filter((o) => {
            if (where.businessId && o.businessId !== where.businessId) return false;
            if (where.customerId && o.customerId !== where.customerId) return false;
            if (where.deletedAt === null && o.deletedAt !== null) return false;
            return true;
          })
          .sort((a, b) => b.orderDate.getTime() - a.orderDate.getTime());
      }),
    },
    auditLog: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const log: MockAuditLog = {
          id: `audit-${auditLogs.length + 1}`,
          businessId: (data.businessId as string) || null,
          actorId: (data.actorId as string) || null,
          action: data.action as string,
          entityType: data.entityType as string,
          entityId: data.entityId as string,
          summary: (data.summary as string) || null,
        };
        auditLogs.push(log);
        return log;
      }),
    },
    $transaction: vi.fn(async (cb: (tx: unknown) => Promise<unknown>) => {
      // Prisma transaction mock
      return cb({
        crmInteraction: {
          create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
            const item: MockCrmInteraction = {
              id: `interaction-${interactions.length + 1}`,
              businessId: data.businessId as string,
              customerId: data.customerId as string,
              salesId: data.salesId as string,
              type: data.type as InteractionType,
              summary: data.summary as string,
              occurredAt: (data.occurredAt as Date) || new Date(),
              nextFollowUpAt: (data.nextFollowUpAt as Date) || null,
              createdAt: new Date(),
            };
            interactions.push(item);
            return item;
          }),
        },
        crmTask: {
          create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
            const item: MockCrmTask = {
              id: `task-${tasks.length + 1}`,
              businessId: data.businessId as string,
              customerId: data.customerId as string,
              assignedToId: data.assignedToId as string,
              title: data.title as string,
              dueAt: data.dueAt as Date,
              doneAt: null,
              createdAt: new Date(),
            };
            tasks.push(item);
            return item;
          }),
        },
        auditLog: {
          create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
            const log: MockAuditLog = {
              id: `audit-${auditLogs.length + 1}`,
              businessId: (data.businessId as string) || null,
              actorId: (data.actorId as string) || null,
              action: data.action as string,
              entityType: data.entityType as string,
              entityId: data.entityId as string,
              summary: (data.summary as string) || null,
            };
            auditLogs.push(log);
            return log;
          }),
        },
      });
    }),
  },
}));

describe('T2.2: CRM Integration Tests', () => {
  const APP_URL = 'http://localhost:3000';
  const businessA = 'biz-a';
  const businessB = 'biz-b';

  const userSA = {
    id: 'user-sa',
    name: 'Super Owner',
    username: 'superowner',
    role: Role.SUPERADMIN,
    businessId: null,
  };

  const userSales1 = {
    id: 'user-sales-1',
    name: 'Sales Budi',
    username: 'salesbudi',
    role: Role.SALES,
    businessId: businessA,
  };

  const userSales2 = {
    id: 'user-sales-2',
    name: 'Sales Citra',
    username: 'salescitra',
    role: Role.SALES,
    businessId: businessA,
  };

  const superAdminCtx: contextModule.Ctx = {
    user: userSA,
    sessionId: 'sess-sa',
    role: Role.SUPERADMIN,
    businessId: businessA,
    ip: '127.0.0.1',
  };

  const sales1Ctx: contextModule.Ctx = {
    user: userSales1,
    sessionId: 'sess-sales-1',
    role: Role.SALES,
    businessId: businessA,
    ip: '127.0.0.1',
  };

  const sales2Ctx: contextModule.Ctx = {
    user: userSales2,
    sessionId: 'sess-sales-2',
    role: Role.SALES,
    businessId: businessA,
    ip: '127.0.0.1',
  };

  const superAdminBizBCtx: contextModule.Ctx = {
    user: userSA,
    sessionId: 'sess-sa-b',
    role: Role.SUPERADMIN,
    businessId: businessB,
    ip: '127.0.0.1',
  };

  let activeCtx: contextModule.Ctx;

  beforeEach(() => {
    customers = [
      {
        id: 'cust-1',
        businessId: businessA,
        code: 'CUST-001',
        name: 'Toko Makmur Sentosa',
        assignedSalesId: 'user-sales-1',
        pipelineStage: PipelineStage.PROSPECT,
        deletedAt: null,
      },
      {
        id: 'cust-2',
        businessId: businessA,
        code: 'CUST-002',
        name: 'Warung Berkah Abadi',
        assignedSalesId: 'user-sales-2',
        pipelineStage: PipelineStage.LEAD,
        deletedAt: null,
      },
    ];

    users = [userSA, userSales1, userSales2];
    interactions = [];
    tasks = [];
    orders = [];
    auditLogs = [];

    activeCtx = sales1Ctx;

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

  describe('1. GET /customers/:id/timeline', () => {
    it('menggabungkan interaksi dan order secara kronologis menurun dan mengonversi BigInt ke number', async () => {
      activeCtx = sales1Ctx;

      // Siapkan event dengan urutan tanggal berbeda
      // 1. Interaksi pertama: 1 Nov 2026
      interactions.push({
        id: 'inter-1',
        businessId: businessA,
        customerId: 'cust-1',
        salesId: 'user-sales-1',
        type: InteractionType.CALL,
        summary: 'Panggilan perkenalan katalog',
        occurredAt: new Date('2026-11-01T10:00:00Z'),
        nextFollowUpAt: null,
        createdAt: new Date('2026-11-01T10:05:00Z'),
      });

      // 2. Order pertama: 5 Nov 2026
      orders.push({
        id: 'order-1',
        businessId: businessA,
        customerId: 'cust-1',
        salesId: 'user-sales-1',
        orderNo: 'CUST-001/INV/05/11/2026/0001',
        orderDate: new Date('2026-11-05T14:00:00Z'),
        status: OrderStatus.COMPLETED,
        grandTotal: BigInt(750000), // Rp 750.000 (cents)
        deletedAt: null,
        createdAt: new Date('2026-11-05T14:10:00Z'),
      });

      // 3. Interaksi kedua: 7 Nov 2026
      interactions.push({
        id: 'inter-2',
        businessId: businessA,
        customerId: 'cust-1',
        salesId: 'user-sales-1',
        type: InteractionType.WHATSAPP,
        summary: 'Follow-up repeat order via WA',
        occurredAt: new Date('2026-11-07T09:00:00Z'),
        nextFollowUpAt: new Date('2026-11-10T09:00:00Z'),
        createdAt: new Date('2026-11-07T09:02:00Z'),
      });

      const req = new NextRequest(
        'http://localhost:3000/api/v1/customers/cust-1/timeline',
        { method: 'GET' }
      );

      const res = await getTimelineHandler(req, {
        params: Promise.resolve({ id: 'cust-1' }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.ok).toBe(true);

      const items = json.data.timeline;
      expect(items).toHaveLength(3);

      // Urutan waktu menurun: 7 Nov (inter-2) -> 5 Nov (order-1) -> 1 Nov (inter-1)
      expect(items[0].kind).toBe('INTERACTION');
      expect(items[0].interaction.summary).toBe('Follow-up repeat order via WA');
      expect(items[0].interaction.sales.name).toBe('Sales Budi');

      expect(items[1].kind).toBe('ORDER');
      expect(items[1].order.orderNo).toBe('CUST-001/INV/05/11/2026/0001');
      expect(typeof items[1].order.grandTotal).toBe('number');
      expect(items[1].order.grandTotal).toBe(750000); // 75000000 / 100

      expect(items[2].kind).toBe('INTERACTION');
      expect(items[2].interaction.summary).toBe('Panggilan perkenalan katalog');

      // Uji kebocoran rahasia
      assertNoSecretKeys(json);
    });

    it('sales tidak bisa melihat timeline customer milik sales lain (404)', async () => {
      // Sales 2 mencoba melihat timeline customer milik Sales 1
      activeCtx = sales2Ctx;

      const req = new NextRequest(
        'http://localhost:3000/api/v1/customers/cust-1/timeline',
        { method: 'GET' }
      );

      const res = await getTimelineHandler(req, {
        params: Promise.resolve({ id: 'cust-1' }),
      });

      expect(res.status).toBe(404);
      const json = await res.json();
      expect(json.ok).toBe(false);
      expect(json.error.code).toBe('NOT_FOUND');
    });
  });

  describe('2. POST /customers/:id/interactions', () => {
    it('mencatat interaksi dan otomatis membuat CrmTask jika nextFollowUpAt diisi', async () => {
      activeCtx = sales1Ctx;

      const followUpDate = '2026-11-12T10:00:00.000Z';
      const req = new NextRequest(
        'http://localhost:3000/api/v1/customers/cust-1/interactions',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Origin: APP_URL },
          body: JSON.stringify({
            type: 'VISIT',
            summary: 'Kunjungan ke toko pelanggan, mendiskusikan penawaran promo akhir tahun',
            occurredAt: '2026-11-08T08:30:00.000Z',
            nextFollowUpAt: followUpDate,
          }),
        }
      );

      const res = await createInteractionHandler(req, {
        params: Promise.resolve({ id: 'cust-1' }),
      });

      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.ok).toBe(true);
      expect(json.data.interaction.type).toBe('VISIT');
      expect(json.data.task).not.toBeNull();
      expect(json.data.task.assignedToId).toBe('user-sales-1');
      expect(json.data.task.title).toContain('Follow-up: Kunjungan');
      expect(new Date(json.data.task.dueAt).toISOString()).toBe(followUpDate);

      // Pastikan CrmTask tersimpan di array tasks
      expect(tasks).toHaveLength(1);
      expect(tasks[0].customerId).toBe('cust-1');
      expect(tasks[0].assignedToId).toBe('user-sales-1');

      // Pastikan audit log tercatat
      expect(auditLogs.some((l) => l.action === 'CRM_INTERACTION_CREATE')).toBe(true);
      expect(auditLogs.some((l) => l.action === 'CRM_TASK_CREATE')).toBe(true);

      // Uji kebocoran rahasia
      assertNoSecretKeys(json);
    });

    it('hanya membuat interaksi tanpa CrmTask jika nextFollowUpAt tidak diisi', async () => {
      activeCtx = sales1Ctx;

      const req = new NextRequest(
        'http://localhost:3000/api/v1/customers/cust-1/interactions',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Origin: APP_URL },
          body: JSON.stringify({
            type: 'EMAIL',
            summary: 'Kirim invoice via email',
          }),
        }
      );

      const res = await createInteractionHandler(req, {
        params: Promise.resolve({ id: 'cust-1' }),
      });

      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.ok).toBe(true);
      expect(json.data.task).toBeNull();
      expect(tasks).toHaveLength(0);
    });

    it('sales tidak bisa mencatat interaksi pada customer sales lain (404)', async () => {
      activeCtx = sales2Ctx;

      const req = new NextRequest(
        'http://localhost:3000/api/v1/customers/cust-1/interactions',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Origin: APP_URL },
          body: JSON.stringify({
            type: 'CALL',
            summary: 'Panggilan ilegal',
          }),
        }
      );

      const res = await createInteractionHandler(req, {
        params: Promise.resolve({ id: 'cust-1' }),
      });

      expect(res.status).toBe(404);
    });
  });

  describe('3. CRM Tasks CRUD & Status Filtering', () => {
    it('membuat manual task dan memfilter status (PENDING, OVERDUE, DONE)', async () => {
      activeCtx = sales1Ctx;

      // 1. Buat task manual
      const reqPost = new NextRequest('http://localhost:3000/api/v1/crm/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: APP_URL },
        body: JSON.stringify({
          customerId: 'cust-1',
          title: 'Konfirmasi stok produk A',
          dueAt: '2026-11-15T10:00:00.000Z',
        }),
      });

      const resPost = await createTaskHandler(reqPost);
      expect(resPost.status).toBe(201);
      const jsonPost = await resPost.json();
      expect(jsonPost.ok).toBe(true);
      expect(jsonPost.data.title).toBe('Konfirmasi stok produk A');
      expect(jsonPost.data.assignedToId).toBe('user-sales-1');

      // 2. Tambahkan task lain secara manual (1 overdue, 1 done)
      tasks.push({
        id: 'task-overdue',
        businessId: businessA,
        customerId: 'cust-1',
        assignedToId: 'user-sales-1',
        title: 'Tugas yang sudah lewat tenggat',
        dueAt: new Date(Date.now() - 86400000 * 2), // 2 hari lalu
        doneAt: null,
        createdAt: new Date(),
      });

      tasks.push({
        id: 'task-done',
        businessId: businessA,
        customerId: 'cust-1',
        assignedToId: 'user-sales-1',
        title: 'Tugas yang sudah selesai',
        dueAt: new Date(Date.now() - 86400000),
        doneAt: new Date(Date.now() - 40000000),
        createdAt: new Date(),
      });

      // 3. Query filter PENDING
      const reqPending = new NextRequest(
        'http://localhost:3000/api/v1/crm/tasks?status=PENDING',
        { method: 'GET' }
      );
      const resPending = await getTasksHandler(reqPending);
      const jsonPending = await resPending.json();
      expect(jsonPending.ok).toBe(true);
      expect(jsonPending.data.every((t: { computedStatus: string }) => t.computedStatus === 'PENDING')).toBe(true);
      expect(jsonPending.data.some((t: { title: string }) => t.title === 'Konfirmasi stok produk A')).toBe(true);

      // 4. Query filter OVERDUE
      const reqOverdue = new NextRequest(
        'http://localhost:3000/api/v1/crm/tasks?status=OVERDUE',
        { method: 'GET' }
      );
      const resOverdue = await getTasksHandler(reqOverdue);
      const jsonOverdue = await resOverdue.json();
      expect(jsonOverdue.ok).toBe(true);
      expect(jsonOverdue.data.every((t: { computedStatus: string }) => t.computedStatus === 'OVERDUE')).toBe(true);
      expect(jsonOverdue.data.some((t: { title: string }) => t.title === 'Tugas yang sudah lewat tenggat')).toBe(true);

      // 5. Query filter DONE
      const reqDone = new NextRequest(
        'http://localhost:3000/api/v1/crm/tasks?status=DONE',
        { method: 'GET' }
      );
      const resDone = await getTasksHandler(reqDone);
      const jsonDone = await resDone.json();
      expect(jsonDone.ok).toBe(true);
      expect(jsonDone.data.every((t: { computedStatus: string }) => t.computedStatus === 'DONE')).toBe(true);
      expect(jsonDone.data.some((t: { title: string }) => t.title === 'Tugas yang sudah selesai')).toBe(true);
    });

    it('memperbarui status tugas (done: true / false) dan menghapus tugas', async () => {
      activeCtx = sales1Ctx;

      tasks.push({
        id: 'task-test-update',
        businessId: businessA,
        customerId: 'cust-1',
        assignedToId: 'user-sales-1',
        title: 'Tugas yang akan dicentang selesai',
        dueAt: new Date('2026-11-20T10:00:00Z'),
        doneAt: null,
        createdAt: new Date(),
      });

      // 1. Centang selesai: PATCH { done: true }
      const reqPatchDone = new NextRequest(
        'http://localhost:3000/api/v1/crm/tasks/task-test-update',
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Origin: APP_URL },
          body: JSON.stringify({ done: true }),
        }
      );

      const resPatchDone = await updateTaskHandler(reqPatchDone, {
        params: Promise.resolve({ id: 'task-test-update' }),
      });
      expect(resPatchDone.status).toBe(200);
      const jsonPatchDone = await resPatchDone.json();
      expect(jsonPatchDone.ok).toBe(true);
      expect(jsonPatchDone.data.doneAt).not.toBeNull();

      // 2. Batalkan selesai: PATCH { done: false }
      const reqPatchUndone = new NextRequest(
        'http://localhost:3000/api/v1/crm/tasks/task-test-update',
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Origin: APP_URL },
          body: JSON.stringify({ done: false }),
        }
      );

      const resPatchUndone = await updateTaskHandler(reqPatchUndone, {
        params: Promise.resolve({ id: 'task-test-update' }),
      });
      expect(resPatchUndone.status).toBe(200);
      const jsonPatchUndone = await resPatchUndone.json();
      expect(jsonPatchUndone.ok).toBe(true);
      expect(jsonPatchUndone.data.doneAt).toBeNull();

      // 3. Hapus tugas: DELETE
      const reqDelete = new NextRequest(
        'http://localhost:3000/api/v1/crm/tasks/task-test-update',
        { method: 'DELETE', headers: { Origin: APP_URL } }
      );
      const resDelete = await deleteTaskHandler(reqDelete, {
        params: Promise.resolve({ id: 'task-test-update' }),
      });
      expect(resDelete.status).toBe(200);
      const jsonDelete = await resDelete.json();
      expect(jsonDelete.ok).toBe(true);
      expect(tasks.some((t) => t.id === 'task-test-update')).toBe(false);
    });
  });

  describe('4. Isolasi Sales & Isolasi Multi-Usaha (17.4 d & 16.2)', () => {
    beforeEach(() => {
      tasks.push({
        id: 'task-sales-1',
        businessId: businessA,
        customerId: 'cust-1',
        assignedToId: 'user-sales-1',
        title: 'Tugas rahasia Sales 1',
        dueAt: new Date('2026-11-20T10:00:00Z'),
        doneAt: null,
        createdAt: new Date(),
      });
    });

    it('sales 2 hanya melihat tugas miliknya pada GET /crm/tasks meskipun filter salesId diisi', async () => {
      activeCtx = sales2Ctx;

      // Sales 2 mencoba minta tugas Sales 1 lewat query param
      const req = new NextRequest(
        'http://localhost:3000/api/v1/crm/tasks?salesId=user-sales-1',
        { method: 'GET' }
      );

      const res = await getTasksHandler(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.ok).toBe(true);
      // Sales 2 tidak boleh melihat tugas milik Sales 1
      expect(json.data.some((t: { id: string }) => t.id === 'task-sales-1')).toBe(false);
    });

    it('sales 2 mendapat 404 ketika mengakses, mengubah, atau menghapus tugas Sales 1', async () => {
      activeCtx = sales2Ctx;

      // GET detail tugas Sales 1
      const reqGet = new NextRequest(
        'http://localhost:3000/api/v1/crm/tasks/task-sales-1',
        { method: 'GET' }
      );
      const resGet = await getTaskDetailHandler(reqGet, {
        params: Promise.resolve({ id: 'task-sales-1' }),
      });
      expect(resGet.status).toBe(404);

      // PATCH tugas Sales 1
      const reqPatch = new NextRequest(
        'http://localhost:3000/api/v1/crm/tasks/task-sales-1',
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Origin: APP_URL },
          body: JSON.stringify({ done: true }),
        }
      );
      const resPatch = await updateTaskHandler(reqPatch, {
        params: Promise.resolve({ id: 'task-sales-1' }),
      });
      expect(resPatch.status).toBe(404);

      // DELETE tugas Sales 1
      const reqDelete = new NextRequest(
        'http://localhost:3000/api/v1/crm/tasks/task-sales-1',
        { method: 'DELETE', headers: { Origin: APP_URL } }
      );
      const resDelete = await deleteTaskHandler(reqDelete, {
        params: Promise.resolve({ id: 'task-sales-1' }),
      });
      expect(resDelete.status).toBe(404);
    });

    it('isolasi multi-usaha: user di Usaha B tidak bisa mengakses tugas di Usaha A (404)', async () => {
      activeCtx = superAdminBizBCtx;

      const reqGet = new NextRequest(
        'http://localhost:3000/api/v1/crm/tasks/task-sales-1',
        { method: 'GET' }
      );
      const resGet = await getTaskDetailHandler(reqGet, {
        params: Promise.resolve({ id: 'task-sales-1' }),
      });
      expect(resGet.status).toBe(404);
    });
  });
});
