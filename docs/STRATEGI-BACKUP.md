# Panduan Strategi Backup & Disaster Recovery OmniCat

Dokumen ini merupakan panduan resmi arsitektur dan operasional pencadangan (backup) otomatis serta pemulihan bencana (*disaster recovery*) untuk aplikasi OmniCat di lingkungan produksi Coolify.

---

## 1. Dua Pilar Strategi Backup

OmniCat mengadopsi model backup dua lapis:

| Lapisan | Jenis | Frekuensi | Ruang Lingkup | Mekanisme |
|---|---|---|---|---|
| **Pilar 1 (Pondasi)** | Full Database Dump & Uploads | Harian (Otomatis) | Seluruh Database + Berkas `/data/uploads` | PostgreSQL native `pg_dump` via `scripts/backup.sh` & Coolify Automated Backups |
| **Pilar 2 (Portabel)** | Arsip JSON dalam ZIP (ADR 0008) | Berkala / Sebelum Pemindahan | Satu Usaha atau Seluruh Sistem | Antarmuka Pengaturan Usaha / CLI `scripts/import-json.ts` |

---

## 2. Panduan Setup Backup Otomatis di Coolify

### Metode A: Pencadangan Terjadwal Bawaan Coolify pada Database (`Omni-DB`) — *Sangat Direkomendasikan*

Coolify menyediakan mekanisme backup otomatis native untuk container PostgreSQL dengan retensi dan upload ke cloud storage S3/R2.

1. Buka dashboard **Coolify** Anda di browser (`http://76.13.23.78:8000`).
2. Masuk ke project **Omnicat** → environment **production**.
3. Pilih database **Omni-DB**.
4. Di bilah menu sebelah kiri, pilih tab **Backups**.
5. Konfigurasikan opsi pencadangan:
   - **Enabled**: Aktifkan (toggle hijau).
   - **Frequency (Cron Expression)**: `0 19 * * *` *(Pukul 19:00 UTC = 02:00 WIB setiap malam saat trafik rendah)*.
   - **Retention**: `30` hari (backup lebih dari 30 hari otomatis dibersihkan).
   - **S3 Storage (Opsional namun Disarankan)**: Hubungkan ke bucket AWS S3, Cloudflare R2, atau MinIO eksternal agar backup tetap aman meskipun VPS utama mengalami kerusakan perangkat keras.
6. Klik **Save**. Coolify akan mengeksekusi dump otomatis setiap malam.

---

### Metode B: Scheduled Task pada Container Aplikasi (`Omni-web`)

Skrip [`scripts/backup.sh`](file:///d:/Data%20BentoCat/scripts/backup.sh) telah disiapkan di dalam repositori untuk mem-backup database sekaligus mengompresi folder fisik `/data/uploads`.

1. Di dashboard Coolify, buka container aplikasi **Omni-web**.
2. Di bilah menu sebelah kiri, pilih tab **Scheduled Tasks**.
3. Klik **+ Add New Task** dan isi parameter berikut:
   - **Name**: `Daily Backup Script`
   - **Frequency (Cron Expression)**: `30 19 * * *` *(Pukul 02:30 WIB)*
   - **Command**:
     ```bash
     bash /app/scripts/backup.sh
     ```
4. Pastikan variabel lingkungan `DATABASE_URL` tersedia di container.
5. Klik **Save**. Hasil backup biner `.dump` dan `.tar.gz` akan disimpan di direktori `/data/backups/`.

---

## 3. Konfigurasi Kritis: Persistent Storage Volume untuk Berkas Upload

Agar berkas upload (logo toko, foto produk, dan bukti pembayaran) tidak hilang saat container di-redeploy:

1. Di dashboard Coolify, buka aplikasi **Omni-web**.
2. Pilih tab **Persistent Storage**.
3. Tambahkan volume persistent baru:
   - **Destination Path**: `/data/uploads`
   - **Name / Source Volume**: `omni-uploads-data`
4. Untuk folder backup, tambahkan juga volume kedua:
   - **Destination Path**: `/data/backups`
   - **Name / Source Volume**: `omni-backups-data`
5. Klik **Save** dan lakukan Redeploy satu kali agar volume terpasang secara permanen pada host Docker.

---

## 4. Runbook Pemulihan Bencana (Disaster Recovery)

Bila terjadi kerusakan server, korupsi data, atau insiden operasional, ikuti prosedur berikut:

### Skenario 1: Pemulihan Penuh dari Dump Database (`scripts/restore.sh`)
1. Pastikan container database PostgreSQL dalam keadaan menyala.
2. Siapkan berkas backup terbaru dari folder `/data/backups/db_bentocat_<timestamp>.dump`.
3. Jalankan skrip pemulihan:
   ```bash
   export DATABASE_URL="postgresql://user:pass@host:5432/dbname"
   bash scripts/restore.sh /data/backups/db_bentocat_<timestamp>.dump
   ```
4. Ekstrak kembali berkas fisik uploads:
   ```bash
   tar -xzf /data/backups/uploads_bentocat_<timestamp>.tar.gz -C /data/
   ```
5. Restart aplikasi `Omni-web`.

### Skenario 2: Pemulihan Menggunakan Arsip Portabel ZIP (ADR 0008)
Bila ingin memulihkan satu unit usaha tertentu atau migrasi ke server baru yang bersih:
1. Pastikan migrasi skema database telah dijalankan (`pnpm prisma migrate deploy`).
2. Jalankan simulasi pemeriksaan (*dry-run*):
   ```bash
   pnpm tsx scripts/import-json.ts omnicat-export-<...>.zip --dry-run
   ```
3. Bila dry-run melaporkan status sukses (`ok: true`), jalankan impor riil:
   ```bash
   pnpm tsx scripts/import-json.ts omnicat-export-<...>.zip --yes
   ```
4. Periksa counter dokumen faktur berikutnya di UI Pengaturan Usaha untuk memastikan penomoran melanjutkan urutan secara mulus.

---

## 5. Checklist Verifikasi Integritas Backup

Lakukan uji petik (drill) secara berkala (minimal 1 bulan sekali):
- [ ] Ukuran berkas `.dump` wajar (tidak berukuran 0 byte).
- [ ] Backup otomatis berhasil berjalan sesuai jadwal cron tanpa status error di log Coolify.
- [ ] Simulasi `scripts/restore.sh` pada database pengujian (`TEST_DATABASE_URL`) berhasil pulih 100%.
- [ ] Nomor urut faktur (`DocumentCounter`) pasca-restorasi tetap akurat dan tidak melompat mundur.

