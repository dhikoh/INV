import { describe, it, expect } from 'vitest';
import { validateEnv } from '@/lib/env';

describe('Environment Validation (T0.2)', () => {
  const validMinimalEnv = {
    DATABASE_URL: 'postgresql://app:app@localhost:5432/app',
    APP_URL: 'https://app.contoh.com',
    APP_SECRET: 'super_secret_key_at_least_16_chars_12345',
  };

  it('berhasil memvalidasi konfigurasi minimal yang valid', () => {
    const result = validateEnv(validMinimalEnv);
    expect(result.DATABASE_URL).toBe(validMinimalEnv.DATABASE_URL);
    expect(result.APP_URL).toBe(validMinimalEnv.APP_URL);
    expect(result.APP_SECRET).toBe(validMinimalEnv.APP_SECRET);
    expect(result.SESSION_COOKIE_NAME).toBe('sid');
    expect(result.SESSION_TTL_DAYS).toBe(7);
    expect(result.MAX_UPLOAD_MB).toBe(5);
    expect(result.TZ).toBe('Asia/Jakarta');
    expect(result.LOG_LEVEL).toBe('info');
  });

  it('gagal start bila DATABASE_URL tidak diisi', () => {
    const invalid = { ...validMinimalEnv, DATABASE_URL: '' };
    expect(() => validateEnv(invalid)).toThrowError(/DATABASE_URL wajib diisi/);
  });

  it('gagal start bila APP_URL bukan URL yang valid', () => {
    const invalid = { ...validMinimalEnv, APP_URL: 'not-a-valid-url' };
    expect(() => validateEnv(invalid)).toThrowError(
      /APP_URL harus berupa URL yang valid/
    );
  });

  it('gagal start bila APP_SECRET kurang dari 16 karakter', () => {
    const invalid = { ...validMinimalEnv, APP_SECRET: 'short_key' };
    expect(() => validateEnv(invalid)).toThrowError(
      /APP_SECRET minimal 16 karakter/
    );
  });

  it('mengabaikan (strip) variabel sistem OS asing yang tidak relevan', () => {
    const withForeign = {
      ...validMinimalEnv,
      PATH: '/usr/bin',
      UNKNOWN_SYS_VAR: 'system_val',
    };
    const parsed = validateEnv(withForeign);
    expect(parsed.DATABASE_URL).toBe(validMinimalEnv.DATABASE_URL);
    expect((parsed as Record<string, unknown>).UNKNOWN_SYS_VAR).toBeUndefined();
  });
});
