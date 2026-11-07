import { withApi } from '@/lib/api/withApi';
import { prisma } from '@/lib/db';
import { audit } from '@/lib/audit/audit';

export const DELETE = withApi(
  {
    roles: ['SUPERADMIN', 'SALES'],
  },
  async ({ ctx }) => {
    const user = await prisma.user.findUnique({
      where: { id: ctx.user.id },
    });

    if (!user) {
      return {
        data: { success: true },
      };
    }

    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: ctx.user.id },
        data: {
          telegramChatId: null,
          telegramLinkedAt: null,
          telegramBlocked: false,
        },
      });

      await audit(tx, ctx, {
        action: 'USER_TELEGRAM_UNLINK',
        entityType: 'User',
        entityId: ctx.user.id,
        businessId: ctx.businessId,
        summary: 'Memutuskan tautan akun Telegram',
        before: {
          telegramChatId: user.telegramChatId,
          telegramLinkedAt: user.telegramLinkedAt,
        },
        after: {
          telegramChatId: null,
          telegramLinkedAt: null,
        },
      });
    });

    return {
      data: { success: true },
    };
  }
);
