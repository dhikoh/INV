import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import {
  GET as getUsersHandler,
  POST as createUserHandler,
} from '@/app/api/v1/users/route';
import {
  PATCH as updateUserHandler,
  DELETE as deleteUserHandler,
} from '@/app/api/v1/users/[id]/route';
import { POST as resetPasswordHandler } from '@/app/api/v1/users/[id]/reset-password/route';
import { POST as deactivateUserHandler } from '@/app/api/v1/users/[id]/deactivate/route';
import { POST as activateUserHandler } from '@/app/api/v1/users/[id]/activate/route';
import { POST as generateTelegramLinkCodeHandler } from '@/app/api/v1/auth/telegram/link-code/route';
import { DELETE as unlinkTelegramHandler } from '@/app/api/v1/auth/telegram/route';
import { CommissionMode, Role } from '@prisma/client';
import * as contextModule from '@/lib/auth/context';
import { verifyPassword } from '@/lib/auth/password';

interface MockUser {
  id: string;
  username: string;
  passwordHash: string;
  name: string;
  role: Role;
  businessId: string | null;
  isActive: boolean;
  mustChangePassword: boolean;
  telegramChatId: bigint | null;
  telegramLinkedAt: Date | null;
  telegramBlocked: boolean;
  commissionMode: CommissionMode | null;
  commissionRateBps: number | null;
  commissionFixedAmount: bigint | null;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

function omitPasswordHash(user: MockUser): Omit<MockUser, 'passwordHash'> {
  const safe: Partial<MockUser> = { ...user };
  delete safe.passwordHash;
  return safe as Omit<MockUser, 'passwordHash'>;
}

interface MockSession {
  id: string;
  userId: string;
  tokenHash: string;
  activeBusinessId: string | null;
  userAgent: string | null;
  ip: string | null;
  createdAt: Date;
  lastUsedAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
}

interface MockTelegramLinkCode {
  id: string;
  userId: string;
  codeHash: string;
  expiresAt: Date;
  usedAt: Date | null;
  createdAt: Date;
}

interface MockAuditLog {
  id: string;
  businessId: string | null;
  actorId: string | null;
  actorRole: Role | null;
  action: string;
  entityType: string;
  entityId: string;
  summary: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  reason: string | null;
  ip: string | null;
}

let users: MockUser[] = [];
let sessions: MockSession[] = [];
let linkCodes: MockTelegramLinkCode[] = [];
let auditLogs: MockAuditLog[] = [];

vi.mock('@/lib/db', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(async ({ where }: { where: { id?: string; username?: string } }) => {
        if (where.id) {
          const u = users.find((item) => item.id === where.id && item.deletedAt === null);
          return u ? { ...u } : null;
        }
        if (where.username) {
          const u = users.find(
            (item) => item.username.toLowerCase() === where.username?.toLowerCase() && item.deletedAt === null
          );
          return u ? { ...u } : null;
        }
        return null;
      }),
      findFirst: vi.fn(
        async ({
          where,
        }: {
          where: { id?: string; username?: string; deletedAt?: null | Date };
        }) => {
          const u = users.find((item) => {
            if (where.id && item.id !== where.id) return false;
            if (where.username && item.username.toLowerCase() !== where.username.toLowerCase())
              return false;
            if (where.deletedAt === null && item.deletedAt !== null) return false;
            return true;
          });
          return u ? { ...u } : null;
        }
      ),
      findMany: vi.fn(
        async ({
          where,
        }: {
          where: {
            deletedAt?: null | Date;
            businessId?: string;
            role?: Role;
            isActive?: boolean;
          };
        }) => {
          return users
            .filter((item) => {
              if (where.deletedAt === null && item.deletedAt !== null) return false;
              if (where.businessId && item.businessId !== where.businessId) return false;
              if (where.role && item.role !== where.role) return false;
              if (where.isActive !== undefined && item.isActive !== where.isActive) return false;
              return true;
            })
            .map((u) => ({
              ...omitPasswordHash(u),
              business: u.businessId ? { id: u.businessId, code: 'BIZ', name: 'Biz' } : null,
            }));
        }
      ),
      create: vi.fn(
        async ({
          data,
        }: {
          data: Omit<
            MockUser,
            | 'id'
            | 'telegramChatId'
            | 'telegramLinkedAt'
            | 'telegramBlocked'
            | 'lastLoginAt'
            | 'createdAt'
            | 'updatedAt'
            | 'deletedAt'
          >;
        }) => {
          const item: MockUser = {
            id: `usr_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
            ...data,
            telegramChatId: null,
            telegramLinkedAt: null,
            telegramBlocked: false,
            lastLoginAt: null,
            createdAt: new Date(),
            updatedAt: new Date(),
            deletedAt: null,
          };
          users.push(item);
          return omitPasswordHash(item);
        }
      ),
      update: vi.fn(
        async ({
          where,
          data,
        }: {
          where: { id: string };
          data: Partial<MockUser>;
        }) => {
          const u = users.find((item) => item.id === where.id);
          if (!u) throw new Error('User not found');
          Object.assign(u, data, { updatedAt: new Date() });
          return omitPasswordHash(u);
        }
      ),
    },
    business: {
      findFirst: vi.fn(async ({ where }: { where: { id?: string } }) => {
        if (where.id === 'biz_invalid') return null;
        return {
          id: where.id || 'biz_1',
          code: 'CAT',
          name: 'BentoCat',
          deletedAt: null,
        };
      }),
    },
    session: {
      updateMany: vi.fn(
        async ({
          where,
          data,
        }: {
          where: { userId?: string; revokedAt?: null | Date };
          data: Partial<MockSession>;
        }) => {
          let count = 0;
          for (const s of sessions) {
            if (where.userId && s.userId !== where.userId) continue;
            if (where.revokedAt === null && s.revokedAt !== null) continue;
            Object.assign(s, data);
            count++;
          }
          return { count };
        }
      ),
    },
    telegramLinkCode: {
      updateMany: vi.fn(
        async ({
          where,
          data,
        }: {
          where: { userId?: string; usedAt?: null | Date };
          data: Partial<MockTelegramLinkCode>;
        }) => {
          let count = 0;
          for (const code of linkCodes) {
            if (where.userId && code.userId !== where.userId) continue;
            if (where.usedAt === null && code.usedAt !== null) continue;
            Object.assign(code, data);
            count++;
          }
          return { count };
        }
      ),
      create: vi.fn(
        async ({
          data,
        }: {
          data: Omit<MockTelegramLinkCode, 'id' | 'usedAt' | 'createdAt'>;
        }) => {
          const item: MockTelegramLinkCode = {
            id: `tlc_${Date.now()}`,
            ...data,
            usedAt: null,
            createdAt: new Date(),
          };
          linkCodes.push(item);
          return { ...item };
        }
      ),
    },
    auditLog: {
      create: vi.fn(async ({ data }: { data: Omit<MockAuditLog, 'id'> }) => {
        const log: MockAuditLog = {
          id: `audit_${Date.now()}`,
          ...data,
        };
        auditLogs.push(log);
        return log;
      }),
    },
    $transaction: vi.fn(async (cb: (tx: unknown) => Promise<unknown>) => {
      const { prisma } = await import('@/lib/db');
      return cb(prisma);
    }),
  },
}));

describe('Manajemen Pengguna Sales, Status Akun & Telegram Linking (T1.4)', () => {
  const APP_URL = 'http://localhost:3000';

  const superAdminCtx: contextModule.Ctx = {
    user: {
      id: 'super_admin_id',
      role: Role.SUPERADMIN,
      name: 'Owner BentoCat',
      businessId: null,
    },
    sessionId: 'sess_admin_1',
    role: Role.SUPERADMIN,
    businessId: null,
    ip: '127.0.0.1',
  };

  beforeEach(() => {
    users = [];
    sessions = [];
    linkCodes = [];
    auditLogs = [];
    vi.clearAllMocks();

    vi.spyOn(contextModule, 'requireContext').mockResolvedValue(superAdminCtx);

    // Initial super admin
    users.push({
      id: 'super_admin_id',
      username: 'owner',
      passwordHash: 'hash_super_admin',
      name: 'Owner BentoCat',
      role: Role.SUPERADMIN,
      businessId: null,
      isActive: true,
      mustChangePassword: false,
      telegramChatId: null,
      telegramLinkedAt: null,
      telegramBlocked: false,
      commissionMode: null,
      commissionRateBps: null,
      commissionFixedAmount: null,
      lastLoginAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    });
  });

  describe('CRUD /api/v1/users (Super Admin)', () => {
    it('membuat akun sales baru dengan username huruf kecil, password argon2id, dan mustChangePassword = true', async () => {
      const req = new NextRequest(`${APP_URL}/api/v1/users`, {
        method: 'POST',
        headers: { origin: APP_URL, 'content-type': 'application/json' },
        body: JSON.stringify({
          username: 'BudiSales',
          name: 'Budi Santoso',
          password: 'PasswordBudi123!',
          businessId: 'biz_1',
          role: 'SALES',
        }),
      });

      const res = await createUserHandler(req);
      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.ok).toBe(true);
      expect(json.data.username).toBe('budisales'); // Dinormalisasi menjadi huruf kecil
      expect(json.data.name).toBe('Budi Santoso');
      expect(json.data.mustChangePassword).toBe(true);
      expect(json.data.isActive).toBe(true);
      expect(json.data.passwordHash).toBeUndefined(); // Tidak bocor

      // Verifikasi di database mock
      const dbUser = users.find((u) => u.username === 'budisales');
      expect(dbUser).toBeDefined();
      expect(dbUser?.passwordHash).toMatch(/^\$argon2id\$/);
      // Buktikan password cocok dengan argon2id
      const matches = await verifyPassword(
        'PasswordBudi123!',
        dbUser!.passwordHash
      );
      expect(matches).toBe(true);

      // Verifikasi audit log tertulis
      const audit = auditLogs.find(
        (a) => a.action === 'USER_CREATE' && a.entityId === json.data.id
      );
      expect(audit).toBeDefined();
    });

    it('menolak pembuatan sales bila username sudah digunakan (409 DUPLICATE)', async () => {
      users.push({
        id: 'usr_existing',
        username: 'budisales',
        passwordHash: 'hash',
        name: 'Existing Budi',
        role: Role.SALES,
        businessId: 'biz_1',
        isActive: true,
        mustChangePassword: false,
        telegramChatId: null,
        telegramLinkedAt: null,
        telegramBlocked: false,
        commissionMode: null,
        commissionRateBps: null,
        commissionFixedAmount: null,
        lastLoginAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      });

      const req = new NextRequest(`${APP_URL}/api/v1/users`, {
        method: 'POST',
        headers: { origin: APP_URL, 'content-type': 'application/json' },
        body: JSON.stringify({
          username: 'BUDISALES',
          name: 'Duplicate Budi',
          password: 'PasswordBudi123!',
          businessId: 'biz_1',
        }),
      });

      const res = await createUserHandler(req);
      expect(res.status).toBe(409);
      const json = await res.json();
      expect(json.error.code).toBe('DUPLICATE');
    });

    it('menolak pembuatan sales bila unit usaha tidak ditemukan (404 NOT_FOUND)', async () => {
      const req = new NextRequest(`${APP_URL}/api/v1/users`, {
        method: 'POST',
        headers: { origin: APP_URL, 'content-type': 'application/json' },
        body: JSON.stringify({
          username: 'newsales',
          name: 'New Sales',
          password: 'PasswordBaru123!',
          businessId: 'biz_invalid',
        }),
      });

      const res = await createUserHandler(req);
      expect(res.status).toBe(404);
    });

    it('mengambil daftar pengguna dan tidak pernah memuat passwordHash', async () => {
      users.push({
        id: 'usr_sales_2',
        username: 'sales2',
        passwordHash: 'secret_hash_value',
        name: 'Sales Dua',
        role: Role.SALES,
        businessId: 'biz_1',
        isActive: true,
        mustChangePassword: false,
        telegramChatId: null,
        telegramLinkedAt: null,
        telegramBlocked: false,
        commissionMode: null,
        commissionRateBps: null,
        commissionFixedAmount: null,
        lastLoginAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      });

      const req = new NextRequest(`${APP_URL}/api/v1/users`);
      const res = await getUsersHandler(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data.length).toBeGreaterThanOrEqual(2);

      for (const u of json.data) {
        expect(u.passwordHash).toBeUndefined();
      }
    });

    it('memperbarui data pengguna via PATCH dan mencatat audit log', async () => {
      users.push({
        id: 'usr_edit_1',
        username: 'salesedit',
        passwordHash: 'hash',
        name: 'Nama Lama',
        role: Role.SALES,
        businessId: 'biz_1',
        isActive: true,
        mustChangePassword: false,
        telegramChatId: null,
        telegramLinkedAt: null,
        telegramBlocked: false,
        commissionMode: null,
        commissionRateBps: null,
        commissionFixedAmount: null,
        lastLoginAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      });

      const req = new NextRequest(`${APP_URL}/api/v1/users/usr_edit_1`, {
        method: 'PATCH',
        headers: { origin: APP_URL, 'content-type': 'application/json' },
        body: JSON.stringify({
          name: 'Nama Baru',
          commissionRateBps: 1500,
        }),
      });

      const res = await updateUserHandler(req, {
        params: Promise.resolve({ id: 'usr_edit_1' }),
      });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data.name).toBe('Nama Baru');

      const audit = auditLogs.find(
        (a) => a.action === 'USER_UPDATE' && a.entityId === 'usr_edit_1'
      );
      expect(audit).toBeDefined();
    });
  });

  describe('Reset Password & Pencabutan Sesi', () => {
    beforeEach(() => {
      users.push({
        id: 'usr_reset',
        username: 'userreset',
        passwordHash: 'old_hash',
        name: 'User Reset',
        role: Role.SALES,
        businessId: 'biz_1',
        isActive: true,
        mustChangePassword: false,
        telegramChatId: null,
        telegramLinkedAt: null,
        telegramBlocked: false,
        commissionMode: null,
        commissionRateBps: null,
        commissionFixedAmount: null,
        lastLoginAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      });

      // Buat 2 sesi aktif untuk user ini
      sessions.push(
        {
          id: 'sess_1',
          userId: 'usr_reset',
          tokenHash: 'token1',
          activeBusinessId: null,
          userAgent: null,
          ip: '127.0.0.1',
          createdAt: new Date(),
          lastUsedAt: new Date(),
          expiresAt: new Date(Date.now() + 86400000),
          revokedAt: null,
        },
        {
          id: 'sess_2',
          userId: 'usr_reset',
          tokenHash: 'token2',
          activeBusinessId: null,
          userAgent: null,
          ip: '127.0.0.1',
          createdAt: new Date(),
          lastUsedAt: new Date(),
          expiresAt: new Date(Date.now() + 86400000),
          revokedAt: null,
        }
      );
    });

    it('me-reset password, menandai mustChangePassword = true, dan mencabut seluruh sesi aktif', async () => {
      const req = new NextRequest(
        `${APP_URL}/api/v1/users/usr_reset/reset-password`,
        {
          method: 'POST',
          headers: { origin: APP_URL, 'content-type': 'application/json' },
          body: JSON.stringify({
            password: 'NewStrongPassword123!',
          }),
        }
      );

      const res = await resetPasswordHandler(req, {
        params: Promise.resolve({ id: 'usr_reset' }),
      });
      expect(res.status).toBe(200);

      // Verifikasi di user
      const u = users.find((item) => item.id === 'usr_reset');
      expect(u?.mustChangePassword).toBe(true);
      const isMatch = await verifyPassword(
        'NewStrongPassword123!',
        u!.passwordHash
      );
      expect(isMatch).toBe(true);

      // Verifikasi seluruh sesi user ini dicabut (revokedAt != null)
      const userSessions = sessions.filter((s) => s.userId === 'usr_reset');
      expect(userSessions[0].revokedAt).not.toBeNull();
      expect(userSessions[1].revokedAt).not.toBeNull();

      // Verifikasi audit log tertulis
      const audit = auditLogs.find(
        (a) => a.action === 'USER_PASSWORD_RESET' && a.entityId === 'usr_reset'
      );
      expect(audit).toBeDefined();
    });
  });

  describe('Aktivasi, Deaktivasi & Soft Delete', () => {
    beforeEach(() => {
      users.push({
        id: 'usr_target',
        username: 'usertarget',
        passwordHash: 'hash',
        name: 'Target User',
        role: Role.SALES,
        businessId: 'biz_1',
        isActive: true,
        mustChangePassword: false,
        telegramChatId: null,
        telegramLinkedAt: null,
        telegramBlocked: false,
        commissionMode: null,
        commissionRateBps: null,
        commissionFixedAmount: null,
        lastLoginAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      });

      sessions.push({
        id: 'sess_target_1',
        userId: 'usr_target',
        tokenHash: 'tokentarget',
        activeBusinessId: null,
        userAgent: null,
        ip: '127.0.0.1',
        createdAt: new Date(),
        lastUsedAt: new Date(),
        expiresAt: new Date(Date.now() + 86400000),
        revokedAt: null,
      });
    });

    it('menonaktifkan akun sales dan mencabut sesi aktif (POST /deactivate)', async () => {
      const req = new NextRequest(
        `${APP_URL}/api/v1/users/usr_target/deactivate`,
        {
          method: 'POST',
          headers: { origin: APP_URL },
        }
      );

      const res = await deactivateUserHandler(req, {
        params: Promise.resolve({ id: 'usr_target' }),
      });
      expect(res.status).toBe(200);

      const u = users.find((item) => item.id === 'usr_target');
      expect(u?.isActive).toBe(false);

      // Sesi dicabut
      const sess = sessions.find((s) => s.userId === 'usr_target');
      expect(sess?.revokedAt).not.toBeNull();

      // Audit tercatat
      const audit = auditLogs.find(
        (a) => a.action === 'USER_DEACTIVATE' && a.entityId === 'usr_target'
      );
      expect(audit).toBeDefined();
    });

    it('menolak penonaktifan akun sendiri oleh Super Admin (400)', async () => {
      const req = new NextRequest(
        `${APP_URL}/api/v1/users/super_admin_id/deactivate`,
        {
          method: 'POST',
          headers: { origin: APP_URL },
        }
      );

      const res = await deactivateUserHandler(req, {
        params: Promise.resolve({ id: 'super_admin_id' }),
      });
      expect(res.status).toBe(400);
    });

    it('mengaktifkan kembali akun sales (POST /activate)', async () => {
      // Set to inactive first
      const u = users.find((item) => item.id === 'usr_target')!;
      u.isActive = false;

      const req = new NextRequest(
        `${APP_URL}/api/v1/users/usr_target/activate`,
        {
          method: 'POST',
          headers: { origin: APP_URL },
        }
      );

      const res = await activateUserHandler(req, {
        params: Promise.resolve({ id: 'usr_target' }),
      });
      expect(res.status).toBe(200);

      expect(u.isActive).toBe(true);

      const audit = auditLogs.find(
        (a) => a.action === 'USER_ACTIVATE' && a.entityId === 'usr_target'
      );
      expect(audit).toBeDefined();
    });

    it('menghapus pengguna secara soft delete dan mencabut sesi (DELETE /users/:id)', async () => {
      const req = new NextRequest(
        `${APP_URL}/api/v1/users/usr_target`,
        {
          method: 'DELETE',
          headers: { origin: APP_URL },
        }
      );

      const res = await deleteUserHandler(req, {
        params: Promise.resolve({ id: 'usr_target' }),
      });
      expect(res.status).toBe(200);

      const u = users.find((item) => item.id === 'usr_target');
      expect(u?.deletedAt).not.toBeNull();
      expect(u?.isActive).toBe(false);

      const sess = sessions.find((s) => s.userId === 'usr_target');
      expect(sess?.revokedAt).not.toBeNull();

      const audit = auditLogs.find(
        (a) => a.action === 'USER_DELETE' && a.entityId === 'usr_target'
      );
      expect(audit).toBeDefined();
    });
  });

  describe('Telegram Linking (POST /link-code & DELETE /telegram)', () => {
    it('membuat kode link 8 karakter berlaku 10 menit dan menandai kode lama terpakai', async () => {
      // Buat kode lama yang belum terpakai
      linkCodes.push({
        id: 'code_old',
        userId: 'super_admin_id',
        codeHash: 'hash_old',
        expiresAt: new Date(Date.now() + 600000),
        usedAt: null,
        createdAt: new Date(),
      });

      const req = new NextRequest(
        `${APP_URL}/api/v1/auth/telegram/link-code`,
        {
          method: 'POST',
          headers: { origin: APP_URL },
        }
      );

      const res = await generateTelegramLinkCodeHandler(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.ok).toBe(true);
      expect(json.data.code).toHaveLength(8);
      // Karakter tidak memuat O, 0, I, 1
      expect(json.data.code).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/);
      expect(json.data.linkUrl).toContain(json.data.code);

      // Verifikasi kode lama ditandai usedAt != null
      const oldCode = linkCodes.find((c) => c.id === 'code_old');
      expect(oldCode?.usedAt).not.toBeNull();

      // Verifikasi kode baru tersimpan dengan SHA-256 hash
      const newCode = linkCodes.find((c) => c.id !== 'code_old');
      expect(newCode).toBeDefined();
      expect(newCode?.codeHash).toHaveLength(64); // SHA-256 hex length
    });

    it('memutuskan tautan akun Telegram (DELETE /api/v1/auth/telegram)', async () => {
      // Hubungkan Telegram dummy
      const admin = users.find((u) => u.id === 'super_admin_id')!;
      admin.telegramChatId = 123456789n;
      admin.telegramLinkedAt = new Date();

      const req = new NextRequest(
        `${APP_URL}/api/v1/auth/telegram`,
        {
          method: 'DELETE',
          headers: { origin: APP_URL },
        }
      );

      const res = await unlinkTelegramHandler(req);
      expect(res.status).toBe(200);

      expect(admin.telegramChatId).toBeNull();
      expect(admin.telegramLinkedAt).toBeNull();

      const audit = auditLogs.find(
        (a) =>
          a.action === 'USER_TELEGRAM_UNLINK' &&
          a.entityId === 'super_admin_id'
      );
      expect(audit).toBeDefined();
    });
  });
});
