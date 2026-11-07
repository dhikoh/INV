import { Prisma, Role } from '@prisma/client';
import { Ctx } from '../auth/context';
import { fromDb } from '../domain/money';

export interface AuditEvent {
  action: string;
  entityType: string;
  entityId: string;
  businessId?: string | null;
  summary?: string;
  before?: unknown;
  after?: unknown;
  reason?: string;
}

const SENSITIVE_KEYS = new Set([
  'password',
  'passwordHash',
  'token',
  'tokenHash',
  'initData',
  'secret',
]);

// Ubah BigInt menjadi number, Date menjadi ISO string, dan HAPUS kunci passwordHash dan tokenHash secara rekursif
export function toJsonSafe(v: unknown): unknown {
  if (v === null || v === undefined) {
    return v;
  }
  if (typeof v === 'bigint') {
    return fromDb(v);
  }
  if (v instanceof Date) {
    return v.toISOString();
  }
  if (Array.isArray(v)) {
    return v.map(toJsonSafe);
  }
  if (typeof v === 'object') {
    const entries = Object.entries(v as Record<string, unknown>)
      .filter(([key]) => !SENSITIVE_KEYS.has(key))
      .map(([k, val]) => [k, toJsonSafe(val)]);
    return Object.fromEntries(entries);
  }
  return v;
}

export type AuditClient = {
  auditLog: {
    create: (args: {
      data: {
        businessId: string | null;
        actorId: string | null;
        actorRole: Role | null;
        action: string;
        entityType: string;
        entityId: string;
        summary?: string | null;
        before?: Prisma.InputJsonValue;
        after?: Prisma.InputJsonValue;
        reason?: string | null;
        ip?: string | null;
      };
    }) => Promise<unknown>;
  };
};

export async function audit(
  tx: AuditClient,
  ctx: Ctx,
  e: AuditEvent
): Promise<void> {
  await tx.auditLog.create({
    data: {
      businessId: e.businessId !== undefined ? e.businessId : ctx.businessId,
      actorId: ctx.user.id,
      actorRole: ctx.role,
      action: e.action,
      entityType: e.entityType,
      entityId: e.entityId,
      summary: e.summary ?? null,
      before:
        e.before === undefined
          ? undefined
          : (toJsonSafe(e.before) as Prisma.InputJsonValue),
      after:
        e.after === undefined
          ? undefined
          : (toJsonSafe(e.after) as Prisma.InputJsonValue),
      reason: e.reason ?? null,
      ip: ctx.ip,
    },
  });
}
