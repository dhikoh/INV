import { withApi } from '@/lib/api/withApi';
import { Role } from '@prisma/client';
import { CommissionReportQuerySchema } from '@/lib/validation/salesEvaluation';
import { getCommissionReport } from '@/lib/services/salesEvaluation';

/**
 * GET /api/v1/reports/commissions
 * Role: SUPERADMIN ONLY (Zero-Leakage Guarantee)
 *
 * Query params:
 * - salesId: string (opsional)
 * - status: CommissionStatus (opsional: EARNED, PAID, REVERSED)
 * - month: string YYYY-MM (opsional)
 * - page: number (default 1)
 * - limit: number (default 50)
 *
 * Rujukan: Seksi 7.6, 17.3 nomor 23, 18.1 nomor 35 Dokumen Spesifikasi.
 */
export const GET = withApi(
  {
    roles: [Role.SUPERADMIN],
  },
  async ({ ctx, req }) => {
    const url = new URL(req.url);
    const rawQuery = {
      salesId: url.searchParams.get('salesId') || undefined,
      status: url.searchParams.get('status') || undefined,
      month: url.searchParams.get('month') || undefined,
      page: url.searchParams.get('page') || undefined,
      limit: url.searchParams.get('limit') || undefined,
    };

    const parsedQuery = CommissionReportQuerySchema.parse(rawQuery);
    const data = await getCommissionReport(ctx, parsedQuery);

    return {
      status: 200,
      data,
    };
  }
);

