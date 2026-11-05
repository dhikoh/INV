#!/usr/bin/env python3
"""
OMNICAT ENTERPRISE - REST API ENDPOINT TESTS
Verifies FastAPI routes:
- Health check
- Dynamic customer & product listing
- Offline queue sync endpoint (POST /api/orders/sync)
- QR Invoice verification endpoint (/verify/{invoice_id})
- Authorization enforcement
"""

import os
import sys
import shutil
import unittest
from fastapi.testclient import TestClient

WORKSPACE_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if WORKSPACE_ROOT not in sys.path:
    sys.path.insert(0, WORKSPACE_ROOT)

CANONICAL_DB_PATH = os.path.join(WORKSPACE_ROOT, "data", "omnicat_local.db")
TEST_DB_PATH = os.path.join(WORKSPACE_ROOT, "data", "test_api_endpoints.db")

from backend.database import Database
from backend.security.rbac_service import RbacService

class TestApiEndpoints(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        if os.path.exists(TEST_DB_PATH):
            os.remove(TEST_DB_PATH)
        shutil.copyfile(CANONICAL_DB_PATH, TEST_DB_PATH)

        # Repoint backend singleton database to test db
        import backend.database as db_mod
        db_mod.db.db_path = TEST_DB_PATH

        from backend.main import app
        cls.client = TestClient(app)
        cls.rbac = RbacService(db_mod.db)

        conn = db_mod.db.get_connection()
        cur = conn.cursor()
        cur.execute("SELECT id FROM users WHERE role = 'SALES' LIMIT 1")
        cls.sales_id = cur.fetchone()[0]

        cur.execute("SELECT id FROM users WHERE role = 'FINANCE' LIMIT 1")
        cls.finance_id = cur.fetchone()[0]

        cur.execute("SELECT id, invoice_number FROM invoices LIMIT 1")
        inv_row = cur.fetchone()
        cls.sample_inv_id = inv_row[0]
        cls.sample_inv_num = inv_row[1]

        cur.execute("SELECT id FROM customers LIMIT 1")
        cls.sample_cust_id = cur.fetchone()[0]

        cur.execute("SELECT id FROM brands WHERE code = 'BENTOCAT'")
        cls.brand_id = cur.fetchone()[0]

        conn.close()

        cls.sales_token = cls.rbac.generate_token(cls.sales_id)
        cls.finance_token = cls.rbac.generate_token(cls.finance_id)

    @classmethod
    def tearDownClass(cls):
        import backend.database as db_mod
        db_mod.db.db_path = CANONICAL_DB_PATH
        if os.path.exists(TEST_DB_PATH):
            os.remove(TEST_DB_PATH)

    def test_01_health_check(self):
        """Verifies health check returns healthy status."""
        res = self.client.get("/api/health")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["status"], "healthy")

    def test_02_get_customers_with_auth(self):
        """Verifies GET /api/customers returns active customer records from database."""
        # Unauthenticated request -> 401
        res_unauth = self.client.get("/api/customers")
        self.assertEqual(res_unauth.status_code, 401)

        # Authenticated with sales token
        res = self.client.get("/api/customers", headers={"Authorization": f"Bearer {self.sales_token}"})
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertIn("customers", data)
        self.assertGreater(len(data["customers"]), 0)

    def test_03_get_products(self):
        """Verifies GET /api/products returns catalog with pricing."""
        res = self.client.get("/api/products")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertIn("products", data)
        skus = [p["sku"] for p in data["products"]]
        self.assertIn("BC-PRM-25L", skus)
        self.assertIn("ZEO-LITTER", skus)

    def test_04_sync_offline_drafts(self):
        """Verifies POST /api/orders/sync successfully processes offline orders."""
        payload = {
            "drafts": [
                {
                    "customer_id": self.sample_cust_id,
                    "brand_id": self.brand_id,
                    "client_order_id": "DFT-SYNC-TEST-001",
                    "items": [
                        {"variant_sku": "BC-PRM-25L", "quantity": 10}
                    ]
                }
            ]
        }
        res = self.client.post(
            "/api/orders/sync",
            json=payload,
            headers={"Authorization": f"Bearer {self.sales_token}"}
        )
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["status"], "success")
        self.assertEqual(data["synced_count"], 1)

    def test_05_qr_verification_endpoint(self):
        """Verifies GET /verify/{invoice_id} returns 200 HTML with verification details."""
        # Valid invoice ID
        res = self.client.get(f"/verify/{self.sample_inv_id}")
        self.assertEqual(res.status_code, 200)
        self.assertIn("Dokumen Resmi Terverifikasi", res.text)
        self.assertIn(self.sample_inv_num, res.text)

        # Invalid invoice ID -> 404 HTML
        res_404 = self.client.get("/verify/INVALID_INVOICE_XYZ")
        self.assertEqual(res_404.status_code, 404)
        self.assertIn("Invoice Tidak Ditemukan", res_404.text)

if __name__ == "__main__":
    unittest.main()
