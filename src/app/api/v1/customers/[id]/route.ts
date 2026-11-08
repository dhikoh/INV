import { z } from 'zod';
import { Role, PipelineStage, OrderStatus } from '@prisma/client';
import { withApi } from '@/lib/api/withApi';
import { prisma } from '@/lib/db';
import { DomainError } from '@/lib/domain/money';
import { requireBusiness } from '@/lib/auth/context';
import { customerScope } from '@/lib/services/scopes';
import { audit } from '@/lib/audit/audit';

const UpdateCustomerSchema = z
  .object({
    rev: z.number().int('Revisi (rev) harus bilangan bulat'),
    code: z
      .string()
      .trim()
      .min(2, 'Kode pelanggan minimal 2 karakter')
      .max(30, 'Kode pelanggan maksimal 30 karakter')
      .transform((v) => v.toUpperCase())
      .optional(),
    name: z
      .string()
      .trim()
      .min(2, 'Nama pelanggan minimal 2 karakter')
      .max(150, 'Nama pelanggan maksimal 150 karakter')
      .optional(),
    contactName: z.string().trim().max(100).optional().nullable(),
    phone: z.string().trim().max(50).optional().nullable(),
    address: z.string().trim().max(1000).optional().nullable(),
    shippingAddress: z.string().trim().max(1000).optional().nullable(),
    billingAddress: z.string().trim().max(1000).optional().nullable(),
    npwp: z.string().trim().max(50).optional().nullable(),
    assignedSalesId: z.string().optional().nullable(),
    pipelineStage: z.nativeEnum(PipelineStage).optional(),
    tags: z
      .array(
        z
          .string()
          .trim()
          .min(1, 'Tag minimal 1 karakter')
          .max(50, 'Tag maksimal 50 karakter')
      )
      .optional(),
    notes: z.string().trim().max(2000).optional().nullable(),
  })
  .strict();

const DeleteCustomerSchema = z
  .object({
    confirm: z.string().optional(),
  })
  .optional();

// GET /api/v1/customers/:id - Detail pelanggan
export const GET = withApi(
  {
    roles: [Role.SUPERADMIN, Role.SALES],
  },
  async ({ ctx, params }) => {
    const businessId = requireBusiness(ctx);
    const scope = customerScope(ctx, businessId);

    const customer = await prisma.customer.findFirst({
      where: {
        ...scope,
        id: params.id,
      },
      include: {
        assignedSales: {
          select: {
            id: true,
            name: true,
            username: true,
          },
        },
        _count: {
          select: {
            orders: true,
            customerPromos: true,
            crmInteractions: true,
            crmTasks: true,
          },
        },
      },
    });

    if (!customer) {
      throw new DomainError('NOT_FOUND', 'Pelanggan tidak ditemukan', 404);
    }

    return {
      data: customer,
    };
  }
);

// PATCH /api/v1/customers/:id - Perbarui data pelanggan
export const PATCH = withApi(
  {
    roles: [Role.SUPERADMIN, Role.SALES],
    body: UpdateCustomerSchema,
  },
  async ({ ctx, params, body }) => {
    const businessId = requireBusiness(ctx);
    const scope = customerScope(ctx, businessId);

    // 1. Ambil data pelanggan yang masih aktif dan sesuai scope hak akses
    const existing = await prisma.customer.findFirst({
      where: {
        ...scope,
        id: params.id,
      },
    });

    if (!existing) {
      throw new DomainError('NOT_FOUND', 'Pelanggan tidak ditemukan', 404);
    }

    // 2. Penguncian optimistik: verifikasi rev
    if (existing.rev !== body.rev) {
      throw new DomainError(
        'OPTIMISTIC_LOCK_ERROR',
        'Data pelanggan telah diubah oleh pengguna lain. Silakan muat ulang.',
        409
      );
    }

    // 3. Aturan imutabilitas kode pelanggan setelah ada faktur/invoice (Seksi 18.1 nomor 15)
    if (body.code && body.code !== existing.code) {
      const invoiceCount = await prisma.invoice.count({
        where: {
          customerId: existing.id,
          businessId,
        },
      });

      if (invoiceCount > 0) {
        throw new DomainError(
          'INVALID_STATE',
          'Kode pelanggan tidak dapat diubah setelah memiliki faktur/invoice',
          409
        );
      }

      // Periksa keunikan kode baru di unit usaha ini
      const duplicateCode = await prisma.customer.findFirst({
        where: {
          businessId,
          code: body.code,
          id: { not: existing.id },
          deletedAt: null,
        },
      });

      if (duplicateCode) {
        throw new DomainError(
          'DUPLICATE',
          `Kode pelanggan "${body.code}" sudah digunakan oleh pelanggan lain di unit usaha ini`,
          409
        );
      }
    }

    // 4. Pengalihan sales: Sales tidak berhak mengubah assignedSalesId
    let nextAssignedSalesId = existing.assignedSalesId;

    if (body.assignedSalesId !== undefined) {
      if (ctx.role === Role.SALES) {
        if (body.assignedSalesId !== existing.assignedSalesId) {
          throw new DomainError(
            'FORBIDDEN',
            'Hanya Super Admin yang berhak mengalihkan staf sales pelanggan',
            403
          );
        }
      } else {
        if (body.assignedSalesId) {
          const targetSales = await prisma.user.findFirst({
            where: {
              id: body.assignedSalesId,
              businessId,
              role: Role.SALES,
              isActive: true,
              deletedAt: null,
            },
          });

          if (!targetSales) {
            throw new DomainError(
              'VALIDATION_ERROR',
              'Staf sales yang dipilih tidak valid atau tidak aktif di unit usaha ini',
              422
            );
          }
          nextAssignedSalesId = targetSales.id;
        } else {
          nextAssignedSalesId = null;
        }
      }
    }

    // 5. Eksekusi pembaruan data secara transaksional
    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.customer.update({
        where: { id: existing.id },
        data: {
          ...(body.code !== undefined ? { code: body.code } : {}),
          ...(body.name !== undefined ? { name: body.name } : {}),
          ...(body.contactName !== undefined
            ? { contactName: body.contactName }
            : {}),
          ...(body.phone !== undefined ? { phone: body.phone } : {}),
          ...(body.address !== undefined ? { address: body.address } : {}),
          ...(body.shippingAddress !== undefined
            ? { shippingAddress: body.shippingAddress }
            : {}),
          ...(body.billingAddress !== undefined
            ? { billingAddress: body.billingAddress }
            : {}),
          ...(body.npwp !== undefined ? { npwp: body.npwp } : {}),
          assignedSalesId: nextAssignedSalesId,
          ...(body.pipelineStage !== undefined
            ? { pipelineStage: body.pipelineStage }
            : {}),
          ...(body.tags !== undefined ? { tags: body.tags } : {}),
          ...(body.notes !== undefined ? { notes: body.notes } : {}),
          rev: existing.rev + 1,
        },
        include: {
          assignedSales: {
            select: {
              id: true,
              name: true,
              username: true,
            },
          },
          _count: {
            select: {
              orders: true,
            },
          },
        },
      });

      await audit(tx, ctx, {
        action: 'CUSTOMER_UPDATE',
        entityType: 'Customer',
        entityId: existing.id,
        businessId,
        summary: `Pembaruan data pelanggan: [${result.code}] ${result.name}`,
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

// DELETE /api/v1/customers/:id - Soft delete pelanggan (SA + Sales, butuh konfirmasi & cek order berjalan)
export const DELETE = withApi(
  {
    roles: [Role.SUPERADMIN, Role.SALES],
    body: DeleteCustomerSchema,
  },
  async ({ ctx, params, body, req }) => {
    const businessId = requireBusiness(ctx);
    const scope = customerScope(ctx, businessId);

    const existing = await prisma.customer.findFirst({
      where: {
        ...scope,
        id: params.id,
      },
    });

    if (!existing) {
      throw new DomainError('NOT_FOUND', 'Pelanggan tidak ditemukan', 404);
    }

    // 1. Verifikasi teks konfirmasi penghapusan (nama atau kode pelanggan)
    const confirmVal =
      body?.confirm || req.nextUrl.searchParams.get('confirm') || '';

    const expectedName = existing.name.trim();
    const expectedCode = existing.code.trim();

    if (
      confirmVal.trim() !== expectedName &&
      confirmVal.trim() !== expectedCode
    ) {
      throw new DomainError(
        'VALIDATION_ERROR',
        `Konfirmasi nama ("${expectedName}") atau kode ("${expectedCode}") tidak cocok`,
        422
      );
    }

    // 2. Pemeriksaan integritas order berjalan (Seksi 18.1 nomor 19)
    // Order berjalan = status selain COMPLETED dan CANCELLED
    const activeOrderCount = await prisma.order.count({
      where: {
        customerId: existing.id,
        businessId,
        status: {
          notIn: [OrderStatus.COMPLETED, OrderStatus.CANCELLED],
        },
        deletedAt: null,
      },
    });

    if (activeOrderCount > 0) {
      throw new DomainError(
        'HAS_ACTIVE_ORDERS',
        `Pelanggan tidak dapat dihapus karena masih memiliki ${activeOrderCount} pesanan berjalan yang belum selesai atau dibatalkan`,
        409
      );
    }

    // 3. Eksekusi soft delete
    const result = await prisma.$transaction(async (tx) => {
      const softDeleted = await tx.customer.update({
        where: { id: existing.id },
        data: {
          deletedAt: new Date(),
        },
      });

      await audit(tx, ctx, {
        action: 'CUSTOMER_DELETE',
        entityType: 'Customer',
        entityId: existing.id,
        businessId,
        summary: `Soft delete pelanggan: [${existing.code}] ${existing.name}`,
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

