#!/usr/bin/env python3
"""
OMNICAT ENTERPRISE - PDF INVOICE GENERATOR TEST SUITE
Validates A4 PDF generation, layout structure, QR code embedding,
bank details, and database storage path synchronization.
"""

import os
import sys
import shutil
import unittest
from pypdf import PdfReader

WORKSPACE_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if WORKSPACE_ROOT not in sys.path:
    sys.path.insert(0, WORKSPACE_ROOT)

CANONICAL_DB_PATH = os.path.join(WORKSPACE_ROOT, "data", "omnicat_local.db")
TEST_DB_PATH = os.path.join(WORKSPACE_ROOT, "data", "test_pdf.db")

from backend.database import Database
from backend.models import CreateOrderInput, OrderItemInput
from backend.services.invoicing_service import InvoicingService
from backend.services.pdf_invoice_service import PdfInvoiceService

class TestPdfInvoiceService(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        if os.path.exists(TEST_DB_PATH):
            os.remove(TEST_DB_PATH)
        shutil.copyfile(CANONICAL_DB_PATH, TEST_DB_PATH)

        cls.db = Database(TEST_DB_PATH)
        cls.inv_service = InvoicingService(cls.db)
        cls.pdf_service = PdfInvoiceService(cls.db)

        conn = cls.db.get_connection()
        cur = conn.cursor()

        cur.execute("SELECT id FROM brands WHERE code = 'BENTOCAT'")
        cls.brand_id = cur.fetchone()[0]

        cur.execute("SELECT id FROM users WHERE role = 'SUPER_ADMIN'")
        cls.admin_id = cur.fetchone()[0]

        cur.execute("SELECT id FROM users WHERE role = 'SALES'")
        cls.sales_id = cur.fetchone()[0]

        cur.execute("SELECT id, name FROM customers WHERE name LIKE '%Aulia%'")
        row = cur.fetchone()
        cls.customer_id = row[0]
        cls.customer_name = row[1]

        cur.execute("SELECT id FROM product_variants WHERE sku = 'BC-PRM-25L'")
        cls.var_25l = cur.fetchone()[0]

        cur.execute("SELECT id FROM product_variants WHERE sku = 'BC-PRM-10L'")
        cls.var_10l = cur.fetchone()[0]

        conn.close()

    @classmethod
    def tearDownClass(cls):
        if os.path.exists(TEST_DB_PATH):
            os.remove(TEST_DB_PATH)

    def test_01_generate_official_pdf_with_qr(self):
        """Verifies generating an A4 PDF invoice with QR code and brand info."""
        # 1. Create and approve order: 120 sak 25L and 50 bag 10L
        order_input = CreateOrderInput(
            brand_id=self.brand_id,
            customer_id=self.customer_id,
            items=[
                OrderItemInput(variant_id=self.var_25l, quantity=120, unit_price=68500.0),
                OrderItemInput(variant_id=self.var_10l, quantity=50, unit_price=34000.0)
            ],
            order_date="2026-11-25",
            transport_fee_billed=400000.0,
            unloading_fee_billed=100000.0,
            notes="Pengiriman armada truk estafet Jatim"
        )
        draft = self.inv_service.create_draft_order(order_input, self.sales_id)
        app_res = self.inv_service.approve_order(draft.id, self.admin_id)

        # 2. Generate PDF
        pdf_path = self.pdf_service.generate_invoice_pdf(draft.id)

        # 3. Verify file on disk
        self.assertTrue(os.path.exists(pdf_path), "Generated PDF file does not exist on disk")
        file_size = os.path.getsize(pdf_path)
        self.assertGreater(file_size, 5000, f"PDF file size too small: {file_size} bytes")

        # 4. Verify contents via pypdf
        reader = PdfReader(pdf_path)
        self.assertEqual(len(reader.pages), 1, "Invoice must fit on exactly 1 page A4 (Hal 1/1)")

        page_text = reader.pages[0].extract_text()
        self.assertIn("BENTOCAT", page_text)
        self.assertIn("ORDER CONFIRMATION / INVOICE", page_text)
        self.assertIn(self.customer_name, page_text)
        self.assertIn(app_res.invoice_number, page_text)
        self.assertIn("0902207846", page_text)  # BCA account number
        self.assertIn("FINDA FATIKASARI", page_text)

        # 5. Verify database storage path update
        conn = self.db.get_connection()
        cur = conn.cursor()
        cur.execute("SELECT pdf_storage_path FROM invoices WHERE id = ?", (app_res.invoice_id,))
        stored_path = cur.fetchone()[0]
        conn.close()

        self.assertEqual(stored_path, pdf_path)

    def test_02_generate_pdf_for_unapproved_order_fails(self):
        """Verifies cannot generate official invoice for draft order that is not approved."""
        order_input = CreateOrderInput(
            brand_id=self.brand_id,
            customer_id=self.customer_id,
            items=[OrderItemInput(variant_id=self.var_25l, quantity=10, unit_price=68500.0)],
        )
        draft = self.inv_service.create_draft_order(order_input, self.sales_id)

        with self.assertRaises(ValueError) as ctx:
            self.pdf_service.generate_invoice_pdf(draft.id)
        self.assertIn("belum diterbitkan", str(ctx.exception))

if __name__ == "__main__":
    unittest.main(verbosity=2)

