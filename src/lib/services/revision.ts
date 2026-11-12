import {
  OrderRevisionStatus,
  OrderStatus,
  Role,
} from '@prisma/client';
import { Ctx, requireBusiness } from '@/lib/auth/context';
import { DomainError, formatRupiah } from '@/lib/domain/money';
import { OrderRevisionCreateInput } from '@/lib/validation/order';
import { escapeHtml } from '@/lib/telegram/format';
import { assertRev, assertStatus, lockOrder } from './orderGuard';
import { buildOrderSnapshot, TxClient } from './order';
import { lockProducts } from './stock';
import { evaluateOrderCommission } from './commission';
import { getShippedQtySummary } from './shipmentSummary';

export interface OrderRevisionItemDto {
  id: string;
  productId: string;
  productName: string;
  sku: string;
  unit: string;
  oldQty: number;
  newQty: number;
  listPrice: number;
  unitPrice: number;
  discountType: string;
  discountValue: number;
  discountSource: string;
  lineSubtotal: number;
  lineDiscount: number;
  lineNet: number;
  floorPrice: number;
  belowMin: boolean;
  sortOrder: number;
  costPrice?: number;
}

export interface OrderRevisionDto {
  id: string;
  businessId: string;
  orderId: string;
  revisionNo: number;
  status: OrderRevisionStatus;
  reason: string;
  belowMinReason: string | null;
  overrideNote: string | null;
  rejectReason: string | null;
  deliveryAddress: string | null;
  shippingCharge: number;
  ppnEnabled: boolean;
  ppnRateBps: number;
  oldSubtotal: number;
  oldDiscountTotal: number;
  oldPpnAmount: number;
  oldGrandTotal: number;
  newSubtotal: number;
  newDiscountTotal: number;
  newPpnAmount: number;
  newGrandTotal: number;
  deltaGrandTotal: number;
  hasBelowMin: boolean;
  requestedById: string;
  requestedAt: string;
  reviewedById: string | null;
  reviewedAt: string | null;
  createdAt: string;
  items: OrderRevisionItemDto[];
}

export function formatOrderRevisionDto(
  revRow: {
    id: string;
    businessId: string;
    orderId: string;
    revisionNo: number;
    status: OrderRevisionStatus;
    reason: string;
    belowMinReason: string | null;
    overrideNote: string | null;
    rejectReason: string | null;
    deliveryAddress: string | null;
    shippingCharge: bigint;
    ppnEnabled: boolean;
    ppnRateBps: number;
    oldSubtotal: bigint;
    oldDiscountTotal: bigint;
    oldPpnAmount: bigint;
    oldGrandTotal: bigint;
    newSubtotal: bigint;
    newDiscountTotal: bigint;
    newPpnAmount: bigint;
    newGrandTotal: bigint;
    hasBelowMin: boolean;
    requestedById: string;
    requestedAt: Date;
    reviewedById: string | null;
    reviewedAt: Date | null;
    createdAt: Date;
    items?: Array<{
      id: string;
      productId: string;
      productName: string;
      sku: string;
      unit: string;
      oldQty: number;
      newQty: number;
      listPrice: bigint;
      unitPrice: bigint;
      discountType: string;
      discountValue: bigint;
      discountSource: string;
      lineSubtotal: bigint;
      lineDiscount: bigint;
      lineNet: bigint;
      costPrice: bigint;
      floorPrice: bigint;
      belowMin: boolean;
      sortOrder: number;
    }>;
  },
  role: Role
): OrderRevisionDto {
  const isSuperAdmin = role === Role.SUPERADMIN;

  const items: OrderRevisionItemDto[] = (revRow.items ?? []).map((it) => ({
    id: it.id,
    productId: it.productId,
    productName: it.productName,
    sku: it.sku,
    unit: it.unit,
    oldQty: it.oldQty,
    newQty: it.newQty,
    listPrice: Number(it.listPrice),
    unitPrice: Number(it.unitPrice),
    discountType: it.discountType,
    discountValue: Number(it.discountValue),
    discountSource: it.discountSource,
    lineSubtotal: Number(it.lineSubtotal),
    lineDiscount: Number(it.lineDiscount),
    lineNet: Number(it.lineNet),
    floorPrice: Number(it.floorPrice),
    belowMin: it.belowMin,
    sortOrder: it.sortOrder,
    ...(isSuperAdmin ? { costPrice: Number(it.costPrice) } : {}),
  }));

  const oldGrandTotal = Number(revRow.oldGrandTotal);
  const newGrandTotal = Number(revRow.newGrandTotal);

  return {
    id: revRow.id,
    businessId: revRow.businessId,
    orderId: revRow.orderId,
    revisionNo: revRow.revisionNo,
    status: revRow.status,
    reason: revRow.reason,
    belowMinReason: revRow.belowMinReason,
    overrideNote: isSuperAdmin ? revRow.overrideNote : null,
    rejectReason: revRow.rejectReason,
    deliveryAddress: revRow.deliveryAddress,
    shippingCharge: Number(revRow.shippingCharge),
    ppnEnabled: revRow.ppnEnabled,
    ppnRateBps: revRow.ppnRateBps,
    oldSubtotal: Number(revRow.oldSubtotal),
    oldDiscountTotal: Number(revRow.oldDiscountTotal),
    oldPpnAmount: Number(revRow.oldPpnAmount),
    oldGrandTotal,
    newSubtotal: Number(revRow.newSubtotal),
    newDiscountTotal: Number(revRow.newDiscountTotal),
    newPpnAmount: Number(revRow.newPpnAmount),
    newGrandTotal,
    deltaGrandTotal: newGrandTotal - oldGrandTotal,
    hasBelowMin: revRow.hasBelowMin,
    requestedById: revRow.requestedById,
    requestedAt: revRow.requestedAt.toISOString(),
    reviewedById: revRow.reviewedById,
    reviewedAt: revRow.reviewedAt ? revRow.reviewedAt.toISOString() : null,
    createdAt: revRow.createdAt.toISOString(),
    items,
  };
}

/**
 * Mengembalikan total qty per produk yang sudah dikirim (SHIPPED/DELIVERED) pada pesanan ini.
 */
async function getShippedQtyByProduct(
  tx: TxClient,
  businessId: string,
  orderId: string,
  orderItems: Array<{ id: string; productId: string; qty: number }>
): Promise<Map<string, number>> {
  const summary = await getShippedQtySummary(tx, businessId, orderId, orderItems);
  return summary.byProductId;
}

/**
 * Mengajukan revisi item/qty/harga/ongkir pada pesanan berstatus IN_PROCESS (Fase 3).
 */
export async function submitOrderRevision(
  tx: TxClient,
  ctx: Ctx,
  orderId: string,
  input: OrderRevisionCreateInput
): Promise<OrderRevisionDto> {
  const businessId = requireBusiness(ctx);

  await lockOrder(tx, orderId, businessId);

  const order = await tx.order.findFirst({
    where: { id: orderId, businessId, deletedAt: null },
    include: { items: { orderBy: { sortOrder: 'asc' } } },
  });

  if (!order) {
    throw new DomainError('ORDER_NOT_FOUND', 'Pesanan tidak ditemukan', 404);
  }

  if (ctx.role === Role.SALES && order.salesId !== ctx.user.id) {
    throw new DomainError(
      'FORBIDDEN',
      'Anda hanya dapat mengajukan revisi untuk pesanan Anda sendiri',
      403
    );
  }

  assertStatus(order.status, [OrderStatus.IN_PROCESS], 'Ajukan revisi pesanan');
  assertRev(order.rev, input.rev);

  const existingPending = await tx.orderRevision.findFirst({
    where: {
      orderId: order.id,
      businessId,
      status: OrderRevisionStatus.PENDING_APPROVAL,
    },
  });

  if (existingPending) {
    throw new DomainError(
      'REVISION_PENDING',
      'Masih ada pengajuan revisi pesanan yang menunggu persetujuan manajemen',
      409
    );
  }

  // Hitung snapshot baru menggunakan engine kalkulasi tunggal
  const snapshot = await buildOrderSnapshot(tx, ctx, {
    customerId: order.customerId,
    items: input.items,
    shippingCharge: input.shippingCharge,
    dpBps: order.dpBps,
    deliveryAddress: input.deliveryAddress ?? order.deliveryAddress ?? undefined,
    belowMinReason: input.belowMinReason,
  });

  if (snapshot.hasBelowMin && (!input.belowMinReason || input.belowMinReason.trim().length < 5)) {
    throw new DomainError(
      'BELOW_MIN_REASON_REQUIRED',
      'Alasan harga di bawah minimal wajib diisi minimal 5 karakter',
      422
    );
  }

  const newGrandTotalBigInt = BigInt(snapshot.totals.grandTotal);
  if (newGrandTotalBigInt < order.paidTotal) {
    throw new DomainError(
      'TOTAL_BELOW_PAID',
      `Total pesanan baru (${formatRupiah(snapshot.totals.grandTotal)}) tidak boleh lebih kecil dari pembayaran yang sudah terverifikasi (${formatRupiah(Number(order.paidTotal))})`,
      422
    );
  }

  // Validasi qty baru tidak lebih kecil dari barang yang sudah dikirim
  const shippedByProduct = await getShippedQtyByProduct(
    tx,
    businessId,
    order.id,
    order.items
  );
  const newQtyByProduct = new Map<string, number>();
  for (const line of snapshot.lines) {
    newQtyByProduct.set(line.productId, line.qty);
  }
  for (const [productId, shippedQty] of shippedByProduct.entries()) {
    const targetQty = newQtyByProduct.get(productId) ?? 0;
    if (targetQty < shippedQty) {
      throw new DomainError(
        'ITEM_ALREADY_SHIPPED',
        `Kuantitas produk tidak dapat diturunkan di bawah jumlah yang sudah dikirim (${shippedQty})`,
        409
      );
    }
  }

  // Pra-validasi ketersediaan stok untuk delta kenaikan qty
  const oldQtyByProduct = new Map<string, number>();
  for (const oldItem of order.items) {
    oldQtyByProduct.set(oldItem.productId, oldItem.qty);
  }

  const positiveDeltas: Array<{ productId: string; delta: number; name: string }> = [];
  if (order.stockReserved) {
    for (const line of snapshot.lines) {
      const oldQty = oldQtyByProduct.get(line.productId) ?? 0;
      const delta = line.qty - oldQty;
      if (delta > 0) {
        positiveDeltas.push({ productId: line.productId, delta, name: line.productName });
      }
    }
  }

  if (positiveDeltas.length > 0) {
    const business = await tx.business.findFirstOrThrow({
      where: { id: businessId },
      select: { allowNegativeStock: true },
    });

    if (!business.allowNegativeStock) {
      const deltaIds = positiveDeltas.map((d) => d.productId);
      const products = await tx.product.findMany({
        where: { id: { in: deltaIds }, businessId },
        select: { id: true, name: true, stockQty: true, reservedQty: true },
      });

      const short = positiveDeltas
        .map((d) => {
          const p = products.find((x) => x.id === d.productId);
          const available = p ? p.stockQty - p.reservedQty : 0;
          return {
            id: d.productId,
            name: d.name,
            need: d.delta,
            available,
          };
        })
        .filter((x) => x.available < x.need);

      if (short.length > 0) {
        throw new DomainError(
          'INSUFFICIENT_STOCK',
          'Stok tersedia tidak cukup untuk penambahan kuantitas pada revisi ini',
          409,
          short
        );
      }
    }
  }

  const prevCount = await tx.orderRevision.count({
    where: { businessId, orderId: order.id },
  });
  const revisionNo = prevCount + 1;

  const created = await tx.orderRevision.create({
    data: {
      businessId,
      orderId: order.id,
      revisionNo,
      status: OrderRevisionStatus.PENDING_APPROVAL,
      reason: input.reason.trim(),
      belowMinReason: snapshot.hasBelowMin ? input.belowMinReason!.trim() : null,
      deliveryAddress:
        input.deliveryAddress !== undefined
          ? input.deliveryAddress.trim() || null
          : order.deliveryAddress,
      shippingCharge: BigInt(snapshot.totals.shippingCharge),
      ppnEnabled: order.ppnEnabled,
      ppnRateBps: order.ppnRateBps,
      oldSubtotal: order.subtotal,
      oldDiscountTotal: order.discountTotal,
      oldPpnAmount: order.ppnAmount,
      oldGrandTotal: order.grandTotal,
      newSubtotal: BigInt(snapshot.totals.subtotal),
      newDiscountTotal: BigInt(snapshot.totals.discountTotal),
      newPpnAmount: BigInt(snapshot.totals.ppnAmount),
      newGrandTotal: newGrandTotalBigInt,
      hasBelowMin: snapshot.hasBelowMin,
      requestedById: ctx.user.id,
      items: {
        create: snapshot.lines.map((line) => ({
          productId: line.productId,
          productName: line.productName,
          sku: line.sku,
          unit: line.unit,
          oldQty: oldQtyByProduct.get(line.productId) ?? 0,
          newQty: line.qty,
          listPrice: BigInt(line.listPrice),
          unitPrice: BigInt(line.unitPrice),
          discountType: line.discountType,
          discountValue: BigInt(line.discountValue),
          discountSource: line.discountSource,
          lineSubtotal: BigInt(line.lineSubtotal),
          lineDiscount: BigInt(line.lineDiscount),
          lineNet: BigInt(line.lineNet),
          costPrice: BigInt(line.costPrice),
          floorPrice: BigInt(line.floorPrice),
          belowMin: line.belowMin,
          sortOrder: line.sortOrder,
        })),
      },
    },
    include: { items: { orderBy: { sortOrder: 'asc' } } },
  });

  await tx.order.updateMany({
    where: { id: order.id, businessId },
    data: { rev: { increment: 1 } },
  });

  await tx.auditLog.create({
    data: {
      businessId,
      actorId: ctx.user.id,
      actorRole: ctx.role,
      action: 'ORDER_REVISION_SUBMIT',
      entityType: 'OrderRevision',
      entityId: created.id,
      summary: `Pengajuan revisi #${revisionNo} untuk pesanan ${order.orderNo || order.id} (${formatRupiah(Number(order.grandTotal))} -> ${formatRupiah(snapshot.totals.grandTotal)})`,
      reason: input.reason.trim(),
    },
  });

  const superAdmins = await tx.user.findMany({
    where: { role: Role.SUPERADMIN, isActive: true },
    select: { id: true },
  });

  for (const sa of superAdmins) {
    await tx.notification.create({
      data: {
        userId: sa.id,
        businessId,
        type: 'APPROVAL_REQUEST',
        title: 'Pengajuan Revisi Pesanan Menunggu Persetujuan',
        body: `Sales <b>${escapeHtml(ctx.user.name)}</b> mengajukan revisi #${revisionNo} pesanan <b>${escapeHtml(order.orderNo || order.id)}</b>.`,
        linkPath: `/orders/${order.id}`,
        dedupeKey: `ord_rev_req_${created.id}_${sa.id}`,
      },
    });
  }

  return formatOrderRevisionDto(created, ctx.role);
}

/**
 * Menyetujui pengajuan revisi pesanan (SUPERADMIN ONLY), menyesuaikan reservasi stok delta,
 * mengganti baris item & total pesanan, tanpa menghapus DP yang telah dibayarkan.
 */
export async function approveOrderRevision(
  tx: TxClient,
  ctx: Ctx,
  revisionId: string,
  overrideNote?: string
): Promise<OrderRevisionDto> {
  if (ctx.role !== Role.SUPERADMIN) {
    throw new DomainError(
      'FORBIDDEN',
      'Hanya Super Admin yang dapat menyetujui revisi pesanan',
      403
    );
  }

  const businessId = requireBusiness(ctx);

  const initialRevision = await tx.orderRevision.findFirst({
    where: { id: revisionId, businessId },
    select: { id: true, orderId: true },
  });

  if (!initialRevision) {
    throw new DomainError('REVISION_NOT_FOUND', 'Pengajuan revisi tidak ditemukan', 404);
  }

  await lockOrder(tx, initialRevision.orderId, businessId);

  const revision = await tx.orderRevision.findFirst({
    where: { id: revisionId, businessId },
    include: { items: { orderBy: { sortOrder: 'asc' } } },
  });

  if (!revision) {
    throw new DomainError('REVISION_NOT_FOUND', 'Pengajuan revisi tidak ditemukan', 404);
  }

  if (revision.status !== OrderRevisionStatus.PENDING_APPROVAL) {
    throw new DomainError(
      'REVISION_ALREADY_PROCESSED',
      'Pengajuan revisi ini sudah diproses sebelumnya',
      409
    );
  }

  const order = await tx.order.findFirst({
    where: { id: revision.orderId, businessId, deletedAt: null },
    include: { items: true },
  });

  if (!order) {
    throw new DomainError('ORDER_NOT_FOUND', 'Pesanan tidak ditemukan', 404);
  }

  assertStatus(order.status, [OrderStatus.IN_PROCESS], 'Setujui revisi pesanan');

  if (revision.newGrandTotal < order.paidTotal) {
    throw new DomainError(
      'TOTAL_BELOW_PAID',
      `Total pesanan baru (${formatRupiah(Number(revision.newGrandTotal))}) lebih kecil dari pembayaran terverifikasi (${formatRupiah(Number(order.paidTotal))})`,
      422
    );
  }

  // Hitung delta stok di union produk lama & produk baru
  const oldQtyMap = new Map<string, number>();
  for (const it of order.items) {
    oldQtyMap.set(it.productId, it.qty);
  }

  const newQtyMap = new Map<string, { qty: number; name: string }>();
  for (const it of revision.items) {
    newQtyMap.set(it.productId, { qty: it.newQty, name: it.productName });
  }

  // Cek ulang qty sudah dikirim
  const shippedMap = await getShippedQtyByProduct(
    tx,
    businessId,
    order.id,
    order.items
  );
  for (const [productId, shippedQty] of shippedMap.entries()) {
    const nextQty = newQtyMap.get(productId)?.qty ?? 0;
    if (nextQty < shippedQty) {
      throw new DomainError(
        'ITEM_ALREADY_SHIPPED',
        `Kuantitas produk tidak dapat diturunkan di bawah jumlah yang sudah dikirim (${shippedQty})`,
        409
      );
    }
  }

  const allProductIds = [...new Set([...oldQtyMap.keys(), ...newQtyMap.keys()])];
  const deltas = allProductIds
    .map((productId) => ({
      productId,
      delta: (newQtyMap.get(productId)?.qty ?? 0) - (oldQtyMap.get(productId) ?? 0),
      name: newQtyMap.get(productId)?.name ?? productId,
    }))
    .filter((d) => d.delta !== 0);

  if (order.stockReserved && deltas.length > 0) {
    const business = await tx.business.findFirstOrThrow({
      where: { id: businessId },
      select: { allowNegativeStock: true },
    });

    await lockProducts(
      tx,
      deltas.map((d) => d.productId)
    );

    const positiveIds = deltas.filter((d) => d.delta > 0).map((d) => d.productId);
    if (positiveIds.length > 0 && !business.allowNegativeStock) {
      const products = await tx.product.findMany({
        where: { id: { in: positiveIds }, businessId },
        select: { id: true, name: true, stockQty: true, reservedQty: true },
      });

      const short = deltas
        .filter((d) => d.delta > 0)
        .map((d) => {
          const p = products.find((x) => x.id === d.productId);
          if (!p) {
            throw new DomainError('PRODUCT_NOT_FOUND', 'Produk tidak ditemukan', 404);
          }
          return {
            id: p.id,
            name: p.name,
            need: d.delta,
            available: p.stockQty - p.reservedQty,
          };
        })
        .filter((x) => x.available < x.need);

      if (short.length > 0) {
        throw new DomainError(
          'INSUFFICIENT_STOCK',
          'Stok tersedia tidak cukup untuk menyetujui penambahan kuantitas revisi',
          409,
          short
        );
      }
    }

    for (const d of deltas) {
      await tx.product.updateMany({
        where: { id: d.productId, businessId },
        data: { reservedQty: { increment: d.delta } },
      });
    }
  }

  // Kunci update status revisi secara atomik
  const now = new Date();
  const cleanOverride = overrideNote?.trim() || null;
  const revUpdate = await tx.orderRevision.updateMany({
    where: {
      id: revision.id,
      businessId,
      status: OrderRevisionStatus.PENDING_APPROVAL,
    },
    data: {
      status: OrderRevisionStatus.APPROVED,
      reviewedById: ctx.user.id,
      reviewedAt: now,
      overrideNote: cleanOverride,
    },
  });

  if (revUpdate.count !== 1) {
    throw new DomainError(
      'REVISION_ALREADY_PROCESSED',
      'Pengajuan revisi sudah diproses secara paralel',
      409
    );
  }

  // Sinkronkan item order in-place agar FK ShipmentItem/CreditNoteItem pada item lama tetap utuh
  const existingByProductId = new Map<string, (typeof order.items)[number]>();
  for (const oldIt of order.items) {
    if (!existingByProductId.has(oldIt.productId)) {
      existingByProductId.set(oldIt.productId, oldIt);
    }
  }

  const nextProductIds = new Set(revision.items.map((it) => it.productId));
  const idsToRemove = order.items
    .filter((oldIt) => !nextProductIds.has(oldIt.productId))
    .map((oldIt) => oldIt.id);

  if (idsToRemove.length > 0 && typeof tx.orderItem.deleteMany === 'function') {
    await tx.orderItem.deleteMany({
      where: { id: { in: idsToRemove }, orderId: order.id, businessId },
    });
  }

  const itemsToCreate: Array<{
    businessId: string;
    orderId: string;
    productId: string;
    productName: string;
    sku: string;
    unit: string;
    qty: number;
    listPrice: bigint;
    unitPrice: bigint;
    discountType: typeof revision.items[number]['discountType'];
    discountValue: bigint;
    discountSource: typeof revision.items[number]['discountSource'];
    lineSubtotal: bigint;
    lineDiscount: bigint;
    lineNet: bigint;
    costPrice: bigint;
    floorPrice: bigint;
    belowMin: boolean;
    sortOrder: number;
  }> = [];

  for (const it of revision.items) {
    const payload = {
      productName: it.productName,
      sku: it.sku,
      unit: it.unit,
      qty: it.newQty,
      listPrice: it.listPrice,
      unitPrice: it.unitPrice,
      discountType: it.discountType,
      discountValue: it.discountValue,
      discountSource: it.discountSource,
      lineSubtotal: it.lineSubtotal,
      lineDiscount: it.lineDiscount,
      lineNet: it.lineNet,
      costPrice: it.costPrice,
      floorPrice: it.floorPrice,
      belowMin: it.belowMin,
      sortOrder: it.sortOrder,
    };

    const existingItem = existingByProductId.get(it.productId);
    if (existingItem && typeof tx.orderItem.updateMany === 'function') {
      await tx.orderItem.updateMany({
        where: { id: existingItem.id, orderId: order.id, businessId },
        data: payload,
      });
    } else {
      itemsToCreate.push({
        businessId,
        orderId: order.id,
        productId: it.productId,
        ...payload,
      });
    }
  }

  if (itemsToCreate.length > 0) {
    await tx.orderItem.createMany({
      data: itemsToCreate,
    });
  }

  await tx.order.updateMany({
    where: { id: order.id, businessId },
    data: {
      subtotal: revision.newSubtotal,
      discountTotal: revision.newDiscountTotal,
      shippingCharge: revision.shippingCharge,
      ppnAmount: revision.newPpnAmount,
      grandTotal: revision.newGrandTotal,
      hasBelowMin: revision.hasBelowMin,
      belowMinReason: revision.belowMinReason,
      overrideNote: cleanOverride ?? order.overrideNote,
      deliveryAddress: revision.deliveryAddress,
      version: { increment: 1 },
      rev: { increment: 1 },
    },
  });

  await evaluateOrderCommission(tx, order.id, businessId);

  await tx.auditLog.create({
    data: {
      businessId,
      actorId: ctx.user.id,
      actorRole: ctx.role,
      action: 'ORDER_REVISION_APPROVE',
      entityType: 'OrderRevision',
      entityId: revision.id,
      summary: `Revisi #${revision.revisionNo} pesanan ${order.orderNo || order.id} disetujui (${formatRupiah(Number(revision.oldGrandTotal))} -> ${formatRupiah(Number(revision.newGrandTotal))})`,
      reason: cleanOverride ?? revision.reason,
    },
  });

  await tx.notification.create({
    data: {
      userId: order.salesId,
      businessId,
      type: 'ORDER_REVISION_APPROVED',
      title: 'Revisi Pesanan Disetujui',
      body: `Revisi #${revision.revisionNo} untuk pesanan ${order.orderNo || order.id} telah disetujui.`,
      linkPath: `/orders/${order.id}`,
      dedupeKey: `ord_rev_app_${revision.id}_${order.salesId}`,
    },
  });

  const refreshed = await tx.orderRevision.findFirstOrThrow({
    where: { id: revision.id, businessId },
    include: { items: { orderBy: { sortOrder: 'asc' } } },
  });

  return formatOrderRevisionDto(refreshed, ctx.role);
}

/**
 * Menolak pengajuan revisi pesanan (SUPERADMIN ONLY) tanpa mengubah stok atau total order.
 */
export async function rejectOrderRevision(
  tx: TxClient,
  ctx: Ctx,
  revisionId: string,
  reason: string
): Promise<OrderRevisionDto> {
  if (ctx.role !== Role.SUPERADMIN) {
    throw new DomainError(
      'FORBIDDEN',
      'Hanya Super Admin yang dapat menolak revisi pesanan',
      403
    );
  }

  const businessId = requireBusiness(ctx);
  const cleanReason = reason.trim();
  if (cleanReason.length < 5) {
    throw new DomainError(
      'VALIDATION_ERROR',
      'Alasan penolakan revisi wajib diisi minimal 5 karakter',
      422
    );
  }

  const initialRevision = await tx.orderRevision.findFirst({
    where: { id: revisionId, businessId },
    select: { id: true, orderId: true },
  });

  if (!initialRevision) {
    throw new DomainError('REVISION_NOT_FOUND', 'Pengajuan revisi tidak ditemukan', 404);
  }

  await lockOrder(tx, initialRevision.orderId, businessId);

  const now = new Date();
  const revUpdate = await tx.orderRevision.updateMany({
    where: {
      id: revisionId,
      businessId,
      status: OrderRevisionStatus.PENDING_APPROVAL,
    },
    data: {
      status: OrderRevisionStatus.REJECTED,
      rejectReason: cleanReason,
      reviewedById: ctx.user.id,
      reviewedAt: now,
    },
  });

  if (revUpdate.count !== 1) {
    throw new DomainError(
      'REVISION_ALREADY_PROCESSED',
      'Pengajuan revisi ini sudah diproses sebelumnya',
      409
    );
  }

  const order = await tx.order.findFirst({
    where: { id: initialRevision.orderId, businessId },
    select: { id: true, orderNo: true, salesId: true },
  });

  const refreshed = await tx.orderRevision.findFirstOrThrow({
    where: { id: revisionId, businessId },
    include: { items: { orderBy: { sortOrder: 'asc' } } },
  });

  await tx.auditLog.create({
    data: {
      businessId,
      actorId: ctx.user.id,
      actorRole: ctx.role,
      action: 'ORDER_REVISION_REJECT',
      entityType: 'OrderRevision',
      entityId: refreshed.id,
      summary: `Revisi #${refreshed.revisionNo} pesanan ${order?.orderNo || refreshed.orderId} ditolak`,
      reason: cleanReason,
    },
  });

  if (order) {
    await tx.notification.create({
      data: {
        userId: order.salesId,
        businessId,
        type: 'ORDER_REVISION_REJECTED',
        title: 'Revisi Pesanan Ditolak',
        body: `Revisi #${refreshed.revisionNo} pesanan ${order.orderNo || order.id} ditolak: ${cleanReason}`,
        linkPath: `/orders/${order.id}`,
        dedupeKey: `ord_rev_rej_${refreshed.id}_${order.salesId}`,
      },
    });
  }

  return formatOrderRevisionDto(refreshed, ctx.role);
}
