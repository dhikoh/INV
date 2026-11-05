# Active Context: OmniCat Enterprise

## 1. Current Focus
- **Active Release:** Phase 3: Release 3 (Ecosystem & Optimization)
- **Current Milestone:** Task 6 - Logistics & Advanced Analytics
- **Next Active Sub-Task:** **Sub-task 6.2: Vendor AP (Accounts Payable) & Shared Freight Allocation (`backend/services/vendor_ap_service.py`)**

## 2. Recent Accomplishments
- **Sub-task 6.1 Selesai & Terverifikasi:**
  - `backend/services/freight_optimizer_service.py`: Engine optimasi muatan gabungan truk estafet (*Estafet Shared Freight Optimizer*) untuk kluster geografis (khususnya Kluster Jawa Timur: Bojonegoro, Tuban, Lamongan).
  - Mengatasi temuan kebocoran subsidi transport historis (Rp 122.550.000) dengan jendela konsolidasi 7 hari.
  - Seleksi otomatis armada truk berdasarkan volume:
    - $\le 8.000\text{ L}$: Truk Engkel Box (8 Ton / 8.000 L).
    - $> 8.000\text{ L}$ hingga $15.000\text{ L}$: Truk Fuso Long (15 Ton / 15.000 L).
  - Alokasi biaya ongkir estafet proporsional berbasis rasio volume liter per toko.
  - Simulator interaktif *what-if* (`simulate_consolidation`) untuk rekomendasi langsung saat sales memasukkan pesanan baru di kluster yang sama.
  - `tests/test_freight_optimizer_service.py`: 4/4 test lolos.
  - **Total Pengujian Sistem:** Seluruh **65 unit test** di sistem (`tests/test_*.py`) lolos 100% tanpa error dalam 0.87 detik.

## 3. Next Steps (Single Sub-Task Queue)
1. **[ACTIVE] Sub-task 6.2:** Vendor AP (Accounts Payable) & Shared Freight Allocation (`backend/services/vendor_ap_service.py`):
   - Pencatatan tagihan invoice vendor pihak ketiga (vendor ekspedisi truk, vendor karung/kemasan).
   - Alokasi proporsional tagihan satu trip truk ke masing-masing invoice toko untuk memperbarui margin kontribusi riil di `order_financials`.
   - Pelunasan tagihan vendor dengan status `UNPAID` / `PAID`.
2. **Sub-task 6.3:** Multi-brand Digital Catalog PDF Generator (A4 Landscape Display & Price Sheet).
3. **Sub-task 6.4:** Standard JSON Export/Import for External AI (Gemini/Claude) with Redacted PDP Mode.

## 4. Active Decisions & Considerations
- Database `data/omnicat_local.db` tetap kanonik dan bersih (101 order, Rp 2.990.251.489). Semua test suite menggunakan temporary clone (`test_*.db`) yang dibuat di `setUpClass` dan dihapus di `tearDownClass`.
