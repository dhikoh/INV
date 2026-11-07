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
          isActive: true,
        },
      });

      await audit(tx, ctx, {
        action: 'USER_ACTIVATE',
        entityType: 'User',
        entityId: userId,
        businessId: existing.businessId,
        summary: `Pengaktifan kembali akun pengguna: ${existing.username} (${existing.name})`,
        before: { isActive: false },
        after: { isActive: true },
      });
    });

    return {
      data: { success: true },
    };
  }
);
