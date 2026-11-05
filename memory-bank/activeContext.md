# Active Context: OmniCat Enterprise

## 1. Current Focus
- **Active Release:** Phase 2: Release 2 (Field Sales & CRM)
- **Current Milestone:** Task 4 - Sales CRM & Repeat Order Engine
- **Next Active Sub-Task:** **Sub-task 4.2: Sales Target Tracking & Activity Logger**

## 2. Recent Accomplishments
- **Sub-task 4.1 Selesai & Terverifikasi:**
  - `backend/services/crm_service.py`: Engine siklus pemesanan ulang (*median repeat-order interval*) per customer berbasis histori transaksi nyata (Tuban, Semarang, Cilacap, Bojonegoro, Lamongan, Blitar, Timika).
  - Klasifikasi 5 status kesehatan customer:
    - `ACTIVE`: Berada dalam siklus normal ($\le M - 3$ hari).
    - `DUE_FOR_REORDER`: Waktu reorder tepat / estimasi stok menipis ($M - 3 < \text{days} \le M$).
    - `OVERDUE`: Telat reorder ($M < \text{days} \le 1.5M$).
    - `CHURN_ALERT`: Peringatan bahaya churn / defeksi kompetitor ($1.5M < \text{days} \le 3.0M$).
    - `INACTIVE`: Dorman / pasif ($> 3.0M$).
    - `NEW_CUSTOMER`: Akun baru ($< 2$ pesanan).
  - Urutan prioritas antrian CRM otomatis: `DUE_FOR_REORDER` $\rightarrow$ `CHURN_ALERT` $\rightarrow$ `OVERDUE` $\rightarrow$ `ACTIVE`.
  - Logging touchpoint aktivitas sales lapangan (`CALL`, `VISIT`, `WHATSAPP`, `SAMPLE_SENT`, `DEMO`) dengan follow-up date.
  - `tests/test_crm_service.py`: 5/5 test lolos dalam 0.054 detik.
  - Total pengujian sistem bertambah menjadi **42/42 unit test lolos 100%**.

## 3. Next Steps (Single Sub-Task Queue)
1. **[ACTIVE] Sub-task 4.2:** Sales Target Tracking & Activity Logger (`backend/services/crm_service.py`):
   - Manajemen target bulanan sales (target volume liter dan target omset rupiah per brand).
   - Perhitungan pencapaian riil (*actual vs target attainment rate %*).
   - Ringkasan performa bulanan sales rep.
2. **Sub-task 5.1:** TMA Mobile Frontend (React/Tailwind) dengan mock Telegram WebApp SDK.
3. **Sub-task 5.2:** TMA Draft Order Flow dengan offline sync & WhatsApp deep link invoice sharing.
4. **Sub-task 5.3:** Generator Surat Jalan (Delivery Slip) PDF.

## 4. Active Decisions & Considerations
- Database `data/omnicat_local.db` tetap kanonik dan bersih (101 order, Rp 2.990.251.489). Semua test suite menggunakan temporary clone (`test_*.db`) yang dibuat di `setUpClass` dan dihapus di `tearDownClass`.
- Sales CRM membaca langsung riwayat order kanonik untuk menghitung interval pemesanan tanpa mengubah data transaksi historis.
