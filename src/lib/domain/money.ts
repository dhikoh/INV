export type Rupiah = number; // bilangan bulat
export type Bps = number; // 1% = 100

export class DomainError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 422,
    public details?: unknown
  ) {
    super(message);
    this.name = 'DomainError';
    Object.setPrototypeOf(this, DomainError.prototype);
  }
}

export function isDomainError(e: unknown): e is DomainError {
  return (
    e instanceof DomainError ||
    (typeof e === 'object' &&
      e !== null &&
      (('name' in e && (e as Record<string, unknown>).name === 'DomainError') ||
        ('code' in e &&
          'status' in e &&
          typeof (e as Record<string, unknown>).status === 'number' &&
          'message' in e)))
  );
}

export function assertInt(n: number, label = 'nilai'): number {
  if (!Number.isSafeInteger(n)) {
    throw new DomainError(
      'NOT_SAFE_INTEGER',
      `${label} bukan bilangan bulat aman: ${n}`,
      500
    );
  }
  return n;
}

export const fromDb = (v: bigint): Rupiah => assertInt(Number(v), 'fromDb');
export const toDb = (n: Rupiah): bigint => BigInt(assertInt(n, 'toDb'));

// Persen dalam bps, pembulatan setengah ke atas, murni aritmetika bilangan bulat.
export function applyBps(amount: Rupiah, bps: Bps): Rupiah {
  assertInt(amount, 'amount');
  assertInt(bps, 'bps');
  if (amount < 0 || bps < 0) {
    throw new DomainError(
      'NEGATIVE_INPUT',
      'applyBps hanya untuk nilai non-negatif',
      500
    );
  }
  const n = assertInt(amount * bps, 'amount*bps') + 5000;
  return (n - (n % 10000)) / 10000;
}

export function formatRupiah(n: Rupiah): string {
  const val = typeof n === 'number' && !isNaN(n) ? n : 0;
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(val);
}

export function formatPercentFromBps(bps: Bps): string {
  const percent = bps / 100;
  return `${Number(percent.toFixed(2))}%`;
}

