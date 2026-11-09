import { withApi } from '@/lib/api/withApi';
import { Role } from '@prisma/client';
import { SalesTargetUpsertSchema } from '@/lib/validation/salesEvaluation';
import {
  getSalesTarget,
  upsertSalesTarget,
} from '@/lib/services/salesEvaluation';
import { DomainError } from '@/lib/domain/money';

const MONTH_REGEX = /^\d{4}-\d{2}$/;

/**
 * GET /api/v1/sales/:id/targets/:month
 * Role: SUPERADMIN ONLY
 *
 * Mengambil target omzet & profit bulanan staf sales tertentu.
 * Rujukan: Seksi 8, Seksi 17.3 nomor 23.
 */
export const GET = withApi(
  {
    roles: [Role.SUPERADMIN],
  },
  async ({ ctx, params }) => {
    const salesId = params.id;
    const month = params.month;
    if (!salesId) {
      throw new DomainError('BAD_REQUEST', 'ID Sales tidak valid', 400);
    }
    if (!month || !MONTH_REGEX.test(month)) {
      throw new DomainError('BAD_REQUEST', 'Format bulan harus YYYY-MM', 400);
    }

    const data = await getSalesTarget(ctx, salesId, month);

    return {
      status: 200,
      data,
    };
  }
);

/**
 * PUT /api/v1/sales/:id/targets/:month
 * Role: SUPERADMIN ONLY
 *
 * Menyimpan / memperbarui target omzet & profit bulanan staf sales tertentu.
 * Rujukan: Seksi 8, Seksi 17.3 nomor 23.
 */
export const PUT = withApi(
  {
    roles: [Role.SUPERADMIN],
    body: SalesTargetUpsertSchema,
  },
  async ({ ctx, params, body }) => {
    const salesId = params.id;
    const month = params.month;
    if (!salesId) {
      throw new DomainError('BAD_REQUEST', 'ID Sales tidak valid', 400);
    }
    if (!month || !MONTH_REGEX.test(month)) {
      throw new DomainError('BAD_REQUEST', 'Format bulan harus YYYY-MM', 400);
    }

    const data = await upsertSalesTarget(ctx, salesId, month, body);

    return {
      status: 200,
      data,
    };
  }
);

