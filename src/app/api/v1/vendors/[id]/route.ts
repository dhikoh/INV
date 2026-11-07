import { z } from 'zod';
import { withApi } from '@/lib/api/withApi';
import { prisma } from '@/lib/db';
import { DomainError } from '@/lib/domain/money';
import { audit } from '@/lib/audit/audit';
import { VendorKind } from '@prisma/client';

const VendorUpdateSchema = z
  .object({
    kind: z.nativeEnum(VendorKind).optional(),
    code: z
      .string()
      .trim()
      .min(2, 'Kode vendor minimal 2 karakter')
      .max(30, 'Kode vendor maksimal 30 karakter')
      .transform((v) => v.toUpperCase())
      .optional(),
    name: z
      .string()
      .trim()
      .min(2, 'Nama vendor minimal 2 karakter')
      .max(150, 'Nama vendor maksimal 150 karakter')
      .optional(),
    picName: z.string().trim().max(100).optional().nullable(),
    phone: z.string().trim().max(50).optional().nullable(),
    address: z.string().trim().max(1000).optional().nullable(),
    bankName: z.string().trim().max(50).optional().nullable(),
    bankAccountNumber: z.string().trim().max(50).optional().nullable(),
    bankAccountHolder: z.string().trim().max(100).optional().nullable(),
    paymentTermDays: z
      .number()
      .int('Jatuh tempo harus bilangan bulat')
      .min(0, 'Jatuh tempo minimal 0 hari')
      .max(365, 'Jatuh tempo maksimal 365 hari')
      .optional(),
    notes: z.string().trim().max(2000).optional().nullable(),
  })
  .strict();

export const GET = withApi(
  {
    roles: ['SUPERADMIN'],
  },
  async ({ ctx, params }) => {
    const vendorId = params.id;
    const businessId = ctx.businessId;

    const vendor = await prisma.vendor.findFirst({
      where: {
        id: vendorId,
        businessId: businessId || undefined,
        deletedAt: null,
      },
      include: {
        _count: {
          select: {
            products: true,
            purchaseOrders: true,
          },
        },
      },
    });

    if (!vendor) {
      throw new DomainError('NOT_FOUND', 'Vendor tidak ditemukan', 404);
    }

    return {
      data: vendor,
    };
  }
);

export const PATCH = withApi(
  {
    roles: ['SUPERADMIN'],
    body: VendorUpdateSchema,
  },
  async ({ ctx, params, body }) => {
    const vendorId = params.id;
    const businessId = ctx.businessId;

    const existing = await prisma.vendor.findFirst({
      where: {
        id: vendorId,
        businessId: businessId || undefined,
        deletedAt: null,
      },
    });

    if (!existing) {
      throw new DomainError('NOT_FOUND', 'Vendor tidak ditemukan', 404);
    }

    // Periksa keunikan kode jika kode diubah
    if (body.code && body.code !== existing.code) {
      const duplicateCode = await prisma.vendor.findFirst({
        where: {
          businessId: existing.businessId,
          code: body.code,
          id: { not: existing.id },
          deletedAt: null,
        },
      });

      if (duplicateCode) {
        throw new DomainError(
          'DUPLICATE',
          `Kode vendor ${body.code} sudah digunakan oleh vendor lain di unit usaha ini`,
          409
        );
      }
    }

    const updated = await prisma.$transaction(async (tx) => {
      const cleanData: Record<string, unknown> = {};
      if (body.kind !== undefined) cleanData.kind = body.kind;
      if (body.code !== undefined) cleanData.code = body.code;
      if (body.name !== undefined) cleanData.name = body.name;
      if (body.picName !== undefined) cleanData.picName = body.picName;
      if (body.phone !== undefined) cleanData.phone = body.phone;
      if (body.address !== undefined) cleanData.address = body.address;
      if (body.bankName !== undefined) cleanData.bankName = body.bankName;
      if (body.bankAccountNumber !== undefined) cleanData.bankAccountNumber = body.bankAccountNumber;
      if (body.bankAccountHolder !== undefined) cleanData.bankAccountHolder = body.bankAccountHolder;
      if (body.paymentTermDays !== undefined) cleanData.paymentTermDays = body.paymentTermDays;
      if (body.notes !== undefined) cleanData.notes = body.notes;

      const result = await tx.vendor.update({
        where: { id: existing.id },
        data: cleanData,
        include: {
          _count: {
            select: {
              products: true,
              purchaseOrders: true,
            },
          },
        },
      });

      await audit(tx, ctx, {
        action: 'VENDOR_UPDATE',
        entityType: 'Vendor',
        entityId: existing.id,
        businessId: existing.businessId,
        summary: `Pembaruan data vendor: [${result.code}] ${result.name}`,
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
    const vendorId = params.id;
    const businessId = ctx.businessId;

    const existing = await prisma.vendor.findFirst({
      where: {
        id: vendorId,
        businessId: businessId || undefined,
        deletedAt: null,
      },
    });

    if (!existing) {
      throw new DomainError('NOT_FOUND', 'Vendor tidak ditemukan', 404);
    }

    const result = await prisma.$transaction(async (tx) => {
      const softDeleted = await tx.vendor.update({
        where: { id: existing.id },
        data: {
          deletedAt: new Date(),
        },
      });

      await audit(tx, ctx, {
        action: 'VENDOR_DELETE',
        entityType: 'Vendor',
        entityId: existing.id,
        businessId: existing.businessId,
        summary: `Soft delete vendor: [${existing.code}] ${existing.name}`,
        before: existing,
        after: softDeleted,
      });

      return softDeleted;
    });

    return {
      data: {
        id: result.id,
        deletedAt: result.deletedAt,
      },
    };
  }
);
