import { withApi } from '@/lib/api/withApi';
import { requireBusiness } from '@/lib/auth/context';
import { prisma } from '@/lib/db';
import { Role } from '@prisma/client';
import { VendorPaymentCreateSchema } from '@/lib/validation/purchase-order';
import { recordVendorPayment } from '@/lib/services/vendor-ledger';

/**
 * POST /api/v1/vendors/:id/payments
 * Role: SUPERADMIN ONLY (Sales ditolak 403 FORBIDDEN)
 *
 * Mencatat pembayaran kepada vendor (VendorPayment).
 *
 * Rujukan: Seksi 7.9 & 8.3 Dokumen Spesifikasi.
 */
export const POST = withApi(
  {
    roles: [Role.SUPERADMIN],
    body: VendorPaymentCreateSchema,
  },
  async ({ ctx, params, body }) => {
    const businessId = requireBusiness(ctx);
    const { id } = params;

    const payment = await prisma.$transaction(async (tx) => {
      return recordVendorPayment(tx, businessId, id, ctx.user.id, body);
    });

    return {
      status: 201,
      data: {
        id: payment.id,
        businessId: payment.businessId,
        vendorId: payment.vendorId,
        purchaseOrderId: payment.purchaseOrderId,
        amount: Number(payment.amount),
        paidAt: payment.paidAt,
        method: payment.method,
        reference: payment.reference,
        notes: payment.notes,
        createdAt: payment.createdAt,
      },
    };
  }
);
