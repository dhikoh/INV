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

export interface PendingPaymentQueueItem extends PaymentDto {
  orderNo: string | null;
  customerName: string;
  salesName: string;
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

    const results: PendingPaymentQueueItem[] = [];

    for (const p of pendingPayments) {
      const order = await prisma.order.findUnique({
        where: { id: p.orderId },
        select: {
          orderNo: true,
          salesId: true,
          customerId: true,
        },
      });

      let customerName = '-';
      let salesName = '-';

      if (order) {
        const cust = await prisma.customer.findUnique({
          where: { id: order.customerId },
          select: { name: true },
        });
        if (cust) customerName = cust.name;

        const sales = await prisma.user.findUnique({
          where: { id: order.salesId },
          select: { name: true },
        });
        if (sales) salesName = sales.name;
      }

      results.push({
        ...formatPaymentDto(p),
        orderNo: order ? order.orderNo : null,
        customerName,
        salesName,
      });
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
