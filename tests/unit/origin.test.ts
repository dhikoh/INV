import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import { assertSameOrigin } from '@/lib/auth/origin';
import { DomainError } from '@/lib/domain/money';

describe('CSRF Same-Origin Guard (T1.1 & Seksi 10.1)', () => {
  const APP_URL = 'http://localhost:3000';

  it('mengizinkan metode aman (GET, HEAD, OPTIONS) tanpa header Origin', () => {
    const getReq = new NextRequest(APP_URL + '/api/v1/auth/me', {
      method: 'GET',
    });
    expect(() => assertSameOrigin(getReq)).not.toThrow();

    const headReq = new NextRequest(APP_URL + '/api/health', {
      method: 'HEAD',
    });
    expect(() => assertSameOrigin(headReq)).not.toThrow();

    const optionsReq = new NextRequest(APP_URL + '/api/v1/orders', {
      method: 'OPTIONS',
    });
    expect(() => assertSameOrigin(optionsReq)).not.toThrow();
  });

  it('mengizinkan metode mutasi (POST, PUT, PATCH, DELETE) dengan header Origin yang cocok', () => {
    const postReq = new NextRequest(APP_URL + '/api/v1/orders', {
      method: 'POST',
      headers: {
        origin: 'http://localhost:3000',
      },
    });
    expect(() => assertSameOrigin(postReq)).not.toThrow();

    const patchReq = new NextRequest(APP_URL + '/api/v1/products/123', {
      method: 'PATCH',
      headers: {
        origin: 'http://localhost:3000',
      },
    });
    expect(() => assertSameOrigin(patchReq)).not.toThrow();
  });

  it('mengizinkan metode mutasi bila header Referer cocok saat Origin absen', () => {
    const deleteReq = new NextRequest(APP_URL + '/api/v1/products/123', {
      method: 'DELETE',
      headers: {
        referer: 'http://localhost:3000/products/123',
      },
    });
    expect(() => assertSameOrigin(deleteReq)).not.toThrow();
  });

  it('menolak metode mutasi bila header Origin/Referer tidak ada sama sekali (403 FORBIDDEN)', () => {
    const postReq = new NextRequest(APP_URL + '/api/v1/orders', {
      method: 'POST',
    });
    expect(() => assertSameOrigin(postReq)).toThrow(DomainError);

    try {
      assertSameOrigin(postReq);
    } catch (e) {
      expect((e as DomainError).code).toBe('FORBIDDEN');
      expect((e as DomainError).status).toBe(403);
    }
  });

  it('menolak metode mutasi bila header Origin berasal dari domain asing (403 FORBIDDEN)', () => {
    const evilOrigins = [
      'https://evil-attacker.com',
      'http://localhost:4000', // Port berbeda
      'http://attacker.com:3000',
    ];

    for (const evil of evilOrigins) {
      const evilReq = new NextRequest(APP_URL + '/api/v1/orders', {
        method: 'POST',
        headers: {
          origin: evil,
        },
      });
      expect(() => assertSameOrigin(evilReq)).toThrow(DomainError);

      try {
        assertSameOrigin(evilReq);
      } catch (e) {
        expect((e as DomainError).code).toBe('FORBIDDEN');
        expect((e as DomainError).status).toBe(403);
      }
    }
  });
});
