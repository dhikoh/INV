# Prompt AI Agent: Sistem Order, CRM dan Invoice Multi-Usaha

Nov 5, 2026 · @Debate

## 1. Cara Memakai Prompt Ini dan Aturan Emas

Dokumen ini adalah perintah kerja lengkap untuk AI agent coding. Tempel seluruh dokumen ke agent, lalu minta ia mengerjakan satu tugas bernomor per giliran (misalnya "Kerjakan Tugas 1.3"), sampai tes lulus, dicatat di changelog, baru lanjut.

### 1.1 Peran agent

Kamu adalah senior full-stack engineer yang sangat teliti. Kamu membangun aplikasi order, CRM, dan invoice multi-usaha untuk satu pemilik bisnis (Super Admin) dan beberapa sales per usaha. Kamu tidak menebak, tidak menyederhanakan aturan uang, dan tidak melewatkan langkah di checklist.

### 1.2 Cara kerja per giliran

Baca bagian dokumen yang relevan dengan tugas (aturan bisnis, skema, endpoint, tes).
Tulis rencana singkat 3–7 baris: file apa yang dibuat/diubah.
Kerjakan hanya tugas itu. Jangan menyentuh fitur lain.
Jalankan pnpm lint && pnpm typecheck && pnpm test. Semua harus hijau.
Perbarui docs/BLUEPRINT.md (jika desain berubah), CHANGELOG.md, dan versi (lihat bagian 4).
Commit satu tugas satu commit: feat(order): hitung total order (T2.4).
Kirim laporan dengan format di 1.4.

### 1.3 Aturan emas (WAJIB, tanpa pengecualian)

Jangan menebak. Jika ada yang tidak jelas atau bertentangan, berhenti, tulis pertanyaan di docs/OPEN_QUESTIONS.md, dan tanya pemilik. Jangan mengarang aturan bisnis.
Uang = bilangan bulat Rupiah. Di database BigInt, di kode TypeScript number bilangan bulat. Persen disimpan sebagai basis points (bps): 10% = 1000, 11% = 1100, 3,5% = 350. Dilarang memakai float, Decimal, atau toFixed untuk menghitung uang.
Semua rumus uang hanya ada di src/lib/domain/ sebagai fungsi murni (tanpa database, tanpa Date.now()). UI dan API memanggil fungsi yang sama. Dilarang menulis ulang rumus di tempat lain.
Semua otorisasi di server. Menyembunyikan tombol di UI bukan keamanan. Setiap endpoint wajib memanggil requireContext() dan memeriksa role.
Semua query data usaha wajib memfilter businessId. Tidak ada pengecualian. Akses ke data usaha lain harus menghasilkan 404, bukan 403.
Jangan percaya klien. Harga, HPP, total, status, nomor dokumen yang dikirim klien diabaikan atau dihitung ulang di server. Schema Zod memakai .strict() agar field asing ditolak.
Sales tidak pernah menerima field rahasia (HPP, margin, profit, komisi, catatan owner, harga modal vendor). Gunakan DTO terpisah per role (bagian 10.3) dan tes kebocoran (bagian 17).
Mutasi multi-langkah = satu transaksi. Bungkus dengan prisma.$transaction, tulis audit log di transaksi yang sama.
Jangan hapus tes agar hijau. Jika tes gagal, perbaiki kode, bukan tesnya. Jika tesnya memang salah, jelaskan di laporan dan minta persetujuan.
Jangan ubah di luar lingkup tugas. Tidak ada refactor, rename, atau "perapian" yang tidak diminta.
Jangan tambah dependency tanpa mencatat alasannya sebagai ADR di blueprint. Versi paket dikunci persis (tanpa ^ atau ~).
TypeScript strict: true. Dilarang any, @ts-ignore, @ts-expect-error, eslint-disable tanpa komentar alasan satu baris.
Migrasi database: selalu buat migrasi baru (pnpm prisma migrate dev --name <nama>). Dilarang mengedit migrasi lama, dilarang prisma db push dan prisma migrate reset pada database yang berisi data nyata.
Secret hanya lewat environment variable. Dilarang menulis token, password, atau kunci di kode. Jangan commit .env.
Tanggal disimpan UTC, ditampilkan WIB (Asia/Jakarta). Dilarang membandingkan tanggal sebagai string.
Dilarang hard-delete kecuali lewat service purge (bagian 9). Penghapusan biasa = deletedAt.
Bahasa: teks antarmuka Bahasa Indonesia; nama variabel, tabel, fungsi Bahasa Inggris; komentar Indonesia, singkat.
Tidak ada TODO yang tertinggal. Kalau ada pekerjaan yang belum selesai, tulis di laporan dan docs/OPEN_QUESTIONS.md.
Gagal 3 kali pada masalah yang sama = berhenti. Tulis diagnosis (apa yang dicoba, pesan error lengkap) dan tanya pemilik. Jangan mencoba tebakan acak.
Data seed hanya untuk development. Seed produksi hanya membuat satu akun Super Admin dari environment variable.

### 1.4 Format laporan setiap selesai tugas

## Laporan Tugas <nomor>**Ringkasan:** <1-2 kalimat>**File dibuat/diubah:** <daftar path>**Migrasi:** <nama migrasi atau "tidak ada">**Tes baru:** <nama tes>**Hasil perintah:** lint OK / typecheck OK / test <n> lulus**Dokumen diperbarui:** BLUEPRINT <ya/tidak>, CHANGELOG <versi>**Belum selesai / catatan:** <atau "tidak ada">**Pertanyaan untuk pemilik:** <atau "tidak ada">

## 2. Konteks Bisnis dan Glosarium

Aplikasi ini dipakai satu pemilik (Super Admin) untuk mengelola beberapa usaha. Tiap usaha punya sekitar 10 sales yang mencatat order, mengelola CRM, dan mengajukan invoice. Invoice baru boleh dicetak setelah disetujui Super Admin.

### 2.1 Glosarium (pakai istilah ini persis di kode dan UI)

| Istilah | Arti | Nama di kode |
| Super Admin | Pemilik bisnis. Satu orang, melihat semua usaha. | Role.SUPERADMIN |
| Sales | Karyawan lapangan, terikat ke satu usaha. | Role.SALES |
| Usaha | Satu profil bisnis dengan data, tema invoice, dan nomor sendiri. | Business |
| Customer | Pelanggan dari sebuah usaha, punya kode unik (contoh TEROBOS). | Customer |
| Vendor | Pemasok barang (SUPPLIER) atau pengangkut (TRANSPORT). | Vendor |
| HPP | Harga modal produk. Rahasia, hanya Super Admin. | costPrice |
| Harga dasar | Harga jual standar yang ditetapkan Super Admin. | basePrice |
| Harga minimal | Batas bawah harga jual. Sales melihatnya. | minPrice |
| Floor | Harga minimal yang berlaku untuk customer tertentu (setelah aturan customer). | floorPrice |
| Harga deal | Harga hasil negosiasi sales, sebelum diskon. | unitPrice |
| DP | Uang muka, persen dari total order. | dpBps, dpAmount |
| Invoice DP | Tagihan uang muka. Akhiran nomor -DP. | InvoiceType.DP |
| Invoice Pelunasan | Tagihan sisa. Akhiran nomor -LNS. | InvoiceType.FINAL |
| Approval | Persetujuan Super Admin atas invoice. | InvoiceStatus |
| Override | Super Admin menyetujui meski harga di bawah minimal. | overrideNote |
| Void | Pembatalan dokumen, dokumen tetap ada dengan status batal. | VOID |
| Retur / Credit Note | Barang kembali, mengurangi tagihan. | CreditNote |
| Surat Jalan | Dokumen pengiriman tanpa harga. | Shipment |
| bps | Basis points, 1% = 100 bps. | Bps |
| Snapshot | Salinan nilai (harga, HPP, nama) saat transaksi, tidak berubah lagi. | field berakhiran Snapshot |
| customerSeq | Nomor urut transaksi per customer, tidak pernah reset. | Order.customerSeq |

### 2.2 Keputusan yang sudah dikunci

Agent tidak boleh mengubah keputusan ini tanpa persetujuan pemilik.
Satu Super Admin (pemilik). Tidak ada role "admin usaha" di versi ini. Super Admin membuat akun sales (username dan password ditentukan Super Admin, tidak ada pendaftaran mandiri).
Sales terikat ke tepat satu usaha, dan hanya melihat customer dan order miliknya sendiri.
Login dengan username dan password. Akun Telegram sales dan Super Admin berbeda, dihubungkan ke akun masing-masing lewat kode tautan sekali pakai.
Satu bot Telegram untuk semua usaha. Web, Telegram Mini App, dan PWA berjalan dari satu aplikasi Next.js.
Sales boleh mengajukan harga di bawah harga minimal. Sistem menampilkan harga minimal, sales wajib mengisi alasan, pengajuan ditandai "di bawah minimal", dan tidak bisa dicetak sebelum Super Admin menyetujui (override) atau menolak.
Harga minimal bisa berbeda per customer. Customer juga bisa punya promo, potongan, atau subsidi dengan periode berlaku. Semuanya adalah biaya yang mengurangi profit.
Setiap perubahan harga tercatat beserta alasan. Riwayat harga tidak tampil di invoice maupun katalog.
Nomor invoice: KODECUSTOMER/INV/DD/MM/YYYY/NNNN-DP atau -LNS. NNNN berjalan per customer dan tidak pernah reset.
Ongkir: bisa ditagihkan ke customer atau tidak (nilai shippingCharge bisa 0), dan biaya ongkir aktual yang dibayar usaha dicatat terpisah. Subsidi ongkir otomatis menjadi pengurang profit.
Toggle per usaha: PPN, izinkan stok minus, persentase DP default, dan wajib lunas sebelum kirim.
Komisi dihitung sistem dan hanya terlihat Super Admin. Mode: persen dari profit, persen dari omzet, bertingkat sesuai target, atau nominal tetap per order.
Super Admin boleh membatalkan (void), meretur, dan menghapus transaksi apa pun, dengan pembalikan otomatis atas stok, pembayaran, piutang, profit, dan komisi.
Katalog: sales memberi judul (Grosir, Distributor Tunggal, Ecer, atau teks bebas), mengubah harga selama tidak di bawah harga minimal, lalu mengunduh PDF atau memasangnya sebagai PWA. Di katalog, harga di bawah minimal diblokir total (tidak ada jalur persetujuan).
Invoice dicetak sebagai PDF dan dikirim manual oleh sales. Tidak ada pengiriman otomatis lewat WhatsApp atau email.
Impor massal produk (Excel/CSV) ditunda ke versi berikutnya. Upload produk satu per satu, dengan foto.

## 3. Stack, Struktur Repo, Environment, dan Deploy Coolify

Satu repo, satu image Docker, dua proses (web dan worker), satu database PostgreSQL. Tidak ada Redis.

### 3.1 Stack

Saat inisialisasi, pakai versi stabil terbaru dari tiap paket, lalu kunci versi persis di package.json dan catat tabel versinya di docs/BLUEPRINT.md.
| Kebutuhan | Pilihan | Catatan untuk agent |
| Runtime | Node.js LTS aktif, pnpm | Tulis versi Node di .nvmrc dan engines. |
| Framework | Next.js (App Router), TypeScript strict | Semua API lewat Route Handler di src/app/api/v1. Jangan pakai Server Actions untuk mutasi, supaya web dan Mini App memakai API yang sama. |
| Database | PostgreSQL 16+ | Satu database, banyak usaha (kolom businessId). |
| ORM | Prisma | Raw SQL hanya dengan tagged template prisma.$queryRaw. |
| Validasi | Zod | .strict() pada semua input. |
| UI | Tailwind CSS, shadcn/ui, react-hook-form, TanStack Query | Mobile-first. |
| Login | Sesi buatan sendiri (tabel Session), argon2 (argon2id) | Jangan pakai JWT di cookie. |
| Telegram | grammY (mode webhook) | Satu bot. |
| Job terjadwal | pg-boss | Hanya berjalan di proses worker. |
| PDF | puppeteer-core + Chromium dari image Docker | Maksimal 2 render bersamaan. |
| Gambar | sharp | Resize dan konversi ke WebP. |
| Tanggal | date-fns, date-fns-tz | Zona Asia/Jakarta. |
| Log | pino | Dilarang mencatat password, token, atau initData. |
| Tes | Vitest (unit dan integrasi), Playwright (e2e) | Database tes terpisah. |

### 3.2 Struktur repo

Buat persis seperti ini. Jangan memindahkan folder tanpa persetujuan.
.├── docs/│ ├── BLUEPRINT.md # dokumen hidup (bagian 4)│ ├── OPEN_QUESTIONS.md # pertanyaan untuk pemilik│ └── adr/ # keputusan teknis, satu file per keputusan├── CHANGELOG.md├── prisma/│ ├── schema.prisma│ ├── migrations/│ └── seed.ts├── public/│ ├── icons/ # ikon PWA 192 dan 512│ └── sw.js # service worker├── src/│ ├── app/│ │ ├── (auth)/login/│ │ ├── (app)/ # semua halaman setelah login│ │ ├── tg/ # entry Telegram Mini App│ │ └── api/│ │ ├── health/route.ts│ │ ├── telegram/webhook/route.ts│ │ └── v1/... # semua endpoint bagian 10│ ├── lib/│ │ ├── domain/ # RUMUS MURNI: money, pricing, order, profit, commission, numbering, stock│ │ ├── services/ # logika bertransaksi: orderService, invoiceService, paymentService, ...│ │ ├── dto/ # pemetaan model ke respons per role│ │ ├── auth/ # sesi, password, requireContext, rate limit│ │ ├── api/ # withApi, error, respons standar│ │ ├── telegram/ # bot, initData, notifikasi│ │ ├── pdf/ # template invoice, surat jalan, katalog│ │ ├── files/ # upload, serve│ │ └── audit/ # audit()│ ├── worker/index.ts # entry pg-boss│ └── components/├── tests/│ ├── unit/│ ├── integration/│ └── e2e/├── Dockerfile├── docker-compose.dev.yml # postgres dev + postgres test└── .env.example
Aturan lapisan: route handler hanya memanggil services/; services/ memanggil domain/ untuk rumus dan Prisma untuk data; domain/ tidak boleh meng-import Prisma, next, atau Date.now().

### 3.3 Environment variable

# .env.example (jangan isi nilai asli di file ini)DATABASE_URL=postgresql://app:app@localhost:5432/appTEST_DATABASE_URL=postgresql://app:app@localhost:5433/app_testAPP_URL=https://app.contoh.comSESSION_COOKIE_NAME=sidSESSION_TTL_DAYS=7UPLOAD_DIR=/data/uploadsMAX_UPLOAD_MB=5TELEGRAM_BOT_TOKEN=TELEGRAM_WEBHOOK_SECRET=TELEGRAM_BOT_USERNAME=APP_SECRET=SEED_SUPERADMIN_USERNAME=SEED_SUPERADMIN_PASSWORD=PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromiumTZ=Asia/JakartaLOG_LEVEL=info

Buat src/lib/env.ts yang memvalidasi semua variabel dengan Zod saat start. Jika ada yang kurang, aplikasi gagal start dengan pesan jelas.

### 3.4 Docker dan Coolify

Dockerfile multi-stage. Stage akhir wajib memasang chromium dan font (fonts-liberation, fonts-dejavu-core) lewat apt-get, menjalankan sebagai user non-root, dan menyalin hasil build Next.js (output: 'standalone').
Dua service Coolify dari image yang sama:
web: perintah node server.js, port 3000, health check GET /api/health.
worker: perintah node dist/worker/index.js, tanpa port publik.
Hanya web yang menjalankan migrasi, sebagai perintah pra-deploy: pnpm prisma migrate deploy. Worker tidak boleh menjalankan migrasi.
Jalankan web satu replika. Jangan skala horizontal di versi ini.
PostgreSQL sebagai resource database Coolify. Aktifkan backup terjadwal harian dan uji restore sekali sebelum go-live.
Volume persisten dipasang ke /data/uploads pada web dan worker. Volume ini juga harus masuk jadwal backup.
Domain dengan HTTPS otomatis dari Coolify. HTTPS wajib karena Telegram Mini App menolak HTTP.
Setelah deploy pertama, atur webhook Telegram (bagian 12.1) dan jalankan seed Super Admin sekali.
Endpoint GET /api/health mengembalikan { ok: true, db: true, version } setelah mengetes koneksi database (SELECT 1). Endpoint ini tidak butuh login dan tidak membocorkan data lain.

## 4. Protokol Blueprint, Changelog, dan Catatan Pembaruan

Tiga artefak dokumentasi wajib dirawat sepanjang proyek: docs/BLUEPRINT.md, CHANGELOG.md, dan halaman "Catatan Pembaruan" di dalam aplikasi. Tugas dianggap belum selesai bila artefak ini belum diperbarui.

### 4.1 docs/BLUEPRINT.md (dokumen hidup)

Buat file ini di Tugas 0.1, lalu perbarui setiap kali desain berubah. Isinya harus memuat bagian berikut, dengan judul persis:
Ringkasan sistem: satu paragraf, dan diagram arsitektur (teks atau Mermaid).
Versi stack: tabel nama paket dan versi terkunci.
Model data: ERD (Mermaid erDiagram) dan daftar tabel. Setiap perubahan schema.prisma memperbarui bagian ini.
Matriks hak akses: salinan bagian 5 yang sudah sesuai kenyataan kode.
Aturan bisnis: rumus harga, profit, komisi, penomoran, stok (salinan bagian 7 yang sesuai kode).
Alur status: diagram state order, invoice, pembayaran (bagian 8).
Daftar endpoint: tabel metode, path, role, ringkasan.
Integrasi: Telegram (webhook, perintah bot), job terjadwal beserta jadwalnya.
Operasional: cara deploy, backup, restore, rotasi secret, cara menjalankan tes.
Keputusan teknis (ADR): daftar tautan ke docs/adr/NNNN-judul.md.
Roadmap: status fase 1–5 (belum / berjalan / selesai) dan tanggalnya.
Masalah terbuka: tautan ke docs/OPEN_QUESTIONS.md.
Format ADR (docs/adr/0001-uang-bigint.md): Konteks, Keputusan, Alternatif yang ditolak, Konsekuensi. Satu keputusan per file. Wajib untuk: tambah dependency, ubah rumus uang, ubah skema yang tidak ada di dokumen ini, dan penyimpangan dari dokumen ini.

### 4.2 CHANGELOG.md dan versi

Ikuti format Keep a Changelog dan Semantic Versioning.
Versi hidup di package.json. Tampilkan di footer aplikasi dan di GET /api/health.
Sebelum go-live versi 0.x.y: fitur baru atau perubahan skema menaikkan MINOR (0.3.0), perbaikan bug menaikkan PATCH (0.3.1). Setelah go-live 1.0.0: perubahan yang mematahkan kompatibilitas menaikkan MAJOR.
Setiap tugas menambah entri di bagian [Unreleased]. Saat satu fase selesai, ganti menjadi versi bertanggal dan beri git tag vX.Y.Z.
Kategori: Added, Changed, Fixed, Removed, Security, Database (nama migrasi).
Tulis dalam Bahasa Indonesia, dari sudut pandang pengguna, singkat.

# Changelog## [Unreleased]### Added- Super Admin dapat menyetujui invoice dari tombol Telegram (T4.3)## [0.2.0] - 2026-12-01### Added- Order dengan diskon per baris dan ongkir (T2.4)### Database- Migrasi `20261201_add_order_items`### Fixed- Pembulatan diskon persen kini setengah ke atas (T2.5)

### 4.3 Halaman "Catatan Pembaruan" di aplikasi

Semua user yang login bisa membaca riwayat pembaruan. Hanya Super Admin yang bisa menerbitkan.
Tabel ReleaseNote (bagian 6): version, title, bodyMarkdown, publishedAt, publishedById, broadcastAt.
Halaman /updates menampilkan daftar terbaru dulu. Badge "Baru" muncul di menu bila ada catatan terbit setelah User.lastSeenReleaseAt. Membuka halaman memperbarui lastSeenReleaseAt.
Super Admin: tombol "Terbitkan" dan opsi "Kirim ke Telegram" (kirim ke semua user yang sudah terhubung, satu pesan ringkas berisi judul dan tautan /updates).
Render markdown dengan pustaka yang tidak mengizinkan HTML mentah. Dilarang dangerouslySetInnerHTML untuk isi catatan.
Skrip pnpm release:draft membaca entri [Unreleased] teratas dari CHANGELOG.md dan membuat ReleaseNote berstatus draft untuk dirapikan Super Admin.

### 4.4 Checklist dokumentasi di setiap tugas

☐ Jika skema, rumus, endpoint, atau alur berubah: BLUEPRINT.md diperbarui di bagian yang bersangkutan.
☐ Entri di CHANGELOG.md [Unreleased].
☐ Jika ada keputusan baru: ADR dibuat.
☐ Jika ada keraguan: OPEN_QUESTIONS.md diisi.

## 5. Peran dan Matriks Hak Akses

Ada dua role. Matriks ini adalah sumber kebenaran: setiap endpoint di bagian 10 harus cocok dengannya, dan tes di bagian 17 memeriksanya.

### 5.1 Matriks

"Milik sendiri" artinya data dengan salesId atau assignedSalesId sama dengan user yang login, di usahanya.
| Kemampuan | Super Admin | Sales |
| Login, logout, ganti password sendiri, hubungkan Telegram sendiri | Ya | Ya |
| Kelola usaha: data, logo, rekening bank, tema invoice, toggle PPN/stok minus/DP/wajib lunas, mode komisi | Ya | Tidak |
| Kelola akun sales: buat, ubah, reset password, nonaktifkan, set target dan komisi | Ya | Tidak |
| Kelola vendor (pemasok dan pengangkut) dan catatan transaksinya | Ya | Tidak |
| Pesanan pembelian (PO) ke vendor, penerimaan barang, pembayaran vendor | Ya | Tidak |
| Produk: lihat | Semua, dengan HPP dan margin | Semua aktif, tanpa HPP, dengan harga dasar, harga minimal, stok tersedia |
| Produk: tambah, ubah, hapus, upload foto, set HPP, harga dasar, harga minimal | Ya | Tidak |
| Riwayat harga produk | Ya | Tidak |
| Aturan harga per customer (harga minimal khusus, promo, potongan, subsidi) | Kelola | Hanya lihat floor dan promo aktif milik customer-nya |
| Customer dan CRM (data, pipeline, interaksi, tugas follow-up, tag) | Semua | Milik sendiri: tambah, ubah, catat interaksi |
| Pindahkan customer ke sales lain | Ya | Tidak |
| Order: buat dan ubah draft, ajukan invoice, tarik kembali pengajuan | Ya | Milik sendiri |
| Invoice: setujui, tolak, override harga di bawah minimal, void | Ya | Tidak |
| Invoice: cetak PDF | Semua yang disetujui | Milik sendiri dan berstatus disetujui |
| Pembayaran: catat dan unggah bukti | Ya | Milik sendiri |
| Pembayaran: verifikasi, tolak, catat refund | Ya | Tidak |
| Pengiriman dan surat jalan: buat, isi pengangkut dan resi | Ya | Milik sendiri |
| Biaya ongkir aktual dan biaya lain per order | Ya | Tidak |
| Stok: lihat jumlah tersedia | Ya | Ya |
| Stok: koreksi, opname | Ya | Tidak |
| Pengingat repeat order dan tagihan | Semua | Milik sendiri |
| Katalog: buat, ubah harga (di atas minimal), unduh PDF, pasang PWA | Semua | Milik sendiri |
| Laporan CRM dan aktivitas | Semua sales | Milik sendiri |
| Piutang customer (sisa tagihan) | Semua | Milik sendiri, tanpa profit |
| Laporan margin dan profit per order, produk, sales, usaha | Ya | Tidak sama sekali |
| Komisi, target, evaluasi kinerja, catatan pribadi owner tentang sales | Ya | Tidak sama sekali |
| Retur (credit note), void, hapus, tempat sampah, purge | Ya | Tidak |
| Audit log | Ya | Tidak |
| Catatan Pembaruan: baca | Ya | Ya |
| Catatan Pembaruan: terbitkan | Ya | Tidak |

### 5.2 Konteks usaha dan sesi

Sales: User.businessId tetap. Semua data otomatis dibatasi ke usaha itu.
Super Admin: User.businessId kosong. Sesi menyimpan activeBusinessId yang dipilih lewat pengalih usaha di header (POST /api/v1/session/business). Endpoint yang butuh usaha aktif menolak dengan 400 BUSINESS_REQUIRED bila belum dipilih. Laporan lintas usaha memakai endpoint khusus (/reports/overview).
Fungsi pusat requireContext(req, { roles }) mengembalikan { user, role, businessId }. Semua handler memulai dengan ini. Dilarang mengambil businessId dari body atau query untuk menentukan hak akses.

### 5.3 Aturan kepemilikan untuk Sales

Customer: where: { businessId, assignedSalesId: user.id, deletedAt: null }.
Order, invoice, pembayaran, pengiriman, pengingat, katalog: filter lewat salesId pada order atau katalognya.
Mengakses data milik sales lain di usaha yang sama menghasilkan 404, bukan 403 (agar keberadaan data tidak bocor).
Customer yang dibuat sales otomatis assignedSalesId = user.id. Kode customer diusulkan sales, wajib unik per usaha, huruf besar dan angka saja (2–12 karakter), dan tidak bisa diubah setelah customer punya invoice.

### 5.4 Field rahasia yang tidak boleh sampai ke Sales

Daftar kunci terlarang di respons Sales (dipakai juga oleh tes kebocoran di bagian 17):
costPrice, hpp, cost, costSnapshot, margin, profit, profitAmount, commission,commissionAmount, commissionBps, ownerNote, ownerNotes, actualCost, shippingActualCost,extraCost, purchasePrice, unitCost, vendorPrice, supplierPrice, auditLog, before, after

## 6. Skema Database (Prisma)

Salin skema ini ke prisma/schema.prisma, jalankan pnpm prisma format (otomatis menambah sisi relasi sebaliknya), lalu buat migrasi pertama. Jika ada ketidakcocokan dengan versi Prisma yang terpasang (misalnya cara menulis datasource), sesuaikan sintaksnya saja, bukan isinya, dan catat sebagai ADR.
Konvensi yang wajib diikuti:
Semua uang BigInt (Rupiah utuh). Semua persen Int dalam bps. Jumlah barang Int.
Setiap tabel data usaha punya businessId dan indeks yang diawali businessId.
Kolom pelaku (createdById, approvedById, verifiedById, dan sejenisnya) berupa String biasa tanpa relasi, agar penghapusan user tidak merusak riwayat.
Kolom bertanda RAHASIA tidak boleh muncul di DTO Sales.
Penghapusan = isi deletedAt. Semua query harus menambahkan deletedAt: null (gunakan helper notDeleted).

### 6.1 Konfigurasi dan enum

generator client { provider = "prisma-client-js"}datasource db { provider = "postgresql" url = env("DATABASE_URL")}enum Role { SUPERADMIN SALES }enum InvoiceTheme { PROFESIONAL FAMILY MINIMALIS MODERN KLASIK }enum CommissionMode { PERCENT_OF_PROFIT PERCENT_OF_REVENUE TIERED_BY_TARGET FIXED_PER_ORDER }enum CommissionTrigger { ON_FULL_PAID ON_DP_PAID }enum CommissionStatus { EARNED PAID REVERSED }enum VendorKind { SUPPLIER TRANSPORT }enum PipelineStage { LEAD PROSPECT DEAL REPEAT LOST }enum PriceField { COST BASE MIN CUSTOMER_MIN }enum DiscountType { NONE PERCENT AMOUNT }enum DiscountSource { MANUAL PROMO SUBSIDY }enum OrderStatus { DRAFT PENDING_APPROVAL REVISION_REQUIRED AWAITING_DP IN_PROCESS FINAL_PENDING_APPROVAL AWAITING_FINAL_PAYMENT COMPLETED CANCELLED}enum InvoiceType { DP FINAL }enum InvoiceStatus { PENDING_APPROVAL APPROVED REJECTED WITHDRAWN VOID }enum PaymentType { RECEIPT REFUND }enum PaymentMethod { TRANSFER CASH CREDIT OTHER }enum PaymentStatus { PENDING_VERIFICATION VERIFIED REJECTED VOID }enum ShipMethod { OWN_FLEET EXPEDITION TRANSPORT_VENDOR }enum ShipStatus { PREPARING SHIPPED DELIVERED }enum PoStatus { DRAFT ORDERED PARTIAL_RECEIVED RECEIVED CANCELLED }enum StockMoveType { PO_RECEIPT SALE_SHIPMENT RETURN_IN ADJUSTMENT OPNAME VOID_REVERSAL }enum CreditSettlement { OFFSET REFUND CUSTOMER_CREDIT }enum ReminderStatus { ACTIVE PAUSED DONE CANCELLED }enum ReminderSource { AUTO MANUAL }enum InteractionType { CALL VISIT WHATSAPP EMAIL OTHER }

### 6.2 Usaha, user, sesi

model Business { id String @id @default(cuid()) code String @unique // kode usaha huruf besar, contoh TRB name String legalName String? address String? @db.Text phone String? email String? npwp String? logoPath String? invoiceTheme InvoiceTheme @default(PROFESIONAL) invoiceFooterNote String? @db.Text ppnEnabled Boolean @default(false) ppnRateBps Int @default(1100) allowNegativeStock Boolean @default(false) requirePaidBeforeShip Boolean @default(false) defaultDpBps Int @default(5000) // 0 = tanpa DP dueDays Int @default(7) // tempo invoice pelunasan defaultRepeatDays Int @default(30) commissionMode CommissionMode @default(PERCENT_OF_PROFIT) commissionRateBps Int @default(1000) commissionFixedAmount BigInt @default(0) commissionTrigger CommissionTrigger @default(ON_FULL_PAID) isActive Boolean @default(true) createdAt DateTime @default(now()) updatedAt DateTime @updatedAt deletedAt DateTime?}model BankAccount { id String @id @default(cuid()) businessId String business Business @relation(fields: [businessId], references: [id]) bankName String accountNumber String accountHolder String isDefault Boolean @default(false) deletedAt DateTime? @@index([businessId])}model User { id String @id @default(cuid()) username String @unique // selalu disimpan huruf kecil passwordHash String name String role Role businessId String? // null untuk SUPERADMIN business Business? @relation(fields: [businessId], references: [id]) isActive Boolean @default(true) mustChangePassword Boolean @default(true) telegramChatId BigInt? @unique telegramLinkedAt DateTime? telegramBlocked Boolean @default(false) commissionMode CommissionMode? // null = ikut pengaturan usaha commissionRateBps Int? commissionFixedAmount BigInt? lastSeenReleaseAt DateTime? lastLoginAt DateTime? createdAt DateTime @default(now()) updatedAt DateTime @updatedAt deletedAt DateTime? @@index([businessId])}model Session { id String @id @default(cuid()) userId String user User @relation(fields: [userId], references: [id]) tokenHash String @unique // hash SHA-256 dari token di cookie activeBusinessId String? // dipakai SUPERADMIN userAgent String? ip String? createdAt DateTime @default(now()) lastUsedAt DateTime @default(now()) expiresAt DateTime revokedAt DateTime? @@index([userId])}model LoginAttempt { id String @id @default(cuid()) username String ip String success Boolean createdAt DateTime @default(now()) @@index([username, createdAt]) @@index([ip, createdAt])}model TelegramLinkCode { id String @id @default(cuid()) userId String user User @relation(fields: [userId], references: [id]) codeHash String @unique expiresAt DateTime usedAt DateTime? createdAt DateTime @default(now())}

### 6.3 Produk, harga, vendor

model Category { id String @id @default(cuid()) businessId String business Business @relation(fields: [businessId], references: [id]) name String sortOrder Int @default(0) deletedAt DateTime? products Product[] @@unique([businessId, name])}model Vendor { id String @id @default(cuid()) businessId String business Business @relation(fields: [businessId], references: [id]) kind VendorKind @default(SUPPLIER) code String // huruf besar, dipakai di nomor PO name String picName String? phone String? address String? @db.Text bankName String? bankAccountNumber String? bankAccountHolder String? paymentTermDays Int @default(0) notes String? @db.Text createdAt DateTime @default(now()) updatedAt DateTime @updatedAt deletedAt DateTime? products Product[] @@unique([businessId, code])}model Product { id String @id @default(cuid()) businessId String business Business @relation(fields: [businessId], references: [id]) categoryId String? category Category? @relation(fields: [categoryId], references: [id]) defaultVendorId String? defaultVendor Vendor? @relation(fields: [defaultVendorId], references: [id]) sku String name String description String? @db.Text unit String // pcs, kg, dus, karung costPrice BigInt @default(0) // RAHASIA (HPP) basePrice BigInt minPrice BigInt stockQty Int @default(0) // jumlah fisik, bisa minus bila diizinkan reservedQty Int @default(0) // dipesan order yang sudah disetujui, belum dikirim minStockAlert Int @default(0) isActive Boolean @default(true) rev Int @default(0) createdAt DateTime @default(now()) updatedAt DateTime @updatedAt deletedAt DateTime? images ProductImage[] @@unique([businessId, sku]) @@index([businessId, isActive])}model ProductImage { id String @id @default(cuid()) businessId String productId String product Product @relation(fields: [productId], references: [id]) path String // relatif terhadap UPLOAD_DIR sortOrder Int @default(0) isPrimary Boolean @default(false) @@index([businessId, productId])}model PriceHistory { id String @id @default(cuid()) businessId String productId String customerId String? // terisi bila field = CUSTOMER_MIN field PriceField oldValue BigInt? newValue BigInt reason String @db.Text // WAJIB diisi changedById String createdAt DateTime @default(now()) @@index([businessId, productId, createdAt])}

### 6.4 Customer, CRM, aturan harga customer

model Customer { id String @id @default(cuid()) businessId String business Business @relation(fields: [businessId], references: [id]) code String // huruf besar, contoh TEROBOS name String contactName String? phone String? address String? @db.Text shippingAddress String? @db.Text billingAddress String? @db.Text npwp String? assignedSalesId String? assignedSales User? @relation(fields: [assignedSalesId], references: [id]) pipelineStage PipelineStage @default(LEAD) tags String[] notes String? @db.Text rev Int @default(0) createdAt DateTime @default(now()) updatedAt DateTime @updatedAt deletedAt DateTime? @@unique([businessId, code]) @@index([businessId, assignedSalesId])}model CustomerMinPrice { id String @id @default(cuid()) businessId String customerId String customer Customer @relation(fields: [customerId], references: [id]) productId String minPrice BigInt note String? updatedAt DateTime @updatedAt @@unique([customerId, productId]) @@index([businessId])}model CustomerPromo { id String @id @default(cuid()) businessId String customerId String customer Customer @relation(fields: [customerId], references: [id]) productId String? // null = berlaku untuk semua produk label String source DiscountSource // PROMO atau SUBSIDY type DiscountType // PERCENT atau AMOUNT valueBps Int? // bila PERCENT valueAmount BigInt? // bila AMOUNT: potongan Rupiah PER UNIT validFrom DateTime validTo DateTime? isActive Boolean @default(true) note String? createdAt DateTime @default(now()) deletedAt DateTime? @@index([businessId, customerId])}model CrmInteraction { id String @id @default(cuid()) businessId String customerId String customer Customer @relation(fields: [customerId], references: [id]) salesId String type InteractionType summary String @db.Text occurredAt DateTime nextFollowUpAt DateTime? createdAt DateTime @default(now()) @@index([businessId, customerId, occurredAt])}model CrmTask { id String @id @default(cuid()) businessId String customerId String customer Customer @relation(fields: [customerId], references: [id]) assignedToId String title String dueAt DateTime doneAt DateTime? createdAt DateTime @default(now()) @@index([businessId, assignedToId, dueAt])}model OwnerSalesNote { // RAHASIA: hanya Super Admin id String @id @default(cuid()) businessId String salesId String authorId String note String @db.Text createdAt DateTime @default(now()) @@index([businessId, salesId])}model SalesTarget { // RAHASIA id String @id @default(cuid()) businessId String salesId String month String // format YYYY-MM targetRevenue BigInt targetProfit BigInt @default(0) @@unique([salesId, month])}model CommissionTier { // RAHASIA, dipakai mode TIERED_BY_TARGET id String @id @default(cuid()) businessId String minAchievementBps Int // capaian target omzet bulan itu, 10000 = 100% rateBps Int // persen dari profit order @@unique([businessId, minAchievementBps])}

### 6.5 Order, invoice, pembayaran, pengiriman, retur

model Order { id String @id @default(cuid()) businessId String business Business @relation(fields: [businessId], references: [id]) customerId String customer Customer @relation(fields: [customerId], references: [id]) salesId String status OrderStatus @default(DRAFT) version Int @default(1) // naik tiap kali diajukan ulang setelah ditolak rev Int @default(0) // kunci optimistik customerSeq Int? // diisi saat invoice pertama disetujui orderNo String? // KODECUST/INV/DD/MM/YYYY/NNNN (tanpa akhiran) orderDate DateTime deliveryAddress String? @db.Text notes String? @db.Text repeatIntervalDays Int? subtotal BigInt @default(0) // jumlah harga deal x qty, sebelum diskon discountTotal BigInt @default(0) shippingCharge BigInt @default(0) // ongkir yang DITAGIHKAN ke customer (boleh 0) ppnEnabled Boolean @default(false) ppnRateBps Int @default(0) ppnAmount BigInt @default(0) grandTotal BigInt @default(0) dpBps Int @default(0) dpAmount BigInt @default(0) hasBelowMin Boolean @default(false) belowMinReason String? @db.Text overrideNote String? @db.Text rejectReason String? @db.Text paidTotal BigInt @default(0) // pembayaran VERIFIED dikurangi refund VERIFIED creditTotal BigInt @default(0) // total credit note bersettlement OFFSET stockReserved Boolean @default(false) cancelReason String? @db.Text cancelledAt DateTime? createdAt DateTime @default(now()) updatedAt DateTime @updatedAt deletedAt DateTime? items OrderItem[] @@unique([businessId, orderNo]) @@unique([businessId, customerId, customerSeq]) @@index([businessId, status]) @@index([businessId, salesId, createdAt])}model OrderItem { id String @id @default(cuid()) businessId String orderId String order Order @relation(fields: [orderId], references: [id]) productId String productName String // snapshot sku String // snapshot unit String // snapshot qty Int listPrice BigInt // snapshot harga dasar unitPrice BigInt // harga deal sebelum diskon discountType DiscountType @default(NONE) discountValue BigInt @default(0) // bps bila PERCENT, Rupiah TOTAL BARIS bila AMOUNT discountSource DiscountSource @default(MANUAL) lineSubtotal BigInt // unitPrice x qty lineDiscount BigInt // hasil hitung lineNet BigInt // lineSubtotal - lineDiscount costPrice BigInt // RAHASIA snapshot HPP floorPrice BigInt // snapshot harga minimal efektif per unit belowMin Boolean @default(false) sortOrder Int @default(0) @@index([businessId, orderId])}model OrderCost { // RAHASIA: biaya lain per order (kemasan, bongkar muat, dll) id String @id @default(cuid()) businessId String orderId String label String amount BigInt createdById String createdAt DateTime @default(now()) @@index([businessId, orderId])}model Invoice { id String @id @default(cuid()) businessId String business Business @relation(fields: [businessId], references: [id]) orderId String customerId String type InvoiceType status InvoiceStatus @default(PENDING_APPROVAL) version Int @default(1) number String? // diisi saat disetujui, tidak pernah dipakai ulang amount BigInt // jumlah yang ditagihkan di invoice ini paidAmount BigInt @default(0) issueDate DateTime? dueDate DateTime? theme InvoiceTheme? snapshot Json? // diisi saat disetujui, DILARANG diubah setelahnya requestedById String requestedAt DateTime @default(now()) approvedById String? approvedAt DateTime? rejectReason String? @db.Text voidReason String? @db.Text voidedAt DateTime? printedCount Int @default(0) lastPrintedAt DateTime? rev Int @default(0) createdAt DateTime @default(now()) updatedAt DateTime @updatedAt deletedAt DateTime? @@unique([businessId, number]) @@index([businessId, status]) @@index([orderId])}model Payment { id String @id @default(cuid()) businessId String business Business @relation(fields: [businessId], references: [id]) orderId String invoiceId String? type PaymentType @default(RECEIPT) method PaymentMethod @default(TRANSFER) status PaymentStatus @default(PENDING_VERIFICATION) amount BigInt // selalu positif; arah ditentukan oleh type paidAt DateTime reference String? proofPath String? notes String? @db.Text createdById String verifiedById String? verifiedAt DateTime? rejectReason String? @db.Text createdAt DateTime @default(now()) updatedAt DateTime @updatedAt @@index([businessId, orderId]) @@index([businessId, status])}model Shipment { id String @id @default(cuid()) businessId String business Business @relation(fields: [businessId], references: [id]) orderId String @unique // satu pengiriman per order di versi ini deliveryNo String? @unique // nomor surat jalan, diisi saat SHIPPED method ShipMethod transporterId String? // Vendor kind TRANSPORT trackingNo String? driverName String? vehiclePlate String? receiverName String? status ShipStatus @default(PREPARING) actualCost BigInt @default(0) // RAHASIA: ongkir yang dibayar usaha shippedAt DateTime? deliveredAt DateTime? notes String? @db.Text createdAt DateTime @default(now()) updatedAt DateTime @updatedAt}model CreditNote { id String @id @default(cuid()) businessId String business Business @relation(fields: [businessId], references: [id]) orderId String customerId String number String // KODECUST/CN/DD/MM/YYYY/NNNN reason String @db.Text settlement CreditSettlement amountExPpn BigInt ppnAmount BigInt @default(0) total BigInt cogsReversed BigInt @default(0) // RAHASIA createdById String createdAt DateTime @default(now()) voidedAt DateTime? items CreditNoteItem[] @@unique([businessId, number]) @@index([businessId, orderId])}model CreditNoteItem { id String @id @default(cuid()) creditNoteId String creditNote CreditNote @relation(fields: [creditNoteId], references: [id]) orderItemId String qty Int creditAmount BigInt restock Boolean @default(true) costReversed BigInt @default(0) // RAHASIA}model CustomerCreditEntry { id String @id @default(cuid()) businessId String customerId String customer Customer @relation(fields: [customerId], references: [id]) amount BigInt // positif = saldo bertambah, negatif = dipakai atau dikembalikan reason String orderId String? creditNoteId String? paymentId String? createdById String createdAt DateTime @default(now()) @@index([businessId, customerId])}

### 6.6 Pembelian ke vendor, stok, komisi

model PurchaseOrder { id String @id @default(cuid()) businessId String business Business @relation(fields: [businessId], references: [id]) vendorId String vendor Vendor @relation(fields: [vendorId], references: [id]) vendorSeq Int? poNo String? // KODEVENDOR/PO/DD/MM/YYYY/NNNN, diisi saat status ORDERED status PoStatus @default(DRAFT) orderDate DateTime expectedDate DateTime? subtotal BigInt @default(0) shippingCost BigInt @default(0) otherCost BigInt @default(0) total BigInt @default(0) paidTotal BigInt @default(0) notes String? @db.Text createdById String createdAt DateTime @default(now()) updatedAt DateTime @updatedAt deletedAt DateTime? items PurchaseOrderItem[] @@unique([businessId, poNo]) @@index([businessId, vendorId])}model PurchaseOrderItem { id String @id @default(cuid()) purchaseOrderId String purchaseOrder PurchaseOrder @relation(fields: [purchaseOrderId], references: [id]) productId String qty Int receivedQty Int @default(0) unitCost BigInt lineTotal BigInt}model VendorPayment { id String @id @default(cuid()) businessId String vendorId String purchaseOrderId String? amount BigInt paidAt DateTime method PaymentMethod @default(TRANSFER) reference String? proofPath String? notes String? @db.Text createdById String createdAt DateTime @default(now()) voidedAt DateTime? @@index([businessId, vendorId])}model StockMovement { id String @id @default(cuid()) businessId String productId String type StockMoveType qtyDelta Int // + masuk, - keluar balanceAfter Int refType String? // ORDER, PURCHASE_ORDER, CREDIT_NOTE, MANUAL refId String? note String? createdById String createdAt DateTime @default(now()) @@index([businessId, productId, createdAt])}model CommissionEntry { // RAHASIA id String @id @default(cuid()) businessId String orderId String @unique salesId String mode CommissionMode basisAmount BigInt // profit atau omzet yang dipakai rateBps Int // 0 bila mode nominal tetap amount BigInt status CommissionStatus @default(EARNED) earnedAt DateTime @default(now()) paidAt DateTime? reversedAt DateTime? note String? @@index([businessId, salesId, earnedAt])}

### 6.7 Pengingat, katalog, penomoran, audit, catatan pembaruan

model Reminder { id String @id @default(cuid()) businessId String customerId String customer Customer @relation(fields: [customerId], references: [id]) productId String? // null = pengingat tingkat customer salesId String intervalDays Int lastOrderDate DateTime nextDueDate DateTime status ReminderStatus @default(ACTIVE) source ReminderSource @default(AUTO) snoozedUntil DateTime? lastNotifiedAt DateTime? escalatedAt DateTime? note String? @@index([businessId, status, nextDueDate]) @@index([customerId, productId])}model Notification { id String @id @default(cuid()) businessId String? userId String type String // REPEAT_DUE, INVOICE_DUE, APPROVAL_REQUEST, LOW_STOCK, ... title String body String @db.Text linkPath String? dedupeKey String @unique // mencegah notifikasi ganda readAt DateTime? telegramSentAt DateTime? telegramError String? createdAt DateTime @default(now()) @@index([userId, createdAt])}model Catalog { id String @id @default(cuid()) businessId String business Business @relation(fields: [businessId], references: [id]) ownerId String // user pembuat customerId String? // bila diisi, floor memakai harga minimal customer itu title String // contoh: Grosir, Distributor Tunggal, Ecer note String? @db.Text createdAt DateTime @default(now()) updatedAt DateTime @updatedAt deletedAt DateTime? items CatalogItem[] @@index([businessId, ownerId])}model CatalogItem { id String @id @default(cuid()) catalogId String catalog Catalog @relation(fields: [catalogId], references: [id]) productId String price BigInt sortOrder Int @default(0) @@unique([catalogId, productId])}model DocumentCounter { id String @id @default(cuid()) businessId String scope String // ORDER_SEQ (scopeId = customerId), PO_SEQ (vendorId), CREDIT_NOTE_SEQ (customerId) scopeId String lastSeq Int @default(0) @@unique([businessId, scope, scopeId])}model AuditLog { id String @id @default(cuid()) businessId String? actorId String? actorRole Role? action String // contoh: ORDER_SUBMIT, INVOICE_APPROVE, PRICE_CHANGE, ORDER_PURGE entityType String entityId String summary String? before Json? after Json? reason String? @db.Text ip String? createdAt DateTime @default(now()) @@index([businessId, entityType, entityId]) @@index([createdAt])}model ReleaseNote { id String @id @default(cuid()) version String title String bodyMarkdown String @db.Text createdById String publishedAt DateTime? // null = draft broadcastAt DateTime? createdAt DateTime @default(now())}

### 6.8 Constraint dan indeks yang Prisma tidak bisa buat

Buat satu migrasi kosong (pnpm prisma migrate dev --create-only --name db_constraints), isi dengan SQL berikut, lalu jalankan. Ini jaring pengaman terakhir bila kode salah.
ALTER TABLE "Product" ADD CONSTRAINT product_min_le_base CHECK ("minPrice" <= "basePrice");ALTER TABLE "Product" ADD CONSTRAINT product_money_nonneg CHECK ("costPrice" >= 0 AND "basePrice" >= 0 AND "minPrice" >= 0);ALTER TABLE "Product" ADD CONSTRAINT product_reserved_nonneg CHECK ("reservedQty" >= 0);ALTER TABLE "Order" ADD CONSTRAINT order_money_nonneg CHECK ("subtotal" >= 0 AND "discountTotal" >= 0 AND "shippingCharge" >= 0 AND "grandTotal" >= 0 AND "dpAmount" >= 0);ALTER TABLE "Order" ADD CONSTRAINT order_dp_range CHECK ("dpBps" >= 0 AND "dpBps" <= 9900);ALTER TABLE "OrderItem" ADD CONSTRAINT orderitem_qty_pos CHECK ("qty" > 0);ALTER TABLE "Payment" ADD CONSTRAINT payment_amount_pos CHECK ("amount" > 0);ALTER TABLE "Invoice" ADD CONSTRAINT invoice_amount_nonneg CHECK ("amount" >= 0 AND "paidAmount" >= 0);-- hanya satu invoice aktif per order dan tipe (revisi dibuat setelah yang lama ditolak, ditarik, atau di-void)CREATE UNIQUE INDEX invoice_one_active_per_type ON "Invoice" ("orderId", "type") WHERE "status" IN ('PENDING_APPROVAL', 'APPROVED') AND "deletedAt" IS NULL;-- satu pengingat aktif per customer dan produk (NULL dianggap sama lewat COALESCE)CREATE UNIQUE INDEX reminder_one_per_target ON "Reminder" ("customerId", COALESCE("productId", '')) WHERE "status" IN ('ACTIVE', 'PAUSED');

## 7. Aturan Bisnis dan Kode Logika Uang

Semua kode di bagian ini masuk ke src/lib/domain/ (fungsi murni) atau src/lib/services/ (bertransaksi). Salin apa adanya, lalu tulis tesnya dari contoh hitungan di 7.7. Bila agent merasa rumus perlu diubah, berhenti dan tanya pemilik.

### 7.1 money.ts: fondasi uang

// src/lib/domain/money.tsexport type Rupiah = number // bilangan bulatexport type Bps = number // 1% = 100export class DomainError extends Error { constructor(public code: string, message: string, public status = 422, public details?: unknown) { super(message) }}export function assertInt(n: number, label = 'nilai'): number { if (!Number.isSafeInteger(n)) { throw new DomainError('NOT_SAFE_INTEGER', `${label} bukan bilangan bulat aman: ${n}`, 500) } return n}export const fromDb = (v: bigint): Rupiah => assertInt(Number(v), 'fromDb')export const toDb = (n: Rupiah): bigint => BigInt(assertInt(n, 'toDb'))// Persen dalam bps, pembulatan setengah ke atas, murni aritmetika bilangan bulat.export function applyBps(amount: Rupiah, bps: Bps): Rupiah { assertInt(amount, 'amount') assertInt(bps, 'bps') if (amount < 0 || bps < 0) throw new DomainError('NEGATIVE_INPUT', 'applyBps hanya untuk nilai non-negatif', 500) const n = assertInt(amount * bps, 'amount*bps') + 5000 return (n - (n % 10000)) / 10000}export function formatRupiah(n: Rupiah): string { return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(n)}

### 7.2 pricing.ts: harga minimal (floor) dan promo

Aturan:
Floor dasar = harga minimal khusus customer (CustomerMinPrice) bila ada, jika tidak Product.minPrice.
Satu baris order hanya boleh punya satu diskon. Sumbernya MANUAL (nego sales), PROMO, atau SUBSIDY (dua terakhir berasal dari CustomerPromo buatan Super Admin).
Diskon PROMO/SUBSIDY sudah disetujui lebih dulu, jadi menurunkan floor baris itu sebesar potongan promonya. Diskon MANUAL tidak menurunkan floor.
Baris di bawah minimal bila lineNet < floorPerUnit x qty (dibandingkan total baris, bukan per unit, agar tidak terkena pembulatan).
// src/lib/domain/pricing.tsimport { applyBps, Rupiah } from './money'export interface PromoRule { id: string label: string source: 'PROMO' | 'SUBSIDY' type: 'PERCENT' | 'AMOUNT' valueBps: number | null valueAmount: number | null // potongan per unit productId: string | null // null = semua produk validFrom: Date validTo: Date | null isActive: boolean}export function isPromoActive(r: PromoRule, productId: string, at: Date): boolean { if (!r.isActive) return false if (r.productId !== null && r.productId !== productId) return false if (at < r.validFrom) return false if (r.validTo !== null && at > r.validTo) return false return true}export function promoPerUnit(r: PromoRule, basis: Rupiah): Rupiah { const v = r.type === 'PERCENT' ? applyBps(basis, r.valueBps ?? 0) : (r.valueAmount ?? 0) return Math.min(v, basis)}export const baseFloor = (productMin: Rupiah, customerMin: Rupiah | null): Rupiah => customerMin ?? productMinexport function lineFloor(base: Rupiah, promo: PromoRule | null): Rupiah { return promo ? Math.max(0, base - promoPerUnit(promo, base)) : base}export const isBelowFloor = (lineNet: Rupiah, qty: number, floorPerUnit: Rupiah): boolean => lineNet < floorPerUnit \* qty

### 7.3 order.ts: total baris dan total order

// src/lib/domain/order.tsimport { applyBps, assertInt, DomainError, Rupiah } from './money'export interface LineInput { qty: number unitPrice: Rupiah discountType: 'NONE' | 'PERCENT' | 'AMOUNT' discountValue: number // bps bila PERCENT, Rupiah TOTAL BARIS bila AMOUNT}export interface LineResult { lineSubtotal: Rupiah lineDiscount: Rupiah lineNet: Rupiah}export function calcLine(i: LineInput): LineResult { assertInt(i.qty, 'qty') assertInt(i.unitPrice, 'unitPrice') if (i.qty <= 0) throw new DomainError('QTY_INVALID', 'Jumlah harus lebih dari 0') if (i.unitPrice < 0) throw new DomainError('PRICE_INVALID', 'Harga tidak boleh negatif') const lineSubtotal = assertInt(i.unitPrice \* i.qty, 'lineSubtotal') let lineDiscount = 0 if (i.discountType === 'PERCENT') { if (i.discountValue < 0 || i.discountValue > 10000) throw new DomainError('DISCOUNT_INVALID', 'Persen diskon 0-100') lineDiscount = applyBps(lineSubtotal, i.discountValue) } else if (i.discountType === 'AMOUNT') { if (i.discountValue < 0) throw new DomainError('DISCOUNT_INVALID', 'Diskon tidak boleh negatif') lineDiscount = assertInt(i.discountValue, 'discountValue') } if (lineDiscount > lineSubtotal) throw new DomainError('DISCOUNT_EXCEEDS_LINE', 'Diskon melebihi nilai baris') return { lineSubtotal, lineDiscount, lineNet: lineSubtotal - lineDiscount }}export interface OrderTotalsInput { lines: LineResult[] shippingCharge: Rupiah // yang ditagihkan ke customer, boleh 0 ppnEnabled: boolean ppnRateBps: number dpBps: number // 0 = tanpa DP}export function calcOrderTotals(i: OrderTotalsInput) { if (i.lines.length === 0) throw new DomainError('ORDER_EMPTY', 'Order harus punya minimal satu baris') if (i.shippingCharge < 0) throw new DomainError('SHIPPING_INVALID', 'Ongkir tidak boleh negatif') if (i.dpBps < 0 || i.dpBps > 9900) throw new DomainError('DP_INVALID', 'DP harus 0 sampai 99 persen') const subtotal = i.lines.reduce((s, l) => s + l.lineSubtotal, 0) const discountTotal = i.lines.reduce((s, l) => s + l.lineDiscount, 0) const goodsNet = subtotal - discountTotal const taxBase = goodsNet + i.shippingCharge // PPN dikenakan atas barang bersih + ongkir yang ditagihkan const ppnAmount = i.ppnEnabled ? applyBps(taxBase, i.ppnRateBps) : 0 const grandTotal = taxBase + ppnAmount const dpAmount = i.dpBps > 0 ? applyBps(grandTotal, i.dpBps) : 0 return { subtotal, discountTotal, goodsNet, shippingCharge: i.shippingCharge, ppnAmount, grandTotal, dpAmount }}
Saldo order (dipakai pembayaran dan dashboard): balanceDue = grandTotal - creditTotal - paidTotal. Jumlah invoice pelunasan (dua tahap) = grandTotal - dpAmount. Bila dpBps = 0, hanya ada satu invoice bertipe FINAL untuk seluruh grandTotal, diajukan langsung saat order diajukan.

### 7.4 profit.ts: profit per order (hanya Super Admin)

Rumus yang disepakati pemilik:
Pendapatan barang = jumlah lineNet semua baris - jumlah kredit retur (tanpa PPN)Pendapatan ongkir = shippingCharge (yang ditagihkan ke customer)HPP terjual = jumlah (costPrice x qty) - HPP yang dibalik oleh retur yang di-restockBiaya ongkir aktual = Shipment.actualCost (yang dibayar usaha)Biaya lain = jumlah OrderCostPROFIT = Pendapatan barang + Pendapatan ongkir - HPP terjual - Biaya ongkir aktual - Biaya lain
PPN bukan pendapatan dan tidak masuk profit. Diskon, promo, dan subsidi harga sudah mengurangi lineNet. Subsidi ongkir = max(0, biaya ongkir aktual - ongkir yang ditagihkan), hanya untuk laporan karena sudah ikut mengurangi profit.
// src/lib/domain/profit.tsexport interface ProfitInput { items: { qty: number; lineNet: number; costPrice: number; discountSource: 'MANUAL' | 'PROMO' | 'SUBSIDY'; lineDiscount: number }[] returns: { creditExPpn: number; cogsReversed: number }[] // hanya credit note yang tidak void shippingCharge: number shippingActualCost: number extraCosts: number[]}export function calcProfit(i: ProfitInput) { const goodsRevenue = i.items.reduce((s, x) => s + x.lineNet, 0) - i.returns.reduce((s, r) => s + r.creditExPpn, 0) const cogs = i.items.reduce((s, x) => s + x.costPrice _ x.qty, 0) - i.returns.reduce((s, r) => s + r.cogsReversed, 0) const extra = i.extraCosts.reduce((s, c) => s + c, 0) const revenue = goodsRevenue + i.shippingCharge const profit = revenue - cogs - i.shippingActualCost - extra const bySource = { MANUAL: 0, PROMO: 0, SUBSIDY: 0 } for (const x of i.items) bySource[x.discountSource] += x.lineDiscount return { revenue, goodsRevenue, cogs, shippingActualCost: i.shippingActualCost, extraCosts: extra, profit, marginBps: revenue > 0 ? Math.round((profit _ 10000) / revenue) : 0, // persen margin, bukan uang shippingSubsidy: Math.max(0, i.shippingActualCost - i.shippingCharge), discountBySource: bySource, }}

### 7.5 credit.ts: retur (credit note) yang konsisten untuk retur bertahap

Kredit untuk baris dihitung kumulatif supaya beberapa kali retur tidak menumpuk selisih pembulatan.
// src/lib/domain/credit.tsimport { applyBps, DomainError } from './money'// Kredit kumulatif untuk r unit dari baris (setengah ke atas, aritmetika bilangan bulat)export function creditForQty(lineNet: number, qty: number, returnedQty: number): number { if (returnedQty < 0 || returnedQty > qty) throw new DomainError('RETURN_QTY_INVALID', 'Jumlah retur melebihi jumlah order') const d = 2 _ qty const n = lineNet _ returnedQty \* 2 + qty return (n - (n % d)) / d}// Kredit retur saat ini = kumulatif setelah retur - kumulatif sebelum returexport function creditThisReturn(lineNet: number, qty: number, alreadyReturned: number, nowReturning: number): number { return creditForQty(lineNet, qty, alreadyReturned + nowReturning) - creditForQty(lineNet, qty, alreadyReturned)}export function creditNoteTotals(creditExPpn: number, ppnEnabled: boolean, ppnRateBps: number) { const ppnAmount = ppnEnabled ? applyBps(creditExPpn, ppnRateBps) : 0 return { amountExPpn: creditExPpn, ppnAmount, total: creditExPpn + ppnAmount }}// HPP yang dibalik = costPrice (snapshot) x qty, HANYA untuk baris dengan restock = true

### 7.6 commission.ts: komisi (hanya Super Admin)

Konfigurasi efektif sales = User.commission* bila terisi, jika tidak Business.commission*. Komisi dihitung otomatis saat pemicu terpenuhi: ON_FULL_PAID (saldo order sudah 0 setelah pembayaran terverifikasi) atau ON_DP_PAID (DP terverifikasi). Entri CommissionEntry dibuat atau diperbarui (upsert per order) dengan status EARNED. Setelah retur atau perubahan biaya, entri yang belum PAID dihitung ulang. Void order mengubah entri jadi REVERSED. Super Admin menandai PAID secara manual.
// src/lib/domain/commission.tsimport { applyBps } from './money'export type Mode = 'PERCENT_OF_PROFIT' | 'PERCENT_OF_REVENUE' | 'TIERED_BY_TARGET' | 'FIXED_PER_ORDER'export function pickTierRate(tiers: { minAchievementBps: number; rateBps: number }[], achievementBps: number): number { const ok = tiers.filter((t) => t.minAchievementBps <= achievementBps).sort((a, b) => b.minAchievementBps - a.minAchievementBps) return ok.length > 0 ? ok[0].rateBps : 0}// capaian = omzet bulan itu / target omzet; target 0 -> 0export const achievementBps = (monthRevenue: number, target: number): number => target > 0 ? Math.floor((monthRevenue \* 10000) / target) : 0export function calcCommission(p: { mode: Mode; rateBps: number; fixedAmount: number; profit: number; revenue: number; tierRateBps: number}) { switch (p.mode) { case 'PERCENT_OF_PROFIT': { const basis = Math.max(0, p.profit) return { basis, rateBps: p.rateBps, amount: applyBps(basis, p.rateBps) } } case 'PERCENT_OF_REVENUE': { const basis = Math.max(0, p.revenue) return { basis, rateBps: p.rateBps, amount: applyBps(basis, p.rateBps) } } case 'TIERED_BY_TARGET': { const basis = Math.max(0, p.profit) return { basis, rateBps: p.tierRateBps, amount: applyBps(basis, p.tierRateBps) } } case 'FIXED_PER_ORDER': return { basis: 0, rateBps: 0, amount: p.fixedAmount } }}
Omzet bulan untuk mode bertingkat = jumlah pendapatan barang + ongkir ditagihkan (tanpa PPN) dari order sales itu yang tanggal persetujuan invoice pertamanya jatuh di bulan itu (WIB) dan tidak CANCELLED.

### 7.7 Contoh hitungan WAJIB dijadikan tes

Semua angka dalam Rupiah. Ini fixture tes untuk calcLine, calcOrderTotals, calcProfit, dan calcCommission. Hasil kode harus persis sama.
| Input | Nilai |
| Baris A | qty 10, harga deal 100.000, diskon 5% (500 bps), HPP 70.000 |
| Baris B | qty 5, harga deal 40.000, diskon nominal 10.000 (total baris), HPP 25.000 |
| Ongkir ditagihkan | 50.000 |
| Ongkir aktual | 80.000 |
| PPN | aktif 11% (1100 bps), DP 50% (5000 bps) |
| Komisi | 10% dari profit (1000 bps) |

| Hasil | Nilai |
| Baris A: subtotal / diskon / net | 1.000.000 / 50.000 / 950.000 |
| Baris B: subtotal / diskon / net | 200.000 / 10.000 / 190.000 |
| Subtotal / diskon total / barang bersih | 1.200.000 / 60.000 / 1.140.000 |
| Dasar PPN (barang bersih + ongkir) | 1.190.000 |
| PPN 11% | 130.900 |
| Grand total (PPN aktif) | 1.320.900 |
| Grand total (PPN nonaktif) | 1.190.000 |
| DP 50% dari 1.320.900 | 660.450 |
| Invoice pelunasan | 660.450 |
| HPP terjual (700.000 + 125.000) | 825.000 |
| Profit (1.140.000 + 50.000 - 825.000 - 80.000) | 285.000 |
| Subsidi ongkir (80.000 - 50.000) | 30.000 |
| Komisi 10% dari profit | 28.500 |
| applyBps(1.234.567, 350) (3,5%) | 43.210 |
| Retur 2 unit baris A, di-restock: kredit | 190.000 (950.000 x 2 / 10) |
| HPP dibalik retur | 140.000 |
| Profit setelah retur (950.000 + 50.000 - 685.000 - 80.000) | 235.000 |

### 7.8 Penomoran dokumen

Format: KODE/JENIS/DD/MM/YYYY/NNNN. KODE = kode customer (invoice, surat jalan, credit note) atau kode vendor (PO). Tanggal memakai tanggal WIB saat nomor dialokasikan.
Nomor order (Order.orderNo) dialokasikan saat invoice pertama order itu disetujui, bukan saat draft. Urutannya berjalan per customer dan tidak pernah reset (DocumentCounter scope ORDER_SEQ).
Nomor invoice = orderNo + akhiran: -DP untuk invoice DP, -LNS untuk pelunasan. Bila invoice direvisi (versi 2 dan seterusnya) ditambah -R1, -R2. Contoh: TEROBOS/INV/05/11/2026/0007-DP, TEROBOS/INV/05/11/2026/0007-LNS, TEROBOS/INV/05/11/2026/0007-DP-R1.
Surat jalan: KODE/SJ/DD/MM/YYYY/NNNN memakai customerSeq order yang sama. Credit note: KODE/CN/... dengan urutan sendiri (CREDIT_NOTE_SEQ). PO: KODEVENDOR/PO/... (PO_SEQ, dialokasikan saat PO berstatus ORDERED).
Nomor yang sudah dipakai tidak pernah dipakai ulang, termasuk bila dokumen di-void.
Kode customer tidak bisa diubah setelah punya invoice. Kode usaha tidak bisa diubah setelah ada order.
// src/lib/domain/numbering.tsconst fmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jakarta', day: '2-digit', month: '2-digit', year: 'numeric' })export function wibParts(d: Date) { const p = Object.fromEntries(fmt.formatToParts(d).map((x) => [x.type, x.value])) return { dd: p.day, mm: p.month, yyyy: p.year }}export function formatDocNumber(a: { code: string; kind: 'INV' | 'PO' | 'CN' | 'SJ'; date: Date; seq: number }): string { const { dd, mm, yyyy } = wibParts(a.date) return `${a.code}/${a.kind}/${dd}/${mm}/${yyyy}/${String(a.seq).padStart(4, '0')}`}export function invoiceNumber(orderNo: string, type: 'DP' | 'FINAL', version: number): string { const rev = version > 1 ? `-R${version - 1}` : '' return `${orderNo}-${type === 'DP' ? 'DP' : 'LNS'}${rev}`}
Alokasi urutan harus atomik dan berada di transaksi yang sama dengan persetujuan, supaya bila persetujuan gagal, nomor tidak hangus, dan dua persetujuan bersamaan untuk customer yang sama tidak mendapat nomor kembar:
// src/lib/services/counter.tsimport { Prisma } from '@prisma/client'import { randomUUID } from 'node:crypto'export async function nextSeq(tx: Prisma.TransactionClient, businessId: string, scope: string, scopeId: string): Promise<number> { const rows = await tx.$queryRaw<{ lastSeq: number }[]>`    INSERT INTO "DocumentCounter" ("id", "businessId", "scope", "scopeId", "lastSeq")    VALUES (${randomUUID()}, ${businessId}, ${scope}, ${scopeId}, 1) ON CONFLICT ("businessId", "scope", "scopeId") DO UPDATE SET "lastSeq" = "DocumentCounter"."lastSeq" + 1 RETURNING "lastSeq"` return rows[0].lastSeq}

### 7.9 Stok: aturan dan kode

Definisi: tersedia = stockQty - reservedQty. Stok berubah hanya lewat fungsi di bawah (dilarang product.update({ stockQty }) di tempat lain).
| Peristiwa | reservedQty | stockQty | Catatan |
| Invoice pertama order disetujui | + qty | tidak berubah | Cek ketersediaan bila allowNegativeStock mati. Order.stockReserved = true. |
| Pengiriman ditandai SHIPPED | - qty | - qty | StockMovement SALE_SHIPMENT. stockReserved = false. |
| Order di-void sebelum kirim | - qty | tidak berubah | Hanya bila stockReserved = true. |
| Order di-void setelah kirim | tidak berubah | + qty bila barang kembali | Super Admin memilih restock. Movement VOID_REVERSAL. |
| Credit note, baris restock = true | tidak berubah | + qty | RETURN_IN. |
| Penerimaan PO | tidak berubah | + qty | PO_RECEIPT. |
| Koreksi manual | tidak berubah | +/- qty | ADJUSTMENT, alasan wajib. |
| Opname | tidak berubah | ke jumlah hitung | OPNAME, qtyDelta = hitung - stockQty. |

Stok minus: bila allowNegativeStock menyala, pemesanan diizinkan walau tersedia kurang. Produk dengan stockQty - reservedQty < 0 ditandai di dashboard Super Admin. Satu produk tidak boleh muncul dua kali dalam satu order (422 DUPLICATE_PRODUCT).
// src/lib/services/stock.tsimport { Prisma, StockMoveType } from '@prisma/client'import { DomainError } from '../domain/money'type Tx = Prisma.TransactionClient// WAJIB dipanggil sebelum mengubah stok. Urut berdasarkan id supaya tidak deadlock.export async function lockProducts(tx: Tx, ids: string[]) { const sorted = [...new Set(ids)].sort() if (sorted.length === 0) return await tx.$queryRaw`SELECT "id" FROM "Product" WHERE "id" IN (${Prisma.join(sorted)}) ORDER BY "id" FOR UPDATE`}export async function moveStock(tx: Tx, p: { businessId: string; productId: string; type: StockMoveType; qtyDelta: number refType?: string; refId?: string; note?: string; actorId: string}) { const prod = await tx.product.update({ where: { id: p.productId }, data: { stockQty: { increment: p.qtyDelta } }, select: { stockQty: true }, }) await tx.stockMovement.create({ data: { businessId: p.businessId, productId: p.productId, type: p.type, qtyDelta: p.qtyDelta, balanceAfter: prod.stockQty, refType: p.refType, refId: p.refId, note: p.note, createdById: p.actorId, }, })}export async function reserveOrderStock( tx: Tx, order: { id: string; businessId: string; stockReserved: boolean }, items: { productId: string; qty: number }[], allowNegative: boolean,) { if (order.stockReserved) return // idempoten const ids = items.map((i) => i.productId) await lockProducts(tx, ids) const products = await tx.product.findMany({ where: { id: { in: ids }, businessId: order.businessId }, select: { id: true, name: true, stockQty: true, reservedQty: true }, }) const short = items .map((i) => { const p = products.find((x) => x.id === i.productId) if (!p) throw new DomainError('PRODUCT_NOT_FOUND', 'Produk tidak ditemukan', 404) return { name: p.name, need: i.qty, available: p.stockQty - p.reservedQty } }) .filter((x) => !allowNegative && x.available < x.need) if (short.length > 0) { throw new DomainError('INSUFFICIENT_STOCK', 'Stok tidak cukup untuk beberapa produk', 409, short) } for (const i of items) { await tx.product.update({ where: { id: i.productId }, data: { reservedQty: { increment: i.qty } } }) } await tx.order.update({ where: { id: order.id }, data: { stockReserved: true } })}// releaseOrderStock (void sebelum kirim) dan shipOrderStock (kirim) memakai pola yang sama:// lockProducts -> ubah reservedQty/stockQty -> moveStock -> set Order.stockReserved.

### 7.10 Aturan harga dan riwayat harga

Harga dasar, harga minimal, HPP, dan harga minimal customer hanya diubah Super Admin, dan setiap perubahan wajib reason (minimal 5 karakter).
Setiap perubahan menulis satu baris PriceHistory dan satu AuditLog di transaksi yang sama, dan menaikkan rev produk (kunci optimistik).
Riwayat harga tidak tampil di invoice, surat jalan, maupun katalog.
Perubahan harga tidak menyentuh order yang sudah punya snapshot. Pada order draft, harga deal yang diketik sales dipertahankan, sedangkan HPP, floor, dan PPN dihitung ulang dari data terbaru saat order diajukan, lalu dibekukan di baris order dan invoice.
minPrice <= basePrice dijaga di service (422 MIN_GT_BASE) dan di constraint database.

### 7.11 Aturan persetujuan dan pembayaran

Pengajuan dengan baris di bawah floor wajib punya belowMinReason dari sales. Order ditandai hasBelowMin = true.
Super Admin yang menyetujui order hasBelowMin wajib mengisi overrideNote. Menyetujui tanpa catatan: 422 OVERRIDE_NOTE_REQUIRED.
Menolak selalu wajib rejectReason. Setelah ditolak, order menjadi REVISION_REQUIRED. Sales memperbaiki dan mengajukan lagi: Order.version naik 1 (hanya penghitung revisi). Pengajuan ulang membuat invoice baru dengan version = 1 + jumlah invoice sebelumnya (tipe sama) yang REJECTED atau VOID, sehingga nomornya mendapat akhiran -R1.
Invoice yang sudah APPROVED terkunci: snapshot dan nominal tidak boleh diubah. Perubahan hanya lewat void lalu pengajuan ulang (versi baru).
Pembayaran melebihi sisa tagihan ditolak (422 OVERPAYMENT). Pembayaran masuk sebagai PENDING_VERIFICATION; hanya yang VERIFIED menambah paidTotal dan Invoice.paidAmount.
Tagihan pelunasan (dua tahap) hanya boleh diajukan bila DP sudah lunas terverifikasi (Order.status = IN_PROCESS).
Jatuh tempo invoice = tanggal terbit + Business.dueDays, bisa diubah Super Admin saat menyetujui. "Terlambat" dihitung saat dibaca (dueDate < hari ini dan belum lunas), bukan disimpan sebagai status.

## 8. State Machine dan Alur Dokumen

Setiap perpindahan status adalah satu fungsi service bertransaksi yang (1) mengunci baris order, (2) memeriksa status asal, (3) mengubah data, (4) menulis audit log, (5) membuat notifikasi. Dilarang mengubah status dengan update biasa di tempat lain.

### 8.1 Alur order

stateDiagram-v2 [*] --> DRAFT DRAFT --> PENDING_APPROVAL: submit PENDING_APPROVAL --> DRAFT: withdraw PENDING_APPROVAL --> REVISION_REQUIRED: reject REVISION_REQUIRED --> PENDING_APPROVAL: submit ulang PENDING_APPROVAL --> AWAITING_DP: approve invoice DP PENDING_APPROVAL --> AWAITING_FINAL_PAYMENT: approve invoice tunggal tanpa DP AWAITING_DP --> IN_PROCESS: DP lunas terverifikasi IN_PROCESS --> FINAL_PENDING_APPROVAL: ajukan pelunasan FINAL_PENDING_APPROVAL --> IN_PROCESS: reject atau withdraw FINAL_PENDING_APPROVAL --> AWAITING_FINAL_PAYMENT: approve pelunasan AWAITING_FINAL_PAYMENT --> COMPLETED: lunas dan sudah dikirim COMPLETED --> [*]
Dari status apa pun (kecuali CANCELLED) Super Admin dapat memindahkan order ke CANCELLED lewat void (bagian 9).

### 8.2 Tabel transisi order

| Dari | Ke | Aksi (endpoint) | Siapa | Syarat | Efek samping |
| (baru) | DRAFT | POST /orders | SA, Sales (milik sendiri) | Customer ada di usaha itu dan milik sales | orderDate hari ini, dpBps dari Business.defaultDpBps, PPN dari toggle usaha |
| DRAFT, REVISION_REQUIRED | sama | PATCH /orders/:id | pembuat, SA | Hanya di dua status ini | Server menghitung ulang semua total |
| DRAFT, REVISION_REQUIRED | PENDING_APPROVAL | POST /orders/:id/submit | pembuat, SA | Minimal satu baris, tidak ada produk ganda, alasan terisi bila ada baris di bawah floor | Hitung ulang snapshot (HPP, floor, PPN), buat Invoice (DP bila dpBps > 0, selain itu FINAL) berstatus PENDING_APPROVAL, version = 1 + jumlah invoice sebelumnya (tipe sama) yang REJECTED atau VOID, notifikasi ke SA dengan tombol |
| PENDING_APPROVAL | DRAFT | POST /orders/:id/withdraw | pembuat, SA | Invoice masih PENDING_APPROVAL | Invoice menjadi WITHDRAWN |
| PENDING_APPROVAL | REVISION_REQUIRED | POST /invoices/:id/reject | SA | reason wajib | Invoice REJECTED, Order.rejectReason, Order.version + 1, notifikasi ke sales |
| PENDING_APPROVAL | AWAITING_DP atau AWAITING_FINAL_PAYMENT | POST /invoices/:id/approve | SA | Cek stok (bila allowNegativeStock mati). Bila hasBelowMin, overrideNote wajib | Alokasi customerSeq dan orderNo (bila belum ada), nomor invoice, issueDate, dueDate, theme, isi snapshot, reservasi stok, notifikasi ke sales (bisa cetak) |
| AWAITING_DP | IN_PROCESS | POST /payments/:id/verify | SA | DP invoice paidAmount >= amount | Komisi bila pemicu ON_DP_PAID |
| IN_PROCESS | FINAL_PENDING_APPROVAL | POST /orders/:id/request-final | pembuat, SA | DP lunas. Boleh menyertakan shippingCharge baru + alasan | Bila ongkir berubah: perbarui shippingCharge, ppnAmount, grandTotal. Buat invoice FINAL senilai grandTotal - dpAmount |
| FINAL_PENDING_APPROVAL | IN_PROCESS | reject atau withdraw invoice final | SA atau pembuat | Seperti di atas | Invoice REJECTED atau WITHDRAWN |
| FINAL_PENDING_APPROVAL | AWAITING_FINAL_PAYMENT | POST /invoices/:id/approve | SA | Nomor orderNo sudah ada | Nomor invoice -LNS, snapshot, dueDate |
| AWAITING_FINAL_PAYMENT | COMPLETED | otomatis oleh maybeComplete() | sistem | balanceDue = 0 dan pengiriman SHIPPED atau DELIVERED | Komisi bila ON_FULL_PAID, perbarui pengingat repeat order |
| status apa pun kecuali CANCELLED | CANCELLED | POST /orders/:id/void | SA | reason wajib | Pembalikan penuh (bagian 9) |

maybeComplete(orderId) dipanggil setelah pembayaran diverifikasi, pembayaran di-void, pengiriman ditandai kirim, dan credit note dibuat. Fungsi ini idempoten.

### 8.3 Status dokumen lain

| Objek | Alur status | Aturan |
| Invoice | PENDING_APPROVAL menjadi APPROVED, REJECTED, atau WITHDRAWN. APPROVED menjadi VOID. | Hanya APPROVED yang boleh dicetak. Status bayar dihitung: paidAmount = 0 belum bayar, 0 < paidAmount < amount sebagian, paidAmount >= amount lunas. |
| Pembayaran | PENDING_VERIFICATION menjadi VERIFIED atau REJECTED. VERIFIED menjadi VOID. | Pembayaran buatan Super Admin boleh langsung VERIFIED (autoVerify: true). Menolak dan void wajib alasan. |
| Pengiriman | PREPARING menjadi SHIPPED menjadi DELIVERED | Boleh dibuat saat order IN_PROCESS, FINAL_PENDING_APPROVAL, atau AWAITING_FINAL_PAYMENT. Ditandai SHIPPED hanya saat order AWAITING_FINAL_PAYMENT, dan bila requirePaidBeforeShip menyala maka balanceDue harus 0. Saat SHIPPED: alokasi nomor surat jalan, stok keluar. |
| PO vendor | DRAFT menjadi ORDERED (alokasi poNo) menjadi PARTIAL_RECEIVED menjadi RECEIVED. DRAFT atau ORDERED menjadi CANCELLED. | PO yang sudah ada penerimaan barang tidak bisa dibatalkan, harus lewat koreksi stok. |
| Pengingat | ACTIVE, PAUSED, DONE, CANCELLED | Lihat bagian 13. |

### 8.4 Aturan teknis yang mencegah celah

Kunci baris. Semua transisi memanggil lockOrder() lebih dulu, lalu membaca ulang status di dalam transaksi.
Total diturunkan dari sumbernya, bukan ditambah-tambah. Order.paidTotal dan Invoice.paidAmount selalu dihitung ulang dari jumlah pembayaran VERIFIED (RECEIPT dikurangi REFUND), bukan increment. Ini membuat verifikasi ganda atau void aman.
Satu invoice aktif per order dan tipe (dijaga indeks unik di 6.8). Pengajuan kedua saat yang pertama masih menunggu menghasilkan 409 INVOICE_ALREADY_PENDING.
Kunci optimistik. Aksi dari layar mengirim rev terakhir yang dilihat klien. Bila rev di database berbeda: 409 STALE_DATA dengan pesan "Data sudah berubah, muat ulang".
Klik ganda. Tombol aksi dinonaktifkan selama request berjalan, dan server tetap aman karena aturan 1 sampai 4.
// src/lib/services/orderGuard.tsimport { OrderStatus, Prisma } from '@prisma/client'import { DomainError } from '../domain/money'export async function lockOrder(tx: Prisma.TransactionClient, orderId: string, businessId: string) { const rows = await tx.$queryRaw<{ id: string }[]>`    SELECT "id" FROM "Order"    WHERE "id" = ${orderId} AND "businessId" = ${businessId} AND "deletedAt" IS NULL    FOR UPDATE` if (rows.length === 0) throw new DomainError('NOT_FOUND', 'Order tidak ditemukan', 404)}export function assertStatus(current: OrderStatus, allowed: OrderStatus[], action: string) { if (!allowed.includes(current)) { throw new DomainError('INVALID_STATE', `Aksi ${action} tidak boleh pada status ${current}`, 409) }}export function assertRev(clientRev: number, dbRev: number) { if (clientRev !== dbRev) throw new DomainError('STALE_DATA', 'Data sudah berubah, muat ulang halaman', 409)}

## 9. Void, Retur, Hapus, dan Pembalikan Dampak

Hanya Super Admin yang boleh membatalkan, meretur, dan menghapus. Prinsipnya: uang dan dokumen yang sudah tercatat tidak dihapus diam-diam. Pembalikan dicatat sebagai transaksi baru (refund, kredit, pergerakan stok), dan semuanya masuk audit log.

### 9.1 Tiga tingkat tindakan

| Tingkat | Dipakai untuk | Hasil | Endpoint |
| 1. Batal (void) | Transaksi gagal: customer batal, salah input, tidak jadi kirim | Dokumen tetap ada, status CANCELLED atau VOID, alasan tersimpan, semua dampak dibalik | POST /orders/:id/void, POST /invoices/:id/void, POST /payments/:id/void |
| 2. Retur (credit note) | Barang kembali sebagian atau seluruhnya setelah dikirim | Credit note bernomor, mengurangi tagihan atau menghasilkan refund atau saldo kredit, stok kembali bila restock | POST /orders/:id/credit-notes, POST /credit-notes/:id/void |
| 3. Hapus | Membersihkan data dari daftar | Soft delete (deletedAt), masuk Tempat Sampah, bisa dipulihkan. Purge (hapus permanen) hanya dari Tempat Sampah | DELETE /<resource>/:id, POST /trash/:type/:id/restore, DELETE /trash/:type/:id/purge |

### 9.2 Matriks dampak (apa yang harus dibalik)

| Dampak | Void order | Retur | Void pembayaran | Hapus |
| Stok reservasi | Dilepas bila stockReserved | Tidak ada | Tidak ada | Mengikuti void |
| Stok fisik | Dikembalikan bila sudah dikirim dan restock = true | Dikembalikan untuk baris restock (RETURN_IN) | Tidak ada | Mengikuti void |
| Uang masuk | Dibuat REFUND terverifikasi atau saldo kredit customer (wajib dipilih) | Sesuai settlement: OFFSET, REFUND, atau CUSTOMER_CREDIT | paidTotal dihitung ulang | Mengikuti void |
| Sisa tagihan (balanceDue) | Order tidak lagi ditagih | Turun bila OFFSET | Naik | Mengikuti void |
| Profit | Order dikeluarkan dari laporan. Ongkir aktual dan biaya lain yang sudah keluar tampil sebagai "Kerugian pembatalan" | Pendapatan dan HPP dikoreksi (rumus 7.4) | Tidak ada | Mengikuti void |
| Komisi | REVERSED | Dihitung ulang bila belum PAID | Dihitung ulang | Mengikuti void |
| Pengingat repeat | Dibangun ulang dari order selesai yang tersisa | Tidak ada | Tidak ada | Mengikuti void |
| Nomor dokumen | Tetap terpakai, tidak dipakai ulang | Nomor credit note baru | Tidak ada | Tidak ada |
| Audit log | ORDER_VOID dengan snapshot sebelum | CREDIT_NOTE_CREATE | PAYMENT_VOID | _\_DELETE, _\_PURGE dengan snapshot penuh |

### 9.3 Void order, langkah demi langkah

Input: reason (minimal 5 karakter, wajib). Bila ada uang masuk terverifikasi (paidTotal > 0): paymentSettlement (REFUND atau CUSTOMER_CREDIT, wajib). Bila barang sudah dikirim: restock (true atau false, wajib).
Mulai transaksi, lockOrder, pastikan status belum CANCELLED.
Ambil snapshot lengkap untuk audit (order, baris, invoice, pembayaran).
Invoice PENDING_APPROVAL menjadi WITHDRAWN. Invoice APPROVED menjadi VOID (nomor tetap tersimpan).
Pembayaran PENDING_VERIFICATION menjadi REJECTED dengan alasan "Order dibatalkan".
Hitung ulang paidTotal. Bila lebih dari 0, buat satu Payment bertipe REFUND berstatus VERIFIED atau satu CustomerCreditEntry positif, sesuai pilihan. Pembayaran asli tidak dihapus.
Stok: lepas reservasi bila stockReserved. Bila sudah dikirim dan restock = true, kembalikan stok per baris dikurangi jumlah yang sudah diretur lewat credit note (agar tidak dobel).
Komisi menjadi REVERSED. Bangun ulang pengingat customer.
Set status = CANCELLED, cancelReason, cancelledAt, naikkan rev.
Tulis audit log, kirim notifikasi ke sales pemilik order.
Bila order masih punya credit note aktif, void ditolak dengan 409 HAS_CREDIT_NOTES. Void credit note terlebih dulu.
// src/lib/services/orderVoid.ts (kerangka; isi fungsi bantu sesuai tabel 9.2)export async function voidOrder(ctx: Ctx, orderId: string, input: VoidOrderInput) { return prisma.$transaction(async (tx) => { await lockOrder(tx, orderId, ctx.businessId) const order = await tx.order.findFirstOrThrow({ where: { id: orderId, businessId: ctx.businessId, deletedAt: null }, include: { items: true }, }) assertStatus(order.status, ALL_STATUSES_EXCEPT_CANCELLED, 'void') await assertNoActiveCreditNotes(tx, orderId) const before = await snapshotOrderForAudit(tx, orderId) await tx.invoice.updateMany({ where: { orderId, status: 'PENDING_APPROVAL' }, data: { status: 'WITHDRAWN' } }) await tx.invoice.updateMany({ where: { orderId, status: 'APPROVED' }, data: { status: 'VOID', voidReason: input.reason, voidedAt: new Date() }, }) await tx.payment.updateMany({ where: { orderId, status: 'PENDING_VERIFICATION' }, data: { status: 'REJECTED', rejectReason: 'Order dibatalkan' }, }) const paid = await recomputePaidTotal(tx, orderId) // dari jumlah pembayaran VERIFIED if (paid > 0) await settleCancelledPayments(tx, ctx, order, paid, input.paymentSettlement) await revertStockForVoid(tx, ctx, order, input.restock) await reverseCommission(tx, orderId) await rebuildRemindersForCustomer(tx, order.businessId, order.customerId) await tx.order.update({ where: { id: orderId }, data: { status: 'CANCELLED', cancelReason: input.reason, cancelledAt: new Date(), rev: { increment: 1 } }, }) await audit(tx, ctx, { action: 'ORDER_VOID', entityType: 'Order', entityId: orderId, before, after: { status: 'CANCELLED' }, reason: input.reason, }) await notifyOrderVoided(tx, order) })}

### 9.4 Retur (credit note), langkah demi langkah

Syarat: order punya pengiriman SHIPPED atau DELIVERED. Input: daftar baris (orderItemId, qty, restock), reason, settlement.
Validasi tiap baris: qty lebih dari 0 dan tidak melebihi qty order - total yang sudah diretur.
Hitung kredit baris dengan creditThisReturn (7.5). amountExPpn = jumlah kredit baris, lalu creditNoteTotals untuk PPN dan total.
HPP dibalik = costPrice x qty hanya untuk baris restock = true.
Settlement:
OFFSET: total credit note dijumlahkan ke Order.creditTotal (hitung ulang dari semua credit note OFFSET yang tidak void). Total OFFSET tidak boleh melebihi balanceDue, selisihnya wajib lewat REFUND atau CUSTOMER_CREDIT (422 CREDIT_EXCEEDS_BALANCE).
REFUND: buat Payment REFUND berstatus VERIFIED.
CUSTOMER_CREDIT: buat CustomerCreditEntry positif.
Stok: RETURN_IN untuk baris restock.
Alokasi nomor KODE/CN/..., simpan, hitung ulang komisi (bila belum PAID), panggil maybeComplete.
Void credit note membalik langkah 4 dan 5 (stok dikurangi lagi, refund atau kredit dibalik dengan entri baru) dan mengisi voidedAt.
Saldo kredit customer dipakai dengan membuat Payment bermetode CREDIT oleh Super Admin, yang sekaligus menulis CustomerCreditEntry negatif di transaksi yang sama. Saldo kredit tidak boleh menjadi negatif.

### 9.5 Hapus, Tempat Sampah, dan Purge

Hapus data induk (customer, produk, vendor, katalog, kategori, pengingat, tugas): soft delete. Data yang sudah dipakai transaksi tetap terbaca di transaksinya karena memakai snapshot.
Hapus transaksi (order, invoice, pembayaran, pengiriman, PO, credit note): bila belum CANCELLED atau VOID, service menjalankan void terlebih dulu (alasan wajib), baru mengisi deletedAt. Sistem tidak pernah menghapus transaksi aktif tanpa membalik dampaknya.
Konfirmasi ketik ulang: body berisi confirm yang harus sama persis dengan nomor dokumen (atau nama untuk data induk). Salah: 422 CONFIRM_MISMATCH. UI menonaktifkan tombol sampai teks cocok.
Tempat Sampah (/trash): daftar data ber-deletedAt. Pulihkan hanya mengosongkan deletedAt dan tidak mengulang aksi yang sudah dibalik (order yang dipulihkan tetap CANCELLED).
Purge (hapus permanen): hanya dari Tempat Sampah, hanya Super Admin, wajib confirm dan reason. Sebelum baris dihapus, tulis AuditLog (\*\_PURGE) berisi snapshot JSON lengkap (beserta baris anaknya). Data induk yang masih direferensikan transaksi tidak bisa di-purge (409 IN_USE), hanya soft delete.
User dan usaha tidak dihapus, hanya dinonaktifkan (isActive = false). Menonaktifkan sales mencabut semua sesinya dan menahan notifikasinya.

## 10. Endpoint API

Semua endpoint berada di src/app/api/v1/... sebagai Route Handler dan dibungkus withApi. Tidak ada Server Action untuk mutasi. Mini App, web, dan PWA memakai endpoint yang sama.

### 10.1 Konvensi

Format JSON, nama field camelCase. Uang = bilangan bulat Rupiah (number). Persen = bps. Tanggal = string ISO 8601 UTC.
Daftar memakai ?page=1&pageSize=20&q=...&sort=createdAt:desc. pageSize maksimal 100.
Respons sukses: { "ok": true, "data": ..., "meta": { "page": 1, "pageSize": 20, "total": 135 } } (meta hanya untuk daftar).
Respons gagal: { "ok": false, "error": { "code": "VALIDATION_ERROR", "message": "...", "fields": { "qty": "Harus lebih dari 0" }, "details": null } }.
Pesan error untuk pengguna dalam Bahasa Indonesia. Stack trace tidak pernah dikirim ke klien.
Semua permintaan non-GET memeriksa header Origin sama dengan APP_URL (perlindungan CSRF, selain cookie SameSite=Lax).
Endpoint edit dan aksi menerima rev terakhir yang dilihat klien (lihat 8.4).
| HTTP | Kode error | Kapan |
| 400 | BAD_REQUEST, BUSINESS_REQUIRED | JSON rusak, Super Admin belum memilih usaha |
| 401 | UNAUTHENTICATED | Belum login atau sesi habis |
| 403 | FORBIDDEN | Role tidak boleh memakai endpoint ini |
| 404 | NOT_FOUND | Data tidak ada atau milik usaha atau sales lain |
| 409 | INVALID_STATE, STALE_DATA, INSUFFICIENT_STOCK, INVOICE_ALREADY_PENDING, IN_USE, HAS_CREDIT_NOTES, DUPLICATE | Konflik status, data kedaluwarsa, stok, duplikat |
| 422 | VALIDATION_ERROR, DUPLICATE_PRODUCT, OVERRIDE_NOTE_REQUIRED, BELOW_MIN_REASON_REQUIRED, OVERPAYMENT, CONFIRM_MISMATCH, CREDIT_EXCEEDS_BALANCE, MIN_GT_BASE dan aturan bisnis lain | Input tidak valid atau melanggar aturan bisnis |
| 429 | RATE_LIMITED | Terlalu banyak percobaan |
| 500 | INTERNAL | Kesalahan tak terduga (dicatat di log) |

### 10.2 withApi dan requireContext (wajib dipakai semua handler)

// src/lib/api/withApi.tsimport { NextRequest, NextResponse } from 'next/server'import { ZodError, ZodType } from 'zod'import { Prisma, Role } from '@prisma/client'import { DomainError, fromDb } from '../domain/money'import { requireContext, Ctx } from '../auth/context'import { assertSameOrigin } from '../auth/origin'import { logger } from '../logger'type Out = { data: unknown; status?: number; meta?: unknown }type Args<B, Q> = { ctx: Ctx; body: B; query: Q; params: Record<string, string>; req: NextRequest }// BigInt -> number agar JSON aman. Dipanggil untuk SEMUA respons.function serialize(v: unknown): unknown { if (typeof v === 'bigint') return fromDb(v) if (v instanceof Date) return v.toISOString() if (Array.isArray(v)) return v.map(serialize) if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, serialize(x)])) return v}export function withApi<B = undefined, Q = undefined>( opts: { roles: Role[]; body?: ZodType<B>; query?: ZodType<Q> }, handler: (a: Args<B, Q>) => Promise<Out>,) { return async (req: NextRequest, route: { params: Promise<Record<string, string>> }) => { try { assertSameOrigin(req) // hanya memeriksa metode non-GET const ctx = await requireContext(req, opts.roles) const params = await route.params const body = opts.body ? opts.body.parse(await req.json().catch(() => { throw new DomainError('BAD_REQUEST', 'JSON tidak valid', 400) })) : (undefined as B) const query = opts.query ? opts.query.parse(Object.fromEntries(req.nextUrl.searchParams)) : (undefined as Q) const out = await handler({ ctx, body, query, params, req }) return NextResponse.json({ ok: true, data: serialize(out.data), meta: out.meta }, { status: out.status ?? 200 }) } catch (e) { return toErrorResponse(e) } }}function toErrorResponse(e: unknown) { if (e instanceof ZodError) { const fields = Object.fromEntries(e.issues.map((i) => [i.path.join('.'), i.message])) return NextResponse.json({ ok: false, error: { code: 'VALIDATION_ERROR', message: 'Data tidak valid', fields } }, { status: 422 }) } if (e instanceof DomainError) { return NextResponse.json({ ok: false, error: { code: e.code, message: e.message, details: e.details ?? null } }, { status: e.status }) } if (e instanceof Prisma.PrismaClientKnownRequestError) { if (e.code === 'P2002') return NextResponse.json({ ok: false, error: { code: 'DUPLICATE', message: 'Data sudah ada' } }, { status: 409 }) if (e.code === 'P2025') return NextResponse.json({ ok: false, error: { code: 'NOT_FOUND', message: 'Data tidak ditemukan' } }, { status: 404 }) } logger.error({ err: e }, 'unhandled') return NextResponse.json({ ok: false, error: { code: 'INTERNAL', message: 'Terjadi kesalahan. Coba lagi.' } }, { status: 500 })}
// src/lib/auth/context.tsexport interface Ctx { user: { id: string; role: Role; name: string; businessId: string | null } role: Role businessId: string | null // SALES: selalu terisi. SUPERADMIN: usaha aktif di sesi, bisa null sessionId: string ip: string | null}export async function requireContext(req: NextRequest, roles: Role[]): Promise<Ctx> { const token = req.cookies.get(env.SESSION_COOKIE_NAME)?.value if (!token) throw new DomainError('UNAUTHENTICATED', 'Silakan login', 401) const s = await findValidSession(token) // hash SHA-256, belum dicabut, belum kedaluwarsa; perpanjang kedaluwarsa (sliding) if (!s || !s.user.isActive || s.user.deletedAt) throw new DomainError('UNAUTHENTICATED', 'Sesi tidak valid', 401) if (!roles.includes(s.user.role)) throw new DomainError('FORBIDDEN', 'Anda tidak punya akses', 403) const businessId = s.user.role === 'SALES' ? s.user.businessId : s.activeBusinessId if (s.user.role === 'SALES' && !businessId) throw new DomainError('FORBIDDEN', 'Akun sales belum terhubung ke usaha', 403) return { user: { id: s.user.id, role: s.user.role, name: s.user.name, businessId: s.user.businessId }, role: s.user.role, businessId, sessionId: s.id, ip: req.headers.get('x-forwarded-for') }}// Dipakai endpoint yang butuh usaha. Mengembalikan businessId bertipe string.export function requireBusiness(ctx: Ctx): string { if (!ctx.businessId) throw new DomainError('BUSINESS_REQUIRED', 'Pilih usaha terlebih dulu', 400) return ctx.businessId}
Contoh handler lengkap (semua handler mengikuti pola ini):
// src/app/api/v1/orders/route.tsexport const POST = withApi({ roles: ['SUPERADMIN', 'SALES'], body: OrderCreateSchema }, async ({ ctx, body }) => { const businessId = requireBusiness(ctx) const order = await orderService.createDraft(ctx, businessId, body) return { data: orderDto(order, ctx.role), status: 201 }})

### 10.3 DTO per role (whitelist, bukan blacklist)

Aturan: respons hanya dibangun lewat fungsi di src/lib/dto/. Dilarang mengembalikan objek Prisma langsung. Setiap DTO menulis field satu per satu, dan field rahasia hanya ada di versi admin.
// src/lib/dto/product.tsexport function productDtoSales(p: ProductWithImages) { return { id: p.id, sku: p.sku, name: p.name, unit: p.unit, description: p.description, categoryId: p.categoryId, basePrice: fromDb(p.basePrice), minPrice: fromDb(p.minPrice), available: p.stockQty - p.reservedQty, isActive: p.isActive, imageUrl: primaryImageUrl(p), }}export function productDtoAdmin(p: ProductWithImages) { const cost = fromDb(p.costPrice) const base = fromDb(p.basePrice) return { ...productDtoSales(p), costPrice: cost, marginAmount: base - cost, marginBps: base > 0 ? Math.round(((base - cost) \* 10000) / base) : 0, stockQty: p.stockQty, reservedQty: p.reservedQty, minStockAlert: p.minStockAlert, defaultVendorId: p.defaultVendorId, rev: p.rev, }}export const productDto = (p: ProductWithImages, role: Role) => (role === 'SUPERADMIN' ? productDtoAdmin(p) : productDtoSales(p))
Pola yang sama berlaku untuk orderDto, invoiceDto, customerDto, shipmentDto, reportDto. Contoh: baris order untuk Sales memuat floorPrice dan belowMin (supaya sales tahu harga minimalnya) tetapi tidak costPrice. Untuk Super Admin, orderDto menambah costPrice per baris dan objek profit (hasil calcProfit).

### 10.4 Skema input kunci (Zod)

// src/lib/validation/order.tsexport const OrderLineSchema = z.object({ productId: z.string().min(1), qty: z.number().int().positive().max(1_000_000), unitPrice: z.number().int().min(0).max(10_000_000_000), discount: z.discriminatedUnion('source', [ z.object({ source: z.literal('MANUAL'), type: z.enum(['PERCENT', 'AMOUNT']), value: z.number().int().min(0) }).strict(), z.object({ source: z.enum(['PROMO', 'SUBSIDY']), promoId: z.string().min(1) }).strict(), ]).optional(),}).strict()export const OrderCreateSchema = z.object({ customerId: z.string().min(1), items: z.array(OrderLineSchema).min(1).max(200), shippingCharge: z.number().int().min(0).default(0), dpBps: z.number().int().min(0).max(9900).optional(), // default dari Business.defaultDpBps deliveryAddress: z.string().max(1000).optional(), notes: z.string().max(2000).optional(), repeatIntervalDays: z.number().int().min(1).max(365).optional(), belowMinReason: z.string().min(5).max(1000).optional(),}).strict()// Perhatikan: tidak ada field harga modal, total, status, businessId, salesId. Semua itu dihitung atau diambil server.
Algoritma buildOrderSnapshot(tx, ctx, input) (dipakai createDraft, update, preview, dan submit):
Muat customer (di usaha ini; Sales: harus milik sendiri) dan produk yang dipilih (aktif, di usaha ini). Produk tidak ditemukan: 404 PRODUCT_NOT_FOUND.
Tolak produk ganda: 422 DUPLICATE_PRODUCT.
Muat CustomerMinPrice dan CustomerPromo customer itu.
Untuk tiap baris:
base = baseFloor(product.minPrice, customerMin?.minPrice ?? null).
Diskon MANUAL: ambil type dan value dari input. Diskon PROMO atau SUBSIDY: cari promo dengan promoId, harus lolos isPromoActive (tanggal sekarang). Tidak lolos: 422 PROMO_NOT_VALID. Turunkan discountType dan discountValue dari promo di server (AMOUNT dikali qty karena tersimpan sebagai total baris).
floor = lineFloor(base, promoDipakai). Hitung calcLine. belowMin = isBelowFloor(lineNet, qty, floor).
Salin snapshot: productName, sku, unit, listPrice = basePrice, costPrice, floorPrice = floor.
calcOrderTotals dengan PPN dari Business (ppnEnabled, ppnRateBps), dpBps dari input atau default usaha.
hasBelowMin = ada baris belowMin. Saat submit (bukan saat simpan draft): bila hasBelowMin dan belowMinReason kosong: 422 BELOW_MIN_REASON_REQUIRED.
Kembalikan seluruh angka dan warnings (daftar baris di bawah minimal dengan floorPrice dan harga bersih per unit) agar UI menampilkan peringatan jelas kepada sales.
Endpoint POST /orders/preview menjalankan algoritma ini tanpa menyimpan, dipakai formulir order untuk menampilkan total dan peringatan secara langsung. UI tidak menghitung sendiri.

### 10.5 Daftar endpoint

Singkatan role: SA = Super Admin, S = Sales (hanya data miliknya), SA+S = keduanya, Publik = tanpa login. Semua path diawali /api/v1.
Autentikasi dan sesi
| Metode dan path | Role | Catatan |
| POST /auth/login | Publik | { username, password }. Batasi percobaan (16.1). Set cookie sesi. Pesan gagal selalu sama: "Username atau password salah". |
| POST /auth/logout | SA+S | Cabut sesi. |
| GET /auth/me | SA+S | User, role, usaha, status Telegram, mustChangePassword. |
| POST /auth/change-password | SA+S | { currentPassword, newPassword }. Cabut sesi lain. |
| POST /auth/telegram | Publik | { initData } untuk Mini App (12.3). Hanya untuk user yang sudah terhubung. |
| POST /auth/telegram/link-code | SA+S | Buat kode tautan sekali pakai (12.2). |
| DELETE /auth/telegram | SA+S | Putuskan Telegram. |
| POST /session/business | SA | { businessId } pilih usaha aktif. |

Usaha dan user (SA)
| Metode dan path | Role | Catatan |
| GET /businesses, POST /businesses | SA | Kode usaha unik, huruf besar. |
| GET /businesses/:id, PATCH /businesses/:id | SA | Termasuk toggle PPN, stok minus, wajib lunas sebelum kirim, DP default, tempo, tema invoice, mode komisi. Kode tidak bisa diubah setelah ada order. |
| POST /businesses/:id/logo | SA | multipart/form-data, gambar, maksimal 5 MB. |
| GET/POST /businesses/:id/bank-accounts, PATCH/DELETE /bank-accounts/:id | SA | Satu rekening default per usaha. |
| GET/PUT /businesses/:id/commission-tiers | SA | Ganti seluruh daftar tingkat komisi. |
| GET /business | SA+S | Info usaha aktif versi ringkas (nama, kode, logo). |
| GET/POST /users, GET/PATCH /users/:id | SA | Buat sales: username, password, name, businessId. Password awal ditentukan SA, mustChangePassword = true. |
| POST /users/:id/reset-password | SA | Password baru ditentukan SA. Cabut semua sesi user itu. |
| POST /users/:id/deactivate, POST /users/:id/activate | SA | Nonaktif mencabut sesi. |

Produk, kategori, stok, harga
| Metode dan path | Role | Catatan |
| GET /products | SA+S | Filter q, categoryId, active. DTO per role (10.3). |
| POST /products | SA | Wajib sku unik per usaha, basePrice, minPrice. |
| GET /products/:id | SA+S | |
| PATCH /products/:id | SA | Ubah harga atau HPP wajib priceReason. Sertakan rev. Menulis PriceHistory. |
| DELETE /products/:id | SA | Soft delete, butuh confirm = nama produk. |
| POST /products/:id/images | SA | multipart, banyak file, maksimal 8 per produk. |
| PATCH/DELETE /products/:id/images/:imageId | SA | Jadikan utama, urutan. |
| GET /products/:id/price-history | SA | Riwayat harga. |
| GET/POST /categories, PATCH/DELETE /categories/:id | SA (baca: SA+S) | |
| GET /stock | SA+S | Sales: hanya available. SA: lengkap, termasuk penanda stok minus dan di bawah batas. |
| GET /stock/movements | SA | Filter productId, tanggal. |
| POST /stock/adjust | SA | { productId, qtyDelta, reason }. |
| POST /stock/opname | SA | { productId, countedQty, note }. |

Vendor dan pembelian (SA)
| Metode dan path | Role | Catatan |
| GET/POST /vendors, GET/PATCH/DELETE /vendors/:id | SA | kind = SUPPLIER atau TRANSPORT. |
| GET /vendors/:id/ledger | SA | Catatan transaksi: PO, pembayaran vendor, dan (untuk pengangkut) ongkir aktual per pengiriman. |
| POST /vendors/:id/payments, POST /vendor-payments/:id/void | SA | Pembayaran ke vendor. |
| GET/POST /purchase-orders, GET/PATCH /purchase-orders/:id | SA | PATCH hanya saat DRAFT. |
| POST /purchase-orders/:id/order | SA | DRAFT ke ORDERED, alokasi poNo. |
| POST /purchase-orders/:id/receive | SA | { lines: [{ itemId, qty, updateCost }] }. Stok masuk. updateCost = true memperbarui HPP produk (dan menulis riwayat harga). |
| POST /purchase-orders/:id/cancel | SA | Tidak bisa bila sudah ada penerimaan. |

Customer dan CRM
| Metode dan path | Role | Catatan |
| GET /customers | SA+S | Filter q, stage, tag, salesId (hanya SA). |
| POST /customers | SA+S | Sales: otomatis assignedSalesId = dirinya. Kode unik per usaha. |
| GET/PATCH /customers/:id, DELETE /customers/:id | SA+S | Kode tidak bisa diubah bila sudah ada invoice. Hapus butuh confirm. |
| POST /customers/:id/reassign | SA | { salesId }. Pindahkan customer ke sales lain (juga pengingatnya). |
| GET /customers/:id/timeline | SA+S | Interaksi dan order, urut waktu. |
| POST /customers/:id/interactions | SA+S | { type, summary, occurredAt, nextFollowUpAt? }. Bila nextFollowUpAt diisi, otomatis membuat CrmTask. |
| GET /customers/:id/pricing | SA+S | Per produk: floorPrice efektif dan promo aktif (untuk formulir order dan katalog). |
| GET/PUT /customers/:id/min-prices | SA | Harga minimal khusus. Setiap perubahan butuh reason dan menulis PriceHistory. |
| GET/POST /customers/:id/promos, PATCH/DELETE /customer-promos/:id | SA | Promo, potongan, subsidi dengan periode. |
| GET /customers/:id/credit | SA | Saldo dan riwayat kredit. |
| GET/POST /crm/tasks, PATCH/DELETE /crm/tasks/:id | SA+S | Sales: milik sendiri. PATCH { done: true } mengisi doneAt. |
| GET/POST /sales/:id/notes | SA | Catatan pribadi owner tentang sales. |
| GET/PUT /sales/:id/targets/:month | SA | Target bulanan (YYYY-MM). |

Order, invoice, pembayaran, pengiriman, retur
| Metode dan path | Role | Catatan |
| GET /orders | SA+S | Filter status, customerId, salesId (SA), from, to, q. |
| POST /orders/preview | SA+S | Hitung tanpa menyimpan (10.4). |
| POST /orders | SA+S | Buat draft. Respons 201. |
| GET /orders/:id | SA+S | DTO per role. SA: termasuk profit. |
| PATCH /orders/:id | SA+S | Hanya DRAFT atau REVISION_REQUIRED. Skema sama dengan create + rev. |
| POST /orders/:id/submit | SA+S | Bagian 8.2. |
| POST /orders/:id/withdraw | SA+S | Tarik pengajuan. |
| POST /orders/:id/request-final | SA+S | { shippingCharge?, shippingReason? }. |
| POST /orders/:id/void | SA | Bagian 9.3. |
| DELETE /orders/:id | SA | Bagian 9.5, butuh confirm = nomor order (atau id bila belum bernomor). |
| GET /orders/:id/profit | SA | Rincian calcProfit. |
| POST /orders/:id/costs, DELETE /order-costs/:id | SA | Biaya lain. |
| GET /approvals | SA | Antrean invoice menunggu persetujuan, lengkap dengan simulasi profit, penanda di bawah minimal, dan stok tersedia. |
| GET /invoices, GET /invoices/:id | SA+S | Filter status, type, paid, overdue. |
| POST /invoices/:id/approve | SA | { rev, overrideNote?, dueDate?, theme? }. |
| POST /invoices/:id/reject | SA | { rev, reason }. |
| POST /invoices/:id/void | SA | { reason }. |
| GET /invoices/:id/pdf | SA+S | Hanya APPROVED (Sales: milik sendiri). Menambah printedCount. Bagian 14. |
| GET /orders/:id/payments, POST /orders/:id/payments | SA+S | multipart/form-data: invoiceId, amount, method, paidAt, reference?, proof? (gambar atau PDF, maksimal 5 MB). SA boleh autoVerify. |
| POST /payments/:id/verify, POST /payments/:id/reject, POST /payments/:id/void | SA | reject dan void wajib reason. |
| POST /orders/:id/refunds | SA | { amount, method, notes }. |
| POST /orders/:id/credit/apply | SA | Pakai saldo kredit customer untuk membayar. |
| GET /orders/:id/shipment, PUT /orders/:id/shipment | SA+S | Metode, pengangkut, resi, sopir, plat. actualCost hanya diterima dari SA (sales mengirim field ini: 422 karena .strict()). |
| POST /orders/:id/shipment/ship, POST /orders/:id/shipment/deliver | SA+S | Bagian 8.3. |
| GET /orders/:id/delivery-note/pdf | SA+S | Setelah SHIPPED. Tanpa harga. |
| GET/POST /orders/:id/credit-notes, GET /credit-notes/:id, POST /credit-notes/:id/void, GET /credit-notes/:id/pdf | SA | Bagian 9.4. |

Pengingat, piutang, katalog
| Metode dan path | Role | Catatan |
| GET /reminders | SA+S | Filter status, due (overdue, week), customerId. |
| POST /reminders, PATCH /reminders/:id, DELETE /reminders/:id | SA+S | Ubah interval, tunda (snoozedUntil), jeda, catatan. |
| GET /receivables | SA+S | Invoice belum lunas dengan umur piutang. Tanpa profit. |
| GET/POST /catalogs, GET/PATCH/DELETE /catalogs/:id | SA+S | Sales: milik sendiri. |
| PUT /catalogs/:id/items | SA+S | Ganti seluruh item. Harga di bawah floor: 422 PRICE_BELOW_MIN (tanpa jalur persetujuan). |
| GET /catalogs/:id/pdf | SA+S | Bagian 15. |
| GET /catalog-presets | SA+S | Judul bawaan: Grosir, Distributor Tunggal, Ecer. Sales boleh menulis judul bebas. |

Laporan, dashboard, sistem
| Metode dan path | Role | Catatan |
| GET /dashboard | SA+S | DTO berbeda per role. Sales: order saya, pengingat hari ini, approval saya, target tanpa profit. SA: antrean persetujuan, pembayaran menunggu verifikasi, stok minus, piutang terlambat, omzet dan profit. |
| GET /reports/crm | SA+S | Aktivitas CRM, pipeline, follow-up. Sales: milik sendiri. |
| GET /reports/margin | SA | groupBy=order,product,sales,business, from, to. |
| GET /reports/sales-performance | SA | Per sales: omzet, profit, jumlah deal, konversi pipeline, follow-up, repeat order, persen ditolak, capaian target, komisi. |
| GET /reports/receivables-aging | SA | Umur piutang 0–7, 8–30, 31–60, lebih dari 60 hari. |
| GET /reports/commissions, POST /commissions/:id/pay | SA | Daftar komisi dan tandai dibayar. |
| GET /reports/overview | SA | Ringkasan lintas semua usaha. |
| GET /reports/export | SA (CRM: SA+S) | type, format=xlsx atau pdf, filter yang sama. Untuk XLSX gunakan exceljs (catat ADR). |
| GET /trash, POST /trash/:type/:id/restore, DELETE /trash/:type/:id/purge | SA | Bagian 9.5. |
| GET /audit-logs | SA | Filter entityType, entityId, actorId, tanggal. |
| GET /updates, GET /updates/unread-count, POST /updates/mark-seen | SA+S | Catatan Pembaruan. |
| POST /updates, PATCH /updates/:id, POST /updates/:id/publish | SA | publish menerima { broadcast: boolean }. |
| GET /notifications, POST /notifications/:id/read | SA+S | Milik sendiri. |
| GET /files/\* | SA+S | Layanan berkas dengan pemeriksaan hak akses (16.3). |
| GET /api/health | Publik | Di luar /v1. |

Endpoint tambahan yang didefinisikan di bagian lain (wajib masuk tabel endpoint di BLUEPRINT.md dan tes matriks hak akses):
POST /downloads (SA+S) dan GET /dl/:token (tanpa cookie, memakai token bertanda tangan): tautan unduh PDF sekali buka, bagian 16.3.
GET /businesses/:id/invoice-preview?theme= (SA): pratinjau tema dengan data contoh, bagian 14.4.
POST /api/telegram/webhook (hanya dengan secret Telegram): bagian 12.1.
POST /customers/:id/reassign menerima { salesId, moveOpenOrders? }: bagian 18.1 nomor 16 dan 18.2.
Pengecualian withApi: hanya GET /api/health, POST /api/telegram/webhook, POST /auth/login, POST /auth/telegram, dan GET /dl/:token yang ditulis tanpa withApi karena tidak memakai sesi cookie biasa. Daftar pengecualian ini dikunci di tes inventaris rute (17.4 c). Semua rute lain wajib memakai withApi.

## 11. Halaman UI

Antarmuka berbahasa Indonesia, mobile-first (sales bekerja dari HP), memakai Tailwind dan shadcn/ui. Satu kode untuk web, Telegram Mini App, dan PWA.

### 11.1 Prinsip UI

Setiap halaman punya tiga keadaan wajib: memuat (skeleton), kosong (pesan dan tombol aksi), gagal (pesan dan tombol "Coba lagi"). Tidak boleh ada layar putih.
UI tidak menghitung total, floor, atau profit sendiri. UI memanggil POST /orders/preview dan menampilkan hasilnya (10.4).
Tombol yang tidak boleh dipakai dinonaktifkan dengan penjelasan (tooltip atau teks), contoh "Menunggu persetujuan" pada tombol Cetak.
Aksi yang mengubah uang atau status meminta konfirmasi. Aksi yang menghapus atau membatalkan memakai dialog ketik ulang nomor dokumen.
Target sentuh minimal 44 px. Input teks minimal 16 px (mencegah zoom otomatis di iOS). Kolom uang memakai inputmode="numeric".
Setelah mutasi berhasil, tampilkan toast dan segarkan data (TanStack Query invalidateQueries). Saat mutasi berjalan, tombol memuat dan dinonaktifkan (cegah klik ganda).
Error 409 STALE_DATA menampilkan dialog "Data sudah berubah" dengan tombol "Muat ulang".
Format: Rupiah lewat formatRupiah, tanggal dd MMM yyyy zona WIB, persen dengan koma desimal (3,5%).

### 11.2 Komponen bersama

| Komponen | Aturan |
| AppShell | Super Admin: sidebar + pengalih usaha di header. Sales: bar bawah (Beranda, Order, Customer, Pengingat, Lainnya). |
| DataTable | Paginasi dari server, pencarian dengan debounce 300 ms, kolom bisa disembunyikan di HP (tampil sebagai kartu). |
| MoneyInput | Mengetik dan menempel "Rp 1.250.000" menghasilkan 1250000. Hanya digit. Nilai ke form selalu number bulat. |
| PercentInput | Menerima "3,5" dan memberi 350 (bps). Maksimal 2 desimal. |
| StatusBadge | Satu peta status ke warna dan label Indonesia, dipakai semua halaman. |
| ConfirmTypeDialog | Tombol aktif hanya bila teks yang diketik sama persis dengan nomor dokumen. |
| FileUpload | Pratinjau, batas 5 MB, tipe dibatasi (gambar, PDF untuk bukti bayar). |
| EmptyState, ErrorState, Skeleton | Dipakai di semua daftar dan detail. |

// src/lib/format/parse.tsexport function parseRupiahInput(s: string): number | null { const digits = s.replace(/[^0-9]/g, '') if (digits === '') return null const n = Number(digits) return Number.isSafeInteger(n) ? n : null}// "3,5" atau "3.5" menjadi 350 bps. Pembulatan ke bps terdekat. Mengembalikan null bila tidak valid.export function parsePercentToBps(s: string): number | null { const t = s.trim().replace(',', '.') if (!/^[0-9]+(\.[0-9]{1,2})?$/.test(t)) return null const bps = Math.round(parseFloat(t) \* 100) return bps >= 0 && bps <= 10000 ? bps : null}

### 11.3 Peta halaman

Super Admin
| Rute | Isi utama |
| /login | Username, password. Tautan bantuan "lupa password: hubungi pemilik" (tanpa reset mandiri). |
| /dashboard | Antrean persetujuan, pembayaran menunggu verifikasi, stok minus dan di bawah batas, piutang terlambat, omzet dan profit bulan ini, peringkat sales. |
| /approvals, /approvals/[invoiceId] | Antrean dan detail persetujuan (11.4). |
| /orders, /orders/new, /orders/[id], /orders/[id]/edit | Daftar, formulir, detail dengan linimasa status, pembayaran, pengiriman, simulasi profit, retur. |
| /invoices, /invoices/[id] | Daftar dan detail invoice, tombol cetak. |
| /payments | Pembayaran menunggu verifikasi, dengan pratinjau bukti transfer. |
| /customers, /customers/new, /customers/[id] | Tab: Ringkasan, Timeline CRM, Order, Harga dan Promo, Saldo Kredit. |
| /products, /products/new, /products/[id], /products/[id]/prices | Daftar (kolom HPP dan margin), formulir dengan upload foto, riwayat harga. |
| /categories | Kelola kategori. |
| /stock, /stock/opname | Stok per produk, penanda stok minus, koreksi dan opname. |
| /vendors, /vendors/[id], /purchase-orders, /purchase-orders/[id] | Vendor dan buku transaksinya, PO dan penerimaan barang. |
| /reminders, /receivables | Pengingat repeat order, piutang dengan umur. |
| /catalogs, /catalogs/[id] | Katalog semua sales. |
| /reports/margin, /reports/sales, /reports/receivables, /reports/commissions, /reports/crm | Laporan dengan filter tanggal dan ekspor Excel atau PDF. |
| /sales, /sales/[id] | Daftar sales. Detail: kinerja, target bulanan, komisi, catatan pribadi owner. |
| /settings/business | Data usaha, logo, rekening bank, tema invoice (pratinjau 5 tema), toggle PPN, stok minus, wajib lunas sebelum kirim, DP default, tempo, mode komisi. |
| /settings/users | Akun sales: buat, ubah, reset password, nonaktifkan. |
| /trash, /audit, /updates | Tempat Sampah, audit log, Catatan Pembaruan (+ penerbitan). |
| /profile | Ganti password, hubungkan Telegram. |

Sales
| Rute | Isi utama |
| /dashboard | "Hari ini": pengingat jatuh tempo, tugas follow-up, order menunggu persetujuan atau ditolak (dengan alasan), tagihan jatuh tempo. Pintasan: Order Baru, Customer Baru, Katalog. Tanpa angka profit. |
| /customers, /customers/new, /customers/[id] | Customer milik sendiri, timeline interaksi, catat interaksi dan tugas follow-up, harga minimal dan promo customer itu. |
| /orders, /orders/new, /orders/[id], /orders/[id]/edit | Formulir order (11.4), detail, linimasa status, unggah bukti bayar, isi pengiriman, tombol Cetak invoice dan surat jalan (aktif sesuai status). |
| /invoices, /invoices/[id] | Invoice milik sendiri. Alasan penolakan terlihat jelas dengan tombol "Revisi". |
| /reminders, /receivables | Pengingat dan piutang customer-nya. |
| /catalogs, /catalogs/[id] | Buat katalog (pilih judul, produk, atur harga), unduh PDF, pasang PWA. |
| /products, /stock | Daftar produk dengan harga dasar dan harga minimal, stok tersedia. Tanpa HPP. |
| /reports/crm | Laporan aktivitas CRM milik sendiri. |
| /updates, /profile | Catatan Pembaruan, ganti password, hubungkan Telegram. |

### 11.4 Layar kunci

Formulir order (/orders/new dan /edit)
Pilih customer (pencarian). Tampilkan alamat kirim bawaan dan ringkasan piutang customer.
Tambah baris produk. Tiap baris: produk, jumlah, harga deal (awal = harga dasar), kontrol diskon (tanpa, persen, nominal, atau pilih promo customer yang aktif).
Di bawah tiap baris tampil teks "Harga minimal: Rp X". Bila belowMin, baris diberi tanda merah dan peringatan: "Di bawah harga minimal. Pengajuan wajib disertai alasan dan menunggu persetujuan pemilik." Kolom alasan (order) menjadi wajib.
Panel ringkasan (hasil POST /orders/preview, debounce 300 ms): subtotal, diskon, ongkir, PPN (bila aktif), total, DP (persen bisa diubah), sisa pelunasan.
Ongkir ditagihkan (boleh 0), alamat kirim, catatan, "Ingatkan repeat order tiap ... hari" (opsional).
Tombol: Simpan draft dan Ajukan invoice (dialog konfirmasi berisi ringkasan dan peringatan di bawah minimal).
Khusus Super Admin: panel "Simulasi profit" (HPP per baris, profit, margin, merah bila negatif).
Detail persetujuan (/approvals/[invoiceId], Super Admin)
Kiri: pratinjau invoice seperti yang akan tercetak (dengan tema usaha).
Kanan: simulasi profit (HPP, ongkir aktual belum ada sehingga tampil estimasi, margin), daftar baris di bawah minimal (floor versus harga bersih per unit) beserta alasan dari sales, stok tersedia per produk, ringkasan customer (jumlah order, piutang berjalan).
Tombol Setujui (bila ada baris di bawah minimal, membuka dialog wajib catatan override) dan Tolak (dialog alasan wajib). Dari Telegram, tombol Tolak membuka halaman ini (12.4).
Detail invoice (Sales)
Status berwarna dan linimasa persetujuan.
Tombol Cetak PDF nonaktif dengan teks "Menunggu persetujuan pemilik" sampai status APPROVED. Bila REJECTED: tampil alasan dan tombol "Revisi order".
Setelah APPROVED: tombol Cetak aktif, tampil nomor invoice, jatuh tempo, dan rekening tujuan.
Katalog (/catalogs/[id])
Judul: pilihan cepat (Grosir, Distributor Tunggal, Ecer) atau teks bebas.
Daftar produk dengan harga yang bisa diubah. Harga di bawah minimal langsung ditolak dengan pesan "Harga minimal produk ini Rp X" (di katalog tidak ada jalur persetujuan).
Tombol Unduh PDF dan Pasang di HP (15.2).

### 11.5 Telegram Mini App

Entri di /tg. Layout memuat https://telegram.org/js/telegram-web-app.js, memanggil Telegram.WebApp.ready() dan expand(), lalu login otomatis lewat POST /auth/telegram (12.3). Bila gagal: tampil petunjuk menghubungkan akun.
Warna mengikuti themeParams Telegram lewat CSS variable. Tombol kembali memakai Telegram.WebApp.BackButton.
Berkas PDF tidak diunduh langsung di dalam webview. Pakai tautan unduh sekali pakai (16.3) yang dibuka dengan Telegram.WebApp.openLink.
Semua halaman bagian 11.3 yang dipakai sales harus berfungsi di lebar 360 px.

## 12. Telegram Bot dan Mini App

Satu bot untuk semua usaha. Bot dipakai untuk notifikasi dan tombol persetujuan cepat. Mini App adalah aplikasi web yang sama, dibuka di dalam Telegram. Akun Telegram Super Admin dan tiap sales berbeda, dan masing-masing dihubungkan ke akunnya sendiri.

### 12.1 Setup satu kali (dikerjakan pemilik dan agent)

Pemilik membuat bot lewat @BotFather (/newbot), lalu mengisi TELEGRAM_BOT_TOKEN dan TELEGRAM_BOT_USERNAME di Coolify. TELEGRAM_WEBHOOK_SECRET diisi string acak panjang (minimal 32 karakter).
Pasang webhook setelah deploy (ganti nilai dalam kurung siku):
curl -X POST "https://api.telegram.org/bot[TOKEN]/setWebhook" \ -d "url=[APP_URL]/api/telegram/webhook" \ -d "secret_token=[TELEGRAM_WEBHOOK_SECRET]" \ -d "allowed_updates=[\"message\",\"callback_query\"]"
Pasang tombol menu Mini App (sekali):
curl -X POST "https://api.telegram.org/bot[TOKEN]/setChatMenuButton" \ -H "Content-Type: application/json" \ -d '{"menu_button":{"type":"web_app","text":"Buka Aplikasi","web_app":{"url":"[APP_URL]/tg"}}}'
Webhook route menolak permintaan tanpa header x-telegram-bot-api-secret-token yang cocok sebelum melakukan hal lain.
// src/app/api/telegram/webhook/route.tsimport { webhookCallback } from 'grammy'import { bot } from '@/lib/telegram/bot'import { env } from '@/lib/env'export const POST = webhookCallback(bot, 'std/http', { secretToken: env.TELEGRAM_WEBHOOK_SECRET })
Bot menjawab update dengan cepat (di bawah 5 detik). Pekerjaan berat dilempar ke pg-boss. Telegram bisa mengirim update yang sama dua kali, jadi semua handler harus idempoten (periksa status sebelum bertindak).

### 12.2 Menghubungkan akun (kode tautan sekali pakai)

Alur:
User login di web, buka /profile, tekan "Hubungkan Telegram" (POST /auth/telegram/link-code).
Server membuat kode 8 karakter dari alfabet tanpa karakter membingungkan (ABCDEFGHJKLMNPQRSTUVWXYZ23456789), menyimpan hash SHA-256-nya di TelegramLinkCode dengan masa berlaku 10 menit, dan menandai kode lama user itu sebagai terpakai. Respons: kode, waktu kedaluwarsa, dan tautan https://t.me/<BOT_USERNAME>?start=<kode>.
User membuka tautan atau mengirim /start <kode> ke bot.
Bot memvalidasi, lalu mengisi User.telegramChatId dan telegramLinkedAt, mengosongkan telegramBlocked, dan membalas "Terhubung sebagai {nama} ({role}) di {usaha}".
Aturan:
Hanya chat pribadi (ctx.chat.type === 'private') yang diterima.
Satu akun Telegram hanya boleh terhubung ke satu user (telegramChatId unik). Bila sudah terpakai user lain: "Akun Telegram ini sudah terhubung ke akun lain."
Kode salah, kedaluwarsa, atau terpakai: satu pesan generik yang sama ("Kode tidak valid atau sudah kedaluwarsa"). Batasi 5 percobaan per 10 menit per chat.id.
Memutus (DELETE /auth/telegram) mengosongkan telegramChatId.
// src/lib/telegram/bot.ts (potongan: perintah /start)import { Bot } from 'grammy'import { createHash } from 'node:crypto'export const bot = new Bot(env.TELEGRAM_BOT_TOKEN)bot.command('start', async (ctx) => { const code = (ctx.match ?? '').trim().toUpperCase() if (ctx.chat.type !== 'private') return if (!code) return ctx.reply('Kirim kode tautan dari halaman Profil aplikasi.') if (await tooManyAttempts(ctx.chat.id)) return ctx.reply('Terlalu banyak percobaan. Coba lagi nanti.') const codeHash = createHash('sha256').update(code).digest('hex') const link = await prisma.telegramLinkCode.findUnique({ where: { codeHash }, include: { user: true } }) if (!link || link.usedAt || link.expiresAt < new Date() || !link.user.isActive) { return ctx.reply('Kode tidak valid atau sudah kedaluwarsa.') } const chatId = BigInt(ctx.from!.id) const taken = await prisma.user.findFirst({ where: { telegramChatId: chatId, NOT: { id: link.userId } } }) if (taken) return ctx.reply('Akun Telegram ini sudah terhubung ke akun lain.') await prisma.$transaction([ prisma.user.update({ where: { id: link.userId }, data: { telegramChatId: chatId, telegramLinkedAt: new Date(), telegramBlocked: false } }), prisma.telegramLinkCode.update({ where: { id: link.id }, data: { usedAt: new Date() } }), ]) return ctx.reply(`Terhubung sebagai ${link.user.name}.`)})
Perintah lain: /help (daftar perintah), /me (menampilkan nama, role, usaha), /today (ringkasan pengingat dan tugas hari ini untuk sales, antrean persetujuan untuk Super Admin). Pesan dari akun yang belum terhubung dijawab dengan petunjuk menghubungkan, tanpa data apa pun.

### 12.3 Login Mini App (validasi initData)

POST /auth/telegram menerima { initData } dari Telegram.WebApp.initData. Wajib divalidasi di server dengan algoritma resmi Telegram. Jangan pernah mempercayai initDataUnsafe dari klien.
// src/lib/telegram/initData.tsimport crypto from 'node:crypto'import { DomainError } from '../domain/money'export function validateInitData(initData: string, botToken: string, maxAgeSec = 3600) { const fail = () => new DomainError('INIT_DATA_INVALID', 'Sesi Telegram tidak valid. Buka ulang aplikasi.', 401) const params = new URLSearchParams(initData) const hash = params.get('hash') if (!hash) throw fail() params.delete('hash') const dataCheckString = [...params.entries()] .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)) .map(([k, v]) => `${k}=${v}`) .join('\n') const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest() const calc = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest() const given = Buffer.from(hash, 'hex') if (given.length !== calc.length || !crypto.timingSafeEqual(given, calc)) throw fail() const authDate = Number(params.get('auth_date')) if (!Number.isFinite(authDate) || Date.now() / 1000 - authDate > maxAgeSec) throw fail() const user = JSON.parse(params.get('user') ?? 'null') as { id?: number } | null if (!user?.id) throw fail() return { telegramUserId: user.id, authDate }}
Langkah endpoint:
Validasi initData. Batasi per IP (16.1). Jangan mencatat initData ke log.
Cari user aktif dengan telegramChatId = BigInt(telegramUserId). Tidak ada: 401 TELEGRAM_NOT_LINKED dengan pesan "Akun Telegram ini belum terhubung. Login dengan username dan password, lalu hubungkan di menu Profil."
Buat sesi seperti login biasa (cookie httpOnly, Secure, SameSite=Lax).
Bila mustChangePassword, arahkan ke halaman ganti password dahulu.

### 12.4 Notifikasi dan tombol

Semua pesan diawali [KODE USAHA] agar jelas asalnya. Pesan memakai parse_mode: 'HTML' dan semua teks dinamis wajib melewati escapeHtml.
| Peristiwa | Penerima | Isi | Tombol |
| Pengajuan invoice | Super Admin | Sales, customer, tipe invoice, total, profit dan margin, tanda "di bawah minimal" bila ada | Setujui, Tolak, Buka |
| Hasil persetujuan | Sales pembuat | Disetujui (nomor invoice, "sudah bisa dicetak") atau ditolak (alasan) | Buka |
| Bukti bayar diunggah | Super Admin | Customer, nominal, invoice | Verifikasi, Buka |
| Pembayaran diverifikasi atau ditolak | Sales pembuat | Hasil dan alasan bila ditolak | Buka |
| Pengingat repeat order | Sales pemilik customer | H-3, H-0, lalu setiap hari bila terlambat | Buka customer |
| Eskalasi repeat order | Super Admin | Pengingat terlambat 3 hari tanpa tindakan sales | Buka |
| Tagihan jatuh tempo | Sales pemilik order | H-3, H-0, lalu tiap 2 hari bila terlambat | Buka invoice |
| Piutang terlambat | Super Admin | Ringkasan mingguan | Buka laporan |
| Tugas follow-up jatuh tempo | Sales | Judul tugas dan customer | Buka |
| Order dibatalkan | Sales pemilik order | Nomor order dan alasan | Buka |
| Ringkasan harian (08:00 WIB) | Super Admin | Jumlah persetujuan menunggu, pembayaran menunggu verifikasi, piutang terlambat, stok minus | Buka dashboard |
| Catatan Pembaruan | Semua user terhubung | Judul dan tautan /updates (hanya bila broadcast = true) | Buka |

Tombol di Telegram (callback):
Format callback_data pendek dan tanpa data sensitif: ap:<invoiceId>:y (setujui), pv:<paymentId>:y (verifikasi).
Handler callback pertama-tama mencari user dari from.id, memastikan aktif dan berperan Super Admin, lalu memanggil service yang sama persis dengan endpoint web (invoiceService.approve). Tidak ada logika persetujuan terpisah.
Konteks usaha diambil dari invoice (cari invoice dulu, baru bentuk Ctx dengan businessId invoice itu).
Setujui lewat Telegram dilarang bila invoice hasBelowMin. Bot membalas "Ada harga di bawah minimal. Buka aplikasi untuk menyetujui dengan catatan" dengan tombol web_app. Tombol Tolak selalu membuka Mini App /tg/approvals/<id>?reject=1 karena alasan wajib.
Bila invoice sudah diputuskan: answerCallbackQuery "Sudah diproses" lalu hapus tombol. Setelah berhasil, ubah pesan menjadi "Disetujui oleh {nama}" tanpa tombol.

### 12.5 Pengiriman pesan yang tahan gagal

Layanan (di dalam transaksi) memanggil createNotification({ userId, type, title, body, linkPath, dedupeKey }). dedupeKey unik (contoh REPEAT_DUE:<reminderId>:2026-11-05:H0). Bila sudah ada, abaikan (createMany dengan skipDuplicates).
Setelah transaksi berhasil (commit), antrekan job telegram.send berisi notificationId. Jangan mengirim ke Telegram di dalam transaksi database.
Worker mengirim lewat bot.api.sendMessage. Sukses: isi telegramSentAt. Gagal 403 (user memblokir bot): isi telegramError, set User.telegramBlocked = true, jangan ulangi. Gagal 429: tunda sesuai retry_after. Kegagalan lain: pg-boss mengulang maksimal 5 kali dengan jeda bertambah.
Kirim berurutan dengan jeda minimal 50 ms antar pesan (batas global Telegram sekitar 30 pesan per detik).
Notifikasi selalu juga tampil di aplikasi (GET /notifications) sehingga user tetap melihatnya walau Telegram belum terhubung.
// src/lib/telegram/format.tsexport const escapeHtml = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')export const prefix = (businessCode: string, text: string): string => `<b>[${escapeHtml(businessCode)}]</b> ${text}`.slice(0, 4000)

## 13. Pengingat dan Job Terjadwal

Semua pekerjaan terjadwal berjalan di proses worker (pg-boss), bukan di proses web. Setiap job harus idempoten (aman dijalankan dua kali), menerima now: Date sebagai parameter agar bisa dites, dan memproses tiap item dalam try/catch sendiri sehingga satu item gagal tidak menghentikan yang lain.

### 13.1 Pengingat repeat order

Satuan pengingat: satu baris Reminder per pasangan (customer, produk). lastOrderDate = tanggal pengiriman (WIB) order terakhir yang COMPLETED memuat produk itu. nextDueDate = lastOrderDate + intervalDays.
Kapan dibuat atau diperbarui: di maybeComplete() saat order menjadi COMPLETED, untuk setiap produk di order itu:
Kumpulkan tanggal pengiriman semua order COMPLETED (bukan CANCELLED) customer itu yang memuat produk tersebut.
Tentukan interval: 3 tanggal atau lebih: median dari paling banyak 4 selisih terakhir. Tepat 2 tanggal: selisihnya. Hanya 1 tanggal: Order.repeatIntervalDays bila diisi sales, jika tidak Business.defaultRepeatDays. Batasi 1 sampai 365 hari.
Pengingat belum ada: buat (source = AUTO). Sudah ada dan source = AUTO: perbarui interval dan tanggal. Sudah ada dan source = MANUAL (sales mengubah interval sendiri): pertahankan interval sales, hanya majukan lastOrderDate dan nextDueDate.
Kosongkan lastNotifiedAt, escalatedAt, snoozedUntil. Status ACTIVE.
Order yang di-void atau dihapus memanggil rebuildRemindersForCustomer, yang menghitung ulang semua pengingat customer itu dari order COMPLETED yang tersisa (pengingat tanpa order tersisa menjadi CANCELLED).
// src/lib/domain/reminder.tsconst DAY_MS = 86_400_000const WIB_OFFSET_MS = 7 \* 3_600_000// Nomor hari WIB (bilangan bulat). Selisih dua nomor = selisih hari kalender WIB.export const wibDayIndex = (d: Date): number => Math.floor((d.getTime() + WIB_OFFSET_MS) / DAY_MS)const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))export function suggestInterval(shipDates: Date[], fallbackDays: number): number { const days = [...new Set(shipDates.map(wibDayIndex))].sort((a, b) => a - b) const gaps: number[] = [] for (let i = 1; i < days.length; i++) gaps.push(days[i] - days[i - 1]) const recent = gaps.slice(-4) if (recent.length === 0) return clamp(fallbackDays, 1, 365) const s = [...recent].sort((a, b) => a - b) const mid = Math.floor(s.length / 2) const median = s.length % 2 === 1 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2) return clamp(median, 1, 365)}// Hari tersisa sampai jatuh tempo (negatif = terlambat), dihitung dengan kalender WIB.export const daysUntil = (due: Date, now: Date): number => wibDayIndex(due) - wibDayIndex(now)
Aturan tindakan sales: ubah interval (menjadikan source = MANUAL), tunda (snoozedUntil), jeda (PAUSED), batalkan (CANCELLED, misalnya customer berhenti). Pengingat milik sales yang berpindah customer ikut dipindahkan saat reassign.

### 13.2 Jadwal job

Semua jadwal memakai zona Asia/Jakarta.
| Antrean | Jadwal | Tugas |
| reminders.repeat.scan | Setiap hari 08:00 | Untuk tiap pengingat ACTIVE yang snoozedUntil kosong atau sudah lewat dan tidak ada order lain customer itu untuk produk yang sama (status bukan CANCELLED) dibuat setelah lastOrderDate: bila daysUntil = 3 (H-3), = 0 (H-0), atau negatif (terlambat, setiap hari), buat notifikasi ke sales dengan dedupeKey = REPEAT_DUE:<id>:<tanggal WIB>. Bila terlambat 3 hari atau lebih dan escalatedAt kosong: notifikasi eskalasi ke Super Admin, lalu isi escalatedAt. |
| invoices.due.scan | Setiap hari 08:00 | Invoice APPROVED yang paidAmount < amount: H-3 dan H-0 ke sales pemilik order. Terlambat: setiap 2 hari (hari terlambat genap) ke sales. Senin 08:00: ringkasan piutang terlambat ke Super Admin. |
| crm.tasks.scan | Setiap hari 08:00 | CrmTask belum selesai dengan dueAt hari ini (WIB) ke sales yang ditugaskan. |
| owner.digest | Setiap hari 08:00 | Ringkasan ke Super Admin: persetujuan menunggu, pembayaran menunggu verifikasi, piutang terlambat, produk stok minus atau di bawah batas. Tidak dikirim bila semuanya nol. |
| housekeeping | Setiap hari 03:00 | Hapus sesi kedaluwarsa atau dicabut lebih dari 30 hari, LoginAttempt lebih dari 30 hari, TelegramLinkCode terpakai atau kedaluwarsa lebih dari 1 hari. |
| telegram.send | Sesuai permintaan | Mengirim satu notifikasi (12.5). |

// src/worker/index.tsimport PgBoss from 'pg-boss'import { env } from '../lib/env'const boss = new PgBoss({ connectionString: env.DATABASE_URL, schema: 'pgboss' })boss.on('error', (e) => logger.error({ err: e }, 'pg-boss'))await boss.start()await boss.createQueue('telegram.send', { retryLimit: 5, retryBackoff: true })await boss.work('telegram.send', { batchSize: 1 }, async ([job]) => { await sendNotification(job.data.notificationId)})await boss.createQueue('reminders.repeat.scan')await boss.schedule('reminders.repeat.scan', '0 8 \* \* \*', {}, { tz: 'Asia/Jakarta' })await boss.work('reminders.repeat.scan', async () => { await scanRepeatReminders(new Date()) })// antrean lain mengikuti pola yang samaprocess.on('SIGTERM', async () => { await boss.stop(); process.exit(0) })
Catatan penting: API pg-boss berbeda antar versi mayor (misalnya wajib atau tidaknya createQueue). Baca dokumentasi versi yang terpasang, sesuaikan sintaks, dan catat sebagai ADR. Jangan mengubah jadwal atau perilaku.

### 13.3 Pengingat tagihan dan umur piutang

Sisa tagihan invoice = amount - paidAmount. Status terlambat = dueDate lebih awal dari hari ini (WIB) dan sisa lebih dari 0, dihitung saat dibaca.
Umur piutang dikelompokkan: belum jatuh tempo, 1–7, 8–30, 31–60, lebih dari 60 hari terlambat. Halaman /receivables dan GET /reports/receivables-aging memakai fungsi pengelompokan yang sama di src/lib/domain/receivable.ts.
Invoice VOID, REJECTED, WITHDRAWN, atau milik order CANCELLED tidak masuk piutang.
Sales hanya melihat piutang customer-nya, tanpa profit.

## 14. Invoice PDF, Tema, dan Surat Jalan

PDF dibuat dari snapshot yang dibekukan saat persetujuan, bukan dari data order yang masih bisa berubah. Karena itu invoice lama tidak berubah walau harga produk, tema usaha, atau rekening bank diganti kemudian.

### 14.1 Isi snapshot invoice

Snapshot dibuat oleh satu fungsi, buildInvoiceSnapshot(tx, invoiceId), dan disimpan di Invoice.snapshot saat approve. Fungsi yang sama dipakai untuk pratinjau invoice yang masih menunggu persetujuan (tanpa nomor resmi).
// src/lib/pdf/snapshot.tsexport interface InvoiceSnapshot { schemaVersion: 1 number: string | null // null hanya untuk pratinjau type: 'DP' | 'FINAL' issueDate: string // ISO dueDate: string // ISO theme: 'PROFESIONAL' | 'FAMILY' | 'MINIMALIS' | 'MODERN' | 'KLASIK' business: { name: string; legalName: string | null; address: string | null; phone: string | null; email: string | null; npwp: string | null; logoPath: string | null } customer: { code: string; name: string; contactName: string | null; billingAddress: string | null; shippingAddress: string | null; npwp: string | null } items: { no: number; name: string; sku: string; qty: number; unit: string; unitPrice: number; lineDiscount: number; lineNet: number }[] totals: { subtotal: number; discountTotal: number; shippingCharge: number; ppnEnabled: boolean; ppnRateBps: number; ppnAmount: number; grandTotal: number } billing: { dpBps: number; dpAmount: number // untuk DP amountDue: number // jumlah yang ditagihkan di invoice ini dpInvoiceNumber: string | null; dpPaid: number // untuk FINAL: rujukan DP yang sudah dibayar } banks: { bankName: string; accountNumber: string; accountHolder: string }[] note: string | null}
Dilarang ada di snapshot dan PDF: costPrice, floorPrice, belowMin, alasan atau catatan override, sumber diskon (PROMO, SUBSIDY), riwayat harga, nama sales. Tes di bagian 17 memeriksa snapshot terhadap daftar kunci terlarang (5.4). Kolom diskon di tabel barang hanya tampil bila ada diskon pada order itu.
Invoice DP: menampilkan total order, persen DP, jumlah DP yang ditagihkan, dan keterangan "sisa dibayar saat pelunasan".
Invoice pelunasan: menampilkan total order, DP yang sudah dibayar (dengan nomor invoice DP), dan sisa yang ditagihkan. Bila dpBps = 0 (invoice tunggal), tampil sebagai tagihan penuh.
Baris PPN hanya tampil bila ppnEnabled. NPWP usaha tampil bila diisi.
Di bawah total tampil terbilang jumlah yang ditagihkan (14.5), rekening bank usaha (semua yang aktif, yang default di atas), catatan pembayaran usaha, dan kolom tanda tangan.

### 14.2 Pipeline pembuatan PDF

Ambil Invoice dan snapshot (cek hak akses dan status, 14.3).
Render HTML dari komponen React (renderToStaticMarkup) dengan tema dari snapshot.theme. Logo dibaca dari UPLOAD_DIR dan disematkan sebagai data URI.
Buka halaman Puppeteer, setContent, lalu page.pdf({ format: 'A4', printBackground: true, displayHeaderFooter: true, margin: { top: '18mm', bottom: '20mm', left: '14mm', right: '14mm' } }). Footer berisi "Halaman X dari Y" lewat footerTemplate (pageNumber dan totalPages).
Tutup halaman. Browser dipakai ulang (satu instans, dibuka saat pertama kali dibutuhkan) dengan argumen --no-sandbox --disable-dev-shm-usage.
Batasi maksimal 2 render bersamaan (semaphore) dan waktu habis 20 detik. Lewat batas: 503 PDF_BUSY dengan pesan "Coba lagi sebentar".
Blokir semua permintaan jaringan dari halaman (page.setRequestInterception(true); izinkan hanya data: dan about:). Ini mencegah SSRF dan kebocoran data lewat konten HTML.
Font dari berkas lokal di src/lib/pdf/fonts/ (lisensi OFL: Inter, Nunito, Plus Jakarta Sans, Lora), dimuat lewat @font-face dengan data URI. Bila berkas font tidak ada, jatuh ke Liberation Sans yang terpasang di image. Dilarang memuat font dari CDN.
Tata letak: header tabel barang berulang di tiap halaman (thead { display: table-header-group }), baris tidak terpotong (tr { break-inside: avoid }), blok total dan tanda tangan tidak terpotong (break-inside: avoid).
Respons: Content-Type: application/pdf, Content-Disposition: inline; filename="INV-TEROBOS-05-11-2026-0007-DP.pdf" (garis miring pada nomor diganti tanda hubung), Cache-Control: private, no-store.
PDF tidak disimpan di disk. Selalu dirender ulang dari snapshot sehingga deterministik.

### 14.3 Aturan akses cetak

| Siapa | Status invoice | Hasil |
| Sales (milik sendiri) | APPROVED | PDF normal. printedCount bertambah, lastPrintedAt diisi, audit INVOICE_PRINT. |
| Sales | PENDING_APPROVAL, REJECTED, WITHDRAWN, VOID | 409 INVOICE_NOT_APPROVED dengan pesan "Invoice belum disetujui". Tidak ada pengecualian, termasuk lewat tautan unduh sekali pakai. |
| Super Admin | APPROVED | PDF normal. |
| Super Admin | PENDING_APPROVAL (?preview=1) | Pratinjau dengan watermark "PRATINJAU, MENUNGGU PERSETUJUAN" dan tanpa nomor resmi. Tidak menambah printedCount. |
| Super Admin | VOID | PDF dengan watermark diagonal "BATAL". |

Pemeriksaan status dilakukan di server pada saat PDF dibuat, bukan hanya di UI.

### 14.4 Lima tema invoice

Semua tema memakai struktur data dan urutan bagian yang sama. Perbedaannya hanya pada CSS dan tata letak header. Tema dipilih Super Admin per usaha di /settings/business dan disalin ke snapshot.theme saat invoice disetujui. Super Admin juga bisa memilih tema lain pada dialog persetujuan untuk satu invoice (theme di body approve).
| Tema | Karakter | Warna | Font | Tata letak |
| PROFESIONAL | Formal, rapi, cocok untuk korporasi | Biru tua #1F3A5F, abu muda #E8EDF3 | Inter | Logo kiri, judul INVOICE kanan, tabel bergaris tipis |
| FAMILY | Hangat dan ramah, cocok usaha kecil atau toko | Oranye lembut #E07A3F, krem #FFF6EC | Nunito | Sudut membulat, label berwarna lembut, ucapan terima kasih di akhir |
| MINIMALIS | Bersih, hemat tinta | Hitam #111111 dan putih | Inter | Banyak ruang kosong, hanya garis tipis, tanpa blok warna |
| MODERN | Tegas dan segar | Hijau tosca #0F9D8A, pita header #0B1F2A berteks putih | Plus Jakarta Sans | Pita header penuh, baris tabel selang-seling |
| KLASIK | Tradisional, berwibawa | Navy #1C2B4A, emas tua #7A5C1E, latar krem | Lora (serif) | Bingkai ganda, judul huruf kapital |

Persyaratan implementasi:
Tema disusun sebagai themes/<nama>.ts berisi token (warna, font, ukuran) dan satu komponen InvoiceDocument yang membaca token itu. Dilarang menyalin seluruh template lima kali.
Endpoint pratinjau GET /businesses/:id/invoice-preview?theme=KLASIK (Super Admin) menghasilkan PDF berisi data contoh dengan watermark "CONTOH". Dipakai halaman pengaturan untuk membandingkan lima tema. Tambahkan endpoint ini ke BLUEPRINT.md.
Tiap tema wajib lulus tes visual (17.5): invoice dengan 3 baris dan dengan 40 baris, teks panjang pada nama produk dan alamat, tanpa PPN dan dengan PPN, tanpa logo dan dengan logo. Tidak boleh ada teks terpotong atau meluber.

### 14.5 Terbilang

// src/lib/domain/terbilang.tsconst SATUAN = ['', 'satu', 'dua', 'tiga', 'empat', 'lima', 'enam', 'tujuh', 'delapan', 'sembilan', 'sepuluh', 'sebelas']function words(n: number): string { if (n < 12) return SATUAN[n] if (n < 20) return words(n - 10) + ' belas' if (n < 100) return words(Math.floor(n / 10)) + ' puluh ' + words(n % 10) if (n < 200) return 'seratus ' + words(n - 100) if (n < 1000) return words(Math.floor(n / 100)) + ' ratus ' + words(n % 100) if (n < 2000) return 'seribu ' + words(n - 1000) if (n < 1_000_000) return words(Math.floor(n / 1000)) + ' ribu ' + words(n % 1000) if (n < 1_000_000_000) return words(Math.floor(n / 1_000_000)) + ' juta ' + words(n % 1_000_000) if (n < 1_000_000_000_000) return words(Math.floor(n / 1_000_000_000)) + ' miliar ' + words(n % 1_000_000_000) return words(Math.floor(n / 1_000_000_000_000)) + ' triliun ' + words(n % 1_000_000_000_000)}export function terbilang(n: number): string { if (!Number.isSafeInteger(n) || n < 0) throw new Error('terbilang hanya untuk bilangan bulat non-negatif') if (n === 0) return 'nol' return words(n).split(' ').filter(Boolean).join(' ')}// Tampilan di invoice: 'Terbilang: ' + terbilang(amountDue) + ' rupiah'
Tes wajib: 0 menjadi nol; 11 menjadi sebelas; 100 menjadi seratus; 1000 menjadi seribu; 1250000 menjadi satu juta dua ratus lima puluh ribu; 1320900 menjadi satu juta tiga ratus dua puluh ribu sembilan ratus.

### 14.6 Surat jalan dan credit note

Surat jalan (GET /orders/:id/delivery-note/pdf, setelah pengiriman SHIPPED): nomor KODE/SJ/DD/MM/YYYY/NNNN, tanggal kirim, customer dan alamat kirim, rujukan nomor invoice, tabel barang (no, nama, SKU, jumlah, satuan) tanpa harga apa pun, data pengiriman (metode, pengangkut, nomor resi, nama sopir, plat), catatan, dan tiga kolom tanda tangan (Pengirim, Sopir, Penerima). Tidak memuat biaya ongkir aktual. Memakai tema usaha yang sama.
Credit note (GET /credit-notes/:id/pdf, Super Admin): nomor KODE/CN/..., rujukan invoice dan order, baris yang diretur (jumlah dan nilai kredit), PPN bila ada, total kredit, bentuk penyelesaian (potong tagihan, refund, saldo kredit), alasan. Tanpa HPP.

## 15. Katalog (PDF dan PWA)

Katalog adalah daftar harga yang disusun sales untuk dibagikan ke customer. Sales memberi judul, memilih produk, menyesuaikan harga, lalu mengunduh PDF atau menyimpannya untuk dibuka offline di HP.

### 15.1 Aturan katalog

Judul: pilihan cepat (Grosir, Distributor Tunggal, Ecer) atau teks bebas 1–60 karakter. Satu sales boleh punya banyak katalog.
Customer opsional. Bila katalog dikaitkan ke customer (milik sales itu), floor memakai harga minimal khusus customer tersebut. Bila tidak, floor = Product.minPrice.
Harga item awalnya basePrice dan boleh diubah sales. Harga tidak boleh di bawah floor. Pelanggaran: 422 PRICE_BELOW_MIN dengan details: [{ productId, name, floorPrice }]. Berbeda dari order, katalog tidak punya jalur persetujuan.
Hanya produk aktif yang bisa dimasukkan. Satu produk satu kali per katalog.
Kedaluwarsa: bila Super Admin menaikkan harga minimal setelah katalog dibuat, harga item bisa jatuh di bawah floor baru. Saat membuka katalog dan saat membuat PDF, server memeriksa ulang setiap item. Ada item di bawah floor: PDF ditolak dengan 422 CATALOG_STALE (berisi daftar item), dan UI menawarkan tombol "Sesuaikan ke harga minimal". Produk yang sudah nonaktif atau dihapus ditandai dan tidak ikut di PDF.
Dari katalog tersedia tombol "Buat order dari katalog" yang mengisi baris order dengan harga katalog. Harga tetap divalidasi ulang lewat POST /orders/preview.
Katalog tidak menampilkan HPP, harga minimal, stok, maupun riwayat harga.

### 15.2 PDF katalog

Memakai pipeline dan tema yang sama dengan invoice (14.2 dan 14.4), tema diambil dari pengaturan usaha.
Isi: logo dan nama usaha, judul katalog besar, tanggal dibuat, "Untuk: nama customer" bila ada, lalu grid atau tabel produk: foto kecil, nama, SKU, satuan, harga. Di bagian bawah: kontak usaha (telepon, alamat), catatan katalog, dan kalimat "Harga dapat berubah sewaktu-waktu". Bila ppnEnabled: tambahkan "Harga belum termasuk PPN".
Foto produk: foto utama diperkecil ke sisi terpanjang 300 px lalu disematkan sebagai data URI. Tanpa foto: kotak abu-abu dengan inisial nama produk.
Maksimal 300 produk per PDF. Nama berkas: Katalog-<judul>-<YYYY-MM-DD>.pdf (karakter selain huruf, angka, dan tanda hubung diganti tanda hubung).

### 15.3 PWA (pasang di HP)

Tujuan: sales memasang aplikasi ke layar utama HP dan membuka katalog yang sudah disimpan walau sinyal buruk. Fitur lain tetap butuh koneksi.
Manifest (src/app/manifest.ts):
import type { MetadataRoute } from 'next'export default function manifest(): MetadataRoute.Manifest { return { name: 'Order dan CRM', short_name: 'Order CRM', start_url: '/dashboard', scope: '/', display: 'standalone', background_color: '#ffffff', theme_color: '#1F3A5F', lang: 'id', icons: [ { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }, { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' }, { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }, ], }}
Service worker (public/sw.js). Aturan keamanan: tidak ada respons API yang disimpan kecuali katalog yang sengaja disimpan pengguna. Cache offline dinamai per user dan dihapus saat logout (supaya akun lain di HP yang sama tidak melihat data).
// public/sw.jsconst VERSION = 'v1'const STATIC_CACHE = 'static-' + VERSIONconst OFFLINE_URL = '/offline'self.addEventListener('install', (e) => { e.waitUntil(caches.open(STATIC_CACHE).then((c) => c.add(OFFLINE_URL)).then(() => self.skipWaiting()))})self.addEventListener('activate', (e) => { e.waitUntil( caches.keys() .then((keys) => Promise.all(keys.filter((k) => k.startsWith('static-') && k !== STATIC_CACHE).map((k) => caches.delete(k)))) .then(() => self.clients.claim()), )})async function apiStrategy(req) { const keys = (await caches.keys()).filter((k) => k.startsWith('catalog-')) try { const res = await fetch(req) if (res.ok) { for (const k of keys) { const c = await caches.open(k) if (await c.match(req)) await c.put(req, res.clone()) // segarkan hanya yang sudah disimpan } } return res } catch (err) { for (const k of keys) { const hit = await (await caches.open(k)).match(req) if (hit) return hit } return new Response(JSON.stringify({ ok: false, error: { code: 'OFFLINE', message: 'Anda sedang offline' } }), { status: 503, headers: { 'Content-Type': 'application/json' }, }) }}async function staticStrategy(req) { const c = await caches.open(STATIC_CACHE) const hit = await c.match(req) if (hit) return hit const res = await fetch(req) if (res.ok) await c.put(req, res.clone()) return res}self.addEventListener('fetch', (e) => { const req = e.request if (req.method !== 'GET') return const url = new URL(req.url) if (url.origin !== self.location.origin) return if (url.pathname.startsWith('/\_next/static/') || url.pathname.startsWith('/icons/')) { e.respondWith(staticStrategy(req)) } else if (url.pathname.startsWith('/api/')) { e.respondWith(apiStrategy(req)) } else if (req.mode === 'navigate') { e.respondWith(fetch(req).catch(() => caches.match(OFFLINE_URL))) }})// Pesan dari halaman: simpan katalog untuk offline, atau hapus semuanya saat logoutself.addEventListener('message', (e) => { const msg = e.data || {} if (msg.type === 'SAVE_CATALOG' && msg.userId && Array.isArray(msg.urls)) { e.waitUntil(caches.open('catalog-' + msg.userId).then((c) => c.addAll(msg.urls))) } if (msg.type === 'CLEAR') { e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('catalog-')).map((k) => caches.delete(k))))) }})
Kewajiban sisi halaman:
Komponen RegisterSW mendaftarkan /sw.js hanya di produksi. next.config memberi Cache-Control: no-cache untuk /sw.js dan Service-Worker-Allowed: /.
Halaman katalog punya tombol "Simpan untuk offline" yang mengirim SAVE_CATALOG berisi userId, URL GET /api/v1/catalogs/:id, dan URL foto produknya (/api/v1/files/...). Pesan sukses atau gagal ditampilkan.
Saat logout dan saat login dengan user yang berbeda dari sebelumnya: kirim pesan CLEAR.
Halaman /offline berisi pesan ramah dan tautan ke katalog yang sudah disimpan.
Saat navigator.onLine === false, tampilkan banner "Anda sedang offline" dan nonaktifkan semua tombol yang mengubah data dengan penjelasan.
Tombol Pasang di HP: simpan event beforeinstallprompt (Android dan Chrome), tampilkan tombol, panggil prompt() saat ditekan, sembunyikan setelah appinstalled. Di iOS Safari (tanpa event itu) tampilkan petunjuk: "Ketuk Bagikan, lalu Tambah ke Layar Utama". Sembunyikan seluruh UI pemasangan bila sudah berjalan standalone atau bila dibuka di dalam Telegram (window.Telegram?.WebApp?.initData terisi).
Naikkan VERSION di sw.js setiap rilis yang mengubah aset statis, dan catat di CHANGELOG.md.

## 16. Keamanan dan Audit Log

Data bisnis ini berisi harga modal dan margin. Kebocoran ke sales atau ke usaha lain adalah risiko utama, jadi bagian ini bersifat wajib, bukan saran.

### 16.1 Login, sesi, dan pembatasan percobaan

Password: hash argon2id (paket argon2, parameter OWASP: memoryCost: 19456, timeCost: 2, parallelism: 1). Panjang 10–128 karakter, tidak boleh sama dengan username. Password tidak pernah dicatat di log.
Password awal dari Super Admin menyetel mustChangePassword = true. Selama true, semua endpoint selain GET /auth/me, POST /auth/change-password, dan POST /auth/logout menolak dengan 403 PASSWORD_CHANGE_REQUIRED. Tambahkan opsi allowPasswordChange: true pada withApi untuk tiga endpoint itu.
Token sesi: 32 byte acak (crypto.randomBytes), dikirim sebagai cookie, disimpan di database hanya sebagai hash SHA-256. Cookie: HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=604800 (7 hari). Kedaluwarsa bergeser (sliding) tetapi lastUsedAt diperbarui paling sering sekali per 10 menit.
Maksimal 5 sesi aktif per user (yang terlama dicabut). Logout mencabut sesi itu. Ganti password mencabut sesi lain. Reset password, nonaktifkan user, dan penghapusan akses mencabut semua sesi.
Pembatasan login: catat setiap percobaan di LoginAttempt. Bila gagal 5 kali dalam 15 menit untuk username yang sama, atau 20 kali dalam 15 menit dari IP yang sama: 429 RATE_LIMITED selama 15 menit. Bila username tidak ada, tetap jalankan verifikasi terhadap hash palsu agar waktu respons sama. Pesan gagal selalu "Username atau password salah".
Pembatasan umum: 120 permintaan per menit per user, dan 20 per menit untuk endpoint upload, memakai token bucket di memori (aplikasi berjalan satu replika). Lewat batas: 429.
Seed Super Admin (prisma/seed.ts, mode produksi): membaca SEED_SUPERADMIN_USERNAME dan SEED_SUPERADMIN_PASSWORD (minimal 12 karakter), menolak berjalan bila sudah ada Super Admin, dan menyetel mustChangePassword = true.

### 16.2 Otorisasi dan isolasi antar usaha

Urutan pemeriksaan di setiap request: login, role, usaha, kepemilikan, status. Setiap record diambil lewat fungsi \*Scope yang memasukkan businessId (dan salesId untuk Sales). Dilarang findUnique({ where: { id } }) pada tabel usaha tanpa lewat scope.
// src/lib/services/scopes.tsexport function orderScope(ctx: Ctx, businessId: string): Prisma.OrderWhereInput { return { businessId, deletedAt: null, ...(ctx.role === 'SALES' ? { salesId: ctx.user.id } : {}) }}export function customerScope(ctx: Ctx, businessId: string): Prisma.CustomerWhereInput { return { businessId, deletedAt: null, ...(ctx.role === 'SALES' ? { assignedSalesId: ctx.user.id } : {}) }}// pemakaian: tx.order.findFirst({ where: { id, ...orderScope(ctx, businessId) } }) lalu 404 bila null
Jaring pengaman otomatis: klien Prisma dibungkus extension yang melempar error bila query massal pada tabel usaha tidak memuat businessId di level teratas where. Ini menangkap kelalaian developer di semua lingkungan.
// src/lib/db.tsconst TENANT_MODELS = new Set([ 'BankAccount', 'Category', 'Vendor', 'Product', 'ProductImage', 'PriceHistory', 'Customer', 'CustomerMinPrice', 'CustomerPromo', 'CrmInteraction', 'CrmTask', 'OwnerSalesNote', 'SalesTarget', 'CommissionTier', 'Order', 'OrderItem', 'OrderCost', 'Invoice', 'Payment', 'Shipment', 'CreditNote', 'CustomerCreditEntry', 'PurchaseOrder', 'VendorPayment', 'StockMovement', 'CommissionEntry', 'Reminder', 'Catalog', 'DocumentCounter',])const GUARDED_OPS = new Set(['findFirst', 'findFirstOrThrow', 'findMany', 'count', 'aggregate', 'groupBy', 'updateMany', 'deleteMany'])export const prisma = new PrismaClient().$extends({  query: {    $allModels: {      async $allOperations({ model, operation, args, query }) {        if (TENANT_MODELS.has(model) && GUARDED_OPS.has(operation)) {          const where = (args as { where?: Record<string, unknown> }).where          if (!where || !('businessId' in where)) throw new Error(`Query ${model}.${operation} tanpa businessId`) } return query(args) }, }, },})
Tambahan: tes tests/unit/no-unscoped-lookups.test.ts memindai src/lib/services dan gagal bila menemukan findUnique(, update(, atau delete( pada model di TENANT_MODELS di luar daftar pengecualian yang tercatat di tes itu (pencarian by id murni harus diganti findFirst dengan scope atau updateMany dengan scope).

### 16.3 Berkas: upload, penyajian, dan tautan unduh

Upload:
Batas ukuran MAX_UPLOAD_MB. Jenis diperiksa dari byte awal berkas (JPEG FF D8 FF, PNG 89 50 4E 47, WebP RIFF....WEBP, PDF %PDF), bukan dari ekstensi atau Content-Type klien.
Gambar diproses ulang dengan sharp: hapus metadata EXIF, putar sesuai orientasi, sisi terpanjang maksimal 1600 px, simpan sebagai WebP kualitas 82. Bukti bayar boleh gambar atau PDF (PDF disimpan apa adanya). Logo dan foto produk hanya gambar.
Nama berkas selalu UUID acak. Jalur: UPLOAD_DIR/<businessId>/<jenis>/<uuid>.<ext> dengan jenis product, logo, proof, vendor-proof. Nama dari klien tidak pernah dipakai di jalur (mencegah path traversal). Database menyimpan jalur relatif.
Penyajian (GET /api/v1/files/<businessId>/<jenis>/<nama>):
Wajib login. Sales hanya boleh bila businessId di jalur sama dengan usahanya.
Jenis proof: Sales hanya boleh bila pembayaran pemilik berkas itu milik order sales tersebut (cari lewat Payment.proofPath).
Selesaikan jalur dengan path.resolve, lalu pastikan hasilnya diawali UPLOAD_DIR + path.sep. Gagal: 404.
Header: Content-Type dari ekstensi yang tersimpan, X-Content-Type-Options: nosniff, Cache-Control: private, max-age=3600 untuk gambar dan no-store untuk bukti bayar.
Tautan unduh sekali buka (untuk Telegram, yang tidak berbagi cookie dengan peramban luar). Tambahkan ke daftar endpoint di BLUEPRINT.md:
POST /api/v1/downloads (SA+S) dengan { type, id }, type salah satu dari INVOICE_PDF, DELIVERY_NOTE_PDF, CATALOG_PDF, CREDIT_NOTE_PDF. Menjalankan pemeriksaan hak akses dan status yang sama dengan endpoint PDF langsung (termasuk aturan hanya APPROVED untuk Sales). Mengembalikan { url, expiresAt }.
Token = payload { t: type, id, uid: userId, exp } yang ditandatangani HMAC-SHA256 dengan APP_SECRET, berlaku 5 menit. GET /api/v1/dl/<token> memverifikasi tanda tangan dan masa berlaku, lalu mengulang pemeriksaan hak akses dan status untuk uid itu pada saat dibuka, kemudian menayangkan PDF. Token tidak memberi hak lebih dari yang dimiliki user.
Tambahkan APP_SECRET (minimal 32 karakter acak) ke .env.example dan validasi env.ts.

### 16.4 Header, masukan, dan log

Header keamanan di next.config atau middleware: Strict-Transport-Security: max-age=31536000, X-Content-Type-Options: nosniff, Referrer-Policy: strict-origin-when-cross-origin, Permissions-Policy: camera=(), microphone=(), geolocation=().
CSP berbasis nonce lewat middleware: default-src 'self'; script-src 'self' 'nonce-<nonce>' https://telegram.org; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; frame-ancestors 'self' https://web.telegram.org https://webk.telegram.org https://webz.telegram.org (agar Mini App versi web tetap bisa membuka aplikasi). Jangan memakai X-Frame-Options karena bertabrakan dengan frame-ancestors. Setelah CSP dipasang, uji bahwa Mini App, PWA, dan halaman PDF masih berfungsi.
Dilarang dangerouslySetInnerHTML. Teks markdown (Catatan Pembaruan) dirender dengan renderer yang membuang HTML mentah.
Ekspor Excel dan CSV: sel teks yang diawali =, +, -, atau @ diberi awalan tanda petik tunggal agar tidak dieksekusi sebagai rumus.
Log (pino): redact untuk req.headers.cookie, password, passwordHash, token, tokenHash, initData, APP_SECRET. Body request untuk endpoint /auth/\* tidak pernah dicatat.
Jalankan pnpm audit --prod sebelum setiap rilis fase dan perbaiki temuan tingkat tinggi. pnpm-lock.yaml selalu di-commit.

### 16.5 Audit log

audit() dipanggil di dalam transaksi yang sama dengan perubahan datanya. Bila transaksi gagal, audit ikut dibatalkan (tidak ada jejak palsu).
// src/lib/audit/audit.tsexport async function audit(tx: Prisma.TransactionClient, ctx: Ctx, e: { action: string; entityType: string; entityId: string; businessId?: string | null summary?: string; before?: unknown; after?: unknown; reason?: string}) { await tx.auditLog.create({ data: { businessId: e.businessId ?? ctx.businessId, actorId: ctx.user.id, actorRole: ctx.role, action: e.action, entityType: e.entityType, entityId: e.entityId, summary: e.summary, before: e.before === undefined ? undefined : toJsonSafe(e.before), after: e.after === undefined ? undefined : toJsonSafe(e.after), reason: e.reason, ip: ctx.ip, }, })}// toJsonSafe: ubah BigInt menjadi number, Date menjadi ISO, dan HAPUS kunci passwordHash dan tokenHash secara rekursif
Wajib dicatat: PASSWORD_CHANGE, USER_CREATE, USER_UPDATE, USER_DEACTIVATE, BUSINESS_UPDATE (termasuk tiap toggle), PRICE_CHANGE, PRODUCT_CREATE, PRODUCT_DELETE, CUSTOMER_REASSIGN, ORDER_SUBMIT, ORDER_WITHDRAW, ORDER_REQUEST_FINAL, ORDER_VOID, ORDER_DELETE, ORDER_PURGE, INVOICE_APPROVE (termasuk overrideNote), INVOICE_REJECT, INVOICE_VOID, INVOICE_PRINT, PAYMENT_CREATE, PAYMENT_VERIFY, PAYMENT_REJECT, PAYMENT_VOID, REFUND_CREATE, CREDIT_NOTE_CREATE, CREDIT_NOTE_VOID, SHIPMENT_SHIP, STOCK_ADJUST, STOCK_OPNAME, PO_ORDER, PO_RECEIVE, PO_CANCEL, VENDOR_PAYMENT, COMMISSION_PAY, TRASH_RESTORE, TRASH_PURGE, RELEASE_PUBLISH, TELEGRAM_LINK, TELEGRAM_UNLINK.
Audit log tidak boleh diubah atau dihapus. Tidak ada endpoint untuk itu, dan database menolaknya lewat trigger. Tambahkan ke migrasi db_constraints (6.8):
CREATE OR REPLACE FUNCTION audit_log_immutable() RETURNS trigger AS $$BEGIN  RAISE EXCEPTION 'AuditLog tidak boleh diubah atau dihapus';END;$$ LANGUAGE plpgsql;CREATE TRIGGER audit_log_no_change BEFORE UPDATE OR DELETE ON "AuditLog" FOR EACH ROW EXECUTE FUNCTION audit_log_immutable();
Job housekeeping tidak menyentuh AuditLog. Halaman /audit (Super Admin) menampilkan daftar dengan filter dan membandingkan before dan after.

## 17. Tes Wajib

Agent tidak boleh menyatakan tugas selesai bila tes yang disebut di tugas itu belum ada dan lulus. Tes uang dan hak akses adalah yang paling penting: kesalahan di sana merugikan bisnis secara langsung.

### 17.1 Perintah dan setup

| Perintah | Fungsi |
| pnpm lint | ESLint (aturan: tanpa any, tanpa console.log, tanpa dangerouslySetInnerHTML) |
| pnpm typecheck | tsc --noEmit |
| pnpm test:unit | Vitest, fungsi murni di src/lib/domain dan utilitas |
| pnpm test:int | Vitest dengan PostgreSQL tes, memanggil service dan handler |
| pnpm test:e2e | Playwright |
| pnpm test | test:unit lalu test:int |

Database tes terpisah di TEST_DATABASE_URL (service db_test di docker-compose.dev.yml). Migrasi diterapkan sekali di globalSetup, dan setiap tes diawali resetDb() (TRUNCATE semua tabel dengan RESTART IDENTITY CASCADE).
Pengaman wajib: globalSetup menolak berjalan bila nama database di TEST_DATABASE_URL tidak berakhiran \_test. Ini mencegah tes menghapus data asli.
// tests/setup/globalSetup.tsexport default async function setup() { const url = process.env.TEST_DATABASE_URL ?? '' if (!url || !new URL(url).pathname.endsWith('\_test')) { throw new Error('TEST_DATABASE_URL harus menunjuk database yang namanya berakhiran \_test') } process.env.DATABASE_URL = url // jalankan prisma migrate deploy terhadap database tes di sini}
tests/factories.ts menyediakan createBusiness, createUser(role), createCustomer, createProduct, createDraftOrder, dan ctxFor(user). Jangan membuat data tes dengan tangan di tiap file.
Tes yang bergantung waktu menerima now sebagai parameter. Dilarang memakai setTimeout untuk menunggu di tes.

### 17.2 Tes unit (domain)

| File | Kasus yang wajib ada |
| money.test.ts | applyBps(1234567, 350) = 43210; applyBps(1, 5000) = 1 (setengah ke atas); applyBps(0, 1000) = 0; applyBps(100, 10000) = 100; assertInt menolak 1.5, NaN, 2\*\*53; applyBps menolak nilai negatif |
| order.test.ts | Seluruh fixture 7.7 (tiap angka). Qty 0 ditolak. Diskon melebihi subtotal ditolak. Persen diskon 10001 ditolak. PPN nonaktif: grandTotal = 1.190.000. dpBps = 0 memberi dpAmount = 0. dpBps = 9901 ditolak. Ongkir 0 diterima. Order tanpa baris ditolak. |
| pricing.test.ts | Harga minimal customer menimpa harga minimal produk. Promo aktif menurunkan floor. Promo kedaluwarsa, nonaktif, atau untuk produk lain tidak berlaku. lineNet sama dengan floor x qty tidak dianggap di bawah minimal. Satu rupiah di bawahnya dianggap di bawah minimal. Promo AMOUNT lebih besar dari harga tidak membuat floor negatif. |
| profit.test.ts | Fixture 7.7: profit 285.000 dan subsidi ongkir 30.000. Setelah retur 2 unit restock: profit 235.000. Retur tanpa restock: HPP tidak dibalik. Profit negatif tetap dihitung. Biaya lain mengurangi profit. discountBySource memisahkan MANUAL, PROMO, SUBSIDY. |
| credit.test.ts | lineNet = 100, qty = 3: creditForQty untuk 1, 2, 3 unit = 33, 67, 100. Tiga retur satu-satu menghasilkan 33 + 34 + 33 = 100 (tidak ada selisih). Retur melebihi qty melempar RETURN_QTY_INVALID. PPN pada credit note memakai tarif order. |
| commission.test.ts | Keempat mode. Profit negatif memberi komisi 0 pada mode persen. Tingkat memilih tingkat tertinggi yang terpenuhi. achievementBps dengan target 0 memberi 0. Mode nominal tetap mengabaikan profit. |
| numbering.test.ts | 2026-11-04T17:30:00Z (00:30 WIB) menghasilkan 05/11/2026. 2026-11-05T23:30:00Z (06:30 WIB hari berikutnya) menghasilkan 06/11/2026. Urutan 7 menjadi 0007, urutan 12345 menjadi 12345. invoiceNumber: versi 1 -DP, versi 2 -DP-R1, FINAL versi 1 -LNS. |
| terbilang.test.ts | Enam kasus di 14.5, ditambah 21, 111, 2000, 1000000. |
| reminder.test.ts | Tanpa tanggal atau 1 tanggal memakai cadangan. Tanggal berjarak 30, 60, 90 hari memberi 30. Dua selisih 28 dan 32 memberi median 30. Hasil dibatasi 1–365. Hanya 4 selisih terakhir dipakai. daysUntil benar di sekitar tengah malam WIB. |
| parse.test.ts | parseRupiahInput('Rp 1.250.000') = 1250000; '' menjadi null; parsePercentToBps('3,5') = 350; '101' menjadi null; '3.555' menjadi null. |
| initData.test.ts | initData valid (dibuat dengan algoritma yang sama dan token palsu) diterima. Satu field diubah ditolak. Hash salah panjang ditolak. auth_date lebih tua dari batas ditolak. Tanpa user ditolak. |

### 17.3 Tes integrasi (service dan database)

Setiap nomor di bawah adalah satu atau lebih tes dengan nama yang jelas.
Alur lengkap dengan DP: draft, submit, approve (nomor KODE/INV/DD/MM/YYYY/0001-DP), bayar DP dan verifikasi, status IN_PROCESS, request-final, approve (nomor ...0001-LNS), kirim, bayar pelunasan, verifikasi, status COMPLETED. Periksa paidTotal, stok, entri komisi, dan pengingat yang terbentuk.
Tanpa DP (dpBps = 0): satu invoice FINAL untuk seluruh total, order langsung AWAITING_FINAL_PAYMENT setelah disetujui.
Tolak lalu revisi: reject, status REVISION_REQUIRED, edit, submit lagi, invoice versi 2, approve dengan nomor berakhiran -DP-R1.
Di bawah minimal: submit tanpa belowMinReason gagal 422; dengan alasan berhasil; approve tanpa overrideNote gagal 422; dengan catatan berhasil. Sales mencetak sebelum disetujui: 409 INVOICE_NOT_APPROVED. Setelah disetujui: 200 dan isi diawali %PDF.
Penomoran paralel: 20 persetujuan serentak (Promise.all) untuk customer yang sama menghasilkan urutan 1–20, unik dan tanpa lubang. Dua customer berbeda memiliki urutan sendiri-sendiri. Persetujuan yang gagal di tengah transaksi tidak menghanguskan nomor.
Isolasi: sales A tidak bisa membaca atau mengubah order, customer, invoice, atau pembayaran sales B (404), maupun data usaha lain (404). Endpoint daftar tidak memuat data milik pihak lain.
Stok: reservasi saat approve. INSUFFICIENT_STOCK bila allowNegativeStock mati. Bila menyala, lolos dan available bisa minus. Kirim mengurangi stockQty dan reservedQty. Void sebelum kirim melepas reservasi. Void setelah kirim dengan restock menambah stok. Produk ganda 422. Dua persetujuan serentak rebutan stok terakhir: tepat satu berhasil.
Pembayaran: kelebihan bayar 422 OVERPAYMENT. Verifikasi dua kali tidak menghitung ganda. Void pembayaran terverifikasi menghitung ulang paidTotal. Sales tidak bisa verifikasi (403). Bukti bayar berjenis salah ditolak.
Void order dengan uang masuk: muncul REFUND terverifikasi (atau saldo kredit), paidTotal jadi 0, stok kembali, komisi REVERSED, pengingat dibangun ulang, invoice VOID, ada baris audit. Void dengan credit note aktif: 409 HAS_CREDIT_NOTES.
Retur: retur 2 dari 10 unit baris A dengan restock menghasilkan kredit 190.000 dan profit 235.000 (7.7). OFFSET melebihi balanceDue: 422. Retur melebihi sisa jumlah: 422. Void credit note membalik stok.
Hapus dan purge: hapus order otomatis void lebih dulu. confirm salah: 422 CONFIRM_MISMATCH. Purge menulis audit berisi snapshot lengkap. Data induk yang dipakai transaksi tidak bisa di-purge (409 IN_USE).
Harga: ubah harga tanpa alasan 422. Perubahan menulis PriceHistory dan audit. minPrice > basePrice 422. rev basi 409. Snapshot order lama tidak berubah.
Promo dan harga customer: promo valid menurunkan floor, promo kedaluwarsa 422 PROMO_NOT_VALID, harga minimal customer menimpa harga produk.
Komisi: keempat mode di level service, pemicu ON_DP_PAID dan ON_FULL_PAID, hitung ulang setelah credit note, REVERSED saat void, override per sales menimpa default usaha.
Pengingat: order selesai berjarak 30 hari memberi interval 30. Interval MANUAL dipertahankan. scanRepeatReminders(now) dengan now buatan menghasilkan notifikasi H-3, H-0, dan terlambat. Dijalankan dua kali menghasilkan satu notifikasi per hari (dedupe). Eskalasi muncul setelah 3 hari terlambat. Tidak ada notifikasi bila sudah ada order baru.
Telegram: webhook tanpa secret 401. /start <kode> menghubungkan akun. Kode kedaluwarsa atau terpakai ditolak. Callback setujui oleh akun sales ditolak. Setujui invoice hasBelowMin lewat tombol ditolak. Callback dua kali tidak memproses dua kali. Kegagalan 403 dari Telegram menandai telegramBlocked.
Autentikasi: 5 kali gagal login menghasilkan 429. Sesi user nonaktif tidak berlaku. mustChangePassword memblokir endpoint lain. Ganti password mencabut sesi lain. POST dengan Origin asing ditolak.
Katalog: harga di bawah floor 422 PRICE_BELOW_MIN. Setelah floor dinaikkan, PDF ditolak 422 CATALOG_STALE. Katalog yang dikaitkan customer memakai floor customer.
Berkas: upaya path traversal (../) menghasilkan 404. Sales tidak bisa membuka bukti bayar milik sales lain. Berkas dengan byte awal salah ditolak walau ekstensinya .jpg.
Konkurensi: menyetujui invoice yang sama dua kali serentak: satu berhasil, satu 409. Edit dengan rev basi 409 STALE_DATA.
Tautan unduh: token kedaluwarsa atau diubah ditolak. Sales tidak bisa membuat tautan untuk invoice yang belum disetujui.

### 17.4 Tes hak akses dan kebocoran data (paling penting)

a. Tes kebocoran kunci rahasia. Untuk setiap endpoint GET dan POST yang bisa dipakai Sales, panggil sebagai Sales dan pastikan respons tidak memuat kunci terlarang (5.4), di kedalaman berapa pun.
// tests/helpers/leak.tsexport const FORBIDDEN_KEYS = [ 'costPrice', 'hpp', 'cost', 'costSnapshot', 'margin', 'profit', 'profitAmount', 'commission', 'commissionAmount', 'commissionBps', 'ownerNote', 'ownerNotes', 'actualCost', 'shippingActualCost', 'extraCost', 'purchasePrice', 'unitCost', 'vendorPrice', 'supplierPrice', 'auditLog', 'before', 'after',]export function assertNoSecretKeys(v: unknown, path = '$'): void {  if (Array.isArray(v)) {    v.forEach((x, i) => assertNoSecretKeys(x, `${path}[${i}]`))    return  }  if (v && typeof v === 'object') {    for (const [k, x] of Object.entries(v)) {      if (FORBIDDEN_KEYS.includes(k)) throw new Error(`Kunci rahasia ${k} bocor di ${path}`)      assertNoSecretKeys(x, `${path}.${k}`) } }}
Tes yang sama dijalankan untuk InvoiceSnapshot (14.1) dan untuk objek notifikasi yang ditujukan ke Sales.
b. Tes matriks hak akses (berbasis tabel). tests/integration/permissions.test.ts memuat daftar (metode, path, role, status yang diharapkan) yang diturunkan dari matriks 5.1, dan memeriksa semuanya. Contoh baris yang wajib ada:
| Metode dan path | Sales | Super Admin |
| POST /products | 403 | 201 |
| PATCH /products/:id | 403 | 200 |
| GET /products/:id/price-history | 403 | 200 |
| POST /invoices/:id/approve | 403 | 200 |
| POST /payments/:id/verify | 403 | 200 |
| POST /orders/:id/void | 403 | 200 |
| GET /reports/margin | 403 | 200 |
| GET /audit-logs | 403 | 200 |
| GET /users | 403 | 200 |
| POST /stock/adjust | 403 | 200 |
| PUT /orders/:id/shipment dengan field actualCost | 422 | 200 |
| GET /orders/:id/profit | 403 | 200 |

c. Tes inventaris rute. tests/unit/route-inventory.test.ts memindai semua src/app/api/v1/\*\*/route.ts dan gagal bila ada handler yang tidak dibungkus withApi, atau bila ada rute yang tidak tercantum di tabel endpoint BLUEPRINT.md.
d. Tes isolasi usaha. Buat dua usaha dengan data lengkap. Untuk setiap endpoint daftar dan detail, pastikan Super Admin yang memilih usaha A tidak menerima data usaha B, dan Sales usaha A tidak bisa membuka satu pun id milik usaha B (selalu 404).

### 17.5 Tes e2e (Playwright)

Jalur utama via UI: Super Admin membuat sales dan produk. Sales login (viewport 360x740), membuat customer, membuat order, mengajukan. Super Admin menyetujui di antrean. Sales mencetak invoice. Pembayaran DP, verifikasi, pelunasan, pengiriman sampai COMPLETED.
Di bawah minimal: peringatan merah muncul, alasan wajib, tombol cetak nonaktif sampai disetujui.
Mini App: halaman /tg dengan objek window.Telegram.WebApp palsu (stub) dan POST /auth/telegram dimock. Pastikan tata letak 360 px tidak meluber.
Tema invoice: halaman dev /dev/invoice-preview?theme=<TEMA>&fixture=<NAMA> (hanya aktif bila NODE_ENV !== 'production') merender HTML template untuk 5 tema dan fixture (3 baris, 40 baris, teks panjang, dengan atau tanpa PPN, dengan atau tanpa logo). Tes memastikan tidak ada elemen yang meluber horizontal (scrollWidth <= clientWidth) dan menyimpan tangkapan layar ke tests/e2e/**screenshots**/ agar pemilik dapat memeriksa tampilan sebelum rilis.
Katalog dan PWA: manifest terbaca, service worker terdaftar, katalog yang disimpan tetap terbuka saat context.setOffline(true), dan cache dihapus setelah logout.

### 17.6 Aturan tes

Setiap bug yang diperbaiki wajib disertai tes yang gagal sebelum perbaikan dan lulus sesudahnya.
Cakupan: seluruh src/lib/domain harus 100% (cabang dan baris). Service minimal 80%.
Tes tidak boleh bergantung pada urutan eksekusi atau data dari tes lain.
Tes tidak boleh memanggil Telegram atau jaringan sungguhan. Gunakan stub untuk bot.api.

## 18. Celah dan Edge Case yang Sudah Diputuskan

Daftar ini berisi situasi yang biasanya terlewat dan menimbulkan bug uang atau data ganda. Setiap baris sudah punya keputusan. Agent harus mengikuti keputusan ini, dan setiap baris yang menyentuh kode harus punya tes (bagian 17).

### 18.1 Tabel keputusan

| No | Situasi | Keputusan |
| 1 | Tombol Ajukan atau Setujui ditekan dua kali, atau dua perangkat bersamaan | Kunci baris order, cek status ulang, indeks unik satu invoice aktif, rev untuk data basi. Yang kedua mendapat 409. |
| 2 | Harga dasar produk berubah antara draft dan pengajuan | Harga deal yang diketik sales dipertahankan. HPP dan floor dihitung ulang saat pengajuan. UI memberi peringatan bila harga dasar berubah sejak draft. |
| 3 | Produk dinonaktifkan atau dihapus saat order masih draft | Pengajuan ditolak 422 PRODUCT_INACTIVE dengan nama produknya. Order yang sudah disetujui tidak terpengaruh. |
| 4 | Harga minimal customer berubah setelah pengajuan, sebelum persetujuan | Snapshot saat pengajuan dipakai. Halaman persetujuan menampilkan banner "Harga minimal berubah sejak pengajuan" beserta nilai terbarunya. Super Admin memutuskan. |
| 5 | HPP berubah setelah order disetujui | Tidak berpengaruh. Profit memakai HPP snapshot di baris order. |
| 6 | Toggle PPN diubah | Order draft mengikuti pengaturan usaha saat diajukan. Setelah diajukan, PPN dibekukan di order dan invoice. |
| 7 | Persen DP ingin diubah setelah invoice disetujui | Tidak boleh. Void invoice lalu ajukan ulang (18.2). |
| 8 | Customer membayar DP kurang dari tagihan | Pembayaran parsial diterima. Order tetap AWAITING_DP sampai DP lunas terverifikasi. |
| 9 | Pembayaran dicatat ke invoice yang sudah VOID, REJECTED, atau WITHDRAWN | Ditolak 409 INVALID_STATE. |
| 10 | Customer mentransfer lebih dari tagihan | Ditolak 422 OVERPAYMENT. Penanganan kelebihan transfer di luar sistem pada versi ini (catat di catatan pembayaran dan OPEN_QUESTIONS.md). |
| 11 | Toggle stok minus diubah di tengah jalan | Hanya dievaluasi saat persetujuan. Order yang sudah disetujui tidak dievaluasi ulang. |
| 12 | Dua order berebut stok terakhir | Baris produk dikunci terurut id. Tepat satu berhasil, yang lain 409 INSUFFICIENT_STOCK (bila stok minus mati). |
| 13 | Koreksi stok membuat available negatif padahal ada reservasi | Diizinkan untuk Super Admin. Produk ditandai di dashboard. Order yang sudah disetujui tidak diblokir. |
| 14 | Celah nomor invoice | Nomor dialokasikan di transaksi persetujuan. Persetujuan gagal tidak menghanguskan nomor. Dokumen void tetap memiliki nomornya. Nomor tidak pernah dipakai ulang. |
| 15 | Kode customer diubah atau kembar | Unik per usaha (409 DUPLICATE). Tidak bisa diubah setelah customer punya invoice. |
| 16 | Customer dipindah ke sales lain saat ada order berjalan | Customer, pengingat, dan tugas follow-up pindah. Order berjalan tetap milik sales lama kecuali Super Admin memilih moveOpenOrders: true (komisi mengikuti salesId order). |
| 17 | Sales dinonaktifkan | Semua sesi dicabut, notifikasinya ditahan. Customer dan order tetap ada. Dashboard Super Admin menampilkan peringatan "customer tanpa sales" sampai dipindahkan. |
| 18 | Order dibuat Super Admin untuk customer yang tidak punya sales | 422 CUSTOMER_HAS_NO_SALES. Pindahkan customer ke sales terlebih dulu. |
| 19 | Hapus customer yang masih punya order berjalan | Ditolak 409 HAS_ACTIVE_ORDERS. Order berjalan = status selain COMPLETED dan CANCELLED. |
| 20 | Promo kedaluwarsa antara draft dan pengajuan | Pengajuan ditolak 422 PROMO_NOT_VALID. UI menawarkan menghapus promo dari baris. |
| 21 | Waktu sekitar tengah malam | Semua tanggal dokumen, pengingat, dan laporan memakai kalender WIB (wibParts, wibDayIndex). Ada tes batas tengah malam. |
| 22 | Pengguna memblokir bot Telegram | telegramBlocked = true. Notifikasi tetap tampil di aplikasi. Super Admin melihat tanda di daftar sales. |
| 23 | Satu akun Telegram dipakai dua user | Ditolak saat menghubungkan (telegramChatId unik). |
| 24 | Callback Telegram dari akun yang sudah dinonaktifkan atau bukan Super Admin | Ditolak. Pesan "Tidak punya akses". |
| 25 | initData dicuri dan dipakai ulang | Dibatasi auth_date maksimal 1 jam. Sesi yang dihasilkan berjalan seperti login biasa dan bisa dicabut. |
| 26 | Berkas unggahan berbahaya atau ekstensi palsu | Cek byte awal, olah ulang gambar dengan sharp, nama acak, jalur diverifikasi. |
| 27 | Nama produk atau alamat berisi HTML atau teks sangat panjang | React meng-escape otomatis. Jaringan halaman PDF diblokir. Tema diuji dengan teks panjang. |
| 28 | Ekspor Excel berisi sel berawalan =, +, -, @ | Diberi awalan tanda petik tunggal (16.4). |
| 29 | Angka sangat besar atau pecahan masuk | assertInt menolak. Batas unitPrice 10 miliar, qty satu juta, 200 baris per order. |
| 30 | Daftar atau PDF terlalu besar | pageSize maksimal 100. Katalog PDF maksimal 300 produk. |
| 31 | Tema, logo, atau rekening bank usaha diganti | Invoice lama tidak berubah (snapshot). Berkas logo lama tidak dihapus dari disk. Bila hilang, PDF dirender tanpa logo. |
| 32 | Revisi invoice yang sudah disetujui | Tidak ada edit. Gunakan void invoice (18.2). Nomor revisi berakhiran -R1, -R2. |
| 33 | Kirim sebelum lunas (requirePaidBeforeShip mati) | Diizinkan setelah invoice pelunasan disetujui. Sisa tagihan masuk piutang dan pengingat. |
| 34 | Retur setelah order COMPLETED | Boleh. Status order tetap COMPLETED. Bila kredit melebihi saldo, selisih lewat REFUND atau CUSTOMER_CREDIT. |
| 35 | Komisi sudah PAID lalu order diretur atau di-void | Entri REVERSED, dan laporan komisi menandainya "perlu dikembalikan" agar Super Admin menindaklanjuti manual. |
| 36 | Super Admin membuka dua tab untuk usaha yang berbeda | Usaha aktif tersimpan di sesi. Aksi di tab lama pada data usaha lain menghasilkan 404. Header selalu menampilkan nama usaha aktif, dan UI mengubah 404 menjadi pesan "Usaha aktif berubah, muat ulang". |
| 37 | Usaha dinonaktifkan | Sales usaha itu tidak bisa login (403). Data tetap tersimpan. |
| 38 | Backup dipulihkan | DocumentCounter ikut dipulihkan sehingga nomor tetap berlanjut. Uji pemulihan sekali sebelum go-live dan dokumentasikan di BLUEPRINT.md. |
| 39 | Username ingin diganti | Tidak didukung. Nonaktifkan akun lama dan buat akun baru. Nama tampilan boleh diubah. |
| 40 | Koreksi nomor urut manual | Tidak ada antarmuka. Hanya lewat migrasi bertanda ADR. |

### 18.2 Aturan tambahan yang melengkapi bagian 8

Void satu invoice (POST /invoices/:id/void) hanya boleh bila invoice itu tidak punya pembayaran terverifikasi (selain itu: void pembayarannya dulu atau void seluruh order). Efeknya:
Invoice pertama (DP atau tunggal) di-void: reservasi stok dilepas, stockReserved = false, order kembali ke REVISION_REQUIRED dengan rejectReason berisi alasan void. Sales merevisi lalu mengajukan ulang. Invoice baru bernomor orderNo yang sama dengan akhiran revisi (-DP-R1). customerSeq dan orderNo tidak berubah.
Invoice pelunasan di-void: order kembali ke IN_PROCESS.
Pengajuan pelunasan dengan perubahan ongkir: request-final boleh membawa shippingCharge baru beserta alasan. ppnAmount, grandTotal, dan jumlah invoice pelunasan dihitung ulang dengan calcOrderTotals. dpAmount yang sudah dibayar tidak berubah.
Pembayaran DP kurang atau Super Admin ingin kirim lebih awal: tidak ada pengecualian status. Super Admin memakai void invoice atau meminta revisi.
Pemindahan customer (POST /customers/:id/reassign) menerima { salesId, moveOpenOrders?: boolean } dan mencatat audit CUSTOMER_REASSIGN.
Hapus customer diperiksa terhadap order berjalan (butir 19 tabel di atas) sebelum soft delete.

### 18.3 Di luar cakupan versi ini (jangan dikerjakan, tulis di roadmap)

Impor massal produk (Excel atau CSV), pengiriman parsial (banyak surat jalan per order), pengiriman invoice otomatis lewat WhatsApp atau email, penanganan otomatis kelebihan transfer, role admin per usaha, banyak mata uang, pajak selain PPN, harga bertingkat per jumlah, retur ke vendor, tanda tangan digital, persetujuan bertingkat, dan skala horizontal (lebih dari satu replika web). Bila pemilik meminta salah satunya, buat ADR dan rencana terpisah lebih dulu.

## 19. Fase dan Tugas Bertahap

Pekerjaan dibagi menjadi enam fase (0 sampai 5). Setiap tugas kecil, punya rujukan bagian dokumen, dan punya kriteria "Selesai bila" yang bisa diperiksa. Kerjakan berurutan. Jangan mulai tugas berikutnya sebelum yang sekarang memenuhi semua kriteria dan laporannya (1.4) dikirim.

### 19.1 Perintah siap pakai untuk pemilik

Tempel salah satu perintah ini ke AI agent, ganti nomor tugas.
Kerjakan Tugas T1.3 dari dokumen "Prompt AI Agent".Baca dulu bagian yang dirujuk tugas itu. Ikuti aturan emas (bagian 1.3).Jangan mengerjakan tugas lain. Setelah selesai, jalankan lint, typecheck, dan test,perbarui BLUEPRINT.md dan CHANGELOG.md, lalu kirim laporan dengan format bagian 1.4.Bila ada yang tidak jelas, tulis di docs/OPEN_QUESTIONS.md dan tanya saya. Jangan menebak.
Bila agent melenceng, pakai perintah koreksi ini:
Berhenti. Sebutkan bagian dokumen mana yang kamu ikuti untuk langkah barusan.Bandingkan dengan aturan emas 1.3 dan kriteria Selesai bila tugas ini.Perbaiki hanya bagian yang menyimpang, tambahkan tes yang membuktikannya, lalu laporkan.

### 19.2 Fase 0: Fondasi proyek (rilis v0.1.0)

| No | Tugas | Rincian (rujukan) | Selesai bila |
| T0.1 | Inisialisasi proyek dan dokumentasi | Next.js App Router, TypeScript strict, pnpm, ESLint, Prettier, Vitest, Playwright. Struktur folder 3.2. .nvmrc. Buat docs/BLUEPRINT.md (12 bagian, 4.1), CHANGELOG.md, docs/OPEN_QUESTIONS.md, docs/adr/0001-uang-bigint.md, docs/adr/0002-stack.md | pnpm lint, typecheck, test berjalan. Versi 0.1.0. BLUEPRINT berisi ringkasan dan tabel versi stack terkunci. Changelog terisi. |
| T0.2 | Env, log, health, Docker | src/lib/env.ts (Zod), logger.ts dengan redact (16.4), GET /api/health, Dockerfile (3.4), docker-compose.dev.yml (Postgres dev dan tes), .env.example lengkap termasuk APP_SECRET (3.3) | Aplikasi gagal start bila env kurang. /api/health memberi ok, db, version. docker build sukses dan Chromium terpasang di image. |
| T0.3 | Skema dan migrasi | Salin skema bagian 6, buat migrasi init. Migrasi db_constraints (6.8 dan trigger audit 16.5). src/lib/db.ts dengan extension TENANT_MODELS (16.2) | prisma migrate dev sukses di database kosong. Tes SQL membuktikan: insert minPrice > basePrice gagal, update AuditLog gagal. ERD Mermaid masuk BLUEPRINT. |
| T0.4 | Rumus domain | Salin persis ke src/lib/domain/: money, pricing, order, profit, credit, commission, numbering, terbilang, reminder, dan src/lib/format/parse.ts (7.1 sampai 7.8, 11.2, 13.1, 14.5) | Semua tes 17.2 ada dan lulus. Cakupan domain 100%. Fixture 7.7 cocok persis angka demi angka. |
| T0.5 | Infrastruktur tes | Konfigurasi Vitest (unit dan integrasi), globalSetup dengan pengaman \_test (17.1), resetDb, factories.ts, helpers/leak.ts (17.4) | pnpm test hijau. Ada tes yang membuktikan globalSetup menolak URL tanpa akhiran \_test. |

### 19.3 Fase 1: Login, usaha, produk (rilis v0.2.0)

| No | Tugas | Rincian (rujukan) | Selesai bila |
| T1.1 | Autentikasi inti | lib/auth/\* (argon2id, sesi, requireContext, cek Origin, pembatasan percobaan), withApi dan pemetaan error (10.2), endpoint login, logout, me, change-password (16.1) | Tes 17.3 nomor 17 lulus. Atribut cookie benar. mustChangePassword memblokir endpoint lain. Pesan login gagal selalu sama. |
| T1.2 | Seed, login, kerangka aplikasi | prisma/seed.ts (16.1), halaman /login, AppShell (sidebar Super Admin, bar bawah Sales), pengalih usaha dan POST /session/business, halaman /profile | Login berjalan di HP dan desktop. Seed menolak bila Super Admin sudah ada. Pengalih usaha mengubah activeBusinessId. |
| T1.3 | Usaha, rekening, berkas, audit | CRUD /businesses, rekening bank, toggle pengaturan (6.2), unggah logo. lib/files (16.3). audit() (16.5). UI /settings/business | Tes upload: byte awal salah ditolak, path traversal 404. Setiap perubahan pengaturan menulis audit. Kode usaha tidak bisa diubah setelah ada order (tes). |
| T1.4 | Akun sales | CRUD /users, reset password, aktifkan atau nonaktifkan dengan pencabutan sesi. UI /settings/users. Mulai permissions.test.ts (17.4 b) | Sales memanggil endpoint Super Admin mendapat 403. Nonaktifkan mencabut sesi. Audit tercatat. |
| T1.5 | Kategori dan produk | /categories dan /products CRUD, unggah foto (maksimal 8), DTO sales dan admin (10.3). Ubah harga wajib priceReason, menulis PriceHistory, memakai rev. Hapus lewat soft delete dengan confirm | Tes kebocoran: Sales tidak menerima costPrice dan margin. minPrice > basePrice 422. rev basi 409. Riwayat harga tertulis. |
| T1.6 | UI produk | /products (Super Admin: kolom HPP dan margin; Sales: tanpa), formulir dengan upload foto dan MoneyInput, /products/[id]/prices | Tampil benar di 360 px. Sales tidak melihat HPP di tampilan maupun di respons jaringan. |
| T1.7 | Vendor | /vendors CRUD (SUPPLIER dan TRANSPORT), UI | CRUD dan soft delete berjalan. Kode vendor unik per usaha. |
| T1.8 | Catatan Pembaruan | ReleaseNote CRUD, /updates, badge baru, render markdown aman (4.3), tanpa broadcast | Sales bisa membaca tetapi tidak bisa menerbitkan (tes). Markdown tidak mengeksekusi HTML. |

### 19.4 Fase 2: Customer, order, stok (rilis v0.3.0)

| No | Tugas | Rincian (rujukan) | Selesai bila |
| T2.1 | Customer | CRUD, customerScope (16.2), kode unik dan tidak bisa diubah setelah ada invoice, reassign, soft delete (cek order berjalan, 18.1 nomor 19) | Tes isolasi 17.4 d untuk customer. Sales hanya melihat customer miliknya. |
| T2.2 | CRM | Interaksi, tugas follow-up, timeline, tahap pipeline, tag, UI. nextFollowUpAt membuat CrmTask | Sales hanya mengelola miliknya. Timeline terurut. Tes lulus. |
| T2.3 | Harga per customer | CustomerMinPrice, CustomerPromo, GET /customers/:id/pricing, riwayat harga CUSTOMER_MIN (7.2, 10.5) | Tes pricing integrasi (17.3 nomor 13). Setiap perubahan butuh alasan dan menulis PriceHistory. |
| T2.4 | Penomoran | nextSeq (7.8), DocumentCounter | Tes paralel: 20 alokasi serentak menghasilkan 1 sampai 20 unik. Urutan terpisah per customer. |
| T2.5 | Order draft | buildOrderSnapshot (10.4), POST /orders/preview, buat, ubah, lihat, daftar, hapus draft. DTO per role | Tes: produk ganda 422, promo valid dan tidak valid, floor, penanda belowMin. DTO Sales tanpa costPrice. Total cocok dengan fixture 7.7. |
| T2.6 | UI formulir order | Layar 11.4 (peringatan merah, total dari preview, DP, ongkir, alamat kirim) | Berfungsi di 360 px. UI tidak menghitung sendiri. Peringatan di bawah minimal terlihat jelas. |
| T2.7 | Stok dan pembelian | stock.ts (lock, move, reserve, release, ship; 7.9), /stock, koreksi, opname. PO (buat, order, terima, batal), pembayaran vendor, buku transaksi vendor, opsi memperbarui HPP saat terima barang (dengan PriceHistory). UI | Tes stok 17.3 nomor 7 termasuk rebutan paralel. Penerimaan PO menambah stok. Buku vendor menjumlah benar. |

### 19.5 Fase 3: Persetujuan, invoice, pembayaran, cetak (rilis v0.4.0)

| No | Tugas | Rincian (rujukan) | Selesai bila |
| T3.1 | Ajukan dan tarik | orderService.submit dan withdraw (8.2), membuat Invoice PENDING_APPROVAL, GET /approvals, notifikasi dalam aplikasi | Transisi sesuai tabel 8.2. Pengajuan kedua 409. Alasan di bawah minimal wajib. |
| T3.2 | Setujui dan tolak | invoiceService.approve dan reject, buildInvoiceSnapshot, alokasi nomor, reservasi stok, aturan override (7.11) | Tes 17.3 nomor 3, 4, 5, 20. Snapshot memenuhi tes kebocoran. Nomor sesuai format 7.8. |
| T3.3 | Pembayaran | Buat (multipart dan bukti), verifikasi, tolak, void, hitung ulang total dari sumber, maybeComplete (8.4) | Tes 17.3 nomor 8. Verifikasi dua kali tidak menghitung ganda. Kelebihan bayar 422. |
| T3.4 | Pelunasan dan pengiriman | request-final, void invoice (18.2), pengiriman (buat, kirim, tiba), nomor surat jalan, stok keluar | Tes 17.3 nomor 1, 2, 7. requirePaidBeforeShip dihormati. |
| T3.5 | Mesin PDF dan tema | Pipeline 14.2, snapshot 14.1, terbilang, lima tema (14.4), endpoint PDF dengan aturan 14.3, pratinjau tema, surat jalan | Sales tidak bisa cetak sebelum disetujui (tes). PDF diawali %PDF. Tes tumpah (overflow) lulus untuk 5 tema dan semua fixture. Pemilik menerima tangkapan layar untuk diperiksa. |
| T3.6 | Void, retur, hapus | Bagian 9 penuh: voidOrder, credit note, refund, saldo kredit, Tempat Sampah, purge, PDF credit note | Tes 17.3 nomor 9, 10, 11. Contoh retur 7.7 cocok persis (kredit 190.000, profit 235.000). |
| T3.7 | Profit dan komisi | GET /orders/:id/profit, OrderCost, layanan komisi (7.6), CommissionEntry, CommissionTier, pengaturan komisi di usaha dan per sales | Tes 17.3 nomor 14. Komisi hanya terlihat Super Admin (tes kebocoran). |
| T3.8 | UI persetujuan, invoice, pembayaran | /approvals, detail persetujuan (11.4), /invoices, /payments, panel simulasi profit | E2E 17.5 nomor 1 dan 2 lulus. Tombol cetak nonaktif sampai disetujui. |

### 19.6 Fase 4: Telegram, pengingat, katalog, PWA (rilis v0.5.0)

| No | Tugas | Rincian (rujukan) | Selesai bila |
| T4.1 | Bot dan antrean | grammY, webhook aman, /start <kode>, /help, /me, /today (12.1 sampai 12.2). Layanan notifikasi dengan dedupeKey, worker pg-boss dan telegram.send (12.5, 13.2) | Tes 17.3 nomor 16 (bagian tautan dan webhook). Worker berjalan sebagai service terpisah. |
| T4.2 | Notifikasi dan tombol persetujuan | Peristiwa tabel 12.4, tombol Setujui, Tolak, Verifikasi, callback yang memakai service yang sama | Setujui di bawah minimal lewat tombol ditolak. Callback ganda idempoten. Akun non Super Admin ditolak. |
| T4.3 | Mini App | /tg, POST /auth/telegram (12.3), tautan unduh bertanda tangan (16.3), Telegram.WebApp (11.5) | Tes initData lulus. Mini App terbuka di Telegram HP dan web. PDF terbuka lewat tautan sekali buka. |
| T4.4 | Pengingat dan job | Pembuatan otomatis saat order COMPLETED, CRUD dan UI pengingat, semua job 13.2, /receivables | Tes 17.3 nomor 15. Job idempoten (jalan dua kali, satu notifikasi). |
| T4.5 | Katalog | CRUD, validasi harga (15.1), PDF (15.2), buat order dari katalog, UI | Tes 17.3 nomor 18. PDF tidak memuat HPP, minimal, stok. |
| T4.6 | PWA | Manifest, sw.js, RegisterSW, tombol pasang, mode offline katalog (15.3) | E2E 17.5 nomor 5 lulus. Cache dihapus saat logout. |
| T4.7 | Siaran pembaruan | publish dengan broadcast ke Telegram, release:draft (4.3) | Pesan terkirim sekali per user yang terhubung. |

### 19.7 Fase 5: Dashboard, laporan, evaluasi sales, go-live (rilis v1.0.0)

| No | Tugas | Rincian (rujukan) | Selesai bila |
| T5.1 | Dashboard | GET /dashboard untuk Super Admin dan Sales (DTO berbeda), UI | Sales tidak menerima angka profit (tes kebocoran). Angka cocok dengan data uji. |
| T5.2 | Laporan margin | GET /reports/margin per order, produk, sales, usaha. Baris "Kerugian pembatalan" (9.2) | Total profit laporan sama dengan jumlah profit order (tes). Order CANCELLED tidak ikut kecuali sebagai kerugian. |
| T5.3 | Evaluasi sales | SalesTarget, OwnerSalesNote, GET /reports/sales-performance, laporan komisi dan POST /commissions/:id/pay, tanda "perlu dikembalikan" (18.1 nomor 35) | Hanya Super Admin yang bisa mengakses (tes matriks). Capaian target dan komisi benar. |
| T5.4 | Piutang, laporan CRM, ekspor | Umur piutang, GET /reports/crm, GET /reports/export (xlsx dan pdf, dengan perlindungan rumus 16.4) | Ekspor terbuka di Excel. Sel berawalan = tidak menjadi rumus (tes). |
| T5.5 | Audit dan pengerasan | UI /audit, CSP dan header (16.4), tinjau pembatasan laju, pnpm audit --prod, tes inventaris rute (17.4 c) | Mini App, PWA, dan PDF tetap berfungsi setelah CSP. Tidak ada temuan audit tingkat tinggi. |
| T5.6 | Go-live | Backup terjadwal dan uji pemulihan (3.4), seed Super Admin produksi, deploy Coolify (dua service), pasang webhook (12.1), uji penerimaan pemilik (19.8), tag v1.0.0 | Pemulihan backup terbukti. Semua langkah 19.8 lulus. CHANGELOG.md dan BLUEPRINT.md final. |

### 19.8 Uji penerimaan oleh pemilik (dikerjakan sendiri, tiap akhir fase)

Fase 1: login sebagai Super Admin, buat usaha, buat satu sales, buat produk dengan foto dan harga, ubah harga dan cek riwayat harganya. Login sebagai sales dari HP: pastikan HPP tidak terlihat di mana pun.
Fase 2: sebagai sales, buat customer lalu order dengan satu harga di bawah minimal: peringatan merah dan alasan wajib harus muncul. Cek stok setelah PO diterima.
Fase 3: ajukan order, setujui sebagai Super Admin, cetak invoice DP dan cek nomornya (KODE/INV/tgl/bln/thn/0001-DP). Coba cetak sebelum disetujui: harus ditolak. Verifikasi DP, ajukan pelunasan, kirim, lunasi, lalu cek profit. Coba void dan retur, lalu cek stok dan profit. Periksa lima tema invoice dengan mata sendiri.
Fase 4: hubungkan Telegram sales dan Super Admin. Setujui lewat tombol Telegram. Buka Mini App. Cek pengingat repeat order. Buat katalog, unduh PDF, pasang di HP, matikan sinyal lalu buka katalog.
Fase 5: lihat dashboard dan laporan margin per order, produk, sales. Cocokkan satu order secara manual dengan hitungan Anda sendiri. Cek evaluasi sales dan komisi.

### 19.9 Gerbang pindah fase

Sebelum pindah fase, semua ini benar: seluruh tes hijau (pnpm test, plus pnpm test:e2e mulai Fase 3), BLUEPRINT.md sesuai kode, CHANGELOG.md diberi versi bertanggal dan git tag vX.Y.Z, OPEN_QUESTIONS.md tidak berisi pertanyaan yang belum dijawab, uji penerimaan pemilik (19.8) lulus, dan deploy ke Coolify berhasil dengan migrasi migrate deploy.

## 20. Definisi Selesai, Larangan, dan Daftar Go-Live

Sebuah tugas belum selesai bila satu saja butir di bawah ini belum terpenuhi.

### 20.1 Definisi selesai untuk setiap tugas

☐ Semua kriteria "Selesai bila" pada tugas itu (bagian 19) terpenuhi.
☐ pnpm lint, pnpm typecheck, dan pnpm test hijau. Hasilnya dilampirkan di laporan.
☐ Tes baru ditulis untuk setiap aturan bisnis dan setiap kode error yang ditambahkan.
☐ Tidak ada any, @ts-ignore, console.log, TODO, atau kode yang dikomentari-matikan.
☐ Tidak ada file di luar lingkup tugas yang berubah. Tidak ada tes yang dihapus atau dilonggarkan.
☐ docs/BLUEPRINT.md, CHANGELOG.md ([Unreleased]), dan ADR (bila ada keputusan baru) diperbarui.
☐ Migrasi baru (bila skema berubah) dibuat dengan prisma migrate dev, tidak mengubah migrasi lama.
☐ Laporan 1.4 dikirim, termasuk bagian "Belum selesai" dan "Pertanyaan untuk pemilik".

### 20.2 Tambahan untuk tugas yang menyentuh uang, stok, atau status

☐ Seluruh hitungan memakai fungsi di src/lib/domain/. Tidak ada rumus ditulis ulang di service, handler, atau UI.
☐ Tidak ada Number pecahan, toFixed, parseFloat pada nilai uang. Uang BigInt di database dan bilangan bulat di kode.
☐ Seluruh perubahan berada dalam satu prisma.$transaction bersama audit().
☐ Baris yang diubah dikunci (lockOrder, lockProducts) dan status dibaca ulang di dalam transaksi.
☐ Total diturunkan dari data sumber (jumlah pembayaran, baris order), bukan dari increment.
☐ Ada tes untuk jalur gagal (status salah, stok kurang, nominal berlebih, rev basi) dan tes yang menjalankan operasi dua kali.

### 20.3 Tambahan untuk setiap endpoint baru

☐ Dibungkus withApi dengan roles yang benar dan skema Zod .strict().
☐ Data diambil lewat fungsi \*Scope (businessId, dan salesId untuk Sales). Data milik pihak lain menghasilkan 404.
☐ Respons dibangun lewat DTO per role. Tes kebocoran (17.4 a) mencakup endpoint ini.
☐ Baris ditambahkan ke tabel endpoint di BLUEPRINT.md dan ke tes matriks hak akses (17.4 b).
☐ Kode error mengikuti tabel 10.1. Pesan error berbahasa Indonesia dan tidak membocorkan detail internal.

### 20.4 Tambahan untuk setiap halaman UI baru

☐ Ada keadaan memuat, kosong, dan gagal.
☐ Diuji di lebar 360 px (tanpa gulir horizontal) dan di desktop.
☐ Tombol aksi dinonaktifkan selama request berjalan dan memberi alasan bila tidak boleh dipakai.
☐ Input uang memakai MoneyInput, persen memakai PercentInput. Tidak ada perhitungan uang di komponen.
☐ Elemen yang hanya untuk Super Admin tidak ada di respons data Sales (bukan sekadar disembunyikan).

### 20.5 Kesalahan yang paling sering dilakukan agent, dan dilarang

Menghitung total atau profit di komponen React atau di handler, lalu hasilnya berbeda dari domain.
Mengembalikan objek Prisma apa adanya dari endpoint (membocorkan costPrice).
Mempercayai price, total, status, businessId, atau salesId dari body request.
Menyembunyikan tombol di UI lalu tidak memeriksa role di server.
findUnique({ where: { id } }) pada data usaha tanpa scope.
Mengubah status order dengan update biasa tanpa lockOrder dan assertStatus.
Menambah paidTotal dengan increment alih-alih menghitung ulang dari pembayaran terverifikasi.
Mengalokasikan nomor dokumen di luar transaksi persetujuan, atau memakai ulang nomor yang di-void.
Mengubah stockQty langsung, bukan lewat moveStock.
Memperbarui snapshot invoice setelah disetujui.
Mengirim pesan Telegram di dalam transaksi database, atau tanpa dedupeKey.
Menyimpan berkas dengan nama dari klien, atau tanpa memeriksa byte awal.
Memakai float untuk persen (0.1) alih-alih bps (1000).
Membandingkan tanggal dalam zona server, bukan WIB.
Menghapus tes yang gagal, atau melonggarkan asersi agar lulus.
Mengerjakan beberapa tugas sekaligus, atau melompati urutan fase.
Mengubah migrasi lama, atau memakai prisma db push atau migrate reset di data nyata.
Menulis rahasia (token, password) di kode, log, atau .env.example.
Mengarang aturan bisnis yang tidak ada di dokumen alih-alih bertanya.
Menyatakan "selesai" tanpa menjalankan perintah verifikasi dan melampirkan hasilnya.

### 20.6 Daftar periksa go-live

☐ Semua fase 0–5 selesai, semua tes hijau, v1.0.0 bertag.
☐ Super Admin produksi dibuat lewat seed dan password sudah diganti.
☐ Backup database harian aktif dan pemulihan sudah diuji pada database terpisah. Volume /data/uploads masuk backup.
☐ Semua variabel environment produksi terisi (3.3). APP_SECRET dan TELEGRAM_WEBHOOK_SECRET acak dan panjang.
☐ Dua service Coolify berjalan: web (satu replika) dan worker. Migrasi berjalan hanya dari web.
☐ HTTPS aktif. Webhook Telegram terpasang dan tombol menu Mini App diatur.
☐ Akun Telegram Super Admin dan semua sales sudah terhubung. Satu notifikasi uji diterima tiap akun.
☐ Tema invoice tiap usaha sudah dipilih dan satu invoice contoh dicetak, diperiksa oleh pemilik.
☐ Rekening bank, logo, alamat, dan toggle PPN, stok minus, DP, wajib lunas sebelum kirim sudah diisi per usaha.
☐ Data produk, harga dasar, harga minimal, dan stok awal sudah dimasukkan dan diperiksa pemilik.
☐ pnpm audit --prod tanpa temuan tingkat tinggi. Tes kebocoran data Sales lulus pada build produksi.
☐ BLUEPRINT.md memuat prosedur backup, pemulihan, rotasi secret, dan cara deploy ulang.
