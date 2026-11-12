import {
  Role,
  OrderStatus,
  InvoiceStatus,
  InvoiceType,
  PaymentStatus,
  PaymentType,
  PaymentMethod,
  ShipStatus,
} from '@prisma/client';
import { prisma } from '@/lib/db';
import { DomainError, formatRupiah } from '../domain/money';
import { lockOrder } from './orderGuard';
import { Ctx } from '../auth/context';
import { evaluateOrderCommission } from './commission';
import { updateRemindersForCompletedOrder } from './reminder';

export type TxClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

export interface PaymentDto {
  id: string;
  businessId: string;
  orderId: string;
  invoiceId: string | null;
  type: PaymentType;
  method: PaymentMethod;
  status: PaymentStatus;
  amount: number;
  paidAt: string;
  reference: string | null;
  proofPath: string | null;
  notes: string | null;
  createdById: string;
  verifiedById: string | null;
  verifiedAt: string | null;
  rejectReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export function formatPaymentDto(p: {
  id: string;
  businessId: string;
  orderId: string;
  invoiceId: string | null;
  type: PaymentType;
  method: PaymentMethod;
  status: PaymentStatus;
  amount: bigint;
  paidAt: Date;
  reference: string | null;
  proofPath: string | null;
  notes: string | null;
  createdById: string;
  verifiedById: string | null;
  verifiedAt: Date | null;
  rejectReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}): PaymentDto {
  return {
    id: p.id,
    businessId: p.businessId,
    orderId: p.orderId,
    invoiceId: p.invoiceId,
    type: p.type,
    method: p.method,
    status: p.status,
    amount: Number(p.amount),
    paidAt: p.paidAt.toISOString(),
    reference: p.reference,
    proofPath: p.proofPath,
    notes: p.notes,
    createdById: p.createdById,
    verifiedById: p.verifiedById,
    verifiedAt: p.verifiedAt ? p.verifiedAt.toISOString() : null,
    rejectReason: p.rejectReason,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}

/**
 * Menghitung ulang Order.paidTotal dan Invoice.paidAmount langsung dari sumbernya
 * (seluruh Payment berstatus VERIFIED yang belum dihapus).
 *
 * Rujukan: Seksi 8.4 Dokumen Spesifikasi.
 */
export async function recalculateOrderPayments(
  tx: TxClient,
  orderId: string,
  businessId: string
): Promise<{ paidTotal: bigint }> {
  // 1. Ambil seluruh payment VERIFIED untuk order ini
  const verifiedPayments = await tx.payment.findMany({
    where: {
      orderId,
      businessId,
      status: PaymentStatus.VERIFIED,
    },
  });

  let totalReceipt = BigInt(0);
  let totalRefund = BigInt(0);
  const invoiceReceiptMap = new Map<string, bigint>();
  const invoiceRefundMap = new Map<string, bigint>();

  for (const p of verifiedPayments) {
    if (p.type === PaymentType.RECEIPT) {
      totalReceipt += p.amount;
      if (p.invoiceId) {
        invoiceReceiptMap.set(
          p.invoiceId,
          (invoiceReceiptMap.get(p.invoiceId) || BigInt(0)) + p.amount
        );
      }
    } else if (p.type === PaymentType.REFUND) {
      totalRefund += p.amount;
      if (p.invoiceId) {
        invoiceRefundMap.set(
          p.invoiceId,
          (invoiceRefundMap.get(p.invoiceId) || BigInt(0)) + p.amount
        );
      }
    }
  }

  const paidTotal =
    totalReceipt >= totalRefund ? totalReceipt - totalRefund : BigInt(0);

  // 2. Update Order.paidTotal
  await tx.order.updateMany({
    where: { id: orderId, businessId },
    data: { paidTotal },
  });

  // 3. Update Invoice.paidAmount untuk semua invoice milik order ini
  const invoices = await tx.invoice.findMany({
    where: { orderId, businessId, deletedAt: null },
  });

  for (const inv of invoices) {
    const invReceipt = invoiceReceiptMap.get(inv.id) || BigInt(0);
    const invRefund = invoiceRefundMap.get(inv.id) || BigInt(0);
    const invPaid =
      invReceipt >= invRefund ? invReceipt - invRefund : BigInt(0);

    if (inv.paidAmount !== invPaid) {
      await tx.invoice.updateMany({
        where: { id: inv.id, businessId },
        data: { paidAmount: invPaid },
      });
    }
  }

  return { paidTotal };
}

/**
 * Mengevaluasi apakah pesanan dapat dipindahkan ke status COMPLETED.
 * Dipanggil setelah pembayaran diverifikasi, pembayaran di-void,
 * pengiriman ditandai kirim, dan credit note dibuat.
 *
 * Syarat: balanceDue <= 0 DAN status pengiriman SHIPPED atau DELIVERED.
 *
 * Rujukan: Seksi 8.2 & 8.4 Dokumen Spesifikasi.
 */
export async function maybeComplete(
  tx: TxClient,
  ctx: Ctx,
  orderId: string
): Promise<void> {
  const businessId = ctx.businessId;
  if (!businessId) {
    throw new DomainError('BUSINESS_REQUIRED', 'Business ID diperlukan', 400);
  }

  const order = await tx.order.findFirst({
    where: { id: orderId, businessId, deletedAt: null },
  });

  if (!order || order.status !== OrderStatus.AWAITING_FINAL_PAYMENT) {
    return;
  }

  const balanceDue = order.grandTotal - order.paidTotal - order.creditTotal;
  if (balanceDue > BigInt(0)) {
    return;
  }

  // Cek status shipment
  const shipment = await tx.shipment.findFirst({
    where: { orderId, businessId },
  });

  if (
    shipment &&
    (shipment.status === ShipStatus.SHIPPED ||
      shipment.status === ShipStatus.DELIVERED)
  ) {
    await tx.order.updateMany({
      where: { id: order.id, businessId },
      data: {
        status: OrderStatus.COMPLETED,
        rev: { increment: 1 },
      },
    });

    await tx.auditLog.create({
      data: {
        businessId,
        actorId: ctx.user.id,
        actorRole: ctx.user.role,
        action: 'ORDER_COMPLETE',
        entityType: 'Order',
        entityId: order.id,
        summary: `Pesanan ${order.orderNo || order.id} otomatis selesai (lunas dan terkirim)`,
      },
    });

    // Notifikasi ke sales pemilik pesanan
    await tx.notification.create({
      data: {
        userId: order.salesId,
        businessId,
        type: 'ORDER_COMPLETED',
        title: 'Pesanan Selesai',
        body: `Pesanan ${order.orderNo || order.id} telah lunas dan terkirim (COMPLETED)`,
        linkPath: `/orders/${order.id}`,
        dedupeKey: `order_completed_${order.id}`,
      },
    });

    // Otomatisasi pengingat repeat order (Seksi 13.1 & 19.6 T4.4)
    await updateRemindersForCompletedOrder(tx, order.id, businessId);
  }
}

/**
 * Menjaga transisi status DP pesanan (`AWAITING_DP <-> IN_PROCESS`) berdasarkan
 * pencairan faktur DP maupun total pembayaran terverifikasi pesanan.
 */
async function syncDpOrderTransition(
  tx: TxClient,
  orderId: string,
  businessId: string,
  orderStatus: OrderStatus,
  paidTotal: bigint
): Promise<void> {
  if (
    orderStatus !== OrderStatus.AWAITING_DP &&
    orderStatus !== OrderStatus.IN_PROCESS
  ) {
    return;
  }

  const dpInvoice = await tx.invoice.findFirst({
    where: {
      orderId,
      businessId,
      type: InvoiceType.DP,
      status: InvoiceStatus.APPROVED,
      deletedAt: null,
    },
  });

  if (!dpInvoice) {
    return;
  }

  const isDpSatisfied =
    dpInvoice.paidAmount >= dpInvoice.amount || paidTotal >= dpInvoice.amount;

  if (orderStatus === OrderStatus.AWAITING_DP && isDpSatisfied) {
    await tx.order.updateMany({
      where: { id: orderId, businessId },
      data: {
        status: OrderStatus.IN_PROCESS,
        rev: { increment: 1 },
      },
    });
  } else if (orderStatus === OrderStatus.IN_PROCESS && !isDpSatisfied) {
    await tx.order.updateMany({
      where: { id: orderId, businessId },
      data: {
        status: OrderStatus.AWAITING_DP,
        rev: { increment: 1 },
      },
    });
  }
}

export interface CreatePaymentParams {
  orderId: string;
  invoiceId?: string | null;
  amount: number;
  method: PaymentMethod;
  paidAt: Date;
  reference?: string | null;
  proofPath?: string | null;
  notes?: string | null;
  autoVerify?: boolean;
}

/**
 * Mencatat pembayaran masuk (Payment) untuk pesanan.
 *
 * Rujukan: Seksi 7.12, 8.2, 8.3, 8.4 Dokumen Spesifikasi.
 */
export async function createPayment(
  tx: TxClient,
  ctx: Ctx,
  params: CreatePaymentParams
) {
  const businessId = ctx.businessId;
  if (!businessId) {
    throw new DomainError('BUSINESS_REQUIRED', 'Business ID diperlukan', 400);
  }

  const payAmount = BigInt(params.amount);
  if (payAmount <= BigInt(0)) {
    throw new DomainError(
      'VALIDATION_ERROR',
      'Jumlah pembayaran harus lebih dari 0',
      422
    );
  }

  // 1. Kunci pesanan secara pesimistik
  await lockOrder(tx, params.orderId, businessId);

  // 2. Ambil pesanan dan validasi
  const order = await tx.order.findFirst({
    where: { id: params.orderId, businessId, deletedAt: null },
  });

  if (!order) {
    throw new DomainError('ORDER_NOT_FOUND', 'Pesanan tidak ditemukan', 404);
  }

  // Isolasi Sales: Sales hanya bisa membuat pembayaran untuk pesanannya sendiri
  if (ctx.role === Role.SALES && order.salesId !== ctx.user.id) {
    throw new DomainError('ORDER_NOT_FOUND', 'Pesanan tidak ditemukan', 404);
  }

  // Validasi status order: dilarang mencatat pembayaran pada DRAFT, PENDING_APPROVAL, REVISION_REQUIRED, atau CANCELLED
  const disallowedStatuses: OrderStatus[] = [
    OrderStatus.DRAFT,
    OrderStatus.PENDING_APPROVAL,
    OrderStatus.REVISION_REQUIRED,
    OrderStatus.CANCELLED,
  ];

  if (disallowedStatuses.includes(order.status)) {
    throw new DomainError(
      'INVALID_STATE',
      `Pembayaran tidak dapat dicatat untuk pesanan berstatus ${order.status}`,
      409
    );
  }

  // 3. Validasi Invoice jika disediakan
  let targetInvoice = null;
  if (params.invoiceId) {
    targetInvoice = await tx.invoice.findFirst({
      where: {
        id: params.invoiceId,
        orderId: order.id,
        businessId,
        deletedAt: null,
      },
    });

    if (!targetInvoice) {
      throw new DomainError('INVOICE_NOT_FOUND', 'Invoice tidak ditemukan', 404);
    }

    if (targetInvoice.status !== InvoiceStatus.APPROVED) {
      throw new DomainError(
        'INVALID_STATE',
        `Pembayaran hanya dapat dicatat pada invoice yang telah disetujui (APPROVED). Status saat ini: ${targetInvoice.status}`,
        409
      );
    }

    // Periksa overpayment terhadap invoice
    const invoiceRemaining = targetInvoice.amount - targetInvoice.paidAmount;
    if (payAmount > invoiceRemaining) {
      throw new DomainError(
        'OVERPAYMENT',
        `Jumlah pembayaran (${formatRupiah(Number(payAmount))}) melebihi sisa tagihan invoice (${formatRupiah(Number(invoiceRemaining))})`,
        422
      );
    }
  }

  // 4. Periksa overpayment terhadap pesanan
  const balanceDue = order.grandTotal - order.paidTotal - order.creditTotal;
  if (payAmount > balanceDue) {
    throw new DomainError(
      'OVERPAYMENT',
      `Jumlah pembayaran (${formatRupiah(Number(payAmount))}) melebihi sisa tagihan pesanan (${formatRupiah(Number(balanceDue))})`,
      422
    );
  }

  // 5. Validasi metode bayar CREDIT (Seksi 9.4)
  if (params.method === PaymentMethod.CREDIT) {
    if (ctx.role !== Role.SUPERADMIN) {
      throw new DomainError(
        'FORBIDDEN',
        'Penggunaan saldo kredit pelanggan hanya dapat dilakukan oleh Super Admin',
        403
      );
    }

    const creditEntries = await tx.customerCreditEntry.findMany({
      where: { customerId: order.customerId, businessId },
    });
    const totalCredit = creditEntries.reduce((acc, c) => acc + c.amount, BigInt(0));

    if (totalCredit < payAmount) {
      throw new DomainError(
        'INSUFFICIENT_CREDIT',
        `Saldo kredit pelanggan (${formatRupiah(Number(totalCredit))}) tidak mencukupi untuk pembayaran sebesar ${formatRupiah(Number(payAmount))}`,
        422
      );
    }
  }

  // 6. Tentukan status awal pembayaran (autoVerify hanya untuk Super Admin)
  const isAutoVerify = Boolean(params.autoVerify && ctx.role === Role.SUPERADMIN);
  const now = new Date();

  const payment = await tx.payment.create({
    data: {
      businessId,
      orderId: order.id,
      invoiceId: targetInvoice ? targetInvoice.id : null,
      type: PaymentType.RECEIPT,
      method: params.method,
      status: isAutoVerify
        ? PaymentStatus.VERIFIED
        : PaymentStatus.PENDING_VERIFICATION,
      amount: payAmount,
      paidAt: params.paidAt,
      reference: params.reference || null,
      proofPath: params.proofPath || null,
      notes: params.notes || null,
      createdById: ctx.user.id,
      verifiedById: isAutoVerify ? ctx.user.id : null,
      verifiedAt: isAutoVerify ? now : null,
    },
  });

  // Jika metode CREDIT: tulis CustomerCreditEntry negatif
  if (params.method === PaymentMethod.CREDIT) {
    await tx.customerCreditEntry.create({
      data: {
        businessId,
        customerId: order.customerId,
        amount: -payAmount,
        reason: `Penggunaan saldo kredit untuk pesanan ${order.orderNo || order.id}`,
        orderId: order.id,
        paymentId: payment.id,
        createdById: ctx.user.id,
      },
    });
  }

  // Audit log pembuatan pembayaran
  await tx.auditLog.create({
    data: {
      businessId,
      actorId: ctx.user.id,
      actorRole: ctx.user.role,
      action: 'PAYMENT_CREATE',
      entityType: 'Payment',
      entityId: payment.id,
      summary: `Pencatatan pembayaran ${formatRupiah(Number(payAmount))} (${params.method}) untuk pesanan ${order.orderNo || order.id}`,
    },
  });

  if (isAutoVerify) {
    // 7a. Jika langsung VERIFIED: hitung ulang total dari sumbernya
    const { paidTotal } = await recalculateOrderPayments(tx, order.id, businessId);

    // Cek transisi status order jika AWAITING_DP
    await syncDpOrderTransition(tx, order.id, businessId, order.status, paidTotal);

    await maybeComplete(tx, ctx, order.id);
    await evaluateOrderCommission(tx, order.id, businessId);

    await tx.auditLog.create({
      data: {
        businessId,
        actorId: ctx.user.id,
        actorRole: ctx.user.role,
        action: 'PAYMENT_VERIFY',
        entityType: 'Payment',
        entityId: payment.id,
        summary: `Verifikasi otomatis pembayaran ${formatRupiah(Number(payAmount))} untuk pesanan ${order.orderNo || order.id}`,
      },
    });

    // Notifikasi ke sales
    await tx.notification.create({
      data: {
        userId: order.salesId,
        businessId,
        type: 'PAYMENT_VERIFIED',
        title: 'Pembayaran Terverifikasi',
        body: `Pembayaran ${formatRupiah(Number(payAmount))} untuk pesanan ${order.orderNo || order.id} telah diverifikasi`,
        linkPath: `/orders/${order.id}`,
        dedupeKey: `pay_verified_${payment.id}_${order.salesId}`,
      },
    });
  } else {
    // 7b. Jika PENDING_VERIFICATION: kirim notifikasi ke seluruh Super Admin aktif
    const superAdmins = await tx.user.findMany({
      where: { role: Role.SUPERADMIN, isActive: true },
      select: { id: true },
    });

    for (const sa of superAdmins) {
      await tx.notification.create({
        data: {
          userId: sa.id,
          businessId,
          type: 'PAYMENT_PENDING',
          title: 'Pembayaran Menunggu Verifikasi',
          body: `Pembayaran ${formatRupiah(Number(payAmount))} untuk pesanan ${order.orderNo || order.id} menunggu verifikasi`,
          linkPath: `/orders/${order.id}`,
          dedupeKey: `pay_pending_${payment.id}_${sa.id}`,
        },
      });
    }
  }

  return payment;
}

/**
 * Memverifikasi pembayaran oleh Super Admin.
 *
 * Rujukan: Seksi 7.12, 8.2, 8.4, dan Kriteria Pengujian 17.3 nomor 8.
 */
export async function verifyPayment(
  tx: TxClient,
  ctx: Ctx,
  paymentId: string
) {
  const businessId = ctx.businessId;
  if (!businessId) {
    throw new DomainError('BUSINESS_REQUIRED', 'Business ID diperlukan', 400);
  }

  // Otorisasi: Khusus Super Admin
  if (ctx.role !== Role.SUPERADMIN) {
    throw new DomainError(
      'FORBIDDEN',
      'Hanya Super Admin yang berhak memverifikasi pembayaran',
      403
    );
  }

  const payment = await tx.payment.findFirst({
    where: { id: paymentId, businessId },
  });

  if (!payment) {
    throw new DomainError('PAYMENT_NOT_FOUND', 'Pembayaran tidak ditemukan', 404);
  }

  // Idempoten: Jika sudah VERIFIED, kembalikan tanpa menghitung ganda
  if (payment.status === PaymentStatus.VERIFIED) {
    return payment;
  }

  if (
    payment.status === PaymentStatus.REJECTED ||
    payment.status === PaymentStatus.VOID
  ) {
    throw new DomainError(
      'INVALID_STATE',
      `Pembayaran berstatus ${payment.status} tidak dapat diverifikasi`,
      409
    );
  }

  // Kunci baris order
  await lockOrder(tx, payment.orderId, businessId);

  const order = await tx.order.findFirst({
    where: { id: payment.orderId, businessId, deletedAt: null },
  });

  if (!order) {
    throw new DomainError('ORDER_NOT_FOUND', 'Pesanan tidak ditemukan', 404);
  }

  // Periksa batas sisa tagihan order (mencegah overpayment)
  const balanceDue = order.grandTotal - order.paidTotal - order.creditTotal;
  if (payment.amount > balanceDue) {
    throw new DomainError(
      'OVERPAYMENT',
      `Verifikasi pembayaran (${formatRupiah(Number(payment.amount))}) melebihi sisa tagihan pesanan (${formatRupiah(Number(balanceDue))})`,
      422
    );
  }

  // Jika pembayaran memiliki invoiceId, periksa batas sisa tagihan invoice
  if (payment.invoiceId) {
    const inv = await tx.invoice.findFirst({
      where: { id: payment.invoiceId, businessId, deletedAt: null },
    });
    if (inv) {
      const invRemaining = inv.amount - inv.paidAmount;
      if (payment.amount > invRemaining) {
        throw new DomainError(
          'OVERPAYMENT',
          `Verifikasi pembayaran (${formatRupiah(Number(payment.amount))}) melebihi sisa tagihan invoice (${formatRupiah(Number(invRemaining))})`,
          422
        );
      }
    }
  }

  // Update status payment menjadi VERIFIED
  await tx.payment.updateMany({
    where: { id: payment.id, businessId },
    data: {
      status: PaymentStatus.VERIFIED,
      verifiedById: ctx.user.id,
      verifiedAt: new Date(),
    },
  });

  const updatedPayment = await tx.payment.findFirstOrThrow({
    where: { id: payment.id, businessId },
  });

  // Hitung ulang paidTotal dan paidAmount dari seluruh pembayaran VERIFIED
  const { paidTotal } = await recalculateOrderPayments(tx, order.id, businessId);

  // Transisi status order jika saat ini AWAITING_DP dan DP telah lunas
  await syncDpOrderTransition(tx, order.id, businessId, order.status, paidTotal);

  // Evaluasi penyelesaian pesanan
  await maybeComplete(tx, ctx, order.id);

  // Evaluasi komisi pesanan (ON_DP_PAID atau ON_FULL_PAID)
  await evaluateOrderCommission(tx, order.id, businessId);

  // Audit log verifikasi pembayaran
  await tx.auditLog.create({
    data: {
      businessId,
      actorId: ctx.user.id,
      actorRole: ctx.user.role,
      action: 'PAYMENT_VERIFY',
      entityType: 'Payment',
      entityId: payment.id,
      summary: `Verifikasi pembayaran ${formatRupiah(Number(payment.amount))} untuk pesanan ${order.orderNo || order.id}`,
    },
  });

  // Notifikasi ke staf Sales pembuat pesanan
  await tx.notification.create({
    data: {
      userId: order.salesId,
      businessId,
      type: 'PAYMENT_VERIFIED',
      title: 'Pembayaran Terverifikasi',
      body: `Pembayaran ${formatRupiah(Number(payment.amount))} untuk pesanan ${order.orderNo || order.id} telah diverifikasi`,
      linkPath: `/orders/${order.id}`,
      dedupeKey: `pay_verified_${payment.id}_${order.salesId}`,
    },
  });

  return updatedPayment;
}

export interface RejectPaymentOptions {
  reason: string;
}

/**
 * Menolak pembayaran masuk oleh Super Admin.
 *
 * Rujukan: Seksi 7.12, 8.3 Dokumen Spesifikasi.
 */
export async function rejectPayment(
  tx: TxClient,
  ctx: Ctx,
  paymentId: string,
  options: RejectPaymentOptions
) {
  const businessId = ctx.businessId;
  if (!businessId) {
    throw new DomainError('BUSINESS_REQUIRED', 'Business ID diperlukan', 400);
  }

  if (ctx.role !== Role.SUPERADMIN) {
    throw new DomainError(
      'FORBIDDEN',
      'Hanya Super Admin yang berhak menolak pembayaran',
      403
    );
  }

  const reason = options.reason?.trim();
  if (!reason || reason.length < 5) {
    throw new DomainError(
      'REJECT_REASON_REQUIRED',
      'Alasan penolakan pembayaran wajib diisi minimal 5 karakter',
      422
    );
  }

  const payment = await tx.payment.findFirst({
    where: { id: paymentId, businessId },
  });

  if (!payment) {
    throw new DomainError('PAYMENT_NOT_FOUND', 'Pembayaran tidak ditemukan', 404);
  }

  if (payment.status !== PaymentStatus.PENDING_VERIFICATION) {
    throw new DomainError(
      'INVALID_STATE',
      `Hanya pembayaran dengan status PENDING_VERIFICATION yang dapat ditolak. Status saat ini: ${payment.status}`,
      409
    );
  }

  await lockOrder(tx, payment.orderId, businessId);

  const order = await tx.order.findFirst({
    where: { id: payment.orderId, businessId, deletedAt: null },
  });

  if (!order) {
    throw new DomainError('ORDER_NOT_FOUND', 'Pesanan tidak ditemukan', 404);
  }

  // Jika metode CREDIT: kembalikan saldo kredit pelanggan
  if (payment.method === PaymentMethod.CREDIT) {
    await tx.customerCreditEntry.create({
      data: {
        businessId,
        customerId: order.customerId,
        amount: payment.amount,
        reason: `Pembalikan saldo kredit akibat penolakan pembayaran: ${reason}`,
        orderId: order.id,
        paymentId: payment.id,
        createdById: ctx.user.id,
      },
    });
  }

  await tx.payment.updateMany({
    where: { id: payment.id, businessId },
    data: {
      status: PaymentStatus.REJECTED,
      rejectReason: reason,
    },
  });

  const updatedPayment = await tx.payment.findFirstOrThrow({
    where: { id: payment.id, businessId },
  });

  await tx.auditLog.create({
    data: {
      businessId,
      actorId: ctx.user.id,
      actorRole: ctx.user.role,
      action: 'PAYMENT_REJECT',
      entityType: 'Payment',
      entityId: payment.id,
      summary: `Penolakan pembayaran ${formatRupiah(Number(payment.amount))} untuk pesanan ${order.orderNo || order.id}: ${reason}`,
      reason,
    },
  });

  await tx.notification.create({
    data: {
      userId: order.salesId,
      businessId,
      type: 'PAYMENT_REJECTED',
      title: 'Pembayaran Ditolak',
      body: `Pembayaran ${formatRupiah(Number(payment.amount))} untuk pesanan ${order.orderNo || order.id} ditolak: ${reason}`,
      linkPath: `/orders/${order.id}`,
      dedupeKey: `pay_rejected_${payment.id}_${order.salesId}`,
    },
  });

  return updatedPayment;
}

export interface VoidPaymentOptions {
  reason: string;
}

/**
 * Membatalkan (Void) pembayaran yang sebelumnya telah diverifikasi.
 *
 * Rujukan: Seksi 7.12, 8.3, 8.4, 9.2 Dokumen Spesifikasi.
 */
export async function voidPayment(
  tx: TxClient,
  ctx: Ctx,
  paymentId: string,
  options: VoidPaymentOptions
) {
  const businessId = ctx.businessId;
  if (!businessId) {
    throw new DomainError('BUSINESS_REQUIRED', 'Business ID diperlukan', 400);
  }

  if (ctx.role !== Role.SUPERADMIN) {
    throw new DomainError(
      'FORBIDDEN',
      'Hanya Super Admin yang berhak membatalkan (void) pembayaran',
      403
    );
  }

  const reason = options.reason?.trim();
  if (!reason || reason.length < 5) {
    throw new DomainError(
      'VOID_REASON_REQUIRED',
      'Alasan pembatalan (void) pembayaran wajib diisi minimal 5 karakter',
      422
    );
  }

  const payment = await tx.payment.findFirst({
    where: { id: paymentId, businessId },
  });

  if (!payment) {
    throw new DomainError('PAYMENT_NOT_FOUND', 'Pembayaran tidak ditemukan', 404);
  }

  if (payment.status !== PaymentStatus.VERIFIED) {
    throw new DomainError(
      'INVALID_STATE',
      `Hanya pembayaran yang telah berstatus VERIFIED yang dapat di-void. Status saat ini: ${payment.status}`,
      409
    );
  }

  await lockOrder(tx, payment.orderId, businessId);

  const order = await tx.order.findFirst({
    where: { id: payment.orderId, businessId, deletedAt: null },
  });

  if (!order) {
    throw new DomainError('ORDER_NOT_FOUND', 'Pesanan tidak ditemukan', 404);
  }

  // Jika metode CREDIT: kembalikan saldo kredit pelanggan
  if (payment.method === PaymentMethod.CREDIT) {
    await tx.customerCreditEntry.create({
      data: {
        businessId,
        customerId: order.customerId,
        amount: payment.amount,
        reason: `Pembalikan saldo kredit akibat void pembayaran: ${reason}`,
        orderId: order.id,
        paymentId: payment.id,
        createdById: ctx.user.id,
      },
    });
  }

  const updatedNotes = payment.notes
    ? `${payment.notes}\n[VOID]: ${reason}`
    : `[VOID]: ${reason}`;

  await tx.payment.updateMany({
    where: { id: payment.id, businessId },
    data: {
      status: PaymentStatus.VOID,
      notes: updatedNotes,
      rejectReason: reason,
    },
  });

  const updatedPayment = await tx.payment.findFirstOrThrow({
    where: { id: payment.id, businessId },
  });

  // Hitung ulang pembayaran dari sumbernya (VERIFIED receipts minus refunds)
  const { paidTotal } = await recalculateOrderPayments(tx, order.id, businessId);

  // Evaluasi pembalikan status pesanan (Seksi 9.2)
  // Ambil data order terkini setelah recalculate
  const freshOrder = await tx.order.findFirst({
    where: { id: order.id, businessId },
  });

  if (freshOrder) {
    if (freshOrder.status === OrderStatus.IN_PROCESS) {
      await syncDpOrderTransition(
        tx,
        order.id,
        businessId,
        freshOrder.status,
        paidTotal
      );
    } else if (freshOrder.status === OrderStatus.COMPLETED) {
      const balanceDue =
        freshOrder.grandTotal - freshOrder.paidTotal - freshOrder.creditTotal;
      if (balanceDue > BigInt(0)) {
        await tx.order.updateMany({
          where: { id: order.id, businessId },
          data: {
            status: OrderStatus.AWAITING_FINAL_PAYMENT,
            rev: { increment: 1 },
          },
        });
      }
    }
  }

  await tx.auditLog.create({
    data: {
      businessId,
      actorId: ctx.user.id,
      actorRole: ctx.user.role,
      action: 'PAYMENT_VOID',
      entityType: 'Payment',
      entityId: payment.id,
      summary: `Pembatalan (void) pembayaran ${formatRupiah(Number(payment.amount))} untuk pesanan ${order.orderNo || order.id}: ${reason}`,
      reason,
    },
  });

  await tx.notification.create({
    data: {
      userId: order.salesId,
      businessId,
      type: 'PAYMENT_VOIDED',
      title: 'Pembayaran Dibatalkan (Void)',
      body: `Pembayaran ${formatRupiah(Number(payment.amount))} untuk pesanan ${order.orderNo || order.id} telah dibatalkan (void): ${reason}`,
      linkPath: `/orders/${order.id}`,
      dedupeKey: `pay_voided_${payment.id}_${order.salesId}`,
    },
  });

  return updatedPayment;
}
