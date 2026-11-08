import { withApi } from '@/lib/api/withApi';
import { requireBusiness } from '@/lib/auth/context';
import { prisma } from '@/lib/db';
import { Prisma, Role, StockMoveType } from '@prisma/client';

/**
 * GET /api/v1/stock/movements
 * Role: SUPERADMIN ONLY (Sales ditolak 403 FORBIDDEN)
 *
 * Mengambil kronologi riwayat mutasi stok produk.
 *
 * Rujukan: Seksi 7.9 Dokumen Spesifikasi.
 */
export const GET = withApi(
  {
    roles: [Role.SUPERADMIN],
  },
  async ({ ctx, req }) => {
    const businessId = requireBusiness(ctx);
    const url = new URL(req.url);

    const productId = url.searchParams.get('productId');
    const type = url.searchParams.get('type') as StockMoveType | null;
    const from = url.searchParams.get('from');
    const to = url.searchParams.get('to');
    const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1', 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') ?? '20', 10) || 20));
    const skip = (page - 1) * limit;

    const where: Prisma.StockMovementWhereInput = {
      businessId,
    };

    if (productId) {
      where.productId = productId;
    }

    if (type && Object.values(StockMoveType).includes(type)) {
      where.type = type;
    }

    if (from || to) {
      where.createdAt = {};
      if (from) {
        const fromDate = new Date(from);
        if (!isNaN(fromDate.getTime())) {
          where.createdAt.gte = fromDate;
        }
      }
      if (to) {
        const toDate = new Date(to);
        if (!isNaN(toDate.getTime())) {
          where.createdAt.lte = toDate;
        }
      }
    }

    const [total, movements] = await Promise.all([
      prisma.stockMovement.count({ where }),
      prisma.stockMovement.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    // Ambil info produk
    const productIds = [...new Set(movements.map((m) => m.productId))];
    const products = await prisma.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, sku: true, name: true, unit: true },
    });
    const productMap = new Map(products.map((p) => [p.id, p]));

    const items = movements.map((m) => ({
      id: m.id,
      productId: m.productId,
      product: productMap.get(m.productId) || null,
      type: m.type,
      qtyDelta: m.qtyDelta,
      balanceAfter: m.balanceAfter,
      refType: m.refType,
      refId: m.refId,
      note: m.note,
      createdById: m.createdById,
      createdAt: m.createdAt,
    }));

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
