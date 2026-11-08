import { Role } from '@prisma/client';
import { withApi } from '@/lib/api/withApi';
import { prisma } from '@/lib/db';

// POST /api/v1/updates/mark-seen - Menandai seluruh rilis hingga saat ini telah dilihat oleh pengguna
export const POST = withApi(
  {
    roles: [Role.SUPERADMIN, Role.SALES],
  },
  async ({ ctx }) => {
    const now = new Date();

    const updated = await prisma.user.update({
      where: { id: ctx.user.id },
      data: {
        lastSeenReleaseAt: now,
      },
      select: {
        id: true,
        lastSeenReleaseAt: true,
      },
    });

    return {
      data: {
        success: true,
        lastSeenReleaseAt: updated.lastSeenReleaseAt?.toISOString() ?? now.toISOString(),
      },
    };
  }
);
