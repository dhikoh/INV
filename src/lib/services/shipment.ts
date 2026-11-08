import {
  Shipment,
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
import { prisma } from '@/lib/db';
import type { Ctx } from '../auth/context';
import type {
  ShipmentDeliverInput,
} from '../validation/shipment';

export type TxClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

export interface ShipmentDto {
  id: string;
  orderId: string;
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
}

/**
 * Format DTO pengiriman aman sesuai role.
 * Garansi Mutlak: actualCost (biaya ongkir rahasia yang dibayar usaha)
 * TIDAK PERNAH dikirimkan ke role SALES!
 */
export function formatShipmentDto(shipment: Shipment, role: Role): ShipmentDto {
  const isSuperAdmin = role === Role.SUPERADMIN;

  const base: ShipmentDto = {
    id: shipment.id,
    orderId: shipment.orderId,
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

  if (isSuperAdmin) {
    base.actualCost = Number(shipment.actualCost);
  }

  return base;
}

/**
 * Mengambil informasi pengiriman untuk pesanan tertentu.
 */
export async function getShipment(
  tx: TxClient,
  ctx: Ctx,
  orderId: string
): Promise<ShipmentDto | null> {
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

  const shipment = await tx.shipment.findFirst({
    where: { orderId: order.id, businessId },
  });

  if (!shipment) {
    return null;
  }

  return formatShipmentDto(shipment, ctx.user.role);
}

export type ShipmentUpsertData = {
  method?: ShipMethod;
  transporterId?: string | null;
  trackingNo?: string | null;
  driverName?: string | null;
  vehiclePlate?: string | null;
  receiverName?: string | null;
  notes?: string | null;
  actualCost?: number;
};

/**
 * Membuat atau memperbarui draf pengiriman (PREPARING) (Seksi 8.3 & 10).
 *
 * Efek samping:
 * 1. Otorisasi Sales pemilik order atau Super Admin.
 * 2. Sales dilarang mengirim actualCost (422 UNPROCESSABLE_ENTITY).
 * 3. Status pesanan harus IN_PROCESS, FINAL_PENDING_APPROVAL, atau AWAITING_FINAL_PAYMENT.
 * 4. Bila pengiriman belum ada, buat baru. Bila sudah ada, perbarui rincian logistik.
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

  const existingShipment = await tx.shipment.findFirst({
    where: { orderId: order.id, businessId },
  });

  let savedShipment: Shipment;

  if (existingShipment) {
    await tx.shipment.updateMany({
      where: { id: existingShipment.id, businessId },
      data: {
        method: input.method ?? existingShipment.method,
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
      where: { id: existingShipment.id, businessId },
    });
  } else {
    savedShipment = await tx.shipment.create({
      data: {
        businessId,
        orderId: order.id,
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
 * Menandai pengiriman telah dikirim (SHIPPED) (Seksi 8.3 & Seksi 19.5 T3.4).
 *
 * Efek samping:
 * 1. Otorisasi Sales pemilik order atau Super Admin.
 * 2. Kunci pesanan pesimistik lockOrder.
 * 3. Status pesanan HARUS AWAITING_FINAL_PAYMENT.
 * 4. Bila requirePaidBeforeShip aktif pada unit usaha:
 *    - balanceDue harus 0 (menolak 409 PAYMENT_REQUIRED bila belum lunas).
 * 5. Alokasi nomor surat jalan resmi (deliveryNo) KODE/SJ/DD/MM/YYYY/NNNN menggunakan customerSeq order.
 * 6. Pemotongan stok keluar fisik (shipOrderStock).
 * 7. Transisi status shipment menjadi SHIPPED, isi shippedAt.
 * 8. Evaluasi penyelesaian otomatis maybeComplete.
 * 9. Catat AuditLog (SHIPMENT_SHIP) dan notifikasi.
 */
export async function shipOrder(
  tx: TxClient,
  ctx: Ctx,
  orderId: string
): Promise<ShipmentDto> {
  const businessId = ctx.businessId ?? ctx.user.businessId;
  if (!businessId) {
    throw new DomainError('BUSINESS_REQUIRED', 'Unit usaha aktif diperlukan', 400);
  }

  await lockOrder(tx, orderId, businessId);

  const order = await tx.order.findFirst({
    where: { id: orderId, businessId, deletedAt: null },
    include: {
      items: true,
      customer: true,
    },
  });

  if (!order) {
    throw new DomainError('ORDER_NOT_FOUND', 'Pesanan tidak ditemukan', 404);
  }

  if (ctx.user.role === Role.SALES && order.salesId !== ctx.user.id) {
    throw new DomainError('FORBIDDEN', 'Anda tidak memiliki hak akses atas pesanan ini', 403);
  }

  if (order.status !== OrderStatus.AWAITING_FINAL_PAYMENT) {
    throw new DomainError(
      'INVALID_STATE',
      `Pesanan hanya dapat dikirim saat berstatus AWAITING_FINAL_PAYMENT (status saat ini: ${order.status})`,
      409
    );
  }

  const business = await tx.business.findFirst({
    where: { id: businessId },
  });

  // Periksa aturan requirePaidBeforeShip
  if (business?.requirePaidBeforeShip) {
    const balanceDue =
      order.grandTotal - order.paidTotal - order.creditTotal;
    if (balanceDue > BigInt(0)) {
      throw new DomainError(
        'PAYMENT_REQUIRED',
        'Usaha mewajibkan pelunasan sebelum pengiriman (requirePaidBeforeShip aktif)',
        409
      );
    }
  }

  let shipment = await tx.shipment.findFirst({
    where: { orderId: order.id, businessId },
  });

  if (!shipment) {
    shipment = await tx.shipment.create({
      data: {
        businessId,
        orderId: order.id,
        method: ShipMethod.OWN_FLEET,
        status: ShipStatus.PREPARING,
      },
    });
  }

  // Idempoten bila sudah berstatus SHIPPED atau DELIVERED
  if (
    shipment.status === ShipStatus.SHIPPED ||
    shipment.status === ShipStatus.DELIVERED
  ) {
    return formatShipmentDto(shipment, ctx.user.role);
  }

  const now = new Date();

  // Alokasi nomor surat jalan resmi
  const deliveryNo =
    shipment.deliveryNo ||
    (order.customerSeq
      ? suratJalanNumber(order.customer.code, now, order.customerSeq)
      : null);

  // Potong stok keluar fisik produk (mengurangi reservedQty dan stockQty)
  await shipOrderStock(tx, order, order.items, ctx.user.id);

  await tx.shipment.updateMany({
    where: { id: shipment.id, businessId },
    data: {
      status: ShipStatus.SHIPPED,
      deliveryNo,
      shippedAt: now,
    },
  });

  // Evaluasi penyelesaian pesanan bila sudah lunas
  await maybeComplete(tx, ctx, order.id);

  // Catat AuditLog
  await tx.auditLog.create({
    data: {
      businessId,
      actorId: ctx.user.id,
      actorRole: ctx.user.role,
      action: 'SHIPMENT_SHIP',
      entityType: 'Shipment',
      entityId: shipment.id,
      summary: `Pengiriman pesanan ${order.orderNo || order.id} ditandai dikirim (Surat Jalan: ${deliveryNo || '-'})`,
    },
  });

  // Notifikasi ke staf sales
  await tx.notification.create({
    data: {
      userId: order.salesId,
      businessId,
      type: 'SHIPMENT_SHIPPED',
      title: 'Barang Telah Dikirim',
      body: `Barang untuk pesanan #${order.orderNo || order.id.slice(-6)} telah dikirimkan dengan nomor surat jalan ${deliveryNo || '-'}`,
      linkPath: `/orders/${order.id}`,
      dedupeKey: `ship_${shipment.id}_${order.salesId}`,
    },
  });

  const refreshedShipment = await tx.shipment.findFirstOrThrow({
    where: { id: shipment.id, businessId },
  });

  return formatShipmentDto(refreshedShipment, ctx.user.role);
}

/**
 * Menandai pengiriman telah tiba / diterima pelanggan (DELIVERED) (Seksi 8.3 & Seksi 19.5 T3.4).
 *
 * Efek samping:
 * 1. Otorisasi Sales pemilik order atau Super Admin.
 * 2. Status shipment harus SHIPPED.
 * 3. Transisi status shipment menjadi DELIVERED, isi deliveredAt.
 * 4. Evaluasi penyelesaian otomatis maybeComplete.
 * 5. Catat AuditLog (SHIPMENT_DELIVER) dan notifikasi.
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

  const shipment = await tx.shipment.findFirst({
    where: { orderId: order.id, businessId },
  });

  if (!shipment) {
    throw new DomainError('SHIPMENT_NOT_FOUND', 'Data pengiriman tidak ditemukan', 404);
  }

  // Idempoten bila sudah DELIVERED
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

  await tx.shipment.updateMany({
    where: { id: shipment.id, businessId },
    data: {
      status: ShipStatus.DELIVERED,
      deliveredAt: now,
      receiverName: options?.receiverName || shipment.receiverName,
    },
  });

  // Evaluasi penyelesaian pesanan
  await maybeComplete(tx, ctx, order.id);

  // Catat AuditLog
  await tx.auditLog.create({
    data: {
      businessId,
      actorId: ctx.user.id,
      actorRole: ctx.user.role,
      action: 'SHIPMENT_DELIVER',
      entityType: 'Shipment',
      entityId: shipment.id,
      summary: `Pengiriman pesanan ${order.orderNo || order.id} telah tiba dan diterima oleh ${options?.receiverName || shipment.receiverName || 'pelanggan'}`,
    },
  });

  // Notifikasi
  await tx.notification.create({
    data: {
      userId: order.salesId,
      businessId,
      type: 'SHIPMENT_DELIVERED',
      title: 'Barang Telah Diterima',
      body: `Barang untuk pesanan #${order.orderNo || order.id.slice(-6)} telah diterima oleh ${options?.receiverName || shipment.receiverName || 'pelanggan'}`,
      linkPath: `/orders/${order.id}`,
      dedupeKey: `deliver_${shipment.id}_${order.salesId}`,
    },
  });

  const refreshedShipment = await tx.shipment.findFirstOrThrow({
    where: { id: shipment.id, businessId },
  });

  return formatShipmentDto(refreshedShipment, ctx.user.role);
}
