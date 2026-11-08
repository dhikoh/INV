import { Prisma, StockMoveType, Role } from '@prisma/client';
import { prisma } from '@/lib/db';
import { DomainError } from '../domain/money';

export type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

/**
 * WAJIB dipanggil sebelum mengubah stok produk untuk mencegah deadlock dan race condition.
 * Mengurutkan array ID produk secara ascending.
 *
 * Rujukan: Seksi 7.9 Dokumen Spesifikasi.
 */
export async function lockProducts(tx: Tx, ids: string[]): Promise<void> {
  const sorted = [...new Set(ids)].sort();
  if (sorted.length === 0) return;

  await tx.$queryRaw`
    SELECT "id" FROM "Product" 
    WHERE "id" IN (${Prisma.join(sorted)}) 
    ORDER BY "id" ASC 
    FOR UPDATE
  `;
}

export interface MoveStockParams {
  businessId: string;
  productId: string;
  type: StockMoveType;
  qtyDelta: number;
  refType?: string;
  refId?: string;
  note?: string;
  actorId: string;
}

/**
 * Satu-satunya titik pemindahan/perubahan stockQty fisik produk.
 * Memperbarui Product.stockQty dan mencatat riwayat StockMovement.
 *
 * Rujukan: Seksi 7.9 Dokumen Spesifikasi.
 */
export async function moveStock(
  tx: Tx,
  p: MoveStockParams
): Promise<number> {
  await tx.product.updateMany({
    where: { id: p.productId, businessId: p.businessId },
    data: { stockQty: { increment: p.qtyDelta } },
  });

  const prod = await tx.product.findFirst({
    where: { id: p.productId, businessId: p.businessId },
    select: { stockQty: true },
  });

  if (!prod) {
    throw new DomainError('PRODUCT_NOT_FOUND', 'Produk tidak ditemukan', 404);
  }

  await tx.stockMovement.create({
    data: {
      businessId: p.businessId,
      productId: p.productId,
      type: p.type,
      qtyDelta: p.qtyDelta,
      balanceAfter: prod.stockQty,
      refType: p.refType,
      refId: p.refId,
      note: p.note,
      createdById: p.actorId,
    },
  });

  return prod.stockQty;
}

/**
 * Reservasi stok saat persetujuan invoice pertama order.
 * Memeriksa ketersediaan (stockQty - reservedQty) bila allowNegativeStock = false.
 * Idempoten: bila order.stockReserved = true, langsung kembali tanpa aksi ganda.
 *
 * Rujukan: Seksi 7.9 & 8.2 Dokumen Spesifikasi.
 */
export async function reserveOrderStock(
  tx: Tx,
  order: { id: string; businessId: string; stockReserved: boolean },
  items: { productId: string; qty: number }[],
  allowNegative: boolean
): Promise<void> {
  if (order.stockReserved) return;

  const ids = items.map((i) => i.productId);
  await lockProducts(tx, ids);

  const products = await tx.product.findMany({
    where: { id: { in: ids }, businessId: order.businessId },
    select: { id: true, name: true, stockQty: true, reservedQty: true },
  });

  const short = items
    .map((i) => {
      const p = products.find((x) => x.id === i.productId);
      if (!p) {
        throw new DomainError('PRODUCT_NOT_FOUND', 'Produk tidak ditemukan', 404);
      }
      return {
        id: p.id,
        name: p.name,
        need: i.qty,
        available: p.stockQty - p.reservedQty,
      };
    })
    .filter((x) => !allowNegative && x.available < x.need);

  if (short.length > 0) {
    throw new DomainError(
      'INSUFFICIENT_STOCK',
      'Stok tidak cukup untuk beberapa produk',
      409,
      short
    );
  }

  for (const i of items) {
    await tx.product.updateMany({
      where: { id: i.productId, businessId: order.businessId },
      data: { reservedQty: { increment: i.qty } },
    });
  }

  await tx.order.updateMany({
    where: { id: order.id, businessId: order.businessId },
    data: { stockReserved: true },
  });
}

/**
 * Melepas reservasi stok (misal: saat order di-void sebelum dikirim).
 * Idempoten: bila order.stockReserved = false, tidak melakukan pengurangan ganda.
 *
 * Rujukan: Seksi 7.9 Dokumen Spesifikasi.
 */
export async function releaseOrderStock(
  tx: Tx,
  order: { id: string; businessId: string; stockReserved: boolean },
  items: { productId: string; qty: number }[]
): Promise<void> {
  if (!order.stockReserved) return;

  const ids = items.map((i) => i.productId);
  await lockProducts(tx, ids);

  for (const i of items) {
    await tx.product.updateMany({
      where: { id: i.productId, businessId: order.businessId },
      data: { reservedQty: { decrement: i.qty } },
    });
  }

  await tx.order.updateMany({
    where: { id: order.id, businessId: order.businessId },
    data: { stockReserved: false },
  });
}

/**
 * Mengeluarkan stok saat pengiriman dikonfirmasi (SHIPPED).
 * Mengurangi reservedQty (bila direservasi) dan mengurangi stockQty fisik melalui moveStock.
 *
 * Rujukan: Seksi 7.9 Dokumen Spesifikasi.
 */
export async function shipOrderStock(
  tx: Tx,
  order: { id: string; businessId: string; orderNo?: string | null; stockReserved: boolean },
  items: { productId: string; qty: number }[],
  actorId: string
): Promise<void> {
  const ids = items.map((i) => i.productId);
  await lockProducts(tx, ids);

  for (const i of items) {
    if (order.stockReserved) {
      await tx.product.updateMany({
        where: { id: i.productId, businessId: order.businessId },
        data: { reservedQty: { decrement: i.qty } },
      });
    }

    await moveStock(tx, {
      businessId: order.businessId,
      productId: i.productId,
      type: StockMoveType.SALE_SHIPMENT,
      qtyDelta: -i.qty,
      refType: 'ORDER',
      refId: order.id,
      note: `Pengiriman pesanan ${order.orderNo || order.id}`,
      actorId,
    });
  }

  if (order.stockReserved) {
    await tx.order.updateMany({
      where: { id: order.id, businessId: order.businessId },
      data: { stockReserved: false },
    });
  }
}

/**
 * Penyesuaian stok manual (ADJUSTMENT).
 * Alasan wajib minimal 5 karakter, mencatat audit log.
 *
 * Rujukan: Seksi 7.9 Dokumen Spesifikasi.
 */
export async function adjustStock(
  tx: Tx,
  params: {
    businessId: string;
    productId: string;
    qtyDelta: number;
    reason: string;
    actorId: string;
  }
): Promise<number> {
  if (!params.reason || params.reason.trim().length < 5) {
    throw new DomainError(
      'REASON_REQUIRED',
      'Alasan penyesuaian stok wajib diisi minimal 5 karakter',
      422
    );
  }

  await lockProducts(tx, [params.productId]);

  const product = await tx.product.findFirst({
    where: { id: params.productId, businessId: params.businessId },
    select: { id: true, name: true, stockQty: true },
  });

  if (!product) {
    throw new DomainError('PRODUCT_NOT_FOUND', 'Produk tidak ditemukan', 404);
  }

  const balanceAfter = await moveStock(tx, {
    businessId: params.businessId,
    productId: params.productId,
    type: StockMoveType.ADJUSTMENT,
    qtyDelta: params.qtyDelta,
    refType: 'MANUAL',
    note: params.reason.trim(),
    actorId: params.actorId,
  });

  await tx.auditLog.create({
    data: {
      businessId: params.businessId,
      actorId: params.actorId,
      actorRole: Role.SUPERADMIN,
      action: 'STOCK_ADJUST',
      entityType: 'Product',
      entityId: params.productId,
      summary: `Penyesuaian stok produk ${product.name}: ${params.qtyDelta > 0 ? '+' : ''}${params.qtyDelta} (sisa: ${balanceAfter})`,
      reason: params.reason.trim(),
    },
  });

  return balanceAfter;
}

/**
 * Stock Opname (OPNAME).
 * Menyesuaikan stok fisik ke hasil hitung riil: qtyDelta = countedQty - stockQty.
 * Alasan wajib minimal 5 karakter, mencatat audit log.
 *
 * Rujukan: Seksi 7.9 Dokumen Spesifikasi.
 */
export async function opnameStock(
  tx: Tx,
  params: {
    businessId: string;
    productId: string;
    countedQty: number;
    reason: string;
    actorId: string;
  }
): Promise<number> {
  if (params.countedQty < 0) {
    throw new DomainError(
      'INVALID_COUNT',
      'Jumlah fisik stock opname tidak boleh negatif',
      422
    );
  }

  if (!params.reason || params.reason.trim().length < 5) {
    throw new DomainError(
      'REASON_REQUIRED',
      'Alasan stock opname wajib diisi minimal 5 karakter',
      422
    );
  }

  await lockProducts(tx, [params.productId]);

  const product = await tx.product.findFirst({
    where: { id: params.productId, businessId: params.businessId },
    select: { id: true, name: true, stockQty: true },
  });

  if (!product) {
    throw new DomainError('PRODUCT_NOT_FOUND', 'Produk tidak ditemukan', 404);
  }

  const qtyDelta = params.countedQty - product.stockQty;

  const balanceAfter = await moveStock(tx, {
    businessId: params.businessId,
    productId: params.productId,
    type: StockMoveType.OPNAME,
    qtyDelta,
    refType: 'OPNAME',
    note: params.reason.trim(),
    actorId: params.actorId,
  });

  await tx.auditLog.create({
    data: {
      businessId: params.businessId,
      actorId: params.actorId,
      actorRole: Role.SUPERADMIN,
      action: 'STOCK_OPNAME',
      entityType: 'Product',
      entityId: params.productId,
      summary: `Stock opname produk ${product.name}: fisik ${params.countedQty} (selisih: ${qtyDelta})`,
      reason: params.reason.trim(),
    },
  });

  return balanceAfter;
}
