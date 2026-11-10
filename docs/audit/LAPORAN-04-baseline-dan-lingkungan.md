# LAPORAN-04: Fase 0 — Baseline dan Lingkungan

Dokumen audit resmi independen untuk aplikasi OmniCat (repo `dhikoh-inv`) hasil pelaksanaan Fase 0: Verifikasi Baseline, Lingkungan Eksekusi, dan Validasi Hipotesis Awal.

---

## 1. Identitas Audit

- **Tanggal Pelaksanaan**: 2026-11-10
- **Commit Git Terakhir**: `7c8778d1a19402ab571407b202bfd60aa27beb52`
- **Branch**: `main` (status: `working tree clean`, up to date with origin/main)
- **Jumlah Berkas Terlacak**: 383 berkas (`git ls-files | wc -l`)
- **Lingkungan Eksekusi**:
  - OS: Windows 11
  - Node.js: `v22.17.0` (sesuai `.nvmrc` dan `package.json engines`)
  - pnpm: `12.18.0` (sesuai spesifikasi stack)
  - TypeScript: `5.7.3`
  - Next.js: `15.3.9`
  - Vitest: `3.0.5`
  - Playwright: `1.50.1`
  - Docker CLI/Daemon: **Tidak terdeteksi pada host** (`docker : The term 'docker' is not recognized`)
  - Database Daemon Lokal: PostgreSQL port 5432 & 5433 tidak aktif (`ECONNREFUSED` / no daemon)
  - Engine Database Pengujian: `@electric-sql/pglite v0.5.15` (in-memory WASM Postgres) & Vitest in-memory mocks

---

## 2. Ringkasan Progres Status Temuan (Matriks Kategori x Keparahan)

| Kategori | S1 Kritis | S2 Tinggi | S3 Sedang | S4 Rendah | S5 Info | Total Aktif |
|---|---|---|---|---|---|---|
| **OPS** (Operasional & Infra) | - | 1 (`AUD-OPS-001`) | 1 (`AUD-OPS-002`) | - | - | 2 |
| **TEST** (Pengujian & QA) | - | 1 (`AUD-TEST-003`) | - | - | - | 1 |
| **SPEC** (Spesifikasi & Aturan) | 1 (`AUD-SPEC-006`) | - | - | - | - | 1 |
| **SEC** (Keamanan & Kredensial) | 1 (`AUD-SEC-001`) | - | - | - | - | 1 |
| **GAP** (Fitur / Route Hilang) | 1 (`AUD-GAP-001`) | - | - | - | - | 1 |
| **DUP** (Duplikasi Endpoint/Logika) | - | - | 1 (`AUD-DUP-001`) | - | - | 1 |
| **TENANT** (Isolasi & Guard) | - | 1 (`AUD-TENANT-001`) | - | - | - | 1 |
| **PERF** (Performa & N+1) | - | - | 1 (`AUD-PERF-001`) | - | - | 1 |
| **DOC** (Dokumentasi & Desinkronisasi) | - | - | - | 1 (`AUD-DOC-002`) | - | 1 |
| **TOTAL AKTIF BARU / TERBUKA** | **3** | **3** | **3** | **1** | **0** | **10** |

---

## 3. Hasil Pengujian Gerbang Kualitas (Quality Gates Baseline)

| Perintah | Hasil | Durasi | Keterangan & Bukti |
|---|---|---|---|
| `pnpm install --frozen-lockfile` | **LULUS** | 0.33 s | Node_modules sinkron penuh dengan pnpm-lock.yaml. |
| `pnpm lint` | **LULUS** | 9.12 s | Next.js ESLint berjalan tanpa error dan tanpa warning. |
| `pnpm typecheck` | **LULUS** | 6.72 s | TypeScript Strict (`tsc --noEmit`) 0 error. |
| `pnpm test:unit` | **LULUS** | 7.17 s | 34 test files lulus (179/179 tests). |
| `pnpm test:int` | **LULUS** (via PGlite/mock) | 20.96 s | 38 test files lulus (468/468 tests). **Catatan**: Uji berjalan menggunakan `@electric-sql/pglite` dan Vitest `vi.mock`, bukan PostgreSQL port 5433 sungguhan. |
| `pnpm test:coverage` | **LULUS** | 30.60 s | 72 test files (647 tests). Domain statements coverage: **98.01%** (`receivable.ts` 97.72%). Hanya mencakup `domain/` dan `format/`. |
| `pnpm build` | **LULUS** | 39.5 s | Next.js 15.3.9 standalone build sukses menghasilkan 81 routes statis & dinamis. |
| `pnpm audit --prod` | **GAGAL** (Exit 1) | 1.8 s | **34 kerentanan** (2 low, 17 moderate, 12 high, **3 critical** termasuk RCE pada Next.js 15.3.9). |
| `pnpm test:e2e` | **GAGAL** (Exit 1) | 1.6 s | `Error: No tests found`. Direktori `tests/e2e` kosong tanpa berkas tes. |

---

## 4. Verifikasi Hipotesis Awal (H1 s/d H8)

### H1. Entrypoint Docker memakai `prisma db push`, bukan migrasi
- **Status Bukti**: **Terbukti** (ID: `AUD-SPEC-006`, Keparahan: **S1 Kritis**)
- **Lokasi**: `docker-entrypoint.sh:6-10`, `Dockerfile:82`, `prisma/migrations/20261107000002_db_constraints/migration.sql`, `prisma/migrations/20261110000003_catalog_same_business_guard/migration.sql`
- **Temuan**:
  1. `docker-entrypoint.sh` baris 7 mengeksekusi `npx prisma db push --schema=prisma/schema.prisma --skip-generate || echo ...`. `prisma db push` **hanya** membaca skema deklaratif Prisma dan **sama sekali tidak mengeksekusi migrasi kustom SQL** di folder `prisma/migrations/`.
  2. Akibatnya, pada deployment baru:
     - 8 CHECK constraints integritas database (`product_min_le_base`, `product_money_nonneg`, `product_reserved_nonneg`, `order_money_nonneg`, `order_dp_range`, `orderitem_qty_pos`, `payment_amount_pos`, `invoice_amount_nonneg`) **hilang**.
     - 2 indeks unik bersyarat (`invoice_one_active_per_type`, `reminder_one_per_target`) **hilang**.
     - Trigger PL/pgSQL append-only immutable `audit_log_no_change` **hilang** (AuditLog bisa diubah/dihapus secara bebas di database).
     - Trigger PL/pgSQL isolasi katalog lintas usaha `catalogitem_same_business_trg` **hilang** (CatalogItem produk usaha lain bisa disisipkan tanpa error 23514).
  3. Kegagalan `db push` ditelan mentah-mentah dengan `|| echo`, sehingga kontainer tetap berjalan meski sinkronisasi database gagal.
  4. Kontainer `web` dan `worker` dibangun dari image Docker yang sama (`ENTRYPOINT ["./docker-entrypoint.sh"]`). Bila dijalankan bersamaan pada startup, kedua proses akan balapan (*race condition*) menjalankan `db push` dan `seed.ts` pada saat yang sama.

### H2. Kredensial Default Seed Super Admin & Eksekusi Data Demo
- **Status Bukti**: **Terbukti** (ID: `AUD-SEC-001`, Keparahan: **S1 Kritis**)
- **Lokasi**: `prisma/seed.ts:27-28, 37-43, 47, 52-62, 67, 72-150, 964-967`
- **Temuan**:
  1. `prisma/seed.ts` memiliki fallback hardcoded username `superadmin` dan password `bismillahbento` jika env `SEED_SUPERADMIN_*` kosong.
  2. Menyimpan `mustChangePassword: false` (melanggar BLUEPRINT.md Seksi 9.1 yang mewajibkan `mustChangePassword = true` dan password min 12 karakter).
  3. Baris 37-43: Bila Super Admin sudah ada, seed **menimpa (*overwrite*) password Super Admin kembali ke hash `bismillahbento`** dan mereset `mustChangePassword: false`. Karena `docker-entrypoint.sh` memanggil `tsx prisma/seed.ts` pada setiap kontainer start, setiap kali service restart password pemilik akan direset paksa ke default!
  4. Baris 47 & 67 mencatat password default secara telanjang (*plain text*) ke log aplikasi:
     `{"level":30,"msg":"Super Admin diperbarui dengan password bismillahbento."}`
  5. Baris 72-962: `runAllSeed()` memuat seluruh data demo operasional BentoCat: unit usaha, rekening bank BCA nyata (0901422817 a.n. DHIKO HERLAMBANG), sales Dinia (password `bismillahbento`), kategori, vendor, master produk, transaksi order demo, faktur, dan pembayaran. Jalur produksi terancam tercemar data demo saat start awal.

### H3. Halaman Hilang dan Tautan Mati
- **Status Bukti**: **Terbukti Sebagian** (ID: `AUD-GAP-001`, Keparahan: **S1 Kritis / S2 Tinggi**)
- **Lokasi**: `src/lib/services/notification.ts:125,127`, `docs/BLUEPRINT.md:376`, `CHANGELOG.md:304`
- **Temuan**:
  1. Halaman `/products`, `/vendors`, `/settings/business`, `/orders/[id]`, `/customers/[id]`, `/vendors/[id]` **ada** di filesystem dan sukses di-build oleh Next.js (`next build`). Dugaan awal file hilang pada ekspor repositori terbantahkan.
  2. Namun, rute Mini App Telegram `/tg/approvals/[id]` yang ditautkan oleh bot Telegram pada `src/lib/services/notification.ts`:
     - Baris 125: `.url('Tolak', `${env.APP_URL}/tg/approvals/${invoiceId}?reject=1`)`
     - Baris 127: `.url('Buka', `${env.APP_URL}/tg/approvals/${invoiceId}`)`
     **TIDAK ADA di Next.js App Router** (hanya ada `/approvals/[invoiceId]` untuk antarmuka web desktop dan `/tg` untuk beranda TMA).
  3. Akibatnya, saat Super Admin menekan tombol "Tolak" atau "Buka" dari Telegram, server mengembalikan **HTTP 404 Not Found**, memutus alur penolakan faktur via Telegram Mini App.

### H4. Endpoint dan Jalur Ganda
- **Status Bukti**: **Terbukti** (ID: `AUD-DUP-001`, Keparahan: **S3 Sedang**)
- **Lokasi**:
  - `src/app/api/v1/commission/entries/[id]/pay/route.ts` vs `src/app/api/v1/commissions/[id]/pay/route.ts`: Handler identik 100%, keduanya memanggil `payCommissionEntry`.
  - `src/app/api/v1/payments/route.ts` vs `src/app/api/v1/orders/[id]/payments/route.ts`: Keduanya menduplikasi kode penguraian multipart form data, validasi field uang/metode, dan penyimpanan bukti transfer secara terpisah.
  - `src/app/api/v1/business` vs `src/app/api/v1/businesses/[id]`: Berbeda tujuan (`/business` untuk info dasar sesi navbar, `/businesses/[id]` untuk CRUD konfigurasi admin).
  - `src/app/api/v1/bank-accounts/[id]` vs `src/app/api/v1/businesses/[id]/bank-accounts`: Berbeda level REST (sub-resource koleksi vs resource item tunggal). Namun, `bank-accounts/[id]` ditemukan memiliki cacat pemanggilan Prisma tanpa `businessId` (lihat `AUD-TENANT-001`).

### H5. Pola N+1 Query Database
- **Status Bukti**: **Terbukti** (ID: `AUD-PERF-001`, Keparahan: **S3 Sedang**)
- **Lokasi**: `src/app/api/v1/payments/route.ts:42-67`
- **Temuan**:
  Pada `GET /api/v1/payments`, setelah mengambil daftar `pendingPayments`, dilakukan perulangan `for (const p of pendingPayments)` yang masing-masing memanggil:
  - `prisma.order.findUnique({ where: { id: p.orderId } })`
  - `prisma.customer.findUnique({ where: { id: order.customerId } })`
  - `prisma.user.findUnique({ where: { id: order.salesId } })`
  Jika terdapat 50 pembayaran pending, handler ini mengeksekusi 151 query database terpisah, alih-alih menggunakan relasi `include` Prisma (`include: { order: { include: { customer: true, sales: true } } }`).

### H6. Gerbang Kualitas Belum Hijau
- **Status Bukti**: **Terbukti** (ID: `AUD-OPS-001`, `AUD-TEST-003`, `AUD-OPS-002`)
- **Temuan**:
  - `pnpm audit --prod` gagal dengan 34 kerentanan (3 critical RCE pada Next.js).
  - `pnpm test:e2e` gagal karena `tests/e2e` tidak berisi berkas tes.
  - Integrasi database berjalan di atas PGlite dan vi.mock, belum pernah teruji di PostgreSQL port 5433 sungguhan.
  - Tidak ada konfigurasi CI (`.github/workflows` tidak ada di repositori).

### H7. Dokumen Tidak Sinkron dengan Kode
- **Status Bukti**: **Terbukti** (ID: `AUD-DOC-002`, Keparahan: **S4 Rendah**)
- **Temuan**:
  1. `BLUEPRINT.md` mencantumkan versi dependensi dikunci persis tanpa rentang versi (`^`), namun `package.json` menggunakan `^` untuk `exceljs`, `grammy`, `pg-boss`, dan `puppeteer-core`.
  2. `BLUEPRINT.md` baris 447 menyebut 68 test files Vitest, sedangkan aktualnya terdapat 72 test files.
  3. `BLUEPRINT.md` baris 455-460 dan 480 menggunakan URL lokal non-portabel `file:///D:/Data%20BentoCat/...`.
  4. Penamaan produk tidak konsisten antara OmniCat (nama resmi), BentoCat (nama usaha default & prefix backup `db_bentocat_*`), dan dhikoh-inv (nama repo git).

### H8. Pembuktian Operasional
- **Status Bukti**: **Terbukti Sebagian** (ID: `AUD-OPS-002`)
- **Temuan**:
  - `tests/integration/backup-restore.test.ts` hanya memeriksa keberadaan file script via `fs.existsSync` dan menguji logika allocator `DocumentCounter` di PGlite. Tidak ada pengujian nyata eksekusi `pg_dump` dan `pg_restore`.
  - Docker daemon tidak aktif di host lokal pengujian.

---

## 5. Rincian Temuan Baru (Fase 0)

### AUD-SPEC-006: Entrypoint Docker Memakai `prisma db push` dan Menghilangkan Trigger/Constraint Database
- **Lokasi**: `docker-entrypoint.sh:7`, `Dockerfile:82-83`, `prisma/migrations/*`
- **Rujukan**: BLUEPRINT.md Seksi 9.1 & Seksi 18.1; ADR 0003 & ADR 0006
- **Dampak Bisnis**: Pada instalasi baru di server produksi, database berjalan tanpa proteksi integritas finansial (CHECK constraints uang/harga), tanpa trigger imutabilitas log audit (AuditLog bisa dimanipulasi), dan tanpa trigger isolasi katalog multi-usaha (kebocoran produk lintas tenant). Selain itu, start kontainer `web` dan `worker` secara bersamaan memicu race condition.
- **Yang Diharapkan**:
  1. Entrypoint menjalankan `pnpm prisma migrate deploy` sehingga seluruh DDL kustom di `prisma/migrations/` dieksekusi resmi.
  2. Kegagalan migrasi harus menghentikan kontainer (`set -e`, tanpa `|| echo`).
  3. Service `worker` tidak boleh menjalankan migrasi dan seeding bersamaan dengan service `web` (hanya `web` sebagai pre-deploy command atau mekanisme migrasi terisolasi).
- **Yang Terjadi**: `docker-entrypoint.sh` memanggil `npx prisma db push --schema=prisma/schema.prisma --skip-generate || echo ...`. `db push` mengabaikan folder migrasi SQL kustom dan menelan error.
- **Bukti**:
  ```sh
  # docker-entrypoint.sh:7
  npx prisma db push --schema=prisma/schema.prisma --skip-generate || echo "[OmniCat] Note: prisma db push skipped or connection issue"
  ```
- **Langkah Reproduksi**:
  1. Periksa isi `docker-entrypoint.sh`.
  2. Bandingkan DDL pada `prisma/migrations/20261107000002_db_constraints/migration.sql` dan `20261110000003_catalog_same_business_guard/migration.sql` dengan `prisma/schema.prisma`.
  3. Konfirmasi bahwa CHECK constraints dan CREATE TRIGGER tidak ada di `schema.prisma`.
- **Saran Perbaikan**:
  Ganti `npx prisma db push ...` dengan `pnpm prisma migrate deploy` di `docker-entrypoint.sh` (atau jadikan pre-deployment command terpisah di Coolify) dan hapus penelan error `|| echo`. Pisahkan entrypoint worker agar tidak menjalankan migrasi dan seed ulang.
- **Tes yang Seharusnya Menangkapnya**: Uji integrasi deployment kontainer Docker pada database kosong.

---

### AUD-SEC-001: Kredensial Default Hardcoded, Insecure Seed Overwrite, dan Plaintext Password Logging
- **Lokasi**: `prisma/seed.ts:27-28, 37-43, 47, 67, 964-967`
- **Rujukan**: BLUEPRINT.md Seksi 9.1 & Seksi 18.1 no. 37; OWASP ASVS V2 Authentication
- **Dampak Bisnis**: Penyerang dapat login ke sistem dengan username `superadmin` dan password `bismillahbento`. Setiap kali kontainer di-restart, password Super Admin akan ditimpa kembali ke default, mengunci pemilik atau membuka celah pengambilalihan sistem. Password tercetak telanjang di log kontainer.
- **Yang Diharapkan**:
  1. `SEED_SUPERADMIN_PASSWORD` wajib disediakan dari environment dengan panjang minimal 12 karakter; jika tidak disetel, proses seed harus ditolak (*fail-fast*).
  2. Tidak boleh ada fallback hardcoded password di kode sumber.
  3. Jika Super Admin sudah ada, skrip seed harus menolak berjalan atau melewatinya tanpa mengubah password pengguna yang sudah ada.
  4. Akun yang baru dibuat wajib memiliki `mustChangePassword: true`.
  5. Password tidak boleh dicetak ke log aplikasi.
  6. Data demo tidak boleh dijalankan di environment produksi.
- **Yang Terjadi**: Fallback `superadmin` / `bismillahbento` aktif, `mustChangePassword: false`, akun yang ada di-update paksa kembali ke password default, password dicetak ke pino logger, dan seluruh data demo BentoCat otomatis di-seed.
- **Bukti**:
  ```ts
  // prisma/seed.ts:27-28
  const username = options?.username ?? process.env.SEED_SUPERADMIN_USERNAME ?? 'superadmin';
  const password = options?.password ?? process.env.SEED_SUPERADMIN_PASSWORD ?? 'bismillahbento';
  ...
  // prisma/seed.ts:42, 60
  mustChangePassword: false,
  ...
  // prisma/seed.ts:47
  logger.info({ userId: updated.id, username: updated.username }, 'Super Admin diperbarui dengan password bismillahbento.');
  ```
- **Langkah Reproduksi**:
  1. Jalankan `pnpm test:unit tests/unit/seed.test.ts`.
  2. Perhatikan log output: `Super Admin berhasil dibuat (password: bismillahbento)`.
  3. Periksa `prisma/seed.ts` baris 27-67.
- **Saran Perbaikan**:
  Hapus string default password dari kode sumber. Validasi `process.env.SEED_SUPERADMIN_PASSWORD` >= 12 karakter. Jika Super Admin sudah ada, keluar dengan peringatan dan jangan pernah lakukan `prisma.user.update` pada password. Set `mustChangePassword: true`. Hapus teks password dari pesan logger. Pisahkan `seedSuperAdmin` dengan `seedBentoCatData` menggunakan flag env (misal `SEED_DEMO_DATA=true`).
- **Tes yang Seharusnya Menangkapnya**: Uji unit seed yang memverifikasi penolakan eksekusi tanpa env dan perlindungan idempotensi akun yang sudah ada.

---

### AUD-GAP-001: Rute Mini App Telegram `/tg/approvals/[id]` Tidak Ditemukan (404 Not Found)
- **Lokasi**: `src/lib/services/notification.ts:125,127`, `docs/BLUEPRINT.md:376`
- **Rujukan**: BLUEPRINT.md Seksi 7 (UI Routes) & Seksi 8.1; CHANGELOG.md baris 304
- **Dampak Bisnis**: Tombol "Tolak" dan "Buka" pada pesan Telegram notifikasi persetujuan invoice menghasilkan halaman 404 Not Found saat diklik oleh Super Admin. Alur penolakan faktur berbobot revisi via Telegram Mini App putus total.
- **Yang Diharapkan**: Rute antarmuka pengguna `/tg/approvals/[id]` tersedia di Next.js App Router (`src/app/tg/approvals/[id]/page.tsx` atau `src/app/(app)/approvals/[invoiceId]/page.tsx` dengan dukungan redirect/query param `?reject=1`).
- **Yang Terjadi**: Direktori `src/app/tg/approvals` tidak ada di Next.js App Router.
- **Bukti**:
  - `git ls-files src/app/tg/` hanya menghasilkan `src/app/tg/page.tsx`.
  - `next build` rute `/tg/approvals` tidak terdaftar dalam output build.
  - `src/lib/services/notification.ts:125` memanggil `.url('Tolak', `${env.APP_URL}/tg/approvals/${invoiceId}?reject=1`)`.
- **Langkah Reproduksi**:
  1. Jalankan `git grep "tg/approvals"`.
  2. Buka URL `http://localhost:3000/tg/approvals/inv_123` -> Mengembalikan 404 Not Found.
- **Saran Perbaikan**:
  Buat halaman Mini App `src/app/tg/approvals/[id]/page.tsx` atau sesuaikan URL bot Telegram di `notification.ts` untuk mengarahkan ke rute `/approvals/${invoiceId}` dengan penanganan token sesi/autologin Telegram.
- **Tes yang Seharusnya Menangkapnya**: Crawler rute antarmuka (M3) dan pengujian E2E integrasi alur persetujuan Telegram.

---

### AUD-TENANT-001: Query `findFirst` pada Model Terlindungi `BankAccount` Tanpa `businessId`
- **Lokasi**: `src/app/api/v1/bank-accounts/[id]/route.ts:37, 65, 129`, `src/lib/db.ts:6-36`
- **Rujukan**: BLUEPRINT.md Seksi 3 & Seksi 4; ADR 0003
- **Dampak Bisnis**: Pemanggilan `GET /api/v1/bank-accounts/:id`, `PATCH /api/v1/bank-accounts/:id`, dan `DELETE /api/v1/bank-accounts/:id` akan melempar unhandled error `Query BankAccount.findFirst tanpa businessId` di runtime production karena dicegat oleh Prisma Client Multi-Tenant Extension. Pengaturan rekening bank crash 500.
- **Yang Diharapkan**: Seluruh query `findFirst` pada `BankAccount` wajib menyertakan `businessId: ctx.businessId` dalam klausa `where`.
- **Yang Terjadi**: `where` hanya berisi `{ id, deletedAt: null }` tanpa `businessId`.
- **Bukti**:
  ```ts
  // src/app/api/v1/bank-accounts/[id]/route.ts:37
  const account = await prisma.bankAccount.findFirst({
    where: {
      id,
      deletedAt: null,
    },
  });
  ```
- **Langkah Reproduksi**:
  Jalankan pemanggilan `prisma.bankAccount.findFirst({ where: { id: 'acc_1' } })` menggunakan instance Prisma resmi dari `src/lib/db.ts` -> Error: `Query BankAccount.findFirst tanpa businessId`.
- **Saran Perbaikan**:
  Tambahkan `businessId: requireBusiness(ctx)` ke klausa `where` pada ketiga handler di `src/app/api/v1/bank-accounts/[id]/route.ts`.
- **Tes yang Seharusnya Menangkapnya**: Uji integrasi route dengan Prisma Client aktif (bukan in-memory array mock).

---

### AUD-DUP-001: Duplikasi Endpoint Pembayaran Komisi
- **Lokasi**: `src/app/api/v1/commission/entries/[id]/pay/route.ts` dan `src/app/api/v1/commissions/[id]/pay/route.ts`
- **Rujukan**: Dokumen Aturan Main 1.3 (Tanpa duplikasi: satu endpoint per aksi)
- **Dampak Bisnis**: Ambiguitas pemeliharaan API; pembaruan logika pada satu rute berisiko tertinggal di rute lainnya.
- **Yang Diharapkan**: Satu endpoint kanonik untuk pembayaran komisi (misalnya `POST /api/v1/commission/entries/:id/pay`).
- **Yang Terjadi**: Kedua rute aktif secara paralel dengan implementasi identik.
- **Bukti**: Kedua berkas memanggil `payCommissionEntry(tx, ctx, entryId, body.note)` dengan skema `CommissionPaySchema` dan hak akses `SUPERADMIN`.
- **Saran Perbaikan**: Tentukan satu rute kanonik, deprecate rute sekunder atau lakukan redirect.

---

### AUD-PERF-001: Pola N+1 Query pada Antrean Pembayaran `GET /api/v1/payments`
- **Lokasi**: `src/app/api/v1/payments/route.ts:42-67`
- **Rujukan**: Dokumen Aturan Main Area A14 (Performa: N+1)
- **Dampak Bisnis**: Latensi tinggi dan beban CPU database berlebih saat antrean pembayaran menumpuk.
- **Yang Diharapkan**: Query tunggal menggunakan relasi Prisma (`include`).
- **Yang Terjadi**: Loop `for` mengeksekusi 3 query per entri pembayaran.
- **Bukti**: Loop `for (const p of pendingPayments)` memanggil `findUnique` untuk `Order`, `Customer`, dan `User` secara berurutan.
- **Saran Perbaikan**:
  Ganti dengan:
  ```ts
  const pendingPayments = await prisma.payment.findMany({
    where: { businessId, status: PaymentStatus.PENDING_VERIFICATION },
    include: {
      order: {
        select: {
          orderNo: true,
          customer: { select: { name: true } },
          sales: { select: { name: true } },
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  });
  ```

---

### AUD-DOC-002: Desinkronisasi Dokumentasi dan Spesifikasi Sistem
- **Lokasi**: `docs/BLUEPRINT.md:47-68, 447, 455-460, 480`, `package.json:33,34,38,40`
- **Rujukan**: Dokumen Aturan Main Area H7
- **Dampak Bisnis**: Kebingungan pengembang dan risiko build tidak deterministik akibat rentang versi. Tautan lokal tidak dapat dibuka di lingkungan lain.
- **Yang Diharapkan**: Dokumentasi selaras 100% dengan kode sumber dan portabel.
- **Yang Terjadi**: Terdapat tanda `^` pada dependensi, jumlah file tes di dokumen (68) tidak cocok dengan realitas (72), dan tautan ADR menggunakan path absolut `file:///D:/Data%20BentoCat/...`.
- **Saran Perbaikan**: Kunci versi di `package.json`, perbarui jumlah file tes di `BLUEPRINT.md`, dan ubah tautan ADR menjadi tautan markdown relatif (`docs/adr/0001-...`).

---

## 6. Area yang Lulus pada Fase 0

1. **Kerapian Format & Linter Kode**: `pnpm lint` lulus 100% tanpa warning/error.
2. **Kesesuaian Tipe Data Statis**: `pnpm typecheck` lulus 100% dengan TypeScript Strict mode.
3. **Logika Domain Murni**: Seluruh 11 file domain murni di `src/lib/domain/` lulus tes unit Vitest dengan cakupan statement 98.01%.
4. **Standalone Web Build**: Next.js App Router berhasil mengompilasi dan mengoptimasi 81 routes statis dan dinamis.
5. **Kesesuaian Versi Runtime Inti**: Node.js `22.17.0`, pnpm `12.18.0`, Next.js `15.3.9`, React `19.0.0`, Prisma `7.10.1`, Vitest `3.0.5`, Playwright `1.50.1` sesuai deklarasi stack.

---

## 7. Hal yang Tidak Dapat Diperiksa pada Fase 0

1. **PostgreSQL 16 Sungguhan pada Port 5433 (Dev/Test Container)**:
   - *Alasan*: Docker CLI / daemon tidak terpasang di host audit Windows saat ini (`docker : The term 'docker' is not recognized`).
   - *Kebutuhan*: Instalasi Docker Desktop / Podman di host lokal, atau penyediaan akses SSH ke instance staging/Coolify.
2. **Pengujian Build Image Docker & Multi-Stage Runner**:
   - *Alasan*: Ketiadaan Docker daemon di host.
   - *Kebutuhan*: Lingkungan ber-Docker untuk memverifikasi eksekusi entrypoint pada container sesungguhnya.
3. **Uji Fungsional Bot Telegram Nyata & PWA pada Ponsel Fisik**:
   - *Alasan*: Sesuai aturan main, auditor dilarang mengakses token bot Telegram sungguhan atau nomor telepon nyata.
   - *Kebutuhan*: Pengujian manual verifikasi oleh pemilik (*owner testing*) menggunakan bot pengujian privat dan perangkat ponsel fisik.

---

## 8. Pertanyaan untuk Pemilik (Owner Queries)

1. **Rute Telegram Mini App untuk Tolak Invoice**:
   - Bot Telegram saat ini mengirim tautan `/tg/approvals/:id?reject=1` yang mengembalikan HTTP 404 Not Found.
   - *Pilihan A (Rekomendasi)*: Buat rute antarmuka khusus Mini App di `src/app/tg/approvals/[id]/page.tsx` yang dioptimasi untuk layar ponsel Telegram Mini App dengan autologin `initData`.
   - *Pilihan B*: Arahkan tautan bot Telegram ke rute web desktop `/approvals/:id?reject=1`.
2. **Penghapusan Endpoint Duplikat Komisi**:
   - Terdapat rute identik `POST /api/v1/commission/entries/:id/pay` dan `POST /api/v1/commissions/:id/pay`.
   - *Rekomendasi*: Tetapkan `POST /api/v1/commission/entries/:id/pay` sebagai kanon (karena konsisten dengan `GET /api/v1/commission/entries`), dan berikan respons deprecation / alias untuk `POST /api/v1/commissions/:id/pay`.
3. **Kredensial dan Data Demo Seed**:
   - Apakah sistem produksi mengizinkan adanya data demo BentoCat dan sales Dinia, ataukah database produksi harus benar-benar bersih hanya dengan Super Admin pemilik?
   - *Rekomendasi*: Pisahkan skrip seed menjadi dua: `seed:admin` (hanya membuat Super Admin dari env `SEED_SUPERADMIN_PASSWORD` >= 12 karakter dan `mustChangePassword: true`), serta `seed:demo` (opsional untuk lingkungan dev/staging).

---

*Laporan Fase 0 selesai disusun dan disimpan ke `docs/audit/LAPORAN-04-baseline-dan-lingkungan.md`.*

