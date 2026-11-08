import { withApi } from '@/lib/api/withApi';
import { requireBusiness } from '@/lib/auth/context';
import { prisma } from '@/lib/db';
import { Role } from '@prisma/client';
import {
  getCustomerCreditBalance,
  TxClient,
} from '@/lib/services/credit-note';
import { DomainError } from '@/lib/domain/money';

/**
 * GET /api/v1/customers/:id/credit-balance
 * Role: SUPERADMIN, SALES
 *
 * Mengambil informasi saldo deposit kredit pelanggan beserta riwayat mutasi kredit.
 */
export const GET = withApi(
  {
    roles: [Role.SUPERADMIN, Role.SALES],
  },
  async ({ ctx, params }) => {
    requireBusiness(ctx);
    const customerId = params.id;
    if (!customerId) {
      throw new DomainError('BAD_REQUEST', 'ID Pelanggan tidak valid', 400);
    }

    const result = await prisma.$transaction(async (tx) => {
      return getCustomerCreditBalance(tx as unknown as TxClient, ctx, customerId);
    });

    return {
      status: 200,
      data: result,
    };
  }
);

