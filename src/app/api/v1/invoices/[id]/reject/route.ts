import { withApi } from '@/lib/api/withApi';
import { requireBusiness } from '@/lib/auth/context';
import { prisma } from '@/lib/db';
import { Role } from '@prisma/client';
import { InvoiceRejectSchema } from '@/lib/validation/invoice';
import { rejectInvoice, TxClient } from '@/lib/services/invoice';

/**
 * POST /api/v1/invoices/:id/reject
 * Role: SUPERADMIN ONLY (Sales ditolak 403 FORBIDDEN)
 *
 * Menolak pengajuan invoice dan meminta revisi:
 * - Kunci pesimistik order & validasi status PENDING_APPROVAL.
 * - Penegakan alasan penolakan (reason) wajib minimal 5 karakter.
 * - Invoice berstatus REJECTED.
 * - Order bertransisi ke REVISION_REQUIRED (atau IN_PROCESS untuk invoice final) dan menaikkan order.version.
 * - Pencatatan AuditLog & pengiriman notifikasi ke staf Sales.
 *
 * Rujukan: Seksi 7.11, 8.2 & Seksi 19.5 (T3.2) Dokumen Spesifikasi.
 */
export const POST = withApi(
  {
    roles: [Role.SUPERADMIN],
    body: InvoiceRejectSchema,
  },
  async ({ ctx, params, body }) => {
    requireBusiness(ctx);
    const { id } = params;

    const result = await prisma.$transaction(async (tx) => {
      return rejectInvoice(tx as unknown as TxClient, ctx, id, body);
    });

    return {
      status: 200,
      data: result,
    };
  }
);
