# Active Context: OmniCat Enterprise

## 1. Current Focus
- **Active Release:** Phase 3: Release 3 (Ecosystem & Optimization)
- **Current Milestone:** Task 6 - Logistics & Advanced Analytics
- **Next Active Sub-Task:** **Sub-task 6.1: Estafet Shared Freight Optimizer (East Java Cluster: Bojonegoro, Tuban, Lamongan)**

## 2. Recent Accomplishments
- **Phase 2 (Release 2: Field Sales & CRM) Selesai 100%:**
  - **Task 4 (Sales CRM & Repeat Order Engine):**
    - Sub-task 4.1: Engine siklus median pemesanan ulang (*cadence*), klasifikasi 5 siklus kesehatan pelanggan (`ACTIVE`, `DUE_FOR_REORDER`, `OVERDUE`, `CHURN_ALERT`, `INACTIVE`), antrian prioritas CRM, dan logging touchpoint aktivitas.
    - Sub-task 4.2: Manajemen target bulanan sales (volume liter dan omset) dengan upsert idempotency, perhitungan *attainment rate %*, dan klasifikasi status kinerja (`EXCEEDED`, `ON_TRACK`, `AT_RISK`, `LAGGING`).
  - **Task 5 (Telegram Mini App — TMA):**
    - Sub-task 5.1: TMA Mobile Frontend (`frontend/index.html`) dengan SDK harness, tab Peluang Reorder, Tab Target, dan Input Order.
    - Sub-task 5.2: Alur submit draft pesanan aman (menjaga counter atomic sequence tidak lompat), offline queue sync di LocalStorage, dan receipt WhatsApp instan.
    - Sub-task 5.3: Generator Surat Jalan resmi ([`backend/services/delivery_slip_service.py`](file:///d:/Data%20BentoCat/BENTOCAT-20261104T120040Z-1-001/BENTOCAT/backend/services/delivery_slip_service.py)):
      - Menghasilkan PDF A4 pas 1 halaman resmi standar pengiriman logistik truk ekspedisi antarkota.
      - Menampilkan manifest fisik lengkap: sak/bag kemasan, nomor polisi kendaraan truk, nama sopir, instruksi logistik, dan 3 kolom tanda tangan serah terima (*Pengirim Gudang, Sopir/Ekspedisi, Penerima Toko*).
      - **Prinsip Kerahasiaan Audit Terpenuhi:** Menutup total seluruh data finansial rahasia (tidak ada harga satuan, subtotal rupiah, HPP, diskon, maupun margin laba).
      - Dilengkapi QR Code verifikasi digital keaslian surat jalan.
  - **Total Pengujian Sistem:** Seluruh **61 unit test** di sistem (`tests/test_*.py`) lolos 100% tanpa error dalam 0.85 detik.

## 3. Next Steps (Single Sub-Task Queue)
1. **[ACTIVE] Sub-task 6.1:** Estafet Shared Freight Optimizer (`backend/services/freight_optimizer_service.py`):
   - Optimasi penggabungan muatan truk kluster Jawa Timur (jendela 7 hari untuk Bojonegoro, Tuban, dan Lamongan).
   - Deteksi pesanan yang dapat digabung ke dalam truk engkel (8.000 L / 8 Ton) atau truk Fuso (15.000 L / 15 Ton).
   - Perhitungan penghematan subsidi ongkir riil vs pengiriman terpisah.
2. **Sub-task 6.2:** Vendor AP (Accounts Payable) & Shared Freight Allocation.
3. **Sub-task 6.3:** Multi-brand Digital Catalog PDF Generator (A4 Landscape Display & Price Sheet).
4. **Sub-task 6.4:** Standard JSON Export/Import for External AI (Gemini/Claude) with Redacted PDP Mode.

## 4. Active Decisions & Considerations
- Database `data/omnicat_local.db` tetap kanonik dan bersih (101 order, Rp 2.990.251.489). Semua test suite menggunakan temporary clone (`test_*.db`) yang dibuat di `setUpClass` dan dihapus di `tearDownClass`.
