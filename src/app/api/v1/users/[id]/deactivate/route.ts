import { z } from 'zod';
import { withApi } from '@/lib/api/withApi';
import { prisma } from '@/lib/db';
import { DomainError } from '@/lib/domain/money';
import { audit } from '@/lib/audit/audit';
import { Role, OrderStatus } from '@prisma/client';

const DeactivateUserSchema = z
  .object({
    reassignToSalesId: z.string().trim().optional(),
    moveOpenOrders: z.boolean().default(false).optional(),
    unassignCustomers: z.boolean().default(false).optional(),
  })
  .optional();

export const POST = withApi(
  {
    roles: ['SUPERADMIN'],
    body: DeactivateUserSchema,
  },
  async ({ ctx, params, body }) => {
    const userId = params.id;

    if (ctx.user.id === userId) {
      throw new DomainError(
        'BAD_REQUEST',
        'Tidak dapat menonaktifkan akun sendiri',
        400
      );
    }

    const existing = await prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
    });

    if (!existing) {
      throw new DomainError('NOT_FOUND', 'Pengguna tidak ditemukan', 404);
    }

    const targetBusinessId = existing.businessId || ctx.businessId!;

    // Hitung pelanggan aktif yang terikat ke user ini
    const assignedCustomers = await prisma.customer.findMany({
      where: {
        businessId: targetBusinessId,
        assignedSalesId: userId,
        deletedAt: null,
      },
      select: {
        id: true,
        code: true,
        name: true,
      },
    });

    const customerCount = assignedCustomers.length;

    // Jika user memiliki pelanggan aktif dan belum ada instruksi pengalihan
    if (customerCount > 0 && !body?.reassignToSalesId && !body?.unassignCustomers) {
      throw new DomainError(
        'HANDOVER_REQUIRED',
        `Sales ini memiliki ${customerCount} pelanggan aktif. Pilih Sales pengganti untuk serah terima pelanggan sebelum menonaktifkan akun.`,
        409,
        {
          assignedCustomerCount: customerCount,
          customers: assignedCustomers,
        }
      );
    }

    let targetSales: { id: string; name: string; username: string } | null = null;
    if (body?.reassignToSalesId) {
      if (body.reassignToSalesId === userId) {
        throw new DomainError(
          'VALIDATION_ERROR',
          'Sales pengganti tidak boleh akun yang sedang dinonaktifkan',
          422
        );
      }

      const target = await prisma.user.findFirst({
        where: {
          id: body.reassignToSalesId,
          businessId: existing.businessId,
          role: Role.SALES,
          isActive: true,
          deletedAt: null,
        },
        select: {
          id: true,
          name: true,
          username: true,
        },
      });

      if (!target) {
        throw new DomainError(
          'VALIDATION_ERROR',
          'Sales pengganti tidak ditemukan atau tidak aktif di unit usaha ini',
          422
        );
      }
      targetSales = target;
    }

    await prisma.$transaction(async (tx) => {
      let movedOrderCount = 0;

      // Eksekusi pengalihan pelanggan jika ada
      if (customerCount > 0) {
        const newSalesId = targetSales ? targetSales.id : null;

        await tx.customer.updateMany({
          where: {
            businessId: targetBusinessId,
            assignedSalesId: userId,
            deletedAt: null,
          },
          data: {
            assignedSalesId: newSalesId,
            rev: { increment: 1 },
          },
        });

        if (newSalesId) {
          // Alihkan reminder aktif
          await tx.reminder.updateMany({
            where: {
              businessId: targetBusinessId,
              salesId: userId,
            },
            data: {
              salesId: newSalesId,
            },
          });

          // Alihkan tugas CRM follow-up belum selesai
          await tx.crmTask.updateMany({
            where: {
              businessId: targetBusinessId,
              assignedToId: userId,
              doneAt: null,
            },
            data: {
              assignedToId: newSalesId,
            },
          });

          // Alihkan order terbuka bila diminta
          if (body?.moveOpenOrders) {
            const orderRes = await tx.order.updateMany({
              where: {
                businessId: targetBusinessId,
                salesId: userId,
                status: {
                  notIn: [OrderStatus.COMPLETED, OrderStatus.CANCELLED],
                },
                deletedAt: null,
              },
              data: {
                salesId: newSalesId,
              },
            });
            movedOrderCount = orderRes.count;
          }
        }

        // Catat audit handover
        await audit(tx, ctx, {
          action: 'SALES_DEACTIVATE_HANDOVER',
          entityType: 'User',
          entityId: userId,
          businessId: existing.businessId,
          summary: `Serah terima ${customerCount} pelanggan dari ${existing.name} ke ${
            targetSales ? targetSales.name : 'Tanpa Sales'
          }${body?.moveOpenOrders ? ` beserta ${movedOrderCount} pesanan berjalan` : ''}`,
          before: {
            assignedCustomerCount: customerCount,
            salesId: userId,
          },
          after: {
            targetSalesId: newSalesId,
            reassignedCustomerCount: customerCount,
            movedOpenOrders: body?.moveOpenOrders ?? false,
            movedOrderCount,
          },
        });
      }

      // Nonaktifkan user
      await tx.user.update({
        where: { id: userId },
        data: {
          isActive: false,
        },
      });

      // Cabut seluruh sesi aktif
      await tx.session.updateMany({
        where: {
          userId,
          revokedAt: null,
        },
        data: {
          revokedAt: new Date(),
        },
      });

      await audit(tx, ctx, {
        action: 'USER_DEACTIVATE',
        entityType: 'User',
        entityId: userId,
        businessId: existing.businessId,
        summary: `Penonaktifan akun pengguna: ${existing.username} (${existing.name})`,
        before: { isActive: true },
        after: { isActive: false },
      });
    });

    return {
      data: {
        success: true,
        reassignedCustomerCount: customerCount,
        targetSales: targetSales ? targetSales.name : null,
      },
    };
  }
);
