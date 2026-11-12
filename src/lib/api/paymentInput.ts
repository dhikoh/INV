import { NextRequest } from 'next/server';
import { PaymentMethod } from '@prisma/client';
import { DomainError } from '@/lib/domain/money';
import { saveFile } from '@/lib/files/fileService';

export interface ParsedPaymentInput {
  orderId: string;
  invoiceId: string | null;
  amount: number;
  method: PaymentMethod;
  paidAt: Date;
  reference: string | null;
  notes: string | null;
  autoVerify: boolean;
  proofPath: string | null;
}

/**
 * Mengurai dan memvalidasi payload pencatatan pembayaran dari multipart/form-data atau JSON,
 * termasuk penyimpanan berkas bukti transfer (`proof`) ke direktori usaha.
 */
export async function parsePaymentInput(
  req: NextRequest,
  businessId: string,
  options?: { fixedOrderId?: string }
): Promise<ParsedPaymentInput> {
  const contentType = req.headers.get('content-type') || '';
  const fixedOrderId = options?.fixedOrderId;

  let orderId = fixedOrderId ?? '';
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

    if (!fixedOrderId) {
      const rawOrderId = formData.get('orderId');
      if (!rawOrderId || typeof rawOrderId !== 'string') {
        throw new DomainError('VALIDATION_ERROR', 'orderId wajib diisi', 422);
      }
      orderId = rawOrderId.trim();
    }

    const rawAmount = formData.get('amount');
    if (!rawAmount) {
      throw new DomainError(
        'VALIDATION_ERROR',
        'Jumlah pembayaran (amount) wajib diisi',
        422
      );
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

    if (!fixedOrderId) {
      if (!body.orderId || typeof body.orderId !== 'string') {
        throw new DomainError('VALIDATION_ERROR', 'orderId wajib diisi', 422);
      }
      orderId = body.orderId.trim();
    }

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

  return {
    orderId,
    invoiceId,
    amount,
    method,
    paidAt,
    reference,
    notes,
    autoVerify,
    proofPath,
  };
}

