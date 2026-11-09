import { withApi } from '@/lib/api/withApi';
import { Role } from '@prisma/client';
import { AuditLogQuerySchema } from '@/lib/validation/audit';
import { getAuditLogs } from '@/lib/services/auditLogService';

export const GET = withApi(
  {
    roles: [Role.SUPERADMIN],
    query: AuditLogQuerySchema,
  },
  async ({ ctx, query }) => {
    const data = await getAuditLogs(ctx, query);
    return { data };
  }
);

