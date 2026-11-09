import { PoStatus, StockMoveType, Role } from '@prisma/client';
import { prisma } from '@/lib/db';
import { DomainError } from '../domain/money';
import { allocateVendorPoSeq } from './counter';
import { purchaseOrderNumber } from '../domain/numbering';
import { moveStock } from './stock';
import {
  PurchaseOrderCreateInput,
  PurchaseOrderUpdateInput,
  PurchaseOrderReceiveInput,
} from '../validation/purchase-order';

export type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

export interface PoProductSummary {
  id: string;
  sku: string;
  name: string;
  unit: string;
}

/**
 * Format DTO Purchase Order
 */
export function formatPurchaseOrderDto(
  po: {
    id: string;
    businessId: string;
    vendorId: string;
    vendorSeq: number | null;
    poNo: string | null;
    status: PoStatus;
    orderDate: Date;
    expectedDate: Date | null;
    subtotal: bigint | number;
    shippingCost: bigint | number;
    otherCost: bigint | number;
    total: bigint | number;
    paidTotal: bigint | number;
    notes: string | null;
    createdById: string;
    createdAt: Date;
    updatedAt: Date;
    vendor?: {
      id: string;
      code: string;
      name: string;
      picName: string | null;
      phone: string | null;
      address: string | null;
    };
    items?: Array<{
      id: string;
      purchaseOrderId: string;
      productId: string;
      qty: number;
      receivedQty: number;
      unitCost: bigint | number;
      lineTotal: bigint | number;
    }>;
  },
  productMap?: Map<string, PoProductSummary>
) {
  return {
    id: po.id,
    businessId: po.businessId,
    vendorId: po.vendorId,
    vendorSeq: po.vendorSeq,
    poNo: po.poNo,
    status: po.status,
    orderDate: po.orderDate,
    expectedDate: po.expectedDate,
    subtotal: Number(po.subtotal),
    shippingCost: Number(po.shippingCost),
    otherCost: Number(po.otherCost),
    total: Number(po.total),
    paidTotal: Number(po.paidTotal),
    notes: po.notes,
    createdById: po.createdById,
    createdAt: po.createdAt,
    updatedAt: po.updatedAt,
    vendor: po.vendor,
    items: (po.items ?? []).map((item) => ({
      id: item.id,
      purchaseOrderId: item.purchaseOrderId,
      productId: item.productId,
      qty: item.qty,
      receivedQty: item.receivedQty,
      unitCost: Number(item.unitCost),
      lineTotal: Number(item.lineTotal),
      product: productMap?.get(item.productId) || null,
    })),
  };
}

/**
 * Helper untuk mengambil Map produk untuk baris-baris PO
 */
export async function getProductMapForPo(
  client: Tx,
  items: Array<{ productId: string }>,
  businessId?: string
): Promise<Map<string, PoProductSummary>> {
  const productIds = [...new Set(items.map((i) => i.productId))];
  if (productIds.length === 0) return new Map();

  const products = await client.product.findMany({
    where: {
      ...(businessId ? { businessId } : {}),
      id: { in: productIds },
    },
    select: { id: true, sku: true, name: true, unit: true },
  });

  return new Map(products.map((p) => [p.id, p]));
}

/**
 * Membuat Draf Purchase Order baru (status DRAFT).
 *
 * Rujukan: Seksi 7.9 & 8.3 Dokumen Spesifikasi.
 */
export async function createPurchaseOrder(
  tx: Tx,
  businessId: string,
  actorId: string,
  input: PurchaseOrderCreateInput
) {
  const vendor = await tx.vendor.findFirst({
    where: { id: input.vendorId, businessId, deletedAt: null },
  });

  if (!vendor) {
    throw new DomainError('VENDOR_NOT_FOUND', 'Vendor tidak ditemukan', 404);
  }

  // Validasi produk
  const productIds = input.items.map((i) => i.productId);
  const products = await tx.product.findMany({
    where: { id: { in: productIds }, businessId, deletedAt: null },
  });

  if (products.length !== productIds.length) {
    throw new DomainError(
      'PRODUCT_NOT_FOUND',
      'Satu atau lebih produk tidak ditemukan pada unit usaha ini',
      404
    );
  }

  let subtotal = 0;
  const itemsData = input.items.map((item) => {
    const lineTotal = item.qty * item.unitCost;
    subtotal += lineTotal;
    return {
      productId: item.productId,
      qty: item.qty,
      unitCost: BigInt(item.unitCost),
      lineTotal: BigInt(lineTotal),
    };
  });

  const shippingCost = input.shippingCost ?? 0;
  const otherCost = input.otherCost ?? 0;
  const total = subtotal + shippingCost + otherCost;

  const orderDate = new Date(input.orderDate);
  const expectedDate = input.expectedDate ? new Date(input.expectedDate) : null;

  const po = await tx.purchaseOrder.create({
    data: {
      businessId,
      vendorId: vendor.id,
      status: PoStatus.DRAFT,
      orderDate,
      expectedDate,
      subtotal: BigInt(subtotal),
      shippingCost: BigInt(shippingCost),
      otherCost: BigInt(otherCost),
      total: BigInt(total),
      paidTotal: 0n,
      notes: input.notes,
      createdById: actorId,
      items: {
        create: itemsData,
      },
    },
    include: {
      vendor: {
        select: { id: true, code: true, name: true, picName: true, phone: true, address: true },
      },
      items: true,
    },
  });

  await tx.auditLog.create({
    data: {
      businessId,
      actorId,
      actorRole: Role.SUPERADMIN,
      action: 'PO_CREATE',
      entityType: 'PurchaseOrder',
      entityId: po.id,
      summary: `Draf PO dibuat untuk vendor ${vendor.name} senilai Rp ${total}`,
    },
  });

  const prodMap = await getProductMapForPo(tx, po.items, businessId);
  return { po, prodMap };
}

/**
 * Memperbarui Draf Purchase Order. Hanya berlaku pada status DRAFT.
 */
export async function updatePurchaseOrder(
  tx: Tx,
  businessId: string,
  poId: string,
  actorId: string,
  input: PurchaseOrderUpdateInput
) {
  const existing = await tx.purchaseOrder.findFirst({
    where: { id: poId, businessId, deletedAt: null },
    include: { items: true },
  });

  if (!existing) {
    throw new DomainError('PO_NOT_FOUND', 'Purchase Order tidak ditemukan', 404);
  }

  if (existing.status !== PoStatus.DRAFT) {
    throw new DomainError(
      'INVALID_STATE',
      'Hanya Purchase Order berstatus DRAFT yang dapat disunting',
      409
    );
  }

  const vendorId = input.vendorId ?? existing.vendorId;
  const vendor = await tx.vendor.findFirst({
    where: { id: vendorId, businessId, deletedAt: null },
  });

  if (!vendor) {
    throw new DomainError('VENDOR_NOT_FOUND', 'Vendor tidak ditemukan', 404);
  }

  const shippingCost = input.shippingCost !== undefined ? input.shippingCost : Number(existing.shippingCost);
  const otherCost = input.otherCost !== undefined ? input.otherCost : Number(existing.otherCost);

  let subtotal = Number(existing.subtotal);
  if (input.items) {
    // Validasi produk baru
    const productIds = input.items.map((i) => i.productId);
    const products = await tx.product.findMany({
      where: { id: { in: productIds }, businessId, deletedAt: null },
    });

    if (products.length !== productIds.length) {
      throw new DomainError(
        'PRODUCT_NOT_FOUND',
        'Satu atau lebih produk tidak ditemukan',
        404
      );
    }

    subtotal = 0;
    await tx.purchaseOrderItem.deleteMany({ where: { purchaseOrderId: poId } });

    const newItems = input.items.map((item) => {
      const lineTotal = item.qty * item.unitCost;
      subtotal += lineTotal;
      return {
        purchaseOrderId: poId,
        productId: item.productId,
        qty: item.qty,
        unitCost: BigInt(item.unitCost),
        lineTotal: BigInt(lineTotal),
      };
    });

    await tx.purchaseOrderItem.createMany({ data: newItems });
  }

  const total = subtotal + shippingCost + otherCost;

  await tx.purchaseOrder.updateMany({
    where: { id: poId, businessId },
    data: {
      vendorId: vendor.id,
      orderDate: input.orderDate ? new Date(input.orderDate) : existing.orderDate,
      expectedDate: input.expectedDate !== undefined
        ? (input.expectedDate ? new Date(input.expectedDate) : null)
        : existing.expectedDate,
      shippingCost: BigInt(shippingCost),
      otherCost: BigInt(otherCost),
      subtotal: BigInt(subtotal),
      total: BigInt(total),
      notes: input.notes !== undefined ? input.notes : existing.notes,
    },
  });

  const updated = await tx.purchaseOrder.findFirstOrThrow({
    where: { id: poId, businessId },
    include: {
      vendor: {
        select: { id: true, code: true, name: true, picName: true, phone: true, address: true },
      },
      items: true,
    },
  });

  await tx.auditLog.create({
    data: {
      businessId,
      actorId,
      actorRole: Role.SUPERADMIN,
      action: 'PO_UPDATE',
      entityType: 'PurchaseOrder',
      entityId: poId,
      summary: `Draf PO ${poId} diperbarui senilai Rp ${total}`,
    },
  });

  const prodMap = await getProductMapForPo(tx, updated.items, businessId);
  return { po: updated, prodMap };
}

/**
 * Mengubah status DRAFT menjadi ORDERED.
 * Mengalokasikan nomor PO resmi: KODEVENDOR/PO/DD/MM/YYYY/NNNN.
 */
export async function orderPurchaseOrder(
  tx: Tx,
  businessId: string,
  poId: string,
  actorId: string
) {
  const existing = await tx.purchaseOrder.findFirst({
    where: { id: poId, businessId, deletedAt: null },
    include: {
      vendor: true,
      items: true,
    },
  });

  if (!existing) {
    throw new DomainError('PO_NOT_FOUND', 'Purchase Order tidak ditemukan', 404);
  }

  if (existing.status !== PoStatus.DRAFT) {
    throw new DomainError(
      'INVALID_STATE',
      'Hanya PO berstatus DRAFT yang dapat dipesan (ORDERED)',
      409
    );
  }

  if (existing.items.length === 0) {
    throw new DomainError(
      'EMPTY_ITEMS',
      'PO harus memiliki minimal satu baris produk',
      422
    );
  }

  // Alokasi vendorSeq atomik dan generate poNo resmi
  const seq = await allocateVendorPoSeq(tx, businessId, existing.vendorId);
  const now = new Date();
  const poNo = purchaseOrderNumber(existing.vendor.code, now, seq);

  await tx.purchaseOrder.updateMany({
    where: { id: poId, businessId },
    data: {
      status: PoStatus.ORDERED,
      vendorSeq: seq,
      poNo,
    },
  });

  const updated = await tx.purchaseOrder.findFirstOrThrow({
    where: { id: poId, businessId },
    include: {
      vendor: {
        select: { id: true, code: true, name: true, picName: true, phone: true, address: true },
      },
      items: true,
    },
  });

  await tx.auditLog.create({
    data: {
      businessId,
      actorId,
      actorRole: Role.SUPERADMIN,
      action: 'PO_ORDERED',
      entityType: 'PurchaseOrder',
      entityId: poId,
      summary: `PO dialokasikan nomor ${poNo} (vendor sequence ${seq})`,
    },
  });

  const prodMap = await getProductMapForPo(tx, updated.items, businessId);
  return { po: updated, prodMap };
}

/**
 * Menerima barang pesanan pembelian (PO).
 * Menambah stockQty melalui StockMovement bertipe PO_RECEIPT.
 * Bila opsi updateHpp = true, memperbarui Product.costPrice dan mencatat PriceHistory.
 *
 * Rujukan: Seksi 7.9 & 8.3 Dokumen Spesifikasi.
 */
export async function receivePurchaseOrder(
  tx: Tx,
  businessId: string,
  poId: string,
  actorId: string,
  input: PurchaseOrderReceiveInput
) {
  const po = await tx.purchaseOrder.findFirst({
    where: { id: poId, businessId, deletedAt: null },
    include: {
      vendor: true,
      items: true,
    },
  });

  if (!po) {
    throw new DomainError('PO_NOT_FOUND', 'Purchase Order tidak ditemukan', 404);
  }

  if (po.status !== PoStatus.ORDERED && po.status !== PoStatus.PARTIAL_RECEIVED) {
    throw new DomainError(
      'INVALID_STATE',
      'Penerimaan barang hanya dapat dilakukan pada PO berstatus ORDERED atau PARTIAL_RECEIVED',
      409
    );
  }

  for (const rec of input.items) {
    const item = po.items.find((i) => i.id === rec.itemId);
    if (!item) {
      throw new DomainError('ITEM_NOT_FOUND', `Item PO ${rec.itemId} tidak ditemukan`, 404);
    }

    if (item.receivedQty + rec.qty > item.qty) {
      throw new DomainError(
        'RECEIVE_EXCEEDED',
        `Jumlah penerimaan (${item.receivedQty + rec.qty}) melebihi kuantitas pesanan (${item.qty})`,
        422
      );
    }

    // 1. Update receivedQty pada baris PO
    await tx.purchaseOrderItem.updateMany({
      where: { id: item.id, purchaseOrderId: po.id },
      data: {
        receivedQty: { increment: rec.qty },
      },
    });

    // 2. Tambah stok fisik via moveStock
    await moveStock(tx, {
      businessId,
      productId: item.productId,
      type: StockMoveType.PO_RECEIPT,
      qtyDelta: rec.qty,
      refType: 'PURCHASE_ORDER',
      refId: po.id,
      note: `Penerimaan PO ${po.poNo || po.id}`,
      actorId,
    });

    // 3. Opsi perbarui HPP (costPrice) bila diminta
    if (rec.updateHpp) {
      const prod = await tx.product.findFirstOrThrow({
        where: { id: item.productId, businessId },
      });

      const oldCost = prod.costPrice;
      const newCost = item.unitCost;

      await tx.product.updateMany({
        where: { id: item.productId, businessId },
        data: {
          costPrice: newCost,
          rev: { increment: 1 },
        },
      });

      await tx.priceHistory.create({
        data: {
          businessId,
          productId: item.productId,
          field: 'COST',
          oldValue: oldCost,
          newValue: newCost,
          reason: `Penerimaan PO ${po.poNo || po.id}`,
          changedById: actorId,
        },
      });

      await tx.auditLog.create({
        data: {
          businessId,
          actorId,
          actorRole: Role.SUPERADMIN,
          action: 'PRODUCT_COST_UPDATE',
          entityType: 'Product',
          entityId: item.productId,
          summary: `HPP produk diperbarui dari PO ${po.poNo || po.id}: Rp ${Number(oldCost)} -> Rp ${Number(newCost)}`,
        },
      });
    }
  }

  // Evaluasi status akhir PO: apakah semua item sudah diterima penuh?
  const reloadedItems = await tx.purchaseOrderItem.findMany({
    where: { purchaseOrderId: po.id },
  });

  const allComplete = reloadedItems.every((i) => i.receivedQty >= i.qty);
  const newStatus = allComplete ? PoStatus.RECEIVED : PoStatus.PARTIAL_RECEIVED;

  await tx.purchaseOrder.updateMany({
    where: { id: po.id, businessId },
    data: { status: newStatus },
  });

  const updated = await tx.purchaseOrder.findFirstOrThrow({
    where: { id: po.id, businessId },
    include: {
      vendor: {
        select: { id: true, code: true, name: true, picName: true, phone: true, address: true },
      },
      items: true,
    },
  });

  await tx.auditLog.create({
    data: {
      businessId,
      actorId,
      actorRole: Role.SUPERADMIN,
      action: 'PO_RECEIVE',
      entityType: 'PurchaseOrder',
      entityId: po.id,
      summary: `Penerimaan barang PO ${po.poNo || po.id}: status sekarang ${newStatus}`,
    },
  });

  const prodMap = await getProductMapForPo(tx, updated.items, businessId);
  return { po: updated, prodMap };
}

/**
 * Membatalkan PO (CANCELLED).
 * Aturan tegas (Seksi 8.3): PO yang sudah ada penerimaan barang tidak bisa dibatalkan, harus lewat koreksi stok.
 */
export async function cancelPurchaseOrder(
  tx: Tx,
  businessId: string,
  poId: string,
  actorId: string,
  reason: string
) {
  if (!reason || reason.trim().length < 5) {
    throw new DomainError(
      'REASON_REQUIRED',
      'Alasan pembatalan PO wajib diisi minimal 5 karakter',
      422
    );
  }

  const po = await tx.purchaseOrder.findFirst({
    where: { id: poId, businessId, deletedAt: null },
    include: { items: true },
  });

  if (!po) {
    throw new DomainError('PO_NOT_FOUND', 'Purchase Order tidak ditemukan', 404);
  }

  if (po.status === PoStatus.CANCELLED) {
    throw new DomainError('ALREADY_CANCELLED', 'Purchase Order telah dibatalkan sebelumnya', 409);
  }

  // Cek apakah ada barang yang sudah diterima
  const hasReceived = po.items.some((i) => i.receivedQty > 0);
  if (hasReceived) {
    throw new DomainError(
      'CANNOT_CANCEL',
      'PO yang sudah ada penerimaan barang tidak bisa dibatalkan, harus lewat koreksi stok',
      409
    );
  }

  await tx.purchaseOrder.updateMany({
    where: { id: poId, businessId },
    data: {
      status: PoStatus.CANCELLED,
      notes: po.notes ? `${po.notes}\n[Batal]: ${reason}` : `[Batal]: ${reason}`,
    },
  });

  const updated = await tx.purchaseOrder.findFirstOrThrow({
    where: { id: poId, businessId },
    include: {
      vendor: {
        select: { id: true, code: true, name: true, picName: true, phone: true, address: true },
      },
      items: true,
    },
  });

  await tx.auditLog.create({
    data: {
      businessId,
      actorId,
      actorRole: Role.SUPERADMIN,
      action: 'PO_CANCEL',
      entityType: 'PurchaseOrder',
      entityId: poId,
      summary: `PO ${po.poNo || po.id} dibatalkan`,
      reason,
    },
  });

  const prodMap = await getProductMapForPo(tx, updated.items, businessId);
  return { po: updated, prodMap };
}
