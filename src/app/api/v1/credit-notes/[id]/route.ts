import { withApi } from '@/lib/api/withApi';
import { requireBusiness } from '@/lib/auth/context';
import { prisma } from '@/lib/db';
import { Role } from '@prisma/client';
import { getCreditNote, TxClient } from '@/lib/services/credit-note';
import { DomainError } from '@/lib/domain/money';

/**
 * GET /api/v1/credit-notes/:id
 * Role: SUPERADMIN, SALES
 *
 * Mengambil detail nota kredit. Kerahasiaan HPP / cogsReversed dilindungi dari staf Sales.
 */
export const GET = withApi(
  {
    roles: [Role.SUPERADMIN, Role.SALES],
  },
  async ({ ctx, params }) => {
    requireBusiness(ctx);
    const id = params.id;
    if (!id) {
      throw new DomainError('BAD_REQUEST', 'ID Nota Kredit tidak valid', 400);
    }

    const result = await prisma.$transaction(async (tx) => {
      return getCreditNote(tx as unknown as TxClient, ctx, id);
    });

    return {
      status: 200,
      data: result,
    };
  }
);
