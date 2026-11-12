import { withApi } from '@/lib/api/withApi';
import { prisma } from '@/lib/db';
import { OrderRevisionApproveSchema } from '@/lib/validation/order';
import { approveOrderRevision } from '@/lib/services/revision';
import { Role } from '@prisma/client';

/**
 * POST /api/v1/order-revisions/:id/approve
 * Role: SUPERADMIN ONLY
 * Menyetujui pengajuan revisi item/qty/harga pesanan, menyesuaikan delta reservasi stok,
 * dan memperbarui total pesanan tanpa menghapus DP yang telah dibayar.
 */
export const POST = withApi(
  {
    roles: [Role.SUPERADMIN],
    body: OrderRevisionApproveSchema,
  },
  async ({ ctx, body, params }) => {
    const { id } = params;

    const approved = await prisma.$transaction(async (tx) => {
      return await approveOrderRevision(tx, ctx, id, body?.overrideNote);
    });

    return {
      status: 200,
      data: approved,
    };
  }
);
