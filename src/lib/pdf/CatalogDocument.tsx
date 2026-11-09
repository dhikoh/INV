import React from 'react';
import { InvoiceTheme } from '@prisma/client';
import { getThemeTokens } from './themes';
import { formatRupiah } from '../domain/money';

export interface CatalogPdfItem {
  no: number;
  productId: string;
  name: string;
  sku: string;
  unit: string;
  price: number;
  imageDataUri?: string | null;
}

export interface CatalogPdfData {
  title: string;
  date: string;
  note?: string | null;
  business: {
    name: string;
    legalName?: string | null;
    address?: string | null;
    phone?: string | null;
    email?: string | null;
    ppnEnabled?: boolean;
    invoiceTheme?: InvoiceTheme;
  };
  customer?: {
    code: string;
    name: string;
  } | null;
  items: CatalogPdfItem[];
}

export interface CatalogDocumentProps {
  data: CatalogPdfData;
  logoDataUri?: string | null;
}

export function CatalogDocument({ data, logoDataUri }: CatalogDocumentProps) {
  const theme = getThemeTokens(data.business.invoiceTheme || InvoiceTheme.PROFESIONAL);
  const { business, customer, items, title, note, date } = data;

  const formattedDate = new Date(date).toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  return (
    <html lang="id">
      {/* eslint-disable-next-line @next/next/no-head-element */}
      <head>
        <meta charSet="utf-8" />
        <title>{title}</title>
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
            padding: 0;
          }
          .header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            padding-bottom: 16px;
            border-bottom: 2px solid ${theme.primaryColor};
            margin-bottom: 20px;
          }
          .brand-section {
            display: flex;
            align-items: center;
            gap: 14px;
          }
          .logo {
            max-width: 90px;
            max-height: 60px;
            object-fit: contain;
          }
          .business-title {
            font-size: 16px;
            font-weight: 700;
            color: ${theme.primaryColor};
          }
          .business-legal {
            font-size: 10px;
            color: ${theme.mutedTextColor};
            margin-top: 2px;
          }
          .business-contact {
            font-size: 9.5px;
            color: ${theme.mutedTextColor};
            margin-top: 4px;
            line-height: 1.3;
          }
          .catalog-meta {
            text-align: right;
          }
          .catalog-headline {
            font-size: 20px;
            font-weight: 800;
            color: ${theme.primaryColor};
            text-transform: uppercase;
            letter-spacing: 0.5px;
          }
          .catalog-date {
            font-size: 10px;
            color: ${theme.mutedTextColor};
            margin-top: 4px;
          }
          .customer-badge {
            display: inline-block;
            margin-top: 6px;
            padding: 3px 8px;
            background-color: ${theme.accentColor};
            color: ${theme.primaryColor};
            border-radius: ${theme.borderRadius};
            font-size: 10px;
            font-weight: 600;
          }
          .catalog-note {
            margin-bottom: 16px;
            padding: 8px 12px;
            background-color: #F8FAFC;
            border-left: 3px solid ${theme.primaryColor};
            font-size: 10px;
            color: #334155;
            border-radius: 2px;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 24px;
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
            font-weight: 600;
            font-size: 10px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            padding: 8px 10px;
            text-align: left;
          }
          td {
            padding: 8px 10px;
            border-bottom: 1px solid ${theme.borderColor};
            vertical-align: middle;
            font-size: 10.5px;
          }
          ${theme.tableStriped ? `tbody tr:nth-child(even) { background-color: ${theme.accentColor}; }` : ''}
          .col-no {
            width: 35px;
            text-align: center;
          }
          .col-img {
            width: 55px;
            text-align: center;
          }
          .col-product {
            text-align: left;
          }
          .col-sku {
            width: 90px;
            font-family: monospace;
            font-size: 10px;
            color: ${theme.mutedTextColor};
          }
          .col-unit {
            width: 60px;
            text-align: center;
          }
          .col-price {
            width: 110px;
            text-align: right;
            font-weight: 700;
            color: ${theme.primaryColor};
          }
          .thumb-img {
            width: 44px;
            height: 44px;
            object-fit: cover;
            border-radius: 4px;
            border: 1px solid ${theme.borderColor};
            background-color: #F1F5F9;
          }
          .thumb-placeholder {
            width: 44px;
            height: 44px;
            border-radius: 4px;
            background-color: #E2E8F0;
            color: #64748B;
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: 700;
            font-size: 12px;
            text-transform: uppercase;
            border: 1px solid #CBD5E1;
            margin: 0 auto;
          }
          .footer {
            break-inside: avoid;
            margin-top: 20px;
            padding-top: 14px;
            border-top: 1px dashed ${theme.borderColor};
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            font-size: 9.5px;
            color: ${theme.mutedTextColor};
          }
          .disclaimer {
            font-weight: 600;
            color: #475569;
          }
          .ppn-info {
            color: #0369A1;
            margin-top: 2px;
          }
          .contact-block {
            text-align: right;
            line-height: 1.4;
          }
        `,
          }}
        />
      </head>
      <body>
        <div className="container">
          {/* Header */}
          <div className="header">
            <div className="brand-section">
              {logoDataUri ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logoDataUri} alt={business.name} className="logo" />
              ) : null}
              <div>
                <div className="business-title">{business.name}</div>
                {business.legalName ? (
                  <div className="business-legal">{business.legalName}</div>
                ) : null}
                <div className="business-contact">
                  {business.address ? <div>{business.address}</div> : null}
                  {business.phone ? <div>Telp: {business.phone}</div> : null}
                </div>
              </div>
            </div>

            <div className="catalog-meta">
              <div className="catalog-headline">{title}</div>
              <div className="catalog-date">Tanggal: {formattedDate}</div>
              {customer ? (
                <div className="customer-badge">
                  Untuk: {customer.name} ({customer.code})
                </div>
              ) : null}
            </div>
          </div>

          {/* Catatan Katalog jika ada */}
          {note ? (
            <div className="catalog-note">
              <strong>Catatan:</strong> {note}
            </div>
          ) : null}

          {/* Tabel Produk */}
          <table>
            <thead>
              <tr>
                <th className="col-no">No</th>
                <th className="col-img">Foto</th>
                <th className="col-product">Nama Produk</th>
                <th className="col-sku">SKU</th>
                <th className="col-unit">Satuan</th>
                <th className="col-price">Harga</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const initial = item.name.trim().charAt(0).toUpperCase() || 'P';
                return (
                  <tr key={item.productId}>
                    <td className="col-no">{item.no}</td>
                    <td className="col-img">
                      {item.imageDataUri ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={item.imageDataUri}
                          alt={item.name}
                          className="thumb-img"
                        />
                      ) : (
                        <div className="thumb-placeholder">{initial}</div>
                      )}
                    </td>
                    <td className="col-product">
                      <strong>{item.name}</strong>
                    </td>
                    <td className="col-sku">{item.sku}</td>
                    <td className="col-unit">{item.unit}</td>
                    <td className="col-price">
                      Rp {formatRupiah(item.price)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* Footer Info */}
          <div className="footer">
            <div>
              <div className="disclaimer">
                * Harga dapat berubah sewaktu-waktu.
              </div>
              {business.ppnEnabled ? (
                <div className="ppn-info">
                  * Harga belum termasuk PPN ({business.ppnEnabled ? 'PPN berlaku' : ''}).
                </div>
              ) : null}
            </div>

            <div className="contact-block">
              {business.phone ? <div>Hubungi kami: {business.phone}</div> : null}
              {business.email ? <div>Email: {business.email}</div> : null}
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}
