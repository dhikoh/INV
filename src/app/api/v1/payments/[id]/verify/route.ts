import { withApi } from '@/lib/api/withApi';
import { prisma } from '@/lib/db';
import {
  verifyPayment,
  formatPaymentDto,
  PaymentDto,
} from '@/lib/services/payment';
import { Role } from '@prisma/client';

/**
 * POST /api/v1/payments/:id/verify
 *
 * Verifikasi penerimaan pembayaran (Super Admin ONLY).
 * Sales ditolak 403 FORBIDDEN.
 */
export const POST = withApi(
  {
    roles: [Role.SUPERADMIN],
  },
  async ({ ctx, params }): Promise<{ status: number; data: PaymentDto }> => {
    const paymentId = params.id;

    const payment = await prisma.$transaction(async (tx) => {
      return verifyPayment(tx, ctx, paymentId);
    });

    return {
      status: 200,
      data: formatPaymentDto(payment),
    };
  }
);
