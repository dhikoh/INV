import { daysUntil } from './reminder';

export type AgingBucket =
  | 'CURRENT' // Belum jatuh tempo
  | 'DAYS_1_7' // 1–7 hari terlambat
  | 'DAYS_8_30' // 8–30 hari terlambat
  | 'DAYS_31_60' // 31–60 hari terlambat
  | 'DAYS_OVER_60'; // Lebih dari 60 hari terlambat

export const AGING_BUCKET_LABELS: Record<AgingBucket, string> = {
  CURRENT: 'Belum Jatuh Tempo',
  DAYS_1_7: '1–7 Hari',
  DAYS_8_30: '8–30 Hari',
  DAYS_31_60: '31–60 Hari',
  DAYS_OVER_60: '> 60 Hari',
};

/**
 * Menghitung sisa piutang (balance due) dari invoice: amount - paidAmount.
 */
export function calculateReceivableBalance(item: {
  amount: bigint;
  paidAmount: bigint;
}): bigint {
  const balance = item.amount - item.paidAmount;
  return balance > 0n ? balance : 0n;
}

/**
 * Menghitung jumlah hari keterlambatan piutang berdasarkan kalender WIB.
 * Mengembalikan 0 jika belum jatuh tempo.
 */
export function getDaysOverdue(
  dueDate: Date | string | null,
  now: Date
): number {
  if (!dueDate) return 0;
  const due = typeof dueDate === 'string' ? new Date(dueDate) : dueDate;
  const remaining = daysUntil(due, now);
  return remaining < 0 ? Math.abs(remaining) : 0;
}

/**
 * Mengelompokkan invoice ke dalam salah satu bucket umur piutang (Seksi 13.3).
 * Rujukan: Seksi 13.3 Dokumen Spesifikasi.
 */
export function getAgingBucket(
  dueDate: Date | string | null,
  now: Date
): AgingBucket {
  if (!dueDate) return 'CURRENT';
  const due = typeof dueDate === 'string' ? new Date(dueDate) : dueDate;
  const remaining = daysUntil(due, now);

  if (remaining >= 0) {
    return 'CURRENT';
  }

  const daysOverdue = Math.abs(remaining);
  if (daysOverdue <= 7) {
    return 'DAYS_1_7';
  }
  if (daysOverdue <= 30) {
    return 'DAYS_8_30';
  }
  if (daysOverdue <= 60) {
    return 'DAYS_31_60';
  }
  return 'DAYS_OVER_60';
}
