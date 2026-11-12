import { InvoiceStatus, OrderStatus, PaymentMethod, PaymentStatus } from '@prisma/client';
import { prisma } from '@/lib/db';
import { maskAddress, maskCustomerName } from '@/lib/domain/verify';
import { resolvePaymentLegalNotice } from '@/lib/domain/paymentPolicy';
import { formatDateId } from '@/lib/format/date';

export type PublicAuthenticityStatus =
  | 'OFFICIAL_APPROVED'
  | 'PROFORMA_DRAFT'
  | 'PENDING_APPROVAL'
  | 'CANCELLED_OR_VOID'
  | 'VERIFIED_RECEIPT'
  | 'PROMO_EXPIRED'
  | 'STALE_PRICE'
  | 'SALES_INACTIVE';

export type PublicDocumentType =
  | 'PROFORMA_ORDER'
  | 'FAKTUR_DP'
  | 'FAKTUR_PENJUALAN'
  | 'KWITANSI_PEMBAYARAN'
  | 'KATALOG_PROMO'
  | 'KATALOG_HARGA';

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

export interface PublicVerifyCatalogProduct {
  name: string;
  sku: string;
  unit: string;
  price: number;
  strikePrice?: number | null;
  badgeText?: string | null;
}

export interface PublicVerifyDocumentDto {
  token: string;
  authenticityStatus: PublicAuthenticityStatus;
  documentType: PublicDocumentType;
  documentNumber: string;
  orderNo: string;
  orderStatus?: OrderStatus | null;
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
    website?: string | null;
    tagline?: string | null;
    instagram?: string | null;
  };
  salesPic?: {
    name: string;
    phone: string | null;
    isActive: boolean;
  } | null;
  catalogDetail?: {
    title: string;
    subtitle?: string | null;
    isPromo: boolean;
    promoValidityLabel?: string | null;
    promoExpired: boolean;
    termsNote?: string | null;
    products: PublicVerifyCatalogProduct[];
  } | null;
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
        website: true,
        tagline: true,
        instagram: true,
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
 * Mencari dan memverifikasi keaslian Proforma Order, Faktur Resmi, Kwitansi, atau Katalog
 * melalui `verifyToken` publik tanpa memerlukan login.
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

    const documentType: PublicDocumentType =
      invoice.type === 'DP' ? 'FAKTUR_DP' : 'FAKTUR_PENJUALAN';

    const documentNumber = invoice.number || `INV-DRAFT-${invoice.id.slice(-6).toUpperCase()}`;

    const grandTotal = Number(order.grandTotal);
    const verifiedPaidTotal = Number(order.paidTotal);
    const amountDue = Number(invoice.amount);

    return {
      token: cleanToken,
      authenticityStatus,
      documentType,
      documentNumber,
      orderNo: orderRef,
      orderStatus: order.status,
      issueDate: (invoice.issueDate || invoice.createdAt).toISOString(),
      dueDate: invoice.dueDate ? invoice.dueDate.toISOString() : null,
      customerName: maskCustomerName(order.customer.name),
      maskedAddress: maskAddress(order.deliveryAddress || order.customer.address),
      business: {
        name: ctx.business.name,
        legalName: ctx.business.legalName,
        address: ctx.business.address,
        phone: ctx.business.phone,
        email: ctx.business.email,
        website: ctx.business.website,
        tagline: ctx.business.tagline,
        instagram: ctx.business.instagram,
      },
      amounts: {
        grandTotal,
        amountDue,
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

  // 2. Cek apakah token milik Kwitansi Pembayaran (Payment)
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
          amount: true,
          paidAt: true,
          method: true,
          status: true,
          createdAt: true,
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
            where: { id: payment.invoiceId, businessId },
            select: { number: true, type: true },
          })
        : null,
      listVerifiedPaymentsForOrder(businessId, payment.orderId),
    ]);

    if (!order) {
      return null;
    }

    const orderRef = formatOrderRef(order.orderNo, order.id);
    const isInvalidReceipt =
      payment.status === PaymentStatus.REJECTED ||
      payment.status === PaymentStatus.VOID ||
      order.status === OrderStatus.CANCELLED;

    const authenticityStatus: PublicAuthenticityStatus = isInvalidReceipt
      ? 'CANCELLED_OR_VOID'
      : payment.status === PaymentStatus.VERIFIED
      ? 'VERIFIED_RECEIPT'
      : 'PENDING_APPROVAL';

    const grandTotal = Number(order.grandTotal);
    const verifiedPaidTotal = Number(order.paidTotal);

    return {
      token: cleanToken,
      authenticityStatus,
      documentType: 'KWITANSI_PEMBAYARAN',
      documentNumber: payment.receiptNo || `KWT-PENDING-${payment.id.slice(-6).toUpperCase()}`,
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
        website: ctx.business.website,
        tagline: ctx.business.tagline,
        instagram: ctx.business.instagram,
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
        website: ctx.business.website,
        tagline: ctx.business.tagline,
        instagram: ctx.business.instagram,
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

  // 4. Cek apakah token milik Katalog (Catalog)
  const catalogMatches = await prisma.$queryRaw<ResolvedTokenRow[]>`
    SELECT "id", "businessId"
    FROM "Catalog"
    WHERE "verifyToken" = ${cleanToken}
    LIMIT 1
  `;

  if (Array.isArray(catalogMatches) && catalogMatches.length > 0) {
    const { id, businessId } = catalogMatches[0];
    const [catalog, ctx] = await Promise.all([
      prisma.catalog.findFirst({
        where: { id, businessId },
        include: {
          items: {
            orderBy: { sortOrder: 'asc' },
          },
        },
      }),
      resolveBusinessContext(businessId),
    ]);

    if (!catalog || !ctx.business) {
      return null;
    }

    // Ambil data owner / sales
    const owner = await prisma.user.findUnique({
      where: { id: catalog.ownerId },
      select: {
        id: true,
        name: true,
        phone: true,
        isActive: true,
        deletedAt: true,
      },
    });

    const isCancelled = catalog.deletedAt !== null;
    const isSalesInactive = !owner || !owner.isActive || owner.deletedAt !== null;

    // Cek produk & stale price
    const productIds = catalog.items.map((i) => i.productId);
    const products =
      productIds.length > 0
        ? await prisma.product.findMany({
            where: { id: { in: productIds }, businessId },
            select: {
              id: true,
              name: true,
              sku: true,
              unit: true,
              basePrice: true,
              minPrice: true,
              deletedAt: true,
            },
          })
        : [];
    const productMap = new Map(products.map((p) => [p.id, p]));

    let hasStale = false;
    for (const item of catalog.items) {
      const p = productMap.get(item.productId);
      if (!p || p.deletedAt !== null) {
        hasStale = true;
      } else if (Number(item.price) < Number(p.minPrice)) {
        hasStale = true;
      }
    }

    // Cek kedaluwarsa promo
    const isPromoPeriod = catalog.isPromo && catalog.promoValidityType === 'PERIOD';
    const isPromoExpired = Boolean(
      isPromoPeriod && catalog.promoEndAt && new Date(catalog.promoEndAt).getTime() < Date.now()
    );

    let authenticityStatus: PublicAuthenticityStatus = 'OFFICIAL_APPROVED';
    if (isCancelled) {
      authenticityStatus = 'CANCELLED_OR_VOID';
    } else if (isSalesInactive) {
      authenticityStatus = 'SALES_INACTIVE';
    } else if (isPromoExpired) {
      authenticityStatus = 'PROMO_EXPIRED';
    } else if (hasStale) {
      authenticityStatus = 'STALE_PRICE';
    }

    const docType: PublicDocumentType = catalog.isPromo ? 'KATALOG_PROMO' : 'KATALOG_HARGA';

    let promoValidityLabel = catalog.validityText || '';
    if (!promoValidityLabel && catalog.isPromo) {
      if (catalog.promoValidityType === 'PERIOD' && catalog.promoStartAt && catalog.promoEndAt) {
        promoValidityLabel = `Periode: ${formatDateId(catalog.promoStartAt, 'short')} - ${formatDateId(catalog.promoEndAt, 'short')}`;
      } else {
        promoValidityLabel = 'Berlaku Selama Persediaan Masih Ada';
      }
    }

    const verifiedProducts: PublicVerifyCatalogProduct[] = catalog.items.map((item) => {
      const p = productMap.get(item.productId);
      const itemPrice = Number(item.price);
      const basePrice = p ? Number(p.basePrice) : 0;
      const showStrike = catalog.showStrikethroughPrice && itemPrice < basePrice;
      return {
        name: p?.name || 'Produk',
        sku: p?.sku || '-',
        unit: p?.unit || 'pcs',
        price: itemPrice,
        strikePrice: showStrike ? basePrice : null,
        badgeText: item.badgeText || null,
      };
    });

    return {
      token: cleanToken,
      authenticityStatus,
      documentType: docType,
      documentNumber: catalog.title,
      orderNo: `KAT-${catalog.id.slice(-6).toUpperCase()}`,
      orderStatus: null,
      issueDate: catalog.createdAt.toISOString(),
      dueDate: catalog.promoEndAt ? catalog.promoEndAt.toISOString() : null,
      customerName: 'Katalog Publik Resmi',
      maskedAddress: null,
      business: {
        name: ctx.business.name,
        legalName: ctx.business.legalName,
        address: ctx.business.address,
        phone: ctx.business.phone,
        email: ctx.business.email,
        website: ctx.business.website,
        tagline: ctx.business.tagline,
        instagram: ctx.business.instagram,
      },
      salesPic: owner
        ? {
            name: owner.name,
            phone: owner.phone,
            isActive: Boolean(owner.isActive && owner.deletedAt === null),
          }
        : null,
      catalogDetail: {
        title: catalog.title,
        subtitle: catalog.subtitle,
        isPromo: catalog.isPromo,
        promoValidityLabel,
        promoExpired: isPromoExpired,
        termsNote: catalog.termsNote,
        products: verifiedProducts,
      },
      amounts: {
        grandTotal: 0,
        amountDue: 0,
        verifiedPaidTotal: 0,
        remainingDue: 0,
        dpAmount: 0,
        dpBps: 0,
      },
      receiptDetail: null,
      banks: isCancelled ? [] : ctx.bankAccounts,
      verifiedPayments: [],
      legalNotice: resolvePaymentLegalNotice(ctx.business.paymentLegalNotice),
    };
  }

  return null;
}
