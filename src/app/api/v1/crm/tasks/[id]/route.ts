import { z } from 'zod';
import { Role } from '@prisma/client';
import { withApi } from '@/lib/api/withApi';
import { prisma } from '@/lib/db';
import { DomainError } from '@/lib/domain/money';
import { requireBusiness } from '@/lib/auth/context';
import { audit } from '@/lib/audit/audit';

const UpdateTaskSchema = z
  .object({
    done: z.boolean().optional(),
    title: z
      .string()
      .trim()
      .min(1, 'Judul tugas minimal 1 karakter')
      .max(200, 'Judul tugas maksimal 200 karakter')
      .optional(),
    dueAt: z.coerce.date().optional(),
    assignedToId: z.string().optional().nullable(),
  })
  .strict();

// GET /api/v1/crm/tasks/:id - Ambil detail tugas CRM
export const GET = withApi(
  {
    roles: [Role.SUPERADMIN, Role.SALES],
  },
  async ({ ctx, params }) => {
    const businessId = requireBusiness(ctx);

    const task = await prisma.crmTask.findFirst({
      where: {
        id: params.id,
        businessId,
      },
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
    });

    if (!task) {
      throw new DomainError('NOT_FOUND', 'Tugas tidak ditemukan', 404);
    }

    // Sales isolasi: 404 jika bukan tugas miliknya
    if (ctx.role === Role.SALES && task.assignedToId !== ctx.user.id) {
      throw new DomainError('NOT_FOUND', 'Tugas tidak ditemukan', 404);
    }

    const assignedUser = await prisma.user.findUnique({
      where: { id: task.assignedToId },
      select: { id: true, name: true, username: true },
    });

    return {
      data: {
        ...task,
        assignedTo: assignedUser,
      },
    };
  }
);

// PATCH /api/v1/crm/tasks/:id - Perbarui tugas CRM (misal centang selesai atau ubah tenggat)
export const PATCH = withApi(
  {
    roles: [Role.SUPERADMIN, Role.SALES],
    body: UpdateTaskSchema,
  },
  async ({ ctx, params, body }) => {
    const businessId = requireBusiness(ctx);

    const task = await prisma.crmTask.findFirst({
      where: {
        id: params.id,
        businessId,
      },
    });

    if (!task) {
      throw new DomainError('NOT_FOUND', 'Tugas tidak ditemukan', 404);
    }

    // Sales isolasi: 404 jika bukan tugas miliknya
    if (ctx.role === Role.SALES && task.assignedToId !== ctx.user.id) {
      throw new DomainError('NOT_FOUND', 'Tugas tidak ditemukan', 404);
    }

    const updateData: {
      doneAt?: Date | null;
      title?: string;
      dueAt?: Date;
      assignedToId?: string;
    } = {};

    if (body.done !== undefined) {
      updateData.doneAt = body.done ? new Date() : null;
    }

    if (body.title !== undefined) {
      updateData.title = body.title;
    }

    if (body.dueAt !== undefined) {
      updateData.dueAt = body.dueAt;
    }

    // Hanya Super Admin yang boleh memindahkan tugas ke sales lain
    if (body.assignedToId !== undefined && ctx.role === Role.SUPERADMIN) {
      if (body.assignedToId) {
        updateData.assignedToId = body.assignedToId;
      }
    }

    const updated = await prisma.crmTask.update({
      where: { id: task.id },
      data: updateData,
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
      action: 'CRM_TASK_UPDATE',
      entityType: 'CrmTask',
      entityId: updated.id,
      businessId,
      summary: `Perbarui tugas CRM "${updated.title}" (selesai: ${updated.doneAt ? 'Ya' : 'Belum'})`,
      before: task,
      after: updated,
    });

    return {
      data: updated,
    };
  }
);

// DELETE /api/v1/crm/tasks/:id - Hapus tugas CRM
export const DELETE = withApi(
  {
    roles: [Role.SUPERADMIN, Role.SALES],
  },
  async ({ ctx, params }) => {
    const businessId = requireBusiness(ctx);

    const task = await prisma.crmTask.findFirst({
      where: {
        id: params.id,
        businessId,
      },
    });

    if (!task) {
      throw new DomainError('NOT_FOUND', 'Tugas tidak ditemukan', 404);
    }

    // Sales isolasi: 404 jika bukan tugas miliknya
    if (ctx.role === Role.SALES && task.assignedToId !== ctx.user.id) {
      throw new DomainError('NOT_FOUND', 'Tugas tidak ditemukan', 404);
    }

    await prisma.crmTask.delete({
      where: { id: task.id },
    });

    await audit(prisma, ctx, {
      action: 'CRM_TASK_DELETE',
      entityType: 'CrmTask',
      entityId: task.id,
      businessId,
      summary: `Hapus tugas CRM "${task.title}"`,
      before: task,
    });

    return {
      data: {
        success: true,
      },
    };
  }
);
