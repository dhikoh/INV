import { describe, it, expect } from 'vitest';
import { calcLine, calcOrderTotals } from '@/lib/domain/order';
import { DomainError } from '@/lib/domain/money';

function expectDomainError(fn: () => void, code: string) {
  try {
    fn();
    expect.fail(`Harusnya melempar DomainError dengan code ${code}`);
  } catch (err) {
    expect(err).toBeInstanceOf(DomainError);
    expect((err as DomainError).code).toBe(code);
  }
}

describe('Domain: order.ts (7.3, 17.2)', () => {
  it('qty 0 atau negatif ditolak', () => {
    expectDomainError(
      () =>
        calcLine({
          qty: 0,
          unitPrice: 10000,
          discountType: 'NONE',
          discountValue: 0,
        }),
      'QTY_INVALID'
    );

    expectDomainError(
      () =>
        calcLine({
          qty: -5,
          unitPrice: 10000,
          discountType: 'NONE',
          discountValue: 0,
        }),
      'QTY_INVALID'
    );
  });

  it('harga negatif ditolak', () => {
    expectDomainError(
      () =>
        calcLine({
          qty: 1,
          unitPrice: -100,
          discountType: 'NONE',
          discountValue: 0,
        }),
      'PRICE_INVALID'
    );
  });

  it('diskon nominal negatif ditolak', () => {
    expectDomainError(
      () =>
        calcLine({
          qty: 1,
          unitPrice: 10000,
          discountType: 'AMOUNT',
          discountValue: -500,
        }),
      'DISCOUNT_INVALID'
    );
  });

  it('diskon melebihi subtotal ditolak', () => {
    expectDomainError(
      () =>
        calcLine({
          qty: 1,
          unitPrice: 10000,
          discountType: 'AMOUNT',
          discountValue: 15000,
        }),
      'DISCOUNT_EXCEEDS_LINE'
    );
  });

  it('persen diskon melebihi 100% (10001 bps) ditolak', () => {
    expectDomainError(
      () =>
        calcLine({
          qty: 1,
          unitPrice: 10000,
          discountType: 'PERCENT',
          discountValue: 10001,
        }),
      'DISCOUNT_INVALID'
    );
  });

  it('order tanpa baris ditolak', () => {
    expectDomainError(
      () =>
        calcOrderTotals({
          lines: [],
          shippingCharge: 10000,
          ppnEnabled: false,
          ppnRateBps: 1100,
          dpBps: 0,
        }),
      'ORDER_EMPTY'
    );
  });

  it('ongkir negatif ditolak, ongkir 0 diterima', () => {
    const line = calcLine({
      qty: 1,
      unitPrice: 10000,
      discountType: 'NONE',
      discountValue: 0,
    });
    expectDomainError(
      () =>
        calcOrderTotals({
          lines: [line],
          shippingCharge: -10,
          ppnEnabled: false,
          ppnRateBps: 1100,
          dpBps: 0,
        }),
      'SHIPPING_INVALID'
    );

    const ok = calcOrderTotals({
      lines: [line],
      shippingCharge: 0,
      ppnEnabled: false,
      ppnRateBps: 1100,
      dpBps: 0,
    });
    expect(ok.shippingCharge).toBe(0);
  });

  it('dpBps = 0 memberi dpAmount = 0, dpBps = 9901 ditolak', () => {
    const line = calcLine({
      qty: 1,
      unitPrice: 10000,
      discountType: 'NONE',
      discountValue: 0,
    });
    const zeroDp = calcOrderTotals({
      lines: [line],
      shippingCharge: 0,
      ppnEnabled: false,
      ppnRateBps: 1100,
      dpBps: 0,
    });
    expect(zeroDp.dpAmount).toBe(0);

    expectDomainError(
      () =>
        calcOrderTotals({
          lines: [line],
          shippingCharge: 0,
          ppnEnabled: false,
          ppnRateBps: 1100,
          dpBps: 9901,
        }),
      'DP_INVALID'
    );
  });
});
