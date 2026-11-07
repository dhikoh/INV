import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextResponse } from 'next/server';
import {
  generateSessionToken,
  hashSessionToken,
  setSessionCookie,
  clearSessionCookie,
  createSession,
  findValidSession,
  revokeSession,
  revokeOtherSessions,
  revokeAllUserSessions,
  SESSION_MAX_AGE_SECONDS,
  SESSION_COOKIE_OPTIONS,
} from '@/lib/auth/session';
import { prisma } from '@/lib/db';
import { Role } from '@prisma/client';

vi.mock('@/lib/db', () => ({
  prisma: {
    session: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
  },
}));

describe('Session Management & Sliding Expiration (T1.1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('menghasilkan token 32-byte acak (64 karakter hex) dan hash SHA-256', () => {
    const token = generateSessionToken();
    expect(token).toHaveLength(64);
    expect(/^[0-9a-f]{64}$/.test(token)).toBe(true);

    const hash = hashSessionToken(token);
    expect(hash).toHaveLength(64);
    expect(hash).not.toBe(token);
  });

  it('menggunakan konfigurasi cookie yang benar (HttpOnly, Secure, SameSite=Lax, 7 hari)', () => {
    expect(SESSION_COOKIE_OPTIONS.httpOnly).toBe(true);
    expect(SESSION_COOKIE_OPTIONS.secure).toBe(true);
    expect(SESSION_COOKIE_OPTIONS.sameSite).toBe('lax');
    expect(SESSION_COOKIE_OPTIONS.path).toBe('/');
    expect(SESSION_COOKIE_OPTIONS.maxAge).toBe(604800);
    expect(SESSION_MAX_AGE_SECONDS).toBe(604800);
  });

  it('menyetel dan menghapus cookie pada NextResponse dengan benar', () => {
    const res = NextResponse.json({ ok: true });
    setSessionCookie(res, 'sample-token-123');

    const cookie = res.cookies.get('sid');
    expect(cookie?.value).toBe('sample-token-123');

    clearSessionCookie(res);
    const cleared = res.cookies.get('sid');
    expect(cleared?.value).toBe('');
    expect(cleared?.maxAge).toBe(0);
  });

  it('membatasi maksimal 5 sesi aktif per user dan mencabut sesi terlama', async () => {
    const existingSessions = [
      { id: 's1', createdAt: new Date(1000) },
      { id: 's2', createdAt: new Date(2000) },
      { id: 's3', createdAt: new Date(3000) },
      { id: 's4', createdAt: new Date(4000) },
      { id: 's5', createdAt: new Date(5000) },
    ];

    vi.mocked(prisma.session.findMany).mockResolvedValueOnce(
      existingSessions as never
    );
    vi.mocked(prisma.session.create).mockResolvedValueOnce({
      id: 's6',
      userId: 'u1',
      tokenHash: 'hash-6',
      expiresAt: new Date(Date.now() + 604800000),
    } as never);

    await createSession('u1', { ip: '127.0.0.1' });

    // Sesi tertua s1 harus dicabut
    expect(prisma.session.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['s1'] } },
      data: expect.objectContaining({ revokedAt: expect.any(Date) }),
    });
    expect(prisma.session.create).toHaveBeenCalled();
  });

  it('mengabaikan perpanjangan sliding bila lastUsedAt belum lewat 10 menit', async () => {
    const now = new Date();
    const token = generateSessionToken();
    const mockSession = {
      id: 's1',
      userId: 'u1',
      tokenHash: hashSessionToken(token),
      createdAt: new Date(now.getTime() - 5 * 60 * 1000),
      lastUsedAt: new Date(now.getTime() - 5 * 60 * 1000), // 5 menit yang lalu (< 10 menit)
      expiresAt: new Date(now.getTime() + 604800000),
      revokedAt: null,
      user: { id: 'u1', name: 'Admin', role: Role.SUPERADMIN, isActive: true, deletedAt: null },
    };

    vi.mocked(prisma.session.findUnique).mockResolvedValueOnce(
      mockSession as never
    );

    const session = await findValidSession(token);
    expect(session).not.toBeNull();
    expect(prisma.session.update).not.toHaveBeenCalled();
  });

  it('memperpanjang kedaluwarsa (sliding) bila lastUsedAt lewat dari 10 menit', async () => {
    const now = new Date();
    const token = generateSessionToken();
    const mockSession = {
      id: 's1',
      userId: 'u1',
      tokenHash: hashSessionToken(token),
      createdAt: new Date(now.getTime() - 15 * 60 * 1000),
      lastUsedAt: new Date(now.getTime() - 12 * 60 * 1000), // 12 menit yang lalu (> 10 menit)
      expiresAt: new Date(now.getTime() + 604800000),
      revokedAt: null,
      user: { id: 'u1', name: 'Admin', role: Role.SUPERADMIN, isActive: true, deletedAt: null },
    };

    vi.mocked(prisma.session.findUnique).mockResolvedValueOnce(
      mockSession as never
    );

    const session = await findValidSession(token);
    expect(session).not.toBeNull();
    expect(prisma.session.update).toHaveBeenCalledWith({
      where: { id: 's1' },
      data: expect.objectContaining({
        lastUsedAt: expect.any(Date),
        expiresAt: expect.any(Date),
      }),
    });
  });

  it('mengembalikan null jika sesi sudah dicabut atau sudah kedaluwarsa', async () => {
    const token = generateSessionToken();
    vi.mocked(prisma.session.findUnique).mockResolvedValueOnce({
      id: 's1',
      revokedAt: new Date(),
      expiresAt: new Date(Date.now() + 604800000),
    } as never);

    const s1 = await findValidSession(token);
    expect(s1).toBeNull();

    vi.mocked(prisma.session.findUnique).mockResolvedValueOnce({
      id: 's2',
      revokedAt: null,
      expiresAt: new Date(Date.now() - 1000), // kedaluwarsa
    } as never);

    const s2 = await findValidSession(token);
    expect(s2).toBeNull();
  });

  it('mencabut sesi lain saat revokeOtherSessions dipanggil', async () => {
    await revokeOtherSessions('u1', 'current-session-id');

    expect(prisma.session.updateMany).toHaveBeenCalledWith({
      where: {
        userId: 'u1',
        id: { not: 'current-session-id' },
        revokedAt: null,
      },
      data: expect.objectContaining({ revokedAt: expect.any(Date) }),
    });
  });

  it('mencabut semua sesi saat revokeAllUserSessions dipanggil', async () => {
    await revokeAllUserSessions('u1');

    expect(prisma.session.updateMany).toHaveBeenCalledWith({
      where: {
        userId: 'u1',
        revokedAt: null,
      },
      data: expect.objectContaining({ revokedAt: expect.any(Date) }),
    });
  });

  it('mencabut sesi saat revokeSession dipanggil', async () => {
    await revokeSession('s1');

    expect(prisma.session.updateMany).toHaveBeenCalledWith({
      where: {
        id: 's1',
        revokedAt: null,
      },
      data: expect.objectContaining({ revokedAt: expect.any(Date) }),
    });
  });
});
