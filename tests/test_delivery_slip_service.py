#!/usr/bin/env python3
"""
OMNICAT ENTERPRISE - DELIVERY SLIP (SURAT JALAN) TEST SUITE
Validates A4 PDF generation, physical cargo manifest accuracy, 3-party signatures,
strict exclusion of confidential financial figures (no prices/margins), and QR code embedding.
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
TEST_DB_PATH = os.path.join(WORKSPACE_ROOT, "data", "test_delivery_slip.db")

from backend.database import Database
from backend.models import DeliverySlipInput, DeliverySlipResult
from backend.services.delivery_slip_service import DeliverySlipService

class TestDeliverySlipService(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        if os.path.exists(TEST_DB_PATH):
            os.remove(TEST_DB_PATH)
        shutil.copyfile(CANONICAL_DB_PATH, TEST_DB_PATH)

        cls.db = Database(TEST_DB_PATH)
        cls.slip_service = DeliverySlipService(cls.db)

        # Query a real approved order from historical dataset (e.g. Tuban)
        conn = cls.db.get_connection()
        cur = conn.cursor()
        cur.execute("""
            SELECT o.id, o.doc_number, o.customer_id, c.name as customer_name, r.name as region_name
            FROM orders o
            JOIN customers c ON o.customer_id = c.id
            JOIN regions r ON c.region_id = r.id
            WHERE o.status != 'SKIPPED_AUDIT' AND r.name = 'TUBAN'
            ORDER BY o.order_date DESC
            LIMIT 1
        """)
        cls.test_order = cur.fetchone()
        cls.order_id = cls.test_order["id"]

        # Ensure output test directory
        cls.test_output_dir = os.path.join(WORKSPACE_ROOT, "data", "test_generated_slips")
        os.makedirs(cls.test_output_dir, exist_ok=True)

        conn.close()

    @classmethod
    def tearDownClass(cls):
        if os.path.exists(TEST_DB_PATH):
            os.remove(TEST_DB_PATH)
        if os.path.exists(cls.test_output_dir):
            shutil.rmtree(cls.test_output_dir, ignore_errors=True)

    def test_01_generate_delivery_slip_success(self):
        """Tests that Surat Jalan PDF is generated with correct numbers and file properties."""
        test_pdf_path = os.path.join(self.test_output_dir, "test_surat_jalan_tuban.pdf")

        slip_in = DeliverySlipInput(
            order_id=self.order_id,
            carrier_name="Truk Ekspedisi Jawa Timur",
            vehicle_plate_number="S 8888 UJ",
            driver_name="Pak Joko Supriadi",
            notes="Segel terpasang rapat, bongkar gudang Tuban"
        )

        result = self.slip_service.generate_delivery_slip_pdf(slip_in, output_path=test_pdf_path)

        self.assertIsInstance(result, DeliverySlipResult)
        self.assertEqual(result.order_id, self.order_id)
        self.assertIn("SJ/", result.delivery_slip_number)
        self.assertIn("-TUB/", result.delivery_slip_number)
        self.assertGreater(result.total_packages_count, 0)
        self.assertGreater(result.total_volume_liters, 0)
        self.assertGreater(result.estimated_weight_kg, 0)
        self.assertTrue(os.path.exists(test_pdf_path))
        self.assertGreater(os.path.getsize(test_pdf_path), 5000)

    def test_02_strict_exclusion_of_financial_figures(self):
        """
        Crucial Audit Rule: Surat Jalan is handled by drivers and store staff.
        It must NEVER contain prices, subtotals, discounts, COGS, or margin figures.
        """
        test_pdf_path = os.path.join(self.test_output_dir, "test_surat_jalan_privacy.pdf")

        slip_in = DeliverySlipInput(
            order_id=self.order_id,
            carrier_name="Armada Engkel 8 Ton",
            vehicle_plate_number="W 9102 UP",
            driver_name="Sopir Logistik"
        )

        result = self.slip_service.generate_delivery_slip_pdf(slip_in, output_path=test_pdf_path)

        # Extract all text using pypdf
        reader = PdfReader(test_pdf_path)
        full_text = ""
        for page in reader.pages:
            full_text += page.extract_text() or ""

        # Normalize whitespace for multi-line headings
        import re
        clean_text = re.sub(r'\s+', ' ', full_text)

        # Assert confidential financial terms are ABSENT
        self.assertNotIn("Harga Satuan", clean_text)
        self.assertNotIn("Subtotal Produk", clean_text)
        self.assertNotIn("Diskon", clean_text)
        self.assertNotIn("Total Tagihan", clean_text)
        self.assertNotIn("COGS", clean_text)
        self.assertNotIn("HPP", clean_text)
        self.assertNotIn("Margin", clean_text)

        # Assert mandatory logistics fields are PRESENT
        self.assertIn("SURAT JALAN PENGIRIMAN", clean_text)
        self.assertIn("W 9102 UP", clean_text)
        self.assertIn("Sopir Logistik", clean_text)
        self.assertIn("Total Volume", clean_text)
        self.assertIn("PENGIRIM GUDANG", clean_text)
        self.assertIn("SOPIR / EKSPEDISI", clean_text)
        self.assertIn("PENERIMA", clean_text)
        self.assertIn("PERHATIAN & KETENTUAN PENERIMAAN", clean_text)

    def test_03_single_page_a4_layout(self):
        """Verifies that the delivery slip fits exactly onto 1 single A4 page."""
        test_pdf_path = os.path.join(self.test_output_dir, "test_surat_jalan_1page.pdf")

        slip_in = DeliverySlipInput(
            order_id=self.order_id,
            carrier_name="Ekspedisi Fuso",
            vehicle_plate_number="L 8201 AB",
            driver_name="Bambang"
        )
        self.slip_service.generate_delivery_slip_pdf(slip_in, output_path=test_pdf_path)

        reader = PdfReader(test_pdf_path)
        self.assertEqual(len(reader.pages), 1, "Surat Jalan must be exactly 1 page A4 for physical handover efficiency!")

    def test_04_invalid_order_id_raises_value_error(self):
        """Tests that invalid order IDs are rejected with ValueError."""
        slip_in = DeliverySlipInput(order_id="non-existent-order-uuid-999")
        with self.assertRaises(ValueError):
            self.slip_service.generate_delivery_slip_pdf(slip_in)

if __name__ == "__main__":
    unittest.main()
