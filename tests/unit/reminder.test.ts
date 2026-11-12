import { describe, it, expect } from 'vitest';
import { suggestInterval, daysUntil } from '@/lib/domain/reminder';

describe('Domain: reminder.ts (13.1, 17.2)', () => {
  it('suggestInterval mengambil median dari 4 selisih terakhir', () => {
    // Tanggal kelipatan 10 hari: 10, 20, 30, 40 -> selisih: 10, 10, 10 -> median 10
    const d1 = new Date('2026-11-01T00:00:00Z');
    const d2 = new Date('2026-11-11T00:00:00Z');
    const d3 = new Date('2026-11-21T00:00:00Z');
    const interval = suggestInterval([d1, d2, d3], 14);
    expect(interval).toBe(10);
  });

  it('suggestInterval menangani jumlah gaps ganjil', () => {
    const d1 = new Date('2026-11-01T00:00:00Z');
    const d2 = new Date('2026-11-10T00:00:00Z');
    const d3 = new Date('2026-11-20T00:00:00Z');
    const d4 = new Date('2026-11-30T00:00:00Z');
    // gaps: 9, 10, 10 (3 gaps -> odd length) -> median 10
    expect(suggestInterval([d1, d2, d3, d4], 14)).toBe(10);
  });

  it('fallbackDays digunakan bila hanya 1 tanggal pengiriman', () => {
    const d1 = new Date('2026-11-01T00:00:00Z');
    expect(suggestInterval([d1], 21)).toBe(21);
  });

  it('daysUntil menghitung selisih hari kalender WIB', () => {
    const now = new Date('2026-11-05T00:00:00Z');
    const due = new Date('2026-11-08T00:00:00Z');
    expect(daysUntil(due, now)).toBe(3);

    const past = new Date('2026-11-02T00:00:00Z');
    expect(daysUntil(past, now)).toBe(-3);
  });
});
