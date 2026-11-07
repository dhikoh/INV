import { describe, it, expect } from 'vitest';
import { TENANT_MODELS, GUARDED_OPS } from '@/lib/db';

describe('Prisma Multi-Tenant Extension Guard (T0.3)', () => {
  it('mendaftarkan semua model usaha yang wajib diproteksi businessId', () => {
    expect(TENANT_MODELS.has('Product')).toBe(true);
    expect(TENANT_MODELS.has('Customer')).toBe(true);
    expect(TENANT_MODELS.has('Order')).toBe(true);
    expect(TENANT_MODELS.has('Invoice')).toBe(true);
    expect(TENANT_MODELS.has('StockMovement')).toBe(true);
    expect(TENANT_MODELS.has('Reminder')).toBe(true);
    expect(TENANT_MODELS.size).toBe(29);
  });

  it('mendaftarkan semua operasi pencarian dan mutasi massal yang diawasi', () => {
    expect(GUARDED_OPS.has('findFirst')).toBe(true);
    expect(GUARDED_OPS.has('findMany')).toBe(true);
    expect(GUARDED_OPS.has('count')).toBe(true);
    expect(GUARDED_OPS.has('updateMany')).toBe(true);
    expect(GUARDED_OPS.has('deleteMany')).toBe(true);
  });
});
