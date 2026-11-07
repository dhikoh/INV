export const FORBIDDEN_KEYS = [
  'costPrice',
  'hpp',
  'cost',
  'costSnapshot',
  'margin',
  'profit',
  'profitAmount',
  'commission',
  'commissionAmount',
  'commissionBps',
  'ownerNote',
  'ownerNotes',
  'actualCost',
  'shippingActualCost',
  'extraCost',
  'purchasePrice',
  'unitCost',
  'vendorPrice',
  'supplierPrice',
  'auditLog',
  'before',
  'after',
];

export function assertNoSecretKeys(v: unknown, path = '$'): void {
  if (Array.isArray(v)) {
    v.forEach((x, i) => assertNoSecretKeys(x, `${path}[${i}]`));
    return;
  }
  if (v && typeof v === 'object') {
    for (const [k, x] of Object.entries(v)) {
      if (FORBIDDEN_KEYS.includes(k)) {
        throw new Error(`Kunci rahasia ${k} bocor di ${path}`);
      }
      assertNoSecretKeys(x, `${path}.${k}`);
    }
  }
}
