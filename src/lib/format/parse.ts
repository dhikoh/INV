export function parseRupiahInput(s: string): number | null {
  const digits = s.replace(/[^0-9]/g, '');
  if (digits === '') return null;
  const n = Number(digits);
  return Number.isSafeInteger(n) ? n : null;
}

// "3,5" atau "3.5" menjadi 350 bps. Pembulatan ke bps terdekat. Mengembalikan null bila tidak valid.
export function parsePercentToBps(s: string): number | null {
  const t = s.trim().replace(',', '.');
  if (!/^[0-9]+(\.[0-9]{1,2})?$/.test(t)) return null;
  const bps = Math.round(parseFloat(t) * 100);
  return bps >= 0 && bps <= 10000 ? bps : null;
}
