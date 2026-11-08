import { withApi } from '@/lib/api/withApi';
import { requireBusiness } from '@/lib/auth/context';
import { prisma } from '@/lib/db';
import { Role } from '@prisma/client';
import { shipOrder, TxClient } from '@/lib/services/shipment';

/**
 * POST /api/v1/orders/:id/shipment/ship
 * Role: SUPERADMIN & SALES (pemilik order)
 *
 * Menandai barang pesanan telah dikirim (SHIPPED).
 * - Syarat: Order berstatus AWAITING_FINAL_PAYMENT.
 * - Bila requirePaidBeforeShip aktif: balanceDue harus 0 (tolak 409 bila belum lunas).
 * - Alokasi nomor surat jalan resmi KODE/SJ/DD/MM/YYYY/NNNN.
 * - Stok keluar fisik (mengurangi reservedQty dan stockQty).
 * - Evaluasi penyelesaian otomatis (maybeComplete).
 *
 * Rujukan: Seksi 8.3 & Seksi 19.5 (T3.4) Dokumen Spesifikasi.
 */
export const POST = withApi(
  {
    roles: [Role.SUPERADMIN, Role.SALES],
  },
  async ({ ctx, params }) => {
    requireBusiness(ctx);
    const { id } = params;

    const result = await prisma.$transaction(async (tx) => {
      return shipOrder(tx as unknown as TxClient, ctx, id);
    });

    return {
      status: 200,
      data: result,
    };
  }
);

