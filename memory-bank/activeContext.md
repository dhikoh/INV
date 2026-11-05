# Active Context: OmniCat Enterprise

## 1. Current Focus
- **Active Release:** Phase 3: Release 3 (Ecosystem & Optimization)
- **Current Milestone:** Task 6 - Logistics & Advanced Analytics
- **Next Active Sub-Task:** **Sub-task 6.4: Standard JSON Export/Import for External AI (Gemini/Claude) with Redacted PDP Mode (`backend/services/ai_export_service.py`)**

## 2. Recent Accomplishments
- **Sub-task 6.3 Selesai & Terverifikasi:**
  - `backend/services/catalog_pdf_service.py`: Generator PDF Katalog Digital Multi-Brand dengan 2 format dokumen resmi menggunakan ReportLab:
    1. **Format A4 Landscape (Display Publik Tanpa Harga):** Fokus pada branding visual, 4 pilar formula unggulan (gumpal 3 detik, 99.5% bebas debu, odour lock, daya serap 350%), katalog varian aroma (Lavender, Lemon, Apple, Coffee), spesifikasi kemasan sak/bag, dan panduan 3 langkah praktis. **Strict Zero-Pricing Invariant** (tanpa angka rupiah/biaya/margin) terverifikasi dengan regex assertion pada teks PDF.
    2. **Format A4 Portrait (Official B2B Price Sheet):** Lembar penawaran harga resmi multi-tier (HET Retail, Grosir Toko Tier 1, Distributor FTL Tier 2), tabel MOQ per SKU, skema insentif volume, program logistik Estafet Jawa Timur, rekening bank resmi terverifikasi (BCA 0902207846 a/n Finda Fatikasari), dan QR Code verifikasi.
  - Multi-brand profile support terverifikasi (`BENTOCAT` dan `ZEOLITE_MOJO`).
  - `tests/test_catalog_pdf_service.py`: 5/5 test lolos.
  - **Total Pengujian Sistem:** Seluruh **75 unit test** di sistem (`tests/test_*.py`) lolos 100% tanpa error dalam 1.20 detik.

## 3. Next Steps (Single Sub-Task Queue)
1. **[ACTIVE] Sub-task 6.4:** Standard JSON Export/Import for External AI (Gemini/Claude) with Redacted PDP Mode (`backend/services/ai_export_service.py`):
   - Export endpoint analitik lengkap berformat JSON Schema v7.
   - Mode Redacted / Pseudonim (UU Perlindungan Data Pribadi / UU PDP) menyamarkan nama klinik, telepon `0812****7890`, dan alamat jalan.
   - Import profil brand dengan 2FA / Super Admin confirmation guard dan time-lock untuk perubahan rekening bank.
   - Test suite `tests/test_ai_export_service.py`.

## 4. Active Decisions & Considerations
- Database `data/omnicat_local.db` tetap kanonik dan bersih (101 order, Rp 2.990.251.489). Semua test suite menggunakan temporary clone (`test_*.db`) yang dibuat di `setUpClass` dan dihapus di `tearDownClass`.
