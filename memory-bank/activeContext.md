# Active Context: OmniCat Enterprise

## 1. Current Focus
- **Active Release:** Release 1 (Core Money & Documents)
- **Current Milestone:** Task 3 - Document Generation & Security
- **Current Active Sub-Task:** **Sub-task 3.1: Professional Invoice PDF Generator with QR Verification**

## 2. Recent Accomplishments
- **Task 2 Selesai 100% dan Seluruh Test Lolos (30/30 Pass):**
  - `InvoicingService` (Sub-task 2.1): Atomic sequence lock pada `customer_doc_sequences`, concurency-safe numbering, pembuatan draft & penerbitan invoice resmi.
  - `FinancialClearanceService` (Sub-task 2.2): Gross Contribution Margin calculation, real-time COGS, freight subsidy isolation, dan ambang batas margin sehat 15% dengan override alert.
  - `PromotionService` (Sub-task 2.3): Diskon persentase, voucher tetap, gratis ongkir muatan penuh ($\ge 8.000\text{ L}$), dan subsidi logistik.
  - `PaymentService` (Sub-task 2.4): Down Payment (DP), pelunasan bertahap, overpayment guard, transisi status invoice `UNPAID` $\rightarrow$ `PARTIAL_DP` $\rightarrow$ `PAID_LUNAS`, dan pengelompokan Aging AR 5-bucket.
  - Test suite komprehensif 30/30 test passed.

## 3. Next Steps (Single Sub-Task Queue)
1. **[ACTIVE] Sub-task 1.1:** Setup local database schema harness (PostgreSQL / SQLite compatibility layer) untuk memvalidasi struktur tabel.
2. **Sub-task 1.2:** Implementasi script ETL `scripts/etl_extract_and_migrate.py` yang membaca seluruh 101 transaksi historis, memperbaiki 4 anomali (2925 typo, tanggal Cilacap, gap Semarang Dok 34, sheet overlap), dan menghasilkan `data/migrated_omnicat_seed.json`.
3. **Sub-task 1.3:** Eksekusi verifikasi rekonsiliasi matematis 100% (Target: Rp 2.990.251.489 dan 684.540 Liters).
4. **Sub-task 1.4:** Implementasi Backend Core Service: `InvoicingService` & `FinancialClearanceService`.

## 4. Active Decisions & Considerations
- Verifikasi lokal menggunakan Python / SQLite engine untuk pengujian cepat sebelum deployment ke PostgreSQL staging cloud/container.
- Memastikan tipe data mata uang menggunakan `NUMERIC(15,2)` (atau INTEGER cents di SQLite) agar tidak ada pembulatan floating-point.
