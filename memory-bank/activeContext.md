# Active Context: OmniCat Enterprise

## 1. Current Focus
- **Active Release:** Phase 2: Release 2 (Field Sales & CRM)
- **Current Milestone:** Task 5 - Telegram Mini App (TMA)
- **Next Active Sub-Task:** **Sub-task 5.2: TMA Draft Order Flow with offline sync & WhatsApp deep link invoice sharing**

## 2. Recent Accomplishments
- **Sub-task 5.1 Selesai & Terverifikasi:**
  - `frontend/index.html`: Antarmuka mobile modern khusus Telegram Mini App (TMA) untuk field sales, teroptimasi untuk layar smartphone (390px - 430px) dengan safe area padding.
  - Integrasi Telegram WebApp SDK resmi (`window.Telegram.WebApp.ready()`, `expand()`, haptic feedback, theme params).
  - Dev Harness fallback otomatis jika dibuka di browser biasa di luar Telegram client.
  - 3 Tab Inti:
    1. **Peluang Reorder (CRM Radar):** Filter status kesehatan pelanggan (`DUE_FOR_REORDER`, `CHURN_ALERT`, `OVERDUE`, `ACTIVE`), rincian siklus median dan volume, 1-click pesan WhatsApp restock terformat sopan otomatis, serta pencatatan interaksi sales (`CALL`, `VISIT`, `WHATSAPP`).
    2. **Target & Kinerja:** Visual meter target volume & omset bulanan dengan badge performa (`EXCEEDED`, `ON_TRACK`, `AT_RISK`, `LAGGING`).
    3. **Input Draft Pesanan:** Pemilihan pelanggan, counter stepper varian (25L @ Rp 133.500, 10L @ Rp 58.000, 5.5L @ Rp 33.000), estimasi kapasitas muatan truk (indikator otomatis Full Truckload Promo $\ge 8.000\text{ L}$ = Gratis Ongkir), dan submit draft pesanan tanpa nomor dokumen resmi.
  - `tests/test_tma_frontend.py`: 7/7 unit test lolos.
  - **Total Pengujian Sistem:** Seluruh 52 unit test di sistem (`tests/test_*.py`) lolos 100% tanpa error dalam 0.58 detik.

## 3. Next Steps (Single Sub-Task Queue)
1. **[ACTIVE] Sub-task 5.2:** TMA Draft Order Flow with offline sync & WhatsApp deep link invoice sharing:
   - Backend order creation endpoint / service method yang mengikat input draft TMA ke `InvoicingService.create_draft_order`.
   - Penyimpanan draft lokal offline di IndexedDB / LocalStorage jika jaringan seluler di lapangan drop.
   - Fitur share invoice ringkas ke WhatsApp pelanggan.
2. **Sub-task 5.3:** Generator Surat Jalan (Delivery Slip) PDF.

## 4. Active Decisions & Considerations
- Database `data/omnicat_local.db` tetap kanonik dan bersih (101 order, Rp 2.990.251.489). Semua test suite menggunakan temporary clone (`test_*.db`) yang dibuat di `setUpClass` dan dihapus di `tearDownClass`.
