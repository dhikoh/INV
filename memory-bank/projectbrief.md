# Project Brief: OmniCat Enterprise Distribution Platform

## 1. Executive Summary
OmniCat adalah platform multi-brand distribution & financial enterprise management system yang dirancang khusus untuk ekosistem distribusi pasir kucing BentoCat dan brand-brand masa depan (seperti Zeolite Mojo). Sistem ini menggantikan pencatatan terfragmentasi (180 file Excel & PDF di 7 wilayah: Blitar, Bojonegoro, Cilacap, Lamongan, Semarang, Timika, Tuban) menjadi satu sistem terpadu yang aman, transparan, dan terotomatisasi.

## 2. Core Business Problems Solved
1. **Kebocoran Subsidi Ongkir (Freight Leakage):** Audit historis membuktikan adanya subsidi ongkir riil sebesar Rp 122.550.000 yang ditanggung perusahaan. Sistem baru mengisolasi dan menghitung "Laba Kontribusi Kotor" (Net Invoice - HPP - Biaya Truk Riil - Biaya Bongkar) secara real-time sebelum order di-ACC.
2. **Kekacauan Nomor Dokumen:** Penomoran invoice selama ini unik per customer (`Dok 01`, `Dok 02`, dst.) dan sering mengalami human-error (typo tahun 2925, loncatan Dok 34 di Semarang, salah tanggal di Cilacap, copy-paste sheet antar-wilayah). Sistem baru menerapkan atomic sequence counter dengan row-level lock.
3. **Pemisahan Peran & Kerahasiaan Margin:** Sales tidak boleh melihat HPP dan Laba Bersih. Hanya Super Admin dan Finance yang memiliki hak akses approval finansial.
4. **Mobilitas Sales Lapangan:** Sales memerlukan antarmuka cepat di lapangan (Telegram Mini App - TMA) yang ringan dan langsung terhubung ke database pusat.
5. **Customer Retention:** CRM otomatis mendeteksi interval repeat-order customer (median days) dan memberikan alert jika customer terlambat reorder.

## 3. Scope & Phased Milestones
- **Release 1 (Core Money & Documents):** Database schema, ETL 101 invoice historis (Realisasi Rp 2.990.251.489 & 684.540 L), Financial Clearance Approval, Invoice PDF + QR Code, Payment Tracking (DP, Pelunasan, Piutang).
- **Release 2 (Field Sales & CRM):** Sales CRM, Median Reorder Alert Engine, Telegram Mini App (TMA), Surat Jalan (Delivery Slip).
- **Release 3 (Ecosystem & Optimization):** Freight Sharing Estafet Optimizer, Vendor AP, PDF Katalog Otomatis, JSON Import/Export untuk AI Eksternal.

## 4. Key Success Metrics
- 100% rekonsiliasi data historis (Rp 2.990.251.489 dan 684.540 Liters tanpa selisih 1 rupiah pun).
- Nol duplikasi atau race condition penomoran invoice.
- Margin kontribusi dihitung otomatis sebelum approval invoice.

