import { withApi } from '@/lib/api/withApi';
import { Role } from '@prisma/client';
import { SalesPerformanceQuerySchema } from '@/lib/validation/salesEvaluation';
import { getSalesPerformanceReport } from '@/lib/services/salesEvaluation';

/**
 * GET /api/v1/reports/sales-performance
 * Role: SUPERADMIN ONLY (Zero-Leakage Guarantee)
 *
 * Query params:
 * - month: string YYYY-MM (opsional, default bulan berjalan WIB)
 * - salesId: string (opsional, filter staf sales tertentu)
 *
 * Rujukan: Seksi 17.3 nomor 23 & Table 19.7 Dokumen Spesifikasi.
 */
export const GET = withApi(
  {
    roles: [Role.SUPERADMIN],
  },
  async ({ ctx, req }) => {
    const url = new URL(req.url);
    const rawQuery = {
      month: url.searchParams.get('month') || undefined,
      salesId: url.searchParams.get('salesId') || undefined,
    };

    const parsedQuery = SalesPerformanceQuerySchema.parse(rawQuery);
    const data = await getSalesPerformanceReport(ctx, parsedQuery);

    return {
      status: 200,
      data,
    };
  }
);

