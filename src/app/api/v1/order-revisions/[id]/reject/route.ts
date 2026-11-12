import { withApi } from '@/lib/api/withApi';
import { prisma } from '@/lib/db';
import { OrderRevisionRejectSchema } from '@/lib/validation/order';
import { rejectOrderRevision } from '@/lib/services/revision';
import { Role } from '@prisma/client';

/**
 * POST /api/v1/order-revisions/:id/reject
 * Role: SUPERADMIN ONLY
 * Menolak pengajuan revisi pesanan dan mengembalikan proses pesanan apa adanya tanpa mutasi stok.
 */
export const POST = withApi(
  {
    roles: [Role.SUPERADMIN],
    body: OrderRevisionRejectSchema,
  },
  async ({ ctx, body, params }) => {
    const { id } = params;

    const rejected = await prisma.$transaction(async (tx) => {
      return await rejectOrderRevision(tx, ctx, id, body.reason);
    });

    return {
      status: 200,
      data: rejected,
    };
  }
);
