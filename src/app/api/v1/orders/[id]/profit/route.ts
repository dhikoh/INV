import { withApi } from '@/lib/api/withApi';
import { requireBusiness } from '@/lib/auth/context';
import { prisma } from '@/lib/db';
import { Role } from '@prisma/client';
import { getOrderProfit, TxClient } from '@/lib/services/profit';
import { DomainError } from '@/lib/domain/money';

/**
 * GET /api/v1/orders/:id/profit
 * Role: SUPERADMIN ONLY (Sales ditolak 403 FORBIDDEN - Zero-Leakage Guarantee)
 *
 * Mengambil rincian profitabilitas pesanan: pendapatan barang, ongkir, HPP terjual,
 * subsidi ongkir, biaya lain, profit bersih, margin bps, serta status komisi.
 *
 * Rujukan: Seksi 7.4 & 17.3 nomor 14 Dokumen Spesifikasi.
 */
export const GET = withApi(
  {
    roles: [Role.SUPERADMIN],
  },
  async ({ ctx, params }) => {
    requireBusiness(ctx);
    const orderId = params.id;
    if (!orderId) {
      throw new DomainError('BAD_REQUEST', 'ID Pesanan tidak valid', 400);
    }

    const data = await prisma.$transaction(async (tx) => {
      return getOrderProfit(tx as unknown as TxClient, ctx, orderId);
    });

    return {
      status: 200,
      data,
    };
  }
);
