import { describe, it, expect } from 'vitest';
import {
  applyBps,
  assertInt,
  fromDb,
  toDb,
  formatRupiah,
  DomainError,
} from '@/lib/domain/money';

describe('Domain: money.ts (7.1, 17.2)', () => {
  it('applyBps(1234567, 350) = 43210 (3.5% pembulatan setengah ke atas)', () => {
    expect(applyBps(1234567, 350)).toBe(43210);
  });

  it('applyBps(1, 5000) = 1 (setengah ke atas)', () => {
    expect(applyBps(1, 5000)).toBe(1);
  });

  it('applyBps(0, 1000) = 0', () => {
    expect(applyBps(0, 1000)).toBe(0);
  });

  it('applyBps(100, 10000) = 100 (100% utuh)', () => {
    expect(applyBps(100, 10000)).toBe(100);
  });

  it('assertInt menolak 1.5, NaN, dan 2**53', () => {
    expect(() => assertInt(1.5)).toThrowError(DomainError);
    expect(() => assertInt(NaN)).toThrowError(DomainError);
    expect(() => assertInt(2 ** 53)).toThrowError(DomainError);
    expect(assertInt(50000)).toBe(50000);
  });

  it('applyBps menolak nilai negatif', () => {
    expect(() => applyBps(-100, 500)).toThrowError(DomainError);
    expect(() => applyBps(100, -500)).toThrowError(DomainError);
  });

  it('fromDb dan toDb mengonversi BigInt <-> number dengan aman', () => {
    expect(toDb(100000)).toBe(100000n);
    expect(fromDb(100000n)).toBe(100000);
  });

  it('formatRupiah memformat mata uang Indonesia tanpa pecahan', () => {
    const formatted = formatRupiah(1500000);
    expect(formatted).toContain('1.500.000');
  });
});
