import { withApi } from '@/lib/api/withApi';
import { requireBusiness } from '@/lib/auth/context';
import { prisma } from '@/lib/db';
import { DomainError } from '@/lib/domain/money';
import { OrderRevisionCreateSchema } from '@/lib/validation/order';
import { formatOrderRevisionDto, submitOrderRevision } from '@/lib/services/revision';
import { Role } from '@prisma/client';

/**
 * GET /api/v1/orders/:id/revisions
 * Role: SUPERADMIN & SALES (isolasi pesanan milik sendiri)
 */
export const GET = withApi(
  {
    roles: [Role.SUPERADMIN, Role.SALES],
  },
  async ({ ctx, params }) => {
    const businessId = requireBusiness(ctx);
    const { id } = params;

    const order = await prisma.order.findFirst({
      where: { id, businessId, deletedAt: null },
      select: { id: true, salesId: true },
    });

    if (!order) {
      throw new DomainError('ORDER_NOT_FOUND', 'Pesanan tidak ditemukan', 404);
    }

    if (ctx.user.role === Role.SALES && order.salesId !== ctx.user.id) {
      throw new DomainError('ORDER_NOT_FOUND', 'Pesanan tidak ditemukan', 404);
    }

    const rows = await prisma.orderRevision.findMany({
      where: { businessId, orderId: order.id },
      include: { items: { orderBy: { sortOrder: 'asc' } } },
      orderBy: { revisionNo: 'desc' },
    });

    return {
      status: 200,
      data: {
        items: rows.map((r) => formatOrderRevisionDto(r, ctx.user.role)),
      },
    };
  }
);

/**
 * POST /api/v1/orders/:id/revisions
 * Role: SUPERADMIN & SALES (isolasi pesanan milik sendiri)
 * Mengajukan revisi item/qty/harga/ongkir pada pesanan berstatus IN_PROCESS.
 */
export const POST = withApi(
  {
    roles: [Role.SUPERADMIN, Role.SALES],
    body: OrderRevisionCreateSchema,
  },
  async ({ ctx, body, params }) => {
    const { id } = params;

    const revision = await prisma.$transaction(async (tx) => {
      return await submitOrderRevision(tx, ctx, id, {
        ...body,
        shippingCharge: body.shippingCharge ?? 0,
      });
    });

    return {
      status: 201,
      data: revision,
    };
  }
);
