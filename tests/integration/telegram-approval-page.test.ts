import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { Role, InvoiceStatus } from '@prisma/client';
import { POST as approveHandler } from '@/app/api/v1/invoices/[id]/approve/route';
import { POST as rejectHandler } from '@/app/api/v1/invoices/[id]/reject/route';
import * as contextModule from '@/lib/auth/context';
import { DomainError } from '@/lib/domain/money';
import { prisma } from '@/lib/db';

const headers = {
  'Content-Type': 'application/json',
  origin: 'http://localhost:3000',
};

vi.mock('@/lib/db', () => ({
  prisma: {
    $transaction: vi.fn(async (cb: (tx: unknown) => Promise<unknown>) => cb(prisma)),
    invoice: {
      findFirst: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    order: {
      findFirst: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    auditLog: {
      create: vi.fn(),
    },
    notification: {
      create: vi.fn(),
    },
  },
}));

vi.mock('@/lib/services/invoice', () => ({
  approveInvoice: vi.fn(async (_tx, ctx, id, body) => {
    if (ctx.role !== Role.SUPERADMIN) {
      throw new DomainError('FORBIDDEN', 'Hanya Super Admin yang dapat menyetujui faktur', 403);
    }
    return {
      id,
      number: 'INV/2026/001',
      status: InvoiceStatus.APPROVED,
      overrideNote: body?.overrideNote || null,
    };
  }),
  rejectInvoice: vi.fn(async (_tx, ctx, id, body) => {
    if (ctx.role !== Role.SUPERADMIN) {
      throw new DomainError('FORBIDDEN', 'Hanya Super Admin yang dapat menolak faktur', 403);
    }
    if (!body?.reason || body.reason.trim().length < 5) {
      throw new DomainError('VALIDATION_ERROR', 'Alasan penolakan minimal 5 karakter', 422);
    }
    return {
      id,
      status: InvoiceStatus.REJECTED,
      rejectionReason: body.reason,
    };
  }),
}));

describe('Persetujuan Faktur Mini App Telegram (AUD-GAP-001 & BLUEPRINT Bagian 8)', () => {
  const superAdminCtx = {
    user: { id: 'admin_1', name: 'Super Admin', role: Role.SUPERADMIN, businessId: 'biz_1' },
    role: Role.SUPERADMIN,
    businessId: 'biz_1',
    sessionId: 'sess_admin',
    ip: '127.0.0.1',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('Super Admin berhasil menyetujui invoice melalui endpoint persetujuan', async () => {
    vi.spyOn(contextModule, 'requireContext').mockResolvedValueOnce(
      superAdminCtx as unknown as contextModule.Ctx
    );

    const req = new NextRequest('http://localhost:3000/api/v1/invoices/inv_123/approve', {
      method: 'POST',
      headers,
      body: JSON.stringify({ theme: 'PROFESIONAL' }),
    });

    const res = await approveHandler(req, { params: Promise.resolve({ id: 'inv_123' }) });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.status).toBe(InvoiceStatus.APPROVED);
    expect(json.data.number).toBe('INV/2026/001');
  });

  it('Sales ditolak 403 saat mencoba menyetujui faktur', async () => {
    vi.spyOn(contextModule, 'requireContext').mockRejectedValueOnce(
      new DomainError('FORBIDDEN', 'Akses ditolak', 403)
    );

    const req = new NextRequest('http://localhost:3000/api/v1/invoices/inv_123/approve', {
      method: 'POST',
      headers,
      body: JSON.stringify({ theme: 'PROFESIONAL' }),
    });

    const res = await approveHandler(req, { params: Promise.resolve({ id: 'inv_123' }) });
    expect(res.status).toBe(403);
  });

  it('Super Admin berhasil menolak faktur dengan alasan minimal 5 karakter', async () => {
    vi.spyOn(contextModule, 'requireContext').mockResolvedValueOnce(
      superAdminCtx as unknown as contextModule.Ctx
    );

    const req = new NextRequest('http://localhost:3000/api/v1/invoices/inv_123/reject', {
      method: 'POST',
      headers,
      body: JSON.stringify({ reason: 'Diskon melebihi plafon wewenang sales' }),
    });

    const res = await rejectHandler(req, { params: Promise.resolve({ id: 'inv_123' }) });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.status).toBe(InvoiceStatus.REJECTED);
    expect(json.data.rejectionReason).toBe('Diskon melebihi plafon wewenang sales');
  });

  it('Penolakan faktur ditolak 422 bila alasan kurang dari 5 karakter', async () => {
    vi.spyOn(contextModule, 'requireContext').mockResolvedValueOnce(
      superAdminCtx as unknown as contextModule.Ctx
    );

    const req = new NextRequest('http://localhost:3000/api/v1/invoices/inv_123/reject', {
      method: 'POST',
      headers,
      body: JSON.stringify({ reason: 'no' }), // Kurang dari 5 karakter
    });

    const res = await rejectHandler(req, { params: Promise.resolve({ id: 'inv_123' }) });
    const json = await res.json();

    expect(res.status).toBe(422);
    expect(json.ok).toBe(false);
  });
});
