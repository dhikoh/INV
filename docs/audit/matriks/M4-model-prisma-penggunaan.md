# Matriks M4: Model Prisma ke Penggunaan (Prisma Models Usage & Integrity Matrix)

Audit mendalam atas 40 model database Prisma ORM: analisis relasi, kebijakan onDelete, proteksi indeks multi-tenant, dan evaluasi kolom/enum tak terpakai.

Total Model: 40

| No | Nama Model | Jumlah Kolom | Relasi & onDelete Policy | Indeks & Unique Constraints | Status Penggunaan & Catatan |
|---|---|---|---|---|---|
| 1 | `Business` | 39 | - | - | Aktif di Service & API |
| 2 | `BankAccount` | 8 | DEFAULT (RESTRICT) | [businessId] | Aktif di Service & API |
| 3 | `User` | 23 | DEFAULT (RESTRICT) | [businessId] | Aktif di Service & API |
| 4 | `Session` | 11 | DEFAULT (RESTRICT) | [userId] | Aktif di Service & API |
| 5 | `LoginAttempt` | 5 | - | [username, createdAt]<br>[ip, createdAt] | Aktif di Service & API |
| 6 | `TelegramLinkCode` | 7 | DEFAULT (RESTRICT) | - | Aktif di Service & API |
| 7 | `Category` | 7 | DEFAULT (RESTRICT) | [businessId, name] | Aktif di Service & API |
| 8 | `Vendor` | 19 | DEFAULT (RESTRICT) | [businessId, code] | Aktif di Service & API |
| 9 | `Product` | 23 | DEFAULT (RESTRICT), DEFAULT (RESTRICT), DEFAULT (RESTRICT) | [businessId, isActive]<br>[businessId, sku] | Aktif di Service & API |
| 10 | `ProductImage` | 7 | DEFAULT (RESTRICT) | [businessId, productId] | Aktif di Service & API |
| 11 | `PriceHistory` | 10 | - | [businessId, productId, createdAt] | Aktif di Service & API |
| 12 | `Customer` | 27 | DEFAULT (RESTRICT), DEFAULT (RESTRICT) | [businessId, assignedSalesId]<br>[businessId, code] | Aktif di Service & API |
| 13 | `CustomerMinPrice` | 8 | DEFAULT (RESTRICT) | [businessId]<br>[customerId, productId] | Aktif di Service & API |
| 14 | `CustomerPromo` | 16 | DEFAULT (RESTRICT) | [businessId, customerId] | Aktif di Service & API |
| 15 | `CrmInteraction` | 10 | DEFAULT (RESTRICT) | [businessId, customerId, occurredAt] | Aktif di Service & API |
| 16 | `CrmTask` | 9 | DEFAULT (RESTRICT) | [businessId, assignedToId, dueAt] | Aktif di Service & API |
| 17 | `OwnerSalesNote` | 6 | - | [businessId, salesId] | Aktif di Service & API |
| 18 | `SalesTarget` | 6 | - | [salesId, month] | Aktif di Service & API |
| 19 | `CommissionTier` | 4 | - | [businessId, minAchievementBps] | Aktif di Service & API |
| 20 | `Order` | 37 | DEFAULT (RESTRICT), DEFAULT (RESTRICT) | [businessId, status]<br>[businessId, salesId, createdAt]<br>[businessId, orderNo]<br>[businessId, customerId, customerSeq] | Aktif di Service & API |
| 21 | `OrderItem` | 21 | DEFAULT (RESTRICT) | [businessId, orderId] | Aktif di Service & API |
| 22 | `OrderCost` | 7 | - | [businessId, orderId] | Aktif di Service & API |
| 23 | `Invoice` | 28 | DEFAULT (RESTRICT) | [businessId, status]<br>[orderId]<br>[businessId, number] | Aktif di Service & API |
| 24 | `Payment` | 19 | DEFAULT (RESTRICT) | [businessId, orderId]<br>[businessId, status] | Aktif di Service & API |
| 25 | `Shipment` | 18 | DEFAULT (RESTRICT) | - | Aktif di Service & API |
| 26 | `CreditNote` | 16 | DEFAULT (RESTRICT) | [businessId, orderId]<br>[businessId, number] | Aktif di Service & API |
| 27 | `CreditNoteItem` | 8 | DEFAULT (RESTRICT) | - | Aktif di Service & API |
| 28 | `CustomerCreditEntry` | 11 | DEFAULT (RESTRICT) | [businessId, customerId] | Aktif di Service & API |
| 29 | `PurchaseOrder` | 21 | DEFAULT (RESTRICT), DEFAULT (RESTRICT) | [businessId, vendorId]<br>[businessId, poNo] | Aktif di Service & API |
| 30 | `PurchaseOrderItem` | 8 | DEFAULT (RESTRICT) | - | Aktif di Service & API |
| 31 | `VendorPayment` | 13 | - | [businessId, vendorId] | Aktif di Service & API |
| 32 | `StockMovement` | 11 | - | [businessId, productId, createdAt] | Aktif di Service & API |
| 33 | `CommissionEntry` | 13 | - | [businessId, salesId, earnedAt] | Aktif di Service & API |
| 34 | `Reminder` | 15 | DEFAULT (RESTRICT) | [businessId, status, nextDueDate]<br>[customerId, productId] | Aktif di Service & API |
| 35 | `Notification` | 12 | - | [userId, createdAt] | Aktif di Service & API |
| 36 | `Catalog` | 11 | DEFAULT (RESTRICT) | [businessId, ownerId] | Aktif di Service & API |
| 37 | `CatalogItem` | 6 | DEFAULT (RESTRICT) | [catalogId, productId] | Aktif di Service & API |
| 38 | `DocumentCounter` | 5 | - | [businessId, scope, scopeId] | Aktif di Service & API |
| 39 | `AuditLog` | 13 | - | [businessId, entityType, entityId]<br>[createdAt] | Aktif di Service & API |
| 40 | `ReleaseNote` | 8 | - | - | Aktif di Service & API |

## Analisis Integritas & Anomali Skema (M4 Anomalies)

1. **Enum Tak Terpakai**:
   - `ShipMethod.TRANSPORT_VENDOR`: Dideklarasikan pada enum `ShipMethod` di `prisma/schema.prisma`, tetapi tidak pernah digunakan di seluruh kode sumber `src/` (UI dan service hanya memakai `OWN_FLEET` dan `EXPEDITION`).
2. **CHECK Constraints & Triggers Yang Tidak Bisa Diwakili Prisma**:
   - Terdapat 8 CHECK constraints integritas angka uang/kuantitas, 2 indeks unik bersyarat, dan 2 trigger imutabilitas/isolasi tenant yang berada di berkas migrasi SQL tetapi tidak dapat didefinisikan di `schema.prisma`. Hal ini memicu temuan kritis **AUD-SPEC-006 (S1)** karena eksekusi `prisma db push` pada container entrypoint mengabaikan seluruh migrasi SQL ini.
3. **Kebijakan onDelete Restrict**:
   - Seluruh relasi entitas bisnis inti (`Business`, `Customer`, `Order`, `Invoice`, `Payment`) menggunakan proteksi `RESTRICT` / `NoAction` yang sengaja mencegah penghapusan kaskade tak sengaja. Penghapusan data menggunakan pola soft-delete (`deletedAt: DateTime?`).
