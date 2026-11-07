import { z } from 'zod';
import { withApi } from '@/lib/api/withApi';
import { prisma } from '@/lib/db';
import { DomainError } from '@/lib/domain/money';
import { verifyPassword, hashPassword } from '@/lib/auth/password';
import { revokeOtherSessions } from '@/lib/auth/session';

const ChangePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Password saat ini wajib diisi'),
    newPassword: z
      .string()
      .min(10, 'Password baru minimal 10 karakter')
      .max(128, 'Password baru maksimal 128 karakter'),
  })
  .strict();

export const POST = withApi(
  {
    roles: ['SUPERADMIN', 'SALES'],
    body: ChangePasswordSchema,
    allowPasswordChange: true,
  },
  async ({ ctx, body }) => {
    const user = await prisma.user.findUnique({
      where: { id: ctx.user.id },
    });

    if (!user) {
      throw new DomainError('UNAUTHENTICATED', 'Sesi tidak valid', 401);
    }

    if (body.newPassword.toLowerCase() === user.username.toLowerCase()) {
      throw new DomainError(
        'VALIDATION_ERROR',
        'Password tidak boleh sama dengan username',
        422
      );
    }

    const isCurrentValid = await verifyPassword(
      body.currentPassword,
      user.passwordHash
    );

    if (!isCurrentValid) {
      throw new DomainError('VALIDATION_ERROR', 'Password saat ini salah', 422);
    }

    const newHash = await hashPassword(body.newPassword, user.username);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: newHash,
        mustChangePassword: false,
      },
    });

    // Ganti password mencabut semua sesi lain milik user
    await revokeOtherSessions(user.id, ctx.sessionId);

    return {
      data: {
        message: 'Password berhasil diubah',
      },
    };
  }
);
