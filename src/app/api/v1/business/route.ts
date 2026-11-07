import { withApi } from '@/lib/api/withApi';
import { prisma } from '@/lib/db';

export const GET = withApi(
  {
    roles: ['SUPERADMIN', 'SALES'],
    allowPasswordChange: true,
  },
  async ({ ctx }) => {
    if (!ctx.businessId) {
      return {
        data: null,
      };
    }

    const business = await prisma.business.findFirst({
      where: {
        id: ctx.businessId,
        deletedAt: null,
      },
      select: {
        id: true,
        code: true,
        name: true,
        logoPath: true,
      },
    });

    return {
      data: business,
    };
  }
);
