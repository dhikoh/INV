#!/usr/bin/env python3
"""
OMNICAT ENTERPRISE - INVOICING SERVICE TEST SUITE
Validates draft order creation, permission enforcement,
atomic document sequencing, revision management, and concurrent approval safety.
"""

import os
import sys
import uuid
import shutil
import unittest
import concurrent.futures

WORKSPACE_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if WORKSPACE_ROOT not in sys.path:
    sys.path.insert(0, WORKSPACE_ROOT)

CANONICAL_DB_PATH = os.path.join(WORKSPACE_ROOT, "data", "omnicat_local.db")
TEST_DB_PATH = os.path.join(WORKSPACE_ROOT, "data", "test_invoicing.db")

from backend.database import Database
from backend.models import CreateOrderInput, OrderItemInput
from backend.services.invoicing_service import InvoicingService

class TestInvoicingService(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        # Create isolated test database clone
        if os.path.exists(TEST_DB_PATH):
            os.remove(TEST_DB_PATH)
        shutil.copyfile(CANONICAL_DB_PATH, TEST_DB_PATH)

        cls.db = Database(TEST_DB_PATH)
        cls.service = InvoicingService(cls.db)

        # Retrieve test IDs from database
        conn = cls.db.get_connection()
        cur = conn.cursor()
        
        # Brands
        cur.execute("SELECT id FROM brands WHERE code = 'BENTOCAT'")
        cls.brand_id = cur.fetchone()[0]

        # Users
        cur.execute("SELECT id FROM users WHERE role = 'SUPER_ADMIN'")
        cls.admin_id = cur.fetchone()[0]

        cur.execute("SELECT id FROM users WHERE role = 'SALES'")
        cls.sales_id = cur.fetchone()[0]

        # Customer: Bojonegoro (History had 15 orders, next must be 16)
        cur.execute("""
            SELECT c.id, c.name, cds.last_doc_number 
            FROM customers c
            JOIN customer_doc_sequences cds ON c.id = cds.customer_id
            JOIN regions r ON c.region_id = r.id
            WHERE r.name = 'BOJONEGORO'
        """)
        row = cur.fetchone()
        cls.customer_id = row[0]
        cls.initial_last_doc = row[2]

        # Product Variant 25L and 10L
        cur.execute("SELECT id FROM product_variants WHERE sku = 'BC-PRM-25L'")
        cls.var_25l = cur.fetchone()[0]

        cur.execute("SELECT id FROM product_variants WHERE sku = 'BC-PRM-10L'")
        cls.var_10l = cur.fetchone()[0]

        conn.close()

    @classmethod
    def tearDownClass(cls):
        if os.path.exists(TEST_DB_PATH):
            os.remove(TEST_DB_PATH)

    def test_01_create_draft_order(self):
        """Verifies creating a draft order with volume and subtotal calculations."""
        order_input = CreateOrderInput(
            brand_id=self.brand_id,
            customer_id=self.customer_id,
            items=[
                OrderItemInput(variant_id=self.var_25l, quantity=100, unit_price=69500.0),
                OrderItemInput(variant_id=self.var_10l, quantity=50, unit_price=35000.0)
            ],
            order_date="2026-11-10",
            transport_fee_billed=500000.0,
            unloading_fee_billed=150000.0,
            discount_amount=250000.0,
            notes="Pesanan uji coba draft sales"
        )

        order = self.service.create_draft_order(order_input, self.sales_id)

        self.assertIsNotNone(order.id)
        self.assertEqual(order.status, "PENDING_APPROVAL")
        self.assertIsNone(order.doc_number)
        self.assertEqual(order.revision_number, 0)
        # Expected volume: 100*25 + 50*10 = 2500 + 500 = 3000 Liters
        self.assertEqual(order.total_order_volume, 3000.0)
        # Expected subtotal: 100*69500 + 50*35000 = 6,950,000 + 1,750,000 = 8,700,000
        self.assertEqual(order.gross_product_subtotal, 8700000.0)
        # Expected net: 8,700,000 - 250,000 + 500,000 + 150,000 = 9,100,000
        self.assertEqual(order.net_invoice_grand_total, 9100000.0)
        self.assertEqual(len(order.items), 2)

    def test_02_approve_order_assigns_next_doc_and_creates_invoice(self):
        """Verifies atomic doc number assignment and invoice creation."""
        order_input = CreateOrderInput(
            brand_id=self.brand_id,
            customer_id=self.customer_id,
            items=[OrderItemInput(variant_id=self.var_25l, quantity=200, unit_price=69500.0)],
            order_date="2026-11-12"
        )
        order = self.service.create_draft_order(order_input, self.sales_id)

        # Approve as Admin
        result = self.service.approve_order(order.id, self.admin_id)

        expected_next_doc = self.initial_last_doc + 1
        self.assertEqual(result.doc_number, expected_next_doc)
        self.assertIn("BOJ", result.invoice_number)
        self.assertIn(f"{expected_next_doc:03d}", result.invoice_number)

        # Verify order in DB
        conn = self.db.get_connection()
        cur = conn.cursor()
        cur.execute("SELECT status, doc_number, approved_by_admin_id FROM orders WHERE id = ?", (order.id,))
        status, doc_num, approved_by = cur.fetchone()
        self.assertEqual(status, "APPROVED")
        self.assertEqual(doc_num, expected_next_doc)
        self.assertEqual(approved_by, self.admin_id)

        # Verify invoice in DB
        cur.execute("SELECT total_amount, payment_status FROM invoices WHERE id = ?", (result.invoice_id,))
        inv_total, pay_status = cur.fetchone()
        self.assertEqual(inv_total, 13900000.0)
        self.assertEqual(pay_status, "UNPAID")
        conn.close()

    def test_03_approve_permission_check(self):
        """Verifies non-admin users (SALES) cannot approve orders."""
        order_input = CreateOrderInput(
            brand_id=self.brand_id,
            customer_id=self.customer_id,
            items=[OrderItemInput(variant_id=self.var_25l, quantity=10, unit_price=69500.0)],
        )
        order = self.service.create_draft_order(order_input, self.sales_id)

        with self.assertRaises(PermissionError):
            self.service.approve_order(order.id, self.sales_id)

    def test_04_reject_order_sets_revision_requested(self):
        """Verifies rejecting an order records rejection reason."""
        order_input = CreateOrderInput(
            brand_id=self.brand_id,
            customer_id=self.customer_id,
            items=[OrderItemInput(variant_id=self.var_25l, quantity=10, unit_price=69500.0)],
        )
        order = self.service.create_draft_order(order_input, self.sales_id)

        self.service.reject_order(order.id, self.admin_id, "Harga satuan di bawah ketentuan")

        conn = self.db.get_connection()
        cur = conn.cursor()
        cur.execute("SELECT status, rejection_reason FROM orders WHERE id = ?", (order.id,))
        status, reason = cur.fetchone()
        conn.close()

        self.assertEqual(status, "REVISION_REQUESTED")
        self.assertEqual(reason, "Harga satuan di bawah ketentuan")

    def test_05_create_order_revision(self):
        """Verifies revision supersedes original order and preserves doc_number."""
        # 1. Create and approve base order
        order_input = CreateOrderInput(
            brand_id=self.brand_id,
            customer_id=self.customer_id,
            items=[OrderItemInput(variant_id=self.var_25l, quantity=50, unit_price=69500.0)],
            order_date="2026-11-15"
        )
        base_order = self.service.create_draft_order(order_input, self.sales_id)
        appr = self.service.approve_order(base_order.id, self.admin_id)

        # 2. Create revision (e.g. increase quantity to 60)
        rev_input = CreateOrderInput(
            brand_id=self.brand_id,
            customer_id=self.customer_id,
            items=[OrderItemInput(variant_id=self.var_25l, quantity=60, unit_price=69500.0)],
            order_date="2026-11-15"
        )
        rev_order = self.service.create_order_revision(base_order.id, rev_input, self.sales_id)

        self.assertEqual(rev_order.doc_number, appr.doc_number)
        self.assertEqual(rev_order.revision_number, 1)

        # Check DB status
        conn = self.db.get_connection()
        cur = conn.cursor()
        cur.execute("SELECT status FROM orders WHERE id = ?", (base_order.id,))
        self.assertEqual(cur.fetchone()[0], "SUPERSEDED")

        cur.execute("SELECT parent_order_id, doc_number, revision_number FROM orders WHERE id = ?", (rev_order.id,))
        parent_id, doc_no, rev_no = cur.fetchone()
        self.assertEqual(parent_id, base_order.id)
        self.assertEqual(doc_no, appr.doc_number)
        self.assertEqual(rev_no, 1)
        conn.close()

    def test_06_concurrent_approval_safety(self):
        """
        Concurrency test: Approves multiple orders simultaneously for the same customer.
        Verifies all assigned doc numbers are strictly unique and sequential with no race collisions.
        """
        num_threads = 5
        orders_to_approve = []

        # Create draft orders first
        for i in range(num_threads):
            inp = CreateOrderInput(
                brand_id=self.brand_id,
                customer_id=self.customer_id,
                items=[OrderItemInput(variant_id=self.var_25l, quantity=10, unit_price=69500.0)],
                order_date="2026-11-20"
            )
            ord_res = self.service.create_draft_order(inp, self.sales_id)
            orders_to_approve.append(ord_res.id)

        assigned_doc_numbers = []

        def approve_worker(ord_id):
            svc = InvoicingService(self.db)
            res = svc.approve_order(ord_id, self.admin_id)
            return res.doc_number

        with concurrent.futures.ThreadPoolExecutor(max_workers=num_threads) as executor:
            futures = [executor.submit(approve_worker, oid) for oid in orders_to_approve]
            for f in concurrent.futures.as_completed(futures):
                assigned_doc_numbers.append(f.result())

        # Verify uniqueness (no two orders got the same doc number)
        self.assertEqual(len(assigned_doc_numbers), len(set(assigned_doc_numbers)), "Race condition: duplicate doc numbers detected!")
        # Verify strictly sequential without gaps
        assigned_doc_numbers.sort()
        for idx in range(1, len(assigned_doc_numbers)):
            self.assertEqual(assigned_doc_numbers[idx], assigned_doc_numbers[idx-1] + 1, "Gap detected in concurrent doc number sequence!")

if __name__ == "__main__":
    unittest.main(verbosity=2)

