import { OrderStatus } from '@prisma/client';
import { DomainError } from '../domain/money';
import { TxClient } from './order';

/**
 * Penguncian baris order secara pesimistik (SELECT FOR UPDATE)
 * untuk mencegah kondisi balapan (race condition) pada seluruh transisi status.
 *
 * Rujukan: Seksi 8.4 Dokumen Spesifikasi.
 */
export async function lockOrder(
  tx: TxClient,
  orderId: string,
  businessId: string
): Promise<void> {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "Order"
    WHERE "id" = ${orderId} AND "businessId" = ${businessId} AND "deletedAt" IS NULL
    FOR UPDATE
  `;
  if (rows.length === 0) {
    throw new DomainError('ORDER_NOT_FOUND', 'Order tidak ditemukan', 404);
  }
}

/**
 * Memastikan status order berada dalam daftar status yang diperbolehkan
 * untuk aksi tertentu, menolak 409 INVALID_STATE bila tidak sesuai.
 *
 * Rujukan: Seksi 8.2 & 8.4 Dokumen Spesifikasi.
 */
export function assertStatus(
  current: OrderStatus,
  allowed: OrderStatus[],
  action: string
): void {
  if (!allowed.includes(current)) {
    throw new DomainError(
      'INVALID_STATE',
      `Aksi ${action} tidak boleh pada status ${current}`,
      409
    );
  }
}

/**
 * Penegakan kunci optimistik versi rev untuk mencegah tabrakan data (stale data).
 *
 * Rujukan: Seksi 8.4 Dokumen Spesifikasi.
 */
export function assertRev(clientRev: number, dbRev: number): void {
  if (clientRev !== dbRev) {
    throw new DomainError(
      'STALE_DATA',
      'Data sudah berubah, muat ulang halaman',
      409
    );
  }
}
