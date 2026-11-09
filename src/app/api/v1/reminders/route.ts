import { withApi } from '@/lib/api/withApi';
import { requireBusiness } from '@/lib/auth/context';
import { prisma } from '@/lib/db';
import { Role, ReminderStatus, ReminderSource, Prisma } from '@prisma/client';
import { z } from 'zod';
import { daysUntil } from '@/lib/domain/reminder';
import { DomainError } from '@/lib/domain/money';

const GetRemindersQuerySchema = z.object({
  status: z.enum(['ACTIVE', 'PAUSED', 'DONE', 'CANCELLED', 'ALL']).optional(),
  due: z.enum(['all', 'overdue', 'today', 'week']).optional(),
  customerId: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().default(50),
});

const CreateReminderSchema = z.object({
  customerId: z.string().min(1, 'ID pelanggan wajib diisi'),
  productId: z.string().nullable().optional(),
  intervalDays: z.number().int().min(1).max(365),
  note: z.string().nullable().optional(),
});

/**
 * GET /api/v1/reminders
 *
 * Mengambil daftar pengingat repeat order dengan filter status dan jatuh tempo (Seksi 13.1 & 10.3).
 */
export const GET = withApi(
  {
    roles: [Role.SUPERADMIN, Role.SALES],
    query: GetRemindersQuerySchema,
  },
  async ({ ctx, query }) => {
    const businessId = requireBusiness(ctx);
    const now = new Date();

    const where: Prisma.ReminderWhereInput = {
      businessId,
    };

    if (ctx.user.role === Role.SALES) {
      where.salesId = ctx.user.id;
    }

    if (query.customerId) {
      where.customerId = query.customerId;
    }

    if (query.status && query.status !== 'ALL') {
      where.status = query.status as ReminderStatus;
    } else if (!query.status) {
      where.status = ReminderStatus.ACTIVE;
    }

    const reminders = await prisma.reminder.findMany({
      where,
      include: {
        customer: {
          select: {
            id: true,
            code: true,
            name: true,
            phone: true,
            address: true,
          },
        },
      },
      orderBy: { nextDueDate: 'asc' },
    });

    const productIds = [
      ...new Set(
        reminders
          .map((r) => r.productId)
          .filter((id): id is string => Boolean(id))
      ),
    ];

    const products =
      productIds.length > 0
        ? await prisma.product.findMany({
            where: { businessId, id: { in: productIds } },
            select: { id: true, name: true, sku: true, unit: true },
          })
        : [];

    const productMap = new Map(products.map((p) => [p.id, p]));

    const enriched = reminders.map((r) => {
      const remainingDays = daysUntil(r.nextDueDate, now);
      const isOverdue = remainingDays < 0;
      const isDueToday = remainingDays === 0;

      return {
        id: r.id,
        businessId: r.businessId,
        customerId: r.customerId,
        customer: r.customer,
        productId: r.productId,
        product: r.productId ? productMap.get(r.productId) || null : null,
        salesId: r.salesId,
        intervalDays: r.intervalDays,
        lastOrderDate: r.lastOrderDate.toISOString(),
        nextDueDate: r.nextDueDate.toISOString(),
        status: r.status,
        source: r.source,
        snoozedUntil: r.snoozedUntil ? r.snoozedUntil.toISOString() : null,
        lastNotifiedAt: r.lastNotifiedAt ? r.lastNotifiedAt.toISOString() : null,
        escalatedAt: r.escalatedAt ? r.escalatedAt.toISOString() : null,
        note: r.note,
        daysUntil: remainingDays,
        isOverdue,
        isDueToday,
      };
    });

    let filtered = enriched;
    if (query.due === 'overdue') {
      filtered = enriched.filter((r) => r.isOverdue);
    } else if (query.due === 'today') {
      filtered = enriched.filter((r) => r.isDueToday);
    } else if (query.due === 'week') {
      filtered = enriched.filter((r) => r.daysUntil <= 7);
    }

    return {
      data: filtered,
      meta: {
        total: filtered.length,
        overdueCount: enriched.filter((r) => r.isOverdue).length,
        dueTodayCount: enriched.filter((r) => r.isDueToday).length,
      },
    };
  }
);

/**
 * POST /api/v1/reminders
 *
 * Membuat pengingat repeat order secara manual oleh Sales atau Super Admin (Seksi 13.1).
 */
export const POST = withApi(
  {
    roles: [Role.SUPERADMIN, Role.SALES],
    body: CreateReminderSchema,
  },
  async ({ ctx, body }) => {
    const businessId = requireBusiness(ctx);
    const customer = await prisma.customer.findFirst({
      where: { id: body.customerId, businessId, deletedAt: null },
    });

    if (!customer) {
      throw new DomainError('NOT_FOUND', 'Pelanggan tidak ditemukan', 404);
    }

    if (
      ctx.user.role === Role.SALES &&
      customer.assignedSalesId !== ctx.user.id
    ) {
      throw new DomainError(
        'FORBIDDEN',
        'Anda hanya dapat mengelola pengingat pelanggan Anda',
        403
      );
    }

    const now = new Date();
    const nextDueDate = new Date(
      now.getTime() + body.intervalDays * 86_400_000
    );

    const reminder = await prisma.reminder.create({
      data: {
        businessId,
        customerId: body.customerId,
        productId: body.productId || null,
        salesId: ctx.user.id,
        intervalDays: body.intervalDays,
        lastOrderDate: now,
        nextDueDate,
        status: ReminderStatus.ACTIVE,
        source: ReminderSource.MANUAL,
        note: body.note || null,
      },
    });

    return {
      status: 201,
      data: reminder,
    };
  }
);
