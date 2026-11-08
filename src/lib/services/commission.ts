import {
  CommissionMode,
  CommissionStatus,
  CommissionTrigger,
  OrderStatus,
  Prisma,
  Role,
} from '@prisma/client';
import { prisma } from '@/lib/db';
import { Ctx, requireBusiness } from '@/lib/auth/context';
import { DomainError } from '@/lib/domain/money';
import { calcProfit } from '@/lib/domain/profit';
import {
  calcCommission,
  achievementBps,
  pickTierRate,
} from '@/lib/domain/commission';
import { wibParts } from '@/lib/domain/numbering';

export type TxClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

export interface CommissionEntryDto {
  id: string;
  businessId: string;
  orderId: string;
  orderNo: string | null;
  salesId: string;
  salesName?: string;
  mode: CommissionMode;
  basisAmount: number;
  rateBps: number;
  amount: number;
  status: CommissionStatus;
  earnedAt: string;
  paidAt: string | null;
  reversedAt: string | null;
  note: string | null;
}

export interface CommissionTierDto {
  id: string;
  businessId: string;
  minAchievementBps: number;
  rateBps: number;
}

/**
 * Menghitung profit riil pesanan untuk keperluan kalkulasi komisi dan pelaporan margin.
 *
 * Rujukan: Seksi 7.4 Dokumen Spesifikasi.
 */
export async function calculateOrderProfitData(
  tx: TxClient,
  orderId: string,
  businessId: string
) {
  const [order, items, creditNotes, shipment, orderCosts] = await Promise.all([
    tx.order.findFirstOrThrow({
      where: { id: orderId, businessId, deletedAt: null },
    }),
    tx.orderItem.findMany({
      where: { orderId, businessId },
      orderBy: { sortOrder: 'asc' },
    }),
    tx.creditNote.findMany({
      where: { orderId, businessId, voidedAt: null },
    }),
    tx.shipment.findFirst({
      where: { orderId, businessId },
    }),
    tx.orderCost.findMany({
      where: { orderId, businessId },
      orderBy: { createdAt: 'asc' },
    }),
  ]);

  const profitInput = {
    items: items.map((i) => ({
      qty: i.qty,
      lineNet: Number(i.lineNet),
      costPrice: Number(i.costPrice),
      discountSource: i.discountSource as 'MANUAL' | 'PROMO' | 'SUBSIDY',
      lineDiscount: Number(i.lineDiscount),
    })),
    returns: creditNotes.map((cn) => ({
      creditExPpn: Number(cn.amountExPpn),
      cogsReversed: Number(cn.cogsReversed ?? 0),
    })),
    shippingCharge: Number(order.shippingCharge),
    shippingActualCost: Number(shipment?.actualCost ?? 0),
    extraCosts: orderCosts.map((c) => Number(c.amount)),
  };

  const profitResult = calcProfit(profitInput);

  return {
    order,
    items,
    creditNotes,
    shipment,
    orderCosts,
    profitResult,
  };
}

/**
 * Mengevaluasi dan menghasilkan entri komisi pesanan jika pemicu komisi terpenuhi.
 *
 * Rujukan: Seksi 7.6 Dokumen Spesifikasi:
 * - ON_FULL_PAID: Saldo pesanan sudah 0 setelah pembayaran terverifikasi.
 * - ON_DP_PAID: Uang Muka (DP) terverifikasi.
 */
export async function evaluateOrderCommission(
  tx: TxClient,
  orderId: string
): Promise<CommissionEntryDto | null> {
  if (!tx.commissionEntry) {
    return null;
  }

  const order = await tx.order.findFirst({
    where: { id: orderId, deletedAt: null },
    include: {
      business: true,
    },
  });

  if (!order || order.status === OrderStatus.CANCELLED) {
    return null;
  }

  const business =
    order.business ??
    (await tx.business.findUnique({ where: { id: order.businessId } }));

  if (!business) {
    return null;
  }

  const salesUser = await tx.user.findUnique({
    where: { id: order.salesId },
  });

  if (!salesUser) {
    return null;
  }

  // 1. Cek apakah pemicu komisi terpenuhi
  const trigger = business.commissionTrigger;
  const balanceDue =
    BigInt(order.grandTotal) -
    BigInt(order.paidTotal || 0) -
    BigInt(order.creditTotal || 0);

  let isTriggerMet = false;
  if (trigger === CommissionTrigger.ON_FULL_PAID) {
    isTriggerMet = balanceDue <= BigInt(0);
  } else if (trigger === CommissionTrigger.ON_DP_PAID) {
    // Bila pesanan memiliki DP (dpAmount > 0), dipicu saat paidTotal >= dpAmount.
    // Bila tanpa DP (dpAmount = 0), dipicu saat order lunas (balanceDue <= 0).
    if (order.dpAmount > BigInt(0)) {
      isTriggerMet = (order.paidTotal || BigInt(0)) >= order.dpAmount;
    } else {
      isTriggerMet = balanceDue <= BigInt(0);
    }
  }

  if (!isTriggerMet) {
    return null;
  }

  // 2. Tentukan konfigurasi efektif komisi sales (User menimpa Business)
  const mode = salesUser.commissionMode ?? business.commissionMode;
  const rateBps = salesUser.commissionRateBps ?? business.commissionRateBps;
  const fixedAmount = salesUser.commissionFixedAmount ?? business.commissionFixedAmount;

  // 3. Hitung profit pesanan saat ini
  const { profitResult } = await calculateOrderProfitData(
    tx,
    order.id,
    order.businessId
  );

  let tierRateBps = 0;
  if (mode === CommissionMode.TIERED_BY_TARGET) {
    // Tentukan bulan YYYY-MM dalam WIB
    const orderDate = new Date(order.createdAt);
    const { yyyy, mm } = wibParts(orderDate);
    const month = `${yyyy}-${mm}`;

    // Ambil target sales
    const target = await tx.salesTarget.findFirst({
      where: { salesId: order.salesId, month },
    });
    const targetRevenue = Number(target?.targetRevenue ?? 0);

    // Hitung omzet bulan berjalan untuk sales ini
    const salesOrders = await tx.order.findMany({
      where: {
        businessId: order.businessId,
        salesId: order.salesId,
        status: { not: OrderStatus.CANCELLED },
        deletedAt: null,
      },
      select: {
        id: true,
        subtotal: true,
        discountTotal: true,
        shippingCharge: true,
        createdAt: true,
      },
    });

    const activeOrderIds = salesOrders.map((so) => so.id);
    const activeCreditNotes =
      activeOrderIds.length > 0
        ? await tx.creditNote.findMany({
            where: {
              businessId: order.businessId,
              orderId: { in: activeOrderIds },
              voidedAt: null,
            },
            select: { orderId: true, amountExPpn: true },
          })
        : [];

    const returnsByOrder = new Map<string, number>();
    for (const cn of activeCreditNotes) {
      returnsByOrder.set(
        cn.orderId,
        (returnsByOrder.get(cn.orderId) ?? 0) + Number(cn.amountExPpn)
      );
    }

    let monthRevenue = 0;
    for (const so of salesOrders) {
      const { yyyy: oYear, mm: oMonth } = wibParts(new Date(so.createdAt));
      if (`${oYear}-${oMonth}` === month) {
        const orderGoods = Number(so.subtotal - so.discountTotal);
        const orderShipping = Number(so.shippingCharge);
        const returnsExPpn = returnsByOrder.get(so.id) ?? 0;
        monthRevenue += orderGoods + orderShipping - returnsExPpn;
      }
    }

    const currentAchievementBps = achievementBps(monthRevenue, targetRevenue);
    const tiers = await tx.commissionTier.findMany({
      where: { businessId: order.businessId },
      orderBy: { minAchievementBps: 'desc' },
    });

    tierRateBps = pickTierRate(tiers, currentAchievementBps);
  }

  const calculated = calcCommission({
    mode,
    rateBps: rateBps ?? 0,
    fixedAmount: Number(fixedAmount ?? 0),
    profit: profitResult.profit,
    revenue: profitResult.revenue,
    tierRateBps,
  });

  // 4. Upsert entri komisi
  const existingEntry = await tx.commissionEntry.findFirst({
    where: { orderId: order.id, businessId: order.businessId },
  });

  if (existingEntry) {
    // Jika sudah PAID, tidak boleh diubah otomatis
    if (existingEntry.status === CommissionStatus.PAID) {
      return formatCommissionEntryDto(existingEntry, order.orderNo, salesUser.name);
    }

    await tx.commissionEntry.updateMany({
      where: { orderId: order.id, businessId: order.businessId },
      data: {
        mode,
        basisAmount: BigInt(calculated.basis),
        rateBps: calculated.rateBps,
        amount: BigInt(calculated.amount),
        status: CommissionStatus.EARNED,
      },
    });

    const updated = await tx.commissionEntry.findFirst({
      where: { orderId: order.id, businessId: order.businessId },
    });

    return updated ? formatCommissionEntryDto(updated, order.orderNo, salesUser.name) : null;
  }

  const created = await tx.commissionEntry.create({
    data: {
      businessId: order.businessId,
      orderId: order.id,
      salesId: order.salesId,
      mode,
      basisAmount: BigInt(calculated.basis),
      rateBps: calculated.rateBps,
      amount: BigInt(calculated.amount),
      status: CommissionStatus.EARNED,
      earnedAt: new Date(),
    },
  });

  return formatCommissionEntryDto(created, order.orderNo, salesUser.name);
}

/**
 * Menghitung ulang komisi pesanan yang sudah ada (misal setelah retur atau penambahan biaya).
 * Hanya memodifikasi entri yang berstatus EARNED.
 */
export async function recalculateOrderCommission(
  tx: TxClient,
  orderId: string
): Promise<CommissionEntryDto | null> {
  if (!tx.commissionEntry) {
    return null;
  }

  const existing = await tx.commissionEntry.findFirst({
    where: { orderId },
  });

  // Jika belum ada entri atau sudah PAID atau REVERSED, evaluasi kondisi pemicu
  if (!existing || existing.status === CommissionStatus.EARNED) {
    return evaluateOrderCommission(tx, orderId);
  }

  return null;
}

/**
 * Membalikkan komisi saat pesanan dibatalkan atau dihapus.
 */
export async function reverseOrderCommission(
  tx: TxClient,
  orderId: string,
  note?: string
): Promise<void> {
  if (!tx.commissionEntry) {
    return;
  }

  await tx.commissionEntry.updateMany({
    where: {
      orderId,
      status: { not: CommissionStatus.REVERSED },
    },
    data: {
      status: CommissionStatus.REVERSED,
      reversedAt: new Date(),
      note: note ?? 'Pesanan dibatalkan',
    },
  });
}

/**
 * Menandai komisi telah dibayarkan oleh Super Admin.
 */
export async function payCommissionEntry(
  tx: TxClient,
  ctx: Ctx,
  id: string,
  note?: string
): Promise<CommissionEntryDto> {
  if (ctx.user.role !== Role.SUPERADMIN) {
    throw new DomainError('FORBIDDEN', 'Hanya Super Admin yang dapat membayar komisi', 403);
  }

  const businessId = requireBusiness(ctx);
  const entry = await tx.commissionEntry.findFirst({
    where: { id, businessId },
  });

  if (!entry) {
    throw new DomainError('NOT_FOUND', 'Entri komisi tidak ditemukan', 404);
  }

  if (entry.status === CommissionStatus.REVERSED) {
    throw new DomainError('INVALID_STATE', 'Komisi yang telah dibatalkan tidak dapat dibayar', 409);
  }

  await tx.commissionEntry.updateMany({
    where: { id: entry.id, businessId },
    data: {
      status: CommissionStatus.PAID,
      paidAt: new Date(),
      note: note?.trim() || entry.note,
    },
  });

  const updated = (await tx.commissionEntry.findFirst({
    where: { id: entry.id, businessId },
  }))!;

  await tx.auditLog.create({
    data: {
      businessId,
      actorId: ctx.user.id,
      actorRole: ctx.user.role,
      action: 'COMMISSION_PAID',
      entityType: 'CommissionEntry',
      entityId: updated.id,
      summary: `Komisi Rp ${Number(updated.amount).toLocaleString('id-ID')} ditandai telah dibayar`,
      reason: note?.trim(),
    },
  });

  const order = await tx.order.findFirst({
    where: { id: updated.orderId, businessId },
    select: { orderNo: true },
  });

  const sales = await tx.user.findUnique({
    where: { id: updated.salesId },
    select: { name: true },
  });

  return formatCommissionEntryDto(updated, order?.orderNo, sales?.name);
}

/**
 * Mengambil daftar komisi dengan paginasi dan filter (Super Admin only).
 */
export async function listCommissionEntries(
  tx: TxClient,
  ctx: Ctx,
  query: {
    salesId?: string;
    status?: CommissionStatus;
    mode?: CommissionMode;
    page: number;
    limit: number;
  }
): Promise<{ data: CommissionEntryDto[]; total: number; page: number; limit: number }> {
  if (ctx.user.role !== Role.SUPERADMIN) {
    throw new DomainError('FORBIDDEN', 'Hanya Super Admin yang dapat melihat data komisi', 403);
  }

  const businessId = requireBusiness(ctx);
  const where: Prisma.CommissionEntryWhereInput = { businessId };

  if (query.salesId) where.salesId = query.salesId;
  if (query.status) where.status = query.status;
  if (query.mode) where.mode = query.mode;

  const [total, entries] = await Promise.all([
    tx.commissionEntry.count({ where }),
    tx.commissionEntry.findMany({
      where,
      orderBy: { earnedAt: 'desc' },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
  ]);

  const orderIds = entries.map((e) => e.orderId);
  const salesIds = entries.map((e) => e.salesId);

  const [orders, salesUsers] = await Promise.all([
    tx.order.findMany({
      where: { id: { in: orderIds } },
      select: { id: true, orderNo: true },
    }),
    tx.user.findMany({
      where: { id: { in: salesIds } },
      select: { id: true, name: true },
    }),
  ]);

  const orderMap = new Map(orders.map((o) => [o.id, o.orderNo]));
  const salesMap = new Map(salesUsers.map((u) => [u.id, u.name]));

  const data = entries.map((e) =>
    formatCommissionEntryDto(e, orderMap.get(e.orderId), salesMap.get(e.salesId))
  );

  return { data, total, page: query.page, limit: query.limit };
}

/**
 * Mengambil daftar CommissionTier untuk unit usaha.
 */
export async function getCommissionTiers(
  tx: TxClient,
  businessId: string
): Promise<CommissionTierDto[]> {
  const tiers = await tx.commissionTier.findMany({
    where: { businessId },
    orderBy: { minAchievementBps: 'asc' },
  });

  return tiers.map((t) => ({
    id: t.id,
    businessId: t.businessId,
    minAchievementBps: t.minAchievementBps,
    rateBps: t.rateBps,
  }));
}

/**
 * Menyimpan / memperbarui daftar CommissionTier untuk unit usaha.
 */
export async function setCommissionTiers(
  tx: TxClient,
  ctx: Ctx,
  tiersInput: Array<{ minAchievementBps: number; rateBps: number }>
): Promise<CommissionTierDto[]> {
  if (ctx.user.role !== Role.SUPERADMIN) {
    throw new DomainError('FORBIDDEN', 'Hanya Super Admin yang dapat mengatur tingkat komisi', 403);
  }

  const businessId = requireBusiness(ctx);

  // Hapus tier lama dan buat tier baru
  await tx.commissionTier.deleteMany({
    where: { businessId },
  });

  if (tiersInput.length > 0) {
    await tx.commissionTier.createMany({
      data: tiersInput.map((t) => ({
        businessId,
        minAchievementBps: t.minAchievementBps,
        rateBps: t.rateBps,
      })),
    });
  }

  return getCommissionTiers(tx, businessId);
}

function formatCommissionEntryDto(
  e: {
    id: string;
    businessId: string;
    orderId: string;
    salesId: string;
    mode: CommissionMode;
    basisAmount: bigint | number;
    rateBps: number;
    amount: bigint | number;
    status: CommissionStatus;
    earnedAt: Date | string;
    paidAt?: Date | string | null;
    reversedAt?: Date | string | null;
    note?: string | null;
  },
  orderNo?: string | null,
  salesName?: string
): CommissionEntryDto {
  return {
    id: e.id,
    businessId: e.businessId,
    orderId: e.orderId,
    orderNo: orderNo || null,
    salesId: e.salesId,
    salesName: salesName || undefined,
    mode: e.mode,
    basisAmount: Number(e.basisAmount),
    rateBps: e.rateBps,
    amount: Number(e.amount),
    status: e.status,
    earnedAt: e.earnedAt instanceof Date ? e.earnedAt.toISOString() : String(e.earnedAt),
    paidAt: e.paidAt ? (e.paidAt instanceof Date ? e.paidAt.toISOString() : String(e.paidAt)) : null,
    reversedAt: e.reversedAt ? (e.reversedAt instanceof Date ? e.reversedAt.toISOString() : String(e.reversedAt)) : null,
    note: e.note ?? null,
  };
}
