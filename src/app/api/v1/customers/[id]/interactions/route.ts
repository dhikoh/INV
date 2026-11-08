import { z } from 'zod';
import { Role, InteractionType } from '@prisma/client';
import { withApi } from '@/lib/api/withApi';
import { prisma } from '@/lib/db';
import { DomainError } from '@/lib/domain/money';
import { requireBusiness } from '@/lib/auth/context';
import { customerScope } from '@/lib/services/scopes';
import { audit } from '@/lib/audit/audit';

const CreateInteractionSchema = z.object({
  type: z.nativeEnum(InteractionType, {
    errorMap: () => ({ message: 'Tipe interaksi tidak valid' }),
  }),
  summary: z
    .string()
    .trim()
    .min(1, 'Ringkasan interaksi wajib diisi')
    .max(2000, 'Ringkasan maksimal 2000 karakter'),
  occurredAt: z.coerce.date().optional(),
  nextFollowUpAt: z.coerce.date().optional().nullable(),
});

// GET /api/v1/customers/:id/interactions - Daftar interaksi CRM pelanggan
export const GET = withApi(
  {
    roles: [Role.SUPERADMIN, Role.SALES],
  },
  async ({ ctx, params }) => {
    const businessId = requireBusiness(ctx);
    const scope = customerScope(ctx, businessId);

    // 1. Verifikasi pelanggan ada dan masuk scope
    const customer = await prisma.customer.findFirst({
      where: {
        ...scope,
        id: params.id,
      },
      select: {
        id: true,
        name: true,
        code: true,
      },
    });

    if (!customer) {
      throw new DomainError('NOT_FOUND', 'Pelanggan tidak ditemukan', 404);
    }

    // 2. Ambil seluruh interaksi
    const interactions = await prisma.crmInteraction.findMany({
      where: {
        businessId,
        customerId: customer.id,
      },
      orderBy: {
        occurredAt: 'desc',
      },
    });

    // 3. Kumpulkan nama sales
    const salesIds = Array.from(new Set(interactions.map((i) => i.salesId)));
    const users =
      salesIds.length > 0
        ? await prisma.user.findMany({
            where: { id: { in: salesIds } },
            select: { id: true, name: true, username: true },
          })
        : [];
    const userMap = new Map(users.map((u) => [u.id, u]));

    const data = interactions.map((item) => ({
      ...item,
      sales: userMap.get(item.salesId) || null,
    }));

    return {
      data,
    };
  }
);

// POST /api/v1/customers/:id/interactions - Catat interaksi CRM baru
export const POST = withApi(
  {
    roles: [Role.SUPERADMIN, Role.SALES],
    body: CreateInteractionSchema,
  },
  async ({ ctx, params, body }) => {
    const businessId = requireBusiness(ctx);
    const scope = customerScope(ctx, businessId);

    // 1. Verifikasi pelanggan ada dan masuk scope
    const customer = await prisma.customer.findFirst({
      where: {
        ...scope,
        id: params.id,
      },
    });

    if (!customer) {
      throw new DomainError('NOT_FOUND', 'Pelanggan tidak ditemukan', 404);
    }

    // 2. Tentukan salesId pelapor/penanggung jawab
    const salesId =
      ctx.role === Role.SALES
        ? ctx.user.id
        : customer.assignedSalesId || ctx.user.id;

    // 3. Jalankan dalam transaksi: buat interaksi dan otomatis tugas follow-up bila nextFollowUpAt diisi
    const result = await prisma.$transaction(async (tx) => {
      const interaction = await tx.crmInteraction.create({
        data: {
          businessId,
          customerId: customer.id,
          salesId,
          type: body.type,
          summary: body.summary,
          occurredAt: body.occurredAt ?? new Date(),
          nextFollowUpAt: body.nextFollowUpAt ?? null,
        },
      });

      let autoTask = null;
      if (body.nextFollowUpAt) {
        const shortSummary =
          body.summary.length > 60
            ? body.summary.slice(0, 57) + '...'
            : body.summary;

        autoTask = await tx.crmTask.create({
          data: {
            businessId,
            customerId: customer.id,
            assignedToId: salesId,
            title: `Follow-up: ${shortSummary}`,
            dueAt: body.nextFollowUpAt,
          },
        });

        await audit(tx, ctx, {
          action: 'CRM_TASK_CREATE',
          entityType: 'CrmTask',
          entityId: autoTask.id,
          businessId,
          summary: `Tugas otomatis follow-up interaksi ${body.type} untuk pelanggan ${customer.name}`,
          after: autoTask,
        });
      }

      await audit(tx, ctx, {
        action: 'CRM_INTERACTION_CREATE',
        entityType: 'CrmInteraction',
        entityId: interaction.id,
        businessId,
        summary: `Catat interaksi ${body.type} dengan ${customer.name}`,
        after: interaction,
      });

      return {
        interaction,
        task: autoTask,
      };
    });

    return {
      status: 201,
      data: result,
    };
  }
);
