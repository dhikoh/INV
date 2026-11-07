import { describe, it, expect } from 'vitest';
import { assertNoSecretKeys, FORBIDDEN_KEYS } from '../helpers/leak';

describe('Test Infrastructure: leak.ts (T0.5, 17.4)', () => {
  it('mendeteksi kebocoran kunci rahasia di level teratas', () => {
    const leaked = {
      id: 'prod_1',
      name: 'Produk',
      costPrice: 50000,
    };
    expect(() => assertNoSecretKeys(leaked)).toThrowError(
      /Kunci rahasia costPrice bocor/
    );
  });

  it('mendeteksi kebocoran kunci rahasia di dalam array bersarang', () => {
    const payload = {
      orderId: 'ord_1',
      items: [
        { sku: 'SKU-1', unitPrice: 100000 },
        { sku: 'SKU-2', unitPrice: 50000, margin: 15000 },
      ],
    };
    expect(() => assertNoSecretKeys(payload)).toThrowError(
      /Kunci rahasia margin bocor/
    );
  });

  it('mendeteksi kebocoran HPP/profit/komisi di kedalaman berapapun', () => {
    for (const key of [
      'hpp',
      'profit',
      'commission',
      'ownerNote',
      'actualCost',
    ]) {
      const obj = { nested: { deep: { [key]: 12345 } } };
      expect(() => assertNoSecretKeys(obj)).toThrowError(
        new RegExp(`Kunci rahasia ${key} bocor`)
      );
    }
  });

  it('lolos untuk DTO yang bersih dari data rahasia', () => {
    const safeDto = {
      id: 'ord_1',
      orderNo: 'TRB/INV/05/11/2026/0001',
      customer: {
        code: 'TEROBOS',
        name: 'Toko Terobos',
      },
      items: [
        {
          sku: 'SKU-1',
          name: 'Barang A',
          qty: 10,
          unitPrice: 100000,
          lineNet: 950000,
        },
      ],
      grandTotal: 1000000,
    };
    expect(() => assertNoSecretKeys(safeDto)).not.toThrow();
  });
});
