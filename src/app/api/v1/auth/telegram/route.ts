import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withApi, toErrorResponse } from '@/lib/api/withApi';
import { prisma } from '@/lib/db';
import { audit } from '@/lib/audit/audit';
import { DomainError } from '@/lib/domain/money';
import { env } from '@/lib/env';
import { validateInitData } from '@/lib/telegram/initData';
import { createSession, setSessionCookie } from '@/lib/auth/session';
import { checkLoginRateLimit, recordLoginAttempt } from '@/lib/auth/rateLimit';

const TelegramAuthSchema = z
  .object({
    initData: z.string().min(1, 'initData wajib diisi'),
  })
  .strict();

/**
 * POST /api/v1/auth/telegram
 *
 * Otentikasi otomatis Telegram Mini App (Seksi 12.3 & Tabel 19.5 T4.3).
 * Publik (tanpa cookie sesi biasa, dikecualikan dari withApi sesuai Seksi 10 & 17.4 c).
 * Menerima initData, memvalidasi hash HMAC-SHA256 resmi Telegram,
 * mencocokkan telegramChatId ke User aktif, dan menerbitkan sesi cookie.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const json = await req.json().catch(() => {
      throw new DomainError('BAD_REQUEST', 'Format JSON tidak valid', 400);
    });

    const body = TelegramAuthSchema.parse(json);
    const ip =
      req.headers.get('x-forwarded-for')?.split(',')[0].trim() || '127.0.0.1';

    // Pembatasan percobaan login berbasis IP (Seksi 16.1)
    await checkLoginRateLimit(`tg_${ip}`, ip);

    const botToken =
      env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_BOT_TOKEN.trim().length > 0
        ? env.TELEGRAM_BOT_TOKEN
        : '123456789:AAFakeTokenForLocalTesting00000000';

    // Validasi initData resmi Telegram (jangan log data mentah ke console/file)
    const validated = validateInitData(body.initData, botToken);

    // Cari user aktif yang terhubung dengan telegramChatId ini
    const user = await prisma.user.findFirst({
      where: {
        telegramChatId: BigInt(validated.telegramUserId),
        isActive: true,
        deletedAt: null,
      },
    });

    if (!user) {
      await recordLoginAttempt(`tg_${validated.telegramUserId}`, ip, false);
      throw new DomainError(
        'TELEGRAM_NOT_LINKED',
        'Akun Telegram ini belum terhubung. Login dengan username dan password, lalu hubungkan di menu Profil.',
        401
      );
    }

    // Login sukses: perbarui lastLoginAt & catat percobaan sukses
    await recordLoginAttempt(user.username, ip, true);
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    // Buat sesi pengguna
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

    setSessionCookie(res, token);
    return res;
  } catch (err: unknown) {
    return toErrorResponse(err);
  }
}

/**
 * DELETE /api/v1/auth/telegram
 *
 * Memutuskan tautan akun Telegram dari pengguna saat ini.
 */
export const DELETE = withApi(
  {
    roles: ['SUPERADMIN', 'SALES'],
  },
  async ({ ctx }) => {
    const user = await prisma.user.findUnique({
      where: { id: ctx.user.id },
    });

    if (!user) {
      return {
        data: { success: true },
      };
    }

    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: ctx.user.id },
        data: {
          telegramChatId: null,
          telegramLinkedAt: null,
          telegramBlocked: false,
        },
      });

      await audit(tx, ctx, {
        action: 'USER_TELEGRAM_UNLINK',
        entityType: 'User',
        entityId: ctx.user.id,
        businessId: ctx.businessId,
        summary: 'Memutuskan tautan akun Telegram',
        before: {
          telegramChatId: user.telegramChatId,
          telegramLinkedAt: user.telegramLinkedAt,
        },
        after: {
          telegramChatId: null,
          telegramLinkedAt: null,
        },
      });
    });

    return {
      data: { success: true },
    };
  }
);
