import { z } from 'zod';
import { Role, PriceField } from '@prisma/client';
import { withApi } from '@/lib/api/withApi';
import { prisma } from '@/lib/db';
import { DomainError, fromDb, toDb } from '@/lib/domain/money';
import { requireBusiness } from '@/lib/auth/context';
import { audit } from '@/lib/audit/audit';

const SetCustomerMinPriceSchema = z.object({
  productId: z.string().min(1, 'Produk wajib dipilih'),
  minPrice: z
    .number()
    .int('Harga minimal harus bilangan bulat')
    .min(0, 'Harga minimal tidak boleh negatif'),
  reason: z
    .string()
    .trim()
    .min(3, 'Alasan perubahan harga minimal wajib diisi (minimal 3 karakter)'),
  note: z.string().trim().max(500).optional().nullable(),
});

const DeleteCustomerMinPriceSchema = z.object({
  productId: z.string().min(1, 'Produk wajib dipilih'),
  reason: z
    .string()
    .trim()
    .min(3, 'Alasan penghapusan harga minimal wajib diisi (minimal 3 karakter)'),
});

// GET /api/v1/customers/:id/min-prices - Daftar harga minimal khusus pelanggan
export const GET = withApi(
  {
    roles: [Role.SUPERADMIN],
  },
  async ({ ctx, params }) => {
    const businessId = requireBusiness(ctx);

    const customer = await prisma.customer.findFirst({
      where: {
        id: params.id,
        businessId,
        deletedAt: null,
      },
      select: {
        id: true,
        code: true,
        name: true,
      },
    });

    if (!customer) {
      throw new DomainError('NOT_FOUND', 'Pelanggan tidak ditemukan', 404);
    }

    const minPrices = await prisma.customerMinPrice.findMany({
      where: {
        businessId,
        customerId: customer.id,
      },
    });

    const productIds = minPrices.map((m) => m.productId);
    const products =
      productIds.length > 0
        ? await prisma.product.findMany({
            where: { businessId, id: { in: productIds } },
            select: { id: true, sku: true, name: true, basePrice: true, minPrice: true },
          })
        : [];
    const productMap = new Map(products.map((p) => [p.id, p]));

    const data = minPrices.map((mp) => {
      const prod = productMap.get(mp.productId);
      return {
        id: mp.id,
        customerId: mp.customerId,
        productId: mp.productId,
        productSku: prod?.sku || '-',
        productName: prod?.name || '-',
        productBasePrice: prod ? fromDb(prod.basePrice) : 0,
        productDefaultMinPrice: prod ? fromDb(prod.minPrice) : 0,
        customerMinPrice: fromDb(mp.minPrice),
        note: mp.note,
        updatedAt: mp.updatedAt.toISOString(),
      };
    });

    return {
      data,
    };
  }
);

// PUT /api/v1/customers/:id/min-prices - Atur/perbarui harga minimal khusus pelanggan
export const PUT = withApi(
  {
    roles: [Role.SUPERADMIN],
    body: SetCustomerMinPriceSchema,
  },
  async ({ ctx, params, body }) => {
    const businessId = requireBusiness(ctx);

    // 1. Verifikasi pelanggan ada di unit usaha
    const customer = await prisma.customer.findFirst({
      where: {
        id: params.id,
        businessId,
        deletedAt: null,
      },
    });

    if (!customer) {
      throw new DomainError('NOT_FOUND', 'Pelanggan tidak ditemukan', 404);
    }

    // 2. Verifikasi produk ada di unit usaha
    const product = await prisma.product.findFirst({
      where: {
        id: body.productId,
        businessId,
        deletedAt: null,
      },
    });

    if (!product) {
      throw new DomainError('NOT_FOUND', 'Produk tidak ditemukan', 404);
    }

    // 3. Aturan Bisnis 17.3 nomor 12 & 18.1: Harga minimal TIDAK boleh melebihi harga dasar
    const productBasePrice = fromDb(product.basePrice);
    if (body.minPrice > productBasePrice) {
      throw new DomainError(
        'PRICE_INVALID',
        `Harga minimal khusus (${body.minPrice}) tidak boleh melebihi harga jual dasar produk (${productBasePrice})`,
        422
      );
    }

    // 4. Jalankan upsert dan pencatatan PriceHistory dalam transaksi
    const result = await prisma.$transaction(async (tx) => {
      const existing = await tx.customerMinPrice.findFirst({
        where: {
          businessId,
          customerId: customer.id,
          productId: product.id,
        },
      });

      const oldMinPrice = existing ? existing.minPrice : null;
      const newMinPriceBigInt = toDb(body.minPrice);

      let record;
      if (existing) {
        await tx.customerMinPrice.updateMany({
          where: { id: existing.id, businessId },
          data: {
            minPrice: newMinPriceBigInt,
            note: body.note ?? null,
          },
        });
        record = {
          id: existing.id,
          customerId: customer.id,
          productId: product.id,
          minPrice: newMinPriceBigInt,
          note: body.note ?? null,
          updatedAt: new Date(),
        };
      } else {
        record = await tx.customerMinPrice.create({
          data: {
            businessId,
            customerId: customer.id,
            productId: product.id,
            minPrice: newMinPriceBigInt,
            note: body.note ?? null,
          },
        });
      }

      // Tulis ke PriceHistory (WAJIB menulis alasan)
      await tx.priceHistory.create({
        data: {
          businessId,
          productId: product.id,
          customerId: customer.id,
          field: PriceField.CUSTOMER_MIN,
          oldValue: oldMinPrice,
          newValue: newMinPriceBigInt,
          reason: body.reason,
          changedById: ctx.user.id,
        },
      });

      // Tulis Audit Log
      await audit(tx, ctx, {
        action: 'CUSTOMER_MIN_PRICE_SET',
        entityType: 'CustomerMinPrice',
        entityId: record.id,
        businessId,
        summary: `Ubah harga minimal khusus customer ${customer.name} untuk produk ${product.name} menjadi ${body.minPrice} (alasan: ${body.reason})`,
        before: existing ? { minPrice: fromDb(existing.minPrice) } : null,
        after: { minPrice: body.minPrice, note: body.note },
        reason: body.reason,
      });

      return record;
    });

    return {
      data: {
        id: result.id,
        customerId: result.customerId,
        productId: result.productId,
        minPrice: fromDb(result.minPrice),
        note: result.note,
        updatedAt: result.updatedAt.toISOString(),
      },
    };
  }
);

// DELETE /api/v1/customers/:id/min-prices - Hapus/reset harga minimal khusus pelanggan kembali ke harga produk default
export const DELETE = withApi(
  {
    roles: [Role.SUPERADMIN],
    body: DeleteCustomerMinPriceSchema,
  },
  async ({ ctx, params, body }) => {
    const businessId = requireBusiness(ctx);

    const customer = await prisma.customer.findFirst({
      where: {
        id: params.id,
        businessId,
        deletedAt: null,
      },
    });

    if (!customer) {
      throw new DomainError('NOT_FOUND', 'Pelanggan tidak ditemukan', 404);
    }

    const product = await prisma.product.findFirst({
      where: {
        id: body.productId,
        businessId,
        deletedAt: null,
      },
    });

    if (!product) {
      throw new DomainError('NOT_FOUND', 'Produk tidak ditemukan', 404);
    }

    const existing = await prisma.customerMinPrice.findFirst({
      where: {
        businessId,
        customerId: customer.id,
        productId: product.id,
      },
    });

    if (!existing) {
      throw new DomainError(
        'NOT_FOUND',
        'Harga minimal khusus untuk produk ini tidak ditemukan',
        404
      );
    }

    await prisma.$transaction(async (tx) => {
      await tx.customerMinPrice.deleteMany({
        where: { id: existing.id, businessId },
      });

      // Catat ke PriceHistory kembalinya floor ke harga default produk
      await tx.priceHistory.create({
        data: {
          businessId,
          productId: product.id,
          customerId: customer.id,
          field: PriceField.CUSTOMER_MIN,
          oldValue: existing.minPrice,
          newValue: product.minPrice,
          reason: body.reason,
          changedById: ctx.user.id,
        },
      });

      await audit(tx, ctx, {
        action: 'CUSTOMER_MIN_PRICE_RESET',
        entityType: 'CustomerMinPrice',
        entityId: existing.id,
        businessId,
        summary: `Hapus harga minimal khusus customer ${customer.name} untuk produk ${product.name} (kembali ke default: ${fromDb(product.minPrice)}, alasan: ${body.reason})`,
        before: { minPrice: fromDb(existing.minPrice) },
        after: { minPrice: fromDb(product.minPrice) },
        reason: body.reason,
      });
    });

    return {
      data: {
        success: true,
      },
    };
  }
);
