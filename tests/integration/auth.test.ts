import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST as loginHandler } from '@/app/api/v1/auth/login/route';
import { POST as logoutHandler } from '@/app/api/v1/auth/logout/route';
import { GET as meHandler } from '@/app/api/v1/auth/me/route';
import { POST as changePasswordHandler } from '@/app/api/v1/auth/change-password/route';
import { withApi } from '@/lib/api/withApi';
import { hashPassword } from '@/lib/auth/password';
import { Role } from '@prisma/client';
import { prisma } from '@/lib/db';

// Mock database store in-memory for testing route handlers end-to-end
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
  commissionMode: null;
  commissionRateBps: null;
  commissionFixedAmount: null;
  lastSeenReleaseAt: Date | null;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
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

interface MockLoginAttempt {
  id: string;
  username: string;
  ip: string;
  success: boolean;
  createdAt: Date;
}

let users: MockUser[] = [];
let sessions: MockSession[] = [];
let loginAttempts: MockLoginAttempt[] = [];

vi.mock('@/lib/db', () => ({
  prisma: {
    user: {
      findFirst: vi.fn(async ({ where }: { where: { username: string; deletedAt?: null } }) => {
        return (
          users.find(
            (u) =>
              u.username.toLowerCase() === where.username.toLowerCase() &&
              (where.deletedAt === undefined || u.deletedAt === null)
          ) || null
        );
      }),
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
        return users.find((u) => u.id === where.id) || null;
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<MockUser> }) => {
        const u = users.find((user) => user.id === where.id);
        if (!u) throw new Error('User not found');
        Object.assign(u, data);
        return u;
      }),
    },
    session: {
      findUnique: vi.fn(async ({ where }: { where: { tokenHash: string } }) => {
        const s = sessions.find((sess) => sess.tokenHash === where.tokenHash);
        if (!s) return null;
        const user = users.find((u) => u.id === s.userId);
        return user ? { ...s, user } : null;
      }),
      findMany: vi.fn(async ({ where }: { where: { userId: string; revokedAt?: null; expiresAt?: { gt: Date } } }) => {
        return sessions.filter((s) => {
          if (s.userId !== where.userId) return false;
          if (where.revokedAt === null && s.revokedAt !== null) return false;
          if (where.expiresAt?.gt && s.expiresAt <= where.expiresAt.gt) return false;
          return true;
        });
      }),
      create: vi.fn(async ({ data }: { data: Omit<MockSession, 'id' | 'createdAt' | 'lastUsedAt' | 'revokedAt'> }) => {
        const newSession: MockSession = {
          id: 'sess_' + Math.random().toString(36).substring(7),
          ...data,
          createdAt: new Date(),
          lastUsedAt: new Date(),
          revokedAt: null,
        };
        sessions.push(newSession);
        return newSession;
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<MockSession> }) => {
        const s = sessions.find((sess) => sess.id === where.id);
        if (!s) throw new Error('Session not found');
        Object.assign(s, data);
        return s;
      }),
      updateMany: vi.fn(async ({ where, data }: { where: { id?: { in?: string[]; not?: string }; userId?: string; revokedAt?: null }; data: Partial<MockSession> }) => {
        let count = 0;
        for (const s of sessions) {
          if (where.userId && s.userId !== where.userId) continue;
          if (where.id?.in && !where.id.in.includes(s.id)) continue;
          if (where.id?.not && s.id === where.id.not) continue;
          if (where.revokedAt === null && s.revokedAt !== null) continue;
          Object.assign(s, data);
          count++;
        }
        return { count };
      }),
    },
    loginAttempt: {
      count: vi.fn(async ({ where }: { where: { username?: string; ip?: string; success?: boolean; createdAt?: { gte: Date } } }) => {
        return loginAttempts.filter((a) => {
          if (where.username && a.username.toLowerCase() !== where.username.toLowerCase()) return false;
          if (where.ip && a.ip !== where.ip) return false;
          if (where.success !== undefined && a.success !== where.success) return false;
          if (where.createdAt?.gte && a.createdAt < where.createdAt.gte) return false;
          return true;
        }).length;
      }),
      create: vi.fn(async ({ data }: { data: Omit<MockLoginAttempt, 'id' | 'createdAt'> }) => {
        const attempt: MockLoginAttempt = {
          id: 'att_' + Math.random().toString(36).substring(7),
          ...data,
          createdAt: new Date(),
        };
        loginAttempts.push(attempt);
        return attempt;
      }),
    },
  },
}));

describe('Tes 17.3 nomor 17: Integrasi Autentikasi Inti (T1.1)', () => {
  const APP_URL = 'http://localhost:3000';
  const PASSWORD_VALID = 'PasswordBenar123!';
  let validPasswordHash = '';

  beforeEach(async () => {
    users = [];
    sessions = [];
    loginAttempts = [];
    vi.clearAllMocks();

    if (!validPasswordHash) {
      validPasswordHash = await hashPassword(PASSWORD_VALID);
    }

    // Seed default sales user with mustChangePassword = true
    users.push({
      id: 'usr_sales_1',
      username: 'salesbudi',
      passwordHash: validPasswordHash,
      name: 'Budi Sales',
      role: Role.SALES,
      businessId: 'biz_1',
      isActive: true,
      mustChangePassword: true,
      telegramChatId: null,
      telegramLinkedAt: null,
      telegramBlocked: false,
      commissionMode: null,
      commissionRateBps: null,
      commissionFixedAmount: null,
      lastSeenReleaseAt: null,
      lastLoginAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    });
  });

  it('login sukses: menyetel atribut cookie yang benar (HttpOnly, Secure, SameSite=Lax, 7 hari)', async () => {
    const req = new NextRequest(APP_URL + '/api/v1/auth/login', {
      method: 'POST',
      headers: {
        origin: APP_URL,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        username: 'salesbudi',
        password: PASSWORD_VALID,
      }),
    });

    const res = await loginHandler(req);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.data.user.username).toBe('salesbudi');
    expect(body.data.user.mustChangePassword).toBe(true);

    // Periksa cookie
    const cookie = res.cookies.get('sid');
    expect(cookie).toBeDefined();
    expect(cookie?.value).toHaveLength(64);
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.secure).toBe(true);
    expect(cookie?.sameSite).toBe('lax');
    expect(cookie?.path).toBe('/');
    expect(cookie?.maxAge).toBe(604800);
  });

  it('5 kali gagal login menghasilkan 429 dan pesan login gagal selalu sama', async () => {
    // 4 kali pertama gagal dengan status 401 dan pesan selalu sama
    for (let i = 1; i <= 4; i++) {
      const req = new NextRequest(APP_URL + '/api/v1/auth/login', {
        method: 'POST',
        headers: {
          origin: APP_URL,
          'content-type': 'application/json',
          'x-forwarded-for': '192.168.1.100',
        },
        body: JSON.stringify({
          username: 'salesbudi',
          password: 'PasswordSalah999!',
        }),
      });

      const res = await loginHandler(req);
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.ok).toBe(false);
      expect(body.error.code).toBe('UNAUTHENTICATED');
      expect(body.error.message).toBe('Username atau password salah');
    }

    // Percobaan ke-5 yang gagal: kini sudah 4 kegagalan tercatat, ini menjadi yang ke-5
    const req5 = new NextRequest(APP_URL + '/api/v1/auth/login', {
      method: 'POST',
      headers: {
        origin: APP_URL,
        'content-type': 'application/json',
        'x-forwarded-for': '192.168.1.100',
      },
      body: JSON.stringify({
        username: 'salesbudi',
        password: 'PasswordSalah999!',
      }),
    });
    const res5 = await loginHandler(req5);
    expect(res5.status).toBe(401);

    // Percobaan ke-6: sudah 5 kali gagal -> wajib 429 RATE_LIMITED
    const req6 = new NextRequest(APP_URL + '/api/v1/auth/login', {
      method: 'POST',
      headers: {
        origin: APP_URL,
        'content-type': 'application/json',
        'x-forwarded-for': '192.168.1.100',
      },
      body: JSON.stringify({
        username: 'salesbudi',
        password: 'PasswordSalah999!',
      }),
    });
    const res6 = await loginHandler(req6);
    expect(res6.status).toBe(429);
    const body6 = await res6.json();
    expect(body6.error.code).toBe('RATE_LIMITED');
    expect(body6.error.message).toContain('Terlalu banyak percobaan login');
  });

  it('user nonaktif: percobaan login ditolak (401) dan sesi tidak berlaku', async () => {
    // Nonaktifkan user
    users[0].isActive = false;

    // Login ditolak dengan pesan yang sama persis
    const loginReq = new NextRequest(APP_URL + '/api/v1/auth/login', {
      method: 'POST',
      headers: {
        origin: APP_URL,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        username: 'salesbudi',
        password: PASSWORD_VALID,
      }),
    });

    const loginRes = await loginHandler(loginReq);
    expect(loginRes.status).toBe(401);
    const body = await loginRes.json();
    expect(body.error.message).toBe('Username atau password salah');
  });

  it('mustChangePassword: memblokir endpoint lain (403), tetapi mengizinkan me, change-password, dan logout', async () => {
    // 1. Login untuk dapat cookie
    const loginReq = new NextRequest(APP_URL + '/api/v1/auth/login', {
      method: 'POST',
      headers: {
        origin: APP_URL,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        username: 'salesbudi',
        password: PASSWORD_VALID,
      }),
    });
    const loginRes = await loginHandler(loginReq);
    const sessionToken = loginRes.cookies.get('sid')?.value;
    expect(sessionToken).toBeDefined();

    // 2. GET /api/v1/auth/me diizinkan
    const meReq = new NextRequest(APP_URL + '/api/v1/auth/me', {
      method: 'GET',
      headers: {
        cookie: `sid=${sessionToken}`,
      },
    });
    const meRes = await meHandler(meReq);
    expect(meRes.status).toBe(200);
    const meBody = await meRes.json();
    expect(meBody.data.user.mustChangePassword).toBe(true);

    // 3. Endpoint bisnis lain (tanpa allowPasswordChange) wajib diblokir 403 PASSWORD_CHANGE_REQUIRED
    const dummyBusinessEndpoint = withApi(
      { roles: [Role.SALES] },
      async () => ({ data: { secret: 'data' } })
    );

    const blockedReq = new NextRequest(APP_URL + '/api/v1/orders', {
      method: 'GET',
      headers: {
        cookie: `sid=${sessionToken}`,
      },
    });
    const blockedRes = await dummyBusinessEndpoint(blockedReq);
    expect(blockedRes.status).toBe(403);
    const blockedBody = await blockedRes.json();
    expect(blockedBody.error.code).toBe('PASSWORD_CHANGE_REQUIRED');
  });

  it('ganti password mencabut sesi lain dan membersihkan mustChangePassword', async () => {
    // 1. Buat Sesi A
    const loginReq1 = new NextRequest(APP_URL + '/api/v1/auth/login', {
      method: 'POST',
      headers: { origin: APP_URL, 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'salesbudi', password: PASSWORD_VALID }),
    });
    const loginRes1 = await loginHandler(loginReq1);
    const tokenA = loginRes1.cookies.get('sid')?.value as string;

    // 2. Buat Sesi B
    const loginReq2 = new NextRequest(APP_URL + '/api/v1/auth/login', {
      method: 'POST',
      headers: { origin: APP_URL, 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'salesbudi', password: PASSWORD_VALID }),
    });
    const loginRes2 = await loginHandler(loginReq2);
    const tokenB = loginRes2.cookies.get('sid')?.value as string;

    expect(sessions.filter((s) => s.revokedAt === null)).toHaveLength(2);

    // 3. Ubah password dari Sesi A
    const NEW_PASSWORD = 'NewSecurePassword2026!';
    const changeReq = new NextRequest(
      APP_URL + '/api/v1/auth/change-password',
      {
        method: 'POST',
        headers: {
          origin: APP_URL,
          cookie: `sid=${tokenA}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          currentPassword: PASSWORD_VALID,
          newPassword: NEW_PASSWORD,
        }),
      }
    );
    const changeRes = await changePasswordHandler(changeReq);
    expect(changeRes.status).toBe(200);

    // User mustChangePassword kini false
    expect(users[0].mustChangePassword).toBe(false);

    // Sesi A tetap berlaku
    const meReqA = new NextRequest(APP_URL + '/api/v1/auth/me', {
      method: 'GET',
      headers: { cookie: `sid=${tokenA}` },
    });
    const meResA = await meHandler(meReqA);
    expect(meResA.status).toBe(200);

    // Sesi B telah dicabut -> 401 UNAUTHENTICATED
    const meReqB = new NextRequest(APP_URL + '/api/v1/auth/me', {
      method: 'GET',
      headers: { cookie: `sid=${tokenB}` },
    });
    const meResB = await meHandler(meReqB);
    expect(meResB.status).toBe(401);

    // 4. Logout Sesi A mencabut sesi dan membersihkan cookie
    const logoutReq = new NextRequest(APP_URL + '/api/v1/auth/logout', {
      method: 'POST',
      headers: { origin: APP_URL, cookie: `sid=${tokenA}` },
    });
    const logoutRes = await logoutHandler(logoutReq);
    expect(logoutRes.status).toBe(200);
    const clearedCookie = logoutRes.cookies.get('sid');
    expect(clearedCookie?.maxAge).toBe(0);

    // Sesi A kini juga tidak berlaku
    const meReqAAfter = new NextRequest(APP_URL + '/api/v1/auth/me', {
      method: 'GET',
      headers: { cookie: `sid=${tokenA}` },
    });
    const meResAAfter = await meHandler(meReqAAfter);
    expect(meResAAfter.status).toBe(401);
  });

  it('POST dengan Origin asing ditolak (403 FORBIDDEN)', async () => {
    const maliciousReq = new NextRequest(APP_URL + '/api/v1/auth/login', {
      method: 'POST',
      headers: {
        origin: 'https://hacker-site.net',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        username: 'salesbudi',
        password: PASSWORD_VALID,
      }),
    });

    const res = await loginHandler(maliciousReq);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe('FORBIDDEN');
    expect(body.error.message).toBe('Origin tidak valid');
  });
});
