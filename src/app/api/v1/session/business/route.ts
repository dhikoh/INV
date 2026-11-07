import { z } from 'zod';
import { withApi } from '@/lib/api/withApi';
import { prisma } from '@/lib/db';
import { DomainError } from '@/lib/domain/money';

const SwitchBusinessSchema = z
  .object({
    businessId: z.string().min(1, 'ID Usaha wajib diisi'),
  })
  .strict();

export const POST = withApi(
  {
    roles: ['SUPERADMIN'],
    body: SwitchBusinessSchema,
    allowPasswordChange: true,
  },
  async ({ ctx, body }) => {
    // Validasi keberadaan unit usaha (aktif & tidak dihapus)
    const business = await prisma.business.findFirst({
      where: {
        id: body.businessId,
        deletedAt: null,
      },
    });

    if (!business) {
      throw new DomainError('NOT_FOUND', 'Usaha tidak ditemukan', 404);
    }

    // Perbarui activeBusinessId pada sesi aktif Super Admin
    await prisma.session.update({
      where: { id: ctx.sessionId },
      data: { activeBusinessId: business.id },
    });

    return {
      data: {
        activeBusinessId: business.id,
        business: {
          id: business.id,
          code: business.code,
          name: business.name,
        },
      },
    };
  }
);
