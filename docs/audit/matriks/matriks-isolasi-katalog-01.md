# Matriks Isolasi Tenant & Katalog Multi-Usaha (Putaran 01 - Pra-Implementasi A17)

Dokumen ini memetakan isolasi data katalog dan produk antar unit usaha (Usaha A vs Usaha B) dan antar sales dalam satu usaha (Sales A1 vs Sales A2).

| Aksi / Endpoint | Pelaku | Data Target | Kode HTTP Aktual | Kode yang Diharapkan | Selisih & Keterangan |
|---|---|---|---|---|---|
| **Daftar Harga (`GET /api/v1/price-list`)** | Sales A1 | Usaha B | 404 (Route belum ada) | 200 (Hanya Usaha A) | Rute belum ada |
| **Katalog Otomatis (`POST /api/v1/catalogs/from-products`)** | Sales A1 | Produk Usaha A | 404 (Route belum ada) | 201 (Dibuat otomatis) | Rute belum ada |
| **Katalog Lintas Usaha (`POST /api/v1/catalogs/from-products`)** | Sales A1 | Produk Usaha B | 404 (Route belum ada) | 404 NOT_FOUND | Rute belum ada |
| **Buka Detail Katalog A2 (`GET /api/v1/catalogs/:id`)** | Sales A1 | Katalog Sales A2 | 404 | 404 NOT_FOUND | **LULUS** (Isolasi sales bekerja pada rute katalog lama) |
| **Buka Detail Katalog B1 (`GET /api/v1/catalogs/:id`)** | Sales A1 | Katalog Sales B1 | 404 | 404 NOT_FOUND | **LULUS** (Isolasi tenant bekerja pada rute katalog lama) |
| **Unduh PDF Katalog A2 (`GET /api/v1/catalogs/:id/pdf`)** | Sales A1 | Katalog Sales A2 | 404 | 404 NOT_FOUND | **LULUS** |
| **Ubah Item Katalog A2 (`PUT /api/v1/catalogs/:id/items`)** | Sales A1 | Katalog Sales A2 | 404 | 404 NOT_FOUND | **LULUS** |
| **Hapus Katalog A2 (`DELETE /api/v1/catalogs/:id`)** | Sales A1 | Katalog Sales A2 | 404 | 404 NOT_FOUND | **LULUS** |
| **Sinkronisasi Katalog (`POST /api/v1/catalogs/:id/sync`)** | Sales A1 | Katalog Milik Sendiri | 404 (Route belum ada) | 200 (Hasil sync) | Rute belum ada |
| **Trigger Database PostgreSQL (`catalogitem_same_business_trg`)** | Query Langsung | Cross-Business Insert | N/A (Trigger belum ada) | Error 23514 | **GAGAL** (Trigger belum dibuat di migrasi) |
| **Foto Produk Usaha B (`GET /api/v1/files/:bizB/:path`)** | Sales A1 | Foto Produk Usaha B | 404 | 404 NOT_FOUND | **LULUS** (File server memvalidasi `businessId`) |
| **Pembersihan Cache PWA Offline Katalog** | Sales A1 -> B1 | Cache Katalog Lama | Lulus (Cache terhapus) | Cache terhapus | **LULUS** (Teruji di `pwa.test.ts`) |

