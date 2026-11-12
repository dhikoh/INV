const fmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Jakarta',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

export function wibParts(d: Date) {
  const p = Object.fromEntries(
    fmt.formatToParts(d).map((x) => [x.type, x.value])
  );
  return { dd: p.day, mm: p.month, yyyy: p.year };
}

export function formatDocNumber(a: {
  code: string;
  kind: 'INV' | 'PO' | 'CN' | 'SJ' | 'KWT';
  date: Date;
  seq: number;
}): string {
  const { dd, mm, yyyy } = wibParts(a.date);
  return `${a.code}/${a.kind}/${dd}/${mm}/${yyyy}/${String(a.seq).padStart(4, '0')}`;
}

export function invoiceNumber(
  orderNo: string,
  type: 'DP' | 'FINAL',
  version: number
): string {
  const rev = version > 1 ? `-R${version - 1}` : '';
  return `${orderNo}-${type === 'DP' ? 'DP' : 'LNS'}${rev}`;
}

export function orderNumber(
  customerCode: string,
  date: Date,
  seq: number
): string {
  return formatDocNumber({
    code: customerCode,
    kind: 'INV',
    date,
    seq,
  });
}

export function suratJalanNumber(
  customerCode: string,
  date: Date,
  seq: number
): string {
  return formatDocNumber({
    code: customerCode,
    kind: 'SJ',
    date,
    seq,
  });
}

export function creditNoteNumber(
  customerCode: string,
  date: Date,
  seq: number
): string {
  return formatDocNumber({
    code: customerCode,
    kind: 'CN',
    date,
    seq,
  });
}

export function purchaseOrderNumber(
  vendorCode: string,
  date: Date,
  seq: number
): string {
  return formatDocNumber({
    code: vendorCode,
    kind: 'PO',
    date,
    seq,
  });
}

export function receiptNumber(
  customerCode: string,
  date: Date,
  seq: number
): string {
  return formatDocNumber({
    code: customerCode,
    kind: 'KWT',
    date,
    seq,
  });
}
