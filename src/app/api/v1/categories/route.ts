import { z } from 'zod';
import { withApi } from '@/lib/api/withApi';
import { prisma } from '@/lib/db';
import { DomainError } from '@/lib/domain/money';
import { audit } from '@/lib/audit/audit';

const CategoryCreateSchema = z
  .object({
    name: z.string().trim().min(2, 'Nama kategori minimal 2 karakter').max(100),
    sortOrder: z.number().int().default(0),
  })
  .strict();

export const GET = withApi(
  {
    roles: ['SUPERADMIN', 'SALES'],
  },
  async ({ ctx }) => {
    if (!ctx.businessId) {
      return {
        data: [],
      };
    }

    const categories = await prisma.category.findMany({
      where: {
        businessId: ctx.businessId,
        deletedAt: null,
      },
      include: {
        _count: {
          select: {
            products: {
              where: { deletedAt: null },
            },
          },
        },
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });

    return {
      data: categories,
    };
  }
);

export const POST = withApi(
  {
    roles: ['SUPERADMIN'],
    body: CategoryCreateSchema,
  },
  async ({ ctx, body }) => {
    if (!ctx.businessId) {
      throw new DomainError('BAD_REQUEST', 'Unit usaha aktif belum dipilih', 400);
    }

    const businessId = ctx.businessId;

    const existing = await prisma.category.findFirst({
      where: {
        businessId,
        name: { equals: body.name, mode: 'insensitive' },
        deletedAt: null,
      },
    });

    if (existing) {
      throw new DomainError(
        'DUPLICATE',
        'Kategori dengan nama tersebut sudah ada di unit usaha ini',
        409
      );
    }

    const category = await prisma.$transaction(async (tx) => {
      const created = await tx.category.create({
        data: {
          businessId,
          name: body.name,
          sortOrder: body.sortOrder,
        },
      });

      await audit(tx, ctx, {
        action: 'CATEGORY_CREATE',
        entityType: 'Category',
        entityId: created.id,
        businessId,
        summary: `Pembuatan kategori produk baru: ${created.name}`,
        after: created,
      });

      return created;
    });

    return {
      data: category,
      status: 201,
    };
  }
);
