#!/usr/bin/env python3
"""
OMNICAT ENTERPRISE - STANDALONE REPRODUCIBLE DB INITIALIZER
Reads database/sqlite_schema.sql and data/migrated_omnicat_seed.json,
and initializes data/omnicat_local.db cleanly in < 1 second.
Guarantees clean clone test reproducibility without external dependencies.
"""

import os
import sys
import json
import uuid
import sqlite3

WORKSPACE_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(WORKSPACE_ROOT, "data")
DB_PATH = os.path.join(DATA_DIR, "omnicat_local.db")
SEED_JSON_PATH = os.path.join(DATA_DIR, "migrated_omnicat_seed.json")
SQLITE_SCHEMA_PATH = os.path.join(WORKSPACE_ROOT, "database", "sqlite_schema.sql")

VARIANTS_COGS = {
    "BC-PRM-25L": {"raw": 33000.0, "pack": 7000.0, "labor": 5000.0},
    "BC-PRM-10L": {"raw": 13200.0, "pack": 4000.0, "labor": 2800.0},
    "BC-PRM-5.5L": {"raw": 7260.0, "pack": 2500.0, "labor": 1740.0},
    "ZEO-LITTER": {"raw": 18000.0, "pack": 4500.0, "labor": 2500.0}
}
USER_SUPERADMIN_ID = "10000000-0000-0000-0000-000000000001"

def init_database(db_target_path: str = DB_PATH):
    os.makedirs(os.path.dirname(db_target_path), exist_ok=True)
    if os.path.exists(db_target_path):
        os.remove(db_target_path)

    if not os.path.exists(SEED_JSON_PATH):
        raise FileNotFoundError(f"Seed file tidak ditemukan: {SEED_JSON_PATH}")

    with open(SEED_JSON_PATH, "r", encoding="utf-8") as f:
        dataset = json.load(f)

    with open(SQLITE_SCHEMA_PATH, "r", encoding="utf-8") as f:
        schema_sql = f.read()

    conn = sqlite3.connect(db_target_path)
    conn.execute("PRAGMA foreign_keys = ON;")
    conn.executescript(schema_sql)
    cursor = conn.cursor()

    # 1. Brands
    for b in dataset.get("brands", []):
        cursor.execute("""
            INSERT INTO brands (id, code, name, legal_entity_name, address, phone, invoice_doc_prefix, min_contribution_margin_percent, is_tax_enabled, tax_rate_percent, is_active)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (b["id"], b["code"], b["name"], b["legal_entity_name"], b["address"], b["phone"], b["invoice_doc_prefix"], b.get("min_contribution_margin_percent", 15.0), b.get("is_tax_enabled", 0), b.get("tax_rate_percent", 11.0), b.get("is_active", 1)))

    # 2. Bank Accounts
    for ba in dataset.get("brand_bank_accounts", []):
        cursor.execute("""
            INSERT INTO brand_bank_accounts (id, brand_id, bank_name, account_number, account_holder_name, is_primary)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (ba["id"], ba["brand_id"], ba["bank_name"], ba["account_number"], ba["account_holder_name"], ba["is_primary"]))

    # 3. Users
    for u in dataset.get("users", []):
        cursor.execute("""
            INSERT INTO users (id, username, full_name, role, password_hash)
            VALUES (?, ?, ?, ?, ?)
        """, (u["id"], u["username"], u["full_name"], u["role"], u["password_hash"]))

    # 4. User Brand Access
    for uba in dataset.get("user_brand_access", []):
        cursor.execute("""
            INSERT INTO user_brand_access (user_id, brand_id, can_approve_orders)
            VALUES (?, ?, ?)
        """, (uba["user_id"], uba["brand_id"], uba["can_approve_orders"]))

    # 5. Regions
    for r in dataset.get("regions", []):
        cursor.execute("""
            INSERT INTO regions (id, name, province, standard_transport_subsidy)
            VALUES (?, ?, ?, ?)
        """, (r["id"], r["name"], r["province"], r.get("standard_transport_subsidy", 0.0)))

    # 6. Customers
    for c in dataset.get("customers", []):
        cursor.execute("""
            INSERT INTO customers (id, brand_id, region_id, name, owner_doctor_name, phone, shipping_address, assigned_sales_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (c["id"], c["brand_id"], c["region_id"], c["name"], c.get("owner_doctor_name"), c.get("phone"), c.get("shipping_address"), c.get("assigned_sales_id")))

    # 7. Customer Doc Sequences
    for ds in dataset.get("customer_doc_sequences", []):
        cursor.execute("""
            INSERT INTO customer_doc_sequences (customer_id, brand_id, last_doc_number)
            VALUES (?, ?, ?)
        """, (ds["customer_id"], ds["brand_id"], ds["last_doc_number"]))

    # 8. Products
    for p in dataset.get("products", []):
        cursor.execute("""
            INSERT INTO products (id, brand_id, sku_prefix, name, category, base_unit)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (p["id"], p["brand_id"], p["sku_prefix"], p["name"], p["category"], p["base_unit"]))

    # 9. Product Variants
    for pv in dataset.get("product_variants", []):
        cursor.execute("""
            INSERT INTO product_variants (id, product_id, sku, name, packaging_unit, unit_multiplier)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (pv["id"], pv["product_id"], pv["sku"], pv["name"], pv["packaging_unit"], pv["unit_multiplier"]))

    # 10. Product COGS History
    cursor.execute("SELECT id, sku FROM product_variants")
    variant_rows = cursor.fetchall()
    for v_id, v_sku in variant_rows:
        cfg = VARIANTS_COGS.get(v_sku, {"raw": 33000.0, "pack": 7000.0, "labor": 5000.0})
        cursor.execute("""
            INSERT INTO product_cogs_history (
                id, variant_id, raw_material_cogs, packaging_cogs, labor_handling_cogs,
                effective_from, effective_to, created_by_user_id
            ) VALUES (?, ?, ?, ?, ?, '2023-01-01', NULL, ?)
        """, (str(uuid.uuid4()), v_id, cfg["raw"], cfg["pack"], cfg["labor"], USER_SUPERADMIN_ID))

    # 11. Orders
    for o in dataset.get("orders", []):
        cursor.execute("""
            INSERT INTO orders (
                id, brand_id, customer_id, created_by_sales_id, doc_number, revision_number,
                order_date, status, total_order_volume, gross_product_subtotal, discount_amount,
                transport_fee_billed, unloading_fee_billed, net_invoice_grand_total,
                approved_by_admin_id, legacy_doc_ref, notes
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            o["id"], o["brand_id"], o["customer_id"], o["created_by_sales_id"], o["doc_number"], o.get("revision_number", 0),
            o["order_date"], o["status"], o["total_order_volume"], o["gross_product_subtotal"], o.get("discount_amount", 0.0),
            o.get("transport_fee_billed", 0.0), o.get("unloading_fee_billed", 0.0), o["net_invoice_grand_total"],
            o.get("approved_by_admin_id"), o.get("legacy_doc_ref"), o.get("notes")
        ))

    # 12. Order Items
    for oi in dataset.get("order_items", []):
        cursor.execute("""
            INSERT INTO order_items (id, order_id, variant_id, quantity, unit_price, cogs_per_unit, line_subtotal, line_cogs_total, line_contribution_margin)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (oi["id"], oi["order_id"], oi["variant_id"], oi["quantity"], oi["unit_price"], oi["cogs_per_unit"], oi["line_subtotal"], oi["line_cogs_total"], oi["line_contribution_margin"]))

    # 13. Order Financials
    for of in dataset.get("order_financials", []):
        cursor.execute("""
            INSERT INTO order_financials (order_id, total_cogs_amount, actual_freight_cost, actual_unloading_cost, net_transport_subsidy_borne, contribution_margin_amount, contribution_margin_percent, is_margin_healthy)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (of["order_id"], of["total_cogs_amount"], of.get("actual_freight_cost", 0.0), of.get("actual_unloading_cost", 0.0), of["net_transport_subsidy_borne"], of["contribution_margin_amount"], of["contribution_margin_percent"], of["is_margin_healthy"]))

    # 14. Invoices
    for inv in dataset.get("invoices", []):
        cursor.execute("""
            INSERT INTO invoices (id, order_id, invoice_number, issue_date, due_date, total_amount, amount_paid, payment_status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (inv["id"], inv["order_id"], inv["invoice_number"], inv["issue_date"], inv["due_date"], inv["total_amount"], inv["amount_paid"], inv["payment_status"]))

    # 15. Payments
    for p in dataset.get("payments", []):
        cursor.execute("""
            INSERT INTO payments (id, invoice_id, payment_type, amount, payment_date, payment_method, verified_by_user_id, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (p["id"], p["invoice_id"], p["payment_type"], p["amount"], p["payment_date"], p.get("payment_method", "BCA Transfer"), p.get("verified_by_user_id"), p.get("notes")))

    # 16. Invoice Sequences (initialize per brand, region, year)
    cursor.execute("""
        SELECT o.brand_id, c.region_id, cast(strftime('%Y', inv.issue_date) as integer) as yr, inv.invoice_number
        FROM invoices inv
        JOIN orders o ON inv.order_id = o.id
        JOIN customers c ON o.customer_id = c.id
    """)
    seq_map = {}
    for b_id, r_id, yr, inv_no in cursor.fetchall():
        parts = inv_no.split("/")
        if parts and parts[-1].isdigit():
            num = int(parts[-1])
            key = (b_id, r_id, yr)
            seq_map[key] = max(seq_map.get(key, 0), num)

    for (b_id, r_id, yr), max_seq in seq_map.items():
        cursor.execute("""
            INSERT OR REPLACE INTO invoice_sequences (brand_id, region_id, year, last_invoice_seq, updated_at)
            VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
        """, (b_id, r_id, yr, max_seq))

    conn.commit()
    conn.close()
    print(f"[OK] Database cleanly initialized from seed: {db_target_path}")

if __name__ == "__main__":
    init_database()

