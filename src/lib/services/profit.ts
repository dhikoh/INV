import { Role } from '@prisma/client';
import { prisma } from '@/lib/db';
import { Ctx, requireBusiness } from '@/lib/auth/context';
import { DomainError } from '@/lib/domain/money';
import {
  calculateOrderProfitData,
  recalculateOrderCommission,
  CommissionEntryDto,
} from './commission';

export type TxClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

export interface OrderCostDto {
  id: string;
  businessId: string;
  orderId: string;
  label: string;
  amount: number;
  createdById: string;
  createdAt: string;
}

export interface OrderProfitDto {
  orderId: string;
  goodsRevenue: number;
  shippingCharge: number;
  revenue: number;
  cogs: number;
  shippingActualCost: number;
  shippingSubsidy: number;
  extraCosts: number;
  profit: number;
  marginBps: number;
  discountBySource: {
    MANUAL: number;
    PROMO: number;
    SUBSIDY: number;
  };
  costs: OrderCostDto[];
  commission?: CommissionEntryDto | null;
}

/**
 * Mengambil rincian profitabilitas pesanan beserta seluruh komponen biayanya.
 *
 * Rujukan: Seksi 7.4 & 17.3 nomor 14 Dokumen Spesifikasi.
 * Zero-Leakage Guarantee: Hanya Super Admin yang berhak memanggil (Sales ditolak 403).
 */
export async function getOrderProfit(
  tx: TxClient,
  ctx: Ctx,
  orderId: string
): Promise<OrderProfitDto> {
  if (ctx.user.role !== Role.SUPERADMIN) {
    throw new DomainError(
      'FORBIDDEN',
      'Hanya Super Admin yang berhak mengakses rincian profit dan margin',
      403
    );
  }

  const businessId = requireBusiness(ctx);
  const { order, orderCosts, profitResult } = await calculateOrderProfitData(
    tx,
    orderId,
    businessId
  );

  // Ambil data komisi jika ada
  const commissionEntry = tx.commissionEntry
    ? await tx.commissionEntry.findFirst({
        where: { orderId: order.id, businessId },
      })
    : null;

  const costs: OrderCostDto[] = orderCosts.map((c) => ({
    id: c.id,
    businessId: c.businessId,
    orderId: c.orderId,
    label: c.label,
    amount: Number(c.amount),
    createdById: c.createdById,
    createdAt: c.createdAt instanceof Date ? c.createdAt.toISOString() : String(c.createdAt),
  }));

  const commission: CommissionEntryDto | null = commissionEntry
    ? {
        id: commissionEntry.id,
        businessId: commissionEntry.businessId,
        orderId: commissionEntry.orderId,
        orderNo: order.orderNo,
        salesId: commissionEntry.salesId,
        mode: commissionEntry.mode,
        basisAmount: Number(commissionEntry.basisAmount),
        rateBps: commissionEntry.rateBps,
        amount: Number(commissionEntry.amount),
        status: commissionEntry.status,
        earnedAt:
          commissionEntry.earnedAt instanceof Date
            ? commissionEntry.earnedAt.toISOString()
            : String(commissionEntry.earnedAt),
        paidAt: commissionEntry.paidAt
          ? commissionEntry.paidAt instanceof Date
            ? commissionEntry.paidAt.toISOString()
            : String(commissionEntry.paidAt)
          : null,
        reversedAt: commissionEntry.reversedAt
          ? commissionEntry.reversedAt instanceof Date
            ? commissionEntry.reversedAt.toISOString()
            : String(commissionEntry.reversedAt)
          : null,
        note: commissionEntry.note ?? null,
      }
    : null;

  return {
    orderId: order.id,
    goodsRevenue: profitResult.goodsRevenue,
    shippingCharge: Number(order.shippingCharge),
    revenue: profitResult.revenue,
    cogs: profitResult.cogs,
    shippingActualCost: profitResult.shippingActualCost,
    shippingSubsidy: profitResult.shippingSubsidy,
    extraCosts: profitResult.extraCosts,
    profit: profitResult.profit,
    marginBps: profitResult.marginBps,
    discountBySource: profitResult.discountBySource,
    costs,
    commission,
  };
}

/**
 * Menambahkan biaya lain / ekstra ke dalam pesanan (Super Admin only).
 */
export async function createOrderCost(
  tx: TxClient,
  ctx: Ctx,
  orderId: string,
  input: { label: string; amount: number }
): Promise<OrderCostDto> {
  if (ctx.user.role !== Role.SUPERADMIN) {
    throw new DomainError('FORBIDDEN', 'Hanya Super Admin yang dapat menambahkan biaya lain', 403);
  }

  const businessId = requireBusiness(ctx);
  const order = await tx.order.findFirst({
    where: { id: orderId, businessId, deletedAt: null },
  });

  if (!order) {
    throw new DomainError('ORDER_NOT_FOUND', 'Pesanan tidak ditemukan', 404);
  }

  const cost = await tx.orderCost.create({
    data: {
      businessId,
      orderId: order.id,
      label: input.label.trim(),
      amount: BigInt(input.amount),
      createdById: ctx.user.id,
    },
  });

  // Hitung ulang komisi karena biaya lain memengaruhi profit
  await recalculateOrderCommission(tx, order.id);

  await tx.auditLog.create({
    data: {
      businessId,
      actorId: ctx.user.id,
      actorRole: ctx.user.role,
      action: 'ORDER_COST_CREATE',
      entityType: 'OrderCost',
      entityId: cost.id,
      summary: `Menambahkan biaya lain "${cost.label}" sebesar Rp ${input.amount.toLocaleString('id-ID')} pada pesanan ${order.orderNo || order.id}`,
    },
  });

  return {
    id: cost.id,
    businessId: cost.businessId,
    orderId: cost.orderId,
    label: cost.label,
    amount: Number(cost.amount),
    createdById: cost.createdById,
    createdAt: cost.createdAt instanceof Date ? cost.createdAt.toISOString() : String(cost.createdAt),
  };
}

/**
 * Menghapus biaya lain dari pesanan (Super Admin only).
 */
export async function deleteOrderCost(
  tx: TxClient,
  ctx: Ctx,
  orderId: string,
  costId: string
): Promise<{ success: boolean }> {
  if (ctx.user.role !== Role.SUPERADMIN) {
    throw new DomainError('FORBIDDEN', 'Hanya Super Admin yang dapat menghapus biaya lain', 403);
  }

  const businessId = requireBusiness(ctx);
  const cost = await tx.orderCost.findFirst({
    where: { id: costId, orderId, businessId },
  });

  if (!cost) {
    throw new DomainError('NOT_FOUND', 'Biaya lain tidak ditemukan', 404);
  }

  await tx.orderCost.deleteMany({
    where: { id: cost.id, businessId, orderId },
  });

  // Hitung ulang komisi
  await recalculateOrderCommission(tx, orderId);

  await tx.auditLog.create({
    data: {
      businessId,
      actorId: ctx.user.id,
      actorRole: ctx.user.role,
      action: 'ORDER_COST_DELETE',
      entityType: 'OrderCost',
      entityId: cost.id,
      summary: `Menghapus biaya lain "${cost.label}" dari pesanan ${orderId}`,
    },
  });

  return { success: true };
}

/**
 * Mengambil daftar biaya lain untuk pesanan tertentu (Super Admin only).
 */
export async function listOrderCosts(
  tx: TxClient,
  ctx: Ctx,
  orderId: string
): Promise<OrderCostDto[]> {
  if (ctx.user.role !== Role.SUPERADMIN) {
    throw new DomainError('FORBIDDEN', 'Hanya Super Admin yang dapat melihat biaya lain', 403);
  }

  const businessId = requireBusiness(ctx);
  const costs = await tx.orderCost.findMany({
    where: { orderId, businessId },
    orderBy: { createdAt: 'asc' },
  });

  return costs.map((c) => ({
    id: c.id,
    businessId: c.businessId,
    orderId: c.orderId,
    label: c.label,
    amount: Number(c.amount),
    createdById: c.createdById,
    createdAt: c.createdAt instanceof Date ? c.createdAt.toISOString() : String(c.createdAt),
  }));
}
