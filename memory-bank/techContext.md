# Technical Context: OmniCat Enterprise

## 1. Environment & Stack
- **Operating System:** Windows 10/11 Enterprise x64
- **Runtime & Tools:**
  - Node.js: v22.17.0 (Active LTS)
  - Python: 3.14.8 (ETL data extraction, PDF parsing, statistical analysis)
  - npm: 10.8.2
  - Git: Version controlled repository
- **Database:**
  - Production / Staging Target: PostgreSQL 16 (dengan ekstensi `pgcrypto`, `uuid-ossp`, RLS)
  - Local Verification / Test Harness: SQLite 3 / Emulated In-Memory PostgreSQL engine untuk verifikasi data instan
- **Backend Framework:**
  - Node.js (TypeScript + Fastify / Express) or Python (FastAPI + SQLAlchemy 2.0 / Pydantic v2)
  - Type-safe schema validation
- **Frontend / Mini App:**
  - Next.js 14 / React 18 + Tailwind CSS + Lucide Icons + Telegram WebApp SDK (`@twa-dev/sdk`)
- **Document Generation:**
  - Headless PDF engine (HTML to PDF / WeasyPrint / PDFKit) dengan QR Code SVG embed

## 2. Source Files & Data Assets in Workspace
- `BLITAR/`: 18 invoice PDF, 1 interval Excel (`History Blitar.xlsx`)
- `BOJONEGORO/`: 33 invoice PDF, 1 interval Excel (`History Bojonegoro.xlsx`)
- `CILACAP/`: 13 invoice PDF, 1 interval Excel (`History Transaksi Cilacap.xlsx`)
- `LAMONGAN/`: 5 invoice PDF, 1 interval Excel (`History Lamongan.xlsx`)
- `SEMARANG/`: 34 invoice PDF, 1 interval Excel (`Semarang.xlsx`)
- `TIMIKA/`: 4 invoice PDF, 1 interval Excel (`History Transaksi Timika.xlsx`)
- `TUBAN/`: 5 invoice PDF, 1 interval Excel (`History Tuban.xlsx`)
- `database/init_schema.sql`: Production DDL lengkap v2.1
- `Laporan Audit Rencana Aplikasi OmniCat.docx`: Dokumen audit tim eksternal

## 3. Technical Constraints & Security Guidelines
- Semua query mutasi nomor dokumen wajib thread-safe dan lock-protected.
- Endpoint finansial wajib memverifikasi JWT claims `role IN ('SUPER_ADMIN', 'FINANCE')`.
- API Telegram Mini App harus memvalidasi HMAC SHA-256 `initData` dari bot Telegram resmi.
- Tidak boleh ada data dummy dalam rekonsiliasi; angka 101 transaksi historis wajib mengunci nominal Rp 2.990.251.489.

