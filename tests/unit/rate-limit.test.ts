import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  checkLoginRateLimit,
  recordLoginAttempt,
  MAX_FAILURES_PER_USERNAME,
  MAX_FAILURES_PER_IP,
} from '@/lib/auth/rateLimit';
import { prisma } from '@/lib/db';
import { DomainError } from '@/lib/domain/money';

vi.mock('@/lib/db', () => ({
  prisma: {
    loginAttempt: {
      count: vi.fn(),
      create: vi.fn(),
    },
  },
}));

describe('Login Rate Limiting (T1.1 & Seksi 16.1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lolos pemeriksaan bila jumlah kegagalan di bawah batas ambang', async () => {
    vi.mocked(prisma.loginAttempt.count)
      .mockResolvedValueOnce(4) // 4 kegagalan user (< 5)
      .mockResolvedValueOnce(19); // 19 kegagalan IP (< 20)

    await expect(
      checkLoginRateLimit('admin', '192.168.1.1')
    ).resolves.not.toThrow();
  });

  it('melempar 429 RATE_LIMITED bila gagal 5 kali dalam 15 menit untuk username yang sama', async () => {
    vi.mocked(prisma.loginAttempt.count)
      .mockResolvedValueOnce(5) // 5 kegagalan user
      .mockResolvedValueOnce(2); // 2 kegagalan IP

    await expect(checkLoginRateLimit('admin', '192.168.1.1')).rejects.toThrow(
      DomainError
    );

    try {
      await checkLoginRateLimit('admin', '192.168.1.1');
    } catch (e) {
      expect((e as DomainError).code).toBe('RATE_LIMITED');
      expect((e as DomainError).status).toBe(429);
      expect((e as DomainError).message).toContain(
        'Terlalu banyak percobaan login'
      );
    }
  });

  it('melempar 429 RATE_LIMITED bila gagal 20 kali dalam 15 menit dari IP yang sama', async () => {
    vi.mocked(prisma.loginAttempt.count)
      .mockResolvedValueOnce(1) // 1 kegagalan user
      .mockResolvedValueOnce(20); // 20 kegagalan IP

    await expect(
      checkLoginRateLimit('budi', '203.0.113.195')
    ).rejects.toThrow(DomainError);

    try {
      await checkLoginRateLimit('budi', '203.0.113.195');
    } catch (e) {
      expect((e as DomainError).code).toBe('RATE_LIMITED');
      expect((e as DomainError).status).toBe(429);
    }
  });

  it('mencatat riwayat percobaan login dengan username huruf kecil', async () => {
    await recordLoginAttempt('SuperAdmin', '10.0.0.1', false);

    expect(prisma.loginAttempt.create).toHaveBeenCalledWith({
      data: {
        username: 'superadmin',
        ip: '10.0.0.1',
        success: false,
      },
    });
  });

  it('konstanta batas percobaan sesuai dokumen spesifikasi 16.1', () => {
    expect(MAX_FAILURES_PER_USERNAME).toBe(5);
    expect(MAX_FAILURES_PER_IP).toBe(20);
  });
});
