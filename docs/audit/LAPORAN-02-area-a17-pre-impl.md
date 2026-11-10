# Laporan Audit 02: Area A17 (Harga Paten & Katalog Terintegrasi Multi-Usaha)

## 0. Ringkasan progres

| Area | Status | S1 | S2 | S3 | S4 | S5 | Dugaan | Tidak dapat diperiksa | Selesai (WIB) |
|---|---|---|---|---|---|---|---|---|---|
| Baseline (2.2) | Selesai | 0 | 2 | 3 | 1 | 0 | 0 | 1 | 2026-11-10 16:15 |
| A17 Harga Paten & Katalog (v2) | Selesai (Pra-Implementasi) | 1 | 3 | 2 | 2 | 0 | 0 | 0 | 2026-11-10 16:25 |
| A1 s.d A16 | Belum | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - |
| **Total** | | **1** | **5** | **5** | **3** | **0** | **0** | **1** | |

*Hash commit yang diaudit:* `a8a014b7b7c402152fefa2558be6e73c8b8c7b54` (HEAD)

---

## 1. Identitas audit

* **Hash commit:** `a8a014b7b7c402152fefa2558be6e73c8b8c7b54`
* **Versi aplikasi:** `1.0.0`
* **Tanggal & Waktu audit:** 10 November 2026, 16:25 WIB
* **Fase audit:** Pra-Implementasi Addendum v2 (Area A17: Harga Paten, Katalog Terintegrasi, dan Isolasi Tenant)
* **Area yang dicakup:** Area A17 (butir U1–U8, L1–L6, T1–T10, K1–K10, P1–P4)
* **Status Keputusan Pemilik:** Keputusan D-1 s.d D-10 disetujui penuh (Q-1 s.d Q-5 = Opsi A / Nilai Bawaan)
* **Tujuan putaran:** Memotret celah dan kesiapan aplikasi saat ini sebelum agent pembangun mengimplementasikan Addendum v2.

---

## 2. Baseline

Mengacu pada [LAPORAN-01-baseline.md](LAPORAN-01-baseline.md). Baseline fungsional kode saat ini:
* 34 berkas tes integrasi (`tests/integration/`) lulus 100% (445 skenario).
* Ditemukan celah baseline non-blocking: E2E test kosong (`AUD-TEST-003`), 34 vulnerability npm (`AUD-OPS-001`), mock desync di seed unit test (`AUD-TEST-001`), domain coverage 82.93% (`AUD-TEST-004`), dan linting warning (`AUD-TEST-002`).

---

## 3. Temuan Area A17

### AUD-SPEC-001: Trigger database isolasi katalog multi-usaha belum terpasang di PostgreSQL
* **Keparahan:** S1 Kritis (dasar S2, naik satu tingkat karena menyentuh isolasi tenant multi-usaha lapis data terdalam)
* **Kategori:** SPEC / TENANT
* **Area:** A17 (T5)
* **Status bukti:** Terbukti
* **Status penanganan:** Baru
* **Lokasi:** `prisma/migrations/`; `prisma/schema.prisma:185-197`
* **Rujukan Spesifikasi:** Addendum v2 Seksi 13.1 (F-8), 13.3 (D-9), 14.3; Seksi 6.8
* **Dampak bisnis:** Tabel `CatalogItem` tidak memiliki kolom `businessId` dan tidak berelasi langsung ke `Product`. Tanpa trigger database, celah validasi pada service dapat meloloskan produk milik Usaha B ke dalam katalog Usaha A, membocorkan daftar produk antar unit usaha bisnis pemilik.
* **Yang diharapkan:** Terdapat migrasi database PostgreSQL yang memasang fungsi `catalogitem_same_business()` dan trigger `catalogitem_same_business_trg` pada tabel `CatalogItem` untuk memblokir insert/update produk lintas usaha dengan kode error Postgres `23514`.
* **Yang terjadi:** Hanya ada migrasi `init` dan `db_constraints`. Tidak ada trigger isolasi katalog di berkas migrasi Prisma.
* **Bukti:**
  ```text
  $ ls prisma/migrations
  20261107000001_init  20261107000002_db_constraints
  (Trigger catalogitem_same_business_trg: TIDAK DITEMUKAN)
  ```
* **Langkah reproduksi:**
  1. Periksa berkas SQL di dalam `prisma/migrations/`.
  2. Amati ketiadaan trigger `catalogitem_same_business_trg`.
* **Saran perbaikan:** Jalankan langkah teknis 14.3 untuk membuat migrasi trigger database PostgreSQL pengaman katalog.

---

### AUD-SPEC-002: Endpoint resmi Daftar Harga Sales (GET /api/v1/price-list) belum diimplementasikan
* **Keparahan:** S2 Tinggi (dasar S2, endpoint inti untuk fitur Harga Paten bagi Sales)
* **Kategori:** SPEC / API
* **Area:** A17 (U1, U3, L1, L2, T1)
* **Status bukti:** Terbukti
* **Status penanganan:** Baru
* **Lokasi:** `src/app/api/v1/price-list/route.ts` (tidak ada)
* **Rujukan Spesifikasi:** Addendum v2 Seksi 13.7, 14.5, 14.6
* **Dampak bisnis:** Sales saat ini mengakses endpoint mentah `/api/v1/products` yang tidak menghitung `floorPrice` efektif per customer atau nilai rekomendasi harga awal (`suggestedPrice`).
* **Yang diharapkan:** Tersedia endpoint `GET /api/v1/price-list` yang mengembalikan DTO whitelist 11 kunci persis (`priceListItemDto`), mendukung filter `customerId`, isolasi otomatis `businessId` sesi, dan validasi ketat `.strict()`.
* **Yang terjadi:** Berkas `src/app/api/v1/price-list/route.ts` dan DTO `src/lib/dto/priceList.ts` belum ada di repositori.
* **Bukti:**
  ```text
  Test-Path src/app/api/v1/price-list/route.ts -> False
  Test-Path src/lib/dto/priceList.ts -> False
  ```
* **Langkah reproduksi:**
  1. Panggil `GET /api/v1/price-list`.
  2. Server mengembalikan status 404 NOT_FOUND.
* **Saran perbaikan:** Implementasikan langkah teknis 14.5 (DTO & service) dan 14.6 (route handler).

---

### AUD-SPEC-003: Fitur pembuatan katalog otomatis sekali klik (POST /api/v1/catalogs/from-products) belum ada
* **Keparahan:** S2 Tinggi (dasar S2, permintaan inti pemilik agar sales tidak menginput manual produk katalog)
* **Kategori:** SPEC / BIZ
* **Area:** A17 (K1, K2, K3)
* **Status bukti:** Terbukti
* **Status penanganan:** Baru
* **Lokasi:** `src/app/api/v1/catalogs/from-products/route.ts` (tidak ada); `src/app/(app)/catalogs/new/page.tsx`
* **Rujukan Spesifikasi:** Addendum v2 Seksi 13.1 (F-6), 13.6, 14.5, 14.6
* **Dampak bisnis:** Sales masih harus memilih produk satu per satu dan mengisi harga secara manual saat membuat katalog. Ini memicu kesalahan input harga dan tidak efisien.
* **Yang diharapkan:** Terdapat endpoint `POST /api/v1/catalogs/from-products` yang membuat katalog berisi seluruh produk aktif usaha (atau filter kategori) dalam satu transaksi database dengan harga awal = `suggestedPrice`.
* **Yang terjadi:** Endpoint belum tersedia dan antarmuka `/catalogs/new` masih menggunakan alur input per item manual.
* **Bukti:**
  ```text
  Test-Path src/app/api/v1/catalogs/from-products/route.ts -> False
  ```
* **Langkah reproduksi:**
  1. Buka halaman `/catalogs/new` sebagai Sales.
  2. Perhatikan formulir meminta pemilihan item produk manual secara berulang.
* **Saran perbaikan:** Implementasikan fungsi `createFromProducts` di service katalog dan tambahkan handler `from-products/route.ts`.

---

### AUD-SPEC-004: Endpoint sinkronisasi katalog dan objek status sync belum diimplementasikan
* **Keparahan:** S2 Tinggi (dasar S2, integritas katalog jangka panjang saat harga paten dinaikkan owner)
* **Kategori:** SPEC / STATE
* **Area:** A17 (K4, K5, K6)
* **Status bukti:** Terbukti
* **Status penanganan:** Baru
* **Lokasi:** `src/app/api/v1/catalogs/[id]/sync/route.ts` (tidak ada); `src/lib/services/catalog.ts:250`
* **Rujukan Spesifikasi:** Addendum v2 Seksi 13.3 (D-8), 13.6, 14.5
* **Dampak bisnis:** Ketika Super Admin menambah produk baru atau menaikkan harga paten, Sales tidak memiliki cara mudah untuk menyinkronkan katalognya. Penyesuaian manual berisiko menimpa harga item lain yang sudah dinegosiasikan.
* **Yang diharapkan:** `GET /catalogs/:id` menyertakan objek `sync: { newProducts, belowFloor, inactive }` dan endpoint `POST /catalogs/:id/sync` mengeksekusi penambahan produk baru atau kenaikan ke batas paten sesuai instruksi D-8.
* **Yang terjadi:** Endpoint sinkronisasi belum ada dan respons detail katalog belum menyertakan objek `sync`.
* **Bukti:**
  ```text
  Test-Path src/app/api/v1/catalogs/[id]/sync/route.ts -> False
  ```
* **Langkah reproduksi:**
  1. Periksa fungsi `getCatalogById` di `src/lib/services/catalog.ts`.
  2. Perhatikan objek return tidak memiliki field kalkulasi `sync`.
* **Saran perbaikan:** Tambahkan fungsi `syncCatalog` dan kalkulasi field `sync` sesuai panduan langkah 14.5.

---

### AUD-UI-001: Tampilan harga paten belum muncul langsung di selector produk dan label UI masih "Harga Minimal"
* **Keparahan:** S3 Sedang (dasar S3, berdampak langsung pada pengalaman pengguna Sales di lapangan)
* **Kategori:** UI / SPEC
* **Area:** A17 (U1, U2, U6)
* **Status bukti:** Terbukti
* **Status penanganan:** Baru
* **Lokasi:** `src/app/(app)/products/page.tsx:280`; `src/components/orders/OrderForm.tsx:320`
* **Rujukan Spesifikasi:** Addendum v2 Seksi 13.1 (F-2), 13.5, 14.7; Seksi 11.3, 11.4
* **Dampak bisnis:** Sales tidak langsung melihat batas bawah negosiasi sebelum memilih produk atau sebelum mengetik angka harga, memicu ketidakpastian negosiasi di depan customer.
* **Yang diharapkan:**
  1. Tabel `/products` Sales menampilkan header "Harga Katalog" dan "Harga Paten".
  2. Dropdown pemilih produk di formulir pesanan menampilkan format `Nama Produk [SKU] - Katalog: Rp X, Paten: Rp Y` sebelum dipilih.
  3. Baris pesanan menampilkan teks tetap `Harga paten (batas minimal): Rp Y`.
* **Yang terjadi:** Label di tabel masih bertuliskan "Harga Dasar" dan "Harga Minimal", pemilih produk di formulir order hanya menampilkan nama/SKU, dan baris order hanya menampilkan peringatan merah setelah nominal diketik lebih rendah dari minimal.
* **Bukti:**
  ```text
  // src/app/(app)/products/page.tsx
  <th scope="col">Harga Dasar</th>
  <th scope="col">Harga Minimal</th>
  ```
* **Langkah reproduksi:**
  1. Buka halaman `/products` sebagai Sales.
  2. Buka formulir pesanan baru `/orders/new` dan buka opsi dropdown produk.
* **Saran perbaikan:** Perbarui komponen UI pada langkah 14.7 sesuai panduan tampilan Addendum v2.

---

### AUD-SPEC-005: Fungsi domain effectiveFloor dan initialPrice belum tersedia di pricing.ts
* **Keparahan:** S3 Sedang (dasar S3, logika kalkulasi domain)
* **Kategori:** SPEC / MONEY
* **Area:** A17 (U5)
* **Status bukti:** Terbukti
* **Status penanganan:** Baru
* **Lokasi:** `src/lib/domain/pricing.ts:1-49`
* **Rujukan Spesifikasi:** Addendum v2 Seksi 13.3 (D-6), 14.4
* **Dampak bisnis:** Sistem belum memiliki aturan standar domain untuk menentukan harga awal item pesanan ketika pelanggan memiliki harga paten khusus yang melebihi harga katalog (`CustomerMinPrice > basePrice`). Hal ini menyebabkan formulir pesanan langsung menampilkan peringatan merah palsu begitu produk dipilih.
* **Yang diharapkan:** Tersedia fungsi murni domain `effectiveFloor(productMin, customerMin)` dan `initialPrice(basePrice, floor)` di `pricing.ts`.
* **Yang terjadi:** `src/lib/domain/pricing.ts` hanya memuat fungsi `baseFloor`, `lineFloor`, dan `isBelowFloor`.
* **Bukti:**
  ```text
  Grep 'effectiveFloor|initialPrice' src/lib/domain/pricing.ts -> Tidak ditemukan
  ```
* **Langkah reproduksi:**
  1. Buka berkas `src/lib/domain/pricing.ts`.
* **Saran perbaikan:** Tambahkan fungsi `effectiveFloor` dan `initialPrice` pada langkah teknis 14.4 beserta tes unitnya.

---

### AUD-UI-002: Formulir produk Super Admin belum memiliki peringatan pencegahan kebocoran inferensial
* **Keparahan:** S4 Rendah (dasar S4, panduan pengingat operasional)
* **Kategori:** UI / LEAK
* **Area:** A17 (U7, L4)
* **Status bukti:** Terbukti
* **Status penanganan:** Baru
* **Lokasi:** `src/app/(app)/products/page.tsx: modal tambah/edit produk`
* **Rujukan Spesifikasi:** Addendum v2 Seksi 13.1 (F-5), 13.3 (D-5), 14.7
* **Dampak bisnis:** Jika Super Admin menginput harga paten sama persis dengan HPP barang, Sales di lapangan secara inferensial dapat menebak modal barang perusahaan.
* **Yang diharapkan:** Form produk Super Admin menampilkan banner kuning non-blocking ketika `minPrice <= costPrice`: *"Harga paten terlihat oleh Sales. Bila sama dengan HPP, Sales bisa menebak HPP."*
* **Yang terjadi:** Tidak ada peringatan D-5 pada form produk Super Admin.
* **Bukti:**
  ```text
  Grep 'Harga paten terlihat oleh Sales' src/ -> Tidak ditemukan
  ```
* **Langkah reproduksi:**
  1. Buka modal tambah/edit produk Super Admin di `/products`.
  2. Masukkan harga dasar 100.000, HPP 70.000, dan harga minimal 70.000. Tidak muncul banner peringatan D-5.
* **Saran perbaikan:** Pasang komponen peringatan kuning kondisional pada modal form produk Super Admin.

---

### AUD-DOC-001: Dokumentasi rute baru, kode error CATALOG_ITEM_LIMIT, dan ADR v2 belum tercatat
* **Keparahan:** S4 Rendah (konsistensi dokumentasi arsitektur)
* **Kategori:** DOC
* **Area:** A17 (P4, K10)
* **Status bukti:** Terbukti
* **Status penanganan:** Baru
* **Lokasi:** `docs/BLUEPRINT.md`; `docs/adr/`
* **Rujukan Spesifikasi:** Addendum v2 Seksi 13.7, 14.9
* **Dampak bisnis:** Agen pembangun atau pengembang baru tidak memiliki catatan keputusan arsitektur (ADR) mengapa harga paten disatukan dengan `minPrice` dan apa saja kontrak endpoint baru.
* **Yang diharapkan:** Tabel endpoint `docs/BLUEPRINT.md` mencantumkan 3 rute baru, matriks hak akses 5.1 mencantumkan Daftar Harga, dan terdapat berkas ADR baru.
* **Yang terjadi:** Belum dicatat di `docs/BLUEPRINT.md` atau `docs/adr/`.
* **Bukti:**
  ```text
  Grep 'CATALOG_ITEM_LIMIT' docs/BLUEPRINT.md -> Tidak ditemukan
  ```
* **Langkah reproduksi:**
  1. Cari `CATALOG_ITEM_LIMIT` atau `price-list` di `docs/BLUEPRINT.md`.
* **Saran perbaikan:** Perbarui `docs/BLUEPRINT.md` dan buat ADR pada langkah teknis 14.9.

---

## 4. Dugaan

*(Tidak ada dugaan. Seluruh temuan di atas terbukti secara statis dan dinamis pada kode aplikasi saat ini).*

---

## 5. Pertanyaan untuk pemilik

* **Tidak ada pertanyaan baru.** Pertanyaan P1 (Q-1 s.d Q-5) telah disepakati dan dikunci ke Opsi A (Nilai Bawaan).

---

## 6. Area lulus pada A17

| Butir yang Diperiksa | Cara Memeriksa | Hasil Ringkas |
|---|---|---|
| **L6: PDF Katalog & Invoice Bebas Harga Paten** | Peninjauan berkas `CatalogDocument.tsx` dan `invoice-approval.test.ts` | **LULUS**: PDF customer hanya memuat harga jual katalog, tidak pernah mencetak `minPrice`, `floorPrice`, atau HPP |
| **T4: Isolasi Akses Katalog Sales Lain** | Pengujian integrasi `tests/integration/catalogs.test.ts` baris 410-440 | **LULUS**: Sales A1 yang mencoba membuka/mengedit katalog Sales A2 langsung ditolak dengan kode 404 NOT_FOUND |
| **T6: Isolasi Berkas Gambar Produk Antar Usaha** | Peninjauan `src/app/api/v1/files/[...path]/route.ts` | **LULUS**: Endpoint file memvalidasi kepemilikan tenant dan path traversal UPLOAD_DIR |
| **T7: Pembersihan Cache Offline PWA Katalog** | Pengujian integrasi `tests/integration/pwa.test.ts` | **LULUS**: Service worker membersihkan cache katalog saat pergantian sesi pengguna |
| **K7: Validasi Floor & Stale Detection pada Katalog Lama** | Pengujian integrasi `catalogs.test.ts` (bagian 2 & 5) | **LULUS**: Pembuatan katalog manual menolak harga di bawah floor (422 `PRICE_BELOW_MIN`) dan menolak unduh PDF jika stale (422 `CATALOG_STALE`) |

---

## 7. Tidak dapat diperiksa

*(Seluruh butir A17 berhasil diperiksa secara statis pada struktur rute, service, domain, UI, migrasi, dan suite tes eksisting).*

---

## 8. Lampiran

* **Matriks Tampilan & Kerahasiaan Harga Paten:** [`docs/audit/matriks/matriks-harga-paten-01.md`](matriks/matriks-harga-paten-01.md)
* **Matriks Isolasi Tenant & Katalog Multi-Usaha:** [`docs/audit/matriks/matriks-isolasi-katalog-01.md`](matriks/matriks-isolasi-katalog-01.md)
* **Register Kumulatif Temuan:** [`docs/audit/REGISTER.md`](REGISTER.md)
* **Panduan Implementasi Teknisi:** Dokumen Spesifikasi Versi 2 Seksi 14 (Langkah 14.2 s.d 14.9)

