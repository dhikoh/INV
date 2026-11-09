import { withApi } from '@/lib/api/withApi';
import { Role } from '@prisma/client';
import { getCrmReport } from '@/lib/services/reportCrm';

/**
 * GET /api/v1/reports/crm
 * Role: SUPERADMIN & SALES (Sales dibatasi hanya melihat aktivitas miliknya sendiri)
 *
 * Query params:
 * - month: string YYYY-MM (opsional, default bulan berjalan WIB)
 * - salesId: string (opsional untuk Super Admin; diabaikan/di-override untuk Sales)
 *
 * Rujukan: Seksi 16.2 & Table 11 Dokumen Spesifikasi.
 */
export const GET = withApi(
  {
    roles: [Role.SUPERADMIN, Role.SALES],
  },
  async ({ ctx, req }) => {
    const url = new URL(req.url);
    const query = {
      month: url.searchParams.get('month') || undefined,
      salesId: url.searchParams.get('salesId') || undefined,
    };

    const data = await getCrmReport(ctx, query);

    return {
      status: 200,
      data,
    };
  }
);

