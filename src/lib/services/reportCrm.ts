import { Role, PipelineStage, InteractionType, ReminderStatus } from '@prisma/client';
import { prisma } from '@/lib/db';
import { Ctx, requireBusiness } from '@/lib/auth/context';
import { getWibMonthRange } from '@/lib/services/dashboard';

export interface CrmReportQuery {
  month?: string; // YYYY-MM
  salesId?: string;
}

export interface CrmActivityItemDto {
  id: string;
  kind: 'INTERACTION' | 'TASK';
  date: string;
  customerId: string;
  customerName: string;
  salesId: string;
  salesName: string;
  type: string;
  summary: string;
  status?: string;
}

export interface CrmReportResult {
  month: string;
  salesId?: string;
  summary: {
    totalCustomers: number;
    conversionPercent: number;
    pipeline: {
      lead: number;
      prospect: number;
      deal: number;
      repeat: number;
      lost: number;
    };
    tasks: {
      total: number;
      pending: number;
      completed: number;
    };
    interactions: {
      total: number;
      call: number;
      visit: number;
      whatsapp: number;
      email: number;
      other: number;
    };
    reminders: {
      total: number;
      active: number;
      completed: number;
    };
  };
  recentActivities: CrmActivityItemDto[];
}

/**
 * Menghasilkan Laporan Aktivitas CRM & Pipeline (GET /reports/crm).
 *
 * Rujukan: Seksi 16.2 & Table 11 Dokumen Spesifikasi.
 * Super Admin melihat semua sales (atau filter salesId), Sales melihat miliknya sendiri.
 */
export async function getCrmReport(
  ctx: Ctx,
  query: CrmReportQuery = {}
): Promise<CrmReportResult> {
  const businessId = requireBusiness(ctx);

  // Batasi salesId jika pengguna adalah SALES (Zero-Leakage & Tenant Isolation)
  const effectiveSalesId =
    ctx.user.role === Role.SALES ? ctx.user.id : query.salesId || undefined;

  // Rentang bulan WIB
  let monthStr = query.month;
  let start: Date;
  let end: Date;

  if (monthStr && /^\d{4}-\d{2}$/.test(monthStr)) {
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

  // Query paralel dengan Prisma (seluruh query memuat businessId di level teratas)
  const [customers, tasks, interactions, reminders, salesUsers] = await Promise.all([
    prisma.customer.findMany({
      where: {
        businessId,
        deletedAt: null,
        ...(effectiveSalesId ? { assignedSalesId: effectiveSalesId } : {}),
      },
      select: {
        id: true,
        name: true,
        assignedSalesId: true,
        pipelineStage: true,
      },
    }),
    prisma.crmTask.findMany({
      where: {
        businessId,
        ...(effectiveSalesId ? { assignedToId: effectiveSalesId } : {}),
        dueAt: { gte: start, lte: end },
      },
      include: {
        customer: { select: { id: true, name: true } },
      },
      orderBy: { dueAt: 'desc' },
    }),
    prisma.crmInteraction.findMany({
      where: {
        businessId,
        ...(effectiveSalesId ? { salesId: effectiveSalesId } : {}),
        occurredAt: { gte: start, lte: end },
      },
      include: {
        customer: { select: { id: true, name: true } },
      },
      orderBy: { occurredAt: 'desc' },
    }),
    prisma.reminder.findMany({
      where: {
        businessId,
        ...(effectiveSalesId ? { salesId: effectiveSalesId } : {}),
      },
      select: {
        id: true,
        salesId: true,
        status: true,
      },
    }),
    prisma.user.findMany({
      where: { businessId, role: Role.SALES },
      select: { id: true, name: true },
    }),
  ]);

  const salesMap = new Map(salesUsers.map((s) => [s.id, s.name]));

  // Pipeline summary
  const pipeline = {
    lead: customers.filter((c) => c.pipelineStage === PipelineStage.LEAD).length,
    prospect: customers.filter((c) => c.pipelineStage === PipelineStage.PROSPECT).length,
    deal: customers.filter((c) => c.pipelineStage === PipelineStage.DEAL).length,
    repeat: customers.filter((c) => c.pipelineStage === PipelineStage.REPEAT).length,
    lost: customers.filter((c) => c.pipelineStage === PipelineStage.LOST).length,
  };

  const totalCustomers = customers.length;
  const conversionPercent =
    totalCustomers > 0
      ? Math.round(((pipeline.deal + pipeline.repeat) * 100) / totalCustomers)
      : 0;

  // Tasks summary
  const taskPending = tasks.filter((t) => t.doneAt === null).length;
  const taskCompleted = tasks.filter((t) => t.doneAt !== null).length;
  const tasksSummary = {
    total: tasks.length,
    pending: taskPending,
    completed: taskCompleted,
  };

  // Interactions summary
  const interactionsSummary = {
    total: interactions.length,
    call: interactions.filter((i) => i.type === InteractionType.CALL).length,
    visit: interactions.filter((i) => i.type === InteractionType.VISIT).length,
    whatsapp: interactions.filter((i) => i.type === InteractionType.WHATSAPP).length,
    email: interactions.filter((i) => i.type === InteractionType.EMAIL).length,
    other: interactions.filter((i) => i.type === InteractionType.OTHER).length,
  };

  // Reminders summary
  const remindersSummary = {
    total: reminders.length,
    active: reminders.filter((r) => r.status === ReminderStatus.ACTIVE).length,
    completed: reminders.filter((r) => r.status === ReminderStatus.DONE).length,
  };

  // Gabungkan aktivitas terbaru
  const activities: CrmActivityItemDto[] = [];

  for (const item of interactions) {
    activities.push({
      id: item.id,
      kind: 'INTERACTION',
      date: item.occurredAt.toISOString(),
      customerId: item.customerId,
      customerName: item.customer.name,
      salesId: item.salesId,
      salesName: salesMap.get(item.salesId) || 'Sales',
      type: item.type,
      summary: item.summary,
    });
  }

  for (const t of tasks) {
    activities.push({
      id: t.id,
      kind: 'TASK',
      date: t.dueAt.toISOString(),
      customerId: t.customerId,
      customerName: t.customer.name,
      salesId: t.assignedToId,
      salesName: salesMap.get(t.assignedToId) || 'Sales',
      type: 'TASK',
      summary: t.title,
      status: t.doneAt ? 'COMPLETED' : 'PENDING',
    });
  }

  // Urutkan dari aktivitas terbaru
  activities.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return {
    month: monthStr,
    salesId: effectiveSalesId,
    summary: {
      totalCustomers,
      conversionPercent,
      pipeline,
      tasks: tasksSummary,
      interactions: interactionsSummary,
      reminders: remindersSummary,
    },
    recentActivities: activities.slice(0, 100),
  };
}
