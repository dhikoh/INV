import { z } from 'zod';
import { withApi } from '@/lib/api/withApi';
import { prisma } from '@/lib/db';
import { DomainError } from '@/lib/domain/money';
import { hashPassword } from '@/lib/auth/password';
import { audit } from '@/lib/audit/audit';

const ResetPasswordSchema = z
  .object({
    password: z
      .string()
      .min(10, 'Password minimal 10 karakter')
      .max(128, 'Password maksimal 128 karakter'),
  })
  .strict();

export const POST = withApi(
  {
    roles: ['SUPERADMIN'],
    body: ResetPasswordSchema,
  },
  async ({ ctx, params, body }) => {
    const userId = params.id;

    const existing = await prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
    });

    if (!existing) {
      throw new DomainError('NOT_FOUND', 'Pengguna tidak ditemukan', 404);
    }

    const passwordHash = await hashPassword(body.password, existing.username);

    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: {
          passwordHash,
          mustChangePassword: true,
        },
      });

      // Cabut seluruh sesi aktif pengguna tersebut
      await tx.session.updateMany({
        where: {
          userId,
          revokedAt: null,
        },
        data: {
          revokedAt: new Date(),
        },
      });

      await audit(tx, ctx, {
        action: 'USER_PASSWORD_RESET',
        entityType: 'User',
        entityId: userId,
        businessId: existing.businessId,
        summary: `Reset password pengguna oleh Super Admin: ${existing.username} (${existing.name})`,
      });
    });

    return {
      data: { success: true },
    };
  }
);
