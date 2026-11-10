# LAPORAN-08: Fase 4 — Audit Mendalam per Area (A1 s/d A17)

Dokumen audit resmi independen untuk aplikasi OmniCat (repo `dhikoh-inv`) hasil pemeriksaan mendalam dan verifikasi ulang atas 17 area teknis dan fungsional sistem.

---

## 1. Identitas Audit

- **Tanggal Pelaksanaan**: 2026-11-10
- **Commit Git Terakhir**: `7c8778d1a19402ab571407b202bfd60aa27beb52`
- **Area yang Diaudit**: A1 s/d A17 (16 area baru & verifikasi ulang independen A17).

---

## 2. Ringkasan Hasil per Area (A1 s/d A17)

| Kode Area | Nama Area Audit | Status Evaluasi | Temuan Terkait / Catatan Verifikasi |
|---|---|---|---|
| **A1** | Rumus Uang & Angka | **LULUS** | Seluruh perhitungan menggunakan integer Rupiah utuh & basis points (`assertInt`, `applyBps`) di `src/lib/domain/`. Bebas dari floating-point rounding errors. |
| **A2** | Hak Akses & Zero-Leakage | **LULUS** | Pindaian statis client bundle `.next/static` dan DTO membuktikan `costPrice`, `margin`, `profit`, `actualCost`, dan `cogsReversed` tidak pernah bocor ke Sales. |
| **A3** | Isolasi Tenant & Sales | **CACAT DITEMUKAN** | `AUD-TENANT-001` (S2): `bank-accounts/[id]` memanggil Prisma `findFirst` tanpa `businessId` pada model terlindungi, memicu unhandled runtime crash. |
| **A4** | Autentikasi & Sesi | **CACAT KRITIS** | `AUD-SEC-001` (S1): Fallback default `bismillahbento` di `prisma/seed.ts`, overwrite password setiap restart, plain text logging. Argon2id & session hash berfungsi baik. |
| **A5** | State Machine & Transisi | **LULUS** | Seluruh transisi status tertutup dan terdokumentasi tanpa deadlock (M5). |
| **A6** | Konkurensi & Idempotensi | **LULUS** | Kunci pesimistik baris (`FOR UPDATE`), kunci optimistik `rev`, dan UPSERT atomik nomor urut melindungi persetujuan ganda. |
| **A7** | Integritas Data & DB Constraints | **CACAT KRITIS** | `AUD-SPEC-006` (S1): 8 CHECK constraints, 2 indeks unik bersyarat, dan 2 trigger imutabilitas/isolasi hilang di produksi akibat eksekusi `prisma db push` di entrypoint Docker. |
| **A8** | Void & Pembalikan Finansial | **CACAT DITEMUKAN** | `AUD-INT-001` (S2): Pengajuan faktur pelunasan (`requestFinalOrder`) mengabaikan `order.creditTotal` saat retur Nota Kredit OFFSET disetujui, menyebabkan overbilling. |
| **A9** | PDF Generation & Terbilang | **LULUS** | Puppeteer Headless Chromium, 5 tema faktur, watermark status dinamis, dan fungsi `terbilang` berjalan stabil. |
| **A10** | Telegram Bot & Mini App | **CACAT KRITIS** | `AUD-GAP-001` (S1): Bot membuat tombol tautan inline ke `/tg/approvals/:id?reject=1` dan `/tg/payments` yang mengembalikan HTTP 404 Not Found. |
| **A11** | Pengingat & Scheduled Jobs | **LULUS** | 6 job pg-boss berjalan dengan zona waktu `Asia/Jakarta`, retry backoff eksponensial 5x, dan idempoten. |
| **A12** | Berkas & Unggahan Storage | **LULUS** | Sharp WebP kompresi, strip metadata EXIF, isolasi path `/data/uploads/:businessId/:kind/:filename`, sanitasi traversal. |
| **A13** | UI Responsif & PWA Offline | **LULUS** | Antarmuka adaptif 360 px, fallback offline cache IndexedDB/PWA `/offline`. |
| **A14** | Performa & Query Database | **CACAT DITEMUKAN** | `AUD-PERF-001` (S3): Pola N+1 query pada antrean `GET /api/v1/payments` (151 query untuk 50 pembayaran). |
| **A15** | Pengujian & Operasional | **CACAT TINGGI** | `AUD-OPS-001` (S2): 34 kerentanan dependensi produksi (`pnpm audit --prod` exit 1). `AUD-TEST-003` (S2): `tests/e2e` kosong. `AUD-OPS-002`: DB tes port 5433 tidak aktif. |
| **A16** | Skenario Bisnis & Gap | **LULUS** | Mendukung fleksibilitas PPN aktif/nonaktif, DP wajib/opsional, ongkir aktual, dan penomoran sequential kalender WIB. |
| **A17** | Verifikasi Independen Harga Paten & Katalog | **LULUS BERSYARAT** | DTO 11 kunci, evaluasi `effectiveFloor`, deteksi stale, dan batas transaksi atomik 300 item terbukti lulus. Catatan: API `/price-list` belum dihubungkan ke UI (`AUD-GAP-002`). |

---

## 3. Detail Verifikasi Khusus Area A17 (Harga Paten & Katalog)

1. **Trigger Database `catalogitem_same_business_trg`**:
   - DDL fungsi dan trigger telah terverifikasi di berkas migrasi `prisma/migrations/20261110000003_catalog_same_business_guard/migration.sql`.
   - Teruji di PGlite (`tests/integration/catalog-isolation.test.ts`): menolak penyisipan produk Usaha B ke dalam Katalog Usaha A dengan kode error PostgreSQL `23514` (`catalogitem_cross_business`).
   - *Catatan Kritis*: Trigger ini hanya aktif bila migrasi resmi dijalankan (`prisma migrate deploy`), dan akan hilang bila server start via `prisma db push` (`AUD-SPEC-006`).
2. **DTO 11 Kunci `priceListItemDto`**:
   - Teruji di `tests/integration/price-list.test.ts`.
   - Mengembalikan 11 kunci resmi secara ketat: `productId`, `sku`, `name`, `unit`, `basePrice`, `minPrice`, `customerFloorPrice`, `effectiveFloor`, `initialPrice`, `stockQty`, `stockStatus`.
   - Evaluasi `effectiveFloor = max(minPrice, customerFloorPrice)` berfungsi akurat.
3. **Pembuatan Katalog dari Produk (`from-products`) & Batas 300 Item**:
   - Transaksi database atomik memverifikasi batas maksimal 300 item produk aktif per usaha (`CATALOG_ITEM_LIMIT`).
4. **Deteksi Status Stale & Sinkronisasi**:
   - Jika harga dasar atau harga minimal master produk berubah, katalog yang memuatnya terdeteksi `stale = true` dan mengunci pencetakan PDF resmi (HTTP 422 `CATALOG_STALE`).
   - Eksekusi `POST /api/v1/catalogs/:id/sync` memutakhirkan harga item ke harga minimal terbaru dan menyisipkan produk baru yang belum ada di katalog.

---

*Laporan Fase 4 selesai disusun dan disimpan ke `docs/audit/LAPORAN-08-audit-mendalam-area.md`.*

