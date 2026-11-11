import { withApi } from '@/lib/api/withApi';
import { requireBusiness } from '@/lib/auth/context';
import { prisma } from '@/lib/db';
import { OrderCreateSchema } from '@/lib/validation/order';
import { buildOrderSnapshot, formatOrderDto } from '@/lib/services/order';
import { formatRupiah } from '@/lib/domain/money';
import { OrderStatus, Prisma, Role } from '@prisma/client';

/**
 * GET /api/v1/orders
 * Role: SUPERADMIN & SALES
 *
 * Mengambil daftar order dengan filter status, customer, sales (khusus SA), tanggal, pencarian,
 * dan paginasi. Staf sales hanya melihat order miliknya sendiri (salesId = ctx.user.id).
 *
 * Rujukan: Seksi 10.5 Dokumen Spesifikasi.
 */
export const GET = withApi(
  {
    roles: [Role.SUPERADMIN, Role.SALES],
  },
  async ({ ctx, req }) => {
  const businessId = requireBusiness(ctx);
  const url = new URL(req.url);

  const statusParam = url.searchParams.get('status');
  const customerIdParam = url.searchParams.get('customerId');
  const salesIdParam = url.searchParams.get('salesId');
  const fromParam = url.searchParams.get('from');
  const toParam = url.searchParams.get('to');
  const qParam = url.searchParams.get('q');
  const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1', 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') ?? '20', 10) || 20));
  const skip = (page - 1) * limit;

  const where: Prisma.OrderWhereInput = {
    businessId,
    deletedAt: null,
  };

  // Pembatasan isolasi Sales: hanya order miliknya sendiri
  if (ctx.user.role === 'SALES') {
    where.salesId = ctx.user.id;
  } else if (salesIdParam) {
    where.salesId = salesIdParam;
  }

  if (statusParam && Object.values(OrderStatus).includes(statusParam as OrderStatus)) {
    where.status = statusParam as OrderStatus;
  }

  if (customerIdParam) {
    where.customerId = customerIdParam;
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
      { orderNo: { contains: q, mode: 'insensitive' } },
      { customer: { name: { contains: q, mode: 'insensitive' } } },
      { customer: { code: { contains: q, mode: 'insensitive' } } },
    ];
  }

  const sortByParam = url.searchParams.get('sortBy') || 'date';
  const sortOrderParam =
    (url.searchParams.get('sortOrder') || url.searchParams.get('sortDir') || 'desc').toLowerCase() === 'asc'
      ? 'asc'
      : 'desc';

  let orderBy: Prisma.OrderOrderByWithRelationInput | Prisma.OrderOrderByWithRelationInput[] = [
    { orderDate: sortOrderParam },
    { createdAt: sortOrderParam },
  ];

  if (sortByParam === 'date' || sortByParam === 'orderDate') {
    orderBy = [{ orderDate: sortOrderParam }, { createdAt: sortOrderParam }];
  } else if (sortByParam === 'customer') {
    orderBy = [{ customer: { name: sortOrderParam } }, { orderDate: 'desc' }];
  } else if (sortByParam === 'total' || sortByParam === 'grandTotal') {
    orderBy = [{ grandTotal: sortOrderParam }, { orderDate: 'desc' }];
  } else if (sortByParam === 'number' || sortByParam === 'orderNo') {
    orderBy = [{ orderNo: sortOrderParam }, { orderDate: 'desc' }];
  } else if (sortByParam === 'status') {
    orderBy = [{ status: sortOrderParam }, { orderDate: 'desc' }];
  } else if (sortByParam === 'createdAt') {
    orderBy = { createdAt: sortOrderParam };
  }

  const [total, orders] = await Promise.all([
    prisma.order.count({ where }),
    prisma.order.findMany({
      where,
      skip,
      take: limit,
      orderBy,
      include: {
        customer: {
          select: { id: true, code: true, name: true },
        },
        items: true,
      },
    }),
  ]);

  const items = orders.map((o) => formatOrderDto(o, ctx.user.role));

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
});

/**
 * POST /api/v1/orders
 * Role: SUPERADMIN & SALES
 *
 * Membuat draf pesanan baru (status DRAFT). Respons 201 Created dengan DTO per role.
 *
 * Rujukan: Seksi 10.4 & 10.5 Dokumen Spesifikasi.
 */
export const POST = withApi(
  {
    roles: [Role.SUPERADMIN, Role.SALES],
    body: OrderCreateSchema,
  },
  async ({ ctx, body }) => {
    const businessId = requireBusiness(ctx);

    const order = await prisma.$transaction(async (tx) => {
      const snapshot = await buildOrderSnapshot(tx, ctx, body);

      const salesId =
        ctx.user.role === 'SALES'
          ? ctx.user.id
          : snapshot.customer.assignedSalesId ?? ctx.user.id;

      const created = await tx.order.create({
        data: {
          businessId,
          customerId: snapshot.customer.id,
          salesId,
          status: OrderStatus.DRAFT,
          version: 1,
          rev: 0,
          orderDate: new Date(),
          deliveryAddress: body.deliveryAddress ?? null,
          notes: body.notes ?? null,
          repeatIntervalDays: body.repeatIntervalDays ?? null,
          subtotal: BigInt(snapshot.totals.subtotal),
          discountTotal: BigInt(snapshot.totals.discountTotal),
          shippingCharge: BigInt(snapshot.totals.shippingCharge),
          ppnEnabled: snapshot.business.ppnEnabled,
          ppnRateBps: snapshot.business.ppnRateBps,
          ppnAmount: BigInt(snapshot.totals.ppnAmount),
          grandTotal: BigInt(snapshot.totals.grandTotal),
          dpBps: snapshot.dpBps,
          dpAmount: BigInt(snapshot.totals.dpAmount),
          hasBelowMin: snapshot.hasBelowMin,
          belowMinReason: body.belowMinReason ?? null,
          items: {
            create: snapshot.lines.map((l) => ({
              businessId,
              productId: l.productId,
              productName: l.productName,
              sku: l.sku,
              unit: l.unit,
              qty: l.qty,
              listPrice: BigInt(l.listPrice),
              unitPrice: BigInt(l.unitPrice),
              discountType: l.discountType,
              discountValue: BigInt(l.discountValue),
              discountSource: l.discountSource,
              lineSubtotal: BigInt(l.lineSubtotal),
              lineDiscount: BigInt(l.lineDiscount),
              lineNet: BigInt(l.lineNet),
              costPrice: BigInt(l.costPrice),
              floorPrice: BigInt(l.floorPrice),
              belowMin: l.belowMin,
              sortOrder: l.sortOrder,
            })),
          },
        },
        include: {
          customer: {
            select: { id: true, code: true, name: true },
          },
          items: true,
        },
      });

      await tx.auditLog.create({
        data: {
          businessId,
          actorId: ctx.user.id,
          actorRole: ctx.user.role,
          action: 'ORDER_CREATE',
          entityType: 'Order',
          entityId: created.id,
          summary: `Draf order dibuat untuk customer ${snapshot.customer.code} senilai Rp ${formatRupiah(snapshot.totals.grandTotal)}`,
          after: {
            customerId: created.customerId,
            grandTotal: snapshot.totals.grandTotal,
            itemCount: snapshot.lines.length,
            hasBelowMin: snapshot.hasBelowMin,
          },
        },
      });

      return created;
    });

    const result = formatOrderDto(order, ctx.user.role);

    return {
      status: 201,
      data: result,
    };
  }
);
