import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { Role } from '@prisma/client';
import * as contextModule from '@/lib/auth/context';
import { GET as getAuditLogsHandler } from '@/app/api/v1/audit-logs/route';
import { resetUserRateLimits } from '@/lib/auth/rateLimit';
import nextConfig from '@/../next.config';

// Mock Prisma
const mockAuditLogs: Array<{
  id: string;
  businessId: string | null;
  actorId: string | null;
  actorRole: Role | null;
  action: string;
  entityType: string;
  entityId: string;
  summary: string | null;
  before: any;
  after: any;
  reason: string | null;
  ip: string | null;
  createdAt: Date;
}> = [];

const mockUsers: Array<{
  id: string;
  name: string;
  username: string;
  role: Role;
}> = [];

vi.mock('@/lib/db', () => ({
  prisma: {
    auditLog: {
      count: vi.fn(async ({ where }: { where: Record<string, any> }) => {
        return mockAuditLogs.filter((log) => {
          if (where.businessId && log.businessId !== where.businessId) return false;
          if (where.action && log.action !== where.action) return false;
          if (where.entityType && log.entityType !== where.entityType) return false;
          if (where.entityId && log.entityId !== where.entityId) return false;
          if (where.actorId && log.actorId !== where.actorId) return false;
          if (where.createdAt?.gte && log.createdAt < where.createdAt.gte) return false;
          if (where.createdAt?.lte && log.createdAt > where.createdAt.lte) return false;
          if (where.OR && Array.isArray(where.OR)) {
            const matchesOr = where.OR.some((cond: any) => {
              if (cond.summary?.contains && log.summary?.toLowerCase().includes(cond.summary.contains.toLowerCase())) return true;
              if (cond.entityId?.contains && log.entityId.toLowerCase().includes(cond.entityId.contains.toLowerCase())) return true;
              if (cond.reason?.contains && log.reason?.toLowerCase().includes(cond.reason.contains.toLowerCase())) return true;
              if (cond.action?.contains && log.action.toLowerCase().includes(cond.action.contains.toLowerCase())) return true;
              return false;
            });
            if (!matchesOr) return false;
          }
          return true;
        }).length;
      }),
      findMany: vi.fn(async ({ where, skip = 0, take = 20 }: { where: Record<string, any>; skip?: number; take?: number }) => {
        return mockAuditLogs
          .filter((log) => {
            if (where.businessId && log.businessId !== where.businessId) return false;
            if (where.action && log.action !== where.action) return false;
            if (where.entityType && log.entityType !== where.entityType) return false;
            if (where.entityId && log.entityId !== where.entityId) return false;
            if (where.actorId && log.actorId !== where.actorId) return false;
            if (where.createdAt?.gte && log.createdAt < where.createdAt.gte) return false;
            if (where.createdAt?.lte && log.createdAt > where.createdAt.lte) return false;
            if (where.OR && Array.isArray(where.OR)) {
              const matchesOr = where.OR.some((cond: any) => {
                if (cond.summary?.contains && log.summary?.toLowerCase().includes(cond.summary.contains.toLowerCase())) return true;
                if (cond.entityId?.contains && log.entityId.toLowerCase().includes(cond.entityId.contains.toLowerCase())) return true;
                if (cond.reason?.contains && log.reason?.toLowerCase().includes(cond.reason.contains.toLowerCase())) return true;
                if (cond.action?.contains && log.action.toLowerCase().includes(cond.action.contains.toLowerCase())) return true;
                return false;
              });
              if (!matchesOr) return false;
            }
            return true;
          })
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
          .slice(skip, skip + take);
      }),
    },
    user: {
      findMany: vi.fn(async ({ where }: { where: Record<string, any> }) => {
        if (where?.id?.in) {
          return mockUsers.filter((u) => where.id.in.includes(u.id));
        }
        return mockUsers;
      }),
    },
  },
}));

describe('T5.5: Audit Trail, Pengerasan Keamanan & Header CSP (Seksi 14, 16.1, 16.4, 16.5)', () => {
  const APP_URL = 'http://localhost:3000';
  const BIZ_ID = 'biz_audit_test';
  const SA_ID = 'sa_user_01';
  const SALES_ID = 'sales_user_01';

  const superAdminCtx = {
    user: {
      id: SA_ID,
      name: 'Owner Usaha',
      username: 'owner',
      role: Role.SUPERADMIN,
      businessId: BIZ_ID,
      mustChangePassword: false,
    },
    role: Role.SUPERADMIN,
    businessId: BIZ_ID,
    sessionId: 'sess_sa',
    ip: '192.168.1.100',
  };

  beforeEach(() => {
    resetUserRateLimits();
    mockUsers.length = 0;
    mockAuditLogs.length = 0;

    mockUsers.push(
      { id: SA_ID, name: 'Owner Usaha', username: 'owner', role: Role.SUPERADMIN },
      { id: SALES_ID, name: 'Sales Lapangan', username: 'sales01', role: Role.SALES }
    );

    mockAuditLogs.push(
      {
        id: 'aud_1',
        businessId: BIZ_ID,
        actorId: SA_ID,
        actorRole: Role.SUPERADMIN,
        action: 'ORDER_SUBMIT',
        entityType: 'Order',
        entityId: 'ord_1001',
        summary: 'Mengajukan order ORD-001',
        before: { status: 'DRAFT' },
        after: { status: 'PENDING_APPROVAL' },
        reason: 'Order reguler pelanggan lama',
        ip: '192.168.1.100',
        createdAt: new Date('2026-11-01T10:00:00Z'),
      },
      {
        id: 'aud_2',
        businessId: BIZ_ID,
        actorId: SA_ID,
        actorRole: Role.SUPERADMIN,
        action: 'INVOICE_APPROVE',
        entityType: 'Invoice',
        entityId: 'inv_2001',
        summary: 'Menyetujui invoice DP',
        before: { status: 'DRAFT', approvedAt: null },
        after: { status: 'APPROVED', approvedAt: '2026-11-01T11:00:00Z' },
        reason: null,
        ip: '192.168.1.100',
        createdAt: new Date('2026-11-01T11:00:00Z'),
      },
      {
        id: 'aud_3',
        businessId: BIZ_ID,
        actorId: SALES_ID,
        actorRole: Role.SALES,
        action: 'PRICE_CHANGE',
        entityType: 'Product',
        entityId: 'prod_99',
        summary: 'Ubah harga minimal customer',
        before: { minPrice: 15000 },
        after: { minPrice: 14000 },
        reason: 'Permintaan diskon kuantitas besar',
        ip: '203.0.113.50',
        createdAt: new Date('2026-11-02T08:30:00Z'),
      }
    );
  });

  describe('1. GET /api/v1/audit-logs (Audit Trail API)', () => {
    it('mengembalikan daftar log mutasi lengkap dengan informasi actor, pagination, dan snapshot before/after', async () => {
      vi.spyOn(contextModule, 'requireContext').mockResolvedValue(superAdminCtx as any);

      const req = new NextRequest(`${APP_URL}/api/v1/audit-logs?page=1&limit=10`, {
        method: 'GET',
        headers: { origin: APP_URL },
      });

      const res = await getAuditLogsHandler(req);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.ok).toBe(true);
      expect(json.data.total).toBe(3);
      expect(json.data.page).toBe(1);
      expect(json.data.limit).toBe(10);
      expect(json.data.totalPages).toBe(1);
      expect(json.data.items).toHaveLength(3);

      // Pastikan urutan terbaru di atas
      const first = json.data.items[0];
      expect(first.id).toBe('aud_3');
      expect(first.action).toBe('PRICE_CHANGE');
      expect(first.actor?.name).toBe('Sales Lapangan');
      expect(first.actor?.username).toBe('sales01');
      expect(first.before).toEqual({ minPrice: 15000 });
      expect(first.after).toEqual({ minPrice: 14000 });
    });

    it('mendukung penyaringan berdasarkan action dan entityType', async () => {
      vi.spyOn(contextModule, 'requireContext').mockResolvedValue(superAdminCtx as any);

      const req = new NextRequest(
        `${APP_URL}/api/v1/audit-logs?action=ORDER_SUBMIT&entityType=Order`,
        {
          method: 'GET',
          headers: { origin: APP_URL },
        }
      );

      const res = await getAuditLogsHandler(req);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.ok).toBe(true);
      expect(json.data.total).toBe(1);
      expect(json.data.items[0].action).toBe('ORDER_SUBMIT');
      expect(json.data.items[0].entityType).toBe('Order');
    });

    it('mendukung pencarian teks (q) pada summary, entityId, atau reason', async () => {
      vi.spyOn(contextModule, 'requireContext').mockResolvedValue(superAdminCtx as any);

      const req = new NextRequest(`${APP_URL}/api/v1/audit-logs?q=diskon`, {
        method: 'GET',
        headers: { origin: APP_URL },
      });

      const res = await getAuditLogsHandler(req);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.ok).toBe(true);
      expect(json.data.total).toBe(1);
      expect(json.data.items[0].id).toBe('aud_3');
      expect(json.data.items[0].reason).toContain('diskon');
    });
  });

  describe('2. Header Keamanan & Kebijakan CSP (Seksi 16.4)', () => {
    it('memastikan konfigurasi next.config.ts menyematkan seluruh header keamanan wajib', async () => {
      expect(nextConfig.headers).toBeDefined();
      if (!nextConfig.headers) return;

      const headerGroups = await nextConfig.headers();
      const globalHeaderGroup = headerGroups.find((g: any) => g.source === '/:path*');
      expect(globalHeaderGroup).toBeDefined();

      const headers = globalHeaderGroup?.headers || [];
      const headerMap = new Map(headers.map((h: any) => [h.key.toLowerCase(), h.value]));

      // 1. Strict-Transport-Security
      expect(headerMap.get('strict-transport-security')).toContain('max-age=31536000');

      // 2. X-Content-Type-Options: nosniff
      expect(headerMap.get('x-content-type-options')).toBe('nosniff');

      // 3. Referrer-Policy: strict-origin-when-cross-origin
      expect(headerMap.get('referrer-policy')).toBe('strict-origin-when-cross-origin');

      // 4. Permissions-Policy: camera=(), microphone=(), geolocation=()
      expect(headerMap.get('permissions-policy')).toContain('camera=()');
      expect(headerMap.get('permissions-policy')).toContain('microphone=()');
      expect(headerMap.get('permissions-policy')).toContain('geolocation=()');

      // 5. Content-Security-Policy dengan frame-ancestors Telegram
      const csp = headerMap.get('content-security-policy') || '';
      expect(csp).toContain("default-src 'self'");
      expect(csp).toContain('https://telegram.org');
      expect(csp).toContain("frame-ancestors 'self' https://web.telegram.org https://webk.telegram.org https://webz.telegram.org");

      // 6. Larangan X-Frame-Options (Seksi 16.4: tidak boleh disetel karena bertabrakan dengan frame-ancestors)
      expect(headerMap.has('x-frame-options')).toBe(false);
    });
  });
});

