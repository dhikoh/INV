import {
  Prisma,
  OrderStatus,
  InvoiceStatus,
  InvoiceType,
  InvoiceTheme,
  Role,
} from '@prisma/client';
import { DomainError, formatRupiah } from '../domain/money';
import { orderNumber, invoiceNumber } from '../domain/numbering';
import { nextSeq, CounterScope } from './counter';
import { lockOrder, assertStatus, assertRev } from './orderGuard';
import { reserveOrderStock } from './stock';
import { buildInvoiceSnapshot } from '../pdf/snapshot';
import { formatOrderDto, formatInvoiceDto } from './order';
import { prisma } from '@/lib/db';
import type { Ctx } from '../auth/context';
import type { InvoiceApproveInput, InvoiceRejectInput } from '../validation/invoice';

export type TxClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

/**
 * Menyetujui pengajuan pesanan dan faktur (Approve Invoice).
 *
 * Efek samping (Seksi 8.2 & Seksi 19.5 T3.2):
 * 1. Kunci pesimistik baris pesanan `lockOrder(tx, orderId, businessId)`.
 * 2. Validasi status invoice PENDING_APPROVAL dan status order PENDING_APPROVAL/FINAL_PENDING_APPROVAL.
 * 3. Validasi optimistik revisi `rev`.
 * 4. Bila `order.hasBelowMin = true`, catatan override (`overrideNote`) wajib diisi minimal 5 karakter (422 OVERRIDE_NOTE_REQUIRED).
 * 5. Cek ketersediaan dan reservasi stok produk (`reserveOrderStock`). Menolak 409 INSUFFICIENT_STOCK jika allowNegativeStock mati.
 * 6. Alokasi nomor resmi pesanan (`orderNo`) dan urutan pelanggan (`customerSeq`) bila belum ada (pertama kali invoice disetujui).
 * 7. Alokasi nomor invoice resmi (`invoiceNumber`, contoh: CUST/INV/...-DP, -LNS, atau -DP-R1).
 * 8. Pembuatan dan penyimpanan `InvoiceSnapshot` statis anti-kebocoran data.
 * 9. Transisi status invoice menjadi APPROVED dan status order menjadi AWAITING_DP (bila DP) atau AWAITING_FINAL_PAYMENT.
 * 10. Pencatatan AuditLog (INVOICE_APPROVE) dan Notifikasi untuk staf Sales.
 */
export async function approveInvoice(
  tx: TxClient,
  ctx: Ctx,
  invoiceId: string,
  options?: InvoiceApproveInput
) {
  if (ctx.user.role !== Role.SUPERADMIN) {
    throw new DomainError('FORBIDDEN', 'Hanya Super Admin yang berhak menyetujui faktur', 403);
  }

  const businessId = ctx.businessId ?? ctx.user.businessId;
  if (!businessId) {
    throw new DomainError('BUSINESS_REQUIRED', 'Unit usaha aktif diperlukan', 400);
  }

  const invoice = await tx.invoice.findFirst({
    where: { id: invoiceId, businessId, deletedAt: null },
  });

  if (!invoice) {
    throw new DomainError('INVOICE_NOT_FOUND', 'Invoice tidak ditemukan', 404);
  }

  // Kunci baris order secara pesimistik
  await lockOrder(tx, invoice.orderId, businessId);

  const order = await tx.order.findFirst({
    where: { id: invoice.orderId, businessId, deletedAt: null },
    include: {
      customer: true,
      items: true,
    },
  });

  if (!order || !order.customer) {
    throw new DomainError('ORDER_NOT_FOUND', 'Pesanan tidak ditemukan', 404);
  }

  // Validasi status
  assertStatus(invoice.status, [InvoiceStatus.PENDING_APPROVAL], 'approve');
  assertStatus(
    order.status,
    [OrderStatus.PENDING_APPROVAL, OrderStatus.FINAL_PENDING_APPROVAL],
    'approve'
  );

  // Validasi kunci optimistik bila dikirim
  if (options?.rev !== undefined) {
    if (options.rev !== order.rev && options.rev !== invoice.rev) {
      assertRev(options.rev, order.rev);
    }
  }

  // Validasi aturan override harga di bawah minimal (Seksi 7.11)
  const overrideNote = options?.overrideNote?.trim();
  if (order.hasBelowMin) {
    if (!overrideNote || overrideNote.length < 5) {
      throw new DomainError(
        'OVERRIDE_NOTE_REQUIRED',
        'Catatan persetujuan khusus (override) wajib diisi minimal 5 karakter untuk pesanan di bawah harga minimal',
        422
      );
    }
  }

  const business = await tx.business.findUnique({
    where: { id: businessId },
  });

  if (!business) {
    throw new DomainError('BUSINESS_NOT_FOUND', 'Data usaha tidak ditemukan', 404);
  }

  // Reservasi stok produk (Seksi 7.9)
  await reserveOrderStock(
    tx,
    { id: order.id, businessId: order.businessId, stockReserved: order.stockReserved },
    order.items.map((i) => ({ productId: i.productId, qty: i.qty })),
    business.allowNegativeStock
  );

  // Alokasi nomor order resmi bila belum dialokasikan
  const now = new Date();
  let orderNo = order.orderNo;
  let customerSeq = order.customerSeq;

  if (!orderNo || customerSeq === null) {
    customerSeq = await nextSeq(tx, businessId, CounterScope.ORDER_SEQ, order.customerId);
    orderNo = orderNumber(order.customer.code, now, customerSeq);
  }

  // Alokasi nomor invoice resmi (Seksi 7.8)
  const invNumber = invoiceNumber(orderNo, invoice.type as 'DP' | 'FINAL', invoice.version);

  // Tanggal issueDate & dueDate
  const issueDate = now;
  const dueDate = options?.dueDate
    ? new Date(options.dueDate)
    : new Date(now.getTime() + (business.dueDays ?? 7) * 24 * 60 * 60 * 1000);
  const theme = options?.theme ?? business.invoiceTheme ?? InvoiceTheme.PROFESIONAL;

  // Bangun snapshot statis
  const snapshot = await buildInvoiceSnapshot(tx, invoice.id, {
    number: invNumber,
    issueDate,
    dueDate,
    theme,
  });

  // Perbarui invoice menjadi APPROVED
  await tx.invoice.updateMany({
    where: { id: invoice.id, businessId },
    data: {
      status: InvoiceStatus.APPROVED,
      number: invNumber,
      issueDate,
      dueDate,
      theme,
      snapshot: snapshot as unknown as Prisma.InputJsonValue,
      approvedById: ctx.user.id,
      approvedAt: now,
      rev: { increment: 1 },
    },
  });

  // Tentukan status order baru (Seksi 8.1 & 8.2)
  const nextOrderStatus =
    invoice.type === InvoiceType.DP
      ? OrderStatus.AWAITING_DP
      : OrderStatus.AWAITING_FINAL_PAYMENT;

  await tx.order.updateMany({
    where: { id: order.id, businessId },
    data: {
      orderNo,
      customerSeq,
      status: nextOrderStatus,
      overrideNote: overrideNote || order.overrideNote,
      rev: { increment: 1 },
    },
  });

  // Catat AuditLog
  await tx.auditLog.create({
    data: {
      businessId,
      actorId: ctx.user.id,
      actorRole: ctx.user.role,
      action: 'INVOICE_APPROVE',
      entityType: 'Invoice',
      entityId: invoice.id,
      summary: `Invoice ${invoice.type} #${invNumber} disetujui untuk pesanan #${orderNo} (${formatRupiah(Number(invoice.amount))})`,
      reason: overrideNote || undefined,
    },
  });

  // Buat Notifikasi ke staf Sales pembuat order
  await tx.notification.create({
    data: {
      businessId,
      userId: order.salesId,
      type: 'APPROVAL_RESULT',
      title: 'Pesanan Disetujui',
      body: `Invoice ${invoice.type} #${invNumber} untuk pesanan #${orderNo} telah disetujui oleh ${ctx.user.name}`,
      linkPath: `/orders/${order.id}`,
      dedupeKey: `approve_${invoice.id}_${order.salesId}`,
    },
  });

  const [updatedOrder, updatedInvoice] = await Promise.all([
    tx.order.findFirstOrThrow({
      where: { id: order.id, businessId },
      include: { customer: true, items: true },
    }),
    tx.invoice.findFirstOrThrow({
      where: { id: invoice.id, businessId },
    }),
  ]);

  return {
    order: formatOrderDto(updatedOrder, ctx.user.role),
    invoice: formatInvoiceDto(updatedInvoice),
  };
}

/**
 * Menolak pengajuan pesanan dan faktur / Meminta Revisi (Reject Invoice).
 *
 * Efek samping (Seksi 8.2 & Seksi 19.5 T3.2):
 * 1. Kunci pesimistik baris pesanan `lockOrder(tx, orderId, businessId)`.
 * 2. Validasi status invoice PENDING_APPROVAL.
 * 3. Validasi alasan penolakan (`reason`) wajib minimal 5 karakter (422 REJECT_REASON_REQUIRED).
 * 4. Pembaruan status invoice menjadi REJECTED.
 * 5. Transisi status order menjadi REVISION_REQUIRED (atau IN_PROCESS bila invoice final ditolak).
 * 6. Increment versi revisi order `Order.version = Order.version + 1` dan `Order.rev`.
 * 7. Pencatatan AuditLog (INVOICE_REJECT) dan Notifikasi untuk staf Sales.
 */
export async function rejectInvoice(
  tx: TxClient,
  ctx: Ctx,
  invoiceId: string,
  options: InvoiceRejectInput
) {
  if (ctx.user.role !== Role.SUPERADMIN) {
    throw new DomainError('FORBIDDEN', 'Hanya Super Admin yang berhak menolak faktur', 403);
  }

  const businessId = ctx.businessId ?? ctx.user.businessId;
  if (!businessId) {
    throw new DomainError('BUSINESS_REQUIRED', 'Unit usaha aktif diperlukan', 400);
  }

  const reason = options.reason?.trim();
  if (!reason || reason.length < 5) {
    throw new DomainError(
      'REJECT_REASON_REQUIRED',
      'Alasan penolakan / revisi wajib diisi minimal 5 karakter',
      422
    );
  }

  const invoice = await tx.invoice.findFirst({
    where: { id: invoiceId, businessId, deletedAt: null },
  });

  if (!invoice) {
    throw new DomainError('INVOICE_NOT_FOUND', 'Invoice tidak ditemukan', 404);
  }

  // Kunci pesimistik
  await lockOrder(tx, invoice.orderId, businessId);

  const order = await tx.order.findFirst({
    where: { id: invoice.orderId, businessId, deletedAt: null },
    include: { customer: true, items: true },
  });

  if (!order) {
    throw new DomainError('ORDER_NOT_FOUND', 'Pesanan tidak ditemukan', 404);
  }

  // Validasi status
  assertStatus(invoice.status, [InvoiceStatus.PENDING_APPROVAL], 'reject');
  assertStatus(
    order.status,
    [OrderStatus.PENDING_APPROVAL, OrderStatus.FINAL_PENDING_APPROVAL],
    'reject'
  );

  // Kunci optimistik
  if (options.rev !== undefined) {
    if (options.rev !== order.rev && options.rev !== invoice.rev) {
      assertRev(options.rev, order.rev);
    }
  }

  // Update invoice menjadi REJECTED
  await tx.invoice.updateMany({
    where: { id: invoice.id, businessId },
    data: {
      status: InvoiceStatus.REJECTED,
      rejectReason: reason,
      rev: { increment: 1 },
    },
  });

  // Tentukan status order baru (Seksi 8.1 & 8.2):
  // Bila dari PENDING_APPROVAL -> REVISION_REQUIRED
  // Bila dari FINAL_PENDING_APPROVAL -> IN_PROCESS
  const nextOrderStatus =
    order.status === OrderStatus.FINAL_PENDING_APPROVAL
      ? OrderStatus.IN_PROCESS
      : OrderStatus.REVISION_REQUIRED;

  await tx.order.updateMany({
    where: { id: order.id, businessId },
    data: {
      status: nextOrderStatus,
      rejectReason: reason,
      version: order.version + 1, // Naik tiap kali ditolak / minta revisi
      rev: { increment: 1 },
    },
  });

  // Catat AuditLog
  await tx.auditLog.create({
    data: {
      businessId,
      actorId: ctx.user.id,
      actorRole: ctx.user.role,
      action: 'INVOICE_REJECT',
      entityType: 'Invoice',
      entityId: invoice.id,
      summary: `Invoice ${invoice.type} v${invoice.version} ditolak: ${reason}`,
      reason,
    },
  });

  // Buat Notifikasi ke staf Sales
  await tx.notification.create({
    data: {
      businessId,
      userId: order.salesId,
      type: 'APPROVAL_RESULT',
      title: 'Pesanan Membutuhkan Revisi',
      body: `Pengajuan invoice ${invoice.type} v${invoice.version} pesanan #${order.orderNo || order.id.slice(-6)} ditolak oleh ${ctx.user.name}: ${reason}`,
      linkPath: `/orders/${order.id}`,
      dedupeKey: `reject_${invoice.id}_${order.salesId}`,
    },
  });

  const [updatedOrder, updatedInvoice] = await Promise.all([
    tx.order.findFirstOrThrow({
      where: { id: order.id, businessId },
      include: { customer: true, items: true },
    }),
    tx.invoice.findFirstOrThrow({
      where: { id: invoice.id, businessId },
    }),
  ]);

  return {
    order: formatOrderDto(updatedOrder, ctx.user.role),
    invoice: formatInvoiceDto(updatedInvoice),
  };
}
