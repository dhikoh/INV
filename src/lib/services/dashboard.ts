import { prisma } from '@/lib/db';
import {
  Role,
  OrderStatus,
  InvoiceStatus,
  PaymentStatus,
  ReminderStatus,
  CommissionStatus,
} from '@prisma/client';
import { Ctx, requireBusiness } from '@/lib/auth/context';
import { calculateReceivableBalance, getDaysOverdue } from '@/lib/domain/receivable';

/**
 * Menghitung rentang waktu awal dan akhir bulan berjalan dalam Waktu Indonesia Barat (WIB / UTC+7).
 */
export function getWibMonthRange(date: Date = new Date()): {
  start: Date;
  end: Date;
  monthStr: string;
} {
  const wibTime = new Date(date.getTime() + 7 * 3_600_000);
  const year = wibTime.getUTCFullYear();
  const month = wibTime.getUTCMonth(); // 0-indexed

  // Awal bulan pukul 00:00:00 WIB -> UTC dikurangi 7 jam
  const start = new Date(Date.UTC(year, month, 1, 0, 0, 0) - 7 * 3_600_000);
  // Akhir bulan pukul 23:59:59.999 WIB
  const nextMonthStart = new Date(Date.UTC(year, month + 1, 1, 0, 0, 0) - 7 * 3_600_000);
  const end = new Date(nextMonthStart.getTime() - 1);

  const monthStr = `${year}-${String(month + 1).padStart(2, '0')}`;
  return { start, end, monthStr };
}

/**
 * Menghitung rentang waktu hari ini dalam Waktu Indonesia Barat (WIB / UTC+7).
 */
export function getWibDayRange(date: Date = new Date()): {
  start: Date;
  end: Date;
  dateStr: string;
} {
  const wibTime = new Date(date.getTime() + 7 * 3_600_000);
  const year = wibTime.getUTCFullYear();
  const month = wibTime.getUTCMonth();
  const day = wibTime.getUTCDate();

  const start = new Date(Date.UTC(year, month, day, 0, 0, 0) - 7 * 3_600_000);
  const nextDayStart = new Date(Date.UTC(year, month, day + 1, 0, 0, 0) - 7 * 3_600_000);
  const end = new Date(nextDayStart.getTime() - 1);

  const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  return { start, end, dateStr };
}

/**
 * Mengambil data ringkasan operasional dashboard berdasarkan role pengguna (Seksi 11 & 17.3 nomor 21).
 * - Super Admin: antrean approval, verifikasi pembayaran, stok minus, piutang overdue, omzet, HPP, profit, & leaderboard.
 * - Sales: fokus hari ini (pengingat, follow-up CRM, status order ditolak/menunggu, piutang customernya), capaian target, tanpa angka profit (Zero-Leakage).
 */
export async function getDashboardData(ctx: Ctx, now: Date = new Date()) {
  const businessId = requireBusiness(ctx);
  const monthRange = getWibMonthRange(now);
  const dayRange = getWibDayRange(now);

  if (ctx.user.role === Role.SUPERADMIN) {
    return getSuperAdminDashboard(businessId, monthRange, now);
  } else {
    return getSalesDashboard(businessId, ctx.user.id, monthRange, dayRange, now);
  }
}

/**
 * Dashboard Super Admin: Lengkap dengan profit, HPP, margin, stok minus, dan antrean persetujuan.
 */
async function getSuperAdminDashboard(
  businessId: string,
  monthRange: { start: Date; end: Date; monthStr: string },
  now: Date
) {
  const [
    pendingApprovalsCount,
    pendingApprovals,
    pendingPaymentsCount,
    pendingPayments,
    products,
    unassignedCustomersCount,
    monthlyOrders,
    unpaidInvoices,
    salesUsers,
  ] = await Promise.all([
    // 1. Antrean persetujuan order (PENDING_APPROVAL dan FINAL_PENDING_APPROVAL)
    prisma.order.count({
      where: {
        businessId,
        status: { in: [OrderStatus.PENDING_APPROVAL, OrderStatus.FINAL_PENDING_APPROVAL] },
        deletedAt: null,
      },
    }),
    prisma.order.findMany({
      where: {
        businessId,
        status: { in: [OrderStatus.PENDING_APPROVAL, OrderStatus.FINAL_PENDING_APPROVAL] },
        deletedAt: null,
      },
      select: {
        id: true,
        orderNo: true,
        grandTotal: true,
        hasBelowMin: true,
        belowMinReason: true,
        updatedAt: true,
        customer: { select: { id: true, name: true, code: true } },
      },
      orderBy: { updatedAt: 'desc' },
      take: 8,
    }),

    // 2. Pembayaran menunggu verifikasi
    prisma.payment.count({
      where: {
        businessId,
        status: PaymentStatus.PENDING_VERIFICATION,
      },
    }),
    prisma.payment.findMany({
      where: {
        businessId,
        status: PaymentStatus.PENDING_VERIFICATION,
      },
      select: {
        id: true,
        orderId: true,
        amount: true,
        method: true,
        proofPath: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 8,
    }),

    // 3. Data produk untuk deteksi stok minus & di bawah batas
    prisma.product.findMany({
      where: {
        businessId,
        isActive: true,
        deletedAt: null,
      },
      select: {
        id: true,
        name: true,
        sku: true,
        unit: true,
        stockQty: true,
        reservedQty: true,
        minStockAlert: true,
      },
    }),

    // 4. Peringatan pelanggan aktif tanpa staf sales (Seksi 18.1 nomor 17)
    prisma.customer.count({
      where: {
        businessId,
        assignedSalesId: null,
        deletedAt: null,
      },
    }),

    // 5. Pesanan bulan ini untuk perhitungan performa & laba rugi
    prisma.order.findMany({
      where: {
        businessId,
        deletedAt: null,
        status: {
          in: [
            OrderStatus.AWAITING_DP,
            OrderStatus.IN_PROCESS,
            OrderStatus.FINAL_PENDING_APPROVAL,
            OrderStatus.AWAITING_FINAL_PAYMENT,
            OrderStatus.COMPLETED,
          ],
        },
        createdAt: {
          gte: monthRange.start,
          lte: monthRange.end,
        },
      },
      select: {
        id: true,
        salesId: true,
        discountTotal: true,
        grandTotal: true,
        shippingCharge: true,
        items: {
          select: {
            qty: true,
            lineNet: true,
            costPrice: true,
          },
        },
      },
    }),

    // 6. Faktur belum lunas untuk umur piutang terlambat (APPROVED & jatuh tempo lewat)
    prisma.invoice.findMany({
      where: {
        businessId,
        deletedAt: null,
        status: InvoiceStatus.APPROVED,
        dueDate: { lt: now },
      },
      select: {
        id: true,
        orderId: true,
        number: true,
        amount: true,
        paidAmount: true,
        dueDate: true,
      },
      orderBy: { dueDate: 'asc' },
    }),

    // 7. Pengguna staf sales untuk leaderboard
    prisma.user.findMany({
      where: {
        businessId,
        role: Role.SALES,
        isActive: true,
        deletedAt: null,
      },
      select: { id: true, name: true },
    }),
  ]);

  // Ambil data order untuk pembayaran yang menunggu verifikasi
  const pendingPaymentOrderIds = pendingPayments.map((p) => p.orderId);
  const paymentOrders =
    pendingPaymentOrderIds.length > 0
      ? await prisma.order.findMany({
          where: {
            businessId,
            id: { in: pendingPaymentOrderIds },
          },
          select: {
            id: true,
            orderNo: true,
            customer: { select: { name: true } },
          },
        })
      : [];
  const paymentOrderMap = new Map(paymentOrders.map((o) => [o.id, o]));

  // Evaluasi stok minus & menipis
  const negativeStockProducts: Array<{
    id: string;
    name: string;
    sku: string;
    unit: string;
    stockQty: number;
    reservedQty: number;
    availableStock: number;
  }> = [];

  const lowStockProducts: Array<{
    id: string;
    name: string;
    sku: string;
    unit: string;
    stockQty: number;
    reservedQty: number;
    availableStock: number;
    minStockAlert: number;
  }> = [];

  for (const p of products) {
    const available = p.stockQty - p.reservedQty;
    if (available < 0) {
      negativeStockProducts.push({
        id: p.id,
        name: p.name,
        sku: p.sku,
        unit: p.unit,
        stockQty: p.stockQty,
        reservedQty: p.reservedQty,
        availableStock: available,
      });
    } else if (p.minStockAlert > 0 && available <= p.minStockAlert) {
      lowStockProducts.push({
        id: p.id,
        name: p.name,
        sku: p.sku,
        unit: p.unit,
        stockQty: p.stockQty,
        reservedQty: p.reservedQty,
        availableStock: available,
        minStockAlert: p.minStockAlert,
      });
    }
  }

  // Evaluasi piutang terlambat
  let totalOverdueAmount = 0n;
  const overdueList: Array<{
    invoiceId: string;
    orderId: string;
    invoiceNumber: string;
    overdueAmount: number;
    daysOverdue: number;
    dueDate: string;
  }> = [];

  for (const inv of unpaidInvoices) {
    const bal = calculateReceivableBalance({
      amount: inv.amount,
      paidAmount: inv.paidAmount,
    });
    if (bal > 0n) {
      totalOverdueAmount += bal;
      if (overdueList.length < 8) {
        overdueList.push({
          invoiceId: inv.id,
          orderId: inv.orderId,
          invoiceNumber: inv.number || 'INV-DRAFT',
          overdueAmount: Number(bal),
          daysOverdue: getDaysOverdue(inv.dueDate, now),
          dueDate: inv.dueDate ? inv.dueDate.toISOString() : '',
        });
      }
    }
  }

  // Agregasi metrik bulanan
  let monthlyGrossRevenue = 0n;
  let monthlyDiscountTotal = 0n;
  let monthlyNetRevenue = 0n;
  let monthlyCogs = 0n;

  const salesPerformanceMap = new Map<
    string,
    { revenue: bigint; profit: bigint; count: number }
  >();

  for (const ord of monthlyOrders) {
    let orderGoodsNet = 0n;
    let orderCogs = 0n;

    if (ord.items && ord.items.length > 0) {
      for (const it of ord.items) {
        orderGoodsNet += BigInt(it.lineNet);
        orderCogs += BigInt(it.costPrice) * BigInt(it.qty);
      }
    } else {
      orderGoodsNet = ord.grandTotal;
    }

    const orderProfit = orderGoodsNet - orderCogs;

    monthlyGrossRevenue += orderGoodsNet;
    monthlyDiscountTotal += ord.discountTotal;
    monthlyNetRevenue += ord.grandTotal;
    monthlyCogs += orderCogs;

    const current = salesPerformanceMap.get(ord.salesId) ?? {
      revenue: 0n,
      profit: 0n,
      count: 0,
    };
    current.revenue += ord.grandTotal;
    current.profit += orderProfit;
    current.count += 1;
    salesPerformanceMap.set(ord.salesId, current);
  }

  const monthlyNetProfit = monthlyGrossRevenue - monthlyCogs;
  const monthlyMarginBps =
    monthlyGrossRevenue > 0n
      ? Number((monthlyNetProfit * 10000n) / monthlyGrossRevenue)
      : 0;

  // Peringkat sales bulan ini
  const leaderboard = salesUsers
    .map((s) => {
      const perf = salesPerformanceMap.get(s.id) ?? {
        revenue: 0n,
        profit: 0n,
        count: 0,
      };
      return {
        salesId: s.id,
        salesName: s.name,
        revenue: Number(perf.revenue),
        profit: Number(perf.profit),
        orderCount: perf.count,
      };
    })
    .sort((a, b) => b.revenue - a.revenue);

  return {
    role: Role.SUPERADMIN,
    summary: {
      pendingApprovalsCount,
      pendingPaymentsCount,
      negativeStockCount: negativeStockProducts.length,
      lowStockCount: lowStockProducts.length,
      overdueInvoicesCount: overdueList.length,
      overdueAmount: Number(totalOverdueAmount),
      unassignedCustomersCount,
    },
    monthlyMetrics: {
      month: monthRange.monthStr,
      orderCount: monthlyOrders.length,
      grossRevenue: Number(monthlyGrossRevenue),
      discountTotal: Number(monthlyDiscountTotal),
      netRevenue: Number(monthlyNetRevenue),
      cogs: Number(monthlyCogs),
      netProfit: Number(monthlyNetProfit),
      marginBps: monthlyMarginBps,
    },
    actionItems: {
      pendingApprovals: pendingApprovals.map((o) => ({
        id: o.id,
        orderNo: o.orderNo || 'ORD-DRAFT',
        customerName: o.customer.name,
        grandTotal: Number(o.grandTotal),
        hasBelowMin: o.hasBelowMin,
        belowMinReason: o.belowMinReason,
        submittedAt: o.updatedAt.toISOString(),
      })),
      pendingPayments: pendingPayments.map((p) => {
        const ord = paymentOrderMap.get(p.orderId);
        return {
          id: p.id,
          orderId: p.orderId,
          orderNo: ord?.orderNo || 'ORD-DRAFT',
          customerName: ord?.customer?.name || 'Customer',
          amount: Number(p.amount),
          paymentMethod: p.method,
          proofPath: p.proofPath,
          createdAt: p.createdAt.toISOString(),
        };
      }),
      negativeStockProducts: negativeStockProducts.slice(0, 8),
      lowStockProducts: lowStockProducts.slice(0, 8),
      overdueInvoices: overdueList,
    },
    leaderboard,
  };
}

/**
 * Dashboard Staf Sales: Fokus pada aktivitas hari ini ("Hari Ini"), target sales, dan komisi.
 * STRICT ZERO-LEAKAGE: Tidak pernah membocorkan cogs, profit, margin, atau HPP (Seksi 11 & 17.4 a).
 */
async function getSalesDashboard(
  businessId: string,
  salesId: string,
  monthRange: { start: Date; end: Date; monthStr: string },
  dayRange: { start: Date; end: Date; dateStr: string },
  now: Date
) {
  const [
    todayReminders,
    todayTasks,
    myOrderApprovals,
    dueInvoices,
    monthlyOrders,
    salesTarget,
    commissionSummary,
    myCustomersCount,
    activeOrdersCount,
  ] = await Promise.all([
    // 1. Pengingat repeat order hari ini (ACTIVE dan due hari ini / lewat)
    prisma.reminder.findMany({
      where: {
        businessId,
        salesId,
        status: ReminderStatus.ACTIVE,
        OR: [
          { nextDueDate: { lte: dayRange.end } },
          { snoozedUntil: { lte: dayRange.end } },
        ],
      },
      select: {
        id: true,
        customerId: true,
        lastOrderDate: true,
        nextDueDate: true,
        intervalDays: true,
        note: true,
        customer: { select: { id: true, name: true, phone: true } },
      },
      orderBy: { nextDueDate: 'asc' },
      take: 10,
    }),

    // 2. Tugas CRM follow-up hari ini
    prisma.crmTask.findMany({
      where: {
        businessId,
        assignedToId: salesId,
        doneAt: null,
        dueAt: { lte: dayRange.end },
      },
      select: {
        id: true,
        customerId: true,
        title: true,
        dueAt: true,
        customer: { select: { id: true, name: true, phone: true } },
      },
      orderBy: { dueAt: 'asc' },
      take: 10,
    }),

    // 3. Status order saya yang menunggu persetujuan atau ditolak (REVISION_REQUIRED)
    prisma.order.findMany({
      where: {
        businessId,
        salesId,
        status: { in: [OrderStatus.PENDING_APPROVAL, OrderStatus.FINAL_PENDING_APPROVAL, OrderStatus.REVISION_REQUIRED] },
        deletedAt: null,
      },
      select: {
        id: true,
        orderNo: true,
        grandTotal: true,
        status: true,
        hasBelowMin: true,
        rejectReason: true,
        updatedAt: true,
        customer: { select: { id: true, name: true } },
      },
      orderBy: { updatedAt: 'desc' },
      take: 10,
    }),

    // 4. Tagihan / piutang pelanggan saya yang jatuh tempo hari ini atau terlambat
    prisma.invoice.findMany({
      where: {
        businessId,
        deletedAt: null,
        status: InvoiceStatus.APPROVED,
        dueDate: { lte: dayRange.end },
        customerId: {
          in: (
            await prisma.customer.findMany({
              where: { businessId, assignedSalesId: salesId, deletedAt: null },
              select: { id: true },
            })
          ).map((c) => c.id),
        },
      },
      select: {
        id: true,
        orderId: true,
        number: true,
        amount: true,
        paidAmount: true,
        dueDate: true,
      },
      orderBy: { dueDate: 'asc' },
      take: 10,
    }),

    // 5. Pesanan sales saya yang disetujui / berjalan bulan ini
    prisma.order.findMany({
      where: {
        businessId,
        salesId,
        deletedAt: null,
        status: {
          in: [
            OrderStatus.AWAITING_DP,
            OrderStatus.IN_PROCESS,
            OrderStatus.FINAL_PENDING_APPROVAL,
            OrderStatus.AWAITING_FINAL_PAYMENT,
            OrderStatus.COMPLETED,
          ],
        },
        createdAt: {
          gte: monthRange.start,
          lte: monthRange.end,
        },
      },
      select: {
        grandTotal: true,
      },
    }),

    // 6. Target bulanan sales
    prisma.salesTarget.findFirst({
      where: {
        businessId,
        salesId,
        month: monthRange.monthStr,
      },
      select: {
        targetRevenue: true,
      },
    }),

    // 7. Estimasi komisi bulan ini
    prisma.commissionEntry.aggregate({
      where: {
        businessId,
        salesId,
        earnedAt: {
          gte: monthRange.start,
          lte: monthRange.end,
        },
        status: { in: [CommissionStatus.EARNED, CommissionStatus.PAID] },
      },
      _sum: {
        amount: true,
      },
    }),

    // 8. Jumlah pelanggan aktif sales saya
    prisma.customer.count({
      where: {
        businessId,
        assignedSalesId: salesId,
        deletedAt: null,
      },
    }),

    // 9. Jumlah order yang sedang aktif berjalan
    prisma.order.count({
      where: {
        businessId,
        salesId,
        deletedAt: null,
        status: {
          in: [
            OrderStatus.PENDING_APPROVAL,
            OrderStatus.AWAITING_DP,
            OrderStatus.IN_PROCESS,
            OrderStatus.FINAL_PENDING_APPROVAL,
            OrderStatus.AWAITING_FINAL_PAYMENT,
          ],
        },
      },
    }),
  ]);

  // Hitung total omzet saya bulan ini
  let myRevenue = 0n;
  for (const o of monthlyOrders) {
    myRevenue += o.grandTotal;
  }

  const targetRevenue = salesTarget ? Number(salesTarget.targetRevenue) : null;
  const achievementPercent =
    targetRevenue && targetRevenue > 0
      ? Math.round((Number(myRevenue) / targetRevenue) * 100)
      : null;

  const estimatedCommission = Number(commissionSummary._sum.amount ?? 0n);

  // Format piutang customer saya
  const dueReceivablesList = dueInvoices
    .map((inv) => {
      const bal = calculateReceivableBalance({
        amount: inv.amount,
        paidAmount: inv.paidAmount,
      });
      return {
        invoiceId: inv.id,
        orderId: inv.orderId,
        invoiceNumber: inv.number || 'INV-DRAFT',
        balanceDue: Number(bal),
        dueDate: inv.dueDate ? inv.dueDate.toISOString() : '',
        daysOverdue: getDaysOverdue(inv.dueDate, now),
      };
    })
    .filter((inv) => inv.balanceDue > 0);

  return {
    role: Role.SALES,
    todayFocus: {
      remindersCount: todayReminders.length,
      tasksCount: todayTasks.length,
      approvalAlertsCount: myOrderApprovals.length,
      dueReceivablesCount: dueReceivablesList.length,
      reminders: todayReminders.map((r) => ({
        id: r.id,
        customerId: r.customerId,
        customerName: r.customer.name,
        customerPhone: r.customer.phone,
        intervalDays: r.intervalDays,
        lastOrderDate: r.lastOrderDate.toISOString(),
        nextDueDate: r.nextDueDate.toISOString(),
        note: r.note,
      })),
      tasks: todayTasks.map((t) => ({
        id: t.id,
        customerId: t.customerId,
        customerName: t.customer.name,
        customerPhone: t.customer.phone,
        title: t.title,
        dueAt: t.dueAt.toISOString(),
      })),
      orderApprovals: myOrderApprovals.map((o) => ({
        id: o.id,
        orderNo: o.orderNo || 'ORD-DRAFT',
        customerName: o.customer.name,
        grandTotal: Number(o.grandTotal),
        status: o.status,
        hasBelowMin: o.hasBelowMin,
        rejectReason: o.rejectReason,
        updatedAt: o.updatedAt.toISOString(),
      })),
      dueReceivables: dueReceivablesList,
    },
    performance: {
      month: monthRange.monthStr,
      revenue: Number(myRevenue),
      targetRevenue,
      achievementPercent,
      estimatedCommission,
      myCustomersCount,
      activeOrdersCount,
    },
  };
}
