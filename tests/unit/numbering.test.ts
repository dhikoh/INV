import { describe, it, expect } from 'vitest';
import {
  formatDocNumber,
  invoiceNumber,
  orderNumber,
  suratJalanNumber,
  creditNoteNumber,
  purchaseOrderNumber,
  wibParts,
} from '@/lib/domain/numbering';

describe('Domain: numbering.ts (7.8, 17.2)', () => {
  it('formatDocNumber menghasilkan KODE/JENIS/DD/MM/YYYY/NNNN dengan zona waktu WIB', () => {
    // 2026-11-05 03:00 UTC = 2026-11-05 10:00 WIB
    const d = new Date('2026-11-05T03:00:00Z');
    const docNo = formatDocNumber({
      code: 'TEROBOS',
      kind: 'INV',
      date: d,
      seq: 7,
    });
    expect(docNo).toBe('TEROBOS/INV/05/11/2026/0007');
  });

  it('invoiceNumber menghasilkan akhiran -DP dan -LNS serta versi revisi', () => {
    const orderNo = 'TEROBOS/INV/05/11/2026/0007';
    expect(invoiceNumber(orderNo, 'DP', 1)).toBe(
      'TEROBOS/INV/05/11/2026/0007-DP'
    );
    expect(invoiceNumber(orderNo, 'FINAL', 1)).toBe(
      'TEROBOS/INV/05/11/2026/0007-LNS'
    );
    expect(invoiceNumber(orderNo, 'DP', 2)).toBe(
      'TEROBOS/INV/05/11/2026/0007-DP-R1'
    );
    expect(invoiceNumber(orderNo, 'FINAL', 3)).toBe(
      'TEROBOS/INV/05/11/2026/0007-LNS-R2'
    );
  });

  it('helper khusus jenis dokumen menghasilkan format KODE/JENIS/DD/MM/YYYY/NNNN yang tepat', () => {
    const d = new Date('2026-11-05T03:00:00Z'); // 10:00 WIB
    expect(orderNumber('CUST01', d, 1)).toBe('CUST01/INV/05/11/2026/0001');
    expect(suratJalanNumber('CUST01', d, 1)).toBe('CUST01/SJ/05/11/2026/0001');
    expect(creditNoteNumber('CUST01', d, 1)).toBe('CUST01/CN/05/11/2026/0001');
    expect(purchaseOrderNumber('VEND99', d, 12)).toBe('VEND99/PO/05/11/2026/0012');
  });
});
