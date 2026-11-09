import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  checkLoginRateLimit,
  recordLoginAttempt,
  checkUserRateLimit,
  resetUserRateLimits,
  MAX_FAILURES_PER_USERNAME,
  MAX_FAILURES_PER_IP,
  GENERAL_RATE_LIMIT_PER_MINUTE,
  UPLOAD_RATE_LIMIT_PER_MINUTE,
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

    await expect(checkLoginRateLimit('budi', '203.0.113.195')).rejects.toThrow(
      DomainError
    );

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

describe('Token Bucket General & Upload Rate Limiting (Seksi 16.1)', () => {
  beforeEach(() => {
    resetUserRateLimits();
  });

  it('konstanta batas per menit sesuai Seksi 16.1: 120 umum dan 20 upload', () => {
    expect(GENERAL_RATE_LIMIT_PER_MINUTE).toBe(120);
    expect(UPLOAD_RATE_LIMIT_PER_MINUTE).toBe(20);
  });

  it('mengizinkan permintaan hingga batas kapasitas umum (120 req/menit)', () => {
    const userId = 'usr_test_general_01';

    // 120 permintaan berturut-turut harus lolos
    for (let i = 0; i < 120; i++) {
      expect(() => checkUserRateLimit(userId, false)).not.toThrow();
    }

    // Permintaan ke-121 harus melempar 429 RATE_LIMITED
    expect(() => checkUserRateLimit(userId, false)).toThrow(DomainError);
    try {
      checkUserRateLimit(userId, false);
    } catch (e) {
      expect((e as DomainError).code).toBe('RATE_LIMITED');
      expect((e as DomainError).status).toBe(429);
      expect((e as DomainError).message).toContain('120 per menit');
    }
  });

  it('mengizinkan permintaan unggah berkas hingga batas kapasitas upload (20 req/menit)', () => {
    const userId = 'usr_test_upload_01';

    // 20 permintaan upload berturut-turut harus lolos
    for (let i = 0; i < 20; i++) {
      expect(() => checkUserRateLimit(userId, true)).not.toThrow();
    }

    // Permintaan upload ke-21 harus melempar 429 RATE_LIMITED
    expect(() => checkUserRateLimit(userId, true)).toThrow(DomainError);
    try {
      checkUserRateLimit(userId, true);
    } catch (e) {
      expect((e as DomainError).code).toBe('RATE_LIMITED');
      expect((e as DomainError).status).toBe(429);
      expect((e as DomainError).message).toContain('20 per menit');
    }
  });

  it('mengisolasi token bucket antar user yang berbeda', () => {
    const userA = 'user_A';
    const userB = 'user_B';

    // Habiskan kuota user A
    for (let i = 0; i < 120; i++) {
      checkUserRateLimit(userA, false);
    }
    expect(() => checkUserRateLimit(userA, false)).toThrow(DomainError);

    // User B tetap memiliki kuota penuh
    expect(() => checkUserRateLimit(userB, false)).not.toThrow();
  });
});
