import { describe, it, expect, afterEach, vi } from 'vitest';
import React from 'react';
import { NextRequest } from 'next/server';
import { renderToStaticMarkup } from 'react-dom/server';
import { InvoiceTheme, PaymentMethod } from '@prisma/client';
import {
  generateVerifyToken,
  maskAddress,
  maskCustomerName,
} from '@/lib/domain/verify';
import { receiptNumber } from '@/lib/domain/numbering';
import { DEFAULT_PAYMENT_LEGAL_NOTICE } from '@/lib/domain/paymentPolicy';
import {
  buildPublicVerifyUrl,
  buildQrVerificationProps,
  ensureInvoiceVerifyToken,
  generateQrDataUri,
  isInternalOrigin,
  resolvePublicBaseUrl,
} from '@/lib/pdf/qr';
import { InvoiceDocument } from '@/lib/pdf/InvoiceDocument';
import { ReceiptDocument } from '@/lib/pdf/ReceiptDocument';
import type { InvoiceSnapshot } from '@/lib/pdf/snapshot';

describe('Fase 2 Unit Tests — QR Lokal, Token, Masking & Dokumen Kwitansi', () => {
  const ORIGINAL_APP_URL = process.env.APP_URL;

  afterEach(() => {
    if (ORIGINAL_APP_URL === undefined) {
      delete process.env.APP_URL;
    } else {
      process.env.APP_URL = ORIGINAL_APP_URL;
    }
  });

  it('generateVerifyToken menghasilkan token acak URL-safe berawalan ver_', () => {
    const t1 = generateVerifyToken();
    const t2 = generateVerifyToken();

    expect(t1).toMatch(/^ver_[A-Za-z0-9_-]{20,}$/);
    expect(t2).toMatch(/^ver_[A-Za-z0-9_-]{20,}$/);
    expect(t1).not.toBe(t2);
  });

  it('maskCustomerName menyamarkan sebagian nama tanpa membocorkan nama penuh', () => {
    const maskedCorp = maskCustomerName('PT Petshop Jaya Abadi');
    expect(maskedCorp.startsWith('PT ')).toBe(true);
    expect(maskedCorp).not.toContain('Petshop');
    expect(maskedCorp).not.toContain('Abadi');
    expect(maskedCorp).toContain('*');

    const maskedSingle = maskCustomerName('BentoCat');
    expect(maskedSingle).toMatch(/^Be\*+$/);

    const maskedShort = maskCustomerName('Al');
    expect(maskedShort).toBe('A*');

    expect(maskCustomerName(null)).toBe('***');
  });

  it('maskAddress menyamarkan alamat sensitif jalan dan nomor rumah', () => {
    const masked = maskAddress('Jl. Kenanga Raya No. 88, Bandung 40123');
    expect(masked).not.toBeNull();
    expect(masked!).toContain('***');
    expect(masked!).not.toContain('Kenanga');
    expect(masked!).not.toContain('88');
    expect(masked!).not.toContain('40123');
    expect(masked!).toContain('Bandung');

    const maskedNoComma = maskAddress('Komplek Anggrek Blok C5');
    expect(maskedNoComma).toBe('Alamat disamarkan demi privasi');

    expect(maskAddress('   ')).toBeNull();
    expect(maskAddress(null)).toBeNull();
  });

  it('receiptNumber memformat nomor kwitansi resmi KWT sesuai format dokumen', () => {
    const dt = new Date(Date.UTC(2026, 10, 12)); // 12 Nov 2026
    expect(receiptNumber('BC01', dt, 7)).toBe('BC01/KWT/12/11/2026/0007');
  });

  it('generateQrDataUri menghasilkan SVG data URI offline dan buildPublicVerifyUrl membentuk tautan publik', async () => {
    const url = buildPublicVerifyUrl('ver_abc123XYZ999', 'https://app.bentocat.id');
    expect(url).toBe('https://app.bentocat.id/verify/ver_abc123XYZ999');

    const dataUri = await generateQrDataUri(url);
    expect(dataUri.startsWith('data:image/svg+xml;base64,')).toBe(true);

    const decodedSvg = Buffer.from(
      dataUri.replace('data:image/svg+xml;base64,', ''),
      'base64'
    ).toString('utf8');
    expect(decodedSvg).toContain('<svg');
    expect(decodedSvg).toContain('</svg>');
  });

  it('InvoiceDocument merender QR Verifikasi Resmi dan tautan saat qrDataUri diberikan', async () => {
    const verifyUrl = 'https://app.bentocat.id/verify/ver_doc_sample123';
    const qrDataUri = await generateQrDataUri(verifyUrl);

    const snapshot: InvoiceSnapshot = {
      schemaVersion: 1,
      number: 'INV-BC01-20261112-001',
      type: 'FINAL',
      issueDate: '2026-11-12T00:00:00.000Z',
      dueDate: '2026-11-19T00:00:00.000Z',
      theme: InvoiceTheme.PROFESIONAL,
      business: {
        name: 'BentoCat',
        legalName: 'CV BentoCat Mandiri',
        address: 'Jl. Industri No. 1',
        phone: '0811111111',
        email: 'billing@bentocat.id',
        npwp: null,
        logoPath: null,
      },
      customer: {
        code: 'CUST01',
        name: 'PT Mitra Petshop',
        contactName: 'Andi',
        billingAddress: 'Jl. Customer No. 2',
        shippingAddress: 'Jl. Customer No. 2',
        npwp: null,
      },
      items: [
        {
          no: 1,
          name: 'Pasir Kucing Bentonit 10L',
          sku: 'PASIR-10L',
          qty: 10,
          unit: 'sak',
          unitPrice: 50000,
          lineDiscount: 0,
          lineNet: 500000,
        },
      ],
      totals: {
        subtotal: 500000,
        discountTotal: 0,
        shippingCharge: 0,
        ppnEnabled: false,
        ppnRateBps: 0,
        ppnAmount: 0,
        grandTotal: 500000,
      },
      billing: {
        dpAmount: 0,
        dpBps: 0,
        amountDue: 500000,
        dpInvoiceNumber: null,
        dpPaid: 0,
      },
      banks: [
        {
          bankName: 'BCA',
          accountNumber: '1234567890',
          accountHolder: 'CV BentoCat Mandiri',
        },
      ],
      note: null,
      verifyToken: 'ver_doc_sample123',
      legalNotice: DEFAULT_PAYMENT_LEGAL_NOTICE,
    };

    const html = renderToStaticMarkup(
      React.createElement(InvoiceDocument, {
        snapshot,
        qrDataUri,
        verifyUrl,
      })
    );

    expect(html).toContain('Verifikasi Resmi');
    expect(html).toContain(verifyUrl);
    expect(html).toContain('data:image/svg+xml;base64,');
    expect(html).toContain(DEFAULT_PAYMENT_LEGAL_NOTICE);
  });

  it('ReceiptDocument merender kwitansi resmi VERIFIED dengan QR, terbilang, dan bebas bocor HPP', async () => {
    const verifyUrl = 'https://app.bentocat.id/verify/ver_kwt_sample123';
    const qrDataUri = await generateQrDataUri(verifyUrl);

    const html = renderToStaticMarkup(
      React.createElement(ReceiptDocument, {
        receipt: {
          receiptNo: 'KWT-CUST01-20261112-001',
          paidAt: '2026-11-12T05:00:00.000Z',
          method: PaymentMethod.TRANSFER,
          reference: 'TRF-BCA-9988',
          amount: 1500000,
          orderNo: 'ORD-CUST01-20261112-001',
          orderGrandTotal: 3000000,
          orderPaidTotal: 1500000,
          invoiceNumber: 'INV-CUST01-20261112-001',
          invoiceType: 'DP',
          theme: InvoiceTheme.PROFESIONAL,
          legalNotice: null,
          business: {
            name: 'BentoCat',
            legalName: 'CV BentoCat Mandiri',
            address: 'Jl. Industri No. 1',
            phone: '0811111111',
            email: 'billing@bentocat.id',
            npwp: null,
            logoPath: null,
          },
          customer: {
            name: 'PT Mitra Petshop',
            contactName: 'Andi',
            address: 'Jl. Customer No. 2',
            phone: '0822222222',
          },
        },
        qrDataUri,
        verifyUrl,
      })
    );

    expect(html).toContain('KWITANSI PEMBAYARAN');
    expect(html).toContain('KWT-CUST01-20261112-001');
    expect(html).toContain('TERVERIFIKASI PERUSAHAAN');
    expect(html).toContain('1.500.000');
    expect(html).toContain('satu juta lima ratus ribu Rupiah');
    expect(html).toContain('TRF-BCA-9988');
    expect(html).toContain('Verifikasi Keaslian');
    expect(html).toContain(DEFAULT_PAYMENT_LEGAL_NOTICE);
    expect(html).not.toContain('costPrice');
    expect(html).not.toContain('marginBps');
  });

  it('isInternalOrigin mengenali loopback, listener container, dan domain internal secara akurat', () => {
    expect(isInternalOrigin('http://localhost:3000')).toBe(true);
    expect(isInternalOrigin('http://127.0.0.1:3000')).toBe(true);
    expect(isInternalOrigin('http://0.0.0.0:3000')).toBe(true);
    expect(isInternalOrigin('http://[::1]:3000')).toBe(true);
    expect(isInternalOrigin('http://web.internal:3000')).toBe(true);
    expect(isInternalOrigin('http://bentocat.local')).toBe(true);
    expect(isInternalOrigin('javascript:alert(1)')).toBe(true);
    expect(isInternalOrigin(null)).toBe(true);

    expect(isInternalOrigin('https://modula.click')).toBe(false);
    expect(isInternalOrigin('http://192.168.1.50:3000')).toBe(false);
  });

  it('resolvePublicBaseUrl memprioritaskan APP_URL publik di balik reverse proxy Docker/Coolify', () => {
    process.env.APP_URL = 'https://modula.click/';

    // Simulasi request container di Coolify yang masuk sebagai localhost atau 0.0.0.0
    const localhostReq = new NextRequest('http://localhost:3000/api/v1/invoices/inv1/pdf');
    const zeroHostReq = new NextRequest('http://0.0.0.0:3000/api/v1/dl/tok123');

    expect(resolvePublicBaseUrl(localhostReq)).toBe('https://modula.click');
    expect(resolvePublicBaseUrl(zeroHostReq)).toBe('https://modula.click');
    expect(buildPublicVerifyUrl('ver_coolify_001', localhostReq)).toBe(
      'https://modula.click/verify/ver_coolify_001'
    );
    expect(buildPublicVerifyUrl('ver_coolify_002', 'http://localhost:3000')).toBe(
      'https://modula.click/verify/ver_coolify_002'
    );

    // String origin non-internal eksplisit tetap dihormati
    expect(buildPublicVerifyUrl('ver_custom', 'https://staging.modula.click/')).toBe(
      'https://staging.modula.click/verify/ver_custom'
    );
  });

  it('resolvePublicBaseUrl memakai x-forwarded-host atau LAN IP saat APP_URL belum publik', () => {
    process.env.APP_URL = 'http://localhost:3000';

    const proxiedReq = new NextRequest('http://localhost:3000/api/v1/invoices/inv1/pdf', {
      headers: {
        'x-forwarded-host': 'modula.click',
        'x-forwarded-proto': 'https',
      },
    });
    expect(buildPublicVerifyUrl('ver_proxy_1', proxiedReq)).toBe(
      'https://modula.click/verify/ver_proxy_1'
    );

    // Pengujian lokal via IP LAN HP tetap bisa scan ke IP LAN dev
    const lanReq = new NextRequest('http://192.168.1.45:3000/api/v1/invoices/inv1/pdf');
    expect(buildPublicVerifyUrl('ver_lan_1', lanReq)).toBe(
      'http://192.168.1.45:3000/verify/ver_lan_1'
    );

    delete process.env.APP_URL;
    const pureLocalReq = new NextRequest('http://localhost:3000/api/v1/invoices/inv1/pdf');
    expect(buildPublicVerifyUrl('ver_local_1', pureLocalReq)).toBe(
      'http://localhost:3000/verify/ver_local_1'
    );
  });

  it('buildQrVerificationProps dan ensureInvoiceVerifyToken menangani token baru maupun legacy', async () => {
    process.env.APP_URL = 'https://modula.click';
    const req = new NextRequest('http://localhost:3000/api/v1/invoices/inv1/pdf');

    const emptyProps = await buildQrVerificationProps(null, req);
    expect(emptyProps).toEqual({ verifyUrl: null, qrDataUri: null });

    const validProps = await buildQrVerificationProps('ver_live_123', req);
    expect(validProps.verifyUrl).toBe('https://modula.click/verify/ver_live_123');
    expect(validProps.qrDataUri?.startsWith('data:image/svg+xml;base64,')).toBe(true);

    const updateMany = vi.fn(async () => ({ count: 1 }));
    const existingTok = await ensureInvoiceVerifyToken(
      { id: 'inv1', businessId: 'biz1', verifyToken: 'ver_db_1' },
      'ver_snap_1',
      { updateMany }
    );
    expect(existingTok).toBe('ver_snap_1');
    expect(updateMany).not.toHaveBeenCalled();

    const generatedTok = await ensureInvoiceVerifyToken(
      { id: 'inv2', businessId: 'biz1', verifyToken: null },
      null,
      { updateMany }
    );
    expect(generatedTok).toMatch(/^ver_[A-Za-z0-9_-]{20,}$/);
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: 'inv2', businessId: 'biz1', verifyToken: null },
      data: { verifyToken: generatedTok },
    });
  });
});
