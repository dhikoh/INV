import { withApi } from '@/lib/api/withApi';
import { requireBusiness } from '@/lib/auth/context';
import { prisma } from '@/lib/db';
import { Role, InvoiceStatus, OrderStatus, Prisma } from '@prisma/client';
import { z } from 'zod';
import {
  getAgingBucket,
  getDaysOverdue,
  calculateReceivableBalance,
  AGING_BUCKET_LABELS,
} from '@/lib/domain/receivable';
import { daysUntil } from '@/lib/domain/reminder';
import { fromDb } from '@/lib/domain/money';

const GetReceivablesQuerySchema = z.object({
  bucket: z
    .enum(['ALL', 'CURRENT', 'DAYS_1_7', 'DAYS_8_30', 'DAYS_31_60', 'DAYS_OVER_60'])
    .optional(),
  status: z.enum(['all', 'overdue', 'current']).optional(),
  customerId: z.string().optional(),
  search: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().default(50),
  sortBy: z.enum(['dueDate', 'daysOverdue', 'remainingAmount', 'amount', 'customer', 'invoiceNumber']).optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
  sortDir: z.enum(['asc', 'desc']).optional(),
});

/**
 * GET /api/v1/receivables
 *
 * Mengambil daftar piutang usaha (invoice belum lunas) beserta umur piutang (Seksi 13.3).
 * Bebas dari kebocoran data rahasia (tanpa profit, HPP, atau margin).
 */
export const GET = withApi(
  {
    roles: [Role.SUPERADMIN, Role.SALES],
    query: GetReceivablesQuerySchema,
  },
  async ({ ctx, query }) => {
    const businessId = requireBusiness(ctx);
    const now = new Date();

    const page = query?.page ?? 1;
    const limit = query?.limit ?? 50;

    const orderWhere: Prisma.OrderWhereInput = {
      businessId,
      status: { not: OrderStatus.CANCELLED },
      deletedAt: null,
    };

    if (ctx.user.role === Role.SALES) {
      orderWhere.salesId = ctx.user.id;
    }

    const orders = await prisma.order.findMany({
      where: orderWhere,
      select: {
        id: true,
        orderNo: true,
        salesId: true,
        customerId: true,
        customer: {
          select: {
            id: true,
            code: true,
            name: true,
            phone: true,
          },
        },
      },
    });

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

    const orderMap = new Map(orders.map((o) => [o.id, o]));
    const orderIds = orders.map((o) => o.id);

    const where: Prisma.InvoiceWhereInput = {
      businessId,
      status: InvoiceStatus.APPROVED,
      deletedAt: null,
      orderId: { in: orderIds },
    };

    if (query?.customerId) {
      where.customerId = query.customerId;
    }

    const invoices = await prisma.invoice.findMany({
      where,
      orderBy: { dueDate: 'asc' },
    });

    // Ambil hanya invoice yang belum lunas (amount > paidAmount)
    const unpaidInvoices = invoices.filter(
      (inv) => inv.amount > inv.paidAmount
    );

    const items = unpaidInvoices
      .map((inv) => {
        const ord = orderMap.get(inv.orderId);
        if (!ord) return null;

        const remainingAmount = calculateReceivableBalance(inv);
        const daysOverdue = getDaysOverdue(inv.dueDate, now);
        const bucket = getAgingBucket(inv.dueDate, now);
        const remainingDays = inv.dueDate ? daysUntil(inv.dueDate, now) : 0;
        const isOverdue = remainingDays < 0;

        return {
          id: inv.id,
          invoiceNumber: inv.number || inv.id,
          type: inv.type,
          amount: inv.amount,
          paidAmount: inv.paidAmount,
          remainingAmount,
          issueDate: inv.issueDate ? inv.issueDate.toISOString() : null,
          dueDate: inv.dueDate ? inv.dueDate.toISOString() : null,
          orderId: inv.orderId,
          orderNo: ord.orderNo,
          customer: ord.customer,
          sales: salesMap.get(ord.salesId) ?? { id: ord.salesId, name: 'Sales' },
          daysOverdue,
          remainingDays,
          isOverdue,
          agingBucket: bucket,
          agingLabel: AGING_BUCKET_LABELS[bucket],
        };
      })
      .filter((i): i is NonNullable<typeof i> => i !== null);

    let filtered = items;

    if (query.search && query.search.trim() !== '') {
      const q = query.search.trim().toLowerCase();
      filtered = filtered.filter(
        (i) =>
          i.invoiceNumber.toLowerCase().includes(q) ||
          i.customer.name.toLowerCase().includes(q) ||
          (i.orderNo && i.orderNo.toLowerCase().includes(q))
      );
    }

    if (query.status === 'overdue') {
      filtered = filtered.filter((i) => i.isOverdue);
    } else if (query.status === 'current') {
      filtered = filtered.filter((i) => !i.isOverdue);
    }

    if (query.bucket && query.bucket !== 'ALL') {
      filtered = filtered.filter((i) => i.agingBucket === query.bucket);
    }

    // Ringkasan umur piutang per bucket
    const bucketSummary = {
      CURRENT: fromDb(
        items
          .filter((i) => i.agingBucket === 'CURRENT')
          .reduce((sum, i) => sum + i.remainingAmount, 0n)
      ),
      DAYS_1_7: fromDb(
        items
          .filter((i) => i.agingBucket === 'DAYS_1_7')
          .reduce((sum, i) => sum + i.remainingAmount, 0n)
      ),
      DAYS_8_30: fromDb(
        items
          .filter((i) => i.agingBucket === 'DAYS_8_30')
          .reduce((sum, i) => sum + i.remainingAmount, 0n)
      ),
      DAYS_31_60: fromDb(
        items
          .filter((i) => i.agingBucket === 'DAYS_31_60')
          .reduce((sum, i) => sum + i.remainingAmount, 0n)
      ),
      DAYS_OVER_60: fromDb(
        items
          .filter((i) => i.agingBucket === 'DAYS_OVER_60')
          .reduce((sum, i) => sum + i.remainingAmount, 0n)
      ),
    };

    const totalOutstanding = fromDb(
      items.reduce((sum, i) => sum + i.remainingAmount, 0n)
    );
    const totalOverdue = fromDb(
      items
        .filter((i) => i.isOverdue)
        .reduce((sum, i) => sum + i.remainingAmount, 0n)
    );

    const sortBy = query.sortBy || 'dueDate';
    const sortOrder = (query.sortOrder || query.sortDir || 'asc').toLowerCase() === 'desc' ? 'desc' : 'asc';

    filtered.sort((a, b) => {
      let cmp = 0;
      if (sortBy === 'dueDate') {
        const timeA = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
        const timeB = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
        cmp = timeA - timeB;
      } else if (sortBy === 'daysOverdue') {
        cmp = a.daysOverdue - b.daysOverdue;
      } else if (sortBy === 'remainingAmount') {
        cmp = a.remainingAmount > b.remainingAmount ? 1 : a.remainingAmount < b.remainingAmount ? -1 : 0;
      } else if (sortBy === 'amount') {
        cmp = a.amount > b.amount ? 1 : a.amount < b.amount ? -1 : 0;
      } else if (sortBy === 'customer') {
        cmp = a.customer.name.localeCompare(b.customer.name, 'id');
      } else if (sortBy === 'invoiceNumber') {
        cmp = a.invoiceNumber.localeCompare(b.invoiceNumber, 'id');
      }
      return sortOrder === 'desc' ? -cmp : cmp;
    });

    const offset = (page - 1) * limit;
    const paginated = filtered.slice(offset, offset + limit);

    return {
      data: paginated,
      meta: {
        total: filtered.length,
        page,
        limit,
        totalPages: Math.ceil(filtered.length / limit) || 1,
        totalOutstanding,
        totalOverdue,
        overdueCount: items.filter((i) => i.isOverdue).length,
        bucketSummary,
      },
    };
  }
);
