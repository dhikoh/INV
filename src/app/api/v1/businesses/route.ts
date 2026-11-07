import { withApi } from '@/lib/api/withApi';
import { prisma } from '@/lib/db';

export const GET = withApi(
  {
    roles: ['SUPERADMIN'],
    allowPasswordChange: true,
  },
  async () => {
    const list = await prisma.business.findMany({
      where: {
        deletedAt: null,
      },
      select: {
        id: true,
        code: true,
        name: true,
        logoPath: true,
      },
      orderBy: {
        name: 'asc',
      },
    });

    return {
      data: list,
    };
  }
);
