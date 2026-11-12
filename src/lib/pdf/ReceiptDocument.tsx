import React from 'react';
import { InvoiceTheme, PaymentMethod } from '@prisma/client';
import { getThemeTokens } from './themes';
import { formatRupiah } from '../domain/money';
import { terbilang } from '../domain/terbilang';
import { resolvePaymentLegalNotice } from '../domain/paymentPolicy';

export interface ReceiptDocumentData {
  receiptNo: string;
  paidAt: string;
  method: PaymentMethod;
  reference?: string | null;
  amount: number;
  orderNo: string;
  orderGrandTotal: number;
  orderPaidTotal: number;
  invoiceNumber?: string | null;
  invoiceType?: string | null;
  theme?: InvoiceTheme | null;
  legalNotice?: string | null;
  business: {
    name: string;
    legalName?: string | null;
    address?: string | null;
    phone?: string | null;
    email?: string | null;
    npwp?: string | null;
    logoPath?: string | null;
  };
  customer: {
    name: string;
    contactName?: string | null;
    address?: string | null;
    phone?: string | null;
  };
}

export interface ReceiptDocumentProps {
  receipt: ReceiptDocumentData;
  logoDataUri?: string | null;
  qrDataUri?: string | null;
  verifyUrl?: string | null;
}

const METHOD_LABELS: Record<PaymentMethod, string> = {
  TRANSFER: 'Transfer Bank Resmi',
  CASH: 'Tunai (Cash)',
  CREDIT: 'Potong Saldo Kredit',
  OTHER: 'Lainnya',
};

export function ReceiptDocument({
  receipt,
  logoDataUri,
  qrDataUri,
  verifyUrl,
}: ReceiptDocumentProps) {
  const theme = getThemeTokens(receipt.theme);
  const { business, customer } = receipt;
  const resolvedLegalNotice = resolvePaymentLegalNotice(receipt.legalNotice);
  const remainingDue = Math.max(0, receipt.orderGrandTotal - receipt.orderPaidTotal);

  const formattedPaidAt = new Date(receipt.paidAt).toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  return (
    <html lang="id">
      {/* eslint-disable-next-line @next/next/no-head-element */}
      <head>
        <meta charSet="utf-8" />
        <title>{receipt.receiptNo}</title>
        <style
          dangerouslySetInnerHTML={{
            __html: `
          * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
          }
          body {
            font-family: ${theme.fontFamily};
            color: ${theme.textColor};
            background-color: ${theme.backgroundColor};
            font-size: 11px;
            line-height: 1.5;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .container {
            width: 100%;
            border: 1.5px solid ${theme.borderColor};
            border-radius: 8px;
            padding: 20px;
          }
          .header-box {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            padding-bottom: 14px;
            border-bottom: 2px solid ${theme.primaryColor};
            margin-bottom: 16px;
          }
          .biz-name {
            font-size: 17px;
            font-weight: 800;
            color: ${theme.primaryColor};
          }
          .doc-title {
            font-size: 18px;
            font-weight: 900;
            color: ${theme.primaryColor};
            text-align: right;
            text-transform: uppercase;
            letter-spacing: 0.8px;
          }
          .doc-no {
            font-size: 12px;
            font-weight: 700;
            text-align: right;
            margin-top: 2px;
          }
          .verified-stamp {
            display: inline-block;
            margin-top: 6px;
            padding: 3px 10px;
            border: 1.5px solid #059669;
            background-color: #ECFDF5;
            color: #065F46;
            font-size: 9px;
            font-weight: 800;
            border-radius: 4px;
            letter-spacing: 0.5px;
          }
          .grid-two {
            display: flex;
            justify-content: space-between;
            gap: 16px;
            margin-bottom: 16px;
          }
          .card {
            flex: 1;
            padding: 10px 12px;
            background-color: #F8FAFC;
            border: 1px solid ${theme.borderColor};
            border-radius: 6px;
          }
          .card-label {
            font-size: 9.5px;
            font-weight: 700;
            text-transform: uppercase;
            color: ${theme.mutedTextColor};
            margin-bottom: 4px;
          }
          .amount-box {
            padding: 14px 16px;
            background-color: #ECFDF5;
            border: 1.5px solid #A7F3D0;
            border-radius: 8px;
            margin-bottom: 16px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            gap: 12px;
          }
          .amount-value {
            font-size: 20px;
            font-weight: 900;
            color: #065F46;
            white-space: nowrap;
          }
          .terbilang-line {
            font-size: 10.5px;
            font-style: italic;
            color: #064E3B;
            margin-top: 4px;
          }
          .summary-table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 14px;
          }
          .summary-table td {
            padding: 6px 8px;
            border-bottom: 1px solid ${theme.borderColor};
            font-size: 10.5px;
          }
          .summary-table td.val {
            text-align: right;
            font-weight: 700;
            font-family: monospace;
          }
          .legal-box {
            padding: 8px 12px;
            background-color: #FFFBEB;
            border-left: 3px solid #D97706;
            color: #78350F;
            font-size: 9.5px;
            line-height: 1.45;
            margin-bottom: 16px;
          }
          .footer-row {
            display: flex;
            justify-content: space-between;
            align-items: flex-end;
            gap: 12px;
            padding-top: 10px;
            break-inside: avoid;
          }
          .sign-box {
            width: 175px;
            text-align: center;
            font-size: 10px;
          }
          .sign-line {
            margin-top: 52px;
            border-bottom: 1px solid ${theme.textColor};
            padding-bottom: 3px;
          }
          .qr-box {
            width: 155px;
            text-align: center;
            padding: 8px;
            border: 1px solid ${theme.borderColor};
            border-radius: 6px;
            background-color: #FFFFFF;
          }
          .qr-img {
            width: 80px;
            height: 80px;
            display: block;
            margin: 0 auto 4px auto;
          }
        `,
          }}
        />
      </head>
      <body>
        <div className="container">
          <div className="header-box">
            <div style={{ maxWidth: '56%' }}>
              {logoDataUri ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={logoDataUri}
                  alt={business.name}
                  style={{
                    maxHeight: '50px',
                    maxWidth: '170px',
                    objectFit: 'contain',
                    marginBottom: '6px',
                  }}
                />
              ) : (
                <div className="biz-name">{business.legalName || business.name}</div>
              )}
              <div style={{ fontSize: '9.5px', color: theme.mutedTextColor }}>
                {business.legalName && logoDataUri && (
                  <div style={{ fontWeight: 700, color: theme.textColor }}>
                    {business.legalName}
                  </div>
                )}
                {business.address && <div>{business.address}</div>}
                <div>
                  {business.phone && <span>Telp: {business.phone} </span>}
                  {business.email && <span>• {business.email}</span>}
                </div>
                {business.npwp && <div>NPWP: {business.npwp}</div>}
              </div>
            </div>

            <div style={{ textAlign: 'right' }}>
              <div className="doc-title">KWITANSI PEMBAYARAN</div>
              <div className="doc-no">{receipt.receiptNo}</div>
              <div className="verified-stamp">TERVERIFIKASI PERUSAHAAN</div>
            </div>
          </div>

          <div className="grid-two">
            <div className="card">
              <div className="card-label">Telah Terima Dari</div>
              <div style={{ fontWeight: 700, fontSize: '12px' }}>{customer.name}</div>
              {customer.contactName && <div>UP: {customer.contactName}</div>}
              {customer.address && (
                <div style={{ color: theme.mutedTextColor }}>{customer.address}</div>
              )}
              {customer.phone && (
                <div style={{ color: theme.mutedTextColor }}>Telp: {customer.phone}</div>
              )}
            </div>

            <div className="card">
              <div className="card-label">Rincian Pembayaran</div>
              <div>
                <strong>Tanggal Bayar:</strong> {formattedPaidAt}
              </div>
              <div>
                <strong>Metode:</strong> {METHOD_LABELS[receipt.method] ?? receipt.method}
              </div>
              {receipt.reference && (
                <div>
                  <strong>No. Ref / Transfer:</strong> {receipt.reference}
                </div>
              )}
              <div>
                <strong>No. Order:</strong> {receipt.orderNo}
              </div>
              {receipt.invoiceNumber && (
                <div>
                  <strong>Ref. Faktur:</strong> {receipt.invoiceNumber}
                </div>
              )}
            </div>
          </div>

          <div className="amount-box">
            <div>
              <div
                style={{
                  fontSize: '10px',
                  fontWeight: 800,
                  textTransform: 'uppercase',
                  color: '#065F46',
                }}
              >
                Nominal Diterima Perusahaan
              </div>
              <div className="terbilang-line">
                Terbilang: # {terbilang(Math.round(receipt.amount))} Rupiah #
              </div>
            </div>
            <div className="amount-value">{formatRupiah(receipt.amount)}</div>
          </div>

          <table className="summary-table">
            <tbody>
              <tr>
                <td>Total Nilai Pesanan ({receipt.orderNo})</td>
                <td className="val">{formatRupiah(receipt.orderGrandTotal)}</td>
              </tr>
              <tr>
                <td>Total Dana Terverifikasi Diterima s.d. Saat Ini</td>
                <td className="val" style={{ color: '#065F46' }}>
                  {formatRupiah(receipt.orderPaidTotal)}
                </td>
              </tr>
              <tr>
                <td>Sisa Tagihan Pesanan</td>
                <td className="val">
                  {remainingDue === 0 ? 'LUNAS (Rp 0)' : formatRupiah(remainingDue)}
                </td>
              </tr>
            </tbody>
          </table>

          <div className="legal-box">
            <strong>Keterangan Sah:</strong> {resolvedLegalNotice}
          </div>

          <div className="footer-row">
            <div className="sign-box">
              <div>Penyetor / Pelanggan,</div>
              <div className="sign-line"></div>
              <div style={{ marginTop: '4px' }}>
                ({customer.contactName || customer.name})
              </div>
            </div>

            {qrDataUri && (
              <div className="qr-box">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={qrDataUri}
                  alt="QR Verifikasi Kwitansi"
                  className="qr-img"
                />
                <div
                  style={{
                    fontSize: '8px',
                    fontWeight: 800,
                    color: theme.primaryColor,
                    textTransform: 'uppercase',
                  }}
                >
                  Verifikasi Keaslian
                </div>
                {verifyUrl && (
                  <div
                    style={{
                      fontSize: '6.8px',
                      color: theme.mutedTextColor,
                      wordBreak: 'break-all',
                      marginTop: '2px',
                    }}
                  >
                    {verifyUrl}
                  </div>
                )}
              </div>
            )}

            <div className="sign-box">
              <div>Diterima & Diverifikasi,</div>
              <div className="sign-line"></div>
              <div style={{ marginTop: '4px' }}>{business.name}</div>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}
