# Matriks M1: Fitur ke Implementasi ke Tes (Feature-to-Implementation-to-Test Matrix)

Pemetaan menyeluruh seluruh butir spesifikasi arsitektur BLUEPRINT.md (Seksi 4 Hak Akses, Seksi 5 Aturan Bisnis, Seksi 6 Alur Status, Seksi 7 Endpoints & UI Routes, Seksi 8 Integrasi & Background Jobs, Seksi 9 Operasional) ke berkas implementasi dan berkas pengujian.

## 1. Modul Otentikasi, Sesi & Pengguna

| Fitur Spesifikasi | Berkas Implementasi | Berkas Pengujian | Status | Catatan / Temuan |
|---|---|---|---|---|
| Login Username & Password (Argon2id) | `src/app/api/v1/auth/login/route.ts`, `src/lib/auth/password.ts` | `tests/unit/password.test.ts`, `tests/integration/auth.test.ts` | **Ada** | Lulus verifikasi unit & integrasi. |
| Logout & Pencabutan Sesi | `src/app/api/v1/auth/logout/route.ts`, `src/lib/auth/session.ts` | `tests/unit/session.test.ts`, `tests/integration/auth.test.ts` | **Ada** | Sesi di-hash SHA-256. |
| Profil Pengguna Aktif (`auth/me`) | `src/app/api/v1/auth/me/route.ts` | `tests/integration/auth.test.ts` | **Ada** | Mengembalikan user & role. |
| Ganti Password & Cabut Sesi Lain | `src/app/api/v1/auth/change-password/route.ts` | `tests/unit/password.test.ts`, `tests/integration/auth.test.ts` | **Ada** | Mengharuskan password lama benar. |
| Switcher Unit Usaha Aktif Super Admin | `src/app/api/v1/session/business/route.ts` | `tests/unit/business-switcher.test.ts` | **Ada** | Hanya peran SUPERADMIN. |
| Manajemen Pengguna Sales (CRUD) | `src/app/api/v1/users/route.ts`, `[id]/route.ts` | `tests/integration/users.test.ts` | **Ada** | Super Admin only. |
| Reset Password & Deaktivasi Sales | `src/app/api/v1/users/[id]/reset-password/route.ts`, `deactivate/route.ts` | `tests/integration/users.test.ts` | **Ada** | Cabut sesi seketika. |
| Seed Super Admin Awal | `prisma/seed.ts` | `tests/unit/seed.test.ts` | **Parsial** | **AUD-SEC-001 (S1)**: Fallback password `bismillahbento`, overwrite akun lama, `mustChangePassword: false`. |

## 2. Unit Usaha, Rekening Bank & Berkas

| Fitur Spesifikasi | Berkas Implementasi | Berkas Pengujian | Status | Catatan / Temuan |
|---|---|---|---|---|
| Konfigurasi Usaha & Tema Invoice | `src/app/api/v1/businesses/route.ts`, `[id]/route.ts` | `tests/integration/business.test.ts` | **Ada** | Dukungan 5 tema invoice. |
| Pengelolaan Rekening Bank Usaha | `src/app/api/v1/businesses/[id]/bank-accounts/route.ts`, `src/app/api/v1/bank-accounts/[id]/route.ts` | `tests/integration/business.test.ts` | **Parsial** | **AUD-TENANT-001 (S2)**: `bank-accounts/[id]` memanggil `findFirst` tanpa `businessId`. |
| Unggah Logo Usaha | `src/app/api/v1/businesses/[id]/logo/route.ts` | `tests/integration/business.test.ts`, `tests/unit/files.test.ts` | **Ada** | Sharp WebP konversi & anti-traversal. |
| Penyajian Berkas Terisolasi | `src/app/api/v1/files/[businessId]/[kind]/[filename]/route.ts` | `tests/unit/files.test.ts` | **Ada** | Verifikasi tenant & sesi. |

## 3. Master Produk, Kategori & Harga Paten

| Fitur Spesifikasi | Berkas Implementasi | Berkas Pengujian | Status | Catatan / Temuan |
|---|---|---|---|---|
| Kategori Produk Multi-Usaha | `src/app/api/v1/categories/route.ts`, `[id]/route.ts` | `tests/integration/products.test.ts` | **Ada** | Unik per usaha. |
| Master Produk & Zero-Leakage HPP | `src/app/api/v1/products/route.ts`, `[id]/route.ts` | `tests/integration/products.test.ts`, `tests/unit/leak-detector.test.ts` | **Ada** | `costPrice` disaring untuk Sales. |
| Unggah & Kelola Foto Produk | `src/app/api/v1/products/[id]/images/route.ts`, `[imageId]/route.ts` | `tests/integration/products.test.ts` | **Ada** | Maks 8 foto, WebP 1600px. |
| Riwayat Perubahan Harga Produk | `src/app/api/v1/products/[id]/price-history/route.ts` | `tests/integration/products.test.ts` | **Ada** | Alasan perubahan wajib. |
| Daftar Harga Resmi (`/price-list`) | `src/app/api/v1/price-list/route.ts`, `src/lib/dto/priceList.ts`, `src/app/(app)/price-list/page.tsx` | `tests/integration/price-list.test.ts` | **Ada** | Terhubung ke antarmuka `/price-list` dan menu navigasi. |
| Trigger Database Isolasi Tenant Katalog | `prisma/migrations/20261110000003_catalog_same_business_guard/migration.sql` | `tests/integration/catalog-isolation.test.ts` | **Parsial** | **AUD-SPEC-006 (S1)**: Trigger ada di migrasi, tetapi tidak terpasang di produksi akibat `db push`. |

## 4. CRM, Pelanggan, Tugas Follow-up & Promo Khusus

| Fitur Spesifikasi | Berkas Implementasi | Berkas Pengujian | Status | Catatan / Temuan |
|---|---|---|---|---|
| CRUD Pelanggan (Scoping Sales) | `src/app/api/v1/customers/route.ts`, `[id]/route.ts` | `tests/integration/customers.test.ts` | **Ada** | Sales hanya akses customernya. |
| Pengalihan Pelanggan (`reassign`) | `src/app/api/v1/customers/[id]/reassign/route.ts` | `tests/integration/customers.test.ts` | **Ada** | Super Admin only. |
| Interaksi CRM & Pembuatan CrmTask Otomatis | `src/app/api/v1/customers/[id]/interactions/route.ts` | `tests/integration/crm.test.ts` | **Ada** | Atomik dalam satu transaksi. |
| Manajemen Tugas CRM (`crm/tasks`) | `src/app/api/v1/crm/tasks/route.ts`, `[id]/route.ts` | `tests/integration/crm.test.ts` | **Ada** | Penyaringan tanggal & sales. |
| Harga Minimal Khusus Pelanggan | `src/app/api/v1/customers/[id]/min-prices/route.ts` | `tests/integration/customer-pricing.test.ts` | **Ada** | Catat `PriceHistory` CUSTOMER_MIN. |
| Promo & Subsidi Pelanggan | `src/app/api/v1/customers/[id]/promos/route.ts` | `tests/integration/customer-pricing.test.ts` | **Ada** | Batas waktu & status. |
| Linimasa CRM & Riwayat Piutang | `src/app/api/v1/customers/[id]/timeline/route.ts` | `tests/integration/crm.test.ts` | **Ada** | Kronologis gabungan order & CRM. |

## 5. Pengadaan, Vendor & Stok Barang

| Fitur Spesifikasi | Berkas Implementasi | Berkas Pengujian | Status | Catatan / Temuan |
|---|---|---|---|---|
| Master Vendor (Supplier & Transport) | `src/app/api/v1/vendors/route.ts`, `[id]/route.ts` | `tests/integration/vendors.test.ts` | **Ada** | Super Admin only. |
| Purchase Order (Draf, Order, Receive, Cancel) | `src/app/api/v1/purchase-orders/route.ts`, `[id]/...` | `tests/integration/purchase-orders.test.ts` | **Ada** | Alokasi PO sequential, mutasi stok fisik. |
| Pembayaran Vendor & Buku Transaksi Vendor | `src/app/api/v1/vendors/[id]/payments/route.ts`, `transactions/route.ts` | `tests/integration/vendors.test.ts` | **Ada** | Rekonsiliasi saldo hutang berjalan. |
| Monitoring Stok (Fisik, Reserve, Available) | `src/app/api/v1/stock/route.ts` | `tests/integration/stock.test.ts` | **Ada** | Deteksi stok minus & reservasi. |
| Koreksi Stok Manual & Stock Opname | `src/app/api/v1/stock/adjust/route.ts`, `opname/route.ts` | `tests/integration/stock.test.ts` | **Ada** | Alasan min 5 karakter & audit log. |

## 6. Pesanan (Order), Approval, Faktur Bertahap & Pembayaran

| Fitur Spesifikasi | Berkas Implementasi | Berkas Pengujian | Status | Catatan / Temuan |
|---|---|---|---|---|
| Kalkulasi Preview Pesanan Live 300ms | `src/app/api/v1/orders/preview/route.ts`, `src/lib/domain/order.ts` | `tests/unit/order.test.ts`, `tests/integration/orders.test.ts` | **Ada** | Integer-only Rupiah & bps. |
| Pembuatan Draf Pesanan (`orders`) | `src/app/api/v1/orders/route.ts`, `[id]/route.ts` | `tests/integration/orders.test.ts` | **Ada** | Isolasi Sales & DTO disaring. |
| Alur Pengajuan (`submit`) & Penarikan (`withdraw`) | `src/app/api/v1/orders/[id]/submit/route.ts`, `withdraw/route.ts` | `tests/integration/order-approval-workflow.test.ts` | **Ada** | Terbitkan Invoice PENDING_APPROVAL. |
| Antrean Approval Super Admin | `src/app/api/v1/approvals/route.ts`, `src/app/(app)/approvals/page.tsx` | `tests/integration/invoice-approval.test.ts` | **Ada** | Filter belowMin, FIFO. |
| Persetujuan Faktur & Alokasi Nomor Dokumen | `src/app/api/v1/invoices/[id]/approve/route.ts`, `src/lib/domain/numbering.ts` | `tests/unit/numbering.test.ts`, `tests/integration/invoice-approval.test.ts`, `tests/integration/counter.test.ts` | **Ada** | Nomor resmi sequential atomik. |
| Penolakan Faktur (Revisi) | `src/app/api/v1/invoices/[id]/reject/route.ts` | `tests/integration/invoice-approval.test.ts` | **Ada** | Alasan penolakan min 5 karakter. |
| Faktur Pelunasan (FINAL) | `src/app/api/v1/orders/[id]/request-final/route.ts` | `tests/integration/shipment-and-final.test.ts` | **Ada** | Opsi penyesuaian ongkir aktual. |
| Pembatalan Faktur Resmi (`void`) | `src/app/api/v1/invoices/[id]/void/route.ts` | `tests/integration/invoice-approval.test.ts` | **Ada** | Lepas reservasi stok & rollback status. |
| Pencatatan Pembayaran & Bukti Transfer | `src/app/api/v1/payments/route.ts`, `src/app/api/v1/orders/[id]/payments/route.ts` | `tests/integration/payments.test.ts` | **Ada** | **AUD-DUP-002 (S3)**: Jalur ganda & duplikasi kode parser multipart. |
| Verifikasi Pembayaran & Rekalkulasi Saldo | `src/app/api/v1/payments/[id]/verify/route.ts` | `tests/integration/payments.test.ts` | **Ada** | Hitung ulang paidTotal dari sumber transaksi. |
| Tolak & Void Pembayaran | `src/app/api/v1/payments/[id]/reject/route.ts`, `void/route.ts` | `tests/integration/payments.test.ts` | **Ada** | Rollback status & rekalkulasi. |

## 7. Pengiriman (Surat Jalan), Nota Kredit & Retur

| Fitur Spesifikasi | Berkas Implementasi | Berkas Pengujian | Status | Catatan / Temuan |
|---|---|---|---|---|
| Alokasi Surat Jalan & Potong Stok Fisik | `src/app/api/v1/orders/[id]/shipment/ship/route.ts` | `tests/integration/shipment-and-final.test.ts` | **Ada** | Status SHIPPED, nomor SJ sequential. |
| Konfirmasi Pengiriman Sampai (`deliver`) | `src/app/api/v1/orders/[id]/shipment/deliver/route.ts` | `tests/integration/shipment-and-final.test.ts` | **Ada** | Status DELIVERED & picu auto-complete. |
| Penerbitan Nota Kredit (Multi-settlement) | `src/app/api/v1/orders/[id]/credit-notes/route.ts` | `tests/integration/credit-notes.test.ts` | **Ada** | OFFSET, CUSTOMER_CREDIT, REFUND. |
| Void Nota Kredit | `src/app/api/v1/credit-notes/[id]/void/route.ts` | `tests/integration/credit-notes.test.ts` | **Ada** | Rollback mutasi stok & deposit kredit. |
| Saldo Deposit Kredit Pelanggan | `src/app/api/v1/customers/[id]/credit-balance/route.ts` | `tests/integration/credit-notes.test.ts`, `tests/unit/credit.test.ts` | **Ada** | Riwayat mutasi deposit kredit. |

## 8. PDF Generation & Cetak

| Fitur Spesifikasi | Berkas Implementasi | Berkas Pengujian | Status | Catatan / Temuan |
|---|---|---|---|---|
| Faktur PDF Resmi (5 Tema) | `src/app/api/v1/invoices/[id]/pdf/route.ts`, `src/lib/pdf/engine.ts` | `tests/integration/pdf-generation.test.ts` | **Ada** | Watermark status, counter cetak, anti-bocor. |
| Pratinjau Tema Faktur PDF Dummy | `src/app/api/v1/businesses/[id]/invoice-preview/route.ts` | `tests/integration/pdf-generation.test.ts` | **Ada** | Watermark CONTOH. |
| Surat Jalan PDF Resmi | `src/app/api/v1/orders/[id]/delivery-note/pdf/route.ts` | `tests/integration/pdf-generation.test.ts` | **Ada** | Wajib SHIPPED/DELIVERED, tanpa harga. |
| Katalog PDF Resmi | `src/app/api/v1/catalogs/[id]/pdf/route.ts` | `tests/integration/catalogs.test.ts` | **Ada** | Tolak cetak jika katalog STALE. |
| Token Unduh Bertanda Tangan 5 Menit | `src/app/api/v1/downloads/route.ts`, `src/app/api/v1/dl/[token]/route.ts` | `tests/integration/telegram-miniapp.test.ts` | **Ada** | HMAC-SHA256 tanpa cookie. |

## 9. Komisi, Profit & Laporan Keuangan

| Fitur Spesifikasi | Berkas Implementasi | Berkas Pengujian | Status | Catatan / Temuan |
|---|---|---|---|---|
| Profitabilitas Pesanan (Zero-Leakage) | `src/app/api/v1/orders/[id]/profit/route.ts`, `src/lib/domain/profit.ts` | `tests/unit/profit.test.ts`, `tests/integration/commission-and-profit.test.ts` | **Ada** | Super Admin only. |
| Biaya Ekstra Pesanan (`OrderCost`) | `src/app/api/v1/orders/[id]/costs/route.ts`, `[costId]/route.ts` | `tests/integration/commission-and-profit.test.ts` | **Ada** | Rekalkulasi otomatis laba & komisi. |
| Entri Komisi Sales & Skema Bertingkat | `src/app/api/v1/commission/entries/route.ts`, `tiers/route.ts` | `tests/unit/commission.test.ts`, `tests/integration/commission-and-profit.test.ts` | **Parsial** | **AUD-GAP-003 (S3)**: Tiers API belum ada pemanggil UI. **AUD-DUP-001 (S3)**: Duplikasi endpoint pay. |
| Laporan Margin & Profit Usaha | `src/app/api/v1/reports/margin/route.ts` | `tests/integration/reports-margin.test.ts` | **Ada** | Filter groupBy order/product/sales/biz. |
| Laporan Kinerja Sales & Target Bulanan | `src/app/api/v1/reports/sales-performance/route.ts`, `src/app/api/v1/sales/[id]/targets/[month]/route.ts` | `tests/integration/sales-evaluation.test.ts` | **Ada** | Target omzet & profit bulanan. |
| Laporan Umur Piutang (5 Aging Bucket) | `src/app/api/v1/reports/receivables-aging/route.ts`, `src/app/api/v1/receivables/route.ts` | `tests/integration/reminders-and-jobs.test.ts`, `tests/unit/receivable.test.ts` | **Ada** | Lulus verifikasi domain. |
| Laporan Pipeline CRM | `src/app/api/v1/reports/crm/route.ts` | `tests/integration/crm.test.ts` | **Ada** | Konversi & aktivitas. |
| Ekspor Laporan Excel XLSX & Formula Injection Protection | `src/app/api/v1/reports/export/route.ts` | `tests/integration/reports-export.test.ts` | **Ada** | Sanitasi awalan =, +, -, @. |

## 10. Integrasi Telegram & Background Jobs (pg-boss)

| Fitur Spesifikasi | Berkas Implementasi | Berkas Pengujian | Status | Catatan / Temuan |
|---|---|---|---|---|
| Kode Tautan Telegram Sekali Pakai | `src/app/api/v1/auth/telegram/link-code/route.ts`, `src/lib/telegram/bot.ts` | `tests/integration/telegram-bot.test.ts` | **Ada** | 8 karakter, rate-limit 5x/10 menit. |
| Autologin Mini App via HMAC initData | `src/app/api/v1/auth/telegram/route.ts` | `tests/integration/telegram-miniapp.test.ts` | **Ada** | Validasi HMAC token bot Telegram. |
| Notifikasi Telegram Persetujuan Invoice | `src/lib/services/notification.ts` | `tests/integration/telegram-bot.test.ts` | **Parsial** | **AUD-GAP-001 (S1)**: Tombol inline menautkan ke `/tg/approvals/:id` dan `/tg/payments` yang 404. |
| Job `telegram.send` | `src/worker/index.ts`, `src/lib/services/notification.ts` | `tests/integration/telegram-bot.test.ts` | **Ada** | Backoff eksponensial 5x retry. |
| Job `reminders.repeat.scan` (08:00 WIB) | `src/worker/index.ts`, `src/lib/services/reminder.ts` | `tests/integration/reminders-and-jobs.test.ts` | **Ada** | Notifikasi H-3, H-0, eskalasi >=3 hari. |
| Job `invoices.due.scan` (08:00 WIB) | `src/worker/index.ts`, `src/lib/services/reminder.ts` | `tests/integration/reminders-and-jobs.test.ts` | **Ada** | Notifikasi faktur jatuh tempo & ringkasan Senin. |
| Job `crm.tasks.scan` (08:00 WIB) | `src/worker/index.ts`, `src/lib/services/reminder.ts` | `tests/integration/reminders-and-jobs.test.ts` | **Ada** | Notifikasi tugas CRM hari ini. |
| Job `owner.digest` (08:00 WIB) | `src/worker/index.ts`, `src/lib/services/reminder.ts` | `tests/integration/reminders-and-jobs.test.ts` | **Ada** | Ringkasan pagi operasional Super Admin. |
| Job `housekeeping` (03:00 WIB) | `src/worker/index.ts`, `src/lib/services/reminder.ts` | `tests/integration/reminders-and-jobs.test.ts` | **Ada** | Pembersihan sesi, link code, login attempt. |

## 11. Pengujian E2E & Operasional Deployment

| Fitur Spesifikasi | Berkas Implementasi | Berkas Pengujian | Status | Catatan / Temuan |
|---|---|---|---|---|
| Suite Pengujian Playwright E2E | `playwright.config.ts` | `tests/e2e/*` | **Hilang** | **AUD-TEST-003 (S2)**: Direktori `tests/e2e` kosong, perintah `test:e2e` gagal. |
| Prosedur Cadangan (`backup.sh`) | `scripts/backup.sh` | `tests/integration/backup-restore.test.ts` | **Parsial** | Hanya diuji `fs.existsSync`, belum pernah dieksekusi dengan database sungguhan. |
| Prosedur Pemulihan (`restore.sh`) | `scripts/restore.sh` | `tests/integration/backup-restore.test.ts` | **Parsial** | Hanya diuji `fs.existsSync`, belum pernah dieksekusi dengan database sungguhan. |
| Multi-Stage Dockerfile Runner | `Dockerfile`, `docker-entrypoint.sh` | - | **Parsial** | **AUD-SPEC-006 (S1)**: Menjalankan `db push` bukan `migrate deploy`. |
