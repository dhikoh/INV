# LAPORAN-05: Fase 1 — Inventaris dan Pemetaan (Dasar "Tanpa Gap")

Dokumen audit resmi independen untuk aplikasi OmniCat (repo `dhikoh-inv`) hasil pelaksanaan Fase 1: Inventaris dan Pemetaan Menyeluruh atas Fitur, Endpoint, Halaman UI, Model Data, State Machine, dan Hak Akses.

---

## 1. Identitas Audit

- **Tanggal Pelaksanaan**: 2026-11-10
- **Commit Git Terakhir**: `7c8778d1a19402ab571407b202bfd60aa27beb52`
- **Artefak Matriks yang Dihasilkan**:
  - `docs/audit/matriks/M1-fitur-implementasi-tes.md`
  - `docs/audit/matriks/M2-route-ke-pemanggil.md`
  - `docs/audit/matriks/M3-halaman-navigasi-api.md`
  - `docs/audit/matriks/M4-model-prisma-penggunaan.md`
  - `docs/audit/matriks/M5-status-dan-transisi.md`
  - `docs/audit/matriks/M6-peran-ke-kemampuan.md`
  - `docs/audit/matriks/M7-dokumen-ke-kode.md`

---

## 2. Ringkasan Eksekutif Pemetaan

1. **Pemetaan Route ke Pemanggil (M2)**:
   - Total 117 berkas `route.ts` menghasilkan **170 endpoint handler HTTP** (`GET`, `POST`, `PATCH`, `PUT`, `DELETE`).
   - Seluruh 170 endpoint memiliki tes Vitest yang menutupinya (0 endpoint tanpa tes).
   - Ditemukan **2 endpoint bisnis yatim tanpa pemanggil di UI**:
     - `GET /api/v1/price-list` (`AUD-GAP-002`): Telah diimplementasikan dan dites di Laporan 03, namun belum ada halaman atau komponen UI yang memanggilnya.
     - `GET/PUT /api/v1/commission/tiers` (`AUD-GAP-003`): Backend API tersedia, namun Super Admin tidak memiliki form/halaman UI untuk mengubah skema komisi target berjenjang.
2. **Pemetaan Halaman UI & Navigasi (M3)**:
   - Terdata **39 halaman `page.tsx`** di Next.js App Router.
   - Seluruh 37 halaman fungsional memiliki tautan masuk yang valid dari menu navigasi, kartu, atau tombol.
   - Konfirmasi temuan kritis tautan mati Telegram Bot:
     - Bot Telegram mengirim tautan `/tg/approvals/:id?reject=1` dan `/tg/payments` (`AUD-GAP-001`), kedua rute ini **HTTP 404 Not Found** di Next.js App Router.
3. **Integritas Model Data Prisma (M4)**:
   - Terdata **40 model data** dan **24 enum**.
   - Ditemukan 1 nilai enum tak terpakai: `ShipMethod.TRANSPORT_VENDOR` (`AUD-SPEC-007`).
   - Seluruh foreign key pada entitas finansial menggunakan kebijakan `RESTRICT` yang aman dari cascade delete tak sengaja.
4. **Alur Status & Transisi (M5)**:
   - Seluruh 9 enum status (`OrderStatus`, `InvoiceStatus`, `PaymentStatus`, `ShipStatus`, `PoStatus`, `CreditNoteStatus`, `CommissionStatus`, `ReminderStatus`, `CatalogStatus`) memiliki alur transisi yang tertutup dan terdokumentasi tanpa state buntu (*deadlocks*).
5. **Matriks Hak Akses & Zero-Leakage (M6)**:
   - Tidak ada kebocoran endpoint Super Admin ke peran Sales pada lapisan `withApi`.
   - Kolom sensitif finansial (`costPrice`, `margin`, `profit`, `cogs`, `actualCost`, `cogsReversed`, `costReversed`) disaring ketat dari DTO respons Sales.
6. **Desinkronisasi Dokumen vs Kode (M7)**:
   - 9 ketidakcocokan teridentifikasi antara `BLUEPRINT.md` dan kode aktual, termasuk inkonsistensi versi dependensi `^` dan jumlah berkas pengujian.

---

## 3. Matriks Kategori Temuan Fase 1

| Kategori | S1 Kritis | S2 Tinggi | S3 Sedang | S4 Rendah | S5 Info | Total Aktif |
|---|---|---|---|---|---|---|
| **GAP** | 1 (`AUD-GAP-001`) | - | 2 (`AUD-GAP-002`, `AUD-GAP-003`) | - | - | 3 |
| **DUP** | - | - | 2 (`AUD-DUP-001`, `AUD-DUP-002`) | - | - | 2 |
| **SPEC** | 1 (`AUD-SPEC-006`) | - | - | 1 (`AUD-SPEC-007`) | - | 2 |
| **SEC** | 1 (`AUD-SEC-001`) | - | - | - | - | 1 |
| **TENANT** | - | 1 (`AUD-TENANT-001`) | - | - | - | 1 |
| **PERF** | - | - | 1 (`AUD-PERF-001`) | - | - | 1 |
| **OPS / TEST** | - | 2 (`AUD-OPS-001`, `AUD-TEST-003`) | 1 (`AUD-OPS-002`) | - | - | 3 |
| **DOC** | - | - | - | 2 (`AUD-DOC-001`*, `AUD-DOC-002`) | - | 1 |
| **TOTAL** | **3** | **3** | **6** | **2** | **0** | **14** |

---

## 4. Temuan Baru dari Fase 1

### AUD-GAP-002: Endpoint Daftar Harga Resmi Sales (`GET /api/v1/price-list`) Belum Terhubung ke Antarmuka UI
- **Lokasi**: `src/app/api/v1/price-list/route.ts`, `src/app/(app)/products/page.tsx`, `src/app/(app)/catalogs/page.tsx`
- **Rujukan**: Dokumen Aturan Main 1.2 (Tanpa gap: setiap implementasi terhubung ke UI)
- **Dampak Bisnis**: Staf Sales belum dapat menikmati kemudahan evaluasi harga paten resmi dan floorPrice efektif melalui tampilan web terpadu, karena halaman UI masih memanggil endpoint mentah `/api/v1/products` dan `/api/v1/catalogs`.
- **Yang Diharapkan**: Halaman `/products` atau tab khusus di `/catalogs` mengonsumsi DTO resmi `GET /api/v1/price-list`.
- **Yang Terjadi**: Endpoint backend aktif dan lulus uji Vitest, tetapi pemanggil di UI 0 (yatim).
- **Saran Perbaikan**: Hubungkan pemanggilan API `/api/v1/price-list` pada komponen pemilih harga produk di UI Sales.

---

### AUD-GAP-003: Endpoint Skema Komisi Bertingkat (`GET/PUT /api/v1/commission/tiers`) Belum Memiliki Antarmuka Pengaturan
- **Lokasi**: `src/app/api/v1/commission/tiers/route.ts`, `src/app/(app)/settings/users/page.tsx`, `src/app/(app)/sales/page.tsx`
- **Rujukan**: BLUEPRINT.md Seksi 4 & Seksi 7; Dokumen Aturan Main 1.2
- **Dampak Bisnis**: Pemilik usaha tidak dapat melihat atau mengubah batas tier omzet/komisi staf sales dari aplikasi web tanpa melakukan manipulasi database manual.
- **Yang Diharapkan**: Tersedia komponen UI di halaman pengaturan pengguna / sales untuk mengonfigurasi `CommissionTier`.
- **Yang Terjadi**: Rute backend ada, tetapi tidak ada tombol, modal, atau formulir di UI yang memanggilnya.
- **Saran Perbaikan**: Tambahkan tab/modal pengaturan tier komisi pada halaman `/settings/users` atau `/sales`.

---

### AUD-DUP-002: Duplikasi Logika Penguraian Multipart & Validasi Pembayaran
- **Lokasi**: `src/app/api/v1/payments/route.ts:108-179` dan `src/app/api/v1/orders/[id]/payments/route.ts:75-145`
- **Rujukan**: Dokumen Aturan Main 1.3 (Tanpa duplikasi: satu jalur kode per aksi bisnis)
- **Dampak Bisnis**: Perubahan aturan validasi file bukti bayar atau batas ukuran rentan diterapkan tidak merata, memicu inkonsistensi perilaku input pembayaran.
- **Yang Diharapkan**: Satu helper/service terpadu untuk penguraian multipart form data pembayaran dan validasi bukti transfer.
- **Yang Terjadi**: Kedua route handler menulis ulang blok `formData.get('amount')`, `saveFile({ kind: 'proof' })`, dan validasi tipe angka secara mandiri.
- **Saran Perbaikan**: Ekstraksi fungsi pengurai `parsePaymentFormData(req)` ke `src/lib/services/payment.ts`.

---

### AUD-SPEC-007: Nilai Enum `ShipMethod.TRANSPORT_VENDOR` Tidak Pernah Digunakan
- **Lokasi**: `prisma/schema.prisma:103` (enum `ShipMethod`)
- **Rujukan**: Dokumen Aturan Main Area A7 (Integritas Data & Model Prisma)
- **Dampak Bisnis**: Menimbulkan ambiguitas domain armada pengiriman.
- **Yang Diharapkan**: Seluruh nilai enum di skema Prisma memiliki fungsi nyata di aplikasi.
- **Yang Terjadi**: UI dan service hanya menggunakan `OWN_FLEET` (Armada Sendiri) dan `EXPEDITION` (Ekspedisi Luar). `TRANSPORT_VENDOR` tidak pernah diacu di seluruh berkas `.ts` dan `.tsx`.
- **Saran Perbaikan**: Hapus nilai enum `TRANSPORT_VENDOR` pada migrasi skema berikutnya, atau beri dokumentasi alasan pencadangannya.

---

## 5. Area yang Lulus pada Fase 1

1. **Cakupan Tes Endpoint API (M2)**: 100% dari 170 endpoint handler memiliki berkas pengujian Vitest.
2. **Keterhubungan Halaman UI (M3)**: 37 dari 37 halaman fungsional memiliki tautan navigasi masuk yang valid tanpa halaman yatim terisolasi di luar root redirect dan TMA entry.
3. **Penutupan State Machine (M5)**: Seluruh alur status dokumen memiliki siklus penyelesaian dan pembatalan resmi yang jelas tanpa jebakan status buntu.
4. **Isolasi Peran & DTO (M6)**: Jaminan Nol Kebocoran (*Zero-Leakage*) terbukti 100% konsisten pada seluruh DTO yang dikirimkan ke peran Sales.

---

*Laporan Fase 1 selesai disusun dan disimpan ke `docs/audit/LAPORAN-05-inventaris-dan-pemetaan.md`.*

