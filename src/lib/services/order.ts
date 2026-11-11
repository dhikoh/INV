import { Role, OrderStatus, InvoiceType, InvoiceStatus, InvoiceTheme } from '@prisma/client';
import { Ctx } from '@/lib/auth/context';
import { DomainError } from '@/lib/domain/money';
import { calcLine, calcOrderTotals } from '@/lib/domain/order';
import { baseFloor, lineFloor, isBelowFloor, isPromoActive, PromoRule } from '@/lib/domain/pricing';
import { calcProfit } from '@/lib/domain/profit';
import { formatRupiah } from '@/lib/domain/money';
import { escapeHtml } from '@/lib/telegram/format';
import { OrderCreateSchema, OrderRequestFinalInput } from '@/lib/validation/order';
import { prisma } from '@/lib/db';
import { lockOrder, assertStatus } from './orderGuard';
import { z } from 'zod';

export type OrderInputType =
  | z.input<typeof OrderCreateSchema>
  | z.output<typeof OrderCreateSchema>;

export type TxClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

export interface SnapshotLineItem {
  productId: string;
  productName: string;
  sku: string;
  unit: string;
  qty: number;
  listPrice: number;
  unitPrice: number;
  discountType: 'NONE' | 'PERCENT' | 'AMOUNT';
  discountValue: number;
  discountSource: 'MANUAL' | 'PROMO' | 'SUBSIDY';
  lineSubtotal: number;
  lineDiscount: number;
  lineNet: number;
  costPrice: number; // RAHASIA
  floorPrice: number;
  belowMin: boolean;
  sortOrder: number;
}

export interface SnapshotWarning {
  productId: string;
  productName: string;
  floorPrice: number;
  netPricePerUnit: number;
  message: string;
}

export interface OrderSnapshot {
  customer: {
    id: string;
    code: string;
    name: string;
    assignedSalesId: string | null;
  };
  lines: SnapshotLineItem[];
  totals: {
    subtotal: number;
    discountTotal: number;
    goodsNet: number;
    shippingCharge: number;
    ppnAmount: number;
    grandTotal: number;
    dpAmount: number;
  };
  hasBelowMin: boolean;
  warnings: SnapshotWarning[];
  profit: ReturnType<typeof calcProfit>;
  business: {
    id: string;
    code: string;
    name: string;
    ppnEnabled: boolean;
    ppnRateBps: number;
    defaultDpBps: number;
  };
  dpBps: number;
}

/**
 * Membangun snapshot kalkulasi order lengkap dengan penegakan floor price,
 * validasi promo aktif, kalkulasi diskon & PPN, serta deteksi baris di bawah floor.
 *
 * Dipakai serentak oleh:
 * - POST /orders/preview (simulasi & validasi UI)
 * - POST /orders (pembuatan draf)
 * - PATCH /orders/:id (pembaruan draf)
 * - POST /orders/:id/submit (pengajuan persetujuan)
 *
 * Rujukan: Seksi 10.4 Dokumen Spesifikasi.
 */
export async function buildOrderSnapshot(
  tx: TxClient | typeof prisma,
  ctx: Ctx,
  input: OrderInputType
): Promise<OrderSnapshot> {
  const businessId = ctx.businessId ?? ctx.user.businessId;
  if (!businessId) {
    throw new DomainError('BUSINESS_REQUIRED', 'Unit usaha aktif diperlukan', 400);
  }

  // 1. Muat customer (di usaha ini; Sales: harus milik sendiri)
  const customer = await tx.customer.findFirst({
    where: {
      id: input.customerId,
      businessId,
      deletedAt: null,
    },
    select: {
      id: true,
      code: true,
      name: true,
      assignedSalesId: true,
      tags: true,
    },
  });

  if (!customer) {
    throw new DomainError('CUSTOMER_NOT_FOUND', 'Pelanggan tidak ditemukan', 404);
  }

  if (ctx.user.role === 'SALES' && customer.assignedSalesId !== ctx.user.id) {
    throw new DomainError('CUSTOMER_NOT_FOUND', 'Pelanggan tidak ditemukan', 404);
  }

  if (customer.tags && customer.tags.includes('PENDING_VERIFIKASI_ADMIN')) {
    if (ctx.user.role === 'SALES') {
      throw new DomainError(
        'FORBIDDEN',
        'Pelanggan ini sedang menunggu verifikasi Admin terkait potensi duplikasi data. Pembuatan pesanan belum diizinkan.',
        403
      );
    }
  }

  // 2. Tolak produk ganda: 422 DUPLICATE_PRODUCT
  const productIds = input.items.map((i) => i.productId);
  const uniqueProductIds = new Set(productIds);
  if (uniqueProductIds.size !== productIds.length) {
    throw new DomainError('DUPLICATE_PRODUCT', 'Produk tidak boleh ganda dalam satu order', 422);
  }

  // Muat produk yang dipilih (aktif, di usaha ini)
  const products = await tx.product.findMany({
    where: {
      id: { in: productIds },
      businessId,
      deletedAt: null,
      isActive: true,
    },
  });

  if (products.length !== uniqueProductIds.size) {
    throw new DomainError('PRODUCT_NOT_FOUND', 'Satu atau lebih produk tidak ditemukan atau tidak aktif', 404);
  }

  const productMap = new Map(products.map((p) => [p.id, p]));

  // 3. Muat CustomerMinPrice dan CustomerPromo customer itu
  const customerMinPrices = await tx.customerMinPrice.findMany({
    where: {
      businessId,
      customerId: customer.id,
    },
  });
  const customerMinMap = new Map(customerMinPrices.map((p) => [p.productId, Number(p.minPrice)]));

  const promos = await tx.customerPromo.findMany({
    where: {
      businessId,
      customerId: customer.id,
      deletedAt: null,
      isActive: true,
    },
  });
  const promoMap = new Map(promos.map((p) => [p.id, p]));

  // Muat setting usaha
  const business = await tx.business.findUnique({
    where: { id: businessId },
    select: {
      id: true,
      code: true,
      name: true,
      ppnEnabled: true,
      ppnRateBps: true,
      defaultDpBps: true,
    },
  });

  if (!business) {
    throw new DomainError('BUSINESS_NOT_FOUND', 'Data usaha tidak ditemukan', 404);
  }

  const now = new Date();
  const calculatedLines: SnapshotLineItem[] = [];

  // 4. Untuk tiap baris
  for (let index = 0; index < input.items.length; index++) {
    const item = input.items[index];
    const product = productMap.get(item.productId)!;
    const custMin = customerMinMap.get(item.productId) ?? null;
    const base = baseFloor(Number(product.minPrice), custMin);

    let discountType: 'NONE' | 'PERCENT' | 'AMOUNT' = 'NONE';
    let discountValue = 0;
    let discountSource: 'MANUAL' | 'PROMO' | 'SUBSIDY' = 'MANUAL';
    let promoRule: PromoRule | null = null;

    if (item.discount) {
      if (item.discount.source === 'MANUAL') {
        discountType = item.discount.type;
        discountValue = item.discount.value;
        discountSource = 'MANUAL';
      } else {
        // PROMO atau SUBSIDY
        const promo = promoMap.get(item.discount.promoId);
        if (!promo) {
          throw new DomainError(
            'PROMO_NOT_VALID',
            'Promo tidak ditemukan atau tidak aktif untuk pelanggan ini',
            422
          );
        }

        promoRule = {
          id: promo.id,
          label: promo.label,
          source: promo.source as 'PROMO' | 'SUBSIDY',
          type: promo.type as 'PERCENT' | 'AMOUNT',
          valueBps: promo.valueBps,
          valueAmount: promo.valueAmount ? Number(promo.valueAmount) : null,
          productId: promo.productId,
          validFrom: promo.validFrom,
          validTo: promo.validTo,
          isActive: promo.isActive,
        };

        if (!isPromoActive(promoRule, product.id, now)) {
          throw new DomainError(
            'PROMO_NOT_VALID',
            'Promo sudah kedaluwarsa atau tidak berlaku untuk produk ini',
            422
          );
        }

        if (promo.type === 'PERCENT') {
          discountType = 'PERCENT';
          discountValue = promo.valueBps ?? 0;
        } else {
          // AMOUNT dikali qty karena tersimpan sebagai total baris (Seksi 10.4)
          discountType = 'AMOUNT';
          discountValue = (Number(promo.valueAmount) || 0) * item.qty;
        }
        discountSource = promo.source as 'PROMO' | 'SUBSIDY';
      }
    }

    const floor = lineFloor(base, promoRule);
    const lineRes = calcLine({
      qty: item.qty,
      unitPrice: item.unitPrice,
      discountType,
      discountValue,
    });

    const belowMin = isBelowFloor(lineRes.lineNet, item.qty, floor);

    calculatedLines.push({
      productId: product.id,
      productName: product.name,
      sku: product.sku,
      unit: product.unit,
      qty: item.qty,
      listPrice: Number(product.basePrice),
      unitPrice: item.unitPrice,
      discountType,
      discountValue,
      discountSource,
      lineSubtotal: lineRes.lineSubtotal,
      lineDiscount: lineRes.lineDiscount,
      lineNet: lineRes.lineNet,
      costPrice: Number(product.costPrice), // RAHASIA
      floorPrice: floor,
      belowMin,
      sortOrder: index,
    });
  }

  // 5. calcOrderTotals dengan PPN dari Business
  const dpBps = input.dpBps !== undefined ? input.dpBps : business.defaultDpBps;
  const totals = calcOrderTotals({
    lines: calculatedLines,
    shippingCharge: input.shippingCharge ?? 0,
    ppnEnabled: business.ppnEnabled,
    ppnRateBps: business.ppnRateBps,
    dpBps,
  });

  // 6. hasBelowMin dan daftar peringatan
  const hasBelowMin = calculatedLines.some((l) => l.belowMin);
  const warnings: SnapshotWarning[] = calculatedLines
    .filter((l) => l.belowMin)
    .map((l) => {
      const netPerUnit = Math.floor(l.lineNet / l.qty);
      return {
        productId: l.productId,
        productName: l.productName,
        floorPrice: l.floorPrice,
        netPricePerUnit: netPerUnit,
        message: `Harga net per unit (Rp ${formatRupiah(netPerUnit)}) berada di bawah harga minimal (Rp ${formatRupiah(l.floorPrice)})`,
      };
    });

  // 7. Simulasi profit (untuk Super Admin)
  const profit = calcProfit({
    items: calculatedLines.map((l) => ({
      qty: l.qty,
      lineNet: l.lineNet,
      costPrice: l.costPrice,
      discountSource: l.discountSource,
      lineDiscount: l.lineDiscount,
    })),
    returns: [],
    shippingCharge: totals.shippingCharge,
    shippingActualCost: 0,
    extraCosts: [],
  });

  return {
    customer,
    lines: calculatedLines,
    totals,
    hasBelowMin,
    warnings,
    profit,
    business,
    dpBps,
  };
}

/**
 * Format DTO pratinjau kalkulasi order untuk dikembalikan ke API/UI.
 * Garansi Mutlak: Sales tidak pernah menerima costPrice maupun profit!
 */
export function formatPreviewDto(snapshot: OrderSnapshot, role: Role) {
  const isSuperAdmin = role === 'SUPERADMIN';

  const lines = snapshot.lines.map((l) => {
    const baseLine = {
      productId: l.productId,
      productName: l.productName,
      sku: l.sku,
      unit: l.unit,
      qty: l.qty,
      unitPrice: l.unitPrice,
      discountType: l.discountType,
      discountValue: l.discountValue,
      discountSource: l.discountSource,
      lineSubtotal: l.lineSubtotal,
      lineDiscount: l.lineDiscount,
      lineNet: l.lineNet,
      floorPrice: l.floorPrice,
      belowMin: l.belowMin,
      sortOrder: l.sortOrder,
    };

    if (isSuperAdmin) {
      return {
        ...baseLine,
        costPrice: l.costPrice,
      };
    }
    return baseLine;
  });

  const baseResponse = {
    customer: snapshot.customer,
    lines,
    totals: snapshot.totals,
    dpBps: snapshot.dpBps,
    hasBelowMin: snapshot.hasBelowMin,
    warnings: snapshot.warnings,
  };

  if (isSuperAdmin) {
    return {
      ...baseResponse,
      profit: snapshot.profit,
    };
  }

  return baseResponse;
}

/**
 * Format DTO detail Order dari database Prisma.
 * Garansi Mutlak: Sales tidak pernah menerima costPrice maupun profit!
 */
export function formatOrderDto(
  order: {
    id: string;
    orderNo: string | null;
    orderDate: Date;
    status: string;
    version: number;
    rev: number;
    customerSeq: number | null;
    customerId: string;
    customer?: { id: string; code: string; name: string };
    salesId: string;
    deliveryAddress: string | null;
    notes: string | null;
    repeatIntervalDays: number | null;
    subtotal: bigint | number;
    discountTotal: bigint | number;
    shippingCharge: bigint | number;
    ppnEnabled: boolean;
    ppnRateBps: number;
    ppnAmount: bigint | number;
    grandTotal: bigint | number;
    dpBps: number;
    dpAmount: bigint | number;
    hasBelowMin: boolean;
    belowMinReason: string | null;
    overrideNote: string | null;
    rejectReason: string | null;
    paidTotal: bigint | number;
    creditTotal: bigint | number;
    stockReserved: boolean;
    createdAt: Date;
    updatedAt: Date;
    items?: Array<{
      id: string;
      productId: string;
      productName: string;
      sku: string;
      unit: string;
      qty: number;
      listPrice: bigint | number;
      unitPrice: bigint | number;
      discountType: string;
      discountValue: bigint | number;
      discountSource: string;
      lineSubtotal: bigint | number;
      lineDiscount: bigint | number;
      lineNet: bigint | number;
      costPrice: bigint | number;
      floorPrice: bigint | number;
      belowMin: boolean;
      sortOrder: number;
    }>;
  },
  role: Role
) {
  const isSuperAdmin = role === 'SUPERADMIN';

  const items = (order.items ?? []).map((i) => {
    const baseItem = {
      id: i.id,
      productId: i.productId,
      productName: i.productName,
      sku: i.sku,
      unit: i.unit,
      qty: i.qty,
      listPrice: Number(i.listPrice),
      unitPrice: Number(i.unitPrice),
      discountType: i.discountType,
      discountValue: Number(i.discountValue),
      discountSource: i.discountSource,
      lineSubtotal: Number(i.lineSubtotal),
      lineDiscount: Number(i.lineDiscount),
      lineNet: Number(i.lineNet),
      floorPrice: Number(i.floorPrice),
      belowMin: i.belowMin,
      sortOrder: i.sortOrder,
    };

    if (isSuperAdmin) {
      return {
        ...baseItem,
        costPrice: Number(i.costPrice),
      };
    }
    return baseItem;
  });

  const baseOrder = {
    id: order.id,
    orderNo: order.orderNo,
    orderDate: order.orderDate,
    status: order.status,
    version: order.version,
    rev: order.rev,
    customerSeq: order.customerSeq,
    customerId: order.customerId,
    customer: order.customer,
    salesId: order.salesId,
    deliveryAddress: order.deliveryAddress,
    notes: order.notes,
    repeatIntervalDays: order.repeatIntervalDays,
    subtotal: Number(order.subtotal),
    discountTotal: Number(order.discountTotal),
    shippingCharge: Number(order.shippingCharge),
    ppnEnabled: order.ppnEnabled,
    ppnRateBps: order.ppnRateBps,
    ppnAmount: Number(order.ppnAmount),
    grandTotal: Number(order.grandTotal),
    dpBps: order.dpBps,
    dpAmount: Number(order.dpAmount),
    hasBelowMin: order.hasBelowMin,
    belowMinReason: order.belowMinReason,
    overrideNote: order.overrideNote,
    rejectReason: order.rejectReason,
    paidTotal: Number(order.paidTotal),
    creditTotal: Number(order.creditTotal),
    stockReserved: order.stockReserved,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
    items,
  };

  if (isSuperAdmin && order.items && order.items.length > 0) {
    const profit = calcProfit({
      items: order.items.map((i) => ({
        qty: i.qty,
        lineNet: Number(i.lineNet),
        costPrice: Number(i.costPrice),
        discountSource: i.discountSource as 'MANUAL' | 'PROMO' | 'SUBSIDY',
        lineDiscount: Number(i.lineDiscount),
      })),
      returns: [],
      shippingCharge: Number(order.shippingCharge),
      shippingActualCost: 0,
      extraCosts: [],
    });

    return {
      ...baseOrder,
      profit,
    };
  }

  return baseOrder;
}

/**
 * Format DTO Invoice untuk respons API
 */
export function formatInvoiceDto(invoice: {
  id: string;
  businessId: string;
  orderId: string;
  customerId: string;
  type: InvoiceType;
  status: InvoiceStatus;
  version: number;
  number?: string | null;
  amount: bigint | number;
  paidAmount: bigint | number;
  issueDate?: Date | null;
  dueDate?: Date | null;
  theme?: InvoiceTheme | null;
  requestedById: string;
  requestedAt: Date;
  approvedById?: string | null;
  approvedAt?: Date | null;
  rejectReason?: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: invoice.id,
    businessId: invoice.businessId,
    orderId: invoice.orderId,
    customerId: invoice.customerId,
    type: invoice.type,
    status: invoice.status,
    version: invoice.version,
    number: invoice.number || null,
    amount: Number(invoice.amount),
    paidAmount: Number(invoice.paidAmount),
    issueDate: invoice.issueDate || null,
    dueDate: invoice.dueDate || null,
    theme: invoice.theme || null,
    requestedById: invoice.requestedById,
    requestedAt: invoice.requestedAt,
    approvedById: invoice.approvedById || null,
    approvedAt: invoice.approvedAt || null,
    rejectReason: invoice.rejectReason || null,
    createdAt: invoice.createdAt,
    updatedAt: invoice.updatedAt,
  };
}

/**
 * Mengajukan draf pesanan untuk persetujuan Super Admin (submit).
 *
 * Rujukan: Seksi 8.2 & Seksi 19.5 (T3.1) Dokumen Spesifikasi.
 */
export async function submitOrder(
  tx: TxClient,
  ctx: Ctx,
  orderId: string,
  options?: { belowMinReason?: string }
) {
  const businessId = ctx.businessId ?? ctx.user.businessId;
  if (!businessId) {
    throw new DomainError('BUSINESS_REQUIRED', 'Unit usaha aktif diperlukan', 400);
  }

  await lockOrder(tx, orderId, businessId);

  const order = await tx.order.findFirst({
    where: { id: orderId, businessId, deletedAt: null },
    include: {
      items: true,
      customer: true,
    },
  });

  if (!order) {
    throw new DomainError('ORDER_NOT_FOUND', 'Order tidak ditemukan', 404);
  }

  // Otorisasi Sales: hanya boleh submit order miliknya sendiri
  if (ctx.user.role === Role.SALES) {
    if (order.salesId !== ctx.user.id) {
      throw new DomainError('FORBIDDEN', 'Anda tidak memiliki hak akses atas pesanan ini', 403);
    }
  }

  // Pengajuan kedua saat sudah PENDING_APPROVAL menghasilkan 409 INVOICE_ALREADY_PENDING
  if (order.status === OrderStatus.PENDING_APPROVAL) {
    throw new DomainError(
      'INVOICE_ALREADY_PENDING',
      'Order sudah berstatus PENDING_APPROVAL dan sedang menunggu persetujuan',
      409
    );
  }

  // Hanya boleh submit saat status DRAFT atau REVISION_REQUIRED
  assertStatus(order.status, [OrderStatus.DRAFT, OrderStatus.REVISION_REQUIRED], 'submit');

  // Minimal satu baris produk
  if (order.items.length === 0) {
    throw new DomainError('EMPTY_ITEMS', 'Minimal satu baris produk', 422);
  }

  // Tidak ada produk ganda
  const productIds = order.items.map((i) => i.productId);
  if (new Set(productIds).size !== productIds.length) {
    throw new DomainError('DUPLICATE_PRODUCT', 'Terdapat produk duplikat dalam pesanan', 422);
  }

  // Validasi alasan belowMin (minimal 5 karakter) bila ada baris di bawah floor
  const belowMinReason = options?.belowMinReason?.trim() || order.belowMinReason?.trim();
  if (order.hasBelowMin) {
    if (!belowMinReason || belowMinReason.length < 5) {
      throw new DomainError(
        'BELOW_MIN_REASON_REQUIRED',
        'Alasan harga di bawah minimal wajib diisi minimal 5 karakter',
        422
      );
    }
  }

  // Pastikan tidak ada invoice aktif yang masih PENDING_APPROVAL
  const pendingInvoice = await tx.invoice.findFirst({
    where: {
      orderId: order.id,
      businessId,
      status: InvoiceStatus.PENDING_APPROVAL,
      deletedAt: null,
    },
  });

  if (pendingInvoice) {
    throw new DomainError(
      'INVOICE_ALREADY_PENDING',
      'Invoice untuk order ini sedang menunggu persetujuan',
      409
    );
  }

  // Tipe invoice: DP bila dpBps > 0, selain itu FINAL
  const invoiceType = order.dpBps > 0 ? InvoiceType.DP : InvoiceType.FINAL;
  const invoiceAmount = invoiceType === InvoiceType.DP ? order.dpAmount : order.grandTotal;

  // version = 1 + jumlah invoice sebelumnya (tipe sama) yang REJECTED, VOID, atau WITHDRAWN
  const previousInvoicesCount = await tx.invoice.count({
    where: {
      orderId: order.id,
      businessId,
      type: invoiceType,
      status: { in: [InvoiceStatus.REJECTED, InvoiceStatus.VOID, InvoiceStatus.WITHDRAWN] },
    },
  });
  const version = 1 + previousInvoicesCount;

  // Buat Invoice baru
  const invoice = await tx.invoice.create({
    data: {
      businessId,
      orderId: order.id,
      customerId: order.customerId,
      type: invoiceType,
      status: InvoiceStatus.PENDING_APPROVAL,
      version,
      amount: invoiceAmount,
      requestedById: ctx.user.id,
      requestedAt: new Date(),
    },
  });

  // Perbarui Order ke PENDING_APPROVAL
  await tx.order.updateMany({
    where: { id: order.id, businessId },
    data: {
      status: OrderStatus.PENDING_APPROVAL,
      belowMinReason: order.hasBelowMin ? belowMinReason : order.belowMinReason,
      rev: { increment: 1 },
    },
  });

  // Audit log
  await tx.auditLog.create({
    data: {
      businessId,
      actorId: ctx.user.id,
      actorRole: ctx.user.role,
      action: 'ORDER_SUBMIT',
      entityType: 'Order',
      entityId: order.id,
      summary: `Order #${order.orderNo || order.id.slice(-6)} diajukan untuk persetujuan (Invoice ${invoiceType} v${version} senilai ${formatRupiah(Number(invoiceAmount))})`,
      reason: order.hasBelowMin ? belowMinReason : undefined,
    },
  });

  // Notifikasi untuk Super Admin (Seksi 12.4: Sales, customer, tipe invoice, total, profit dan margin, tanda di bawah minimal)
  const admins = await tx.user.findMany({
    where: { role: Role.SUPERADMIN, isActive: true },
    select: { id: true },
  });

  const profitResult = calcProfit({
    items: order.items.map((i) => ({
      qty: i.qty,
      lineNet: Number(i.lineNet),
      costPrice: Number(i.costPrice),
      discountSource: i.discountSource || 'MANUAL',
      lineDiscount: Number(i.lineDiscount),
    })),
    returns: [],
    shippingCharge: Number(order.shippingCharge),
    shippingActualCost: 0,
    extraCosts: [],
  });

  const marginPercent = (profitResult.marginBps / 100).toFixed(2);
  const belowMinNotice = order.hasBelowMin
    ? `\n⚠️ <b>Ada harga di bawah minimal</b>\nAlasan: ${escapeHtml(belowMinReason || '-')}`
    : '';

  const notifBody =
    `Sales: <b>${escapeHtml(ctx.user.name)}</b>\n` +
    `Pelanggan: <b>${escapeHtml(order.customer?.name || '-')}</b>\n` +
    `Tipe: <b>Invoice ${invoiceType} v${version}</b>\n` +
    `Total: <b>${formatRupiah(Number(invoiceAmount))}</b>\n` +
    `Laba: <b>${formatRupiah(profitResult.profit)} (${marginPercent}%)</b>` +
    belowMinNotice;

  for (const admin of admins) {
    await tx.notification.create({
      data: {
        businessId,
        userId: admin.id,
        type: 'APPROVAL_REQUEST',
        title: 'Pengajuan Pesanan Baru',
        body: notifBody,
        linkPath: '/approvals',
        dedupeKey: `approval_req_${invoice.id}_${admin.id}`,
      },
    });
  }

  const updatedOrder = await tx.order.findFirstOrThrow({
    where: { id: order.id, businessId },
    include: {
      customer: true,
      items: true,
    },
  });

  return {
    order: formatOrderDto(updatedOrder, ctx.user.role),
    invoice: formatInvoiceDto(invoice),
  };
}

/**
 * Menarik kembali pengajuan pesanan yang sedang menunggu persetujuan (withdraw).
 *
 * Rujukan: Seksi 8.2 & Seksi 19.5 (T3.1) Dokumen Spesifikasi.
 */
export async function withdrawOrder(
  tx: TxClient,
  ctx: Ctx,
  orderId: string
) {
  const businessId = ctx.businessId ?? ctx.user.businessId;
  if (!businessId) {
    throw new DomainError('BUSINESS_REQUIRED', 'Unit usaha aktif diperlukan', 400);
  }

  await lockOrder(tx, orderId, businessId);

  const order = await tx.order.findFirst({
    where: { id: orderId, businessId, deletedAt: null },
    include: { customer: true },
  });

  if (!order) {
    throw new DomainError('ORDER_NOT_FOUND', 'Order tidak ditemukan', 404);
  }

  // Otorisasi Sales: hanya boleh withdraw order miliknya sendiri
  if (ctx.user.role === Role.SALES) {
    if (order.salesId !== ctx.user.id) {
      throw new DomainError('FORBIDDEN', 'Anda tidak memiliki hak akses atas pesanan ini', 403);
    }
  }

  // Boleh withdraw saat status PENDING_APPROVAL atau FINAL_PENDING_APPROVAL
  assertStatus(
    order.status,
    [OrderStatus.PENDING_APPROVAL, OrderStatus.FINAL_PENDING_APPROVAL],
    'withdraw'
  );

  const nextStatus =
    order.status === OrderStatus.FINAL_PENDING_APPROVAL
      ? OrderStatus.IN_PROCESS
      : OrderStatus.DRAFT;

  // Cari invoice yang masih PENDING_APPROVAL
  const pendingInvoice = await tx.invoice.findFirst({
    where: {
      orderId: order.id,
      businessId,
      status: InvoiceStatus.PENDING_APPROVAL,
      deletedAt: null,
    },
  });

  if (!pendingInvoice) {
    throw new DomainError(
      'NO_PENDING_INVOICE',
      'Tidak ada invoice yang sedang menunggu persetujuan',
      409
    );
  }

  // Invoice menjadi WITHDRAWN
  await tx.invoice.updateMany({
    where: { id: pendingInvoice.id, businessId },
    data: { status: InvoiceStatus.WITHDRAWN },
  });

  // Order kembali ke DRAFT atau IN_PROCESS
  await tx.order.updateMany({
    where: { id: order.id, businessId },
    data: {
      status: nextStatus,
      rev: { increment: 1 },
    },
  });

  // Audit log
  await tx.auditLog.create({
    data: {
      businessId,
      actorId: ctx.user.id,
      actorRole: ctx.user.role,
      action: 'ORDER_WITHDRAW',
      entityType: 'Order',
      entityId: order.id,
      summary: `Pengajuan order #${order.orderNo || order.id.slice(-6)} ditarik kembali ke ${nextStatus}`,
    },
  });

  const updatedOrder = await tx.order.findFirstOrThrow({
    where: { id: order.id, businessId },
    include: {
      customer: true,
      items: true,
    },
  });

  return {
    order: formatOrderDto(updatedOrder, ctx.user.role),
    withdrawnInvoiceId: pendingInvoice.id,
  };
}

/**
 * Mengajukan faktur pelunasan pesanan (Request Final Invoice) (Seksi 8.2 & Seksi 19.5 T3.4).
 *
 * Efek samping:
 * 1. Otorisasi Sales pemilik order atau Super Admin.
 * 2. Status order harus IN_PROCESS dan uang muka (DP) telah lunas.
 * 3. Bila menyertakan shippingCharge baru:
 *    - Jika ongkir berubah, shippingReason wajib minimal 5 karakter (422 SHIPPING_REASON_REQUIRED).
 *    - Hitung ulang total pesanan dengan calcOrderTotals (ppnAmount & grandTotal baru).
 *    - Nilai dpAmount yang telah dibayar tidak berubah.
 * 4. Buat invoice baru bertipe FINAL berstatus PENDING_APPROVAL sebesar (grandTotal - dpAmount).
 * 5. Versi faktur: version = 1 + jumlah invoice FINAL yang REJECTED, VOID, atau WITHDRAWN.
 * 6. Transisi status order menjadi FINAL_PENDING_APPROVAL.
 * 7. Catat AuditLog (ORDER_REQUEST_FINAL).
 * 8. Notifikasi ke seluruh Super Admin aktif.
 */
export async function requestFinalOrder(
  tx: TxClient,
  ctx: Ctx,
  orderId: string,
  options?: OrderRequestFinalInput
) {
  const businessId = ctx.businessId ?? ctx.user.businessId;
  if (!businessId) {
    throw new DomainError('BUSINESS_REQUIRED', 'Unit usaha aktif diperlukan', 400);
  }

  await lockOrder(tx, orderId, businessId);

  const order = await tx.order.findFirst({
    where: { id: orderId, businessId, deletedAt: null },
    include: {
      items: true,
      customer: true,
    },
  });

  if (!order) {
    throw new DomainError('ORDER_NOT_FOUND', 'Pesanan tidak ditemukan', 404);
  }

  if (ctx.user.role === Role.SALES && order.salesId !== ctx.user.id) {
    throw new DomainError('FORBIDDEN', 'Anda tidak memiliki hak akses atas pesanan ini', 403);
  }

  if (order.status !== OrderStatus.IN_PROCESS) {
    throw new DomainError(
      'INVALID_STATE',
      `Pengajuan pelunasan hanya dapat dilakukan saat pesanan berstatus IN_PROCESS (status saat ini: ${order.status})`,
      409
    );
  }

  // Cek apakah invoice DP lunas
  const dpInvoice = await tx.invoice.findFirst({
    where: {
      orderId: order.id,
      businessId,
      type: InvoiceType.DP,
      status: InvoiceStatus.APPROVED,
      deletedAt: null,
    },
  });

  if (dpInvoice && dpInvoice.paidAmount < dpInvoice.amount) {
    throw new DomainError('INVALID_STATE', 'Uang muka (DP) belum lunas', 409);
  }

  // Cek apakah sudah ada invoice PENDING_APPROVAL
  const pendingInvoice = await tx.invoice.findFirst({
    where: {
      orderId: order.id,
      businessId,
      status: InvoiceStatus.PENDING_APPROVAL,
      deletedAt: null,
    },
  });

  if (pendingInvoice) {
    throw new DomainError(
      'INVOICE_ALREADY_PENDING',
      'Masih ada faktur yang sedang menunggu persetujuan',
      409
    );
  }

  let finalGrandTotal = order.grandTotal;
  let finalShippingCharge = order.shippingCharge;
  let finalShippingReason: string | null = null;
  let finalPpnAmount = order.ppnAmount;

  // Tangani perubahan ongkir bila disediakan
  if (
    options?.shippingCharge !== undefined &&
    BigInt(options.shippingCharge) !== order.shippingCharge
  ) {
    const shippingReason = options.shippingReason?.trim();
    if (!shippingReason || shippingReason.length < 5) {
      throw new DomainError(
        'SHIPPING_REASON_REQUIRED',
        'Alasan perubahan ongkir wajib diisi minimal 5 karakter',
        422
      );
    }

    finalShippingCharge = BigInt(options.shippingCharge);
    finalShippingReason = shippingReason;

    // Hitung ulang total order dengan shippingCharge baru
    const linesForCalc = order.items.map((i) => ({
      lineSubtotal: Number(i.lineSubtotal),
      lineDiscount: Number(i.lineDiscount),
      lineNet: Number(i.lineNet),
    }));

    const newTotals = calcOrderTotals({
      lines: linesForCalc,
      shippingCharge: Number(finalShippingCharge),
      ppnEnabled: order.ppnEnabled,
      ppnRateBps: order.ppnRateBps,
      dpBps: order.dpBps,
    });

    finalPpnAmount = BigInt(newTotals.ppnAmount);
    finalGrandTotal = BigInt(newTotals.grandTotal);

    await tx.order.updateMany({
      where: { id: order.id, businessId },
      data: {
        shippingCharge: finalShippingCharge,
        ppnAmount: finalPpnAmount,
        grandTotal: finalGrandTotal,
        rev: { increment: 1 },
      },
    });
  }

  // Nilai invoice pelunasan: grandTotal - dpAmount - creditTotal (BLUEPRINT Bagian 5)
  const invoiceAmount = finalGrandTotal - order.dpAmount - order.creditTotal;
  if (invoiceAmount <= BigInt(0)) {
    throw new DomainError('INVALID_STATE', 'Jumlah pelunasan tidak valid (sudah lunas oleh DP atau nota kredit)', 409);
  }

  // Tentukan versi invoice FINAL
  const prevFinalCount = await tx.invoice.count({
    where: {
      orderId: order.id,
      businessId,
      type: InvoiceType.FINAL,
      status: {
        in: [InvoiceStatus.REJECTED, InvoiceStatus.VOID, InvoiceStatus.WITHDRAWN],
      },
    },
  });
  const version = prevFinalCount + 1;

  // Buat Invoice FINAL PENDING_APPROVAL
  const createdInvoice = await tx.invoice.create({
    data: {
      businessId,
      orderId: order.id,
      customerId: order.customerId,
      type: InvoiceType.FINAL,
      status: InvoiceStatus.PENDING_APPROVAL,
      version,
      amount: invoiceAmount,
      requestedById: ctx.user.id,
      requestedAt: new Date(),
    },
  });

  // Update status order menjadi FINAL_PENDING_APPROVAL
  await tx.order.updateMany({
    where: { id: order.id, businessId },
    data: {
      status: OrderStatus.FINAL_PENDING_APPROVAL,
      rev: { increment: 1 },
    },
  });

  // Audit log
  await tx.auditLog.create({
    data: {
      businessId,
      actorId: ctx.user.id,
      actorRole: ctx.user.role,
      action: 'ORDER_REQUEST_FINAL',
      entityType: 'Order',
      entityId: order.id,
      summary: `Pengajuan faktur pelunasan untuk pesanan ${order.orderNo || order.id} sebesar ${formatRupiah(Number(invoiceAmount))}`,
      reason: finalShippingReason ?? undefined,
    },
  });

  // Notifikasi ke seluruh Super Admin aktif
  const superAdmins = await tx.user.findMany({
    where: { role: Role.SUPERADMIN, isActive: true },
    select: { id: true },
  });

  const finalNotifBody =
    `Sales: <b>${escapeHtml(ctx.user.name)}</b>\n` +
    `Pelanggan: <b>${escapeHtml(order.customer?.name || '-')}</b>\n` +
    `Tipe: <b>Invoice FINAL (Pelunasan) v${version}</b>\n` +
    `Total: <b>${formatRupiah(Number(invoiceAmount))}</b>`;

  for (const sa of superAdmins) {
    await tx.notification.create({
      data: {
        userId: sa.id,
        businessId,
        type: 'APPROVAL_REQUEST',
        title: 'Pengajuan Pelunasan Menunggu Persetujuan',
        body: finalNotifBody,
        linkPath: `/approvals/${createdInvoice.id}`,
        dedupeKey: `req_final_${createdInvoice.id}_${sa.id}`,
      },
    });
  }

  const [refreshedOrder, refreshedInvoice] = await Promise.all([
    tx.order.findFirstOrThrow({
      where: { id: order.id, businessId },
      include: { customer: true, items: true },
    }),
    tx.invoice.findFirstOrThrow({
      where: { id: createdInvoice.id, businessId },
    }),
  ]);

  return {
    order: formatOrderDto(refreshedOrder, ctx.user.role),
    invoice: formatInvoiceDto(refreshedInvoice),
  };
}
