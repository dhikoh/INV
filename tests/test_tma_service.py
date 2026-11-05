#!/usr/bin/env python3
"""
OMNICAT ENTERPRISE - TELEGRAM MINI APP (TMA) SERVICE TEST SUITE
Validates sales draft order creation, RBAC/brand authorization, batch offline sync,
and cryptographic/formatted WhatsApp deep-link generation.
"""

import os
import sys
import shutil
import unittest
from datetime import date

WORKSPACE_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if WORKSPACE_ROOT not in sys.path:
    sys.path.insert(0, WORKSPACE_ROOT)

CANONICAL_DB_PATH = os.path.join(WORKSPACE_ROOT, "data", "omnicat_local.db")
TEST_DB_PATH = os.path.join(WORKSPACE_ROOT, "data", "test_tma.db")

from backend.database import Database
from backend.models import (
    TokenClaims,
    TmaDraftItemInput,
    TmaDraftOrderInput,
    TmaDraftOrderResult,
    TmaBatchSyncResult
)
from backend.services.invoicing_service import InvoicingService
from backend.services.promotion_service import PromotionService
from backend.security.rbac_service import RbacService
from backend.services.tma_service import TmaService

class TestTmaService(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        if os.path.exists(TEST_DB_PATH):
            os.remove(TEST_DB_PATH)
        shutil.copyfile(CANONICAL_DB_PATH, TEST_DB_PATH)

        cls.db = Database(TEST_DB_PATH)
        cls.inv_service = InvoicingService(cls.db)
        cls.promo_service = PromotionService(cls.db)
        cls.rbac_service = RbacService(cls.db, jwt_secret="test-tma-enterprise-distribution-secret-key-2026")
        cls.tma_service = TmaService(
            database=cls.db,
            invoicing_service=cls.inv_service,
            promotion_service=cls.promo_service,
            rbac_service=cls.rbac_service
        )

        conn = cls.db.get_connection()
        cur = conn.cursor()

        # Fetch Sales user
        cur.execute("SELECT id FROM users WHERE role = 'SALES' LIMIT 1")
        cls.sales_id = cur.fetchone()["id"]

        # Fetch Super Admin user
        cur.execute("SELECT id FROM users WHERE role = 'SUPER_ADMIN' LIMIT 1")
        cls.admin_id = cur.fetchone()["id"]

        # Fetch BentoCat Brand & Tuban Customer
        cur.execute("SELECT id FROM brands WHERE code = 'BENTOCAT'")
        cls.bentocat_brand_id = cur.fetchone()["id"]

        cur.execute("SELECT id, name, phone FROM customers WHERE brand_id = ? LIMIT 1", (cls.bentocat_brand_id,))
        cls.customer = cur.fetchone()
        cls.cust_id = cls.customer["id"]

        conn.close()

        # Generate tokens
        cls.sales_token = cls.rbac_service.generate_token(cls.sales_id)
        cls.admin_token = cls.rbac_service.generate_token(cls.admin_id)

    @classmethod
    def tearDownClass(cls):
        if os.path.exists(TEST_DB_PATH):
            os.remove(TEST_DB_PATH)

    def test_01_create_tma_draft_order_success(self):
        """Tests successful submission of draft order from TMA field sales client."""
        draft_in = TmaDraftOrderInput(
            client_order_id="CLIENT-DRAFT-001",
            customer_id=self.cust_id,
            brand_id=self.bentocat_brand_id,
            items=[
                TmaDraftItemInput(variant_sku="BC-PRM-25L", quantity=40, unit_price=133500.0),
                TmaDraftItemInput(variant_sku="BC-PRM-10L", quantity=20, unit_price=58000.0)
            ],
            notes="Pesanan via Telegram Mini App Sales"
        )

        res = self.tma_service.create_tma_draft_order(self.sales_token, draft_in)

        self.assertIsInstance(res, TmaDraftOrderResult)
        self.assertEqual(res.client_order_id, "CLIENT-DRAFT-001")
        self.assertTrue(len(res.server_order_id) > 10)
        self.assertEqual(res.status, "PENDING_APPROVAL")
        self.assertTrue(res.is_synced)

        # Volume: (40 * 25) + (20 * 10) = 1,000 + 200 = 1,200 L
        self.assertEqual(res.total_volume_liters, 1200.0)
        # Gross: (40 * 133,500) + (20 * 58,000) = 5,340,000 + 1,160,000 = 6,500,000
        self.assertEqual(res.gross_subtotal_idr, 6500000.0)
        self.assertEqual(res.net_grand_total_idr, 6500000.0)

        # WhatsApp link verification
        self.assertIn("https://wa.me/", res.whatsapp_share_url)
        self.assertIn("FINDA%20FATIKASARI", res.whatsapp_share_url)
        self.assertIn("0902207846", res.whatsapp_share_url)

    def test_02_draft_order_atomic_sequence_untouched(self):
        """Verifies that creating a draft order does NOT increment customer doc sequence."""
        conn = self.db.get_connection()
        cur = conn.cursor()
        cur.execute("SELECT last_doc_number FROM customer_doc_sequences WHERE customer_id = ?", (self.cust_id,))
        seq_before = cur.fetchone()[0]

        draft_in = TmaDraftOrderInput(
            client_order_id="CLIENT-DRAFT-SEQ-CHECK",
            customer_id=self.cust_id,
            brand_id=self.bentocat_brand_id,
            items=[TmaDraftItemInput(variant_sku="BC-PRM-25L", quantity=10)]
        )
        res = self.tma_service.create_tma_draft_order(self.sales_token, draft_in)

        cur.execute("SELECT last_doc_number FROM customer_doc_sequences WHERE customer_id = ?", (self.cust_id,))
        seq_after = cur.fetchone()[0]

        # Verify doc number on order record is NULL
        cur.execute("SELECT doc_number, status FROM orders WHERE id = ?", (res.server_order_id,))
        order_row = cur.fetchone()
        conn.close()

        self.assertEqual(seq_before, seq_after, "Draft order must NOT advance doc sequence!")
        self.assertIsNone(order_row["doc_number"])
        self.assertEqual(order_row["status"], "PENDING_APPROVAL")

    def test_03_brand_tenancy_guard(self):
        """Tests that a sales user without access to a brand cannot create draft orders for it."""
        draft_in = TmaDraftOrderInput(
            client_order_id="CLIENT-DRAFT-UNAUTH",
            customer_id=self.cust_id,
            brand_id="unauthorized-brand-uuid-999",
            items=[TmaDraftItemInput(variant_sku="BC-PRM-25L", quantity=10)]
        )
        with self.assertRaises(PermissionError):
            self.tma_service.create_tma_draft_order(self.sales_token, draft_in)

    def test_04_batch_offline_queue_synchronization(self):
        """Tests syncing a batch of drafts created while mobile sales agent was offline."""
        queue = [
            # Item 1: Valid
            TmaDraftOrderInput(
                client_order_id="OFFLINE-001",
                customer_id=self.cust_id,
                brand_id=self.bentocat_brand_id,
                items=[TmaDraftItemInput(variant_sku="BC-PRM-25L", quantity=50)]
            ),
            # Item 2: Valid
            TmaDraftOrderInput(
                client_order_id="OFFLINE-002",
                customer_id=self.cust_id,
                brand_id=self.bentocat_brand_id,
                items=[TmaDraftItemInput(variant_sku="BC-PRM-10L", quantity=30)]
            ),
            # Item 3: Invalid SKU (should fail gracefully without crashing batch)
            TmaDraftOrderInput(
                client_order_id="OFFLINE-003",
                customer_id=self.cust_id,
                brand_id=self.bentocat_brand_id,
                items=[TmaDraftItemInput(variant_sku="NON-EXISTENT-SKU", quantity=10)]
            )
        ]

        batch_res = self.tma_service.sync_offline_draft_queue(self.sales_token, queue)

        self.assertIsInstance(batch_res, TmaBatchSyncResult)
        self.assertEqual(batch_res.total_submitted, 3)
        self.assertEqual(batch_res.synced_count, 2)
        self.assertEqual(batch_res.failed_count, 1)

        self.assertTrue(batch_res.results[0].is_synced)
        self.assertTrue(batch_res.results[1].is_synced)
        self.assertFalse(batch_res.results[2].is_synced)
        self.assertIn("tidak valid", batch_res.results[2].error_message.lower())

    def test_05_whatsapp_phone_number_formatting(self):
        """Tests that phone numbers are normalized to international 62 format."""
        url1 = self.tma_service.generate_whatsapp_order_summary(
            customer_name="Klinik Satwa",
            doctor_name="Drh. Budi",
            phone="0812-3456-7890",
            order_date="05/01/2026",
            items_summary=[{"name": "BentoCat 25L", "quantity": 10, "unit_price": 133500.0, "subtotal": 1335000.0}],
            total_volume=250.0,
            gross_subtotal=1335000.0,
            discount=0.0,
            net_grand_total=1335000.0
        )
        self.assertTrue(url1.startswith("https://wa.me/6281234567890?text="))

if __name__ == "__main__":
    unittest.main()
