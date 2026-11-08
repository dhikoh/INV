import { withApi } from '@/lib/api/withApi';
import { requireBusiness } from '@/lib/auth/context';
import { prisma } from '@/lib/db';
import { Role, Prisma } from '@prisma/client';
import { InvoiceQuerySchema } from '@/lib/validation/invoice';

/**
 * GET /api/v1/invoices
 * Role: SUPERADMIN & SALES
 *
 * Mengambil daftar invoice dengan filter status, tipe, pencarian, dan paginasi.
 * Staf sales hanya melihat invoice dari pesanan miliknya sendiri (salesId = ctx.user.id).
 *
 * Rujukan: Seksi 10.5, 11.4 & 14.3 Dokumen Spesifikasi.
 */
export const GET = withApi(
  {
    roles: [Role.SUPERADMIN, Role.SALES],
    query: InvoiceQuerySchema,
  },
  async ({ ctx, query }) => {
    const businessId = requireBusiness(ctx);
    const page = query?.page ?? 1;
    const limit = query?.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Prisma.InvoiceWhereInput = {
      businessId,
      deletedAt: null,
    };

    // Staf sales hanya dapat melihat invoice dari pesanannya sendiri
    if (ctx.user.role === Role.SALES) {
      const salesOrders = await prisma.order.findMany({
        where: {
          businessId,
          salesId: ctx.user.id,
          deletedAt: null,
        },
        select: { id: true },
      });
      const orderIds = salesOrders.map((o) => o.id);
      where.orderId = { in: orderIds };
    }

    if (query?.status) {
      where.status = query.status;
    }

    if (query?.type) {
      where.type = query.type;
    }

    if (query?.search && query.search.trim().length > 0) {
      const q = query.search.trim();
      const [matchingCustomers, matchingOrders] = await Promise.all([
        prisma.customer.findMany({
          where: {
            businessId,
            OR: [
              { name: { contains: q, mode: 'insensitive' } },
              { code: { contains: q, mode: 'insensitive' } },
            ],
          },
          select: { id: true },
        }),
        prisma.order.findMany({
          where: {
            businessId,
            orderNo: { contains: q, mode: 'insensitive' },
          },
          select: { id: true },
        }),
      ]);

      const customerIds = matchingCustomers.map((c) => c.id);
      const orderIds = matchingOrders.map((o) => o.id);

      where.OR = [
        { number: { contains: q, mode: 'insensitive' } },
        ...(customerIds.length > 0 ? [{ customerId: { in: customerIds } }] : []),
        ...(orderIds.length > 0 ? [{ orderId: { in: orderIds } }] : []),
      ];
    }

    const [total, invoices] = await Promise.all([
      prisma.invoice.count({ where }),
      prisma.invoice.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    // Batch load related order, customer, and sales user
    const orderIds = Array.from(new Set(invoices.map((i) => i.orderId)));
    const customerIds = Array.from(new Set(invoices.map((i) => i.customerId)));

    const [orders, customers] = await Promise.all([
      orderIds.length > 0
        ? prisma.order.findMany({
            where: { id: { in: orderIds }, businessId },
            select: {
              id: true,
              orderNo: true,
              status: true,
              grandTotal: true,
              paidTotal: true,
              hasBelowMin: true,
              salesId: true,
            },
          })
        : [],
      customerIds.length > 0
        ? prisma.customer.findMany({
            where: { id: { in: customerIds }, businessId },
            select: {
              id: true,
              name: true,
              code: true,
              phone: true,
            },
          })
        : [],
    ]);

    const orderMap = new Map(orders.map((o) => [o.id, o]));
    const customerMap = new Map(customers.map((c) => [c.id, c]));

    const salesIds = Array.from(
      new Set(orders.map((o) => o.salesId).filter(Boolean))
    );
    const salesUsers =
      salesIds.length > 0
        ? await prisma.user.findMany({
            where: { id: { in: salesIds } },
            select: { id: true, name: true },
          })
        : [];
    const salesMap = new Map(salesUsers.map((s) => [s.id, s]));

    return {
      status: 200,
      data: {
        items: invoices.map((inv) => {
          const ord = orderMap.get(inv.orderId);
          const cust = customerMap.get(inv.customerId);
          const sales = ord ? salesMap.get(ord.salesId) : null;

          return {
            id: inv.id,
            invoiceNo: inv.number,
            type: inv.type,
            status: inv.status,
            theme: inv.theme,
            version: inv.version,
            rev: inv.rev,
            amount: Number(inv.amount),
            paidAmount: Number(inv.paidAmount),
            dueDate: inv.dueDate ? inv.dueDate.toISOString() : null,
            issuedAt: inv.issueDate ? inv.issueDate.toISOString() : null,
            approvedAt: inv.approvedAt ? inv.approvedAt.toISOString() : null,
            rejectedAt:
              inv.status === 'REJECTED' ? inv.updatedAt.toISOString() : null,
            rejectionReason: inv.rejectReason,
            voidReason: inv.voidReason,
            createdAt: inv.createdAt.toISOString(),
            customer: cust
              ? {
                  id: cust.id,
                  name: cust.name,
                  code: cust.code,
                  phone: cust.phone,
                }
              : null,
            order: ord
              ? {
                  id: ord.id,
                  orderNo: ord.orderNo,
                  status: ord.status,
                  grandTotal: Number(ord.grandTotal),
                  paidTotal: Number(ord.paidTotal),
                  hasBelowMin: ord.hasBelowMin,
                  sales: sales ? { id: sales.id, name: sales.name } : null,
                }
              : null,
          };
        }),
        pagination: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
        },
      },
    };
  }
);
