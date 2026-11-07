import { describe, it, expect } from 'vitest';
import {
  creditForQty,
  creditThisReturn,
  creditNoteTotals,
} from '@/lib/domain/credit';
import { DomainError } from '@/lib/domain/money';

describe('Domain: credit.ts (7.5, 17.2)', () => {
  it('lineNet = 100, qty = 3: creditForQty untuk 1, 2, 3 unit = 33, 67, 100', () => {
    expect(creditForQty(100, 3, 1)).toBe(33);
    expect(creditForQty(100, 3, 2)).toBe(67);
    expect(creditForQty(100, 3, 3)).toBe(100);
  });

  it('tiga retur satu-satu menghasilkan 33 + 34 + 33 = 100 tanpa selisih', () => {
    const r1 = creditThisReturn(100, 3, 0, 1);
    const r2 = creditThisReturn(100, 3, 1, 1);
    const r3 = creditThisReturn(100, 3, 2, 1);
    expect(r1).toBe(33);
    expect(r2).toBe(34);
    expect(r3).toBe(33);
    expect(r1 + r2 + r3).toBe(100);
  });

  it('retur melebihi qty melempar RETURN_QTY_INVALID', () => {
    try {
      creditForQty(100, 3, 4);
      expect.fail('Harusnya melempar RETURN_QTY_INVALID');
    } catch (err) {
      expect(err).toBeInstanceOf(DomainError);
      expect((err as DomainError).code).toBe('RETURN_QTY_INVALID');
    }
  });

  it('creditNoteTotals menghitung PPN dengan benar', () => {
    const res = creditNoteTotals(100000, true, 1100);
    expect(res.amountExPpn).toBe(100000);
    expect(res.ppnAmount).toBe(11000);
    expect(res.total).toBe(111000);
  });
});
