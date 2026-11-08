import { withApi } from '@/lib/api/withApi';
import { prisma } from '@/lib/db';
import { PaymentRejectSchema } from '@/lib/validation/payment';
import {
  rejectPayment,
  formatPaymentDto,
  PaymentDto,
} from '@/lib/services/payment';
import { Role } from '@prisma/client';

/**
 * POST /api/v1/payments/:id/reject
 *
 * Menolak pembayaran masuk dengan alasan wajib minimal 5 karakter (Super Admin ONLY).
 */
export const POST = withApi(
  {
    roles: [Role.SUPERADMIN],
    body: PaymentRejectSchema,
  },
  async ({ ctx, params, body }): Promise<{ status: number; data: PaymentDto }> => {
    const paymentId = params.id;

    const payment = await prisma.$transaction(async (tx) => {
      return rejectPayment(tx, ctx, paymentId, { reason: body.reason });
    });

    return {
      status: 200,
      data: formatPaymentDto(payment),
    };
  }
);
