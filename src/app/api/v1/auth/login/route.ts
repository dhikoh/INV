import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { DomainError } from '@/lib/domain/money';
import { assertSameOrigin } from '@/lib/auth/origin';
import { verifyPassword, verifyDummyPassword } from '@/lib/auth/password';
import { createSession, setSessionCookie } from '@/lib/auth/session';
import { checkLoginRateLimit, recordLoginAttempt } from '@/lib/auth/rateLimit';
import { toErrorResponse } from '@/lib/api/withApi';

const LoginSchema = z
  .object({
    username: z.string().min(1, 'Username wajib diisi'),
    password: z.string().min(1, 'Password wajib diisi'),
  })
  .strict();

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    assertSameOrigin(req);

    const json = await req.json().catch(() => {
      throw new DomainError('BAD_REQUEST', 'JSON tidak valid', 400);
    });

    const body = LoginSchema.parse(json);
    const ip =
      req.headers.get('x-forwarded-for')?.split(',')[0].trim() || '127.0.0.1';

    // Periksa pembatasan percobaan login (rate limiting)
    await checkLoginRateLimit(body.username, ip);

    // Cari user berdasarkan username (case-insensitive)
    const user = await prisma.user.findFirst({
      where: {
        username: body.username.trim().toLowerCase(),
        deletedAt: null,
      },
    });

    // Bila username tidak ditemukan atau user nonaktif:
    // Tetap jalankan verifikasi terhadap hash palsu agar waktu respons sama (timing attack mitigation)
    if (!user || !user.isActive) {
      await verifyDummyPassword();
      await recordLoginAttempt(body.username, ip, false);
      throw new DomainError(
        'UNAUTHENTICATED',
        'Username atau password salah',
        401
      );
    }

    // Verifikasi password asli dengan argon2id
    const valid = await verifyPassword(body.password, user.passwordHash);
    if (!valid) {
      await recordLoginAttempt(body.username, ip, false);
      throw new DomainError(
        'UNAUTHENTICATED',
        'Username atau password salah',
        401
      );
    }

    // Login berhasil: catat percobaan sukses & perbarui lastLoginAt
    await recordLoginAttempt(body.username, ip, true);
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    // Buat sesi baru (otomatis membatasi maksimal 5 sesi aktif)
    const { token, session } = await createSession(user.id, {
      ip,
      userAgent: req.headers.get('user-agent'),
      activeBusinessId: user.businessId,
    });

    const res = NextResponse.json(
      {
        ok: true,
        data: {
          user: {
            id: user.id,
            username: user.username,
            name: user.name,
            role: user.role,
            businessId: user.businessId,
            mustChangePassword: user.mustChangePassword,
          },
          activeBusinessId: session.activeBusinessId,
        },
      },
      { status: 200 }
    );

    // Set cookie sesi aman
    setSessionCookie(res, token);

    return res;
  } catch (err) {
    return toErrorResponse(err);
  }
}
