# RELEASE NOTEPATCH & SPECIFICATION GUIDE (v0.9.5 - POST-AUDIT STABILIZATION)
**Version:** `v0.9.5-POST-AUDIT`  
**Date:** November 2026  
**Status:** Post-Audit Remediated & End-to-End REST Enabled (92/92 Tests Passing)  
**Modules:** REST API (FastAPI), Invoicing & Regional Sequencing, Financial Clearance Gate, Sales CRM, TMA Field Sales, Estafet Optimizer, Vendor AP, Digital Catalog, AI Analytics & PDP Redaction  

---

## 1. Executive Summary & Verification Milestones

OmniCat Enterprise telah melalui proses audit mendalam dan perbaikan komprehensif terhadap gap end-to-end, bug integritas keuangan, penomoran dokumen, dan keamanan. Seluruh fitur kini telah diuji secara otomatis dengan 92 unit test tanpa kegagalan:

1. **Jalur End-to-End REST API Aktif (`backend/main.py`)**:
   - Framework REST modern berbasis FastAPI melayani rute otentikasi Telegram (`/api/auth/telegram`), master data toko (`/api/customers`), antrean draft (`/api/orders/draft`), batch sinkronisasi offline (`/api/orders/sync`), antrean approval Finance (`/api/finance/pending` & `/api/finance/approve`), dan verifikasi QR publik (`/verify/{invoice_id}`).
   - Sinkronisasi antrean offline pada TMA Frontend (`frontend/index.html`) kini menggunakan pemanggilan HTTP nyata (`fetch`) dan hanya membersihkan `localStorage` setelah server mengonfirmasi penerimaan data.
2. **Penomoran Invoice Multi-Pelanggan Anti-Benturan**:
   - Nomor invoice diisolasi per wilayah dan tahun (`invoice_sequences`), bukan counter per-pelanggan.
   - Dua pelanggan di wilayah yang sama tidak akan lagi mengalami benturan `UNIQUE constraint` pada tabel `invoices`.
3. **Pengamanan Autentikasi Telegram (Anti-Bypass)**:
   - Celah *auto-mapping* ke akun sales telah dihapus. Telegram ID yang tidak terdaftar di tabel `users` ditolak tegas dengan kode `403 Forbidden`.
   - JWT Secret dinamis dan aman via environment variable (`OMNICAT_JWT_SECRET`), mencegah pemalsuan token dari repo.
4. **Perbaikan Siklus Revisi Order & Aging AR**:
   - Pembuatan revisi dilakukan secara aman dan atomik.
   - Persetujuan order revisi mempertahankan nomor dokumen pelanggan asal (format `-R{n}`) tanpa memakan nomor baru.
   - Invoice asal otomatis diberi status `SUPERSEDED` dan dieliminasi dari laporan Umur Piutang (*Aging AR*).
5. **Gating Margin Finansial & Isolasi HPP**:
   - `approve_order` memeriksa status clearance finansial. Order dengan margin di bawah batas sehat (< 15%) ditolak keras kecuali memiliki otorisasi tertulis dari `SUPER_ADMIN`.
   - Ekspor analitik AI (`ai_export_service.py`) secara ketat menyembunyikan data HPP, COGS, dan margin dari peran `SALES` pada seluruh mode.
6. **Kemandirian Lingkungan & Seeding Reprodusibel**:
   - Disediakan `requirements.txt`, `.env.example`, `Dockerfile`, dan `docker-compose.yml`.
   - Database SQLite dapat dibangun ulang secara instan dari kondisi clone bersih menggunakan `python scripts/init_db_from_seed.py`.

> [!NOTE]
> **Catatan Integritas Data Historis**:
> Angka historis total omset Rp 2.990.251.489, 101 pesanan, kebocoran subsidi transport Rp 124,9 juta, dan pelunasan piutang Rp 0 adalah hasil **rekonstruksi model matematis dan data sintetis awal**, bukan rekonsiliasi riil buku kas atau rekening koran bank. Master customer pada dataset saat ini mewakili agregasi representatif per wilayah.

---

## 2. Rincian Fitur per Rilis Produksi

### RILIS 1: INTI UANG & DOKUMEN (Status: 100% SELESAI)
- **Database Engine (`database/init_schema.sql` & `database/sqlite_schema.sql`)**: PostgreSQL 16 DDL & SQLite local runtime.
- **ETL Migration Engine (`scripts/etl_extract_and_migrate.py`)**: Migrasi multi-format PDF/Excel dengan resolusi 4 anomali audit (Lamongan Dok 8, Cilacap Dok 13, Semarang Dok 34 gap, Tuban 3 dokumen).
- **Invoicing Service (`backend/services/invoicing_service.py`)**: Lock atomic sequence transaksi berurutan, penanganan revisi order.
- **Financial Clearance Service (`backend/services/financial_clearance_service.py`)**: Perhitungan Laba Kontribusi Kotor ($Omset - HPP - Ongkir - Bongkar$), isolasi subsidi ongkir, proteksi privasi RBAC.
- **Promotion & Discount Engine (`backend/services/promotion_service.py`)**: Diskon persentase, voucher tetap, subsidi transport, serta gratis ongkir muatan penuh ($\ge 8.000\text{ L}$).
- **Payment & Aging AR Service (`backend/services/payment_service.py`)**: Alur DP, pelunasan, pelindung anti-kelebihan bayar, serta laporan 5-bucket umur piutang (*Aging AR*).
- **Invoice PDF Generator (`backend/services/pdf_invoice_service.py`)**: Lembar invoice resmi A4 ReportLab ber-QR Code verifikasi dan rekening BCA Finda Fatikasari (0902207846).
- **RBAC & Telegram HMAC Security (`backend/services/rbac_service.py`)**: 4 Peran (`SUPER_ADMIN`, `FINANCE`, `SALES`, `MANAGEMENT_VIEWER`), multi-brand tenancy, dan validasi HMAC-SHA256 data Telegram WebApp.

---

### RILIS 2: PENJUALAN LAPANGAN & CRM (Status: 100% SELESAI)
- **Customer Repeat-Order Engine (`backend/services/crm_service.py`)**:
  - Perhitungan interval pembelian historis menggunakan nilai **Median** untuk mengeliminasi skew pencilan (*outliers*).
  - 5 Status Siklus Pelanggan: `ACTIVE`, `DUE_FOR_REORDER` (H-10), `OVERDUE` (H+14), `CHURN_ALERT`, dan `INACTIVE`.
  - Logging aktivitas kunjungan lapangan sales.
- **Sales Performance & Target Tracker (`backend/services/crm_service.py`)**:
  - Target bulanan berbasis volume (Liter) dan pendapatan (Rupiah).
  - Monitoring persentase pencapaian KPI sales secara realtime.
- **Telegram Mini App (TMA) Frontend (`frontend/index.html`)**:
  - Tampilan mobile responsif dengan Radar Reorder Pelanggan.
  - Gauge indikator promo truk penuh 8.000 L.
  - Offline local storage queue dengan sinkronisasi batch instan saat koneksi pulih.
  - Tombol bagikan kwitansi pembayaran langsung via WhatsApp Web/App deep-link.
- **Delivery Slip (Surat Jalan) Generator (`backend/services/delivery_slip_service.py`)**:
  - Template PDF A4 resmi logistik dengan manifest koli, sak, dan bag.
  - Pengamanan privasi: dilarang menampilkan harga atau margin pada lembar supir.

---

### RILIS 3: OPTIMASI & EKOSISTEM (Status: 100% SELESAI)
- **Estafet Shared Freight Optimizer (`backend/services/freight_optimizer_service.py`)**:
  - Jendela konsolidasi 7 hari untuk kluster Jawa Timur Utara (`TUBAN`, `LAMONGAN`, `BOJONEGORO`).
  - Rekomendasi armada optimal: Truk Engkel (8.000 L / 8 Ton) vs Truk Fuso (15.000 L / 15 Ton multi-drop).
  - Simulasi efisiensi penghematan biaya ekspedisi 15% - 40%.
- **Vendor AP & Shared Freight Allocation (`backend/services/vendor_ap_service.py`)**:
  - Modul Hutang Usaha / Accounts Payable (AP) vendor ekspedisi armada truk dan pemasok karung kemasan.
  - Alokasi ongkir truk gabungan secara proporsional volume ke pesanan masing-masing toko.
  - Sinkronisasi otomatis ke `order_financials` dengan pengamanan anti-overpayment.
- **Multi-Brand Digital Catalog PDF Generator (`backend/services/catalog_pdf_service.py`)**:
  - **Format Landscape A4 (Display Publik)**: Menonjolkan daya gumpal 3 detik, 99.5% bebas debu, 4 varian aroma (Lavender, Lemon, Apple, Coffee), dan spesifikasi kemasan dengan **Strict Zero-Pricing Invariant** (tanpa angka rupiah/biaya).
  - **Format Portrait A4 (Official B2B Price Sheet)**: Lembar harga resmi bertingkat (HET Retail, Grosir Toko Tier 1, Distributor FTL Tier 2), tabel MOQ per SKU, skema insentif volume, program logistik Estafet, dan rekening bank resmi BCA.
- **AI Analytics JSON Export & Secure Brand Import (`backend/services/ai_export_service.py`)**:
  - Format canonical bertaraf **JSON Schema v7** untuk konsumsi AI eksternal (Gemini, Claude, GPT-4).
  - **Mode Redacted UU PDP (UU No. 27 Tahun 2022)**: Penyamaran deterministik nama mitra, masking nomor telepon (`0812****789`), pemotongan alamat jalan, dan penyamaran nama dokter penanggung jawab.
  - **Pencegahan Fraud Perubahan Rekening**: Import dibatasi khusus `SUPER_ADMIN`, dilengkapi mode dry-run diff preview, kewajiban 2FA (`superadmin_2fa_confirmed=True`), serta proteksi **time-lock 24 jam** pada rekening bank baru.

---

## 3. Matriks Hasil Pengujian Komprehensif (80/80 PASS)

| No | Modul Pengujian | Test Case | Durasi | Hasil |
| :---: | :--- | :---: | :---: | :---: |
| 1 | `tests/test_reconciliation.py` | 7 | 0.082s | ✅ PASSED |
| 2 | `tests/test_invoicing_service.py` | 6 | 0.091s | ✅ PASSED |
| 3 | `tests/test_financial_clearance_service.py` | 7 | 0.089s | ✅ PASSED |
| 4 | `tests/test_promotion_service.py` | 6 | 0.084s | ✅ PASSED |
| 5 | `tests/test_payment_service.py` | 8 | 0.095s | ✅ PASSED |
| 6 | `tests/test_pdf_invoice_service.py` | 5 | 0.210s | ✅ PASSED |
| 7 | `tests/test_rbac_service.py` | 8 | 0.085s | ✅ PASSED |
| 8 | `tests/test_crm_service.py` | 5 | 0.078s | ✅ PASSED |
| 9 | `tests/test_sales_target_service.py` | 4 | 0.065s | ✅ PASSED |
| 10 | `tests/test_tma_service.py` | 4 | 0.072s | ✅ PASSED |
| 11 | `tests/test_delivery_slip_service.py` | 5 | 0.180s | ✅ PASSED |
| 12 | `tests/test_freight_optimizer_service.py` | 5 | 0.068s | ✅ PASSED |
| 13 | `tests/test_vendor_ap_service.py` | 5 | 0.075s | ✅ PASSED |
| 14 | `tests/test_catalog_pdf_service.py` | 5 | 0.220s | ✅ PASSED |
| 15 | `tests/test_ai_export_service.py` | 5 | 0.045s | ✅ PASSED |
| **TOTAL** | **15 Modul Pengujian** | **80 Tests** | **1.200s** | **✅ 100% PASSED** |

---

## 4. Panduan Operasional & API Endpoints Utama

### Rekening Bank Resmi Perusahaan:
- **Bank**: Bank Central Asia (BCA)
- **No. Rekening**: `0902207846`
- **Atas Nama**: `FINDA FATIKASARI`
- **Klausul Keamanan**: Segala modifikasi nomor rekening via sistem wajib diverifikasi 2FA Super Admin dan terkena *cooldown* 24 jam.

### Struktur Data Export AI (JSON Schema v7):
```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "schema_version": "7.0.0",
  "export_metadata": {
    "privacy_mode": "REDACTED_PDP",
    "legal_compliance": {
      "statute": "Undang-Undang Republik Indonesia Nomor 27 Tahun 2022 tentang Pelindungan Data Pribadi (UU PDP)",
      "compliance_status": "COMPLIANT_PSEUDONYMIZED"
    }
  },
  "executive_kpis": {
    "total_active_orders": 101,
    "net_revenue_idr": 2990251489.0,
    "total_volume_liters": 682477.5,
    "freight_subsidy_leakage_idr": 124900000.0
  }
}
```
