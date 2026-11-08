# ADR 0004: Integrasi Antrean Pekerjaan pg-boss v12 dan Bot Telegram grammY

## Konteks

Sistem OmniCat membutuhkan:
1. Satu bot Telegram terpadu untuk pengiriman notifikasi, ringkasan harian, dan tombol persetujuan cepat (Seksi 12 Dokumen Spesifikasi).
2. Sistem antrean pekerjaan latar belakang yang persisten, idempoten, dan berjalan di proses terpisah (`worker`) dengan basis data PostgreSQL (Seksi 13 Dokumen Spesifikasi).

Pada versi `pg-boss` v12:
- Konstruktor `PgBoss` diimpor sebagai named export `{ PgBoss } from 'pg-boss'`.
- Metode `boss.createQueue(name, options)` disediakan untuk mengonfigurasi batas percobaan ulang (`retryLimit`) dan penundaan bertahap (`retryBackoff`).
- Metode `boss.work(name, options, handler)` menerima parameter opsi (seperti `{ batchSize: 1 }`) dan handler bertipe `(jobs: Job<T>[]) => Promise<any>`.
- Mode bot Telegram menggunakan framework modern `grammY` dalam mode webhook (`webhookCallback(bot, 'std/http')`) untuk memproses pembaruan dari Telegram secara instan di bawah 5 detik.

## Keputusan

1. **Paket Dependencies**:
   - Menggunakan `grammy` (^1.46.0) sebagai pustaka bot Telegram resmi.
   - Menggunakan `pg-boss` (^12.38.1) untuk antrean pekerjaan latar belakang.
2. **Arsitektur Pemisahan Web dan Worker**:
   - Web application Next.js memproses permintaan HTTP, menghasilkan notifikasi di dalam transaksi database melalui `createNotification(tx, input)`, lalu mengantrekan pekerjaan `telegram.send` setelah transaksi berhasil di-commit (tanpa memblokir respons HTTP).
   - Layanan worker dijalankan sebagai proses terpisah via `pnpm worker` (`src/worker/index.ts`) menggunakan skema PostgreSQL `pgboss`.
3. **Keamanan Webhook Telegram**:
   - Endpoint webhook `POST /api/telegram/webhook` memverifikasi header `x-telegram-bot-api-secret-token` terhadap nilai rahasia `env.TELEGRAM_WEBHOOK_SECRET` dan menolak status 401 Unauthorized bila tidak cocok sebelum grammY memproses update apa pun.
4. **Ketahanan Gagal dan Anti-Duplikasi**:
   - Setiap baris notifikasi memiliki `dedupeKey` unik yang menjamin tidak ada notifikasi ganda walaupun job dieksekusi berulang kali.
   - Pengiriman Telegram menangani kode kesalahan 403 (pengguna memblokir bot) dengan menandai `User.telegramBlocked = true`, serta menangani rate limiting 429 dengan melempar ulang kesalahan agar `pg-boss` melakukan retry dengan backoff.

## Alternatif yang Ditolak

1. **BullMQ / Redis**: Memerlukan infrastruktur server Redis tambahan yang menambah beban operasional dan biaya pada deployment mandiri Coolify.
2. **Kirim Telegram Langsung di dalam Transaksi Database**: Sangat berisiko karena latensi jaringan Telegram dapat memperpanjang durasi kunci database pesanan (*locking contention*), bahkan menggagalkan transaksi bisnis utama jika Telegram mengalami gangguan jaringan.

## Konsekuensi

- Lingkungan pengujian Vitest dapat menguji logika bot, perintah `/start`, `/me`, `/today`, dan pemanggilan webhook tanpa memerlukan instance PostgreSQL worker atau token bot langsung (menggunakan mock handler).
- Pada lingkungan produksi, proses worker dijalankan berdampingan sebagai container/service kedua di Coolify.

