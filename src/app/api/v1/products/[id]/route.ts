import { z } from 'zod';
import { withApi } from '@/lib/api/withApi';
import { prisma } from '@/lib/db';
import { DomainError, fromDb, toDb } from '@/lib/domain/money';
import { audit } from '@/lib/audit/audit';
import { productDetailDto } from '@/lib/dto/product';
import { PriceField } from '@prisma/client';

const ProductUpdateSchema = z
  .object({
    sku: z
      .string()
      .trim()
      .min(2, 'SKU minimal 2 karakter')
      .max(50, 'SKU maksimal 50 karakter')
      .transform((v) => v.toUpperCase())
      .optional(),
    name: z
      .string()
      .trim()
      .min(2, 'Nama produk minimal 2 karakter')
      .max(150)
      .optional(),
    description: z.string().trim().max(2000).optional().nullable(),
    unit: z.string().trim().min(1).max(30).optional(),
    costPrice: z.number().int().min(0).optional(),
    basePrice: z.number().int().min(0).optional(),
    minPrice: z.number().int().min(0).optional(),
    stockQty: z.number().int().optional(),
    minStockAlert: z.number().int().min(0).optional(),
    categoryId: z.string().min(1).optional().nullable(),
    defaultVendorId: z.string().min(1).optional().nullable(),
    isActive: z.boolean().optional(),
    rev: z.number().int('Versi revisi (rev) wajib disertakan'),
    priceReason: z.string().trim().max(500).optional().nullable(),
  })
  .strict();

const ProductDeleteSchema = z
  .object({
    confirm: z.string().trim().min(1, 'Konfirmasi nama produk wajib diisi'),
  })
  .strict();

export const GET = withApi(
  {
    roles: ['SUPERADMIN', 'SALES'],
  },
  async ({ ctx, params }) => {
    const product = await prisma.product.findFirst({
      where: {
        id: params.id,
        businessId: ctx.businessId || undefined,
        deletedAt: null,
      },
      include: {
        category: { select: { id: true, name: true } },
        defaultVendor: { select: { id: true, name: true, code: true } },
        images: {
          orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }],
        },
      },
    });

    if (!product) {
      throw new DomainError('NOT_FOUND', 'Produk tidak ditemukan', 404);
    }

    // Bila Sales, pastikan produk aktif
    if (ctx.role === 'SALES' && !product.isActive) {
      throw new DomainError('NOT_FOUND', 'Produk tidak ditemukan', 404);
    }

    return {
      data: productDetailDto(product, ctx.role),
    };
  }
);

export const PATCH = withApi(
  {
    roles: ['SUPERADMIN'],
    body: ProductUpdateSchema,
  },
  async ({ ctx, params, body }) => {
    const productId = params.id;

    const existing = await prisma.product.findFirst({
      where: {
        id: productId,
        businessId: ctx.businessId || undefined,
        deletedAt: null,
      },
      include: {
        category: { select: { id: true, name: true } },
        defaultVendor: { select: { id: true, name: true, code: true } },
        images: {
          orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }],
        },
      },
    });

    if (!existing) {
      throw new DomainError('NOT_FOUND', 'Produk tidak ditemukan', 404);
    }

    // 1. Penguncian Optimistik: periksa kesesuaian rev
    if (existing.rev !== body.rev) {
      throw new DomainError(
        'OPTIMISTIC_LOCK_ERROR',
        'Data produk telah diubah oleh sesi lain. Silakan muat ulang data terbaru.',
        409
      );
    }

    // 2. Tentukan nilai harga setelah perubahan
    const targetCost =
      body.costPrice !== undefined ? body.costPrice : fromDb(existing.costPrice);
    const targetBase =
      body.basePrice !== undefined ? body.basePrice : fromDb(existing.basePrice);
    const targetMin =
      body.minPrice !== undefined ? body.minPrice : fromDb(existing.minPrice);

    // Validasi aturan: minPrice <= basePrice
    if (targetMin > targetBase) {
      throw new DomainError(
        'VALIDATION_ERROR',
        'Harga minimal tidak boleh melebihi harga dasar',
        422
      );
    }

    // 3. Deteksi perubahan harga
    const costChanged =
      body.costPrice !== undefined && body.costPrice !== fromDb(existing.costPrice);
    const baseChanged =
      body.basePrice !== undefined && body.basePrice !== fromDb(existing.basePrice);
    const minChanged =
      body.minPrice !== undefined && body.minPrice !== fromDb(existing.minPrice);

    if (costChanged || baseChanged || minChanged) {
      if (!body.priceReason || body.priceReason.trim().length < 3) {
        throw new DomainError(
          'VALIDATION_ERROR',
          'Alasan perubahan harga (priceReason) wajib diisi minimal 3 karakter',
          422
        );
      }
    }

    // 4. Periksa SKU duplikat jika SKU diubah
    if (body.sku && body.sku !== existing.sku) {
      const duplicateSku = await prisma.product.findFirst({
        where: {
          businessId: existing.businessId,
          sku: body.sku,
          id: { not: existing.id },
          deletedAt: null,
        },
      });

      if (duplicateSku) {
        throw new DomainError(
          'DUPLICATE',
          `SKU ${body.sku} sudah digunakan oleh produk lain di unit usaha ini`,
          409
        );
      }
    }

    const updated = await prisma.$transaction(async (tx) => {
      // Tulis PriceHistory untuk setiap harga yang berubah
      if (costChanged) {
        await tx.priceHistory.create({
          data: {
            businessId: existing.businessId,
            productId: existing.id,
            field: PriceField.COST,
            oldValue: existing.costPrice,
            newValue: toDb(targetCost),
            reason: body.priceReason!,
            changedById: ctx.user.id,
          },
        });
      }

      if (baseChanged) {
        await tx.priceHistory.create({
          data: {
            businessId: existing.businessId,
            productId: existing.id,
            field: PriceField.BASE,
            oldValue: existing.basePrice,
            newValue: toDb(targetBase),
            reason: body.priceReason!,
            changedById: ctx.user.id,
          },
        });
      }

      if (minChanged) {
        await tx.priceHistory.create({
          data: {
            businessId: existing.businessId,
            productId: existing.id,
            field: PriceField.MIN,
            oldValue: existing.minPrice,
            newValue: toDb(targetMin),
            reason: body.priceReason!,
            changedById: ctx.user.id,
          },
        });
      }

      const result = await tx.product.update({
        where: { id: existing.id },
        data: {
          sku: body.sku,
          name: body.name,
          description: body.description,
          unit: body.unit,
          costPrice: body.costPrice !== undefined ? toDb(body.costPrice) : undefined,
          basePrice: body.basePrice !== undefined ? toDb(body.basePrice) : undefined,
          minPrice: body.minPrice !== undefined ? toDb(body.minPrice) : undefined,
          stockQty: body.stockQty,
          minStockAlert: body.minStockAlert,
          categoryId: body.categoryId,
          defaultVendorId: body.defaultVendorId,
          isActive: body.isActive,
          rev: existing.rev + 1, // Kunci optimistik naik 1
        },
        include: {
          category: { select: { id: true, name: true } },
          defaultVendor: { select: { id: true, name: true, code: true } },
          images: {
            orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }],
          },
        },
      });

      await audit(tx, ctx, {
        action: 'PRODUCT_UPDATE',
        entityType: 'Product',
        entityId: existing.id,
        businessId: existing.businessId,
        summary: `Pembaruan data produk: ${result.sku} - ${result.name}`,
        before: existing,
        after: result,
      });

      return result;
    });

    return {
      data: productDetailDto(updated, ctx.role),
    };
  }
);

export const DELETE = withApi(
  {
    roles: ['SUPERADMIN'],
    body: ProductDeleteSchema,
  },
  async ({ ctx, params, body }) => {
    const productId = params.id;

    const existing = await prisma.product.findFirst({
      where: {
        id: productId,
        businessId: ctx.businessId || undefined,
        deletedAt: null,
      },
    });

    if (!existing) {
      throw new DomainError('NOT_FOUND', 'Produk tidak ditemukan', 404);
    }

    // Konfirmasi penghapusan: nama produk harus persis sama
    if (body.confirm.trim() !== existing.name.trim()) {
      throw new DomainError(
        'VALIDATION_ERROR',
        `Konfirmasi nama produk tidak cocok. Harap ketik "${existing.name}" secara persis.`,
        422
      );
    }

    await prisma.$transaction(async (tx) => {
      await tx.product.update({
        where: { id: existing.id },
        data: {
          deletedAt: new Date(),
          isActive: false,
        },
      });

      await audit(tx, ctx, {
        action: 'PRODUCT_DELETE',
        entityType: 'Product',
        entityId: existing.id,
        businessId: existing.businessId,
        summary: `Penghapusan produk (soft delete): ${existing.sku} - ${existing.name}`,
        before: existing,
      });
    });

    return {
      data: { success: true },
    };
  }
);
