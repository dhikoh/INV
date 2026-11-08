import { withApi } from '@/lib/api/withApi';
import { requireBusiness } from '@/lib/auth/context';
import { prisma } from '@/lib/db';
import { Role } from '@prisma/client';
import { PurchaseOrderReceiveSchema } from '@/lib/validation/purchase-order';
import { receivePurchaseOrder, formatPurchaseOrderDto } from '@/lib/services/purchase-order';

/**
 * POST /api/v1/purchase-orders/:id/receive
 * Role: SUPERADMIN ONLY (Sales ditolak 403 FORBIDDEN)
 *
 * Menerima barang pesanan pembelian. Menambah stockQty dan mencatat PO_RECEIPT.
 * Bila updateHpp = true, memperbarui Product.costPrice dan mencatat PriceHistory.
 *
 * Rujukan: Seksi 7.9 & 8.3 Dokumen Spesifikasi.
 */
export const POST = withApi(
  {
    roles: [Role.SUPERADMIN],
    body: PurchaseOrderReceiveSchema,
  },
  async ({ ctx, params, body }) => {
    const businessId = requireBusiness(ctx);
    const { id } = params;

    const { po, prodMap } = await prisma.$transaction(async (tx) => {
      return receivePurchaseOrder(tx, businessId, id, ctx.user.id, body);
    });

    return {
      status: 200,
      data: formatPurchaseOrderDto(po, prodMap),
    };
  }
);
