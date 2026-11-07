import { applyBps, DomainError } from './money';

// Kredit kumulatif untuk r unit dari baris (setengah ke atas, aritmetika bilangan bulat)
export function creditForQty(
  lineNet: number,
  qty: number,
  returnedQty: number
): number {
  if (returnedQty < 0 || returnedQty > qty) {
    throw new DomainError(
      'RETURN_QTY_INVALID',
      'Jumlah retur melebihi jumlah order'
    );
  }
  const d = 2 * qty;
  const n = lineNet * returnedQty * 2 + qty;
  return (n - (n % d)) / d;
}

// Kredit retur saat ini = kumulatif setelah retur - kumulatif sebelum retur
export function creditThisReturn(
  lineNet: number,
  qty: number,
  alreadyReturned: number,
  nowReturning: number
): number {
  return (
    creditForQty(lineNet, qty, alreadyReturned + nowReturning) -
    creditForQty(lineNet, qty, alreadyReturned)
  );
}

export function creditNoteTotals(
  creditExPpn: number,
  ppnEnabled: boolean,
  ppnRateBps: number
) {
  const ppnAmount = ppnEnabled ? applyBps(creditExPpn, ppnRateBps) : 0;
  return {
    amountExPpn: creditExPpn,
    ppnAmount,
    total: creditExPpn + ppnAmount,
  };
}
