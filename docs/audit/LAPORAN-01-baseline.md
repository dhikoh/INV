# Laporan Audit 01: Baseline & Pemeriksaan Awal

## 0. Ringkasan progres

| Area | Status | S1 | S2 | S3 | S4 | S5 | Dugaan | Tidak dapat diperiksa | Selesai (WIB) |
|---|---|---|---|---|---|---|---|---|---|
| Baseline (2.2) | Selesai | 0 | 2 | 3 | 1 | 0 | 0 | 1 | 2026-11-10 16:15 |
| A1 Rumus Uang | Belum | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - |
| A2 Hak Akses & Kebocoran | Belum | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - |
| A3 Isolasi Tenant & Sales | Belum | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - |
| A4 Autentikasi & Sesi | Belum | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - |
| A5 State Machine & Status | Belum | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - |
| A6 Konkurensi & Idempotensi | Belum | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - |
| A7 Integritas Data | Belum | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - |
| A8 Void & Pembalikan | Belum | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - |
| A9 PDF & Terbilang | Belum | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - |
| A10 Telegram Bot | Belum | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - |
| A11 Pengingat & Job | Belum | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - |
| A12 Berkas & Unggahan | Belum | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - |
| A13 UI & PWA Offline | Belum | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - |
| A14 Performa | Belum | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - |
| A15 Tes & Operasional | Belum | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - |
| A16 Skenario Bisnis & Gap | Belum | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - |
| A17 Harga Paten & Katalog (v2) | Belum | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - |
| **Total** | | **0** | **2** | **3** | **1** | **0** | **0** | **1** | |

*Hash commit yang diaudit:* `a8a014b7b7c402152fefa2558be6e73c8b8c7b54` (HEAD)

---

## 1. Identitas audit

* **Hash commit:** `a8a014b7b7c402152fefa2558be6e73c8b8c7b54`
* **Pesan commit:** `fix(api,pwa,users): duck-type DomainError handling, pwa prompt deduplication, and autocomplete attributes`
* **Versi aplikasi:** `1.0.0` (dari `package.json`)
* **Tanggal & Waktu audit:** 10 November 2026, 16:15 WIB
* **Fase audit:** Baseline Awal sebelum Gerbang Audit Lengkap / Addendum v2
* **Area yang dicakup putaran ini:** Seksi 2.2 Baseline dan Seksi 2.3 Persiapan Seed Audit
* **Dokumen acuan:**
  * Prompt Audit: Gap, Bug, dan Celah Keamanan Versi 2 (termasuk Addendum v2)
  * Dokumen Spesifikasi: "Prompt AI Agent: Sistem Order, CRM dan Invoice Multi-Usaha"
* **Lingkungan eksekusi:**
  * OS: Windows 11 Pro (win32 x64)
  * Node.js: `v22.17.0`
  * PNPM: `v12.18.0`
  * Vitest: `v3.0.5`
  * Database tes yang dikonfigurasi: `postgresql://app:***@localhost:5433/app_test` (nama berakhiran `_test`)

---

## 2. Baseline

### (a) Identitas Git & Status Repositori

```text
Commit HEAD: a8a014b7b7c402152fefa2558be6e73c8b8c7b54
Status Git:
?? Prompt_Audit_Gap_Bug_Celah_Keamanan_v2_Harga_Paten_Katalog.docx
?? Prompt_Audit_Gap__Bug__dan_Celah_Keamanan.docx
```

30 commit terakhir terekam dari `a8a014b` hingga `bb97e19` mencakup penyelesaian Tugas T0.1 s.d T5.6.

### (b) Hasil Pemeriksaan Otomatis

| Perintah | Hasil | Keterangan / Ringkasan | Durasi | Butuh Jaringan |
|---|---|---|---|---|
| `pnpm install --frozen-lockfile` | **Lulus** | Lockfile up to date, resolution skipped | 0.25s | Tidak |
| `pnpm lint` | **Gagal** | 4 error: 2 unused vars di `settings/business/page.tsx`, 2 unexpected any di `domain/money.ts` | 16.66s | Tidak |
| `pnpm typecheck` | **Lulus** | `tsc --noEmit` bersih tanpa error kompilasi | 5.46s | Tidak |
| `pnpm test:unit` | **Gagal** | 33 file lulus, 1 file gagal (`tests/unit/seed.test.ts`: 4 tes gagal). 173 lulus dari 177 tes | 10.08s | Tidak |
| `pnpm test:int` | **Lulus** | 34 file lulus, 0 gagal. 445 tes integrasi lulus | 19.63s | Tidak |
| `pnpm test:e2e` | **Gagal** | Playwright gagal: `Error: No tests found` (`tests/e2e/` kosong) | 1.10s | Tidak |
| `pnpm audit --prod` | **Gagal** | 34 kerentanan (3 critical, 12 high, 17 moderate, 2 low) | 1.32s | Ya (audit advisory DB) |

### (c) Cakupan Pengujian Domain & Service

* **Domain Unit Test (`src/lib/domain/`):**
  * Statement coverage: **82.93%** (Target: **100%**)
  * Komponen dengan cakupan penuh: `numbering.ts` (100%), `reminder.ts` (100%), `terbilang.ts` (100%), `money.ts` (95.08%), `pricing.ts` (96.77%), `order.ts` (98.30%), `credit.ts` (97.36%), `commission.ts` (97.14%), `profit.ts` (96.00%).
  * Komponen belum memiliki unit test mandiri: `receivable.ts` (**0%** unit coverage, baru teruji di tingkat integrasi).
* **Service Test:**
  * Tercakup melalui 34 berkas tes integrasi di `tests/integration/` (445 skenario lulus).

### (d) Pemeriksaan Database Tes

* URL variabel `TEST_DATABASE_URL` di `.env`: `postgresql://app:app@localhost:5433/app_test`
* Validasi nama database berakhiran `_test`: **LULUS** (`globalSetup.ts` memvalidasi akhiran `_test`).
* Status koneksi socket port 5433: Saat ini belum aktif (`ECONNREFUSED`). Seluruh 445 tes integrasi vitest berhasil berjalan karena memanfaatkan in-memory mocks dan `@electric-sql/pglite` (WASM Postgres).

### (e) Inventaris Aplikasi

* **Jumlah Model Prisma:** **40 model** di `prisma/schema.prisma`
* **Jumlah Rute API (`route.ts`):** **114 endpoint** di `src/app/api/`
* **Jumlah Penanda Tes Dilewati (`.skip`, `.only`, `.todo`):** **0 penanda** di seluruh `src/` dan `tests/`

---

## 3. Temuan

### AUD-TEST-003: Suite pengujian Playwright E2E kosong (tests/e2e tanpa berkas pengujian)
* **Keparahan:** S2 Tinggi (dasar S2, fitur inti jaminan mutu sistem sebelum go-live belum terlindungi end-to-end)
* **Kategori:** TEST
* **Area:** Baseline (A15)
* **Status bukti:** Terbukti
* **Status penanganan:** Baru
* **Lokasi:** `tests/e2e/`; `package.json:16`
* **Rujukan Spesifikasi:** 17.5, 19.9
* **Dampak bisnis:** Alur bisnis kritis di browser (antarmuka sales, alur order hingga approval di UI) belum terlindungi uji regresi otomatis Playwright sebelum go-live.
* **Yang diharapkan:** Terdapat minimal 5 skenario E2E utama (login & logout, alur draft order hingga approved, cetak invoice, approval Telegram mock, offline PWA katalog) sesuai Seksi 17.5.
* **Yang terjadi:** Direktori `tests/e2e/` kosong. Eksekusi `pnpm test:e2e` langsung gagal dengan pesan `Error: No tests found`.
* **Bukti:**
  ```text
  $ playwright test
  Error: No tests found
  [ELIFECYCLE] Command failed with exit code 1.
  ```
* **Langkah reproduksi:**
  1. Jalankan `pnpm test:e2e` di terminal.
  2. Perhatikan Playwright berhenti dengan exit code 1.
* **Saran perbaikan:** Isi `tests/e2e/` dengan 5 skenario pengujian browser headless sesuai daftar 17.5 tanpa memanggil jaringan eksternal.
* **Tes yang seharusnya menangkap ini:** Pemeriksaan gerbang pipeline CI/CD sebelum rilis.

---

### AUD-OPS-001: 34 kerentanan dependensi produksi terdeteksi pada pnpm audit
* **Keparahan:** S2 Tinggi (dasar S2, terdapat 3 kerentanan tingkat Critical dan 12 High)
* **Kategori:** OPS
* **Area:** Baseline (A4, A15)
* **Status bukti:** Terbukti
* **Status penanganan:** Baru
* **Lokasi:** `package.json`, `pnpm-lock.yaml`
* **Rujukan Spesifikasi:** 16.4, 20.6
* **Dampak bisnis:** Potensi eksploitasi celah keamanan bawaan framework (Next.js/React ecosystem) jika aplikasi dideploy ke lingkungan produksi tanpa patch keamanan.
* **Yang diharapkan:** `pnpm audit --prod` bersih dari temuan bernilai High dan Critical.
* **Yang terjadi:** `pnpm audit --prod` mendeteksi 34 kerentanan: 3 critical, 12 high, 17 moderate, 2 low.
* **Bukti:**
  ```text
  $ pnpm audit --prod
  34 vulnerabilities found
  Severity: 2 low | 17 moderate | 12 high | 3 critical
  ```
* **Langkah reproduksi:**
  1. Jalankan `pnpm audit --prod` di root direktori.
* **Saran perbaikan:** Perbarui versi dependensi Next.js ke versi patch terbaru yang telah mengatasi advisory keamanan tersebut.

---

### AUD-TEST-001: Kegagalan 4 unit test pada seed.test.ts akibat desinkronisasi mock
* **Keparahan:** S3 Sedang (dasar S3, tidak merusak aplikasi produksi tetapi memecahkan suite tes otomatis)
* **Kategori:** TEST
* **Area:** Baseline (A15)
* **Status bukti:** Terbukti
* **Status penanganan:** Baru
* **Lokasi:** `tests/unit/seed.test.ts:29`, `40`, `66`; `prisma/seed.ts:42`, `60`
* **Rujukan Spesifikasi:** 16.1, 17.2
* **Dampak bisnis:** Pipa pengujian lokal (`pnpm test:unit`) gagal sehingga menghambat verifikasi otomatis perubahan kode oleh developer/agent lain.
* **Yang diharapkan:** Seluruh pengujian unit lulus 100%.
* **Yang terjadi:** `tests/unit/seed.test.ts` gagal pada 4 pengujian karena perubahan operasional terbaru pada `prisma/seed.ts` (seperti `mustChangePassword: false` dan auto-select business) tidak diselaraskan dengan ekspektasi mock pengujian.
* **Bukti:**
  ```text
  FAIL tests/unit/seed.test.ts > Prisma Seed Super Admin (T1.2 & Seksi 16.1)
  - AssertionError: expected mustChangePassword: true, received: false
  - TypeError: prisma.user.update is not a function (mocking mismatch)
  Tests: 4 failed | 173 passed (177)
  ```
* **Langkah reproduksi:**
  1. Jalankan `pnpm test:unit tests/unit/seed.test.ts`.
* **Saran perbaikan:** Sinkronkan ekspektasi pengujian `tests/unit/seed.test.ts` dengan implementasi `prisma/seed.ts` terbaru.

---

### AUD-TEST-004: Cakupan unit test domain belum mencapai target 100% (receivable.ts)
* **Keparahan:** S3 Sedang (dasar S3, logika keuangan domain wajib terlindungi tes unit independen)
* **Kategori:** TEST
* **Area:** Baseline (A1)
* **Status bukti:** Terbukti
* **Status penanganan:** Baru
* **Lokasi:** `src/lib/domain/receivable.ts:1-70`
* **Rujukan Spesifikasi:** 3.4, 7.1, 13.3
* **Dampak bisnis:** Fungsi perhitungan sisa piutang, hari jatuh tempo, dan bucket umur piutang berisiko mengalami regresi tanpa deteksi awal di tingkat pengujian unit.
* **Yang diharapkan:** Seluruh berkas di `src/lib/domain/` memiliki cakupan baris dan cabang 100% pada pengujian unit.
* **Yang terjadi:** `src/lib/domain/receivable.ts` memiliki cakupan unit test 0% (total domain coverage: 82.93%).
* **Bukti:**
  ```text
  File          | % Stmts | % Branch | % Funcs | % Lines
  receivable.ts |       0 |        0 |       0 |       0
  ```
* **Langkah reproduksi:**
  1. Jalankan `pnpm vitest run tests/unit --coverage`.
* **Saran perbaikan:** Tambahkan berkas tes unit `tests/unit/receivable.test.ts` untuk menguji `calculateReceivableBalance`, `getDaysOverdue`, dan `getAgingBucket` secara mendalam.

---

### AUD-OPS-002: Layanan database PostgreSQL tes port 5433 tidak aktif
* **Keparahan:** S3 Sedang (dasar S3, mempengaruhi kemampuan eksekusi kueri dinamis mandiri langsung ke database tes)
* **Kategori:** OPS
* **Area:** Baseline (A7)
* **Status bukti:** Terbukti
* **Status penanganan:** Baru
* **Lokasi:** `.env:2` (`TEST_DATABASE_URL=postgresql://app:app@localhost:5433/app_test`)
* **Rujukan Spesifikasi:** 1.2, 19.9
* **Dampak bisnis:** Auditor dan developer tidak dapat menjalankan skrip seed langsung (`tmp/audit/seed-audit.ts`) atau kueri konsistensi SQL mentah (`psql`) di luar harness PGlite vitest.
* **Yang diharapkan:** Service PostgreSQL aktif berjalan di localhost:5433 untuk database `app_test`.
* **Yang terjadi:** Koneksi ke `127.0.0.1:5433` ditolak (`ECONNREFUSED`).
* **Bukti:**
  ```text
  AggregateError [ECONNREFUSED]: connect ECONNREFUSED 127.0.0.1:5433
  ```
* **Langkah reproduksi:**
  1. Jalankan koneksi via client pg ke port 5433.
* **Saran perbaikan:** Pastikan container database Postgres pengujian dijalankan (misalnya via `docker compose -f docker-compose.dev.yml up -d` jika docker tersedia, atau service Postgres lokal).

---

### AUD-TEST-002: Pelanggaran ESLint pada halaman bisnis dan modul money
* **Keparahan:** S4 Rendah (masalah kebersihan kode & tipe data)
* **Kategori:** TEST
* **Area:** Baseline (A15)
* **Status bukti:** Terbukti
* **Status penanganan:** Baru
* **Lokasi:** `src/app/(app)/settings/business/page.tsx:304:13`, `319:13`; `src/lib/domain/money.ts:22:30`, `25:24`
* **Rujukan Spesifikasi:** 1.3 butir 15
* **Dampak bisnis:** Pengecekan otomatis CI `pnpm lint` gagal.
* **Yang diharapkan:** Kode bersih dari variabel tidak terpakai dan penggunaan `any`.
* **Yang terjadi:** Terdapat 4 error ESLint (@typescript-eslint/no-unused-vars dan @typescript-eslint/no-explicit-any).
* **Bukti:**
  ```text
  ./src/app/(app)/settings/business/page.tsx:304:13 Error: 'res' is assigned a value but never used.
  ./src/lib/domain/money.ts:22:30 Error: Unexpected any. Specify a different type.
  ```
* **Langkah reproduksi:**
  1. Jalankan `pnpm lint` di terminal.
* **Saran perbaikan:** Hapus variabel `res` yang tidak terpakai dan definisikan tipe data eksplisit pengganti `any` di `money.ts`.

---

## 4. Dugaan

*(Tidak ada dugaan pada fase baseline. Seluruh temuan di atas terbukti secara otomatis melalui output perintah).*

---

## 5. Pertanyaan untuk pemilik

### P1: AUD-GAP-001: Penyesuaian Nilai Bawaan Addendum v2 (D-1 s.d D-10)
* **Pertanyaan untuk Anda:** Apakah Anda menyetujui adopsi resmi keputusan D-1 sampai D-10 dari Addendum Spesifikasi v2 (Harga Paten = `minPrice`, batas 300 katalog, sinkronisasi katalog manual, dan perlindungan isolasi tenant)?
* **Konteks:** Pemilik telah menyetujui "Lanjut Baseline & Audit dulu" dengan opsi mengadopsi nilai bawaan.
* **Pilihan:**
  * **A) (Direkomendasikan)** Ya, setujui keputusan D-1 sampai D-10 sebagai aturan acuan resmi untuk audit Area A17 dan panduan implementasi.
  * **B)** Ada butir yang ingin diubah (sebutkan nomor D atau Q yang ingin diubah).
* **Keparahan sementara:** S2

---

## 6. Area lulus

| Butir yang Diperiksa | Cara Memeriksa | Hasil Ringkas |
|---|---|---|
| Penamaan database tes | Evaluasi `TEST_DATABASE_URL` di `.env` dan `globalSetup.ts` | **Lulus**: Nama database berakhiran `_test` (`app_test`), dicek ketat oleh regex `assertTestDbUrl` |
| Kompilasi TypeScript (`pnpm typecheck`) | Menjalankan `tsc --noEmit` | **Lulus**: 0 error tipe data di seluruh codebase |
| Integritas pengujian integrasi (`pnpm test:int`) | Menjalankan `vitest run tests/integration` | **Lulus**: 34/34 berkas tes integrasi lulus, total 445 pengujian lulus (19.63 detik) |
| Konsistensi rumus Fixture 7.7 | Menjalankan `vitest run tests/unit/fixture-7-7.test.ts` | **Lulus**: Seluruh 15 perhitungan angka demi angka (subtotal, diskon, PPN, DP, komisi, profit) cocok 100% |
| Ketiadaan penanda tes dilewati | Script pemindai regex `\.(skip\|only\|todo)\(` pada `tests/` dan `src/` | **Lulus**: Ditemukan 0 penanda tes yang dilewati/ditinggalkan |
| Verifikasi lockfile paket | Menjalankan `pnpm install --frozen-lockfile` | **Lulus**: Lockfile up-to-date dan lolos verifikasi dalam 254ms |

---

## 7. Tidak dapat diperiksa

| Butir | Alasan | Yang Dibutuhkan | Penanggung Jawab |
|---|---|---|---|
| Kueri SQL dinamis mandiri & eksekusi `seed-audit.ts` langsung ke PostgreSQL | Database lokal port 5433 belum aktif (`ECONNREFUSED`) | Menyalakan service PostgreSQL lokal pada port 5433 untuk database `app_test` | Pengelola Infrastruktur / Pemilik |
| Pengujian interaksi Telegram asli & Mini App di HP | Keterbatasan lingkungan sandbox agen (dilarang menyentuh bot riil dan jaringan luar) | Pengujian langsung oleh pemilik menggunakan akun Telegram asli pada HP | Pemilik Bisnis |

---

## 8. Lampiran

* **Skrip Seed Data Audit:** [`tmp/audit/seed-audit.ts`](../../tmp/audit/seed-audit.ts)
* **Register Temuan Kumulatif:** [`docs/audit/REGISTER.md`](REGISTER.md)
* **Repositori Tes:** [`tests/factories.ts`](../../tests/factories.ts), [`tests/helpers/resetDb.ts`](../../tests/helpers/resetDb.ts)

---

## 9. Riwayat verifikasi ulang

*(Belum ada verifikasi ulang pada putaran 01 baseline ini).*

