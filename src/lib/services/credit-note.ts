import {
  Prisma,
  Role,
  CreditSettlement,
  OrderStatus,
  ShipStatus,
  StockMoveType,
  PaymentType,
  PaymentMethod,
  PaymentStatus,
} from '@prisma/client';
import { prisma } from '@/lib/db';
import { Ctx } from '@/lib/auth/context';
import { DomainError, formatRupiah } from '@/lib/domain/money';
import { creditThisReturn, creditNoteTotals } from '@/lib/domain/credit';
import { creditNoteNumber } from '@/lib/domain/numbering';
import { allocateCustomerCreditNoteSeq } from './counter';
import { lockProducts, moveStock } from './stock';
import { maybeComplete, recalculateOrderPayments } from './payment';
import { recalculateOrderCommission } from './commission';

export type TxClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

export interface CreditNoteCreateItemInput {
  orderItemId: string;
  qty: number;
  restock?: boolean;
}

export interface CreditNoteCreateInput {
  reason: string;
  settlement: CreditSettlement;
  items: CreditNoteCreateItemInput[];
}

export interface CreditNoteItemDto {
  id: string;
  orderItemId: string;
  productName: string;
  sku: string;
  unit: string;
  qty: number;
  creditAmount: number;
  restock: boolean;
  costReversed?: number; // RAHASIA: Hanya untuk Super Admin
}

export interface CreditNoteDto {
  id: string;
  businessId: string;
  orderId: string;
  orderNo: string | null;
  customerId: string;
  customerCode: string;
  customerName: string;
  number: string;
  reason: string;
  settlement: CreditSettlement;
  amountExPpn: number;
  ppnAmount: number;
  total: number;
  cogsReversed?: number; // RAHASIA: Hanya untuk Super Admin
  createdById: string;
  createdAt: string;
  voidedAt: string | null;
  items: CreditNoteItemDto[];
}

export interface CustomerCreditEntryDto {
  id: string;
  amount: number;
  reason: string;
  orderId: string | null;
  creditNoteId: string | null;
  paymentId: string | null;
  createdAt: string;
}

export interface CustomerCreditBalanceDto {
  customerId: string;
  balance: number;
  entries: CustomerCreditEntryDto[];
}

export type CreditNoteWithItems = {
  id: string;
  businessId: string;
  orderId: string;
  customerId: string;
  number: string;
  reason: string;
  settlement: CreditSettlement;
  amountExPpn: bigint | number;
  ppnAmount: bigint | number;
  total: bigint | number;
  cogsReversed?: bigint | number | null;
  createdById: string;
  createdAt: Date | string;
  voidedAt: Date | string | null;
  items?: Array<{
    id: string;
    orderItemId: string;
    qty: number;
    creditAmount: bigint | number;
    restock: boolean;
    costReversed?: bigint | number | null;
    productName?: string;
    sku?: string;
    unit?: string;
  }>;
};

export type OrderSummaryForCn = {
  orderNo?: string | null;
};

export type CustomerSummaryForCn = {
  code?: string | null;
  name?: string | null;
};

/**
 * Format CreditNote ke DTO dengan perlindungan kebocoran HPP/COGS ke Sales (Seksi 14.1 & 17.3 #20).
 */
export function formatCreditNoteDto(
  cn: CreditNoteWithItems,
  order: OrderSummaryForCn | null | undefined,
  customer: CustomerSummaryForCn | null | undefined,
  isSuperAdmin: boolean,
  orderItemsMap?: Map<string, { productName: string; sku: string; unit: string }>
): CreditNoteDto {
  const items: CreditNoteItemDto[] = (cn.items || []).map((it) => {
    const oi = orderItemsMap?.get(it.orderItemId);
    const dto: CreditNoteItemDto = {
      id: it.id,
      orderItemId: it.orderItemId,
      productName: oi?.productName || it.productName || 'Barang Retur',
      sku: oi?.sku || it.sku || '-',
      unit: oi?.unit || it.unit || 'pcs',
      qty: it.qty,
      creditAmount: Number(it.creditAmount),
      restock: it.restock,
    };

    if (isSuperAdmin) {
      dto.costReversed = Number(it.costReversed || 0);
    }

    return dto;
  });

  const dto: CreditNoteDto = {
    id: cn.id,
    businessId: cn.businessId,
    orderId: cn.orderId,
    orderNo: order?.orderNo || null,
    customerId: cn.customerId,
    customerCode: customer?.code || '',
    customerName: customer?.name || '',
    number: cn.number,
    reason: cn.reason,
    settlement: cn.settlement,
    amountExPpn: Number(cn.amountExPpn),
    ppnAmount: Number(cn.ppnAmount),
    total: Number(cn.total),
    createdById: cn.createdById,
    createdAt: cn.createdAt instanceof Date ? cn.createdAt.toISOString() : cn.createdAt,
    voidedAt: cn.voidedAt
      ? cn.voidedAt instanceof Date
        ? cn.voidedAt.toISOString()
        : cn.voidedAt
      : null,
    items,
  };

  if (isSuperAdmin) {
    dto.cogsReversed = Number(cn.cogsReversed || 0);
  }

  return dto;
}

/**
 * Membuat Nota Kredit (Credit Note) baru untuk pesanan yang telah dikirim/selesai.
 *
 * Rujukan: Seksi 7.13, 7.14, 8.2, 8.3, 10, dan 19.5 Dokumen Spesifikasi.
 */
export async function createCreditNote(
  tx: TxClient,
  ctx: Ctx,
  orderId: string,
  input: CreditNoteCreateInput
): Promise<CreditNoteDto> {
  const businessId = ctx.businessId;
  if (!businessId) {
    throw new DomainError('BUSINESS_REQUIRED', 'Business ID diperlukan', 400);
  }

  const isSuperAdmin = ctx.user.role === Role.SUPERADMIN;

  // 1. Ambil data order beserta customer dan orderItems
  const order = await tx.order.findFirst({
    where: { id: orderId, businessId, deletedAt: null },
    include: {
      customer: true,
      items: true,
    },
  });

  if (!order) {
    throw new DomainError('ORDER_NOT_FOUND', 'Pesanan tidak ditemukan', 404);
  }

  // 2. Hak akses: Sales hanya boleh membuat retur untuk pesanannya sendiri
  if (ctx.user.role === Role.SALES && order.salesId !== ctx.user.id) {
    throw new DomainError(
      'FORBIDDEN',
      'Anda hanya dapat membuat nota kredit untuk pesanan Anda sendiri',
      403
    );
  }

  // 3. Validasi status: Barang harus sudah dikirim (SHIPPED / DELIVERED / COMPLETED)
  const shipment = await tx.shipment.findFirst({
    where: { orderId: order.id, businessId },
  });

  const isShippedOrDelivered =
    order.status === OrderStatus.COMPLETED ||
    (shipment &&
      (shipment.status === ShipStatus.SHIPPED ||
        shipment.status === ShipStatus.DELIVERED));

  if (!isShippedOrDelivered) {
    throw new DomainError(
      'INVALID_STATE',
      'Nota kredit dan retur hanya dapat dibuat setelah barang dikirim atau diterima pelanggan',
      409
    );
  }

  // 4. Hitung riwayat retur sebelumnya yang belum di-void
  const existingCns = await tx.creditNote.findMany({
    where: { orderId: order.id, businessId, voidedAt: null },
    include: { items: true },
  });

  const alreadyReturnedMap = new Map<string, number>();
  for (const cn of existingCns) {
    for (const it of cn.items) {
      alreadyReturnedMap.set(
        it.orderItemId,
        (alreadyReturnedMap.get(it.orderItemId) || 0) + it.qty
      );
    }
  }

  // 5. Validasi barang yang diretur & hitung kredit per item secara deterministik
  const orderItemsMap = new Map(order.items.map((it) => [it.id, it]));
  const cnItemsData: Array<{
    orderItemId: string;
    qty: number;
    creditAmount: bigint;
    restock: boolean;
    costReversed: bigint;
    productName: string;
    sku: string;
    unit: string;
    productId: string;
  }> = [];

  let totalCreditExPpn = 0;
  let totalCogsReversed = BigInt(0);

  for (const inputItem of input.items) {
    const orderItem = orderItemsMap.get(inputItem.orderItemId);
    if (!orderItem) {
      throw new DomainError('ORDER_ITEM_NOT_FOUND', 'Item pesanan tidak ditemukan', 404);
    }

    const alreadyReturned = alreadyReturnedMap.get(orderItem.id) || 0;
    const remainingQty = orderItem.qty - alreadyReturned;

    if (inputItem.qty <= 0 || inputItem.qty > remainingQty) {
      throw new DomainError(
        'RETURN_QTY_INVALID',
        `Jumlah retur untuk ${orderItem.productName} (${inputItem.qty}) melebihi sisa yang dapat diretur (${remainingQty})`,
        422
      );
    }

    // Hitung kredit murni tanpa pembulatan bocor via creditThisReturn
    const itemCreditExPpn = creditThisReturn(
      Number(orderItem.lineNet),
      orderItem.qty,
      alreadyReturned,
      inputItem.qty
    );

    // Pembalikan HPP (COGS) bila restock
    const costReversed = inputItem.restock
      ? orderItem.costPrice * BigInt(inputItem.qty)
      : BigInt(0);

    totalCreditExPpn += itemCreditExPpn;
    totalCogsReversed += costReversed;

    cnItemsData.push({
      orderItemId: orderItem.id,
      qty: inputItem.qty,
      creditAmount: BigInt(itemCreditExPpn),
      restock: inputItem.restock ?? true,
      costReversed,
      productName: orderItem.productName,
      sku: orderItem.sku,
      unit: orderItem.unit,
      productId: orderItem.productId,
    });

    // Perbarui riwayat untuk item berikutnya dalam request yang sama
    alreadyReturnedMap.set(orderItem.id, alreadyReturned + inputItem.qty);
  }

  // 6. Hitung PPN & Total Dokumen
  const totals = creditNoteTotals(
    totalCreditExPpn,
    order.ppnEnabled,
    order.ppnRateBps
  );
  const amountExPpn = BigInt(totals.amountExPpn);
  const ppnAmount = BigInt(totals.ppnAmount);
  const total = BigInt(totals.total);

  // 7. Validasi Aturan Penyelesaian Kredit (CreditSettlement)
  if (input.settlement === CreditSettlement.OFFSET) {
    const balanceDue = order.grandTotal - order.paidTotal - order.creditTotal;
    if (balanceDue <= BigInt(0)) {
      throw new DomainError(
        'INVALID_SETTLEMENT',
        'Pesanan ini sudah lunas, gunakan penyelesaian REFUND atau CUSTOMER_CREDIT',
        422
      );
    }
    if (total > balanceDue) {
      throw new DomainError(
        'OFFSET_EXCEEDS_BALANCE',
        `Nilai nota kredit (${formatRupiah(Number(total))}) melebihi sisa tagihan pesanan (${formatRupiah(Number(balanceDue))})`,
        422
      );
    }
  } else if (input.settlement === CreditSettlement.REFUND) {
    if (order.paidTotal < total) {
      throw new DomainError(
        'REFUND_EXCEEDS_PAID',
        `Nilai refund kas (${formatRupiah(Number(total))}) tidak boleh melebihi pembayaran terverifikasi yang telah diterima (${formatRupiah(Number(order.paidTotal))})`,
        422
      );
    }
  }

  // 8. Alokasi Nomor Nota Kredit secara atomik
  const now = new Date();
  const seq = await allocateCustomerCreditNoteSeq(
    tx,
    businessId,
    order.customerId
  );
  const cnNumber = creditNoteNumber(order.customer.code, now, seq);

  // 9. Simpan Dokumen CreditNote & CreditNoteItem
  const creditNote = await tx.creditNote.create({
    data: {
      businessId,
      orderId: order.id,
      customerId: order.customerId,
      number: cnNumber,
      reason: input.reason,
      settlement: input.settlement,
      amountExPpn,
      ppnAmount,
      total,
      cogsReversed: totalCogsReversed,
      createdById: ctx.user.id,
      createdAt: now,
      items: {
        create: cnItemsData.map((it) => ({
          orderItemId: it.orderItemId,
          qty: it.qty,
          creditAmount: it.creditAmount,
          restock: it.restock,
          costReversed: it.costReversed,
        })),
      },
    },
    include: {
      items: true,
    },
  });

  // 10. Terapkan Dampak Penyelesaian (Settlement Impact)
  if (input.settlement === CreditSettlement.OFFSET) {
    // Naikkan Order.creditTotal
    await tx.order.updateMany({
      where: { id: order.id, businessId },
      data: {
        creditTotal: { increment: total },
        rev: { increment: 1 },
      },
    });

    // Evaluasi apakah pesanan lunas dan dapat diselesaikan
    await maybeComplete(tx, ctx, order.id);
  } else if (input.settlement === CreditSettlement.CUSTOMER_CREDIT) {
    // Tambah saldo deposit kredit pelanggan
    await tx.customerCreditEntry.create({
      data: {
        businessId,
        customerId: order.customerId,
        amount: total,
        reason: `Deposit kredit dari Nota Kredit #${cnNumber}: ${input.reason}`,
        orderId: order.id,
        creditNoteId: creditNote.id,
        createdById: ctx.user.id,
      },
    });
  } else if (input.settlement === CreditSettlement.REFUND) {
    // Catat pembayaran refund terverifikasi
    await tx.payment.create({
      data: {
        businessId,
        orderId: order.id,
        type: PaymentType.REFUND,
        method: PaymentMethod.TRANSFER,
        status: PaymentStatus.VERIFIED,
        amount: total,
        paidAt: now,
        reference: cnNumber,
        notes: `Pengembalian dana (refund) dari Nota Kredit #${cnNumber}: ${input.reason}`,
        createdById: ctx.user.id,
        verifiedById: ctx.user.id,
        verifiedAt: now,
      },
    });

    // Hitung ulang saldo pembayaran pesanan
    await recalculateOrderPayments(tx, order.id, businessId);
  }

  // 11. Mutasi Stok Fisik Gudang (bila restock = true)
  const restockItems = cnItemsData.filter((i) => i.restock);
  if (restockItems.length > 0) {
    const productIds = restockItems.map((i) => i.productId);
    await lockProducts(tx, productIds);

    for (const rItem of restockItems) {
      await moveStock(tx, {
        businessId,
        productId: rItem.productId,
        type: StockMoveType.RETURN_IN,
        qtyDelta: rItem.qty,
        refType: 'CreditNote',
        refId: creditNote.id,
        note: `Retur masuk #${cnNumber} (${rItem.productName})`,
        actorId: ctx.user.id,
      });
    }
  }

  // 12. Pencatatan AuditLog & Notifikasi Internal
  await tx.auditLog.create({
    data: {
      businessId,
      actorId: ctx.user.id,
      actorRole: ctx.user.role,
      action: 'CREDIT_NOTE_CREATE',
      entityType: 'CreditNote',
      entityId: creditNote.id,
      summary: `Nota kredit #${cnNumber} (${input.settlement}) dibuat sebesar ${formatRupiah(Number(total))} untuk pesanan ${order.orderNo || order.id}`,
      reason: input.reason,
    },
  });

  await tx.notification.create({
    data: {
      userId: order.salesId,
      businessId,
      type: 'CREDIT_NOTE_ISSUED',
      title: 'Nota Kredit Diterbitkan',
      body: `Nota kredit #${cnNumber} sebesar ${formatRupiah(Number(total))} telah diterbitkan untuk pesanan ${order.orderNo || order.id}`,
      linkPath: `/orders/${order.id}`,
      dedupeKey: `cn_created_${creditNote.id}_${order.salesId}`,
    },
  });

  // Rekalkulasi komisi pesanan jika ada retur barang
  await recalculateOrderCommission(tx, order.id, businessId);

  return formatCreditNoteDto(creditNote, order, order.customer, isSuperAdmin, orderItemsMap);
}

/**
 * Membatalkan (VOID) Nota Kredit yang telah diterbitkan (Khusus Super Admin).
 * Membalikkan dampak settlement dan membalikkan mutasi stok fisik.
 *
 * Rujukan: Seksi 7.14 Dokumen Spesifikasi.
 */
export async function voidCreditNote(
  tx: TxClient,
  ctx: Ctx,
  id: string,
  reason: string
): Promise<CreditNoteDto> {
  const businessId = ctx.businessId;
  if (!businessId) {
    throw new DomainError('BUSINESS_REQUIRED', 'Business ID diperlukan', 400);
  }

  if (ctx.user.role !== Role.SUPERADMIN) {
    throw new DomainError(
      'FORBIDDEN',
      'Hanya Super Admin yang berhak membatalkan (void) nota kredit',
      403
    );
  }

  if (!reason || reason.trim().length < 5) {
    throw new DomainError(
      'VALIDATION_ERROR',
      'Alasan pembatalan (void) nota kredit wajib minimal 5 karakter',
      422
    );
  }

  const creditNote = await tx.creditNote.findFirst({
    where: { id, businessId },
    include: {
      items: true,
      business: true,
    },
  });

  if (!creditNote) {
    throw new DomainError('NOT_FOUND', 'Nota kredit tidak ditemukan', 404);
  }

  if (creditNote.voidedAt !== null) {
    throw new DomainError('INVALID_STATE', 'Nota kredit ini sudah dibatalkan sebelumnya', 409);
  }

  const order = await tx.order.findFirst({
    where: { id: creditNote.orderId, businessId },
    include: { customer: true, items: true },
  });

  if (!order) {
    throw new DomainError('ORDER_NOT_FOUND', 'Pesanan terkait nota kredit tidak ditemukan', 404);
  }

  const now = new Date();

  // 1. Pembalikan Dampak Settlement
  if (creditNote.settlement === CreditSettlement.OFFSET) {
    // Kurangi Order.creditTotal
    await tx.order.updateMany({
      where: { id: order.id, businessId },
      data: {
        creditTotal: { decrement: creditNote.total },
        rev: { increment: 1 },
      },
    });

    // Jika order sebelumnya COMPLETED dan sekarang menjadi ada tagihan tertunggak: rollback status
    const freshOrder = await tx.order.findFirst({
      where: { id: order.id, businessId },
    });
    if (freshOrder && freshOrder.status === OrderStatus.COMPLETED) {
      const balanceDue = freshOrder.grandTotal - freshOrder.paidTotal - freshOrder.creditTotal;
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
  } else if (creditNote.settlement === CreditSettlement.CUSTOMER_CREDIT) {
    // Periksa apakah saldo kredit pelanggan masih cukup untuk ditarik kembali
    const entries = await tx.customerCreditEntry.findMany({
      where: { customerId: order.customerId, businessId },
    });
    const totalCredit = entries.reduce((s, e) => s + e.amount, BigInt(0));

    if (totalCredit < creditNote.total) {
      throw new DomainError(
        'CREDIT_ALREADY_USED',
        `Saldo deposit kredit pelanggan (${formatRupiah(Number(totalCredit))}) tidak mencukupi untuk ditarik kembali (${formatRupiah(Number(creditNote.total))}) karena sudah digunakan di pesanan lain`,
        409
      );
    }

    // Buat entry penarikan kembali (negatif)
    await tx.customerCreditEntry.create({
      data: {
        businessId,
        customerId: order.customerId,
        amount: -creditNote.total,
        reason: `Penarikan saldo akibat pembatalan (void) Nota Kredit #${creditNote.number}: ${reason.trim()}`,
        orderId: order.id,
        creditNoteId: creditNote.id,
        createdById: ctx.user.id,
      },
    });
  } else if (creditNote.settlement === CreditSettlement.REFUND) {
    // Batalkan pembayaran refund yang tercatat untuk credit note ini
    const refundPayment = await tx.payment.findFirst({
      where: {
        orderId: order.id,
        reference: creditNote.number,
        type: PaymentType.REFUND,
        status: PaymentStatus.VERIFIED,
        businessId,
      },
    });

    if (refundPayment) {
      await tx.payment.updateMany({
        where: { id: refundPayment.id, businessId },
        data: {
          status: PaymentStatus.VOID,
          notes: `${refundPayment.notes || ''}\n[VOID]: ${reason.trim()}`,
        },
      });

      await recalculateOrderPayments(tx, order.id, businessId);
    }
  }

  // 2. Pembalikan Mutasi Stok Fisik (bila sebelumnya restock = true)
  const restockItems = creditNote.items.filter((i) => i.restock);
  if (restockItems.length > 0) {
    const orderItemsMap = new Map(order.items.map((oi) => [oi.id, oi]));
    const productIds = restockItems
      .map((ri) => orderItemsMap.get(ri.orderItemId)?.productId)
      .filter((p): p is string => Boolean(p));

    await lockProducts(tx, productIds);

    for (const rItem of restockItems) {
      const oi = orderItemsMap.get(rItem.orderItemId);
      if (oi) {
        await moveStock(tx, {
          businessId,
          productId: oi.productId,
          type: StockMoveType.VOID_REVERSAL,
          qtyDelta: -rItem.qty,
          refType: 'CreditNote',
          refId: creditNote.id,
          note: `Pembalikan stok akibat void Nota Kredit #${creditNote.number} (${oi.productName})`,
          actorId: ctx.user.id,
        });
      }
    }
  }

  // 3. Tandai Credit Note sebagai VOID
  await tx.creditNote.updateMany({
    where: { id: creditNote.id, businessId },
    data: {
      voidedAt: now,
    },
  });

  const updatedCn = await tx.creditNote.findFirstOrThrow({
    where: { id: creditNote.id, businessId },
    include: { items: true },
  });

  // 4. Catat AuditLog & Notifikasi
  await tx.auditLog.create({
    data: {
      businessId,
      actorId: ctx.user.id,
      actorRole: ctx.user.role,
      action: 'CREDIT_NOTE_VOID',
      entityType: 'CreditNote',
      entityId: creditNote.id,
      summary: `Pembatalan (void) nota kredit #${creditNote.number}: ${reason.trim()}`,
      reason: reason.trim(),
    },
  });

  await tx.notification.create({
    data: {
      userId: order.salesId,
      businessId,
      type: 'CREDIT_NOTE_VOIDED',
      title: 'Nota Kredit Dibatalkan',
      body: `Nota kredit #${creditNote.number} untuk pesanan ${order.orderNo || order.id} telah dibatalkan oleh ${ctx.user.name}`,
      linkPath: `/orders/${order.id}`,
      dedupeKey: `cn_void_${creditNote.id}_${order.salesId}`,
    },
  });

  // Rekalkulasi komisi setelah pembatalan nota kredit
  await recalculateOrderCommission(tx, order.id, businessId);

  const orderItemsMap = new Map(order.items.map((oi) => [oi.id, oi]));
  return formatCreditNoteDto(updatedCn, order, order.customer, true, orderItemsMap);
}

/**
 * Mengambil detail Nota Kredit berdasarkan ID.
 */
export async function getCreditNote(
  tx: TxClient,
  ctx: Ctx,
  id: string
): Promise<CreditNoteDto> {
  const businessId = ctx.businessId;
  if (!businessId) {
    throw new DomainError('BUSINESS_REQUIRED', 'Business ID diperlukan', 400);
  }

  const isSuperAdmin = ctx.user.role === Role.SUPERADMIN;

  const creditNote = await tx.creditNote.findFirst({
    where: { id, businessId },
    include: { items: true },
  });

  if (!creditNote) {
    throw new DomainError('NOT_FOUND', 'Nota kredit tidak ditemukan', 404);
  }

  const order = await tx.order.findFirst({
    where: { id: creditNote.orderId, businessId },
    include: { customer: true, items: true },
  });

  if (!order) {
    throw new DomainError('ORDER_NOT_FOUND', 'Pesanan terkait nota kredit tidak ditemukan', 404);
  }

  if (ctx.user.role === Role.SALES && order.salesId !== ctx.user.id) {
    throw new DomainError('FORBIDDEN', 'Akses ditolak', 403);
  }

  const orderItemsMap = new Map(order.items.map((oi) => [oi.id, oi]));
  return formatCreditNoteDto(creditNote, order, order.customer, isSuperAdmin, orderItemsMap);
}

/**
 * Mengambil daftar Nota Kredit untuk suatu pesanan tertentu.
 */
export async function listOrderCreditNotes(
  tx: TxClient,
  ctx: Ctx,
  orderId: string
): Promise<CreditNoteDto[]> {
  const businessId = ctx.businessId;
  if (!businessId) {
    throw new DomainError('BUSINESS_REQUIRED', 'Business ID diperlukan', 400);
  }

  const isSuperAdmin = ctx.user.role === Role.SUPERADMIN;

  const order = await tx.order.findFirst({
    where: { id: orderId, businessId, deletedAt: null },
    include: { customer: true, items: true },
  });

  if (!order) {
    throw new DomainError('ORDER_NOT_FOUND', 'Pesanan tidak ditemukan', 404);
  }

  if (ctx.user.role === Role.SALES && order.salesId !== ctx.user.id) {
    throw new DomainError('FORBIDDEN', 'Akses ditolak', 403);
  }

  const cns = await tx.creditNote.findMany({
    where: { orderId: order.id, businessId },
    include: { items: true },
    orderBy: { createdAt: 'desc' },
  });

  const orderItemsMap = new Map(order.items.map((oi) => [oi.id, oi]));
  return cns.map((cn) =>
    formatCreditNoteDto(cn, order, order.customer, isSuperAdmin, orderItemsMap)
  );
}

/**
 * Mengambil daftar Nota Kredit global dengan filter & paginasi.
 */
export async function listCreditNotes(
  tx: TxClient,
  ctx: Ctx,
  query: {
    search?: string;
    orderId?: string;
    customerId?: string;
    settlement?: CreditSettlement;
    page?: number;
    limit?: number;
  }
): Promise<{ data: CreditNoteDto[]; total: number; page: number; limit: number }> {
  const businessId = ctx.businessId;
  if (!businessId) {
    throw new DomainError('BUSINESS_REQUIRED', 'Business ID diperlukan', 400);
  }

  const page = query.page ?? 1;
  const limit = query.limit ?? 20;

  const isSuperAdmin = ctx.user.role === Role.SUPERADMIN;
  const where: Prisma.CreditNoteWhereInput = {
    businessId,
  };

  if (query.orderId) {
    where.orderId = query.orderId;
  }

  if (query.customerId) {
    where.customerId = query.customerId;
  }

  if (query.settlement) {
    where.settlement = query.settlement;
  }

  if (query.search) {
    where.OR = [
      { number: { contains: query.search, mode: 'insensitive' } },
      { reason: { contains: query.search, mode: 'insensitive' } },
    ];
  }

  // Isolasi Staf Sales: hanya order miliknya
  if (ctx.user.role === Role.SALES) {
    const salesOrders = await tx.order.findMany({
      where: { businessId, salesId: ctx.user.id, deletedAt: null },
      select: { id: true },
    });
    const orderIds = salesOrders.map((o) => o.id);
    where.orderId = { in: orderIds };
  }

  const [total, cns] = await Promise.all([
    tx.creditNote.count({ where }),
    tx.creditNote.findMany({
      where,
      include: { items: true },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);

  if (cns.length === 0) {
    return { data: [], total, page, limit };
  }

  const orderIds = [...new Set(cns.map((cn) => cn.orderId))];
  const [orders, customers, orderItems] = await Promise.all([
    tx.order.findMany({
      where: { id: { in: orderIds }, businessId },
      select: { id: true, orderNo: true, customerId: true },
    }),
    tx.customer.findMany({
      where: { businessId },
      select: { id: true, code: true, name: true },
    }),
    tx.orderItem.findMany({
      where: { orderId: { in: orderIds }, businessId },
      select: { id: true, productName: true, sku: true, unit: true },
    }),
  ]);

  const ordersMap = new Map(orders.map((o) => [o.id, o]));
  const customersMap = new Map(customers.map((c) => [c.id, c]));
  const orderItemsMap = new Map(orderItems.map((oi) => [oi.id, oi]));

  const data = cns.map((cn) => {
    const order = ordersMap.get(cn.orderId);
    const customer = customersMap.get(cn.customerId);
    return formatCreditNoteDto(cn, order, customer, isSuperAdmin, orderItemsMap);
  });

  return { data, total, page, limit };
}

/**
 * Mengambil ringkasan saldo deposit kredit pelanggan dan riwayat mutasi kreditnya.
 */
export async function getCustomerCreditBalance(
  tx: TxClient,
  ctx: Ctx,
  customerId: string
): Promise<CustomerCreditBalanceDto> {
  const businessId = ctx.businessId;
  if (!businessId) {
    throw new DomainError('BUSINESS_REQUIRED', 'Business ID diperlukan', 400);
  }

  const customer = await tx.customer.findFirst({
    where: { id: customerId, businessId, deletedAt: null },
  });

  if (!customer) {
    throw new DomainError('CUSTOMER_NOT_FOUND', 'Pelanggan tidak ditemukan', 404);
  }

  if (ctx.user.role === Role.SALES && customer.assignedSalesId && customer.assignedSalesId !== ctx.user.id) {
    throw new DomainError('FORBIDDEN', 'Akses ditolak', 403);
  }

  const entries = await tx.customerCreditEntry.findMany({
    where: { customerId, businessId },
    orderBy: { createdAt: 'desc' },
  });

  const balanceBigInt = entries.reduce((s, e) => s + e.amount, BigInt(0));

  const entryDtos: CustomerCreditEntryDto[] = entries.map((e) => ({
    id: e.id,
    amount: Number(e.amount),
    reason: e.reason,
    orderId: e.orderId,
    creditNoteId: e.creditNoteId,
    paymentId: e.paymentId,
    createdAt: e.createdAt.toISOString(),
  }));

  return {
    customerId,
    balance: Number(balanceBigInt),
    entries: entryDtos,
  };
}
