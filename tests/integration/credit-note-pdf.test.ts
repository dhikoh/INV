import { describe, it, expect, beforeEach, vi } from 'vitest';
import React from 'react';
import { NextRequest } from 'next/server';
import { Role } from '@prisma/client';
import { GET as getCreditNotePdfHandler } from '@/app/api/v1/credit-notes/[id]/pdf/route';
import { GET as serveDownloadHandler } from '@/app/api/v1/dl/[token]/route';
import { CreditNoteDocument, CreditNotePdfData } from '@/lib/pdf/CreditNoteDocument';
import { renderReactToHtml } from '@/lib/pdf/engine';
import { createDownloadToken } from '@/lib/pdf/downloadToken';
import { env } from '@/lib/env';
import * as contextModule from '@/lib/auth/context';
import { assertNoSecretKeys } from '../helpers/leak';

interface MockUser {
  id: string;
  role: Role;
  name: string;
  businessId: string | null;
  isActive: boolean;
  deletedAt: Date | null;
}

interface MockCreditNote {
  id: string;
  businessId: string;
  orderId: string;
  number: string;
  settlement: string;
  reason: string;
  amountExPpn: bigint;
  ppnAmount: bigint;
  total: bigint;
  cogsReversed: bigint;
  createdAt: Date;
  voidedAt: Date | null;
  business: Record<string, unknown>;
  items: Array<{
    id: string;
    orderItemId: string;
    qty: number;
    restock: boolean;
    creditAmount: bigint;
  }>;
}

interface MockOrder {
  id: string;
  orderNo: string;
  businessId: string;
  salesId: string;
  deletedAt: Date | null;
  customer: {
    code: string;
    name: string;
    contactName: string | null;
    address: string | null;
    phone: string | null;
  };
  items: Array<{
    id: string;
    sku: string;
    productName: string;
    unit: string;
  }>;
}

interface MockAuditLog {
  action?: string;
  summary?: string;
  [key: string]: unknown;
}

let mockUsers: MockUser[] = [];
let mockCreditNotes: MockCreditNote[] = [];
let mockOrders: MockOrder[] = [];
let mockAuditLogs: MockAuditLog[] = [];

vi.mock('@/lib/db', () => ({
  prisma: {
    user: {
      findFirst: vi.fn(async ({ where }: { where: { id?: string; isActive?: boolean; deletedAt?: Date | null } }) => {
        return (
          mockUsers.find((u) => {
            if (where.id && u.id !== where.id) return false;
            if (where.isActive !== undefined && u.isActive !== where.isActive) return false;
            if (where.deletedAt === null && u.deletedAt !== null) return false;
            return true;
          }) || null
        );
      }),
    },
    creditNote: {
      findFirst: vi.fn(async ({ where }: { where: { id?: string; businessId?: string } }) => {
        return (
          mockCreditNotes.find((c) => {
            if (where.id && c.id !== where.id) return false;
            if (where.businessId && c.businessId !== where.businessId) return false;
            return true;
          }) || null
        );
      }),
    },
    order: {
      findFirst: vi.fn(async ({ where }: { where: { id?: string; businessId?: string; deletedAt?: Date | null } }) => {
        return (
          mockOrders.find((o) => {
            if (where.id && o.id !== where.id) return false;
            if (where.businessId && o.businessId !== where.businessId) return false;
            if (where.deletedAt === null && o.deletedAt !== null) return false;
            return true;
          }) || null
        );
      }),
    },
    auditLog: {
      create: vi.fn(async ({ data }: { data: MockAuditLog }) => {
        mockAuditLogs.push(data);
        return data;
      }),
    },
  },
}));

vi.mock('@/lib/pdf/engine', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/pdf/engine')>();
  return {
    ...actual,
    renderReactToPdf: vi.fn(async () => Buffer.from('%PDF-1.4 mock credit note pdf')),
  };
});

describe('Integrasi Cetak PDF Nota Kredit (Direct Route, Token dl/[token], & Anti-HPP Leak)', () => {
  const BIZ_ID = 'biz_cat_01';
  const OTHER_BIZ_ID = 'biz_other_02';
  const SALES_1_ID = 'usr_sales_01';
  const SALES_2_ID = 'usr_sales_02';
  const SA_ID = 'usr_sa_01';

  const superAdminCtx = {
    user: { id: SA_ID, role: Role.SUPERADMIN, name: 'Owner BentoCat', businessId: BIZ_ID },
    role: Role.SUPERADMIN,
    businessId: BIZ_ID,
    sessionId: 'sess_sa_01',
    ip: '127.0.0.1',
  };

  const sales1Ctx = {
    user: { id: SALES_1_ID, role: Role.SALES, name: 'Budi Sales', businessId: BIZ_ID },
    role: Role.SALES,
    businessId: BIZ_ID,
    sessionId: 'sess_s1_01',
    ip: '127.0.0.1',
  };

  const sales2Ctx = {
    user: { id: SALES_2_ID, role: Role.SALES, name: 'Sari Sales', businessId: BIZ_ID },
    role: Role.SALES,
    businessId: BIZ_ID,
    sessionId: 'sess_s2_01',
    ip: '127.0.0.1',
  };

  const baseBusiness = {
    id: BIZ_ID,
    name: 'CV BentoCat Mandiri',
    legalName: 'CV BentoCat Mandiri Utama',
    address: 'Jl. Raya Blitar No. 88',
    phone: '081234567890',
    email: 'cs@bentocat.id',
    npwp: '01.234.567.8-653.000',
    logoPath: null,
  };

  beforeEach(() => {
    mockUsers = [
      { id: SA_ID, role: Role.SUPERADMIN, name: 'Owner BentoCat', businessId: BIZ_ID, isActive: true, deletedAt: null },
      { id: SALES_1_ID, role: Role.SALES, name: 'Budi Sales', businessId: BIZ_ID, isActive: true, deletedAt: null },
      { id: SALES_2_ID, role: Role.SALES, name: 'Sari Sales', businessId: BIZ_ID, isActive: true, deletedAt: null },
    ];

    mockOrders = [
      {
        id: 'ord_sales1',
        orderNo: 'ORD/2026/05/0001',
        businessId: BIZ_ID,
        salesId: SALES_1_ID,
        deletedAt: null,
        customer: {
          code: 'CUST-001',
          name: 'Toko Kucing Bahagia',
          contactName: 'Ibu Rina',
          address: 'Jl. Melati No. 3',
          phone: '08111222333',
        },
        items: [
          {
            id: 'oi_1',
            sku: 'BC-LAV-10',
            productName: 'BentoCat Lavender 10L',
            unit: 'sak',
          },
        ],
      },
      {
        id: 'ord_other_biz',
        orderNo: 'ORD/2026/05/9999',
        businessId: OTHER_BIZ_ID,
        salesId: SALES_1_ID,
        deletedAt: null,
        customer: {
          code: 'CUST-999',
          name: 'Toko Tenant Lain',
          contactName: null,
          address: null,
          phone: null,
        },
        items: [],
      },
    ];

    mockCreditNotes = [
      {
        id: 'cn_active_1',
        businessId: BIZ_ID,
        orderId: 'ord_sales1',
        number: 'CN/2026/05/0001',
        settlement: 'CUSTOMER_CREDIT',
        reason: 'Retur 2 sak kempes saat pengiriman',
        amountExPpn: 100000n,
        ppnAmount: 11000n,
        total: 111000n,
        cogsReversed: 70000n, // Data internal: DILARANG bocor ke PDF Nota Kredit
        createdAt: new Date('2026-05-10T08:00:00Z'),
        voidedAt: null,
        business: baseBusiness,
        items: [
          {
            id: 'cni_1',
            orderItemId: 'oi_1',
            qty: 2,
            restock: true,
            creditAmount: 100000n,
          },
        ],
      },
      {
        id: 'cn_voided_1',
        businessId: BIZ_ID,
        orderId: 'ord_sales1',
        number: 'CN/2026/05/0002',
        settlement: 'OFFSET',
        reason: 'Salah input qty retur',
        amountExPpn: 50000n,
        ppnAmount: 0n,
        total: 50000n,
        cogsReversed: 35000n,
        createdAt: new Date('2026-05-11T08:00:00Z'),
        voidedAt: new Date('2026-05-11T09:00:00Z'),
        business: baseBusiness,
        items: [
          {
            id: 'cni_2',
            orderItemId: 'oi_1',
            qty: 1,
            restock: false,
            creditAmount: 50000n,
          },
        ],
      },
      {
        id: 'cn_other_biz',
        businessId: OTHER_BIZ_ID,
        orderId: 'ord_other_biz',
        number: 'CN/2026/05/8888',
        settlement: 'REFUND',
        reason: 'Tenant lain',
        amountExPpn: 50000n,
        ppnAmount: 0n,
        total: 50000n,
        cogsReversed: 20000n,
        createdAt: new Date('2026-05-11T08:00:00Z'),
        voidedAt: null,
        business: { ...baseBusiness, id: OTHER_BIZ_ID },
        items: [],
      },
    ];

    mockAuditLogs = [];
    vi.clearAllMocks();
  });

  it('merender CreditNoteDocument ke HTML tanpa membocorkan HPP / cost / profit dan menampilkan watermark VOID bila voidedAt terisi', async () => {
    const pdfData: CreditNotePdfData = {
      number: 'CN/2026/05/0001',
      orderNumber: 'ORD/2026/05/0001',
      settlement: 'CUSTOMER_CREDIT',
      createdAt: '2026-05-10T08:00:00.000Z',
      voidedAt: null,
      reason: 'Retur 2 sak rusak segel',
      business: baseBusiness,
      customer: {
        code: 'CUST-001',
        name: 'Toko Kucing Bahagia',
        contactName: 'Ibu Rina',
        address: 'Jl. Melati No. 3',
        phone: '08111222333',
      },
      items: [
        {
          no: 1,
          sku: 'BC-LAV-10',
          name: 'BentoCat Lavender 10L',
          qty: 2,
          unit: 'sak',
          restock: true,
          creditAmount: 100000,
        },
      ],
      totals: {
        amountExPpn: 100000,
        ppnAmount: 11000,
        total: 111000,
      },
    };

    assertNoSecretKeys(pdfData);

    const activeHtml = await renderReactToHtml(
      React.createElement(CreditNoteDocument, { data: pdfData })
    );
    expect(activeHtml).toContain('CN/2026/05/0001');
    expect(activeHtml).toContain('BentoCat Lavender 10L');
    expect(activeHtml.toLowerCase()).toContain('seratus sebelas ribu');
    expect(activeHtml).not.toContain('DIBATALKAN (VOID)');

    const plainText = activeHtml
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .toLowerCase();
    for (const forbidden of ['cogsreversed', 'costprice', 'floorprice', 'hpp', 'margin', 'profit', '70.000']) {
      expect(plainText).not.toContain(forbidden);
    }

    const voidHtml = await renderReactToHtml(
      React.createElement(CreditNoteDocument, {
        data: { ...pdfData, voidedAt: '2026-05-11T09:00:00.000Z' },
      })
    );
    expect(voidHtml).toContain('DIBATALKAN (VOID)');
  });

  it('GET /api/v1/credit-notes/[id]/pdf berhasil mengembalikan biner %PDF- & audit log untuk SuperAdmin dan Sales pemilik order', async () => {
    vi.spyOn(contextModule, 'requireContext').mockResolvedValueOnce(superAdminCtx);

    const req = new NextRequest('http://localhost:3000/api/v1/credit-notes/cn_active_1/pdf');
    const res = await getCreditNotePdfHandler(req, {
      params: Promise.resolve({ id: 'cn_active_1' }),
    });

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('application/pdf');
    expect(res.headers.get('Content-Disposition')).toContain('CN-2026-05-0001.pdf');
    const buf = Buffer.from(await res.arrayBuffer());
    expect(buf.subarray(0, 5).toString()).toBe('%PDF-');

    expect(mockAuditLogs).toHaveLength(1);
    expect(mockAuditLogs[0].action).toBe('CREDIT_NOTE_PRINT');

    // Mode print HTML fallback (?format=html) juga harus memuat HTML bersih bebas HPP
    vi.spyOn(contextModule, 'requireContext').mockResolvedValueOnce(sales1Ctx);
    const htmlReq = new NextRequest(
      'http://localhost:3000/api/v1/credit-notes/cn_active_1/pdf?format=html'
    );
    const htmlRes = await getCreditNotePdfHandler(htmlReq, {
      params: Promise.resolve({ id: 'cn_active_1' }),
    });
    expect(htmlRes.status).toBe(200);
    expect(htmlRes.headers.get('Content-Type')).toContain('text/html');
    const htmlBody = await htmlRes.text();
    expect(htmlBody).toContain('window.print()');
    expect(htmlBody).not.toContain('70.000');
  });

  it('menolak akses Sales lain (403 FORBIDDEN) dan mengisolasi tenant lain (404 NOT_FOUND)', async () => {
    vi.spyOn(contextModule, 'requireContext').mockResolvedValueOnce(sales2Ctx);
    const reqIdor = new NextRequest('http://localhost:3000/api/v1/credit-notes/cn_active_1/pdf');
    const resIdor = await getCreditNotePdfHandler(reqIdor, {
      params: Promise.resolve({ id: 'cn_active_1' }),
    });
    expect(resIdor.status).toBe(403);
    const idorJson = await resIdor.json();
    expect(idorJson.error.code).toBe('FORBIDDEN');

    vi.spyOn(contextModule, 'requireContext').mockResolvedValueOnce(superAdminCtx);
    const reqCrossTenant = new NextRequest('http://localhost:3000/api/v1/credit-notes/cn_other_biz/pdf');
    const resCrossTenant = await getCreditNotePdfHandler(reqCrossTenant, {
      params: Promise.resolve({ id: 'cn_other_biz' }),
    });
    expect(resCrossTenant.status).toBe(404);
    const tenantJson = await resCrossTenant.json();
    expect(tenantJson.error.code).toBe('NOT_FOUND');
  });

  it('GET /api/v1/dl/[token] mendukung CREDIT_NOTE_PDF bertanda tangan & menolak Sales IDOR maupun token tanpa businessId', async () => {
    const { token } = createDownloadToken(
      {
        type: 'CREDIT_NOTE_PDF',
        id: 'cn_active_1',
        userId: SA_ID,
        businessId: BIZ_ID,
      },
      env.APP_SECRET,
      300
    );

    const req = new NextRequest(`http://localhost:3000/api/v1/dl/${token}`);
    const res = await serveDownloadHandler(req, {
      params: Promise.resolve({ token }),
    });

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('application/pdf');
    expect(res.headers.get('Content-Disposition')).toContain('CN-2026-05-0001.pdf');
    const buf = Buffer.from(await res.arrayBuffer());
    expect(buf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(mockAuditLogs.some((a) => a.summary?.includes('tautan sekali buka'))).toBe(true);

    // IDOR via token: Sales 2 mencoba unduh Nota Kredit milik Sales 1
    const { token: idorToken } = createDownloadToken(
      {
        type: 'CREDIT_NOTE_PDF',
        id: 'cn_active_1',
        userId: SALES_2_ID,
        businessId: BIZ_ID,
      },
      env.APP_SECRET,
      300
    );
    const idorRes = await serveDownloadHandler(
      new NextRequest(`http://localhost:3000/api/v1/dl/${idorToken}`),
      { params: Promise.resolve({ token: idorToken }) }
    );
    expect(idorRes.status).toBe(403);

    // Token tanpa businessId dari akun tanpa default unit ditolak aman (400 BAD_REQUEST)
    mockUsers.push({
      id: 'usr_global_no_biz',
      role: Role.SUPERADMIN,
      name: 'Global Owner',
      businessId: null,
      isActive: true,
      deletedAt: null,
    });
    const { token: noBizToken } = createDownloadToken(
      {
        type: 'CREDIT_NOTE_PDF',
        id: 'cn_active_1',
        userId: 'usr_global_no_biz',
      },
      env.APP_SECRET,
      300
    );
    const noBizRes = await serveDownloadHandler(
      new NextRequest(`http://localhost:3000/api/v1/dl/${noBizToken}`),
      { params: Promise.resolve({ token: noBizToken }) }
    );
    expect(noBizRes.status).toBe(400);
  });
});
