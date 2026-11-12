import { InvoiceStatus, OrderStatus, PaymentMethod, PaymentStatus } from '@prisma/client';
import { prisma } from '@/lib/db';
import { maskAddress, maskCustomerName } from '@/lib/domain/verify';
import { resolvePaymentLegalNotice } from '@/lib/domain/paymentPolicy';

export type PublicAuthenticityStatus =
  | 'OFFICIAL_APPROVED'
  | 'PROFORMA_DRAFT'
  | 'PENDING_APPROVAL'
  | 'CANCELLED_OR_VOID'
  | 'VERIFIED_RECEIPT';

export type PublicDocumentType =
  | 'PROFORMA_ORDER'
  | 'FAKTUR_DP'
  | 'FAKTUR_PENJUALAN'
  | 'KWITANSI_PEMBAYARAN';

export interface PublicVerifyBankAccount {
  bankName: string;
  accountNumber: string;
  accountHolder: string;
  isDefault: boolean;
}

export interface PublicVerifyPaymentSummary {
  id: string;
  receiptNo: string | null;
  paidAt: string;
  method: PaymentMethod;
  amount: number;
}

export interface PublicVerifyDocumentDto {
  token: string;
  authenticityStatus: PublicAuthenticityStatus;
  documentType: PublicDocumentType;
  documentNumber: string;
  orderNo: string;
  orderStatus: OrderStatus;
  issueDate: string;
  dueDate: string | null;
  customerName: string;
  maskedAddress: string | null;
  business: {
    name: string;
    legalName: string | null;
    address: string | null;
    phone: string | null;
    email: string | null;
  };
  amounts: {
    grandTotal: number;
    amountDue: number;
    verifiedPaidTotal: number;
    remainingDue: number;
    dpAmount: number;
    dpBps: number;
  };
  receiptDetail: {
    amount: number;
    method: PaymentMethod;
    paidAt: string;
    invoiceNumber: string | null;
    invoiceType: string | null;
  } | null;
  banks: PublicVerifyBankAccount[];
  verifiedPayments: PublicVerifyPaymentSummary[];
  legalNotice: string;
}

interface ResolvedTokenRow {
  id: string;
  businessId: string;
}

const VALID_TOKEN_REGEX = /^[A-Za-z0-9_-]{8,80}$/;

const FINAL_OR_ACTIVE_ORDER_STATUSES: ReadonlySet<OrderStatus> = new Set([
  OrderStatus.AWAITING_DP,
  OrderStatus.IN_PROCESS,
  OrderStatus.FINAL_PENDING_APPROVAL,
  OrderStatus.AWAITING_FINAL_PAYMENT,
  OrderStatus.COMPLETED,
]);

async function resolveBusinessContext(businessId: string) {
  const [business, bankAccounts] = await Promise.all([
    prisma.business.findFirst({
      where: { id: businessId },
      select: {
        id: true,
        name: true,
        legalName: true,
        address: true,
        phone: true,
        email: true,
        paymentLegalNotice: true,
        showBankOnProforma: true,
      },
    }),
    prisma.bankAccount.findMany({
      where: { businessId, deletedAt: null },
      orderBy: [{ isDefault: 'desc' }],
      select: {
        bankName: true,
        accountNumber: true,
        accountHolder: true,
        isDefault: true,
      },
    }),
  ]);

  return { business, bankAccounts };
}

async function listVerifiedPaymentsForOrder(
  businessId: string,
  orderId: string
): Promise<PublicVerifyPaymentSummary[]> {
  const rows = await prisma.payment.findMany({
    where: {
      businessId,
      orderId,
      status: PaymentStatus.VERIFIED,
    },
    orderBy: [{ paidAt: 'desc' }, { createdAt: 'desc' }],
    select: {
      id: true,
      receiptNo: true,
      paidAt: true,
      method: true,
      amount: true,
    },
  });

  return rows.map((p) => ({
    id: p.id,
    receiptNo: p.receiptNo,
    paidAt: p.paidAt.toISOString(),
    method: p.method,
    amount: Number(p.amount),
  }));
}

async function resolveOrderWithMaskedCustomer(businessId: string, orderId: string) {
  return prisma.order.findFirst({
    where: { id: orderId, businessId, deletedAt: null },
    select: {
      id: true,
      orderNo: true,
      orderDate: true,
      status: true,
      grandTotal: true,
      paidTotal: true,
      dpAmount: true,
      dpBps: true,
      deliveryAddress: true,
      customer: {
        select: {
          name: true,
          address: true,
        },
      },
    },
  });
}

function formatOrderRef(orderNo: string | null, orderId: string): string {
  return orderNo || `ORD-${orderId.slice(-6).toUpperCase()}`;
}

/**
 * Mencari dan memverifikasi keaslian Proforma Order, Faktur Resmi, atau Kwitansi
 * melalui `verifyToken` publik tanpa memerlukan login.
 *
 * Isolasi tenant dijaga ketat: `$queryRaw` berparameter hanya dipakai untuk memetakan
 * `@unique verifyToken` ke `{ id, businessId }`, lalu seluruh pembacaan data lanjutan
 * menggunakan `where: { businessId }` dan hanya mengembalikan data tersamar tanpa PII/HPP.
 */
export async function resolvePublicVerifyDocument(
  token: string
): Promise<PublicVerifyDocumentDto | null> {
  const cleanToken = (token ?? '').trim();
  if (!VALID_TOKEN_REGEX.test(cleanToken)) {
    return null;
  }

  // 1. Cek apakah token milik Invoice resmi/pratinjau
  const invoiceMatches = await prisma.$queryRaw<ResolvedTokenRow[]>`
    SELECT "id", "businessId"
    FROM "Invoice"
    WHERE "verifyToken" = ${cleanToken} AND "deletedAt" IS NULL
    LIMIT 1
  `;

  if (Array.isArray(invoiceMatches) && invoiceMatches.length > 0) {
    const { id, businessId } = invoiceMatches[0];
    const [invoice, ctx] = await Promise.all([
      prisma.invoice.findFirst({
        where: { id, businessId, deletedAt: null },
        select: {
          id: true,
          orderId: true,
          number: true,
          type: true,
          status: true,
          amount: true,
          issueDate: true,
          dueDate: true,
          createdAt: true,
        },
      }),
      resolveBusinessContext(businessId),
    ]);

    if (!invoice || !ctx.business) {
      return null;
    }

    const [order, verifiedPayments] = await Promise.all([
      resolveOrderWithMaskedCustomer(businessId, invoice.orderId),
      listVerifiedPaymentsForOrder(businessId, invoice.orderId),
    ]);

    if (!order) {
      return null;
    }

    const orderRef = formatOrderRef(order.orderNo, order.id);
    const isCancelledOrVoid =
      invoice.status === InvoiceStatus.VOID ||
      invoice.status === InvoiceStatus.REJECTED ||
      order.status === OrderStatus.CANCELLED;

    const authenticityStatus: PublicAuthenticityStatus = isCancelledOrVoid
      ? 'CANCELLED_OR_VOID'
      : invoice.status === InvoiceStatus.APPROVED
      ? 'OFFICIAL_APPROVED'
      : 'PENDING_APPROVAL';

    const grandTotal = Number(order.grandTotal);
    const verifiedPaidTotal = Number(order.paidTotal);

    return {
      token: cleanToken,
      authenticityStatus,
      documentType:
        invoice.type === 'DP' ? 'FAKTUR_DP' : 'FAKTUR_PENJUALAN',
      documentNumber: invoice.number || `PRATINJAU-${orderRef}`,
      orderNo: orderRef,
      orderStatus: order.status,
      issueDate: (invoice.issueDate ?? invoice.createdAt).toISOString(),
      dueDate: invoice.dueDate ? invoice.dueDate.toISOString() : null,
      customerName: maskCustomerName(order.customer.name),
      maskedAddress: maskAddress(order.deliveryAddress || order.customer.address),
      business: {
        name: ctx.business.name,
        legalName: ctx.business.legalName,
        address: ctx.business.address,
        phone: ctx.business.phone,
        email: ctx.business.email,
      },
      amounts: {
        grandTotal,
        amountDue: Number(invoice.amount),
        verifiedPaidTotal,
        remainingDue: Math.max(0, grandTotal - verifiedPaidTotal),
        dpAmount: Number(order.dpAmount),
        dpBps: order.dpBps,
      },
      receiptDetail: null,
      banks: isCancelledOrVoid ? [] : ctx.bankAccounts,
      verifiedPayments,
      legalNotice: resolvePaymentLegalNotice(ctx.business.paymentLegalNotice),
    };
  }

  // 2. Cek apakah token milik Kwitansi Pembayaran
  const paymentMatches = await prisma.$queryRaw<ResolvedTokenRow[]>`
    SELECT "id", "businessId"
    FROM "Payment"
    WHERE "verifyToken" = ${cleanToken}
    LIMIT 1
  `;

  if (Array.isArray(paymentMatches) && paymentMatches.length > 0) {
    const { id, businessId } = paymentMatches[0];
    const [payment, ctx] = await Promise.all([
      prisma.payment.findFirst({
        where: { id, businessId },
        select: {
          id: true,
          orderId: true,
          invoiceId: true,
          receiptNo: true,
          status: true,
          amount: true,
          method: true,
          paidAt: true,
        },
      }),
      resolveBusinessContext(businessId),
    ]);

    if (!payment || !ctx.business) {
      return null;
    }

    const [order, invoice, verifiedPayments] = await Promise.all([
      resolveOrderWithMaskedCustomer(businessId, payment.orderId),
      payment.invoiceId
        ? prisma.invoice.findFirst({
            where: { id: payment.invoiceId, businessId, deletedAt: null },
            select: { number: true, type: true },
          })
        : Promise.resolve(null),
      listVerifiedPaymentsForOrder(businessId, payment.orderId),
    ]);

    if (!order) {
      return null;
    }

    const orderRef = formatOrderRef(order.orderNo, order.id);
    const isInvalidReceipt =
      payment.status !== PaymentStatus.VERIFIED ||
      order.status === OrderStatus.CANCELLED;

    const grandTotal = Number(order.grandTotal);
    const verifiedPaidTotal = Number(order.paidTotal);

    return {
      token: cleanToken,
      authenticityStatus: isInvalidReceipt
        ? 'CANCELLED_OR_VOID'
        : 'VERIFIED_RECEIPT',
      documentType: 'KWITANSI_PEMBAYARAN',
      documentNumber:
        payment.receiptNo ||
        `KWT-${payment.id.slice(-6).toUpperCase()}`,
      orderNo: orderRef,
      orderStatus: order.status,
      issueDate: payment.paidAt.toISOString(),
      dueDate: null,
      customerName: maskCustomerName(order.customer.name),
      maskedAddress: maskAddress(order.deliveryAddress || order.customer.address),
      business: {
        name: ctx.business.name,
        legalName: ctx.business.legalName,
        address: ctx.business.address,
        phone: ctx.business.phone,
        email: ctx.business.email,
      },
      amounts: {
        grandTotal,
        amountDue: Number(payment.amount),
        verifiedPaidTotal,
        remainingDue: Math.max(0, grandTotal - verifiedPaidTotal),
        dpAmount: Number(order.dpAmount),
        dpBps: order.dpBps,
      },
      receiptDetail: {
        amount: Number(payment.amount),
        method: payment.method,
        paidAt: payment.paidAt.toISOString(),
        invoiceNumber: invoice?.number ?? null,
        invoiceType: invoice?.type ?? null,
      },
      banks: isInvalidReceipt ? [] : ctx.bankAccounts,
      verifiedPayments,
      legalNotice: resolvePaymentLegalNotice(ctx.business.paymentLegalNotice),
    };
  }

  // 3. Cek apakah token milik Proforma Order
  const orderMatches = await prisma.$queryRaw<ResolvedTokenRow[]>`
    SELECT "id", "businessId"
    FROM "Order"
    WHERE "verifyToken" = ${cleanToken} AND "deletedAt" IS NULL
    LIMIT 1
  `;

  if (Array.isArray(orderMatches) && orderMatches.length > 0) {
    const { id, businessId } = orderMatches[0];
    const [order, ctx] = await Promise.all([
      resolveOrderWithMaskedCustomer(businessId, id),
      resolveBusinessContext(businessId),
    ]);

    if (!order || !ctx.business) {
      return null;
    }

    const verifiedPayments = await listVerifiedPaymentsForOrder(
      businessId,
      order.id
    );

    const orderRef = formatOrderRef(order.orderNo, order.id);
    const isCancelled = order.status === OrderStatus.CANCELLED;
    const isOrderApproved = FINAL_OR_ACTIVE_ORDER_STATUSES.has(order.status);

    const authenticityStatus: PublicAuthenticityStatus = isCancelled
      ? 'CANCELLED_OR_VOID'
      : isOrderApproved
      ? 'OFFICIAL_APPROVED'
      : 'PROFORMA_DRAFT';

    const showBanks =
      !isCancelled &&
      (isOrderApproved || ctx.business.showBankOnProforma === true);

    const grandTotal = Number(order.grandTotal);
    const verifiedPaidTotal = Number(order.paidTotal);

    return {
      token: cleanToken,
      authenticityStatus,
      documentType: 'PROFORMA_ORDER',
      documentNumber: `PRO-${orderRef}`,
      orderNo: orderRef,
      orderStatus: order.status,
      issueDate: order.orderDate.toISOString(),
      dueDate: null,
      customerName: maskCustomerName(order.customer.name),
      maskedAddress: maskAddress(order.deliveryAddress || order.customer.address),
      business: {
        name: ctx.business.name,
        legalName: ctx.business.legalName,
        address: ctx.business.address,
        phone: ctx.business.phone,
        email: ctx.business.email,
      },
      amounts: {
        grandTotal,
        amountDue:
          Number(order.dpAmount) > 0 && order.dpBps < 10000
            ? Number(order.dpAmount)
            : grandTotal,
        verifiedPaidTotal,
        remainingDue: Math.max(0, grandTotal - verifiedPaidTotal),
        dpAmount: Number(order.dpAmount),
        dpBps: order.dpBps,
      },
      receiptDetail: null,
      banks: showBanks ? ctx.bankAccounts : [],
      verifiedPayments,
      legalNotice: resolvePaymentLegalNotice(ctx.business.paymentLegalNotice),
    };
  }

  return null;
}
