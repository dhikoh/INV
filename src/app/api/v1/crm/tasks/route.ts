import { z } from 'zod';
import { Prisma, Role } from '@prisma/client';
import { withApi } from '@/lib/api/withApi';
import { prisma } from '@/lib/db';
import { DomainError } from '@/lib/domain/money';
import { requireBusiness } from '@/lib/auth/context';
import { customerScope } from '@/lib/services/scopes';
import { audit } from '@/lib/audit/audit';

const QueryTasksSchema = z.object({
  status: z.enum(['ALL', 'PENDING', 'DONE', 'OVERDUE']).default('ALL'),
  customerId: z.string().optional(),
  salesId: z.string().optional(),
});

const CreateTaskSchema = z.object({
  customerId: z.string().min(1, 'Pelanggan wajib dipilih'),
  title: z
    .string()
    .trim()
    .min(1, 'Judul tugas wajib diisi')
    .max(200, 'Judul tugas maksimal 200 karakter'),
  dueAt: z.coerce.date(),
  assignedToId: z.string().optional().nullable(),
});

// GET /api/v1/crm/tasks - Daftar tugas CRM
export const GET = withApi(
  {
    roles: [Role.SUPERADMIN, Role.SALES],
    query: QueryTasksSchema,
  },
  async ({ ctx, query }) => {
    const businessId = requireBusiness(ctx);
    const now = new Date();

    const where: Prisma.CrmTaskWhereInput = {
      businessId,
    };

    // Filter hak akses sales: Sales HANYA boleh melihat tugas miliknya sendiri
    if (ctx.role === Role.SALES) {
      where.assignedToId = ctx.user.id;
    } else if (query?.salesId) {
      where.assignedToId = query.salesId;
    }

    if (query?.customerId) {
      where.customerId = query.customerId;
    }

    const status = query?.status ?? 'ALL';
    if (status === 'DONE') {
      where.doneAt = { not: null };
    } else if (status === 'PENDING') {
      where.doneAt = null;
      where.dueAt = { gte: now };
    } else if (status === 'OVERDUE') {
      where.doneAt = null;
      where.dueAt = { lt: now };
    }

    const tasks = await prisma.crmTask.findMany({
      where,
      include: {
        customer: {
          select: {
            id: true,
            code: true,
            name: true,
            phone: true,
          },
        },
      },
      orderBy:
        status === 'DONE'
          ? [{ doneAt: 'desc' }, { dueAt: 'desc' }]
          : [{ dueAt: 'asc' }],
    });

    // Ambil data penanggung jawab (user)
    const assignedUserIds = Array.from(
      new Set(tasks.map((t) => t.assignedToId))
    );
    const users =
      assignedUserIds.length > 0
        ? await prisma.user.findMany({
            where: { id: { in: assignedUserIds } },
            select: { id: true, name: true, username: true },
          })
        : [];
    const userMap = new Map(users.map((u) => [u.id, u]));

    const data = tasks.map((t) => {
      const isDone = t.doneAt !== null;
      const isOverdue = !isDone && t.dueAt < now;
      let computedStatus: 'DONE' | 'OVERDUE' | 'PENDING' = 'PENDING';
      if (isDone) computedStatus = 'DONE';
      else if (isOverdue) computedStatus = 'OVERDUE';

      return {
        ...t,
        computedStatus,
        assignedTo: userMap.get(t.assignedToId) || null,
      };
    });

    return {
      data,
    };
  }
);

// POST /api/v1/crm/tasks - Buat tugas follow-up CRM manual
export const POST = withApi(
  {
    roles: [Role.SUPERADMIN, Role.SALES],
    body: CreateTaskSchema,
  },
  async ({ ctx, body }) => {
    const businessId = requireBusiness(ctx);
    const scope = customerScope(ctx, businessId);

    // 1. Verifikasi pelanggan ada dan masuk scope hak akses
    const customer = await prisma.customer.findFirst({
      where: {
        ...scope,
        id: body.customerId,
      },
    });

    if (!customer) {
      throw new DomainError('NOT_FOUND', 'Pelanggan tidak ditemukan', 404);
    }

    // 2. Tentukan assignedToId (Sales hanya boleh membuat untuk dirinya sendiri)
    const assignedToId =
      ctx.role === Role.SALES
        ? ctx.user.id
        : body.assignedToId || customer.assignedSalesId || ctx.user.id;

    // 3. Simpan tugas CRM
    const task = await prisma.crmTask.create({
      data: {
        businessId,
        customerId: customer.id,
        assignedToId,
        title: body.title,
        dueAt: body.dueAt,
      },
      include: {
        customer: {
          select: {
            id: true,
            code: true,
            name: true,
          },
        },
      },
    });

    await audit(prisma, ctx, {
      action: 'CRM_TASK_CREATE',
      entityType: 'CrmTask',
      entityId: task.id,
      businessId,
      summary: `Buat tugas CRM "${task.title}" untuk pelanggan ${customer.name}`,
      after: task,
    });

    return {
      status: 201,
      data: task,
    };
  }
);
