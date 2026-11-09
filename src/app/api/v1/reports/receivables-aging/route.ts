import { withApi } from '@/lib/api/withApi';
import { Role } from '@prisma/client';
import { getReceivablesAgingReport } from '@/lib/services/receivablesAging';

/**
 * GET /api/v1/reports/receivables-aging
 * Role: SUPERADMIN ONLY (Zero-Leakage Guarantee)
 *
 * Query params:
 * - customerId: string (opsional)
 * - salesId: string (opsional)
 *
 * Rujukan: Seksi 13.3 & Table 11 Dokumen Spesifikasi.
 */
export const GET = withApi(
  {
    roles: [Role.SUPERADMIN],
  },
  async ({ ctx, req }) => {
    const url = new URL(req.url);
    const query = {
      customerId: url.searchParams.get('customerId') || undefined,
      salesId: url.searchParams.get('salesId') || undefined,
    };

    const data = await getReceivablesAgingReport(ctx, query);

    return {
      status: 200,
      data,
    };
  }
);
