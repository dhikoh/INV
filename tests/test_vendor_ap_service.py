#!/usr/bin/env python3
"""
OMNICAT ENTERPRISE - VENDOR AP & SHARED FREIGHT ALLOCATION TEST SUITE
Validates vendor creation, vendor invoice recording, proportional shared freight
allocation across customer orders, automatic order_financials margin recalculation,
and payment settlement with anti-overpayment guards.
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
TEST_DB_PATH = os.path.join(WORKSPACE_ROOT, "data", "test_vendor_ap.db")

from backend.database import Database
from backend.models import (
    VendorInput,
    VendorInvoiceInput,
    VendorPaymentInput,
    VendorApSummary
)
from backend.services.vendor_ap_service import VendorApService

class TestVendorApService(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        if os.path.exists(TEST_DB_PATH):
            os.remove(TEST_DB_PATH)
        shutil.copyfile(CANONICAL_DB_PATH, TEST_DB_PATH)

        cls.db = Database(TEST_DB_PATH)
        cls.ap_service = VendorApService(cls.db)

        conn = cls.db.get_connection()
        cur = conn.cursor()

        # Query brand
        cur.execute("SELECT id FROM brands WHERE code = 'BENTOCAT'")
        cls.brand_id = cur.fetchone()["id"]

        # Query 2 distinct real historical orders from East Java (Tuban & Bojonegoro) with existing order_financials
        cur.execute("""
            SELECT o.id, o.total_order_volume, o.net_invoice_grand_total, o.transport_fee_billed,
                   r.name as region_name
            FROM orders o
            JOIN customers c ON o.customer_id = c.id
            JOIN regions r ON c.region_id = r.id
            JOIN order_financials of ON o.id = of.order_id
            WHERE r.name IN ('TUBAN', 'BOJONEGORO') AND o.total_order_volume > 0
            LIMIT 2
        """)
        cls.test_orders = cur.fetchall()
        cls.order_1 = cls.test_orders[0]
        cls.order_2 = cls.test_orders[1]

        conn.close()

    @classmethod
    def tearDownClass(cls):
        if os.path.exists(TEST_DB_PATH):
            os.remove(TEST_DB_PATH)

    def test_01_create_vendor_success(self):
        """Tests registering freight expedition and packaging suppliers."""
        expedition_in = VendorInput(
            brand_id=self.brand_id,
            code="VND-EXP-001",
            name="CV. Lintas Logistik Nusantara",
            category="FREIGHT_EXPEDITION",
            contact_person="Pak Slamet",
            phone="081299998888",
            bank_name="BCA",
            bank_account_number="8001122334",
            bank_account_holder="CV LINTAS LOGISTIK"
        )
        vendor_id = self.ap_service.create_vendor(expedition_in)
        self.assertIsInstance(vendor_id, str)
        self.assertTrue(len(vendor_id) > 10)

        # Invalid category rejection
        with self.assertRaises(ValueError):
            self.ap_service.create_vendor(VendorInput(
                brand_id=self.brand_id,
                code="VND-BAD-001",
                name="Bad Vendor",
                category="INVALID_CAT"
            ))

    def test_02_create_regular_packaging_invoice(self):
        """Tests recording regular non-shared operational bill (e.g. karung bags)."""
        # Register packaging supplier
        pkg_vendor_id = self.ap_service.create_vendor(VendorInput(
            brand_id=self.brand_id,
            code="VND-PKG-001",
            name="PT. Plastindo Pack Sejahtera",
            category="PACKAGING_SUPPLIER"
        ))

        inv_in = VendorInvoiceInput(
            vendor_id=pkg_vendor_id,
            brand_id=self.brand_id,
            invoice_number="INV/PLAST/2026/089",
            invoice_date="2026-02-01",
            due_date="2026-02-15",
            total_amount=15000000.0,
            is_shared_freight=False,
            notes="Pengadaan 5.000 sak karung BentoCat 25L"
        )
        inv_id = self.ap_service.create_vendor_invoice(inv_in)
        self.assertIsInstance(inv_id, str)

        # Verify negative/zero amount rejection
        with self.assertRaises(ValueError):
            self.ap_service.create_vendor_invoice(VendorInvoiceInput(
                vendor_id=pkg_vendor_id,
                brand_id=self.brand_id,
                invoice_number="INV/FAIL/001",
                invoice_date="2026-02-01",
                due_date="2026-02-15",
                total_amount=-1000.0
            ))

    def test_03_shared_freight_proportional_allocation_and_financials_update(self):
        """
        Crucial Audit Requirement: Allocates single shared Estafet truck invoice
        proportionally across participating customer orders and synchronizes order_financials.
        """
        freight_vendor_id = self.ap_service.create_vendor(VendorInput(
            brand_id=self.brand_id,
            code="VND-TRUK-002",
            name="PT. Ekspedisi Fuso Estafet",
            category="FREIGHT_EXPEDITION"
        ))

        shared_orders = [self.order_1["id"], self.order_2["id"]]
        vol_1 = self.order_1["total_order_volume"]
        vol_2 = self.order_2["total_order_volume"]
        total_vol = vol_1 + vol_2

        total_freight_bill = 4500000.0  # Rp 4.500.000 for joint trip

        inv_in = VendorInvoiceInput(
            vendor_id=freight_vendor_id,
            brand_id=self.brand_id,
            invoice_number="INV/FUSO/2026/044",
            invoice_date="2026-02-10",
            due_date="2026-02-24",
            total_amount=total_freight_bill,
            is_shared_freight=True,
            shared_order_ids=shared_orders,
            notes="Ekspedisi gabungan Truk Fuso Tuban & Bojonegoro"
        )
        inv_id = self.ap_service.create_vendor_invoice(inv_in)
        self.assertIsInstance(inv_id, str)

        # 1. Verify shared_freight_allocations records
        conn = self.db.get_connection()
        cur = conn.cursor()
        cur.execute("""
            SELECT order_id, allocated_freight_amount, allocated_ratio
            FROM shared_freight_allocations
            WHERE vendor_invoice_id = ?
        """, (inv_id,))
        allocs = cur.fetchall()

        self.assertEqual(len(allocs), 2)
        total_allocated = sum(a["allocated_freight_amount"] for a in allocs)
        self.assertAlmostEqual(total_allocated, total_freight_bill, places=1)

        # 2. Verify order_financials was automatically updated for Order 1
        expected_alloc_1 = round(total_freight_bill * (vol_1 / total_vol), 2)
        cur.execute("""
            SELECT actual_freight_cost, net_transport_subsidy_borne, contribution_margin_amount, contribution_margin_percent
            FROM order_financials WHERE order_id = ?
        """, (self.order_1["id"],))
        fin_1 = cur.fetchone()
        conn.close()

        self.assertEqual(fin_1["actual_freight_cost"], expected_alloc_1)
        self.assertGreater(fin_1["contribution_margin_amount"], 0)

    def test_04_record_vendor_payment_and_overpayment_guard(self):
        """Tests settlement workflow: UNPAID -> PARTIAL -> PAID_LUNAS with overpayment prevention."""
        vendor_id = self.ap_service.create_vendor(VendorInput(
            brand_id=self.brand_id,
            code="VND-PAY-001",
            name="CV. Sumber Berkah Ekspedisi",
            category="FREIGHT_EXPEDITION"
        ))

        inv_id = self.ap_service.create_vendor_invoice(VendorInvoiceInput(
            vendor_id=vendor_id,
            brand_id=self.brand_id,
            invoice_number="INV/SB/2026/001",
            invoice_date="2026-01-01",
            due_date="2026-01-15",
            total_amount=5000000.0
        ))

        # 1. Partial Payment of Rp 2,000,000
        pay1 = self.ap_service.record_vendor_payment(VendorPaymentInput(
            vendor_invoice_id=inv_id,
            amount=2000000.0,
            payment_date="2026-01-10",
            payment_method="BCA Transfer"
        ))
        self.assertEqual(pay1["payment_status"], "PARTIAL")
        self.assertEqual(pay1["remaining_balance"], 3000000.0)

        # 2. Overpayment Attempt (Rp 3,500,000 > remaining Rp 3,000,000)
        with self.assertRaises(ValueError) as ctx:
            self.ap_service.record_vendor_payment(VendorPaymentInput(
                vendor_invoice_id=inv_id,
                amount=3500000.0,
                payment_date="2026-01-12"
            ))
        self.assertIn("melebihi sisa tagihan", str(ctx.exception).lower())

        # 3. Full Settlement of remaining Rp 3,000,000
        pay2 = self.ap_service.record_vendor_payment(VendorPaymentInput(
            vendor_invoice_id=inv_id,
            amount=3000000.0,
            payment_date="2026-01-14"
        ))
        self.assertEqual(pay2["payment_status"], "PAID_LUNAS")
        self.assertEqual(pay2["remaining_balance"], 0.0)

        # 4. Attempt payment on already settled invoice
        with self.assertRaises(ValueError):
            self.ap_service.record_vendor_payment(VendorPaymentInput(
                vendor_invoice_id=inv_id,
                amount=500000.0,
                payment_date="2026-01-15"
            ))

    def test_05_vendor_ap_summary_and_overdue_aging(self):
        """Tests Vendor AP summary reporting, outstanding balance, and overdue calculation."""
        summary = self.ap_service.get_vendor_ap_summary(brand_id=self.brand_id, as_of_date=date(2026, 3, 1))

        self.assertIsInstance(summary, VendorApSummary)
        self.assertGreater(summary.total_invoices_count, 0)
        self.assertGreater(summary.total_ap_amount_idr, 0)
        self.assertGreaterEqual(summary.total_paid_idr, 0)
        self.assertEqual(
            summary.total_outstanding_ap_idr,
            round(summary.total_ap_amount_idr - summary.total_paid_idr, 2)
        )

if __name__ == "__main__":
    unittest.main()

