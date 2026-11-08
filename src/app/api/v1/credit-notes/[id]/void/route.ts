import { withApi } from '@/lib/api/withApi';
import { requireBusiness } from '@/lib/auth/context';
import { prisma } from '@/lib/db';
import { Role } from '@prisma/client';
import { CreditNoteVoidSchema } from '@/lib/validation/credit-note';
import { voidCreditNote, TxClient } from '@/lib/services/credit-note';
import { DomainError } from '@/lib/domain/money';

/**
 * POST /api/v1/credit-notes/:id/void
 * Role: SUPERADMIN ONLY (Sales ditolak 403 FORBIDDEN)
 *
 * Membatalkan (void) Nota Kredit:
 * - Mengembalikan saldo tagihan pesanan (bila OFFSET).
 * - Menarik kembali saldo deposit kredit pelanggan (bila CUSTOMER_CREDIT, menolak 409 bila kredit telah digunakan).
 * - Membatalkan pembayaran refund (bila REFUND).
 * - Membalikkan stok fisik gudang (StockMoveType.VOID_REVERSAL bila sebelumnya restock).
 * - Pencatatan AuditLog CREDIT_NOTE_VOID.
 */
export const POST = withApi(
  {
    roles: [Role.SUPERADMIN],
    body: CreditNoteVoidSchema,
  },
  async ({ ctx, params, body }) => {
    requireBusiness(ctx);
    const id = params.id;
    if (!id) {
      throw new DomainError('BAD_REQUEST', 'ID Nota Kredit tidak valid', 400);
    }

    const result = await prisma.$transaction(async (tx) => {
      return voidCreditNote(tx as unknown as TxClient, ctx, id, body.reason);
    });

    return {
      status: 200,
      data: result,
    };
  }
);

