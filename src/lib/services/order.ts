import { Role } from '@prisma/client';
import { Ctx } from '@/lib/auth/context';
import { DomainError } from '@/lib/domain/money';
import { calcLine, calcOrderTotals } from '@/lib/domain/order';
import { baseFloor, lineFloor, isBelowFloor, isPromoActive, PromoRule } from '@/lib/domain/pricing';
import { calcProfit } from '@/lib/domain/profit';
import { formatRupiah } from '@/lib/domain/money';
import { OrderCreateSchema } from '@/lib/validation/order';
import { prisma } from '@/lib/db';
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
    },
  });

  if (!customer) {
    throw new DomainError('CUSTOMER_NOT_FOUND', 'Pelanggan tidak ditemukan', 404);
  }

  if (ctx.user.role === 'SALES' && customer.assignedSalesId !== ctx.user.id) {
    throw new DomainError('CUSTOMER_NOT_FOUND', 'Pelanggan tidak ditemukan', 404);
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
