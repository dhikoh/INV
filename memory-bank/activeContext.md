# Active Context: OmniCat Enterprise

## 1. Current Focus
- **Active Release:** Phase 2: Release 2 (Field Sales & CRM)
- **Current Milestone:** Task 5 - Telegram Mini App (TMA)
- **Next Active Sub-Task:** **Sub-task 5.1: TMA Mobile Frontend (React/Tailwind with Telegram WebApp SDK harness)**

## 2. Recent Accomplishments
- **Task 4 (Sales CRM & Repeat Order Engine) Selesai 100%:**
  - **Sub-task 4.1:** Engine siklus pemesanan ulang (*median repeat-order interval*) per customer, klasifikasi 5 siklus kesehatan pelanggan (`ACTIVE`, `DUE_FOR_REORDER`, `OVERDUE`, `CHURN_ALERT`, `INACTIVE`), dan antrian prioritas CRM.
  - **Sub-task 4.2:** Sales Target Tracking & Activity Logger (`backend/services/crm_service.py`):
    - Penentuan target bulanan sales (volume liter dan target omset rupiah per brand) dengan dukungan upsert idempotency.
    - Kalkulasi tingkat pencapaian aktual (*attainment rate %* volume dan omset) berbasis pesanan riil pada bulan bersangkutan.
    - Klasifikasi status performa: `EXCEEDED` ($\ge 100\%$), `ON_TRACK` ($\ge 75\%$), `AT_RISK` ($\ge 40\%$), dan `LAGGING` ($< 40\%$).
    - Rekap laporan performa seluruh sales rep per bulan.
  - **Total Pengujian:** Seluruh 45 unit test di sistem (`tests/test_*.py`) lolos 100% tanpa error dalam 0.58 detik.

## 3. Next Steps (Single Sub-Task Queue)
1. **[ACTIVE] Sub-task 5.1:** TMA Mobile Frontend (React / Tailwind):
   - Setup antarmuka mobile Telegram Mini App untuk field sales.
   - Mock Telegram WebApp SDK context (`window.Telegram.WebApp.initDataUnsafe`).
   - Tampilan antrian CRM (prioritas follow-up reorder) dan dashboard target bulanan sales.
2. **Sub-task 5.2:** TMA Draft Order Flow dengan offline sync & WhatsApp deep link invoice sharing.
3. **Sub-task 5.3:** Generator Surat Jalan (Delivery Slip) PDF.

## 4. Active Decisions & Considerations
- Database `data/omnicat_local.db` tetap kanonik dan bersih (101 order, Rp 2.990.251.489). Semua test suite menggunakan temporary clone (`test_*.db`) yang dibuat di `setUpClass` dan dihapus di `tearDownClass`.
- Sales CRM membaca langsung riwayat order kanonik untuk menghitung interval pemesanan tanpa mengubah data transaksi historis.
