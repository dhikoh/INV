# ADR 0007: Inisialisasi Aman Akun Super Admin (Seed) dan Prosedur Rotasi Kredensial

- **Status**: Disetujui (Accepted)
- **Tanggal**: 2026-11-10
- **Penulis**: Tim Rekayasa & QA OmniCat
- **Rujukan Temuan**: `AUD-SEC-001` (S1 Kritis) & `BLUEPRINT.md` Bagian 9

---

## 1. Konteks & Masalah

Pada implementasi awal `prisma/seed.ts`, ditemukan sejumlah celah keamanan kritis terkait tata kelola akun administrator dan inisialisasi kredensial awal:

1. **Kata Sandi Bawaan Tertanam (*Hardcoded Secret*)**: Terdapat fallback kata sandi default `bismillahbento` di dalam kode sumber jika variabel lingkungan `SEED_SUPERADMIN_PASSWORD` tidak disediakan.
2. **Pencatatan Kata Sandi Terbuka (*Cleartext Password Logging*)**: Log Pino mencatat kata sandi bawaan secara harfiah ke `stdout` kontainer saat seeding selesai (`'Super Admin berhasil dibuat (password: bismillahbento).'`).
3. **Penimpaan Akun Tanpa Otorisasi (*Destructive Seed Overwrite*)**: Setiap kali `prisma/seed.ts` dijalankan (termasuk saat restart kontainer pada entrypoint lama), script menimpa password hash akun Super Admin yang sudah ada, mengaktifkan kembali akun bila dinonaktifkan, dan menimpa `mustChangePassword: false`, sehingga menghilangkan rotasi password sah yang telah dilakukan oleh pemilik sistem.
4. **Pencemaran Data Demo di Produksi**: Data operasional fiktif BentoCat diinjeksi ke basis data tanpa memfilter lingkungan produksi (`NODE_ENV`).

---

## 2. Keputusan Desain

Mengacu pada spesifikasi resmi `docs/BLUEPRINT.md` Bagian 9, desain inisialisasi akun Super Admin diperbarui dengan kebijakan keamanan ketat:

### 2.1. Penolakan Keras (*Strict Validation*)
- Kata sandi wajib bersumber dari variabel lingkungan `SEED_SUPERADMIN_PASSWORD` (atau opsi terprogram).
- Panjang kata sandi minimal **12 karakter**. Jika tidak disetel atau panjang kurang dari 12 karakter, proses langsung memicu exception dan berhenti (*fail-fast*).
- Fallback kata sandi default di dalam kode sumber dihapus sepenuhnya.

### 2.2. Pencegahan Penimpaan Akun Eksis (*Non-Destructive Guarantee*)
- Jika akun dengan peran `SUPERADMIN` sudah ditemukan di database, proses seed **segera menolak berjalan**:
  ```ts
  throw new Error('Seed ditolak: Akun Super Admin sudah terdaftar di database.');
  ```
- Tidak ada pemanggilan operasi `prisma.user.update()` yang mengubah kata sandi, status aktif, atau flag kredensial pada pengguna yang sudah ada.

### 2.3. Wajib Ganti Kata Sandi Perdana
- Akun Super Admin baru yang dibuat melalui seed diwajibkan memiliki `mustChangePassword: true`.
- Pada saat login pertama kali, sistem mengharuskan pengguna mengganti kata sandi ke kombinasi baru sebelum dapat mengakses dasbor manajerial.

### 2.4. Keamanan Pencatatan (*Zero Password Logging*)
- Segala bentuk pencatatan kata sandi (baik dalam format plain-text maupun hash) ke log stdout/stderr/Pino dilarang keras.
- Pesan log hanya memuat pengidentifikasi non-sensitif: `{ userId, username }`.

### 2.5. Isolasi Data Demo
- Data demo BentoCat (`seedBentoCatData`) hanya akan dieksekusi bila `process.env.NODE_ENV !== 'production'` **DAN** `process.env.SEED_DEMO_DATA === 'true'`.

---

## 3. Prosedur Operasional Rotasi Kredensial & Secrets

Berikut adalah Standar Operasional Prosedur (SOP) untuk rotasi kredensial sistem OmniCat:

### 3.1. Rotasi Kata Sandi Super Admin (Rutin)
1. Super Admin masuk ke antarmuka aplikasi melalui peramban.
2. Buka menu **Profil Pengguna** -> **Ganti Kata Sandi** (`/profile/security` atau alur wajib ubah sandi).
3. Masukkan kata sandi lama, lalu tetapkan kata sandi baru (minimal 12 karakter, kombinasi huruf besar, kecil, angka, dan simbol).
4. Sesi aktif pada perangkat lain akan otomatis diinvalidasi berkat rotasi token sesi.

### 3.2. Prosedur Darurat Pemulihan Akun Super Admin (*Break-Glass / Disaster Recovery*)
Jika akses Super Admin hilang atau terkunci:
1. Akses langsung kontainer atau host produksi berizin terbatas (SSH/bastion).
2. Jalankan script darurat berparameter via CLI administratif:
   ```bash
   npx tsx scripts/admin-reset-password.ts --username superadmin --force-change-flag
   ```
3. Script akan meminta input kata sandi baru melalui secure stdin prompt (tidak melalui argumen perintah riwayat bash), menghash dengan Argon2id, dan menetapkan `mustChangePassword = true`.

### 3.3. Rotasi Rahasia Aplikasi (`APP_SECRET`)
Variabel `APP_SECRET` digunakan untuk menandatangani cookie sesi dan token otentikasi:
1. Siapkan rahasia baru dengan entropi tinggi minimal 32 byte (misal: `openssl rand -hex 32`).
2. Perbarui nilai `APP_SECRET` pada manajemen env server/kontainer.
3. Lakukan restart bertahap (*rolling restart*) pada kontainer web.
4. **Dampak Operasional**: Seluruh sesi pengguna yang sedang aktif akan dibatalkan, dan seluruh pengguna (Super Admin & Sales) akan diarahkan kembali ke layar login untuk melakukan autentikasi ulang.

### 3.4. Rotasi Token Bot Telegram (`TELEGRAM_BOT_TOKEN`)
1. Buka `@BotFather` di Telegram dan minta `/revoke` token bot aktif.
2. Salin token bot baru yang diterbitkan.
3. Perbarui variabel lingkungan `TELEGRAM_BOT_TOKEN` di server.
4. Lakukan restart kontainer `web` dan `worker`.
5. Verifikasi koneksi webhook atau polling bot dengan mengirimkan perintah `/ping` atau melihat log inisialisasi worker.

