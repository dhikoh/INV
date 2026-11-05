#!/usr/bin/env python3
"""
OMNICAT ENTERPRISE - FINANCIAL CLEARANCE SERVICE TEST SUITE
Validates contribution margin calculations, freight subsidy isolation,
unhealthy margin threshold checks, and RBAC financial privacy protection.
"""

import os
import sys
import shutil
import unittest

WORKSPACE_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if WORKSPACE_ROOT not in sys.path:
    sys.path.insert(0, WORKSPACE_ROOT)

CANONICAL_DB_PATH = os.path.join(WORKSPACE_ROOT, "data", "omnicat_local.db")
TEST_DB_PATH = os.path.join(WORKSPACE_ROOT, "data", "test_clearance.db")

from backend.database import Database
from backend.models import CreateOrderInput, OrderItemInput, FinancialClearanceInput
from backend.services.invoicing_service import InvoicingService
from backend.services.financial_clearance_service import FinancialClearanceService

class TestFinancialClearanceService(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        if os.path.exists(TEST_DB_PATH):
            os.remove(TEST_DB_PATH)
        shutil.copyfile(CANONICAL_DB_PATH, TEST_DB_PATH)

        cls.db = Database(TEST_DB_PATH)
        cls.inv_service = InvoicingService(cls.db)
        cls.fin_service = FinancialClearanceService(cls.db)

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

    def test_01_healthy_clearance_calculation(self):
        """Verifies calculation of healthy margin order (>15%)."""
        # Create draft order: 100 sak 25L @ Rp 70,000 = Rp 7,000,000. Freight billed: Rp 500,000. Total: Rp 7,500,000
        order_input = CreateOrderInput(
            brand_id=self.brand_id,
            customer_id=self.customer_id,
            items=[OrderItemInput(variant_id=self.var_25l, quantity=100, unit_price=70000.0)],
            transport_fee_billed=500000.0,
            unloading_fee_billed=100000.0
        )
        draft = self.inv_service.create_draft_order(order_input, self.sales_id)

        # Actual freight cost from vendor: Rp 1,500,000
        clearance_in = FinancialClearanceInput(
            actual_freight_cost=1500000.0,
            actual_unloading_cost=100000.0
        )

        fin = self.fin_service.calculate_and_save_clearance(draft.id, clearance_in, self.finance_id)

        # 100 sak 25L COGS @ Rp 45,000 = Rp 4,500,000
        self.assertEqual(fin.total_cogs_amount, 4500000.0)
        # Net transport subsidy borne = 1,500,000 - 500,000 = Rp 1,000,000
        self.assertEqual(fin.net_transport_subsidy_borne, 1000000.0)
        # Net invoice = 7,000,000 + 500,000 + 100,000 = 7,600,000
        # CM = 7,600,000 - 4,500,000 (cogs) - 1,500,000 (freight) - 100,000 (unloading) = 1,500,000
        self.assertEqual(fin.contribution_margin_amount, 1500000.0)
        # Margin % = 1,500,000 / 7,600,000 = 19.74%
        self.assertEqual(fin.contribution_margin_percent, 19.74)
        self.assertTrue(fin.is_margin_healthy)
        self.assertFalse(fin.requires_superadmin_override)

    def test_02_unhealthy_margin_alert_and_override(self):
        """Verifies sub-15% margin triggers alert and requires override."""
        # Create draft order with low price @ Rp 55,000 (close to COGS Rp 45,000) and high transport
        order_input = CreateOrderInput(
            brand_id=self.brand_id,
            customer_id=self.customer_id,
            items=[OrderItemInput(variant_id=self.var_25l, quantity=100, unit_price=55000.0)],
            transport_fee_billed=200000.0,
            unloading_fee_billed=100000.0
        )
        draft = self.inv_service.create_draft_order(order_input, self.sales_id)

        # Actual freight: Rp 1,800,000 -> Net: 5,500,000 + 200,000 + 100,000 = 5,800,000
        # CM = 5,800,000 - 4,500,000 - 1,800,000 - 100,000 = -600,000 (Negative Margin!)
        clearance_in = FinancialClearanceInput(
            actual_freight_cost=1800000.0,
            actual_unloading_cost=100000.0
        )

        # Finance cannot clear negative or sub-threshold margin without override reason
        with self.assertRaises(PermissionError):
            self.fin_service.calculate_and_save_clearance(draft.id, clearance_in, self.finance_id)

        # Super Admin can clear with override reason
        clearance_with_reason = FinancialClearanceInput(
            actual_freight_cost=1800000.0,
            actual_unloading_cost=100000.0,
            override_reason="Strategic promotion for customer retention"
        )
        fin = self.fin_service.calculate_and_save_clearance(draft.id, clearance_with_reason, self.admin_id)

        self.assertFalse(fin.is_margin_healthy)
        self.assertTrue(fin.requires_superadmin_override)
        self.assertLess(fin.contribution_margin_percent, 15.0)

    def test_03_sales_role_strictly_forbidden_from_accessing_financials(self):
        """Verifies Sales user cannot access secret HPP and company margin."""
        # Pick any historical order
        conn = self.db.get_connection()
        cur = conn.cursor()
        cur.execute("SELECT id FROM orders LIMIT 1")
        sample_order_id = cur.fetchone()[0]
        conn.close()

        # Sales attempts to read financial clearance
        with self.assertRaises(PermissionError) as ctx:
            self.fin_service.get_order_financials(sample_order_id, self.sales_id)
        self.assertIn("Akses ditolak", str(ctx.exception))

    def test_04_regional_financial_summary_reports(self):
        """Verifies regional aggregates for management and finance."""
        summary = self.fin_service.get_regional_financial_summary(self.brand_id, self.admin_id)
        self.assertGreaterEqual(len(summary), 7)
        
        region_names = [s.region_name for s in summary]
        self.assertIn("SEMARANG", region_names)
        self.assertIn("CILACAP", region_names)
        self.assertIn("BOJONEGORO", region_names)

        # Total revenue across regional summary must match historical total
        total_rev = sum(s.total_revenue for s in summary)
        self.assertGreaterEqual(total_rev, 2990251489.0)

    def test_05_company_overall_summary(self):
        """Verifies overall company financial KPIs."""
        overall = self.fin_service.get_company_overall_summary(self.brand_id, self.finance_id)
        self.assertGreaterEqual(overall["total_revenue"], 2990251489.0)
        self.assertGreaterEqual(overall["total_orders"], 101)
        self.assertGreater(overall["overall_margin_percent"], 40.0)

if __name__ == "__main__":
    unittest.main(verbosity=2)
