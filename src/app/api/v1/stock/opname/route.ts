import { withApi } from '@/lib/api/withApi';
import { requireBusiness } from '@/lib/auth/context';
import { prisma } from '@/lib/db';
import { Role } from '@prisma/client';
import { StockOpnameSchema } from '@/lib/validation/stock';
import { opnameStock } from '@/lib/services/stock';

/**
 * POST /api/v1/stock/opname
 * Role: SUPERADMIN ONLY (Sales ditolak 403 FORBIDDEN)
 *
 * Melakukan stock opname (OPNAME). Jumlah fisik riil diperbarui langsung.
 *
 * Rujukan: Seksi 7.9 & 17.4 b Dokumen Spesifikasi.
 */
export const POST = withApi(
  {
    roles: [Role.SUPERADMIN],
    body: StockOpnameSchema,
  },
  async ({ ctx, body }) => {
    const businessId = requireBusiness(ctx);

    const balanceAfter = await prisma.$transaction(async (tx) => {
      return opnameStock(tx, {
        businessId,
        productId: body.productId,
        countedQty: body.countedQty,
        reason: body.reason,
        actorId: ctx.user.id,
      });
    });

    return {
      status: 200,
      data: {
        productId: body.productId,
        countedQty: body.countedQty,
        balanceAfter,
        message: 'Hasil stock opname berhasil dicatat',
      },
    };
  }
);
