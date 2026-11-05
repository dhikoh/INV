# Active Context: OmniCat Enterprise

## 1. Current Focus
- **Active Release:** Release 1 (Core Money & Documents)
- **Current Milestone:** Task 2 - Backend Core Services (Invoicing & Financial Clearance)
- **Current Active Sub-Task:** **Sub-task 2.1: InvoicingService with Atomic Sequence Lock**

## 2. Recent Accomplishments
- **Task 1 Selesai 100% dan Dikomit ke Git (`fef7617`):**
  - DDL PostgreSQL 16 v2.1 di `database/init_schema.sql`.
  - SQLite Parity Schema di `database/sqlite_schema.sql`.
  - Pipeline ETL `scripts/etl_extract_and_migrate.py` sukses mengekstrak 101 transaksi historis senilai Rp 2.990.251.489.
  - Test suite rekonsiliasi matematis `tests/test_reconciliation.py` lolos 7/7 (100% pass dalam 0.004 detik).
  - Clean seed tersimpan di `data/migrated_omnicat_seed.json` dan database lokal `data/omnicat_local.db`.

## 3. Next Steps (Single Sub-Task Queue)
1. **[ACTIVE] Sub-task 1.1:** Setup local database schema harness (PostgreSQL / SQLite compatibility layer) untuk memvalidasi struktur tabel.
2. **Sub-task 1.2:** Implementasi script ETL `scripts/etl_extract_and_migrate.py` yang membaca seluruh 101 transaksi historis, memperbaiki 4 anomali (2925 typo, tanggal Cilacap, gap Semarang Dok 34, sheet overlap), dan menghasilkan `data/migrated_omnicat_seed.json`.
3. **Sub-task 1.3:** Eksekusi verifikasi rekonsiliasi matematis 100% (Target: Rp 2.990.251.489 dan 684.540 Liters).
4. **Sub-task 1.4:** Implementasi Backend Core Service: `InvoicingService` & `FinancialClearanceService`.

## 4. Active Decisions & Considerations
- Verifikasi lokal menggunakan Python / SQLite engine untuk pengujian cepat sebelum deployment ke PostgreSQL staging cloud/container.
- Memastikan tipe data mata uang menggunakan `NUMERIC(15,2)` (atau INTEGER cents di SQLite) agar tidak ada pembulatan floating-point.
