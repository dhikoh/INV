import { Role } from '@prisma/client';
import { prisma } from '@/lib/db';
import { DomainError } from '../domain/money';
import { VendorPaymentCreateInput } from '../validation/purchase-order';

export type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

export interface VendorLedgerEntry {
  id: string;
  date: Date;
  type: 'PURCHASE' | 'PAYMENT';
  refNo: string;
  description: string;
  debit: number; // Tagihan / Pembelian (menambah hutang ke vendor)
  credit: number; // Pembayaran yang dilakukan (mengurangi hutang)
  balance: number; // Saldo kumulatif hutang berjalan
  details?: Record<string, unknown>;
}

export interface VendorLedgerResult {
  vendorId: string;
  vendorName: string;
  summary: {
    totalPurchases: number;
    totalPayments: number;
    currentBalance: number; // Sisa hutang berjalan ke vendor
  };
  entries: VendorLedgerEntry[];
}

/**
 * Mencatat pembayaran kepada vendor (VendorPayment).
 * Bila dikaitkan dengan Purchase Order, memperbarui paidTotal pada PO tersebut.
 *
 * Rujukan: Seksi 7.9 & 8.3 Dokumen Spesifikasi.
 */
export async function recordVendorPayment(
  tx: Tx,
  businessId: string,
  vendorId: string,
  actorId: string,
  input: VendorPaymentCreateInput
) {
  const vendor = await tx.vendor.findFirst({
    where: { id: vendorId, businessId, deletedAt: null },
  });

  if (!vendor) {
    throw new DomainError('VENDOR_NOT_FOUND', 'Vendor tidak ditemukan', 404);
  }

  if (input.purchaseOrderId) {
    const po = await tx.purchaseOrder.findFirst({
      where: {
        id: input.purchaseOrderId,
        businessId,
        vendorId,
        deletedAt: null,
      },
    });

    if (!po) {
      throw new DomainError(
        'PO_NOT_FOUND',
        'Purchase Order tidak ditemukan atau bukan milik vendor ini',
        404
      );
    }
  }

  const payment = await tx.vendorPayment.create({
    data: {
      businessId,
      vendorId,
      purchaseOrderId: input.purchaseOrderId || null,
      amount: BigInt(input.amount),
      paidAt: new Date(input.paidAt),
      method: input.method ?? 'TRANSFER',
      reference: input.reference || null,
      notes: input.notes || null,
      createdById: actorId,
    },
  });

  // Bila terikat PO, hitung ulang paidTotal PO dari total pembayaran non-void
  if (input.purchaseOrderId) {
    const activePayments = await tx.vendorPayment.findMany({
      where: {
        purchaseOrderId: input.purchaseOrderId,
        voidedAt: null,
      },
      select: { amount: true },
    });

    const sumPaid = activePayments.reduce((acc, p) => acc + p.amount, 0n);

    await tx.purchaseOrder.updateMany({
      where: { id: input.purchaseOrderId, businessId },
      data: { paidTotal: sumPaid },
    });
  }

  await tx.auditLog.create({
    data: {
      businessId,
      actorId,
      actorRole: Role.SUPERADMIN,
      action: 'VENDOR_PAYMENT_CREATE',
      entityType: 'VendorPayment',
      entityId: payment.id,
      summary: `Pembayaran vendor ${vendor.name} dicatat sebesar Rp ${input.amount} (${input.method ?? 'TRANSFER'})`,
    },
  });

  return payment;
}

/**
 * Menyusun Buku Transaksi Vendor (Vendor Ledger) secara kronologis.
 * Menggabungkan seluruh tagihan PO dan bukti pembayaran vendor,
 * serta menghitung saldo hutang berjalan (running balance).
 *
 * Rujukan: Seksi 7.9 & Kriteria T2.7 Dokumen Spesifikasi.
 */
export async function getVendorLedger(
  client: Tx | typeof prisma,
  businessId: string,
  vendorId: string
): Promise<VendorLedgerResult> {
  const vendor = await client.vendor.findFirst({
    where: { id: vendorId, businessId, deletedAt: null },
  });

  if (!vendor) {
    throw new DomainError('VENDOR_NOT_FOUND', 'Vendor tidak ditemukan', 404);
  }

  // 1. Ambil seluruh PO non-cancelled dan non-deleted (sebagai Tagihan / Beli)
  const purchaseOrders = await client.purchaseOrder.findMany({
    where: {
      businessId,
      vendorId,
      deletedAt: null,
      status: { not: 'CANCELLED' },
    },
    orderBy: { orderDate: 'asc' },
    include: {
      items: true,
    },
  });

  // 2. Ambil seluruh pembayaran vendor non-void
  const payments = await client.vendorPayment.findMany({
    where: {
      businessId,
      vendorId,
      voidedAt: null,
    },
    orderBy: { paidAt: 'asc' },
  });

  // 3. Gabungkan dalam linimasa kronologis
  const rawEvents: Array<{
    id: string;
    date: Date;
    type: 'PURCHASE' | 'PAYMENT';
    refNo: string;
    description: string;
    amount: number;
    details?: Record<string, unknown>;
  }> = [];

  for (const po of purchaseOrders) {
    rawEvents.push({
      id: po.id,
      date: po.orderDate,
      type: 'PURCHASE',
      refNo: po.poNo || `(Draf #${po.id.slice(-6)})`,
      description: `Pesanan Pembelian (${po.items.length} item)`,
      amount: Number(po.total),
      details: {
        status: po.status,
        subtotal: Number(po.subtotal),
        shippingCost: Number(po.shippingCost),
        otherCost: Number(po.otherCost),
      },
    });
  }

  for (const pay of payments) {
    rawEvents.push({
      id: pay.id,
      date: pay.paidAt,
      type: 'PAYMENT',
      refNo: pay.reference || `(Bayar #${pay.id.slice(-6)})`,
      description: `Pembayaran Vendor (${pay.method})${pay.notes ? `: ${pay.notes}` : ''}`,
      amount: Number(pay.amount),
      details: {
        method: pay.method,
        purchaseOrderId: pay.purchaseOrderId,
        reference: pay.reference,
      },
    });
  }

  // Urutkan ascending berdasarkan tanggal
  rawEvents.sort((a, b) => a.date.getTime() - b.date.getTime());

  // 4. Hitung saldo kumulatif berjalan
  let runningBalance = 0;
  let totalPurchases = 0;
  let totalPayments = 0;

  const entries: VendorLedgerEntry[] = rawEvents.map((evt) => {
    let debit = 0;
    let credit = 0;

    if (evt.type === 'PURCHASE') {
      debit = evt.amount;
      runningBalance += debit;
      totalPurchases += debit;
    } else {
      credit = evt.amount;
      runningBalance -= credit;
      totalPayments += credit;
    }

    return {
      id: evt.id,
      date: evt.date,
      type: evt.type,
      refNo: evt.refNo,
      description: evt.description,
      debit,
      credit,
      balance: runningBalance,
      details: evt.details,
    };
  });

  return {
    vendorId: vendor.id,
    vendorName: vendor.name,
    summary: {
      totalPurchases,
      totalPayments,
      currentBalance: runningBalance,
    },
    entries,
  };
}
