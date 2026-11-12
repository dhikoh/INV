import { z } from 'zod';
import { withApi } from '@/lib/api/withApi';
import { prisma } from '@/lib/db';
import { DomainError } from '@/lib/domain/money';
import { audit } from '@/lib/audit/audit';
import {
  InvoiceTheme,
  CommissionMode,
  CommissionTrigger,
} from '@prisma/client';

const BusinessUpdateSchema = z
  .object({
    code: z
      .string()
      .trim()
      .min(2, 'Kode usaha minimal 2 karakter')
      .max(10, 'Kode usaha maksimal 10 karakter')
      .transform((v) => v.toUpperCase())
      .pipe(
        z.string().regex(/^[A-Z0-9]+$/, 'Kode usaha harus berupa huruf kapital dan angka')
      )
      .optional(),
    name: z
      .string()
      .trim()
      .min(2, 'Nama usaha minimal 2 karakter')
      .max(100)
      .optional(),
    legalName: z.string().trim().max(150).optional().nullable(),
    address: z.string().trim().max(500).optional().nullable(),
    phone: z.string().trim().max(30).optional().nullable(),
    email: z
      .string()
      .trim()
      .email('Format email tidak valid')
      .optional()
      .nullable()
      .or(z.literal('')),
    npwp: z.string().trim().max(50).optional().nullable(),
    website: z.string().trim().max(200).optional().nullable(),
    tagline: z.string().trim().max(200).optional().nullable(),
    instagram: z.string().trim().max(100).optional().nullable(),
    showWebsiteOnPdf: z.boolean().optional(),
    invoiceTheme: z.nativeEnum(InvoiceTheme).optional(),
    invoiceFooterNote: z.string().trim().max(1000).optional().nullable(),
    showBankOnProforma: z.boolean().optional(),
    paymentLegalNotice: z.string().trim().max(1500).optional().nullable(),
    allowSalesCashPayment: z.boolean().optional(),
    requireTransferProofForSales: z.boolean().optional(),
    ppnEnabled: z.boolean().optional(),
    ppnRateBps: z.number().int().min(0).max(10000).optional(),
    allowNegativeStock: z.boolean().optional(),
    requirePaidBeforeShip: z.boolean().optional(),
    allowPartialShipment: z.boolean().optional(),
    allowShipBeforeFinalInvoice: z.boolean().optional(),
    defaultDpBps: z.number().int().min(0).max(9900).optional(),
    dueDays: z.number().int().min(1).max(365).optional(),
    defaultRepeatDays: z.number().int().min(1).max(365).optional(),
    commissionMode: z.nativeEnum(CommissionMode).optional(),
    commissionRateBps: z.number().int().min(0).max(10000).optional(),
    commissionFixedAmount: z.number().int().min(0).optional(),
    commissionTrigger: z.nativeEnum(CommissionTrigger).optional(),
    isActive: z.boolean().optional(),
  })
  .strict();

export const GET = withApi(
  {
    roles: ['SUPERADMIN'],
  },
  async ({ params }) => {
    const business = await prisma.business.findFirst({
      where: {
        id: params.id,
        deletedAt: null,
      },
      include: {
        bankAccounts: {
          where: { deletedAt: null },
          orderBy: { isDefault: 'desc' },
        },
      },
    });

    if (!business) {
      throw new DomainError('NOT_FOUND', 'Usaha tidak ditemukan', 404);
    }

    return {
      data: business,
    };
  }
);

export const PATCH = withApi(
  {
    roles: ['SUPERADMIN'],
    body: BusinessUpdateSchema,
  },
  async ({ ctx, params, body }) => {
    const businessId = params.id;

    const existing = await prisma.business.findFirst({
      where: { id: businessId, deletedAt: null },
    });

    if (!existing) {
      throw new DomainError('NOT_FOUND', 'Usaha tidak ditemukan', 404);
    }

    // Aturan kunci: Kode usaha tidak bisa diubah setelah ada transaksi order
    if (body.code && body.code.toUpperCase().trim() !== existing.code) {
      const orderCount = await prisma.order.count({
        where: { businessId, deletedAt: null },
      });

      if (orderCount > 0) {
        throw new DomainError(
          'INVALID_STATE',
          'Kode usaha tidak bisa diubah setelah ada transaksi order',
          409
        );
      }

      // Pastikan kode baru tidak bertabrakan dengan usaha lain
      const duplicateCode = await prisma.business.findFirst({
        where: {
          code: body.code.toUpperCase().trim(),
          id: { not: businessId },
          deletedAt: null,
        },
      });

      if (duplicateCode) {
        throw new DomainError(
          'DUPLICATE',
          'Kode usaha sudah digunakan oleh usaha lain',
          409
        );
      }
    }

    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.business.update({
        where: { id: businessId },
        data: {
          code: body.code ? body.code.toUpperCase().trim() : undefined,
          name: body.name,
          legalName: body.legalName,
          address: body.address,
          phone: body.phone,
          email: body.email === '' ? null : body.email,
          npwp: body.npwp,
          website: body.website === '' ? null : body.website,
          tagline: body.tagline === '' ? null : body.tagline,
          instagram: body.instagram === '' ? null : body.instagram,
          showWebsiteOnPdf: body.showWebsiteOnPdf,
          invoiceTheme: body.invoiceTheme,
          invoiceFooterNote: body.invoiceFooterNote,
          showBankOnProforma: body.showBankOnProforma,
          paymentLegalNotice:
            body.paymentLegalNotice === '' ? null : body.paymentLegalNotice,
          allowSalesCashPayment: body.allowSalesCashPayment,
          requireTransferProofForSales: body.requireTransferProofForSales,
          ppnEnabled: body.ppnEnabled,
          ppnRateBps: body.ppnRateBps,
          allowNegativeStock: body.allowNegativeStock,
          requirePaidBeforeShip: body.requirePaidBeforeShip,
          allowPartialShipment: body.allowPartialShipment,
          allowShipBeforeFinalInvoice: body.allowShipBeforeFinalInvoice,
          defaultDpBps: body.defaultDpBps,
          dueDays: body.dueDays,
          defaultRepeatDays: body.defaultRepeatDays,
          commissionMode: body.commissionMode,
          commissionRateBps: body.commissionRateBps,
          commissionFixedAmount:
            body.commissionFixedAmount !== undefined
              ? BigInt(body.commissionFixedAmount)
              : undefined,
          commissionTrigger: body.commissionTrigger,
          isActive: body.isActive,
        },
        include: {
          bankAccounts: {
            where: { deletedAt: null },
            orderBy: { isDefault: 'desc' },
          },
        },
      });

      await audit(tx, ctx, {
        action: 'BUSINESS_UPDATE',
        entityType: 'Business',
        entityId: businessId,
        businessId,
        summary: `Pembaruan pengaturan unit usaha: ${result.code}`,
        before: existing,
        after: result,
      });

      return result;
    });

    return {
      data: updated,
    };
  }
);

export const DELETE = withApi(
  {
    roles: ['SUPERADMIN'],
  },
  async ({ ctx, params }) => {
    const businessId = params.id;

    const existing = await prisma.business.findFirst({
      where: { id: businessId, deletedAt: null },
    });

    if (!existing) {
      throw new DomainError('NOT_FOUND', 'Usaha tidak ditemukan', 404);
    }

    await prisma.$transaction(async (tx) => {
      await tx.business.update({
        where: { id: businessId },
        data: { deletedAt: new Date() },
      });

      await audit(tx, ctx, {
        action: 'BUSINESS_DELETE',
        entityType: 'Business',
        entityId: businessId,
        businessId,
        summary: `Penghapusan (soft delete) unit usaha: ${existing.code}`,
        before: existing,
      });
    });

    return {
      data: {
        message: 'Unit usaha berhasil dihapus',
      },
    };
  }
);
