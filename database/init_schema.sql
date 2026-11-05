-- ============================================================================
-- OMNICAT ENTERPRISE DISTRIBUTION & INVOICING PLATFORM
-- Database: PostgreSQL 16
-- Schema Version: 2.1.0-AUDIT-ALIGNED
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

SET timezone = 'Asia/Jakarta';

-- ----------------------------------------------------------------------------
-- ENUMS
-- ----------------------------------------------------------------------------
DO $$ BEGIN
    CREATE TYPE user_role_enum AS ENUM ('SUPER_ADMIN', 'FINANCE', 'SALES', 'MANAGEMENT_VIEWER');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE order_status_enum AS ENUM (
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
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE payment_type_enum AS ENUM ('DP', 'PELUNASAN', 'FULL_PAYMENT');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE payment_status_enum AS ENUM ('UNPAID', 'PARTIAL_DP', 'PAID_LUNAS');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE churn_risk_enum AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CHURNED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE unit_type_enum AS ENUM ('LITER', 'KILOGRAM', 'SAK', 'PCS', 'TON');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE promo_type_enum AS ENUM ('PERCENTAGE_DISCOUNT', 'FIXED_DISCOUNT', 'FREE_TRANSPORT', 'SUBSIDIZED_TRANSPORT', 'FREE_GOODS');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- ----------------------------------------------------------------------------
-- 1. BRANDS & USER ACCESS CONTROL
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS brands (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(30) UNIQUE NOT NULL,
    name VARCHAR(150) NOT NULL,
    legal_entity_name VARCHAR(200) NOT NULL,
    address TEXT NOT NULL,
    phone VARCHAR(50),
    email VARCHAR(100),
    website VARCHAR(150),
    invoice_doc_prefix VARCHAR(30) DEFAULT 'RO',
    min_contribution_margin_percent NUMERIC(5,2) DEFAULT 15.00,
    is_tax_enabled BOOLEAN DEFAULT FALSE,
    tax_rate_percent NUMERIC(5,2) DEFAULT 11.00,
    logo_url TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS brand_bank_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    brand_id UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
    bank_name VARCHAR(50) NOT NULL,
    account_number VARCHAR(50) NOT NULL,
    account_holder_name VARCHAR(150) NOT NULL,
    is_primary BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(50) UNIQUE NOT NULL,
    full_name VARCHAR(150) NOT NULL,
    email VARCHAR(150) UNIQUE,
    phone_number VARCHAR(30),
    password_hash TEXT NOT NULL,
    role user_role_enum NOT NULL DEFAULT 'SALES',
    telegram_user_id BIGINT UNIQUE,
    telegram_chat_id BIGINT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_brand_access (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    brand_id UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
    can_approve_orders BOOLEAN DEFAULT FALSE,
    PRIMARY KEY (user_id, brand_id)
);

-- ----------------------------------------------------------------------------
-- 2. REGIONS, CLUSTERS & CUSTOMERS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS clusters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    description TEXT
);

CREATE TABLE IF NOT EXISTS regions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cluster_id UUID REFERENCES clusters(id) ON DELETE SET NULL,
    name VARCHAR(100) NOT NULL,
    province VARCHAR(100) NOT NULL,
    timezone VARCHAR(50) DEFAULT 'Asia/Jakarta',
    default_truck_capacity NUMERIC(12,2) DEFAULT 8000.0,
    default_truck_unit unit_type_enum DEFAULT 'LITER',
    standard_transport_subsidy NUMERIC(15,2) DEFAULT 850000.0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    brand_id UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
    region_id UUID NOT NULL REFERENCES regions(id),
    name VARCHAR(200) NOT NULL,
    owner_doctor_name VARCHAR(150),
    phone VARCHAR(50),
    shipping_address TEXT NOT NULL,
    assigned_sales_id UUID REFERENCES users(id) ON DELETE SET NULL,
    credit_limit_amount NUMERIC(15,2) DEFAULT 0,
    
    avg_order_interval_days NUMERIC(6,2) DEFAULT 0,
    median_order_interval_days NUMERIC(6,2) DEFAULT 0,
    avg_order_volume NUMERIC(12,2) DEFAULT 0,
    total_lifetime_orders INT DEFAULT 0,
    total_lifetime_revenue NUMERIC(18,2) DEFAULT 0,
    last_order_date DATE,
    predicted_next_order_date DATE,
    churn_risk churn_risk_enum DEFAULT 'LOW',
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (brand_id, name)
);

CREATE TABLE IF NOT EXISTS customer_doc_sequences (
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    brand_id UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
    last_doc_number INT NOT NULL DEFAULT 0,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (customer_id, brand_id)
);

-- ----------------------------------------------------------------------------
-- 3. PRODUCTS, HPP (COGS) & PROMOTIONS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    brand_id UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
    sku_prefix VARCHAR(20) NOT NULL,
    name VARCHAR(150) NOT NULL,
    category VARCHAR(50) NOT NULL,
    base_unit unit_type_enum NOT NULL DEFAULT 'LITER',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS product_variants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    sku VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    packaging_unit VARCHAR(20) NOT NULL,
    unit_multiplier NUMERIC(10,2) NOT NULL,
    weight_kg NUMERIC(10,2),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS product_cogs_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    variant_id UUID NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
    raw_material_cogs NUMERIC(15,2) NOT NULL,
    packaging_cogs NUMERIC(15,2) NOT NULL,
    labor_handling_cogs NUMERIC(15,2) NOT NULL DEFAULT 0,
    total_cogs_per_unit NUMERIC(15,2) GENERATED ALWAYS AS (
        raw_material_cogs + packaging_cogs + labor_handling_cogs
    ) STORED,
    effective_from DATE NOT NULL,
    effective_to DATE,
    created_by_user_id UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS price_tiers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    brand_id UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
    region_id UUID NOT NULL REFERENCES regions(id) ON DELETE CASCADE,
    variant_id UUID NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
    price_lama NUMERIC(15,2) NOT NULL,
    price_baru NUMERIC(15,2) NOT NULL,
    price_turun NUMERIC(15,2) NOT NULL,
    effective_from DATE NOT NULL,
    effective_to DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_price_order CHECK (price_turun <= price_baru)
);

CREATE TABLE IF NOT EXISTS promotions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    brand_id UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
    code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(150) NOT NULL,
    promo_type promo_type_enum NOT NULL,
    discount_percent NUMERIC(5,2) DEFAULT 0,
    discount_fixed_amount NUMERIC(15,2) DEFAULT 0,
    min_order_volume NUMERIC(12,2) DEFAULT 0,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    requires_admin_approval BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ----------------------------------------------------------------------------
-- 4. ORDERS & FINANCIAL CLEARANCE
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    brand_id UUID NOT NULL REFERENCES brands(id) ON DELETE RESTRICT,
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
    created_by_sales_id UUID NOT NULL REFERENCES users(id),
    parent_order_id UUID REFERENCES orders(id),
    
    doc_number INT,
    revision_number INT NOT NULL DEFAULT 0,
    order_date DATE NOT NULL,
    estimated_delivery_date DATE,
    actual_delivery_date DATE,
    status order_status_enum NOT NULL DEFAULT 'PENDING_APPROVAL',
    
    total_order_volume NUMERIC(12,2) NOT NULL DEFAULT 0,
    gross_product_subtotal NUMERIC(15,2) NOT NULL,
    promotion_id UUID REFERENCES promotions(id),
    discount_amount NUMERIC(15,2) DEFAULT 0,
    transport_fee_billed NUMERIC(15,2) DEFAULT 0,
    unloading_fee_billed NUMERIC(15,2) DEFAULT 0,
    tax_amount NUMERIC(15,2) DEFAULT 0,
    net_invoice_grand_total NUMERIC(15,2) NOT NULL,
    
    approved_by_admin_id UUID REFERENCES users(id),
    approved_at TIMESTAMP WITH TIME ZONE,
    rejection_reason TEXT,
    notes TEXT,
    legacy_doc_ref VARCHAR(100),
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_customer_approved_doc UNIQUE (customer_id, brand_id, doc_number, revision_number)
);

CREATE TABLE IF NOT EXISTS order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    variant_id UUID NOT NULL REFERENCES product_variants(id),
    quantity INT NOT NULL CHECK (quantity > 0),
    unit_price NUMERIC(15,2) NOT NULL,
    cogs_per_unit NUMERIC(15,2) NOT NULL,
    line_subtotal NUMERIC(15,2) NOT NULL,
    line_cogs_total NUMERIC(15,2) NOT NULL,
    line_contribution_margin NUMERIC(15,2) NOT NULL
);

-- Financial Clearance (Restricted to SUPER_ADMIN & FINANCE)
CREATE TABLE IF NOT EXISTS order_financials (
    order_id UUID PRIMARY KEY REFERENCES orders(id) ON DELETE CASCADE,
    total_cogs_amount NUMERIC(15,2) NOT NULL,
    actual_freight_cost NUMERIC(15,2) NOT NULL DEFAULT 0,
    actual_unloading_cost NUMERIC(15,2) NOT NULL DEFAULT 0,
    net_transport_subsidy_borne NUMERIC(15,2) NOT NULL,
    contribution_margin_amount NUMERIC(15,2) NOT NULL,
    contribution_margin_percent NUMERIC(5,2) NOT NULL,
    is_margin_healthy BOOLEAN NOT NULL DEFAULT TRUE
);

-- ----------------------------------------------------------------------------
-- 5. INVOICES & PAYMENTS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID UNIQUE NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
    invoice_number VARCHAR(100) UNIQUE NOT NULL,
    issue_date DATE NOT NULL,
    due_date DATE NOT NULL,
    total_amount NUMERIC(15,2) NOT NULL,
    amount_paid NUMERIC(15,2) NOT NULL DEFAULT 0,
    remaining_balance NUMERIC(15,2) GENERATED ALWAYS AS (total_amount - amount_paid) STORED,
    payment_status payment_status_enum NOT NULL DEFAULT 'UNPAID',
    pdf_storage_path TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    payment_type payment_type_enum NOT NULL,
    amount NUMERIC(15,2) NOT NULL CHECK (amount > 0),
    payment_date DATE NOT NULL,
    payment_method VARCHAR(50) DEFAULT 'BCA Transfer',
    proof_image_url TEXT,
    verified_by_user_id UUID REFERENCES users(id),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ----------------------------------------------------------------------------
-- 6. SALES CRM & FIELD ACTIVITY
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sales_activities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    sales_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    activity_type VARCHAR(50) NOT NULL CHECK (activity_type IN ('CALL', 'VISIT', 'WHATSAPP', 'SAMPLE_SENT', 'DEMO')),
    notes TEXT NOT NULL,
    follow_up_date DATE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sales_targets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sales_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    brand_id UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
    target_month VARCHAR(7) NOT NULL, -- Format: YYYY-MM
    target_volume_liters NUMERIC(15,2) NOT NULL,
    target_revenue_idr NUMERIC(15,2) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(sales_user_id, brand_id, target_month)
);

-- ----------------------------------------------------------------------------
-- 7. STORED PROCEDURES (ATOMIC SEQUENCE LOCK)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION lock_and_assign_doc_number(
    p_order_id UUID,
    p_admin_id UUID
) RETURNS INT AS $$
DECLARE
    v_customer_id UUID;
    v_brand_id UUID;
    v_next_doc INT;
BEGIN
    SELECT customer_id, brand_id INTO v_customer_id, v_brand_id
    FROM orders 
    WHERE id = p_order_id AND status = 'PENDING_APPROVAL';
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Order tidak ditemukan atau status bukan PENDING_APPROVAL';
    END IF;

    INSERT INTO customer_doc_sequences (customer_id, brand_id, last_doc_number, updated_at)
    VALUES (v_customer_id, v_brand_id, 1, NOW())
    ON CONFLICT (customer_id, brand_id)
    DO UPDATE SET 
        last_doc_number = customer_doc_sequences.last_doc_number + 1,
        updated_at = NOW()
    RETURNING last_doc_number INTO v_next_doc;

    UPDATE orders 
    SET 
        doc_number = v_next_doc,
        status = 'APPROVED',
        approved_by_admin_id = p_admin_id,
        approved_at = NOW(),
        updated_at = NOW()
    WHERE id = p_order_id;

    RETURN v_next_doc;
END;
$$ LANGUAGE plpgsql;

