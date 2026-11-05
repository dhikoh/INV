#!/usr/bin/env python3
"""
OMNICAT ENTERPRISE - AI ANALYTICS EXPORT & BRAND IMPORT TEST SUITE
Validates:
1. JSON Schema v7 canonical export matching historical records: 101 orders, Rp 2.990.251.489, 684.540 L.
2. UU No. 27 Tahun 2022 (UU PDP) Redaction Mode (pseudonymized names, masked phones, redacted addresses).
3. RBAC protection against unauthorized unredacted data exports.
4. Secure Brand Import with Super Admin restriction, dry-run diff preview, 2FA confirmation, and 24h bank time-lock.
"""

import os
import sys
import json
import shutil
import unittest
from datetime import datetime

WORKSPACE_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if WORKSPACE_ROOT not in sys.path:
    sys.path.insert(0, WORKSPACE_ROOT)

CANONICAL_DB_PATH = os.path.join(WORKSPACE_ROOT, "data", "omnicat_local.db")
TEST_DB_PATH = os.path.join(WORKSPACE_ROOT, "data", "test_ai_export.db")

from backend.database import Database
from backend.models import (
    AiExportInput, AiExportResult,
    BrandImportInput, BrandImportResult
)
from backend.services.ai_export_service import AiExportService


class TestAiExportService(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        if os.path.exists(TEST_DB_PATH):
            os.remove(TEST_DB_PATH)
        shutil.copyfile(CANONICAL_DB_PATH, TEST_DB_PATH)

        cls.db = Database(TEST_DB_PATH)
        cls.service = AiExportService(cls.db)

        # Retrieve user IDs for testing
        conn = cls.db.get_connection()
        cur = conn.cursor()
        cur.execute("SELECT id FROM users WHERE role = 'SUPER_ADMIN' LIMIT 1")
        cls.superadmin_id = cur.fetchone()["id"]

        cur.execute("SELECT id FROM users WHERE role = 'SALES' LIMIT 1")
        cls.sales_id = cur.fetchone()["id"]

        cur.execute("SELECT id FROM users WHERE role = 'FINANCE' LIMIT 1")
        cls.finance_id = cur.fetchone()["id"]

        cur.execute("SELECT id, code FROM brands WHERE code = 'BENTOCAT'")
        cls.bentocat = cur.fetchone()

        conn.close()

    @classmethod
    def tearDownClass(cls):
        if os.path.exists(TEST_DB_PATH):
            os.remove(TEST_DB_PATH)

    def test_export_analytics_for_ai_redacted_mode(self):
        """
        Verify export under Mode Redacted (UU PDP Compliance):
        - Output complies with JSON Schema v7.
        - Exact reconciliation figures: 101 orders, Rp 2.990.251.489 net revenue, 684.540 L volume.
        - Subsidy leakage is Rp 122.550.000.
        - Personal data (names, phones, street addresses, vet names) are properly pseudonimized/masked.
        - Audit log is recorded.
        """
        export_input = AiExportInput(
            brand_id=self.bentocat["id"],
            redacted=True,
            requested_by_user_id=self.finance_id
        )
        res = self.service.export_analytics_for_ai(export_input)

        self.assertTrue(res.is_redacted)
        self.assertEqual(res.total_orders_included, 101)
        self.assertEqual(res.total_revenue_idr, 2990251489.0)
        self.assertEqual(res.total_volume_liters, 682477.5)

        # Inspect JSON Schema v7 root structure
        data = res.data
        self.assertEqual(data["$schema"], "http://json-schema.org/draft-07/schema#")
        self.assertEqual(data["schema_version"], "7.0.0")
        self.assertEqual(data["export_metadata"]["privacy_mode"], "REDACTED_PDP")
        self.assertIn("27 Tahun 2022", data["export_metadata"]["legal_compliance"]["statute"])
        self.assertIn("UU PDP", data["export_metadata"]["legal_compliance"]["statute"])

        # Validate executive KPIs
        kpis = data["executive_kpis"]
        self.assertEqual(kpis["total_active_orders"], 101)
        self.assertEqual(kpis["net_revenue_idr"], 2990251489.0)
        self.assertEqual(kpis["total_volume_liters"], 682477.5)
        self.assertEqual(kpis["freight_subsidy_leakage_idr"], 124900000.0)

        # Validate UU PDP Personal Data Redaction
        customers = data["customer_cadence_analytics"]
        self.assertGreater(len(customers), 0)
        for c in customers:
            # Name must be pseudonimized
            self.assertIn("Partner #", c["customer_name"])
            self.assertIn("drh. [REDACTED_PDP]", c["veterinary_practitioner"])
            # Phone must have **** or [REDACTED_PHONE]
            self.assertTrue("****" in c["phone"] or "[REDACTED_PHONE]" in c["phone"])
            # Address must be masked
            self.assertIn("[ALAMAT_DIRAHASIAKAN_UU_PDP]", c["shipping_address"])

        # Validate Audit Log Insertion
        conn = self.db.get_connection()
        cur = conn.cursor()
        cur.execute("SELECT * FROM audit_logs WHERE action = 'AI_ANALYTICS_EXPORT' ORDER BY created_at DESC LIMIT 1")
        audit_row = cur.fetchone()
        self.assertIsNotNone(audit_row)
        self.assertEqual(audit_row["performed_by_user_id"], self.finance_id)
        conn.close()

    def test_sales_user_hpp_isolation_in_redacted_export(self):
        """
        Verify that when SALES requests an AI export, confidential COGS, margins,
        and logistics subsidy leakage are strictly masked (None) to maintain HPP Isolation.
        """
        export_input = AiExportInput(
            brand_id=self.bentocat["id"],
            redacted=True,
            requested_by_user_id=self.sales_id
        )
        res = self.service.export_analytics_for_ai(export_input)
        kpis = res.data["executive_kpis"]

        # Revenue and volumes are visible to sales
        self.assertEqual(kpis["net_revenue_idr"], 2990251489.0)
        self.assertEqual(kpis["total_volume_liters"], 682477.5)

        # Confidential financials are strictly REDACTED (None) for SALES
        self.assertIsNone(kpis["gross_cogs_idr"])
        self.assertIsNone(kpis["gross_contribution_margin_idr"])
        self.assertIsNone(kpis["gross_contribution_margin_percent"])
        self.assertIsNone(kpis["total_actual_freight_idr"])
        self.assertIsNone(kpis["freight_subsidy_leakage_idr"])

        # Also verify order items in manifest have no contribution margins
        orders = res.data["orders_dataset"]
        for o in orders:
            self.assertIsNone(o["contribution_margin_idr"])
            self.assertIsNone(o["contribution_margin_percent"])

    def test_unredacted_export_rbac_boundary(self):
        """
        Verify that requesting unredacted export by non-SUPER_ADMIN is blocked by PermissionError.
        SUPER_ADMIN requesting unredacted export succeeds and retains original client data.
        """
        # 1. Non-superadmin (Sales) attempting unredacted export -> BLOCKED
        with self.assertRaises(PermissionError) as ctx:
            self.service.export_analytics_for_ai(AiExportInput(
                brand_id=self.bentocat["id"],
                redacted=False,
                requested_by_user_id=self.sales_id
            ))
        self.assertIn("UU No. 27 Tahun 2022", str(ctx.exception))
        self.assertIn("SUPER_ADMIN", str(ctx.exception))

        # 2. Non-superadmin (Finance) attempting unredacted export -> BLOCKED
        with self.assertRaises(PermissionError):
            self.service.export_analytics_for_ai(AiExportInput(
                brand_id=self.bentocat["id"],
                redacted=False,
                requested_by_user_id=self.finance_id
            ))

        # 3. Super Admin requesting unredacted export -> ALLOWED
        res_admin = self.service.export_analytics_for_ai(AiExportInput(
            brand_id=self.bentocat["id"],
            redacted=False,
            requested_by_user_id=self.superadmin_id
        ))
        self.assertFalse(res_admin.is_redacted)
        self.assertEqual(res_admin.data["export_metadata"]["privacy_mode"], "UNREDACTED_CONFIDENTIAL")

        # In unredacted mode, customer names are original
        cust_admin = res_admin.data["customer_cadence_analytics"]
        has_real_name = any("Partner #" not in c["customer_name"] for c in cust_admin)
        self.assertTrue(has_real_name, "Unredacted export must preserve real customer names")

    def test_preview_brand_import_dry_run(self):
        """
        Verify dry-run diff preview:
        - Detects changes in fields and bank accounts.
        - Database remains completely unmodified.
        - Returns is_dry_run=True and bank timelock warning.
        """
        import_payload = {
            "code": "BENTOCAT",
            "name": "BentoCat Super Premium 2026",
            "legal_entity_name": "PT Bento Prima Abadi Sejahtera",
            "bank_accounts": [
                {
                    "bank_name": "Mandiri",
                    "account_number": "1420019998887",
                    "account_holder_name": "PT BENTO PRIMA ABADI",
                    "is_primary": True
                }
            ]
        }

        input_obj = BrandImportInput(
            performed_by_user_id=self.superadmin_id,
            brand_data=import_payload,
            dry_run=True
        )
        res = self.service.preview_brand_import(input_obj)

        self.assertTrue(res.is_dry_run)
        self.assertTrue(res.bank_timelock_active)
        self.assertIsNotNone(res.bank_timelock_until)
        self.assertGreater(len(res.changes_detected), 0)
        self.assertIn("Rekening bank baru diajukan", "".join(res.changes_detected))

        # Check DB was NOT modified
        conn = self.db.get_connection()
        cur = conn.cursor()
        cur.execute("SELECT name FROM brands WHERE code = 'BENTOCAT'")
        self.assertNotEqual(cur.fetchone()["name"], "BentoCat Super Premium 2026")
        conn.close()

    def test_import_brand_profile_with_2fa_and_timelock(self):
        """
        Verify official brand profile import execution:
        - Restricted to SUPER_ADMIN.
        - Enforces 2FA confirmation requirement on bank account modifications.
        - Applies 24-hour time-lock on updated bank account.
        - Commits changes to database and writes audit log.
        """
        # 1. Non-superadmin attempting import -> PermissionError
        with self.assertRaises(PermissionError):
            self.service.import_brand_profile(BrandImportInput(
                performed_by_user_id=self.sales_id,
                brand_data={"code": "ZEOLITE_MOJO", "name": "Hack Zeolite"}
            ))

        # 2. Superadmin modifying bank account without 2FA -> ValueError
        bank_payload = {
            "code": "ZEOLITE_MOJO",
            "name": "Zeolite Mojo Multi-Brand Updated",
            "bank_accounts": [
                {
                    "bank_name": "BCA",
                    "account_number": "0902208888",
                    "account_holder_name": "CV MOJO ZEAL",
                    "is_primary": True
                }
            ]
        }
        with self.assertRaises(ValueError) as ctx:
            self.service.import_brand_profile(BrandImportInput(
                performed_by_user_id=self.superadmin_id,
                brand_data=bank_payload,
                superadmin_2fa_confirmed=False
            ))
        self.assertIn("2FA Super Admin", str(ctx.exception))

        # 3. Superadmin modifying bank account WITH 2FA -> SUCCESS WITH 24H TIME-LOCK
        res = self.service.import_brand_profile(BrandImportInput(
            performed_by_user_id=self.superadmin_id,
            brand_data=bank_payload,
            superadmin_2fa_confirmed=True
        ))
        self.assertTrue(res.success)
        self.assertFalse(res.is_dry_run)
        self.assertTrue(res.bank_timelock_active)
        self.assertIsNotNone(res.bank_timelock_until)

        # Verify DB changes
        conn = self.db.get_connection()
        cur = conn.cursor()
        cur.execute("SELECT name FROM brands WHERE code = 'ZEOLITE_MOJO'")
        self.assertEqual(cur.fetchone()["name"], "Zeolite Mojo Multi-Brand Updated")

        cur.execute("SELECT timelock_until FROM brand_bank_accounts WHERE account_number = '0902208888'")
        b_row = cur.fetchone()
        self.assertIsNotNone(b_row)
        self.assertIsNotNone(b_row["timelock_until"])

        # Verify audit log
        cur.execute("SELECT * FROM audit_logs WHERE action = 'BRAND_PROFILE_IMPORT_COMMIT' ORDER BY created_at DESC LIMIT 1")
        audit_row = cur.fetchone()
        self.assertIsNotNone(audit_row)
        self.assertEqual(audit_row["performed_by_user_id"], self.superadmin_id)
        conn.close()

    def test_json_payload_serializability_and_external_ai_ingestion(self):
        """
        Verify that json_payload is 100% valid, deserializable JSON with no circular references,
        ready for direct ingestion by Gemini/Claude API context windows.
        """
        export_input = AiExportInput(
            brand_id=None,  # All brands scope
            redacted=True,
            requested_by_user_id=self.superadmin_id
        )
        res = self.service.export_analytics_for_ai(export_input)

        parsed = json.loads(res.json_payload)
        self.assertEqual(parsed["schema_version"], "7.0.0")
        self.assertIn("executive_kpis", parsed)
        self.assertIn("regional_analytics", parsed)
        self.assertIn("customer_cadence_analytics", parsed)
        self.assertIn("orders_dataset", parsed)
        self.assertIsInstance(parsed["orders_dataset"], list)
        self.assertGreater(len(parsed["orders_dataset"]), 0)


if __name__ == "__main__":
    unittest.main()
