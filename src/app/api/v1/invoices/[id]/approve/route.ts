import { withApi } from '@/lib/api/withApi';
import { requireBusiness } from '@/lib/auth/context';
import { prisma } from '@/lib/db';
import { Role } from '@prisma/client';
import { InvoiceApproveSchema } from '@/lib/validation/invoice';
import { approveInvoice, TxClient } from '@/lib/services/invoice';

/**
 * POST /api/v1/invoices/:id/approve
 * Role: SUPERADMIN ONLY (Sales ditolak 403 FORBIDDEN)
 *
 * Menyetujui invoice dan pesanan penjualan:
 * - Kunci pesimistik order & validasi status PENDING_APPROVAL.
 * - Penegakan overrideNote wajib (minimal 5 karakter) jika order.hasBelowMin = true.
 * - Reservasi stok produk (menolak 409 INSUFFICIENT_STOCK bila stok kurang dan allowNegativeStock = false).
 * - Alokasi nomor resmi pesanan (orderNo) dan invoice resmi (nomor unik).
 * - Pembuatan InvoiceSnapshot statis tanpa data rahasia.
 * - Transisi status order ke AWAITING_DP (bila DP) atau AWAITING_FINAL_PAYMENT.
 * - Pencatatan AuditLog & pengiriman notifikasi ke staf Sales.
 *
 * Rujukan: Seksi 7.8, 7.9, 7.11, 8.2, 14.1 & Seksi 19.5 (T3.2) Dokumen Spesifikasi.
 */
export const POST = withApi(
  {
    roles: [Role.SUPERADMIN],
    body: InvoiceApproveSchema,
  },
  async ({ ctx, params, body }) => {
    requireBusiness(ctx);
    const { id } = params;

    const result = await prisma.$transaction(async (tx) => {
      return approveInvoice(tx as unknown as TxClient, ctx, id, body);
    });

    return {
      status: 200,
      data: result,
    };
  }
);
