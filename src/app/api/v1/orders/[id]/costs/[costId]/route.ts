import { withApi } from '@/lib/api/withApi';
import { requireBusiness } from '@/lib/auth/context';
import { prisma } from '@/lib/db';
import { Role } from '@prisma/client';
import { deleteOrderCost, TxClient } from '@/lib/services/profit';
import { DomainError } from '@/lib/domain/money';

/**
 * DELETE /api/v1/orders/:id/costs/:costId
 * Role: SUPERADMIN ONLY
 *
 * Menghapus biaya lain dari pesanan dan menghitung ulang komisi otomatis.
 */
export const DELETE = withApi(
  {
    roles: [Role.SUPERADMIN],
  },
  async ({ ctx, params }) => {
    requireBusiness(ctx);
    const orderId = params.id;
    const costId = params.costId;
    if (!orderId || !costId) {
      throw new DomainError('BAD_REQUEST', 'ID Pesanan atau ID Biaya tidak valid', 400);
    }

    const data = await prisma.$transaction(async (tx) => {
      return deleteOrderCost(tx as unknown as TxClient, ctx, orderId, costId);
    });

    return {
      status: 200,
      data,
    };
  }
);

