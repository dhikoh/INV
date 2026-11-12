import { z } from 'zod';
import { withApi } from '@/lib/api/withApi';
import { prisma } from '@/lib/db';
import { DomainError } from '@/lib/domain/money';
import { saveFile } from '@/lib/files/fileService';
import { fetchRemoteImage } from '@/lib/files/remoteImage';
import { audit } from '@/lib/audit/audit';

const bodySchema = z.object({
  url: z.string().url('URL gambar produk tidak valid'),
  isPrimary: z.boolean().optional(),
});

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/v1/products/[id]/images/from-url
 *
 * Mengambil foto produk dari URL eksternal HTTPS dengan proteksi SSRF,
 * menyimpannya secara lokal di storage, dan menambahkan entri ProductImage.
 */
export const POST = withApi(
  {
    roles: ['SUPERADMIN'],
    body: bodySchema,
  },
  async ({ ctx, params, body }) => {
    const productId = params.id;

    const product = await prisma.product.findFirst({
      where: {
        id: productId,
        businessId: ctx.businessId || undefined,
        deletedAt: null,
      },
      include: {
        images: true,
      },
    });

    if (!product) {
      throw new DomainError('NOT_FOUND', 'Produk tidak ditemukan', 404);
    }

    const currentCount = product.images.length;
    if (currentCount >= 8) {
      throw new DomainError(
        'VALIDATION_ERROR',
        `Maksimal 8 foto per produk. Saat ini sudah ada ${currentCount} foto.`,
        422
      );
    }

    // Unduh gambar dari URL eksternal secara aman
    const remote = await fetchRemoteImage(body.url);

    // Simpan gambar melalui fileService standar
    const saved = await saveFile({
      businessId: product.businessId,
      kind: 'product',
      buffer: Buffer.from(remote.bytes),
    });

    const hasPrimary = product.images.some((img) => img.isPrimary);
    const isPrimary = body.isPrimary ?? !hasPrimary;

    const createdRecord = await prisma.$transaction(async (tx) => {
      if (isPrimary && hasPrimary) {
        await tx.productImage.updateMany({
          where: { productId: product.id, businessId: product.businessId },
          data: { isPrimary: false },
        });
      }

      const imgRecord = await tx.productImage.create({
        data: {
          businessId: product.businessId,
          productId: product.id,
          path: saved.relativePath,
          sortOrder: currentCount,
          isPrimary,
        },
      });

      await audit(tx, ctx, {
        action: 'PRODUCT_IMAGES_UPLOAD',
        entityType: 'Product',
        entityId: product.id,
        businessId: product.businessId,
        summary: `Unggah foto produk ${product.sku} dari URL eksternal`,
      });

      return imgRecord;
    });

    return {
      data: {
        id: createdRecord.id,
        path: createdRecord.path,
        sortOrder: createdRecord.sortOrder,
        isPrimary: createdRecord.isPrimary,
      },
    };
  }
);

