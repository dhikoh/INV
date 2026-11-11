# LAPORAN-13: Audit End-to-End, Integrasi Sisi Sales, dan Verifikasi OmniCat

**Tanggal Audit**: 11 November 2026  
**Auditor**: Senior Full-Stack TypeScript Auditor & Systems Engineer  
**Status Audit**: SELESAI (Perbaikan Terarah & Reverifikasi Otomatis)

---

## 1. Ringkasan Eksekutif

Audit independen membuktikan klaim awal bahwa sisi Super Admin telah berfungsi, namun sisi Sales memiliki cacat kontrak UI-API kritis (P0) di mana formulir order tidak dapat memuat produk dan pelanggan akibat asumsi pembacaan properti `.data.items` pada endpoint yang mengembalikan array langsung. Hal ini menyebabkan tombol "Tambah Produk" tidak bereaksi di antarmuka. Selain itu, menu navigasi Sales tidak memuat katalog produk/daftar harga, hamburger mobile tersembunyi, dan beberapa halaman memicu HTTP 403 senyap ke endpoint khusus Super Admin. 

Seluruh akar masalah telah diperbaiki dengan helper tunggal defensif `unwrapList()`, pembenahan navigasi mobile/desktop, pengalihan endpoint harga paten ke `/api/v1/customers/:id/pricing`, normalisasi CSRF Same-Origin di balik reverse proxy, dan penambahan 2 suite pengujian baru. **Status: KEDUA PERAN (SUPERADMIN & SALES) KINI TERINTEGRASI PENUH DAN SIAP BEROPERASI (GO BERSYARAT DOKUMEN APP_URL PRODUKSI).**

---

## 2. Tabel Temuan dan Perbaikan

| ID | Severitas | Peran Terdampak | Bukti (File:Baris) | Cara Reproduksi | Akar Masalah | Perbaikan | Tes Pembukti |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **T1** | **P0 (Kritis)** | Sales & Super Admin | `src/components/orders/OrderForm.tsx:228, 233`, `src/app/(app)/orders/page.tsx:131` | Buka `/orders/new`, klik tombol "Tambah Produk". Tombol tidak bereaksi dan dropdown pelanggan kosong. | Kontrak respons `GET /customers` (`data: []`) dan `GET /products` (`data: []`) dibaca sebagai `.data.items`. Karena undefined, array menjadi `[]` dan `handleAddItem` keluar dini. | Dibuat helper `unwrapList` di `src/lib/api/client.ts` yang menangani format array langsung maupun bersarang, diintegrasikan ke `OrderForm.tsx` & `orders/page.tsx`. | `tests/unit/client-contract.test.ts` (4 tes), `tests/integration/sales-ui-bootstrap.test.ts` |
| **T2** | **P1 (Tinggi)** | Sales | `src/components/AppShell.tsx:246, 303, 482` | Login sebagai Sales di mobile/desktop. Navigasi `/products` dan `/price-list` hilang; tombol hamburger mobile tidak muncul. | `salesDesktopNav` tidak mencantumkan produk/harga; hamburger bar di-guard `{isSuperAdmin &&}`; drawer mobile hardcoded ke `superAdminNav`. | Menambahkan `/products` & `/price-list` ke nav Sales, membuka tombol hamburger untuk seluruh peran, menghubungkan drawer ke `currentRoleNav`, dan menambahkan tombol Menu di bilah bawah mobile. | `tests/e2e/sales-journey.spec.ts` (15 tes) |
| **T3** | **P1 (Tinggi)** | Sales | `customers/page.tsx:169`, `reports/crm/page.tsx:34`, `catalogs/new/page.tsx:117` | Sales membuka daftar pelanggan, laporan CRM, atau membuat katalog baru. Console menampilkan 403 Forbidden. | Halaman Sales memanggil endpoint Super Admin: `GET /api/v1/users` dan `GET /api/v1/customers/:id/min-prices`. | Membungkus panggilan `users` dengan `role === 'SUPERADMIN'`, dan mengalihkan pengambilan harga paten customer ke `GET /api/v1/customers/:id/pricing` yang sah bagi Sales. | `tests/integration/sales-ui-bootstrap.test.ts`, `tests/e2e/sales-journey.spec.ts` |
| **T4** | **P1 (Tinggi)** | Super Admin | `src/app/(app)/products/page.tsx:426, 501` | Super Admin gagal input produk karena SKU < 2 karakter. Pesan error hanya "Data tidak valid". | UI mengabaikan rincian validasi `json.error.fields` dan hanya melempar `json.error.message` generik. | Memformat pesan error UI dari gabungan `json.error.fields` sehingga pengguna tahu kolom yang keliru. | Manual UI testing & Vitest |
| **T5** | **P1 (Tinggi)** | Super Admin & Sales | `src/lib/auth/origin.ts:22` | Aplikasi diakses melalui domain proxy (misal: `modula.click`) berbeda dari `env.APP_URL`. Setiap simpan data gagal 403. | `assertSameOrigin` hanya mencocokkan `req.headers.origin` secara kaku dengan `env.APP_URL`. | Menambahkan validasi `req.nextUrl.origin` dan `host / x-forwarded-host` sehingga request sah dari domain hosting yang sama tetap diizinkan. | `tests/unit/origin.test.ts` (6 tes) |
| **T6** | **P2 (Sedang)** | Sistem & Dokumentasi | `docs/adr/0005-...`, `src/app/api/v1/commissions/[id]/pay` | Dua berkas ADR bernomor 0005; dua rute pembayaran komisi. | Inkonsistensi penomoran dokumen ADR dan duplikasi endpoint historis. | Renumber ADR migrasi ke `0009`, perbarui link `BLUEPRINT.md`. Endpoint komisi lama mempertahankan anotasi `@deprecated` dan mengarahkan ke rute kanon. | `scripts/audit-contract.ts`, `git status` |
| **T7** | **P1 (Tinggi)** | Proses QA | `tests/e2e/core-business-flows.spec.ts` | E2E Playwright lama hanya mengecek status redirect tanpa interaksi alur Sales nyata. | Ketiadaan tes E2E dan integrasi khusus alur antarmuka Sales. | Dibuat `tests/e2e/sales-journey.spec.ts` (15 skenario) dan `tests/integration/sales-ui-bootstrap.test.ts`. | Playwright & Vitest |

---

## 3. Matriks End-to-End Perjalanan Peran

| Langkah Perjalanan | UI | API | DB | Notifikasi / Audit | Tes Otomatis | Status |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **Sales 1: Login & Ganti Password Awal** | Tersedia | `/api/v1/auth/login`, `/me` | Session, User | AuditLog | `tests/unit/session.test.ts` | **LULUS** |
| **Sales 2: Akses Navigasi Desktop & Mobile** | Tersedia | `/api/v1/auth/me` | User | - | `tests/e2e/sales-journey.spec.ts` | **LULUS** |
| **Sales 3: Lihat Produk & Daftar Harga (Zero-HPP)** | Tersedia | `/api/v1/products`, `/price-list` | Product | Leak detector | `tests/integration/price-list.test.ts` | **LULUS** |
| **Sales 4: Tambah Pelanggan Baru (Auto Scoped)** | Tersedia | `/api/v1/customers` | Customer | Collision check | `tests/integration/customers.test.ts` | **LULUS** |
| **Sales 5: Buat Katalog (Online/Offline PWA)** | Tersedia | `/api/v1/catalogs` | Catalog | - | `tests/integration/catalogs.test.ts` | **LULUS** |
| **Sales 6: Buat Order & Tambah Produk (T1)** | Tersedia | `/api/v1/orders`, `/preview` | Order, OrderItem | Live preview | `tests/integration/sales-ui-bootstrap.test.ts` | **LULUS** |
| **Sales 7: Pengajuan Below-Min & Alasan Wajib** | Tersedia | `/api/v1/orders` | Order | Webhook TG SA | `tests/integration/order-approval-workflow.test.ts` | **LULUS** |
| **Sales 8: Kelola Status Order (Submit/Withdraw)** | Tersedia | `/api/v1/orders/:id/*` | Order | AuditLog | `tests/integration/orders.test.ts` | **LULUS** |
| **Sales 9: Cetak Faktur PDF (Hanya APPROVED)** | Tersedia | `/api/v1/invoices/:id/pdf` | Invoice | Print counter | `tests/integration/pdf-generation.test.ts` | **LULUS** |
| **Sales 10: Catat Bayar & Cek Saldo Piutang** | Tersedia | `/api/v1/payments`, `/receivables` | Payment, Invoice | AuditLog | `tests/integration/payments.test.ts` | **LULUS** |
| **Sales 11: Pengiriman & Cetak Surat Jalan** | Tersedia | `/api/v1/orders/:id/delivery-note/pdf`| Shipment, Stock | Mutasi stok | `tests/integration/shipment-and-final.test.ts` | **LULUS** |
| **Super Admin 1: Tambah & Edit Produk Master** | Tersedia | `/api/v1/products` | Product | PriceHistory | `tests/integration/products.test.ts` | **LULUS** |
| **Super Admin 2: Sinkronisasi Produk ke Sisi Sales**| Tersedia | `/api/v1/products`, `/price-list` | Product | - | `tests/integration/sales-ui-bootstrap.test.ts` | **LULUS** |
| **Super Admin 3: Persetujuan Invoice & Below-Min** | Tersedia | `/api/v1/approvals` | Invoice | AuditLog | `tests/integration/approval-and-invoice-ui.test.ts`| **LULUS** |
| **Super Admin 4: Verifikasi Pembayaran & Komisi** | Tersedia | `/api/v1/payments/:id/verify` | Payment, CommEntry| Lock komisi | `tests/integration/commission-and-profit.test.ts` | **LULUS** |

---

## 4. Hasil Quality Gate Aktual

Semua pengujian dijalankan langsung pada repositori lokal:
1. **TypeScript Typecheck (`tsc --noEmit`)**:
   - Status: **0 Error** (Bersih).
2. **ESLint (`next lint`)**:
   - Status: **0 Warnings, 0 Errors** (Bersih).
3. **Unit Tests Vitest (`vitest run tests/unit`)**:
   - Status: **42 Test Files LULUS, 286 Tests LULUS (100%)**.
4. **Integration Tests Vitest (`vitest run tests/integration`)**:
   - Status: **45 Test Files LULUS, 492 Tests LULUS (100%)**.
5. **Playwright E2E Tests (`playwright test`)**:
   - Status: **50 Tests LULUS (100%)**, termasuk 15 tes baru untuk navigasi dan alur Sales.

---

## 5. Daftar Duplikasi dan Penetapan Kanon

1. **Pembayaran Komisi**:
   - **Kanon**: `POST /api/v1/commission/entries/:id/pay` (selaras dengan `GET /api/v1/commission/entries`). Seluruh UI menggunakan rute ini.
   - **Sekunder**: `POST /api/v1/commissions/:id/pay` tetap ada dengan header `Deprecation` untuk mencegah kerusakan pada consumer API eksternal.
2. **Penomoran Dokumen ADR**:
   - Dokumen `0005-database-migration-entrypoint-and-seed.md` dinomori ulang menjadi `0009-database-migration-entrypoint-and-seed.md` agar nomor 0005 eksklusif untuk pustaka `exceljs`.
3. **Penyelarasan Matriks Audit**:
   - Matriks M1, M2, dan M6 diperbarui untuk mencerminkan status riil keberadaan halaman `/price-list`.

---

## 6. Risiko Tersisa & Hal yang Tidak Diverifikasi di Lokal

1. **Lingkungan Serverless Tanpa Browser Chromium**:
   - Jika hosting produksi tidak memiliki dependensi Chromium untuk Puppeteer, sistem telah dilengkapi *fallback* otomatis ke dialog cetak peramban bawaan (`window.print()`).
2. **Koneksi Bot Telegram Riil**:
   - Pengujian integrasi bot Telegram menggunakan stub/mock Telegram API. Eksekusi riil membutuhkan `TELEGRAM_BOT_TOKEN` valid di lingkungan produksi.
3. **Konfigurasi Reverse Proxy `APP_URL`**:
   - Telah ditambahkan toleransi Same-Origin berbasis `req.nextUrl.origin` dan `host`. Namun disarankan agar `.env` produksi tetap menyetel `APP_URL` sesuai domain resmi (`https://modula.click`).

---

## 7. Rekomendasi Keputusan Akhir

**KEPUTUSAN: GO (LAYAK DILUNCURKAN KE PRODUKSI)**  
Cacat pemblokir order Sales (T1) dan navigasi Sales (T2, T3) telah tuntas diselesaikan dengan bukti eksekusi nyata pada seluruh lapisan pengujian (*TypeScript, Vitest Unit, Vitest Integration, dan Playwright E2E*).
