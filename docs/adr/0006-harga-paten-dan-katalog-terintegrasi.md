# ADR 0006: Harga Paten, Katalog Terintegrasi Multi-Usaha, dan Isolasi Database Lapis PostgreSQL (Addendum v2)

## Konteks

Pemilik bisnis BentoCat memerlukan mekanisme perlindungan margin yang tegas dan terpadu untuk staf sales lintas unit usaha (Usaha A dan Usaha B):
1. **Istilah Bisnis "Harga Paten"**: Staf sales sering kali bingung dengan istilah "Harga Minimal". Pemilik menetapkan istilah resmi "Harga Paten" sebagai batas mutlak penawaran harga di lapangan yang tidak boleh dilanggar tanpa persetujuan Super Admin.
2. **Katalog Terintegrasi**: Sebelumnya sales dapat mengetik item katalog manual atau katalog tidak otomatis tersinkronisasi ketika ada produk baru atau kenaikan harga paten oleh Super Admin.
3. **Kerahasiaan HPP (Zero-Leakage)**: Meskipun harga paten terlihat oleh sales, Harga Pokok Penjualan (HPP / `costPrice`), persentase margin, dan nilai stok riil dilarang keras bocor ke staf sales. Bila harga paten disetel sama persis dengan HPP, ada risiko sales menebak HPP, sehingga diperlukan peringatan audit pada UI Super Admin.
4. **Isolasi Tenant Database**: Pada arsitektur multi-tenant shared-schema, isolasi data tidak boleh hanya bergantung pada validasi aplikasi (risiko human error / bypass). Integritas relasi `CatalogItem` -> `Catalog` dan `Product` harus dijamin berada pada `businessId` yang sama di lapis database PostgreSQL.

## Keputusan

1. **Definisi Domain Harga Paten**:
   - Tidak menambahkan kolom baru di tabel `Product`.
   - Harga Paten produk master menggunakan kolom `Product.minPrice`.
   - Jika ada kesepakatan harga khusus per customer, harga paten dievaluasi melalui `CustomerMinPrice.floorPrice`.
   - Fungsi domain `effectiveFloor(productMin, customerMin)` menghasilkan `floorPrice` efektif dan sumbernya (`CUSTOMER` atau `PRODUCT`).
   - Harga awal rekomendasi di katalog dan pesanan dihitung melalui `initialPrice(basePrice, floorPrice) = max(basePrice, floorPrice)`.
2. **Isolasi Database Lapis PostgreSQL (Trigger Guard)**:
   - Dibuat migrasi PostgreSQL `20261110000003_catalog_same_business_guard` yang memasang trigger `catalogitem_same_business_trg` pada tabel `CatalogItem`.
   - Trigger memverifikasi bahwa `Catalog.businessId` sama dengan `Product.businessId`. Bila berbeda, transaksi digagalkan dengan kode error PostgreSQL `23514` (`check_violation`).
3. **Penyajian Data & DTO `/api/v1/price-list`**:
   - Endpoint `GET /api/v1/price-list` menyajikan daftar harga resmi (katalog & paten).
   - DTO diatur secara eksplisit (*strict whitelist*) berisi 11 kunci: `id`, `name`, `sku`, `category`, `unit`, `catalogPrice`, `patenPrice`, `floorSource`, `images`, `suggestedPrice`, `hasCustomerOverride`.
   - Field `costPrice`, `stockQty`, dan detail margin disaring dan tidak pernah disertakan.
4. **Pembuatan dan Sinkronisasi Katalog Otomatis**:
   - `POST /api/v1/catalogs/from-products`: Membuat katalog baru dalam 1 transaksi database atomik langsung dari seluruh produk aktif unit usaha, dengan batas maksimal 300 item (`CATALOG_ITEM_LIMIT`).
   - `POST /api/v1/catalogs/:id/sync`: Menyediakan sinkronisasi selektif:
     - `addNewProducts`: Menambahkan produk aktif baru yang belum ada di katalog menggunakan `skipDuplicates: true`.
     - `raiseToFloor`: Menaikkan harga item yang berada di bawah paten terbaru, tanpa menimpa harga item lain yang sudah di atas floor.
5. **Peringatan Margin pada Super Admin UI**:
   - Pada form tambah/edit produk master, jika Super Admin menyetel `minPrice <= costPrice`, sistem menampilkan *callout alert* kuning yang mengingatkan bahwa harga paten dapat dilihat oleh sales dan dapat membuka tebakan HPP.

## Alternatif yang Ditolak

1. **Menambahkan Kolom `patenPrice` Baru di Skema Prisma**: Ditolak karena redundan dengan `minPrice` dan berisiko membingungkan sinkronisasi data antar modul lama (Order, Invoice, Approval).
2. **Hanya Mengandalkan Validasi TypeScript/Prisma untuk Isolasi Tenant**: Ditolak karena celah konkurensi atau query langsung dapat menembus batasan unit usaha jika developer lupa menyertakan filter `businessId`.
3. **Mengizinkan Sales Mengubah Harga di Bawah Paten pada Katalog**: Ditolak. Katalog harga resmi harus selalu berada pada atau di atas harga paten. Pengajuan harga di bawah paten hanya diizinkan pada alur pengajuan pesanan (`OrderForm`) yang melalui mekanisme approval Super Admin.

## Konsekuensi

- Trigger database aktif di PostgreSQL produksi dan diuji secara menyeluruh melalui `@electric-sql/pglite` in-memory.
- Sales mendapatkan pengalaman pembuatan katalog instan dengan 1 klik dari daftar produk aktif.
- Hak akses dan isolasi data tetap mematuhi prinsip Zero-Leakage: Sales Usaha A tidak dapat melihat atau mengaitkan data produk Usaha B, dan Sales tidak dapat melihat HPP.

