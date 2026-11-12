import { describe, it, expect } from 'vitest';
import { OrderRevisionStatus, Role } from '@prisma/client';
import {
  OrderRevisionCreateSchema,
  OrderRevisionApproveSchema,
  OrderRevisionRejectSchema,
} from '@/lib/validation/order';
import { formatOrderRevisionDto } from '@/lib/services/revision';

describe('Fase 3 Unit Tests — Validasi & Zero-Leakage DTO Revisi Pesanan', () => {
  it('OrderRevisionCreateSchema memvalidasi alasan >= 5 karakter dan memberi default shippingCharge = 0', () => {
    const parsed = OrderRevisionCreateSchema.parse({
      rev: 2,
      reason: 'Customer tambah 3 zak dan hapus varian kaleng',
      items: [{ productId: 'prod_1', qty: 5, unitPrice: 120000 }],
    });

    expect(parsed.rev).toBe(2);
    expect(parsed.shippingCharge).toBe(0);
    expect(parsed.items).toHaveLength(1);

    expect(() =>
      OrderRevisionCreateSchema.parse({
        rev: 1,
        reason: 'abc',
        items: [{ productId: 'prod_1', qty: 1, unitPrice: 10000 }],
      })
    ).toThrow();

    expect(() =>
      OrderRevisionCreateSchema.parse({
        rev: 1,
        reason: 'Alasan valid panjang',
        items: [],
      })
    ).toThrow();

    expect(() =>
      OrderRevisionCreateSchema.parse({
        rev: 1,
        reason: 'Alasan valid panjang',
        items: [{ productId: 'prod_1', qty: 1, unitPrice: 10000 }],
        unknownField: true,
      })
    ).toThrow();
  });

  it('OrderRevisionApproveSchema & OrderRevisionRejectSchema menegakkan validasi ketat', () => {
    expect(OrderRevisionApproveSchema.parse(undefined)).toBeUndefined();
    expect(OrderRevisionApproveSchema.parse({ overrideNote: 'OK disetujui' })).toEqual({
      overrideNote: 'OK disetujui',
    });
    expect(() =>
      OrderRevisionApproveSchema.parse({ overrideNote: 'ok', extra: 1 })
    ).toThrow();

    expect(() => OrderRevisionRejectSchema.parse({ reason: 'no' })).toThrow();
    expect(
      OrderRevisionRejectSchema.parse({ reason: 'Stok akan dialokasikan untuk tender lain' })
    ).toEqual({ reason: 'Stok akan dialokasikan untuk tender lain' });
  });

  it('formatOrderRevisionDto menyembunyikan costPrice dan overrideNote untuk Role.SALES, dan menampilkan untuk SUPERADMIN', () => {
    const now = new Date('2026-11-12T08:00:00.000Z');
    const rawRevision = {
      id: 'rev_1',
      businessId: 'biz_1',
      orderId: 'ord_1',
      revisionNo: 1,
      status: OrderRevisionStatus.APPROVED,
      reason: 'Customer ubah jumlah zak menjadi lebih banyak',
      belowMinReason: 'Harga khusus langganan',
      overrideNote: 'Disetujui margin 18% oleh owner',
      rejectReason: null,
      deliveryAddress: 'Jl. Gatot Subroto No. 10',
      shippingCharge: BigInt(50000),
      ppnEnabled: true,
      ppnRateBps: 1100,
      oldSubtotal: BigInt(1000000),
      oldDiscountTotal: BigInt(0),
      oldPpnAmount: BigInt(110000),
      oldGrandTotal: BigInt(1110000),
      newSubtotal: BigInt(1500000),
      newDiscountTotal: BigInt(50000),
      newPpnAmount: BigInt(159500),
      newGrandTotal: BigInt(1659500),
      hasBelowMin: true,
      requestedById: 'sales_1',
      requestedAt: now,
      reviewedById: 'sa_1',
      reviewedAt: now,
      createdAt: now,
      items: [
        {
          id: 'rvi_1',
          productId: 'prod_1',
          productName: 'BentoCat Salmon 10kg',
          sku: 'BC-SAL-10',
          unit: 'Zak',
          oldQty: 5,
          newQty: 8,
          listPrice: BigInt(200000),
          unitPrice: BigInt(187500),
          discountType: 'AMOUNT',
          discountValue: BigInt(50000),
          discountSource: 'MANUAL',
          lineSubtotal: BigInt(1500000),
          lineDiscount: BigInt(50000),
          lineNet: BigInt(1450000),
          costPrice: BigInt(135000),
          floorPrice: BigInt(180000),
          belowMin: false,
          sortOrder: 0,
        },
      ],
    };

    const salesDto = formatOrderRevisionDto(rawRevision, Role.SALES);
    expect(salesDto.overrideNote).toBeNull();
    expect(salesDto.items[0].costPrice).toBeUndefined();
    expect('costPrice' in salesDto.items[0]).toBe(false);
    expect(salesDto.deltaGrandTotal).toBe(1659500 - 1110000);

    const adminDto = formatOrderRevisionDto(rawRevision, Role.SUPERADMIN);
    expect(adminDto.overrideNote).toBe('Disetujui margin 18% oleh owner');
    expect(adminDto.items[0].costPrice).toBe(135000);
    expect(adminDto.deltaGrandTotal).toBe(549500);
  });
});

