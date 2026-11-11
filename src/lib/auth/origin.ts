import { NextRequest } from 'next/server';
import { DomainError } from '../domain/money';
import { env } from '../env';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export function assertSameOrigin(req: NextRequest): void {
  const method = req.method.toUpperCase();
  if (SAFE_METHODS.has(method)) {
    return;
  }

  const originHeader = req.headers.get('origin') ?? req.headers.get('referer');
  if (!originHeader) {
    throw new DomainError('FORBIDDEN', 'Origin tidak valid', 403);
  }

  try {
    const requestOrigin = new URL(originHeader).origin;
    const appOrigin = new URL(env.APP_URL).origin;

    // 1. Cocok dengan konfigurasi APP_URL
    if (requestOrigin === appOrigin) {
      return;
    }

    // 2. Cocok dengan URL request saat ini (Next.js resolved origin)
    if (req.nextUrl?.origin && requestOrigin === req.nextUrl.origin) {
      return;
    }

    // 3. Cocok dengan reverse proxy header (Host / X-Forwarded-Host)
    const host = req.headers.get('x-forwarded-host') || req.headers.get('host');
    if (host) {
      const proto =
        req.headers.get('x-forwarded-proto') ||
        (req.nextUrl?.protocol ? req.nextUrl.protocol.replace(':', '') : 'http');
      const hostOrigin = `${proto}://${host}`;
      if (requestOrigin === hostOrigin) {
        return;
      }
    }

    throw new DomainError('FORBIDDEN', 'Origin tidak valid', 403);
  } catch {
    throw new DomainError('FORBIDDEN', 'Origin tidak valid', 403);
  }
}
