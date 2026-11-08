import { Prisma } from '@prisma/client';
import { Ctx } from '../auth/context';

export function orderScope(
  ctx: Ctx,
  businessId: string
): Prisma.OrderWhereInput {
  return {
    businessId,
    deletedAt: null,
    ...(ctx.role === 'SALES' ? { salesId: ctx.user.id } : {}),
  };
}

export function customerScope(
  ctx: Ctx,
  businessId: string
): Prisma.CustomerWhereInput {
  return {
    businessId,
    deletedAt: null,
    ...(ctx.role === 'SALES' ? { assignedSalesId: ctx.user.id } : {}),
  };
}

