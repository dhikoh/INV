import {
  Role,
  OrderStatus,
  CommissionStatus,
  PipelineStage,
  ReminderStatus,
  Prisma,
} from '@prisma/client';
import { prisma } from '@/lib/db';
import { Ctx, requireBusiness } from '@/lib/auth/context';
import { DomainError } from '@/lib/domain/money';
import { calcProfit } from '@/lib/domain/profit';
import { getWibMonthRange } from '@/lib/services/dashboard';
import {
  OwnerSalesNoteCreateInput,
  SalesTargetUpsertInput,
  SalesPerformanceQuery,
  CommissionReportQuery,
} from '@/lib/validation/salesEvaluation';

export interface OwnerSalesNoteDto {
  id: string;
  businessId: string;
  salesId: string;
  authorId: string;
  authorName?: string;
  note: string;
  createdAt: string;
}

export interface SalesTargetDto {
  id?: string;
  businessId: string;
  salesId: string;
  month: string;
  targetRevenue: number;
  targetProfit: number;
}

export interface SalesPerformanceItem {
  salesId: string;
  salesName: string;
  username: string;
  targetRevenue: number | null;
  targetProfit: number | null;
  achievementPercent: number | null;
  revenue: number;
  profit: number;
  marginBps: number;
  orderCount: number; // deal / approved
  submittedOrderCount: number;
  rejectedOrderCount: number;
  rejectedPercent: number;
  totalCustomers: number;
  pipelineBreakdown: {
    lead: number;
    prospect: number;
    deal: number;
    repeat: number;
    lost: number;
  };
  pipelineConversionPercent: number;
  crmFollowUpCount: number;
  activeRemindersCount: number;
  earnedCommission: number;
  paidCommission: number;
  reversedCommission: number;
}

export interface SalesPerformanceReportResult {
  month: string;
  summary: {
    totalSalesCount: number;
    totalRevenue: number;
    totalProfit: number;
    averageMarginBps: number;
    totalOrderCount: number;
    totalEarnedCommission: number;
  };
  items: SalesPerformanceItem[];
}

export interface CommissionReportEntryDto {
  id: string;
  businessId: string;
  orderId: string;
  orderNo: string;
  customerName: string;
  salesId: string;
  salesName: string;
  mode: string;
  basisAmount: number;
  rateBps: number;
  amount: number;
  status: CommissionStatus;
  earnedAt: string;
  paidAt: string | null;
  reversedAt: string | null;
  note: string | null;
  needsReturn: boolean; // Seksi 18.1 nomor 35: true bila REVERSED namun sebelumnya sudah pernah PAID
}

export interface CommissionReportResult {
  summary: {
    totalEarned: number;
    totalPaid: number;
    totalReversed: number;
    totalNeedsReturn: number;
    needsReturnCount: number;
  };
  data: CommissionReportEntryDto[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

/**
 * Mengambil daftar catatan rahasia pemilik usaha (Super Admin) untuk staf sales tertentu.
 * Seksi 17.3 nomor 23 & 18.1 nomor 33.
 */
export async function getOwnerSalesNotes(
  ctx: Ctx,
  salesId: string
): Promise<OwnerSalesNoteDto[]> {
  if (ctx.user.role !== Role.SUPERADMIN) {
    throw new DomainError('FORBIDDEN', 'Hanya Super Admin yang berhak melihat catatan pemilik', 403);
  }

  const businessId = requireBusiness(ctx);
  const [notes, authors] = await Promise.all([
    prisma.ownerSalesNote.findMany({
      where: { businessId, salesId },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.user.findMany({
      where: { businessId },
      select: { id: true, name: true },
    }),
  ]);

  const authorMap = new Map(authors.map((a) => [a.id, a.name]));

  return notes.map((n) => ({
    id: n.id,
    businessId: n.businessId,
    salesId: n.salesId,
    authorId: n.authorId,
    authorName: authorMap.get(n.authorId) || 'Super Admin',
    note: n.note,
    createdAt: n.createdAt.toISOString(),
  }));
}

/**
 * Menambahkan catatan rahasia pemilik usaha tentang staf sales.
 */
export async function createOwnerSalesNote(
  ctx: Ctx,
  salesId: string,
  input: OwnerSalesNoteCreateInput
): Promise<OwnerSalesNoteDto> {
  if (ctx.user.role !== Role.SUPERADMIN) {
    throw new DomainError('FORBIDDEN', 'Hanya Super Admin yang berhak membuat catatan pemilik', 403);
  }

  const businessId = requireBusiness(ctx);
  const sales = await prisma.user.findFirst({
    where: { id: salesId, businessId, role: Role.SALES, deletedAt: null },
  });

  if (!sales) {
    throw new DomainError('NOT_FOUND', 'Staf sales tidak ditemukan pada unit usaha ini', 404);
  }

  const note = await prisma.ownerSalesNote.create({
    data: {
      businessId,
      salesId,
      authorId: ctx.user.id,
      note: input.note.trim(),
    },
  });

  await prisma.auditLog.create({
    data: {
      businessId,
      actorId: ctx.user.id,
      actorRole: ctx.user.role,
      action: 'OWNER_SALES_NOTE_CREATE',
      entityType: 'OwnerSalesNote',
      entityId: note.id,
      summary: `Menambahkan catatan rahasia evaluasi untuk staf sales ${sales.name}`,
    },
  });

  return {
    id: note.id,
    businessId: note.businessId,
    salesId: note.salesId,
    authorId: note.authorId,
    authorName: ctx.user.name,
    note: note.note,
    createdAt: note.createdAt.toISOString(),
  };
}

/**
 * Mengambil target bulanan staf sales tertentu.
 */
export async function getSalesTarget(
  ctx: Ctx,
  salesId: string,
  month: string
): Promise<SalesTargetDto> {
  if (ctx.user.role !== Role.SUPERADMIN) {
    throw new DomainError('FORBIDDEN', 'Hanya Super Admin yang berhak melihat target sales', 403);
  }

  const businessId = requireBusiness(ctx);
  const target = await prisma.salesTarget.findFirst({
    where: { businessId, salesId, month },
  });

  return {
    id: target?.id,
    businessId,
    salesId,
    month,
    targetRevenue: target ? Number(target.targetRevenue) : 0,
    targetProfit: target ? Number(target.targetProfit) : 0,
  };
}

/**
 * Menyimpan / memperbarui target bulanan staf sales (Super Admin only).
 */
export async function upsertSalesTarget(
  ctx: Ctx,
  salesId: string,
  month: string,
  input: SalesTargetUpsertInput
): Promise<SalesTargetDto> {
  if (ctx.user.role !== Role.SUPERADMIN) {
    throw new DomainError('FORBIDDEN', 'Hanya Super Admin yang berhak mengatur target sales', 403);
  }

  const businessId = requireBusiness(ctx);
  const sales = await prisma.user.findFirst({
    where: { id: salesId, businessId, role: Role.SALES, deletedAt: null },
  });

  if (!sales) {
    throw new DomainError('NOT_FOUND', 'Staf sales tidak ditemukan pada unit usaha ini', 404);
  }

  const existing = await prisma.salesTarget.findFirst({
    where: { businessId, salesId, month },
  });

  const targetProfit = input.targetProfit ?? 0;

  if (existing) {
    await prisma.salesTarget.updateMany({
      where: { id: existing.id, businessId },
      data: {
        targetRevenue: BigInt(input.targetRevenue),
        targetProfit: BigInt(targetProfit),
      },
    });
  } else {
    await prisma.salesTarget.create({
      data: {
        businessId,
        salesId,
        month,
        targetRevenue: BigInt(input.targetRevenue),
        targetProfit: BigInt(targetProfit),
      },
    });
  }

  await prisma.auditLog.create({
    data: {
      businessId,
      actorId: ctx.user.id,
      actorRole: ctx.user.role,
      action: 'SALES_TARGET_SET',
      entityType: 'SalesTarget',
      entityId: `${salesId}_${month}`,
      summary: `Mengatur target ${month} untuk ${sales.name}: Omzet Rp ${input.targetRevenue.toLocaleString('id-ID')}`,
    },
  });

  return {
    id: existing?.id,
    businessId,
    salesId,
    month,
    targetRevenue: input.targetRevenue,
    targetProfit,
  };
}

/**
 * Menghasilkan Laporan Evaluasi Kinerja Staf Sales (GET /reports/sales-performance).
 * Rujukan: Seksi 17.3 nomor 23 & Table 19.7 Dokumen Spesifikasi.
 * Super Admin ONLY.
 */
export async function getSalesPerformanceReport(
  ctx: Ctx,
  query: SalesPerformanceQuery
): Promise<SalesPerformanceReportResult> {
  if (ctx.user.role !== Role.SUPERADMIN) {
    throw new DomainError('FORBIDDEN', 'Hanya Super Admin yang berhak mengakses evaluasi sales', 403);
  }

  const businessId = requireBusiness(ctx);

  // 1. Tentukan rentang tanggal bulan berjalan (WIB)
  let monthStr = query.month;
  let start: Date;
  let end: Date;

  if (monthStr) {
    const [yStr, mStr] = monthStr.split('-');
    const year = parseInt(yStr, 10);
    const month = parseInt(mStr, 10) - 1;
    start = new Date(Date.UTC(year, month, 1, 0, 0, 0) - 7 * 3_600_000);
    const nextMonth = new Date(Date.UTC(year, month + 1, 1, 0, 0, 0) - 7 * 3_600_000);
    end = new Date(nextMonth.getTime() - 1);
  } else {
    const range = getWibMonthRange();
    start = range.start;
    end = range.end;
    monthStr = range.monthStr;
  }

  // 2. Ambil seluruh staf sales aktif
  const salesUsers = await prisma.user.findMany({
    where: {
      businessId,
      role: Role.SALES,
      deletedAt: null,
      ...(query.salesId ? { id: query.salesId } : {}),
    },
    select: { id: true, name: true, username: true },
    orderBy: { name: 'asc' },
  });

  const salesIds = salesUsers.map((s) => s.id);

  // 3. Ambil data pesanan, target, pelanggan, tugas CRM, pengingat, dan komisi
  const [
    allOrders,
    targets,
    customers,
    crmTasks,
    crmInteractions,
    reminders,
    commissionEntries,
  ] = await Promise.all([
    // Pesanan dalam bulan tersebut
    prisma.order.findMany({
      where: {
        businessId,
        salesId: { in: salesIds },
        deletedAt: null,
        createdAt: { gte: start, lte: end },
      },
      include: {
        items: true,
      },
    }),
    // Target sales bulan tersebut
    prisma.salesTarget.findMany({
      where: {
        businessId,
        salesId: { in: salesIds },
        month: monthStr,
      },
    }),
    // Pelanggan yang ditugaskan ke sales
    prisma.customer.findMany({
      where: {
        businessId,
        assignedSalesId: { in: salesIds },
        deletedAt: null,
      },
      select: {
        id: true,
        assignedSalesId: true,
        pipelineStage: true,
      },
    }),
    // Tugas CRM follow-up yang due di bulan ini
    prisma.crmTask.findMany({
      where: {
        businessId,
        assignedToId: { in: salesIds },
        dueAt: { gte: start, lte: end },
      },
      select: { id: true, assignedToId: true },
    }),
    // Interaksi CRM yang terjadi di bulan ini
    prisma.crmInteraction.findMany({
      where: {
        businessId,
        salesId: { in: salesIds },
        occurredAt: { gte: start, lte: end },
      },
      select: { id: true, salesId: true },
    }),
    // Pengingat repeat order aktif
    prisma.reminder.findMany({
      where: {
        businessId,
        salesId: { in: salesIds },
        status: ReminderStatus.ACTIVE,
      },
      select: { id: true, salesId: true },
    }),
    // Entri komisi bulan ini
    prisma.commissionEntry.findMany({
      where: {
        businessId,
        salesId: { in: salesIds },
        earnedAt: { gte: start, lte: end },
      },
      select: {
        id: true,
        salesId: true,
        amount: true,
        status: true,
        paidAt: true,
      },
    }),
  ]);

  // Siapkan map untuk perhitungan cepat
  const orderIds = allOrders.map((o) => o.id);
  const [creditNotes, shipments, orderCosts] = await Promise.all([
    orderIds.length > 0
      ? prisma.creditNote.findMany({
          where: { businessId, orderId: { in: orderIds }, voidedAt: null },
        })
      : [],
    orderIds.length > 0
      ? prisma.shipment.findMany({
          where: { businessId, orderId: { in: orderIds } },
        })
      : [],
    orderIds.length > 0
      ? prisma.orderCost.findMany({
          where: { businessId, orderId: { in: orderIds } },
        })
      : [],
  ]);

  const creditNoteMap = new Map<string, typeof creditNotes>();
  for (const cn of creditNotes) {
    const list = creditNoteMap.get(cn.orderId) ?? [];
    list.push(cn);
    creditNoteMap.set(cn.orderId, list);
  }

  const shipmentMap = new Map<string, (typeof shipments)[0]>();
  for (const sh of shipments) {
    shipmentMap.set(sh.orderId, sh);
  }

  const orderCostMap = new Map<string, typeof orderCosts>();
  for (const oc of orderCosts) {
    const list = orderCostMap.get(oc.orderId) ?? [];
    list.push(oc);
    orderCostMap.set(oc.orderId, list);
  }

  // 4. Kalkulasi metrik tiap staf sales
  const items: SalesPerformanceItem[] = salesUsers.map((sales) => {
    const salesOrders = allOrders.filter((o) => o.salesId === sales.id);
    const salesTarget = targets.find((t) => t.salesId === sales.id);
    const salesCustomers = customers.filter((c) => c.assignedSalesId === sales.id);
    const salesTasks = crmTasks.filter((t) => t.assignedToId === sales.id);
    const salesInteractions = crmInteractions.filter((i) => i.salesId === sales.id);
    const salesReminders = reminders.filter((r) => r.salesId === sales.id);
    const salesCommissions = commissionEntries.filter((c) => c.salesId === sales.id);

    // Filter pesanan diajukan vs deal vs ditolak
    const submittedOrders = salesOrders.filter((o) => o.status !== OrderStatus.DRAFT);
    const dealStatuses: OrderStatus[] = [
      OrderStatus.AWAITING_DP,
      OrderStatus.IN_PROCESS,
      OrderStatus.FINAL_PENDING_APPROVAL,
      OrderStatus.AWAITING_FINAL_PAYMENT,
      OrderStatus.COMPLETED,
    ];
    const dealOrders = salesOrders.filter((o) => dealStatuses.includes(o.status));
    const rejectedOrders = salesOrders.filter(
      (o) =>
        o.status === OrderStatus.REVISION_REQUIRED ||
        Boolean(o.rejectReason)
    );

    // Hitung omzet & profit
    let totalRevenue = 0;
    let totalProfit = 0;

    for (const ord of dealOrders) {
      const pItems = ord.items.map((i) => ({
        qty: i.qty,
        lineNet: Number(i.lineNet),
        costPrice: Number(i.costPrice),
        discountSource: i.discountSource as 'MANUAL' | 'PROMO' | 'SUBSIDY',
        lineDiscount: Number(i.lineDiscount),
      }));
      const pReturns = (creditNoteMap.get(ord.id) || []).map((cn) => ({
        creditExPpn: Number(cn.amountExPpn),
        cogsReversed: Number(cn.cogsReversed ?? 0),
      }));
      const sh = shipmentMap.get(ord.id);
      const actualCost = Number(sh?.actualCost ?? 0);
      const extraCosts = (orderCostMap.get(ord.id) || []).map((c) => Number(c.amount));

      const profitRes = calcProfit({
        items: pItems,
        returns: pReturns,
        shippingCharge: Number(ord.shippingCharge),
        shippingActualCost: actualCost,
        extraCosts,
      });

      totalRevenue += profitRes.revenue;
      totalProfit += profitRes.profit;
    }

    // Pipeline breakdown
    const pipelineBreakdown = {
      lead: salesCustomers.filter((c) => c.pipelineStage === PipelineStage.LEAD).length,
      prospect: salesCustomers.filter((c) => c.pipelineStage === PipelineStage.PROSPECT).length,
      deal: salesCustomers.filter((c) => c.pipelineStage === PipelineStage.DEAL).length,
      repeat: salesCustomers.filter((c) => c.pipelineStage === PipelineStage.REPEAT).length,
      lost: salesCustomers.filter((c) => c.pipelineStage === PipelineStage.LOST).length,
    };

    const targetRevenue = salesTarget ? Number(salesTarget.targetRevenue) : null;
    const targetProfit = salesTarget ? Number(salesTarget.targetProfit) : null;
    const achievementPercent =
      targetRevenue && targetRevenue > 0
        ? Math.round((totalRevenue / targetRevenue) * 100)
        : null;

    const pipelineConversionPercent =
      salesCustomers.length > 0
        ? Math.round(
            ((pipelineBreakdown.deal + pipelineBreakdown.repeat) * 100) /
              salesCustomers.length
          )
        : 0;

    const rejectedPercent =
      submittedOrders.length > 0
        ? Math.round((rejectedOrders.length * 100) / submittedOrders.length)
        : 0;

    // Komisi
    let earnedCommission = 0;
    let paidCommission = 0;
    let reversedCommission = 0;

    for (const comm of salesCommissions) {
      const amt = Number(comm.amount);
      if (comm.status === CommissionStatus.EARNED) earnedCommission += amt;
      else if (comm.status === CommissionStatus.PAID) paidCommission += amt;
      else if (comm.status === CommissionStatus.REVERSED) reversedCommission += amt;
    }

    const marginBps =
      totalRevenue > 0 ? Math.round((totalProfit * 10000) / totalRevenue) : 0;

    return {
      salesId: sales.id,
      salesName: sales.name,
      username: sales.username,
      targetRevenue,
      targetProfit,
      achievementPercent,
      revenue: totalRevenue,
      profit: totalProfit,
      marginBps,
      orderCount: dealOrders.length,
      submittedOrderCount: submittedOrders.length,
      rejectedOrderCount: rejectedOrders.length,
      rejectedPercent,
      totalCustomers: salesCustomers.length,
      pipelineBreakdown,
      pipelineConversionPercent,
      crmFollowUpCount: salesTasks.length + salesInteractions.length,
      activeRemindersCount: salesReminders.length,
      earnedCommission,
      paidCommission,
      reversedCommission,
    };
  });

  // Urutkan dari omzet tertinggi
  items.sort((a, b) => b.revenue - a.revenue);

  const totalRevenue = items.reduce((acc, curr) => acc + curr.revenue, 0);
  const totalProfit = items.reduce((acc, curr) => acc + curr.profit, 0);
  const averageMarginBps =
    totalRevenue > 0 ? Math.round((totalProfit * 10000) / totalRevenue) : 0;
  const totalOrderCount = items.reduce((acc, curr) => acc + curr.orderCount, 0);
  const totalEarnedCommission = items.reduce((acc, curr) => acc + curr.earnedCommission, 0);

  return {
    month: monthStr,
    summary: {
      totalSalesCount: salesUsers.length,
      totalRevenue,
      totalProfit,
      averageMarginBps,
      totalOrderCount,
      totalEarnedCommission,
    },
    items,
  };
}

/**
 * Menghasilkan Laporan Komisi Staf Sales (GET /reports/commissions).
 * Termasuk indikator khusus "perlu dikembalikan" bila komisi sudah pernah PAID lalu order dibatalkan (Seksi 18.1 nomor 35).
 * Super Admin ONLY.
 */
export async function getCommissionReport(
  ctx: Ctx,
  query: CommissionReportQuery
): Promise<CommissionReportResult> {
  if (ctx.user.role !== Role.SUPERADMIN) {
    throw new DomainError('FORBIDDEN', 'Hanya Super Admin yang berhak melihat laporan komisi', 403);
  }

  const businessId = requireBusiness(ctx);
  const page = query.page ?? 1;
  const limit = query.limit ?? 50;
  const skip = (page - 1) * limit;

  // Filter rentang bulan jika ada
  let earnedAtFilter: Prisma.DateTimeFilter | undefined;
  if (query.month) {
    const [yStr, mStr] = query.month.split('-');
    const year = parseInt(yStr, 10);
    const month = parseInt(mStr, 10) - 1;
    const start = new Date(Date.UTC(year, month, 1, 0, 0, 0) - 7 * 3_600_000);
    const nextMonth = new Date(Date.UTC(year, month + 1, 1, 0, 0, 0) - 7 * 3_600_000);
    const end = new Date(nextMonth.getTime() - 1);
    earnedAtFilter = { gte: start, lte: end };
  }

  const where: Prisma.CommissionEntryWhereInput = {
    businessId,
    ...(query.salesId ? { salesId: query.salesId } : {}),
    ...(query.status ? { status: query.status } : {}),
    ...(earnedAtFilter ? { earnedAt: earnedAtFilter } : {}),
  };

  const [total, entries, allFilteredEntries, salesUsers] = await Promise.all([
    prisma.commissionEntry.count({ where }),
    prisma.commissionEntry.findMany({
      where,
      orderBy: { earnedAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.commissionEntry.findMany({
      where,
      select: { amount: true, status: true, paidAt: true },
    }),
    prisma.user.findMany({
      where: { businessId, role: Role.SALES },
      select: { id: true, name: true },
    }),
  ]);

  const salesMap = new Map(salesUsers.map((u) => [u.id, u.name]));
  const orderIds = entries.map((e) => e.orderId);

  // Ambil nomor order & nama customer
  const orders =
    orderIds.length > 0
      ? await prisma.order.findMany({
          where: { businessId, id: { in: orderIds } },
          select: {
            id: true,
            orderNo: true,
            customer: { select: { name: true } },
          },
        })
      : [];

  const orderMap = new Map(
    orders.map((o) => [
      o.id,
      { orderNo: o.orderNo || 'ORD-DRAFT', customerName: o.customer.name },
    ])
  );

  // Hitung summary komisi
  let totalEarned = 0;
  let totalPaid = 0;
  let totalReversed = 0;
  let totalNeedsReturn = 0;
  let needsReturnCount = 0;

  for (const e of allFilteredEntries) {
    const amt = Number(e.amount);
    if (e.status === CommissionStatus.EARNED) {
      totalEarned += amt;
    } else if (e.status === CommissionStatus.PAID) {
      totalPaid += amt;
    } else if (e.status === CommissionStatus.REVERSED) {
      totalReversed += amt;
      // Seksi 18.1 nomor 35: Komisi sudah PAID lalu order diretur atau di-void
      if (e.paidAt !== null) {
        totalNeedsReturn += amt;
        needsReturnCount += 1;
      }
    }
  }

  const data: CommissionReportEntryDto[] = entries.map((e) => {
    const ordInfo = orderMap.get(e.orderId);
    const needsReturn = e.status === CommissionStatus.REVERSED && e.paidAt !== null;

    return {
      id: e.id,
      businessId: e.businessId,
      orderId: e.orderId,
      orderNo: ordInfo?.orderNo || 'ORD-DRAFT',
      customerName: ordInfo?.customerName || 'Customer',
      salesId: e.salesId,
      salesName: salesMap.get(e.salesId) || 'Sales',
      mode: e.mode,
      basisAmount: Number(e.basisAmount),
      rateBps: e.rateBps,
      amount: Number(e.amount),
      status: e.status,
      earnedAt: e.earnedAt.toISOString(),
      paidAt: e.paidAt ? e.paidAt.toISOString() : null,
      reversedAt: e.reversedAt ? e.reversedAt.toISOString() : null,
      note: e.note,
      needsReturn,
    };
  });

  return {
    summary: {
      totalEarned,
      totalPaid,
      totalReversed,
      totalNeedsReturn,
      needsReturnCount,
    },
    data,
    meta: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    },
  };
}
