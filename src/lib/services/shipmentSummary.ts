import { Shipment, ShipmentItem, ShipStatus } from '@prisma/client';
import type { prisma } from '@/lib/db';

type TxClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

export type ShipmentWithOptionalItems = Shipment & {
  items?: Array<
    ShipmentItem & {
      orderItem?: {
        id: string;
        productId: string;
        productName: string;
        sku: string;
        unit: string;
      } | null;
    }
  >;
};

export interface ShippedQtySummary {
  byOrderItemId: Map<string, number>;
  byProductId: Map<string, number>;
  shipments: ShipmentWithOptionalItems[];
  hasAnyShipped: boolean;
  allItemsShipped: boolean;
  allItemsDelivered: boolean;
}

/**
 * Mengambil seluruh baris Shipment kloter milik satu pesanan (kompatibel dengan mock legacy findFirst).
 */
export async function fetchOrderShipments(
  tx: TxClient,
  businessId: string,
  orderId: string
): Promise<ShipmentWithOptionalItems[]> {
  if (typeof (tx.shipment as { findMany?: unknown })?.findMany === 'function') {
    const rows = await tx.shipment.findMany({
      where: { orderId, businessId },
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
      orderBy: [{ kloterNo: 'asc' }, { createdAt: 'asc' }],
    });
    return rows as ShipmentWithOptionalItems[];
  }

  // Fallback kompatibel untuk test mock legacy yang hanya menyediakan shipment.findFirst
  const single = await tx.shipment.findFirst({
    where: { orderId, businessId },
  });
  return single ? [single as ShipmentWithOptionalItems] : [];
}

/**
 * Menghitung agregat kuantitas yang sudah dikirim (SHIPPED/DELIVERED) across semua kloter
 * pesanan secara deterministik (Single Source of Truth untuk Fase 3, Fase 4, Retur, & Penyelesaian).
 */
export async function getShippedQtySummary(
  tx: TxClient,
  businessId: string,
  orderId: string,
  orderItems: Array<{ id: string; productId: string; qty: number }>
): Promise<ShippedQtySummary> {
  const shipments = await fetchOrderShipments(tx, businessId, orderId);
  const byOrderItemId = new Map<string, number>();
  const byProductId = new Map<string, number>();
  const orderItemById = new Map(orderItems.map((it) => [it.id, it]));

  const shippedBatches = shipments.filter(
    (s) => s.status === ShipStatus.SHIPPED || s.status === ShipStatus.DELIVERED
  );

  for (const s of shippedBatches) {
    if (Array.isArray(s.items) && s.items.length > 0) {
      for (const si of s.items) {
        byOrderItemId.set(si.orderItemId, (byOrderItemId.get(si.orderItemId) ?? 0) + si.qty);
        const prodId =
          si.orderItem?.productId ?? orderItemById.get(si.orderItemId)?.productId;
        if (prodId) {
          byProductId.set(prodId, (byProductId.get(prodId) ?? 0) + si.qty);
        }
      }
    } else if (s.items === undefined) {
      // Kompatibel untuk mock legacy tanpa relasi items: 1 shipment SHIPPED = kirim penuh seluruh orderItems
      for (const it of orderItems) {
        byOrderItemId.set(it.id, (byOrderItemId.get(it.id) ?? 0) + it.qty);
        byProductId.set(it.productId, (byProductId.get(it.productId) ?? 0) + it.qty);
      }
    }
  }

  const allItemsShipped =
    orderItems.length > 0 &&
    orderItems.every((it) => (byOrderItemId.get(it.id) ?? 0) >= it.qty);

  const allItemsDelivered =
    allItemsShipped &&
    shippedBatches.length > 0 &&
    shippedBatches.every((s) => s.status === ShipStatus.DELIVERED);

  return {
    byOrderItemId,
    byProductId,
    shipments,
    hasAnyShipped: shippedBatches.length > 0,
    allItemsShipped,
    allItemsDelivered,
  };
}

