# ADR 0001: Representasi Uang dan Persentase

## Konteks

Sistem mengelola transaksi keuangan multi-usaha yang mencakup harga dasar, harga minimal, negosiasi harga deal, diskon bertingkat, PPN, DP, pelunasan, ongkir, subsidi, HPP, margin profit, dan komisi sales. Kesalahan pembulatan pecahan desimal (floating point precision error) pada sistem keuangan dapat menyebabkan inkonsistensi pembukuan, selisih rekonsiliasi bank, dan potensi celah hukum/pajak.

## Keputusan

1. **Uang**: Seluruh nilai uang disimpan dalam basis bilangan bulat Rupiah utuh (tanpa desimal/sen).
   - Di database PostgreSQL: menggunakan tipe data `BigInt`.
   - Di kode aplikasi TypeScript: menggunakan tipe data `number` bilangan bulat (atau `bigint` untuk interaksi ORM).
2. **Persentase**: Seluruh persentase (PPN, diskon persen, rasio DP, margin, komisi) disimpan sebagai **basis points (bps)**:
   - $10\% = 1000$ bps
   - $11\% = 1100$ bps
   - $3.5\% = 350$ bps
   - $100\% = 10000$ bps
3. **Fungsi Murni**: Semua komputasi keuangan wajib diisolasi di `src/lib/domain/` sebagai fungsi murni tanpa akses I/O atau database. Pembulatan pembagian menggunakan aturan pembulatan setengah ke atas (`Math.round`).
4. **Dilarang**: Penggunaan tipe `float`, `double`, `Decimal`, atau pemanggilan `.toFixed()` untuk perhitungan logika uang.

## Alternatif yang Ditolak

1. **Tipe Float / Double**: Menghasilkan bug floating point (misalnya `0.1 + 0.2 !== 0.3`) yang fatal untuk agregasi invoice dan jurnal keuangan.
2. **Library Decimal / Bignumber.js**: Menambah overhead runtime, memperlambat serialisasi JSON, dan menimbulkan kompleksitas interoperabilitas antara ORM, API, dan UI.

## Konsekuensi

- Semua konversi tampilan UI wajib memanggil helper formatting terstandar (misalnya `formatRupiah`, `bpsToPercent`).
- Input persentase dari UI harus dikonversi ke basis points sebelum divalidasi dan dikirim ke server.
- Seluruh perhitungan diskon dan pajak harus menguji pembulatan integer division secara ketat melalui unit test domain.
