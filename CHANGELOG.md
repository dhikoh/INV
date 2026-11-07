# Changelog

Semua perubahan penting pada proyek ini dicatat di dokumen ini.
Format ini berbasis pada [Keep a Changelog](https://keepachangelog.com/id/1.0.0/)
dan proyek ini mengikuti [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
