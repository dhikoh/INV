import { describe, it, expect } from 'vitest';
import { parseRupiahInput, parsePercentToBps } from '@/lib/format/parse';

describe('Format: parse.ts (11.2, 17.2)', () => {
  it('parseRupiahInput mengabaikan simbol dan mengambil angka bulat aman', () => {
    expect(parseRupiahInput('Rp 1.250.000')).toBe(1250000);
    expect(parseRupiahInput('10000')).toBe(10000);
    expect(parseRupiahInput('')).toBeNull();
    expect(parseRupiahInput('abc')).toBeNull();
  });

  it('parsePercentToBps mengonversi "3,5" atau "3.5" menjadi 350 bps', () => {
    expect(parsePercentToBps('3,5')).toBe(350);
    expect(parsePercentToBps('3.5')).toBe(350);
    expect(parsePercentToBps('10')).toBe(1000);
    expect(parsePercentToBps('100')).toBe(10000);
    expect(parsePercentToBps('100.01')).toBeNull();
    expect(parsePercentToBps('-5')).toBeNull();
  });
});
