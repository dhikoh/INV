import { withApi } from '@/lib/api/withApi';
import { requireBusiness } from '@/lib/auth/context';
import { prisma } from '@/lib/db';
import { Prisma, Role } from '@prisma/client';

/**
 * GET /api/v1/stock
 * Role: SUPERADMIN ONLY (Sales ditolak 403 FORBIDDEN)
 *
 * Mengambil daftar stok produk dengan stockQty, reservedQty, available (stockQty - reservedQty),
 * serta penanda stok minus.
 *
 * Rujukan: Seksi 7.9 & 10.5 Dokumen Spesifikasi.
 */
export const GET = withApi(
  {
    roles: [Role.SUPERADMIN],
  },
  async ({ ctx, req }) => {
    const businessId = requireBusiness(ctx);
    const url = new URL(req.url);

    const q = url.searchParams.get('q');
    const categoryId = url.searchParams.get('categoryId');
    const negativeOnly = url.searchParams.get('negativeOnly') === 'true';
    const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1', 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') ?? '20', 10) || 20));
    const skip = (page - 1) * limit;

    const where: Prisma.ProductWhereInput = {
      businessId,
      deletedAt: null,
    };

    if (q && q.trim()) {
      where.OR = [
        { name: { contains: q.trim(), mode: 'insensitive' } },
        { sku: { contains: q.trim(), mode: 'insensitive' } },
      ];
    }

    if (categoryId) {
      where.categoryId = categoryId;
    }

    const [total, products] = await Promise.all([
      prisma.product.count({ where }),
      prisma.product.findMany({
        where,
        skip,
        take: limit,
        orderBy: { name: 'asc' },
        include: {
          category: { select: { id: true, name: true } },
        },
      }),
    ]);

    let items = products.map((p) => {
      const stockQty = p.stockQty;
      const reservedQty = p.reservedQty;
      const available = stockQty - reservedQty;
      return {
        id: p.id,
        sku: p.sku,
        name: p.name,
        unit: p.unit,
        category: p.category,
        costPrice: Number(p.costPrice),
        basePrice: Number(p.basePrice),
        minPrice: Number(p.minPrice),
        stockQty,
        reservedQty,
        available,
        isNegative: available < 0,
        isActive: p.isActive,
      };
    });

    if (negativeOnly) {
      items = items.filter((i) => i.isNegative);
    }

    return {
      status: 200,
      data: {
        items,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }
);
