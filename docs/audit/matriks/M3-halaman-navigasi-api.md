# Matriks M3: Halaman, Navigasi, dan API (Pages, Navigation & API Matrix)

Matriks pemetaan setiap halaman antarmuka pengguna (`page.tsx`), hak akses peran, tautan masuk (navigasi/tombol/bot), daftar API yang dipanggil, serta status validitas tautan.

Total Halaman UI: 39

| No | Path Rute UI | Berkas Halaman | Hak Akses | Tautan Masuk (Navigasi / Tombol) | API Endpoints Dipanggil | Status Tautan |
|---|---|---|---|---|---|---|
| 1 | `/approvals` | `(app)/approvals/page.tsx` | Super Admin | page.tsx, AppShell.tsx | - | **Valid & Terhubung** |
| 2 | `/approvals/[invoiceId]` | `(app)/approvals/[invoiceId]/page.tsx` | Super Admin | page.tsx | /api/v1/invoices/${invoiceId}<br>/api/v1/invoices/${invoiceId}/approve<br>/api/v1/invoices/${invoiceId}/reject | **Valid & Terhubung** |
| 3 | `/audit` | `(app)/audit/page.tsx` | Super Admin | AppShell.tsx | - | **Valid & Terhubung** |
| 4 | `/catalogs/new` | `(app)/catalogs/new/page.tsx` | Super Admin & Sales | page.tsx | /api/v1/catalog-presets<br>/api/v1/customers/${customerId}/min-prices<br>/api/v1/catalogs | **Valid & Terhubung** |
| 5 | `/catalogs` | `(app)/catalogs/page.tsx` | Super Admin & Sales | page.tsx, AppShell.tsx, OrderForm.tsx | - | **Valid & Terhubung** |
| 6 | `/catalogs/[id]` | `(app)/catalogs/[id]/page.tsx` | Super Admin & Sales | page.tsx, OrderForm.tsx | /api/v1/catalogs/${catalogId} | **Valid & Terhubung** |
| 7 | `/customers` | `(app)/customers/page.tsx` | Kondisional Role | page.tsx, AppShell.tsx, OrderForm.tsx | /api/v1/auth/me<br>/api/v1/users<br>/api/v1/customers | **Valid & Terhubung** |
| 8 | `/customers/[id]` | `(app)/customers/[id]/page.tsx` | Kondisional Role | page.tsx, OrderForm.tsx | /api/v1/auth/me<br>/api/v1/customers/${customerId}<br>/api/v1/customers/${customerId}/timeline | **Valid & Terhubung** |
| 9 | `/dashboard` | `(app)/dashboard/page.tsx` | Kondisional Role | page.tsx, AppShell.tsx | /api/v1/auth/me<br>/api/v1/business<br>/api/v1/dashboard | **Valid & Terhubung** |
| 10 | `/invoices` | `(app)/invoices/page.tsx` | Super Admin & Sales | page.tsx, AppShell.tsx | - | **Valid & Terhubung** |
| 11 | `/invoices/[id]` | `(app)/invoices/[id]/page.tsx` | Super Admin & Sales | page.tsx | /api/v1/invoices/${id}<br>/api/v1/invoices/${id}/void | **Valid & Terhubung** |
| 12 | `/orders/new` | `(app)/orders/new/page.tsx` | Super Admin & Sales | page.tsx | - | **Valid & Terhubung** |
| 13 | `/orders` | `(app)/orders/page.tsx` | Super Admin & Sales | page.tsx, AppShell.tsx, OrderForm.tsx | - | **Valid & Terhubung** |
| 14 | `/orders/[id]/edit` | `(app)/orders/[id]/edit/page.tsx` | Super Admin & Sales | page.tsx, OrderForm.tsx | /api/v1/orders/${id} | **Valid & Terhubung** |
| 15 | `/orders/[id]` | `(app)/orders/[id]/page.tsx` | Kondisional Role | page.tsx, OrderForm.tsx | /api/v1/orders/${id}<br>/api/v1/auth/me<br>/api/v1/orders/${id}/payments | **Valid & Terhubung** |
| 16 | `/payments` | `(app)/payments/page.tsx` | Super Admin & Sales | page.tsx, AppShell.tsx | /api/v1/payments | **Valid & Terhubung** |
| 17 | `/products` | `(app)/products/page.tsx` | Super Admin & Sales | page.tsx, AppShell.tsx, OrderForm.tsx | /api/v1/catalogs/from-products<br>/api/v1/auth/me<br>/api/v1/business | **Valid & Terhubung** |
| 18 | `/products/[id]/prices` | `(app)/products/[id]/prices/page.tsx` | Super Admin & Sales | page.tsx | /api/v1/auth/me<br>/api/v1/products/${productId}<br>/api/v1/products/${productId}/price-history | **Valid & Terhubung** |
| 19 | `/profile` | `(app)/profile/page.tsx` | Super Admin | page.tsx, AppShell.tsx | /api/v1/auth/me<br>/api/v1/business<br>/api/v1/auth/change-password | **Valid & Terhubung** |
| 20 | `/purchase-orders/new` | `(app)/purchase-orders/new/page.tsx` | Super Admin | page.tsx | /api/v1/purchase-orders | **Valid & Terhubung** |
| 21 | `/purchase-orders` | `(app)/purchase-orders/page.tsx` | Super Admin | page.tsx, AppShell.tsx | - | **Valid & Terhubung** |
| 22 | `/purchase-orders/[id]` | `(app)/purchase-orders/[id]/page.tsx` | Super Admin | page.tsx | /api/v1/purchase-orders/${id}<br>/api/v1/purchase-orders/${id}/order<br>/api/v1/purchase-orders/${id}/receive | **Valid & Terhubung** |
| 23 | `/receivables` | `(app)/receivables/page.tsx` | Super Admin & Sales | page.tsx, AppShell.tsx | - | **Valid & Terhubung** |
| 24 | `/reminders` | `(app)/reminders/page.tsx` | Super Admin & Sales | AppShell.tsx | /api/v1/reminders/${id} | **Valid & Terhubung** |
| 25 | `/reports/crm` | `(app)/reports/crm/page.tsx` | Kondisional Role | page.tsx, AppShell.tsx | /api/v1/auth/me<br>/api/v1/users | **Valid & Terhubung** |
| 26 | `/reports/margin` | `(app)/reports/margin/page.tsx` | Kondisional Role | page.tsx | /api/v1/auth/me<br>/api/v1/users | **Valid & Terhubung** |
| 27 | `/reports` | `(app)/reports/page.tsx` | Super Admin | page.tsx, AppShell.tsx | /api/v1/auth/me | **Valid & Terhubung** |
| 28 | `/sales` | `(app)/sales/page.tsx` | Super Admin | page.tsx, AppShell.tsx | /api/v1/auth/me | **Valid & Terhubung** |
| 29 | `/sales/[id]` | `(app)/sales/[id]/page.tsx` | Super Admin | page.tsx | /api/v1/auth/me<br>/api/v1/users | **Valid & Terhubung** |
| 30 | `/settings/business` | `(app)/settings/business/page.tsx` | Super Admin | page.tsx, AppShell.tsx | /api/v1/businesses<br>/api/v1/businesses/${id}<br>/api/v1/businesses/${selectedId} | **Valid & Terhubung** |
| 31 | `/settings/users` | `(app)/settings/users/page.tsx` | Kondisional Role | AppShell.tsx | /api/v1/users<br>/api/v1/businesses | **Valid & Terhubung** |
| 32 | `/stock` | `(app)/stock/page.tsx` | Super Admin | AppShell.tsx | /api/v1/categories<br>/api/v1/stock/adjust<br>/api/v1/stock/opname | **Valid & Terhubung** |
| 33 | `/updates` | `(app)/updates/page.tsx` | Super Admin & Sales | page.tsx, AppShell.tsx | /api/v1/updates/mark-seen<br>/api/v1/auth/me<br>/api/v1/updates | **Valid & Terhubung** |
| 34 | `/vendors` | `(app)/vendors/page.tsx` | Super Admin & Sales | page.tsx, AppShell.tsx | /api/v1/auth/me<br>/api/v1/business<br>/api/v1/vendors | **Valid & Terhubung** |
| 35 | `/vendors/[id]` | `(app)/vendors/[id]/page.tsx` | Super Admin & Sales | page.tsx | /api/v1/vendors/${id}/transactions<br>/api/v1/vendors/${id}/payments | **Valid & Terhubung** |
| 36 | `/login` | `(auth)/login/page.tsx` | Publik | page.tsx, AppShell.tsx | /api/v1/auth/login | **Valid & Terhubung** |
| 37 | `/offline` | `offline/page.tsx` | Publik (Offline) | OfflineBanner.tsx | - | **Valid & Terhubung** |
| 38 | `/page.tsx` | `page.tsx` | Super Admin & Sales | - | - | **Halaman Terisolasi** |
| 39 | `/tg` | `tg/page.tsx` | Super Admin & Sales | Telegram Bot Menu | /api/v1/auth/telegram | **Valid & Terhubung** |

## Temuan Tautan Mati & Halaman Hilang (M3 Dead Links & Missing Pages)

| URL Target yang Dibuat | Lokasi Pemanggil | Dampak | Status Temuan |
|---|---|---|---|
| `${env.APP_URL}/tg/approvals/${invoiceId}?reject=1` | `src/lib/services/notification.ts:125` | Tombol "Tolak" dari bot Telegram mengembalikan HTTP 404 | **AUD-GAP-001 (S1 Kritis)** |
| `${env.APP_URL}/tg/approvals/${invoiceId}` | `src/lib/services/notification.ts:127` | Tombol "Buka" dari bot Telegram mengembalikan HTTP 404 | **AUD-GAP-001 (S1 Kritis)** |
| `${env.APP_URL}/tg/payments` | `src/lib/services/notification.ts:154, 156` | Tombol "Buka" verifikasi pembayaran di Telegram 404 | **AUD-GAP-001 (S2 Tinggi)** |
