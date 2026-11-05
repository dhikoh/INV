# Active Context: OmniCat Enterprise

## 1. Current Focus
- **Active Release:** Phase 3: Release 3 (Ecosystem & Optimization)
- **Current Milestone:** Task 6 - Logistics & Advanced Analytics
- **Next Active Sub-Task:** **Sub-task 6.3: Multi-brand Digital Catalog PDF Generator (`backend/services/catalog_pdf_service.py`)**

## 2. Recent Accomplishments
- **Sub-task 6.2 Selesai & Terverifikasi:**
  - `backend/services/vendor_ap_service.py`: Modul manajemen Hutang Usaha / Vendor Accounts Payable (AP) untuk ekspedisi truk dan supplier kemasan/karung.
  - **Shared Freight Proportional Allocation:** Alokasi otomatis tagihan satu trip truk Estafet gabungan ke masing-masing invoice pelanggan berdasarkan rasio volume liter ($V_i / \sum V$).
  - **Sinkronisasi Otomatis `order_financials`:** Memperbarui `actual_freight_cost`, menghitung ulang `net_transport_subsidy_borne`, serta mengunci `contribution_margin_amount` dan margin persen aktual riil secara instan.
  - **Settlement & Anti-Overpayment Guard:** Pelunasan bertahap (`UNPAID` $\rightarrow$ `PARTIAL` $\rightarrow$ `PAID_LUNAS`) dengan penjaga ketat anti-kelebihan bayar.
  - `tests/test_vendor_ap_service.py`: 5/5 test lolos.
  - **Total Pengujian Sistem:** Seluruh **70 unit test** di sistem (`tests/test_*.py`) lolos 100% tanpa error dalam 1.10 detik.

## 3. Next Steps (Single Sub-Task Queue)
1. **[ACTIVE] Sub-task 6.3:** Multi-brand Digital Catalog PDF Generator (`backend/services/catalog_pdf_service.py`):
   - Pembuatan PDF Katalog Produk Digital profesional dengan ReportLab.
   - 2 Format:
     1. **A4 Landscape (Display Publik Tanpa Harga):** Untuk dipajang di klinik hewan/pet shop atau media sosial, menonjolkan fitur produk, visual kemasan, aroma, dan daya gumpal (*clumping*).
     2. **A4 Portrait (Price Sheet Resmi):** Dokumen khusus B2B grosir/distributor yang memuat daftar harga bertingkat (*tiered pricing*) dan ketentuan minimal order.
2. **Sub-task 6.4:** Standard JSON Export/Import for External AI (Gemini/Claude) with Redacted PDP Mode.

## 4. Active Decisions & Considerations
- Database `data/omnicat_local.db` tetap kanonik dan bersih (101 order, Rp 2.990.251.489). Semua test suite menggunakan temporary clone (`test_*.db`) yang dibuat di `setUpClass` dan dihapus di `tearDownClass`.
