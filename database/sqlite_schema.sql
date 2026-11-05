-- ============================================================================
-- OMNICAT ENTERPRISE DISTRIBUTION & INVOICING PLATFORM
-- Database: SQLite 3.38+ (Local Development & Test Harness)
-- Schema Parity with PostgreSQL 16 (v2.1.0-AUDIT-ALIGNED)
-- ============================================================================

PRAGMA foreign_keys = ON;

-- 1. BRANDS & USER ACCESS CONTROL
CREATE TABLE IF NOT EXISTS brands (
    id TEXT PRIMARY KEY,
    code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    legal_entity_name TEXT NOT NULL,
    address TEXT NOT NULL,
    phone TEXT,
    email TEXT,
    website TEXT,
    invoice_doc_prefix TEXT DEFAULT 'RO',
    min_contribution_margin_percent REAL DEFAULT 15.00,
    is_tax_enabled INTEGER DEFAULT 0,
    tax_rate_percent REAL DEFAULT 11.00,
    logo_url TEXT,
    is_active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS brand_bank_accounts (
    id TEXT PRIMARY KEY,
    brand_id TEXT NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
    bank_name TEXT NOT NULL,
    account_number TEXT NOT NULL,
    account_holder_name TEXT NOT NULL,
    is_primary INTEGER DEFAULT 1,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    full_name TEXT NOT NULL,
    email TEXT UNIQUE,
    phone_number TEXT,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('SUPER_ADMIN', 'FINANCE', 'SALES', 'MANAGEMENT_VIEWER')) DEFAULT 'SALES',
    telegram_user_id INTEGER UNIQUE,
    telegram_chat_id INTEGER,
    is_active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_brand_access (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    brand_id TEXT NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
    can_approve_orders INTEGER DEFAULT 0,
    PRIMARY KEY (user_id, brand_id)
);

-- 2. REGIONS, CLUSTERS & CUSTOMERS
CREATE TABLE IF NOT EXISTS clusters (
    id TEXT PRIMARY KEY,
    code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    description TEXT
);

CREATE TABLE IF NOT EXISTS regions (
    id TEXT PRIMARY KEY,
    cluster_id TEXT REFERENCES clusters(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    province TEXT NOT NULL,
    timezone TEXT DEFAULT 'Asia/Jakarta',
    default_truck_capacity REAL DEFAULT 8000.0,
    default_truck_unit TEXT CHECK (default_truck_unit IN ('LITER', 'KILOGRAM', 'SAK', 'PCS', 'TON')) DEFAULT 'LITER',
    standard_transport_subsidy REAL DEFAULT 850000.0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS customers (
    id TEXT PRIMARY KEY,
    brand_id TEXT NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
    region_id TEXT NOT NULL REFERENCES regions(id),
    name TEXT NOT NULL,
    owner_doctor_name TEXT,
    phone TEXT,
    shipping_address TEXT NOT NULL,
    assigned_sales_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    credit_limit_amount REAL DEFAULT 0,
    
    avg_order_interval_days REAL DEFAULT 0,
    median_order_interval_days REAL DEFAULT 0,
    avg_order_volume REAL DEFAULT 0,
    total_lifetime_orders INTEGER DEFAULT 0,
    total_lifetime_revenue REAL DEFAULT 0,
    last_order_date TEXT,
    predicted_next_order_date TEXT,
    churn_risk TEXT CHECK (churn_risk IN ('LOW', 'MEDIUM', 'HIGH', 'CHURNED')) DEFAULT 'LOW',
    
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (brand_id, name)
);

CREATE TABLE IF NOT EXISTS customer_doc_sequences (
    customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    brand_id TEXT NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
    last_doc_number INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (customer_id, brand_id)
);

-- 3. PRODUCTS, HPP (COGS) & PROMOTIONS
CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY,
    brand_id TEXT NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
    sku_prefix TEXT NOT NULL,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    base_unit TEXT CHECK (base_unit IN ('LITER', 'KILOGRAM', 'SAK', 'PCS', 'TON')) NOT NULL DEFAULT 'LITER',
    is_active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS product_variants (
    id TEXT PRIMARY KEY,
    product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    sku TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    packaging_unit TEXT NOT NULL,
    unit_multiplier REAL NOT NULL,
    weight_kg REAL,
    is_active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS product_cogs_history (
    id TEXT PRIMARY KEY,
    variant_id TEXT NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
    raw_material_cogs REAL NOT NULL,
    packaging_cogs REAL NOT NULL,
    labor_handling_cogs REAL NOT NULL DEFAULT 0,
    total_cogs_per_unit REAL GENERATED ALWAYS AS (
        raw_material_cogs + packaging_cogs + labor_handling_cogs
    ) STORED,
    effective_from TEXT NOT NULL,
    effective_to TEXT,
    created_by_user_id TEXT REFERENCES users(id),
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS price_tiers (
    id TEXT PRIMARY KEY,
    brand_id TEXT NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
    region_id TEXT NOT NULL REFERENCES regions(id) ON DELETE CASCADE,
    variant_id TEXT NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
    price_lama REAL NOT NULL,
    price_baru REAL NOT NULL,
    price_turun REAL NOT NULL,
    effective_from TEXT NOT NULL,
    effective_to TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_price_order CHECK (price_turun <= price_baru)
);

CREATE TABLE IF NOT EXISTS promotions (
    id TEXT PRIMARY KEY,
    brand_id TEXT NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
    code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    promo_type TEXT NOT NULL CHECK (promo_type IN ('PERCENTAGE_DISCOUNT', 'FIXED_DISCOUNT', 'FREE_TRANSPORT', 'SUBSIDIZED_TRANSPORT', 'FREE_GOODS')),
    discount_percent REAL DEFAULT 0,
    discount_fixed_amount REAL DEFAULT 0,
    min_order_volume REAL DEFAULT 0,
    start_date TEXT NOT NULL,
    end_date TEXT NOT NULL,
    requires_admin_approval INTEGER DEFAULT 0,
    is_active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- 4. ORDERS & FINANCIAL CLEARANCE
CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    brand_id TEXT NOT NULL REFERENCES brands(id) ON DELETE RESTRICT,
    customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
    created_by_sales_id TEXT NOT NULL REFERENCES users(id),
    parent_order_id TEXT REFERENCES orders(id),
    
    doc_number INTEGER,
    revision_number INTEGER NOT NULL DEFAULT 0,
    order_date TEXT NOT NULL,
    estimated_delivery_date TEXT,
    actual_delivery_date TEXT,
    status TEXT NOT NULL CHECK (status IN (
        'DRAFT', 
        'PENDING_APPROVAL', 
        'REVISION_REQUESTED',
        'APPROVED', 
        'VOID', 
        'SUPERSEDED',
        'SKIPPED_AUDIT',
        'SHIPPED', 
        'COMPLETED', 
        'CANCELLED'
    )) DEFAULT 'PENDING_APPROVAL',
    
    total_order_volume REAL NOT NULL DEFAULT 0,
    gross_product_subtotal REAL NOT NULL,
    promotion_id TEXT REFERENCES promotions(id),
    discount_amount REAL DEFAULT 0,
    transport_fee_billed REAL DEFAULT 0,
    unloading_fee_billed REAL DEFAULT 0,
    tax_amount REAL DEFAULT 0,
    net_invoice_grand_total REAL NOT NULL,
    
    approved_by_admin_id TEXT REFERENCES users(id),
    approved_at TEXT,
    rejection_reason TEXT,
    notes TEXT,
    legacy_doc_ref TEXT,
    
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (customer_id, brand_id, doc_number, revision_number)
);

CREATE TABLE IF NOT EXISTS order_items (
    id TEXT PRIMARY KEY,
    order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    variant_id TEXT NOT NULL REFERENCES product_variants(id),
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    unit_price REAL NOT NULL,
    cogs_per_unit REAL NOT NULL,
    line_subtotal REAL NOT NULL,
    line_cogs_total REAL NOT NULL,
    line_contribution_margin REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS order_financials (
    order_id TEXT PRIMARY KEY REFERENCES orders(id) ON DELETE CASCADE,
    total_cogs_amount REAL NOT NULL,
    actual_freight_cost REAL NOT NULL DEFAULT 0,
    actual_unloading_cost REAL NOT NULL DEFAULT 0,
    net_transport_subsidy_borne REAL NOT NULL,
    contribution_margin_amount REAL NOT NULL,
    contribution_margin_percent REAL NOT NULL,
    is_margin_healthy INTEGER NOT NULL DEFAULT 1
);

-- 5. INVOICES & PAYMENTS
CREATE TABLE IF NOT EXISTS invoices (
    id TEXT PRIMARY KEY,
    order_id TEXT UNIQUE NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
    invoice_number TEXT UNIQUE NOT NULL,
    issue_date TEXT NOT NULL,
    due_date TEXT NOT NULL,
    total_amount REAL NOT NULL,
    amount_paid REAL NOT NULL DEFAULT 0,
    remaining_balance REAL GENERATED ALWAYS AS (total_amount - amount_paid) STORED,
    payment_status TEXT NOT NULL CHECK (payment_status IN ('UNPAID', 'PARTIAL_DP', 'PAID_LUNAS')) DEFAULT 'UNPAID',
    pdf_storage_path TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS payments (
    id TEXT PRIMARY KEY,
    invoice_id TEXT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    payment_type TEXT NOT NULL CHECK (payment_type IN ('DP', 'PELUNASAN', 'FULL_PAYMENT')),
    amount REAL NOT NULL CHECK (amount > 0),
    payment_date TEXT NOT NULL,
    payment_method TEXT DEFAULT 'BCA Transfer',
    proof_image_url TEXT,
    verified_by_user_id TEXT REFERENCES users(id),
    notes TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- 6. AUDIT TRAIL LOGS
CREATE TABLE IF NOT EXISTS audit_logs (
    id TEXT PRIMARY KEY,
    action TEXT NOT NULL,
    table_name TEXT NOT NULL,
    record_id TEXT NOT NULL,
    performed_by_user_id TEXT REFERENCES users(id),
    previous_state TEXT,
    new_state TEXT,
    ip_address TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

