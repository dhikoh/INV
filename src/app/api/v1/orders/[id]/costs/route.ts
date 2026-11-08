import { withApi } from '@/lib/api/withApi';
import { requireBusiness } from '@/lib/auth/context';
import { prisma } from '@/lib/db';
import { Role } from '@prisma/client';
import { OrderCostCreateSchema } from '@/lib/validation/order-cost';
import {
  createOrderCost,
  listOrderCosts,
  TxClient,
} from '@/lib/services/profit';
import { DomainError } from '@/lib/domain/money';

/**
 * GET /api/v1/orders/:id/costs
 * Role: SUPERADMIN ONLY
 *
 * Mengambil daftar biaya lain (ekstra) untuk pesanan tertentu.
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
      return listOrderCosts(tx as unknown as TxClient, ctx, orderId);
    });

    return {
      status: 200,
      data,
    };
  }
);

/**
 * POST /api/v1/orders/:id/costs
 * Role: SUPERADMIN ONLY
 *
 * Menambahkan biaya lain (ekstra) pada pesanan dan menghitung ulang komisi otomatis.
 */
export const POST = withApi(
  {
    roles: [Role.SUPERADMIN],
    body: OrderCostCreateSchema,
  },
  async ({ ctx, params, body }) => {
    requireBusiness(ctx);
    const orderId = params.id;
    if (!orderId) {
      throw new DomainError('BAD_REQUEST', 'ID Pesanan tidak valid', 400);
    }

    const data = await prisma.$transaction(async (tx) => {
      return createOrderCost(tx as unknown as TxClient, ctx, orderId, body);
    });

    return {
      status: 201,
      data,
    };
  }
);

