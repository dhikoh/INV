import { describe, it, expect } from 'vitest';
import { GET } from '@/app/api/health/route';

describe('Health Check Endpoint (T0.2)', () => {
  it('mengembalikan status ok, db, dan version', async () => {
    const res = await GET();
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body).toEqual({
      ok: true,
      db: true,
      version: '0.1.0',
    });
  });
});
