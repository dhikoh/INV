import { withApi } from '@/lib/api/withApi';
import { prisma } from '@/lib/db';
import { env } from '@/lib/env';
import { generateLinkCode, hashLinkCode } from '@/lib/telegram/linkCode';
import { audit } from '@/lib/audit/audit';

export const POST = withApi(
  {
    roles: ['SUPERADMIN', 'SALES'],
  },
  async ({ ctx }) => {
    const code = generateLinkCode(8);
    const codeHash = hashLinkCode(code);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 menit

    await prisma.$transaction(async (tx) => {
      // Tandai semua kode lama yang belum terpakai milik user ini sebagai terpakai
      await tx.telegramLinkCode.updateMany({
        where: {
          userId: ctx.user.id,
          usedAt: null,
        },
        data: {
          usedAt: new Date(),
        },
      });

      // Simpan kode baru
      await tx.telegramLinkCode.create({
        data: {
          userId: ctx.user.id,
          codeHash,
          expiresAt,
        },
      });

      await audit(tx, ctx, {
        action: 'USER_TELEGRAM_LINK_CODE_GENERATE',
        entityType: 'User',
        entityId: ctx.user.id,
        businessId: ctx.businessId,
        summary: 'Membuat kode tautan Telegram (berlaku 10 menit)',
      });
    });

    const botUsername = env.TELEGRAM_BOT_USERNAME || '';
    const linkUrl = botUsername
      ? `https://t.me/${botUsername}?start=${code}`
      : `https://t.me/?start=${code}`;

    return {
      data: {
        code,
        expiresAt: expiresAt.toISOString(),
        botUsername,
        linkUrl,
      },
    };
  }
);
