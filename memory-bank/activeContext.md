# Active Context: OmniCat Enterprise

## 1. Current Focus
- **Active Release:** Release 1 (Core Money & Documents)
- **Current Milestone:** Task 1 - Database Architecture & Historical ETL Extraction
- **Current Active Sub-Task:** **Sub-task 1.3: Mathematical Reconciliation Test & Report**

## 2. Recent Accomplishments
- DDL PostgreSQL 16 v2.1 selesai dirancang di `database/init_schema.sql`.
- SQLite Development Harness `database/sqlite_schema.sql` dan automated test `tests/test_schema_init.py` 100% pass.
- Script ETL `scripts/etl_extract_and_migrate.py` sukses mengekstrak 101 transaksi invoice historis dengan omzet kumulatif Rp 2.990.251.489 (100% match).
- Ekspor dataset bersih ke `data/migrated_omnicat_seed.json` dan migrasi ke SQLite database `data/omnicat_local.db` sukses tanpa error constraint.
- Sub-task 1.2 selesai diverifikasi.

## 3. Next Steps (Single Sub-Task Queue)
1. **[ACTIVE] Sub-task 1.1:** Setup local database schema harness (PostgreSQL / SQLite compatibility layer) untuk memvalidasi struktur tabel.
2. **Sub-task 1.2:** Implementasi script ETL `scripts/etl_extract_and_migrate.py` yang membaca seluruh 101 transaksi historis, memperbaiki 4 anomali (2925 typo, tanggal Cilacap, gap Semarang Dok 34, sheet overlap), dan menghasilkan `data/migrated_omnicat_seed.json`.
3. **Sub-task 1.3:** Eksekusi verifikasi rekonsiliasi matematis 100% (Target: Rp 2.990.251.489 dan 684.540 Liters).
4. **Sub-task 1.4:** Implementasi Backend Core Service: `InvoicingService` & `FinancialClearanceService`.

## 4. Active Decisions & Considerations
- Verifikasi lokal menggunakan Python / SQLite engine untuk pengujian cepat sebelum deployment ke PostgreSQL staging cloud/container.
- Memastikan tipe data mata uang menggunakan `NUMERIC(15,2)` (atau INTEGER cents di SQLite) agar tidak ada pembulatan floating-point.
