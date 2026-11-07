export interface ProfitInput {
  items: {
    qty: number;
    lineNet: number;
    costPrice: number;
    discountSource: 'MANUAL' | 'PROMO' | 'SUBSIDY';
    lineDiscount: number;
  }[];
  returns: { creditExPpn: number; cogsReversed: number }[]; // hanya credit note yang tidak void
  shippingCharge: number;
  shippingActualCost: number;
  extraCosts: number[];
}

export function calcProfit(i: ProfitInput) {
  const goodsRevenue =
    i.items.reduce((s, x) => s + x.lineNet, 0) -
    i.returns.reduce((s, r) => s + r.creditExPpn, 0);
  const cogs =
    i.items.reduce((s, x) => s + x.costPrice * x.qty, 0) -
    i.returns.reduce((s, r) => s + r.cogsReversed, 0);
  const extra = i.extraCosts.reduce((s, c) => s + c, 0);
  const revenue = goodsRevenue + i.shippingCharge;
  const profit = revenue - cogs - i.shippingActualCost - extra;
  const bySource = { MANUAL: 0, PROMO: 0, SUBSIDY: 0 };
  for (const x of i.items) bySource[x.discountSource] += x.lineDiscount;
  return {
    revenue,
    goodsRevenue,
    cogs,
    shippingActualCost: i.shippingActualCost,
    extraCosts: extra,
    profit,
    marginBps: revenue > 0 ? Math.round((profit * 10000) / revenue) : 0, // persen margin, bukan uang
    shippingSubsidy: Math.max(0, i.shippingActualCost - i.shippingCharge),
    discountBySource: bySource,
  };
}
