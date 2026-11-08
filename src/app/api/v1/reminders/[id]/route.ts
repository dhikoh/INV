import { withApi } from '@/lib/api/withApi';
import { requireBusiness } from '@/lib/auth/context';
import { prisma } from '@/lib/db';
import { Role, ReminderStatus, ReminderSource, Prisma } from '@prisma/client';
import { z } from 'zod';
import { DomainError } from '@/lib/domain/money';

const UpdateReminderSchema = z
  .object({
    intervalDays: z.number().int().min(1).max(365).optional(),
    snoozedUntil: z.string().datetime().nullable().optional(),
    status: z.enum(['ACTIVE', 'PAUSED', 'DONE', 'CANCELLED']).optional(),
    note: z.string().nullable().optional(),
  })
  .strict();

/**
 * PATCH /api/v1/reminders/:id
 *
 * Memperbarui interval (menjadi MANUAL), menunda (snooze), menjeda, atau mengubah status pengingat.
 * Rujukan: Seksi 13.1 & 10.3 Dokumen Spesifikasi.
 */
export const PATCH = withApi(
  {
    roles: [Role.SUPERADMIN, Role.SALES],
    body: UpdateReminderSchema,
  },
  async ({ ctx, body, params }) => {
    const businessId = requireBusiness(ctx);
    const id = params.id;

    const reminder = await prisma.reminder.findFirst({
      where: { id, businessId },
    });

    if (!reminder) {
      throw new DomainError('NOT_FOUND', 'Pengingat tidak ditemukan', 404);
    }

    if (ctx.user.role === Role.SALES && reminder.salesId !== ctx.user.id) {
      throw new DomainError('FORBIDDEN', 'Akses ditolak', 403);
    }

    const data: Prisma.ReminderUpdateInput = {};
    if (body.intervalDays !== undefined) {
      data.intervalDays = body.intervalDays;
      data.source = ReminderSource.MANUAL;
      data.nextDueDate = new Date(
        reminder.lastOrderDate.getTime() + body.intervalDays * 86_400_000
      );
    }

    if (body.snoozedUntil !== undefined) {
      data.snoozedUntil = body.snoozedUntil ? new Date(body.snoozedUntil) : null;
    }

    if (body.status !== undefined) {
      data.status = body.status as ReminderStatus;
    }

    if (body.note !== undefined) {
      data.note = body.note;
    }

    const updated = await prisma.reminder.update({
      where: { id },
      data,
    });

    return {
      data: updated,
    };
  }
);

/**
 * DELETE /api/v1/reminders/:id
 *
 * Membatalkan pengingat repeat order (status menjadi CANCELLED).
 * Rujukan: Seksi 13.1 & 10.3 Dokumen Spesifikasi.
 */
export const DELETE = withApi(
  {
    roles: [Role.SUPERADMIN, Role.SALES],
  },
  async ({ ctx, params }) => {
    const businessId = requireBusiness(ctx);
    const id = params.id;

    const reminder = await prisma.reminder.findFirst({
      where: { id, businessId },
    });

    if (!reminder) {
      throw new DomainError('NOT_FOUND', 'Pengingat tidak ditemukan', 404);
    }

    if (ctx.user.role === Role.SALES && reminder.salesId !== ctx.user.id) {
      throw new DomainError('FORBIDDEN', 'Akses ditolak', 403);
    }

    await prisma.reminder.update({
      where: { id },
      data: { status: ReminderStatus.CANCELLED },
    });

    return {
      data: { success: true },
    };
  }
);
