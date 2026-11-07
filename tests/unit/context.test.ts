import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { requireContext, requireBusiness } from '@/lib/auth/context';
import { findValidSession } from '@/lib/auth/session';
import { DomainError } from '@/lib/domain/money';
import { Role } from '@prisma/client';

vi.mock('@/lib/auth/session', () => ({
  findValidSession: vi.fn(),
}));

describe('Context Resolution & Role Guard (T1.1 & Seksi 10.2 & 16.1)', () => {
  const APP_URL = 'http://localhost:3000';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  function makeReq(cookieValue?: string): NextRequest {
    return new NextRequest(APP_URL + '/api/v1/orders', {
      headers: cookieValue ? { cookie: `sid=${cookieValue}` } : {},
    });
  }

  it('melempar 401 UNAUTHENTICATED bila cookie sesi tidak ada', async () => {
    const req = makeReq();
    await expect(requireContext(req, [Role.SUPERADMIN])).rejects.toThrow(
      DomainError
    );

    try {
      await requireContext(req, [Role.SUPERADMIN]);
    } catch (e) {
      expect((e as DomainError).code).toBe('UNAUTHENTICATED');
      expect((e as DomainError).status).toBe(401);
      expect((e as DomainError).message).toBe('Silakan login');
    }
  });

  it('melempar 401 UNAUTHENTICATED bila sesi tidak ditemukan atau kedaluwarsa', async () => {
    vi.mocked(findValidSession).mockResolvedValueOnce(null);
    const req = makeReq('invalid-token');

    await expect(requireContext(req, [Role.SUPERADMIN])).rejects.toThrow(
      DomainError
    );
  });

  it('melempar 401 UNAUTHENTICATED bila user berstatus nonaktif (isActive = false)', async () => {
    vi.mocked(findValidSession).mockResolvedValueOnce({
      id: 'sess_1',
      tokenHash: 'hash',
      userId: 'usr_1',
      activeBusinessId: null,
      userAgent: null,
      ip: null,
      createdAt: new Date(),
      lastUsedAt: new Date(),
      expiresAt: new Date(Date.now() + 100000),
      revokedAt: null,
      user: {
        id: 'usr_1',
        username: 'sales1',
        passwordHash: 'hash',
        name: 'Sales One',
        role: Role.SALES,
        businessId: 'biz_1',
        isActive: false, // Nonaktif
        mustChangePassword: false,
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
      },
    });

    const req = makeReq('valid-token');
    await expect(requireContext(req, [Role.SALES])).rejects.toThrow(
      DomainError
    );
  });

  it('melempar 403 PASSWORD_CHANGE_REQUIRED bila mustChangePassword aktif pada endpoint biasa', async () => {
    vi.mocked(findValidSession).mockResolvedValue({
      id: 'sess_1',
      tokenHash: 'hash',
      userId: 'usr_1',
      activeBusinessId: null,
      userAgent: null,
      ip: null,
      createdAt: new Date(),
      lastUsedAt: new Date(),
      expiresAt: new Date(Date.now() + 100000),
      revokedAt: null,
      user: {
        id: 'usr_1',
        username: 'sales1',
        passwordHash: 'hash',
        name: 'Sales One',
        role: Role.SALES,
        businessId: 'biz_1',
        isActive: true,
        mustChangePassword: true, // Wajib ganti password
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
      },
    });

    const req = makeReq('valid-token');
    // Tanpa allowPasswordChange
    await expect(requireContext(req, [Role.SALES])).rejects.toThrow(DomainError);

    try {
      await requireContext(req, [Role.SALES]);
    } catch (e) {
      expect((e as DomainError).code).toBe('PASSWORD_CHANGE_REQUIRED');
      expect((e as DomainError).status).toBe(403);
    }
  });

  it('lolos saat mustChangePassword aktif bila allowPasswordChange: true disetel', async () => {
    vi.mocked(findValidSession).mockResolvedValueOnce({
      id: 'sess_1',
      tokenHash: 'hash',
      userId: 'usr_1',
      activeBusinessId: null,
      userAgent: null,
      ip: null,
      createdAt: new Date(),
      lastUsedAt: new Date(),
      expiresAt: new Date(Date.now() + 100000),
      revokedAt: null,
      user: {
        id: 'usr_1',
        username: 'sales1',
        passwordHash: 'hash',
        name: 'Sales One',
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
      },
    });

    const req = makeReq('valid-token');
    const ctx = await requireContext(req, [Role.SALES], {
      allowPasswordChange: true,
    });
    expect(ctx.user.id).toBe('usr_1');
    expect(ctx.role).toBe(Role.SALES);
    expect(ctx.businessId).toBe('biz_1');
  });

  it('melempar 403 FORBIDDEN bila role tidak diizinkan', async () => {
    vi.mocked(findValidSession).mockResolvedValueOnce({
      id: 'sess_1',
      tokenHash: 'hash',
      userId: 'usr_1',
      activeBusinessId: null,
      userAgent: null,
      ip: null,
      createdAt: new Date(),
      lastUsedAt: new Date(),
      expiresAt: new Date(Date.now() + 100000),
      revokedAt: null,
      user: {
        id: 'usr_1',
        username: 'sales1',
        passwordHash: 'hash',
        name: 'Sales One',
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
        lastSeenReleaseAt: null,
        lastLoginAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      },
    });

    const req = makeReq('valid-token');
    // Meminta SUPERADMIN padahal user adalah SALES
    await expect(requireContext(req, [Role.SUPERADMIN])).rejects.toThrow(
      DomainError
    );
  });

  it('requireBusiness mengembalikan businessId bila terisi dan melempar 400 bila null', () => {
    const validCtx = {
      user: { id: 'u1', role: Role.SALES, name: 'Budi', businessId: 'biz_1' },
      role: Role.SALES,
      businessId: 'biz_1',
      sessionId: 's1',
      ip: '127.0.0.1',
    };
    expect(requireBusiness(validCtx)).toBe('biz_1');

    const adminWithoutBiz = {
      user: { id: 'admin1', role: Role.SUPERADMIN, name: 'Boss', businessId: null },
      role: Role.SUPERADMIN,
      businessId: null,
      sessionId: 's2',
      ip: '127.0.0.1',
    };
    expect(() => requireBusiness(adminWithoutBiz)).toThrow(DomainError);
    try {
      requireBusiness(adminWithoutBiz);
    } catch (e) {
      expect((e as DomainError).code).toBe('BUSINESS_REQUIRED');
      expect((e as DomainError).status).toBe(400);
    }
  });
});
