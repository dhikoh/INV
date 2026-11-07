import { describe, it, expect, vi } from 'vitest';
import { toJsonSafe, audit, AuditClient } from '@/lib/audit/audit';
import { Ctx } from '@/lib/auth/context';
import { Role } from '@prisma/client';

describe('Audit Module & Sanitasi Data (T1.3 & Seksi 16.5)', () => {
  describe('toJsonSafe()', () => {
    it('mengubah BigInt menjadi number', () => {
      expect(toJsonSafe(10000n)).toBe(10000);
      expect(toJsonSafe({ amount: 500000n })).toEqual({ amount: 500000 });
    });

    it('mengubah objek Date menjadi string ISO', () => {
      const date = new Date('2026-11-07T12:00:00.000Z');
      expect(toJsonSafe(date)).toBe('2026-11-07T12:00:00.000Z');
      expect(toJsonSafe({ createdAt: date })).toEqual({
        createdAt: '2026-11-07T12:00:00.000Z',
      });
    });

    it('menghapus kunci sensitif secara rekursif', () => {
      const data = {
        id: 'usr_1',
        username: 'admin',
        passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$abc',
        tokenHash: 'sha256hashvalue',
        secret: 'verysecret',
        nested: {
          token: 'active_token',
          password: 'plain_password',
          safeValue: 12345,
          deep: {
            initData: 'telegram_raw_data',
            good: 'kept',
          },
        },
      };

      const result = toJsonSafe(data) as Record<string, unknown>;
      expect(result).toEqual({
        id: 'usr_1',
        username: 'admin',
        nested: {
          safeValue: 12345,
          deep: {
            good: 'kept',
          },
        },
      });
      expect(result.passwordHash).toBeUndefined();
      expect(result.tokenHash).toBeUndefined();
      expect(result.secret).toBeUndefined();
      expect((result.nested as Record<string, unknown>).token).toBeUndefined();
      expect((result.nested as Record<string, unknown>).password).toBeUndefined();
      expect(
        ((result.nested as Record<string, unknown>).deep as Record<string, unknown>)
          .initData
      ).toBeUndefined();
    });

    it('menangani null, undefined, boolean, number, dan array dengan aman', () => {
      expect(toJsonSafe(null)).toBeNull();
      expect(toJsonSafe(undefined)).toBeUndefined();
      expect(toJsonSafe(true)).toBe(true);
      expect(toJsonSafe(42)).toBe(42);
      expect(
        toJsonSafe([1n, new Date('2026-01-01T00:00:00.000Z'), { password: 'x', val: 99 }])
      ).toEqual([1, '2026-01-01T00:00:00.000Z', { val: 99 }]);
    });
  });

  describe('audit()', () => {
    it('mencatat audit log ke database dengan data yang disanitasi', async () => {
      const createMock = vi.fn().mockResolvedValue({ id: 'audit_1' });
      const txMock: AuditClient = {
        auditLog: {
          create: createMock,
        },
      };

      const ctx: Ctx = {
        user: {
          id: 'usr_admin',
          role: Role.SUPERADMIN,
          name: 'Super Admin',
          businessId: null,
        },
        sessionId: 'sess_1',
        role: Role.SUPERADMIN,
        businessId: 'biz_active',
        ip: '127.0.0.1',
      };

      await audit(txMock, ctx, {
        action: 'BUSINESS_UPDATE',
        entityType: 'Business',
        entityId: 'biz_1',
        summary: 'Update pengaturan usaha',
        before: {
          name: 'Lama',
          passwordHash: 'secret_hash',
          revenue: 1000000n,
        },
        after: {
          name: 'Baru',
          revenue: 2000000n,
        },
        reason: 'Permintaan pemilik usaha',
      });

      expect(createMock).toHaveBeenCalledTimes(1);
      const callArg = createMock.mock.calls[0][0];

      expect(callArg.data).toEqual({
        businessId: 'biz_active',
        actorId: 'usr_admin',
        actorRole: Role.SUPERADMIN,
        action: 'BUSINESS_UPDATE',
        entityType: 'Business',
        entityId: 'biz_1',
        summary: 'Update pengaturan usaha',
        before: {
          name: 'Lama',
          revenue: 1000000,
        },
        after: {
          name: 'Baru',
          revenue: 2000000,
        },
        reason: 'Permintaan pemilik usaha',
        ip: '127.0.0.1',
      });
      // Pastikan passwordHash terhapus
      expect((callArg.data.before as Record<string, unknown>).passwordHash).toBeUndefined();
    });

    it('memakai businessId eksplisit bila disediakan di AuditEvent', async () => {
      const createMock = vi.fn().mockResolvedValue({ id: 'audit_2' });
      const txMock: AuditClient = {
        auditLog: {
          create: createMock,
        },
      };

      const ctx: Ctx = {
        user: {
          id: 'usr_admin',
          role: Role.SUPERADMIN,
          name: 'Super Admin',
          businessId: null,
        },
        sessionId: 'sess_1',
        role: Role.SUPERADMIN,
        businessId: 'biz_fallback',
        ip: '127.0.0.1',
      };

      await audit(txMock, ctx, {
        action: 'BANK_ACCOUNT_CREATE',
        entityType: 'BankAccount',
        entityId: 'bank_1',
        businessId: 'biz_explicit',
      });

      const callArg = createMock.mock.calls[0][0];
      expect(callArg.data.businessId).toBe('biz_explicit');
    });
  });
});
