# Matriks M6: Peran ke Kemampuan (Role-to-Capability Access Matrix)

Perbandingan ketat antara matriks hak akses BLUEPRINT.md Seksi 4 dengan implementasi kode backend (`withApi({ roles })`), tampilan navigasi & komponen UI, dan penyaringan DTO per peran (Zero-Leakage Guarantee).

---

## 1. Matriks Kemampuan Bisnis (Spesifikasi vs Implementasi)

| Kemampuan / Fitur | Hak Akses Spesifikasi (SA / Sales) | Proteksi API (`withApi`) | Proteksi UI (Sidebar / Halaman) | DTO Filtering & Proteksi Data | Status Kesesuaian |
|---|---|---|---|---|---|
| Login, Logout, Ganti Password | SA: Ya, Sales: Ya | `PUBLIC` & `Authenticated` | Halaman `/login`, `/profile` | Hash password argon2id tidak pernah diekspos | **Sesuai 100%** |
| Kelola Profil Usaha, Bank, Tema | SA: Ya, Sales: Tidak | `SUPERADMIN` only | Menu `/settings/business` hanya tampil untuk SA | Sales tidak dapat melihat atau mengubah legalitas | **Sesuai 100%** |
| Kelola Akun Sales, Target & Komisi | SA: Ya, Sales: Tidak | `SUPERADMIN` only | Menu `/settings/users`, `/sales` hanya untuk SA | Sales tidak memiliki akses ke entitas pengguna lain | **Sesuai 100%** |
| Kelola Vendor (Supplier/Transport) | SA: Ya, Sales: Tidak | `SUPERADMIN` only | Menu `/vendors` hanya tampil untuk SA | Detail hutang vendor hanya untuk SA | **Sesuai 100%** |
| Lihat Produk | SA: Lengkap + HPP/Margin, Sales: Aktif, Tanpa HPP | `SUPERADMIN, SALES` | Tampilan `/products` kolom HPP/Margin tersembunyi untuk Sales | `formatProductDto` menyaring `costPrice`, `margin` bila role = Sales | **Sesuai 100%** |
| Lihat Daftar Harga Resmi (`/price-list`)| SA: Semua floor, Sales: Customernya | `SUPERADMIN, SALES` | Halaman `/price-list` terintegrasi di desktop nav dan drawer mobile | `priceListItemDto` 11 kunci, evaluasi floorPrice efektif | **Sesuai 100%** |
| Buat & Sinkronisasi Katalog | SA: Ya, Sales: Ya (Milik sendiri) | `SUPERADMIN, SALES` | Halaman `/catalogs`, modal sync | Sales hanya melihat dan menyinkronkan katalognya | **Sesuai 100%** |
| Ubah Harga Master & HPP | SA: Ya, Sales: Tidak | `SUPERADMIN` only | Tombol edit harga hanya tampil untuk SA | Sales ditolak 403 bila mencoba PATCH produk | **Sesuai 100%** |
| Ajukan Order Baru | SA: Ya, Sales: Ya (Customer sendiri) | `SUPERADMIN, SALES` | Halaman `/orders/new` (`OrderForm`) | Validasi customerScope: Sales ditolak bila bukan miliknya | **Sesuai 100%** |
| Ajukan Harga di Bawah Minimal | SA: -, Sales: Ya (Wajib alasan) | `SUPERADMIN, SALES` | Alert deteksi belowMin & input teks alasan wajib | Flag `underMinPrice=true`, status `PENDING_APPROVAL` | **Sesuai 100%** |
| Setujui / Tolak Invoice (Approval) | SA: Ya, Sales: Tidak | `SUPERADMIN` only | Menu `/approvals`, tombol Setujui/Tolak hanya SA | Sales ditolak 403 jika menembak endpoint approval | **Sesuai 100%** |
| Setujui Override Harga di Bawah Minimal | SA: Ya, Sales: Tidak | `SUPERADMIN` only | Modal approval SA dengan warning kuning | Bot Telegram melarang approval otomatis jika belowMin | **Sesuai 100%** |
| Input Pembayaran Pelanggan | SA: Ya, Sales: Ya (Order sendiri) | `SUPERADMIN, SALES` | Tombol catat bayar di detail order | Sales hanya bisa mencatat untuk pesanannya | **Sesuai 100%** |
| Verifikasi Pembayaran (Approval Bayar) | SA: Ya, Sales: Tidak | `SUPERADMIN` only | Menu `/payments`, modal verifikasi hanya SA | Sales ditolak 403 pada `/payments/:id/verify` | **Sesuai 100%** |
| Cetak Faktur PDF | SA: Ya, Sales: Ya (Hanya APPROVED) | `SUPERADMIN, SALES` | Tombol cetak PDF aktif jika APPROVED | Sales diblokir 422 jika faktur belum disetujui | **Sesuai 100%** |
| Cetak Surat Jalan PDF | SA: Ya, Sales: Ya (SHIPPED/DELIVERED) | `SUPERADMIN, SALES` | Tombol cetak SJ aktif jika sudah berangkat | Berkas PDF Surat Jalan sama sekali tanpa harga | **Sesuai 100%** |
| Lihat Laporan Margin & Profitabilitas | SA: Ya, Sales: Dilarang Keras | `SUPERADMIN` only | Menu `/reports/margin` disembunyikan dari Sales | Sales ditolak 403 jika mengakses `/api/v1/reports/margin` | **Sesuai 100%** |
| Lihat Nilai Komisi | SA: Ya, Sales: Tidak | `SUPERADMIN` only | Endpoint komisi khusus SUPERADMIN | Sales dashboard hanya tampil estimasi omzet, bukan nominal komisi langsung | **Sesuai 100%** |

---

## 2. Jaminan Nol Kebocoran (Zero-Leakage Verification)

Pengujian statis dan dinamis pada DTO, Route Handlers, dan Service membuktikan:
1. Kolom rahasia `costPrice`, `margin`, `profit`, `cogs`, `actualCost`, `cogsReversed`, dan `costReversed` tidak pernah disertakan dalam DTO yang dikirim ke Sales.
2. Respons objek milik usaha lain atau milik sales lain selalu mengembalikan status HTTP **404 Not Found** (bukan 403), sehingga penyerang tidak dapat melakukan enumerasi keberadaan data (mencegah IDOR inferensial).
