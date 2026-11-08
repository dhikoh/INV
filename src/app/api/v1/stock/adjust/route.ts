import { withApi } from '@/lib/api/withApi';
import { requireBusiness } from '@/lib/auth/context';
import { prisma } from '@/lib/db';
import { Role } from '@prisma/client';
import { StockAdjustSchema } from '@/lib/validation/stock';
import { adjustStock } from '@/lib/services/stock';

/**
 * POST /api/v1/stock/adjust
 * Role: SUPERADMIN ONLY (Sales ditolak 403 FORBIDDEN)
 *
 * Melakukan penyesuaian stok manual (ADJUSTMENT). Alasan wajib minimal 5 karakter.
 *
 * Rujukan: Seksi 7.9 & 17.4 b Dokumen Spesifikasi.
 */
export const POST = withApi(
  {
    roles: [Role.SUPERADMIN],
    body: StockAdjustSchema,
  },
  async ({ ctx, body }) => {
    const businessId = requireBusiness(ctx);

    const balanceAfter = await prisma.$transaction(async (tx) => {
      return adjustStock(tx, {
        businessId,
        productId: body.productId,
        qtyDelta: body.qtyDelta,
        reason: body.reason,
        actorId: ctx.user.id,
      });
    });

    return {
      status: 200,
      data: {
        productId: body.productId,
        qtyDelta: body.qtyDelta,
        balanceAfter,
        message: 'Penyesuaian stok berhasil disimpan',
      },
    };
  }
);
