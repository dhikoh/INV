import { withApi } from '@/lib/api/withApi';
import { requireBusiness } from '@/lib/auth/context';
import { prisma } from '@/lib/db';
import { Role } from '@prisma/client';
import { CreditNoteCreateSchema } from '@/lib/validation/credit-note';
import {
  createCreditNote,
  listOrderCreditNotes,
  TxClient,
} from '@/lib/services/credit-note';
import { DomainError } from '@/lib/domain/money';

/**
 * POST /api/v1/orders/:id/credit-notes
 * Role: SUPERADMIN, SALES
 *
 * Menerbitkan Nota Kredit (Credit Note) & Retur Penjualan:
 * - Validasi barang terkirim (SHIPPED/DELIVERED/COMPLETED).
 * - Perhitungan kredit murni tanpa pembulatan via creditThisReturn.
 * - Pilihan penyelesaian: OFFSET (potong tagihan pesanan), REFUND (pengembalian kas), CUSTOMER_CREDIT (deposit pelanggan).
 * - Pembalikan stok fisik bila restock = true (StockMoveType.RETURN_IN).
 * - Alokasi nomor atomik KODECUST/CN/DD/MM/YYYY/NNNN.
 */
export const POST = withApi(
  {
    roles: [Role.SUPERADMIN, Role.SALES],
    body: CreditNoteCreateSchema,
  },
  async ({ ctx, params, body }) => {
    requireBusiness(ctx);
    const orderId = params.id;
    if (!orderId) {
      throw new DomainError('BAD_REQUEST', 'ID Pesanan tidak valid', 400);
    }

    const result = await prisma.$transaction(async (tx) => {
      return createCreditNote(tx as unknown as TxClient, ctx, orderId, body);
    });

    return {
      status: 201,
      data: result,
    };
  }
);

/**
 * GET /api/v1/orders/:id/credit-notes
 * Role: SUPERADMIN, SALES
 *
 * Mengambil daftar seluruh nota kredit untuk pesanan tertentu.
 */
export const GET = withApi(
  {
    roles: [Role.SUPERADMIN, Role.SALES],
  },
  async ({ ctx, params }) => {
    requireBusiness(ctx);
    const orderId = params.id;
    if (!orderId) {
      throw new DomainError('BAD_REQUEST', 'ID Pesanan tidak valid', 400);
    }

    const result = await prisma.$transaction(async (tx) => {
      return listOrderCreditNotes(tx as unknown as TxClient, ctx, orderId);
    });

    return {
      status: 200,
      data: result,
    };
  }
);

