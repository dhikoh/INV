import { describe, it, expect, beforeEach, vi, afterAll } from 'vitest';
import { NextRequest } from 'next/server';
import React from 'react';
import { Role, InvoiceStatus, ShipStatus, InvoiceTheme } from '@prisma/client';
import { DomainError } from '@/lib/domain/money';
import * as contextModule from '@/lib/auth/context';
import { assertNoSecretKeys } from '../helpers/leak';
import { InvoiceDocument } from '@/lib/pdf/InvoiceDocument';
import { DeliveryNoteDocument, DeliveryNoteData } from '@/lib/pdf/DeliveryNoteDocument';
import { getDummySnapshot } from '@/lib/pdf/dummy';
import { getThemeTokens, THEME_TOKENS } from '@/lib/pdf/themes';
import { renderReactToHtml, Semaphore, closeBrowser } from '@/lib/pdf/engine';
import { GET as getInvoicePdfHandler } from '@/app/api/v1/invoices/[id]/pdf/route';
import { GET as getInvoicePreviewHandler } from '@/app/api/v1/businesses/[id]/invoice-preview/route';
import { GET as getDeliveryNotePdfHandler } from '@/app/api/v1/orders/[id]/delivery-note/pdf/route';

// Mock Prisma
const mockInvoices: any[] = [];
const mockOrders: any[] = [];
const mockBusinesses: any[] = [];
const mockShipments: any[] = [];
const mockAuditLogs: any[] = [];

vi.mock('@/lib/db', () => ({
  prisma: {
    invoice: {
      findFirst: vi.fn(async ({ where }: { where: Record<string, any> }) => {
        return mockInvoices.find((inv) => {
          if (where.id && inv.id !== where.id) return false;
          if (where.orderId && inv.orderId !== where.orderId) return false;
          if (where.businessId && inv.businessId !== where.businessId) return false;
          if (where.deletedAt === null && inv.deletedAt !== null) return false;
          return true;
        }) || null;
      }),
      findMany: vi.fn(async ({ where }: { where: Record<string, any> }) => {
        return mockInvoices.filter((inv) => {
          if (where.orderId && inv.orderId !== where.orderId) return false;
          if (where.status && inv.status !== where.status) return false;
          if (where.deletedAt === null && inv.deletedAt !== null) return false;
          return true;
        });
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: any }) => {
        const inv = mockInvoices.find((i) => i.id === where.id);
        if (inv) {
          if (data.printedCount?.increment) {
            inv.printedCount = (inv.printedCount || 0) + data.printedCount.increment;
          }
          if (data.lastPrintedAt) {
            inv.lastPrintedAt = data.lastPrintedAt;
          }
        }
        return inv;
      }),
    },
    shipment: {
      findFirst: vi.fn(async ({ where }: { where: Record<string, any> }) => {
        return mockShipments.find((ship) => {
          if (where.orderId && ship.orderId !== where.orderId) return false;
          return true;
        }) || null;
      }),
    },
    order: {
      findFirst: vi.fn(async ({ where }: { where: Record<string, any> }) => {
        return mockOrders.find((ord) => {
          if (where.id && ord.id !== where.id) return false;
          if (where.businessId && ord.businessId !== where.businessId) return false;
          if (where.deletedAt === null && ord.deletedAt !== null) return false;
          return true;
        }) || null;
      }),
    },
    business: {
      findFirst: vi.fn(async ({ where }: { where: Record<string, any> }) => {
        return mockBusinesses.find((biz) => {
          if (where.id && biz.id !== where.id) return false;
          if (where.deletedAt === null && biz.deletedAt !== null) return false;
          return true;
        }) || null;
      }),
    },
    auditLog: {
      create: vi.fn(async ({ data }: { data: any }) => {
        mockAuditLogs.push(data);
        return data;
      }),
    },
  },
}));

// Mock buildInvoiceSnapshot
vi.mock('@/lib/pdf/snapshot', async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    buildInvoiceSnapshot: vi.fn(async (_tx: any, invoiceId: string, options?: any) => {
      const inv = mockInvoices.find((i) => i.id === invoiceId);
      const snapshot = getDummySnapshot(options?.theme || inv?.theme || 'PROFESIONAL');
      if (options?.number !== undefined) {
        snapshot.number = options.number;
      }
      return snapshot;
    }),
  };
});

describe('T3.5: Mesin Cetak PDF, 5 Desain Tema, dan Surat Jalan (Seksi 14 & 17.3)', () => {
  afterAll(async () => {
    await closeBrowser();
  });

  beforeEach(() => {
    mockInvoices.length = 0;
    mockOrders.length = 0;
    mockBusinesses.length = 0;
    mockShipments.length = 0;
    mockAuditLogs.length = 0;
    vi.clearAllMocks();
  });

  const BIZ_ID = 'biz_cat_01';
  const SALES_ID_1 = 'sales_usr_01';
  const SALES_ID_2 = 'sales_usr_02';

  const superAdminCtx = {
    user: { id: 'sa_usr_01', role: Role.SUPERADMIN, name: 'Owner Utama', businessId: BIZ_ID },
    role: Role.SUPERADMIN,
    businessId: BIZ_ID,
    sessionId: 'sess_sa_01',
    ip: '127.0.0.1',
  };

  const sales1Ctx = {
    user: { id: SALES_ID_1, role: Role.SALES, name: 'Budi Lapangan', businessId: BIZ_ID },
    role: Role.SALES,
    businessId: BIZ_ID,
    sessionId: 'sess_s1_01',
    ip: '127.0.0.1',
  };

  describe('1. Jaminan Anti-Bocor (Zero-Leakage Guarantee) pada Snapshot & HTML', () => {
    it('dummy snapshot dan semua tema invoice tidak memuat informasi rahasia internal', () => {
      const themes: InvoiceTheme[] = [
        'PROFESIONAL',
        'FAMILY',
        'MINIMALIS',
        'MODERN',
        'KLASIK',
      ];

      const forbiddenStrings = [
        'costPrice',
        'floorPrice',
        'belowMin',
        'overrideNote',
        'Budi Lapangan', // Nama Sales tidak boleh muncul di invoice pelanggan
      ];

      for (const theme of themes) {
        const snapshot = getDummySnapshot(theme);
        assertNoSecretKeys(snapshot);

        const html = renderReactToHtml(
          React.createElement(InvoiceDocument, { snapshot })
        );

        expect(html).toContain('<!DOCTYPE html>');
        expect(html).toContain(snapshot.number);

        for (const forbidden of forbiddenStrings) {
          expect(html.toLowerCase()).not.toContain(forbidden.toLowerCase());
        }
      }
    });

    it('Surat Jalan (DeliveryNoteDocument) DILARANG memuat harga, biaya, atau diskon', () => {
      const deliveryData: DeliveryNoteData = {
        deliveryNo: 'SJ/2026/04/0001',
        orderNumber: 'ORD/2026/04/0001',
        invoiceNumber: 'INV/2026/04/0001',
        shippedAt: new Date().toISOString(),
        business: {
          name: 'PT BentoCat Distribusi',
          legalName: 'PT BentoCat Distribusi Nusantara',
          address: 'Jl. Merdeka No. 10',
          phone: '021-123456',
          email: 'info@bentocat.co.id',
          logoPath: null,
        },
        customer: {
          code: 'CUST-001',
          name: 'Toko Berkah Abadi',
          contactName: 'Pak Haji',
          shippingAddress: 'Gudang Sentul Blok B',
          phone: '08123456789',
        },
        logistics: {
          courier: 'Armada Internal (Engkel)',
          trackingNo: null,
          driverName: 'Pak Asep',
          vehiclePlate: 'B 9876 XYZ',
          estimatedArrival: null,
        },
        items: [
          {
            no: 1,
            name: 'Beras Premium 10kg',
            sku: 'BRS-10KG',
            qty: 20,
            unit: 'sak',
            note: 'Segel utuh',
          },
        ],
        notes: 'Hati-hati basah.',
      };

      const html = renderReactToHtml(
        React.createElement(DeliveryNoteDocument, { data: deliveryData })
      );

      expect(html).toContain('SURAT JALAN');
      expect(html).toContain('SJ/2026/04/0001');
      expect(html).toContain('Beras Premium 10kg');
      expect(html).toContain('20');
      expect(html).toContain('Pak Asep');
      expect(html).toContain('B 9876 XYZ');

      // Wajib ada 3 kolom tanda tangan
      expect(html).toContain('Diserahkan Oleh');
      expect(html).toContain('Dibawa Oleh');
      expect(html).toContain('Diterima Oleh');

      // Jaminan anti bocor harga
      expect(html).not.toContain('Rp');
      expect(html).not.toContain('Harga');
      expect(html).not.toContain('Subtotal');
      expect(html).not.toContain('Grand Total');
      expect(html).not.toContain('Diskon');
    });
  });

  describe('2. Penerapan 5 Tema Desain (Seksi 14.4)', () => {
    it('setiap tema memiliki token warna, font, dan batas visual yang unik', () => {
      const prof = getThemeTokens('PROFESIONAL');
      const fam = getThemeTokens('FAMILY');
      const min = getThemeTokens('MINIMALIS');
      const mod = getThemeTokens('MODERN');
      const kla = getThemeTokens('KLASIK');

      expect(prof.primaryColor).toBe(THEME_TOKENS.PROFESIONAL.primaryColor);
      expect(fam.primaryColor).toBe(THEME_TOKENS.FAMILY.primaryColor);
      expect(min.primaryColor).toBe(THEME_TOKENS.MINIMALIS.primaryColor);
      expect(mod.primaryColor).toBe(THEME_TOKENS.MODERN.primaryColor);
      expect(kla.primaryColor).toBe(THEME_TOKENS.KLASIK.primaryColor);

      // Pastikan tema klasik menggunakan font serif
      expect(kla.fontFamily.toLowerCase()).toContain('georgia');
    });
  });

  describe('3. Watermark Dokumen (Draf, Batal, Lunas, Contoh)', () => {
    it('merender watermark diagonal yang tepat sesuai kondisi', () => {
      const snapshot = getDummySnapshot('PROFESIONAL');

      const drafHtml = renderReactToHtml(
        React.createElement(InvoiceDocument, {
          snapshot,
          watermark: 'PRATINJAU, MENUNGGU PERSETUJUAN',
        })
      );
      expect(drafHtml).toContain('PRATINJAU, MENUNGGU PERSETUJUAN');

      const batalHtml = renderReactToHtml(
        React.createElement(InvoiceDocument, {
          snapshot,
          watermark: 'BATAL',
        })
      );
      expect(batalHtml).toContain('BATAL');

      const lunasHtml = renderReactToHtml(
        React.createElement(InvoiceDocument, {
          snapshot,
          watermark: 'LUNAS',
        })
      );
      expect(lunasHtml).toContain('LUNAS');

      const contohHtml = renderReactToHtml(
        React.createElement(InvoiceDocument, {
          snapshot,
          watermark: 'CONTOH',
        })
      );
      expect(contohHtml).toContain('CONTOH');
    });
  });

  describe('4. Semaphore Mesin PDF & Timeout (Seksi 14.2)', () => {
    it('membatasi antrean konkurensi dan melepaskan semaphore saat selesai', async () => {
      const sem = new Semaphore(2);

      const release1 = await sem.acquire(1000);
      const release2 = await sem.acquire(1000);
      expect(sem.activeCount).toBe(2);

      // Acquiring ke-3 harus timeout jika tidak dirilis
      await expect(sem.acquire(100)).rejects.toThrow(
        new DomainError('PDF_BUSY', 'Coba lagi sebentar', 503)
      );

      release1();
      expect(sem.activeCount).toBe(1);

      const release3 = await sem.acquire(1000);
      expect(sem.activeCount).toBe(2);

      release2();
      release3();
      expect(sem.activeCount).toBe(0);
    });
  });

  describe('5. Endpoint Cetak PDF Faktur (GET /api/v1/invoices/:id/pdf)', () => {
    beforeEach(() => {
      const business = {
        id: BIZ_ID,
        name: 'PT BentoCat Distribusi',
        legalName: 'PT BentoCat Distribusi Nusantara',
        address: 'Jl. Merdeka No. 10',
        phone: '021-123456',
        email: 'info@bentocat.co.id',
        npwp: '01.234.567.8-012.000',
        logoPath: null,
        invoiceTheme: 'PROFESIONAL',
        deletedAt: null,
      };
      mockBusinesses.push(business);

      const order1 = {
        id: 'ord_01',
        orderNo: 'ORD-2026-04-001',
        salesId: SALES_ID_1,
        businessId: BIZ_ID,
        paidTotal: 0n,
        grandTotal: 10000000n,
        dpAmount: 0n,
        deletedAt: null,
      };
      const order2 = {
        id: 'ord_02',
        orderNo: 'ORD-2026-04-002',
        salesId: SALES_ID_2,
        businessId: BIZ_ID,
        paidTotal: 10000000n,
        grandTotal: 10000000n,
        dpAmount: 0n,
        deletedAt: null,
      };
      mockOrders.push(order1, order2);

      mockInvoices.push(
        {
          id: 'inv_approved_1',
          orderId: order1.id,
          number: 'INV/2026/04/0001',
          businessId: BIZ_ID,
          status: InvoiceStatus.APPROVED,
          amount: 10000000n,
          paidAmount: 0n,
          type: 'FINAL',
          theme: 'PROFESIONAL',
          snapshot: getDummySnapshot('PROFESIONAL'),
          printedCount: 0,
          lastPrintedAt: null,
          deletedAt: null,
          business,
        },
        {
          id: 'inv_pending_1',
          orderId: order1.id,
          number: null,
          businessId: BIZ_ID,
          status: InvoiceStatus.PENDING_APPROVAL,
          amount: 5000000n,
          paidAmount: 0n,
          type: 'DP',
          theme: 'FAMILY',
          snapshot: null,
          printedCount: 0,
          lastPrintedAt: null,
          deletedAt: null,
          business,
        },
        {
          id: 'inv_void_1',
          orderId: order1.id,
          number: 'INV/2026/04/0002',
          businessId: BIZ_ID,
          status: InvoiceStatus.VOID,
          amount: 10000000n,
          paidAmount: 0n,
          type: 'FINAL',
          theme: 'KLASIK',
          snapshot: getDummySnapshot('KLASIK'),
          printedCount: 1,
          lastPrintedAt: new Date(),
          deletedAt: null,
          business,
        },
        {
          id: 'inv_approved_sales2',
          orderId: order2.id,
          number: 'INV/2026/04/0003',
          businessId: BIZ_ID,
          status: InvoiceStatus.APPROVED,
          amount: 10000000n,
          paidAmount: 10000000n,
          type: 'FINAL',
          theme: 'MODERN',
          snapshot: getDummySnapshot('MODERN'),
          printedCount: 0,
          lastPrintedAt: null,
          deletedAt: null,
          business,
        }
      );
    });

    it('Sales ditolak 403 jika mencoba mencetak invoice milik Sales lain', async () => {
      vi.spyOn(contextModule, 'requireContext').mockResolvedValueOnce(sales1Ctx as any);

      const req = new NextRequest('http://localhost:3000/api/v1/invoices/inv_approved_sales2/pdf');
      const res = await getInvoicePdfHandler(req, {
        params: Promise.resolve({ id: 'inv_approved_sales2' }),
      });

      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.error.code).toBe('FORBIDDEN');
    });

    it('Sales ditolak 409 INVOICE_NOT_APPROVED jika invoice belum disetujui (PENDING_APPROVAL)', async () => {
      vi.spyOn(contextModule, 'requireContext').mockResolvedValueOnce(sales1Ctx as any);

      const req = new NextRequest('http://localhost:3000/api/v1/invoices/inv_pending_1/pdf');
      const res = await getInvoicePdfHandler(req, {
        params: Promise.resolve({ id: 'inv_pending_1' }),
      });

      expect(res.status).toBe(409);
      const json = await res.json();
      expect(json.error.code).toBe('INVOICE_NOT_APPROVED');
    });

    it('Super Admin ditolak 409 jika mencoba cetak PENDING_APPROVAL tanpa parameter ?preview=1', async () => {
      vi.spyOn(contextModule, 'requireContext').mockResolvedValueOnce(superAdminCtx as any);

      const req = new NextRequest('http://localhost:3000/api/v1/invoices/inv_pending_1/pdf');
      const res = await getInvoicePdfHandler(req, {
        params: Promise.resolve({ id: 'inv_pending_1' }),
      });

      expect(res.status).toBe(409);
      const json = await res.json();
      expect(json.error.code).toBe('INVOICE_NOT_APPROVED');
      expect(json.error.message).toContain('preview=1');
    });

    it('Super Admin berhasil pratinjau invoice PENDING_APPROVAL dengan ?preview=1 (tanpa increment printedCount)', async () => {
      vi.spyOn(contextModule, 'requireContext').mockResolvedValueOnce(superAdminCtx as any);

      const req = new NextRequest(
        'http://localhost:3000/api/v1/invoices/inv_pending_1/pdf?preview=1'
      );
      const res = await getInvoicePdfHandler(req, {
        params: Promise.resolve({ id: 'inv_pending_1' }),
      });

      expect(res.status).toBe(200);
      expect(res.headers.get('Content-Type')).toBe('application/pdf');
      const buf = Buffer.from(await res.arrayBuffer());
      expect(buf.subarray(0, 4).toString()).toBe('%PDF');

      const inv = mockInvoices.find((i) => i.id === 'inv_pending_1');
      expect(inv.printedCount).toBe(0);
      expect(mockAuditLogs.length).toBe(0);
    });

    it('Super Admin berhasil cetak invoice APPROVED (increment printedCount & catat AuditLog INVOICE_PRINT)', async () => {
      vi.spyOn(contextModule, 'requireContext').mockResolvedValueOnce(superAdminCtx as any);

      const req = new NextRequest('http://localhost:3000/api/v1/invoices/inv_approved_1/pdf');
      const res = await getInvoicePdfHandler(req, {
        params: Promise.resolve({ id: 'inv_approved_1' }),
      });

      expect(res.status).toBe(200);
      expect(res.headers.get('Content-Type')).toBe('application/pdf');
      expect(res.headers.get('Content-Disposition')).toContain('INV-2026-04-0001.pdf');

      const inv = mockInvoices.find((i) => i.id === 'inv_approved_1');
      expect(inv.printedCount).toBe(1);
      expect(inv.lastPrintedAt).not.toBeNull();

      expect(mockAuditLogs).toHaveLength(1);
      expect(mockAuditLogs[0].action).toBe('INVOICE_PRINT');
      expect(mockAuditLogs[0].entityId).toBe('inv_approved_1');
    });

    it('Super Admin dapat mengunduh invoice berstatus VOID (dengan watermark BATAL)', async () => {
      vi.spyOn(contextModule, 'requireContext').mockResolvedValueOnce(superAdminCtx as any);

      const req = new NextRequest('http://localhost:3000/api/v1/invoices/inv_void_1/pdf');
      const res = await getInvoicePdfHandler(req, {
        params: Promise.resolve({ id: 'inv_void_1' }),
      });

      expect(res.status).toBe(200);
      expect(res.headers.get('Content-Type')).toBe('application/pdf');
      const buf = Buffer.from(await res.arrayBuffer());
      expect(buf.subarray(0, 4).toString()).toBe('%PDF');
    });
  });

  describe('6. Endpoint Pratinjau Tema Usaha (GET /api/v1/businesses/:id/invoice-preview)', () => {
    beforeEach(() => {
      mockBusinesses.push({
        id: BIZ_ID,
        name: 'PT BentoCat Distribusi',
        legalName: 'PT BentoCat Distribusi Nusantara',
        address: 'Jl. Merdeka No. 10',
        phone: '021-123456',
        email: 'info@bentocat.co.id',
        npwp: '01.234.567.8-012.000',
        logoPath: null,
        invoiceTheme: 'KLASIK',
        deletedAt: null,
      });
    });

    it('Sales ditolak 403 saat mengakses pratinjau tema usaha', async () => {
      vi.spyOn(contextModule, 'requireContext').mockResolvedValueOnce(sales1Ctx as any);

      const req = new NextRequest(
        `http://localhost:3000/api/v1/businesses/${BIZ_ID}/invoice-preview?theme=KLASIK`
      );
      const res = await getInvoicePreviewHandler(req, {
        params: Promise.resolve({ id: BIZ_ID }),
      });

      expect(res.status).toBe(403);
    });

    it('Super Admin berhasil merender contoh tema KLASIK dalam format PDF', async () => {
      vi.spyOn(contextModule, 'requireContext').mockResolvedValueOnce(superAdminCtx as any);

      const req = new NextRequest(
        `http://localhost:3000/api/v1/businesses/${BIZ_ID}/invoice-preview?theme=KLASIK`
      );
      const res = await getInvoicePreviewHandler(req, {
        params: Promise.resolve({ id: BIZ_ID }),
      });

      expect(res.status).toBe(200);
      expect(res.headers.get('Content-Type')).toBe('application/pdf');
      expect(res.headers.get('Content-Disposition')).toContain('PREVIEW-TEMA-KLASIK.pdf');
      const buf = Buffer.from(await res.arrayBuffer());
      expect(buf.subarray(0, 4).toString()).toBe('%PDF');
    });
  });

  describe('7. Endpoint Cetak Surat Jalan (GET /api/v1/orders/:id/delivery-note/pdf)', () => {
    beforeEach(() => {
      const business = {
        id: BIZ_ID,
        name: 'PT BentoCat Distribusi',
        legalName: 'PT BentoCat Distribusi Nusantara',
        address: 'Jl. Merdeka No. 10',
        phone: '021-123456',
        email: 'info@bentocat.co.id',
        logoPath: null,
      };

      const customer = {
        id: 'cust_01',
        code: 'CUST-001',
        name: 'Toko Berkah Abadi',
        contactName: 'Pak Haji',
        address: 'Jl. Surya Kencana No. 8',
        phone: '0812345678',
      };

      mockOrders.push(
        {
          id: 'ord_preparing',
          orderNo: 'ORD-2026-04-001',
          salesId: SALES_ID_1,
          businessId: BIZ_ID,
          deliveryAddress: 'Jl. Raya Sentul Kav. 4',
          deletedAt: null,
          business,
          customer,
          items: [],
        },
        {
          id: 'ord_shipped',
          orderNo: 'ORD-2026-04-002',
          salesId: SALES_ID_1,
          businessId: BIZ_ID,
          deliveryAddress: 'Jl. Raya Sentul Kav. 4',
          deletedAt: null,
          business,
          customer,
          items: [
            {
              id: 'item_1',
              qty: 10,
              productName: 'Kopi Robusta 1kg',
              sku: 'KOP-ROB-1KG',
              unit: 'pack',
              sortOrder: 0,
            },
          ],
        }
      );

      mockShipments.push(
        {
          id: 'ship_01',
          orderId: 'ord_preparing',
          status: ShipStatus.PREPARING,
          deliveryNo: null,
          courier: 'JNE Trucking',
          trackingNo: null,
        },
        {
          id: 'ship_02',
          orderId: 'ord_shipped',
          status: ShipStatus.SHIPPED,
          deliveryNo: 'SJ/2026/04/0002',
          method: 'OWN_FLEET',
          transporterId: 'Armada Internal',
          trackingNo: 'INTERNAL-01',
          driverName: 'Sopir Asep',
          vehiclePlate: 'B 1234 CD',
          shippedAt: new Date(),
        }
      );

      mockInvoices.push({
        id: 'inv_shipped_1',
        orderId: 'ord_shipped',
        number: 'INV/2026/04/0002',
        status: InvoiceStatus.APPROVED,
        deletedAt: null,
      });
    });

    it('menolak cetak surat jalan jika status shipment masih PREPARING (409 INVALID_STATE)', async () => {
      vi.spyOn(contextModule, 'requireContext').mockResolvedValueOnce(superAdminCtx as any);

      const req = new NextRequest(
        'http://localhost:3000/api/v1/orders/ord_preparing/delivery-note/pdf'
      );
      const res = await getDeliveryNotePdfHandler(req, {
        params: Promise.resolve({ id: 'ord_preparing' }),
      });

      expect(res.status).toBe(409);
      const json = await res.json();
      expect(json.error.code).toBe('INVALID_STATE');
    });

    it('berhasil mencetak surat jalan saat status pengiriman SHIPPED', async () => {
      vi.spyOn(contextModule, 'requireContext').mockResolvedValueOnce(sales1Ctx as any);

      const req = new NextRequest(
        'http://localhost:3000/api/v1/orders/ord_shipped/delivery-note/pdf'
      );
      const res = await getDeliveryNotePdfHandler(req, {
        params: Promise.resolve({ id: 'ord_shipped' }),
      });

      expect(res.status).toBe(200);
      expect(res.headers.get('Content-Type')).toBe('application/pdf');
      expect(res.headers.get('Content-Disposition')).toContain('SJ-2026-04-0002.pdf');
      const buf = Buffer.from(await res.arrayBuffer());
      expect(buf.subarray(0, 4).toString()).toBe('%PDF');
    });
  });
});
