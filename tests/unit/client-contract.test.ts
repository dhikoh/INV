import { describe, it, expect } from 'vitest';
import { unwrapList } from '@/lib/api/client';

describe('Client Contract Helper (unwrapList)', () => {
  it('berhasil membaca response dengan format { data: [...] }', () => {
    const apiResponse = {
      ok: true,
      data: [
        { id: 'prod_1', name: 'Pasir Zeolite' },
        { id: 'prod_2', name: 'Pasir Gumpal' },
      ],
      meta: { total: 2 },
    };

    const items = unwrapList<{ id: string; name: string }>(apiResponse);
    expect(items).toHaveLength(2);
    expect(items[0].name).toBe('Pasir Zeolite');
  });

  it('berhasil membaca response dengan format { data: { items: [...] } }', () => {
    const apiResponse = {
      ok: true,
      data: {
        items: [
          { id: 'po_1', poNo: 'PO-001' },
          { id: 'po_2', poNo: 'PO-002' },
        ],
        total: 2,
        page: 1,
      },
    };

    const items = unwrapList<{ id: string; poNo: string }>(apiResponse);
    expect(items).toHaveLength(2);
    expect(items[1].poNo).toBe('PO-002');
  });

  it('mengembalikan array kosong secara aman jika data null, undefined, atau format tidak dikenal', () => {
    expect(unwrapList(null)).toEqual([]);
    expect(unwrapList(undefined)).toEqual([]);
    expect(unwrapList({})).toEqual([]);
    expect(unwrapList({ data: null })).toEqual([]);
    expect(unwrapList({ data: 'string' })).toEqual([]);
  });

  it('berhasil membaca response jika payload adalah array langsung', () => {
    const list = [{ id: '1' }, { id: '2' }];
    expect(unwrapList(list)).toEqual(list);
  });
});
