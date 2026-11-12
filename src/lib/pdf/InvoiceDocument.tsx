import React from 'react';
import { InvoiceSnapshot } from './snapshot';
import { getThemeTokens } from './themes';
import { formatRupiah } from '../domain/money';
import { terbilang } from '../domain/terbilang';
import { resolvePaymentLegalNotice } from '../domain/paymentPolicy';
import { formatDateId } from '@/lib/format/date';

export interface InvoiceDocumentProps {
  snapshot: InvoiceSnapshot;
  logoDataUri?: string | null;
  watermark?: string | null;
  qrDataUri?: string | null;
  verifyUrl?: string | null;
}

export function InvoiceDocument({
  snapshot,
  logoDataUri,
  watermark,
  qrDataUri,
  verifyUrl,
}: InvoiceDocumentProps) {
  const theme = getThemeTokens(snapshot.theme);
  const { business, customer, items, totals, billing } = snapshot;

  const hasDiscount = totals.discountTotal > 0;
  const isDp = snapshot.type === 'DP';
  const isProforma = snapshot.type === 'PROFORMA';
  const docTitle = isProforma
    ? 'PROFORMA ORDER'
    : isDp
    ? 'FAKTUR UANG MUKA'
    : 'FAKTUR PENJUALAN';
  const docNumber =
    snapshot.number || (isProforma ? 'PROFORMA / DRAF' : 'PRATINJAU DRAF');
  const resolvedLegalNotice = resolvePaymentLegalNotice(snapshot.legalNotice);

  const formattedIssueDate = formatDateId(snapshot.issueDate, 'long');

  const formattedDueDate = formatDateId(snapshot.dueDate, 'long');

  return (
    <html lang="id">
      {/* eslint-disable-next-line @next/next/no-head-element */}
      <head>
        <meta charSet="utf-8" />
        <title>{snapshot.number || 'Invoice'}</title>
        <style dangerouslySetInnerHTML={{ __html: `
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
            padding: 0;
          }
          .header-box {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            margin-bottom: 24px;
            padding-bottom: 16px;
            border-bottom: 2px solid ${theme.borderColor};
            ${theme.doubleBorder ? `border-bottom-style: double; border-bottom-width: 4px;` : ''}
          }
          .header-ribbon {
            background-color: ${theme.headerBackground || theme.primaryColor};
            color: ${theme.headerTextColor || '#FFFFFF'};
            padding: 16px 20px;
            border-radius: ${theme.borderRadius};
            margin-bottom: 20px;
            display: flex;
            justify-content: space-between;
            align-items: center;
          }
          .biz-name {
            font-size: 18px;
            font-weight: 800;
            color: ${theme.primaryColor};
            margin-bottom: 4px;
            text-transform: ${theme.doubleBorder ? 'uppercase' : 'none'};
          }
          .invoice-title {
            font-size: 20px;
            font-weight: 800;
            color: ${theme.primaryColor};
            text-align: right;
            text-transform: uppercase;
            letter-spacing: 1px;
          }
          .invoice-number {
            font-size: 13px;
            font-weight: 700;
            color: ${theme.textColor};
            text-align: right;
            margin-top: 2px;
          }
          .meta-row {
            display: flex;
            justify-content: space-between;
            margin-bottom: 20px;
            gap: 20px;
          }
          .meta-box {
            flex: 1;
            padding: 12px 14px;
            background-color: ${theme.accentColor};
            border-radius: ${theme.borderRadius};
            border: 1px solid ${theme.borderColor};
          }
          .meta-title {
            font-size: 10px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            color: ${theme.mutedTextColor};
            margin-bottom: 6px;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 20px;
          }
          thead {
            display: table-header-group;
          }
          tr {
            break-inside: avoid;
          }
          th {
            background-color: ${theme.primaryColor};
            color: #FFFFFF;
            font-size: 10px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            padding: 8px 10px;
            text-align: left;
            border: 1px solid ${theme.primaryColor};
          }
          td {
            padding: 8px 10px;
            border: ${theme.tableBorderWidth} solid ${theme.borderColor};
            font-size: 10.5px;
            vertical-align: middle;
          }
          ${theme.tableStriped ? `tbody tr:nth-child(even) { background-color: ${theme.accentColor}; }` : ''}
          .text-center { text-align: center; }
          .text-right { text-align: right; }
          .font-bold { font-weight: 700; }
          .summary-layout {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            gap: 24px;
            margin-top: 10px;
            break-inside: avoid;
          }
          .payment-info {
            flex: 1.1;
            padding: 12px 16px;
            background-color: ${theme.accentColor};
            border-radius: ${theme.borderRadius};
            border: 1px solid ${theme.borderColor};
          }
          .totals-table {
            flex: 0.9;
            width: auto;
            margin-bottom: 0;
          }
          .totals-table td {
            padding: 5px 8px;
            border: none;
            border-bottom: 1px solid ${theme.borderColor};
          }
          .totals-table tr.grand-total td {
            font-size: 13px;
            font-weight: 800;
            color: ${theme.primaryColor};
            border-top: 2px solid ${theme.primaryColor};
            border-bottom: 2px solid ${theme.primaryColor};
            padding: 8px;
          }
          .terbilang-box {
            margin-top: 14px;
            padding: 8px 12px;
            background-color: #F8FAFC;
            border-left: 3px solid ${theme.primaryColor};
            font-size: 10px;
            font-style: italic;
            color: ${theme.textColor};
          }
          .signature-section {
            display: flex;
            justify-content: space-between;
            align-items: flex-end;
            gap: 12px;
            margin-top: 32px;
            padding-top: 16px;
            break-inside: avoid;
          }
          .signature-box {
            width: 175px;
            text-align: center;
          }
          .signature-line {
            margin-top: 60px;
            border-bottom: 1px solid ${theme.textColor};
            padding-bottom: 4px;
          }
          .verify-qr-box {
            width: 155px;
            text-align: center;
            padding: 8px;
            border: 1px solid ${theme.borderColor};
            border-radius: 6px;
            background-color: #FFFFFF;
          }
          .verify-qr-img {
            width: 82px;
            height: 82px;
            display: block;
            margin: 0 auto 4px auto;
          }
          .verify-qr-title {
            font-size: 8.5px;
            font-weight: 700;
            color: ${theme.primaryColor};
            text-transform: uppercase;
            letter-spacing: 0.3px;
          }
          .verify-qr-url {
            font-size: 7px;
            color: ${theme.mutedTextColor};
            word-break: break-all;
            margin-top: 2px;
            line-height: 1.25;
          }
          .greeting-text {
            text-align: center;
            font-size: 11px;
            font-weight: 600;
            color: ${theme.primaryColor};
            margin-top: 20px;
          }
          .watermark-container {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            display: flex;
            align-items: center;
            justify-content: center;
            pointer-events: none;
            z-index: 9999;
          }
          .watermark-text {
            transform: rotate(-35deg);
            font-size: 48px;
            font-weight: 900;
            color: rgba(220, 38, 38, 0.18);
            text-transform: uppercase;
            border: 5px dashed rgba(220, 38, 38, 0.25);
            padding: 16px 40px;
            border-radius: 14px;
            letter-spacing: 3px;
            text-align: center;
          }
        ` }} />
      </head>
      <body>
        {watermark && (
          <div className="watermark-container">
            <div className="watermark-text">{watermark}</div>
          </div>
        )}

        <div className="container">
          {/* Header Berdasarkan Gaya Tema */}
          {theme.headerStyle === 'ribbon' ? (
            <div className="header-ribbon">
              <div>
                {logoDataUri ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={logoDataUri} alt="Logo" style={{ maxHeight: '48px', maxWidth: '160px', objectFit: 'contain' }} />
                ) : (
                  <h1 style={{ fontSize: '18px', fontWeight: 800 }}>{business.legalName || business.name}</h1>
                )}
                <div style={{ fontSize: '10px', opacity: 0.9, marginTop: '2px' }}>
                  {business.address && <span>{business.address} • </span>}
                  {business.phone && <span>Telp: {business.phone}</span>}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '18px', fontWeight: 900, letterSpacing: '1px' }}>
                  {docTitle}
                </div>
                <div style={{ fontSize: '12px', fontWeight: 700, opacity: 0.95 }}>
                  {docNumber}
                </div>
              </div>
            </div>
          ) : (
            <div className="header-box">
              <div style={{ maxWidth: '55%' }}>
                {logoDataUri ? (
                  <div style={{ marginBottom: '8px' }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={logoDataUri} alt="Logo" style={{ maxHeight: '56px', maxWidth: '180px', objectFit: 'contain' }} />
                  </div>
                ) : null}
                <div className="biz-name">{business.legalName || business.name}</div>
                {business.address && <div>{business.address}</div>}
                {(business.phone || business.email) && (
                  <div>
                    {business.phone && <span>Telp: {business.phone} </span>}
                    {business.email && <span>• Email: {business.email}</span>}
                  </div>
                )}
                {business.npwp && <div>NPWP: {business.npwp}</div>}
              </div>

              <div style={{ textAlign: 'right' }}>
                <div className="invoice-title">
                  {docTitle}
                </div>
                <div className="invoice-number">
                  {docNumber}
                </div>
                <div style={{ marginTop: '8px', fontSize: '10.5px' }}>
                  <div><strong>Tanggal:</strong> {formattedIssueDate}</div>
                  <div><strong>{isProforma ? 'Berlaku s/d:' : 'Jatuh Tempo:'}</strong> {formattedDueDate}</div>
                </div>
              </div>
            </div>
          )}

          {/* Kotak Informasi Penerima (Customer) */}
          <div className="meta-row">
            <div className="meta-box">
              <div className="meta-title">Ditagihkan Kepada:</div>
              <div style={{ fontWeight: 700, fontSize: '12px', color: theme.textColor }}>
                {customer.name} ({customer.code})
              </div>
              {customer.contactName && <div>Up: {customer.contactName}</div>}
              {customer.billingAddress && <div>{customer.billingAddress}</div>}
              {customer.npwp && <div>NPWP: {customer.npwp}</div>}
            </div>

            <div className="meta-box">
              <div className="meta-title">Alamat Pengiriman:</div>
              <div>{customer.shippingAddress || customer.billingAddress || 'Sesuai profil pelanggan'}</div>
              <div style={{ marginTop: '8px', fontSize: '10px', color: theme.mutedTextColor }}>
                Tipe Dokumen:{' '}
                <strong>
                  {isProforma
                    ? 'Proforma Order (Estimasi Penawaran)'
                    : `${isDp ? 'Uang Muka (DP)' : 'Pelunasan (FINAL)'} v${snapshot.billing.dpInvoiceNumber ? '2' : '1'}`}
                </strong>
              </div>
              {isProforma && snapshot.proformaApprovalPending && (
                <div style={{ marginTop: '6px', padding: '4px 8px', backgroundColor: '#FEF3C7', border: '1px solid #F59E0B', borderRadius: '4px', color: '#92400E', fontWeight: 700, fontSize: '9.5px' }}>
                  MENUNGGU PERSETUJUAN MANAJEMEN
                </div>
              )}
            </div>
          </div>

          {/* Tabel Barang Pesanan */}
          <table>
            <thead>
              <tr>
                <th style={{ width: '5%' }} className="text-center">No</th>
                <th style={{ width: hasDiscount ? '45%' : '55%' }}>Nama Produk & Spesifikasi</th>
                <th style={{ width: '10%' }} className="text-center">Qty</th>
                <th style={{ width: '15%' }} className="text-right">Harga Satuan</th>
                {hasDiscount && (
                  <th style={{ width: '12%' }} className="text-right">Diskon</th>
                )}
                <th style={{ width: hasDiscount ? '13%' : '15%' }} className="text-right">Total Net</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.no}>
                  <td className="text-center font-bold">{item.no}</td>
                  <td>
                    <div style={{ fontWeight: 600 }}>{item.name}</div>
                    <div style={{ fontSize: '9.5px', color: theme.mutedTextColor }}>SKU: {item.sku}</div>
                  </td>
                  <td className="text-center">
                    {item.qty} {item.unit}
                  </td>
                  <td className="text-right">{formatRupiah(item.unitPrice)}</td>
                  {hasDiscount && (
                    <td className="text-right" style={{ color: item.lineDiscount > 0 ? '#DC2626' : undefined }}>
                      {item.lineDiscount > 0 ? `-${formatRupiah(item.lineDiscount)}` : '-'}
                    </td>
                  )}
                  <td className="text-right font-bold">{formatRupiah(item.lineNet)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Rincian Ringkasan, Terbilang, dan Pembayaran Bank */}
          <div className="summary-layout">
            <div className="payment-info">
              <div className="meta-title">Instruksi Pembayaran Bank:</div>
              {snapshot.banks && snapshot.banks.length > 0 ? (
                <div style={{ marginBottom: '10px' }}>
                  {snapshot.banks.map((b, idx) => (
                    <div key={idx} style={{ marginBottom: '4px' }}>
                      <span style={{ fontWeight: 700 }}>{b.bankName}</span>: {b.accountNumber} a/n {b.accountHolder}
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ marginBottom: '10px', fontStyle: 'italic' }}>
                  {isProforma
                    ? 'Nomor rekening resmi akan dicantumkan pada Faktur Resmi setelah pengajuan disetujui manajemen.'
                    : 'Silakan hubungi bagian keuangan untuk detail nomor rekening.'}
                </div>
              )}

              {resolvedLegalNotice && (
                <div
                  style={{
                    marginTop: '8px',
                    marginBottom: '8px',
                    padding: '8px 10px',
                    backgroundColor: '#FEF3C7',
                    border: '1px solid #F59E0B',
                    borderRadius: '4px',
                    fontSize: '9.5px',
                    color: '#78350F',
                    fontWeight: 600,
                    lineHeight: 1.4,
                  }}
                >
                  {resolvedLegalNotice}
                </div>
              )}

              {snapshot.note && (
                <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: `1px dashed ${theme.borderColor}`, fontSize: '10px' }}>
                  <strong>Catatan:</strong> {snapshot.note}
                </div>
              )}

              <div className="terbilang-box">
                <strong>Terbilang:</strong> {terbilang(billing.amountDue)} rupiah
              </div>
            </div>

            <table className="totals-table">
              <tbody>
                <tr>
                  <td>Total Barang Bersih</td>
                  <td className="text-right font-bold">
                    {formatRupiah(totals.subtotal - totals.discountTotal)}
                  </td>
                </tr>

                {totals.shippingCharge > 0 && (
                  <tr>
                    <td>Ongkos Kirim</td>
                    <td className="text-right font-bold">
                      {formatRupiah(totals.shippingCharge)}
                    </td>
                  </tr>
                )}

                {totals.ppnEnabled && (
                  <tr>
                    <td>PPN ({totals.ppnRateBps / 100}%)</td>
                    <td className="text-right font-bold">
                      {formatRupiah(totals.ppnAmount)}
                    </td>
                  </tr>
                )}

                <tr className="grand-total">
                  <td>Grand Total Pesanan</td>
                  <td className="text-right">{formatRupiah(totals.grandTotal)}</td>
                </tr>

                {(isDp || (isProforma && billing.dpBps > 0)) && (
                  <>
                    <tr>
                      <td style={{ color: theme.primaryColor, fontWeight: 700 }}>
                        Uang Muka (DP {billing.dpBps / 100}%)
                      </td>
                      <td className="text-right font-bold" style={{ color: theme.primaryColor }}>
                        {formatRupiah(billing.dpAmount)}
                      </td>
                    </tr>
                    <tr>
                      <td colSpan={2} style={{ fontSize: '9.5px', color: theme.mutedTextColor, fontStyle: 'italic', paddingTop: '2px' }}>
                        * Sisa sebesar {formatRupiah(totals.grandTotal - billing.dpAmount)} dibayar saat pelunasan.
                      </td>
                    </tr>
                    <tr style={{ backgroundColor: theme.accentColor }}>
                      <td style={{ fontWeight: 800, fontSize: '12px' }}>
                        {isProforma ? 'Estimasi Tagihan DP Ini' : 'Total Tagihan DP Ini'}
                      </td>
                      <td className="text-right" style={{ fontWeight: 800, fontSize: '12px', color: theme.primaryColor }}>
                        {formatRupiah(billing.amountDue)}
                      </td>
                    </tr>
                  </>
                )}

                {!isDp && !isProforma && billing.dpPaid > 0 && (
                  <>
                    <tr>
                      <td style={{ color: '#16A34A', fontWeight: 600 }}>
                        Uang Muka Terbayar {billing.dpInvoiceNumber ? `(${billing.dpInvoiceNumber})` : ''}
                      </td>
                      <td className="text-right font-bold" style={{ color: '#16A34A' }}>
                        -{formatRupiah(billing.dpPaid)}
                      </td>
                    </tr>
                    <tr style={{ backgroundColor: theme.accentColor }}>
                      <td style={{ fontWeight: 800, fontSize: '12px' }}>Sisa Pelunasan Ditagihkan</td>
                      <td className="text-right" style={{ fontWeight: 800, fontSize: '12px', color: theme.primaryColor }}>
                        {formatRupiah(billing.amountDue)}
                      </td>
                    </tr>
                  </>
                )}

                {((!isDp && !isProforma && billing.dpPaid === 0) || (isProforma && billing.dpBps === 0)) && (
                  <tr style={{ backgroundColor: theme.accentColor }}>
                    <td style={{ fontWeight: 800, fontSize: '12px' }}>
                      {isProforma ? 'Estimasi Total Tagihan' : 'Total Tagihan Penuh'}
                    </td>
                    <td className="text-right" style={{ fontWeight: 800, fontSize: '12px', color: theme.primaryColor }}>
                      {formatRupiah(billing.amountDue)}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {theme.greeting && (
            <div className="greeting-text">
              {theme.greeting}
            </div>
          )}

          {/* Kolom Tanda Tangan & QR Verifikasi */}
          <div className="signature-section">
            <div className="signature-box">
              <div>Penerima / Pelanggan,</div>
              <div className="signature-line"></div>
              <div style={{ marginTop: '4px', fontSize: '10px' }}>({customer.contactName || customer.name})</div>
            </div>

            {qrDataUri && (
              <div className="verify-qr-box">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={qrDataUri}
                  alt="QR Verifikasi Keaslian"
                  className="verify-qr-img"
                />
                <div className="verify-qr-title">Verifikasi Resmi</div>
                {verifyUrl && <div className="verify-qr-url">{verifyUrl}</div>}
              </div>
            )}

            <div className="signature-box">
              <div>Hormat Kami,</div>
              <div className="signature-line"></div>
              <div style={{ marginTop: '4px', fontSize: '10px' }}>{business.name}</div>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}
