import { withApi } from '@/lib/api/withApi';
import { requireBusiness } from '@/lib/auth/context';
import { prisma } from '@/lib/db';
import { Role } from '@prisma/client';
import { CommissionPaySchema } from '@/lib/validation/commission';
import { payCommissionEntry, TxClient } from '@/lib/services/commission';
import { DomainError } from '@/lib/domain/money';

/**
 * POST /api/v1/commission/entries/:id/pay
 * Role: SUPERADMIN ONLY
 *
 * Menandai entri komisi telah dibayarkan oleh Super Admin.
 *
 * Rujukan: Seksi 7.6 Dokumen Spesifikasi.
 */
export const POST = withApi(
  {
    roles: [Role.SUPERADMIN],
    body: CommissionPaySchema,
  },
  async ({ ctx, params, body }) => {
    requireBusiness(ctx);
    const entryId = params.id;
    if (!entryId) {
      throw new DomainError('BAD_REQUEST', 'ID Komisi tidak valid', 400);
    }

    const data = await prisma.$transaction(async (tx) => {
      return payCommissionEntry(tx as unknown as TxClient, ctx, entryId, body.note);
    });

    return {
      status: 200,
      data,
    };
  }
);
