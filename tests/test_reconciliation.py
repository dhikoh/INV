#!/usr/bin/env python3
"""
OMNICAT ENTERPRISE - RECONCILIATION & DATA INTEGRITY TEST SUITE
Validates 100% mathematical accuracy, regional subtotal alignment,
foreign key relationships, and financial clearance invariants.
"""

import os
import sqlite3
import unittest

WORKSPACE_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB_PATH = os.path.join(WORKSPACE_ROOT, "data", "omnicat_local.db")

class TestOmniCatReconciliation(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        if not os.path.exists(DB_PATH):
            raise FileNotFoundError(f"Database file not found at {DB_PATH}. Run ETL script first.")
        cls.conn = sqlite3.connect(DB_PATH)
        cls.conn.execute("PRAGMA foreign_keys = ON;")
        cls.cur = cls.conn.cursor()

    @classmethod
    def tearDownClass(cls):
        cls.conn.close()

    def test_01_total_orders_and_revenue_exact_match(self):
        """Verifies exactly 101 active orders and Rp 2,990,251,489 grand total."""
        self.cur.execute("""
            SELECT count(*), sum(net_invoice_grand_total) 
            FROM orders 
            WHERE status != 'SKIPPED_AUDIT'
        """)
        count, total_revenue = self.cur.fetchone()
        self.assertEqual(count, 101, f"Expected 101 active orders, found {count}")
        self.assertEqual(total_revenue, 2990251489.0, f"Expected Rp 2,990,251,489, found Rp {total_revenue}")

    def test_02_regional_subtotals_exact_match(self):
        """Verifies each of the 7 regions matches the official audit benchmark."""
        expected_regional_totals = {
            "SEMARANG": (29, 921936801.0),
            "CILACAP": (28, 772398188.0),
            "BOJONEGORO": (15, 509340000.0),
            "TUBAN": (11, 367604625.0),
            "LAMONGAN": (11, 367262875.0),
            "TIMIKA": (5, 29904000.0),
            "BLITAR": (2, 21805000.0),
        }

        self.cur.execute("""
            SELECT r.name, count(o.id), sum(o.net_invoice_grand_total)
            FROM orders o
            JOIN customers c ON o.customer_id = c.id
            JOIN regions r ON c.region_id = r.id
            WHERE o.status != 'SKIPPED_AUDIT'
            GROUP BY r.name
        """)
        actual_totals = {row[0]: (row[1], row[2]) for row in self.cur.fetchall()}

        for reg, (exp_count, exp_rev) in expected_regional_totals.items():
            self.assertIn(reg, actual_totals, f"Region {reg} missing from database")
            act_count, act_rev = actual_totals[reg]
            self.assertEqual(act_count, exp_count, f"{reg}: Expected {exp_count} orders, got {act_count}")
            self.assertEqual(act_rev, exp_rev, f"{reg}: Expected Rp {exp_rev:,.0f}, got Rp {act_rev:,.0f}")

    def test_03_invoices_and_payments_reconciliation(self):
        """Verifies 100% of invoices reconcile with orders and payments."""
        # 1. Total invoices match total order revenue
        self.cur.execute("SELECT count(*), sum(total_amount), sum(remaining_balance) FROM invoices")
        inv_count, inv_total, rem_balance = self.cur.fetchone()
        self.assertEqual(inv_count, 101)
        self.assertEqual(inv_total, 2990251489.0)
        self.assertEqual(rem_balance, 0.0, "All historical invoices must have 0 remaining balance (LUNAS)")

        # 2. Total payments match total non-zero invoices
        self.cur.execute("SELECT count(*), sum(amount) FROM payments")
        pay_count, pay_total = self.cur.fetchone()
        self.assertEqual(pay_count, 100, "100 paid orders (Cilacap Dok 13 zero-dollar sample excluded from payments)")
        self.assertEqual(pay_total, 2990251489.0, f"Total payments must be Rp 2,990,251,489, got {pay_total}")

    def test_04_financial_clearance_margin_invariants(self):
        """Verifies that Laba Kontribusi Kotor mathematically satisfies the formula for every order."""
        self.cur.execute("""
            SELECT 
                o.id,
                o.net_invoice_grand_total,
                of.total_cogs_amount,
                of.actual_freight_cost,
                of.actual_unloading_cost,
                of.contribution_margin_amount,
                of.contribution_margin_percent
            FROM orders o
            JOIN order_financials of ON o.id = of.order_id
            WHERE o.status != 'SKIPPED_AUDIT'
        """)
        rows = self.cur.fetchall()
        self.assertEqual(len(rows), 101)

        for r in rows:
            order_id, net_inv, cogs, freight, unloading, cm_amount, cm_percent = r
            expected_cm = net_inv - cogs - freight - unloading
            self.assertAlmostEqual(
                cm_amount, expected_cm, places=2,
                msg=f"Order {order_id} margin mismatch: expected {expected_cm}, got {cm_amount}"
            )
            if net_inv > 0:
                expected_pct = round((cm_amount / net_inv) * 100.0, 2)
                self.assertAlmostEqual(cm_percent, expected_pct, places=2)

    def test_05_customer_sequence_counters(self):
        """Verifies customer_doc_sequences reflect the maximum doc_number issued per customer."""
        self.cur.execute("""
            SELECT cds.customer_id, cds.last_doc_number, max(o.doc_number)
            FROM customer_doc_sequences cds
            JOIN orders o ON cds.customer_id = o.customer_id
            GROUP BY cds.customer_id
        """)
        for cid, last_doc, max_doc in self.cur.fetchall():
            self.assertEqual(last_doc, max_doc, f"Customer {cid} sequence mismatch: {last_doc} vs {max_doc}")

    def test_06_semarang_dok_34_audit_gap(self):
        """Verifies Semarang Dok 34 is safely preserved as SKIPPED_AUDIT without orphan foreign keys."""
        self.cur.execute("SELECT status, net_invoice_grand_total FROM orders WHERE doc_number = 34")
        row = self.cur.fetchone()
        self.assertIsNotNone(row, "Dok 34 record must exist in orders")
        self.assertEqual(row[0], "SKIPPED_AUDIT")
        self.assertEqual(row[1], 0.0)

    def test_07_no_orphan_records(self):
        """Foreign key integrity check across all operational tables."""
        # Check order_items
        self.cur.execute("SELECT count(*) FROM order_items WHERE order_id NOT IN (SELECT id FROM orders)")
        self.assertEqual(self.cur.fetchone()[0], 0, "Found orphan order_items")

        # Check invoices
        self.cur.execute("SELECT count(*) FROM invoices WHERE order_id NOT IN (SELECT id FROM orders)")
        self.assertEqual(self.cur.fetchone()[0], 0, "Found orphan invoices")

        # Check payments
        self.cur.execute("SELECT count(*) FROM payments WHERE invoice_id NOT IN (SELECT id FROM invoices)")
        self.assertEqual(self.cur.fetchone()[0], 0, "Found orphan payments")

        # Check financials
        self.cur.execute("SELECT count(*) FROM order_financials WHERE order_id NOT IN (SELECT id FROM orders)")
        self.assertEqual(self.cur.fetchone()[0], 0, "Found orphan order_financials")

if __name__ == "__main__":
    unittest.main(verbosity=2)

