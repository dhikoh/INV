# Matriks Tampilan & Kerahasiaan Harga Paten (Putaran 01 - Pra-Implementasi A17)

Dokumen ini memetakan ketersediaan tampilan harga paten (batas minimal) dan pencegahan kebocoran HPP pada seluruh antarmuka dan endpoint terkait.

| Layar / Endpoint | Super Admin | Sales A1 (Usaha A) | Sales A2 (Usaha A) | Sales B1 (Usaha B) | Status Saat Ini | Keterangan & Gap |
|---|---|---|---|---|---|---|
| **Daftar Harga (`GET /api/v1/price-list`)** | Tidak Ada (404) | Tidak Ada (404) | Tidak Ada (404) | Tidak Ada (404) | **GAGAL** | Endpoint `GET /api/v1/price-list` belum diimplementasikan |
| **Halaman Produk Sales (`/products`)** | Tampil HPP, Dasar, Minimal | Tampil Dasar, Minimal | Tampil Dasar, Minimal | Tampil Dasar, Minimal (Usaha B) | **GAGAL** | Label masih "Harga Dasar" & "Harga Minimal" (belum "Harga Katalog" & "Harga Paten"). Belum ada tombol "Buat katalog dari daftar ini" |
| **Pemilih Produk di Order Form (`/orders/new`)** | Tampil opsi produk | Hanya nama/SKU | Hanya nama/SKU | Hanya nama/SKU | **GAGAL** | Opsi dropdown belum menampilkan "Katalog Rp X, Paten Rp Y" sebelum produk dipilih |
| **Baris Item Order Form** | Tampil floor | "Harga minimal efektif: Rp X" (hanya setelah preview) | "Harga minimal efektif: Rp X" (hanya setelah preview) | "Harga minimal efektif: Rp X" (hanya setelah preview) | **GAGAL** | Belum menampilkan teks tetap "Harga paten (batas minimal): Rp Y" sebelum diketik |
| **Harga Awal Baris Item (D-6)** | Mengikuti `basePrice` | Mengikuti `basePrice` | Mengikuti `basePrice` | Mengikuti `basePrice` | **GAGAL** | Nilai awal belum memakai $\max(\text{basePrice}, \text{floorPrice})$. Jika customer memiliki `CustomerMinPrice > basePrice`, baris langsung bertanda peringatan merah |
| **Tab Pricing Customer (`/customers/:id/pricing`)** | Tampil data pricing | Tampil pricing customer miliknya | 404 (Customer milik A1) | 404 (Customer milik Usaha A) | **LULUS** | Isolasi tenant & data pricing per customer sudah aman |
| **Editor Katalog (`/catalogs/[id]`)** | Tampil harga item | Tampil harga item miliknya | 404 (Katalog A1) | 404 (Katalog A1) | **GAGAL** | Belum ada banner status sinkronisasi (`sync: { newProducts, belowFloor, inactive }`) |
| **PDF Katalog Customer** | Tampil harga jual item | Tampil harga jual item | Tampil harga jual item | Tampil harga jual item | **LULUS** | Tidak membocorkan HPP maupun harga paten/minimal |
| **Peringatan Super Admin saat minPrice <= costPrice (D-5)** | Belum ada peringatan di form produk | N/A (Sales tidak bisa akses edit produk) | N/A | N/A | **GAGAL** | Modal Tambah/Edit Produk Super Admin belum menampilkan peringatan D-5 saat harga paten <= HPP |
| **Filter / Sort Kolom Rahasia di Price List** | 404 (Route belum ada) | 404 | 404 | 404 | **GAGAL** | Perlu divalidasi dengan `.strict()` pada `PriceListQuery` |

