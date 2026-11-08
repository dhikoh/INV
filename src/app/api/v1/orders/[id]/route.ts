import { withApi } from '@/lib/api/withApi';
import { requireBusiness } from '@/lib/auth/context';
import { prisma } from '@/lib/db';
import { OrderUpdateSchema, OrderDeleteSchema } from '@/lib/validation/order';
import { buildOrderSnapshot, formatOrderDto, formatInvoiceDto } from '@/lib/services/order';
import { formatRupiah, DomainError } from '@/lib/domain/money';
import { OrderStatus, InvoiceStatus, Role } from '@prisma/client';

/**
 * GET /api/v1/orders/:id
 * Role: SUPERADMIN & SALES
 *
 * Mengambil detail lengkap order beserta item. Staf sales hanya dapat mengakses order miliknya
 * sendiri (404 bila bukan). Garansi mutlak: data HPP/profit tidak bocor ke Sales.
 *
 * Rujukan: Seksi 10.5 Dokumen Spesifikasi.
 */
export const GET = withApi(
  {
    roles: [Role.SUPERADMIN, Role.SALES],
  },
  async ({ ctx, params }) => {
  const businessId = requireBusiness(ctx);
  const { id } = params;

  const order = await prisma.order.findFirst({
    where: {
      id,
      businessId,
      deletedAt: null,
    },
    include: {
      customer: {
        select: { id: true, code: true, name: true },
      },
      items: {
        orderBy: { sortOrder: 'asc' },
      },
    },
  });

  if (!order) {
    throw new DomainError('ORDER_NOT_FOUND', 'Order tidak ditemukan', 404);
  }

  // Isolasi hak akses Sales: Sales hanya melihat order miliknya sendiri
  if (ctx.user.role === Role.SALES && order.salesId !== ctx.user.id) {
    throw new DomainError('ORDER_NOT_FOUND', 'Order tidak ditemukan', 404);
  }

  // Ambil semua invoice untuk order ini
  const allInvoices = typeof prisma.invoice?.findMany === 'function'
    ? await prisma.invoice.findMany({
        where: {
          orderId: order.id,
          businessId,
          deletedAt: null,
        },
        orderBy: [{ createdAt: 'asc' }],
      })
    : [];

  const pendingInvoice = allInvoices.find(
    (inv) => inv.status === InvoiceStatus.PENDING_APPROVAL
  ) ?? (typeof prisma.invoice?.findFirst === 'function'
    ? await prisma.invoice.findFirst({
        where: {
          orderId: order.id,
          businessId,
          status: InvoiceStatus.PENDING_APPROVAL,
          deletedAt: null,
        },
        orderBy: { requestedAt: 'desc' },
      })
    : null);

  return {
    status: 200,
    data: {
      ...formatOrderDto(order, ctx.user.role),
      pendingInvoice: pendingInvoice ? formatInvoiceDto(pendingInvoice) : null,
      invoices: allInvoices.map(formatInvoiceDto),
    },
  };
});

/**
 * PATCH /api/v1/orders/:id
 * Role: SUPERADMIN & SALES
 *
 * Memperbarui order draf. Hanya diperbolehkan pada order berstatus DRAFT atau REVISION_REQUIRED.
 * Mewajibkan penguncian optimistik versi (rev).
 *
 * Rujukan: Seksi 10.4 & 10.5 Dokumen Spesifikasi.
 */
export const PATCH = withApi(
  {
    roles: [Role.SUPERADMIN, Role.SALES],
    body: OrderUpdateSchema,
  },
  async ({ ctx, params, body }) => {
    const businessId = requireBusiness(ctx);
    const { id } = params;

    const updated = await prisma.$transaction(async (tx) => {
      const existing = await tx.order.findFirst({
        where: {
          id,
          businessId,
          deletedAt: null,
        },
        include: {
          items: true,
        },
      });

      if (!existing) {
        throw new DomainError('ORDER_NOT_FOUND', 'Order tidak ditemukan', 404);
      }

      // Isolasi sales
      if (ctx.user.role === Role.SALES && existing.salesId !== ctx.user.id) {
        throw new DomainError('ORDER_NOT_FOUND', 'Order tidak ditemukan', 404);
      }

      // Hanya DRAFT atau REVISION_REQUIRED yang boleh diubah lewat PATCH
      if (
        existing.status !== OrderStatus.DRAFT &&
        existing.status !== OrderStatus.REVISION_REQUIRED
      ) {
        throw new DomainError(
          'INVALID_STATE',
          'Hanya order berstatus DRAFT atau REVISION_REQUIRED yang dapat diubah',
          409
        );
      }

      // Penguncian optimistik (rev)
      if (existing.rev !== body.rev) {
        throw new DomainError(
          'OPTIMISTIC_LOCK_ERROR',
          'Data order telah diubah pengguna lain, silakan muat ulang halaman',
          409
        );
      }

      const snapshot = await buildOrderSnapshot(tx, ctx, body);

      // Hapus item lama, ganti dengan item snapshot baru
      await tx.orderItem.deleteMany({
        where: { orderId: existing.id },
      });

      const updatedOrder = await tx.order.update({
        where: { id: existing.id },
        data: {
          customerId: snapshot.customer.id,
          deliveryAddress: body.deliveryAddress ?? null,
          notes: body.notes ?? null,
          repeatIntervalDays: body.repeatIntervalDays ?? null,
          subtotal: BigInt(snapshot.totals.subtotal),
          discountTotal: BigInt(snapshot.totals.discountTotal),
          shippingCharge: BigInt(snapshot.totals.shippingCharge),
          ppnEnabled: snapshot.business.ppnEnabled,
          ppnRateBps: snapshot.business.ppnRateBps,
          ppnAmount: BigInt(snapshot.totals.ppnAmount),
          grandTotal: BigInt(snapshot.totals.grandTotal),
          dpBps: snapshot.dpBps,
          dpAmount: BigInt(snapshot.totals.dpAmount),
          hasBelowMin: snapshot.hasBelowMin,
          belowMinReason: body.belowMinReason ?? null,
          rev: existing.rev + 1,
          items: {
            create: snapshot.lines.map((l) => ({
              businessId,
              productId: l.productId,
              productName: l.productName,
              sku: l.sku,
              unit: l.unit,
              qty: l.qty,
              listPrice: BigInt(l.listPrice),
              unitPrice: BigInt(l.unitPrice),
              discountType: l.discountType,
              discountValue: BigInt(l.discountValue),
              discountSource: l.discountSource,
              lineSubtotal: BigInt(l.lineSubtotal),
              lineDiscount: BigInt(l.lineDiscount),
              lineNet: BigInt(l.lineNet),
              costPrice: BigInt(l.costPrice),
              floorPrice: BigInt(l.floorPrice),
              belowMin: l.belowMin,
              sortOrder: l.sortOrder,
            })),
          },
        },
        include: {
          customer: {
            select: { id: true, code: true, name: true },
          },
          items: true,
        },
      });

      await tx.auditLog.create({
        data: {
          businessId,
          actorId: ctx.user.id,
          actorRole: ctx.user.role,
          action: 'ORDER_UPDATE',
          entityType: 'Order',
          entityId: updatedOrder.id,
          summary: `Order ${updatedOrder.orderNo ?? updatedOrder.id} diperbarui menjadi Rp ${formatRupiah(snapshot.totals.grandTotal)}`,
          before: {
            grandTotal: Number(existing.grandTotal),
            rev: existing.rev,
          },
          after: {
            grandTotal: snapshot.totals.grandTotal,
            rev: updatedOrder.rev,
          },
        },
      });

      return updatedOrder;
    });

    return {
      status: 200,
      data: formatOrderDto(updated, ctx.user.role),
    };
  }
);

/**
 * DELETE /api/v1/orders/:id
 * Role: SUPERADMIN ONLY (Sales ditolak 403 FORBIDDEN)
 *
 * Menghapus (soft delete) order. Mewajibkan konfirmasi nomor order (atau id bila belum bernomor).
 *
 * Rujukan: Seksi 9.5 & 10.5 Dokumen Spesifikasi.
 */
export const DELETE = withApi(
  {
    roles: [Role.SUPERADMIN],
    body: OrderDeleteSchema,
  },
  async ({ ctx, params, body }) => {
    requireBusiness(ctx);
    const { id } = params;

    const existing = await prisma.order.findFirst({
      where: {
        id,
        deletedAt: null,
      },
    });

    if (!existing) {
      throw new DomainError('ORDER_NOT_FOUND', 'Order tidak ditemukan', 404);
    }

    // Validasi konfirmasi ketik ulang nomor dokumen (atau id bila belum memiliki orderNo)
    const expectedConfirm = existing.orderNo ?? existing.id;
    if (body.confirm.trim() !== expectedConfirm.trim()) {
      throw new DomainError(
        'CONFIRM_MISMATCH',
        `Teks konfirmasi salah. Ketik "${expectedConfirm}" untuk menghapus order ini`,
        422
      );
    }

    await prisma.$transaction(async (tx) => {
      await tx.order.update({
        where: { id: existing.id },
        data: {
          deletedAt: new Date(),
        },
      });

      await tx.auditLog.create({
        data: {
          businessId: existing.businessId,
          actorId: ctx.user.id,
          actorRole: ctx.user.role,
          action: 'ORDER_DELETE',
          entityType: 'Order',
          entityId: existing.id,
          summary: `Order ${expectedConfirm} dihapus ke Tempat Sampah`,
          before: {
            status: existing.status,
            orderNo: existing.orderNo,
            grandTotal: Number(existing.grandTotal),
          },
        },
      });
    });

    return {
      status: 200,
      data: {
        message: 'Order berhasil dihapus',
        id: existing.id,
      },
    };
  }
);
