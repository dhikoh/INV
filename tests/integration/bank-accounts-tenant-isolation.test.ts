import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Role } from '@prisma/client';
import { GET as getBankAccountDetail, PATCH as patchBankAccount, DELETE as deleteBankAccount } from '@/app/api/v1/bank-accounts/[id]/route';
import { GET as getBusinessBankAccounts, POST as postBusinessBankAccount } from '@/app/api/v1/businesses/[id]/bank-accounts/route';
import * as contextModule from '@/lib/auth/context';
import { DomainError } from '@/lib/domain/money';
import { prisma } from '@/lib/db';
import { NextRequest } from 'next/server';

vi.mock('@/lib/db', () => ({
  prisma: {
    bankAccount: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    business: {
      findFirst: vi.fn(),
    },
    $transaction: vi.fn(async (cb: any) => cb(prisma)),
  },
}));

vi.mock('@/lib/audit/audit', () => ({
  audit: vi.fn(async () => {}),
}));

describe('Isolasi Tenant Rekening Bank (AUD-TENANT-001 & AUD-TENANT-002)', () => {
  const superAdminCtxBiz1 = {
    user: { id: 'admin_1', name: 'Super Admin', role: Role.SUPERADMIN, businessId: 'biz_1' },
    role: Role.SUPERADMIN,
    businessId: 'biz_1',
    sessionId: 'sess_1',
    ip: '127.0.0.1',
  };

  const salesCtxBiz1 = {
    user: { id: 'sales_1', name: 'Sales Staf', role: Role.SALES, businessId: 'biz_1' },
    role: Role.SALES,
    businessId: 'biz_1',
    sessionId: 'sess_2',
    ip: '127.0.0.1',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('Super Admin berhasil mengambil detail rekening miliknya sendiri dengan businessId terpasang', async () => {
    vi.spyOn(contextModule, 'requireContext').mockResolvedValueOnce(superAdminCtxBiz1 as any);
    vi.mocked(prisma.bankAccount.findFirst).mockResolvedValueOnce({
      id: 'bank_1',
      businessId: 'biz_1',
      bankName: 'BCA',
      accountNumber: '1234567890',
      accountHolder: 'CV BentoCat Mandiri',
      isDefault: true,
      deletedAt: null,
    } as any);

    const req = new NextRequest('http://localhost:3000/api/v1/bank-accounts/bank_1');
    const res = await getBankAccountDetail(req, { params: Promise.resolve({ id: 'bank_1' }) });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.bankName).toBe('BCA');
    expect(prisma.bankAccount.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'bank_1',
        businessId: 'biz_1', // Terbukti dilingkupi businessId sesi aktif
        deletedAt: null,
      },
    });
  });

  it('Sales ditolak 403 saat mencoba mengakses rute rekening bank', async () => {
    vi.spyOn(contextModule, 'requireContext').mockRejectedValueOnce(
      new DomainError('FORBIDDEN', 'Akses ditolak', 403)
    );

    const req = new NextRequest('http://localhost:3000/api/v1/bank-accounts/bank_1');
    const res = await getBankAccountDetail(req, { params: Promise.resolve({ id: 'bank_1' }) });

    expect(res.status).toBe(403);
    expect(prisma.bankAccount.findFirst).not.toHaveBeenCalled();
  });

  it('Super Admin ditolak FORBIDDEN 403 bila mencoba mengakses rekening unit usaha lain', async () => {
    vi.spyOn(contextModule, 'requireContext').mockResolvedValueOnce(superAdminCtxBiz1 as any);

    const req = new NextRequest('http://localhost:3000/api/v1/businesses/biz_2/bank-accounts');
    const res = await getBusinessBankAccounts(req, { params: Promise.resolve({ id: 'biz_2' }) });
    const json = await res.json();

    expect(res.status).toBe(403);
    expect(json.error.code).toBe('FORBIDDEN');
    expect(json.error.message).toContain('Tidak memiliki akses ke rekening unit usaha lain');
  });

  it('Super Admin menerima 404 bila rekening ID tidak ada di unit usaha aktifnya', async () => {
    vi.spyOn(contextModule, 'requireContext').mockResolvedValueOnce(superAdminCtxBiz1 as any);
    vi.mocked(prisma.bankAccount.findFirst).mockResolvedValueOnce(null);

    const req = new NextRequest('http://localhost:3000/api/v1/bank-accounts/bank_milik_biz_2');
    const res = await getBankAccountDetail(req, { params: Promise.resolve({ id: 'bank_milik_biz_2' }) });
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json.error.code).toBe('NOT_FOUND');
  });
});
