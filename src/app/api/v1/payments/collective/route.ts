import { withApi } from '@/lib/api/withApi';
import { requireBusiness } from '@/lib/auth/context';
import { prisma } from '@/lib/db';
import { DomainError } from '@/lib/domain/money';
import { saveFile } from '@/lib/files/fileService';
import {
  createCollectivePayment,
  listUnpaidCustomerInvoices,
  PaymentBatchDto,
  TxClient,
  UnpaidCustomerInvoiceDto,
} from '@/lib/services/payment';
import { CollectivePaymentCreateSchema } from '@/lib/validation/payment';
import { PaymentMethod, Role } from '@prisma/client';
import { z } from 'zod';

const CollectiveQuerySchema = z
  .object({
    customerId: z.string().min(1, 'customerId wajib diisi'),
  })
  .strict();

/**
 * GET /api/v1/payments/collective?customerId=...
 * Role: SUPERADMIN & SALES
 *
 * Mengambil daftar faktur resmi yang belum lunas milik pelanggan untuk keperluan form alokasi kolektif.
 */
export const GET = withApi(
  {
    roles: [Role.SUPERADMIN, Role.SALES],
    query: CollectiveQuerySchema,
  },
  async ({
    ctx,
    query,
  }): Promise<{ status: number; data: UnpaidCustomerInvoiceDto[] }> => {
    requireBusiness(ctx);
    const data = await prisma.$transaction(async (tx) => {
      return listUnpaidCustomerInvoices(
        tx as unknown as TxClient,
        ctx,
        query!.customerId
      );
    });
    return { status: 200, data };
  }
);

/**
 * POST /api/v1/payments/collective
 * Role: SUPERADMIN & SALES
 *
 * Mencatat pembayaran kolektif untuk banyak faktur pelanggan sekaligus (1 bukti bayar),
 * dengan opsi menyimpan kelebihan transfer ke CustomerCreditEntry saat diverifikasi.
 */
export const POST = withApi(
  {
    roles: [Role.SUPERADMIN, Role.SALES],
  },
  async ({ ctx, req }): Promise<{ status: number; data: PaymentBatchDto }> => {
    const businessId = requireBusiness(ctx);
    const contentType = req.headers.get('content-type') || '';

    let rawPayload: unknown;
    let uploadedProofPath: string | null = null;

    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData().catch(() => {
        throw new DomainError('BAD_REQUEST', 'Form data tidak valid', 400);
      });

      let allocationsParsed: unknown = [];
      const rawAllocations = formData.get('allocations');
      if (typeof rawAllocations === 'string') {
        try {
          allocationsParsed = JSON.parse(rawAllocations);
        } catch {
          throw new DomainError(
            'VALIDATION_ERROR',
            'Format JSON allocations tidak valid',
            422
          );
        }
      }

      const file = formData.get('proof');
      if (file && file instanceof Blob && file.size > 0) {
        const buffer = Buffer.from(await file.arrayBuffer());
        const saved = await saveFile({
          businessId,
          kind: 'proof',
          buffer,
        });
        uploadedProofPath = saved.relativePath;
      }

      const rawPaidAt = formData.get('paidAt');
      const rawAutoVerify = formData.get('autoVerify');
      const rawCreditOption = formData.get('creditOption');
      const rawMethod = formData.get('method');

      rawPayload = {
        customerId: String(formData.get('customerId') || '').trim(),
        totalPaid: Number(formData.get('totalPaid')),
        creditOption: rawCreditOption === 'true' || rawCreditOption === '1',
        method:
          typeof rawMethod === 'string' && rawMethod
            ? (rawMethod as PaymentMethod)
            : PaymentMethod.TRANSFER,
        paidAt:
          typeof rawPaidAt === 'string' && rawPaidAt
            ? rawPaidAt
            : new Date().toISOString(),
        reference:
          typeof formData.get('reference') === 'string'
            ? String(formData.get('reference')).trim() || null
            : null,
        proofPath:
          uploadedProofPath ??
          (typeof formData.get('proofPath') === 'string'
            ? String(formData.get('proofPath')).trim() || null
            : null),
        notes:
          typeof formData.get('notes') === 'string'
            ? String(formData.get('notes')).trim() || null
            : null,
        autoVerify: rawAutoVerify === 'true' || rawAutoVerify === '1',
        allocations: allocationsParsed,
      };
    } else {
      rawPayload = await req.json().catch(() => {
        throw new DomainError('BAD_REQUEST', 'JSON payload tidak valid', 400);
      });
    }

    const parsed = CollectivePaymentCreateSchema.safeParse(rawPayload);
    if (!parsed.success) {
      throw new DomainError(
        'VALIDATION_ERROR',
        parsed.error.issues[0]?.message || 'Data pembayaran kolektif tidak valid',
        422
      );
    }

    const batch = await prisma.$transaction(async (tx) => {
      return createCollectivePayment(
        tx as unknown as TxClient,
        ctx,
        parsed.data
      );
    });

    return {
      status: 201,
      data: batch,
    };
  }
);
