# Active Context: OmniCat Enterprise

## 1. Current Focus
- **Active Release:** Release 1 (Core Money & Documents)
- **Current Milestone:** Task 3 - Document Generation & Security
- **Current Active Sub-Task:** **Sub-task 3.2: RBAC Middleware & Authentication Contracts**

## 2. Recent Accomplishments
- **Sub-task 3.1 Selesai & Terverifikasi:**
  - `backend/services/pdf_invoice_service.py`: Generator PDF A4 resmi standar BentoCat menggunakan ReportLab.
  - Memuat kop brand, nomor invoice, tanggal jatuh tempo, rincian varian produk (25L, 10L, 5.5L), baris diskon/ongkir/bongkar, instruksi transfer rekening bank resmi BCA Finda Fatikasari / Dhiko Herlambang, dan QR Code verifikasi keaslian digital.
  - `tests/test_pdf_invoice_service.py`: 2/2 test lolos (dokumen pas 1 halaman A4, ekstraksi teks pypdf presisi, sinkronisasi path ke database).
  - Seluruh 32 unit test di sistem lolos 100%.

## 3. Next Steps (Single Sub-Task Queue)
1. **[ACTIVE] Sub-task 1.1:** Setup local database schema harness (PostgreSQL / SQLite compatibility layer) untuk memvalidasi struktur tabel.
2. **Sub-task 1.2:** Implementasi script ETL `scripts/etl_extract_and_migrate.py` yang membaca seluruh 101 transaksi historis, memperbaiki 4 anomali (2925 typo, tanggal Cilacap, gap Semarang Dok 34, sheet overlap), dan menghasilkan `data/migrated_omnicat_seed.json`.
3. **Sub-task 1.3:** Eksekusi verifikasi rekonsiliasi matematis 100% (Target: Rp 2.990.251.489 dan 684.540 Liters).
4. **Sub-task 1.4:** Implementasi Backend Core Service: `InvoicingService` & `FinancialClearanceService`.

## 4. Active Decisions & Considerations
- Verifikasi lokal menggunakan Python / SQLite engine untuk pengujian cepat sebelum deployment ke PostgreSQL staging cloud/container.
- Memastikan tipe data mata uang menggunakan `NUMERIC(15,2)` (atau INTEGER cents di SQLite) agar tidak ada pembulatan floating-point.
