#!/usr/bin/env python3
"""
OMNICAT ENTERPRISE - TELEGRAM MINI APP (TMA) FRONTEND TEST SUITE
Validates TMA HTML structure, Telegram WebApp SDK inclusion, mobile viewport,
CRM Reorder Radar tabs, truckload threshold logic, and WhatsApp deep-links.
"""

import os
import sys
import unittest
import re

WORKSPACE_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if WORKSPACE_ROOT not in sys.path:
    sys.path.insert(0, WORKSPACE_ROOT)

TMA_HTML_PATH = os.path.join(WORKSPACE_ROOT, "frontend", "index.html")

class TestTmaFrontend(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        if not os.path.exists(TMA_HTML_PATH):
            raise FileNotFoundError(f"Frontend HTML file not found at: {TMA_HTML_PATH}")
        with open(TMA_HTML_PATH, "r", encoding="utf-8") as f:
            cls.html_content = f.read()

    def test_01_html_file_exists_and_non_empty(self):
        """Verifies frontend/index.html exists and is properly formed."""
        self.assertGreater(len(self.html_content), 1000)
        self.assertIn("<!DOCTYPE html>", self.html_content)
        self.assertIn("<html lang=\"id\">", self.html_content)

    def test_02_telegram_webapp_sdk_included(self):
        """Verifies the official Telegram WebApp SDK script is embedded."""
        self.assertIn("https://telegram.org/js/telegram-web-app.js", self.html_content)
        self.assertIn("window.Telegram?.WebApp", self.html_content)
        self.assertIn("tg.ready()", self.html_content)
        self.assertIn("tg.expand()", self.html_content)

    def test_03_mobile_viewport_and_safe_area(self):
        """Verifies viewport meta tag is optimized for mobile touchscreens and iOS safe areas."""
        self.assertIn("viewport-fit=cover", self.html_content)
        self.assertIn("user-scalable=no", self.html_content)
        self.assertIn("maximum-scale=1.0", self.html_content)
        self.assertIn("safe-area-inset-bottom", self.html_content)

    def test_04_three_essential_mobile_tabs_present(self):
        """Verifies the three required core tabs exist in navigation and layout."""
        self.assertIn('id="tabCrm"', self.html_content)
        self.assertIn('id="tabTarget"', self.html_content)
        self.assertIn('id="tabOrder"', self.html_content)
        self.assertIn('Peluang Reorder', self.html_content)
        self.assertIn('Target & Pencapaian', self.html_content)
        self.assertIn('Input Draft Pesanan', self.html_content)

    def test_05_whatsapp_deep_link_restock_prompt(self):
        """Verifies WhatsApp deep link formatting with pre-composed restock template."""
        self.assertIn("https://wa.me/", self.html_content)
        self.assertIn("Berdasarkan jadwal persediaan klinik", self.html_content)
        self.assertIn("stok pasir", self.html_content)

    def test_06_truckload_promo_threshold_and_pricing(self):
        """Verifies the 8,000 Liter full truckload logic and variant unit prices."""
        # 8,000 L truckload threshold
        self.assertIn("8000", self.html_content)
        self.assertIn("GRATIS ONGKIR DITERAPKAN", self.html_content)
        # Canonical variant prices: 25L (133500), 10L (58000), 5.5L (33000)
        self.assertIn("133500", self.html_content)
        self.assertIn("58000", self.html_content)
        self.assertIn("33000", self.html_content)

    def test_07_dev_harness_fallback(self):
        """Verifies fallback dev harness mode when opened outside native Telegram client."""
        self.assertIn("Dev Harness", self.html_content)
        self.assertIn("tmaBadge", self.html_content)

if __name__ == "__main__":
    unittest.main()
