import { describe, it, expect } from 'vitest';
import { toJsonLine, fromJsonLine } from '@/lib/transfer/serialize';

describe('Unit Transfer: Serialisasi BigInt, Date, & Json (Bagian 10 Butir A)', () => {
  it('merekonstruksi BigInt besar (> 2^53 - 1) secara identik', () => {
    const original = {
      id: 'ord_1',
      grandTotal: 9007199254740993n,
      cogs: 8500000000000001n,
    };

    const line = toJsonLine(original);
    expect(line).toContain('"grandTotal":{"$t":"bigint","v":"9007199254740993"}');

    const parsed = fromJsonLine<typeof original>(line);
    expect(parsed.grandTotal).toBe(9007199254740993n);
    expect(parsed.cogs).toBe(8500000000000001n);
    expect(typeof parsed.grandTotal).toBe('bigint');
  });

  it('merekonstruksi objek Date secara identik ke instance Date asli', () => {
    const now = new Date('2026-11-10T21:00:00.000Z');
    const original = {
      id: 'inv_1',
      issuedAt: now,
      deletedAt: null,
    };

    const line = toJsonLine(original);
    expect(line).toContain('"issuedAt":{"$t":"date","v":"2026-11-10T21:00:00.000Z"}');

    const parsed = fromJsonLine<{ id: string; issuedAt: Date; deletedAt: null }>(line);
    expect(parsed.issuedAt).toBeInstanceOf(Date);
    expect(parsed.issuedAt.toISOString()).toBe('2026-11-10T21:00:00.000Z');
    expect(parsed.deletedAt).toBeNull();
  });

  it('mempertahankan tipe primitif skalar: string, angka, boolean, null, dan array', () => {
    const original = {
      name: 'BentoCat Litter 25L',
      qty: 42,
      price: 150000,
      active: true,
      tags: ['cat', 'litter', 'bentonite'],
      empty: null,
    };

    const line = toJsonLine(original);
    const parsed = fromJsonLine<typeof original>(line);

    expect(parsed).toEqual(original);
    expect(Array.isArray(parsed.tags)).toBe(true);
    expect(parsed.tags).toEqual(['cat', 'litter', 'bentonite']);
  });

  it('mempertahankan struktur Json kompleks (seperti invoice snapshot) apa adanya', () => {
    const original = {
      id: 'inv_snap_01',
      snapshot: {
        theme: 'PROFESIONAL',
        items: [
          { name: 'Pasir 25L', qty: 10, price: 72000 },
          { name: 'Pasir 10L', qty: 5, price: 32000 },
        ],
        meta: {
          taxNote: 'Bebas PPN',
          printedBy: 'admin',
        },
      },
    };

    const line = toJsonLine(original);
    const parsed = fromJsonLine<typeof original>(line);

    expect(parsed).toEqual(original);
  });

  it('tidak mengubah objek JSON biasa yang kebetulan memiliki properti $t tapi bukan format penanda transfer', () => {
    const original = {
      id: 'custom_json_01',
      customField: {
        $t: 'custom_type',
        extra: 'value',
      },
      anotherField: {
        $t: 'another',
        v: 'some_val',
        more: true, // Lebih dari 2 kunci ($t, v), bukan penanda
      },
    };

    const line = toJsonLine(original);
    const parsed = fromJsonLine<typeof original>(line);

    expect(parsed.customField).toEqual(original.customField);
    expect(parsed.anotherField).toEqual(original.anotherField);
  });
});

