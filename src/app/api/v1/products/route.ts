import { z } from 'zod';
import { withApi } from '@/lib/api/withApi';
import { prisma } from '@/lib/db';
import { DomainError, toDb } from '@/lib/domain/money';
import { audit } from '@/lib/audit/audit';
import { productDto } from '@/lib/dto/product';
import { PriceField, Prisma } from '@prisma/client';

const ProductCreateSchema = z
  .object({
    sku: z
      .string()
      .trim()
      .min(2, 'SKU minimal 2 karakter')
      .max(50, 'SKU maksimal 50 karakter')
      .transform((v) => v.toUpperCase()),
    name: z.string().trim().min(2, 'Nama produk minimal 2 karakter').max(150),
    description: z.string().trim().max(2000).optional().nullable(),
    unit: z.string().trim().min(1, 'Satuan wajib diisi').max(30).default('PCS'),
    costPrice: z.number().int().min(0, 'HPP tidak boleh negatif'),
    basePrice: z.number().int().min(0, 'Harga dasar tidak boleh negatif'),
    minPrice: z.number().int().min(0, 'Harga minimal tidak boleh negatif'),
    stockQty: z.number().int().default(0),
    minStockAlert: z.number().int().min(0).default(0),
    categoryId: z.string().min(1).optional().nullable(),
    defaultVendorId: z.string().min(1).optional().nullable(),
    isActive: z.boolean().default(true),
  })
  .strict();

export const GET = withApi(
  {
    roles: ['SUPERADMIN', 'SALES'],
  },
  async ({ ctx, req }) => {
    if (!ctx.businessId) {
      return {
        data: [],
      };
    }

    const { searchParams } = new URL(req.url);
    const q = searchParams.get('q');
    const categoryId = searchParams.get('categoryId');
    const activeParam = searchParams.get('active');

    const where: Prisma.ProductWhereInput = {
      businessId: ctx.businessId,
      deletedAt: null,
    };

    if (categoryId) {
      where.categoryId = categoryId;
    }

    if (activeParam !== null) {
      where.isActive = activeParam === 'true';
    } else if (ctx.role === 'SALES') {
      // Sales secara default hanya melihat produk aktif
      where.isActive = true;
    }

    if (q) {
      const query = q.trim();
      where.OR = [
        { name: { contains: query, mode: 'insensitive' } },
        { sku: { contains: query, mode: 'insensitive' } },
      ];
    }

    const sortByParam = searchParams.get('sortBy') || 'name';
    const sortOrderParam =
      (searchParams.get('sortOrder') || searchParams.get('sortDir') || 'asc').toLowerCase() === 'desc'
        ? 'desc'
        : 'asc';

    let orderBy: Prisma.ProductOrderByWithRelationInput | Prisma.ProductOrderByWithRelationInput[] = [
      { name: sortOrderParam },
    ];

    if (sortByParam === 'sku') {
      orderBy = [{ sku: sortOrderParam }];
    } else if (sortByParam === 'basePrice' || sortByParam === 'price') {
      orderBy = [{ basePrice: sortOrderParam }];
    } else if (sortByParam === 'stockQty' || sortByParam === 'stock') {
      orderBy = [{ stockQty: sortOrderParam }];
    } else if (sortByParam === 'createdAt') {
      orderBy = [{ createdAt: sortOrderParam }];
    } else {
      orderBy = [{ name: sortOrderParam }];
    }

    const products = await prisma.product.findMany({
      where,
      include: {
        category: {
          select: { id: true, name: true },
        },
        defaultVendor: {
          select: { id: true, name: true, code: true },
        },
        images: {
          orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }],
        },
      },
      orderBy,
    });

    const data = products.map((p) => productDto(p, ctx.role));

    return {
      data,
    };
  }
);

export const POST = withApi(
  {
    roles: ['SUPERADMIN'],
    body: ProductCreateSchema,
  },
  async ({ ctx, body }) => {
    if (!ctx.businessId) {
      throw new DomainError('BAD_REQUEST', 'Unit usaha aktif belum dipilih', 400);
    }

    const businessId = ctx.businessId;

    // 1. Validasi relasi harga: minPrice <= basePrice (Seksi 17.4 & T1.5)
    if (body.minPrice > body.basePrice) {
      throw new DomainError(
        'VALIDATION_ERROR',
        'Harga minimal tidak boleh melebihi harga dasar',
        422
      );
    }

    // 2. Validasi keunikan SKU di unit usaha ini
    const existingSku = await prisma.product.findFirst({
      where: {
        businessId,
        sku: body.sku,
        deletedAt: null,
      },
    });

    if (existingSku) {
      throw new DomainError(
        'DUPLICATE',
        `SKU ${body.sku} sudah digunakan oleh produk lain di unit usaha ini`,
        409
      );
    }

    // 3. Validasi kategori dan vendor jika diisi
    if (body.categoryId) {
      const cat = await prisma.category.findFirst({
        where: { id: body.categoryId, businessId, deletedAt: null },
      });
      if (!cat) {
        throw new DomainError('NOT_FOUND', 'Kategori tidak ditemukan', 404);
      }
    }

    if (body.defaultVendorId) {
      const vendor = await prisma.vendor.findFirst({
        where: { id: body.defaultVendorId, businessId, deletedAt: null },
      });
      if (!vendor) {
        throw new DomainError('NOT_FOUND', 'Vendor tidak ditemukan', 404);
      }
    }

    const product = await prisma.$transaction(async (tx) => {
      const created = await tx.product.create({
        data: {
          businessId,
          sku: body.sku,
          name: body.name,
          description: body.description ?? null,
          unit: body.unit || 'PCS',
          costPrice: toDb(body.costPrice),
          basePrice: toDb(body.basePrice),
          minPrice: toDb(body.minPrice),
          stockQty: body.stockQty,
          reservedQty: 0,
          minStockAlert: body.minStockAlert,
          categoryId: body.categoryId ?? null,
          defaultVendorId: body.defaultVendorId ?? null,
          isActive: body.isActive,
          rev: 0,
        },
        include: {
          category: { select: { id: true, name: true } },
          defaultVendor: { select: { id: true, name: true, code: true } },
          images: true,
        },
      });

      // Tulis riwayat harga awal untuk COST, BASE, dan MIN
      await tx.priceHistory.createMany({
        data: [
          {
            businessId,
            productId: created.id,
            field: PriceField.COST,
            oldValue: null,
            newValue: toDb(body.costPrice),
            reason: 'Harga awal produk',
            changedById: ctx.user.id,
          },
          {
            businessId,
            productId: created.id,
            field: PriceField.BASE,
            oldValue: null,
            newValue: toDb(body.basePrice),
            reason: 'Harga awal produk',
            changedById: ctx.user.id,
          },
          {
            businessId,
            productId: created.id,
            field: PriceField.MIN,
            oldValue: null,
            newValue: toDb(body.minPrice),
            reason: 'Harga awal produk',
            changedById: ctx.user.id,
          },
        ],
      });

      await audit(tx, ctx, {
        action: 'PRODUCT_CREATE',
        entityType: 'Product',
        entityId: created.id,
        businessId,
        summary: `Pembuatan produk baru: ${created.sku} - ${created.name}`,
        after: created,
      });

      return created;
    });

    return {
      data: productDto(product, ctx.role),
      status: 201,
    };
  }
);
