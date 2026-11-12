import { withApi } from '@/lib/api/withApi';
import { parsePaymentInput } from '@/lib/api/paymentInput';
import { requireBusiness } from '@/lib/auth/context';
import { prisma } from '@/lib/db';
import { DomainError } from '@/lib/domain/money';
import {
  createPayment,
  formatPaymentDto,
  PaymentDto,
} from '@/lib/services/payment';
import { Role } from '@prisma/client';

/**
 * GET /api/v1/orders/:id/payments
 *
 * Mengambil daftar riwayat pembayaran suatu pesanan.
 * Sales hanya dapat mengakses pembayaran untuk pesanannya sendiri.
 */
export const GET = withApi(
  {
    roles: [Role.SUPERADMIN, Role.SALES],
  },
  async ({ ctx, params }): Promise<{ status: number; data: PaymentDto[] }> => {
    const businessId = requireBusiness(ctx);
    const orderId = params.id;

    const order = await prisma.order.findFirst({
      where: { id: orderId, businessId, deletedAt: null },
    });

    if (!order) {
      throw new DomainError('ORDER_NOT_FOUND', 'Pesanan tidak ditemukan', 404);
    }

    if (ctx.role === Role.SALES && order.salesId !== ctx.user.id) {
      throw new DomainError('ORDER_NOT_FOUND', 'Pesanan tidak ditemukan', 404);
    }

    const payments = await prisma.payment.findMany({
      where: { orderId: order.id, businessId },
      orderBy: { createdAt: 'desc' },
    });

    return {
      status: 200,
      data: payments.map(formatPaymentDto),
    };
  }
);

/**
 * POST /api/v1/orders/:id/payments
 *
 * Mencatat pembayaran masuk (mendukung multipart/form-data dengan bukti transfer dan JSON).
 * Sales hanya dapat mencatat pembayaran untuk pesanannya sendiri.
 */
export const POST = withApi(
  {
    roles: [Role.SUPERADMIN, Role.SALES],
  },
  async ({ ctx, params, req }): Promise<{ status: number; data: PaymentDto }> => {
    const businessId = requireBusiness(ctx);
    const parsed = await parsePaymentInput(req, businessId, {
      fixedOrderId: params.id,
    });

    const payment = await prisma.$transaction(async (tx) => {
      return createPayment(tx, ctx, {
        orderId: parsed.orderId,
        invoiceId: parsed.invoiceId,
        amount: parsed.amount,
        method: parsed.method,
        paidAt: parsed.paidAt,
        reference: parsed.reference,
        proofPath: parsed.proofPath,
        notes: parsed.notes,
        autoVerify: parsed.autoVerify,
      });
    });

    return {
      status: 201,
      data: formatPaymentDto(payment),
    };
  }
);
