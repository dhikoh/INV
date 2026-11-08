import { withApi } from '@/lib/api/withApi';
import { requireBusiness } from '@/lib/auth/context';
import { prisma } from '@/lib/db';
import { Role, OrderStatus, InvoiceStatus, Prisma } from '@prisma/client';
import { calcProfit } from '@/lib/domain/profit';
import { formatOrderDto, formatInvoiceDto } from '@/lib/services/order';

/**
 * GET /api/v1/approvals
 * Role: SUPERADMIN ONLY (Sales ditolak 403 FORBIDDEN)
 *
 * Mengambil daftar antrean pesanan & faktur yang membutuhkan persetujuan Super Admin.
 *
 * Rujukan: Seksi 8.2, 11.4 & Seksi 19.5 (T3.1) Dokumen Spesifikasi.
 */
export const GET = withApi(
  {
    roles: [Role.SUPERADMIN],
  },
  async ({ ctx, req }) => {
    const businessId = requireBusiness(ctx);
    const url = new URL(req.url);

    const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') || '20', 10)));
    const skip = (page - 1) * limit;

    const hasBelowMinParam = url.searchParams.get('hasBelowMin');
    const search = url.searchParams.get('search')?.trim();

    const where: Prisma.OrderWhereInput = {
      businessId,
      deletedAt: null,
      status: {
        in: [OrderStatus.PENDING_APPROVAL, OrderStatus.FINAL_PENDING_APPROVAL],
      },
    };

    if (hasBelowMinParam === 'true') {
      where.hasBelowMin = true;
    } else if (hasBelowMinParam === 'false') {
      where.hasBelowMin = false;
    }

    if (search) {
      where.OR = [
        { orderNo: { contains: search, mode: 'insensitive' } },
        { customer: { name: { contains: search, mode: 'insensitive' } } },
        { customer: { code: { contains: search, mode: 'insensitive' } } },
      ];
    }

    const [total, orders, totalBelowMin] = await Promise.all([
      prisma.order.count({ where }),
      prisma.order.findMany({
        where,
        include: {
          customer: {
            select: { id: true, code: true, name: true, phone: true, address: true },
          },
          items: true,
        },
        orderBy: { createdAt: 'asc' }, // Antrean FIFO: yang masuk duluan di atas
        skip,
        take: limit,
      }),
      prisma.order.count({
        where: {
          businessId,
          deletedAt: null,
          status: { in: [OrderStatus.PENDING_APPROVAL, OrderStatus.FINAL_PENDING_APPROVAL] },
          hasBelowMin: true,
        },
      }),
    ]);

    // Ambil sales user map
    const salesIds = [...new Set(orders.map((o) => o.salesId))];
    const salesUsers = salesIds.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: salesIds } },
          select: { id: true, name: true, username: true },
        })
      : [];
    const salesMap = new Map(salesUsers.map((u) => [u.id, u]));

    // Ambil pending invoice untuk setiap order
    const orderIds = orders.map((o) => o.id);
    const pendingInvoices = orderIds.length > 0
      ? await prisma.invoice.findMany({
          where: {
            orderId: { in: orderIds },
            businessId,
            status: InvoiceStatus.PENDING_APPROVAL,
            deletedAt: null,
          },
          orderBy: { requestedAt: 'desc' },
        })
      : [];
    const invoiceMap = new Map(pendingInvoices.map((inv) => [inv.orderId, inv]));

    const items = orders.map((order) => {
      const orderDto = formatOrderDto(order, Role.SUPERADMIN);
      const pendingInvoice = invoiceMap.get(order.id);
      const sales = salesMap.get(order.salesId);

      const profit = calcProfit({
        items: order.items.map((i) => ({
          qty: i.qty,
          lineNet: Number(i.lineNet),
          costPrice: Number(i.costPrice),
          discountSource: i.discountSource as 'MANUAL' | 'PROMO' | 'SUBSIDY',
          lineDiscount: Number(i.lineDiscount),
        })),
        returns: [],
        shippingCharge: Number(order.shippingCharge),
        shippingActualCost: 0,
        extraCosts: [],
      });

      return {
        ...orderDto,
        sales: sales ? { id: sales.id, name: sales.name, username: sales.username } : null,
        pendingInvoice: pendingInvoice ? formatInvoiceDto(pendingInvoice) : null,
        profit,
      };
    });

    return {
      status: 200,
      data: {
        items,
        summary: {
          totalPending: total,
          totalBelowMin,
        },
        pagination: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit) || 1,
        },
      },
    };
  }
);
