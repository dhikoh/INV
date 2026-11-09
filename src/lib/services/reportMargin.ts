import { Role, OrderStatus, Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { Ctx, requireBusiness } from '@/lib/auth/context';
import { DomainError } from '@/lib/domain/money';
import { calcProfit } from '@/lib/domain/profit';
import { MarginReportQuery } from '@/lib/validation/report';

export interface MarginReportSummary {
  totalOrders: number;
  cancelledOrdersWithLossCount: number;
  goodsRevenue: number;
  shippingCharge: number;
  revenue: number;
  cogs: number;
  shippingActualCost: number;
  shippingSubsidy: number;
  extraCosts: number;
  cancellationLoss: number;
  profit: number;
  marginBps: number;
  from?: string;
  to?: string;
}

export interface MarginOrderRow {
  orderId: string;
  orderNo: string;
  orderDate: string;
  customerId: string;
  customerName: string;
  customerCode: string;
  salesId: string;
  salesName: string;
  status: OrderStatus;
  goodsRevenue: number;
  shippingCharge: number;
  revenue: number;
  cogs: number;
  shippingActualCost: number;
  shippingSubsidy: number;
  extraCosts: number;
  profit: number;
  marginBps: number;
  isCancellationLoss: boolean;
}

export interface MarginProductRow {
  productId: string;
  sku: string;
  name: string;
  unit: string;
  qtySold: number;
  grossRevenue: number;
  cogs: number;
  profit: number;
  marginBps: number;
}

export interface MarginSalesRow {
  salesId: string;
  salesName: string;
  orderCount: number;
  goodsRevenue: number;
  shippingCharge: number;
  revenue: number;
  cogs: number;
  shippingActualCost: number;
  extraCosts: number;
  cancellationLoss: number;
  profit: number;
  marginBps: number;
}

export interface MarginBusinessRow {
  businessId: string;
  businessName: string;
  orderCount: number;
  cancelledOrdersWithLossCount: number;
  goodsRevenue: number;
  shippingCharge: number;
  revenue: number;
  cogs: number;
  shippingActualCost: number;
  shippingSubsidy: number;
  extraCosts: number;
  cancellationLoss: number;
  profit: number;
  marginBps: number;
}

export type MarginReportItem =
  | MarginOrderRow
  | MarginProductRow
  | MarginSalesRow
  | MarginBusinessRow;

export interface MarginReportResult {
  groupBy: 'order' | 'product' | 'sales' | 'business';
  summary: MarginReportSummary;
  items: MarginReportItem[];
}

/**
 * Menghasilkan Laporan Margin dan Profitabilitas Usaha (Seksi 7.4, 9.2, 17.3 nomor 22, 18.1 nomor 33).
 *
 * Aturan Bisnis & Penjaminan Matematis (T5.2):
 * 1. Hak akses: Super Admin ONLY. Sales ditolak 403 Forbidden (Zero-Leakage).
 * 2. Order Aktif / Terealisasi: Menghitung omzet, HPP, ongkir, subsidi ongkir, biaya lain, profit, dan margin bps.
 * 3. Order Dibatalkan (CANCELLED): Dikeluarkan dari laporan omzet & HPP normal. Bila ada ongkir aktual atau biaya lain
 *    yang sudah keluar, dimasukkan sebagai baris "Kerugian pembatalan" dengan profit bernilai negatif (-loss).
 *    Order CANCELLED tanpa pengeluaran riil dikeluarkan total dari laporan.
 * 4. Invarian Laporan: Total profit laporan SAMA PERSIS dengan jumlah profit order pada laporan.
 */
export async function getMarginReport(
  ctx: Ctx,
  query: MarginReportQuery
): Promise<MarginReportResult> {
  if (ctx.user.role !== Role.SUPERADMIN) {
    throw new DomainError(
      'FORBIDDEN',
      'Hanya Super Admin yang berhak mengakses laporan margin dan profitabilitas usaha',
      403
    );
  }

  const businessId = requireBusiness(ctx);
  const groupBy = query.groupBy || 'order';

  // 1. Parsing filter rentang tanggal (WIB / UTC+7)
  let gteDate: Date | undefined;
  let lteDate: Date | undefined;

  if (query.from) {
    const d = new Date(query.from);
    if (!isNaN(d.getTime())) {
      // Set to 00:00:00 WIB
      const year = d.getUTCFullYear();
      const month = d.getUTCMonth();
      const day = d.getUTCDate();
      gteDate = new Date(Date.UTC(year, month, day, 0, 0, 0) - 7 * 3_600_000);
    }
  }

  if (query.to) {
    const d = new Date(query.to);
    if (!isNaN(d.getTime())) {
      // Set to 23:59:59.999 WIB
      const year = d.getUTCFullYear();
      const month = d.getUTCMonth();
      const day = d.getUTCDate();
      const nextDay = new Date(Date.UTC(year, month, day + 1, 0, 0, 0) - 7 * 3_600_000);
      lteDate = new Date(nextDay.getTime() - 1);
    }
  }

  // 2. Query Orders
  const orderWhere: Prisma.OrderWhereInput = {
    businessId,
    deletedAt: null,
    status: {
      in: [
        OrderStatus.AWAITING_DP,
        OrderStatus.IN_PROCESS,
        OrderStatus.FINAL_PENDING_APPROVAL,
        OrderStatus.AWAITING_FINAL_PAYMENT,
        OrderStatus.COMPLETED,
        OrderStatus.CANCELLED,
      ],
    },
  };

  if (gteDate || lteDate) {
    orderWhere.createdAt = {
      ...(gteDate ? { gte: gteDate } : {}),
      ...(lteDate ? { lte: lteDate } : {}),
    };
  }

  if (query.salesId) {
    orderWhere.salesId = query.salesId;
  }

  const [orders, businessRecord, salesUsers] = await Promise.all([
    prisma.order.findMany({
      where: orderWhere,
      include: {
        items: true,
        customer: {
          select: { id: true, name: true, code: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.business.findFirst({
      where: { id: businessId },
      select: { id: true, name: true },
    }),
    prisma.user.findMany({
      where: { businessId, role: Role.SALES },
      select: { id: true, name: true },
    }),
  ]);

  const salesUserMap = new Map(salesUsers.map((u) => [u.id, u.name]));
  const orderIds = orders.map((o) => o.id);

  // 3. Query relasi pendukung perhitungan profit
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

  // 4. Kalkulasi Data Tiap Order
  const processedOrders: MarginOrderRow[] = [];
  let summaryTotalOrders = 0;
  let summaryCancelledWithLossCount = 0;
  let summaryGoodsRevenue = 0;
  let summaryShippingCharge = 0;
  let summaryRevenue = 0;
  let summaryCogs = 0;
  let summaryShippingActualCost = 0;
  let summaryShippingSubsidy = 0;
  let summaryExtraCosts = 0;
  let summaryCancellationLoss = 0;
  let summaryProfit = 0;

  for (const ord of orders) {
    const isCancelled = ord.status === OrderStatus.CANCELLED;
    const shipment = shipmentMap.get(ord.id);
    const actualCost = Number(shipment?.actualCost ?? 0);
    const costs = (orderCostMap.get(ord.id) || []).map((c) => Number(c.amount));
    const extraTotal = costs.reduce((a, b) => a + b, 0);

    if (isCancelled) {
      // Seksi 9.2: Order dibatalkan dikeluarkan dari laporan omzet & HPP.
      // Ongkir aktual dan biaya lain yang sudah keluar tampil sebagai "Kerugian pembatalan".
      const loss = actualCost + extraTotal;
      if (loss <= 0) {
        // Order dibatalkan tanpa kerugian diabaikan sepenuhnya
        continue;
      }

      summaryCancelledWithLossCount += 1;
      summaryShippingActualCost += actualCost;
      summaryExtraCosts += extraTotal;
      summaryCancellationLoss += loss;
      summaryProfit -= loss;

      processedOrders.push({
        orderId: ord.id,
        orderNo: ord.orderNo || 'ORD-CANCELLED',
        orderDate: ord.orderDate.toISOString(),
        customerId: ord.customerId,
        customerName: ord.customer.name,
        customerCode: ord.customer.code,
        salesId: ord.salesId,
        salesName: salesUserMap.get(ord.salesId) || 'Sales',
        status: OrderStatus.CANCELLED,
        goodsRevenue: 0,
        shippingCharge: 0,
        revenue: 0,
        cogs: 0,
        shippingActualCost: actualCost,
        shippingSubsidy: 0,
        extraCosts: extraTotal,
        profit: -loss,
        marginBps: 0,
        isCancellationLoss: true,
      });
      continue;
    }

    // Filter opsional bila hanya ingin produk tertentu
    if (query.productId && !ord.items.some((i) => i.productId === query.productId)) {
      continue;
    }

    // Order aktif: Hitung profit lengkap sesuai Rumus 7.4
    const profitInput = {
      items: ord.items.map((i) => ({
        qty: i.qty,
        lineNet: Number(i.lineNet),
        costPrice: Number(i.costPrice),
        discountSource: i.discountSource as 'MANUAL' | 'PROMO' | 'SUBSIDY',
        lineDiscount: Number(i.lineDiscount),
      })),
      returns: (creditNoteMap.get(ord.id) || []).map((cn) => ({
        creditExPpn: Number(cn.amountExPpn),
        cogsReversed: Number(cn.cogsReversed ?? 0),
      })),
      shippingCharge: Number(ord.shippingCharge),
      shippingActualCost: actualCost,
      extraCosts: costs,
    };

    const profitRes = calcProfit(profitInput);

    summaryTotalOrders += 1;
    summaryGoodsRevenue += profitRes.goodsRevenue;
    summaryShippingCharge += Number(ord.shippingCharge);
    summaryRevenue += profitRes.revenue;
    summaryCogs += profitRes.cogs;
    summaryShippingActualCost += profitRes.shippingActualCost;
    summaryShippingSubsidy += profitRes.shippingSubsidy;
    summaryExtraCosts += profitRes.extraCosts;
    summaryProfit += profitRes.profit;

    processedOrders.push({
      orderId: ord.id,
      orderNo: ord.orderNo || 'ORD-DRAFT',
      orderDate: ord.orderDate.toISOString(),
      customerId: ord.customerId,
      customerName: ord.customer.name,
      customerCode: ord.customer.code,
      salesId: ord.salesId,
      salesName: salesUserMap.get(ord.salesId) || 'Sales',
      status: ord.status,
      goodsRevenue: profitRes.goodsRevenue,
      shippingCharge: Number(ord.shippingCharge),
      revenue: profitRes.revenue,
      cogs: profitRes.cogs,
      shippingActualCost: profitRes.shippingActualCost,
      shippingSubsidy: profitRes.shippingSubsidy,
      extraCosts: profitRes.extraCosts,
      profit: profitRes.profit,
      marginBps: profitRes.marginBps,
      isCancellationLoss: false,
    });
  }

  const summaryMarginBps =
    summaryRevenue > 0 ? Math.round((summaryProfit * 10000) / summaryRevenue) : 0;

  const summary: MarginReportSummary = {
    totalOrders: summaryTotalOrders,
    cancelledOrdersWithLossCount: summaryCancelledWithLossCount,
    goodsRevenue: summaryGoodsRevenue,
    shippingCharge: summaryShippingCharge,
    revenue: summaryRevenue,
    cogs: summaryCogs,
    shippingActualCost: summaryShippingActualCost,
    shippingSubsidy: summaryShippingSubsidy,
    extraCosts: summaryExtraCosts,
    cancellationLoss: summaryCancellationLoss,
    profit: summaryProfit,
    marginBps: summaryMarginBps,
    from: query.from,
    to: query.to,
  };

  // 5. Transformasi berdasarkan GroupBy
  let items: MarginReportItem[] = [];

  if (groupBy === 'order') {
    items = processedOrders;
  } else if (groupBy === 'product') {
    // Agregasi per produk (hanya dari order aktif)
    const productMap = new Map<
      string,
      {
        productId: string;
        sku: string;
        name: string;
        unit: string;
        qtySold: number;
        grossRevenue: number;
        cogs: number;
      }
    >();

    for (const ord of orders) {
      if (ord.status === OrderStatus.CANCELLED) continue;

      for (const item of ord.items) {
        if (query.productId && item.productId !== query.productId) continue;

        const current = productMap.get(item.productId) ?? {
          productId: item.productId,
          sku: item.sku,
          name: item.productName,
          unit: item.unit,
          qtySold: 0,
          grossRevenue: 0,
          cogs: 0,
        };

        current.qtySold += item.qty;
        current.grossRevenue += Number(item.lineNet);
        current.cogs += Number(item.costPrice) * item.qty;
        productMap.set(item.productId, current);
      }
    }

    items = Array.from(productMap.values())
      .map((p) => {
        const profit = p.grossRevenue - p.cogs;
        const marginBps =
          p.grossRevenue > 0 ? Math.round((profit * 10000) / p.grossRevenue) : 0;
        return {
          productId: p.productId,
          sku: p.sku,
          name: p.name,
          unit: p.unit,
          qtySold: p.qtySold,
          grossRevenue: p.grossRevenue,
          cogs: p.cogs,
          profit,
          marginBps,
        };
      })
      .sort((a, b) => b.profit - a.profit);
  } else if (groupBy === 'sales') {
    // Agregasi per staf sales
    const salesMap = new Map<
      string,
      {
        salesId: string;
        salesName: string;
        orderCount: number;
        goodsRevenue: number;
        shippingCharge: number;
        revenue: number;
        cogs: number;
        shippingActualCost: number;
        extraCosts: number;
        cancellationLoss: number;
        profit: number;
      }
    >();

    for (const row of processedOrders) {
      const current = salesMap.get(row.salesId) ?? {
        salesId: row.salesId,
        salesName: row.salesName,
        orderCount: 0,
        goodsRevenue: 0,
        shippingCharge: 0,
        revenue: 0,
        cogs: 0,
        shippingActualCost: 0,
        extraCosts: 0,
        cancellationLoss: 0,
        profit: 0,
      };

      if (!row.isCancellationLoss) {
        current.orderCount += 1;
        current.goodsRevenue += row.goodsRevenue;
        current.shippingCharge += row.shippingCharge;
        current.revenue += row.revenue;
        current.cogs += row.cogs;
        current.shippingActualCost += row.shippingActualCost;
        current.extraCosts += row.extraCosts;
        current.profit += row.profit;
      } else {
        current.shippingActualCost += row.shippingActualCost;
        current.extraCosts += row.extraCosts;
        current.cancellationLoss += -row.profit;
        current.profit += row.profit; // profit is negative (-loss)
      }

      salesMap.set(row.salesId, current);
    }

    items = Array.from(salesMap.values())
      .map((s) => ({
        ...s,
        marginBps: s.revenue > 0 ? Math.round((s.profit * 10000) / s.revenue) : 0,
      }))
      .sort((a, b) => b.revenue - a.revenue);
  } else if (groupBy === 'business') {
    // Ringkasan per unit usaha
    const businessRow: MarginBusinessRow = {
      businessId,
      businessName: businessRecord?.name || 'Unit Usaha',
      orderCount: summaryTotalOrders,
      cancelledOrdersWithLossCount: summaryCancelledWithLossCount,
      goodsRevenue: summaryGoodsRevenue,
      shippingCharge: summaryShippingCharge,
      revenue: summaryRevenue,
      cogs: summaryCogs,
      shippingActualCost: summaryShippingActualCost,
      shippingSubsidy: summaryShippingSubsidy,
      extraCosts: summaryExtraCosts,
      cancellationLoss: summaryCancellationLoss,
      profit: summaryProfit,
      marginBps: summaryMarginBps,
    };
    items = [businessRow];
  }

  return {
    groupBy,
    summary,
    items,
  };
}
