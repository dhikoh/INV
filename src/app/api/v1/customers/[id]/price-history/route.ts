import { Role, PriceField } from '@prisma/client';
import { withApi } from '@/lib/api/withApi';
import { prisma } from '@/lib/db';
import { DomainError, fromDb } from '@/lib/domain/money';
import { requireBusiness } from '@/lib/auth/context';

// GET /api/v1/customers/:id/price-history - Riwayat perubahan harga khusus untuk pelanggan ini
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
    });

    if (!customer) {
      throw new DomainError('NOT_FOUND', 'Pelanggan tidak ditemukan', 404);
    }

    const histories = await prisma.priceHistory.findMany({
      where: {
        businessId,
        customerId: customer.id,
        field: PriceField.CUSTOMER_MIN,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    const productIds = Array.from(new Set(histories.map((h) => h.productId)));
    const products =
      productIds.length > 0
        ? await prisma.product.findMany({
            where: { id: { in: productIds } },
            select: { id: true, sku: true, name: true },
          })
        : [];
    const productMap = new Map(products.map((p) => [p.id, p]));

    const userIds = Array.from(new Set(histories.map((h) => h.changedById)));
    const users =
      userIds.length > 0
        ? await prisma.user.findMany({
            where: { id: { in: userIds } },
            select: { id: true, name: true, username: true },
          })
        : [];
    const userMap = new Map(users.map((u) => [u.id, u]));

    const data = histories.map((h) => {
      const prod = productMap.get(h.productId);
      const user = userMap.get(h.changedById);

      return {
        id: h.id,
        productId: h.productId,
        productSku: prod?.sku || '-',
        productName: prod?.name || '-',
        customerId: h.customerId,
        field: h.field,
        oldValue: h.oldValue !== null ? fromDb(h.oldValue) : null,
        newValue: fromDb(h.newValue),
        reason: h.reason,
        changedBy: user || null,
        createdAt: h.createdAt.toISOString(),
      };
    });

    return {
      data,
    };
  }
);
