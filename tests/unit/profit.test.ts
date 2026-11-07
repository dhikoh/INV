import { describe, it, expect } from 'vitest';
import { calcProfit } from '@/lib/domain/profit';

describe('Domain: profit.ts (7.4, 17.2)', () => {
  it('menghitung profit dan subsidi ongkir dengan benar', () => {
    const res = calcProfit({
      items: [
        {
          qty: 10,
          lineNet: 950000,
          costPrice: 70000,
          discountSource: 'MANUAL',
          lineDiscount: 50000,
        },
        {
          qty: 5,
          lineNet: 190000,
          costPrice: 25000,
          discountSource: 'MANUAL',
          lineDiscount: 10000,
        },
      ],
      returns: [],
      shippingCharge: 50000,
      shippingActualCost: 80000,
      extraCosts: [10000],
    });

    // revenue: 950000 + 190000 + 50000 = 1190000
    // cogs: 700000 + 125000 = 825000
    // profit: 1190000 - 825000 - 80000 - 10000 = 275000
    expect(res.revenue).toBe(1190000);
    expect(res.cogs).toBe(825000);
    expect(res.profit).toBe(275000);
    expect(res.shippingSubsidy).toBe(30000);
  });

  it('profit negatif tetap dihitung akurat', () => {
    const res = calcProfit({
      items: [
        {
          qty: 1,
          lineNet: 10000,
          costPrice: 20000,
          discountSource: 'MANUAL',
          lineDiscount: 0,
        },
      ],
      returns: [],
      shippingCharge: 0,
      shippingActualCost: 5000,
      extraCosts: [],
    });
    expect(res.profit).toBe(-15000);
  });
});
