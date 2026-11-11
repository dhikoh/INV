# ADR 0008: Ekspor & Impor Data Portabel (JSON dalam ZIP)

## Status
Diterima (Accepted) — 2026-11-10

## Konteks
Pemilik bisnis OmniCat memerlukan kemampuan memindahkan satu unit usaha atau seluruh sistem antar-server secara mandiri dan portabel melalui antarmuka web maupun CLI. Sebelumnya, pemindahan data hanya bertumpu pada `scripts/backup.sh` dan `scripts/restore.sh` yang menggunakan utilitas PostgreSQL native (`pg_dump`/`pg_restore`). Mekanisme tersebut memerlukan akses root/superuser database dan tidak dapat memindahkan satu unit usaha secara terisolasi tanpa menyertakan usaha lain.

## Keputusan Arsitektur

1. **Format Berkas Arsip Tunggal (ZIP via fflate)**:
   - Menggunakan library JavaScript murni `fflate` tanpa native build dependency.
   - Struktur ZIP memuat `manifest.json`, data tabel per model dalam format `data/<NamaModel>.ndjson`, dan seluruh berkas fisik di `uploads/<businessId>/<kind>/<filename>`.
   - Manifest dan berkas data dikompres dengan level 6, sedangkan berkas gambar dan PDF upload disimpan dengan `{ level: 0 }` karena secara inheren sudah terkompresi.

2. **Serialisasi Lossless (BigInt, Date, & Json)**:
   - Nilai `BigInt` dan instance `Date` diberi penanda khusus `{ $t: 'bigint', v: '...' }` dan `{ $t: 'date', v: '...' }` agar dapat dipulihkan secara identik ke tipe data asli pada database target tanpa distorsi presisi.
   - Objek JSON biasa (seperti invoice snapshot) dipertahankan apa adanya. Objek bertanda diverifikasi tepat memiliki 2 kunci (`$t` dan `v`) guna mencegah salah konversi.

3. **Konsistensi Snapshot Transaksi (RepeatableRead)**:
   - Seluruh 36 tabel dibaca dalam satu transaksi database tunggal berisolasi `RepeatableRead` dengan batas timeout 5 menit.
   - Paging kursor `id: 'asc'` 1.000 baris mencegah luapan memori (OOM) pada tabel riwayat besar.

4. **Integritas & Keamanan Ketat**:
   - Proteksi **Zip-Bomb**: Validasi ukuran total berkas hasil ekstraksi maksimal 5x `TRANSFER_MAX_MB`.
   - Proteksi **Zip-Slip**: Penolakan entri yang mengandung `..`, `\`, atau diawali `/`.
   - **Checksum SHA-256**: Setiap berkas data dan upload dicocokkan dengan hash di `manifest.json`.
   - **Magic Bytes Validation**: Seluruh berkas upload diverifikasi byte awalnya (`detectMimeFromBytes`) untuk mencegah injeksi file executable / web shell.

5. **Simulasi Penuh Dry-Run**:
   - Fitur "Periksa Dulu" menjalankan simulasi transaksi database secara penuh (termasuk validasi schema, FK, CHECK constraint, trigger database, dan keunikan counter dokumen), lalu melempar sentinel khusus untuk membatalkan (*rollback*) transaksi secara bersih tanpa mengubah data atau menulis berkas fisik.

6. **Verifikasi Nomor Dokumen (DocumentCounter)**:
   - Transaksi impor memverifikasi bahwa `lastSeq` pada tabel `DocumentCounter` untuk jenis `ORDER_SEQ`, `PO_SEQ`, dan `CREDIT_NOTE_SEQ` lebih besar atau sama dengan nilai urutan maksimum transaksi yang ada di berkas. Jika counter absen atau lebih kecil, transaksi otomatis di-rollback untuk mencegah tabrakan nomor faktur berikutnya.

7. **Data yang TIDAK Diekspor**:
   - `Session`, `LoginAttempt`, `TelegramLinkCode`, `Notification`, dan `_prisma_migrations`.
   - *Konsekuensi*: Seluruh pengguna harus login ulang setelah pemindahan server, dan kode tautan Telegram sementara harus dibuat ulang.

8. **Pengambilan Gambar dari URL Eksternal (Fase 5) & Egress Internet**:
   - Server produksi memerlukan akses keluar (egress) ke internet (port 443) untuk mengambil gambar logo atau foto produk dari URL eksternal yang diinput pengguna.
   - Gambar yang diunduh langsung disimpan secara lokal di storage `fileService` (format WebP) dan tautan URL asal sengaja **TIDAK disimpan di database** guna menghindari modifikasi skema `prisma/schema.prisma` dan mencegah hotlinking.
   - Mitigasi SSRF komprehensif:
     - Protokol wajib HTTPS murni (port 443 tanpa kredensial).
     - Pemblokiran IP privat, loopback, link-local, cloud metadata (`169.254.169.254`), CGNAT, multicast, ULA, dan IPv4-mapped/encapsulated IPv6 via `isForbiddenIp`.
     - Validasi IP pada saat koneksi TLS via opsi `lookup` kustom guna mencegah serangan DNS Rebinding.
     - Pembatasan streaming berkas maksimal 5 MB dan timeout 10 detik.
     - Maksimal 3 kali redirect dengan validasi ulang di tiap hop.
     - Validasi magic bytes ketat: hanya format JPEG, PNG, dan WebP (menolak format non-gambar dan PDF).

9. **Kepatuhan Isolasi Tenant pada Pemeriksaan Impor & Penayangan Saat Database Kosong**:
   - Seluruh query verifikasi tabrakan ID lintas model (`Customer`, `Order`, `Product`, `Invoice`), nomor surat jalan global (`Shipment`), dan counter penomoran atomik (`DocumentCounter`) menyertakan filter `businessId: { not: '' }` agar mematuhi aturan ekstensi database multi-tenant Prisma (`TENANT_MODELS`).
   - Penanganan error pada rute `POST /api/v1/data-transfer/import` dibungkus secara terstruktur (*graceful error handling*) sehingga kegagalan validasi mengembalikan kode status 422 dengan pesan rincian yang ramah di antarmuka alih-alih crash 500.
   - Komponen UI `DataTransferCard` ditampilkan secara permanen pada kondisi database kosong (*Empty State*) di `/settings/business` agar Super Admin dapat langsung memulihkan unit usaha dari berkas ZIP portabel pada instalasi baru tanpa perlu membuat unit usaha manual terlebih dahulu.

## Keterbatasan & Batas Desain
- Pengolahan arsip ZIP dilakukan di memori (in-memory buffer). Konfigurasi `TRANSFER_MAX_MB=200` menetapkan batas maksimal ukuran berkas ZIP demi menjaga stabilitas server.
- Server memerlukan konektivitas egress port 443 ke internet untuk fitur pengambilan gambar dari URL. Jika lingkungan produksi berada di jaringan terisolasi (air-gapped), pengguna tetap dapat mengunggah berkas gambar secara manual via form berkas lokal biasa.
- Untuk basis data berskala sangat masif (> puluhan gigabyte), pemindahan server tetap disarankan menggunakan jalur utama PostgreSQL native `scripts/backup.sh` dan `scripts/restore.sh`.

