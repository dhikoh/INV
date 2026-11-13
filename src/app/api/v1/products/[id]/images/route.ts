import { withApi } from '@/lib/api/withApi';
import { prisma } from '@/lib/db';
import { DomainError } from '@/lib/domain/money';
import { saveFile } from '@/lib/files/fileService';
import { audit } from '@/lib/audit/audit';

export const POST = withApi(
  {
    roles: ['SUPERADMIN'],
  },
  async ({ ctx, params, req }) => {
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

    const formData = await req.formData().catch(() => {
      throw new DomainError('BAD_REQUEST', 'Form data tidak valid', 400);
    });

    // Dukung key 'files' maupun 'images' (baik multiple maupun single)
    const rawFiles = [
      ...formData.getAll('files'),
      ...formData.getAll('images'),
    ];
    const validFiles: (Blob | File)[] = [];

    for (const f of rawFiles) {
      if (typeof f !== 'string' && f && typeof f.arrayBuffer === 'function') {
        validFiles.push(f);
      }
    }

    if (validFiles.length === 0) {
      // Periksa fallback single file ('file' atau 'image')
      const single = formData.get('file') || formData.get('image');
      if (typeof single !== 'string' && single && typeof single.arrayBuffer === 'function') {
        validFiles.push(single);
      }
    }

    if (validFiles.length === 0) {
      throw new DomainError(
        'VALIDATION_ERROR',
        'Minimal 1 file foto produk wajib diunggah',
        422
      );
    }

    // Aturan ketat: Maksimal 8 foto per produk (Seksi 10.3 & T1.5)
    const currentCount = product.images.length;
    if (currentCount + validFiles.length > 8) {
      throw new DomainError(
        'VALIDATION_ERROR',
        `Maksimal 8 foto per produk. Saat ini sudah ada ${currentCount} foto, tidak dapat menambah ${validFiles.length} foto lagi.`,
        422
      );
    }

    const businessId = product.businessId;
    const hasPrimary = product.images.some((img) => img.isPrimary);

    const savedRecords = await prisma.$transaction(async (tx) => {
      const records = [];
      let sortOrderCounter = currentCount;

      for (let i = 0; i < validFiles.length; i++) {
        const file = validFiles[i];
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        const saved = await saveFile({
          businessId,
          kind: 'product',
          buffer,
        });

        const isPrimary = !hasPrimary && i === 0;

        const imgRecord = await tx.productImage.create({
          data: {
            businessId,
            productId: product.id,
            path: saved.relativePath,
            sortOrder: sortOrderCounter++,
            isPrimary,
          },
        });

        records.push(imgRecord);
      }

      await audit(tx, ctx, {
        action: 'PRODUCT_IMAGES_UPLOAD',
        entityType: 'Product',
        entityId: product.id,
        businessId,
        summary: `Unggah ${records.length} foto untuk produk ${product.sku}`,
      });

      return records;
    });

    return {
      data: savedRecords.map((img) => ({
        id: img.id,
        path: img.path,
        sortOrder: img.sortOrder,
        isPrimary: img.isPrimary,
        url: `/api/v1/files/${img.path}`,
      })),
      status: 201,
    };
  }
);
