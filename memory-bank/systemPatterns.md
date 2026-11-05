# System Patterns: OmniCat Enterprise

## 1. Architectural Philosophy
OmniCat dibangun dengan arsitektur multi-tenant berbasis brand (`brand_id`) yang terisolasi namun efisien. Data historis BentoCat dan brand baru (seperti Zeolite Mojo) hidup dalam skema yang sama dengan pemisahan akses yang ketat via RBAC (`SUPER_ADMIN`, `FINANCE`, `SALES`, `MANAGEMENT_VIEWER`).

## 2. Key Technical Patterns

### A. Atomic Document Numbering (`customer_doc_sequences`)
Nomor invoice dihitung per-customer per-brand (`Dok 01`, `Dok 02`, dst.) menggunakan mekanisme PostgreSQL row-level lock (`SELECT ... FOR UPDATE` atau Stored Procedure `lock_and_assign_doc_number`) untuk mencegah nomor ganda (gap/race condition) saat concurrent requests:
```sql
SELECT current_seq + 1 FROM customer_doc_sequences 
WHERE customer_id = p_customer_id AND brand_id = p_brand_id 
FOR UPDATE;
```

### B. Isolated Financial Clearance (`order_financials`)
Data komersial publik (dilihat oleh sales dan customer di invoice) dipisahkan secara fisik dari data finansial rahasia:
- `orders`: Menyimpan `subtotal`, `discount_amount`, `transport_fee_billed`, `total_amount`.
- `order_financials`: Menyimpan `cogs_total` (HPP), `actual_freight_cost` (Vendor truk), `unloading_cost`, `gross_contribution_margin`, `margin_percentage`.
Tabel `order_financials` dilindungi RLS (Row Level Security) sehingga Sales dilarang melakukan `SELECT` pada tabel ini.

### C. Financial Formula Standard
- `Net Invoice` = `Subtotal Produk - Diskon Promo + Ongkir Ditagih (transport_fee_billed)`
- `Biaya Truk Riil` = `actual_freight_cost` (invoice dari vendor ekspedisi)
- `Subsidi Ongkir Riil` = $\max(0, \text{actual\_freight\_cost} - \text{transport\_fee\_billed})$
- `Laba Kontribusi Kotor` = $\text{Net Invoice} - \text{HPP Produk} - \text{Biaya Truk Riil} - \text{Biaya Bongkar}$

### D. Promotion Engine Hierarchy
1. Percentage Discount (`PERCENTAGE`): diskon $X\%$ dari subtotal produk.
2. Fixed Nominal Discount (`FIXED_AMOUNT`): potongan Rp $Y$ dari total order.
3. Transport Subsidy Promo (`TRANSPORT_SUBSIDY`): potongan ongkir hingga Rp $Z$.
4. Free Freight / Shared Freight (`SHARED_FREIGHT`): pembagian ongkir dengan alokasi rute estafet.

### E. AI Interoperability Pattern
Semua data analitik, riwayat harga per customer, profil brand, dan rekap keuangan diekspor ke schema JSON standar yang self-describing (`data/export_schemas/`), memungkinkan LLM eksternal (Gemini, Claude, GPT) membaca performa bisnis tanpa perlu query SQL langsung.

