# Changelog

Semua perubahan penting pada proyek ini dicatat di dokumen ini.
Format ini berbasis pada [Keep a Changelog](https://keepachangelog.com/id/1.0.0/)
dan proyek ini mengikuti [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Layanan manajemen stok dan mutasi fisik produk `src/lib/services/stock.ts` sesuai Seksi 7.9, 8.2, 8.3, dan Kriteria Tes 17.3 nomor 7:
  - `lockProducts(tx, ids)`: Penguncian baris produk pesimistik terurut (`SELECT FOR UPDATE`) untuk mencegah kondisi balapan (*race condition*) dan deadlock.
  - `moveStock(tx, params)`: Gerbang mutasi tunggal kuantitas fisik produk (`Product.stockQty`), secara atomik menerbitkan entri `StockMovement` (+ masuk, - keluar) dengan `balanceAfter`.
  - `reserveOrderStock(tx, order, items, allowNegative)`: Reservasi kuantitas produk saat order disetujui; menolak 409 `INSUFFICIENT_STOCK` jika `allowNegativeStock = false` dan stok tersedia tidak mencukupi; mengizinkan saldo minus jika `allowNegativeStock = true`. Idempoten jika order sudah berstatus `stockReserved = true`.
  - `releaseOrderStock(tx, order, items)`: Melepas reservasi kuantitas (`reservedQty`) secara idempoten saat pembatalan order.
  - `shipOrderStock(tx, order, items, actorId)`: Mengeluarkan kuantitas fisik melalui `moveStock` bertipe `SALE_SHIPMENT` dan melepas reservasi saat pesanan dikirim.
  - `adjustStock(tx, params)`: Penyesuaian stok manual bertipe `ADJUSTMENT` dengan validasi alasan wajib minimal 5 karakter dan audit log `STOCK_ADJUST`.
  - `opnameStock(tx, params)`: Stock opname fisik riil bertipe `OPNAME`, menghitung selisih fisik riil (`countedQty - stockQty`), validasi alasan minimal 5 karakter, dan audit log `STOCK_OPNAME`.
- Layanan pesanan pembelian (Purchase Order) `src/lib/services/purchase-order.ts` dan buku vendor `src/lib/services/vendor-ledger.ts`:
  - `createPurchaseOrder`: Pembuatan draf PO baru (`status: DRAFT`).
  - `updatePurchaseOrder`: Perubahan draf PO hanya pada status `DRAFT`.
  - `orderPurchaseOrder`: Transisi status `DRAFT` -> `ORDERED`, alokasi nomor urut atomik `allocateVendorPoSeq` dan format resmi dokumen PO (`KODEVENDOR/PO/DD/MM/YYYY/NNNN`).
  - `receivePurchaseOrder`: Penerimaan barang pesanan (`PARTIAL_RECEIVED` atau `RECEIVED`), menambah stok fisik via `moveStock` (`PO_RECEIPT`), serta opsi perbarui HPP master (`updateHpp: true`) yang menaikkan `Product.rev` dan mencatat entri `PriceHistory` (`field: 'COST'`).
  - `cancelPurchaseOrder`: Pembatalan PO (`status: CANCELLED`); ditolak 409 `CANNOT_CANCEL` jika sudah ada barang yang diterima di gudang (harus lewat koreksi stok manual).
  - `recordVendorPayment`: Pencatatan pembayaran vendor (`VendorPayment`), otomatis menghitung ulang `paidTotal` PO terkait.
  - `getVendorLedger`: Buku Transaksi Vendor menggabungkan seluruh tagihan PO non-batal (Debit) dan pembayaran (Kredit), mengurutkan secara kronologis dan menghitung saldo hutang berjalan (*running balance*).
- Route Handler API Stok, PO, dan Vendor Ledger:
  - `GET /api/v1/stock`: Ringkasan metrik stok produk, filter stok minus, dan paginasi.
  - `GET /api/v1/stock/movements`: Riwayat mutasi stok fisik dengan filter produk dan tipe mutasi.
  - `POST /api/v1/stock/adjust`: Penyesuaian stok manual khusus Super Admin.
  - `POST /api/v1/stock/opname`: Stock opname fisik riil khusus Super Admin.
  - `GET /api/v1/purchase-orders` & `POST /api/v1/purchase-orders`: Daftar dan pembuatan PO.
  - `GET /api/v1/purchase-orders/:id` & `PATCH /api/v1/purchase-orders/:id`: Detail dan penyuntingan draf PO.
  - `POST /api/v1/purchase-orders/:id/order`: Penerbitan nomor resmi PO.
  - `POST /api/v1/purchase-orders/:id/receive`: Penerimaan barang bertahap / penuh dan opsi update HPP master.
  - `POST /api/v1/purchase-orders/:id/cancel`: Pembatalan PO dengan alasan minimal 5 karakter.
  - `POST /api/v1/vendors/:id/payments`: Pencatatan pembayaran ke vendor.
  - `GET /api/v1/vendors/:id/transactions`: Buku Transaksi Vendor beserta saldo hutang berjalan.
- Rangkaian pengujian integrasi stok dan PO:
  - `tests/integration/stock.test.ts` (6 tes): Verifikasi pergerakan stok, penolakan alasan < 5 karakter, opname riil, reservasi, dan **Tes 17.3 nomor 7** (dua persetujuan serentak berebut stok terakhir, tepat satu berhasil dan satu gagal 409).
  - `tests/integration/purchase-orders.test.ts` (4 tes): Siklus hidup PO lengkap, penerimaan + mutasi + update HPP master dengan `PriceHistory`, proteksi pembatalan bila ada barang diterima, dan perhitungan saldo buku transaksi vendor.
  - `tests/integration/permissions.test.ts`: Diperluas menjadi 61 tes matriks otorisasi (seluruh endpoint stok, PO, dan ledger vendor menolak staf Sales 403 `FORBIDDEN`).
- Antarmuka Pengguna (UI) responsif hingga lebar 360 px:
  - `/stock` (`src/app/(app)/stock/page.tsx`): Halaman manajemen stok dengan 4 kartu metrik (total fisik, reservasi, tersedia, item minus), tabel desktop & kartu mobile, modal koreksi stok, modal opname fisik, dan modal riwayat mutasi stok.
  - `/purchase-orders` (`src/app/(app)/purchase-orders/page.tsx`): Halaman daftar PO dengan filter status, vendor, paginasi, dan tombol pembuatan PO baru.
  - `/purchase-orders/new` (`src/app/(app)/purchase-orders/new/page.tsx`): Formulir pembuatan PO baru dengan kalkulasi biaya dinamis, input uang via `MoneyInput`, dan penambahan baris produk.
  - `/purchase-orders/[id]` (`src/app/(app)/purchase-orders/[id]/page.tsx`): Halaman detail PO lengkap dengan status progress bar, tombol "Pesan Sekarang", modal "Terima Barang" dengan opsi update HPP, modal "Catat Bayar Vendor", dan modal "Batalkan PO".
  - `/vendors/[id]` (`src/app/(app)/vendors/[id]/page.tsx`): Profil vendor dan Buku Transaksi Vendor (Vendor Ledger) dengan 3 kartu metrik hutang (Total Pembelian, Total Pembayaran, Sisa Hutang Berjalan), linimasa mutasi debit-kredit, dan modal pencatatan pembayaran.
  - Menu navigasi Super Admin di `src/components/AppShell.tsx`: Ditambahkan item "Stok & Opname" (`/stock`) dan "Purchase Order" (`/purchase-orders`), serta perbaruan nama "Produk & Harga" (`/products`).
  - Akses cepat "Buku Transaksi" pada tabel dan kartu vendor di `src/app/(app)/vendors/page.tsx`.

- Antarmuka formulir pesanan interaktif `src/components/orders/OrderForm.tsx` (digunakan pada `/orders/new` dan `/orders/[id]/edit`) sesuai Seksi 10.4, 11.1, 11.3, dan 11.4:
  - Pencarian dan pemilihan pelanggan dengan pengisian otomatis alamat pengiriman bawaan customer.
  - Tambah, ubah, dan hapus baris produk dengan dukungan jenis diskon fleksibel (persen via `PercentInput`, nominal total baris via `MoneyInput`, atau pilihan promo/subsidi aktif dari `/customers/:id/pricing`).
  - Deteksi harga di bawah batas minimal (`belowMin`) dengan highlight visual border/background merah dan banner peringatan resmi.
  - Penegakan validasi wajib `belowMinReason` (minimal 5 karakter) jika terdapat item yang dijual di bawah floor price.
  - Panel kalkulasi ringkasan real-time via `POST /api/v1/orders/preview` (debounced 300 ms): subtotal, total diskon, barang bersih, ongkir ditagihkan, PPN usaha, grand total, uang muka (DP), dan sisa pelunasan (UI tidak menghitung sendiri).
  - Panel simulasi profit real-time khusus Super Admin: pendapatan barang bersih, total HPP (COGS), biaya kirim riil, estimasi laba bersih, margin %, dan indikator peringatan merah bila laba negatif.
  - Modal konfirmasi draf pesanan sebelum penyimpanan (`POST /orders` atau `PATCH /orders/:id`).
- Halaman daftar pesanan `/orders` (`src/app/(app)/orders/page.tsx`):
  - Pencarian debounced 300 ms (nomor order, kode, atau nama pelanggan).
  - Filter status lengkap (`DRAFT`, `PENDING_APPROVAL`, `AWAITING_DP`, `IN_PROCESS`, `FINAL_PENDING_APPROVAL`, `AWAITING_FINAL_PAYMENT`, `COMPLETED`, `REVISION_REQUIRED`, `CANCELLED`).
  - Filter pelanggan dan rentang tanggal pesanan (`from` - `to`).
  - Tampilan dual responsif: tabel desktop dengan info item & status, serta kartu mobile responsif hingga lebar 360 px tanpa scroll horizontal.
  - Paginasi server lengkap (`page`, `limit`, `totalPages`, navigasi sebelumnya/selanjutnya).
  - 3 Keadaan UI standar: `Skeleton` saat memuat, `EmptyState` jika data kosong dengan aksi reset filter/buat pesanan, dan `ErrorState` dengan tombol coba lagi.
- Halaman detail pesanan `/orders/[id]` (`src/app/(app)/orders/[id]/page.tsx`):
  - Header nomor dokumen / draf, tanggal order, versi & rev, status badge, serta badge harga di bawah batas minimal.
  - Kartu informasi pelanggan, alamat pengiriman, catatan, dan pengingat siklus interval pesanan berulang.
  - Banner peringatan alasan di bawah minimal, catatan revisi penolakan, dan catatan persetujuan khusus (override).
  - Tabel rincian produk (desktop) dan kartu produk mobile dengan rincian harga deal, diskon, subtotal bersih, status belowMin, serta HPP khusus Super Admin.
  - Kartu ringkasan keuangan lengkap (subtotal, diskon, barang bersih, ongkir, PPN, grand total, DP, sisa pelunasan).
  - Panel simulasi profit khusus Super Admin dengan alert bila profit/margin negatif.
  - Aksi tombol "Edit Draf" untuk status `DRAFT` atau `REVISION_REQUIRED` menuju `/orders/[id]/edit`.
  - Aksi tombol "Hapus Draf" khusus Super Admin dengan modal `ConfirmTypeDialog` (wajib mengetikkan nomor dokumen/ID).
- Halaman pembuatan draf baru `/orders/new` (`src/app/(app)/orders/new/page.tsx`) dan halaman edit draf `/orders/[id]/edit` (`src/app/(app)/orders/[id]/edit/page.tsx`) dengan proteksi status (hanya status `DRAFT` atau `REVISION_REQUIRED` yang dapat diedit).
- Helper domain pemformatan persentase dari basis points `formatPercentFromBps` di `src/lib/domain/money.ts` disertai pengujian unit di `tests/unit/money.test.ts`.


- Layanan perhitungan snapshot order `buildOrderSnapshot` (`src/lib/services/order.ts`) yang memvalidasi pelanggan (isolasi sales), menolak produk duplikat (422 `DUPLICATE_PRODUCT`), memeriksa keaktifan produk dan promo (`PROMO_NOT_VALID`), menerapkan floor bertingkat (`baseFloor`, `lineFloor`), mendeteksi harga di bawah batas (`belowMin`), menghitung PPN usaha, serta menghasilkan simulasi profit (T2.5 & Seksi 10.4).
- Skema validasi Zod order (`src/lib/validation/order.ts`): `OrderLineSchema`, `OrderCreateSchema`, `OrderUpdateSchema`, dan `OrderDeleteSchema` (T2.5 & Seksi 10.4).
- Endpoint pratinjau kalkulasi pesanan `POST /api/v1/orders/preview` (Super Admin & Sales) untuk menghitung total order real-time, DP, PPN, dan daftar peringatan harga di bawah minimal tanpa menyimpan ke database (T2.5 & Seksi 10.4).
- Endpoint CRUD draf pesanan (`src/app/api/v1/orders/route.ts` & `src/app/api/v1/orders/[id]/route.ts`):
  - `POST /api/v1/orders` (Super Admin & Sales) membuat draf pesanan baru (`status: DRAFT`, `version: 1`, `rev: 0`) dengan audit log `ORDER_CREATE` (T2.5 & Seksi 10.5).
  - `GET /api/v1/orders` (Super Admin & Sales) mengambil daftar order dengan filter status, customer, sales (khusus Super Admin), rentang tanggal, pencarian, dan paginasi; Sales dibatasi hanya melihat order miliknya sendiri (T2.5 & Seksi 10.5).
  - `GET /api/v1/orders/:id` (Super Admin & Sales) detail lengkap pesanan dengan penegakan DTO per role (Sales tidak pernah menerima `costPrice`, HPP, atau objek `profit`; Super Admin menerima rincian `costPrice` dan simulasi `profit`) (T2.5 & Seksi 10.3).
  - `PATCH /api/v1/orders/:id` (Super Admin & Sales) memperbarui draf pesanan hanya pada status `DRAFT` atau `REVISION_REQUIRED` dengan verifikasi penguncian optimistik versi `rev` (penolakan 409 `OPTIMISTIC_LOCK_ERROR` atau `INVALID_STATE`) dan audit log `ORDER_UPDATE` (T2.5 & Seksi 10.5).
  - `DELETE /api/v1/orders/:id` (khusus Super Admin; Sales ditolak 403 `FORBIDDEN`) melakukan soft delete order dengan verifikasi ketik ulang teks konfirmasi (`confirm === orderNo ?? id`, 422 `CONFIRM_MISMATCH`) dan audit log `ORDER_DELETE` (T2.5 & Seksi 9.5).
- Rangkaian pengujian integrasi pesanan `tests/integration/orders.test.ts` (8 skenario tes) membuktikan: kesesuaian angka total dengan Fixture 7.7, perlindungan absolut HPP/profit dari Sales (`assertNoSecretKeys`), penolakan produk ganda, validasi promo kedaluwarsa, penurunan floor oleh promo valid, penandaan `belowMin`, siklus hidup draf order (create -> get -> patch -> delete), dan isolasi sales (T2.5).
- Perluasan matriks hak akses `tests/integration/permissions.test.ts` memverifikasi penolakan (403 `FORBIDDEN`) terhadap Sales pada endpoint `DELETE /api/v1/orders/:id` (T2.5 & Seksi 17.4 b).

- Layanan penomoran urut dokumen atomik `nextSeq` (`src/lib/services/counter.ts`) berbasis PostgreSQL UPSERT (`INSERT INTO "DocumentCounter" ... ON CONFLICT DO UPDATE SET "lastSeq" = "DocumentCounter"."lastSeq" + 1 RETURNING "lastSeq"`), menjamin nomor urut unik, berurutan, dan tidak meninggalkan lubang (T2.4 & Seksi 7.8).
- Konstanta scope penomoran `CounterScope` (`ORDER_SEQ`, `PO_SEQ`, `CREDIT_NOTE_SEQ`) serta fungsi helper alokasi: `allocateCustomerOrderSeq`, `allocateVendorPoSeq`, dan `allocateCustomerCreditNoteSeq` (T2.4).
- Helper domain format nomor dokumen resmi di `src/lib/domain/numbering.ts`: `orderNumber`, `suratJalanNumber`, `creditNoteNumber`, dan `purchaseOrderNumber` terintegrasi dengan zona waktu WIB (Asia/Jakarta) dan format `KODE/JENIS/DD/MM/YYYY/NNNN` (T2.4 & Seksi 7.8).
- Suite pengujian integrasi penomoran dokumen paralel `tests/integration/counter.test.ts` (9 skenario tes) memverifikasi: 20 alokasi serentak (`Promise.all`) menghasilkan urutan 1–20 unik tanpa celah, urutan mandiri terpisah per customer, isolasi antar unit usaha, isolasi antar scope, transaksi gagal/rollback tidak menghanguskan nomor urut, dan stress test 50 alokasi serentak (T2.4 & Seksi 17.3 nomor 5).

- Endpoint kalkulasi harga per pelanggan `GET /api/v1/customers/:id/pricing` (Super Admin & Sales dengan pembatasan `customerScope`), menyajikan harga dasar (`basePrice`), harga minimal default produk, harga minimal khusus pelanggan (`CustomerMinPrice`), floor efektif (`effectiveFloorPrice`), dan diskon promo aktif (`floorWithPromo`), dengan garansi perlindungan mutlak atas kerahasiaan `costPrice` (HPP tidak pernah bocor ke respons API atau staf Sales) (T2.3 & Seksi 7.2, 10.5).
- Endpoint manajemen harga minimal per pelanggan `GET/PUT/DELETE /api/v1/customers/:id/min-prices` khusus Super Admin (Sales ditolak 403 `FORBIDDEN`): validasi `minPrice <= basePrice` (penolakan 422 `PRICE_INVALID`), alasan bisnis wajib diisi minimal 3 karakter, eksekusi transaksi atomik upsert `CustomerMinPrice`, pencatatan riwayat perubahan harga `PriceHistory` (`field: CUSTOMER_MIN`, `oldValue`, `newValue`, `reason`, `changedById`), dan pencatatan audit log `CUSTOMER_MIN_PRICE_SET` / `CUSTOMER_MIN_PRICE_RESET` (T2.3 & Seksi 7.2, 17.3 nomor 12 & 13).
- Endpoint manajemen promo dan subsidi pelanggan `GET/POST /api/v1/customers/:id/promos` serta `GET/PATCH/DELETE /api/v1/customer-promos/:id` khusus Super Admin (Sales ditolak 403 `FORBIDDEN`): klasifikasi sumber (`PROMO` / `SUBSIDY`), tipe potongan (`PERCENT` basis points atau `AMOUNT` Rupiah nominal), validasi rentang tanggal aktif (`validTo >= validFrom`), soft delete promo (`deletedAt: new Date(), isActive: false`), dan audit log `CUSTOMER_PROMO_CREATE`, `CUSTOMER_PROMO_UPDATE`, `CUSTOMER_PROMO_DELETE` (T2.3).
- Endpoint riwayat penyesuaian harga pelanggan `GET /api/v1/customers/:id/price-history` khusus Super Admin menyajikan kronologi lengkap perubahan harga minimal pelanggan (`CUSTOMER_MIN`) dengan rincian nilai lama, nilai baru, alasan, user pengubah, dan waktu pencatatan (T2.3 & Seksi 10.5).
- Antarmuka Tab "Harga & Promo" pada halaman detail pelanggan `/customers/[id]` yang mencakup: (1) Tabel katalog produk dengan harga dasar, floor acuan, floor khusus customer, indikator status kustom, modal set floor dengan `MoneyInput`, dan dialog reset floor dengan alasan wajib; (2) Kartu daftar promo & subsidi dengan badge status, toggle aktifasi, tombol hapus, dan modal tambah promo interaktif dengan `PercentInput` / `MoneyInput`; (3) Modal kronologi riwayat harga pelanggan; didesain mobile-first responsif hingga layar 360 px dengan target sentuh >= 44 px (T2.3 & Seksi 11.2).
- Rangkaian pengujian integrasi harga pelanggan `tests/integration/customer-pricing.test.ts` (8 skenario tes) mencakup kalkulasi floor & promo, penolakan floor di atas harga dasar, kewajiban alasan revisi, pencatatan transaksi atomik `PriceHistory`, pemulihan ke floor default, CRUD promo, riwayat harga, dan proteksi isolasi Sales (T2.3 & Seksi 17.3 nomor 13).
- Perluasan matriks hak akses `tests/integration/permissions.test.ts` dengan 9 skenario otorisasi baru memverifikasi penolakan (403 `FORBIDDEN`) terhadap akun Sales pada seluruh mutasi floor, promo, dan akses riwayat harga pelanggan (T2.3 & Seksi 17.4 b).

- Linimasa Pelanggan `GET /api/v1/customers/:id/timeline` yang menggabungkan interaksi CRM (`CrmInteraction`) dan riwayat order (`Order`) secara kronologis menurun terurut tanggal (T2.2 & Seksi 10.3).
- Manajemen Interaksi CRM `GET/POST /api/v1/customers/:id/interactions` dengan audit log `CRM_INTERACTION_CREATE` dan otomatisasi pembuatan `CrmTask` secara atomik di dalam database transaction saat `nextFollowUpAt` diisi (T2.2).
- Manajemen Tugas Follow-up CRM `GET/POST /api/v1/crm/tasks` dan `GET/PATCH/DELETE /api/v1/crm/tasks/:id` dengan filter status `PENDING`, `OVERDUE`, `DONE`, serta fungsionalitas centang selesai instan (`done: true` mengisi `doneAt`, `done: false` mengosongkan kembali) (T2.2).
- Isolasi Hak Akses Sales pada seluruh operasi CRM: penegakan aturan 17.4 d & 16.2 dengan pengembalian status 404 `NOT_FOUND` saat sales mencoba mengakses timeline, mencatat interaksi, atau memodifikasi tugas customer milik sales lain untuk mencegah enumerasi resource.
- Halaman UI Detail Pelanggan `/customers/[id]` dengan 5 tab (Ringkasan Kontak & Alamat, Timeline CRM, Tugas Follow-up, Order, Harga & Promo), selektor cepat tahap pipeline pelanggan (`LEAD`, `PROSPECT`, `DEAL`, `REPEAT`, `LOST`), modal catat interaksi dengan bantuan follow-up otomatis, modal tambah tugas, tautan instan telepon & WhatsApp, responsif mobile 360 px, dan 3 keadaan wajib UI (Skeleton, EmptyState, ErrorState) (T2.2).
- Rangkaian pengujian integrasi CRM `tests/integration/crm.test.ts` (10 tes) mencakup verifikasi linimasa terurut menurun, konversi BigInt nilai pesanan ke integer Rupiah aman, otomatisasi tugas follow-up, filter status tugas, isolasi sales & multi-usaha, dan uji kebocoran kunci rahasia (`assertNoSecretKeys`) (T2.2).
- Master Customer CRUD (`/api/v1/customers` dan `/api/v1/customers/:id`) dengan kode kapital unik per unit usaha dan pencatatan audit log `CUSTOMER_CREATE`, `CUSTOMER_UPDATE`, `CUSTOMER_DELETE` (T2.1 & Seksi 10.3).
- Helper isolasi hak akses pelanggan `customerScope` (`src/lib/services/scopes.ts`) menegakkan isolasi multi-usaha dan isolasi sales: staf sales hanya melihat dan mengelola customer miliknya sendiri (`assignedSalesId = ctx.user.id`), sedangkan Super Admin melihat seluruh customer di unit usaha aktif (T2.1 & Seksi 16.2).
- Penugasan otomatis sales pada pendaftaran pelanggan baru: saat Sales membuat pelanggan, sistem secara otomatis mengunci `assignedSalesId = ctx.user.id` tanpa dapat menugaskan ke staf lain (T2.1 & Seksi 10.3).
- Aturan imutabilitas kode pelanggan (Seksi 18.1 nomor 15): penolakan perubahan kode pelanggan (409 `INVALID_STATE`) begitu pelanggan telah memiliki faktur/invoice.
- Penguncian optimistik (`rev`): verifikasi versi revisi saat edit pelanggan untuk mencegah race condition penulisan bersamaan (409 `OPTIMISTIC_LOCK_ERROR`).
- Endpoint pengalihan sales `POST /api/v1/customers/:id/reassign` khusus Super Admin (Sales ditolak 403 `FORBIDDEN`) dengan opsi pemindahan seluruh pesanan berjalan `moveOpenOrders: true`, serta pengalihan otomatis pengingat (`Reminder`) dan tugas tindak lanjut (`CrmTask`) (T2.1 & Seksi 18.1 nomor 16).
- Proteksi soft delete pelanggan (Seksi 18.1 nomor 19): penolakan penghapusan pelanggan (409 `HAS_ACTIVE_ORDERS`) apabila masih memiliki pesanan berjalan yang belum selesai (`COMPLETED`) atau dibatalkan (`CANCELLED`).
- Antarmuka pengguna responsif `/customers` dengan pencarian debounced 300 ms, filter tahap pipeline CRM (`LEAD`, `PROSPECT`, `DEAL`, `REPEAT`, `LOST`), filter staf sales untuk Super Admin, kartu mobile responsif 360 px, modal tambah/edit pelanggan, modal pengalihan sales, dan dialog konfirmasi pengetikan kode pelanggan untuk penghapusan (T2.1 & Seksi 11.2).
- Suite pengujian integrasi pelanggan `tests/integration/customers.test.ts` (9 skenario pengujian) mencakup CRUD, isolasi sales, isolasi antar-usaha, imutabilitas kode pelanggan, optimistik lock, pengalihan sales dengan pemindahan order terbuka, proteksi soft delete terhadap pesanan aktif, dan uji kebocoran kunci rahasia (`assertNoSecretKeys`) (T2.1 & Seksi 17.4 d).
- Perluasan matriks hak akses `tests/integration/permissions.test.ts` memverifikasi penolakan (403 `FORBIDDEN`) terhadap akun Sales pada endpoint pengalihan sales `POST /api/v1/customers/:id/reassign` (T2.1 & Seksi 17.4 b).

- Route Handler CRUD catatan pembaruan sistem (`ReleaseNote`): `GET /api/v1/updates`, `GET /api/v1/updates/unread-count`, `POST /api/v1/updates/mark-seen`, `POST /api/v1/updates`, `GET /api/v1/updates/:id`, `PATCH /api/v1/updates/:id`, `POST /api/v1/updates/:id/publish`, dan `DELETE /api/v1/updates/:id` (T1.8 & Seksi 4.3).
- Otorisasi dan proteksi peran rilis: Sales hanya dapat melihat rilis berstatus terbit dan ditolak (403 FORBIDDEN) saat mencoba membuat, mengubah, menerbitkan, atau menghapus catatan rilis (T1.8 & Seksi 5.1).
- Penghitungan unread releases dinamis berbasis `publishedAt > (user.lastSeenReleaseAt ?? new Date(0))` serta pembaruan otomatis timestamp `lastSeenReleaseAt` saat pengguna membuka halaman rilis (T1.8 & Seksi 4.3).
- Komponen render markdown aman `SafeMarkdown` (`src/components/ui/SafeMarkdown.tsx`) yang merender heading, list berurutan & tak berurutan, kutipan, format inline (bold, italic, strikethrough, inline code), blok kode fenced, dan tautan bersyarat protokol aman tanpa pernah memanggil `dangerouslySetInnerHTML` serta meng-escape seluruh tag HTML mentah untuk mencegah injeksi XSS (T1.8 & Seksi 4.3).
- Indikator badge "Baru" pada navigasi sidebar dan header `AppShell.tsx` bila terdapat catatan rilis baru yang belum dibaca oleh pengguna (T1.8 & Seksi 4.3).
- Antarmuka pengguna manajemen catatan rilis `/updates` lengkap dengan daftar rilis terurut terbaru dulu, tampilan kartu mobile-first, modal tambah/edit rilis dengan pratinjau live markdown, modal terbitkan rilis (dengan opsi broadcast Telegram), dan modal hapus rilis khusus Super Admin (T1.8 & Seksi 11.3).
- Skrip otomatisasi `pnpm release:draft` (`scripts/release-draft.ts`) untuk mengekstrak entri `[Unreleased]` teratas dari `CHANGELOG.md` dan membuat draf `ReleaseNote` di database untuk dirapikan Super Admin (T1.8 & Seksi 4.3).
- Suite pengujian unit `tests/unit/safe-markdown.test.ts` (9 skenario pengujian) memverifikasi ketiadaan `dangerouslySetInnerHTML`, parsing format markdown, dan pencegahan eksekusi HTML/XSS (T1.8).
- Suite pengujian integrasi `tests/integration/updates.test.ts` (7 skenario pengujian) mencakup siklus hidup rilis, audit logging, unread-count, mark-seen, serta isolasi akses Sales (T1.8).
- Perluasan matriks hak akses `tests/integration/permissions.test.ts` memverifikasi penolakan (403 FORBIDDEN) terhadap akun Sales pada 4 mutasi endpoint rilis (T1.8 & Seksi 17.4 b).

- CRUD Master vendor dan rekanan logistik (`/api/v1/vendors` dan `/api/v1/vendors/:id`) dengan klasifikasi jenis `SUPPLIER` (pemasok barang) dan `TRANSPORT` (jasa pengangkutan/ekspedisi) khusus Super Admin (T1.7).
- Penegakan keunikan kode vendor per unit usaha dalam status aktif (`deletedAt: null`) dan otomatisasi kode huruf besar (T1.7).
- Soft delete vendor `DELETE /api/v1/vendors/:id` dengan pencatatan audit log `VENDOR_DELETE` yang mempertahankan integritas data transaksi masa lalu (T1.7).
- Antarmuka pengguna manajemen vendor `/vendors` dengan tabel data lengkap untuk desktop dan tampilan kartu responsif pada layar sempit hingga 360 px tanpa scroll horizontal (T1.7).
- Modal tambah dan ubah vendor lengkap dengan pemilihan jenis vendor, informasi kontak PIC, data rekening pembayaran, term of payment (TOP), dan catatan khusus (T1.7).
- Suite pengujian integrasi vendor `tests/integration/vendors.test.ts` (9 skenario pengujian) mencakup CRUD, keunikan kode, filtering jenis, soft delete, dan proteksi otorisasi (T1.7).
- Perluasan matriks hak akses `tests/integration/permissions.test.ts` memverifikasi penolakan (403 FORBIDDEN) terhadap akun Sales pada 5 endpoint vendor (T1.7 & Seksi 17.4 b).

- Halaman katalog produk `/products` dengan pemisahan tampilan berdasarkan peran: Super Admin melihat HPP modal, harga dasar, margin Rupiah & bps, dan harga minimal; Sales hanya melihat harga dasar, harga minimal, dan stok tersedia tanpa kolom/data rahasia HPP atau margin (T1.6 & Seksi 10.3).
- Desain antarmuka mobile-first responsif: tampilan kartu (card view) pada layar sempit hingga 360 px tanpa scroll horizontal, dan tabel data lengkap pada desktop (T1.6).
- Komponen input uang `MoneyInput` (`src/components/ui/MoneyInput.tsx`) yang menerima dan membersihkan input atau paste format Rupiah (seperti "Rp 1.250.000") menjadi bilangan bulat aman murni (1250000) (T1.6 & Seksi 20.4).
- Komponen input persentase `PercentInput` (`src/components/ui/PercentInput.tsx`) yang menerima desimal ("3,5") dan menghasilkan basis points bulat (350 bps) maksimal 2 desimal (T1.6).
- Dialog konfirmasi pengetikan teks `ConfirmTypeDialog` (`src/components/ui/ConfirmTypeDialog.tsx`) untuk proteksi soft delete (T1.6).
- Komponen label status terpadu `StatusBadge` (`src/components/ui/StatusBadge.tsx`) dengan pemetaan warna dan label Indonesia (T1.6).
- Modal tambah dan ubah produk dengan validasi `minPrice <= basePrice`, deteksi otomatis perubahan harga yang mewajibkan input `priceReason`, dan galeri kelola foto produk maksimal 8 berkas (T1.6).
- Halaman riwayat perubahan harga `/products/[id]/prices` menyajikan kronologi penyesuaian harga, selisih nominal, alasan bisnis, waktu WIB, dan identitas pengubah khusus untuk Super Admin (T1.6).
- Suite pengujian unit `tests/unit/ui-inputs.test.ts` untuk memverifikasi logika `MoneyInput`, `PercentInput`, dan aturan validasi harga (T1.6).
- Integrasi tautan cepat "Katalog Produk" pada dashboard (`/dashboard`) untuk kemudahan navigasi Sales dan Super Admin (T1.6).

- CRUD Kategori produk (`/api/v1/categories` dan `/api/v1/categories/:id`) khusus Super Admin (read untuk Sales) dengan keunikan nama per unit usaha dan pencatatan audit log (T1.5).
- CRUD Master produk (`/api/v1/products` dan `/api/v1/products/:id`) dengan filtering pencarian teks `q`, kategori `categoryId`, status aktif `active`, dan isolasi DTO per role (T1.5 & Seksi 10.3).
- DTO Produk per Role (`src/lib/dto/product.ts`): Sales tidak pernah menerima `costPrice`, `hpp`, `margin`, `marginAmount`, `marginBps`, atau kunci rahasia internal lainnya (lolos `assertNoSecretKeys` Seksi 17.4 a) (T1.5).
- Validasi harga: `minPrice <= basePrice` di Route Handler, penolakan jika `minPrice > basePrice` dengan 422 `VALIDATION_ERROR` (T1.5 & Seksi 10.3).
- Penguncian optimistik (`rev`): verifikasi versi revisi saat edit produk, penolakan jika data sudah basi dengan 409 `OPTIMISTIC_LOCK_ERROR` (T1.5 & Seksi 10.3).
- Aturan pencatatan riwayat harga (`PriceHistory`): perubahan `costPrice`, `basePrice`, atau `minPrice` mewajibkan pengisian `priceReason` (minimal 3 karakter), mencatat riwayat perubahan secara append-only, dan menaikkan nilai `rev` (T1.5).
- Endpoint riwayat harga `GET /api/v1/products/:id/price-history` khusus Super Admin (Sales menerima 403 FORBIDDEN) (T1.5).
- Soft delete produk `DELETE /api/v1/products/:id` dengan konfirmasi teks nama produk yang persis (`confirm: product.name`) (T1.5 & Seksi 10.3).
- Manajemen foto produk (`POST /api/v1/products/:id/images`, `PATCH /api/v1/products/:id/images/:imageId`, `DELETE /api/v1/products/:id/images/:imageId`): batas maksimal 8 foto per produk, konversi WebP 82 1600px, magic bytes check, dan rotasi otomatis foto utama saat foto utama dihapus (T1.5 & Seksi 10.3).
- Suite pengujian integrasi katalog `tests/integration/products.test.ts` (15 skenario pengujian) mencakup kebocoran DTO, harga, optimistic lock, price history, soft delete, dan batas 8 foto (T1.5).
- Perluasan matriks hak akses `tests/integration/permissions.test.ts` dengan 10 endpoint katalog memverifikasi role Sales ditolak (403 FORBIDDEN) (T1.5 & Seksi 17.4 b).

- Manajemen pengguna sales (CRUD `/api/v1/users` dan `/api/v1/users/:id`), termasuk filtering usaha, pencarian, dan penugasan skema komisi khusus (T1.4).
- Pendaftaran sales baru dengan username huruf kecil, password hashing argon2id, status aktif, dan kewajiban ganti password (`mustChangePassword = true`) (T1.4).
- Endpoint reset password pengguna `POST /api/v1/users/:id/reset-password` dengan pencabutan otomatis seluruh sesi aktif dan audit log (T1.4).
- Endpoint aktivasi `POST /api/v1/users/:id/activate` dan penonaktifan `POST /api/v1/users/:id/deactivate` dengan pencabutan instan seluruh sesi aktif (T1.4).
- Soft delete pengguna `DELETE /api/v1/users/:id` dengan proteksi pencegahan penghapusan akun sendiri (T1.4).
- Modul dan endpoint kode tautan bot Telegram `POST /api/v1/auth/telegram/link-code` (alfabet 8 karakter `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`, hash SHA-256 tersimpan di database, masa berlaku 10 menit, dan kedaluwarsa kode lama otomatis) serta pemutusan tautan `DELETE /api/v1/auth/telegram` (T1.4 & Seksi 6.3).
- Antarmuka manajemen pengguna `/settings/users` untuk Super Admin dengan tabel responsif, filter unit usaha, modal tambah sales, edit akun, dan reset password (T1.4).
- Integrasi tombol "Hubungkan Telegram" dan "Putuskan Tautan" pada halaman profil `/profile` dengan kode tautan dan tombol langsung ke bot Telegram (T1.4).
- Pengujian hak akses berbasis tabel `tests/integration/permissions.test.ts` (Seksi 17.4 b) memverifikasi penolakan (403 FORBIDDEN) saat role Sales memanggil endpoint Super Admin.
- Suite pengujian integrasi pengguna `tests/integration/users.test.ts` mencakup siklus hidup pengguna, reset password, deaktivasi, dan kode tautan Telegram (T1.4).
- Manajemen unit usaha (CRUD `/api/v1/businesses` dan `/api/v1/businesses/:id`), termasuk pengaturan legalitas, kode usaha kapital unik, operasional (PPN & rate, stok negatif, syarat lunas sebelum kirim, DP default, jatuh tempo, siklus repeat order), tema invoice, dan skema komisi sales (T1.3).
- Aturan ketat imutabilitas kode usaha: kode usaha tidak dapat diubah setelah ada transaksi order (`orderCount > 0` mengembalikan 409 `INVALID_STATE`) (T1.3 & Seksi 10.5).
- Manajemen rekening bank unit usaha (`/api/v1/businesses/:id/bank-accounts` dan `/api/v1/bank-accounts/:id`) dengan penegakan otomatis aturan satu rekening default per unit usaha dalam transaksi database (T1.3 & Seksi 6.2).
- Modul berkas dan penyimpanan aman `src/lib/files/fileService.ts` dengan deteksi magic bytes riil (JPEG, PNG, WebP, PDF), penolakan berkas rusak/palsu (422), isolasi PDF untuk foto/logo, kompresi otomatis WebP (kualitas 82, rotasi EXIF, max 1600px via `sharp`), penamaan UUID acak, dan proteksi path traversal (T1.3 & Seksi 16.3).
- Endpoint penyajian berkas `/api/v1/files/:businessId/:kind/:filename` dengan header `X-Content-Type-Options: nosniff`, `Cache-Control: no-store` untuk bukti transfer (proof), dan pembatasan isolasi Sales (T1.3).
- Endpoint unggah logo usaha `POST /api/v1/businesses/:id/logo` khusus Super Admin (T1.3).
- Modul audit logging transaksional `src/lib/audit/audit.ts` dengan fungsi rekursif `toJsonSafe` yang mengubah BigInt ke number, Date ke ISO string, dan menghapus secara bersih field sensitif (`passwordHash`, `tokenHash`, `secret`, `initData`) (T1.3 & Seksi 16.5).
- Antarmuka pengguna pengaturan usaha lengkap dan responsif pada `src/app/(app)/settings/business/page.tsx` dengan formulir legalitas, pratinjau & upload logo, toggles operasional, tema faktur, skema komisi, modal unit usaha baru, dan manajemen rekening bank (T1.3).
- Suite pengujian unit dan integrasi untuk modul audit, layanan berkas, dan endpoint bisnis/rekening bank (T1.3).
- Skrip seed Super Admin produksi pada `prisma/seed.ts` membaca `SEED_SUPERADMIN_USERNAME` dan `SEED_SUPERADMIN_PASSWORD` (minimal 12 karakter), menolak eksekusi bila Super Admin sudah ada, dan menyetel `mustChangePassword = true` (T1.2).
- Antarmuka halaman login pada `src/app/(auth)/login/page.tsx` dengan target sentuh responsif (>= 44 px), input teks >= 16 px, indikator loading, dan pesan bantuan pemilik usaha (T1.2).
- Komponen kerangka aplikasi `AppShell` pada `src/components/AppShell.tsx` dengan sidebar desktop & drawer mobile untuk Super Admin, bar navigasi bawah untuk Sales (Beranda, Order, Customer, Pengingat, Lainnya), dan banner pengingat ganti password (T1.2).
- Tiga komponen status wajib `Skeleton`, `EmptyState`, dan `ErrorState` pada `src/components/ui/States.tsx` (T1.2).
- Endpoint dan antarmuka pengalih usaha Super Admin `POST /api/v1/session/business`, ringkasan usaha aktif `GET /api/v1/business`, dan daftar usaha `GET /api/v1/businesses` (T1.2).
- Halaman dashboard awal pada `src/app/(app)/dashboard/page.tsx` dan halaman profil pengguna dengan formulir ganti password pada `src/app/(app)/profile/page.tsx` (T1.2).
- Integrasi Tailwind CSS v3, PostCSS, dan ikon antarmuka `lucide-react` (T1.2).
- Autentikasi inti dengan password hashing argon2id (parameter OWASP: memoryCost 19456, timeCost 2, parallelism 1) pada `src/lib/auth/password.ts` (T1.1).
- Manajemen sesi berbasis token acak 32-byte (SHA-256 tersimpan di database), rotasi maksimal 5 sesi aktif, dan sliding expiration 7 hari pada `src/lib/auth/session.ts` (T1.1).
- Pembatasan percobaan login (rate limiting) 5 kali per username atau 20 kali per IP dalam 15 menit pada `src/lib/auth/rateLimit.ts` (T1.1).
- Proteksi CSRF same-origin untuk seluruh metode HTTP non-GET pada `src/lib/auth/origin.ts` (T1.1).
- Ekstraksi konteks sesi dan otorisasi role terpusat dengan pemblokiran `mustChangePassword` pada `src/lib/auth/context.ts` (T1.1).
- Wrapper API standar `withApi` dengan parsing schema Zod strict, serialisasi BigInt/Date, dan pemetaan error otomatis pada `src/lib/api/withApi.ts` (T1.1).
- Route Handler autentikasi: `POST /api/v1/auth/login`, `POST /api/v1/auth/logout`, `GET /api/v1/auth/me`, dan `POST /api/v1/auth/change-password` (T1.1).
- Rewrite URL perutean `/auth/:path*` menuju `/api/v1/auth/:path*` pada `next.config.ts` (T1.1).
- Suite pengujian unit dan integrasi (Tes 17.3 nomor 17) mencakup seluruh skenario kegagalan dan keberhasilan autentikasi (T1.1).

### Security

- Mitigasi serangan timing attack melalui verifikasi hash dummy saat username tidak ditemukan (T1.1).
- Penegakan atribut cookie sesi aman: `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`, `Max-Age=604800` (T1.1).
- Penyeragaman pesan kegagalan login selalu "Username atau password salah" (T1.1).

## [0.1.0] - 2026-11-07

### Added

- Inisialisasi struktur repositori dan konfigurasi proyek Next.js App Router dengan TypeScript strict (T0.1).
- Konfigurasi runtime Node.js v22 LTS pada `.nvmrc` dan `package.json` engines (T0.1).
- Manajemen dependensi terkunci persis menggunakan `pnpm` (T0.1).
- Konfigurasi linter ESLint (flat config) dan pemformat kode Prettier (T0.1).
- Pengaturan test runner Vitest untuk unit test dan Playwright untuk e2e test (T0.1).
- Dokumen hidup `docs/BLUEPRINT.md` mencakup 12 bab arsitektur utama (T0.1).
- Dokumen keputusan arsitektur awal `docs/adr/0001-uang-bigint.md` dan `docs/adr/0002-stack.md` (T0.1).
- Dokumen pelacak pertanyaan terbuka `docs/OPEN_QUESTIONS.md` (T0.1).
- Struktur direktori aplikasi sesuai bagian 3.2 panduan spesifikasi (T0.1).
- Validasi variabel environment berbasis Zod pada `src/lib/env.ts` (T0.2).
- Logger terstruktur Pino dengan sensor/redaction otomatis field sensitif (cookie, password, token, APP_SECRET, initData) pada `src/lib/logger.ts` (T0.2).
- Endpoint publik pemantauan status `GET /api/health` mengembalikan { ok, db, version } (T0.2).
- Konfigurasi database development dan testing PostgreSQL pada `docker-compose.dev.yml` (T0.2).
- Dockerfile multi-stage production dengan headless Chromium dan font terpasang untuk PDF rendering (T0.2).
- Template variabel environment lengkap `.env.example` (T0.2).
- Skema database lengkap 40 model dan 24 enum pada `prisma/schema.prisma` (T0.3).
- Migrasi database awal `20261107000001_init` dan SQL constraints `20261107000002_db_constraints` (T0.3).
- Jaring pengaman multi-tenant `src/lib/db.ts` dengan extension `TENANT_MODELS` dan `GUARDED_OPS` (T0.3).
- Integrasi `@prisma/adapter-pg` dan konfigurasi `prisma.config.ts` untuk Prisma 7 (T0.3).
- Tes integrasi database dengan `@electric-sql/pglite` membuktikan check constraint `product_min_le_base` dan trigger `audit_log_immutable` (T0.3).
- Dokumen keputusan arsitektur `docs/adr/0003-prisma-7-config.md` (T0.3).
- Implementasi fungsi murni logika keuangan di `src/lib/domain/` (money, pricing, order, profit, credit, commission, numbering, reminder, terbilang) dan `src/lib/format/parse.ts` (T0.4).
- Suite pengujian unit komprehensif mencakup 100% fungsi domain keuangan (T0.4).
- Verifikasi otomatis Fixture 7.7 contoh hitungan bisnis presisi angka demi angka (T0.4).
- Konfigurasi `globalSetup.ts` dengan proteksi pengaman URL database tes wajib berakhiran `_test` (T0.5).
- Utilitas isolasi database pengujian `tests/helpers/resetDb.ts` (T0.5).
- Generator entitas pengujian terstandar `tests/factories.ts` (T0.5).
- Detektor kebocoran field rahasia Sales `tests/helpers/leak.ts` dengan fungsi rekursif `assertNoSecretKeys` (T0.5).
- Perintah terpisah `test:unit` dan `test:int` pada `package.json` (T0.5).
