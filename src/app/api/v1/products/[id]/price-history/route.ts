import { withApi } from '@/lib/api/withApi';
import { prisma } from '@/lib/db';
import { DomainError, fromDb } from '@/lib/domain/money';

export const GET = withApi(
  {
    roles: ['SUPERADMIN'],
  },
  async ({ ctx, params }) => {
    const productId = params.id;

    const product = await prisma.product.findFirst({
      where: {
        id: productId,
        businessId: ctx.businessId || undefined,
        deletedAt: null,
      },
    });

    if (!product) {
      throw new DomainError('NOT_FOUND', 'Produk tidak ditemukan', 404);
    }

    const histories = await prisma.priceHistory.findMany({
      where: {
        productId,
        businessId: product.businessId,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return {
      data: histories.map((h) => ({
        id: h.id,
        productId: h.productId,
        customerId: h.customerId,
        field: h.field,
        oldValue: h.oldValue !== null ? fromDb(h.oldValue) : null,
        newValue: fromDb(h.newValue),
        reason: h.reason,
        changedById: h.changedById,
        createdAt: h.createdAt.toISOString(),
      })),
    };
  }
);
