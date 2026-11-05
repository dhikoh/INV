# Active Context: OmniCat Enterprise

## 1. Current Focus
- **Active Release:** Phase 2: Release 2 (Field Sales & CRM)
- **Current Milestone:** Task 4 - Sales CRM & Repeat Order Engine
- **Next Active Sub-Task:** **Sub-task 4.1: Customer Health & Median Reorder Interval Engine (`backend/services/crm_service.py`)**

## 2. Recent Accomplishments
- **Phase 1: Release 1 (Core Money & Documents) Selesai 100%:**
  - **Task 1 (Database & ETL Reconciliation):** 101 transaksi historis terekonsiliasi 100% tepat Rp 2.990.251.489 dan volume 684.540 Liter.
  - **Task 2 (Core Services):** `InvoicingService`, `FinancialClearanceService`, `PromotionService`, dan `PaymentService` dengan 5-bucket Aging AR.
  - **Task 3 (Document & Security):**
    - Sub-task 3.1: Generator PDF Invoice resmi A4 dengan QR code verifikasi dan nomor rekening BCA Finda Fatikasari.
    - Sub-task 3.2: Middleware RBAC 4-role (`SUPER_ADMIN`, `FINANCE`, `SALES`, `MANAGEMENT_VIEWER`), multi-brand isolation (`user_brand_access`), otentikasi Telegram WebApp cryptographic HMAC-SHA256, dan JWT session claims.
  - **Total Pengujian:** Seluruh 37 unit test di sistem (`tests/test_*.py`) lolos 100% tanpa error dalam 0.52 detik.

## 3. Next Steps (Single Sub-Task Queue)
1. **[ACTIVE] Sub-task 4.1:** Customer Health & Median Reorder Interval Engine (`backend/services/crm_service.py`):
   - Hitung interval median pemesanan ulang (repeat-order cycle) per customer (contoh: Tuban 30 hari, Cilacap 32 hari, Semarang 35 hari).
   - Klasifikasi status kesehatan customer: `ACTIVE`, `DUE_FOR_REORDER` (H-3 sebelum siklus median habis), `CHURN_ALERT` (>1.5x median tanpa repeat order), `INACTIVE` (>3x median).
   - Notifikasi otomatis peluang repeat order untuk field sales.
2. **Sub-task 4.2:** Sales Target Tracking & Activity Logger.
3. **Sub-task 5.1:** TMA Mobile Frontend (React/Tailwind) dengan mock Telegram WebApp SDK.
4. **Sub-task 5.2:** TMA Draft Order Flow dengan offline sync & WhatsApp deep link invoice sharing.
5. **Sub-task 5.3:** Generator Surat Jalan (Delivery Slip) PDF.

## 4. Active Decisions & Considerations
- Database `data/omnicat_local.db` tetap kanonik dan bersih (101 order, Rp 2.990.251.489). Semua test suite menggunakan temporary clone (`test_*.db`) yang dibuat di `setUpClass` dan dihapus di `tearDownClass`.
- Sales CRM membaca langsung riwayat order kanonik untuk menghitung interval pemesanan tanpa mengubah data transaksi historis.
