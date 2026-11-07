# ADR 0002: Pemilihan Teknologi Stack

## Konteks

Aplikasi Sistem Order, CRM, dan Invoice Multi-Usaha membutuhkan antarmuka yang cepat diakses melalui Web Desktop, Web Mobile (PWA), serta Telegram Mini App (TMA). Selain itu, sistem memerlukan backend API yang konsisten, antrean background worker untuk pengingat dan bot Telegram, serta rendering PDF invoice/surat jalan yang presisi.

## Keputusan

1. **Runtime & Package Manager**: Node.js v22 LTS aktif dan `pnpm` dengan penguncian versi persis (tanpa `^` atau `~`).
2. **Framework Web & API**: Next.js App Router dengan TypeScript Strict (`strict: true`). Semua endpoint mutasi dan query bisnis dilayani melalui Route Handlers di `src/app/api/v1` (bukan Server Actions) agar Web, PWA, dan TMA mengonsumsi kontrak API yang seragam.
3. **Database & ORM**: PostgreSQL 16+ dengan multi-tenancy berbasis kolom `businessId` di setiap tabel usaha, dikelola menggunakan Prisma ORM dengan raw SQL ber-tag untuk constraint audit database.
4. **Otentikasi & Sesi**: Sesi berbasis database di tabel `Session` dengan hashing password Argon2id (`argon2`). Cookie sesi `HttpOnly`, `SameSite: Lax`, `Secure`. Tidak menggunakan JWT stateless di cookie.
5. **Worker & Scheduler**: `pg-boss` berjalan sebagai proses worker terpisah di container yang sama untuk background jobs (reminder, webhook retry).
6. **PDF Engine**: `puppeteer-core` menjalankan headless Chromium bawaan container Docker untuk cetak invoice, surat jalan, dan katalog beresolusi tinggi dengan batas maksimal 2 render paralel.
7. **Testing**: Vitest untuk unit dan integrasi database, Playwright untuk end-to-end testing.

## Alternatif yang Ditolak

1. **Backend Python / FastAPI Legacy**: Kurang terpadu dengan UI Next.js dan Telegram Mini App, memerlukan maintenance dua runtime terpisah, dan arsitektur legacy sebelumnya belum audit-ready.
2. **Server Actions Next.js untuk Mutasi**: Tidak dapat dikonsumsi langsung oleh client Telegram Mini App atau integrasi webhook bot eksternal secara bersih.
3. **Redis untuk Antrean**: Menambah ketergantungan infrastruktur terpisah; PostgreSQL + `pg-boss` memanfaatkan database yang sudah ada tanpa menambah biaya server Coolify.

## Konsekuensi

- Route Handlers harus mematuhi pembagian lapisan yang ketat: Handler -> Service -> Domain (rumus murni) -> DB.
- Performa background job bergantung pada throughput PostgreSQL, yang sudah sangat memadai untuk beban 10-50 sales per usaha.
