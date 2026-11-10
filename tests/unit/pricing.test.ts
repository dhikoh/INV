import { describe, it, expect } from 'vitest';
import {
  baseFloor,
  lineFloor,
  isBelowFloor,
  isPromoActive,
  promoPerUnit,
  effectiveFloor,
  initialPrice,
  PromoRule,
} from '@/lib/domain/pricing';

describe('Domain: pricing.ts (7.2, 17.2, Addendum v2 14.4)', () => {
  it('harga minimal customer menimpa harga minimal produk', () => {
    expect(baseFloor(15000, 12000)).toBe(12000);
    expect(baseFloor(15000, null)).toBe(15000);
  });

  const basePromo: PromoRule = {
    id: 'p1',
    label: 'Diskon Akhir Tahun',
    source: 'PROMO',
    type: 'PERCENT',
    valueBps: 1000, // 10%
    valueAmount: null,
    productId: 'prod_1',
    validFrom: new Date('2026-11-01T00:00:00Z'),
    validTo: new Date('2026-11-30T23:59:59Z'),
    isActive: true,
  };

  it('promo aktif menurunkan floor', () => {
    const at = new Date('2026-11-15T00:00:00Z');
    expect(isPromoActive(basePromo, 'prod_1', at)).toBe(true);
    // base floor 100.000, promo 10% (10.000) -> line floor 90.000
    expect(lineFloor(100000, basePromo)).toBe(90000);
  });

  it('promo kedaluwarsa, nonaktif, atau untuk produk lain tidak berlaku', () => {
    expect(
      isPromoActive(basePromo, 'prod_2', new Date('2026-11-15T00:00:00Z'))
    ).toBe(false);
    expect(
      isPromoActive(basePromo, 'prod_1', new Date('2026-12-01T00:00:00Z'))
    ).toBe(false);
    expect(
      isPromoActive(basePromo, 'prod_1', new Date('2026-10-31T23:59:59Z'))
    ).toBe(false);
    expect(
      isPromoActive(
        { ...basePromo, isActive: false },
        'prod_1',
        new Date('2026-11-15T00:00:00Z')
      )
    ).toBe(false);
  });

  it('lineNet sama dengan floor x qty tidak dianggap di bawah minimal', () => {
    // 5 unit * 10.000 = 50.000
    expect(isBelowFloor(50000, 5, 10000)).toBe(false);
  });

  it('satu rupiah di bawah floor dianggap di bawah minimal', () => {
    expect(isBelowFloor(49999, 5, 10000)).toBe(true);
  });

  it('promo AMOUNT lebih besar dari harga tidak membuat floor negatif', () => {
    const bigPromo: PromoRule = {
      ...basePromo,
      type: 'AMOUNT',
      valueAmount: 150000,
    };
    expect(promoPerUnit(bigPromo, 100000)).toBe(100000);
    expect(lineFloor(100000, bigPromo)).toBe(0);
  });

  describe('Addendum v2 14.4: effectiveFloor & initialPrice', () => {
    it('effectiveFloor(100, 120) memberi { value: 120, source: "CUSTOMER" }', () => {
      expect(effectiveFloor(100, 120)).toEqual({ value: 120, source: 'CUSTOMER' });
    });

    it('effectiveFloor(100, null) memberi { value: 100, source: "PRODUCT" }', () => {
      expect(effectiveFloor(100, null)).toEqual({ value: 100, source: 'PRODUCT' });
    });

    it('effectiveFloor(100, 80) memberi { value: 80, source: "CUSTOMER" }', () => {
      expect(effectiveFloor(100, 80)).toEqual({ value: 80, source: 'CUSTOMER' });
    });

    it('initialPrice: yang lebih besar dari basePrice dan floorPrice', () => {
      expect(initialPrice(150, 130)).toBe(150);
      expect(initialPrice(100, 120)).toBe(120);
      expect(initialPrice(100, 100)).toBe(100);
    });
  });
});
