# Active Context: OmniCat Enterprise

## 1. Current Focus
- **Active Release:** Phase 2: Release 2 (Field Sales & CRM)
- **Current Milestone:** Task 5 - Telegram Mini App (TMA)
- **Next Active Sub-Task:** **Sub-task 5.3: Delivery Slip (Surat Jalan) Generator (`backend/services/delivery_slip_service.py`)**

## 2. Recent Accomplishments
- **Sub-task 5.2 Selesai & Terverifikasi:**
  - `backend/services/tma_service.py`: Layanan khusus Telegram Mini App untuk pembuatan draft pesanan lapangan, validasi token Sales/Admin, dan penerbitan nota draft instan.
  - **Atomic Sequence Invariant:** Terbukti secara pengujian unit bahwa pembuatan draf pesanan *TIDAK* memajukan counter penomoran invoice (`customer_doc_sequences`), mencegah terjadinya nomor dokumen lompat saat order dibatalkan atau direvisi.
  - **Offline Sync Resiliency (`sync_offline_draft_queue`):** Sinkronisasi batch pesanan yang dibuat saat perangkat sales offline di gudang/klinik pelosok, dengan penanganan kegagalan terisolasi per item tanpa menggugurkan transaksi lainnya.
  - **WhatsApp Deep-Link Invoice Generator:** Format tanda terima WhatsApp resmi berbahasa Indonesia lengkap dengan rincian varian sak/bag, total liter, dan rekening pembayaran resmi (BCA 0902207846 a.n Finda Fatikasari).
  - `frontend/index.html`: Diperbarui dengan offline queue di LocalStorage, modal konfirmasi sukses draft dengan tombol 1-click share ke WhatsApp, dan indikator status sinkronisasi.
  - `tests/test_tma_service.py`: 5/5 unit test lolos.
  - **Total Pengujian Sistem:** Seluruh 57 unit test di sistem (`tests/test_*.py`) lolos 100% tanpa error dalam 0.62 detik.

## 3. Next Steps (Single Sub-Task Queue)
1. **[ACTIVE] Sub-task 5.3:** Delivery Slip (Surat Jalan) Generator (`backend/services/delivery_slip_service.py`):
   - Pembuatan PDF Surat Jalan resmi (A4 Landscape / Half-A4) untuk pengiriman logistik ekspedisi truk.
   - Kolom khusus penerima toko, ekspedisi/sopir, plat nomor truk, tanda tangan serah-terima gudang, dan rincian fisik sak/kemasan tanpa menampilkan harga rahasia.
   - Menyelesaikan Task 5 dan Phase 2: Release 2 (Field Sales & CRM) secara 100%.
2. **Phase 3: Release 3 (Ecosystem & Optimization)**:
   - Task 6.1: Estafet Shared Freight Optimizer.
   - Task 6.2: Vendor AP (Accounts Payable).
   - Task 6.3: Multi-brand Digital Catalog PDF Generator.
   - Task 6.4: Standard JSON Export/Import for External AI (Gemini/Claude).

## 4. Active Decisions & Considerations
- Database `data/omnicat_local.db` tetap kanonik dan bersih (101 order, Rp 2.990.251.489). Semua test suite menggunakan temporary clone (`test_*.db`) yang dibuat di `setUpClass` dan dihapus di `tearDownClass`.
