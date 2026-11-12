import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { PaymentMethod, PaymentStatus, PaymentType, Role } from '@prisma/client';

const ctxMock = vi.hoisted(() => ({
  user: {
    id: 'admin_1',
    username: 'admin',
    name: 'Admin',
    role: 'SUPERADMIN' as Role,
  },
  role: 'SUPERADMIN' as Role,
  businessId: 'biz_1',
}));

const prismaMock = vi.hoisted(() => ({
  payment: {
    findMany: vi.fn(),
  },
  paymentBatch: {
    findMany: vi.fn(),
  },
  order: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
  },
  customer: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
  },
  user: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
  },
  invoice: {
    findMany: vi.fn(),
  },
}));

vi.mock('@/lib/db', () => ({ prisma: prismaMock }));
vi.mock('@/lib/auth/context', () => ({
  requireContext: vi.fn(async () => ctxMock),
  getSessionContext: vi.fn(async () => ctxMock),
  requireBusiness: vi.fn(() => 'biz_1'),
}));

import { GET } from '@/app/api/v1/payments/route';

describe('AUD-PERF-001: GET /api/v1/payments batch queries (no N+1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('resolves 5 pending payments with O(1) batched findMany queries', async () => {
    const now = new Date('2026-11-12T10:00:00.000Z');
    prismaMock.payment.findMany.mockResolvedValueOnce(
      [1, 2, 3, 4, 5].map((i) => ({
        id: `pay_${i}`,
        businessId: 'biz_1',
        batchId: null,
        orderId: `ord_${i}`,
        invoiceId: `inv_${i}`,
        type: PaymentType.RECEIPT,
        method: PaymentMethod.TRANSFER,
        status: PaymentStatus.PENDING_VERIFICATION,
        amount: BigInt(100000 * i),
        paidAt: now,
        reference: `REF-${i}`,
        proofPath: null,
        notes: null,
        createdById: 'sales_1',
        verifiedById: null,
        verifiedAt: null,
        rejectReason: null,
        receiptNo: null,
        verifyToken: null,
        createdAt: now,
        updatedAt: now,
      }))
    );

    prismaMock.order.findMany.mockResolvedValueOnce(
      [1, 2, 3, 4, 5].map((i) => ({
        id: `ord_${i}`,
        orderNo: `CUST${i}/INV/12/11/2026/000${i}`,
        salesId: 'sales_1',
        customerId: `cust_${i}`,
      }))
    );

    prismaMock.customer.findMany.mockResolvedValueOnce(
      [1, 2, 3, 4, 5].map((i) => ({ id: `cust_${i}`, name: `Toko ${i}` }))
    );
    prismaMock.user.findMany.mockResolvedValueOnce([
      { id: 'sales_1', name: 'Sales Andi' },
    ]);

    const res = await GET(new NextRequest('http://localhost/api/v1/payments'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(5);
    expect(body.data[0].customerName).toBe('Toko 1');
    expect(body.data[4].salesName).toBe('Sales Andi');

    expect(prismaMock.payment.findMany).toHaveBeenCalledTimes(1);
    expect(prismaMock.order.findMany).toHaveBeenCalledTimes(1);
    expect(prismaMock.customer.findMany).toHaveBeenCalledTimes(1);
    expect(prismaMock.user.findMany).toHaveBeenCalledTimes(1);
    expect(prismaMock.order.findFirst).not.toHaveBeenCalled();
    expect(prismaMock.customer.findFirst).not.toHaveBeenCalled();
    expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
  });
});
