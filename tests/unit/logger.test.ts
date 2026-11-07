import { describe, it, expect } from 'vitest';
import { REDACTED_KEYS } from '@/lib/logger';

describe('Logger Configuration (T0.2)', () => {
  it('memiliki daftar sensor redaction untuk semua data rahasia', () => {
    expect(REDACTED_KEYS).toContain('req.headers.cookie');
    expect(REDACTED_KEYS).toContain('password');
    expect(REDACTED_KEYS).toContain('passwordHash');
    expect(REDACTED_KEYS).toContain('token');
    expect(REDACTED_KEYS).toContain('tokenHash');
    expect(REDACTED_KEYS).toContain('initData');
    expect(REDACTED_KEYS).toContain('APP_SECRET');
  });
});
