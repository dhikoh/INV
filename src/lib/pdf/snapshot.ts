import { InvoiceTheme, InvoiceType } from '@prisma/client';
import { prisma } from '@/lib/db';
import { DomainError } from '../domain/money';

export type TxClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

/**
 * Interface snapshot invoice sesuai Seksi 14.1 Dokumen Spesifikasi.
 *
 * PENTING (Seksi 14.1 & Kriteria Tes 17.3 nomor 20):
 * DILARANG memuat informasi rahasia internal seperti:
 * costPrice, floorPrice, belowMin, alasan/catatan override,
 * sumber diskon (PROMO, SUBSIDY), riwayat harga, komisi, margin, atau nama sales.
 */
export interface InvoiceSnapshot {
  schemaVersion: 1;
  number: string | null; // null hanya untuk pratinjau sebelum disetujui
  type: 'DP' | 'FINAL';
  issueDate: string; // ISO string
  dueDate: string; // ISO string
  theme: 'PROFESIONAL' | 'FAMILY' | 'MINIMALIS' | 'MODERN' | 'KLASIK';
  business: {
    name: string;
    legalName: string | null;
    address: string | null;
    phone: string | null;
    email: string | null;
    npwp: string | null;
    logoPath: string | null;
  };
  customer: {
    code: string;
    name: string;
    contactName: string | null;
    billingAddress: string | null;
    shippingAddress: string | null;
    npwp: string | null;
  };
  items: {
    no: number;
    name: string;
    sku: string;
    qty: number;
    unit: string;
    unitPrice: number;
    lineDiscount: number;
    lineNet: number;
  }[];
  totals: {
    subtotal: number;
    discountTotal: number;
    shippingCharge: number;
    ppnEnabled: boolean;
    ppnRateBps: number;
    ppnAmount: number;
    grandTotal: number;
  };
  billing: {
    dpBps: number;
    dpAmount: number; // untuk DP
    amountDue: number; // jumlah yang ditagihkan di invoice ini
    dpInvoiceNumber: string | null;
    dpPaid: number; // untuk FINAL: rujukan DP yang sudah dibayar
  };
  banks: {
    bankName: string;
    accountNumber: string;
    accountHolder: string;
  }[];
  note: string | null;
}

export interface BuildSnapshotOptions {
  number?: string | null;
  issueDate?: Date;
  dueDate?: Date;
  theme?: InvoiceTheme;
}

/**
 * Membangun snapshot data invoice yang statis, tahan audit, dan aman dari kebocoran data rahasia.
 * Disimpan di Invoice.snapshot saat invoice disetujui (APPROVED).
 *
 * Rujukan: Seksi 14.1 Dokumen Spesifikasi.
 */
export async function buildInvoiceSnapshot(
  tx: TxClient,
  invoiceId: string,
  options?: BuildSnapshotOptions
): Promise<InvoiceSnapshot> {
  const invoice = await tx.invoice.findFirst({
    where: { id: invoiceId, deletedAt: null },
  });

  if (!invoice) {
    throw new DomainError('INVOICE_NOT_FOUND', 'Invoice tidak ditemukan', 404);
  }

  const [order, business, bankAccounts] = await Promise.all([
    tx.order.findFirst({
      where: { id: invoice.orderId, businessId: invoice.businessId, deletedAt: null },
      include: {
        customer: true,
        items: {
          orderBy: { sortOrder: 'asc' },
        },
      },
    }),
    tx.business.findUnique({
      where: { id: invoice.businessId },
    }),
    tx.bankAccount.findMany({
      where: { businessId: invoice.businessId, deletedAt: null },
      orderBy: [{ isDefault: 'desc' }],
    }),
  ]);

  if (!order || !order.customer) {
    throw new DomainError('ORDER_NOT_FOUND', 'Pesanan atau data pelanggan tidak ditemukan', 404);
  }

  if (!business) {
    throw new DomainError('BUSINESS_NOT_FOUND', 'Data usaha tidak ditemukan', 404);
  }

  // Tentukan nomor resmi, tanggal terbit, tanggal jatuh tempo, dan tema
  const finalNumber = options?.number !== undefined ? options.number : invoice.number;
  const issueDate = (options?.issueDate || invoice.issueDate || new Date()).toISOString();
  const dueDate = (
    options?.dueDate ||
    invoice.dueDate ||
    new Date(Date.now() + (business.dueDays ?? 7) * 24 * 60 * 60 * 1000)
  ).toISOString();
  const theme = (options?.theme || invoice.theme || business.invoiceTheme || InvoiceTheme.PROFESIONAL) as InvoiceSnapshot['theme'];

  // Ambil referensi DP jika invoice ini bertipe FINAL dan order menggunakan DP
  let dpInvoiceNumber: string | null = null;
  let dpPaid = 0;

  if (invoice.type === InvoiceType.FINAL && order.dpBps > 0) {
    const dpInvoice = await tx.invoice.findFirst({
      where: {
        orderId: order.id,
        businessId: invoice.businessId,
        type: InvoiceType.DP,
        status: { in: ['APPROVED', 'PENDING_APPROVAL'] },
        deletedAt: null,
      },
      orderBy: { version: 'desc' },
    });

    if (dpInvoice) {
      dpInvoiceNumber = dpInvoice.number;
    }
    dpPaid = Number(order.paidTotal);
  }

  // Pemetaan baris produk (hanya field publik tanpa informasi harga modal/floor/rahasia)
  const items = order.items.map((item, idx) => ({
    no: idx + 1,
    name: item.productName,
    sku: item.sku,
    qty: item.qty,
    unit: item.unit,
    unitPrice: Number(item.unitPrice),
    lineDiscount: Number(item.lineDiscount),
    lineNet: Number(item.lineNet),
  }));

  const snapshot: InvoiceSnapshot = {
    schemaVersion: 1,
    number: finalNumber ?? null,
    type: invoice.type as 'DP' | 'FINAL',
    issueDate,
    dueDate,
    theme,
    business: {
      name: business.name,
      legalName: business.legalName,
      address: business.address,
      phone: business.phone,
      email: business.email,
      npwp: business.npwp,
      logoPath: business.logoPath,
    },
    customer: {
      code: order.customer.code,
      name: order.customer.name,
      contactName: order.customer.contactName,
      billingAddress: order.customer.billingAddress || order.customer.address,
      shippingAddress: order.customer.shippingAddress || order.deliveryAddress || order.customer.address,
      npwp: order.customer.npwp,
    },
    items,
    totals: {
      subtotal: Number(order.subtotal),
      discountTotal: Number(order.discountTotal),
      shippingCharge: Number(order.shippingCharge),
      ppnEnabled: order.ppnEnabled,
      ppnRateBps: order.ppnRateBps,
      ppnAmount: Number(order.ppnAmount),
      grandTotal: Number(order.grandTotal),
    },
    billing: {
      dpBps: order.dpBps,
      dpAmount: Number(order.dpAmount),
      amountDue: Number(invoice.amount),
      dpInvoiceNumber,
      dpPaid,
    },
    banks: bankAccounts.map((b) => ({
      bankName: b.bankName,
      accountNumber: b.accountNumber,
      accountHolder: b.accountHolder,
    })),
    note: business.invoiceFooterNote ?? null,
  };

  return snapshot;
}
