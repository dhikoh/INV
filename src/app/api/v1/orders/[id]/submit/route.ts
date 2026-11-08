import { withApi } from '@/lib/api/withApi';
import { requireBusiness } from '@/lib/auth/context';
import { prisma } from '@/lib/db';
import { Role } from '@prisma/client';
import { OrderSubmitSchema } from '@/lib/validation/order';
import { submitOrder, TxClient } from '@/lib/services/order';

/**
 * POST /api/v1/orders/:id/submit
 * Role: SUPERADMIN & SALES (pembuat order)
 *
 * Mengajukan draf pesanan untuk persetujuan Super Admin.
 * - Transisi status: DRAFT atau REVISION_REQUIRED -> PENDING_APPROVAL.
 * - Membuat Invoice berstatus PENDING_APPROVAL bertipe DP (bila dpBps > 0) atau FINAL.
 * - Penegakan alasan belowMin jika hasBelowMin = true (minimal 5 karakter).
 * - Penolakan 409 bila pengajuan kedua dilakukan saat invoice masih menunggu.
 *
 * Rujukan: Seksi 8.2 & Seksi 19.5 (T3.1) Dokumen Spesifikasi.
 */
export const POST = withApi(
  {
    roles: [Role.SUPERADMIN, Role.SALES],
    body: OrderSubmitSchema,
  },
  async ({ ctx, params, body }) => {
    requireBusiness(ctx);
    const { id } = params;

    const result = await prisma.$transaction(async (tx) => {
      return submitOrder(tx as unknown as TxClient, ctx, id, body);
    });

    return {
      status: 200,
      data: result,
    };
  }
);
