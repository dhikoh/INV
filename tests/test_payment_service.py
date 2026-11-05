#!/usr/bin/env python3
"""
OMNICAT ENTERPRISE - PAYMENT SERVICE TEST SUITE
Validates Down Payment (DP), full settlement (Pelunasan), overpayment guards,
RBAC verification privileges, and Aging Accounts Receivable (AR) reports.
"""

import os
import sys
import shutil
import unittest
from datetime import date, timedelta

WORKSPACE_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if WORKSPACE_ROOT not in sys.path:
    sys.path.insert(0, WORKSPACE_ROOT)

CANONICAL_DB_PATH = os.path.join(WORKSPACE_ROOT, "data", "omnicat_local.db")
TEST_DB_PATH = os.path.join(WORKSPACE_ROOT, "data", "test_payment.db")

from backend.database import Database
from backend.models import CreateOrderInput, OrderItemInput, RecordPaymentInput
from backend.services.invoicing_service import InvoicingService
from backend.services.payment_service import PaymentService

class TestPaymentService(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        if os.path.exists(TEST_DB_PATH):
            os.remove(TEST_DB_PATH)
        shutil.copyfile(CANONICAL_DB_PATH, TEST_DB_PATH)

        cls.db = Database(TEST_DB_PATH)
        cls.inv_service = InvoicingService(cls.db)
        cls.pay_service = PaymentService(cls.db)

        conn = cls.db.get_connection()
        cur = conn.cursor()

        cur.execute("SELECT id FROM brands WHERE code = 'BENTOCAT'")
        cls.brand_id = cur.fetchone()[0]

        cur.execute("SELECT id FROM users WHERE role = 'SUPER_ADMIN'")
        cls.admin_id = cur.fetchone()[0]

        cur.execute("SELECT id FROM users WHERE role = 'FINANCE'")
        cls.finance_id = cur.fetchone()[0]

        cur.execute("SELECT id FROM users WHERE role = 'SALES'")
        cls.sales_id = cur.fetchone()[0]

        cur.execute("SELECT id FROM customers WHERE name LIKE '%Cherry%'")
        cls.customer_id = cur.fetchone()[0]

        cur.execute("SELECT id FROM product_variants WHERE sku = 'BC-PRM-25L'")
        cls.var_25l = cur.fetchone()[0]

        conn.close()

    @classmethod
    def tearDownClass(cls):
        if os.path.exists(TEST_DB_PATH):
            os.remove(TEST_DB_PATH)

    def test_01_dp_and_settlement_workflow(self):
        """Verifies full payment cycle: UNPAID -> PARTIAL_DP -> PAID_LUNAS."""
        # 1. Create & Approve Order (Total: Rp 14,000,000)
        order_input = CreateOrderInput(
            brand_id=self.brand_id,
            customer_id=self.customer_id,
            items=[OrderItemInput(variant_id=self.var_25l, quantity=200, unit_price=70000.0)],
            order_date="2026-11-20"
        )
        draft = self.inv_service.create_draft_order(order_input, self.sales_id)
        app_res = self.inv_service.approve_order(draft.id, self.admin_id)
        inv_id = app_res.invoice_id

        # 2. Record Down Payment: Rp 5,000,000
        dp_in = RecordPaymentInput(
            invoice_id=inv_id,
            payment_type="DP",
            amount=5000000.0,
            payment_date="2026-11-20",
            notes="Transfer DP BCA Finda"
        )
        dp_res = self.pay_service.record_payment(dp_in, self.finance_id)

        self.assertEqual(dp_res.remaining_invoice_balance, 9000000.0)
        self.assertEqual(dp_res.new_payment_status, "PARTIAL_DP")

        # 3. Record Pelunasan: Remaining Rp 9,000,000
        pelunasan_in = RecordPaymentInput(
            invoice_id=inv_id,
            payment_type="PELUNASAN",
            amount=9000000.0,
            payment_date="2026-11-25",
            notes="Pelunasan sisa tagihan barang siap kirim"
        )
        lunas_res = self.pay_service.record_payment(pelunasan_in, self.finance_id)

        self.assertEqual(lunas_res.remaining_invoice_balance, 0.0)
        self.assertEqual(lunas_res.new_payment_status, "PAID_LUNAS")

        # 4. Check payment history for invoice
        history = self.pay_service.get_invoice_payments(inv_id)
        self.assertEqual(len(history), 2)
        self.assertEqual(history[0].payment_type, "DP")
        self.assertEqual(history[1].payment_type, "PELUNASAN")

    def test_02_overpayment_guard_rejects_excess_amount(self):
        """Verifies overpayment guard prevents paying more than remaining balance."""
        order_input = CreateOrderInput(
            brand_id=self.brand_id,
            customer_id=self.customer_id,
            items=[OrderItemInput(variant_id=self.var_25l, quantity=100, unit_price=70000.0)],
            order_date="2026-11-21"
        )
        draft = self.inv_service.create_draft_order(order_input, self.sales_id)
        app_res = self.inv_service.approve_order(draft.id, self.admin_id)

        # Attempt to pay Rp 10,000,000 when total is Rp 7,000,000
        excess_in = RecordPaymentInput(
            invoice_id=app_res.invoice_id,
            payment_type="FULL_PAYMENT",
            amount=10000000.0
        )
        with self.assertRaises(ValueError) as ctx:
            self.pay_service.record_payment(excess_in, self.finance_id)
        self.assertIn("melebihi sisa tagihan", str(ctx.exception))

        # Settle invoice so it doesn't linger in subsequent AR test
        settle_in = RecordPaymentInput(
            invoice_id=app_res.invoice_id,
            payment_type="FULL_PAYMENT",
            amount=7000000.0
        )
        self.pay_service.record_payment(settle_in, self.finance_id)

    def test_03_payment_on_lunas_invoice_rejected(self):
        """Verifies cannot pay an already fully paid invoice."""
        order_input = CreateOrderInput(
            brand_id=self.brand_id,
            customer_id=self.customer_id,
            items=[OrderItemInput(variant_id=self.var_25l, quantity=50, unit_price=70000.0)],
            order_date="2026-11-22"
        )
        draft = self.inv_service.create_draft_order(order_input, self.sales_id)
        app_res = self.inv_service.approve_order(draft.id, self.admin_id)

        # Pay full amount Rp 3,500,000
        full_in = RecordPaymentInput(
            invoice_id=app_res.invoice_id,
            payment_type="FULL_PAYMENT",
            amount=3500000.0
        )
        self.pay_service.record_payment(full_in, self.finance_id)

        # Attempt another payment on lunas invoice
        another_in = RecordPaymentInput(
            invoice_id=app_res.invoice_id,
            payment_type="PELUNASAN",
            amount=500000.0
        )
        with self.assertRaises(ValueError) as ctx:
            self.pay_service.record_payment(another_in, self.finance_id)
        self.assertIn("sudah lunas sepenuhnya", str(ctx.exception))

    def test_04_sales_role_forbidden_from_recording_payment(self):
        """Verifies Sales role cannot record payments (Finance only)."""
        pay_in = RecordPaymentInput(
            invoice_id="dummy-id",
            payment_type="DP",
            amount=1000000.0
        )
        with self.assertRaises(PermissionError):
            self.pay_service.record_payment(pay_in, self.sales_id)

    def test_05_aging_ar_report_categorization(self):
        """Verifies accurate categorization of unpaid invoices into aging buckets."""
        today = date(2026, 12, 1)

        # Create 3 unpaid invoices with different due dates:
        # Inv 1: Due in future (2026-12-05) -> CURRENT
        # Inv 2: Due 10 days ago (2026-11-21) -> OVERDUE_1_15
        # Inv 3: Due 40 days ago (2026-10-22) -> OVERDUE_31_60
        orders_data = [
            ("2026-11-21", "2026-12-05", 50, 70000.0), # 3.5M CURRENT
            ("2026-11-07", "2026-11-21", 60, 70000.0), # 4.2M OVERDUE 1-15
            ("2026-10-08", "2026-10-22", 100, 70000.0), # 7.0M OVERDUE 31-60
        ]

        for o_date, d_date, qty, price in orders_data:
            inp = CreateOrderInput(
                brand_id=self.brand_id,
                customer_id=self.customer_id,
                items=[OrderItemInput(variant_id=self.var_25l, quantity=qty, unit_price=price)],
                order_date=o_date
            )
            d = self.inv_service.create_draft_order(inp, self.sales_id)
            app = self.inv_service.approve_order(d.id, self.admin_id)
            # Update due_date explicitly to test aging
            conn = self.db.get_connection()
            cur = conn.cursor()
            cur.execute("UPDATE invoices SET due_date = ? WHERE id = ?", (d_date, app.invoice_id))
            conn.commit()
            conn.close()

        # Run Aging AR report as of 2026-12-01
        report = self.pay_service.get_aging_ar_report(self.brand_id, as_of_date="2026-12-01")

        self.assertEqual(report.total_current, 3500000.0)
        self.assertEqual(report.total_overdue_1_15, 4200000.0)
        self.assertEqual(report.total_overdue_31_60, 7000000.0)
        self.assertEqual(report.total_outstanding_ar, 14700000.0)

        # Verify bucket labels
        buckets = [inv.bucket for inv in report.invoices if inv.total_amount in (3500000.0, 4200000.0, 7000000.0)]
        self.assertIn("CURRENT", buckets)
        self.assertIn("OVERDUE_1_15", buckets)
        self.assertIn("OVERDUE_31_60", buckets)

if __name__ == "__main__":
    unittest.main(verbosity=2)
