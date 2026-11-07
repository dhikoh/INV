import { withApi } from '@/lib/api/withApi';
import { prisma } from '@/lib/db';
import { DomainError } from '@/lib/domain/money';
import { audit } from '@/lib/audit/audit';

export const POST = withApi(
  {
    roles: ['SUPERADMIN'],
  },
  async ({ ctx, params }) => {
    const userId = params.id;

    if (ctx.user.id === userId) {
      throw new DomainError(
        'BAD_REQUEST',
        'Tidak dapat menonaktifkan akun sendiri',
        400
      );
    }

    const existing = await prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
    });

    if (!existing) {
      throw new DomainError('NOT_FOUND', 'Pengguna tidak ditemukan', 404);
    }

    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: {
          isActive: false,
        },
      });

      // Nonaktifkan mencabut seluruh sesi aktif
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
        action: 'USER_DEACTIVATE',
        entityType: 'User',
        entityId: userId,
        businessId: existing.businessId,
        summary: `Penonaktifan akun pengguna: ${existing.username} (${existing.name})`,
        before: { isActive: true },
        after: { isActive: false },
      });
    });

    return {
      data: { success: true },
    };
  }
);
