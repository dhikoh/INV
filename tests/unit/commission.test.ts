import { describe, it, expect } from 'vitest';
import {
  calcCommission,
  pickTierRate,
  achievementBps,
} from '@/lib/domain/commission';

describe('Domain: commission.ts (7.6, 17.2)', () => {
  it('mode PERCENT_OF_PROFIT', () => {
    const res = calcCommission({
      mode: 'PERCENT_OF_PROFIT',
      rateBps: 1000, // 10%
      fixedAmount: 0,
      profit: 285000,
      revenue: 1190000,
      tierRateBps: 0,
    });
    expect(res.amount).toBe(28500);
  });

  it('profit negatif memberi komisi 0 pada mode persen profit', () => {
    const res = calcCommission({
      mode: 'PERCENT_OF_PROFIT',
      rateBps: 1000,
      fixedAmount: 0,
      profit: -50000,
      revenue: 1190000,
      tierRateBps: 0,
    });
    expect(res.amount).toBe(0);
  });

  it('mode PERCENT_OF_REVENUE', () => {
    const res = calcCommission({
      mode: 'PERCENT_OF_REVENUE',
      rateBps: 200, // 2%
      fixedAmount: 0,
      profit: 285000,
      revenue: 1000000,
      tierRateBps: 0,
    });
    expect(res.amount).toBe(20000);
  });

  it('mode TIERED_BY_TARGET memilih tier tertinggi yang tercapai', () => {
    const tiers = [
      { minAchievementBps: 10000, rateBps: 1000 }, // 100% target -> 10%
      { minAchievementBps: 12000, rateBps: 1200 }, // 120% target -> 12%
    ];
    // Capaian 125%
    const rate = pickTierRate(tiers, 12500);
    expect(rate).toBe(1200);

    const res = calcCommission({
      mode: 'TIERED_BY_TARGET',
      rateBps: 0,
      fixedAmount: 0,
      profit: 200000,
      revenue: 1000000,
      tierRateBps: rate,
    });
    expect(res.amount).toBe(24000);
  });

  it('mode FIXED_PER_ORDER', () => {
    const res = calcCommission({
      mode: 'FIXED_PER_ORDER',
      rateBps: 0,
      fixedAmount: 50000,
      profit: 0,
      revenue: 0,
      tierRateBps: 0,
    });
    expect(res.amount).toBe(50000);
  });

  it('achievementBps menghitung rasio capaian dalam bps, memberi 0 bila target 0', () => {
    expect(achievementBps(10000000, 10000000)).toBe(10000); // 100%
    expect(achievementBps(12000000, 10000000)).toBe(12000); // 120%
    expect(achievementBps(10000000, 0)).toBe(0);
  });
});
