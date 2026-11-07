import { z } from 'zod';
import { withApi } from '@/lib/api/withApi';
import { prisma } from '@/lib/db';
import { DomainError } from '@/lib/domain/money';
import { audit } from '@/lib/audit/audit';

const CategoryUpdateSchema = z
  .object({
    name: z.string().trim().min(2, 'Nama kategori minimal 2 karakter').max(100).optional(),
    sortOrder: z.number().int().optional(),
  })
  .strict();

export const GET = withApi(
  {
    roles: ['SUPERADMIN', 'SALES'],
  },
  async ({ ctx, params }) => {
    const category = await prisma.category.findFirst({
      where: {
        id: params.id,
        businessId: ctx.businessId || undefined,
        deletedAt: null,
      },
    });

    if (!category) {
      throw new DomainError('NOT_FOUND', 'Kategori tidak ditemukan', 404);
    }

    return {
      data: category,
    };
  }
);

export const PATCH = withApi(
  {
    roles: ['SUPERADMIN'],
    body: CategoryUpdateSchema,
  },
  async ({ ctx, params, body }) => {
    const existing = await prisma.category.findFirst({
      where: {
        id: params.id,
        businessId: ctx.businessId || undefined,
        deletedAt: null,
      },
    });

    if (!existing) {
      throw new DomainError('NOT_FOUND', 'Kategori tidak ditemukan', 404);
    }

    if (body.name && body.name.toLowerCase() !== existing.name.toLowerCase()) {
      const duplicate = await prisma.category.findFirst({
        where: {
          businessId: existing.businessId,
          name: { equals: body.name, mode: 'insensitive' },
          id: { not: existing.id },
          deletedAt: null,
        },
      });

      if (duplicate) {
        throw new DomainError(
          'DUPLICATE',
          'Nama kategori sudah digunakan di unit usaha ini',
          409
        );
      }
    }

    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.category.update({
        where: { id: existing.id },
        data: {
          name: body.name,
          sortOrder: body.sortOrder,
        },
      });

      await audit(tx, ctx, {
        action: 'CATEGORY_UPDATE',
        entityType: 'Category',
        entityId: existing.id,
        businessId: existing.businessId,
        summary: `Pembaruan kategori: ${result.name}`,
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
    const existing = await prisma.category.findFirst({
      where: {
        id: params.id,
        businessId: ctx.businessId || undefined,
        deletedAt: null,
      },
    });

    if (!existing) {
      throw new DomainError('NOT_FOUND', 'Kategori tidak ditemukan', 404);
    }

    await prisma.$transaction(async (tx) => {
      await tx.category.update({
        where: { id: existing.id },
        data: {
          deletedAt: new Date(),
        },
      });

      await audit(tx, ctx, {
        action: 'CATEGORY_DELETE',
        entityType: 'Category',
        entityId: existing.id,
        businessId: existing.businessId,
        summary: `Penghapusan kategori: ${existing.name}`,
        before: existing,
      });
    });

    return {
      data: { success: true },
    };
  }
);
