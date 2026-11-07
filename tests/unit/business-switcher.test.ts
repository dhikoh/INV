import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST as switchBusinessHandler } from '@/app/api/v1/session/business/route';
import { GET as getActiveBusinessHandler } from '@/app/api/v1/business/route';
import { GET as getBusinessesHandler } from '@/app/api/v1/businesses/route';
import { prisma } from '@/lib/db';
import { Role } from '@prisma/client';
import * as contextModule from '@/lib/auth/context';

vi.mock('@/lib/db', () => ({
  prisma: {
    business: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
    session: {
      update: vi.fn(),
    },
  },
}));

describe('Pengalih Usaha & Endpoint Sesi Usaha (T1.2 & Seksi 5.2)', () => {
  const APP_URL = 'http://localhost:3000';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('menolak pengalih usaha bila user bukan Super Admin (403 FORBIDDEN)', async () => {
    vi.spyOn(contextModule, 'requireContext').mockRejectedValueOnce(
      new (await import('@/lib/domain/money')).DomainError(
        'FORBIDDEN',
        'Anda tidak punya akses',
        403
      )
    );

    const req = new NextRequest(APP_URL + '/api/v1/session/business', {
      method: 'POST',
      headers: {
        origin: APP_URL,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ businessId: 'biz_1' }),
    });

    const res = await switchBusinessHandler(req);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.code).toBe('FORBIDDEN');
  });

  it('mengembalikan 404 NOT_FOUND bila businessId tidak ditemukan atau dihapus', async () => {
    vi.spyOn(contextModule, 'requireContext').mockResolvedValueOnce({
      user: {
        id: 'admin1',
        role: Role.SUPERADMIN,
        name: 'Boss',
        businessId: null,
      },
      role: Role.SUPERADMIN,
      businessId: null,
      sessionId: 'sess_1',
      ip: '127.0.0.1',
    });

    vi.mocked(prisma.business.findFirst).mockResolvedValueOnce(null);

    const req = new NextRequest(APP_URL + '/api/v1/session/business', {
      method: 'POST',
      headers: {
        origin: APP_URL,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ businessId: 'biz_not_exist' }),
    });

    const res = await switchBusinessHandler(req);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe('NOT_FOUND');
    expect(body.error.message).toBe('Usaha tidak ditemukan');
  });

  it('berhasil mengubah activeBusinessId pada sesi Super Admin', async () => {
    vi.spyOn(contextModule, 'requireContext').mockResolvedValueOnce({
      user: {
        id: 'admin1',
        role: Role.SUPERADMIN,
        name: 'Boss',
        businessId: null,
      },
      role: Role.SUPERADMIN,
      businessId: null,
      sessionId: 'sess_1',
      ip: '127.0.0.1',
    });

    const mockBiz = {
      id: 'biz_trb',
      code: 'TRB',
      name: 'Terobos Makmur',
      deletedAt: null,
    };

    vi.mocked(prisma.business.findFirst).mockResolvedValueOnce(
      mockBiz as never
    );
    vi.mocked(prisma.session.update).mockResolvedValueOnce({
      id: 'sess_1',
      activeBusinessId: 'biz_trb',
    } as never);

    const req = new NextRequest(APP_URL + '/api/v1/session/business', {
      method: 'POST',
      headers: {
        origin: APP_URL,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ businessId: 'biz_trb' }),
    });

    const res = await switchBusinessHandler(req);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.data.activeBusinessId).toBe('biz_trb');
    expect(body.data.business).toEqual({
      id: 'biz_trb',
      code: 'TRB',
      name: 'Terobos Makmur',
    });

    expect(prisma.session.update).toHaveBeenCalledWith({
      where: { id: 'sess_1' },
      data: { activeBusinessId: 'biz_trb' },
    });
  });

  it('GET /api/v1/business mengembalikan null bila belum ada usaha aktif yang dipilih', async () => {
    vi.spyOn(contextModule, 'requireContext').mockResolvedValueOnce({
      user: {
        id: 'admin1',
        role: Role.SUPERADMIN,
        name: 'Boss',
        businessId: null,
      },
      role: Role.SUPERADMIN,
      businessId: null,
      sessionId: 'sess_1',
      ip: '127.0.0.1',
    });

    const req = new NextRequest(APP_URL + '/api/v1/business', {
      method: 'GET',
    });
    const res = await getActiveBusinessHandler(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toBeNull();
  });

  it('GET /api/v1/businesses mengembalikan daftar unit usaha untuk Super Admin', async () => {
    vi.spyOn(contextModule, 'requireContext').mockResolvedValueOnce({
      user: {
        id: 'admin1',
        role: Role.SUPERADMIN,
        name: 'Boss',
        businessId: null,
      },
      role: Role.SUPERADMIN,
      businessId: null,
      sessionId: 'sess_1',
      ip: '127.0.0.1',
    });

    vi.mocked(prisma.business.findMany).mockResolvedValueOnce([
      { id: 'b1', code: 'TRB', name: 'Terobos Makmur', logoPath: null },
      { id: 'b2', code: 'JAYA', name: 'Jaya Abadi', logoPath: null },
    ] as never);

    const req = new NextRequest(APP_URL + '/api/v1/businesses', {
      method: 'GET',
    });
    const res = await getBusinessesHandler(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(2);
    expect(body.data[0].code).toBe('TRB');
  });
});
