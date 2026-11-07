import { applyBps, Rupiah } from './money';

export interface PromoRule {
  id: string;
  label: string;
  source: 'PROMO' | 'SUBSIDY';
  type: 'PERCENT' | 'AMOUNT';
  valueBps: number | null;
  valueAmount: number | null; // potongan per unit
  productId: string | null; // null = semua produk
  validFrom: Date;
  validTo: Date | null;
  isActive: boolean;
}

export function isPromoActive(
  r: PromoRule,
  productId: string,
  at: Date
): boolean {
  if (!r.isActive) return false;
  if (r.productId !== null && r.productId !== productId) return false;
  if (at < r.validFrom) return false;
  if (r.validTo !== null && at > r.validTo) return false;
  return true;
}

export function promoPerUnit(r: PromoRule, basis: Rupiah): Rupiah {
  const v =
    r.type === 'PERCENT'
      ? applyBps(basis, r.valueBps ?? 0)
      : (r.valueAmount ?? 0);
  return Math.min(v, basis);
}

export const baseFloor = (
  productMin: Rupiah,
  customerMin: Rupiah | null
): Rupiah => customerMin ?? productMin;

export function lineFloor(base: Rupiah, promo: PromoRule | null): Rupiah {
  return promo ? Math.max(0, base - promoPerUnit(promo, base)) : base;
}

export const isBelowFloor = (
  lineNet: Rupiah,
  qty: number,
  floorPerUnit: Rupiah
): boolean => lineNet < floorPerUnit * qty;
