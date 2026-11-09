import { Role, InvoiceStatus, OrderStatus, Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { Ctx, requireBusiness } from '@/lib/auth/context';
import { DomainError } from '@/lib/domain/money';
import {
  AgingBucket,
  AGING_BUCKET_LABELS,
  getAgingBucket,
  getDaysOverdue,
  calculateReceivableBalance,
} from '@/lib/domain/receivable';

export interface ReceivablesAgingItemDto {
  invoiceId: string;
  invoiceNo: string;
  orderId: string;
  orderNo: string;
  customerId: string;
  customerName: string;
  salesId: string;
  salesName: string;
  amount: number;
  paidAmount: number;
  remainingAmount: number;
  issueDate: string;
  dueDate: string;
  daysOverdue: number;
  bucket: AgingBucket;
  bucketLabel: string;
  isOverdue: boolean;
}

export interface ReceivablesAgingBucketSummary {
  bucket: AgingBucket;
  label: string;
  count: number;
  totalRemaining: number;
  percentOfTotal: number;
  items: ReceivablesAgingItemDto[];
}

export interface ReceivablesAgingReportResult {
  asOfDate: string;
  summary: {
    totalReceivables: number;
    totalOverdue: number;
    totalInvoicesCount: number;
    overdueInvoicesCount: number;
  };
  buckets: Record<AgingBucket, ReceivablesAgingBucketSummary>;
  items: ReceivablesAgingItemDto[];
}

export interface ReceivablesAgingQuery {
  customerId?: string;
  salesId?: string;
}

/**
 * Menghasilkan Laporan Umur Piutang Usaha (GET /reports/receivables-aging).
 *
 * Rujukan: Seksi 13.3 Dokumen Spesifikasi.
 * Super Admin ONLY.
 */
export async function getReceivablesAgingReport(
  ctx: Ctx,
  query: ReceivablesAgingQuery = {}
): Promise<ReceivablesAgingReportResult> {
  if (ctx.user.role !== Role.SUPERADMIN) {
    throw new DomainError('FORBIDDEN', 'Hanya Super Admin yang berhak melihat laporan umur piutang', 403);
  }

  const businessId = requireBusiness(ctx);
  const now = new Date();

  // 1. Ambil order yang aktif (tidak CANCELLED)
  const orderWhere: Prisma.OrderWhereInput = {
    businessId,
    status: { not: OrderStatus.CANCELLED },
    deletedAt: null,
    ...(query.salesId ? { salesId: query.salesId } : {}),
    ...(query.customerId ? { customerId: query.customerId } : {}),
  };

  const orders = await prisma.order.findMany({
    where: orderWhere,
    select: {
      id: true,
      orderNo: true,
      salesId: true,
      customerId: true,
      customer: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });

  const orderMap = new Map(orders.map((o) => [o.id, o]));
  const orderIds = orders.map((o) => o.id);

  if (orderIds.length === 0) {
    const emptyBuckets = createEmptyBuckets();
    return {
      asOfDate: now.toISOString(),
      summary: {
        totalReceivables: 0,
        totalOverdue: 0,
        totalInvoicesCount: 0,
        overdueInvoicesCount: 0,
      },
      buckets: emptyBuckets,
      items: [],
    };
  }

  // 2. Ambil invoice APPROVED yang masih memiliki sisa tagihan
  const invoiceWhere: Prisma.InvoiceWhereInput = {
    businessId,
    status: InvoiceStatus.APPROVED,
    deletedAt: null,
    orderId: { in: orderIds },
    ...(query.customerId ? { customerId: query.customerId } : {}),
  };

  const [invoices, salesUsers] = await Promise.all([
    prisma.invoice.findMany({
      where: invoiceWhere,
      orderBy: { dueDate: 'asc' },
    }),
    prisma.user.findMany({
      where: { businessId, role: Role.SALES },
      select: { id: true, name: true },
    }),
  ]);

  const salesMap = new Map(salesUsers.map((s) => [s.id, s.name]));

  const buckets = createEmptyBuckets();
  const items: ReceivablesAgingItemDto[] = [];

  let totalReceivables = 0;
  let totalOverdue = 0;
  let overdueInvoicesCount = 0;

  for (const inv of invoices) {
    const balance = calculateReceivableBalance({
      amount: inv.amount,
      paidAmount: inv.paidAmount,
    });

    // Abaikan invoice yang sudah lunas (sisa = 0)
    if (balance <= 0n) continue;

    const remainingAmount = Number(balance);
    const ord = orderMap.get(inv.orderId);
    const dueDate = inv.dueDate;
    const bucket = getAgingBucket(dueDate, now);
    const daysOverdue = getDaysOverdue(dueDate, now);
    const isOverdue = bucket !== 'CURRENT';

    const itemDto: ReceivablesAgingItemDto = {
      invoiceId: inv.id,
      invoiceNo: inv.number || 'INV-DRAFT',
      orderId: inv.orderId,
      orderNo: ord?.orderNo || 'ORD-DRAFT',
      customerId: inv.customerId,
      customerName: ord?.customer?.name || 'Customer',
      salesId: ord?.salesId || '',
      salesName: (ord?.salesId ? salesMap.get(ord.salesId) : null) || 'Sales',
      amount: Number(inv.amount),
      paidAmount: Number(inv.paidAmount),
      remainingAmount,
      issueDate: inv.issueDate ? inv.issueDate.toISOString() : now.toISOString(),
      dueDate: dueDate ? dueDate.toISOString() : now.toISOString(),
      daysOverdue,
      bucket,
      bucketLabel: AGING_BUCKET_LABELS[bucket],
      isOverdue,
    };

    items.push(itemDto);
    buckets[bucket].items.push(itemDto);
    buckets[bucket].count += 1;
    buckets[bucket].totalRemaining += remainingAmount;

    totalReceivables += remainingAmount;
    if (isOverdue) {
      totalOverdue += remainingAmount;
      overdueInvoicesCount += 1;
    }
  }

  // Hitung persentase tiap bucket
  for (const b of Object.values(buckets)) {
    b.percentOfTotal =
      totalReceivables > 0
        ? Math.round((b.totalRemaining * 100) / totalReceivables)
        : 0;
  }

  return {
    asOfDate: now.toISOString(),
    summary: {
      totalReceivables,
      totalOverdue,
      totalInvoicesCount: items.length,
      overdueInvoicesCount,
    },
    buckets,
    items,
  };
}

function createEmptyBuckets(): Record<AgingBucket, ReceivablesAgingBucketSummary> {
  const allBuckets: AgingBucket[] = [
    'CURRENT',
    'DAYS_1_7',
    'DAYS_8_30',
    'DAYS_31_60',
    'DAYS_OVER_60',
  ];

  const record = {} as Record<AgingBucket, ReceivablesAgingBucketSummary>;
  for (const b of allBuckets) {
    record[b] = {
      bucket: b,
      label: AGING_BUCKET_LABELS[b],
      count: 0,
      totalRemaining: 0,
      percentOfTotal: 0,
      items: [],
    };
  }
  return record;
}
