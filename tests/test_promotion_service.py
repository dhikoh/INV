#!/usr/bin/env python3
"""
OMNICAT ENTERPRISE - PROMOTION SERVICE TEST SUITE
Validates percentage discounts, fixed vouchers, volume threshold gates,
freight subsidies, expired promo rejection, and order recalculation.
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
TEST_DB_PATH = os.path.join(WORKSPACE_ROOT, "data", "test_promo.db")

from backend.database import Database
from backend.models import CreatePromotionInput, CreateOrderInput, OrderItemInput
from backend.services.invoicing_service import InvoicingService
from backend.services.promotion_service import PromotionService

class TestPromotionService(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        if os.path.exists(TEST_DB_PATH):
            os.remove(TEST_DB_PATH)
        shutil.copyfile(CANONICAL_DB_PATH, TEST_DB_PATH)

        cls.db = Database(TEST_DB_PATH)
        cls.inv_service = InvoicingService(cls.db)
        cls.promo_service = PromotionService(cls.db)

        conn = cls.db.get_connection()
        cur = conn.cursor()

        cur.execute("SELECT id FROM brands WHERE code = 'BENTOCAT'")
        cls.brand_id = cur.fetchone()[0]

        cur.execute("SELECT id FROM users WHERE role = 'SUPER_ADMIN'")
        cls.admin_id = cur.fetchone()[0]

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

    def test_01_create_promotions(self):
        """Verifies creating multiple promo types."""
        today = date.today().isoformat()
        next_year = (date.today() + timedelta(days=365)).isoformat()

        # 1. Percentage promo: 2%
        p1 = CreatePromotionInput(
            brand_id=self.brand_id,
            code="DISKON2PCT",
            name="Diskon Khusus Pelanggan Setia 2%",
            promo_type="PERCENTAGE_DISCOUNT",
            discount_percent=2.0,
            start_date=today,
            end_date=next_year
        )
        res1 = self.promo_service.create_promotion(p1, self.admin_id)
        self.assertEqual(res1.code, "DISKON2PCT")

        # 2. Free transport on full truckload (min 8,000 L)
        p2 = CreatePromotionInput(
            brand_id=self.brand_id,
            code="FREETRUCK8K",
            name="Gratis Ongkir Muatan Penuh 8000L",
            promo_type="FREE_TRANSPORT",
            min_order_volume=8000.0,
            start_date=today,
            end_date=next_year
        )
        res2 = self.promo_service.create_promotion(p2, self.admin_id)
        self.assertEqual(res2.min_order_volume, 8000.0)

        # 3. Fixed transport subsidy: Rp 500,000
        p3 = CreatePromotionInput(
            brand_id=self.brand_id,
            code="SUBSIDI500K",
            name="Subsidi Ongkir Rp 500.000",
            promo_type="SUBSIDIZED_TRANSPORT",
            discount_fixed_amount=500000.0,
            start_date=today,
            end_date=next_year
        )
        res3 = self.promo_service.create_promotion(p3, self.admin_id)
        self.assertEqual(res3.discount_fixed_amount, 500000.0)

    def test_02_percentage_discount_calculation(self):
        """Verifies percentage discount calculation."""
        # 2% of Rp 28,905,000 is Rp 578,100 (exactly matching historical Cilacap Dok 13)
        res = self.promo_service.validate_promotion(
            promo_code="DISKON2PCT",
            brand_id=self.brand_id,
            order_volume=10250.0,
            gross_subtotal=28905000.0,
            transport_fee=1900000.0
        )
        self.assertTrue(res.is_valid)
        self.assertEqual(res.discount_amount, 578100.0)
        self.assertEqual(res.adjusted_transport_fee, 1900000.0)

    def test_03_free_transport_volume_threshold_gate(self):
        """Verifies minimum volume threshold enforcement."""
        # Volume 5,000 L < min 8,000 L -> Should be rejected
        res_fail = self.promo_service.validate_promotion(
            promo_code="FREETRUCK8K",
            brand_id=self.brand_id,
            order_volume=5000.0,
            gross_subtotal=14000000.0,
            transport_fee=1500000.0
        )
        self.assertFalse(res_fail.is_valid)
        self.assertIn("kurang dari syarat minimum", res_fail.rejection_reason)

        # Volume 8,000 L >= min 8,000 L -> Should be accepted with 0 transport fee
        res_pass = self.promo_service.validate_promotion(
            promo_code="FREETRUCK8K",
            brand_id=self.brand_id,
            order_volume=8000.0,
            gross_subtotal=22400000.0,
            transport_fee=1500000.0
        )
        self.assertTrue(res_pass.is_valid)
        self.assertEqual(res_pass.adjusted_transport_fee, 0.0)

    def test_04_transport_subsidy_discount(self):
        """Verifies transport fee reduction from voucher."""
        res = self.promo_service.validate_promotion(
            promo_code="SUBSIDI500K",
            brand_id=self.brand_id,
            order_volume=4000.0,
            gross_subtotal=11200000.0,
            transport_fee=1500000.0
        )
        self.assertTrue(res.is_valid)
        # 1,500,000 - 500,000 = 1,000,000
        self.assertEqual(res.adjusted_transport_fee, 1000000.0)

    def test_05_expired_promo_rejected(self):
        """Verifies expired promotion is rejected."""
        past_start = (date.today() - timedelta(days=60)).isoformat()
        past_end = (date.today() - timedelta(days=30)).isoformat()

        p_exp = CreatePromotionInput(
            brand_id=self.brand_id,
            code="EXPIREDPROMO",
            name="Promo Kadaluarsa",
            promo_type="FIXED_DISCOUNT",
            discount_fixed_amount=100000.0,
            start_date=past_start,
            end_date=past_end
        )
        self.promo_service.create_promotion(p_exp, self.admin_id)

        res = self.promo_service.validate_promotion(
            promo_code="EXPIREDPROMO",
            brand_id=self.brand_id,
            order_volume=4000.0,
            gross_subtotal=10000000.0,
            transport_fee=500000.0
        )
        self.assertFalse(res.is_valid)
        self.assertIn("telah berakhir", res.rejection_reason)

    def test_06_apply_promotion_to_order_updates_totals(self):
        """Verifies applying promo updates the order record and recalculates net grand total."""
        # Create draft order: 320 sak 25L @ Rp 70,000 = Rp 22,400,000. Transport: Rp 1,500,000. Unloading: Rp 100,000
        # Volume: 320 * 25 = 8,000 L
        order_input = CreateOrderInput(
            brand_id=self.brand_id,
            customer_id=self.customer_id,
            items=[OrderItemInput(variant_id=self.var_25l, quantity=320, unit_price=70000.0)],
            transport_fee_billed=1500000.0,
            unloading_fee_billed=100000.0
        )
        draft = self.inv_service.create_draft_order(order_input, self.sales_id)
        # Initial net total: 22,400,000 + 1,500,000 + 100,000 = 24,000,000
        self.assertEqual(draft.net_invoice_grand_total, 24000000.0)

        # Apply FREETRUCK8K
        app_res = self.promo_service.apply_promotion_to_order(draft.id, "FREETRUCK8K", self.sales_id)

        self.assertEqual(app_res["adjusted_transport_fee"], 0.0)
        # New net total: 22,400,000 (subtotal) - 0 (discount) + 0 (transport) + 100,000 (unloading) = 22,500,000
        self.assertEqual(app_res["net_invoice_grand_total"], 22500000.0)

        # Verify DB reflects changes
        conn = self.db.get_connection()
        cur = conn.cursor()
        cur.execute("SELECT transport_fee_billed, net_invoice_grand_total, promotion_id FROM orders WHERE id = ?", (draft.id,))
        t_fee, net_tot, promo_id = cur.fetchone()
        conn.close()

        self.assertEqual(t_fee, 0.0)
        self.assertEqual(net_tot, 22500000.0)
        self.assertIsNotNone(promo_id)

if __name__ == "__main__":
    unittest.main(verbosity=2)
