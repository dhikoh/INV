import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { InvoiceTheme } from '@prisma/client';
import {
  DEFAULT_PAYMENT_LEGAL_NOTICE,
  resolvePaymentLegalNotice,
} from '@/lib/domain/paymentPolicy';
import { OrderCancelSchema } from '@/lib/validation/order';
import { buildProformaSnapshot } from '@/lib/pdf/snapshot';
import { InvoiceDocument } from '@/lib/pdf/InvoiceDocument';
import { renderReactToHtml } from '@/lib/pdf/engine';
import { assertNoSecretKeys } from '../helpers/leak';

function makeTxMock(opts: {
  showBankOnProforma: boolean;
  paymentLegalNotice: string | null;
  hasBelowMin: boolean;
}) {
  const order = {
    id: 'ord_pf_1',
    businessId: 'biz_1',
    orderNo: null,
    orderDate: new Date('2026-11-12T00:00:00Z'),
    deliveryAddress: 'Jl. Merdeka 10, Surabaya',
    subtotal: BigInt(1_000_000),
    discountTotal: BigInt(0),
    shippingCharge: BigInt(50_000),
    ppnEnabled: true,
    ppnRateBps: 1100,
    ppnAmount: BigInt(110_000),
    grandTotal: BigInt(1_160_000),
    dpBps: 5000,
    dpAmount: BigInt(580_000),
    hasBelowMin: opts.hasBelowMin,
    customer: {
      code: 'CUST01',
      name: 'PT Mitra Petshop',
      contactName: 'Andi',
      address: 'Jl. Merdeka 10, Surabaya',
      billingAddress: 'Jl. Merdeka 10, Surabaya',
      shippingAddress: 'Jl. Merdeka 10, Surabaya',
      npwp: '01.234.567.8-001.000',
    },
    items: [
      {
        productName: 'BentoCat Lavender 10L',
        sku: 'BC-LAV-10L',
        qty: 10,
        unit: 'zak',
        unitPrice: BigInt(100_000),
        lineDiscount: BigInt(0),
        lineNet: BigInt(1_000_000),
        costPrice: BigInt(65_000), // RAHASIA: tidak boleh bocor ke snapshot
      },
    ],
  };

  const business = {
    id: 'biz_1',
    code: 'BC',
    name: 'BentoCat',
    legalName: 'CV BentoCat Mandiri',
    address: 'Jl. Soekandar 5, Blitar',
    phone: '08123456789',
    email: 'halo@bentocat.id',
    npwp: null,
    logoPath: null,
    invoiceTheme: InvoiceTheme.PROFESIONAL,
    invoiceFooterNote: 'Terima kasih atas kepercayaannya.',
    dueDays: 7,
    showBankOnProforma: opts.showBankOnProforma,
    paymentLegalNotice: opts.paymentLegalNotice,
  };

  const bankAccounts = [
    {
      bankName: 'BCA',
      accountNumber: '1234567890',
      accountHolder: 'CV BentoCat Mandiri',
    },
  ];

  return {
    order: { findFirst: vi.fn(async () => order) },
    business: { findUnique: vi.fn(async () => business) },
    bankAccount: { findMany: vi.fn(async () => bankAccounts) },
  } as unknown as Parameters<typeof buildProformaSnapshot>[0];
}

describe('Fase 1 Unit Tests: Kebijakan Anti-Fraud, Proforma Snapshot & Pembatalan', () => {
  it('resolvePaymentLegalNotice memakai teks default saat kosong/spasi dan mempertahankan teks kustom Super Admin', () => {
    expect(resolvePaymentLegalNotice(null)).toBe(DEFAULT_PAYMENT_LEGAL_NOTICE);
    expect(resolvePaymentLegalNotice('')).toBe(DEFAULT_PAYMENT_LEGAL_NOTICE);
    expect(resolvePaymentLegalNotice('   \n  ')).toBe(DEFAULT_PAYMENT_LEGAL_NOTICE);

    const custom = 'Transfer hanya ke rekening BCA PT Nusantara Abadi.';
    expect(resolvePaymentLegalNotice(custom)).toBe(custom);
  });

  it('OrderCancelSchema mewajibkan alasan >= 5 karakter dan memvalidasi dpSettlement', () => {
    expect(OrderCancelSchema.safeParse({ reason: 'batal' }).success).toBe(true);
    expect(OrderCancelSchema.safeParse({ reason: 'abc' }).success).toBe(false);
    expect(
      OrderCancelSchema.safeParse({
        reason: 'Pembatalan oleh pelanggan',
        dpSettlement: 'REFUND',
        refundMethod: 'TRANSFER',
        refundReference: 'TRF-99',
        rev: 2,
      }).success
    ).toBe(true);
    expect(
      OrderCancelSchema.safeParse({
        reason: 'Pembatalan valid',
        dpSettlement: 'INVALID',
      }).success
    ).toBe(false);
  });

  it('buildProformaSnapshot menyembunyikan rekening bila showBankOnProforma = false dan bebas kebocoran HPP', async () => {
    const tx = makeTxMock({
      showBankOnProforma: false,
      paymentLegalNotice: null,
      hasBelowMin: false,
    });

    const snapshot = await buildProformaSnapshot(tx, 'ord_pf_1', { businessId: 'biz_1' });
    expect(snapshot.type).toBe('PROFORMA');
    expect(snapshot.banks).toEqual([]);
    expect(snapshot.proformaApprovalPending).toBeUndefined();
    expect(snapshot.legalNotice).toBe(DEFAULT_PAYMENT_LEGAL_NOTICE);
    expect(snapshot.billing.amountDue).toBe(580_000);
    assertNoSecretKeys(snapshot);

    const html = await renderReactToHtml(
      React.createElement(InvoiceDocument, {
        snapshot,
        watermark: 'PROFORMA (BELUM RESMI)',
      })
    );
    expect(html).toContain('PROFORMA ORDER');
    expect(html).toContain(
      'Nomor rekening resmi akan dicantumkan pada Faktur Resmi setelah pengajuan disetujui manajemen.'
    );
    expect(html).not.toContain('1234567890');
    expect(html).toContain(DEFAULT_PAYMENT_LEGAL_NOTICE);
  });

  it('buildProformaSnapshot menampilkan rekening bila toggle aktif dan label MENUNGGU PERSETUJUAN MANAJEMEN bila belowMin', async () => {
    const customNotice = 'HANYA KE REK RESMI PT BENTOCAT MANDIRI.';
    const tx = makeTxMock({
      showBankOnProforma: true,
      paymentLegalNotice: customNotice,
      hasBelowMin: true,
    });

    const snapshot = await buildProformaSnapshot(tx, 'ord_pf_1', { businessId: 'biz_1' });
    expect(snapshot.banks).toHaveLength(1);
    expect(snapshot.banks[0].accountNumber).toBe('1234567890');
    expect(snapshot.proformaApprovalPending).toBe(true);
    expect(snapshot.legalNotice).toBe(customNotice);

    const html = await renderReactToHtml(React.createElement(InvoiceDocument, { snapshot }));
    expect(html).toContain('MENUNGGU PERSETUJUAN MANAJEMEN');
    expect(html).toContain('1234567890');
    expect(html).toContain(customNotice);
  });
});
