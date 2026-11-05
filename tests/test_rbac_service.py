#!/usr/bin/env python3
"""
OMNICAT ENTERPRISE - RBAC & AUTHENTICATION SERVICE TEST SUITE
Validates 4-role access control, brand tenant isolation, JWT claims & expiration,
and Telegram Mini App (TMA) HMAC-SHA256 cryptographic signature validation.
"""

import os
import sys
import time
import json
import hmac
import hashlib
import shutil
import unittest
import urllib.parse

WORKSPACE_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if WORKSPACE_ROOT not in sys.path:
    sys.path.insert(0, WORKSPACE_ROOT)

CANONICAL_DB_PATH = os.path.join(WORKSPACE_ROOT, "data", "omnicat_local.db")
TEST_DB_PATH = os.path.join(WORKSPACE_ROOT, "data", "test_rbac.db")

from backend.database import Database
from backend.models import TokenClaims, TelegramAuthResult
from backend.security.rbac_service import RbacService

class TestRbacService(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        if os.path.exists(TEST_DB_PATH):
            os.remove(TEST_DB_PATH)
        shutil.copyfile(CANONICAL_DB_PATH, TEST_DB_PATH)

        cls.db = Database(TEST_DB_PATH)
        cls.test_secret = "test-omnicat-secret-token-key-2026"
        cls.bot_token = "123456789:ABCdefGHIjklMNOpqrsTUVwxyz"
        cls.rbac = RbacService(database=cls.db, jwt_secret=cls.test_secret)

        conn = cls.db.get_connection()
        cur = conn.cursor()

        # Query existing users for testing
        cur.execute("SELECT id, username, role FROM users WHERE role = 'SUPER_ADMIN'")
        row = cur.fetchone()
        cls.admin_id = row["id"]
        cls.admin_username = row["username"]

        cur.execute("SELECT id, username, role FROM users WHERE role = 'FINANCE'")
        row = cur.fetchone()
        cls.finance_id = row["id"]
        cls.finance_username = row["username"]

        cur.execute("SELECT id, username, role FROM users WHERE role = 'SALES'")
        row = cur.fetchone()
        cls.sales_id = row["id"]
        cls.sales_username = row["username"]

        # Explicitly link sales user to known telegram_user_id for testing
        cur.execute("UPDATE users SET telegram_user_id = 987654321 WHERE id = ?", (cls.sales_id,))
        conn.commit()

        cur.execute("SELECT id FROM brands WHERE code = 'BENTOCAT'")
        cls.bentocat_brand_id = cur.fetchone()["id"]

        # Ensure a secondary brand exists for tenancy isolation test
        cur.execute("SELECT id FROM brands WHERE code = 'ZEOLITE_MOJO'")
        zeolite_row = cur.fetchone()
        if not zeolite_row:
            cur.execute("""
                INSERT INTO brands (id, name, code, is_active, created_at)
                VALUES ('brand_zeolite_test', 'Zeolite Mojo', 'ZEOLITE_MOJO', 1, CURRENT_TIMESTAMP)
            """)
            conn.commit()
            cls.zeolite_brand_id = "brand_zeolite_test"
        else:
            cls.zeolite_brand_id = zeolite_row["id"]

        conn.close()

    @classmethod
    def tearDownClass(cls):
        if os.path.exists(TEST_DB_PATH):
            os.remove(TEST_DB_PATH)

    def _create_telegram_init_data(self, user_dict: dict, bot_token: str, auth_date: int = None, tamper: bool = False) -> str:
        """Helper to forge a valid or tampered Telegram WebApp initData query string."""
        if auth_date is None:
            auth_date = int(time.time())

        params = {
            "auth_date": str(auth_date),
            "query_id": "AAHdF6IQAAAAAN0XohD1Z60c",
            "user": json.dumps(user_dict, separators=(",", ":"))
        }

        # Build data-check-string (alphabetical sort: k=v\n)
        data_check_string = "\n".join(f"{k}={v}" for k, v in sorted(params.items()))

        # Secret key = HMAC_SHA256(b"WebAppData", bot_token)
        secret_key = hmac.new(b"WebAppData", bot_token.encode("utf-8"), hashlib.sha256).digest()

        # Calculated hash
        calc_hash = hmac.new(secret_key, data_check_string.encode("utf-8"), hashlib.sha256).hexdigest()

        if tamper:
            # Tamper the query_id without recalculating hash
            params["query_id"] = "TAMPERED_INJECTED_VALUE"

        params["hash"] = calc_hash
        return urllib.parse.urlencode(params)

    def test_generate_and_verify_jwt_token(self):
        """Tests that a valid user token is generated and decoded back into TokenClaims."""
        token = self.rbac.generate_token(self.admin_id, expires_in_seconds=3600)
        self.assertIsInstance(token, str)
        self.assertTrue(len(token) > 20)

        claims = self.rbac.verify_token(token)
        self.assertIsInstance(claims, TokenClaims)
        self.assertEqual(claims.user_id, self.admin_id)
        self.assertEqual(claims.username, self.admin_username)
        self.assertEqual(claims.role, "SUPER_ADMIN")
        self.assertIn(self.bentocat_brand_id, claims.brand_access)
        self.assertTrue(claims.exp > time.time())

    def test_expired_token_raises_permission_error(self):
        """Tests that expired JWT tokens are immediately rejected with PermissionError."""
        # Negative expiry to immediately expire
        token = self.rbac.generate_token(self.sales_id, expires_in_seconds=-60)
        with self.assertRaises(PermissionError) as ctx:
            self.rbac.verify_token(token)
        self.assertIn("kadaluarsa", str(ctx.exception).lower())

    def test_invalid_signature_raises_permission_error(self):
        """Tests that forged or tampered JWT tokens raise PermissionError."""
        tampered_token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.invalidpayload.invalidsignature"
        with self.assertRaises(PermissionError):
            self.rbac.verify_token(tampered_token)

    def test_role_permissions_and_financial_data_protection(self):
        """Tests that Sales cannot view confidential COGS/HPP, whereas Finance/Admin can."""
        # 1. Admin Claims
        admin_token = self.rbac.generate_token(self.admin_id)
        admin_claims = self.rbac.verify_token(admin_token)
        self.assertTrue(self.rbac.can_view_financials(admin_claims))
        self.assertTrue(self.rbac.can_approve_orders(admin_claims, self.bentocat_brand_id))
        self.assertTrue(self.rbac.check_permission(admin_claims, ("SUPER_ADMIN", "FINANCE")))

        # 2. Finance Claims
        finance_token = self.rbac.generate_token(self.finance_id)
        finance_claims = self.rbac.verify_token(finance_token)
        self.assertTrue(self.rbac.can_view_financials(finance_claims))
        self.assertTrue(self.rbac.can_approve_orders(finance_claims, self.bentocat_brand_id))

        # 3. Sales Claims (Strictly blocked from COGS / clearance)
        sales_token = self.rbac.generate_token(self.sales_id)
        sales_claims = self.rbac.verify_token(sales_token)
        self.assertFalse(self.rbac.can_view_financials(sales_claims))
        self.assertFalse(self.rbac.can_approve_orders(sales_claims, self.bentocat_brand_id))

        with self.assertRaises(PermissionError) as ctx:
            self.rbac.check_permission(sales_claims, ("SUPER_ADMIN", "FINANCE"))
        self.assertIn("Akses ditolak", str(ctx.exception))

    def test_brand_tenancy_isolation(self):
        """Tests that user assigned strictly to BentoCat cannot operate in Zeolite Mojo tenant."""
        conn = self.db.get_connection()
        cur = conn.cursor()
        # Explicitly configure sales user with ONLY BentoCat access
        cur.execute("DELETE FROM user_brand_access WHERE user_id = ?", (self.sales_id,))
        cur.execute("INSERT INTO user_brand_access (user_id, brand_id) VALUES (?, ?)", (self.sales_id, self.bentocat_brand_id))
        conn.commit()
        conn.close()

        sales_token = self.rbac.generate_token(self.sales_id)
        sales_claims = self.rbac.verify_token(sales_token)

        # Accessing BentoCat -> Allowed
        self.assertTrue(self.rbac.check_brand_access(sales_claims, self.bentocat_brand_id))

        # Accessing Zeolite Mojo -> Rejected
        with self.assertRaises(PermissionError) as ctx:
            self.rbac.check_brand_access(sales_claims, self.zeolite_brand_id)
        self.assertIn("tidak memiliki akses ke brand profile", str(ctx.exception))

        # SUPER_ADMIN -> Allowed universally
        admin_token = self.rbac.generate_token(self.admin_id)
        admin_claims = self.rbac.verify_token(admin_token)
        self.assertTrue(self.rbac.check_brand_access(admin_claims, self.zeolite_brand_id))

    def test_telegram_init_data_validation(self):
        """Tests Telegram WebApp cryptographic HMAC-SHA256 signature verification."""
        tg_user = {
            "id": 987654321,
            "first_name": "Budi",
            "last_name": "Santoso",
            "username": "budisales"
        }

        # 1. Valid Signature
        valid_init_data = self._create_telegram_init_data(tg_user, self.bot_token)
        result = self.rbac.validate_telegram_init_data(valid_init_data, self.bot_token)
        self.assertTrue(result.is_valid, f"Validation failed: {result.rejection_reason}")
        self.assertIsNotNone(result.token)
        self.assertEqual(result.role, "SALES")

        # 2. Tampered Payload (Data modified after hashing)
        tampered_init_data = self._create_telegram_init_data(tg_user, self.bot_token, tamper=True)
        tampered_result = self.rbac.validate_telegram_init_data(tampered_init_data, self.bot_token)
        self.assertFalse(tampered_result.is_valid)
        self.assertIn("tidak valid", tampered_result.rejection_reason.lower())

        # 3. Expired Auth Date (> 24 hours ago)
        expired_date = int(time.time()) - 100000
        expired_init_data = self._create_telegram_init_data(tg_user, self.bot_token, auth_date=expired_date)
        expired_result = self.rbac.validate_telegram_init_data(expired_init_data, self.bot_token)
        self.assertFalse(expired_result.is_valid)
        self.assertIn("kadaluarsa", expired_result.rejection_reason.lower())

        # 4. Empty or Missing Hash
        empty_result = self.rbac.validate_telegram_init_data("", self.bot_token)
        self.assertFalse(empty_result.is_valid)

        no_hash_result = self.rbac.validate_telegram_init_data("auth_date=12345&user={}", self.bot_token)
        self.assertFalse(no_hash_result.is_valid)

        # 5. Unknown Telegram User (Security Check: Not registered in OmniCat -> Strictly Rejected)
        unknown_tg_user = {"id": 1122334455, "username": "unregistered_stranger"}
        unknown_init_data = self._create_telegram_init_data(unknown_tg_user, self.bot_token)
        unknown_res = self.rbac.validate_telegram_init_data(unknown_init_data, self.bot_token)
        self.assertFalse(unknown_res.is_valid)
        self.assertIn("belum terdaftar", unknown_res.rejection_reason)

if __name__ == "__main__":
    unittest.main()

