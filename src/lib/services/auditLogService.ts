import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { Ctx, requireBusiness } from '@/lib/auth/context';

export interface AuditLogActor {
  id: string;
  name: string;
  username: string;
  role: string;
}

export interface AuditLogRow {
  id: string;
  businessId: string | null;
  actorId: string | null;
  actorRole: string | null;
  actor: AuditLogActor | null;
  action: string;
  entityType: string;
  entityId: string;
  summary: string | null;
  before: unknown;
  after: unknown;
  reason: string | null;
  ip: string | null;
  createdAt: string;
}

export interface AuditLogListResult {
  items: AuditLogRow[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface AuditLogFilterParams {
  page?: number;
  limit?: number;
  action?: string;
  entityType?: string;
  entityId?: string;
  actorId?: string;
  from?: string;
  to?: string;
  q?: string;
}

export async function getAuditLogs(
  ctx: Ctx,
  query: AuditLogFilterParams
): Promise<AuditLogListResult> {
  const businessId = requireBusiness(ctx);
  const page = query.page && query.page >= 1 ? query.page : 1;
  const limit = query.limit && query.limit >= 1 ? query.limit : 20;

  const where: Prisma.AuditLogWhereInput = {
    businessId,
  };

  if (query.action) {
    where.action = query.action;
  }

  if (query.entityType) {
    where.entityType = query.entityType;
  }

  if (query.entityId) {
    where.entityId = query.entityId;
  }

  if (query.actorId) {
    where.actorId = query.actorId;
  }

  if (query.from || query.to) {
    const createdAtFilter: Prisma.DateTimeFilter = {};
    if (query.from) {
      const fromDate = new Date(query.from);
      if (!isNaN(fromDate.getTime())) {
        createdAtFilter.gte = fromDate;
      }
    }
    if (query.to) {
      const toDate = new Date(query.to);
      if (!isNaN(toDate.getTime())) {
        createdAtFilter.lte = toDate;
      }
    }
    where.createdAt = createdAtFilter;
  }

  if (query.q) {
    where.OR = [
      { summary: { contains: query.q, mode: 'insensitive' } },
      { entityId: { contains: query.q, mode: 'insensitive' } },
      { reason: { contains: query.q, mode: 'insensitive' } },
      { action: { contains: query.q, mode: 'insensitive' } },
    ];
  }

  const skip = (page - 1) * limit;
  const take = limit;

  const [total, rawLogs] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    }),
  ]);

  // Lookup actor info
  const actorIds = Array.from(
    new Set(rawLogs.map((l) => l.actorId).filter((id): id is string => Boolean(id)))
  );

  const users = actorIds.length > 0
    ? await prisma.user.findMany({
        where: { id: { in: actorIds } },
        select: { id: true, name: true, username: true, role: true },
      })
    : [];

  const userMap = new Map(users.map((u) => [u.id, u]));

  const items: AuditLogRow[] = rawLogs.map((l) => ({
    id: l.id,
    businessId: l.businessId,
    actorId: l.actorId,
    actorRole: l.actorRole,
    actor: l.actorId ? userMap.get(l.actorId) || null : null,
    action: l.action,
    entityType: l.entityType,
    entityId: l.entityId,
    summary: l.summary,
    before: l.before,
    after: l.after,
    reason: l.reason,
    ip: l.ip,
    createdAt: l.createdAt.toISOString(),
  }));

  const totalPages = Math.ceil(total / limit) || 1;

  return {
    items,
    total,
    page,
    limit,
    totalPages,
  };
}
