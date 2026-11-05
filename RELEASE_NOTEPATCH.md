# RELEASE NOTEPATCH & SPECIFICATION GUIDE (v2.0)
**Version:** `v2.0.0-PROPOSAL`  
**Modules:** Approval Engine, Financial Clearance, Sales CRM, AI Interoperability, Telegram Mini App  

---

## 1. Spesifikasi Fitur Utama

### A. Financial Clearance & Approval Workflow
* **Tujuan**: Mencegah kebocoran margin, memastikan subsidi ongkir rasional, dan memberikan transparansi laba bersih riil kepada Super Admin sebelum invoice resmi terbit.
* **Mekanisme**:
  1. Ketika Sales membuat draft pesanan di lapangan, status order masuk ke **`PENDING_APPROVAL`**.
  2. Super Admin menerima notifikasi instan di Telegram dan Dashboard Web:
     ```
     🔔 ORDER BARU MEMERLUKAN PERSETUJUAN
     Toko       : Cherry Petshop (Cilacap)
     Sales      : Budi Santoso
     Item       : 300 sak (25L) + 500 pcs (5.5L)
     Omset      : Rp 32.550.000
     HPP Barang : Rp 24.100.000
     Subsidi Trp: Rp 1.900.000
     ----------------------------------------
     ESTIMASI LABA KOTOR : Rp 6.550.000 (Margin 20.12%)
     Status Piutang Toko : Rp 0 (LUNAS)
     ----------------------------------------
     [ APPROVE & TERBITKAN ]  |  [ MINTA REVISI ]
     ```
  3. Setelah Admin klik **Approve**, sistem otomatis:
     - Mengunci nomor dokumen urut anti-lompat (contoh: Dok 29).
     - Menghasilkan PDF Invoice resmi ber-QR Code verifikasi.
     - Mengirim tautan download PDF ke chat Telegram Sales untuk dibagikan ke toko.

---

### B. Sales CRM & Peningkatan Penjualan
* **Tujuan**: Membantu sales mengelola hubungan pelanggan, memaksimalkan volume repeat order, dan mencegah hilangnya pelanggan (*churn*).
* **Fitur Utama**:
  1. **Customer Health & Reorder Prediction (Interval Engine)**:
     - Sistem memantau interval pembelian historis toko (contoh: Cherry Petshop pesan setiap ~61 hari).
     - **Indikator Kesehatan**:
       * 🟢 *Hijau (Healthy)*: Pesanan baru saja dikirim atau masih jauh dari siklus repeat order.
       * 🟡 *Kuning (Reorder Due)*: Masuk H-10 sebelum siklus rata-rata tiba (Waktunya sales follow-up!).
       * 🔴 *Merah (Overdue / At Risk)*: Melewati H+14 dari siklus tanpa ada order baru.
  2. **Activity Logger (Buku Catatan Sales Lapangan)**:
     - Sales dapat mencatat riwayat kunjungan toko, telepon, maupun chat WhatsApp.
     - Mencatat catatan khusus toko (contoh: *"Minta pengiriman hari Sabtu pagi karena toko sepi di jam kerja"*, *"Feedback: kemasan 5.5L lebih cepat habis dibanding 10L"*).
  3. **Sales Target & Pipeline Tracker**:
     - Memantau pencapaian target bulanan sales (target volume dalam Liter dan target omset dalam Rupiah) secara realtime.

---

### C. Standardisasi JSON Schema untuk Interoperabilitas AI Eksternal

Sistem menyediakan REST endpoint untuk mengekspor dan mengimpor data dalam format JSON standar (JSON Schema Draft-07) agar dapat langsung dianalisis oleh AI eksternal (Google Gemini, Claude, script Python Data Science):

#### 1. Schema Export/Import Profil Brand (`/api/brands/export-json`)
```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "BrandProfile",
  "type": "object",
  "properties": {
    "brand_code": { "type": "string", "example": "BENTOCAT" },
    "brand_name": { "type": "string", "example": "BentoCat Premium Cat Litter" },
    "legal_entity": { "type": "string", "example": "CV. Mojo Agung" },
    "bank_accounts": {
      "type": "array",
      "items": {
        "bank_name": { "type": "string", "example": "BCA" },
        "account_no": { "type": "string", "example": "0901422817" },
        "holder_name": { "type": "string", "example": "DHIKO HERLAMBANG" }
      }
    },
    "product_variants": {
      "type": "array",
      "items": {
        "sku": { "type": "string", "example": "BNT25" },
        "name": { "type": "string", "example": "Bentocat 25 L" },
        "volume_liters": { "type": "number", "example": 25.0 },
        "default_cogs": { "type": "number", "example": 54000.0 }
      }
    },
    "regional_pricing": {
      "type": "object",
      "additionalProperties": {
        "type": "object",
        "properties": {
          "harga_lama": { "type": "number" },
          "harga_baru": { "type": "number" },
          "harga_turun": { "type": "number" }
        }
      }
    }
  }
}
```

#### 2. Schema Export Laporan Analisis Lengkap untuk AI (`/api/analytics/export-ai-json`)
Mengekspor seluruh metrik yang dibutuhkan AI untuk melakukan *predictive modeling*, analisis churn, optimasi harga, dan audit finansial:
```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "ComprehensiveBusinessReportForAI",
  "type": "object",
  "properties": {
    "generated_at": { "type": "string", "format": "date-time" },
    "period_summary": {
      "total_gross_revenue": { "type": "number", "example": 2990251489 },
      "total_volume_liters": { "type": "number", "example": 684540 },
      "total_transport_subsidies": { "type": "number", "example": 122550000 },
      "total_net_profit_est": { "type": "number", "example": 612400000 },
      "net_margin_percent": { "type": "number", "example": 20.48 }
    },
    "customer_cadence_analytics": {
      "type": "array",
      "items": {
        "customer_id": { "type": "string" },
        "customer_name": { "type": "string" },
        "city": { "type": "string" },
        "total_orders": { "type": "integer" },
        "avg_interval_days": { "type": "number" },
        "avg_volume_per_order": { "type": "number" },
        "last_order_date": { "type": "string", "format": "date" },
        "days_since_last_order": { "type": "integer" },
        "predicted_next_order_date": { "type": "string", "format": "date" },
        "churn_risk_level": { "type": "string", "enum": ["LOW", "MEDIUM", "HIGH"] }
      }
    },
    "pricing_history_ledger": {
      "type": "array",
      "items": {
        "date": { "type": "string", "format": "date" },
        "variant": { "type": "string" },
        "city": { "type": "string" },
        "old_price": { "type": "number" },
        "new_price": { "type": "number" },
        "change_reason": { "type": "string" }
      }
    }
  }
}
```

---

### D. Fitur Export Katalog PDF Profesional
* **Standar Desain**:
  - Ukuran: A4 Landscape (untuk presentasi layar/tablet) & A4 Portrait (untuk cetak brosur fisik).
  - Mengikuti pedoman desain profesional (*Anti-Slop Standard*): Layout tipografi tegas, visual produk tajam, palet warna elegan (Charcoal & Warm Amber Gold untuk BentoCat, Soft Slate & Mineral Green untuk Zeolite).
* **Dua Mode Output**:
  1. **Katalog Display / Publik**: Berisi spesifikasi keunggulan pasir (daya gumpal instan, 99.9% dust free, kontrol bau amonia) tanpa mencantumkan harga (aman untuk promosi bebas).
  2. **Price Sheet / Order Sheet Resmi**: Dilengkapi tabel harga resmi per wilayah, ketentuan minimum order armada truk, dan rekening resmi pembayaran.

---

### E. Telegram Mini App (TMA) Experience

```
+------------------------------------------+
|  OmniCat Distribution  [Profile: BentoCat]|
+------------------------------------------+
| Halo, Budi (Sales)                       |
| Target Bulan Ini: 68% (5.400L / 8.000L)   |
+------------------------------------------+
| [!] 2 Toko Mendekati Jadwal Repeat Order: |
|  - Cherry Petshop (H-7) [Follow Up]      |
|  - Drh. Aulia (H-4)     [Follow Up]      |
+------------------------------------------+
| MENU CEPAT:                              |
|  [ + INPUT ORDER BARU ]                  |
|  [ 📄 KATALOG PRODUK PDF ]               |
|  [ 👥 DAFTAR TOKO SAYA ]                 |
|  [ 📊 HISTORY HARGA & PROMO ]            |
+------------------------------------------+
```
