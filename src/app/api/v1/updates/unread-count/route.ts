import { Role } from '@prisma/client';
import { withApi } from '@/lib/api/withApi';
import { prisma } from '@/lib/db';

// GET /api/v1/updates/unread-count - Menghitung rilis terbit yang belum dilihat user
export const GET = withApi(
  {
    roles: [Role.SUPERADMIN, Role.SALES],
  },
  async ({ ctx }) => {
    const user = await prisma.user.findUnique({
      where: { id: ctx.user.id },
      select: { lastSeenReleaseAt: true },
    });

    const threshold = user?.lastSeenReleaseAt ?? new Date(0);

    const unreadCount = await prisma.releaseNote.count({
      where: {
        publishedAt: {
          not: null,
          gt: threshold,
        },
      },
    });

    return {
      data: {
        unreadCount,
      },
    };
  }
);
