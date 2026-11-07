import { describe, it, expect } from 'vitest';
import { terbilang } from '@/lib/domain/terbilang';

describe('Domain: terbilang.ts (14.5, 17.2)', () => {
  it('mengonversi angka 0 menjadi nol', () => {
    expect(terbilang(0)).toBe('nol');
  });

  it('mengonversi angka belasan', () => {
    expect(terbilang(11)).toBe('sebelas');
    expect(terbilang(15)).toBe('lima belas');
  });

  it('mengonversi angka puluhan', () => {
    expect(terbilang(20)).toBe('dua puluh');
    expect(terbilang(25)).toBe('dua puluh lima');
  });

  it('mengonversi angka ratusan dan ribuan', () => {
    expect(terbilang(100)).toBe('seratus');
    expect(terbilang(150)).toBe('seratus lima puluh');
    expect(terbilang(500)).toBe('lima ratus');
    expect(terbilang(1000)).toBe('seribu');
    expect(terbilang(1500)).toBe('seribu lima ratus');
    expect(terbilang(250000)).toBe('dua ratus lima puluh ribu');
  });

  it('mengonversi jutaan, miliaran, dan triliunan', () => {
    expect(terbilang(1250000)).toBe('satu juta dua ratus lima puluh ribu');
    expect(terbilang(1320900)).toBe(
      'satu juta tiga ratus dua puluh ribu sembilan ratus'
    );
    expect(terbilang(2_000_000_000)).toBe('dua miliar');
    expect(terbilang(5_000_000_000_000)).toBe('lima triliun');
  });

  it('menolak bilangan negatif atau bukan integer aman', () => {
    expect(() => terbilang(-5)).toThrowError(/bilangan bulat non-negatif/);
    expect(() => terbilang(1.5)).toThrowError(/bilangan bulat non-negatif/);
  });
});
