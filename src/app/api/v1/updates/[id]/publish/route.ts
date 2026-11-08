import { z } from 'zod';
import { Role } from '@prisma/client';
import { withApi } from '@/lib/api/withApi';
import { prisma } from '@/lib/db';
import { DomainError } from '@/lib/domain/money';
import { audit } from '@/lib/audit/audit';

const publishSchema = z
  .object({
    broadcast: z.boolean().optional(),
  })
  .optional();

// POST /api/v1/updates/:id/publish - Menerbitkan rilis (Khusus Super Admin)
export const POST = withApi(
  {
    roles: [Role.SUPERADMIN],
    body: publishSchema,
  },
  async ({ ctx, body, params }) => {
    const existing = await prisma.releaseNote.findUnique({
      where: { id: params.id },
    });

    if (!existing) {
      throw new DomainError('NOT_FOUND', 'Catatan pembaruan tidak ditemukan', 404);
    }

    const now = new Date();
    const updated = await prisma.releaseNote.update({
      where: { id: params.id },
      data: {
        publishedAt: existing.publishedAt ?? now,
        ...(body?.broadcast ? { broadcastAt: now } : {}),
      },
    });

    await audit(prisma, ctx, {
      action: 'RELEASE_NOTE_PUBLISH',
      entityType: 'ReleaseNote',
      entityId: updated.id,
      summary: `Menerbitkan rilis ${updated.version}: ${updated.title}${
        body?.broadcast ? ' (dengan broadcast Telegram)' : ''
      }`,
      before: existing,
      after: updated,
    });

    return {
      data: updated,
    };
  }
);
