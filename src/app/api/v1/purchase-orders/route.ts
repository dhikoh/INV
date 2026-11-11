import { withApi } from '@/lib/api/withApi';
import { requireBusiness } from '@/lib/auth/context';
import { prisma } from '@/lib/db';
import { Prisma, Role, PoStatus } from '@prisma/client';
import { PurchaseOrderCreateSchema } from '@/lib/validation/purchase-order';
import { createPurchaseOrder, formatPurchaseOrderDto } from '@/lib/services/purchase-order';

/**
 * GET /api/v1/purchase-orders
 * Role: SUPERADMIN ONLY (Sales ditolak 403 FORBIDDEN)
 *
 * Mengambil daftar Purchase Order dengan filter status, vendor, tanggal, pencarian, dan paginasi.
 *
 * Rujukan: Seksi 7.9 & 8.3 Dokumen Spesifikasi.
 */
export const GET = withApi(
  {
    roles: [Role.SUPERADMIN],
  },
  async ({ ctx, req }) => {
    const businessId = requireBusiness(ctx);
    const url = new URL(req.url);

    const statusParam = url.searchParams.get('status');
    const vendorIdParam = url.searchParams.get('vendorId');
    const fromParam = url.searchParams.get('from');
    const toParam = url.searchParams.get('to');
    const qParam = url.searchParams.get('q');
    const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1', 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') ?? '20', 10) || 20));
    const skip = (page - 1) * limit;

    const where: Prisma.PurchaseOrderWhereInput = {
      businessId,
      deletedAt: null,
    };

    if (statusParam && Object.values(PoStatus).includes(statusParam as PoStatus)) {
      where.status = statusParam as PoStatus;
    }

    if (vendorIdParam) {
      where.vendorId = vendorIdParam;
    }

    if (fromParam || toParam) {
      where.orderDate = {};
      if (fromParam) {
        const fromDate = new Date(fromParam);
        if (!isNaN(fromDate.getTime())) {
          where.orderDate.gte = fromDate;
        }
      }
      if (toParam) {
        const toDate = new Date(toParam);
        if (!isNaN(toDate.getTime())) {
          where.orderDate.lte = toDate;
        }
      }
    }

    if (qParam && qParam.trim()) {
      const q = qParam.trim();
      where.OR = [
        { poNo: { contains: q, mode: 'insensitive' } },
        { vendor: { name: { contains: q, mode: 'insensitive' } } },
        { vendor: { code: { contains: q, mode: 'insensitive' } } },
      ];
    }

    const sortByParam = url.searchParams.get('sortBy') || 'date';
    const sortOrderParam =
      (url.searchParams.get('sortOrder') || url.searchParams.get('sortDir') || 'desc').toLowerCase() === 'asc'
        ? 'asc'
        : 'desc';

    let orderBy: Prisma.PurchaseOrderOrderByWithRelationInput | Prisma.PurchaseOrderOrderByWithRelationInput[] = [
      { orderDate: sortOrderParam },
      { createdAt: sortOrderParam },
    ];

    if (sortByParam === 'date' || sortByParam === 'orderDate') {
      orderBy = [{ orderDate: sortOrderParam }, { createdAt: sortOrderParam }];
    } else if (sortByParam === 'vendor') {
      orderBy = [{ vendor: { name: sortOrderParam } }, { orderDate: 'desc' }];
    } else if (sortByParam === 'total' || sortByParam === 'totalCost') {
      orderBy = [{ total: sortOrderParam }, { orderDate: 'desc' }];
    } else if (sortByParam === 'number' || sortByParam === 'poNo') {
      orderBy = [{ poNo: sortOrderParam }, { orderDate: 'desc' }];
    } else if (sortByParam === 'status') {
      orderBy = [{ status: sortOrderParam }, { orderDate: 'desc' }];
    } else if (sortByParam === 'createdAt') {
      orderBy = { createdAt: sortOrderParam };
    }

    const [total, orders] = await Promise.all([
      prisma.purchaseOrder.count({ where }),
      prisma.purchaseOrder.findMany({
        where,
        skip,
        take: limit,
        orderBy,
        include: {
          vendor: {
            select: { id: true, code: true, name: true, picName: true, phone: true, address: true },
          },
          items: true,
        },
      }),
    ]);

    const allItemProductIds = [...new Set(orders.flatMap((o) => o.items.map((i) => i.productId)))];
    const products =
      allItemProductIds.length > 0
        ? await prisma.product.findMany({
            where: { businessId, id: { in: allItemProductIds } },
            select: { id: true, sku: true, name: true, unit: true },
          })
        : [];
    const prodMap = new Map(products.map((p) => [p.id, p]));

    const items = orders.map((o) => formatPurchaseOrderDto(o, prodMap));

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

/**
 * POST /api/v1/purchase-orders
 * Role: SUPERADMIN ONLY (Sales ditolak 403 FORBIDDEN)
 *
 * Membuat draf Purchase Order baru (status DRAFT).
 *
 * Rujukan: Seksi 7.9 & 8.3 Dokumen Spesifikasi.
 */
export const POST = withApi(
  {
    roles: [Role.SUPERADMIN],
    body: PurchaseOrderCreateSchema,
  },
  async ({ ctx, body }) => {
    const businessId = requireBusiness(ctx);

    const { po, prodMap } = await prisma.$transaction(async (tx) => {
      return createPurchaseOrder(tx, businessId, ctx.user.id, body);
    });

    return {
      status: 201,
      data: formatPurchaseOrderDto(po, prodMap),
    };
  }
);
