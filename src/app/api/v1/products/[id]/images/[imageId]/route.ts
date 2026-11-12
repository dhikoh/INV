import { z } from 'zod';
import { withApi } from '@/lib/api/withApi';
import { prisma } from '@/lib/db';
import { DomainError } from '@/lib/domain/money';
import { audit } from '@/lib/audit/audit';

const ImageUpdateSchema = z
  .object({
    isPrimary: z.boolean().optional(),
    sortOrder: z.number().int().optional(),
  })
  .strict();

export const PATCH = withApi(
  {
    roles: ['SUPERADMIN'],
    body: ImageUpdateSchema,
  },
  async ({ ctx, params, body }) => {
    const { id: productId, imageId } = params;

    const image = await prisma.productImage.findFirst({
      where: {
        id: imageId,
        productId,
        businessId: ctx.businessId || undefined,
      },
    });

    if (!image) {
      throw new DomainError('NOT_FOUND', 'Foto produk tidak ditemukan', 404);
    }

    const updated = await prisma.$transaction(async (tx) => {
      if (body.isPrimary === true) {
        // Lepas status utama dari foto lain pada produk ini
        await tx.productImage.updateMany({
          where: {
            businessId: image.businessId,
            productId,
            id: { not: imageId },
            isPrimary: true,
          },
          data: {
            isPrimary: false,
          },
        });
      }

      const result = await tx.productImage.update({
        where: { id: imageId },
        data: {
          isPrimary: body.isPrimary,
          sortOrder: body.sortOrder,
        },
      });

      await audit(tx, ctx, {
        action: 'PRODUCT_IMAGE_UPDATE',
        entityType: 'ProductImage',
        entityId: imageId,
        businessId: image.businessId,
        summary: `Pembaruan foto produk (${result.isPrimary ? 'Jadikan utama' : 'Urutan'})`,
        before: image,
        after: result,
      });

      return result;
    });

    return {
      data: {
        id: updated.id,
        path: updated.path,
        sortOrder: updated.sortOrder,
        isPrimary: updated.isPrimary,
        url: `/api/v1/files/${updated.path}`,
      },
    };
  }
);

export const DELETE = withApi(
  {
    roles: ['SUPERADMIN'],
  },
  async ({ ctx, params }) => {
    const { id: productId, imageId } = params;

    const image = await prisma.productImage.findFirst({
      where: {
        id: imageId,
        productId,
        businessId: ctx.businessId || undefined,
      },
    });

    if (!image) {
      throw new DomainError('NOT_FOUND', 'Foto produk tidak ditemukan', 404);
    }

    await prisma.$transaction(async (tx) => {
      await tx.productImage.delete({
        where: { id: imageId },
      });

      // Jika foto yang dihapus adalah foto utama, jadikan foto berikutnya yang tersisa sebagai utama
      if (image.isPrimary) {
        const remaining = await tx.productImage.findFirst({
          where: { businessId: image.businessId, productId },
          orderBy: { sortOrder: 'asc' },
        });

        if (remaining) {
          await tx.productImage.update({
            where: { id: remaining.id },
            data: { isPrimary: true },
          });
        }
      }

      await audit(tx, ctx, {
        action: 'PRODUCT_IMAGE_DELETE',
        entityType: 'ProductImage',
        entityId: imageId,
        businessId: image.businessId,
        summary: `Penghapusan foto produk`,
        before: image,
      });
    });

    return {
      data: { success: true },
    };
  }
);
