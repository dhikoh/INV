import { describe, it, expect } from 'vitest';
import argon2 from 'argon2';
import {
  hashPassword,
  verifyPassword,
  verifyDummyPassword,
  validatePassword,
  OWASP_ARGON2_OPTIONS,
  DUMMY_HASH,
} from '@/lib/auth/password';
import { DomainError } from '@/lib/domain/money';

describe('Password Security & Hashing (T1.1)', () => {
  it('menggunakan parameter OWASP yang benar untuk argon2id', () => {
    expect(OWASP_ARGON2_OPTIONS.type).toBe(argon2.argon2id);
    expect(OWASP_ARGON2_OPTIONS.memoryCost).toBe(19456); // 19 MiB
    expect(OWASP_ARGON2_OPTIONS.timeCost).toBe(2);
    expect(OWASP_ARGON2_OPTIONS.parallelism).toBe(1);
  });

  it('memvalidasi panjang password antara 10 sampai 128 karakter', () => {
    // Kurang dari 10 karakter
    expect(() => validatePassword('123456789')).toThrowError(DomainError);
    try {
      validatePassword('123456789');
    } catch (e) {
      expect((e as DomainError).code).toBe('VALIDATION_ERROR');
      expect((e as DomainError).status).toBe(422);
    }

    // Lebih dari 128 karakter
    const longPass = 'a'.repeat(129);
    expect(() => validatePassword(longPass)).toThrowError(DomainError);

    // Valid 10 karakter
    expect(() => validatePassword('1234567890')).not.toThrow();

    // Valid 128 karakter
    expect(() => validatePassword('a'.repeat(128))).not.toThrow();
  });

  it('menolak password yang persis sama dengan username (case-insensitive)', () => {
    expect(() => validatePassword('SuperAdmin1', 'superadmin1')).toThrowError(
      DomainError
    );
    try {
      validatePassword('SuperAdmin1', 'superadmin1');
    } catch (e) {
      expect((e as DomainError).code).toBe('VALIDATION_ERROR');
      expect((e as DomainError).status).toBe(422);
      expect((e as DomainError).message).toBe(
        'Password tidak boleh sama dengan username'
      );
    }
  });

  it('berhasil melakukan hash dan verifikasi password valid', async () => {
    const raw = 'PasswordRahasia123!';
    const hash = await hashPassword(raw);

    expect(hash).toContain('$argon2id$');
    expect(hash).toContain('m=19456,t=2,p=1');

    const isValid = await verifyPassword(raw, hash);
    expect(isValid).toBe(true);

    const isInvalid = await verifyPassword('PasswordSalah123!', hash);
    expect(isInvalid).toBe(false);
  });

  it('menjalankan verifikasi dummy hash untuk mencegah timing attack saat user tidak ditemukan', async () => {
    expect(DUMMY_HASH).toContain('$argon2id$');
    const result = await verifyDummyPassword();
    expect(result).toBe(false);
  });
});
