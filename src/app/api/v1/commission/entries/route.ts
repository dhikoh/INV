import { withApi } from '@/lib/api/withApi';
import { requireBusiness } from '@/lib/auth/context';
import { prisma } from '@/lib/db';
import { Role } from '@prisma/client';
import { CommissionQuerySchema } from '@/lib/validation/commission';
import { listCommissionEntries, TxClient } from '@/lib/services/commission';

/**
 * GET /api/v1/commission/entries
 * Role: SUPERADMIN ONLY
 *
 * Mengambil daftar komisi staf sales dengan filter salesId, status, mode, dan bulan.
 *
 * Rujukan: Seksi 7.6 & 17.3 nomor 14 Dokumen Spesifikasi.
 */
export const GET = withApi(
  {
    roles: [Role.SUPERADMIN],
    query: CommissionQuerySchema,
  },
  async ({ ctx, query }) => {
    requireBusiness(ctx);

    const result = await prisma.$transaction(async (tx) => {
      return listCommissionEntries(tx as unknown as TxClient, ctx, {
        salesId: query.salesId,
        status: query.status,
        mode: query.mode,
        page: query.page ?? 1,
        limit: query.limit ?? 20,
      });
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

