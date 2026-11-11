import { z } from 'zod';
import { Role } from '@prisma/client';
import { withApi } from '@/lib/api/withApi';
import { prisma } from '@/lib/db';
import { DomainError } from '@/lib/domain/money';
import { requireBusiness } from '@/lib/auth/context';
import { audit } from '@/lib/audit/audit';
import { TAG_PENDING_VERIFIKASI_ADMIN } from '@/lib/services/customerCollision';

const VerifyCustomerSchema = z
  .object({
    action: z.enum(['APPROVE', 'REASSIGN', 'REJECT']),
    targetSalesId: z.string().trim().optional(),
    notes: z.string().trim().max(1000).optional(),
  })
  .strict();

/**
 * POST /api/v1/customers/:id/verify
 * Role: SUPERADMIN
 *
 * Menyelesaikan status verifikasi tabrakan pelanggan (PENDING_VERIFIKASI_ADMIN).
 * Aksi:
 * 1. APPROVE: Menghapus status penahanan, menyetujui toko sebagai entitas sah/cabang baru.
 * 2. REASSIGN: Mengalihkan kepemilikan toko ke sales lain & melepaskan penahanan.
 * 3. REJECT: Menolak dan menghapus (soft-delete) data toko duplikat.
 */
export const POST = withApi(
  {
    roles: [Role.SUPERADMIN],
    body: VerifyCustomerSchema,
  },
  async ({ ctx, params, body }) => {
    const businessId = requireBusiness(ctx);

    const customer = await prisma.customer.findFirst({
      where: {
        id: params.id,
        businessId,
        deletedAt: null,
      },
      include: {
        assignedSales: {
          select: {
            id: true,
            name: true,
            username: true,
          },
        },
      },
    });

    if (!customer) {
      throw new DomainError('NOT_FOUND', 'Pelanggan tidak ditemukan', 404);
    }

    const result = await prisma.$transaction(async (tx) => {
      // 1. Aksi APPROVE: Melepaskan tag verifikasi, toko aktif resmi
      if (body.action === 'APPROVE') {
        const cleanedTags = (customer.tags || []).filter(
          (t) => t !== TAG_PENDING_VERIFIKASI_ADMIN
        );
        const appendNote = `[VERIFIKASI DISETUJUI] Disetujui sebagai entitas/cabang resmi oleh Owner pada ${new Date().toLocaleString('id-ID')}${
          body.notes ? `. Catatan: ${body.notes}` : ''
        }`;
        const newNotes = customer.notes
          ? `${customer.notes}\n${appendNote}`
          : appendNote;

        const updated = await tx.customer.update({
          where: { id: customer.id },
          data: {
            tags: cleanedTags,
            notes: newNotes,
            rev: { increment: 1 },
          },
          include: {
            assignedSales: {
              select: {
                id: true,
                name: true,
                username: true,
              },
            },
          },
        });

        await audit(tx, ctx, {
          action: 'CUSTOMER_VERIFY_APPROVE',
          entityType: 'Customer',
          entityId: customer.id,
          businessId,
          summary: `Menyetujui toko [${customer.code}] ${customer.name} (melepaskan status PENDING_VERIFIKASI_ADMIN)`,
          before: customer,
          after: updated,
        });

        return updated;
      }

      // 2. Aksi REASSIGN: Mengalihkan sales pembina dan melepaskan tag verifikasi
      if (body.action === 'REASSIGN') {
        if (!body.targetSalesId) {
          throw new DomainError(
            'VALIDATION_ERROR',
            'targetSalesId wajib diisi untuk aksi REASSIGN',
            422
          );
        }

        const targetSales = await tx.user.findFirst({
          where: {
            id: body.targetSalesId,
            businessId,
            role: Role.SALES,
            isActive: true,
            deletedAt: null,
          },
        });

        if (!targetSales) {
          throw new DomainError(
            'VALIDATION_ERROR',
            'Staf sales tujuan tidak ditemukan atau tidak aktif',
            422
          );
        }

        const cleanedTags = (customer.tags || []).filter(
          (t) => t !== TAG_PENDING_VERIFIKASI_ADMIN
        );
        const appendNote = `[VERIFIKASI DIALIHKAN] Dialihkan ke sales ${targetSales.name} oleh Owner pada ${new Date().toLocaleString('id-ID')}${
          body.notes ? `. Catatan: ${body.notes}` : ''
        }`;
        const newNotes = customer.notes
          ? `${customer.notes}\n${appendNote}`
          : appendNote;

        const updated = await tx.customer.update({
          where: { id: customer.id },
          data: {
            assignedSalesId: targetSales.id,
            tags: cleanedTags,
            notes: newNotes,
            rev: { increment: 1 },
          },
          include: {
            assignedSales: {
              select: {
                id: true,
                name: true,
                username: true,
              },
            },
          },
        });

        await audit(tx, ctx, {
          action: 'CUSTOMER_VERIFY_REASSIGN',
          entityType: 'Customer',
          entityId: customer.id,
          businessId,
          summary: `Mengalihkan pembina toko [${customer.code}] ${customer.name} ke ${targetSales.name}`,
          before: customer,
          after: updated,
        });

        return updated;
      }

      // 3. Aksi REJECT: Menolak dan menghapus (soft-delete) data calon toko
      if (body.action === 'REJECT') {
        const appendNote = `[VERIFIKASI DITOLAK] Pendaftaran ditolak (toko duplikat) oleh Owner pada ${new Date().toLocaleString('id-ID')}${
          body.notes ? `. Alasan: ${body.notes}` : ''
        }`;
        const newNotes = customer.notes
          ? `${customer.notes}\n${appendNote}`
          : appendNote;

        const updated = await tx.customer.update({
          where: { id: customer.id },
          data: {
            deletedAt: new Date(),
            notes: newNotes,
            rev: { increment: 1 },
          },
        });

        await audit(tx, ctx, {
          action: 'CUSTOMER_VERIFY_REJECT',
          entityType: 'Customer',
          entityId: customer.id,
          businessId,
          summary: `Menolak pendaftaran toko [${customer.code}] ${customer.name} karena duplikasi data`,
          before: customer,
          after: updated,
        });

        return updated;
      }

      throw new DomainError('BAD_REQUEST', 'Aksi verifikasi tidak valid', 400);
    });

    return {
      status: 200,
      data: result,
      meta: {
        action: body.action,
        verifiedAt: new Date().toISOString(),
      },
    };
  }
);

