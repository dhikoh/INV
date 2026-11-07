import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { withApi, serialize, toErrorResponse } from '@/lib/api/withApi';
import { DomainError } from '@/lib/domain/money';
import { Role, Prisma } from '@prisma/client';
import * as contextModule from '@/lib/auth/context';

describe('withApi Wrapper & Error Response Mapping (T1.1 & Seksi 10.2)', () => {
  const APP_URL = 'http://localhost:3000';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('melakukan serialisasi BigInt menjadi number dan Date menjadi ISO string', () => {
    const input = {
      price: BigInt(50000),
      count: 10,
      name: 'Item',
      date: new Date('2026-11-05T00:00:00.000Z'),
      nested: {
        total: BigInt(150000),
      },
      list: [BigInt(1000), BigInt(2000)],
    };

    const out = serialize(input) as Record<string, unknown>;
    expect(out.price).toBe(50000);
    expect(typeof out.price).toBe('number');
    expect(out.date).toBe('2026-11-05T00:00:00.000Z');
    expect((out.nested as Record<string, unknown>).total).toBe(150000);
    expect(out.list).toEqual([1000, 2000]);
  });

  it('memetakan ZodError ke HTTP 422 VALIDATION_ERROR dengan daftar fields', () => {
    const schema = z.object({
      name: z.string().min(3, 'Nama minimal 3 huruf'),
      age: z.number().int().positive('Umur harus positif'),
    });

    const parsed = schema.safeParse({ name: 'ab', age: -5 });
    expect(parsed.success).toBe(false);

    if (!parsed.success) {
      const res = toErrorResponse(parsed.error);
      expect(res.status).toBe(422);
    }
  });

  it('memetakan DomainError ke status dan payload yang sesuai', async () => {
    const err = new DomainError('CUSTOM_ERR', 'Pesan kustom', 422, {
      extra: 'detail',
    });
    const res = toErrorResponse(err);
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body).toEqual({
      ok: false,
      error: {
        code: 'CUSTOM_ERR',
        message: 'Pesan kustom',
        details: { extra: 'detail' },
      },
    });
  });

  it('memetakan Prisma P2002 ke 409 DUPLICATE dan P2025 ke 404 NOT_FOUND', async () => {
    const p2002 = new Prisma.PrismaClientKnownRequestError('Duplikat', {
      code: 'P2002',
      clientVersion: '7.10.1',
    });
    const res2002 = toErrorResponse(p2002);
    expect(res2002.status).toBe(409);
    const body2002 = await res2002.json();
    expect(body2002.error.code).toBe('DUPLICATE');

    const p2025 = new Prisma.PrismaClientKnownRequestError('Hilang', {
      code: 'P2025',
      clientVersion: '7.10.1',
    });
    const res2025 = toErrorResponse(p2025);
    expect(res2025.status).toBe(404);
    const body2025 = await res2025.json();
    expect(body2025.error.code).toBe('NOT_FOUND');
  });

  it('memetakan error tak dikenal ke 500 INTERNAL', async () => {
    const res = toErrorResponse(new Error('Unknown crash'));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error.code).toBe('INTERNAL');
    expect(body.error.message).toBe('Terjadi kesalahan. Coba lagi.');
  });

  it('menjalankan handler withApi sukses dengan validasi skema body dan query', async () => {
    vi.spyOn(contextModule, 'requireContext').mockResolvedValueOnce({
      user: { id: 'u1', role: Role.SUPERADMIN, name: 'Boss', businessId: null },
      role: Role.SUPERADMIN,
      businessId: 'biz_1',
      sessionId: 's1',
      ip: '127.0.0.1',
    });

    const BodySchema = z.object({ title: z.string().min(2) }).strict();
    const QuerySchema = z.object({ page: z.coerce.number().default(1) });

    const handler = withApi(
      {
        roles: [Role.SUPERADMIN],
        body: BodySchema,
        query: QuerySchema,
      },
      async ({ body, query, ctx }) => {
        return {
          data: {
            title: body.title,
            page: query.page,
            userId: ctx.user.id,
            totalMoney: BigInt(250000),
          },
          meta: { total: 1 },
          status: 201,
        };
      }
    );

    const req = new NextRequest(APP_URL + '/api/v1/test?page=2', {
      method: 'POST',
      headers: {
        origin: APP_URL,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ title: 'Barang Baru' }),
    });

    const res = await handler(req);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toEqual({
      ok: true,
      data: {
        title: 'Barang Baru',
        page: 2,
        userId: 'u1',
        totalMoney: 250000, // BigInt otomatis ke number
      },
      meta: { total: 1 },
    });
  });
});
