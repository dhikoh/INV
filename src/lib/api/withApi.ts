import { NextRequest, NextResponse } from 'next/server';
import { ZodError, ZodType, ZodTypeDef } from 'zod';
import { Prisma, Role } from '@prisma/client';
import { DomainError, isDomainError, fromDb } from '../domain/money';
import { requireContext, Ctx } from '../auth/context';
import { assertSameOrigin } from '../auth/origin';
import { clearSessionCookie } from '../auth/session';
import { checkUserRateLimit, checkUserReadRateLimit } from '../auth/rateLimit';
import { logger } from '../logger';

export type Out = {
  data: unknown;
  status?: number;
  meta?: unknown;
  clearSessionCookie?: boolean;
};

export type Args<B, Q> = {
  ctx: Ctx;
  body: B;
  query: Q;
  params: Record<string, string>;
  req: NextRequest;
};

// BigInt -> number agar JSON aman. Dipanggil untuk SEMUA respons.
export function serialize(v: unknown): unknown {
  if (typeof v === 'bigint') return fromDb(v);
  if (v instanceof Date) return v.toISOString();
  if (Array.isArray(v)) return v.map(serialize);
  if (v && typeof v === 'object') {
    return Object.fromEntries(
      Object.entries(v).map(([k, x]) => [k, serialize(x)])
    );
  }
  return v;
}

export function toErrorResponse(e: unknown): NextResponse {
  if (e instanceof ZodError) {
    const fields = Object.fromEntries(
      e.issues.map((i) => [i.path.join('.'), i.message])
    );
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Data tidak valid',
          fields,
        },
      },
      { status: 422 }
    );
  }

  if (isDomainError(e)) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: e.code,
          message: e.message,
          details: e.details ?? null,
        },
      },
      { status: e.status ?? 422 }
    );
  }

  if (e instanceof Prisma.PrismaClientKnownRequestError) {
    if (e.code === 'P2002') {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: 'DUPLICATE',
            message: 'Data sudah ada',
          },
        },
        { status: 409 }
      );
    }
    if (e.code === 'P2025') {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Data tidak ditemukan',
          },
        },
        { status: 404 }
      );
    }
  }

  logger.error({ err: e }, 'unhandled');
  return NextResponse.json(
    {
      ok: false,
      error: {
        code: 'INTERNAL',
        message: 'Terjadi kesalahan. Coba lagi.',
      },
    },
    { status: 500 }
  );
}

export type ApiHandler = {
  (req: NextRequest): Promise<NextResponse>;
  (
    req: NextRequest,
    route: { params: Promise<Record<string, string>> }
  ): Promise<NextResponse>;
};

export function withApi<B = undefined, Q = undefined>(
  opts: {
    roles: Role[];
    body?: ZodType<B, ZodTypeDef, unknown>;
    query?: ZodType<Q, ZodTypeDef, unknown>;
    allowPasswordChange?: boolean;
    isUpload?: boolean;
  },
  handler: (a: Args<B, Q>) => Promise<Out>
): ApiHandler {
  return async (
    req: NextRequest,
    route: { params: Promise<Record<string, string>> } = {
      params: Promise.resolve({}),
    }
  ) => {
    try {
      assertSameOrigin(req); // Hanya memeriksa metode non-GET
      const ctx = await requireContext(req, opts.roles, {
        allowPasswordChange: opts.allowPasswordChange,
      });

      // Token bucket rate limiting (Seksi 16.1): mutasi/umum 120 req/menit (20 upload), baca GET/HEAD 600 req/menit
      if (
        ctx?.user?.id &&
        (process.env.NODE_ENV !== 'test' ||
          process.env.TEST_RATE_LIMIT === 'true')
      ) {
        const isRead = req.method === 'GET' || req.method === 'HEAD';
        if (isRead && !opts.isUpload) {
          checkUserReadRateLimit(ctx.user.id);
        } else {
          checkUserRateLimit(ctx.user.id, opts.isUpload);
        }
      }

      const params = route?.params ? await route.params : {};

      let body = undefined as B;
      if (opts.body) {
        const text = await req.text().catch(() => '');
        let json = undefined;
        if (text && text.trim().length > 0) {
          try {
            json = JSON.parse(text);
          } catch {
            throw new DomainError('BAD_REQUEST', 'JSON tidak valid', 400);
          }
        }
        body = opts.body.parse(json);
      }

      let query = undefined as Q;
      if (opts.query) {
        query = opts.query.parse(
          Object.fromEntries(req.nextUrl.searchParams.entries())
        );
      }

      const out = await handler({ ctx, body, query, params, req });
      const res = NextResponse.json(
        {
          ok: true,
          data: serialize(out.data),
          ...(out.meta !== undefined ? { meta: out.meta } : {}),
        },
        { status: out.status ?? 200 }
      );

      if (out.clearSessionCookie) {
        clearSessionCookie(res);
      }

      return res;
    } catch (e) {
      return toErrorResponse(e);
    }
  };
}
