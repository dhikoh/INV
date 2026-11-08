import { withApi } from '@/lib/api/withApi';
import { prisma } from '@/lib/db';
import { PaymentVoidSchema } from '@/lib/validation/payment';
import {
  voidPayment,
  formatPaymentDto,
  PaymentDto,
} from '@/lib/services/payment';
import { Role } from '@prisma/client';

/**
 * POST /api/v1/payments/:id/void
 *
 * Membatalkan (void) pembayaran terverifikasi dengan alasan wajib minimal 5 karakter (Super Admin ONLY).
 * Menghitung ulang Order.paidTotal dan Invoice.paidAmount dari sumbernya secara aman.
 */
export const POST = withApi(
  {
    roles: [Role.SUPERADMIN],
    body: PaymentVoidSchema,
  },
  async ({ ctx, params, body }): Promise<{ status: number; data: PaymentDto }> => {
    const paymentId = params.id;

    const payment = await prisma.$transaction(async (tx) => {
      return voidPayment(tx, ctx, paymentId, { reason: body.reason });
    });

    return {
      status: 200,
      data: formatPaymentDto(payment),
    };
  }
);
