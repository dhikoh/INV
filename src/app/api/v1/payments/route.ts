import { withApi } from '@/lib/api/withApi';
import { parsePaymentInput } from '@/lib/api/paymentInput';
import { requireBusiness } from '@/lib/auth/context';
import { prisma } from '@/lib/db';
import {
  createPayment,
  formatPaymentDto,
  PaymentDto,
} from '@/lib/services/payment';
import { PaymentStatus, Role } from '@prisma/client';

export interface PendingBatchAllocationView {
  invoiceId: string;
  invoiceNumber: string;
  orderId: string;
  orderNo: string | null;
  amount: number;
}

export interface PendingPaymentQueueItem extends PaymentDto {
  orderNo: string | null;
  customerName: string;
  salesName: string;
  isBatch?: boolean;
  batchId?: string | null;
  batchTotalPaid?: number;
  batchAllocatedTotal?: number;
  batchCreditAmount?: number;
  batchCreditOption?: boolean;
  allocations?: PendingBatchAllocationView[];
}

/**
 * GET /api/v1/payments
 *
 * Mengambil antrean pembayaran yang menunggu verifikasi (PENDING_VERIFICATION).
 * Khusus Super Admin.
 */
export const GET = withApi(
  {
    roles: [Role.SUPERADMIN],
  },
  async ({ ctx }): Promise<{ status: number; data: PendingPaymentQueueItem[] }> => {
    const businessId = requireBusiness(ctx);

    const pendingPayments = await prisma.payment.findMany({
      where: {
        businessId,
        status: PaymentStatus.PENDING_VERIFICATION,
      },
      orderBy: { createdAt: 'asc' },
    });

    const batchIds = Array.from(
      new Set(
        pendingPayments
          .map((p) => (p as { batchId?: string | null }).batchId)
          .filter((id): id is string => Boolean(id))
      )
    );

    const batches =
      batchIds.length > 0 &&
      typeof (prisma as { paymentBatch?: { findMany?: unknown } }).paymentBatch
        ?.findMany === 'function'
        ? await prisma.paymentBatch.findMany({
            where: { id: { in: batchIds }, businessId },
            include: { allocations: true },
          })
        : [];
    const batchMap = new Map(batches.map((b) => [b.id, b]));

    const uniquePayments: typeof pendingPayments = [];
    const seenBatchIds = new Set<string>();
    for (const p of pendingPayments) {
      const pBatchId = (p as { batchId?: string | null }).batchId ?? null;
      if (pBatchId) {
        if (seenBatchIds.has(pBatchId)) continue;
        seenBatchIds.add(pBatchId);
      }
      uniquePayments.push(p);
    }

    const paymentOrderIds = uniquePayments.map((p) => p.orderId);
    const batchAllocationOrderIds = batches.flatMap((b) =>
      b.allocations.map((a) => a.orderId)
    );
    const allOrderIds = Array.from(
      new Set([...paymentOrderIds, ...batchAllocationOrderIds])
    );
    const allBatchInvoiceIds = Array.from(
      new Set(batches.flatMap((b) => b.allocations.map((a) => a.invoiceId)))
    );

    const hasOrderFindMany =
      typeof (prisma.order as { findMany?: unknown } | undefined)?.findMany ===
      'function';
    const orderRows =
      allOrderIds.length > 0
        ? hasOrderFindMany
          ? await prisma.order.findMany({
              where: { id: { in: allOrderIds }, businessId, deletedAt: null },
              select: { id: true, orderNo: true, salesId: true, customerId: true },
            })
          : (
              await Promise.all(
                allOrderIds.map((id) =>
                  prisma.order.findFirst({
                    where: { id, businessId, deletedAt: null },
                    select: {
                      id: true,
                      orderNo: true,
                      salesId: true,
                      customerId: true,
                    },
                  })
                )
              )
            ).filter((o): o is NonNullable<typeof o> => Boolean(o))
        : [];
    const orderMap = new Map(orderRows.map((o) => [o.id, o]));

    const customerIds = Array.from(
      new Set(
        paymentOrderIds
          .map((oid) => orderMap.get(oid)?.customerId)
          .filter((id): id is string => Boolean(id))
      )
    );
    const salesIds = Array.from(
      new Set(
        paymentOrderIds
          .map((oid) => orderMap.get(oid)?.salesId)
          .filter((id): id is string => Boolean(id))
      )
    );

    const hasCustomerFindMany =
      typeof (prisma.customer as { findMany?: unknown } | undefined)
        ?.findMany === 'function';
    const hasUserFindMany =
      typeof (prisma.user as { findMany?: unknown } | undefined)?.findMany ===
      'function';

    const [customerRows, salesRows, batchInvoices] = await Promise.all([
      customerIds.length > 0
        ? hasCustomerFindMany
          ? prisma.customer.findMany({
              where: { id: { in: customerIds }, businessId, deletedAt: null },
              select: { id: true, name: true },
            })
          : (
              await Promise.all(
                customerIds.map((id) =>
                  prisma.customer.findFirst({
                    where: { id, businessId, deletedAt: null },
                    select: { id: true, name: true },
                  })
                )
              )
            ).filter((c): c is NonNullable<typeof c> => Boolean(c))
        : Promise.resolve([]),
      salesIds.length > 0
        ? hasUserFindMany
          ? prisma.user.findMany({
              where: { id: { in: salesIds }, deletedAt: null },
              select: { id: true, name: true },
            })
          : (
              await Promise.all(
                salesIds.map((id) =>
                  prisma.user.findUnique({
                    where: { id },
                    select: { id: true, name: true },
                  })
                )
              )
            ).filter((u): u is NonNullable<typeof u> => Boolean(u))
        : Promise.resolve([]),
      allBatchInvoiceIds.length > 0
        ? prisma.invoice.findMany({
            where: {
              businessId,
              id: { in: allBatchInvoiceIds },
              deletedAt: null,
            },
            select: { id: true, number: true },
          })
        : Promise.resolve([]),
    ]);

    const customerMap = new Map(customerRows.map((c) => [c.id, c.name]));
    const salesMap = new Map(salesRows.map((u) => [u.id, u.name]));
    const invNumMap = new Map(batchInvoices.map((i) => [i.id, i.number]));

    const results: PendingPaymentQueueItem[] = uniquePayments.map((p) => {
      const pBatchId = (p as { batchId?: string | null }).batchId ?? null;
      const order = orderMap.get(p.orderId) ?? null;
      const customerName = order
        ? customerMap.get(order.customerId) ?? '-'
        : '-';
      const salesName = order ? salesMap.get(order.salesId) ?? '-' : '-';

      const batch = pBatchId ? batchMap.get(pBatchId) : undefined;
      if (batch) {
        return {
          ...formatPaymentDto(p),
          amount: Number(batch.totalPaid),
          orderNo: `${batch.allocations.length} Faktur Kolektif`,
          customerName,
          salesName,
          isBatch: true,
          batchId: batch.id,
          batchTotalPaid: Number(batch.totalPaid),
          batchAllocatedTotal: Number(batch.allocatedTotal),
          batchCreditAmount: Number(batch.creditAmount),
          batchCreditOption: batch.creditOption,
          allocations: batch.allocations.map((a) => ({
            invoiceId: a.invoiceId,
            invoiceNumber: invNumMap.get(a.invoiceId) ?? a.invoiceId,
            orderId: a.orderId,
            orderNo: orderMap.get(a.orderId)?.orderNo ?? null,
            amount: Number(a.amount),
          })),
        };
      }

      return {
        ...formatPaymentDto(p),
        orderNo: order ? order.orderNo : null,
        customerName,
        salesName,
        isBatch: false,
      };
    });

    return {
      status: 200,
      data: results,
    };
  }
);

/**
 * POST /api/v1/payments
 *
 * Endpoint pencatatan pembayaran langsung dengan menyertakan orderId.
 * Mendukung multipart/form-data dan JSON.
 */
export const POST = withApi(
  {
    roles: [Role.SUPERADMIN, Role.SALES],
  },
  async ({ ctx, req }): Promise<{ status: number; data: PaymentDto }> => {
    const businessId = requireBusiness(ctx);
    const parsed = await parsePaymentInput(req, businessId);

    const payment = await prisma.$transaction(async (tx) => {
      return createPayment(tx, ctx, {
        orderId: parsed.orderId,
        invoiceId: parsed.invoiceId,
        amount: parsed.amount,
        method: parsed.method,
        paidAt: parsed.paidAt,
        reference: parsed.reference,
        proofPath: parsed.proofPath,
        notes: parsed.notes,
        autoVerify: parsed.autoVerify,
      });
    });

    return {
      status: 201,
      data: formatPaymentDto(payment),
    };
  }
);
