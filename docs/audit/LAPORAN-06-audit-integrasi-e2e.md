# LAPORAN-06: Fase 2 — Audit Integrasi End-to-End (E1 s/d E8)

Dokumen audit resmi independen untuk aplikasi OmniCat (repo `dhikoh-inv`) hasil penelusuran 8 alur bisnis utama (*End-to-End Business Workflows*) dari antarmuka pengguna/bot, pemanggilan API, transaksi database, penerbitan PDF, kalkulasi laba/komisi, hingga laporan dan ekspor.

---

## 1. Identitas Audit

- **Tanggal Pelaksanaan**: 2026-11-10
- **Commit Git Terakhir**: `7c8778d1a19402ab571407b202bfd60aa27beb52`
- **Cakupan Pengujian Alur**:
  - E1 Setup awal & Master Data
  - E2 Pengadaan, Vendor & Stok Barang
  - E3 Penjualan Penuh (Happy Path)
  - E4 Jalur Koreksi, Retur & Pembatalan (Negative Path)
  - E5 Katalog, Harga Paten & Mode Offline PWA
  - E6 Integrasi Telegram Bot & Mini App
  - E7 Eksekusi Job Terjadwal (pg-boss Asia/Jakarta)
  - E8 Operasional, Cadangan & Pemulihan (Backup/Restore)

---

## 2. Tabel Kesinambungan Angka (Number Continuity Table - Alur E3)

Penelusuran integritas nominal integer Rupiah dan basis points pada pesanan 2 produk dengan diskon, ongkos kirim, PPN 11%, uang muka DP 30%, surat jalan, pelunasan, biaya ekstra, HPP, laba, komisi, dan laporan:

| Komponen Angka | Nilai Integer (IDR / bps) | Dokumen Order | Faktur DP | Faktur LNS | Pembayaran | Stok Fisik | Laporan Laba / Margin | Ekspor XLSX |
|---|---|---|---|---|---|---|---|---|
| **Subtotal Kotor** | Rp 1.500.000 | Rp 1.500.000 | - | - | - | - | Rp 1.500.000 | Rp 1.500.000 |
| **Diskon Barang** | Rp 50.000 | Rp 50.000 | - | - | - | - | Rp 50.000 | Rp 50.000 |
| **Penjualan Bersih (goodsNet)** | Rp 1.450.000 | Rp 1.450.000 | - | - | - | - | Rp 1.450.000 | Rp 1.450.000 |
| **Ongkir Ditagihkan** | Rp 50.000 | Rp 50.000 | - | - | - | - | Rp 50.000 | Rp 50.000 |
| **DPP (taxBase)** | Rp 1.500.000 | Rp 1.500.000 | - | - | - | - | - | Rp 1.500.000 |
| **PPN 11% (1100 bps)** | Rp 165.000 | Rp 165.000 | - | - | - | - | - | Rp 165.000 |
| **Total Tagihan (grandTotal)** | **Rp 1.665.000** | Rp 1.665.000 | - | - | - | - | - | Rp 1.665.000 |
| **Faktur DP (3000 bps)** | **Rp 499.500** | Rp 499.500 | Rp 499.500 | - | - | Reservasi | - | Rp 499.500 |
| **Pembayaran Masuk DP** | Rp 499.500 | paidTotal: 499.500 | paidAmount: 499.500 | - | Rp 499.500 | Reservasi | - | Rp 499.500 |
| **Surat Jalan (Pengiriman)** | - | Status: SHIPPED | - | - | - | **Potong Fisik** | - | - |
| **Faktur Pelunasan (FINAL)** | **Rp 1.165.500** | - | - | Rp 1.165.500 | - | Terkirim | - | Rp 1.165.500 |
| **Pembayaran Pelunasan** | Rp 1.165.500 | paidTotal: 1.665.000 | - | paidAmount: 1.165.500 | Rp 1.165.500 | - | - | Rp 1.165.500 |
| **Sisa Tagihan (Balance Due)** | **Rp 0 (Lunas)** | Rp 0 | Rp 0 | Rp 0 | Total Rp 1.665.000 | - | - | Rp 0 |
| **Total HPP (COGS)** | Rp 1.000.000 | - | - | - | - | - | Rp 1.000.000 | Rp 1.000.000 (SA only) |
| **Subsidi Ongkir Aktual** | Rp 15.000 | - | - | - | - | - | Rp 15.000 | Rp 15.000 (SA only) |
| **Biaya Ekstra (Packing)** | Rp 10.000 | - | - | - | - | - | Rp 10.000 | Rp 10.000 (SA only) |
| **Laba Bersih (Profit)** | **Rp 425.000** | - | - | - | - | - | **Rp 425.000** | Rp 425.000 (SA only) |
| **Margin Bersih (bps)** | **2931 bps (29.31%)**| - | - | - | - | - | **2931 bps** | 29.31% (SA only) |
| **Komisi Staf Sales (10%)** | **Rp 42.500** | - | - | - | - | - | Rp 42.500 (SA only) | Rp 42.500 (SA only) |

*Kesimpulan Happy Path E3*: Pada alur normal tanpa retur/credit note, seluruh angka konsisten dan bersambung presisi tanpa selisih 1 Rupiah pun antara Order, Faktur DP, Faktur Pelunasan, Bukti Pembayaran, Buku Besar Stok, Laporan Laba Rugi, dan Ekspor Excel.

---

## 3. Hasil Penelusuran 8 Alur Bisnis (E1 s/d E8)

### E1. Setup Awal & Master Data
- **Langkah**: Seed Super Admin -> Login pertama -> Buat Unit Usaha -> Rekening Bank -> Logo & Tema -> Buat Sales -> Kategori -> Produk -> Foto -> Vendor.
- **Hasil Pengujian**:
  - Gagal pada kredensial seed: `AUD-SEC-001` (S1) menyebabkan password default `bismillahbento` tercatat di log dan menimpa admin lama.
  - Gagal pada pengaturan rekening bank: `AUD-TENANT-001` (S2) memicu unhandled error `Query BankAccount.findFirst tanpa businessId` pada pemanggilan `GET/PATCH/DELETE /api/v1/bank-accounts/:id`.
  - Sukses pada unggah logo usaha (konversi WebP Sharp & sanitasi path).

### E2. Pengadaan & Mutasi Stok Fisik
- **Langkah**: Draf Purchase Order -> Terbitkan PO (alokasi `poNo`) -> Terima Barang (`receivePurchaseOrder`) -> Pembaruan HPP master produk -> Catat Pembayaran Vendor -> Rekonsiliasi Buku Besar Vendor (Vendor Ledger).
- **Hasil Pengujian**: **LULUS PENUH**.
  - Alokasi nomor atomik berjalan sequential tanpa tabrakan.
  - Mutasi stok `PO_RECEIPT` bertambah akurat di tabel `StockMovement` dan `Product.stockQty`.
  - Saldo hutang vendor berkurang presisi saat pembayaran dicatat.

### E3. Penjualan Penuh (Happy Path)
- **Langkah**: Pelanggan -> Draf Order -> Preview Live 300ms -> Pengajuan (`submit`) -> Approval Super Admin (Alokasi `orderNo`, Faktur DP `APPROVED`, reservasi stok) -> Input Pembayaran DP -> Verifikasi -> Pengiriman Surat Jalan (`SHIPPED`, potong fisik `SALE_SHIPMENT`) -> Konfirmasi Terima (`DELIVERED`) -> Tagih Pelunasan (`requestFinalOrder`) -> Setujui Faktur Final -> Bayar Pelunasan -> Selesai (`COMPLETED`) -> Evaluasi Komisi Sales (`EARNED`) -> Jadwalkan Reminder Repeat Order.
- **Hasil Pengujian**: **LULUS PENUH** (selama tidak ada retur nota kredit).
  - Alokasi nomor `orderNo`, `SJ`, dan `INV` berjalan berurutan.
  - State machine transisi mulus dari `DRAFT` hingga `COMPLETED`.

### E4. Jalur Koreksi, Retur & Pembatalan (Negative Path)
- **Langkah**: Tolak pesanan ke revisi -> Tarik pengajuan draf -> Batalkan invoice resmi (`void`) -> Tolak bukti transfer -> Void pembayaran terverifikasi -> Terbitkan Nota Kredit (`CreditNote`) dengan settlement `OFFSET`, `CUSTOMER_CREDIT`, dan `REFUND` -> Void Nota Kredit -> Batalkan pesanan.
- **Hasil Pengujian**: **DITEMUKAN CACAT INTEGRASI KRITIS** (`AUD-INT-001` - S2 Tinggi).
  - Pada penerbitan Nota Kredit retur berpenyelesaian `OFFSET` (potong tagihan pesanan), `Order.creditTotal` bertambah (misal Rp 150.000).
  - Namun pada saat pengajuan faktur pelunasan (`requestFinalOrder` di `src/lib/services/order.ts:1032`):
    `const invoiceAmount = finalGrandTotal - order.dpAmount;`
    Kode **sama sekali tidak mengurangkan `order.creditTotal`**.
  - Akibatnya, pelanggan ditagih lebih (*overbilled*) pada faktur pelunasan resmi, dan faktur tidak pernah berstatus lunas karena terdapat selisih piutang semu.
  - Jalur `CUSTOMER_CREDIT` dan `REFUND` berjalan sesuai spesifikasi (saldo kredit bertambah dan mutasi kas keluar tercatat).

### E5. Katalog, Harga Paten & Mode Offline PWA
- **Langkah**: Buat katalog dari produk aktif (`/from-products`) -> Deteksi status `stale` bila harga dasar berubah -> Sinkronisasi katalog (`/sync`) -> Sesuaikan harga minimal (`/adjust-min`) -> Unduh PDF katalog -> Buka halaman `/offline` di PWA.
- **Hasil Pengujian**: **LULUS DENGAN CATATAN**.
  - Pembuatan katalog sekali klik dan sinkronisasi atomik berfungsi sempurna.
  - Ekspor PDF menolak jika katalog stale (HTTP 422 `CATALOG_STALE`).
  - Halaman `/offline` menyajikan katalog lokal cache PWA.
  - Catatan gap: `GET /api/v1/price-list` belum diintegrasikan ke UI Sales (`AUD-GAP-002`).

### E6. Integrasi Telegram Bot & Mini App
- **Langkah**: Buat tautan link code 8 karakter -> Jalankan `/start <token>` di bot -> Terima notifikasi pengajuan invoice -> Tekan tombol "Setujui" inline -> Tekan tombol "Tolak" (membuka Mini App) -> Tekan tombol verifikasi bayar.
- **Hasil Pengujian**: **DITEMUKAN CACAT KRITIS H4/H3** (`AUD-GAP-001` - S1 Kritis).
  - Tombol persetujuan instan inline `ap:<invoiceId>:y` dan `pv:<paymentId>:y` berfungsi baik dan aman dari idempotensi ganda.
  - Perlindungan `hasBelowMin`: bot menolak persetujuan langsung jika terdapat harga di bawah minimal.
  - **Kegagalan Total**: Tombol inline "Tolak" (`/tg/approvals/:id?reject=1`) dan tombol "Buka" (`/tg/approvals/:id` serta `/tg/payments`) mengarahkan pengguna ke halaman **HTTP 404 Not Found**, memutus proses penolakan invoice via bot Telegram.

### E7. Eksekusi Job Terjadwal (pg-boss Asia/Jakarta)
- **Langkah**: Simulasikan eksekusi worker: `telegram.send`, `reminders.repeat.scan`, `invoices.due.scan`, `crm.tasks.scan`, `owner.digest`, `housekeeping`.
- **Hasil Pengujian**: **LULUS PENUH**.
  - Semua job dijadwalkan dengan zona waktu `Asia/Jakarta`.
  - Retry backoff eksponensial 5x berjalan pada kegagalan bot.
  - Eksekusi dua kali job pemindaian terbukti idempoten tanpa duplikasi notifikasi.

### E8. Operasional, Cadangan & Pemulihan (Backup & Restore)
- **Langkah**: Jalankan `scripts/backup.sh` -> Ekspor PostgreSQL & direktori uploads -> Jalankan `scripts/restore.sh` -> Pastikan sequence nomor berlanjut tanpa reset -> Pastikan trigger imutabilitas aktif.
- **Hasil Pengujian**: **DITEMUKAN CACAT DEPLOYMENT DOCKER** (`AUD-SPEC-006` - S1 Kritis).
  - Logika pemulihan `DocumentCounter` di PGlite terbukti melanjutkan nomor urut (`lastSeq + 1`).
  - Namun jalur start kontainer produksi (`docker-entrypoint.sh`) menjalankan `prisma db push` dan meniadakan seluruh trigger dan constraint database.

---

## 4. Rincian Temuan Baru dari Fase 2

### AUD-INT-001: Faktur Pelunasan Mengabaikan Nota Kredit (Credit Note OFFSET) Mengakibatkan Overbilling
- **Lokasi**: `src/lib/services/order.ts:1032`, `src/lib/services/credit-note.ts:401-410`
- **Rujukan**: BLUEPRINT.md Seksi 5 Aturan Bisnis nomor 3; Dokumen Aturan Main Kategori INT
- **Dampak Bisnis**: Pelanggan yang telah disetujui retur barangnya (Nota Kredit OFFSET) tetap ditagih penuh pada faktur pelunasan (FINAL). Pelanggan membayar sisa bersih yang sebenarnya, tetapi sistem menandai faktur tersebut menunggak (*partially paid / overdue*), mengacaukan umur piutang dan laporan keuangan.
- **Yang Diharapkan**:
  Sesuai rumus BLUEPRINT.md Seksi 5:
  `Invoice Pelunasan (FINAL) = orderTotal - dpPaid - creditApplied`
  Nilai nominal invoice pelunasan wajib memperhitungkan saldo kredit pesanan:
  `const invoiceAmount = finalGrandTotal - order.dpAmount - order.creditTotal;`
- **Yang Terjadi**:
  `src/lib/services/order.ts` baris 1032 hanya menghitung:
  `const invoiceAmount = finalGrandTotal - order.dpAmount;`
  sehingga saldo `order.creditTotal` tidak pernah dipotongkan dari faktur pelunasan.
- **Langkah Reproduksi**:
  1. Buat pesanan dengan total Rp 1.000.000, DP Rp 300.000.
  2. Setujui pesanan dan catat pembayaran DP Rp 300.000 lunas.
  3. Terbitkan Nota Kredit retur Rp 200.000 dengan penyelesaian `OFFSET`. `order.creditTotal` menjadi Rp 200.000.
  4. Ajukan faktur pelunasan melalui `requestFinalOrder`.
  5. Periksa nominal invoice yang terbentuk: tertulis Rp 700.000 (seharusnya Rp 500.000).
- **Saran Perbaikan**:
  Perbarui baris 1032 di `src/lib/services/order.ts`:
  ```ts
  const effectivePaidOrCredited = order.dpAmount + order.creditTotal;
  const invoiceAmount = finalGrandTotal - effectivePaidOrCredited;
  ```
  serta pastikan `invoiceAmount > 0`.
- **Tes yang Seharusnya Menangkapnya**: Uji integrasi alur E4 (Credit Note OFFSET diikuti oleh request final invoice).

---

## 5. Matriks Ringkasan Status Kesiapan Alur Bisnis (E1 s/d E8)

| Kode Alur | Nama Alur Bisnis | Status Kesiapan | Temuan Penghambat (Blocker) |
|---|---|---|---|
| **E1** | Setup Awal & Master Data | **TIDAK SIAP (NO-GO)** | `AUD-SEC-001` (S1), `AUD-TENANT-001` (S2) |
| **E2** | Pengadaan & Mutasi Stok Fisik | **SIAP (GO)** | Tidak ada |
| **E3** | Penjualan Penuh (Happy Path) | **SIAP BERSYARAT** | Bergantung pada penyelesaian E1 & E6 |
| **E4** | Jalur Koreksi & Retur Kredit | **TIDAK SIAP (NO-GO)** | `AUD-INT-001` (S2) |
| **E5** | Katalog & Harga Paten | **SIAP (GO)** | Catatan integrasi UI `AUD-GAP-002` (S3) |
| **E6** | Integrasi Bot Telegram & TMA | **TIDAK SIAP (NO-GO)** | `AUD-GAP-001` (S1) |
| **E7** | Eksekusi Job Terjadwal | **SIAP (GO)** | Tidak ada |
| **E8** | Operasional & Deployment Docker | **TIDAK SIAP (NO-GO)** | `AUD-SPEC-006` (S1), `AUD-OPS-001` (S2) |

---

*Laporan Fase 2 selesai disusun dan disimpan ke `docs/audit/LAPORAN-06-audit-integrasi-e2e.md`.*

