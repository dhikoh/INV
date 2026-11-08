import React from 'react';

export interface DeliveryNoteData {
  deliveryNo: string;
  orderNumber: string;
  invoiceNumber: string | null;
  shippedAt: string | null;
  business: {
    name: string;
    legalName: string | null;
    address: string | null;
    phone: string | null;
    email: string | null;
    logoPath: string | null;
  };
  customer: {
    code: string;
    name: string;
    contactName: string | null;
    shippingAddress: string | null;
    phone: string | null;
  };
  logistics: {
    courier: string | null;
    trackingNo: string | null;
    driverName: string | null;
    vehiclePlate: string | null;
    estimatedArrival: string | null;
  };
  items: {
    no: number;
    name: string;
    sku: string;
    qty: number;
    unit: string;
    note?: string | null;
  }[];
  notes: string | null;
}

export interface DeliveryNoteDocumentProps {
  data: DeliveryNoteData;
  logoDataUri?: string | null;
  watermark?: string | null;
}

export function DeliveryNoteDocument({
  data,
  logoDataUri,
  watermark,
}: DeliveryNoteDocumentProps) {
  const { business, customer, logistics, items } = data;

  const formattedShipDate = data.shippedAt
    ? new Date(data.shippedAt).toLocaleDateString('id-ID', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : '-';

  return (
    <html lang="id">
      {/* eslint-disable-next-line @next/next/no-head-element */}
      <head>
        <meta charSet="utf-8" />
        <title>{data.deliveryNo || 'Surat Jalan'}</title>
        <style dangerouslySetInnerHTML={{ __html: `
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
            margin-bottom: 4px;
          }
          .business-meta {
            font-size: 10px;
            color: #475569;
            line-height: 1.4;
          }
          .doc-title-box {
            text-align: right;
          }
          .doc-title {
            font-size: 22px;
            font-weight: 800;
            letter-spacing: 0.05em;
            color: #0f172a;
          }
          .doc-number {
            font-size: 13px;
            font-weight: 700;
            color: #334155;
            margin-top: 2px;
          }
          .meta-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 20px;
            margin-bottom: 20px;
          }
          .meta-card {
            border: 1px solid #cbd5e1;
            border-radius: 4px;
            padding: 10px 14px;
            background-color: #f8fafc;
          }
          .card-title {
            font-size: 10px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            color: #64748b;
            margin-bottom: 6px;
            border-bottom: 1px solid #e2e8f0;
            padding-bottom: 4px;
          }
          .card-content {
            font-size: 11px;
            color: #1e293b;
            line-height: 1.4;
          }
          .card-name {
            font-size: 13px;
            font-weight: 700;
            color: #0f172a;
            margin-bottom: 2px;
          }
          .detail-row {
            display: flex;
            margin-bottom: 3px;
          }
          .detail-label {
            width: 110px;
            color: #64748b;
            font-size: 10px;
          }
          .detail-val {
            flex: 1;
            font-weight: 600;
            color: #0f172a;
            font-size: 11px;
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
            page-break-inside: avoid;
          }
          th {
            background-color: #0f172a;
            color: #ffffff;
            font-size: 10px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            padding: 8px 10px;
            text-align: left;
            border: 1px solid #0f172a;
          }
          td {
            padding: 8px 10px;
            border: 1px solid #cbd5e1;
            font-size: 11px;
            vertical-align: top;
          }
          tbody tr:nth-child(even) {
            background-color: #f8fafc;
          }
          .text-center {
            text-align: center;
          }
          .text-right {
            text-align: right;
          }
          .notes-box {
            border: 1px dashed #cbd5e1;
            padding: 10px;
            border-radius: 4px;
            margin-bottom: 24px;
            background-color: #fafaf9;
            font-size: 10px;
            color: #475569;
          }
          .notes-title {
            font-weight: 700;
            color: #0f172a;
            margin-bottom: 4px;
            font-size: 10px;
            text-transform: uppercase;
          }
          .signatures-grid {
            display: grid;
            grid-template-columns: 1fr 1fr 1fr;
            gap: 20px;
            margin-top: 30px;
            break-inside: avoid;
            page-break-inside: avoid;
          }
          .sig-box {
            border: 1px solid #cbd5e1;
            border-radius: 4px;
            padding: 12px;
            text-align: center;
            background-color: #ffffff;
          }
          .sig-title {
            font-size: 10px;
            font-weight: 700;
            color: #64748b;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            margin-bottom: 50px;
          }
          .sig-line {
            border-bottom: 1px solid #0f172a;
            margin: 0 10px 4px 10px;
          }
          .sig-subtitle {
            font-size: 9px;
            color: #64748b;
          }
          .watermark {
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%) rotate(-35deg);
            font-size: 72px;
            font-weight: 900;
            color: rgba(220, 38, 38, 0.12);
            text-transform: uppercase;
            pointer-events: none;
            z-index: 1000;
            white-space: nowrap;
            letter-spacing: 0.1em;
            user-select: none;
          }
        ` }} />
      </head>
      <body>
        {watermark && <div className="watermark">{watermark}</div>}
        <div className="container">
          <div className="header-box">
            <div className="business-info">
              {logoDataUri && (
                <div style={{ marginBottom: '8px' }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={logoDataUri}
                    alt={business.name}
                    style={{ maxHeight: '48px', maxWidth: '180px', objectFit: 'contain' }}
                  />
                </div>
              )}
              <div className="business-name">{business.legalName || business.name}</div>
              <div className="business-meta">
                {business.address && <div>{business.address}</div>}
                <div>
                  {business.phone && <span>Telp: {business.phone}</span>}
                  {business.phone && business.email && <span> &bull; </span>}
                  {business.email && <span>Email: {business.email}</span>}
                </div>
              </div>
            </div>

            <div className="doc-title-box">
              <div className="doc-title">SURAT JALAN</div>
              <div className="doc-number">{data.deliveryNo}</div>
              <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>
                Tanggal Kirim: <strong style={{ color: '#0f172a' }}>{formattedShipDate}</strong>
              </div>
            </div>
          </div>

          <div className="meta-grid">
            <div className="meta-card">
              <div className="card-title">Tujuan Pengiriman (Customer)</div>
              <div className="card-name">{customer.name} ({customer.code})</div>
              {customer.contactName && (
                <div style={{ fontSize: '11px', color: '#334155', marginBottom: '2px' }}>
                  UP: <strong>{customer.contactName}</strong>
                </div>
              )}
              <div className="card-content" style={{ marginTop: '4px' }}>
                {customer.shippingAddress || 'Alamat sesuai data master pelanggan'}
              </div>
              {customer.phone && (
                <div style={{ marginTop: '4px', fontSize: '10px', color: '#64748b' }}>
                  Kontak: {customer.phone}
                </div>
              )}
            </div>

            <div className="meta-card">
              <div className="card-title">Rujukan & Data Pengiriman</div>
              <div className="detail-row">
                <div className="detail-label">No. Pesanan:</div>
                <div className="detail-val">{data.orderNumber}</div>
              </div>
              {data.invoiceNumber && (
                <div className="detail-row">
                  <div className="detail-label">No. Faktur:</div>
                  <div className="detail-val">{data.invoiceNumber}</div>
                </div>
              )}
              <div className="detail-row">
                <div className="detail-label">Ekspedisi / Kurir:</div>
                <div className="detail-val">{logistics.courier || '-'}</div>
              </div>
              <div className="detail-row">
                <div className="detail-label">No. Resi:</div>
                <div className="detail-val">{logistics.trackingNo || '-'}</div>
              </div>
              {logistics.driverName && (
                <div className="detail-row">
                  <div className="detail-label">Pengemudi:</div>
                  <div className="detail-val">{logistics.driverName}</div>
                </div>
              )}
              {logistics.vehiclePlate && (
                <div className="detail-row">
                  <div className="detail-label">No. Polisi:</div>
                  <div className="detail-val">{logistics.vehiclePlate}</div>
                </div>
              )}
            </div>
          </div>

          <table>
            <thead>
              <tr>
                <th style={{ width: '35px' }} className="text-center">No</th>
                <th style={{ width: '130px' }}>Kode Barang</th>
                <th>Deskripsi Barang</th>
                <th style={{ width: '70px' }} className="text-center">Jumlah</th>
                <th style={{ width: '70px' }} className="text-center">Satuan</th>
                <th style={{ width: '160px' }}>Keterangan / Kondisi</th>
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
                  <td className="text-center" style={{ fontWeight: 700, fontSize: '12px' }}>
                    {item.qty}
                  </td>
                  <td className="text-center">{item.unit}</td>
                  <td style={{ color: '#475569', fontSize: '10px' }}>
                    {item.note || 'Kondisi baik & tersegel'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="notes-box">
            <div className="notes-title">Catatan Pengiriman:</div>
            <div>
              {data.notes ||
                '1. Mohon periksa kembali kondisi fisik kemasan dan kesesuaian jumlah barang sebelum menandatangani surat jalan ini.'}
            </div>
            <div>
              2. Klaim kerusakan atau kekurangan barang hanya dapat diproses maksimal 1x24 jam setelah barang diterima dengan melampirkan salinan surat jalan ini.
            </div>
          </div>

          <div className="signatures-grid">
            <div className="sig-box">
              <div className="sig-title">Diserahkan Oleh (Gudang)</div>
              <div className="sig-line" />
              <div className="sig-subtitle">Tanda Tangan & Nama Terang</div>
            </div>

            <div className="sig-box">
              <div className="sig-title">Dibawa Oleh (Pengemudi)</div>
              <div className="sig-line" />
              <div className="sig-subtitle">
                {logistics.driverName ? logistics.driverName : 'Tanda Tangan & Nama Terang'}
              </div>
            </div>

            <div className="sig-box">
              <div className="sig-title">Diterima Oleh (Customer)</div>
              <div className="sig-line" />
              <div className="sig-subtitle">Tanda Tangan, Nama & Cap Toko</div>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}
