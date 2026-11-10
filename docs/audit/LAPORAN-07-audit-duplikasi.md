# LAPORAN-07: Fase 3 — Audit Duplikasi (Single Source of Truth)

Dokumen audit resmi independen untuk aplikasi OmniCat (repo `dhikoh-inv`) hasil evaluasi prinsip *Single Source of Truth* (SSOT), identifikasi endpoint/handler ganda, logika bisnis di luar domain, data turunan tanpa rekalkulasi, dan pencegahan duplikasi data.

---

## 1. Identitas Audit

- **Tanggal Pelaksanaan**: 2026-11-10
- **Commit Git Terakhir**: `7c8778d1a19402ab571407b202bfd60aa27beb52`
- **Fokus Pemeriksaan**:
  - Pasangan endpoint & handler ganda
  - Logika uang & perhitungan di luar `src/lib/domain/`
  - Validasi & parser yang ditulis dua kali
  - Formatter rupiah & tanggal yang diulang
  - Integritas data turunan (`paidTotal`, `creditTotal`, `stockQty`, `reservedQty`)
  - Pencegahan race condition & idempotensi mutasi

---

## 2. Analisis Pasangan Endpoint & Jalur Ganda

### 1. `POST /api/v1/commission/entries/:id/pay` vs `POST /api/v1/commissions/:id/pay`
- **Kondisi**: Handler kedua endpoint 100% identik. Keduanya memvalidasi `body: CommissionPaySchema`, memanggil `requireBusiness(ctx)`, dan mengeksekusi `payCommissionEntry(tx, ctx, entryId, body.note)`.
- **Penetapan Kanonik**: `POST /api/v1/commission/entries/:id/pay` ditetapkan sebagai **rute kanonik** karena selaras dengan konvensi RESTful koleksi `GET /api/v1/commission/entries`.
- **Rekomendasi**: Pertahankan `commission/entries/:id/pay` sebagai kanon. Deprecate `/commissions/:id/pay` dengan memberikan header `Deprecation: true` atau jadikan alias pemanggil handler kanonik.

### 2. `POST /api/v1/payments` vs `POST /api/v1/orders/:id/payments`
- **Kondisi**: Kedua endpoint menerima pencatatan pembayaran pelanggan dan bukti transfer (mendukung `multipart/form-data` dan JSON). Keduanya menuliskan logika penguraian multipart (`formData.get('amount')`, `formData.get('proof')`, `saveFile`) secara terpisah sebanyak ~70 baris kode duplikat.
- **Perbedaan Fungsional**: `POST /api/v1/orders/:id/payments` mengambil `orderId` dari parameter URL `params.id`, sedangkan `POST /api/v1/payments` mengambil `orderId` dari body formData/JSON. Keduanya memanggil fungsi domain yang sama (`createPayment`).
- **Rekomendasi**: Satukan logika parser form data ke fungsi pembantu `parsePaymentFormData(req)` di `src/lib/services/payment.ts`.

### 3. `GET /api/v1/business` vs `GET /api/v1/businesses/:id`
- **Kondisi**: Bukan duplikasi liar. `GET /api/v1/business` digunakan oleh sesi navbar untuk mengambil ringkasan profil usaha aktif (`id`, `code`, `name`, `logoPath`). `GET /api/v1/businesses/:id` adalah endpoint manajemen konfigurasi lengkap (NPWP, tema, toggle PPN, DP) khusus Super Admin.

### 4. `GET /api/v1/bank-accounts/:id` vs `GET /api/v1/businesses/:id/bank-accounts`
- **Kondisi**: Bukan duplikasi liar. Sub-resource `/businesses/:id/bank-accounts` mengembalikan daftar rekening bank usaha, sedangkan `/bank-accounts/:id` mengelola detail, pembaruan, dan soft-delete satu rekening. Namun, `/bank-accounts/:id` memiliki cacat pemanggilan Prisma tanpa `businessId` (`AUD-TENANT-001`).

---

## 3. Evaluasi Logika Bisnis & Formatters Terdistribusi

1. **Rumus Uang di Luar Domain**:
   - Seluruh perhitungan nominal uang inti (subtotal, diskon baris, diskon pesanan, dasar pengenaan pajak, PPN 11%, uang muka DP, sisa tagihan, HPP, laba, komisi) terpusat 100% pada fungsi murni di `src/lib/domain/` (`money.ts`, `order.ts`, `profit.ts`, `commission.ts`, `pricing.ts`, `receivable.ts`, `credit.ts`).
   - Tidak ditemukan manipulasi floating point `Math.round` sembarangan pada nominal uang di route handlers (seluruhnya menggunakan integer Rupiah dan basis points `applyBps`).
2. **Duplikasi Formatter Tanggal & Angka di UI** (`AUD-DUP-003` - S4 Rendah):
   - Pemanggilan `.toLocaleDateString('id-ID', ...)` ditulis secara mandiri di 38 lokasi file UI tanpa memanfaatkan helper bersama.
   - 13 file UI menginisialisasi `new Intl.NumberFormat('id-ID')` mandiri alih-alih mengimpor `formatRupiah` dari `src/lib/domain/money` atau `src/lib/format/parse`.
3. **Penerbitan Nomor Dokumen**:
   - Seluruh nomor dokumen resmi (`INV`, `SJ`, `PO`, `CN`) dialokasikan melalui modul atomik `src/lib/domain/numbering.ts` dan tabel `DocumentCounter` menggunakan PostgreSQL UPSERT atomik.
   - Tidak ada generasi nomor acak atau berbasis timestamp semata di luar konvensi sequential per customer/usaha.

---

## 4. Integritas Data Turunan & Single Source of Truth (SSOT)

| Entitas Data Turunan | Sumber Kebenaran (SSOT) | Mekanisme Sinkronisasi Saat Ini | Risiko Desinkronisasi |
|---|---|---|---|
| `Order.paidTotal` | Transaksi `Payment` status `VERIFIED` | Fungsi `recalculateOrderPayments` dijalankan saat verifikasi & void bayar | **Rendah (Aman)** |
| `Invoice.paidAmount` | Transaksi `Payment` terhubung invoice | `recalculateOrderPayments` mendistribusikan pembayaran ke invoice | **Rendah (Aman)** |
| `Order.creditTotal` | Dokumen `CreditNote` status `ISSUED` | Ditambah saat nota kredit terbit, dikurangi saat void | **Ada Cacat**: Diabaikan pada `requestFinalOrder` (`AUD-INT-001`) |
| `Customer.creditBalance` | Buku besar `CustomerCreditEntry` | Dihitung dinamis via agregasi `sum(amount)` pada saldo deposit | **Rendah (Aman)** |
| `Product.stockQty` | Mutasi buku besar `StockMovement` | Ditambah/dikurang via `moveStock` secara atomik di transaksi DB | **Sedang**: Belum ada rutin rekonsiliasi berkala (`AUD-DUP-004`) |
| `Product.reservedQty` | Order berstatus aktif sebelum kirim | `reserveOrderStock` dan `releaseOrderStock` | **Rendah (Aman)** |

---

## 5. Rincian Temuan Baru dari Fase 3

### AUD-DUP-003: Duplikasi Format Tanggal Lokal dan Format Angka pada Komponen UI
- **Lokasi**: 38 berkas di `src/app/(app)/`
- **Rujukan**: Dokumen Aturan Main 1.3 (Satu komponen per pola UI)
- **Dampak Bisnis**: Risiko inkonsistensi representasi tanggal lokal (misal perbedaan zona waktu WIB vs browser klien) dan pemborosan pemeliharaan kode.
- **Yang Diharapkan**: Tersedia helper format tanggal terpadu (misal `formatDateWib(date)`) di `src/lib/format/date.ts`.
- **Yang Terjadi**: Setiap halaman menuliskan `new Date(...).toLocaleDateString('id-ID', { ... })` secara repetitif.
- **Saran Perbaikan**: Buat utilitas `formatDateWib` di `src/lib/format/` dan refactor halaman UI.

---

### AUD-DUP-004: Ketiadaan Fungsi Rekonsiliasi Saldo Stok Fisik dari Buku Besar Mutasi
- **Lokasi**: `src/lib/services/stock.ts`
- **Rujukan**: Dokumen Aturan Main 3.3 (Data turunan ganda & jalur rekalkulasi)
- **Dampak Bisnis**: Jika terjadi anomali database tak terduga (misal intervensi manual pada tabel `Product`), tidak ada mekanisme otomatis untuk merekonstruksi `Product.stockQty` dari tabel append-only `StockMovement`.
- **Yang Diharapkan**: Tersedia fungsi `recalculateProductStock(productId)` yang menghitung `sum(qtyDelta)` dari `StockMovement` dan membandingkannya dengan `Product.stockQty`.
- **Yang Terjadi**: Fungsi rekonsiliasi hanya tersedia untuk pembayaran (`recalculateOrderPayments`), belum ada untuk stok barang.
- **Saran Perbaikan**: Tambahkan fungsi rekonsiliasi stok di `src/lib/services/stock.ts` yang dapat dijalankan pada job housekeeping atau perintah pemulihan admin.

---

*Laporan Fase 3 selesai disusun dan disimpan ke `docs/audit/LAPORAN-07-audit-duplikasi.md`.*

