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

    if (requestOrigin !== appOrigin) {
      throw new DomainError('FORBIDDEN', 'Origin tidak valid', 403);
    }
  } catch {
    throw new DomainError('FORBIDDEN', 'Origin tidak valid', 403);
  }
}
