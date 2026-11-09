import { z } from 'zod';
import { withApi } from '@/lib/api/withApi';
import { prisma } from '@/lib/db';
import { DomainError } from '@/lib/domain/money';
import { audit } from '@/lib/audit/audit';
import { CommissionMode } from '@prisma/client';

const UserUpdateSchema = z
  .object({
    name: z.string().trim().min(2, 'Nama lengkap minimal 2 karakter').max(100).optional(),
    businessId: z.string().min(1, 'Unit usaha tidak valid').optional().nullable(),
    commissionMode: z.nativeEnum(CommissionMode).optional().nullable(),
    commissionRateBps: z.number().int().min(0).max(10000).optional().nullable(),
    commissionFixedAmount: z.number().int().min(0).optional().nullable(),
  })
  .strict();

export const GET = withApi(
  {
    roles: ['SUPERADMIN'],
  },
  async ({ params }) => {
    const user = await prisma.user.findFirst({
      where: {
        id: params.id,
        deletedAt: null,
      },
      select: {
        id: true,
        username: true,
        name: true,
        role: true,
        businessId: true,
        business: {
          select: {
            id: true,
            code: true,
            name: true,
          },
        },
        isActive: true,
        mustChangePassword: true,
        telegramChatId: true,
        telegramLinkedAt: true,
        telegramBlocked: true,
        commissionMode: true,
        commissionRateBps: true,
        commissionFixedAmount: true,
        lastLoginAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      throw new DomainError('NOT_FOUND', 'Pengguna tidak ditemukan', 404);
    }

    return {
      data: user,
    };
  }
);

export const PATCH = withApi(
  {
    roles: ['SUPERADMIN'],
    body: UserUpdateSchema,
  },
  async ({ ctx, params, body }) => {
    const userId = params.id;

    const existing = await prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
    });

    if (!existing) {
      throw new DomainError('NOT_FOUND', 'Pengguna tidak ditemukan', 404);
    }

    if (body.businessId && body.businessId !== existing.businessId) {
      const biz = await prisma.business.findFirst({
        where: { id: body.businessId, deletedAt: null },
      });
      if (!biz) {
        throw new DomainError('NOT_FOUND', 'Unit usaha tidak ditemukan', 404);
      }
    }

    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.user.update({
        where: { id: userId },
        data: {
          name: body.name,
          businessId: body.businessId,
          commissionMode: body.commissionMode,
          commissionRateBps: body.commissionRateBps,
          commissionFixedAmount:
            body.commissionFixedAmount !== undefined
              ? body.commissionFixedAmount === null
                ? null
                : BigInt(body.commissionFixedAmount)
              : undefined,
        },
        select: {
          id: true,
          username: true,
          name: true,
          role: true,
          businessId: true,
          isActive: true,
          mustChangePassword: true,
          telegramChatId: true,
          telegramLinkedAt: true,
          commissionMode: true,
          commissionRateBps: true,
          commissionFixedAmount: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      await audit(tx, ctx, {
        action: 'USER_UPDATE',
        entityType: 'User',
        entityId: userId,
        businessId: result.businessId,
        summary: `Pembaruan data pengguna: ${result.username} (${result.name})`,
        before: existing,
        after: result,
      });

      return result;
    });

    return {
      data: updated,
    };
  }
);

export const DELETE = withApi(
  {
    roles: ['SUPERADMIN'],
  },
  async ({ ctx, params }) => {
    const userId = params.id;

    if (ctx.user.id === userId) {
      throw new DomainError(
        'BAD_REQUEST',
        'Tidak dapat menghapus akun sendiri',
        400
      );
    }

    const existing = await prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
    });

    if (!existing) {
      throw new DomainError('NOT_FOUND', 'Pengguna tidak ditemukan', 404);
    }

    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: {
          deletedAt: new Date(),
          isActive: false,
        },
      });

      // Cabut seluruh sesi aktif pengguna ini
      await tx.session.updateMany({
        where: {
          userId,
          revokedAt: null,
        },
        data: {
          revokedAt: new Date(),
        },
      });

      await audit(tx, ctx, {
        action: 'USER_DELETE',
        entityType: 'User',
        entityId: userId,
        businessId: existing.businessId,
        summary: `Penghapusan akun pengguna: ${existing.username} (${existing.name})`,
        before: existing,
      });
    });

    return {
      data: { success: true },
    };
  }
);
