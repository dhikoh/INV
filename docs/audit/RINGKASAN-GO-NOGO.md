# RINGKASAN EKSEKUTIF AUDIT KESIAPAN PELUNCURAN OMNICAT

# KEPUTUSAN: ⛔ NO-GO (TIDAK LAYAK LUNCUR)
**Tanggal Evaluasi**: 10 November 2026  
**Auditor**: Tim Audit Independen QA & Software Engineering  
**Aplikasi**: OmniCat (Sistem Order, CRM & Invoice Multi-Usaha — Commit `7c8778d`)

---

## 1. Pernyataan Keputusan Resmi

Berdasarkan audit independen menyeluruh pada kode sumber, arsitektur database, antarmuka pengguna, dan alur integrasi bisnis, diputuskan dengan tegas: **NO-GO (TIDAK BOLEH DILUNCURKAN KE PRODUKSI HARI INI)**.

Aplikasi OmniCat memiliki fondasi logika bisnis yang sangat baik (aturan pemisahan data harga Sales, penghitungan komisi, dan pencegahan kebocoran margin telah teruji rapi). Namun, **terdapat 6 masalah fatal (3 Kritis & 3 Tinggi)** pada mekanisme keamanan, peluncuran server, dan penagihan uang yang akan merugikan bisnis dan reputasi perusahaan bila dipaksakan beroperasi sekarang.

---

## 2. Lima Risiko Terbesar Bila Dipaksakan Jalan Hari Ini

1. **Pengambilalihan Akun Super Admin & Kebocoran Sistem (Keamanan Kritis)**  
   Setiap kali server aplikasi dinyalakan ulang (restart), sistem otomatis mereset kata sandi Super Admin kembali ke kata sandi bawaan pabrik (`bismillahbento`) dan mencatat kata sandi tersebut secara terang-terangan di log server. Siapa pun yang mengetahui celah ini dapat masuk sebagai pemilik tertinggi dan mengambil alih seluruh data usaha.
2. **Kekacauan Tagihan Pelanggan & Potensi Kerugian Finansial (Uang Hilang/Sengketa)**  
   Pada pesanan yang mengalami retur barang dengan Nota Kredit (pemotongan tagihan), sistem penagihan akhir salah menghitung sisa tagihan. Sistem mengabaikan nilai kredit retur sehingga pelanggan ditagih lebih mahal dari yang seharusnya (*overbilling*). Hal ini memicu sengketa pembayaran dengan pelanggan setia dan ketidakcocokan buku kas.
3. **Persetujuan Faktur via Telegram Rusak Total (Operasional Macet)**  
   Pimpinan dan pemilik usaha tidak dapat menyetujui atau menolak faktur mendesak dari ponsel. Tombol persetujuan yang dikirim bot Telegram ke aplikasi Mini App mengarah ke tautan mati (Halaman Tidak Ditemukan / 404). Akibatnya, pesanan tertahan di status menunggu persetujuan dan tidak bisa masuk jalur produksi.
4. **Data Keuangan Tidak Terlindungi di Tingkat Database (Integritas Data Hilang)**  
   Proses penyalaan server diatur melewati migrasi database resmi (`db push`). Akibatnya, seluruh aturan pengaman data di tingkat database (larangan harga minus, pelindung pencatatan audit keuangan yang tidak boleh diubah/dihapus, dan pemisahan katalog antarcabang) tidak terpasang di database produksi.
5. **Aplikasi Rentan Lumpuh & Disusupi (Celah Keamanan Server)**  
   Ditemukan 34 celah keamanan pada paket dependensi sistem, termasuk 3 celah eksekusi kode jarak jauh (*Remote Code Execution*) pada komponen Next.js. Server rentan dimatikan paksa atau disusupi pihak luar melalui jaringan publik.

---

## 3. Tindakan yang Wajib Dilakukan Pemilik Sendiri

Auditor dan tim teknis tidak memiliki wewenang untuk mengambil keputusan berikut; pemilik bisnis wajib menyediakannya:
1. **Menentukan Kata Sandi Super Admin Produksi**: Buat kata sandi baru yang kuat (minimal 12 karakter acak kombinasi huruf, angka, dan simbol) untuk dimasukkan ke variabel lingkungan server (`SEED_SUPERADMIN_PASSWORD`). Jangan gunakan kata sandi demo.
2. **Membuat & Mendaftarkan Akun Bot Telegram Resmi**: Buat bot baru via `@BotFather` di Telegram, pasang username bot resmi, catat token rahasianya ke pengaturan server, dan daftarkan ID Telegram pimpinan yang berhak menerima notifikasi persetujuan uang.
3. **Menyetujui Kebijakan Retur & Penyesuaian Faktur**: Menyetujui formula pemotongan faktur akhir: apakah nilai Nota Kredit retur langsung memotong sisa tagihan pelunasan atau disimpan sebagai saldo deposit pelanggan untuk pesanan berikutnya.
4. **Memberikan Izin Pengerjaan Perbaikan (Fase 8)**: Menyetujui alokasi waktu dan pengerjaan perbaikan kode (terutama 6 blocker utama) sebelum dilakukan uji peluncuran ulang.

---

## 4. Urutan Perbaikan yang Disarankan (Fase 8)

Perbaikan dikelompokkan berdasarkan akar masalah untuk efisiensi kerja:

| No | Paket Perbaikan (Akar Masalah) | Temuan yang Dituntaskan | Estimasi Usaha | Dampak Langsung |
|---|---|---|---|---|
| **1** | **Fondasi Deployment & Integritas Skema** | `AUD-SPEC-006` (S1) | **Sedang (M)** | Ganti `db push` dengan `prisma migrate deploy` di `docker-entrypoint.sh`. Pisahkan tugas migrasi agar hanya dijalankan sekali oleh kontainer web. Seluruh trigger dan batasan data keuangan terpasang aman. |
| **2** | **Keamanan Kredensial & Sanitasi Seed** | `AUD-SEC-001` (S1) | **Kecil (S)** | Hapus password hardcoded fallback di `prisma/seed.ts`. Cegah overwrite akun admin jika sudah ada di database. Hapus pencatatan kata sandi terbuka di log pino. |
| **3** | **Perbaikan Alur Telegram Mini App** | `AUD-GAP-001` (S1) | **Sedang (M)** | Bangun halaman rute `/tg/approvals/[id]/page.tsx` dan tangani tombol tolak (`?reject=1`) di Next.js App Router agar pimpinan bisa memproses faktur dari HP. |
| **4** | **Koreksi Formula Faktur Pelunasan & Retur** | `AUD-INT-001` (S2) | **Kecil (S)** | Perbaiki fungsi `requestFinalOrder` di `src/lib/services/order.ts` agar memperhitungkan `order.creditTotal`. Pelanggan ditagih dengan angka yang benar dan adil. |
| **5** | **Perbaikan Query Multi-Tenancy Bank** | `AUD-TENANT-001` (S2) | **Kecil (S)** | Tambahkan klausa `businessId` pada query `findFirst` di `bank-accounts/[id]/route.ts` agar tidak memicu error server 500 saat diakses Sales. |
| **6** | **Pembaruan Paket Keamanan (Patch Next.js)** | `AUD-OPS-001` (S2) | **Sedang (M)** | Perbarui versi Next.js dan dependensi rentan melalui `pnpm update` untuk menutup 3 celah kritis RCE dan kerentanan lainnya. |
| **7** | **Pembersihan Jalur Ganda & Penyempurnaan UI** | `AUD-DUP-001`, `AUD-DUP-002`, `AUD-GAP-002`, `AUD-GAP-003`, `AUD-PERF-001` (S3) | **Sedang (M)** | Konsolidasi endpoint pembayaran ganda, integrasikan tabel daftar harga resmi ke UI Sales, dan optimasi query pembayaran (N+1). |

---

## 5. Pertanyaan Kritis untuk Pemilik Bisnis

Sebelum perbaikan dimulai, mohon konfirmasi untuk 4 hal berikut:
1. **Aturan Nota Kredit**: Bila pelanggan memesan barang Rp 1.000.000 (DP Rp 300.000), lalu retur Rp 200.000 sebelum lunas, apakah sisa tagihan akhir otomatis menjadi Rp 500.000 (Rp 1.000.000 - 300.000 - 200.000)?
2. **Persetujuan Faktur Telegram**: Apakah pimpinan ingin menyetujui faktur lewat tombol langsung di pesan obrolan Telegram (*inline callback*), atau melalui tampilan web Mini App yang menampilkan rincian barang sebelum disetujui?
3. **Akses Rekening Bank untuk Sales**: Apakah staf Sales diizinkan melihat nomor rekening pembayaran milik kantor cabang lain, atau harus dibatasi hanya untuk kantor cabang tempat mereka terdaftar?
4. **Jadwal Peluncuran Baru**: Setelah 6 masalah utama di atas kami perbaiki dan kami uji ulang sampai lulus 100%, kapan target peluncuran resmi yang diharapkan?

