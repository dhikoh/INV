import { describe, it, expect } from 'vitest';
import { calcLine, calcOrderTotals } from '@/lib/domain/order';
import { calcProfit } from '@/lib/domain/profit';
import { calcCommission } from '@/lib/domain/commission';
import { applyBps } from '@/lib/domain/money';
import { creditForQty } from '@/lib/domain/credit';

describe('Fixture 7.7: Contoh Hitungan Wajib Angka demi Angka', () => {
  // Input:
  // Baris A: qty 10, harga deal 100.000, diskon 5% (500 bps), HPP 70.000
  // Baris B: qty 5, harga deal 40.000, diskon nominal 10.000 (total baris), HPP 25.000
  // Ongkir ditagihkan: 50.000
  // Ongkir aktual: 80.000
  // PPN aktif: 11% (1100 bps)
  // DP: 50% (5000 bps)
  // Komisi: 10% dari profit (1000 bps)

  const lineA = calcLine({
    qty: 10,
    unitPrice: 100000,
    discountType: 'PERCENT',
    discountValue: 500, // 5%
  });

  const lineB = calcLine({
    qty: 5,
    unitPrice: 40000,
    discountType: 'AMOUNT',
    discountValue: 10000, // total baris
  });

  it('Baris A: subtotal 1.000.000 / diskon 50.000 / net 950.000', () => {
    expect(lineA.lineSubtotal).toBe(1000000);
    expect(lineA.lineDiscount).toBe(50000);
    expect(lineA.lineNet).toBe(950000);
  });

  it('Baris B: subtotal 200.000 / diskon 10.000 / net 190.000', () => {
    expect(lineB.lineSubtotal).toBe(200000);
    expect(lineB.lineDiscount).toBe(10000);
    expect(lineB.lineNet).toBe(190000);
  });

  const totalsPpnOn = calcOrderTotals({
    lines: [lineA, lineB],
    shippingCharge: 50000,
    ppnEnabled: true,
    ppnRateBps: 1100,
    dpBps: 5000,
  });

  it('Subtotal 1.200.000 / diskon total 60.000 / barang bersih 1.140.000', () => {
    expect(totalsPpnOn.subtotal).toBe(1200000);
    expect(totalsPpnOn.discountTotal).toBe(60000);
    expect(totalsPpnOn.goodsNet).toBe(1140000);
  });

  it('Dasar PPN (barang bersih + ongkir) = 1.190.000', () => {
    expect(totalsPpnOn.goodsNet + totalsPpnOn.shippingCharge).toBe(1190000);
  });

  it('PPN 11% = 130.900', () => {
    expect(totalsPpnOn.ppnAmount).toBe(130900);
  });

  it('Grand total (PPN aktif) = 1.320.900', () => {
    expect(totalsPpnOn.grandTotal).toBe(1320900);
  });

  it('Grand total (PPN nonaktif) = 1.190.000', () => {
    const totalsPpnOff = calcOrderTotals({
      lines: [lineA, lineB],
      shippingCharge: 50000,
      ppnEnabled: false,
      ppnRateBps: 1100,
      dpBps: 5000,
    });
    expect(totalsPpnOff.grandTotal).toBe(1190000);
  });

  it('DP 50% dari 1.320.900 = 660.450', () => {
    expect(totalsPpnOn.dpAmount).toBe(660450);
  });

  it('Invoice pelunasan = 660.450', () => {
    expect(totalsPpnOn.grandTotal - totalsPpnOn.dpAmount).toBe(660450);
  });

  const profitRes = calcProfit({
    items: [
      {
        qty: 10,
        lineNet: lineA.lineNet,
        costPrice: 70000,
        discountSource: 'MANUAL',
        lineDiscount: lineA.lineDiscount,
      },
      {
        qty: 5,
        lineNet: lineB.lineNet,
        costPrice: 25000,
        discountSource: 'MANUAL',
        lineDiscount: lineB.lineDiscount,
      },
    ],
    returns: [],
    shippingCharge: 50000,
    shippingActualCost: 80000,
    extraCosts: [],
  });

  it('HPP terjual (700.000 + 125.000) = 825.000', () => {
    expect(profitRes.cogs).toBe(825000);
  });

  it('Profit (1.140.000 + 50.000 - 825.000 - 80.000) = 285.000', () => {
    expect(profitRes.profit).toBe(285000);
  });

  it('Subsidi ongkir (80.000 - 50.000) = 30.000', () => {
    expect(profitRes.shippingSubsidy).toBe(30000);
  });

  it('Komisi 10% dari profit = 28.500', () => {
    const commRes = calcCommission({
      mode: 'PERCENT_OF_PROFIT',
      rateBps: 1000,
      fixedAmount: 0,
      profit: profitRes.profit,
      revenue: profitRes.revenue,
      tierRateBps: 0,
    });
    expect(commRes.amount).toBe(28500);
  });

  it('applyBps(1.234.567, 350) (3,5%) = 43.210', () => {
    expect(applyBps(1234567, 350)).toBe(43210);
  });

  it('Retur 2 unit baris A di-restock: kredit 190.000, HPP dibalik 140.000, profit setelah retur 235.000', () => {
    // lineNet baris A = 950.000, qty 10. Retur 2 unit -> 950.000 * 2 / 10 = 190.000
    const returnCredit = creditForQty(lineA.lineNet, 10, 2);
    expect(returnCredit).toBe(190000);

    const cogsReversed = 70000 * 2;
    expect(cogsReversed).toBe(140000);

    const profitAfterReturn = calcProfit({
      items: [
        {
          qty: 10,
          lineNet: lineA.lineNet,
          costPrice: 70000,
          discountSource: 'MANUAL',
          lineDiscount: lineA.lineDiscount,
        },
        {
          qty: 5,
          lineNet: lineB.lineNet,
          costPrice: 25000,
          discountSource: 'MANUAL',
          lineDiscount: lineB.lineDiscount,
        },
      ],
      returns: [{ creditExPpn: returnCredit, cogsReversed }],
      shippingCharge: 50000,
      shippingActualCost: 80000,
      extraCosts: [],
    });

    // 950.000 + 50.000 - 685.000 - 80.000 = 235.000
    expect(profitAfterReturn.profit).toBe(235000);
  });
});
