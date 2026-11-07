const DAY_MS = 86_400_000;
const WIB_OFFSET_MS = 7 * 3_600_000;

// Nomor hari WIB (bilangan bulat). Selisih dua nomor = selisih hari kalender WIB.
export const wibDayIndex = (d: Date): number =>
  Math.floor((d.getTime() + WIB_OFFSET_MS) / DAY_MS);

const clamp = (n: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, n));

export function suggestInterval(
  shipDates: Date[],
  fallbackDays: number
): number {
  const days = [...new Set(shipDates.map(wibDayIndex))].sort((a, b) => a - b);
  const gaps: number[] = [];
  for (let i = 1; i < days.length; i++) gaps.push(days[i] - days[i - 1]);
  const recent = gaps.slice(-4);
  if (recent.length === 0) return clamp(fallbackDays, 1, 365);
  const s = [...recent].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  const median =
    s.length % 2 === 1 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
  return clamp(median, 1, 365);
}

// Hari tersisa sampai jatuh tempo (negatif = terlambat), dihitung dengan kalender WIB.
export const daysUntil = (due: Date, now: Date): number =>
  wibDayIndex(due) - wibDayIndex(now);
