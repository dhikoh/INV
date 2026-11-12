import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';

export const CounterScope = {
  ORDER_SEQ: 'ORDER_SEQ',
  PO_SEQ: 'PO_SEQ',
  CREDIT_NOTE_SEQ: 'CREDIT_NOTE_SEQ',
  RECEIPT_SEQ: 'RECEIPT_SEQ',
} as const;

export type CounterScope = (typeof CounterScope)[keyof typeof CounterScope];

/**
 * Interface minimal untuk mengeksekusi $queryRaw baik melalui PrismaClient,
 * Prisma TransactionClient, maupun test adapter (seperti PGlite).
 */
export interface QueryRawExecutor {
  $queryRaw<T = unknown>(
    query: TemplateStringsArray | Prisma.Sql,
    ...values: unknown[]
  ): Promise<T>;
}

/**
 * Mengalokasikan nomor urut dokumen secara atomik menggunakan PostgreSQL UPSERT
 * (INSERT ... ON CONFLICT DO UPDATE SET lastSeq = lastSeq + 1 RETURNING lastSeq).
 *
 * Alokasi wajib berada di dalam transaksi database yang sama dengan pembuatan atau
 * persetujuan dokumen, sehingga bila transaksi dibatalkan (rollback), nomor tidak
 * hangus dan tidak meninggalkan celah (hole).
 *
 * Rujukan: Seksi 7.8 Dokumen Spesifikasi.
 */
export async function nextSeq(
  tx: Prisma.TransactionClient | QueryRawExecutor,
  businessId: string,
  scope: string,
  scopeId: string
): Promise<number> {
  if (!businessId || !businessId.trim()) {
    throw new Error('businessId wajib diisi untuk alokasi nomor urut');
  }
  if (!scope || !scope.trim()) {
    throw new Error('scope wajib diisi untuk alokasi nomor urut');
  }
  if (!scopeId || !scopeId.trim()) {
    throw new Error('scopeId wajib diisi untuk alokasi nomor urut');
  }

  const rows = await tx.$queryRaw<{ lastSeq: number }[]>`
    INSERT INTO "DocumentCounter" ("id", "businessId", "scope", "scopeId", "lastSeq")
    VALUES (${randomUUID()}, ${businessId}, ${scope}, ${scopeId}, 1)
    ON CONFLICT ("businessId", "scope", "scopeId")
    DO UPDATE SET "lastSeq" = "DocumentCounter"."lastSeq" + 1
    RETURNING "lastSeq"`;

  if (!rows || rows.length === 0) {
    throw new Error('Gagal mengalokasikan nomor urut dokumen: tidak ada baris yang dikembalikan');
  }

  const row = rows[0] as { lastSeq?: number; lastseq?: number };
  const lastSeq = row.lastSeq ?? row.lastseq;

  if (lastSeq === undefined || lastSeq === null) {
    throw new Error('Gagal mengalokasikan nomor urut dokumen: kolom lastSeq tidak ditemukan');
  }

  return Number(lastSeq);
}

/**
 * Helper alokasi nomor urut pesanan / invoice pelanggan (scope ORDER_SEQ).
 * Urutan per customer dan tidak pernah direset.
 */
export async function allocateCustomerOrderSeq(
  tx: Prisma.TransactionClient | QueryRawExecutor,
  businessId: string,
  customerId: string
): Promise<number> {
  return nextSeq(tx, businessId, CounterScope.ORDER_SEQ, customerId);
}

/**
 * Helper alokasi nomor urut purchase order vendor (scope PO_SEQ).
 * Urutan per vendor dan tidak pernah direset.
 */
export async function allocateVendorPoSeq(
  tx: Prisma.TransactionClient | QueryRawExecutor,
  businessId: string,
  vendorId: string
): Promise<number> {
  return nextSeq(tx, businessId, CounterScope.PO_SEQ, vendorId);
}

/**
 * Helper alokasi nomor urut credit note pelanggan (scope CREDIT_NOTE_SEQ).
 * Urutan per customer dan tidak pernah direset.
 */
export async function allocateCustomerCreditNoteSeq(
  tx: Prisma.TransactionClient | QueryRawExecutor,
  businessId: string,
  customerId: string
): Promise<number> {
  return nextSeq(tx, businessId, CounterScope.CREDIT_NOTE_SEQ, customerId);
}

/**
 * Helper alokasi nomor urut kwitansi pembayaran resmi (scope RECEIPT_SEQ).
 * Urutan per customer dan tidak pernah direset.
 */
export async function allocateCustomerReceiptSeq(
  tx: Prisma.TransactionClient | QueryRawExecutor,
  businessId: string,
  customerId: string
): Promise<number> {
  return nextSeq(tx, businessId, CounterScope.RECEIPT_SEQ, customerId);
}
