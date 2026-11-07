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

const BusinessCreateSchema = z
  .object({
    code: z
      .string()
      .trim()
      .min(2, 'Kode usaha minimal 2 karakter')
      .max(10, 'Kode usaha maksimal 10 karakter')
      .transform((v) => v.toUpperCase())
      .pipe(
        z.string().regex(/^[A-Z0-9]+$/, 'Kode usaha harus berupa huruf kapital dan angka')
      ),
    name: z.string().trim().min(2, 'Nama usaha minimal 2 karakter').max(100),
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
    invoiceTheme: z.nativeEnum(InvoiceTheme).default(InvoiceTheme.PROFESIONAL),
    invoiceFooterNote: z.string().trim().max(1000).optional().nullable(),
    ppnEnabled: z.boolean().default(false),
    ppnRateBps: z.number().int().min(0).max(10000).default(1100),
    allowNegativeStock: z.boolean().default(false),
    requirePaidBeforeShip: z.boolean().default(false),
    defaultDpBps: z.number().int().min(0).max(9900).default(5000),
    dueDays: z.number().int().min(1).max(365).default(7),
    defaultRepeatDays: z.number().int().min(1).max(365).default(30),
    commissionMode: z
      .nativeEnum(CommissionMode)
      .default(CommissionMode.PERCENT_OF_PROFIT),
    commissionRateBps: z.number().int().min(0).max(10000).default(1000),
    commissionFixedAmount: z.number().int().min(0).default(0),
    commissionTrigger: z
      .nativeEnum(CommissionTrigger)
      .default(CommissionTrigger.ON_FULL_PAID),
    isActive: z.boolean().default(true),
  })
  .strict();

export const GET = withApi(
  {
    roles: ['SUPERADMIN'],
    allowPasswordChange: true,
  },
  async () => {
    const list = await prisma.business.findMany({
      where: {
        deletedAt: null,
      },
      orderBy: {
        name: 'asc',
      },
    });

    return {
      data: list,
    };
  }
);

export const POST = withApi(
  {
    roles: ['SUPERADMIN'],
    body: BusinessCreateSchema,
  },
  async ({ ctx, body }) => {
    const normalizedCode = body.code.toUpperCase().trim();

    // Pastikan kode usaha unik
    const existing = await prisma.business.findUnique({
      where: { code: normalizedCode },
    });

    if (existing) {
      throw new DomainError('DUPLICATE', 'Kode usaha sudah digunakan', 409);
    }

    const business = await prisma.$transaction(async (tx) => {
      const created = await tx.business.create({
        data: {
          code: normalizedCode,
          name: body.name,
          legalName: body.legalName ?? null,
          address: body.address ?? null,
          phone: body.phone ?? null,
          email: body.email || null,
          npwp: body.npwp ?? null,
          invoiceTheme: body.invoiceTheme,
          invoiceFooterNote: body.invoiceFooterNote ?? null,
          ppnEnabled: body.ppnEnabled,
          ppnRateBps: body.ppnRateBps,
          allowNegativeStock: body.allowNegativeStock,
          requirePaidBeforeShip: body.requirePaidBeforeShip,
          defaultDpBps: body.defaultDpBps,
          dueDays: body.dueDays,
          defaultRepeatDays: body.defaultRepeatDays,
          commissionMode: body.commissionMode,
          commissionRateBps: body.commissionRateBps,
          commissionFixedAmount: BigInt(body.commissionFixedAmount ?? 0),
          commissionTrigger: body.commissionTrigger,
          isActive: body.isActive,
        },
      });

      await audit(tx, ctx, {
        action: 'BUSINESS_CREATE',
        entityType: 'Business',
        entityId: created.id,
        businessId: created.id,
        summary: `Pembuatan unit usaha baru: ${created.code} - ${created.name}`,
        after: created,
      });

      return created;
    });

    return {
      data: business,
      status: 201,
    };
  }
);
