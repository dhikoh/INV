import { withApi } from '@/lib/api/withApi';
import { requireBusiness } from '@/lib/auth/context';
import { prisma } from '@/lib/db';
import { Role } from '@prisma/client';
import { PurchaseOrderCancelSchema } from '@/lib/validation/purchase-order';
import { cancelPurchaseOrder, formatPurchaseOrderDto } from '@/lib/services/purchase-order';

/**
 * POST /api/v1/purchase-orders/:id/cancel
 * Role: SUPERADMIN ONLY (Sales ditolak 403 FORBIDDEN)
 *
 * Membatalkan Purchase Order (status CANCELLED).
 * Aturan Seksi 8.3: PO yang sudah ada penerimaan barang tidak bisa dibatalkan.
 *
 * Rujukan: Seksi 7.9 & 8.3 Dokumen Spesifikasi.
 */
export const POST = withApi(
  {
    roles: [Role.SUPERADMIN],
    body: PurchaseOrderCancelSchema,
  },
  async ({ ctx, params, body }) => {
    const businessId = requireBusiness(ctx);
    const { id } = params;

    const { po, prodMap } = await prisma.$transaction(async (tx) => {
      return cancelPurchaseOrder(tx, businessId, id, ctx.user.id, body.reason);
    });

    return {
      status: 200,
      data: formatPurchaseOrderDto(po, prodMap),
    };
  }
);
