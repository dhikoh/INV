# Active Context: OmniCat Enterprise

## 1. Current Focus
- **Active Release:** Release 1 (Core Money & Documents)
- **Current Milestone:** Task 2 - Backend Core Services (Invoicing & Financial Clearance)
- **Current Active Sub-Task:** **Sub-task 2.3: PromotionService (Discount Engine & Subsidy Rules)**

## 2. Recent Accomplishments
- **Sub-task 2.2 Selesai & Terverifikasi:**
  - `backend/services/financial_clearance_service.py`: Menghitung HPP (COGS), ongkir riil vendor truk vs ongkir ditagih, kebocoran subsidi, Laba Kontribusi Kotor (Gross Contribution Margin), dan ambang batas margin sehat (15%).
  - Memproteksi data sensitif dengan RBAC ketat (Sales dilarang mengakses HPP dan profit margin perusahaan).
  - Mengimplementasikan laporan agregasi finansial regional dan KPI laba kontribusi perusahaan.
  - `tests/test_financial_clearance_service.py`: 5/5 test lolos. Seluruh 18/18 test dalam 3 test suite sistem lolos 100%.

## 3. Next Steps (Single Sub-Task Queue)
1. **[ACTIVE] Sub-task 1.1:** Setup local database schema harness (PostgreSQL / SQLite compatibility layer) untuk memvalidasi struktur tabel.
2. **Sub-task 1.2:** Implementasi script ETL `scripts/etl_extract_and_migrate.py` yang membaca seluruh 101 transaksi historis, memperbaiki 4 anomali (2925 typo, tanggal Cilacap, gap Semarang Dok 34, sheet overlap), dan menghasilkan `data/migrated_omnicat_seed.json`.
3. **Sub-task 1.3:** Eksekusi verifikasi rekonsiliasi matematis 100% (Target: Rp 2.990.251.489 dan 684.540 Liters).
4. **Sub-task 1.4:** Implementasi Backend Core Service: `InvoicingService` & `FinancialClearanceService`.

## 4. Active Decisions & Considerations
- Verifikasi lokal menggunakan Python / SQLite engine untuk pengujian cepat sebelum deployment ke PostgreSQL staging cloud/container.
- Memastikan tipe data mata uang menggunakan `NUMERIC(15,2)` (atau INTEGER cents di SQLite) agar tidak ada pembulatan floating-point.
