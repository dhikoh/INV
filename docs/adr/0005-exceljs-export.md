# ADR 0005: Pemilihan ExcelJS dan Mitigasi Formula Injection (Seksi 16.4)

## Konteks

Aplikasi membutuhkan kemampuan ekspor data laporan operasional dan keuangan (`/reports/export`) dalam format Microsoft Excel (`.xlsx`) dan PDF. Laporan yang diekspor mencakup data umur piutang (*receivables aging*), ringkasan aktivitas CRM & pipeline, laporan margin & profitabilitas, evaluasi performa sales, dan laporan komisi.

Data yang diekspor bersumber dari input pengguna (misalnya nama customer, catatan evaluasi, nomor kontak, kode produk). Apabila teks yang diawali karakter formula spreadsheet seperti `=`, `+`, `-`, atau `@` dimasukkan langsung ke dalam berkas Excel/CSV tanpa sanitasi, aplikasi spreadsheet (Microsoft Excel, LibreOffice Calc, Google Sheets) akan mengeksekusinya sebagai formula dinamis (*CSV / Spreadsheet Formula Injection* atau *Formula Injection CWE-1236*), yang berpotensi memicu eksekusi perintah berbahaya (*Dynamic Data Exchange / DDE*).

Selain itu, pustaka ekspor harus kompatibel dengan lingkungan Node.js, tidak memerlukan pustaka native C/C++ eksternal yang rentan saat build Docker/Coolify, dan mendukung penataan gaya sel (lebar kolom, format angka/mata uang, cetak tebal).

## Keputusan

1. **Pustaka**: Memilih `exceljs` (`v4.4.0`) untuk pembuatan berkas spreadsheet `.xlsx`.
2. **Mitigasi Formula Injection (Seksi 16.4)**:
   - Setiap nilai teks yang diawali dengan karakter formula (`=`, `+`, `-`, `@`) wajib disanitasi secara otomatis sebelum dimasukkan ke dalam sel worksheet:
     ```ts
     export function sanitizeFormulaInjection(value: unknown): unknown {
       if (typeof value === 'string') {
         if (/^[=+\-@]/.test(value)) {
           return `'${value}`;
         }
         return value;
       }
       return value;
     }
     ```
   - Karakter kutip tunggal (`'`) di depan teks memberi tahu aplikasi spreadsheet bahwa isi sel tersebut adalah teks murni (*verbatim text*), bukan ekspresi komputasi.
3. **Format Tanggal dan Uang**:
   - Nilai uang rupiah diekspor sebagai nilai numerik dengan format angka akuntansi `#,##0` atau format teks Rupiah, sehingga mudah dijumlahkan oleh pengguna di Excel tanpa kehilangan presisi.
   - Tanggal diformat konsisten dengan zona Waktu Indonesia Barat (WIB).
4. **Keamanan Hak Akses**:
   - Ekspor data sensitif (margin, sales-performance, commissions, receivables-aging) dibatasi khusus untuk Super Admin (Zero-Leakage).
   - Ekspor laporan CRM diizinkan untuk Sales, namun data dibatasi secara ketat hanya untuk customer dan aktivitas miliknya sendiri.

## Alternatif yang Ditolak

1. **SheetJS (xlsx)**: Lisensi open-source terbagi dan terdapat riwayat kerentanan pustaka pada repositori npm publik, serta beberapa fitur penataan gaya memerlukan versi Pro komersial.
2. **Ekspor CSV Sederhana**: CSV tidak mendukung multi-sheet, format kolom, pewarnaan header, dan proteksi tipe data angka vs teks sering kali diubah secara sewenang-wenang oleh Microsoft Excel lokal (misal nomor telepon berawalan `08...` terpotong menjadi `8...`).

## Konsekuensi

- `exceljs` ditambahkan ke dependencies proyek pada `package.json`.
- Seluruh endpoint dan fungsi ekspor wajib mengalirkan data melalui fungsi `sanitizeFormulaInjection`.
- Suite pengujian integrasi (`tests/integration/reports-export.test.ts`) memvalidasi bahwa sel berbahaya yang diawali `=`, `+`, `-`, atau `@` terbukti dinetralkan dengan awalan `'`.
