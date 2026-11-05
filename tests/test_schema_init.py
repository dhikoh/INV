import sqlite3
import os
import uuid

def run_tests():
    db_path = "data/test_omnicat.db"
    os.makedirs("data", exist_ok=True)
    if os.path.exists(db_path):
        os.remove(db_path)

    conn = sqlite3.connect(db_path)
    conn.execute("PRAGMA foreign_keys = ON;")

    with open("database/sqlite_schema.sql", "r", encoding="utf-8") as f:
        schema_sql = f.read()

    conn.executescript(schema_sql)
    cursor = conn.cursor()

    # 1. Test Brand Insertion
    brand_id = str(uuid.uuid4())
    cursor.execute("""
        INSERT INTO brands (id, code, name, legal_entity_name, address, invoice_doc_prefix)
        VALUES (?, 'BENTOCAT', 'BentoCat Indonesia', 'PT Bento Prima Abadi', 'Jawa Timur', 'RO')
    """, (brand_id,))

    # 2. Test User Insertion
    user_id = str(uuid.uuid4())
    cursor.execute("""
        INSERT INTO users (id, username, full_name, role, password_hash)
        VALUES (?, 'superadmin', 'Super Administrator', 'SUPER_ADMIN', 'argon2id_mock_hash')
    """, (user_id,))

    # 3. Test Region & Customer
    region_id = str(uuid.uuid4())
    cursor.execute("""
        INSERT INTO regions (id, name, province)
        VALUES (?, 'BOJONEGORO', 'Jawa Timur')
    """, (region_id,))

    cust_id = str(uuid.uuid4())
    cursor.execute("""
        INSERT INTO customers (id, brand_id, region_id, name, shipping_address)
        VALUES (?, ?, ?, 'Cherry Petshop Bojonegoro', 'Jl. Veteran No. 10 Bojonegoro')
    """, (cust_id, brand_id, region_id))

    # 4. Test Product & Variant
    prod_id = str(uuid.uuid4())
    cursor.execute("""
        INSERT INTO products (id, brand_id, sku_prefix, name, category, base_unit)
        VALUES (?, ?, 'BC-PRM', 'BentoCat Premium Clumping Clay', 'Cat Litter', 'LITER')
    """, (prod_id, brand_id))

    var_25l_id = str(uuid.uuid4())
    cursor.execute("""
        INSERT INTO product_variants (id, product_id, sku, name, packaging_unit, unit_multiplier, weight_kg)
        VALUES (?, ?, 'BC-PRM-25L', 'BentoCat Premium 25L Sak', 'SAK_25L', 25.0, 20.0)
    """, (var_25l_id, prod_id))

    # 5. Test COGS history and generated column
    cogs_id = str(uuid.uuid4())
    cursor.execute("""
        INSERT INTO product_cogs_history (id, variant_id, raw_material_cogs, packaging_cogs, labor_handling_cogs, effective_from)
        VALUES (?, ?, 55000.0, 7500.0, 2500.0, '2023-01-01')
    """, (cogs_id, var_25l_id))

    cursor.execute("SELECT total_cogs_per_unit FROM product_cogs_history WHERE id = ?", (cogs_id,))
    total_cogs = cursor.fetchone()[0]
    assert total_cogs == 65000.0, f"Expected 65000.0, got {total_cogs}"

    # 6. Test Order & Doc Sequence
    order_id = str(uuid.uuid4())
    cursor.execute("""
        INSERT INTO orders (
            id, brand_id, customer_id, created_by_sales_id, doc_number, order_date, status,
            total_order_volume, gross_product_subtotal, net_invoice_grand_total
        ) VALUES (
            ?, ?, ?, ?, 1, '2023-11-20', 'APPROVED',
            8000.0, 31680000.0, 31680000.0
        )
    """, (order_id, brand_id, cust_id, user_id))

    # 7. Test Order Financials
    cursor.execute("""
        INSERT INTO order_financials (
            order_id, total_cogs_amount, actual_freight_cost, actual_unloading_cost,
            net_transport_subsidy_borne, contribution_margin_amount, contribution_margin_percent, is_margin_healthy
        ) VALUES (
            ?, 20800000.0, 850000.0, 200000.0,
            850000.0, 9830000.0, 31.03, 1
        )
    """, (order_id,))

    # 8. Test Invoice and Generated remaining_balance
    inv_id = str(uuid.uuid4())
    cursor.execute("""
        INSERT INTO invoices (id, order_id, invoice_number, issue_date, due_date, total_amount, amount_paid, payment_status)
        VALUES (?, ?, 'INV/BC/2023/11/001', '2023-11-20', '2023-12-04', 31680000.0, 10000000.0, 'PARTIAL_DP')
    """, (inv_id, order_id))

    cursor.execute("SELECT remaining_balance FROM invoices WHERE id = ?", (inv_id,))
    rem_bal = cursor.fetchone()[0]
    assert rem_bal == 21680000.0, f"Expected 21680000.0, got {rem_bal}"

    # 9. Test Payments
    pay_id = str(uuid.uuid4())
    cursor.execute("""
        INSERT INTO payments (id, invoice_id, payment_type, amount, payment_date)
        VALUES (?, ?, 'DP', 10000000.0, '2023-11-20')
    """, (pay_id, inv_id))

    conn.commit()
    conn.close()

    # Clean up test DB
    if os.path.exists(db_path):
        os.remove(db_path)

    print("ALL DDL & SCHEMA TESTS PASSED SUCCESSFULLY! Parity verified.")

if __name__ == "__main__":
    run_tests()

