import React from 'react';
import { formatRupiah } from '../domain/money';
import { terbilang } from '../domain/terbilang';
import { formatDateId } from '@/lib/format/date';

export interface CreditNotePdfData {
  number: string;
  orderNumber: string;
  settlement: 'OFFSET' | 'CUSTOMER_CREDIT' | 'REFUND';
  createdAt: string;
  voidedAt: string | null;
  reason: string;
  business: {
    name: string;
    legalName: string | null;
    address: string | null;
    phone: string | null;
    email: string | null;
    npwp: string | null;
    logoPath: string | null;
  };
  customer: {
    code: string;
    name: string;
    contactName: string | null;
    address: string | null;
    phone: string | null;
  };
  items: {
    no: number;
    sku: string;
    name: string;
    qty: number;
    unit: string;
    restock: boolean;
    creditAmount: number;
  }[];
  totals: {
    amountExPpn: number;
    ppnAmount: number;
    total: number;
  };
}

export interface CreditNoteDocumentProps {
  data: CreditNotePdfData;
  logoDataUri?: string | null;
}

const SETTLEMENT_LABELS: Record<CreditNotePdfData['settlement'], string> = {
  OFFSET: 'Potong Tagihan Faktur (Offset)',
  CUSTOMER_CREDIT: 'Deposit Saldo Pelanggan',
  REFUND: 'Pengembalian Kas / Refund',
};

export function CreditNoteDocument({
  data,
  logoDataUri,
}: CreditNoteDocumentProps) {
  const { business, customer, items, totals } = data;

  const formattedDate = formatDateId(data.createdAt, 'long');

  const isVoided = Boolean(data.voidedAt);

  return (
    <html lang="id">
      {/* eslint-disable-next-line @next/next/no-head-element */}
      <head>
        <meta charSet="utf-8" />
        <title>{data.number || 'Nota Kredit'}</title>
        <style
          dangerouslySetInnerHTML={{
            __html: `
          * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
          }
          body {
            font-family: Arial, Helvetica, sans-serif;
            color: #0f172a;
            background-color: #ffffff;
            font-size: 11px;
            line-height: 1.5;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .container {
            width: 100%;
            padding: 0;
            position: relative;
          }
          .watermark {
            position: fixed;
            top: 38%;
            left: 50%;
            transform: translate(-50%, -50%) rotate(-30deg);
            font-size: 64px;
            font-weight: 800;
            color: rgba(225, 29, 72, 0.14);
            letter-spacing: 8px;
            pointer-events: none;
            z-index: 10;
            text-transform: uppercase;
            white-space: nowrap;
          }
          .header-box {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            padding-bottom: 16px;
            border-bottom: 2px solid #0f172a;
            margin-bottom: 18px;
          }
          .business-info {
            max-width: 55%;
          }
          .business-name {
            font-size: 18px;
            font-weight: 700;
            color: #0f172a;
            margin-bottom: 2px;
          }
          .business-meta {
            font-size: 10px;
            color: #475569;
          }
          .doc-title-box {
            text-align: right;
          }
          .doc-badge {
            display: inline-block;
            background-color: #312e81;
            color: #ffffff;
            padding: 4px 12px;
            font-size: 14px;
            font-weight: 700;
            letter-spacing: 1px;
            border-radius: 4px;
            margin-bottom: 6px;
          }
          .doc-no {
            font-family: monospace;
            font-size: 13px;
            font-weight: 700;
            color: #0f172a;
          }
          .meta-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 16px;
            margin-bottom: 18px;
          }
          .meta-card {
            border: 1px solid #cbd5e1;
            border-radius: 6px;
            padding: 12px;
            background-color: #f8fafc;
          }
          .card-title {
            font-size: 10px;
            font-weight: 700;
            text-transform: uppercase;
            color: #64748b;
            letter-spacing: 0.5px;
            margin-bottom: 6px;
            border-bottom: 1px solid #e2e8f0;
            padding-bottom: 4px;
          }
          .card-name {
            font-size: 12px;
            font-weight: 700;
            color: #0f172a;
            margin-bottom: 3px;
          }
          .detail-row {
            display: flex;
            font-size: 10.5px;
            margin-bottom: 3px;
          }
          .detail-label {
            width: 115px;
            color: #64748b;
          }
          .detail-val {
            flex: 1;
            font-weight: 600;
            color: #0f172a;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 16px;
          }
          th {
            background-color: #1e293b;
            color: #ffffff;
            text-align: left;
            padding: 8px 10px;
            font-size: 10px;
            text-transform: uppercase;
            letter-spacing: 0.4px;
          }
          td {
            padding: 8px 10px;
            border-bottom: 1px solid #e2e8f0;
            font-size: 10.5px;
          }
          .text-center {
            text-align: center;
          }
          .text-right {
            text-align: right;
          }
          .totals-wrap {
            display: flex;
            justify-content: space-between;
            gap: 16px;
            align-items: flex-start;
            margin-bottom: 18px;
          }
          .reason-box {
            flex: 1;
            border: 1px solid #cbd5e1;
            border-radius: 6px;
            padding: 10px 12px;
            background-color: #fffbeb;
          }
          .totals-box {
            width: 260px;
            border: 1px solid #cbd5e1;
            border-radius: 6px;
            overflow: hidden;
          }
          .tot-row {
            display: flex;
            justify-content: space-between;
            padding: 6px 12px;
            font-size: 10.5px;
            border-bottom: 1px solid #e2e8f0;
          }
          .tot-grand {
            display: flex;
            justify-content: space-between;
            padding: 8px 12px;
            font-size: 12px;
            font-weight: 700;
            background-color: #312e81;
            color: #ffffff;
          }
          .terbilang-line {
            margin-bottom: 18px;
            padding: 8px 12px;
            background-color: #f1f5f9;
            border-left: 3px solid #312e81;
            font-size: 10.5px;
            font-style: italic;
          }
          .signatures-grid {
            display: grid;
            grid-template-columns: 1fr 1fr 1fr;
            gap: 16px;
            margin-top: 24px;
          }
          .sig-box {
            text-align: center;
          }
          .sig-title {
            font-size: 10.5px;
            font-weight: 700;
            margin-bottom: 48px;
          }
          .sig-line {
            border-top: 1px solid #0f172a;
            width: 80%;
            margin: 0 auto 4px auto;
          }
          .sig-subtitle {
            font-size: 9.5px;
            color: #64748b;
          }
        `,
          }}
        />
      </head>
      <body>
        <div className="container">
          {isVoided && <div className="watermark">DIBATALKAN (VOID)</div>}

          <div className="header-box">
            <div className="business-info">
              {logoDataUri && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={logoDataUri}
                  alt={business.name}
                  style={{ maxHeight: '44px', marginBottom: '6px' }}
                />
              )}
              <div className="business-name">{business.legalName || business.name}</div>
              {business.address && <div className="business-meta">{business.address}</div>}
              <div className="business-meta">
                {business.phone ? `Telp: ${business.phone}` : ''}
                {business.phone && business.email ? ' • ' : ''}
                {business.email ? `Email: ${business.email}` : ''}
              </div>
              {business.npwp && <div className="business-meta">NPWP: {business.npwp}</div>}
            </div>

            <div className="doc-title-box">
              <div className="doc-badge">NOTA KREDIT / RETUR</div>
              <div className="doc-no">{data.number}</div>
              <div style={{ fontSize: '10px', color: '#475569', marginTop: '4px' }}>
                Tanggal Terbit: <strong>{formattedDate}</strong>
              </div>
              <div
                style={{
                  fontSize: '10px',
                  fontWeight: 700,
                  marginTop: '2px',
                  color: isVoided ? '#be123c' : '#047857',
                }}
              >
                Status: {isVoided ? 'DIBATALKAN (VOID)' : 'AKTIF'}
              </div>
            </div>
          </div>

          <div className="meta-grid">
            <div className="meta-card">
              <div className="card-title">Pelanggan Penerima Kredit</div>
              <div className="card-name">
                {customer.name} ({customer.code})
              </div>
              {customer.contactName && (
                <div style={{ fontSize: '10.5px', color: '#334155' }}>
                  UP: <strong>{customer.contactName}</strong>
                </div>
              )}
              {customer.address && (
                <div style={{ fontSize: '10px', color: '#475569', marginTop: '3px' }}>
                  {customer.address}
                </div>
              )}
              {customer.phone && (
                <div style={{ fontSize: '10px', color: '#64748b', marginTop: '3px' }}>
                  Telp: {customer.phone}
                </div>
              )}
            </div>

            <div className="meta-card">
              <div className="card-title">Informasi Retur & Penyelesaian</div>
              <div className="detail-row">
                <div className="detail-label">No. Pesanan:</div>
                <div className="detail-val">{data.orderNumber}</div>
              </div>
              <div className="detail-row">
                <div className="detail-label">Penyelesaian:</div>
                <div className="detail-val">{SETTLEMENT_LABELS[data.settlement]}</div>
              </div>
              <div className="detail-row">
                <div className="detail-label">Jumlah Item Retur:</div>
                <div className="detail-val">{items.length} baris produk</div>
              </div>
            </div>
          </div>

          <table>
            <thead>
              <tr>
                <th style={{ width: '36px' }} className="text-center">No</th>
                <th style={{ width: '115px' }}>Kode / SKU</th>
                <th>Produk</th>
                <th style={{ width: '65px' }} className="text-center">Qty Retur</th>
                <th style={{ width: '60px' }} className="text-center">Satuan</th>
                <th style={{ width: '105px' }} className="text-center">Status Stok</th>
                <th style={{ width: '120px' }} className="text-right">Nilai Kredit</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.no}>
                  <td className="text-center">{item.no}</td>
                  <td style={{ fontFamily: 'monospace', fontWeight: 600 }}>{item.sku}</td>
                  <td>
                    <strong>{item.name}</strong>
                  </td>
                  <td className="text-center" style={{ fontWeight: 700 }}>
                    {item.qty}
                  </td>
                  <td className="text-center">{item.unit}</td>
                  <td className="text-center">
                    {item.restock ? 'Dikembalikan ke Stok' : 'Rusak / Non-Restock'}
                  </td>
                  <td className="text-right" style={{ fontWeight: 600 }}>
                    {formatRupiah(item.creditAmount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="totals-wrap">
            <div className="reason-box">
              <div style={{ fontSize: '10px', fontWeight: 700, color: '#92400e', marginBottom: '4px' }}>
                Alasan Penerbitan Nota Kredit:
              </div>
              <div style={{ fontSize: '10.5px', color: '#451a03' }}>{data.reason}</div>
            </div>

            <div className="totals-box">
              <div className="tot-row">
                <span>Subtotal (Ex-PPN)</span>
                <span>{formatRupiah(totals.amountExPpn)}</span>
              </div>
              <div className="tot-row">
                <span>PPN Dikreditkan</span>
                <span>{formatRupiah(totals.ppnAmount)}</span>
              </div>
              <div className="tot-grand">
                <span>Total Nilai Kredit</span>
                <span>{formatRupiah(totals.total)}</span>
              </div>
            </div>
          </div>

          <div className="terbilang-line">
            <strong>Terbilang:</strong> {terbilang(totals.total)} Rupiah
          </div>

          <div className="signatures-grid">
            <div className="sig-box">
              <div className="sig-title">Disiapkan Oleh</div>
              <div className="sig-line" />
              <div className="sig-subtitle">Admin / Keuangan</div>
            </div>
            <div className="sig-box">
              <div className="sig-title">Disetujui Oleh</div>
              <div className="sig-line" />
              <div className="sig-subtitle">Pimpinan / Super Admin</div>
            </div>
            <div className="sig-box">
              <div className="sig-title">Diterima Oleh</div>
              <div className="sig-line" />
              <div className="sig-subtitle">{customer.name}</div>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}

