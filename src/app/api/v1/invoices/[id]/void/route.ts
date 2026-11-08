import { withApi } from '@/lib/api/withApi';
import { requireBusiness } from '@/lib/auth/context';
import { prisma } from '@/lib/db';
import { Role } from '@prisma/client';
import { InvoiceVoidSchema } from '@/lib/validation/invoice';
import { voidInvoice, TxClient } from '@/lib/services/invoice';

/**
 * POST /api/v1/invoices/:id/void
 * Role: SUPERADMIN ONLY
 *
 * Membatalkan (void) faktur resmi yang telah disetujui.
 * - Syarat: Invoice berstatus APPROVED dan tidak memiliki pembayaran terverifikasi.
 * - Input: reason wajib minimal 5 karakter.
 * - Efek: Invoice menjadi VOID.
 *   - Bila invoice pertama: lepas reservasi stok, order kembali ke REVISION_REQUIRED (version + 1).
 *   - Bila invoice pelunasan: order kembali ke IN_PROCESS.
 *
 * Rujukan: Seksi 18.2 & Seksi 19.5 (T3.4) Dokumen Spesifikasi.
 */
export const POST = withApi(
  {
    roles: [Role.SUPERADMIN],
    body: InvoiceVoidSchema,
  },
  async ({ ctx, params, body }) => {
    requireBusiness(ctx);
    const { id } = params;

    const result = await prisma.$transaction(async (tx) => {
      return voidInvoice(tx as unknown as TxClient, ctx, id, body);
    });

    return {
      status: 200,
      data: result,
    };
  }
);

