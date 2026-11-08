import { withApi } from '@/lib/api/withApi';
import { requireBusiness } from '@/lib/auth/context';
import { prisma } from '@/lib/db';
import { Role } from '@prisma/client';
import { OrderRequestFinalSchema } from '@/lib/validation/order';
import { requestFinalOrder, TxClient } from '@/lib/services/order';

/**
 * POST /api/v1/orders/:id/request-final
 * Role: SUPERADMIN & SALES (pemilik order)
 *
 * Mengajukan faktur pelunasan pesanan (Request Final Invoice).
 * - Syarat: Order berstatus IN_PROCESS dan uang muka (DP) telah lunas.
 * - Input: opsional shippingCharge baru + shippingReason (alasan min 5 karakter jika ongkir berubah).
 * - Efek: Buat Invoice FINAL PENDING_APPROVAL, transisi status order menjadi FINAL_PENDING_APPROVAL.
 *
 * Rujukan: Seksi 8.2 & Seksi 19.5 (T3.4) Dokumen Spesifikasi.
 */
export const POST = withApi(
  {
    roles: [Role.SUPERADMIN, Role.SALES],
    body: OrderRequestFinalSchema,
  },
  async ({ ctx, params, body }) => {
    requireBusiness(ctx);
    const { id } = params;

    const result = await prisma.$transaction(async (tx) => {
      return requestFinalOrder(tx as unknown as TxClient, ctx, id, body);
    });

    return {
      status: 200,
      data: result,
    };
  }
);

