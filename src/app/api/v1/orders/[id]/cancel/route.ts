import { withApi } from '@/lib/api/withApi';
import { requireBusiness } from '@/lib/auth/context';
import { prisma } from '@/lib/db';
import { Role } from '@prisma/client';
import { OrderCancelSchema } from '@/lib/validation/order';
import { cancelOrder, TxClient } from '@/lib/services/order';

/**
 * POST /api/v1/orders/:id/cancel
 * Role: SUPERADMIN only
 *
 * Pembatalan resmi pesanan (menggantikan purge/hapus paksa untuk order yang sudah disetujui
 * atau memiliki transaksi). Melepas stok reservasi, membatalkan komisi, melakukan void faktur,
 * dan menyelesaikan DP/pembayaran masuk sebagai Refund atau Saldo Kredit Pelanggan.
 */
export const POST = withApi(
  {
    roles: [Role.SUPERADMIN],
    body: OrderCancelSchema,
  },
  async ({ ctx, params, body }) => {
    requireBusiness(ctx);
    const { id } = params;

    const order = await prisma.$transaction(async (tx) => {
      return cancelOrder(tx as unknown as TxClient, ctx, id, body);
    });

    return {
      status: 200,
      data: order,
    };
  }
);

