# Panduan Pindah Server OmniCat (Migrasi Data Portabel)

Dokumen ini memandu proses pemindahan sistem OmniCat antar-server menggunakan fitur Ekspor & Impor Data Portabel (ZIP JSON + Uploads) sesuai ADR 0008.

---

## Langkah demi Langkah Pemindahan Server

### 1. Di Server Lama: Ekspor Seluruh Sistem
1. Masuk ke halaman **Pengaturan Usaha** (`/settings/business`) sebagai Super Admin, lalu klik tombol **Ekspor Seluruh Sistem (ZIP)**.
2. Sebagai cadangan independen terpisah, Anda juga disarankan menjalankan skrip cadangan bawaan di server lama:
   ```bash
   bash scripts/backup.sh
   ```
3. Simpan berkas unduhan `omnicat-export-system-all-<TIMESTAMP>.zip` di lokasi yang aman.

---

### 2. Di Server Baru: Siapkan Lingkungan Bersih
1. Lakukan deployment aplikasi OmniCat pada server baru dengan **versi aplikasi (`package.json`) dan commit yang sama**.
2. Pasang environment variables pada server baru (`.env`) yang selaras dengan server lama:
   - `APP_URL`: URL domain server baru (mis. `https://modula.click`).
   - `DATABASE_URL`: URL PostgreSQL server baru.
   - `APP_SECRET`: Nilai kunci rahasia aplikasi.
   - `RUN_SEED=false`: **Wajib disetel `false`** saat awal instalasi agar database target tetap bersih sebelum diimpor.
3. Jalankan migrasi resmi database pada server baru:
   ```bash
   pnpm prisma migrate deploy
   ```

---

### 3. Salin Berkas ZIP ke Server Baru
Salin berkas ZIP ekspor ke server baru menggunakan `scp`, `rsync`, atau pengelola berkas Coolify/VPS:
```bash
scp omnicat-export-system-all-20261110-120000.zip root@server-baru:/tmp/
```

> **Catatan Reverse Proxy:** Jika server Anda berada di balik Nginx eksternal, pastikan konfigurasi `client_max_body_size` disetel minimal `200M` (`client_max_body_size 200M;`) agar selaras dengan nilai `TRANSFER_MAX_MB=200`.

---

### 4. Eksekusi Simulasi (Dry-Run)
Jalankan simulasi pemeriksaan terlebih dahulu untuk memverifikasi kompatibilitas skema, integritas checksum SHA-256, dan urutan counter dokumen tanpa mengubah database:
```bash
# Melalui terminal container (Coolify / Docker):
docker exec -it <container_name> pnpm tsx scripts/import-json.ts /tmp/omnicat-export-system-all-20261110-120000.zip --dry-run
```
Pastikan keluaran menampilkan:
```text
HASIL IMPOR: ✅ SIMULASI LULUS (DRY-RUN)
```

---

### 5. Eksekusi Impor Sungguhan
Setelah simulasi sukses, jalankan impor data nyata:
```bash
docker exec -it <container_name> pnpm tsx scripts/import-json.ts /tmp/omnicat-export-system-all-20261110-120000.zip
```
*(Ketik **`IMPOR`** saat diminta konfirmasi interaktif, atau tambahkan flag `--yes` jika dijalankan non-interaktif).*

Jika di database target sudah sempat dibuat akun Super Admin bawaan seed, sertakan opsi:
```bash
--ganti-superadmin-seed
```

---

### 6. Pasca-Impor & Verifikasi Operasional
1. **Login Kembali**: Buka `https://<domain-baru>/login`. Seluruh sesi lama sengaja dihanguskan demi keamanan; silakan login dengan akun Super Admin atau Sales dari server lama.
2. **Koneksi Ulang Telegram Bot**:
   Jalankan skrip pendaftaran webhook bot Telegram di server baru:
   ```bash
   pnpm tsx scripts/setup-telegram-webhook.ts
   ```
   *Catatan Reminder:* Karena tabel notifikasi sementara tidak diekspor, pada hari pertama pengingat repeat order yang sudah lewat jatuh tempo akan mengirim notifikasi eskalasi 1 kali pada hari tersebut.
3. **Verifikasi Integritas Data**:
   - Periksa halaman produk: pastikan gambar produk muncul dengan benar.
   - Periksa halaman detail unit usaha: pastikan logo usaha tampil.
   - Buat pesanan uji coba untuk memastikan nomor pesanan berikutnya melanjutkan urutan transaksi terakhir tanpa bentrok.

---

## Panduan Pemecahan Masalah (Troubleshooting)

### A. Bila Impor Berkas Gagal Sebagian
Jika transaksi database telah sukses tetapi sebagian pemindahan berkas fisik uploads terganggu, gunakan opsi pemulihan berkas tanpa menyentuh database:
```bash
pnpm tsx scripts/import-json.ts /tmp/omnicat-export-system-all-20261110-120000.zip --pulihkan-berkas
```

### B. Bila Ukuran ZIP Terlalu Besar (> TRANSFER_MAX_MB)
Jika data operasional unit usaha Anda sangat besar hingga melebihi batas 200 MB:
1. Lakukan ekspor database saja tanpa berkas upload dengan mencentang opsi "tanpa upload" di UI atau memanggil endpoint `GET /api/v1/data-transfer/export?tanpaBerkas=1`.
2. Salin folder fisik `/data/uploads` secara terpisah menggunakan utilitas sinkronisasi direktori seperti `rsync`:
   ```bash
   rsync -avz /data/uploads/ root@server-baru:/data/uploads/
   ```
3. Alternatif lain: gunakan jalur cadangan penuh PostgreSQL native `scripts/backup.sh` dan `scripts/restore.sh`.

---

### C. Menjalankan Build Standalone Lokal & Trigger Migrasi
- **Windows Local Standalone Runtime:** Gunakan `pnpm build:clean` dan `pnpm start:standalone`. Skrip `scripts/prepare-standalone.js` (otomatis dipanggil via `postbuild`) menyinkronkan `.next/static` + `public`, mengubah symlink broken di Windows menjadi junction, dan menautkan biner `@img/sharp-*` agar proses gambar tidak mengalami error `500`.
- **Ketentuan Trigger Database:** Pastikan instalasi maupun pembaruan skema selalu menggunakan `pnpm prisma migrate deploy` agar trigger `audit_log_no_change` dan `catalogitem_same_business_trg` tetap aktif di PostgreSQL target.


