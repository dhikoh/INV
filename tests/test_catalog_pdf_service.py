#!/usr/bin/env python3
"""
OMNICAT ENTERPRISE - MULTI-BRAND DIGITAL CATALOG PDF TEST SUITE
Validates A4 Landscape Display Catalog (Zero-Pricing Invariant)
and A4 Portrait Official B2B Price Sheet across multi-brand profiles (BentoCat & Zeolite Mojo).
"""

import os
import sys
import shutil
import re
import unittest
from pypdf import PdfReader

WORKSPACE_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if WORKSPACE_ROOT not in sys.path:
    sys.path.insert(0, WORKSPACE_ROOT)

CANONICAL_DB_PATH = os.path.join(WORKSPACE_ROOT, "data", "omnicat_local.db")
TEST_DB_PATH = os.path.join(WORKSPACE_ROOT, "data", "test_catalog_pdf.db")
TEST_OUTPUT_DIR = os.path.join(WORKSPACE_ROOT, "data", "test_generated_catalogs")

from backend.database import Database
from backend.models import CatalogPdfInput, CatalogPdfResult
from backend.services.catalog_pdf_service import CatalogPdfService

class TestCatalogPdfService(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        if os.path.exists(TEST_DB_PATH):
            os.remove(TEST_DB_PATH)
        shutil.copyfile(CANONICAL_DB_PATH, TEST_DB_PATH)

        cls.db = Database(TEST_DB_PATH)
        cls.catalog_service = CatalogPdfService(cls.db)

        os.makedirs(TEST_OUTPUT_DIR, exist_ok=True)

        # Retrieve brand IDs
        conn = cls.db.get_connection()
        cur = conn.cursor()
        cur.execute("SELECT id, code, name FROM brands WHERE code = 'BENTOCAT'")
        cls.bentocat_brand = cur.fetchone()

        cur.execute("SELECT id, code, name FROM brands WHERE code = 'ZEOLITE_MOJO'")
        cls.zeolite_brand = cur.fetchone()
        conn.close()

    @classmethod
    def tearDownClass(cls):
        if os.path.exists(TEST_DB_PATH):
            os.remove(TEST_DB_PATH)
        if os.path.exists(TEST_OUTPUT_DIR):
            shutil.rmtree(TEST_OUTPUT_DIR, ignore_errors=True)

    def test_generate_landscape_display_bentocat_zero_pricing(self):
        """
        Verify A4 Landscape Public Display Catalog for BentoCat:
        - Must generate valid single-page PDF.
        - Must include key branding, product features, scent variants, and packaging.
        - STRICT ZERO PRICING INVARIANT: Must NOT contain any Rp or currency/cost terms.
        """
        out_pdf = os.path.join(TEST_OUTPUT_DIR, "catalog_display_bentocat_test.pdf")
        cat_input = CatalogPdfInput(
            brand_id=self.bentocat_brand["id"],
            format_type="DISPLAY_LANDSCAPE"
        )
        result = self.catalog_service.generate_catalog_pdf(cat_input, output_path=out_pdf)

        self.assertEqual(result.brand_code, "BENTOCAT")
        self.assertEqual(result.orientation, "LANDSCAPE")
        self.assertEqual(result.format_type, "DISPLAY_LANDSCAPE")
        self.assertFalse(result.has_pricing)
        self.assertTrue(os.path.exists(out_pdf))
        self.assertGreater(result.file_size_bytes, 1000)

        # Inspect PDF content using pypdf
        reader = PdfReader(out_pdf)
        self.assertGreaterEqual(len(reader.pages), 1)

        # Check page orientation (width > height for landscape)
        box = reader.pages[0].mediabox
        width = float(box.width)
        height = float(box.height)
        self.assertGreater(width, height, "A4 Landscape page width must exceed height")

        full_text = " ".join([page.extract_text() for page in reader.pages])
        full_text_clean = re.sub(r'\s+', ' ', full_text)

        # Assert key showcase copy
        self.assertIn("BENTOCAT", full_text_clean.upper())
        self.assertIn("GUMPAL INSTAN", full_text_clean.upper())
        self.assertIn("BEBAS DEBU", full_text_clean.upper())
        self.assertIn("ODOUR LOCK", full_text_clean.upper())
        self.assertIn("Lavender", full_text_clean)
        self.assertIn("Lemon", full_text_clean)
        self.assertIn("Apple", full_text_clean)
        self.assertIn("Coffee", full_text_clean)

        # STRICT PRIVACY ASSERTIONS: NO PRICING ALLOWED IN DISPLAY CATALOG
        self.assertNotIn("Rp", full_text)
        self.assertNotIn("IDR", full_text)
        self.assertNotIn("HET", full_text)
        self.assertNotIn("Grosir", full_text)
        self.assertNotIn("Diskon", full_text)
        self.assertNotIn("COGS", full_text)
        self.assertNotIn("HPP", full_text)

    def test_generate_portrait_price_sheet_bentocat_with_pricing(self):
        """
        Verify A4 Portrait Official B2B Price Sheet for BentoCat:
        - Must generate valid portrait PDF with width < height.
        - Must include tiered pricing (HET, Grosir Toko, Distributor FTL).
        - Must include official bank account and warning.
        - Must include Estafet Shared Freight explanation.
        """
        out_pdf = os.path.join(TEST_OUTPUT_DIR, "price_sheet_bentocat_test.pdf")
        cat_input = CatalogPdfInput(
            brand_id=self.bentocat_brand["id"],
            format_type="B2B_PRICE_SHEET",
            effective_date="01 November 2026"
        )
        result = self.catalog_service.generate_catalog_pdf(cat_input, output_path=out_pdf)

        self.assertEqual(result.brand_code, "BENTOCAT")
        self.assertEqual(result.orientation, "PORTRAIT")
        self.assertEqual(result.format_type, "B2B_PRICE_SHEET")
        self.assertTrue(result.has_pricing)
        self.assertTrue(os.path.exists(out_pdf))
        self.assertGreater(result.file_size_bytes, 1000)

        reader = PdfReader(out_pdf)
        self.assertGreaterEqual(len(reader.pages), 1)

        # Check page orientation (height > width for portrait)
        box = reader.pages[0].mediabox
        width = float(box.width)
        height = float(box.height)
        self.assertGreater(height, width, "A4 Portrait page height must exceed width")

        full_text = " ".join([page.extract_text() for page in reader.pages])
        full_text_clean = re.sub(r'\s+', ' ', full_text)

        # Assert official price sheet titles and SKUs
        self.assertIn("LEMBAR HARGA RESMI B2B", full_text_clean)
        self.assertIn("PT BENTO PRIMA ABADI", full_text_clean.upper())
        self.assertIn("BC-PRM-25L", full_text_clean)
        self.assertIn("BC-PRM-10L", full_text_clean)
        self.assertIn("BC-PRM-5.5L", full_text_clean)

        # Assert pricing presence
        self.assertIn("Rp", full_text)
        self.assertIn("Grosir Toko", full_text_clean)
        self.assertIn("Distributor", full_text_clean)

        # Assert Estafet shared freight terms
        self.assertIn("Pengiriman Estafet", full_text_clean)
        self.assertIn("Bojonegoro", full_text_clean)

        # Assert official bank account
        self.assertIn("BCA", full_text)
        self.assertIn("0902207846", full_text)
        self.assertIn("FINDA FATIKASARI", full_text)

    def test_multibrand_zeolite_mojo_catalogs(self):
        """
        Verify multi-brand capability by generating both formats for Zeolite Mojo.
        """
        # 1. Zeolite Landscape Display
        out_display = os.path.join(TEST_OUTPUT_DIR, "catalog_display_zeolite_test.pdf")
        cat_in_disp = CatalogPdfInput(
            brand_id=self.zeolite_brand["id"],
            format_type="DISPLAY_LANDSCAPE"
        )
        res_disp = self.catalog_service.generate_catalog_pdf(cat_in_disp, output_path=out_display)
        self.assertEqual(res_disp.brand_code, "ZEOLITE_MOJO")
        self.assertEqual(res_disp.orientation, "LANDSCAPE")
        self.assertFalse(res_disp.has_pricing)

        reader_disp = PdfReader(out_display)
        text_disp = " ".join([page.extract_text() for page in reader_disp.pages])
        self.assertIn("ZEOLITE", text_disp.upper())
        self.assertNotIn("Rp", text_disp)

        # 2. Zeolite Portrait Price Sheet
        out_price = os.path.join(TEST_OUTPUT_DIR, "price_sheet_zeolite_test.pdf")
        cat_in_price = CatalogPdfInput(
            brand_id=self.zeolite_brand["id"],
            format_type="B2B_PRICE_SHEET"
        )
        res_price = self.catalog_service.generate_catalog_pdf(cat_in_price, output_path=out_price)
        self.assertEqual(res_price.brand_code, "ZEOLITE_MOJO")
        self.assertEqual(res_price.orientation, "PORTRAIT")
        self.assertTrue(res_price.has_pricing)

        reader_price = PdfReader(out_price)
        text_price = " ".join([page.extract_text() for page in reader_price.pages])
        self.assertIn("ZEOLITE", text_price.upper())
        self.assertIn("Rp", text_price)
        self.assertIn("ZEO-LITTER", text_price)

    def test_brand_code_lookup(self):
        """
        Verify lookup by brand_code as well as brand UUID.
        """
        cat_input = CatalogPdfInput(brand_id="BENTOCAT", format_type="DISPLAY_LANDSCAPE")
        result = self.catalog_service.generate_catalog_pdf(cat_input)
        self.assertEqual(result.brand_code, "BENTOCAT")
        self.assertTrue(os.path.exists(result.file_path))

    def test_invalid_brand_and_format_errors(self):
        """
        Verify error handling on invalid brand or unknown catalog format.
        """
        with self.assertRaises(ValueError) as ctx:
            self.catalog_service.generate_catalog_pdf(CatalogPdfInput(brand_id="UNKNOWN_BRAND_XYZ"))
        self.assertIn("tidak ditemukan", str(ctx.exception))

        with self.assertRaises(ValueError) as ctx2:
            self.catalog_service.generate_catalog_pdf(CatalogPdfInput(
                brand_id=self.bentocat_brand["id"],
                format_type="INVALID_FLYER_3D"
            ))
        self.assertIn("tidak valid", str(ctx2.exception))


if __name__ == "__main__":
    unittest.main()

