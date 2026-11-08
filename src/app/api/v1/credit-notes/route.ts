import { withApi } from '@/lib/api/withApi';
import { requireBusiness } from '@/lib/auth/context';
import { prisma } from '@/lib/db';
import { Role } from '@prisma/client';
import { CreditNoteQuerySchema } from '@/lib/validation/credit-note';
import { listCreditNotes, TxClient } from '@/lib/services/credit-note';

/**
 * GET /api/v1/credit-notes
 * Role: SUPERADMIN, SALES
 *
 * Mengambil daftar nota kredit dengan filter pencarian, pelanggan, pesanan, penyelesaian, dan paginasi.
 * Staf Sales dibatasi secara otomatis hanya pada pesanan miliknya.
 */
export const GET = withApi(
  {
    roles: [Role.SUPERADMIN, Role.SALES],
    query: CreditNoteQuerySchema,
  },
  async ({ ctx, query }) => {
    requireBusiness(ctx);

    const result = await prisma.$transaction(async (tx) => {
      return listCreditNotes(tx as unknown as TxClient, ctx, query);
    });

    return {
      status: 200,
      data: result.data,
      meta: {
        total: result.total,
        page: result.page,
        limit: result.limit,
      },
    };
  }
);
