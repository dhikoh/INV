# ADR 0005: Migrasi Database via prisma migrate deploy dan Prosedur Baseline Database db push

- **Status**: Disetujui (Accepted)
- **Tanggal**: 2026-11-10
- **Penulis**: Tim Rekayasa & QA OmniCat
- **Rujukan Temuan**: `AUD-SPEC-006` (S1 Kritis)

---

## 1. Konteks & Masalah

Sebelumnya, berkas `docker-entrypoint.sh` mengeksekusi `npx prisma db push ... || echo` dan `tsx prisma/seed.ts || echo` setiap kali kontainer dinyalakan ulang. Praktik ini menimbulkan masalah kritis:

1. **Kehilangan Integritas Database**: Perintah `prisma db push` secara sengaja mengabaikan seluruh berkas SQL migrasi kustom di `prisma/migrations/`. Akibatnya, trigger PostgreSQL (`audit_log_immutable`, `catalogitem_same_business_trg`), 8 batasan integritas harga/uang (CHECK constraints), dan 2 indeks unik parsial tidak pernah terpasang di lingkungan produksi.
2. **Penelanan Kesalahan (*Error Swallowing*)**: Penggunaan operator `|| echo` menyebabkan kontainer tetap berjalan normal meskipun sinkronisasi skema database gagal total karena masalah koneksi atau hak akses.
3. **Kondisi Balapan (*Race Condition*)**: Service `web` dan `worker` yang dijalankan dari satu image Docker yang sama saling berlomba menjalankan `db push` dan `seed.ts` secara simultan saat orkestrasi kontainer dinyalakan.
4. **Penimpaan Kata Sandi Berulang**: Script seed dijalankan pada setiap kali kontainer restart, memicu penimpaan akun Super Admin kembali ke kata sandi bawaan (`AUD-SEC-001`).

---

## 2. Keputusan Desain

1. **Peralihan ke Jalur Migrasi Resmi**:
   Mengganti `prisma db push` dengan perintah resmi produksi:
   ```bash
   npx prisma migrate deploy --schema=prisma/schema.prisma
   ```
2. **Gagal Keras (*Fail Fast*)**:
   Menghapus seluruh klausa `|| echo`. Jika migrasi gagal, proses entrypoint segera keluar dengan kode error non-zero (`set -e`), mencegah aplikasi berjalan di atas skema yang tidak valid.
3. **Isolasi Service Worker**:
   Entrypoint memeriksa apakah proses yang dijalankan adalah worker (`SERVICE_TYPE=worker` atau argumen perintah memuat `worker`). Service worker tidak akan pernah menjalankan migrasi atau seeding.
4. **Seeding Berdasarkan Permintaan (*Opt-In*)**:
   Seeding akun Super Admin awal hanya dijalankan bila variabel lingkungan `RUN_SEED="true"` disetel secara eksplisit, atau melalui eksekusi manual satu kali oleh administrator:
   ```bash
   tsx prisma/seed.ts
   ```

---

## 3. Prosedur Baseline Aman untuk Database yang Dibuat dengan db push

Bagi lingkungan database yang sebelumnya sudah telanjur diinisialisasi menggunakan `prisma db push` (sehingga tabel-tabel sudah ada di PostgreSQL, tetapi tabel riwayat migrasi `_prisma_migrations` belum mencatat migrasi awal), gunakan prosedur aman berikut **tanpa menghapus data yang ada**:

> [!WARNING]
> Jangan menjalankan `prisma migrate deploy` langsung pada database eksis yang dibuat via `db push` tanpa menandai baseline, karena Prisma akan menolak menerapkan migrasi `20261107000001_init` dengan alasan tabel sudah ada.

### Langkah-langkah Prosedur Baseline Aman:
1. **Cadangkan Basis Data Eksis Secara Menyeluruh**:
   ```bash
   pg_dump -h localhost -U app -d app -Fc -f /backup/db_pre_baseline_$(date +%Y%m%d_%H%M%S).dump
   ```
2. **Tandai Migrasi Inisial Sebagai Telah Diterapkan (Baseline)**:
   Catat migrasi pertama ke tabel `_prisma_migrations` tanpa mengeksekusi ulang pembuatan tabelnya:
   ```bash
   npx prisma migrate resolve --applied 20261107000001_init
   ```
3. **Terapkan Migrasi Constraints dan Triggers**:
   Jalankan migrasi berikutnya untuk memasang seluruh CHECK constraints dan triggers kustom:
   ```bash
   npx prisma migrate deploy
   ```
4. **Verifikasi Pemasangan Triggers & Constraints**:
   Periksa di konsol PostgreSQL:
   ```sql
   -- Verifikasi trigger audit log
   SELECT tgname FROM pg_trigger WHERE tgname = 'audit_log_no_change';
   
   -- Verifikasi trigger katalog
   SELECT tgname FROM pg_trigger WHERE tgname = 'catalogitem_same_business_trg';
   
   -- Verifikasi CHECK constraints
   SELECT conname FROM pg_constraint WHERE conname = 'product_min_le_base';
   ```

---

## 4. Konsekuensi

- **Positif**:
  - Integritas finansial dan keamanan immutable audit log terjamin 100% di level mesin PostgreSQL.
  - Tidak ada lagi risiko race condition antara kontainer web dan background worker.
  - Status start-up kontainer deterministik: sukses atau berhenti jika migrasi gagal.
- **Negatif**:
  - Tim pengembang lokal harus menjalankan `pnpm prisma migrate dev` saat menambah perubahan skema baru, bukan sekadar `db push`.
