# Product Context: OmniCat Enterprise

## 1. Why OmniCat Exists
Distribusi BentoCat telah mencapai volume transaksi signifikan (>Rp 2,99 Miliar dan >684 ribu Liter) yang tersebar di Jawa Timur, Jawa Tengah, hingga Papua (Timika). Pengelolaan manual menggunakan spreadsheet terpisah di setiap folder wilayah menyebabkan:
- Kerentanan integritas data (sheet Bojonegoro ter-copy ke folder Blitar, Lamongan, dan Tuban).
- Ketidaktahuan margin riil per pengiriman karena subsidi truk tidak dihitung secara terpusat.
- Ketiadaan monitoring piutang (Aging AR) dan status pelunasan terpadu.

## 2. Target Users & Experience Goals
1. **Super Admin (Owner / Management):**
   - Melihat dashboard ringkasan laba kontribusi kotor, omzet total, dan piutang jatuh tempo.
   - Hak approval mutlak pada pesanan yang memiliki margin di bawah ambang batas sehat (misal < 10%).
   - Manajemen profile brand (BentoCat, Zeolite, dll.) dan master harga/HPP.
2. **Finance:**
   - Meninjau pengajuan invoice dari sales: memverifikasi nominal DP, menghitung biaya logistik riil vendor truk, dan memberikan status `APPROVED`.
   - Menerbitkan invoice resmi ber-QR verification.
   - Mencatat pembayaran pelunasan dan mengelola Aging AR.
3. **Sales:**
   - Antarmuka mobile cepat melalui Telegram Mini App (TMA).
   - Menginput draft order dengan memilih customer, varian produk (25L, 10L, 5.5L), dan promo/diskon resmi.
   - Memantau status approval order tanpa pernah melihat data sensitif HPP dan profit margin perusahaan.
   - Menggunakan Sales CRM untuk melihat jadwal reorder customer berdasarkan analisis interval historis.
4. **Management Viewer:**
   - Read-only audit access untuk memonitor laporan keuangan, penjualan per wilayah, dan performa brand.

## 3. Workflow Inti: Dari Draft Order hingga Lunas
```
[Sales input Draft Order via TMA]
             │
             ▼
[Validasi Promo & Ongkir Otomatis]
             │
             ▼
[Finance Clearance Review] ── (Hitung Laba Kontribusi: Net Invoice - HPP - Truk Riil)
             │
   ┌─────────┴─────────┐
[Reject]            [Approve]
   │                   │
   ▼                   ▼
[Revisi Sales]      [Lock & Generate Doc Number (Dok 01..)]
                       │
                       ▼
                    [Terbit Invoice Resmi + QR Code]
                       │
                       ▼
                    [Surat Jalan (Delivery Slip)]
                       │
                       ▼
                    [Pelunasan & Rekonsiliasi Bank]
```

