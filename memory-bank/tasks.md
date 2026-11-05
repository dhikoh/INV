# Tasks: OmniCat Enterprise

## Single Sub-Task Protocol
- **Only ONE sub-task active at a time.**
- **No placeholder code permitted.**
- **Verify with tests/scripts before marking completed.**

---

### Phase 1: Release 1 (Core Money & Documents)

- [x] **Task 1: Database Architecture & Schema Initialization**
  - [x] **Sub-task 1.1**: Initialize local test database engine and execute DDL verification (`database/init_schema.sql` and SQLite adapter for instant local execution)
  - [x] **Sub-task 1.2**: Develop Python ETL & reconciliation pipeline (`scripts/etl_extract_and_migrate.py`) to parse all 180 PDFs/Excels and generate normalized dataset with 4 anomaly corrections
  - [x] **Sub-task 1.3**: Execute 100% mathematical reconciliation check to verify grand total Rp 2.990.251.489 and volume 684.540 Liters

- [x] **Task 2: Backend Core Services (Invoicing & Financial Clearance)**
  - [x] **Sub-task 2.1**: Implement `InvoicingService` with atomic sequence lock (`customer_doc_sequences`)
  - [x] **Sub-task 2.2**: Implement `FinancialClearanceService` (Gross Contribution Margin, HPP, real vs billed freight)
  - [x] **Sub-task 2.3**: Implement `PromotionService` (percentage discount, fixed discount, transport subsidy)
  - [x] **Sub-task 2.4**: Implement `PaymentService` (DP, Pelunasan, remaining balance, Aging AR)

- [x] **Task 3: Document Generation & Security**
  - [x] **Sub-task 3.1**: Build professional Invoice PDF template with QR verification link
  - [x] **Sub-task 3.2**: Setup RBAC middleware and authentication contracts

---

### Phase 2: Release 2 (Field Sales & CRM)

- [x] **Task 4: Sales CRM & Repeat Order Engine**
  - [x] **Sub-task 4.1**: Customer Health & Median Reorder Interval Engine (`backend/services/crm_service.py`)
  - [x] **Sub-task 4.2**: Sales Target Tracking & Activity Logger
- [ ] **Task 5: Telegram Mini App (TMA)**
  - [x] **Sub-task 5.1**: TMA Mobile Frontend (React/Tailwind)
  - [ ] **Sub-task 5.2**: TMA Draft Order Flow with offline sync & WhatsApp deep link
  - [ ] **Sub-task 5.3**: Delivery Slip (Surat Jalan) Generator

---

## Relevant Files
- `database/init_schema.sql`: Production PostgreSQL 16 DDL
- `database/sqlite_schema.sql`: Local development & test SQLite schema
- `scripts/etl_extract_and_migrate.py`: Historical data migration & anomaly resolution engine
- `data/migrated_omnicat_seed.json`: Cleaned historical dataset for OmniCat
- `memory-bank/*`: Project persistent memory files
