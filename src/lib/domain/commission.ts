import { applyBps } from './money';

export type Mode =
  | 'PERCENT_OF_PROFIT'
  | 'PERCENT_OF_REVENUE'
  | 'TIERED_BY_TARGET'
  | 'FIXED_PER_ORDER';

export function pickTierRate(
  tiers: { minAchievementBps: number; rateBps: number }[],
  achievementBps: number
): number {
  const ok = tiers
    .filter((t) => t.minAchievementBps <= achievementBps)
    .sort((a, b) => b.minAchievementBps - a.minAchievementBps);
  return ok.length > 0 ? ok[0].rateBps : 0;
}

// capaian = omzet bulan itu / target omzet; target 0 -> 0
export const achievementBps = (monthRevenue: number, target: number): number =>
  target > 0 ? Math.floor((monthRevenue * 10000) / target) : 0;

export function calcCommission(p: {
  mode: Mode;
  rateBps: number;
  fixedAmount: number;
  profit: number;
  revenue: number;
  tierRateBps: number;
}) {
  switch (p.mode) {
    case 'PERCENT_OF_PROFIT': {
      const basis = Math.max(0, p.profit);
      return { basis, rateBps: p.rateBps, amount: applyBps(basis, p.rateBps) };
    }
    case 'PERCENT_OF_REVENUE': {
      const basis = Math.max(0, p.revenue);
      return { basis, rateBps: p.rateBps, amount: applyBps(basis, p.rateBps) };
    }
    case 'TIERED_BY_TARGET': {
      const basis = Math.max(0, p.profit);
      return {
        basis,
        rateBps: p.tierRateBps,
        amount: applyBps(basis, p.tierRateBps),
      };
    }
    case 'FIXED_PER_ORDER':
      return { basis: 0, rateBps: 0, amount: p.fixedAmount };
  }
}
