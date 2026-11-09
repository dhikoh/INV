import { z } from 'zod';
import { withApi } from '@/lib/api/withApi';
import { prisma } from '@/lib/db';
import { DomainError } from '@/lib/domain/money';
import { hashPassword } from '@/lib/auth/password';
import { audit } from '@/lib/audit/audit';
import { Role, CommissionMode, Prisma } from '@prisma/client';

const UserCreateSchema = z
  .object({
    username: z
      .string()
      .trim()
      .min(3, 'Username minimal 3 karakter')
      .max(50, 'Username maksimal 50 karakter')
      .regex(
        /^[a-zA-Z0-9_.-]+$/,
        'Username hanya boleh berisi huruf, angka, titik (.), strip (-), dan garis bawah (_)'
      )
      .transform((v) => v.toLowerCase()),
    password: z
      .string()
      .min(10, 'Password minimal 10 karakter')
      .max(128, 'Password maksimal 128 karakter'),
    name: z.string().trim().min(2, 'Nama lengkap minimal 2 karakter').max(100),
    businessId: z.string().min(1, 'Unit usaha wajib dipilih'),
    role: z.nativeEnum(Role).default(Role.SALES),
    commissionMode: z.nativeEnum(CommissionMode).optional().nullable(),
    commissionRateBps: z
      .number()
      .int()
      .min(0)
      .max(10000)
      .optional()
      .nullable(),
    commissionFixedAmount: z.number().int().min(0).optional().nullable(),
  })
  .strict();

export const GET = withApi(
  {
    roles: ['SUPERADMIN'],
  },
  async ({ req }) => {
    const { searchParams } = new URL(req.url);
    const businessId = searchParams.get('businessId');
    const roleParam = searchParams.get('role');
    const activeParam = searchParams.get('active');
    const q = searchParams.get('q');

    const where: Prisma.UserWhereInput = {
      deletedAt: null,
    };

    if (businessId) {
      where.businessId = businessId;
    }

    if (roleParam && (roleParam === 'SUPERADMIN' || roleParam === 'SALES')) {
      where.role = roleParam;
    }

    if (activeParam !== null) {
      where.isActive = activeParam === 'true';
    }

    if (q) {
      const query = q.trim();
      where.OR = [
        { name: { contains: query, mode: 'insensitive' } },
        { username: { contains: query, mode: 'insensitive' } },
      ];
    }

    const users = await prisma.user.findMany({
      where,
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
      orderBy: {
        name: 'asc',
      },
    });

    return {
      data: users,
    };
  }
);

export const POST = withApi(
  {
    roles: ['SUPERADMIN'],
    body: UserCreateSchema,
  },
  async ({ ctx, body }) => {
    // 1. Verifikasi unit usaha valid
    const business = await prisma.business.findFirst({
      where: {
        id: body.businessId,
        deletedAt: null,
      },
    });

    if (!business) {
      throw new DomainError('NOT_FOUND', 'Unit usaha tidak ditemukan', 404);
    }

    // 2. Verifikasi username unik
    const existing = await prisma.user.findFirst({
      where: {
        username: body.username,
        deletedAt: null,
      },
    });

    if (existing) {
      throw new DomainError('DUPLICATE', 'Username sudah digunakan', 409);
    }

    // 3. Hash password dengan argon2id
    const passwordHash = await hashPassword(body.password, body.username);

    // 4. Buat user dan catat audit log dalam transaksi
    const user = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          username: body.username,
          passwordHash,
          name: body.name,
          role: body.role || Role.SALES,
          businessId: body.businessId,
          isActive: true,
          mustChangePassword: true,
          commissionMode: body.commissionMode ?? null,
          commissionRateBps: body.commissionRateBps ?? null,
          commissionFixedAmount:
            body.commissionFixedAmount !== undefined &&
            body.commissionFixedAmount !== null
              ? BigInt(body.commissionFixedAmount)
              : null,
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
        action: 'USER_CREATE',
        entityType: 'User',
        entityId: created.id,
        businessId: created.businessId,
        summary: `Pembuatan akun sales baru: ${created.username} (${created.name})`,
        after: created,
      });

      return created;
    });

    return {
      data: user,
      status: 201,
    };
  }
);
