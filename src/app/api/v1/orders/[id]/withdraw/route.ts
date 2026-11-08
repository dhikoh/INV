import { withApi } from '@/lib/api/withApi';
import { requireBusiness } from '@/lib/auth/context';
import { prisma } from '@/lib/db';
import { Role } from '@prisma/client';
import { withdrawOrder, TxClient } from '@/lib/services/order';

/**
 * POST /api/v1/orders/:id/withdraw
 * Role: SUPERADMIN & SALES (pembuat order)
 *
 * Menarik kembali pengajuan pesanan yang sedang menunggu persetujuan (withdraw).
 * - Transisi status: PENDING_APPROVAL -> DRAFT.
 * - Invoice berstatus PENDING_APPROVAL diubah menjadi WITHDRAWN.
 *
 * Rujukan: Seksi 8.2 & Seksi 19.5 (T3.1) Dokumen Spesifikasi.
 */
export const POST = withApi(
  {
    roles: [Role.SUPERADMIN, Role.SALES],
  },
  async ({ ctx, params }) => {
    requireBusiness(ctx);
    const { id } = params;

    const result = await prisma.$transaction(async (tx) => {
      return withdrawOrder(tx as unknown as TxClient, ctx, id);
    });

    return {
      status: 200,
      data: result,
    };
  }
);
