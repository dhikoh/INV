import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { Role } from '@prisma/client';
import * as contextModule from '@/lib/auth/context';
import { prisma } from '@/lib/db';
import { DomainError } from '@/lib/domain/money';
import { POST as postKtp, DELETE as deleteKtp } from '@/app/api/v1/users/[id]/ktp/route';
import { POST as postDeactivate } from '@/app/api/v1/users/[id]/deactivate/route';
import { PATCH as patchUser } from '@/app/api/v1/users/[id]/route';

describe('Sales Identity & KTP Security (Anti-Fraud)', () => {
  const mockBizId = 'biz_test_01';
  const superAdminCtx = {
    user: { id: 'usr_admin', role: Role.SUPERADMIN, name: 'Super Admin', businessId: mockBizId },
    role: Role.SUPERADMIN,
    businessId: mockBizId,
    session: { id: 'sess_admin', activeBusinessId: mockBizId },
  } as unknown as contextModule.Ctx;

  const salesCtx = {
    user: { id: 'usr_sales_self', role: Role.SALES, name: 'Sales Rep', businessId: mockBizId },
    role: Role.SALES,
    businessId: mockBizId,
    session: { id: 'sess_sales', activeBusinessId: mockBizId },
  } as unknown as contextModule.Ctx;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('menolak akses upload KTP oleh peran SALES (403 Forbidden)', async () => {
    vi.spyOn(contextModule, 'requireContext').mockImplementation(async (_req, roles) => {
      if (roles && !roles.includes(Role.SALES)) {
        throw new DomainError('FORBIDDEN', 'Anda tidak punya akses', 403);
      }
      return salesCtx;
    });

    const formData = new FormData();
    formData.append('file', new Blob(['fake-ktp-image'], { type: 'image/jpeg' }), 'ktp.jpg');

    const req = new NextRequest('http://localhost:3000/api/v1/users/usr_target/ktp', {
      method: 'POST',
      headers: { origin: 'http://localhost:3000' },
      body: formData,
    });

    const res = await postKtp(req, { params: Promise.resolve({ id: 'usr_target' }) });
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error.code).toBe('FORBIDDEN');
  });

  it('menolak akses hapus KTP oleh peran SALES (403 Forbidden)', async () => {
    vi.spyOn(contextModule, 'requireContext').mockImplementation(async (_req, roles) => {
      if (roles && !roles.includes(Role.SALES)) {
        throw new DomainError('FORBIDDEN', 'Anda tidak punya akses', 403);
      }
      return salesCtx;
    });

    const req = new NextRequest('http://localhost:3000/api/v1/users/usr_target/ktp', {
      method: 'DELETE',
      headers: { origin: 'http://localhost:3000' },
    });

    const res = await deleteKtp(req, { params: Promise.resolve({ id: 'usr_target' }) });
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error.code).toBe('FORBIDDEN');
  });

  it('validasi NIK harus 16 digit angka', async () => {
    vi.spyOn(contextModule, 'requireContext').mockResolvedValue(superAdminCtx);

    const reqInvalid = new NextRequest('http://localhost:3000/api/v1/users/usr_target', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', origin: 'http://localhost:3000' },
      body: JSON.stringify({ nik: '12345' }),
    });

    const resInvalid = await patchUser(reqInvalid, { params: Promise.resolve({ id: 'usr_target' }) });
    expect(resInvalid.status).toBe(422);
    const json = await resInvalid.json();
    expect(json.error.code).toBe('VALIDATION_ERROR');
    expect(json.error.fields.nik).toContain('16 digit');
  });
});

describe('Sales Deactivation & Customer Handover Safeguard', () => {
  const mockBizId = 'biz_test_01';
  const superAdminCtx = {
    user: { id: 'usr_admin', role: Role.SUPERADMIN, name: 'Super Admin', businessId: mockBizId },
    role: Role.SUPERADMIN,
    businessId: mockBizId,
    session: { id: 'sess_admin', activeBusinessId: mockBizId },
  } as unknown as contextModule.Ctx;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('mencegah deaktivasi sales tanpa handover jika memiliki customer aktif (409 HANDOVER_REQUIRED)', async () => {
    vi.spyOn(contextModule, 'requireContext').mockResolvedValue(superAdminCtx);

    // Mock user target yang sedang dicari
    vi.spyOn(prisma.user, 'findFirst').mockResolvedValue({
      id: 'usr_sales_leaving',
      businessId: mockBizId,
      name: 'Sales Leaving',
      role: Role.SALES,
      isActive: true,
    } as never);

    // Mock customer aktif yang masih dipegang sales tersebut
    vi.spyOn(prisma.customer, 'findMany').mockResolvedValue([
      { id: 'cst_01', code: 'C01', name: 'Petshop A', phone: '08111111' },
      { id: 'cst_02', code: 'C02', name: 'Petshop B', phone: '08222222' },
    ] as never);

    const req = new NextRequest('http://localhost:3000/api/v1/users/usr_sales_leaving/deactivate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', origin: 'http://localhost:3000' },
      body: JSON.stringify({}),
    });

    const res = await postDeactivate(req, { params: Promise.resolve({ id: 'usr_sales_leaving' }) });
    expect(res.status).toBe(409);

    const json = await res.json();
    expect(json.error.code).toBe('HANDOVER_REQUIRED');
    expect(json.error.details.assignedCustomerCount).toBe(2);
    expect(json.error.details.customers).toHaveLength(2);
  });

  it('berhasil menonaktifkan sales dan mengalihkan seluruh customer jika reassignToSalesId disertakan', async () => {
    vi.spyOn(contextModule, 'requireContext').mockResolvedValue(superAdminCtx);

    // Target user to deactivate, then target user receiving customers
    vi.spyOn(prisma.user, 'findFirst')
      .mockResolvedValueOnce({
        id: 'usr_sales_leaving',
        businessId: mockBizId,
        name: 'Sales Leaving',
        role: Role.SALES,
        isActive: true,
      } as never)
      .mockResolvedValueOnce({
        id: 'usr_sales_target',
        businessId: mockBizId,
        name: 'Sales Target New',
        role: Role.SALES,
        isActive: true,
        deletedAt: null,
      } as never);

    vi.spyOn(prisma.customer, 'findMany').mockResolvedValue([
      { id: 'cst_01', code: 'C01', name: 'Petshop A', phone: '08111111' },
    ] as never);

    // Mock transaction
    vi.spyOn(prisma, '$transaction').mockImplementation(async (callback) => {
      const mockTx = {
        user: { update: vi.fn().mockResolvedValue({}) },
        customer: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
        reminder: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
        crmTask: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
        order: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
        session: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
        auditLog: { create: vi.fn().mockResolvedValue({}) },
      };
      return callback(mockTx as never);
    });

    const req = new NextRequest('http://localhost:3000/api/v1/users/usr_sales_leaving/deactivate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', origin: 'http://localhost:3000' },
      body: JSON.stringify({
        reassignToSalesId: 'usr_sales_target',
        handoverReason: 'Sales lama resign, dialihkan ke sales baru',
      }),
    });

    const res = await postDeactivate(req, { params: Promise.resolve({ id: 'usr_sales_leaving' }) });
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.data.success).toBe(true);
    expect(json.data.reassignedCustomerCount).toBe(1);
    expect(json.data.targetSales).toBe('Sales Target New');
  });
});
