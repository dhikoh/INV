import { describe, it, expect } from 'vitest';
import { parseRupiahInput, parsePercentToBps } from '@/lib/format/parse';

describe('Komponen UI Input: MoneyInput & PercentInput (T1.6 & Seksi 20.4)', () => {
  describe('MoneyInput logic', () => {
    it('mengetik dan menempel "Rp 1.250.000" menghasilkan 1250000 bilangan bulat', () => {
      expect(parseRupiahInput('Rp 1.250.000')).toBe(1250000);
      expect(parseRupiahInput('Rp 50.000')).toBe(50000);
      expect(parseRupiahInput('Rp 0')).toBe(0);
    });

    it('hanya mengambil digit angka dan mengabaikan karakter lain', () => {
      expect(parseRupiahInput('Rp 10.500,-')).toBe(10500);
      expect(parseRupiahInput('  450000  ')).toBe(450000);
      expect(parseRupiahInput('abc')).toBeNull();
      expect(parseRupiahInput('')).toBeNull();
    });

    it('memvalidasi aturan bisnis: minPrice tidak boleh melebihi basePrice', () => {
      const validatePrices = (basePrice: number, minPrice: number) => {
        return minPrice <= basePrice;
      };

      expect(validatePrices(100000, 80000)).toBe(true);
      expect(validatePrices(100000, 100000)).toBe(true);
      expect(validatePrices(100000, 100001)).toBe(false);
      expect(validatePrices(50000, 60000)).toBe(false);
    });

    it('mendeteksi perubahan harga dan mewajibkan priceReason minimal 3 karakter', () => {
      const checkPriceReasonRequired = (
        initial: { costPrice: number; basePrice: number; minPrice: number },
        current: { costPrice: number; basePrice: number; minPrice: number },
        reason: string | null | undefined
      ) => {
        const isChanged =
          initial.costPrice !== current.costPrice ||
          initial.basePrice !== current.basePrice ||
          initial.minPrice !== current.minPrice;

        if (!isChanged) return true; // Tidak ada perubahan, tidak butuh reason
        return Boolean(reason && reason.trim().length >= 3);
      };

      const initial = { costPrice: 20000, basePrice: 35000, minPrice: 30000 };

      // Tidak ada perubahan harga
      expect(checkPriceReasonRequired(initial, { ...initial }, '')).toBe(true);

      // Harga dasar naik, reason kosong -> INVALID
      expect(
        checkPriceReasonRequired(initial, { ...initial, basePrice: 40000 }, '')
      ).toBe(false);

      // Reason kurang dari 3 karakter -> INVALID
      expect(
        checkPriceReasonRequired(initial, { ...initial, basePrice: 40000 }, 'ok')
      ).toBe(false);

      // Reason valid -> VALID
      expect(
        checkPriceReasonRequired(
          initial,
          { ...initial, basePrice: 40000 },
          'Penyesuaian kenaikan bahan baku'
        )
      ).toBe(true);
    });
  });

  describe('PercentInput logic', () => {
    it('menerima "3,5" dan memberi 350 (bps) dengan maksimal 2 desimal', () => {
      expect(parsePercentToBps('3,5')).toBe(350);
      expect(parsePercentToBps('3.5')).toBe(350);
      expect(parsePercentToBps('11')).toBe(1100);
      expect(parsePercentToBps('0.5')).toBe(50);
      expect(parsePercentToBps('0,75')).toBe(75);
    });

    it('menolak input persentase yang tidak valid atau melebihi 100%', () => {
      expect(parsePercentToBps('100.01')).toBeNull();
      expect(parsePercentToBps('-1')).toBeNull();
      expect(parsePercentToBps('abc')).toBeNull();
    });
  });
});
