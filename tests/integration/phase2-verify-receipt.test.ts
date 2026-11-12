import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import {
  Role,
  OrderStatus,
  InvoiceType,
  InvoiceStatus,
  PaymentStatus,
  PaymentType,
  PaymentMethod,
  InvoiceTheme,
} from '@prisma/client';
import type { Ctx } from '@/lib/auth/context';
import * as contextModule from '@/lib/auth/context';
import { verifyPayment, TxClient } from '@/lib/services/payment';
import { resolvePublicVerifyDocument } from '@/lib/services/verify';
import { GET as publicVerifyHandler } from '@/app/api/v1/public/verify/[token]/route';
import { GET as receiptPdfHandler } from '@/app/api/v1/payments/[id]/receipt/pdf/route';

vi.mock('@/lib/pdf/response', () => ({
  renderElementToPdfResponse: vi.fn(async (_el: unknown, filename: string) => {
    return new Response(new Uint8Array([37, 80, 68, 70, 45]), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${filename}"`,
      },
    });
  }),
}));

interface MockOrder {
  id: string;
  businessId: string;
  customerId: string;
  salesId: string;
  orderNo: string | null;
  orderDate: Date;
  deliveryAddress?: string | null;
  status: OrderStatus;
  grandTotal: bigint;
  dpAmount: bigint;
  dpBps?: number;
  paidTotal: bigint;
  creditTotal: bigint;
  verifyToken: string;
  deletedAt: Date | null;
}

interface MockInvoice {
  id: string;
  businessId: string;
  orderId: string;
  customerId?: string;
  type: InvoiceType;
  status: InvoiceStatus;
  number: string | null;
  amount: bigint;
  paidAmount: bigint;
  issueDate: Date;
  dueDate: Date | null;
  createdAt?: Date;
  verifyToken: string;
  voidReason?: string | null;
  deletedAt: Date | null;
}

interface MockPayment {
  id: string;
  businessId: string;
  orderId: string;
  invoiceId: string | null;
  type: PaymentType;
  method: PaymentMethod;
  status: PaymentStatus;
  amount: bigint;
  paidAt: Date;
  reference: string | null;
  proofPath: string | null;
  receiptNo: string | null;
  verifyToken: string | null;
  createdById: string;
  verifiedById: string | null;
  verifiedAt: Date | null;
  rejectReason?: string | null;
  notes?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
}

type WhereFilter = Record<string, unknown>;
type UpdateArgs = { where: WhereFilter; data: Record<string, unknown> };

const db = vi.hoisted(() => ({
  business: {
    id: 'biz_p2',
    code: 'BC',
    name: 'BentoCat',
    legalName: 'CV BentoCat Mandiri',
    address: 'Jl. Industri Raya No. 7, Sidoarjo',
    phone: '0811223344',
    email: 'admin@bentocat.id',
    npwp: '01.234.567.8-999.000',
    logoPath: null,
    invoiceTheme: 'PROFESIONAL' as InvoiceTheme,
    showBankOnProforma: false,
    paymentLegalNotice: null as string | null,
  },
  bankAccounts: [
    {
      id: 'bank_1',
      businessId: 'biz_p2',
      bankName: 'BCA',
      accountNumber: '8880001122',
      accountHolder: 'CV BentoCat Mandiri',
      isDefault: true,
      deletedAt: null,
    },
  ],
  customers: [
    {
      id: 'cust_p2',
      businessId: 'biz_p2',
      code: 'C001',
      name: 'PT Sumber Bahagia Lestari',
      contactName: 'Budi Santoso Rahasia',
      address: 'Jl. Rahasia Tersembunyi No. 45, Surabaya 60111',
      phone: '089988776655',
    },
  ],
  orders: [] as MockOrder[],
  invoices: [] as MockInvoice[],
  payments: [] as MockPayment[],
  auditLogs: [] as Record<string, unknown>[],
  notifications: [] as Record<string, unknown>[],
  counters: [{ id: 'cnt_p2', lastSeq: 1 }],
}));

vi.mock('@/lib/services/reminder', () => ({
  updateRemindersForCompletedOrder: vi.fn(async () => {}),
  rebuildRemindersForCustomer: vi.fn(async () => {}),
}));

vi.mock('@/lib/services/commission', () => ({
  evaluateOrderCommission: vi.fn(async () => null),
  reverseOrderCommission: vi.fn(async () => {}),
}));

vi.mock('@/lib/services/orderGuard', () => ({
  lockOrder: vi.fn(async () => {}),
  lockInvoice: vi.fn(async () => {}),
}));

vi.mock('@/lib/db', () => {
  const txMock: Record<string, unknown> = {
    documentCounter: true,
    $queryRaw: vi.fn(async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const sql = strings.join(' ');
      if (sql.includes('INSERT INTO "DocumentCounter"')) {
        db.counters[0].lastSeq += 1;
        return [{ lastSeq: BigInt(db.counters[0].lastSeq) }];
      }
      const token = String(values[0] ?? '');
      if (sql.includes('FROM "Invoice"')) {
        return db.invoices
          .filter((i) => i.verifyToken === token && i.deletedAt === null)
          .slice(0, 1)
          .map((i) => ({ id: i.id, businessId: i.businessId }));
      }
      if (sql.includes('FROM "Payment"')) {
        return db.payments
          .filter((p) => p.verifyToken === token)
          .slice(0, 1)
          .map((p) => ({ id: p.id, businessId: p.businessId }));
      }
      if (sql.includes('FROM "Order"')) {
        return db.orders
          .filter((o) => o.verifyToken === token && o.deletedAt === null)
          .slice(0, 1)
          .map((o) => ({ id: o.id, businessId: o.businessId }));
      }
      return [];
    }),
    business: {
      findFirst: vi.fn(async ({ where }: { where?: WhereFilter }) =>
        where?.id === db.business.id ? db.business : null
      ),
    },
    bankAccount: {
      findMany: vi.fn(async ({ where }: { where: WhereFilter }) =>
        db.bankAccounts.filter(
          (b) => b.businessId === where.businessId && b.deletedAt === null
        )
      ),
    },
    customer: {
      findFirst: vi.fn(async ({ where }: { where: WhereFilter }) =>
        db.customers.find(
          (c) => c.id === where.id && c.businessId === where.businessId
        ) ?? null
      ),
    },
    order: {
      findFirst: vi.fn(async ({ where }: { where: WhereFilter }) => {
        const ord = db.orders.find(
          (o) =>
            o.id === where.id &&
            o.businessId === where.businessId &&
            (where.deletedAt !== null || o.deletedAt === null)
        );
        if (!ord) return null;
        const cust = db.customers.find((c) => c.id === ord.customerId);
        return { ...ord, customer: cust };
      }),
      updateMany: vi.fn(async ({ where, data }: UpdateArgs) => {
        let count = 0;
        for (const o of db.orders) {
          if (o.id === where.id && o.businessId === where.businessId) {
            if (data.status !== undefined) o.status = data.status as OrderStatus;
            if (data.paidTotal !== undefined) o.paidTotal = data.paidTotal as bigint;
            count += 1;
          }
        }
        return { count };
      }),
    },
    invoice: {
      findFirst: vi.fn(async ({ where }: { where: WhereFilter }) => {
        return (
          db.invoices.find(
            (i) =>
              (where.id ? i.id === where.id : true) &&
              (where.orderId ? i.orderId === where.orderId : true) &&
              (where.type ? i.type === where.type : true) &&
              (where.status ? i.status === where.status : true) &&
              i.businessId === where.businessId &&
              i.deletedAt === null
          ) ?? null
        );
      }),
      findMany: vi.fn(async ({ where }: { where: WhereFilter }) =>
        db.invoices.filter(
          (i) =>
            i.orderId === where.orderId &&
            i.businessId === where.businessId &&
            i.deletedAt === null
        )
      ),
      updateMany: vi.fn(async ({ where, data }: UpdateArgs) => {
        let count = 0;
        for (const i of db.invoices) {
          if (i.id === where.id && i.businessId === where.businessId) {
            Object.assign(i, data);
            count += 1;
          }
        }
        return { count };
      }),
    },
    payment: {
      findFirst: vi.fn(async ({ where }: { where: WhereFilter }) => {
        const pay = db.payments.find(
          (p) => p.id === where.id && p.businessId === where.businessId
        );
        if (!pay) return null;
        return { ...pay, business: db.business };
      }),
      findFirstOrThrow: vi.fn(async ({ where }: { where: WhereFilter }) => {
        const pay = db.payments.find(
          (p) => p.id === where.id && p.businessId === where.businessId
        );
        if (!pay) throw new Error('Payment not found');
        return pay;
      }),
      findMany: vi.fn(async ({ where }: { where: WhereFilter }) =>
        db.payments.filter(
          (p) =>
            p.businessId === where.businessId &&
            p.orderId === where.orderId &&
            (!where.status || p.status === where.status)
        )
      ),
      updateMany: vi.fn(async ({ where, data }: UpdateArgs) => {
        let count = 0;
        for (const p of db.payments) {
          if (p.id === where.id && p.businessId === where.businessId) {
            Object.assign(p, data);
            count += 1;
          }
        }
        return { count };
      }),
    },
    shipment: {
      findFirst: vi.fn(async () => null),
    },
    auditLog: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        db.auditLogs.push(data);
        return data;
      }),
    },
    notification: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        db.notifications.push(data);
        return data;
      }),
    },
  };
  txMock.$transaction = vi.fn(
    async <T>(cb: (tx: Record<string, unknown>) => Promise<T>): Promise<T> =>
      cb(txMock)
  );
  return { prisma: txMock };
});

function makeCtx(role: Role, userId: string): Ctx {
  return {
    user: { id: userId, name: userId, role, businessId: 'biz_p2' },
    role,
    businessId: 'biz_p2',
    sessionId: `sess_${userId}`,
    ip: '127.0.0.1',
  };
}

describe('Fase 2 Integration Tests — Public Verify QR & Official VERIFIED Receipt', () => {
  beforeEach(() => {
    db.business.showBankOnProforma = false;
    db.business.paymentLegalNotice = null;
    db.counters[0].lastSeq = 1;
    db.auditLogs = [];
    db.notifications = [];

    db.orders = [
      {
        id: 'ord_proforma',
        businessId: 'biz_p2',
        orderNo: 'ORD-C001-20261112-001',
        orderDate: new Date('2026-11-12T00:00:00Z'),
        status: OrderStatus.DRAFT,
        customerId: 'cust_p2',
        salesId: 'sales_1',
        deliveryAddress: 'Jl. Rahasia Tersembunyi No. 45, Surabaya 60111',
        grandTotal: BigInt(4000000),
        paidTotal: BigInt(0),
        creditTotal: BigInt(0),
        dpAmount: BigInt(2000000),
        dpBps: 5000,
        deletedAt: null,
        verifyToken: 'ver_proforma_tok_001',
      },
      {
        id: 'ord_active',
        businessId: 'biz_p2',
        orderNo: 'ORD-C001-20261112-002',
        orderDate: new Date('2026-11-12T00:00:00Z'),
        status: OrderStatus.AWAITING_DP,
        customerId: 'cust_p2',
        salesId: 'sales_1',
        deliveryAddress: 'Jl. Rahasia Tersembunyi No. 45, Surabaya 60111',
        grandTotal: BigInt(6000000),
        paidTotal: BigInt(3000000),
        creditTotal: BigInt(0),
        dpAmount: BigInt(3000000),
        dpBps: 5000,
        deletedAt: null,
        verifyToken: 'ver_order_active_002',
      },
    ];

    db.invoices = [
      {
        id: 'inv_dp_approved',
        businessId: 'biz_p2',
        orderId: 'ord_active',
        number: 'INV-C001-20261112-001',
        type: InvoiceType.DP,
        status: InvoiceStatus.APPROVED,
        amount: BigInt(4500000),
        paidAmount: BigInt(3000000),
        issueDate: new Date('2026-11-12T00:00:00Z'),
        dueDate: new Date('2026-11-19T00:00:00Z'),
        createdAt: new Date('2026-11-12T00:00:00Z'),
        deletedAt: null,
        verifyToken: 'ver_inv_approved_001',
      },
      {
        id: 'inv_dp_void',
        businessId: 'biz_p2',
        orderId: 'ord_active',
        number: 'INV-C001-20261112-002',
        type: InvoiceType.DP,
        status: InvoiceStatus.VOID,
        amount: BigInt(3000000),
        paidAmount: BigInt(0),
        issueDate: new Date('2026-11-12T00:00:00Z'),
        dueDate: null,
        createdAt: new Date('2026-11-12T00:00:00Z'),
        deletedAt: null,
        verifyToken: 'ver_inv_void_002',
      },
    ];

    db.payments = [
      {
        id: 'pay_pending',
        businessId: 'biz_p2',
        orderId: 'ord_active',
        invoiceId: 'inv_dp_approved',
        type: PaymentType.RECEIPT,
        method: PaymentMethod.TRANSFER,
        status: PaymentStatus.PENDING_VERIFICATION,
        amount: BigInt(1500000),
        paidAt: new Date('2026-11-12T02:00:00Z'),
        reference: 'TRF-001',
        proofPath: 'proof/pay1.png',
        notes: 'Catatan internal rahasia',
        createdById: 'sales_1',
        verifiedById: null,
        verifiedAt: null,
        rejectReason: null,
        receiptNo: null,
        verifyToken: null,
        createdAt: new Date('2026-11-12T02:00:00Z'),
        updatedAt: new Date('2026-11-12T02:00:00Z'),
      },
      {
        id: 'pay_verified_legacy',
        businessId: 'biz_p2',
        orderId: 'ord_active',
        invoiceId: 'inv_dp_approved',
        type: PaymentType.RECEIPT,
        method: PaymentMethod.TRANSFER,
        status: PaymentStatus.VERIFIED,
        amount: BigInt(3000000),
        paidAt: new Date('2026-11-12T03:00:00Z'),
        reference: 'TRF-VERIFIED-01',
        proofPath: 'proof/pay2.png',
        notes: null,
        createdById: 'sales_1',
        verifiedById: 'sa_1',
        verifiedAt: new Date('2026-11-12T03:10:00Z'),
        rejectReason: null,
        receiptNo: null,
        verifyToken: null,
        createdAt: new Date('2026-11-12T03:00:00Z'),
        updatedAt: new Date('2026-11-12T03:10:00Z'),
      },
      {
        id: 'pay_void',
        businessId: 'biz_p2',
        orderId: 'ord_active',
        invoiceId: 'inv_dp_approved',
        type: PaymentType.RECEIPT,
        method: PaymentMethod.TRANSFER,
        status: PaymentStatus.VOID,
        amount: BigInt(1000000),
        paidAt: new Date('2026-11-12T01:00:00Z'),
        reference: 'TRF-VOID',
        proofPath: null,
        notes: null,
        createdById: 'sales_1',
        verifiedById: 'sa_1',
        verifiedAt: new Date('2026-11-12T01:05:00Z'),
        rejectReason: 'Salah transfer',
        receiptNo: 'KWT-C001-20261112-001',
        verifyToken: 'ver_pay_void_001',
        createdAt: new Date('2026-11-12T01:00:00Z'),
        updatedAt: new Date('2026-11-12T01:30:00Z'),
      },
    ];
  });

  it('Public verify Proforma mematuhi showBankOnProforma, masking PII, dan zero leakage internal', async () => {
    const docHiddenBank = await resolvePublicVerifyDocument('ver_proforma_tok_001');
    expect(docHiddenBank).not.toBeNull();
    expect(docHiddenBank!.authenticityStatus).toBe('PROFORMA_DRAFT');
    expect(docHiddenBank!.documentType).toBe('PROFORMA_ORDER');
    expect(docHiddenBank!.banks).toEqual([]);
    expect(docHiddenBank!.customerName).toMatch(/^PT /);
    expect(docHiddenBank!.customerName).not.toContain('Bahagia');
    expect(docHiddenBank!.maskedAddress).not.toContain('Rahasia');
    expect(docHiddenBank!.maskedAddress).not.toContain('45');
    expect(JSON.stringify(docHiddenBank)).not.toContain('089988776655');
    expect(JSON.stringify(docHiddenBank)).not.toContain('costPrice');

    db.business.showBankOnProforma = true;
    const docShownBank = await resolvePublicVerifyDocument('ver_proforma_tok_001');
    expect(docShownBank!.banks.length).toBe(1);
    expect(docShownBank!.banks[0].accountNumber).toBe('8880001122');
  });

  it('Public verify membedakan faktur APPROVED, faktur VOID, dan kwitansi VOID/VERIFIED', async () => {
    const invApprovedRes = await publicVerifyHandler(
      new NextRequest('http://localhost/api/v1/public/verify/ver_inv_approved_001'),
      { params: Promise.resolve({ token: 'ver_inv_approved_001' }) }
    );
    expect(invApprovedRes.status).toBe(200);
    const invApprovedJson = await invApprovedRes.json();
    expect(invApprovedJson.data.authenticityStatus).toBe('OFFICIAL_APPROVED');
    expect(invApprovedJson.data.banks.length).toBe(1);
    expect(invApprovedJson.data.verifiedPayments.length).toBe(1);

    const invVoidRes = await publicVerifyHandler(
      new NextRequest('http://localhost/api/v1/public/verify/ver_inv_void_002'),
      { params: Promise.resolve({ token: 'ver_inv_void_002' }) }
    );
    expect(invVoidRes.status).toBe(200);
    const invVoidJson = await invVoidRes.json();
    expect(invVoidJson.data.authenticityStatus).toBe('CANCELLED_OR_VOID');
    expect(invVoidJson.data.banks).toEqual([]);

    const payVoidDoc = await resolvePublicVerifyDocument('ver_pay_void_001');
    expect(payVoidDoc!.authenticityStatus).toBe('CANCELLED_OR_VOID');
  });

  it('Public verify mengembalikan 404 untuk token palsu dan 429 saat melampaui rate limit', async () => {
    const notFoundRes = await publicVerifyHandler(
      new NextRequest('http://localhost/api/v1/public/verify/ver_tidak_ada_sama_sekali', {
        headers: { 'x-forwarded-for': '10.10.20.1' },
      }),
      { params: Promise.resolve({ token: 'ver_tidak_ada_sama_sekali' }) }
    );
    expect(notFoundRes.status).toBe(404);

    // Uji rate limit 60/menit pada IP khusus 10.99.99.77
    let limitedStatus = 200;
    for (let i = 0; i < 65; i++) {
      const r = await publicVerifyHandler(
        new NextRequest('http://localhost/api/v1/public/verify/ver_inv_approved_001', {
          headers: { 'x-forwarded-for': '10.99.99.77' },
        }),
        { params: Promise.resolve({ token: 'ver_inv_approved_001' }) }
      );
      if (r.status === 429) {
        limitedStatus = 429;
        break;
      }
    }
    expect(limitedStatus).toBe(429);
  });

  it('Cetak Kwitansi PDF ditolak (409) bila pembayaran belum VERIFIED dan 403 untuk sales lain', async () => {
    vi.spyOn(contextModule, 'requireContext').mockResolvedValue(
      makeCtx(Role.SALES, 'sales_1')
    );

    const pendingRes = await receiptPdfHandler(
      new NextRequest('http://localhost/api/v1/payments/pay_pending/receipt/pdf'),
      { params: Promise.resolve({ id: 'pay_pending' }) }
    );
    expect(pendingRes.status).toBe(409);

    const voidRes = await receiptPdfHandler(
      new NextRequest('http://localhost/api/v1/payments/pay_void/receipt/pdf'),
      { params: Promise.resolve({ id: 'pay_void' }) }
    );
    expect(voidRes.status).toBe(409);

    // Sales lain dilarang mencetak kwitansi order orang lain
    vi.spyOn(contextModule, 'requireContext').mockResolvedValue(
      makeCtx(Role.SALES, 'sales_lain')
    );
    const forbiddenRes = await receiptPdfHandler(
      new NextRequest('http://localhost/api/v1/payments/pay_verified_legacy/receipt/pdf'),
      { params: Promise.resolve({ id: 'pay_verified_legacy' }) }
    );
    expect(forbiddenRes.status).toBe(403);
  });

  it('Cetak Kwitansi PDF sukses (200) untuk payment VERIFIED dan mengisi receiptNo secara atomik bila legacy', async () => {
    vi.spyOn(contextModule, 'requireContext').mockResolvedValue(
      makeCtx(Role.SALES, 'sales_1')
    );

    const okRes = await receiptPdfHandler(
      new NextRequest('http://localhost/api/v1/payments/pay_verified_legacy/receipt/pdf'),
      { params: Promise.resolve({ id: 'pay_verified_legacy' }) }
    );
    expect(okRes.status).toBe(200);
    expect(okRes.headers.get('Content-Type')).toBe('application/pdf');

    const updatedLegacy = db.payments.find((p) => p.id === 'pay_verified_legacy');
    expect(updatedLegacy!.receiptNo).toMatch(/^C001\/KWT\/\d{2}\/\d{2}\/\d{4}\/\d{4}$/);
    expect(updatedLegacy!.verifyToken).toMatch(/^ver_/);

    // Kwitansi yang baru dialokasikan juga bisa diverifikasi via QR token publik
    const verifyReceiptDoc = await resolvePublicVerifyDocument(updatedLegacy!.verifyToken!);
    expect(verifyReceiptDoc).not.toBeNull();
    expect(verifyReceiptDoc!.authenticityStatus).toBe('VERIFIED_RECEIPT');
    expect(verifyReceiptDoc!.documentNumber).toBe(updatedLegacy!.receiptNo);
  });

  it('verifyPayment mengalokasikan receiptNo dan verifyToken secara atomik saat Super Admin memverifikasi pembayaran', async () => {
    const { prisma } = await import('@/lib/db');
    const verified = await verifyPayment(
      prisma as unknown as TxClient,
      makeCtx(Role.SUPERADMIN, 'sa_1'),
      'pay_pending'
    );

    expect(verified.status).toBe(PaymentStatus.VERIFIED);
    expect(verified.receiptNo).toMatch(/^C001\/KWT\/\d{2}\/\d{2}\/\d{4}\/\d{4}$/);
    expect(verified.verifyToken).toMatch(/^ver_/);
  });

  it('Cetak Kwitansi PDF di balik reverse proxy memakai domain APP_URL dan token QR-nya langsung valid di /api/v1/public/verify', async () => {
    const prevAppUrl = process.env.APP_URL;
    process.env.APP_URL = 'https://modula.click';
    try {
      const { renderElementToPdfResponse } = await import('@/lib/pdf/response');
      const renderMock = vi.mocked(renderElementToPdfResponse);
      renderMock.mockClear();

      vi.spyOn(contextModule, 'requireContext').mockResolvedValue(
        makeCtx(Role.SALES, 'sales_1')
      );

      // Request disimulasikan tiba di internal container localhost:3000 (skenario Coolify)
      const okRes = await receiptPdfHandler(
        new NextRequest('http://localhost:3000/api/v1/payments/pay_verified_legacy/receipt/pdf'),
        { params: Promise.resolve({ id: 'pay_verified_legacy' }) }
      );
      expect(okRes.status).toBe(200);
      expect(renderMock).toHaveBeenCalledTimes(1);

      const renderedEl = renderMock.mock.calls[0]?.[0] as {
        props?: { verifyUrl?: string | null; qrDataUri?: string | null };
      };
      const verifyUrl = renderedEl?.props?.verifyUrl ?? '';
      expect(verifyUrl.startsWith('https://modula.click/verify/ver_')).toBe(true);
      expect(verifyUrl).not.toContain('localhost');
      expect(renderedEl?.props?.qrDataUri?.startsWith('data:image/svg+xml;base64,')).toBe(true);

      // Ekstrak token langsung dari URL pada QR dan uji resolusi publiknya
      const tokenFromQr = new URL(verifyUrl).pathname.split('/').pop()!;
      const publicRes = await publicVerifyHandler(
        new NextRequest(`https://modula.click/api/v1/public/verify/${tokenFromQr}`, {
          headers: { 'x-forwarded-for': '10.88.88.1' },
        }),
        { params: Promise.resolve({ token: tokenFromQr }) }
      );
      expect(publicRes.status).toBe(200);
      const publicJson = await publicRes.json();
      expect(publicJson.data.authenticityStatus).toBe('VERIFIED_RECEIPT');
      expect(publicJson.data.token).toBe(tokenFromQr);
    } finally {
      if (prevAppUrl === undefined) {
        delete process.env.APP_URL;
      } else {
        process.env.APP_URL = prevAppUrl;
      }
    }
  });
});
