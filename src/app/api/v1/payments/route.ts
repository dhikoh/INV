import { withApi } from '@/lib/api/withApi';
import { requireBusiness } from '@/lib/auth/context';
import { prisma } from '@/lib/db';
import { DomainError } from '@/lib/domain/money';
import { saveFile } from '@/lib/files/fileService';
import {
  createPayment,
  formatPaymentDto,
  PaymentDto,
} from '@/lib/services/payment';
import { PaymentMethod, PaymentStatus, Role } from '@prisma/client';

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

    const results: PendingPaymentQueueItem[] = [];
    const seenBatchIds = new Set<string>();

    for (const p of pendingPayments) {
      const pBatchId = (p as { batchId?: string | null }).batchId ?? null;
      if (pBatchId && seenBatchIds.has(pBatchId)) {
        continue;
      }
      if (pBatchId) {
        seenBatchIds.add(pBatchId);
      }

      const order = await prisma.order.findFirst({
        where: { id: p.orderId, businessId, deletedAt: null },
        select: {
          orderNo: true,
          salesId: true,
          customerId: true,
        },
      });

      let customerName = '-';
      let salesName = '-';

      if (order) {
        const cust = await prisma.customer.findFirst({
          where: { id: order.customerId, businessId, deletedAt: null },
          select: { name: true },
        });
        if (cust) customerName = cust.name;

        const sales = await prisma.user.findFirst({
          where: { id: order.salesId, deletedAt: null },
          select: { name: true },
        });
        if (sales) salesName = sales.name;
      }

      const batch = pBatchId ? batchMap.get(pBatchId) : undefined;
      if (batch) {
        const batchInvoiceIds = batch.allocations.map((a) => a.invoiceId);
        const batchOrderIds = Array.from(
          new Set(batch.allocations.map((a) => a.orderId))
        );
        const [batchInvoices, batchOrders] = await Promise.all([
          batchInvoiceIds.length > 0
            ? prisma.invoice.findMany({
              where: { businessId, id: { in: batchInvoiceIds }, deletedAt: null },
              select: { id: true, number: true },
            })
            : [],
          batchOrderIds.length > 0
            ? prisma.order.findMany({
              where: { businessId, id: { in: batchOrderIds }, deletedAt: null },
              select: { id: true, orderNo: true },
            })
            : [],
        ]);
        const invNumMap = new Map(batchInvoices.map((i) => [i.id, i.number]));
        const ordNoMap = new Map(batchOrders.map((o) => [o.id, o.orderNo]));

        results.push({
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
            orderNo: ordNoMap.get(a.orderId) ?? null,
            amount: Number(a.amount),
          })),
        });
      } else {
        results.push({
          ...formatPaymentDto(p),
          orderNo: order ? order.orderNo : null,
          customerName,
          salesName,
          isBatch: false,
        });
      }
    }

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

    const contentType = req.headers.get('content-type') || '';
    let orderId: string;
    let invoiceId: string | null = null;
    let amount: number;
    let method: PaymentMethod = PaymentMethod.TRANSFER;
    let paidAt: Date = new Date();
    let reference: string | null = null;
    let notes: string | null = null;
    let autoVerify = false;
    let proofPath: string | null = null;

    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData().catch(() => {
        throw new DomainError('BAD_REQUEST', 'Form data tidak valid', 400);
      });

      const rawOrderId = formData.get('orderId');
      if (!rawOrderId || typeof rawOrderId !== 'string') {
        throw new DomainError('VALIDATION_ERROR', 'orderId wajib diisi', 422);
      }
      orderId = rawOrderId.trim();

      const rawAmount = formData.get('amount');
      if (!rawAmount) {
        throw new DomainError('VALIDATION_ERROR', 'Jumlah pembayaran wajib diisi', 422);
      }
      amount = Number(rawAmount);
      if (isNaN(amount) || amount <= 0) {
        throw new DomainError(
          'VALIDATION_ERROR',
          'Jumlah pembayaran harus berupa angka positif',
          422
        );
      }

      const rawInvoiceId = formData.get('invoiceId');
      if (rawInvoiceId && typeof rawInvoiceId === 'string') {
        invoiceId = rawInvoiceId.trim() || null;
      }

      const rawMethod = formData.get('method');
      if (rawMethod && typeof rawMethod === 'string') {
        if (!Object.values(PaymentMethod).includes(rawMethod as PaymentMethod)) {
          throw new DomainError('VALIDATION_ERROR', 'Metode pembayaran tidak valid', 422);
        }
        method = rawMethod as PaymentMethod;
      }

      const rawPaidAt = formData.get('paidAt');
      if (rawPaidAt && typeof rawPaidAt === 'string') {
        const parsedDate = new Date(rawPaidAt);
        if (isNaN(parsedDate.getTime())) {
          throw new DomainError('VALIDATION_ERROR', 'Format tanggal paidAt tidak valid', 422);
        }
        paidAt = parsedDate;
      }

      const rawRef = formData.get('reference');
      if (rawRef && typeof rawRef === 'string') {
        reference = rawRef.trim() || null;
      }

      const rawNotes = formData.get('notes');
      if (rawNotes && typeof rawNotes === 'string') {
        notes = rawNotes.trim() || null;
      }

      const rawAutoVerify = formData.get('autoVerify');
      if (rawAutoVerify === 'true' || rawAutoVerify === '1') {
        autoVerify = true;
      }

      const file = formData.get('proof');
      if (file && file instanceof Blob && file.size > 0) {
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const saved = await saveFile({
          businessId,
          kind: 'proof',
          buffer,
        });
        proofPath = saved.relativePath;
      }
    } else {
      const body = await req.json().catch(() => {
        throw new DomainError('BAD_REQUEST', 'Body JSON tidak valid', 400);
      });

      if (!body.orderId || typeof body.orderId !== 'string') {
        throw new DomainError('VALIDATION_ERROR', 'orderId wajib diisi', 422);
      }
      orderId = body.orderId.trim();

      if (!body.amount || typeof body.amount !== 'number' || body.amount <= 0) {
        throw new DomainError(
          'VALIDATION_ERROR',
          'Jumlah pembayaran (amount) harus berupa angka positif',
          422
        );
      }
      amount = body.amount;
      invoiceId = body.invoiceId || null;
      if (body.method) {
        if (!Object.values(PaymentMethod).includes(body.method)) {
          throw new DomainError('VALIDATION_ERROR', 'Metode pembayaran tidak valid', 422);
        }
        method = body.method;
      }
      if (body.paidAt) {
        const parsedDate = new Date(body.paidAt);
        if (isNaN(parsedDate.getTime())) {
          throw new DomainError('VALIDATION_ERROR', 'Format tanggal paidAt tidak valid', 422);
        }
        paidAt = parsedDate;
      }
      reference = body.reference || null;
      notes = body.notes || null;
      proofPath = body.proofPath || null;
      autoVerify = Boolean(body.autoVerify);
    }

    const payment = await prisma.$transaction(async (tx) => {
      return createPayment(tx, ctx, {
        orderId,
        invoiceId,
        amount,
        method,
        paidAt,
        reference,
        proofPath,
        notes,
        autoVerify,
      });
    });

    return {
      status: 201,
      data: formatPaymentDto(payment),
    };
  }
);
