import { z } from 'zod';
import { Role, OrderStatus } from '@prisma/client';
import { withApi } from '@/lib/api/withApi';
import { prisma } from '@/lib/db';
import { DomainError } from '@/lib/domain/money';
import { requireBusiness } from '@/lib/auth/context';
import { audit } from '@/lib/audit/audit';

const ReassignCustomerSchema = z
  .object({
    salesId: z.string().trim().min(1, 'Target sales wajib dipilih'),
    moveOpenOrders: z.boolean().default(false).optional(),
  })
  .strict();

// POST /api/v1/customers/:id/reassign - Pengalihan pelanggan ke staf sales lain (Khusus Super Admin)
export const POST = withApi(
  {
    roles: [Role.SUPERADMIN],
    body: ReassignCustomerSchema,
  },
  async ({ ctx, params, body }) => {
    const businessId = requireBusiness(ctx);

    // 1. Ambil data pelanggan aktif di unit usaha ini
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

    // 2. Verifikasi staf sales tujuan
    const targetSales = await prisma.user.findFirst({
      where: {
        id: body.salesId,
        businessId,
        role: Role.SALES,
        isActive: true,
        deletedAt: null,
      },
    });

    if (!targetSales) {
      throw new DomainError(
        'VALIDATION_ERROR',
        'Staf sales tujuan tidak ditemukan atau tidak aktif di unit usaha ini',
        422
      );
    }

    // 3. Eksekusi pengalihan secara transaksional
    const result = await prisma.$transaction(async (tx) => {
      // a. Alihkan kepemilikan pelanggan
      const updatedCustomer = await tx.customer.update({
        where: { id: customer.id },
        data: {
          assignedSalesId: targetSales.id,
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

      // b. Alihkan pengingat aktif (Reminder)
      await tx.reminder.updateMany({
        where: {
          customerId: customer.id,
          businessId,
        },
        data: {
          salesId: targetSales.id,
        },
      });

      // c. Alihkan tugas CRM follow-up yang belum selesai (CrmTask)
      await tx.crmTask.updateMany({
        where: {
          customerId: customer.id,
          businessId,
          doneAt: null,
        },
        data: {
          assignedToId: targetSales.id,
        },
      });

      // d. Alihkan order berjalan jika opsi moveOpenOrders dipilih (Seksi 18.1 nomor 16)
      let movedOrderCount = 0;
      if (body.moveOpenOrders) {
        const orderUpdateResult = await tx.order.updateMany({
          where: {
            customerId: customer.id,
            businessId,
            status: {
              notIn: [OrderStatus.COMPLETED, OrderStatus.CANCELLED],
            },
            deletedAt: null,
          },
          data: {
            salesId: targetSales.id,
          },
        });
        movedOrderCount = orderUpdateResult.count;
      }

      // e. Catat ke audit log
      await audit(tx, ctx, {
        action: 'CUSTOMER_REASSIGN',
        entityType: 'Customer',
        entityId: customer.id,
        businessId,
        summary: `Mengalihkan pelanggan [${customer.code}] ${customer.name} dari ${
          customer.assignedSales?.name ?? 'Tanpa Sales'
        } ke ${targetSales.name}${
          body.moveOpenOrders
            ? ` beserta ${movedOrderCount} pesanan berjalan`
            : ''
        }`,
        before: {
          assignedSalesId: customer.assignedSalesId,
          assignedSalesName: customer.assignedSales?.name ?? null,
        },
        after: {
          assignedSalesId: targetSales.id,
          assignedSalesName: targetSales.name,
          movedOpenOrders: body.moveOpenOrders,
          movedOrderCount,
        },
      });

      return updatedCustomer;
    });

    return {
      data: {
        success: true,
        customer: result,
      },
    };
  }
);

