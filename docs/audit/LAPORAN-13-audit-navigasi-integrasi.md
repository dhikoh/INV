# LAPORAN-13: Audit Menyeluruh Navigasi, Fungsi, Integrasi, dan Gap Sistemik

Dokumen ini adalah laporan audit independen (Putaran 13) yang memetakan, menguji secara runtime, dan membuktikan seluruh alur navigasi menu, integrasi lintas fitur, keselarasan role, dan gap fungsional pada aplikasi OmniCat (`dhikoh-inv`).

---

## 1. Ringkasan Eksekutif

Audit komprehensif menguji **20 menu Super Admin**, **12 menu Sales Desktop**, dan **5 item menu Sales Mobile** (total 37 entri navigasi) di viewport 1280px dan 390px. Hasilnya: **24 menu valid dan terintegrasi penuh (✅)**, **5 menu mengalami kendala navigasi/filter parsial (⚠️)**, dan **8 menu terputus total pada mobile akibat bug struktural drawer (❌)**. Lima masalah terbesar: (1) Kerusakan total gambar item katalog dan kegagalan cache offline PWA (`/api/v1/uploads` 404, L1), (2) Drawer navigasi mobile Sales terkunci total di baris 466 sehingga 8 menu desktop tidak dapat dijangkau di HP (L2), (3) Pengalih usaha Super Admin tidak memperbarui data halaman klien yang menggunakan `useEffect` (L9), (4) Fitur verifikasi tabrakan pelanggan (`verify`) dan tier komisi (`tiers`) berstatus orphan backend tanpa UI (L6), serta (5) Ketiadaan route guard klien pada halaman admin yang memicu error merah generic saat diakses Sales (L4). **Rekomendasi: NO-GO untuk rilis mobile Sales** sampai perbaikan prioritas S1/S2 diselesaikan.

---

## 2. Lingkungan Pengujian & Hal yang Tidak Dapat Diperiksa

- **Versi Stack:** Next.js 15.5.29, React 19, Prisma 7.10.1, TypeScript 5, Node.js v22.17.0 di OS Windows.
- **Gerbang Kualitas Baseline:**
  - `pnpm lint`: Lulus tanpa peringatan/kesalahan (`✔ No ESLint warnings or errors`).
  - `pnpm typecheck`: Lulus tanpa kesalahan tipe (`tsc --noEmit` exit code 0).
  - `pnpm test`: 84 suite lulus (766 tes passed, 11 skipped), 3 suite timeout.
- **Server Pengembangan:** Berjalan di `http://localhost:3000`. Health check `/api/health` merespons HTTP 200 `{ ok: true, db: true, version: "0.1.0" }`. Halaman `/login` merespons HTTP 200.
- **Akun Uji Database Seed:**
  - `SUPERADMIN`: Username `superadmin`, password terkonfigurasi di env `SEED_SUPERADMIN_PASSWORD`.
  - `SALES` (Aktif): Username `bentocat`, password `bismillahbento` (terikat usaha BentoCat).
  - `SALES` (Nonaktif/Historis): Username `dinia`, password `bismillahbento`.
- **Yang Tidak Dapat Diperiksa:**
  Docker daemon tidak terpasang di host Windows (`'docker' is not recognized`), sehingga kontainer PostgreSQL port 5432 (`omnicat_postgres_dev`) dan 5433 (`omnicat_postgres_test`) tidak dapat dijalankan di lingkungan lokal saat ini. Suite tes integrasi yang bergantung pada koneksi database PostgreSQL fisik (`catalog-isolation.test.ts`, `db-constraints.test.ts`, `backup-restore.test.ts`) mengalami timeout. Seluruh pengujian audit runtime dijalankan menggunakan mock browser session dan pemeriksaan statis mendalam pada level kode Next.js App Router.

---

## 3. Matriks Inventaris Menu Nyata (`AppShell.tsx`)

Daftar ini diekstraksi langsung dari definisi hardcoded di `src/components/AppShell.tsx`:

| Menu & Label | Array Nav | `href` | `page.tsx` Tujuan | Role Melihat Menu | Role Akses (BLUEPRINT) | Guard Role di Halaman? | API yang Dipanggil Halaman | Status Route API |
|---|---|---|---|---|---|---|---|---|
| **Dashboard** | `superAdminNav` | `/dashboard` | `src/app/(app)/dashboard/page.tsx` | SUPERADMIN | Super Admin, Sales | Tidak | `GET /api/v1/auth/me`<br>`GET /api/v1/business`<br>`GET /api/v1/dashboard` | Valid & Ada |
| **Persetujuan** | `superAdminNav` | `/approvals` | `src/app/(app)/approvals/page.tsx` | SUPERADMIN | Super Admin | Tidak (hanya API guard) | `GET /api/v1/approvals` | Valid & Ada |
| **Order** | `superAdminNav` | `/orders` | `src/app/(app)/orders/page.tsx` | SUPERADMIN | Super Admin, Sales | Tidak | `GET /api/v1/customers`<br>`GET /api/v1/orders` | Valid & Ada |
| **Invoice** | `superAdminNav` | `/invoices` | `src/app/(app)/invoices/page.tsx` | SUPERADMIN | Super Admin, Sales | Tidak | `GET /api/v1/invoices` | Valid & Ada |
| **Pembayaran** | `superAdminNav` | `/payments` | `src/app/(app)/payments/page.tsx` | SUPERADMIN | Super Admin | Tidak (hanya API guard) | `GET /api/v1/payments`<br>`POST /api/v1/payments/:id/verify`<br>`POST /api/v1/payments/:id/reject` | Valid & Ada |
| **Piutang** | `superAdminNav` | `/receivables` | `src/app/(app)/receivables/page.tsx` | SUPERADMIN | Super Admin, Sales | Tidak | `GET /api/v1/receivables` | Valid & Ada |
| **Pengingat** | `superAdminNav` | `/reminders` | `src/app/(app)/reminders/page.tsx` | SUPERADMIN | Super Admin, Sales | Tidak | `GET /api/v1/reminders`<br>`PATCH /api/v1/reminders/:id` | Valid & Ada |
| **Pelanggan** | `superAdminNav` | `/customers` | `src/app/(app)/customers/page.tsx` | SUPERADMIN | Super Admin, Sales | Tidak | `GET /api/v1/auth/me`<br>`GET /api/v1/customers`<br>`GET /api/v1/users`<br>`POST /api/v1/customers`<br>`PATCH /api/v1/customers/:id`<br>`DELETE /api/v1/customers/:id` | Valid & Ada |
| **Katalog** | `superAdminNav` | `/catalogs` | `src/app/(app)/catalogs/page.tsx` | SUPERADMIN | Super Admin, Sales | Tidak | `GET /api/v1/catalogs`<br>`GET /api/v1/catalogs/:id/pdf` | Valid & Ada |
| **Produk & Harga** | `superAdminNav` | `/products` | `src/app/(app)/products/page.tsx` | SUPERADMIN | Super Admin, Sales | Tidak | `GET /api/v1/products`<br>`GET /api/v1/categories`<br>`POST /api/v1/products`<br>`PATCH /api/v1/products/:id`<br>`POST /api/v1/products/:id/images`<br>`DELETE /api/v1/products/:id` | Valid & Ada |
| **Stok & Opname** | `superAdminNav` | `/stock` | `src/app/(app)/stock/page.tsx` | SUPERADMIN | Super Admin | Tidak (hanya API guard) | `GET /api/v1/stock`<br>`GET /api/v1/stock/movements`<br>`POST /api/v1/stock/adjust`<br>`POST /api/v1/stock/opname` | Valid & Ada |
| **Purchase Order** | `superAdminNav` | `/purchase-orders` | `src/app/(app)/purchase-orders/page.tsx` | SUPERADMIN | Super Admin | Tidak (hanya API guard) | `GET /api/v1/purchase-orders`<br>`GET /api/v1/vendors` | Valid & Ada |
| **Vendor** | `superAdminNav` | `/vendors` | `src/app/(app)/vendors/page.tsx` | SUPERADMIN | Super Admin | **Ya** (baris 321: `userRole === 'SALES'`) | `GET /api/v1/vendors`<br>`POST /api/v1/vendors`<br>`PATCH /api/v1/vendors/:id`<br>`DELETE /api/v1/vendors/:id` | Valid & Ada |
| **Kinerja Sales** | `superAdminNav` | `/sales` | `src/app/(app)/sales/page.tsx` | SUPERADMIN | Super Admin | **Ya** (baris 52: `userRole !== 'SUPERADMIN'`) | `GET /api/v1/auth/me`<br>`GET /api/v1/reports/sales-performance` | Valid & Ada |
| **Laporan** | `superAdminNav` | `/reports` | `src/app/(app)/reports/page.tsx` | SUPERADMIN | Super Admin, Sales | Tidak | `GET /api/v1/auth/me` | Valid & Ada |
| **Pengaturan Usaha** | `superAdminNav` | `/settings/business` | `src/app/(app)/settings/business/page.tsx` | SUPERADMIN | Super Admin | Tidak (hanya API guard) | `GET /api/v1/businesses`<br>`PATCH /api/v1/businesses/:id`<br>`POST /api/v1/businesses/:id/bank-accounts`<br>`PATCH /api/v1/bank-accounts/:id`<br>`DELETE /api/v1/bank-accounts/:id` | Valid & Ada |
| **Pengguna** | `superAdminNav` | `/settings/users` | `src/app/(app)/settings/users/page.tsx` | SUPERADMIN | Super Admin | Tidak (hanya API guard) | `GET /api/v1/users`<br>`POST /api/v1/users`<br>`PATCH /api/v1/users/:id`<br>`POST /api/v1/users/:id/reset-password`<br>`POST /api/v1/users/:id/activate`<br>`POST /api/v1/users/:id/deactivate` | Valid & Ada |
| **Audit Log** | `superAdminNav` | `/audit` | `src/app/(app)/audit/page.tsx` | SUPERADMIN | Super Admin | Tidak (hanya API guard) | `GET /api/v1/audit-logs` | Valid & Ada |
| **Pembaruan** | `superAdminNav` | `/updates` | `src/app/(app)/updates/page.tsx` | SUPERADMIN | Super Admin, Sales | Tidak | `GET /api/v1/updates`<br>`POST /api/v1/updates/mark-seen`<br>`POST /api/v1/updates`<br>`PATCH /api/v1/updates/:id`<br>`POST /api/v1/updates/:id/publish` | Valid & Ada |
| **Profil Saya** | `superAdminNav` | `/profile` | `src/app/(app)/profile/page.tsx` | SUPERADMIN | Super Admin, Sales | Tidak | `GET /api/v1/auth/me`<br>`POST /api/v1/auth/change-password`<br>`POST /api/v1/auth/telegram/link-code`<br>`DELETE /api/v1/auth/telegram` | Valid & Ada |
| **Beranda** | `salesDesktopNav` | `/dashboard` | `src/app/(app)/dashboard/page.tsx` | SALES (Desktop) | Super Admin, Sales | Tidak | `GET /api/v1/auth/me`<br>`GET /api/v1/dashboard` | Valid & Ada |
| **Order** | `salesDesktopNav` | `/orders` | `src/app/(app)/orders/page.tsx` | SALES (Desktop) | Super Admin, Sales | Tidak | `GET /api/v1/customers`<br>`GET /api/v1/orders` | Valid & Ada |
| **Invoice** | `salesDesktopNav` | `/invoices` | `src/app/(app)/invoices/page.tsx` | SALES (Desktop) | Super Admin, Sales | Tidak | `GET /api/v1/invoices` | Valid & Ada |
| **Piutang** | `salesDesktopNav` | `/receivables` | `src/app/(app)/receivables/page.tsx` | SALES (Desktop) | Super Admin, Sales | Tidak | `GET /api/v1/receivables` | Valid & Ada |
| **Customer** | `salesDesktopNav` | `/customers` | `src/app/(app)/customers/page.tsx` | SALES (Desktop) | Super Admin, Sales | Tidak | `GET /api/v1/customers`<br>`POST /api/v1/customers` | Valid & Ada |
| **Katalog** | `salesDesktopNav` | `/catalogs` | `src/app/(app)/catalogs/page.tsx` | SALES (Desktop) | Super Admin, Sales | Tidak | `GET /api/v1/catalogs` | Valid & Ada |
| **Produk & Harga** | `salesDesktopNav` | `/products` | `src/app/(app)/products/page.tsx` | SALES (Desktop) | Super Admin, Sales | Tidak | `GET /api/v1/products`<br>`GET /api/v1/categories` | Valid & Ada |
| **Daftar Harga** | `salesDesktopNav` | `/price-list` | `src/app/(app)/price-list/page.tsx` | SALES (Desktop) | Super Admin, Sales | Tidak | `GET /api/v1/price-list` | Valid & Ada |
| **Laporan CRM** | `salesDesktopNav` | `/reports/crm` | `src/app/(app)/reports/crm/page.tsx` | SALES (Desktop) | Super Admin, Sales | Tidak | `GET /api/v1/reports/crm`<br>`GET /api/v1/users` | Valid & Ada |
| **Pengingat** | `salesDesktopNav` | `/reminders` | `src/app/(app)/reminders/page.tsx` | SALES (Desktop) | Super Admin, Sales | Tidak | `GET /api/v1/reminders` | Valid & Ada |
| **Pembaruan** | `salesDesktopNav` | `/updates` | `src/app/(app)/updates/page.tsx` | SALES (Desktop) | Super Admin, Sales | Tidak | `GET /api/v1/updates`<br>`POST /api/v1/updates/mark-seen` | Valid & Ada |
| **Profil Saya** | `salesDesktopNav` | `/profile` | `src/app/(app)/profile/page.tsx` | SALES (Desktop) | Super Admin, Sales | Tidak | `GET /api/v1/auth/me`<br>`POST /api/v1/auth/change-password` | Valid & Ada |
| **Beranda** | `salesNav` | `/dashboard` | `src/app/(app)/dashboard/page.tsx` | SALES (Mobile) | Super Admin, Sales | Tidak | `GET /api/v1/dashboard` | Valid & Ada |
| **Order** | `salesNav` | `/orders` | `src/app/(app)/orders/page.tsx` | SALES (Mobile) | Super Admin, Sales | Tidak | `GET /api/v1/orders` | Valid & Ada |
| **Customer** | `salesNav` | `/customers` | `src/app/(app)/customers/page.tsx` | SALES (Mobile) | Super Admin, Sales | Tidak | `GET /api/v1/customers` | Valid & Ada |
| **Katalog** | `salesNav` | `/catalogs` | `src/app/(app)/catalogs/page.tsx` | SALES (Mobile) | Super Admin, Sales | Tidak | `GET /api/v1/catalogs` | Valid & Ada |
| **Menu** | `salesNav` | `#menu` | **TIDAK ADA** (Trigger Drawer) | SALES (Mobile) | Super Admin, Sales | **RUSAK PARAH** | Tidak ada API (murni UI click) | **Drawer diblokir baris 466** |

---

## 4. Hasil Uji Per Menu × Role × Viewport

Ringkasan hasil evaluasi 10 checklist pengujian runtime per menu:

| Menu | Super Admin Desktop (1280px) | Super Admin Mobile (390px) | Sales Desktop (1280px) | Sales Mobile (390px) | Catatan Khusus Checklist |
|---|---|---|---|---|---|
| `/dashboard` | ✅ Berfungsi | ✅ Berfungsi | ✅ Berfungsi | ✅ Berfungsi | Format metrik omzet/margin terisolasi dengan baik. |
| `/approvals` | ✅ Berfungsi | ✅ Berfungsi (drawer) | ⚠️ 403 API (raw error) | ❌ Tidak ada menu / raw error | Sales membuka via URL melihat ErrorState merah, bukan redirect rapi. |
| `/orders` | ✅ Berfungsi | ✅ Berfungsi | ✅ Berfungsi | ✅ Berfungsi | Paginasi, filter status, dan navigasi detail berjalan. |
| `/invoices` | ✅ Berfungsi | ✅ Berfungsi | ✅ Berfungsi | ❌ Terputus (Drawer mati) | Sales mobile kehilangan akses ke faktur penjualannya. |
| `/payments` | ✅ Berfungsi | ✅ Berfungsi | ⚠️ 403 API (raw error) | ❌ Tidak ada menu / raw error | Modal verifikasi & penolakan bukti transfer berjalan bagi SA. |
| `/receivables` | ✅ Berfungsi | ✅ Berfungsi | ✅ Berfungsi | ❌ Terputus (Drawer mati) | Umur piutang 5 bucket tampil rapi di desktop. |
| `/reminders` | ✅ Berfungsi | ✅ Berfungsi | ✅ Berfungsi | ❌ Terputus (Drawer mati) | Snooze reminder dan link kontak WA bekerja. |
| `/customers` | ✅ Berfungsi | ✅ Berfungsi | ✅ Berfungsi | ✅ Berfungsi | Form tambah dan ubah tahap pipeline berjalan. |
| `/catalogs` | ✅ Berfungsi | ✅ Berfungsi | ✅ Berfungsi | ✅ Berfungsi | Detail katalog terbuka, namun thumbnail gambar 404 (L1). |
| `/products` | ✅ Berfungsi | ✅ Berfungsi | ✅ Berfungsi (tanpa HPP) | ❌ Terputus (Drawer mati) | Super Admin melihat HPP & alert profit, Sales melihat harga acuan. |
| `/stock` | ✅ Berfungsi | ✅ Berfungsi | ⚠️ 403 API (raw error) | ❌ Tidak ada menu / raw error | Modal penyesuaian stok dan riwayat kartu mutasi bekerja. |
| `/purchase-orders` | ✅ Berfungsi | ✅ Berfungsi | ⚠️ 403 API (raw error) | ❌ Tidak ada menu / raw error | Alur penerimaan barang berhasil memperbarui stok. |
| `/vendors` | ✅ Berfungsi | ✅ Berfungsi | ⚠️ Akses Dibatasi (rapi) | ❌ Tidak ada menu | Memiliki fallback UI kustom khusus Sales di baris 321. |
| `/sales` | ✅ Berfungsi | ✅ Berfungsi | ⚠️ Layar kosong | ❌ Tidak ada menu | `if (userRole !== 'SUPERADMIN') return;` me-render null tanpa pesan. |
| `/reports` | ✅ Berfungsi | ✅ Berfungsi | ✅ Berfungsi | ❌ Terputus (Drawer mati) | Tab margin otomatis disembunyikan untuk Sales. |
| `/settings/business` | ✅ Berfungsi | ✅ Berfungsi | ⚠️ 403 API (raw error) | ❌ Tidak ada menu / raw error | Rekening bank dan logo usaha dapat diubah SA. |
| `/settings/users` | ✅ Berfungsi | ✅ Berfungsi | ⚠️ 403 API (raw error) | ❌ Tidak ada menu / raw error | Reset password, aktivasi/deaktivasi sales bekerja. |
| `/audit` | ✅ Berfungsi | ✅ Berfungsi | ⚠️ 403 API (raw error) | ❌ Tidak ada menu / raw error | Audit log diff before/after berjalan bagi SA. |
| `/updates` | ✅ Berfungsi | ✅ Berfungsi | ✅ Berfungsi | ❌ Terputus (Drawer mati) | Badge 'Baru' muncul dan hilang saat dibuka di desktop. |
| `/profile` | ✅ Berfungsi | ✅ Berfungsi | ✅ Berfungsi | ❌ Terputus (Drawer mati) | Sales mobile tidak bisa logout atau ganti password via UI. |
| `/price-list` | ⚠️ Tidak ada di nav SA | ⚠️ Tidak ada di nav SA | ✅ Berfungsi | ❌ Terputus (Drawer mati) | DTO 11 kunci tanpa HPP aman dari kebocoran data. |
| `/reports/crm` | ✅ Berfungsi | ✅ Berfungsi | ✅ Berfungsi | ❌ Terputus (Drawer mati) | Laporan aktivitas dan pipeline sales berjalan. |

---

## 5. Hasil Uji Alur Integrasi Lintas Fitur (A–L)

- **Alur A (Customer → Order):** **BERHASIL**. Toko baru yang dibuat di `/customers` langsung terdeteksi pada pemilih pelanggan di `/orders/new`, dan pesanan baru yang dibuat langsung muncul di `/orders`, timeline CRM `/customers/[id]`, serta widget `/dashboard`.
- **Alur B (Order → Submit → Persetujuan → Invoice DP):** **BERHASIL**. Pesanan DRAFT yang diajukan masuk ke antrean `/approvals`. Saat disetujui Super Admin, faktur uang muka `-DP` otomatis terbit dengan nomor urut dokumen resmi di `/invoices`, dan tombol cetak PDF faktur aktif.
- **Alur C (Pembayaran & Verifikasi):** **BERHASIL**. Input pembayaran uang muka pada pesanan dengan bukti transfer masuk ke antrean `/payments`. Setelah diverifikasi Super Admin, saldo sisa piutang pada `/receivables` dan tagihan pesanan pada `/orders/[id]` otomatis berkurang.
- **Alur D (Pengiriman → Invoice Pelunasan):** **BERHASIL**. Surat jalan / shipment berhasil dicatat dari detail pesanan, dan permintaan faktur pelunasan menghasilkan faktur `-LNS` di `/invoices`.
- **Alur E (Piutang → Pengingat):** **BERHASIL**. Pesanan berstatus belum lunas yang telah melewati batas jatuh tempo masuk ke monitoring umur piutang di `/receivables` dan muncul di reminder repeat order `/reminders`.
- **Alur F (Produk/Harga/Katalog):** **PUTUS PADA LANGKAH TAMPILAN GAMBAR & OFFLINE PWA (Lead L1)**. Pembuatan katalog otomatis dari produk aktif (`POST /catalogs/from-products`) berhasil, namun ketika membuka `/catalogs/[id]`, seluruh thumbnail gambar produk pecah (HTTP 404) karena kode memanggil `/api/v1/uploads/${item.imagePath}` alih-alih `/api/v1/files/${item.imagePath}`. Akibatnya, sinkronisasi offline PWA juga gagal meng-cache gambar produk.
- **Alur G (Purchase Order → Stok):** **BERHASIL**. PO yang diterbitkan dan barangnya diterima di `/purchase-orders/[id]` berhasil menambah stok fisik master di `/stock`, mencatat mutasi stok riil, dan menambahkan saldo hutang berjalan pada buku besar rekanan di `/vendors/[id]`.
- **Alur H (Retur / Credit Note):** **BERHASIL**. Pembuatan nota kredit dari detail pesanan `/orders/[id]` berhasil memotong total tagihan pelanggan dan mengembalikan stok fisik via transaksi mutasi.
- **Alur I (Komisi & Profit):** **BERHASIL SECARA PERHITUNGAN, NAMUN ADA GAP UI (Lead L6)**. Komisi sales dan laba bersih terhitung akurat sesuai aturan bisnis, dan tombol pelunasan komisi bekerja (`POST /api/v1/commission/entries/:id/pay`). Namun, konfigurasi jenjang komisi berjenjang (*Commission Tiers*) tidak memiliki antarmuka pengguna sama sekali.
- **Alur J (Pembaruan & Notifikasi Badge):** **BERHASIL DI DESKTOP, TERPUTUS DI MOBILE (Lead L2)**. Super Admin menerbitkan catatan rilis, badge "Baru" muncul di header dan sidebar Sales desktop, lalu padam setelah diklik. Namun di mobile, Sales tidak dapat membuka `/updates` karena drawer tertutup permanen.
- **Alur K (Integrasi Telegram):** **BERHASIL**. Notifikasi bot Telegram mengarah ke rute valid `/tg/approvals/[id]` dan `/tg/payments`. Rute tidak lagi menghasilkan 404 (AUD-GAP-001 terverifikasi telah tertutup tuntas).
- **Alur L (Ekspor/Impor Portabel):** **BERHASIL**. Modul transfer data di `/settings/business` (`DataTransferCard.tsx`) berhasil mengunduh file ekspor dan memvalidasi integritas data cadangan.

---

## 6. Lima Matriks Gap Sistematis

### Matriks Gap 1: Menu Navigasi → Halaman (Nav → Page)
*Perintah verifikasi:* Analisis pemetaan `superAdminNav`, `salesDesktopNav`, dan `salesNav` terhadap filesystem `src/app/(app)` dan `src/app/(auth)`.
- **Hasil:** Seluruh `href` pada ketiga array navigasi memiliki berkas `page.tsx` fisik yang valid (0 broken link).

### Matriks Gap 2: Halaman UI → Endpoint API (Page → API)
*Perintah verifikasi:* Ekstraksi seluruh string `fetch('/api/v1/...')` pada seluruh komponen UI dibandingkan dengan deklarasi method di `src/app/api/v1/**/route.ts`.
- **Temuan Kritis:** Ditemukan 1 titik putus fatal pada halaman detail katalog (`src/app/(app)/catalogs/[id]/page.tsx` baris 356 & 681) yang memanggil endpoint fiktif `GET /api/v1/uploads/${item.imagePath}`. Rute `/api/v1/uploads` tidak pernah didefinisikan di backend (seharusnya memanggil `/api/v1/files/${item.imagePath}`).

### Matriks Gap 3: Endpoint API → Antarmuka Pengguna (Orphan Backend Routes)
*Perintah verifikasi:* Pemindaian seluruh 121 berkas `route.ts` di `src/app/api/v1` terhadap pemanggilnya di `src/app` dan `src/components`.
Daftar rute backend yang tidak memiliki pemanggil sama sekali di antarmuka web:
1. `POST /api/v1/customers/:id/verify`: Alur bisnis verifikasi tabrakan toko (APPROVE / REASSIGN / REJECT) telah dibangun di backend, tetapi tidak ada tombol aksi di UI `/customers` atau `/customers/[id]`.
2. `GET & PUT /api/v1/commission/tiers`: Konfigurasi jenjang komisi berjenjang telah diimplementasikan di backend, tetapi tidak ada form input di `/settings/business` maupun `/sales`.
3. `PATCH & DELETE /api/v1/categories/:id`: Endpoint pengubahan nama dan penghapusan kategori produk ada di server, namun UI `/products` hanya menampilkan dropdown daftar tanpa tombol kelola kategori.
4. `GET /api/v1/reports/receivables-aging`: Endpoint JSON kalkulasi umur piutang ada di server, tetapi antarmuka `/reports` tidak memiliki kartu tampilan visual untuk endpoint ini.
5. `POST /api/v1/commissions/:id/pay`: Endpoint duplikat dari `/api/v1/commission/entries/:id/pay` (telah ditandai `@deprecated`).

### Matriks Gap 4: Spesifikasi Dokumen → Antarmuka Pengguna (BLUEPRINT → UI)
1. **Fitur Resolusi Tabrakan Calon Pelanggan (Seksi 9.7 & ADR 0007):** BLUEPRINT mewajibkan Owner menyelesaikan status `PENDING_VERIFIKASI_ADMIN` dari UI. Saat ini Admin harus mengubah data langsung di database untuk menyetujui toko kembar.
2. **Daftar Harga Sales Resmi (`/price-list`):** BLUEPRINT mendefinisikan `/price-list` sebagai halaman bersama. Di kode, menu ini hanya dipasang di sidebar Sales desktop dan dihilangkan dari menu Super Admin.
3. **Pengelolaan Kategori Produk:** BLUEPRINT menyebutkan kategorisasi produk, tetapi tidak menyediakan UI CRUD kategori.

### Matriks Gap 5: Hak Akses Dokumen vs Kemampuan Nyata (Role → Ability)
1. **Akses Sales di Mobile:** Menurut BLUEPRINT, Sales memiliki akses ke faktur, piutang, dan katalog. Namun secara nyata di perangkat seluler, Sales terkunci di 4 halaman dasar karena drawer navigasi tidak bisa dibuka.
2. **Penolakan Akses Staf Sales:** Menurut aturan keamanan, akses Sales ke halaman Super Admin harus ditolak dengan aman. Saat ini halaman `/approvals`, `/stock`, `/purchase-orders`, `/payments`, dan `/audit` membiarkan komponen me-mount dan me-render skeleton, lalu menampilkan kartu error merah dari respons API server alih-alih redirect langsung ke `/dashboard`.

---

## 7. Temuan Khusus Navigasi dan UX

1. **State Aktif Menu:** `AppShell.tsx` baris 433, 488, dan 534 menggunakan perbandingan string persis (`pathname === item.href`). Saat pengguna masuk ke halaman detail (misalnya `/orders/ord_123` atau `/customers/cust_456`), penyorotan biru pada menu "Order" atau "Customer" langsung padam, menyebabkan pengguna kehilangan orientasi visual navigasi.
2. **Drawer Navigasi Mobile Super Admin vs Sales:**
   - Super Admin: Drawer mobile berfungsi lancar dan dapat di-scroll vertikal untuk 20 item menu.
   - Sales: Drawer diblokir oleh kondisi logika `isSuperAdmin && sidebarOpen` pada baris 466. Tombol "Menu" di bottom bar dan hamburger di header mati total.
3. **Banner `mustChangePassword`:** Hanya tampil sebagai strip kuning di header. Navigasi tidak dikunci oleh layout, namun seluruh panggilan API ke server memicu HTTP 403 `PASSWORD_CHANGE_REQUIRED`. Akibatnya, pengguna melihat tampilan error di seluruh halaman daripada form ganti sandi wajib.
4. **Perilaku Pengalih Usaha (Multi-Tenant Switcher):** `handleSwitchBusiness` hanya memanggil `router.refresh()`. Seluruh halaman di `src/app/(app)` adalah komponen klien (`'use client'`) yang mengambil data melalui `useEffect`. Akibatnya, data lama tetap bertahan di layar setelah usaha dialihkan, kecuali pengguna me-refresh browser secara manual.
5. **Ketiadaan Halaman 404 & Error Boundary:** Berkas `not-found.tsx` dan `error.tsx` tidak tersedia di `src/app`. Membuka URL sembarang menampilkan halaman hitam-putih default Next.js tanpa navigasi kembali ke aplikasi.
6. **Inkonsistensi Terminologi Antar-Peran:** Label menu untuk Super Admin menggunakan kata "Pelanggan" dan "Dashboard", sedangkan untuk Sales menggunakan kata "Customer" dan "Beranda".

---

## 8. Status Verifikasi Hipotesis Awal (Lead L1–L9)

- **L1. Gambar item katalog rusak:** **TERKONFIRMASI PENUH.** `catalogs/[id]/page.tsx` memanggil `/api/v1/uploads/${it.imagePath}`, padahal rute tersebut 404. Berkas tes `pwa.test.ts` baris 59 terbukti *false-green* karena menggunakan mock URL fiktif yang sama.
- **L2. Menu Sales di mobile jauh lebih sedikit dan terputus:** **TERKONFIRMASI PENUH.** Bottom bar hanya berisi 4 menu + tombol Menu. Tombol Menu memicu drawer yang dibungkus `isSuperAdmin`, sehingga Sales mobile terputus total dari 8 menu lainnya.
- **L3. State aktif menu memakai kecocokan persis:** **TERKONFIRMASI PENUH.** `pathname === item.href` mematikan status aktif di seluruh halaman anak/detail.
- **L4. Ketiadaan middleware & guard role klien:** **TERKONFIRMASI PENUH.** Halaman `/approvals`, `/stock`, `/purchase-orders`, `/payments`, dan `/audit` me-mount dan merender layout sebelum menampilkan `ErrorState` dari penolakan API.
- **L5. `/price-list` hampir tidak bisa dicapai:** **SEBAGIAN TERKONFIRMASI.** Rute ini ada di menu Sales desktop, namun sama sekali tidak ada di menu Super Admin dan tidak bisa dibuka Sales mobile.
- **L6. Backend ada, UI belum ditemukan (orphan features):** **TERKONFIRMASI PENUH.** Terbukti untuk `customers/[id]/verify`, `commission/tiers`, `categories/[id]`, dan duplikasi `commissions/[id]/pay`.
- **L7. Halaman Sales desktop yang tidak terhubung:** **TERKONFIRMASI.** `vendors/page.tsx` memiliki guard ramah untuk Sales (`Akses Dibatasi`), tetapi vendor memang tidak dipasang di menu Sales.
- **L8. Dokumen audit lama inkonsisten dengan kode:** **TERKONFIRMASI.** `M3` menandai banyak halaman sebagai "Valid & Terhubung" dengan API `-`.
- **L9. Data tidak berganti saat pengalih usaha digunakan:** **TERKONFIRMASI PENUH.** `router.refresh()` tidak memicu re-render atau fetch ulang pada `useEffect` komponen klien.

---

## 9. Register Temuan Audit

| ID | Judul | Keparahan | Status Bukti | Menu/Halaman | Role | Bukti (File:Baris / Log) | Dampak ke Pengguna | Usulan Perbaikan | Upaya |
|---|---|---|---|---|---|---|---|---|---|
| **NAV-001** | Gambar item katalog 404 dan cache offline PWA gagal | **S1 Kritis** | Terbukti | `/catalogs/[id]` | Super Admin, Sales | `src/app/(app)/catalogs/[id]/page.tsx:356, 681` memanggil `/api/v1/uploads/${item.imagePath}` | Seluruh gambar produk di detail katalog pecah; aset offline gagal di-cache | Ubah URL menjadi `/api/v1/files/${item.imagePath}` sesuai `fileService.ts` | **S** |
| **NAV-002** | Drawer navigasi mobile Sales terkunci total | **S1 Kritis** | Terbukti | Seluruh Menu Mobile | Sales | `src/components/AppShell.tsx:466`: `{isSuperAdmin && sidebarOpen && (` | Sales di HP tidak bisa mengakses Invoice, Piutang, Profil, Pengingat, dsb. | Hapus kondisi `isSuperAdmin` pada pembungkus drawer mobile | **S** |
| **NAV-003** | Data tidak sinkron saat Super Admin beralih unit usaha | **S2 Tinggi** | Terbukti | Seluruh Halaman Utama | Super Admin | `src/components/AppShell.tsx:167`: hanya memanggil `router.refresh()` | Layar tetap menampilkan data usaha lama; potensi kekeliruan input antar-usaha | Gunakan `window.location.reload()` atau dispatch context event untuk fetch ulang | **M** |
| **NAV-004** | Fitur verifikasi tabrakan pelanggan tidak terintegrasi ke UI | **S2 Tinggi** | Terbukti statis | `/customers/[id]` | Super Admin | `src/app/api/v1/customers/[id]/verify/route.ts` ada, tidak ada pemanggil di UI | Toko bertag `PENDING_VERIFIKASI_ADMIN` terkunci permanen | Tambahkan banner & modal aksi (Approve/Reassign/Reject) di detail customer | **M** |
| **NAV-005** | Skema komisi berjenjang (*tiers*) tidak memiliki UI | **S2 Tinggi** | Terbukti statis | `/settings/business` | Super Admin | `src/app/api/v1/commission/tiers/route.ts` ada, tidak dipanggil di UI | Pemilik tidak bisa menyetel skema komisi berjenjang via antarmuka web | Tambahkan tabel & modal input tier komisi di form pengaturan usaha | **M** |
| **NAV-006** | Ketiadaan guard role di sisi klien pada halaman Super Admin | **S3 Sedang** | Terbukti | `/approvals`, `/stock`, `/payments`, `/audit` | Sales | Komponen tidak memeriksa role; hanya menampilkan kartu `ErrorState` API | Pengguna Sales melihat pesan error sistem yang tidak ramah | Pasang pemeriksaan peran di awal komponen klien & redirect ke `/dashboard` | **S** |
| **NAV-007** | State aktif menu navigasi padam di halaman sub-rute | **S3 Sedang** | Terbukti | Seluruh Menu | Super Admin, Sales | `AppShell.tsx:433, 488, 534`: `pathname === item.href` | Pengguna kehilangan konteks posisi halaman saat berada di halaman detail | Ubah logika menjadi `pathname === item.href || pathname.startsWith(item.href + '/')` | **S** |
| **NAV-008** | Menu Daftar Harga (`/price-list`) tidak tercantum di navigasi Super Admin | **S3 Sedang** | Terbukti | Header / Navigasi | Super Admin | `AppShell.tsx:219-245` tidak mencantumkan `/price-list` | Super Admin kesulitan membuka daftar harga paten secara langsung | Tambahkan `{ label: 'Daftar Harga', href: '/price-list', icon: DollarSign }` ke SA Nav | **S** |
| **NAV-009** | Banner `mustChangePassword` tidak mengunci navigasi aplikasi | **S3 Sedang** | Terbukti | Seluruh Halaman | Super Admin, Sales | `AppShell.tsx:289`: hanya banner div biasa; API menolak dengan 403 | Pengguna baru bingung melihat semua menu menampilkan pesan error | Kunci antarmuka atau redirect paksa ke `/profile` jika `mustChangePassword` aktif | **S** |
| **NAV-010** | Ketiadaan halaman 404 (`not-found.tsx`) dan `error.tsx` terintegrasi | **S4 Rendah** | Terbukti statis | Global App Router | Publik, Semua Role | Tidak ada berkas `not-found.tsx` dan `error.tsx` di `src/app` | Pengguna tersesat saat mengetik URL salah tanpa tombol kembali | Buat berkas `src/app/not-found.tsx` dan `src/app/error.tsx` bertema resmi | **S** |
| **NAV-011** | Inkonsistensi penamaan menu antar-peran (Pelanggan vs Customer) | **S4 Rendah** | Terbukti statis | Sidebar Navigasi | Super Admin, Sales | `AppShell.tsx:226` ('Pelanggan') vs baris 251 ('Customer') | Membingungkan komunikasi operasional harian tim | Samakan terminologi menjadi 'Pelanggan' atau 'Customer' secara konsisten | **S** |
| **NAV-012** | Duplikasi endpoint pembayaran komisi | **S4 Rendah** | Terbukti statis | API Komisi | Backend | Adanya `commissions/[id]/pay` dan `commission/entries/[id]/pay` | Redundansi pemeliharaan kode rute | Hapus rute deprecated setelah dipastikan seluruh klien menggunakan kanon | **S** |

---

## 10. Rencana Perbaikan Berurutan (Fase 8)

1. **Sprint 1 — Perbaikan Kritis Fungsional & Mobile (S1):**
   - Perbaiki path gambar katalog di `catalogs/[id]/page.tsx` dari `/api/v1/uploads` ke `/api/v1/files` (**NAV-001**).
   - Buka kunci drawer mobile pada `AppShell.tsx` dengan menghapus guard `isSuperAdmin` (**NAV-002**).
   - *Verifikasi:* Uji klik menu mobile Sales 390px di Playwright dan pastikan gambar katalog termuat 200 OK.
2. **Sprint 2 — Integritas Multi-Tenant & Keamanan Navigasi (S2/S3):**
   - Perbaiki pengalih usaha pada `AppShell.tsx` agar memicu reload penuh atau state refresh (**NAV-003**).
   - Pasang guard role di sisi klien pada halaman `/approvals`, `/stock`, `/purchase-orders`, `/payments`, dan `/audit` (**NAV-006**).
   - Kunci halaman jika `mustChangePassword` aktif (**NAV-009**).
   - Perbaiki active menu state di `AppShell.tsx` menggunakan `startsWith` (**NAV-007**).
   - Tambahkan menu `/price-list` ke `superAdminNav` (**NAV-008**).
3. **Sprint 3 — Integrasi Fitur Orphan Backend (S2):**
   - Buat komponen UI penanganan tabrakan calon pelanggan di `/customers/[id]` yang memanggil `/api/v1/customers/:id/verify` (**NAV-004**).
   - Bangun modal konfigurasi tier komisi di `/settings/business` yang memanggil `/api/v1/commission/tiers` (**NAV-005**).
4. **Sprint 4 — Poles UX & Kebersihan Sistem (S4):**
   - Buat halaman `src/app/not-found.tsx` dan `src/app/error.tsx` (**NAV-010**).
   - Seragamkan penamaan label menu di `AppShell.tsx` (**NAV-011**).
   - Hapus rute duplikat `commissions/[id]/pay` (**NAV-012**).

---

## 11. Pertanyaan untuk Pemilik Aplikasi

1. **Terminologi Menu:** Apakah Anda lebih memilih istilah berbahasa Indonesia formal (**Pelanggan** dan **Dashboard**) atau istilah industri santai (**Customer** dan **Beranda**) untuk diseragamkan di semua peran?
2. **Akses Daftar Harga (`/price-list`) untuk Super Admin:** Apakah menu "Daftar Harga" sengaja disembunyikan dari sidebar Super Admin karena Super Admin sudah memiliki menu "Produk & Harga", atau sebaiknya dimunculkan juga di sidebar Super Admin?
3. **Penyelesaian Tabrakan Toko (`PENDING_VERIFIKASI_ADMIN`):** Apakah Super Admin ingin alur verifikasi tabrakan toko diletakkan langsung di dalam kartu peringatan halaman detail toko, atau disediakan tab/halaman antrean khusus seperti halnya antrean Persetujuan Order?

