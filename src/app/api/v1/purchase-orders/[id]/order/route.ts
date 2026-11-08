import { withApi } from '@/lib/api/withApi';
import { requireBusiness } from '@/lib/auth/context';
import { prisma } from '@/lib/db';
import { Role } from '@prisma/client';
import { orderPurchaseOrder, formatPurchaseOrderDto } from '@/lib/services/purchase-order';

/**
 * POST /api/v1/purchase-orders/:id/order
 * Role: SUPERADMIN ONLY (Sales ditolak 403 FORBIDDEN)
 *
 * Mengubah status DRAFT menjadi ORDERED dan mengalokasikan poNo resmi:
 * KODEVENDOR/PO/DD/MM/YYYY/NNNN.
 *
 * Rujukan: Seksi 7.9 & 8.3 Dokumen Spesifikasi.
 */
export const POST = withApi(
  {
    roles: [Role.SUPERADMIN],
  },
  async ({ ctx, params }) => {
    const businessId = requireBusiness(ctx);
    const { id } = params;

    const { po, prodMap } = await prisma.$transaction(async (tx) => {
      return orderPurchaseOrder(tx, businessId, id, ctx.user.id);
    });

    return {
      status: 200,
      data: formatPurchaseOrderDto(po, prodMap),
    };
  }
);
