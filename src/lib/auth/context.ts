import { NextRequest } from 'next/server';
import { Role } from '@prisma/client';
import { DomainError } from '../domain/money';
import { env } from '../env';
import { findValidSession } from './session';

export interface Ctx {
  user: {
    id: string;
    role: Role;
    name: string;
    businessId: string | null;
  };
  role: Role;
  businessId: string | null; // SALES: selalu terisi. SUPERADMIN: usaha aktif di sesi, bisa null
  sessionId: string;
  ip: string | null;
}

export interface RequireContextOptions {
  allowPasswordChange?: boolean;
}

export async function requireContext(
  req: NextRequest,
  roles?: Role[],
  options?: RequireContextOptions
): Promise<Ctx> {
  const token = req.cookies.get(env.SESSION_COOKIE_NAME)?.value;
  if (!token) {
    throw new DomainError('UNAUTHENTICATED', 'Silakan login', 401);
  }

  const s = await findValidSession(token);
  if (!s || !s.user.isActive || s.user.deletedAt) {
    throw new DomainError('UNAUTHENTICATED', 'Sesi tidak valid', 401);
  }

  if (s.user.mustChangePassword && !options?.allowPasswordChange) {
    throw new DomainError(
      'PASSWORD_CHANGE_REQUIRED',
      'Wajib ganti password terlebih dahulu',
      403
    );
  }

  if (roles && roles.length > 0 && !roles.includes(s.user.role)) {
    throw new DomainError('FORBIDDEN', 'Anda tidak punya akses', 403);
  }

  const businessId =
    s.user.role === Role.SALES ? s.user.businessId : s.activeBusinessId;
  if (s.user.role === Role.SALES && !businessId) {
    throw new DomainError(
      'FORBIDDEN',
      'Akun sales belum terhubung ke usaha',
      403
    );
  }

  return {
    user: {
      id: s.user.id,
      role: s.user.role,
      name: s.user.name,
      businessId: s.user.businessId,
    },
    role: s.user.role,
    businessId,
    sessionId: s.id,
    ip: req.headers.get('x-forwarded-for') || null,
  };
}

export function requireBusiness(ctx: Ctx): string {
  if (!ctx.businessId) {
    throw new DomainError(
      'BUSINESS_REQUIRED',
      'Pilih usaha terlebih dulu',
      400
    );
  }
  return ctx.businessId;
}
