import { z } from 'zod';
import { Role } from '@prisma/client';
import { withApi } from '@/lib/api/withApi';
import { prisma } from '@/lib/db';
import { DomainError, fromDb } from '@/lib/domain/money';
import { requireBusiness } from '@/lib/auth/context';
import { audit } from '@/lib/audit/audit';

const UpdateCustomerPromoSchema = z
  .object({
    label: z
      .string()
      .trim()
      .min(2, 'Nama/label promo minimal 2 karakter')
      .max(150)
      .optional(),
    isActive: z.boolean().optional(),
    validTo: z.coerce.date().optional().nullable(),
    note: z.string().trim().max(500).optional().nullable(),
  })
  .strict();

// GET /api/v1/customer-promos/:id - Ambil detail promo
export const GET = withApi(
  {
    roles: [Role.SUPERADMIN],
  },
  async ({ ctx, params }) => {
    const businessId = requireBusiness(ctx);

    const promo = await prisma.customerPromo.findFirst({
      where: {
        id: params.id,
        businessId,
        deletedAt: null,
      },
      include: {
        customer: {
          select: {
            id: true,
            code: true,
            name: true,
          },
        },
      },
    });

    if (!promo) {
      throw new DomainError('NOT_FOUND', 'Promo tidak ditemukan', 404);
    }

    return {
      data: {
        ...promo,
        valueAmount:
          promo.valueAmount !== null ? fromDb(promo.valueAmount) : null,
      },
    };
  }
);

// PATCH /api/v1/customer-promos/:id - Perbarui promo (status aktif, label, masa berlaku)
export const PATCH = withApi(
  {
    roles: [Role.SUPERADMIN],
    body: UpdateCustomerPromoSchema,
  },
  async ({ ctx, params, body }) => {
    const businessId = requireBusiness(ctx);

    const promo = await prisma.customerPromo.findFirst({
      where: {
        id: params.id,
        businessId,
        deletedAt: null,
      },
    });

    if (!promo) {
      throw new DomainError('NOT_FOUND', 'Promo tidak ditemukan', 404);
    }

    // Validasi validTo tidak lebih awal dari validFrom
    if (body.validTo !== undefined && body.validTo !== null) {
      if (body.validTo < promo.validFrom) {
        throw new DomainError(
          'INVALID_DATE_RANGE',
          'Tanggal selesai promo tidak boleh lebih awal dari tanggal mulai',
          422
        );
      }
    }

    const updated = await prisma.customerPromo.update({
      where: { id: promo.id },
      data: {
        ...(body.label !== undefined ? { label: body.label } : {}),
        ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
        ...(body.validTo !== undefined ? { validTo: body.validTo } : {}),
        ...(body.note !== undefined ? { note: body.note } : {}),
      },
    });

    await audit(prisma, ctx, {
      action: 'CUSTOMER_PROMO_UPDATE',
      entityType: 'CustomerPromo',
      entityId: updated.id,
      businessId,
      summary: `Perbarui promo "${updated.label}" (aktif: ${updated.isActive ? 'Ya' : 'Tidak'})`,
      before: promo,
      after: updated,
    });

    return {
      data: {
        ...updated,
        valueAmount:
          updated.valueAmount !== null ? fromDb(updated.valueAmount) : null,
      },
    };
  }
);

// DELETE /api/v1/customer-promos/:id - Hapus lunak promo
export const DELETE = withApi(
  {
    roles: [Role.SUPERADMIN],
  },
  async ({ ctx, params }) => {
    const businessId = requireBusiness(ctx);

    const promo = await prisma.customerPromo.findFirst({
      where: {
        id: params.id,
        businessId,
        deletedAt: null,
      },
    });

    if (!promo) {
      throw new DomainError('NOT_FOUND', 'Promo tidak ditemukan', 404);
    }

    await prisma.customerPromo.update({
      where: { id: promo.id },
      data: {
        deletedAt: new Date(),
        isActive: false,
      },
    });

    await audit(prisma, ctx, {
      action: 'CUSTOMER_PROMO_DELETE',
      entityType: 'CustomerPromo',
      entityId: promo.id,
      businessId,
      summary: `Hapus promo "${promo.label}"`,
      before: promo,
    });

    return {
      data: {
        success: true,
      },
    };
  }
);
