import { describe, it, expect, vi } from 'vitest';
import { Role, ShipMethod, ShipStatus } from '@prisma/client';
import {
  ShipmentUpsertSchema,
  ShipmentShipSchema,
  ShipmentDeliverSchema,
} from '@/lib/validation/shipment';
import { formatShipmentDto } from '@/lib/services/shipment';
import { getShippedQtySummary } from '@/lib/services/shipmentSummary';

describe('Fase 4 Unit Tests — Validasi Skema Pengiriman Parsial, DTO Zero-Leakage & Agregat Kloter', () => {
  it('ShipmentShipSchema memvalidasi payload kosong maupun itemized tanpa extra fields', () => {
    expect(ShipmentShipSchema.parse(undefined)).toBeUndefined();
    expect(ShipmentShipSchema.parse({})).toEqual({});

    const partial = ShipmentShipSchema.parse({
      shipmentId: 'ship_k1',
      items: [{ orderItemId: 'oi_1', qty: 4 }],
    });
    expect(partial).toEqual({
      shipmentId: 'ship_k1',
      items: [{ orderItemId: 'oi_1', qty: 4 }],
    });

    expect(() =>
      ShipmentShipSchema.parse({ items: [{ orderItemId: 'oi_1', qty: 0 }] })
    ).toThrow();
    expect(() =>
      ShipmentShipSchema.parse({ items: [{ orderItemId: 'oi_1', qty: 1.5 }] })
    ).toThrow();
    expect(() => ShipmentShipSchema.parse({ items: [] })).toThrow();
    expect(() => ShipmentShipSchema.parse({ unexpected: true })).toThrow();
  });

  it('ShipmentUpsertSchema & ShipmentDeliverSchema mendukung optional shipmentId multi-kloter', () => {
    const upsert = ShipmentUpsertSchema.parse({
      shipmentId: 'ship_k2',
      method: ShipMethod.OWN_FLEET,
      driverName: 'Pak Budi',
    });
    expect(upsert.shipmentId).toBe('ship_k2');
    expect(upsert.method).toBe(ShipMethod.OWN_FLEET);

    const deliver = ShipmentDeliverSchema.parse({
      shipmentId: 'ship_k1',
      receiverName: 'Bu Sari',
    });
    expect(deliver?.shipmentId).toBe('ship_k1');
    expect(deliver?.receiverName).toBe('Bu Sari');
  });

  it('formatShipmentDto menyembunyikan actualCost untuk Role.SALES dan menampilkannya untuk Role.SUPERADMIN', () => {
    const now = new Date('2026-11-12T10:00:00.000Z');
    const rawShipment = {
      id: 'ship_1',
      businessId: 'biz_1',
      orderId: 'ord_1',
      kloterNo: 2,
      method: ShipMethod.EXPEDITION,
      transporterId: null,
      trackingNo: 'RESI-999',
      driverName: 'Kurir JNE',
      vehiclePlate: 'B 1234 XYZ',
      receiverName: 'Gudang Petshop',
      status: ShipStatus.SHIPPED,
      deliveryNo: 'BC/SJ/12/11/2026/0001-K2',
      actualCost: BigInt(175_000),
      shippedAt: now,
      deliveredAt: null,
      notes: 'Kloter susulan',
      createdAt: now,
      updatedAt: now,
      items: [
        {
          id: 'si_1',
          shipmentId: 'ship_1',
          orderItemId: 'oi_1',
          qty: 6,
          orderItem: {
            id: 'oi_1',
            productId: 'prod_1',
            productName: 'Kibble Tuna 5kg',
            sku: 'KT-5',
            unit: 'Zak',
          },
        },
      ],
    };

    const salesDto = formatShipmentDto(rawShipment as never, Role.SALES);
    expect(salesDto.kloterNo).toBe(2);
    expect(salesDto.items).toHaveLength(1);
    expect(salesDto.items?.[0].qty).toBe(6);
    expect('actualCost' in salesDto).toBe(false);
    expect(salesDto.actualCost).toBeUndefined();

    const adminDto = formatShipmentDto(rawShipment as never, Role.SUPERADMIN);
    expect(adminDto.actualCost).toBe(175_000);
  });

  it('getShippedQtySummary menjumlahkan multi-kloter hanya yang SHIPPED/DELIVERED dan mengabaikan PREPARING', async () => {
    const now = new Date('2026-11-12T10:00:00.000Z');
    const mockTx = {
      shipment: {
        findMany: vi.fn(async () => [
          {
            id: 'sh_1',
            businessId: 'biz_1',
            orderId: 'ord_1',
            kloterNo: 1,
            status: ShipStatus.DELIVERED,
            createdAt: now,
            items: [{ id: 'si_1', shipmentId: 'sh_1', orderItemId: 'oi_a', qty: 4, orderItem: null }],
          },
          {
            id: 'sh_2',
            businessId: 'biz_1',
            orderId: 'ord_1',
            kloterNo: 2,
            status: ShipStatus.SHIPPED,
            createdAt: now,
            items: [
              { id: 'si_2', shipmentId: 'sh_2', orderItemId: 'oi_a', qty: 6, orderItem: null },
              { id: 'si_3', shipmentId: 'sh_2', orderItemId: 'oi_b', qty: 2, orderItem: null },
            ],
          },
          {
            id: 'sh_3',
            businessId: 'biz_1',
            orderId: 'ord_1',
            kloterNo: 3,
            status: ShipStatus.PREPARING,
            createdAt: now,
            items: [],
          },
        ]),
      },
    };

    const summary = await getShippedQtySummary(
      mockTx as never,
      'biz_1',
      'ord_1',
      [
        { id: 'oi_a', productId: 'prod_a', qty: 10 },
        { id: 'oi_b', productId: 'prod_b', qty: 5 },
      ]
    );

    expect(summary.byOrderItemId.get('oi_a')).toBe(10);
    expect(summary.byOrderItemId.get('oi_b')).toBe(2);
    expect(summary.byProductId.get('prod_a')).toBe(10);
    expect(summary.byProductId.get('prod_b')).toBe(2);
    expect(summary.hasAnyShipped).toBe(true);
    expect(summary.allItemsShipped).toBe(false);
    expect(summary.allItemsDelivered).toBe(false);
  });
});
