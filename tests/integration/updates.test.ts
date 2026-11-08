import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import {
  GET as getUpdatesHandler,
  POST as createUpdateHandler,
} from '@/app/api/v1/updates/route';
import { GET as getUnreadCountHandler } from '@/app/api/v1/updates/unread-count/route';
import { POST as markSeenHandler } from '@/app/api/v1/updates/mark-seen/route';
import {
  GET as getUpdateDetailHandler,
  PATCH as updateUpdateHandler,
  DELETE as deleteUpdateHandler,
} from '@/app/api/v1/updates/[id]/route';
import { POST as publishUpdateHandler } from '@/app/api/v1/updates/[id]/publish/route';
import { Role } from '@prisma/client';
import { DomainError } from '@/lib/domain/money';
import * as contextModule from '@/lib/auth/context';

interface MockReleaseNote {
  id: string;
  version: string;
  title: string;
  bodyMarkdown: string;
  createdById: string;
  publishedAt: Date | null;
  broadcastAt: Date | null;
  createdAt: Date;
}

interface MockUser {
  id: string;
  username: string;
  role: Role;
  name: string;
  lastSeenReleaseAt: Date | null;
}

interface MockAuditLog {
  id: string;
  actorId: string | null;
  action: string;
  entityType: string;
  entityId: string;
  summary: string | null;
}

let notes: MockReleaseNote[] = [];
let users: MockUser[] = [];
let auditLogs: MockAuditLog[] = [];

vi.mock('@/lib/db', () => ({
  prisma: {
    releaseNote: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
        return notes.find((n) => n.id === where.id) || null;
      }),
      findMany: vi.fn(
        async ({
          where,
        }: {
          where?: { publishedAt?: { not?: null } };
          orderBy?: unknown;
        }) => {
          let res = [...notes];
          if (where?.publishedAt && 'not' in where.publishedAt) {
            res = res.filter((n) => n.publishedAt !== null);
          }
          // urutkan createdAt desc
          return res.sort(
            (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
          );
        }
      ),
      count: vi.fn(
        async ({
          where,
        }: {
          where?: { publishedAt?: { not?: null; gt?: Date } };
        }) => {
          let res = notes.filter((n) => n.publishedAt !== null);
          if (where?.publishedAt?.gt) {
            const threshold = where.publishedAt.gt;
            res = res.filter(
              (n) => n.publishedAt && n.publishedAt.getTime() > threshold.getTime()
            );
          }
          return res.length;
        }
      ),
      create: vi.fn(
        async ({
          data,
        }: {
          data: {
            version: string;
            title: string;
            bodyMarkdown: string;
            createdById: string;
            publishedAt?: Date | null;
          };
        }) => {
          const item: MockReleaseNote = {
            id: `note_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
            version: data.version,
            title: data.title,
            bodyMarkdown: data.bodyMarkdown,
            createdById: data.createdById,
            publishedAt: data.publishedAt ?? null,
            broadcastAt: null,
            createdAt: new Date(),
          };
          notes.push(item);
          return item;
        }
      ),
      update: vi.fn(
        async ({
          where,
          data,
        }: {
          where: { id: string };
          data: Partial<MockReleaseNote>;
        }) => {
          const note = notes.find((n) => n.id === where.id);
          if (!note) throw new Error('ReleaseNote not found');
          Object.assign(note, data);
          return note;
        }
      ),
      delete: vi.fn(async ({ where }: { where: { id: string } }) => {
        const idx = notes.findIndex((n) => n.id === where.id);
        if (idx !== -1) {
          notes.splice(idx, 1);
        }
        return { id: where.id };
      }),
    },
    user: {
      findUnique: vi.fn(
        async ({
          where,
        }: {
          where: { id: string };
          select?: { lastSeenReleaseAt: boolean };
        }) => {
          return users.find((u) => u.id === where.id) || null;
        }
      ),
      update: vi.fn(
        async ({
          where,
          data,
        }: {
          where: { id: string };
          data: { lastSeenReleaseAt: Date };
        }) => {
          const u = users.find((item) => item.id === where.id);
          if (!u) throw new Error('User not found');
          u.lastSeenReleaseAt = data.lastSeenReleaseAt;
          return u;
        }
      ),
    },
    auditLog: {
      create: vi.fn(
        async ({
          data,
        }: {
          data: {
            actorId: string | null;
            action: string;
            entityType: string;
            entityId: string;
            summary?: string | null;
          };
        }) => {
          const item: MockAuditLog = {
            id: `audit_${Date.now()}`,
            actorId: data.actorId,
            action: data.action,
            entityType: data.entityType,
            entityId: data.entityId,
            summary: data.summary ?? null,
          };
          auditLogs.push(item);
          return item;
        }
      ),
    },
  },
}));

describe('Catatan Pembaruan / Updates (T1.8 & Seksi 4.3)', () => {
  const APP_URL = 'http://localhost:3000';

  const superAdminCtx = {
    user: {
      id: 'super_admin_id',
      username: 'owner',
      role: Role.SUPERADMIN,
      name: 'Super Administrator',
      businessId: null,
    },
    sessionId: 'sess_admin_1',
    role: Role.SUPERADMIN,
    businessId: 'biz_1',
    ip: '127.0.0.1',
  };

  const salesCtx = {
    user: {
      id: 'sales_user_id',
      username: 'salesbudi',
      role: Role.SALES,
      name: 'Sales Budi',
      businessId: 'biz_1',
    },
    sessionId: 'sess_sales_1',
    role: Role.SALES,
    businessId: 'biz_1',
    ip: '127.0.0.1',
  };

  let activeCtx: contextModule.Ctx = superAdminCtx;

  beforeEach(() => {
    notes = [];
    users = [
      {
        id: 'super_admin_id',
        username: 'owner',
        role: Role.SUPERADMIN,
        name: 'Super Administrator',
        lastSeenReleaseAt: null,
      },
      {
        id: 'sales_user_id',
        username: 'salesbudi',
        role: Role.SALES,
        name: 'Sales Budi',
        lastSeenReleaseAt: null,
      },
    ];
    auditLogs = [];
    activeCtx = superAdminCtx;
    vi.clearAllMocks();

    vi.spyOn(contextModule, 'requireContext').mockImplementation(
      async (_req, roles) => {
        if (roles && !roles.includes(activeCtx.role)) {
          throw new DomainError('FORBIDDEN', 'Akses ditolak', 403);
        }
        return activeCtx;
      }
    );
  });

  it('Super Admin dapat membuat draft catatan pembaruan dan dicatat di audit log', async () => {
    activeCtx = superAdminCtx;

    const req = new NextRequest(`${APP_URL}/api/v1/updates`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: APP_URL },
      body: JSON.stringify({
        version: 'v0.2.0',
        title: 'Rilis Fase 1: Produk & Vendor',
        bodyMarkdown: '### Fitur Baru\n- Manajemen vendor logistik',
        isPublishNow: false,
      }),
    });

    const res = await createUpdateHandler(req);
    expect(res.status).toBe(201);
    const body = await res.json();

    expect(body.ok).toBe(true);
    expect(body.data.version).toBe('v0.2.0');
    expect(body.data.publishedAt).toBeNull(); // Status draf

    // Verifikasi audit log
    const audit = auditLogs.find((a) => a.action === 'RELEASE_NOTE_CREATE');
    expect(audit).toBeDefined();
    expect(audit?.entityId).toBe(body.data.id);
  });

  it('Sales DITOLAK (403 FORBIDDEN) saat mencoba membuat catatan pembaruan', async () => {
    activeCtx = salesCtx;

    const req = new NextRequest(`${APP_URL}/api/v1/updates`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: APP_URL },
      body: JSON.stringify({
        version: 'v0.2.0',
        title: 'Mencoba membuat rilis oleh sales',
        bodyMarkdown: 'Deskripsi',
      }),
    });

    const res = await createUpdateHandler(req);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe('FORBIDDEN');
  });

  it('GET /api/v1/updates: Super Admin melihat semua catatan (draft & terbit), Sales HANYA melihat catatan terbit', async () => {
    // Siapkan 1 terbit dan 1 draf
    notes.push(
      {
        id: 'note_1',
        version: 'v0.1.0',
        title: 'Rilis Perdana',
        bodyMarkdown: 'Inisialisasi sistem',
        createdById: 'super_admin_id',
        publishedAt: new Date('2026-11-01T10:00:00Z'),
        broadcastAt: null,
        createdAt: new Date('2026-11-01T09:00:00Z'),
      },
      {
        id: 'note_2',
        version: 'v0.2.0',
        title: 'Rilis Draf Mendatang',
        bodyMarkdown: 'Sedang disiapkan',
        createdById: 'super_admin_id',
        publishedAt: null, // Draft
        broadcastAt: null,
        createdAt: new Date('2026-11-08T09:00:00Z'),
      }
    );

    // Super Admin melihat 2 catatan
    activeCtx = superAdminCtx;
    const saReq = new NextRequest(`${APP_URL}/api/v1/updates`);
    const saRes = await getUpdatesHandler(saReq);
    expect(saRes.status).toBe(200);
    const saBody = await saRes.json();
    expect(saBody.data.length).toBe(2);

    // Sales hanya melihat 1 catatan (hanya yang sudah publishedAt !== null)
    activeCtx = salesCtx;
    const salesReq = new NextRequest(`${APP_URL}/api/v1/updates`);
    const salesRes = await getUpdatesHandler(salesReq);
    expect(salesRes.status).toBe(200);
    const salesBody = await salesRes.json();
    expect(salesBody.data.length).toBe(1);
    expect(salesBody.data[0].id).toBe('note_1');
    expect(salesBody.data[0].version).toBe('v0.1.0');
  });

  it('GET /api/v1/updates/:id: Sales mendapat 404 jika mengakses catatan yang masih berstatus draft', async () => {
    notes.push({
      id: 'draft_note_1',
      version: 'v0.2.0',
      title: 'Draf Rahasia',
      bodyMarkdown: 'Belum untuk sales',
      createdById: 'super_admin_id',
      publishedAt: null,
      broadcastAt: null,
      createdAt: new Date(),
    });

    // SA bisa melihat detail
    activeCtx = superAdminCtx;
    const saReq = new NextRequest(`${APP_URL}/api/v1/updates/draft_note_1`);
    const saRes = await getUpdateDetailHandler(saReq, {
      params: Promise.resolve({ id: 'draft_note_1' }),
    });
    expect(saRes.status).toBe(200);

    // Sales mendapat 404 NOT_FOUND
    activeCtx = salesCtx;
    const salesReq = new NextRequest(`${APP_URL}/api/v1/updates/draft_note_1`);
    const salesRes = await getUpdateDetailHandler(salesReq, {
      params: Promise.resolve({ id: 'draft_note_1' }),
    });
    expect(salesRes.status).toBe(404);
  });

  it('Super Admin dapat menerbitkan draf rilis via POST /api/v1/updates/:id/publish, Sales DITOLAK (403)', async () => {
    notes.push({
      id: 'draft_note_2',
      version: 'v0.2.0',
      title: 'Draf Siap Rilis',
      bodyMarkdown: 'Fitur baru selesai',
      createdById: 'super_admin_id',
      publishedAt: null,
      broadcastAt: null,
      createdAt: new Date(),
    });

    // Sales mencoba publish -> 403
    activeCtx = salesCtx;
    const salesReq = new NextRequest(
      `${APP_URL}/api/v1/updates/draft_note_2/publish`,
      {
        method: 'POST',
        headers: { Origin: APP_URL },
      }
    );
    const salesRes = await publishUpdateHandler(salesReq, {
      params: Promise.resolve({ id: 'draft_note_2' }),
    });
    expect(salesRes.status).toBe(403);

    // Super Admin publish dengan broadcast true -> 200
    activeCtx = superAdminCtx;
    const saReq = new NextRequest(
      `${APP_URL}/api/v1/updates/draft_note_2/publish`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: APP_URL },
        body: JSON.stringify({ broadcast: true }),
      }
    );
    const saRes = await publishUpdateHandler(saReq, {
      params: Promise.resolve({ id: 'draft_note_2' }),
    });
    expect(saRes.status).toBe(200);
    const saBody = await saRes.json();
    expect(saBody.data.publishedAt).not.toBeNull();
    expect(saBody.data.broadcastAt).not.toBeNull();

    // Verifikasi audit log
    const audit = auditLogs.find((a) => a.action === 'RELEASE_NOTE_PUBLISH');
    expect(audit).toBeDefined();
    expect(audit?.entityId).toBe('draft_note_2');
  });

  it('Super Admin dapat mengubah catatan (PATCH) dan menghapus (DELETE), Sales DITOLAK (403)', async () => {
    notes.push({
      id: 'note_crud',
      version: 'v0.2.0',
      title: 'Judul Lama',
      bodyMarkdown: 'Konten lama',
      createdById: 'super_admin_id',
      publishedAt: null,
      broadcastAt: null,
      createdAt: new Date(),
    });

    // Sales mencoba PATCH -> 403
    activeCtx = salesCtx;
    const salesPatchReq = new NextRequest(
      `${APP_URL}/api/v1/updates/note_crud`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Origin: APP_URL },
        body: JSON.stringify({ title: 'Judul Diubah' }),
      }
    );
    const salesPatchRes = await updateUpdateHandler(salesPatchReq, {
      params: Promise.resolve({ id: 'note_crud' }),
    });
    expect(salesPatchRes.status).toBe(403);

    // Super Admin PATCH -> 200
    activeCtx = superAdminCtx;
    const saPatchReq = new NextRequest(`${APP_URL}/api/v1/updates/note_crud`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Origin: APP_URL },
      body: JSON.stringify({ title: 'Judul Diperbarui' }),
    });
    const saPatchRes = await updateUpdateHandler(saPatchReq, {
      params: Promise.resolve({ id: 'note_crud' }),
    });
    expect(saPatchRes.status).toBe(200);
    expect(notes.find((n) => n.id === 'note_crud')?.title).toBe(
      'Judul Diperbarui'
    );

    // Sales mencoba DELETE -> 403
    activeCtx = salesCtx;
    const salesDeleteReq = new NextRequest(
      `${APP_URL}/api/v1/updates/note_crud`,
      {
        method: 'DELETE',
        headers: { Origin: APP_URL },
      }
    );
    const salesDeleteRes = await deleteUpdateHandler(salesDeleteReq, {
      params: Promise.resolve({ id: 'note_crud' }),
    });
    expect(salesDeleteRes.status).toBe(403);

    // Super Admin DELETE -> 200
    activeCtx = superAdminCtx;
    const saDeleteReq = new NextRequest(
      `${APP_URL}/api/v1/updates/note_crud`,
      {
        method: 'DELETE',
        headers: { Origin: APP_URL },
      }
    );
    const saDeleteRes = await deleteUpdateHandler(saDeleteReq, {
      params: Promise.resolve({ id: 'note_crud' }),
    });
    expect(saDeleteRes.status).toBe(200);
    expect(notes.find((n) => n.id === 'note_crud')).toBeUndefined();
  });

  it('Alur unread-count dan mark-seen: menghitung rilis baru dan menyetel unreadCount menjadi 0 setelah mark-seen', async () => {
    // 2 rilis terbit
    notes.push(
      {
        id: 'pub_1',
        version: 'v0.1.0',
        title: 'Rilis 1',
        bodyMarkdown: 'Konten 1',
        createdById: 'super_admin_id',
        publishedAt: new Date(Date.now() - 60000), // 1 menit lalu
        broadcastAt: null,
        createdAt: new Date(Date.now() - 60000),
      },
      {
        id: 'pub_2',
        version: 'v0.2.0',
        title: 'Rilis 2',
        bodyMarkdown: 'Konten 2',
        createdById: 'super_admin_id',
        publishedAt: new Date(), // Baru saja terbit
        broadcastAt: null,
        createdAt: new Date(),
      }
    );

    activeCtx = salesCtx;

    // 1. Cek unread count awal (Sales belum pernah mark-seen, threshold = 0)
    const countReq1 = new NextRequest(`${APP_URL}/api/v1/updates/unread-count`);
    const countRes1 = await getUnreadCountHandler(countReq1);
    expect(countRes1.status).toBe(200);
    const countBody1 = await countRes1.json();
    expect(countBody1.data.unreadCount).toBe(2);

    // 2. Sales membuka halaman /updates dan mengirim mark-seen
    const markReq = new NextRequest(`${APP_URL}/api/v1/updates/mark-seen`, {
      method: 'POST',
      headers: { Origin: APP_URL },
    });
    const markRes = await markSeenHandler(markReq);
    expect(markRes.status).toBe(200);
    const markBody = await markRes.json();
    expect(markBody.data.success).toBe(true);

    // 3. Cek unread count kembali -> harus 0
    const countReq2 = new NextRequest(`${APP_URL}/api/v1/updates/unread-count`);
    const countRes2 = await getUnreadCountHandler(countReq2);
    expect(countRes2.status).toBe(200);
    const countBody2 = await countRes2.json();
    expect(countBody2.data.unreadCount).toBe(0);
  });
});
