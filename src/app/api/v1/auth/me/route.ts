import { withApi } from '@/lib/api/withApi';
import { prisma } from '@/lib/db';
import { DomainError } from '@/lib/domain/money';

export const GET = withApi(
  {
    roles: ['SUPERADMIN', 'SALES'],
    allowPasswordChange: true,
  },
  async ({ ctx }) => {
    const user = await prisma.user.findUnique({
      where: { id: ctx.user.id },
      select: {
        id: true,
        username: true,
        name: true,
        role: true,
        businessId: true,
        mustChangePassword: true,
        telegramChatId: true,
        telegramLinkedAt: true,
        telegramBlocked: true,
      },
    });

    if (!user) {
      throw new DomainError('UNAUTHENTICATED', 'Sesi tidak valid', 401);
    }

    return {
      data: {
        user: {
          id: user.id,
          username: user.username,
          name: user.name,
          role: user.role,
          businessId: user.businessId,
          mustChangePassword: user.mustChangePassword,
        },
        businessId: ctx.businessId,
        activeBusinessId: ctx.businessId,
        telegramConnected: Boolean(user.telegramChatId),
      },
    };
  }
);
