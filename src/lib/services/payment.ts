import {
  Role,
  OrderStatus,
  InvoiceStatus,
  InvoiceType,
  PaymentStatus,
  PaymentType,
  PaymentMethod,
} from '@prisma/client';
import { prisma } from '@/lib/db';
import { DomainError, formatRupiah } from '../domain/money';
import { receiptNumber } from '../domain/numbering';
import { generateVerifyToken } from '../domain/verify';
import { allocateCustomerReceiptSeq, QueryRawExecutor } from './counter';
import { lockOrder } from './orderGuard';
import { Ctx } from '../auth/context';
import { evaluateOrderCommission } from './commission';
import { updateRemindersForCompletedOrder } from './reminder';
import { getShippedQtySummary } from './shipmentSummary';
import { customerScope } from './scopes';

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
  receiptNo?: string | null;
  verifyToken?: string | null;
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
  receiptNo?: string | null;
  verifyToken?: string | null;
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
    receiptNo: p.receiptNo ?? null,
    verifyToken: p.verifyToken ?? null,
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
    include: { items: true },
  });

  if (!order || order.status !== OrderStatus.AWAITING_FINAL_PAYMENT) {
    return;
  }

  const balanceDue = order.grandTotal - order.paidTotal - order.creditTotal;
  if (balanceDue > BigInt(0)) {
    return;
  }

  // Cek status pengiriman seluruh kloter (semua item harus sudah dikirim)
  const orderItems = (order as { items?: Array<{ id: string; productId: string; qty: number }> }).items;
  const summary = await getShippedQtySummary(
    tx,
    businessId,
    order.id,
    orderItems ?? []
  );

  const isFullyShipped =
    Array.isArray(orderItems) && orderItems.length > 0
      ? summary.allItemsShipped
      : summary.hasAnyShipped;

  if (isFullyShipped) {
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

/**
 * Memastikan metode pembayaran dan kelengkapan bukti transfer Sales mematuhi kebijakan anti-fraud unit usaha.
 */
async function assertSalesPaymentPolicy(
  tx: TxClient,
  ctx: Ctx,
  businessId: string,
  method: PaymentMethod,
  proofPath: string | null | undefined
): Promise<void> {
  if (ctx.role !== Role.SALES) {
    return;
  }

  const businessPolicy =
    typeof tx.business?.findFirst === 'function'
      ? await tx.business.findFirst({
          where: { id: businessId },
          select: {
            allowSalesCashPayment: true,
            requireTransferProofForSales: true,
          },
        })
      : null;

  if (
    method === PaymentMethod.CASH &&
    businessPolicy?.allowSalesCashPayment === false
  ) {
    throw new DomainError(
      'CASH_DISABLED_FOR_SALES',
      'Pembayaran tunai (Cash) oleh Sales dinonaktifkan oleh manajemen. Pelanggan wajib transfer ke rekening resmi perusahaan.',
      403
    );
  }

  if (
    method === PaymentMethod.TRANSFER &&
    businessPolicy?.requireTransferProofForSales === true &&
    !proofPath
  ) {
    throw new DomainError(
      'TRANSFER_PROOF_REQUIRED',
      'Bukti transfer wajib dilampirkan saat mencatat pembayaran Transfer Bank.',
      422
    );
  }
}

/**
 * Efek berantai setelah pembayaran diverifikasi pada suatu order (hitung ulang, DP->IN_PROCESS, COMPLETE, komisi).
 */
async function applyVerifiedOrderEffects(
  tx: TxClient,
  ctx: Ctx,
  businessId: string,
  orderId: string,
  currentOrderStatus: OrderStatus
): Promise<void> {
  const { paidTotal } = await recalculateOrderPayments(tx, orderId, businessId);
  await syncDpOrderTransition(tx, orderId, businessId, currentOrderStatus, paidTotal);
  await maybeComplete(tx, ctx, orderId);
  await evaluateOrderCommission(tx, orderId, businessId);
}

/**
 * Pembalikan status order setelah pembayaran terverifikasi di-void.
 */
async function applyVoidedOrderEffects(
  tx: TxClient,
  orderId: string,
  businessId: string
): Promise<void> {
  const { paidTotal } = await recalculateOrderPayments(tx, orderId, businessId);
  const freshOrder = await tx.order.findFirst({
    where: { id: orderId, businessId },
  });

  if (!freshOrder) {
    return;
  }

  if (freshOrder.status === OrderStatus.IN_PROCESS) {
    await syncDpOrderTransition(
      tx,
      orderId,
      businessId,
      freshOrder.status,
      paidTotal
    );
  } else if (freshOrder.status === OrderStatus.COMPLETED) {
    const balanceDue =
      freshOrder.grandTotal - freshOrder.paidTotal - freshOrder.creditTotal;
    if (balanceDue > BigInt(0)) {
      await tx.order.updateMany({
        where: { id: orderId, businessId },
        data: {
          status: OrderStatus.AWAITING_FINAL_PAYMENT,
          rev: { increment: 1 },
        },
      });
    }
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

  // Kebijakan anti-fraud unit usaha untuk peran Sales (tunai & bukti transfer wajib)
  await assertSalesPaymentPolicy(
    tx,
    ctx,
    businessId,
    params.method,
    params.proofPath
  );

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
  const autoIds = isAutoVerify
    ? await allocateReceiptIdentifiers(tx, businessId, order.customerId, params.paidAt)
    : null;

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
      ...(autoIds?.verifyToken ? { verifyToken: autoIds.verifyToken } : {}),
      ...(autoIds?.receiptNo ? { receiptNo: autoIds.receiptNo } : {}),
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
    // 7a. Jika langsung VERIFIED: hitung ulang & efek status/komisi order
    await applyVerifiedOrderEffects(tx, ctx, businessId, order.id, order.status);

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
export async function allocateReceiptIdentifiers(
  tx: TxClient,
  businessId: string,
  customerId: string,
  paidAt: Date,
  existingReceiptNo?: string | null,
  existingVerifyToken?: string | null
): Promise<{ receiptNo?: string; verifyToken: string }> {
  const verifyToken = existingVerifyToken || generateVerifyToken();
  if (existingReceiptNo) {
    return { receiptNo: existingReceiptNo, verifyToken };
  }

  let receiptNo: string | undefined;
  if ((tx as { documentCounter?: unknown }).documentCounter && typeof tx.customer?.findFirst === 'function') {
    const cust = await tx.customer.findFirst({
      where: { id: customerId, businessId },
      select: { id: true, code: true },
    });
    if (cust) {
      const seq = await allocateCustomerReceiptSeq(
        tx as unknown as QueryRawExecutor,
        businessId,
        cust.id
      );
      receiptNo = receiptNumber(cust.code, paidAt, seq);
    }
  }

  return { receiptNo, verifyToken };
}

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

  if ((payment as { batchId?: string | null }).batchId) {
    await verifyPaymentBatch(
      tx,
      ctx,
      (payment as { batchId: string }).batchId
    );
    return tx.payment.findFirstOrThrow({
      where: { id: payment.id, businessId },
    });
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

  // Alokasi nomor kwitansi resmi & token verifikasi publik (hanya saat VERIFIED)
  const { receiptNo: nextReceiptNo, verifyToken: nextVerifyToken } =
    await allocateReceiptIdentifiers(
      tx,
      businessId,
      order.customerId,
      payment.paidAt,
      payment.receiptNo,
      payment.verifyToken
    );

  // Update status payment menjadi VERIFIED
  await tx.payment.updateMany({
    where: { id: payment.id, businessId },
    data: {
      status: PaymentStatus.VERIFIED,
      verifiedById: ctx.user.id,
      verifiedAt: new Date(),
      verifyToken: nextVerifyToken,
      ...(nextReceiptNo ? { receiptNo: nextReceiptNo } : {}),
    },
  });

  const updatedPayment = await tx.payment.findFirstOrThrow({
    where: { id: payment.id, businessId },
  });

  // Hitung ulang paidTotal, transisi status order, penyelesaian, & komisi
  await applyVerifiedOrderEffects(tx, ctx, businessId, order.id, order.status);

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

  if ((payment as { batchId?: string | null }).batchId) {
    await rejectPaymentBatch(
      tx,
      ctx,
      (payment as { batchId: string }).batchId,
      options
    );
    return tx.payment.findFirstOrThrow({
      where: { id: payment.id, businessId },
    });
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

  if ((payment as { batchId?: string | null }).batchId) {
    await voidPaymentBatch(
      tx,
      ctx,
      (payment as { batchId: string }).batchId,
      options
    );
    return tx.payment.findFirstOrThrow({
      where: { id: payment.id, businessId },
    });
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

  // Hitung ulang & pembalikan status order setelah void
  await applyVoidedOrderEffects(tx, order.id, businessId);

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

export interface PaymentBatchAllocationDto {
  id: string;
  paymentId: string;
  orderId: string;
  orderNo?: string | null;
  invoiceId: string;
  invoiceNo?: string | null;
  invoiceType?: InvoiceType;
  amount: number;
}

export interface PaymentBatchDto {
  id: string;
  businessId: string;
  customerId: string;
  method: PaymentMethod;
  status: PaymentStatus;
  totalPaid: number;
  allocatedTotal: number;
  creditAmount: number;
  creditOption: boolean;
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
  allocations: PaymentBatchAllocationDto[];
}

export interface UnpaidCustomerInvoiceDto {
  invoiceId: string;
  invoiceNumber: string;
  type: InvoiceType;
  orderId: string;
  orderNo: string | null;
  orderStatus: OrderStatus;
  invoiceAmount: number;
  paidAmount: number;
  remainingInvoice: number;
  orderBalanceDue: number;
  dueDate: string | null;
}

export interface CreateCollectivePaymentParams {
  customerId: string;
  totalPaid: number;
  creditOption: boolean;
  method: PaymentMethod;
  paidAt: Date;
  reference?: string | null;
  proofPath?: string | null;
  notes?: string | null;
  autoVerify?: boolean;
  allocations: Array<{
    invoiceId: string;
    amount: number;
  }>;
}

export function formatPaymentBatchDto(batch: {
  id: string;
  businessId: string;
  customerId: string;
  method: PaymentMethod;
  status: PaymentStatus;
  totalPaid: bigint;
  allocatedTotal: bigint;
  creditAmount: bigint;
  creditOption: boolean;
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
  allocations?: Array<{
    id: string;
    paymentId: string;
    orderId: string;
    invoiceId: string;
    amount: bigint;
  }>;
}): PaymentBatchDto {
  return {
    id: batch.id,
    businessId: batch.businessId,
    customerId: batch.customerId,
    method: batch.method,
    status: batch.status,
    totalPaid: Number(batch.totalPaid),
    allocatedTotal: Number(batch.allocatedTotal),
    creditAmount: Number(batch.creditAmount),
    creditOption: batch.creditOption,
    paidAt: batch.paidAt.toISOString(),
    reference: batch.reference,
    proofPath: batch.proofPath,
    notes: batch.notes,
    createdById: batch.createdById,
    verifiedById: batch.verifiedById,
    verifiedAt: batch.verifiedAt ? batch.verifiedAt.toISOString() : null,
    rejectReason: batch.rejectReason,
    createdAt: batch.createdAt.toISOString(),
    updatedAt: batch.updatedAt.toISOString(),
    allocations: (batch.allocations || []).map((a) => ({
      id: a.id,
      paymentId: a.paymentId,
      orderId: a.orderId,
      invoiceId: a.invoiceId,
      amount: Number(a.amount),
    })),
  };
}

/**
 * Mengambil daftar faktur resmi (APPROVED) milik pelanggan yang masih memiliki sisa tagihan.
 */
export async function listUnpaidCustomerInvoices(
  tx: TxClient,
  ctx: Ctx,
  customerId: string
): Promise<UnpaidCustomerInvoiceDto[]> {
  const businessId = ctx.businessId;
  if (!businessId) {
    throw new DomainError('BUSINESS_REQUIRED', 'Business ID diperlukan', 400);
  }

  const scope = customerScope(ctx, businessId);
  const customer = await tx.customer.findFirst({
    where: { ...scope, id: customerId },
    select: { id: true },
  });

  if (!customer) {
    throw new DomainError('CUSTOMER_NOT_FOUND', 'Pelanggan tidak ditemukan', 404);
  }

  const orders = await tx.order.findMany({
    where: {
      businessId,
      customerId: customer.id,
      deletedAt: null,
      status: {
        notIn: [
          OrderStatus.DRAFT,
          OrderStatus.PENDING_APPROVAL,
          OrderStatus.REVISION_REQUIRED,
          OrderStatus.CANCELLED,
        ],
      },
      ...(ctx.role === Role.SALES ? { salesId: ctx.user.id } : {}),
    },
    select: {
      id: true,
      orderNo: true,
      status: true,
      grandTotal: true,
      paidTotal: true,
      creditTotal: true,
    },
  });

  if (orders.length === 0) {
    return [];
  }

  const orderMap = new Map(orders.map((o) => [o.id, o]));
  const invoices = await tx.invoice.findMany({
    where: {
      businessId,
      orderId: { in: orders.map((o) => o.id) },
      status: InvoiceStatus.APPROVED,
      deletedAt: null,
    },
    orderBy: [{ issueDate: 'asc' }, { createdAt: 'asc' }],
  });

  const results: UnpaidCustomerInvoiceDto[] = [];
  for (const inv of invoices) {
    const order = orderMap.get(inv.orderId);
    if (!order) continue;
    const invRem = inv.amount - inv.paidAmount;
    const ordRem = order.grandTotal - order.paidTotal - order.creditTotal;
    if (invRem > BigInt(0) && ordRem > BigInt(0)) {
      results.push({
        invoiceId: inv.id,
        invoiceNumber: inv.number ?? inv.id,
        type: inv.type,
        orderId: order.id,
        orderNo: order.orderNo,
        orderStatus: order.status,
        invoiceAmount: Number(inv.amount),
        paidAmount: Number(inv.paidAmount),
        remainingInvoice: Number(invRem),
        orderBalanceDue: Number(ordRem),
        dueDate: inv.dueDate ? inv.dueDate.toISOString() : null,
      });
    }
  }

  return results;
}

const DISALLOWED_PAYMENT_ORDER_STATUSES: OrderStatus[] = [
  OrderStatus.DRAFT,
  OrderStatus.PENDING_APPROVAL,
  OrderStatus.REVISION_REQUIRED,
  OrderStatus.CANCELLED,
];

/**
 * Mencatat pembayaran kolektif multi-faktur dalam 1 bukti bayar dengan opsi simpan kelebihan transfer ke kredit pelanggan.
 */
export async function createCollectivePayment(
  tx: TxClient,
  ctx: Ctx,
  params: CreateCollectivePaymentParams
): Promise<PaymentBatchDto> {
  const businessId = ctx.businessId;
  if (!businessId) {
    throw new DomainError('BUSINESS_REQUIRED', 'Business ID diperlukan', 400);
  }

  if (params.method === PaymentMethod.CREDIT) {
    throw new DomainError(
      'VALIDATION_ERROR',
      'Pembayaran kolektif hanya mendukung metode TRANSFER atau CASH',
      422
    );
  }

  const scope = customerScope(ctx, businessId);
  const customer = await tx.customer.findFirst({
    where: { ...scope, id: params.customerId },
    select: { id: true, code: true, name: true },
  });

  if (!customer) {
    throw new DomainError('CUSTOMER_NOT_FOUND', 'Pelanggan tidak ditemukan', 404);
  }

  await assertSalesPaymentPolicy(
    tx,
    ctx,
    businessId,
    params.method,
    params.proofPath
  );

  if (!params.allocations || params.allocations.length === 0) {
    throw new DomainError(
      'VALIDATION_ERROR',
      'Minimal pilih 1 faktur untuk dialokasikan',
      422
    );
  }

  const seenInvoiceIds = new Set<string>();
  let allocatedSum = BigInt(0);
  for (const a of params.allocations) {
    if (seenInvoiceIds.has(a.invoiceId)) {
      throw new DomainError(
        'VALIDATION_ERROR',
        'Faktur tidak boleh duplikat dalam satu batch pembayaran kolektif',
        422
      );
    }
    if (a.amount <= 0) {
      throw new DomainError(
        'VALIDATION_ERROR',
        'Nominal alokasi setiap faktur harus lebih dari 0',
        422
      );
    }
    seenInvoiceIds.add(a.invoiceId);
    allocatedSum += BigInt(a.amount);
  }

  const totalPaid = BigInt(params.totalPaid);
  if (totalPaid < allocatedSum) {
    throw new DomainError(
      'VALIDATION_ERROR',
      `Total dana dibayar (${formatRupiah(Number(totalPaid))}) lebih kecil dari total alokasi faktur (${formatRupiah(Number(allocatedSum))})`,
      422
    );
  }

  const creditAmount = totalPaid - allocatedSum;
  if (creditAmount > BigInt(0) && !params.creditOption) {
    throw new DomainError(
      'OVERPAYMENT',
      `Nominal dana melebihi total alokasi faktur sebesar ${formatRupiah(Number(creditAmount))}. Aktifkan opsi simpan kelebihan ke saldo kredit pelanggan jika disengaja.`,
      422
    );
  }

  const invoices = await tx.invoice.findMany({
    where: {
      businessId,
      id: { in: Array.from(seenInvoiceIds) },
      deletedAt: null,
    },
  });

  if (invoices.length !== seenInvoiceIds.size) {
    throw new DomainError(
      'INVOICE_NOT_FOUND',
      'Satu atau lebih faktur tidak ditemukan',
      404
    );
  }

  const invoiceMap = new Map(invoices.map((i) => [i.id, i]));
  const distinctOrderIds = Array.from(new Set(invoices.map((i) => i.orderId))).sort();

  for (const ordId of distinctOrderIds) {
    await lockOrder(tx, ordId, businessId);
  }

  const orders = await tx.order.findMany({
    where: {
      businessId,
      id: { in: distinctOrderIds },
      deletedAt: null,
    },
  });
  const orderMap = new Map(orders.map((o) => [o.id, o]));

  const perOrderAllocSum = new Map<string, bigint>();
  for (const a of params.allocations) {
    const inv = invoiceMap.get(a.invoiceId)!;
    const ord = orderMap.get(inv.orderId);
    if (!ord) {
      throw new DomainError('ORDER_NOT_FOUND', 'Pesanan faktur tidak ditemukan', 404);
    }
    if (ord.customerId !== customer.id) {
      throw new DomainError(
        'VALIDATION_ERROR',
        `Faktur ${inv.number} bukan milik pelanggan yang dipilih`,
        422
      );
    }
    if (ctx.role === Role.SALES && ord.salesId !== ctx.user.id) {
      throw new DomainError(
        'FORBIDDEN',
        `Anda tidak berhak mencatat pembayaran untuk pesanan ${ord.orderNo || ord.id}`,
        403
      );
    }
    if (DISALLOWED_PAYMENT_ORDER_STATUSES.includes(ord.status)) {
      throw new DomainError(
        'INVALID_STATE',
        `Pesanan ${ord.orderNo || ord.id} berstatus ${ord.status} sehingga tidak menerima pembayaran`,
        409
      );
    }
    if (inv.status !== InvoiceStatus.APPROVED) {
      throw new DomainError(
        'INVALID_STATE',
        `Faktur ${inv.number} belum berstatus APPROVED`,
        409
      );
    }
    const allocAmt = BigInt(a.amount);
    const invRem = inv.amount - inv.paidAmount;
    if (allocAmt > invRem) {
      throw new DomainError(
        'OVERPAYMENT',
        `Alokasi untuk faktur ${inv.number} (${formatRupiah(Number(allocAmt))}) melebihi sisa tagihan (${formatRupiah(Number(invRem))})`,
        422
      );
    }
    perOrderAllocSum.set(
      ord.id,
      (perOrderAllocSum.get(ord.id) ?? BigInt(0)) + allocAmt
    );
  }

  for (const [ordId, sumAlloc] of perOrderAllocSum.entries()) {
    const ord = orderMap.get(ordId)!;
    const ordBal = ord.grandTotal - ord.paidTotal - ord.creditTotal;
    if (sumAlloc > ordBal) {
      throw new DomainError(
        'OVERPAYMENT',
        `Total alokasi pada pesanan ${ord.orderNo || ord.id} (${formatRupiah(Number(sumAlloc))}) melebihi sisa tagihan pesanan (${formatRupiah(Number(ordBal))})`,
        422
      );
    }
  }

  const batch = await tx.paymentBatch.create({
    data: {
      businessId,
      customerId: customer.id,
      method: params.method,
      status: PaymentStatus.PENDING_VERIFICATION,
      totalPaid,
      allocatedTotal: allocatedSum,
      creditAmount,
      creditOption: creditAmount > BigInt(0) ? params.creditOption : false,
      paidAt: params.paidAt,
      reference: params.reference || null,
      proofPath: params.proofPath || null,
      notes: params.notes || null,
      createdById: ctx.user.id,
    },
  });

  for (const a of params.allocations) {
    const inv = invoiceMap.get(a.invoiceId)!;
    const childPayment = await tx.payment.create({
      data: {
        businessId,
        batchId: batch.id,
        orderId: inv.orderId,
        invoiceId: inv.id,
        type: PaymentType.RECEIPT,
        method: params.method,
        status: PaymentStatus.PENDING_VERIFICATION,
        amount: BigInt(a.amount),
        paidAt: params.paidAt,
        reference: params.reference || null,
        proofPath: params.proofPath || null,
        notes: params.notes
          ? `[Kolektif ${inv.number}] ${params.notes}`
          : `Pembayaran kolektif (${inv.number})`,
        createdById: ctx.user.id,
      },
    });

    await tx.paymentAllocation.create({
      data: {
        batchId: batch.id,
        paymentId: childPayment.id,
        orderId: inv.orderId,
        invoiceId: inv.id,
        amount: BigInt(a.amount),
      },
    });
  }

  await tx.auditLog.create({
    data: {
      businessId,
      actorId: ctx.user.id,
      actorRole: ctx.user.role,
      action: 'PAYMENT_BATCH_CREATE',
      entityType: 'PaymentBatch',
      entityId: batch.id,
      summary: `Pencatatan pembayaran kolektif ${formatRupiah(Number(totalPaid))} untuk ${customer.name} (${params.allocations.length} faktur${creditAmount > BigInt(0) ? `, kelebihan kredit ${formatRupiah(Number(creditAmount))}` : ''})`,
    },
  });

  const isAutoVerify = Boolean(params.autoVerify && ctx.role === Role.SUPERADMIN);
  if (isAutoVerify) {
    return verifyPaymentBatch(tx, ctx, batch.id);
  }

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
        title: 'Pembayaran Kolektif Menunggu Verifikasi',
        body: `Pembayaran kolektif ${formatRupiah(Number(totalPaid))} (${params.allocations.length} faktur) untuk ${customer.name} menunggu verifikasi`,
        linkPath: '/payments',
        dedupeKey: `pay_batch_pending_${batch.id}_${sa.id}`,
      },
    });
  }

  const refreshed = await tx.paymentBatch.findFirstOrThrow({
    where: { id: batch.id, businessId },
    include: { allocations: true },
  });
  return formatPaymentBatchDto(refreshed);
}

/**
 * Memverifikasi seluruh pembayaran dalam 1 batch kolektif dan menambahkan kelebihan bayar ke saldo kredit bila dipilih.
 */
export async function verifyPaymentBatch(
  tx: TxClient,
  ctx: Ctx,
  batchId: string
): Promise<PaymentBatchDto> {
  const businessId = ctx.businessId;
  if (!businessId) {
    throw new DomainError('BUSINESS_REQUIRED', 'Business ID diperlukan', 400);
  }
  if (ctx.role !== Role.SUPERADMIN) {
    throw new DomainError(
      'FORBIDDEN',
      'Hanya Super Admin yang berhak memverifikasi pembayaran kolektif',
      403
    );
  }

  const batch = await tx.paymentBatch.findFirst({
    where: { id: batchId, businessId },
    include: { allocations: true, payments: true },
  });

  if (!batch) {
    throw new DomainError(
      'PAYMENT_BATCH_NOT_FOUND',
      'Batch pembayaran kolektif tidak ditemukan',
      404
    );
  }

  if (batch.status === PaymentStatus.VERIFIED) {
    return formatPaymentBatchDto(batch);
  }

  if (
    batch.status === PaymentStatus.REJECTED ||
    batch.status === PaymentStatus.VOID
  ) {
    throw new DomainError(
      'INVALID_STATE',
      `Batch pembayaran berstatus ${batch.status} tidak dapat diverifikasi`,
      409
    );
  }

  const distinctOrderIds = Array.from(
    new Set(batch.allocations.map((a) => a.orderId))
  ).sort();
  for (const ordId of distinctOrderIds) {
    await lockOrder(tx, ordId, businessId);
  }

  const orders = await tx.order.findMany({
    where: { businessId, id: { in: distinctOrderIds }, deletedAt: null },
  });
  const orderMap = new Map(orders.map((o) => [o.id, o]));

  const invoiceIds = batch.allocations.map((a) => a.invoiceId);
  const invoices = await tx.invoice.findMany({
    where: { businessId, id: { in: invoiceIds }, deletedAt: null },
  });
  const invoiceMap = new Map(invoices.map((i) => [i.id, i]));

  const perOrderSum = new Map<string, bigint>();
  for (const alloc of batch.allocations) {
    const inv = invoiceMap.get(alloc.invoiceId);
    if (!inv || inv.status !== InvoiceStatus.APPROVED) {
      throw new DomainError(
        'INVALID_STATE',
        'Faktur dalam batch tidak ditemukan atau tidak lagi APPROVED',
        409
      );
    }
    const invRem = inv.amount - inv.paidAmount;
    if (alloc.amount > invRem) {
      throw new DomainError(
        'OVERPAYMENT',
        `Alokasi untuk faktur ${inv.number} melebihi sisa tagihan terkini`,
        422
      );
    }
    perOrderSum.set(
      alloc.orderId,
      (perOrderSum.get(alloc.orderId) ?? BigInt(0)) + alloc.amount
    );
  }

  for (const [ordId, sumAlloc] of perOrderSum.entries()) {
    const ord = orderMap.get(ordId);
    if (!ord || DISALLOWED_PAYMENT_ORDER_STATUSES.includes(ord.status)) {
      throw new DomainError(
        'INVALID_STATE',
        'Salah satu pesanan pada batch tidak dalam status yang valid untuk pembayaran',
        409
      );
    }
    const bal = ord.grandTotal - ord.paidTotal - ord.creditTotal;
    if (sumAlloc > bal) {
      throw new DomainError(
        'OVERPAYMENT',
        `Total alokasi melebihi sisa tagihan pesanan ${ord.orderNo || ord.id}`,
        422
      );
    }
  }

  const now = new Date();
  for (const p of batch.payments) {
    const { receiptNo, verifyToken } = await allocateReceiptIdentifiers(
      tx,
      businessId,
      batch.customerId,
      p.paidAt,
      p.receiptNo,
      p.verifyToken
    );

    await tx.payment.updateMany({
      where: { id: p.id, businessId },
      data: {
        status: PaymentStatus.VERIFIED,
        verifiedById: ctx.user.id,
        verifiedAt: now,
        verifyToken,
        ...(receiptNo ? { receiptNo } : {}),
      },
    });
  }

  for (const ordId of distinctOrderIds) {
    const ord = orderMap.get(ordId)!;
    await applyVerifiedOrderEffects(tx, ctx, businessId, ord.id, ord.status);

    await tx.notification.create({
      data: {
        userId: ord.salesId,
        businessId,
        type: 'PAYMENT_VERIFIED',
        title: 'Pembayaran Kolektif Terverifikasi',
        body: `Pembayaran kolektif (${formatRupiah(Number(perOrderSum.get(ord.id) ?? 0))}) untuk pesanan ${ord.orderNo || ord.id} telah diverifikasi`,
        linkPath: `/orders/${ord.id}`,
        dedupeKey: `pay_batch_ver_${batch.id}_${ord.id}_${ord.salesId}`,
      },
    });
  }

  if (batch.creditAmount > BigInt(0) && batch.creditOption) {
    await tx.customerCreditEntry.create({
      data: {
        businessId,
        customerId: batch.customerId,
        amount: batch.creditAmount,
        reason: `Kelebihan transfer pembayaran kolektif${batch.reference ? ` (${batch.reference})` : ''}`,
        paymentId: batch.payments[0]?.id ?? null,
        createdById: ctx.user.id,
      },
    });
  }

  await tx.paymentBatch.updateMany({
    where: { id: batch.id, businessId },
    data: {
      status: PaymentStatus.VERIFIED,
      verifiedById: ctx.user.id,
      verifiedAt: now,
    },
  });

  await tx.auditLog.create({
    data: {
      businessId,
      actorId: ctx.user.id,
      actorRole: ctx.user.role,
      action: 'PAYMENT_BATCH_VERIFY',
      entityType: 'PaymentBatch',
      entityId: batch.id,
      summary: `Verifikasi pembayaran kolektif ${formatRupiah(Number(batch.totalPaid))} (${batch.allocations.length} faktur${batch.creditAmount > BigInt(0) && batch.creditOption ? `, +saldo kredit ${formatRupiah(Number(batch.creditAmount))}` : ''})`,
    },
  });

  const refreshed = await tx.paymentBatch.findFirstOrThrow({
    where: { id: batch.id, businessId },
    include: { allocations: true },
  });
  return formatPaymentBatchDto(refreshed);
}

/**
 * Menolak pembayaran kolektif yang berstatus PENDING_VERIFICATION.
 */
export async function rejectPaymentBatch(
  tx: TxClient,
  ctx: Ctx,
  batchId: string,
  options: RejectPaymentOptions
): Promise<PaymentBatchDto> {
  const businessId = ctx.businessId;
  if (!businessId) {
    throw new DomainError('BUSINESS_REQUIRED', 'Business ID diperlukan', 400);
  }
  if (ctx.role !== Role.SUPERADMIN) {
    throw new DomainError(
      'FORBIDDEN',
      'Hanya Super Admin yang berhak menolak pembayaran kolektif',
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

  const batch = await tx.paymentBatch.findFirst({
    where: { id: batchId, businessId },
    include: { allocations: true, payments: true },
  });

  if (!batch) {
    throw new DomainError(
      'PAYMENT_BATCH_NOT_FOUND',
      'Batch pembayaran kolektif tidak ditemukan',
      404
    );
  }

  if (batch.status !== PaymentStatus.PENDING_VERIFICATION) {
    throw new DomainError(
      'INVALID_STATE',
      `Hanya batch berstatus PENDING_VERIFICATION yang dapat ditolak (status saat ini: ${batch.status})`,
      409
    );
  }

  const distinctOrderIds = Array.from(
    new Set(batch.allocations.map((a) => a.orderId))
  ).sort();
  for (const ordId of distinctOrderIds) {
    await lockOrder(tx, ordId, businessId);
  }

  await tx.payment.updateMany({
    where: { batchId: batch.id, businessId },
    data: {
      status: PaymentStatus.REJECTED,
      rejectReason: reason,
    },
  });

  await tx.paymentBatch.updateMany({
    where: { id: batch.id, businessId },
    data: {
      status: PaymentStatus.REJECTED,
      rejectReason: reason,
    },
  });

  const orders = await tx.order.findMany({
    where: { businessId, id: { in: distinctOrderIds }, deletedAt: null },
    select: { id: true, orderNo: true, salesId: true },
  });
  for (const ord of orders) {
    await tx.notification.create({
      data: {
        userId: ord.salesId,
        businessId,
        type: 'PAYMENT_REJECTED',
        title: 'Pembayaran Kolektif Ditolak',
        body: `Pembayaran kolektif (${formatRupiah(Number(batch.totalPaid))}) untuk pesanan ${ord.orderNo || ord.id} ditolak: ${reason}`,
        linkPath: `/orders/${ord.id}`,
        dedupeKey: `pay_batch_rej_${batch.id}_${ord.id}_${ord.salesId}`,
      },
    });
  }

  await tx.auditLog.create({
    data: {
      businessId,
      actorId: ctx.user.id,
      actorRole: ctx.user.role,
      action: 'PAYMENT_BATCH_REJECT',
      entityType: 'PaymentBatch',
      entityId: batch.id,
      summary: `Penolakan pembayaran kolektif ${formatRupiah(Number(batch.totalPaid))}: ${reason}`,
      reason,
    },
  });

  const refreshed = await tx.paymentBatch.findFirstOrThrow({
    where: { id: batch.id, businessId },
    include: { allocations: true },
  });
  return formatPaymentBatchDto(refreshed);
}

/**
 * Membatalkan (Void) seluruh batch pembayaran kolektif beserta saldo kredit overpayment jika belum terpakai.
 */
export async function voidPaymentBatch(
  tx: TxClient,
  ctx: Ctx,
  batchId: string,
  options: VoidPaymentOptions
): Promise<PaymentBatchDto> {
  const businessId = ctx.businessId;
  if (!businessId) {
    throw new DomainError('BUSINESS_REQUIRED', 'Business ID diperlukan', 400);
  }
  if (ctx.role !== Role.SUPERADMIN) {
    throw new DomainError(
      'FORBIDDEN',
      'Hanya Super Admin yang berhak membatalkan (void) pembayaran kolektif',
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

  const batch = await tx.paymentBatch.findFirst({
    where: { id: batchId, businessId },
    include: { allocations: true, payments: true },
  });

  if (!batch) {
    throw new DomainError(
      'PAYMENT_BATCH_NOT_FOUND',
      'Batch pembayaran kolektif tidak ditemukan',
      404
    );
  }

  if (batch.status !== PaymentStatus.VERIFIED) {
    throw new DomainError(
      'INVALID_STATE',
      `Hanya batch berstatus VERIFIED yang dapat di-void (status saat ini: ${batch.status})`,
      409
    );
  }

  // Pastikan saldo kredit hasil kelebihan bayar belum terpakai sebelum melakukan mutasi void apapun
  if (batch.creditAmount > BigInt(0) && batch.creditOption) {
    const entries = await tx.customerCreditEntry.findMany({
      where: { customerId: batch.customerId, businessId },
    });
    const currentBalance = entries.reduce((sum, e) => sum + e.amount, BigInt(0));
    if (currentBalance < batch.creditAmount) {
      throw new DomainError(
        'CREDIT_ALREADY_USED',
        `Batch tidak dapat di-void karena saldo kredit kelebihan bayar (${formatRupiah(Number(batch.creditAmount))}) telah sebagian atau seluruhnya terpakai (sisa saldo: ${formatRupiah(Number(currentBalance))})`,
        409
      );
    }
  }

  const distinctOrderIds = Array.from(
    new Set(batch.allocations.map((a) => a.orderId))
  ).sort();
  for (const ordId of distinctOrderIds) {
    await lockOrder(tx, ordId, businessId);
  }

  if (batch.creditAmount > BigInt(0) && batch.creditOption) {
    await tx.customerCreditEntry.create({
      data: {
        businessId,
        customerId: batch.customerId,
        amount: -batch.creditAmount,
        reason: `Pembalikan kelebihan transfer akibat void pembayaran kolektif: ${reason}`,
        paymentId: batch.payments[0]?.id ?? null,
        createdById: ctx.user.id,
      },
    });
  }

  for (const p of batch.payments) {
    const updatedNotes = p.notes
      ? `${p.notes}\n[VOID]: ${reason}`
      : `[VOID]: ${reason}`;
    await tx.payment.updateMany({
      where: { id: p.id, businessId },
      data: {
        status: PaymentStatus.VOID,
        notes: updatedNotes,
        rejectReason: reason,
      },
    });
  }

  await tx.paymentBatch.updateMany({
    where: { id: batch.id, businessId },
    data: {
      status: PaymentStatus.VOID,
      rejectReason: reason,
    },
  });

  const orders = await tx.order.findMany({
    where: { businessId, id: { in: distinctOrderIds }, deletedAt: null },
    select: { id: true, orderNo: true, salesId: true },
  });
  for (const ord of orders) {
    await applyVoidedOrderEffects(tx, ord.id, businessId);

    await tx.notification.create({
      data: {
        userId: ord.salesId,
        businessId,
        type: 'PAYMENT_VOIDED',
        title: 'Pembayaran Kolektif Dibatalkan (Void)',
        body: `Pembayaran kolektif (${formatRupiah(Number(batch.totalPaid))}) terkait pesanan ${ord.orderNo || ord.id} telah di-void: ${reason}`,
        linkPath: `/orders/${ord.id}`,
        dedupeKey: `pay_batch_void_${batch.id}_${ord.id}_${ord.salesId}`,
      },
    });
  }

  await tx.auditLog.create({
    data: {
      businessId,
      actorId: ctx.user.id,
      actorRole: ctx.user.role,
      action: 'PAYMENT_BATCH_VOID',
      entityType: 'PaymentBatch',
      entityId: batch.id,
      summary: `Pembatalan (void) pembayaran kolektif ${formatRupiah(Number(batch.totalPaid))}: ${reason}`,
      reason,
    },
  });

  const refreshed = await tx.paymentBatch.findFirstOrThrow({
    where: { id: batch.id, businessId },
    include: { allocations: true },
  });
  return formatPaymentBatchDto(refreshed);
}
