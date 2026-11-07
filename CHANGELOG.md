# Changelog

Semua perubahan penting pada proyek ini dicatat di dokumen ini.
Format ini berbasis pada [Keep a Changelog](https://keepachangelog.com/id/1.0.0/)
dan proyek ini mengikuti [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Skrip seed Super Admin produksi pada `prisma/seed.ts` membaca `SEED_SUPERADMIN_USERNAME` dan `SEED_SUPERADMIN_PASSWORD` (minimal 12 karakter), menolak eksekusi bila Super Admin sudah ada, dan menyetel `mustChangePassword = true` (T1.2).
- Antarmuka halaman login pada `src/app/(auth)/login/page.tsx` dengan target sentuh responsif (>= 44 px), input teks >= 16 px, indikator loading, dan pesan bantuan pemilik usaha (T1.2).
- Komponen kerangka aplikasi `AppShell` pada `src/components/AppShell.tsx` dengan sidebar desktop & drawer mobile untuk Super Admin, bar navigasi bawah untuk Sales (Beranda, Order, Customer, Pengingat, Lainnya), dan banner pengingat ganti password (T1.2).
- Tiga komponen status wajib `Skeleton`, `EmptyState`, dan `ErrorState` pada `src/components/ui/States.tsx` (T1.2).
- Endpoint dan antarmuka pengalih usaha Super Admin `POST /api/v1/session/business`, ringkasan usaha aktif `GET /api/v1/business`, dan daftar usaha `GET /api/v1/businesses` (T1.2).
- Halaman dashboard awal pada `src/app/(app)/dashboard/page.tsx` dan halaman profil pengguna dengan formulir ganti password pada `src/app/(app)/profile/page.tsx` (T1.2).
- Integrasi Tailwind CSS v3, PostCSS, dan ikon antarmuka `lucide-react` (T1.2).
- Autentikasi inti dengan password hashing argon2id (parameter OWASP: memoryCost 19456, timeCost 2, parallelism 1) pada `src/lib/auth/password.ts` (T1.1).
- Manajemen sesi berbasis token acak 32-byte (SHA-256 tersimpan di database), rotasi maksimal 5 sesi aktif, dan sliding expiration 7 hari pada `src/lib/auth/session.ts` (T1.1).
- Pembatasan percobaan login (rate limiting) 5 kali per username atau 20 kali per IP dalam 15 menit pada `src/lib/auth/rateLimit.ts` (T1.1).
- Proteksi CSRF same-origin untuk seluruh metode HTTP non-GET pada `src/lib/auth/origin.ts` (T1.1).
- Ekstraksi konteks sesi dan otorisasi role terpusat dengan pemblokiran `mustChangePassword` pada `src/lib/auth/context.ts` (T1.1).
- Wrapper API standar `withApi` dengan parsing schema Zod strict, serialisasi BigInt/Date, dan pemetaan error otomatis pada `src/lib/api/withApi.ts` (T1.1).
- Route Handler autentikasi: `POST /api/v1/auth/login`, `POST /api/v1/auth/logout`, `GET /api/v1/auth/me`, dan `POST /api/v1/auth/change-password` (T1.1).
- Rewrite URL perutean `/auth/:path*` menuju `/api/v1/auth/:path*` pada `next.config.ts` (T1.1).
- Suite pengujian unit dan integrasi (Tes 17.3 nomor 17) mencakup seluruh skenario kegagalan dan keberhasilan autentikasi (T1.1).

### Security

- Mitigasi serangan timing attack melalui verifikasi hash dummy saat username tidak ditemukan (T1.1).
- Penegakan atribut cookie sesi aman: `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`, `Max-Age=604800` (T1.1).
- Penyeragaman pesan kegagalan login selalu "Username atau password salah" (T1.1).

## [0.1.0] - 2026-11-07

### Added

- Inisialisasi struktur repositori dan konfigurasi proyek Next.js App Router dengan TypeScript strict (T0.1).
- Konfigurasi runtime Node.js v22 LTS pada `.nvmrc` dan `package.json` engines (T0.1).
- Manajemen dependensi terkunci persis menggunakan `pnpm` (T0.1).
- Konfigurasi linter ESLint (flat config) dan pemformat kode Prettier (T0.1).
- Pengaturan test runner Vitest untuk unit test dan Playwright untuk e2e test (T0.1).
- Dokumen hidup `docs/BLUEPRINT.md` mencakup 12 bab arsitektur utama (T0.1).
- Dokumen keputusan arsitektur awal `docs/adr/0001-uang-bigint.md` dan `docs/adr/0002-stack.md` (T0.1).
- Dokumen pelacak pertanyaan terbuka `docs/OPEN_QUESTIONS.md` (T0.1).
- Struktur direktori aplikasi sesuai bagian 3.2 panduan spesifikasi (T0.1).
- Validasi variabel environment berbasis Zod pada `src/lib/env.ts` (T0.2).
- Logger terstruktur Pino dengan sensor/redaction otomatis field sensitif (cookie, password, token, APP_SECRET, initData) pada `src/lib/logger.ts` (T0.2).
- Endpoint publik pemantauan status `GET /api/health` mengembalikan { ok, db, version } (T0.2).
- Konfigurasi database development dan testing PostgreSQL pada `docker-compose.dev.yml` (T0.2).
- Dockerfile multi-stage production dengan headless Chromium dan font terpasang untuk PDF rendering (T0.2).
- Template variabel environment lengkap `.env.example` (T0.2).
- Skema database lengkap 40 model dan 24 enum pada `prisma/schema.prisma` (T0.3).
- Migrasi database awal `20261107000001_init` dan SQL constraints `20261107000002_db_constraints` (T0.3).
- Jaring pengaman multi-tenant `src/lib/db.ts` dengan extension `TENANT_MODELS` dan `GUARDED_OPS` (T0.3).
- Integrasi `@prisma/adapter-pg` dan konfigurasi `prisma.config.ts` untuk Prisma 7 (T0.3).
- Tes integrasi database dengan `@electric-sql/pglite` membuktikan check constraint `product_min_le_base` dan trigger `audit_log_immutable` (T0.3).
- Dokumen keputusan arsitektur `docs/adr/0003-prisma-7-config.md` (T0.3).
- Implementasi fungsi murni logika keuangan di `src/lib/domain/` (money, pricing, order, profit, credit, commission, numbering, reminder, terbilang) dan `src/lib/format/parse.ts` (T0.4).
- Suite pengujian unit komprehensif mencakup 100% fungsi domain keuangan (T0.4).
- Verifikasi otomatis Fixture 7.7 contoh hitungan bisnis presisi angka demi angka (T0.4).
- Konfigurasi `globalSetup.ts` dengan proteksi pengaman URL database tes wajib berakhiran `_test` (T0.5).
- Utilitas isolasi database pengujian `tests/helpers/resetDb.ts` (T0.5).
- Generator entitas pengujian terstandar `tests/factories.ts` (T0.5).
- Detektor kebocoran field rahasia Sales `tests/helpers/leak.ts` dengan fungsi rekursif `assertNoSecretKeys` (T0.5).
- Perintah terpisah `test:unit` dan `test:int` pada `package.json` (T0.5).
