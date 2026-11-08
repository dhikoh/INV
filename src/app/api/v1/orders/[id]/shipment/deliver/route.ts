import { withApi } from '@/lib/api/withApi';
import { requireBusiness } from '@/lib/auth/context';
import { prisma } from '@/lib/db';
import { Role } from '@prisma/client';
import { ShipmentDeliverSchema } from '@/lib/validation/shipment';
import { deliverOrder, TxClient } from '@/lib/services/shipment';

/**
 * POST /api/v1/orders/:id/shipment/deliver
 * Role: SUPERADMIN & SALES (pemilik order)
 *
 * Menandai barang pesanan telah tiba dan diterima pelanggan (DELIVERED).
 * - Syarat: Pengiriman berstatus SHIPPED.
 * - Evaluasi penyelesaian otomatis (maybeComplete).
 *
 * Rujukan: Seksi 8.3 & Seksi 19.5 (T3.4) Dokumen Spesifikasi.
 */
export const POST = withApi(
  {
    roles: [Role.SUPERADMIN, Role.SALES],
    body: ShipmentDeliverSchema,
  },
  async ({ ctx, params, body }) => {
    requireBusiness(ctx);
    const { id } = params;

    const result = await prisma.$transaction(async (tx) => {
      return deliverOrder(tx as unknown as TxClient, ctx, id, body);
    });

    return {
      status: 200,
      data: result,
    };
  }
);

