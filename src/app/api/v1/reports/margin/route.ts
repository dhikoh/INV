import { withApi } from '@/lib/api/withApi';
import { Role } from '@prisma/client';
import { MarginReportQuerySchema } from '@/lib/validation/report';
import { getMarginReport } from '@/lib/services/reportMargin';

/**
 * GET /api/v1/reports/margin
 * Role: SUPERADMIN ONLY (Sales ditolak 403 Forbidden - Zero-Leakage Guarantee)
 *
 * Query params:
 * - groupBy: 'order' | 'product' | 'sales' | 'business' (default 'order')
 * - from: string YYYY-MM-DD
 * - to: string YYYY-MM-DD
 * - salesId: string
 * - productId: string
 *
 * Rujukan: Seksi 7.4, 9.2, 17.3 nomor 22, 18.1 nomor 33 Dokumen Spesifikasi.
 */
export const GET = withApi(
  {
    roles: [Role.SUPERADMIN],
  },
  async ({ ctx, req }) => {
    const url = new URL(req.url);
    const rawQuery = {
      groupBy: url.searchParams.get('groupBy') || 'order',
      from: url.searchParams.get('from') || undefined,
      to: url.searchParams.get('to') || undefined,
      salesId: url.searchParams.get('salesId') || undefined,
      productId: url.searchParams.get('productId') || undefined,
    };

    const parsedQuery = MarginReportQuerySchema.parse(rawQuery);
    const data = await getMarginReport(ctx, parsedQuery);

    return {
      status: 200,
      data,
    };
  }
);
