import React from 'react';
import { InvoiceTheme } from '@prisma/client';
import { getThemeTokens } from './themes';
import { formatRupiah } from '../domain/money';
import { formatDateId } from '@/lib/format/date';

export type CatalogLayoutStyle = 'TABLE' | 'PROMO_GRID' | 'HERO_SALE' | 'EDITORIAL';

export interface CatalogPdfItem {
  no: number;
  productId: string;
  name: string;
  sku: string;
  unit: string;
  price: number;
  strikePrice?: number | null;
  badgeText?: string | null;
  itemNote?: string | null;
  imageDataUri?: string | null;
}

export interface CatalogPdfData {
  title: string;
  subtitle?: string | null;
  promoHighlight?: string | null;
  layoutStyle: CatalogLayoutStyle;
  isPromo?: boolean;
  promoValidityType?: 'NONE' | 'PERIOD';
  promoStartAt?: string | Date | null;
  promoEndAt?: string | Date | null;
  validityText?: string | null;
  showSku?: boolean;
  ctaText?: string | null;
  termsNote?: string | null;
  date: string | Date;
  note?: string | null;
  verifyToken?: string | null;
  verifyUrl?: string | null;
  qrDataUri?: string | null;
  sales?: {
    name: string;
    phone?: string | null;
  } | null;
  business: {
    name: string;
    legalName?: string | null;
    address?: string | null;
    phone?: string | null;
    email?: string | null;
    website?: string | null;
    tagline?: string | null;
    instagram?: string | null;
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
  const {
    business,
    customer,
    items,
    title,
    subtitle,
    promoHighlight,
    layoutStyle = 'TABLE',
    isPromo,
    promoValidityType,
    promoStartAt,
    promoEndAt,
    validityText,
    showSku = true,
    ctaText,
    termsNote,
    note,
    date,
    sales,
    qrDataUri,
    verifyUrl,
  } = data;

  const formattedDate = formatDateId(date, 'long');

  // Format label masa berlaku promo
  let promoPeriodLabel = validityText || '';
  if (!promoPeriodLabel && isPromo) {
    if (promoValidityType === 'PERIOD' && promoStartAt && promoEndAt) {
      promoPeriodLabel = `Periode: ${formatDateId(promoStartAt, 'short')} - ${formatDateId(promoEndAt, 'short')}`;
    } else {
      promoPeriodLabel = 'Berlaku Selama Persediaan Masih Ada';
    }
  }

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
            font-family: ${layoutStyle === 'EDITORIAL' ? '"Georgia", "Times New Roman", serif' : theme.fontFamily};
            color: ${layoutStyle === 'EDITORIAL' ? '#2A2A2A' : theme.textColor};
            background-color: ${layoutStyle === 'EDITORIAL' ? '#FAF9F6' : theme.backgroundColor};
            font-size: 11px;
            line-height: 1.5;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .container {
            width: 100%;
            padding: 0;
          }

          /* Header Utama */
          .header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            padding-bottom: 14px;
            border-bottom: 2px solid ${layoutStyle === 'EDITORIAL' ? '#4A4A4A' : theme.primaryColor};
            margin-bottom: 16px;
          }
          .brand-section {
            display: flex;
            align-items: center;
            gap: 12px;
          }
          .logo {
            max-width: 85px;
            max-height: 55px;
            object-fit: contain;
          }
          .business-title {
            font-size: 16px;
            font-weight: 700;
            color: ${layoutStyle === 'EDITORIAL' ? '#1A1A1A' : theme.primaryColor};
            letter-spacing: ${layoutStyle === 'EDITORIAL' ? '1px' : 'normal'};
          }
          .business-tagline {
            font-size: 10px;
            font-style: italic;
            color: #64748B;
            margin-top: 1px;
          }
          .business-legal {
            font-size: 9.5px;
            color: ${theme.mutedTextColor};
            margin-top: 1px;
          }
          .business-contact {
            font-size: 9px;
            color: ${theme.mutedTextColor};
            margin-top: 3px;
            line-height: 1.3;
          }
          .business-website {
            color: ${theme.primaryColor};
            font-weight: 600;
            font-size: 9.5px;
          }

          /* Header Meta Kanan & QR Verifikasi */
          .header-meta-box {
            display: flex;
            align-items: center;
            gap: 12px;
            text-align: right;
          }
          .catalog-meta {
            text-align: right;
          }
          .catalog-headline {
            font-size: 18px;
            font-weight: 800;
            color: ${layoutStyle === 'EDITORIAL' ? '#1A1A1A' : theme.primaryColor};
            text-transform: uppercase;
            letter-spacing: 0.5px;
          }
          .catalog-subtitle {
            font-size: 11px;
            color: #475569;
            font-weight: 600;
            margin-top: 2px;
          }
          .promo-pill {
            display: inline-block;
            margin-top: 4px;
            padding: 2px 8px;
            background-color: #DC2626;
            color: #FFFFFF;
            border-radius: 4px;
            font-size: 9.5px;
            font-weight: 800;
            text-transform: uppercase;
          }
          .catalog-date {
            font-size: 9.5px;
            color: ${theme.mutedTextColor};
            margin-top: 3px;
          }
          .qr-box {
            text-align: center;
            padding: 4px 6px;
            background-color: #FFFFFF;
            border: 1px solid #CBD5E1;
            border-radius: 6px;
          }
          .qr-img {
            width: 48px;
            height: 48px;
            display: block;
            margin: 0 auto;
          }
          .qr-caption {
            font-size: 7.5px;
            font-weight: 700;
            color: #475569;
            margin-top: 2px;
            text-transform: uppercase;
          }

          /* Info Bar: Sales PIC & Customer */
          .sub-bar {
            display: flex;
            justify-content: space-between;
            align-items: center;
            background-color: #F8FAFC;
            border: 1px solid #E2E8F0;
            border-radius: 6px;
            padding: 6px 12px;
            margin-bottom: 16px;
            font-size: 10px;
          }
          .sales-pic {
            font-weight: 600;
            color: #1E293B;
          }
          .sales-phone {
            color: #0284C7;
            font-weight: 700;
            margin-left: 4px;
          }
          .customer-badge {
            padding: 2px 8px;
            background-color: ${theme.accentColor};
            color: ${theme.primaryColor};
            border-radius: 4px;
            font-weight: 600;
          }

          /* Banner Hero Khusus HERO_SALE */
          .hero-banner {
            background: linear-gradient(135deg, #1E3A8A 0%, #2563EB 50%, #F59E0B 100%);
            color: #FFFFFF;
            padding: 20px 24px;
            border-radius: 10px;
            margin-bottom: 20px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            box-shadow: 0 4px 12px rgba(0,0,0,0.08);
          }
          .hero-content h1 {
            font-size: 24px;
            font-weight: 900;
            letter-spacing: 1px;
            text-transform: uppercase;
            text-shadow: 0 1px 2px rgba(0,0,0,0.3);
          }
          .hero-content p {
            font-size: 12px;
            font-weight: 500;
            opacity: 0.95;
            margin-top: 4px;
          }
          .hero-badge-pill {
            background-color: #EF4444;
            color: #FFFFFF;
            font-size: 16px;
            font-weight: 900;
            padding: 8px 16px;
            border-radius: 8px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            box-shadow: 0 2px 6px rgba(0,0,0,0.2);
            text-align: center;
          }
          .hero-badge-sub {
            font-size: 9px;
            font-weight: 600;
            display: block;
            margin-top: 2px;
          }

          /* Style 1: TABLE */
          table.table-layout {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 20px;
          }
          table.table-layout thead {
            display: table-header-group;
          }
          table.table-layout tr {
            break-inside: avoid;
          }
          table.table-layout th {
            background-color: ${theme.primaryColor};
            color: #FFFFFF;
            font-weight: 600;
            font-size: 10px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            padding: 8px 10px;
            text-align: left;
          }
          table.table-layout td {
            padding: 8px 10px;
            border-bottom: 1px solid ${theme.borderColor};
            vertical-align: middle;
            font-size: 10.5px;
          }
          .col-no { width: 35px; text-align: center; }
          .col-img { width: 55px; text-align: center; }
          .col-product { text-align: left; }
          .col-sku { width: 85px; font-family: monospace; font-size: 9.5px; color: ${theme.mutedTextColor}; }
          .col-unit { width: 60px; text-align: center; }
          .col-price { width: 120px; text-align: right; }
          .strike-price {
            text-decoration: line-through;
            color: #94A3B8;
            font-size: 9.5px;
            margin-right: 6px;
            display: inline-block;
          }
          .current-price {
            font-weight: 700;
            color: ${isPromo ? '#DC2626' : theme.primaryColor};
          }
          .item-badge-pill {
            display: inline-block;
            background-color: #FEF2F2;
            color: #DC2626;
            border: 1px solid #FECACA;
            border-radius: 3px;
            padding: 1px 5px;
            font-size: 8.5px;
            font-weight: 800;
            text-transform: uppercase;
            margin-bottom: 2px;
          }

          /* Style 2 & 3: GRID (PROMO_GRID & HERO_SALE) */
          .promo-grid {
            display: flex;
            flex-wrap: wrap;
            gap: 12px;
            margin-bottom: 20px;
          }
          .promo-card {
            width: calc(25% - 9px);
            background-color: #FFFFFF;
            border: 1px solid #E2E8F0;
            border-radius: 8px;
            padding: 10px;
            position: relative;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            break-inside: avoid;
            box-shadow: 0 1px 3px rgba(0,0,0,0.03);
          }
          .card-badge {
            position: absolute;
            top: 6px;
            left: 6px;
            background-color: #DC2626;
            color: #FFFFFF;
            font-size: 8.5px;
            font-weight: 800;
            padding: 2px 6px;
            border-radius: 3px;
            text-transform: uppercase;
            letter-spacing: 0.3px;
            z-index: 2;
          }
          .card-img-box {
            width: 100%;
            height: 110px;
            display: flex;
            align-items: center;
            justify-content: center;
            margin-bottom: 8px;
            overflow: hidden;
            background-color: #F8FAFC;
            border-radius: 6px;
          }
          .card-img {
            max-width: 100%;
            max-height: 100%;
            object-fit: contain;
          }
          .card-placeholder {
            width: 100%;
            height: 100%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 24px;
            font-weight: 800;
            color: #94A3B8;
            background-color: #F1F5F9;
          }
          .card-name {
            font-size: 11px;
            font-weight: 700;
            color: #0F172A;
            line-height: 1.3;
            min-height: 28px;
            margin-bottom: 4px;
          }
          .card-sku {
            font-family: monospace;
            font-size: 9px;
            color: #64748B;
          }
          .card-note {
            font-size: 9px;
            color: #475569;
            margin-bottom: 4px;
          }
          .card-pricing {
            margin-top: 6px;
            padding-top: 6px;
            border-top: 1px dashed #E2E8F0;
          }
          .card-strike {
            font-size: 9.5px;
            color: #94A3B8;
            text-decoration: line-through;
            font-weight: 600;
          }
          .card-price {
            font-size: 13.5px;
            font-weight: 800;
            color: #DC2626;
            line-height: 1.2;
          }

          /* Style 4: EDITORIAL (Lookbook Minimalis) */
          .editorial-grid {
            display: flex;
            flex-wrap: wrap;
            gap: 20px;
            margin-bottom: 24px;
          }
          .editorial-card {
            width: calc(33.333% - 14px);
            text-align: center;
            break-inside: avoid;
            padding-bottom: 14px;
            border-bottom: 1px solid #E5E5E5;
          }
          .editorial-img-box {
            width: 100%;
            height: 160px;
            background-color: #F4F1EA;
            display: flex;
            align-items: center;
            justify-content: center;
            margin-bottom: 12px;
            overflow: hidden;
            border-radius: 4px;
          }
          .editorial-img {
            max-width: 100%;
            max-height: 100%;
            object-fit: cover;
          }
          .editorial-name {
            font-size: 13px;
            font-weight: 600;
            letter-spacing: 0.5px;
            color: #1A1A1A;
            margin-bottom: 4px;
            text-transform: uppercase;
          }
          .editorial-note {
            font-size: 10px;
            font-style: italic;
            color: #666666;
            margin-bottom: 6px;
          }
          .editorial-price {
            font-size: 12.5px;
            font-weight: 700;
            color: #2A2A2A;
            letter-spacing: 0.5px;
          }

          /* Bottom CTA Strip untuk HERO_SALE */
          .cta-strip {
            background-color: #0F172A;
            color: #FFFFFF;
            padding: 12px 18px;
            border-radius: 8px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 16px;
            break-inside: avoid;
          }
          .cta-text {
            font-size: 12px;
            font-weight: 700;
            letter-spacing: 0.5px;
          }
          .cta-phone {
            font-size: 13px;
            font-weight: 800;
            color: #FBBF24;
            font-family: monospace;
          }

          /* Catatan Tambahan */
          .catalog-note {
            margin-bottom: 16px;
            padding: 8px 12px;
            background-color: #F8FAFC;
            border-left: 3px solid ${theme.primaryColor};
            font-size: 10px;
            color: #334155;
            border-radius: 2px;
          }
          .terms-note {
            margin-bottom: 16px;
            padding: 8px 12px;
            background-color: #FFFBEB;
            border: 1px solid #FDE68A;
            font-size: 9.5px;
            color: #92400E;
            border-radius: 4px;
          }

          /* Footer Keamanan Anti-Fraud (NO BANK ACCOUNTS) */
          .footer {
            break-inside: avoid;
            margin-top: 16px;
            padding-top: 12px;
            border-top: 1px dashed ${theme.borderColor};
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            font-size: 9px;
            color: ${theme.mutedTextColor};
          }
          .security-caution {
            max-width: 65%;
            line-height: 1.4;
          }
          .security-caution strong {
            color: #DC2626;
          }
          .contact-block {
            text-align: right;
            line-height: 1.4;
          }
          .thumb-img {
            width: 40px;
            height: 40px;
            object-fit: cover;
            border-radius: 4px;
            border: 1px solid ${theme.borderColor};
            background-color: #F1F5F9;
          }
          .thumb-placeholder {
            width: 40px;
            height: 40px;
            border-radius: 4px;
            background-color: #E2E8F0;
            color: #64748B;
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: 700;
            font-size: 11px;
            border: 1px solid #CBD5E1;
            margin: 0 auto;
          }
        `,
          }}
        />
      </head>
      <body>
        <div className="container">
          {/* Header Atas */}
          <div className="header">
            <div className="brand-section">
              {logoDataUri ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logoDataUri} alt={business.name} className="logo" />
              ) : null}
              <div>
                <div className="business-title">{business.name}</div>
                {business.tagline ? (
                  <div className="business-tagline">{business.tagline}</div>
                ) : null}
                {business.legalName ? (
                  <div className="business-legal">{business.legalName}</div>
                ) : null}
                <div className="business-contact">
                  {business.address ? <div>{business.address}</div> : null}
                  {business.phone ? <div>Telp Kantor: {business.phone}</div> : null}
                  {business.website ? (
                    <div className="business-website">{business.website}</div>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="header-meta-box">
              <div className="catalog-meta">
                <div className="catalog-headline">{title}</div>
                {subtitle ? (
                  <div className="catalog-subtitle">{subtitle}</div>
                ) : null}
                {promoPeriodLabel ? (
                  <div className="promo-pill">{promoPeriodLabel}</div>
                ) : null}
                <div className="catalog-date">Diterbitkan: {formattedDate}</div>
              </div>

              {/* QR Code Verifikasi Keaslian */}
              {qrDataUri ? (
                <div className="qr-box">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={qrDataUri} alt="QR Verifikasi" className="qr-img" />
                  <div className="qr-caption">Scan Keaslian</div>
                </div>
              ) : null}
            </div>
          </div>

          {/* Sub-bar: Sales PIC & Customer Penerima */}
          <div className="sub-bar">
            <div className="sales-pic">
              <span>Sales PIC Resmi: </span>
              <strong>{sales?.name || 'Kantor Pusat'}</strong>
              {sales?.phone ? (
                <span className="sales-phone">| WA/Telp: {sales.phone}</span>
              ) : null}
            </div>

            {customer ? (
              <div className="customer-badge">
                Khusus Pelanggan: {customer.name} ({customer.code})
              </div>
            ) : (
              <div className="customer-badge" style={{ backgroundColor: '#F1F5F9', color: '#475569' }}>
                Katalog Publik Resmi
              </div>
            )}
          </div>

          {/* Banner Hero untuk template HERO_SALE */}
          {layoutStyle === 'HERO_SALE' && (
            <div className="hero-banner">
              <div className="hero-content">
                <h1>{title}</h1>
                <p>{subtitle || 'Penawaran Spesial Produk Unggulan & Harga Terbaik'}</p>
                {promoPeriodLabel ? (
                  <p style={{ marginTop: '6px', fontSize: '11px', fontWeight: 700 }}>
                    📅 {promoPeriodLabel}
                  </p>
                ) : null}
              </div>

              {promoHighlight ? (
                <div className="hero-badge-pill">
                  {promoHighlight}
                  <span className="hero-badge-sub">Penawaran Terbatas</span>
                </div>
              ) : (
                <div className="hero-badge-pill">
                  PROMO SPESIAL
                  <span className="hero-badge-sub">Hemat Maksimal</span>
                </div>
              )}
            </div>
          )}

          {/* Catatan Katalog jika ada */}
          {note ? (
            <div className="catalog-note">
              <strong>Catatan:</strong> {note}
            </div>
          ) : null}

          {/* TEMPLATE 1: TABLE */}
          {layoutStyle === 'TABLE' && (
            <table className="table-layout">
              <thead>
                <tr>
                  <th className="col-no">No</th>
                  <th className="col-img">Foto</th>
                  <th className="col-product">Nama Produk</th>
                  {showSku ? <th className="col-sku">SKU</th> : null}
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
                        {item.badgeText ? (
                          <div>
                            <span className="item-badge-pill">{item.badgeText}</span>
                          </div>
                        ) : null}
                        <strong>{item.name}</strong>
                        {item.itemNote ? (
                          <div style={{ fontSize: '9px', color: '#64748B' }}>
                            {item.itemNote}
                          </div>
                        ) : null}
                      </td>
                      {showSku ? <td className="col-sku">{item.sku}</td> : null}
                      <td className="col-unit">{item.unit}</td>
                      <td className="col-price">
                        {item.strikePrice ? (
                          <span className="strike-price">
                            {formatRupiah(item.strikePrice)}
                          </span>
                        ) : null}
                        <span className="current-price">
                          {formatRupiah(item.price)}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}

          {/* TEMPLATE 2 & 3: PROMO_GRID / HERO_SALE */}
          {(layoutStyle === 'PROMO_GRID' || layoutStyle === 'HERO_SALE') && (
            <div className="promo-grid">
              {items.map((item) => {
                const initial = item.name.trim().charAt(0).toUpperCase() || 'P';
                return (
                  <div key={item.productId} className="promo-card">
                    {item.badgeText ? (
                      <div className="card-badge">{item.badgeText}</div>
                    ) : null}

                    <div className="card-img-box">
                      {item.imageDataUri ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={item.imageDataUri}
                          alt={item.name}
                          className="card-img"
                        />
                      ) : (
                        <div className="card-placeholder">{initial}</div>
                      )}
                    </div>

                    <div>
                      <div className="card-name">{item.name}</div>
                      {item.itemNote ? (
                        <div className="card-note">{item.itemNote}</div>
                      ) : null}
                      {showSku ? (
                        <div className="card-sku">{item.sku} | {item.unit}</div>
                      ) : (
                        <div className="card-sku">{item.unit}</div>
                      )}
                    </div>

                    <div className="card-pricing">
                      {item.strikePrice ? (
                        <div className="card-strike">
                          {formatRupiah(item.strikePrice)}
                        </div>
                      ) : null}
                      <div className="card-price">
                        {formatRupiah(item.price)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* TEMPLATE 4: EDITORIAL (Lookbook Minimalis) */}
          {layoutStyle === 'EDITORIAL' && (
            <div className="editorial-grid">
              {items.map((item) => {
                const initial = item.name.trim().charAt(0).toUpperCase() || 'P';
                return (
                  <div key={item.productId} className="editorial-card">
                    <div className="editorial-img-box">
                      {item.imageDataUri ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={item.imageDataUri}
                          alt={item.name}
                          className="editorial-img"
                        />
                      ) : (
                        <div style={{ fontSize: '28px', color: '#B0A89F' }}>
                          {initial}
                        </div>
                      )}
                    </div>

                    <div className="editorial-name">{item.name}</div>
                    {item.itemNote ? (
                      <div className="editorial-note">{item.itemNote}</div>
                    ) : null}
                    {showSku ? (
                      <div style={{ fontSize: '9px', color: '#888', marginBottom: '4px' }}>
                        {item.sku} / {item.unit}
                      </div>
                    ) : null}
                    <div className="editorial-price">
                      {item.strikePrice ? (
                        <span style={{ textDecoration: 'line-through', color: '#999', marginRight: '6px', fontSize: '11px' }}>
                          {formatRupiah(item.strikePrice)}
                        </span>
                      ) : null}
                      <span>{formatRupiah(item.price)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Strip CTA Footer Khusus HERO_SALE */}
          {layoutStyle === 'HERO_SALE' && (
            <div className="cta-strip">
              <div className="cta-text">
                📢 {ctaText || 'Pemesanan Resmi & Konsultasi Langsung Melalui Sales Kami!'}
              </div>
              <div className="cta-phone">
                {sales?.phone ? `WA/TELP: ${sales.phone}` : business.phone || ''}
              </div>
            </div>
          )}

          {/* Syarat & Ketentuan Promo */}
          {termsNote ? (
            <div className="terms-note">
              <strong>Syarat & Ketentuan Promo:</strong>
              <div style={{ whiteSpace: 'pre-line', marginTop: '2px' }}>{termsNote}</div>
            </div>
          ) : null}

          {/* Footer Anti-Fraud (NO BANK ACCOUNTS) */}
          <div className="footer">
            <div className="security-caution">
              <div>
                <strong>* PERHATIAN KEAMANAN TRANSAKSI:</strong>
              </div>
              <div>
                Katalog ini diterbitkan resmi oleh unit usaha untuk keperluan penawaran harga.
                Pemesanan resmi hanya dilayani melalui kontak Sales PIC atau nomor kantor yang tertera di atas.
                <strong> DILARANG mentransfer dana ke rekening pribadi Sales apa pun alasannya.</strong> Pembayaran tagihan sah hanya dilakukan ke rekening resmi perusahaan saat Faktur resmi diterbitkan.
              </div>
            </div>

            <div className="contact-block">
              {business.website ? <div>🌐 {business.website}</div> : null}
              {business.instagram ? <div>📸 {business.instagram}</div> : null}
              {business.email ? <div>✉️ {business.email}</div> : null}
              {verifyUrl ? (
                <div style={{ marginTop: '2px', fontSize: '8px', color: '#0284C7' }}>
                  Verifikasi: {verifyUrl}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}
