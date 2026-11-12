import {
  ShipMethod,
  ShipStatus,
  Role,
  OrderStatus,
} from '@prisma/client';
import { DomainError } from '../domain/money';
import { suratJalanNumber } from '../domain/numbering';
import { lockOrder } from './orderGuard';
import { shipOrderStock } from './stock';
import { maybeComplete } from './payment';
import {
  fetchOrderShipments,
  getShippedQtySummary,
  type ShipmentWithOptionalItems,
  type ShippedQtySummary,
} from './shipmentSummary';
import { prisma } from '@/lib/db';
import type { Ctx } from '../auth/context';
import type {
  ShipmentDeliverInput,
  ShipmentShipInput,
  ShipmentUpsertInput,
} from '../validation/shipment';

export type { ShipmentWithOptionalItems, ShippedQtySummary };
export { fetchOrderShipments, getShippedQtySummary };

export type TxClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

export interface ShipmentItemDto {
  id: string;
  orderItemId: string;
  productId?: string;
  productName?: string;
  sku?: string;
  unit?: string;
  qty: number;
}

export interface ShipmentDto {
  id: string;
  orderId: string;
  kloterNo: number;
  deliveryNo: string | null;
  method: ShipMethod;
  transporterId: string | null;
  trackingNo: string | null;
  driverName: string | null;
  vehiclePlate: string | null;
  receiverName: string | null;
  status: ShipStatus;
  actualCost?: number;
  shippedAt: string | null;
  deliveredAt: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  items?: ShipmentItemDto[];
}

export interface OrderShipmentItemProgress {
  orderItemId: string;
  productId: string;
  productName: string;
  sku: string;
  unit: string;
  orderedQty: number;
  shippedQty: number;
  remainingQty: number;
}

/**
 * Format DTO pengiriman aman sesuai role.
 * Garansi Mutlak: actualCost (biaya ongkir rahasia yang dibayar usaha)
 * TIDAK PERNAH dikirimkan ke role SALES!
 */
export function formatShipmentDto(
  shipment: ShipmentWithOptionalItems,
  role: Role
): ShipmentDto {
  const isSuperAdmin = role === Role.SUPERADMIN;

  const base: ShipmentDto = {
    id: shipment.id,
    orderId: shipment.orderId,
    kloterNo: (shipment as { kloterNo?: number }).kloterNo ?? 1,
    deliveryNo: shipment.deliveryNo,
    method: shipment.method,
    transporterId: shipment.transporterId,
    trackingNo: shipment.trackingNo,
    driverName: shipment.driverName,
    vehiclePlate: shipment.vehiclePlate,
    receiverName: shipment.receiverName,
    status: shipment.status,
    shippedAt: shipment.shippedAt ? shipment.shippedAt.toISOString() : null,
    deliveredAt: shipment.deliveredAt ? shipment.deliveredAt.toISOString() : null,
    notes: shipment.notes,
    createdAt: shipment.createdAt.toISOString(),
    updatedAt: shipment.updatedAt.toISOString(),
  };

  if (Array.isArray(shipment.items)) {
    base.items = shipment.items.map((it) => ({
      id: it.id,
      orderItemId: it.orderItemId,
      ...(it.orderItem
        ? {
            productId: it.orderItem.productId,
            productName: it.orderItem.productName,
            sku: it.orderItem.sku,
            unit: it.orderItem.unit,
          }
        : {}),
      qty: it.qty,
    }));
  }

  if (isSuperAdmin) {
    base.actualCost = Number(shipment.actualCost);
  }

  return base;
}

/**
 * Mengambil seluruh daftar kloter pengiriman dan progress qty per item pesanan.
 */
export async function listOrderShipments(
  tx: TxClient,
  ctx: Ctx,
  orderId: string
): Promise<{
  primary: ShipmentDto | null;
  shipments: ShipmentDto[];
  itemProgress: OrderShipmentItemProgress[];
}> {
  const businessId = ctx.businessId ?? ctx.user.businessId;
  if (!businessId) {
    throw new DomainError('BUSINESS_REQUIRED', 'Unit usaha aktif diperlukan', 400);
  }

  const order = await tx.order.findFirst({
    where: { id: orderId, businessId, deletedAt: null },
    include: {
      items: {
        orderBy: { sortOrder: 'asc' },
      },
    },
  });

  if (!order) {
    throw new DomainError('ORDER_NOT_FOUND', 'Pesanan tidak ditemukan', 404);
  }

  if (ctx.user.role === Role.SALES && order.salesId !== ctx.user.id) {
    throw new DomainError('FORBIDDEN', 'Anda tidak memiliki hak akses atas pesanan ini', 403);
  }

  const summary = await getShippedQtySummary(tx, businessId, order.id, order.items);
  const dtos = summary.shipments.map((s) => formatShipmentDto(s, ctx.user.role));

  // Primary: draf PREPARING aktif jika ada, jika tidak ada ambil kloter terakhir
  const preparing = dtos.find((s) => s.status === ShipStatus.PREPARING);
  const primary = preparing ?? (dtos.length > 0 ? dtos[dtos.length - 1] : null);

  const itemProgress: OrderShipmentItemProgress[] = order.items.map((it) => {
    const shippedQty = summary.byOrderItemId.get(it.id) ?? 0;
    return {
      orderItemId: it.id,
      productId: it.productId,
      productName: it.productName,
      sku: it.sku,
      unit: it.unit,
      orderedQty: it.qty,
      shippedQty,
      remainingQty: Math.max(0, it.qty - shippedQty),
    };
  });

  return {
    primary,
    shipments: dtos,
    itemProgress,
  };
}

/**
 * Mengambil informasi pengiriman utama untuk pesanan tertentu (kompatibel GET /shipment).
 */
export async function getShipment(
  tx: TxClient,
  ctx: Ctx,
  orderId: string
): Promise<ShipmentDto | null> {
  const res = await listOrderShipments(tx, ctx, orderId);
  return res.primary;
}

export type ShipmentUpsertData = Omit<ShipmentUpsertInput, 'method'> & {
  method?: ShipMethod;
};

/**
 * Membuat atau memperbarui draf pengiriman (PREPARING) (Seksi 8.3 & 10 + Fase 4).
 */
export async function upsertShipment(
  tx: TxClient,
  ctx: Ctx,
  orderId: string,
  input: ShipmentUpsertData
): Promise<ShipmentDto> {
  const businessId = ctx.businessId ?? ctx.user.businessId;
  if (!businessId) {
    throw new DomainError('BUSINESS_REQUIRED', 'Unit usaha aktif diperlukan', 400);
  }

  if (ctx.user.role === Role.SALES && input.actualCost !== undefined) {
    throw new DomainError(
      'UNPROCESSABLE_ENTITY',
      'Sales tidak diizinkan mengatur biaya ongkir aktual usaha',
      422
    );
  }

  const order = await tx.order.findFirst({
    where: { id: orderId, businessId, deletedAt: null },
  });

  if (!order) {
    throw new DomainError('ORDER_NOT_FOUND', 'Pesanan tidak ditemukan', 404);
  }

  if (ctx.user.role === Role.SALES && order.salesId !== ctx.user.id) {
    throw new DomainError('FORBIDDEN', 'Anda tidak memiliki hak akses atas pesanan ini', 403);
  }

  const allowedOrderStatuses: OrderStatus[] = [
    OrderStatus.IN_PROCESS,
    OrderStatus.FINAL_PENDING_APPROVAL,
    OrderStatus.AWAITING_FINAL_PAYMENT,
  ];

  if (!allowedOrderStatuses.includes(order.status)) {
    throw new DomainError(
      'INVALID_STATE',
      `Data pengiriman hanya dapat dibuat saat pesanan berstatus IN_PROCESS, FINAL_PENDING_APPROVAL, atau AWAITING_FINAL_PAYMENT (status saat ini: ${order.status})`,
      409
    );
  }

  const shipments = await fetchOrderShipments(tx, businessId, order.id);
  let targetShipment: ShipmentWithOptionalItems | undefined;

  if (input.shipmentId) {
    targetShipment = shipments.find((s) => s.id === input.shipmentId);
    if (!targetShipment) {
      throw new DomainError('SHIPMENT_NOT_FOUND', 'Data kloter pengiriman tidak ditemukan', 404);
    }
  } else {
    // Cari draf PREPARING yang aktif, atau bila semua kloter sebelumnya sudah terkirim
    // buat draf kloter baru hanya jika allowPartialShipment aktif
    const preparing = shipments.find((s) => s.status === ShipStatus.PREPARING);
    if (preparing) {
      targetShipment = preparing;
    } else if (shipments.length > 0) {
      const business = await tx.business.findFirst({
        where: { id: businessId },
        select: { allowPartialShipment: true },
      });
      if (!business?.allowPartialShipment) {
        // Pertahankan perilaku legacy upsert pada 1 shipment milik order ini
        targetShipment = shipments[0];
      }
    }
  }

  let savedShipment: ShipmentWithOptionalItems;

  if (targetShipment) {
    await tx.shipment.updateMany({
      where: { id: targetShipment.id, businessId },
      data: {
        method: input.method ?? targetShipment.method,
        transporterId: input.transporterId ?? null,
        trackingNo: input.trackingNo ?? null,
        driverName: input.driverName ?? null,
        vehiclePlate: input.vehiclePlate ?? null,
        receiverName: input.receiverName ?? null,
        notes: input.notes ?? null,
        actualCost:
          ctx.user.role === Role.SUPERADMIN && input.actualCost !== undefined
            ? BigInt(input.actualCost)
            : undefined,
      },
    });

    savedShipment = await tx.shipment.findFirstOrThrow({
      where: { id: targetShipment.id, businessId },
    });
  } else {
    const nextKloter =
      shipments.reduce(
        (max, s) => Math.max(max, (s as { kloterNo?: number }).kloterNo ?? 1),
        0
      ) + 1;

    savedShipment = await tx.shipment.create({
      data: {
        businessId,
        orderId: order.id,
        kloterNo: nextKloter,
        method: input.method ?? ShipMethod.OWN_FLEET,
        transporterId: input.transporterId ?? null,
        trackingNo: input.trackingNo ?? null,
        driverName: input.driverName ?? null,
        vehiclePlate: input.vehiclePlate ?? null,
        receiverName: input.receiverName ?? null,
        notes: input.notes ?? null,
        status: ShipStatus.PREPARING,
        actualCost:
          ctx.user.role === Role.SUPERADMIN && input.actualCost !== undefined
            ? BigInt(input.actualCost)
            : BigInt(0),
      },
    });
  }

  return formatShipmentDto(savedShipment, ctx.user.role);
}

/**
 * Menandai pengiriman telah dikirim (SHIPPED) — mendukung penuh maupun parsial multi-kloter (Fase 4).
 */
export async function shipOrder(
  tx: TxClient,
  ctx: Ctx,
  orderId: string,
  input?: ShipmentShipInput
): Promise<ShipmentDto> {
  const businessId = ctx.businessId ?? ctx.user.businessId;
  if (!businessId) {
    throw new DomainError('BUSINESS_REQUIRED', 'Unit usaha aktif diperlukan', 400);
  }

  await lockOrder(tx, orderId, businessId);

  const order = await tx.order.findFirst({
    where: { id: orderId, businessId, deletedAt: null },
    include: {
      items: { orderBy: { sortOrder: 'asc' } },
      customer: true,
    },
  });

  if (!order) {
    throw new DomainError('ORDER_NOT_FOUND', 'Pesanan tidak ditemukan', 404);
  }

  if (ctx.user.role === Role.SALES && order.salesId !== ctx.user.id) {
    throw new DomainError('FORBIDDEN', 'Anda tidak memiliki hak akses atas pesanan ini', 403);
  }

  // Pastikan tidak ada pengajuan revisi pesanan yang masih pending
  if (typeof (tx as { orderRevision?: { findFirst?: unknown } }).orderRevision?.findFirst === 'function') {
    const pendingRev = await tx.orderRevision.findFirst({
      where: {
        orderId: order.id,
        businessId,
        status: 'PENDING_APPROVAL',
      },
    });
    if (pendingRev) {
      throw new DomainError(
        'REVISION_PENDING',
        'Selesaikan persetujuan atau penolakan revisi pesanan terlebih dahulu sebelum mengirim barang',
        409
      );
    }
  }

  const business = await tx.business.findFirst({
    where: { id: businessId },
  });

  const allowEarlyShip = Boolean(business?.allowShipBeforeFinalInvoice);
  const allowedStatuses: OrderStatus[] = allowEarlyShip
    ? [
        OrderStatus.IN_PROCESS,
        OrderStatus.FINAL_PENDING_APPROVAL,
        OrderStatus.AWAITING_FINAL_PAYMENT,
      ]
    : [OrderStatus.AWAITING_FINAL_PAYMENT];

  if (!allowedStatuses.includes(order.status)) {
    throw new DomainError(
      'INVALID_STATE',
      allowEarlyShip
        ? `Pesanan hanya dapat dikirim saat berstatus IN_PROCESS, FINAL_PENDING_APPROVAL, atau AWAITING_FINAL_PAYMENT (status saat ini: ${order.status})`
        : `Pesanan hanya dapat dikirim saat berstatus AWAITING_FINAL_PAYMENT (status saat ini: ${order.status})`,
      409
    );
  }

  // Periksa aturan requirePaidBeforeShip
  if (business?.requirePaidBeforeShip) {
    const balanceDue = order.grandTotal - order.paidTotal - order.creditTotal;
    if (balanceDue > BigInt(0)) {
      throw new DomainError(
        'PAYMENT_REQUIRED',
        'Usaha mewajibkan pelunasan sebelum pengiriman (requirePaidBeforeShip aktif)',
        409
      );
    }
  }

  const summary = await getShippedQtySummary(tx, businessId, order.id, order.items);
  const existingShipments = summary.shipments;

  // Bangun peta sisa qty per orderItem
  const remainingByOrderItem = new Map<string, number>();
  for (const oi of order.items) {
    const alreadyShipped = summary.byOrderItemId.get(oi.id) ?? 0;
    remainingByOrderItem.set(oi.id, Math.max(0, oi.qty - alreadyShipped));
  }

  const totalRemainingUnits = [...remainingByOrderItem.values()].reduce((acc, q) => acc + q, 0);

  // Idempoten bila seluruh item sudah terkirim dan pemanggil tidak meminta item spesifik
  if (totalRemainingUnits === 0 && !input?.items && existingShipments.length > 0) {
    const latestShipped = [...existingShipments]
      .reverse()
      .find((s) => s.status === ShipStatus.SHIPPED || s.status === ShipStatus.DELIVERED);
    if (latestShipped) {
      return formatShipmentDto(latestShipped, ctx.user.role);
    }
  }

  if (totalRemainingUnits <= 0) {
    throw new DomainError(
      'ALREADY_SHIPPED',
      'Seluruh kuantitas barang pada pesanan ini telah dikirimkan',
      409
    );
  }

  // Tentukan item & qty yang dikirim pada kloter ini
  let kloterItems: Array<{ orderItemId: string; productId: string; qty: number }> = [];

  if (input?.items && input.items.length > 0) {
    const seenOrderItemIds = new Set<string>();
    const orderItemMap = new Map(order.items.map((oi) => [oi.id, oi]));
    let totalRequestedUnits = 0;

    for (const reqItem of input.items) {
      if (seenOrderItemIds.has(reqItem.orderItemId)) {
        throw new DomainError(
          'DUPLICATE_ITEM',
          'Item pesanan duplikat dalam satu kloter pengiriman',
          422
        );
      }
      seenOrderItemIds.add(reqItem.orderItemId);

      const orderItem = orderItemMap.get(reqItem.orderItemId);
      if (!orderItem) {
        throw new DomainError(
          'ORDER_ITEM_NOT_FOUND',
          'Item pesanan tidak ditemukan pada pesanan ini',
          404
        );
      }

      const remaining = remainingByOrderItem.get(orderItem.id) ?? 0;
      if (reqItem.qty <= 0 || reqItem.qty > remaining) {
        throw new DomainError(
          'OVER_SHIP_QTY',
          `Kuantitas pengiriman ${orderItem.productName} (${reqItem.qty}) melebihi sisa belum terkirim (${remaining})`,
          422
        );
      }

      totalRequestedUnits += reqItem.qty;
      kloterItems.push({
        orderItemId: orderItem.id,
        productId: orderItem.productId,
        qty: reqItem.qty,
      });
    }

    if (totalRequestedUnits <= 0) {
      throw new DomainError(
        'EMPTY_SHIPMENT',
        'Minimal satu item dengan kuantitas > 0 harus dikirimkan',
        422
      );
    }

    const isStrictlyPartial = totalRequestedUnits < totalRemainingUnits || summary.hasAnyShipped;
    if (isStrictlyPartial && !business?.allowPartialShipment) {
      throw new DomainError(
        'PARTIAL_SHIPMENT_DISABLED',
        'Pengiriman parsial bertahap tidak diaktifkan pada pengaturan usaha ini',
        409
      );
    }
  } else {
    kloterItems = order.items
      .map((oi) => ({
        orderItemId: oi.id,
        productId: oi.productId,
        qty: remainingByOrderItem.get(oi.id) ?? 0,
      }))
      .filter((it) => it.qty > 0);
  }

  // Pilih atau buat target record Shipment (PREPARING) untuk kloter ini
  let targetShipment: ShipmentWithOptionalItems | undefined;
  if (input?.shipmentId) {
    targetShipment = existingShipments.find((s) => s.id === input.shipmentId);
    if (!targetShipment) {
      throw new DomainError('SHIPMENT_NOT_FOUND', 'Data kloter pengiriman tidak ditemukan', 404);
    }
    if (targetShipment.status !== ShipStatus.PREPARING) {
      return formatShipmentDto(targetShipment, ctx.user.role);
    }
  } else {
    targetShipment = existingShipments.find((s) => s.status === ShipStatus.PREPARING);
  }

  let kloterNo = 1;
  if (!targetShipment) {
    kloterNo =
      existingShipments.reduce(
        (max, s) => Math.max(max, (s as { kloterNo?: number }).kloterNo ?? 1),
        0
      ) + 1;
    targetShipment = (await tx.shipment.create({
      data: {
        businessId,
        orderId: order.id,
        kloterNo,
        method: ShipMethod.OWN_FLEET,
        status: ShipStatus.PREPARING,
      },
    })) as ShipmentWithOptionalItems;
  } else {
    kloterNo = (targetShipment as { kloterNo?: number }).kloterNo ?? 1;
  }

  const now = new Date();
  const baseDeliveryNo = order.customerSeq
    ? suratJalanNumber(order.customer.code, now, order.customerSeq)
    : null;
  const deliveryNo =
    targetShipment.deliveryNo ||
    (baseDeliveryNo ? (kloterNo > 1 ? `${baseDeliveryNo}-K${kloterNo}` : baseDeliveryNo) : null);

  const kloterTotalUnits = kloterItems.reduce((sum, it) => sum + it.qty, 0);
  const keepOrderReserved = kloterTotalUnits < totalRemainingUnits;

  // Potong stok keluar fisik hanya sejumlah item kloter ini; tahan stockReserved sampai seluruh unit terkirim
  await shipOrderStock(
    tx,
    order,
    kloterItems.map((it) => ({ productId: it.productId, qty: it.qty })),
    ctx.user.id,
    keepOrderReserved ? { keepOrderReserved: true } : undefined
  );

  if (typeof (tx as { shipmentItem?: { createMany?: unknown } }).shipmentItem?.createMany === 'function') {
    await (tx as { shipmentItem: { createMany: (args: unknown) => Promise<unknown> } }).shipmentItem.createMany({
      data: kloterItems.map((it) => ({
        shipmentId: targetShipment!.id,
        orderItemId: it.orderItemId,
        qty: it.qty,
      })),
    });
  }

  await tx.shipment.updateMany({
    where: { id: targetShipment.id, businessId },
    data: {
      status: ShipStatus.SHIPPED,
      deliveryNo,
      shippedAt: now,
    },
  });

  // Evaluasi penyelesaian pesanan (hanya COMPLETED jika saldo = 0 DAN seluruh item terkirim)
  await maybeComplete(tx, ctx, order.id);

  await tx.auditLog.create({
    data: {
      businessId,
      actorId: ctx.user.id,
      actorRole: ctx.user.role,
      action: 'SHIPMENT_SHIP',
      entityType: 'Shipment',
      entityId: targetShipment.id,
      summary: `Pengiriman Kloter #${kloterNo} pesanan ${order.orderNo || order.id} ditandai dikirim (Surat Jalan: ${deliveryNo || '-'})`,
    },
  });

  await tx.notification.create({
    data: {
      userId: order.salesId,
      businessId,
      type: 'SHIPMENT_SHIPPED',
      title: `Barang Kloter #${kloterNo} Telah Dikirim`,
      body: `Barang kloter #${kloterNo} untuk pesanan #${order.orderNo || order.id.slice(-6)} telah dikirimkan dengan nomor surat jalan ${deliveryNo || '-'}`,
      linkPath: `/orders/${order.id}`,
      dedupeKey: `ship_${targetShipment.id}_${order.salesId}`,
    },
  });

  const refreshed =
    typeof (tx.shipment as { findMany?: unknown })?.findMany === 'function'
      ? await tx.shipment.findFirstOrThrow({
          where: { id: targetShipment.id, businessId },
          include: {
            items: {
              include: {
                orderItem: {
                  select: {
                    id: true,
                    productId: true,
                    productName: true,
                    sku: true,
                    unit: true,
                  },
                },
              },
            },
          },
        })
      : await tx.shipment.findFirstOrThrow({
          where: { id: targetShipment.id, businessId },
        });

  return formatShipmentDto(refreshed as ShipmentWithOptionalItems, ctx.user.role);
}

/**
 * Menandai kloter pengiriman telah tiba / diterima pelanggan (DELIVERED).
 */
export async function deliverOrder(
  tx: TxClient,
  ctx: Ctx,
  orderId: string,
  options?: ShipmentDeliverInput
): Promise<ShipmentDto> {
  const businessId = ctx.businessId ?? ctx.user.businessId;
  if (!businessId) {
    throw new DomainError('BUSINESS_REQUIRED', 'Unit usaha aktif diperlukan', 400);
  }

  const order = await tx.order.findFirst({
    where: { id: orderId, businessId, deletedAt: null },
  });

  if (!order) {
    throw new DomainError('ORDER_NOT_FOUND', 'Pesanan tidak ditemukan', 404);
  }

  if (ctx.user.role === Role.SALES && order.salesId !== ctx.user.id) {
    throw new DomainError('FORBIDDEN', 'Anda tidak memiliki hak akses atas pesanan ini', 403);
  }

  const shipments = await fetchOrderShipments(tx, businessId, order.id);
  if (shipments.length === 0) {
    throw new DomainError('SHIPMENT_NOT_FOUND', 'Data pengiriman tidak ditemukan', 404);
  }

  let shipment: ShipmentWithOptionalItems | undefined;
  if (options?.shipmentId) {
    shipment = shipments.find((s) => s.id === options.shipmentId);
    if (!shipment) {
      throw new DomainError('SHIPMENT_NOT_FOUND', 'Data kloter pengiriman tidak ditemukan', 404);
    }
  } else {
    // Cari kloter berstatus SHIPPED pertama; jika semua DELIVERED, idempoten kembalikan yang terakhir
    shipment =
      shipments.find((s) => s.status === ShipStatus.SHIPPED) ??
      [...shipments].reverse().find((s) => s.status === ShipStatus.DELIVERED) ??
      shipments[0];
  }

  if (shipment.status === ShipStatus.DELIVERED) {
    return formatShipmentDto(shipment, ctx.user.role);
  }

  if (shipment.status !== ShipStatus.SHIPPED) {
    throw new DomainError(
      'INVALID_STATE',
      `Pengiriman hanya dapat ditandai tiba jika berstatus SHIPPED (status saat ini: ${shipment.status})`,
      409
    );
  }

  const now = new Date();
  const kloterNo = (shipment as { kloterNo?: number }).kloterNo ?? 1;

  await tx.shipment.updateMany({
    where: { id: shipment.id, businessId },
    data: {
      status: ShipStatus.DELIVERED,
      deliveredAt: now,
      receiverName: options?.receiverName || shipment.receiverName,
    },
  });

  await maybeComplete(tx, ctx, order.id);

  await tx.auditLog.create({
    data: {
      businessId,
      actorId: ctx.user.id,
      actorRole: ctx.user.role,
      action: 'SHIPMENT_DELIVER',
      entityType: 'Shipment',
      entityId: shipment.id,
      summary: `Pengiriman Kloter #${kloterNo} pesanan ${order.orderNo || order.id} telah tiba dan diterima oleh ${options?.receiverName || shipment.receiverName || 'pelanggan'}`,
    },
  });

  await tx.notification.create({
    data: {
      userId: order.salesId,
      businessId,
      type: 'SHIPMENT_DELIVERED',
      title: `Barang Kloter #${kloterNo} Telah Diterima`,
      body: `Barang kloter #${kloterNo} untuk pesanan #${order.orderNo || order.id.slice(-6)} telah diterima oleh ${options?.receiverName || shipment.receiverName || 'pelanggan'}`,
      linkPath: `/orders/${order.id}`,
      dedupeKey: `deliver_${shipment.id}_${order.salesId}`,
    },
  });

  const refreshed = await tx.shipment.findFirstOrThrow({
    where: { id: shipment.id, businessId },
  });

  return formatShipmentDto(refreshed as ShipmentWithOptionalItems, ctx.user.role);
}
