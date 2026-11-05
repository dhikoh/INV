#!/usr/bin/env python3
"""
OMNICAT ENTERPRISE - SALES CRM & REPEAT ORDER CADENCE TEST SUITE
Validates customer repeat-order intervals, median cadence, dynamic health status
transitions (ACTIVE -> DUE_FOR_REORDER -> OVERDUE -> CHURN_ALERT -> INACTIVE),
and sales activity logging.
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
TEST_DB_PATH = os.path.join(WORKSPACE_ROOT, "data", "test_crm.db")

from backend.database import Database
from backend.models import (
    CustomerCadenceMetric,
    SalesCrmSummary,
    SalesTargetInput,
    SalesPerformanceReport
)
from backend.services.crm_service import CrmService

class TestCrmService(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        if os.path.exists(TEST_DB_PATH):
            os.remove(TEST_DB_PATH)
        shutil.copyfile(CANONICAL_DB_PATH, TEST_DB_PATH)

        cls.db = Database(TEST_DB_PATH)
        cls.crm = CrmService(cls.db)

        conn = cls.db.get_connection()
        cur = conn.cursor()

        # Fetch Tuban customer (11 orders historically)
        cur.execute("""
            SELECT c.id, c.name, r.name as region_name, c.brand_id, c.region_id
            FROM customers c
            JOIN regions r ON c.region_id = r.id
            WHERE r.name = 'TUBAN'
        """)
        cls.tuban_customer = cur.fetchone()

        # Fetch Semarang customer (29 orders historically)
        cur.execute("""
            SELECT c.id, c.name, r.name as region_name, c.brand_id
            FROM customers c
            JOIN regions r ON c.region_id = r.id
            WHERE r.name = 'SEMARANG'
        """)
        cls.semarang_customer = cur.fetchone()

        # Fetch Sales user
        cur.execute("SELECT id FROM users WHERE role = 'SALES' LIMIT 1")
        cls.sales_id = cur.fetchone()["id"]
        cls.brand_id = cls.tuban_customer["brand_id"]

        conn.close()

    @classmethod
    def tearDownClass(cls):
        if os.path.exists(TEST_DB_PATH):
            os.remove(TEST_DB_PATH)

    def test_calculate_cadence_tuban_historical_customer(self):
        """Tests that Tuban customer repeat cadence is calculated correctly from 11 historical orders."""
        tuban_id = self.tuban_customer["id"]
        metric = self.crm.calculate_customer_cadence(tuban_id)

        self.assertIsInstance(metric, CustomerCadenceMetric)
        self.assertEqual(metric.customer_id, tuban_id)
        self.assertEqual(metric.region_name, "TUBAN")
        self.assertEqual(metric.total_orders, 11)
        self.assertGreater(metric.total_volume_liters, 0)
        self.assertGreater(metric.lifetime_revenue_idr, 300_000_000)
        self.assertIsNotNone(metric.median_interval_days)
        self.assertGreater(metric.median_interval_days, 10.0)
        self.assertIsNotNone(metric.favorite_variant)
        self.assertIn("25L", metric.favorite_variant)

    def test_dynamic_health_status_transitions_by_date(self):
        """
        Tests that setting different as_of_date values accurately triggers
        each of the 5 customer lifecycle states based on median cadence.
        """
        tuban_id = self.tuban_customer["id"]

        # Fetch the last order date for Tuban
        conn = self.db.get_connection()
        try:
            cur = conn.cursor()
            cur.execute("SELECT MAX(order_date) FROM orders WHERE customer_id = ?", (tuban_id,))
            last_order_str = cur.fetchone()[0]
        finally:
            conn.close()

        last_date = date.fromisoformat(last_order_str[:10])
        metric_base = self.crm.calculate_customer_cadence(tuban_id, as_of_date=last_date)
        median = metric_base.median_interval_days
        self.assertIsNotNone(median)

        # 1. State: ACTIVE (e.g. 5 days after order, well below median - 3)
        as_of_active = last_date + timedelta(days=max(1, int(median - 5)))
        m_active = self.crm.calculate_customer_cadence(tuban_id, as_of_date=as_of_active)
        self.assertEqual(m_active.health_status, "ACTIVE")
        self.assertIn("Pelanggan aktif", m_active.recommended_action)

        # 2. State: DUE_FOR_REORDER (e.g. exactly at median interval)
        as_of_due = last_date + timedelta(days=int(median))
        m_due = self.crm.calculate_customer_cadence(tuban_id, as_of_date=as_of_due)
        self.assertEqual(m_due.health_status, "DUE_FOR_REORDER")
        self.assertIn("WAKTU REORDER TEPAT", m_due.recommended_action)

        # 3. State: OVERDUE (e.g. 1.25x median interval)
        as_of_overdue = last_date + timedelta(days=int(1.25 * median))
        m_overdue = self.crm.calculate_customer_cadence(tuban_id, as_of_date=as_of_overdue)
        self.assertEqual(m_overdue.health_status, "OVERDUE")
        self.assertIn("TELAT REORDER", m_overdue.recommended_action)

        # 4. State: CHURN_ALERT (e.g. 2.2x median interval)
        as_of_churn = last_date + timedelta(days=int(2.2 * median))
        m_churn = self.crm.calculate_customer_cadence(tuban_id, as_of_date=as_of_churn)
        self.assertEqual(m_churn.health_status, "CHURN_ALERT")
        self.assertIn("PERINGATAN BAHAYA CHURN", m_churn.recommended_action)

        # 5. State: INACTIVE (e.g. 4.0x median interval)
        as_of_inactive = last_date + timedelta(days=int(4.0 * median))
        m_inactive = self.crm.calculate_customer_cadence(tuban_id, as_of_date=as_of_inactive)
        self.assertEqual(m_inactive.health_status, "INACTIVE")
        self.assertIn("Pelanggan pasif/dorman", m_inactive.recommended_action)

    def test_new_customer_without_cadence(self):
        """Tests that a freshly created customer with zero orders is flagged as NEW_CUSTOMER."""
        conn = self.db.get_connection()
        try:
            cur = conn.cursor()
            new_cust_id = "test_new_cust_999"
            cur.execute("""
                INSERT INTO customers (id, brand_id, region_id, name, owner_doctor_name, phone, shipping_address)
                VALUES (?, ?, ?, 'Klinik Baru Sejahtera', 'Dr. Satria', '081234567890', 'Jl. Baru No. 1')
            """, (new_cust_id, self.tuban_customer["brand_id"], self.tuban_customer["region_id"]))
            conn.commit()
        finally:
            conn.close()

        metric = self.crm.calculate_customer_cadence(new_cust_id)
        self.assertEqual(metric.health_status, "NEW_CUSTOMER")
        self.assertEqual(metric.total_orders, 0)
        self.assertIsNone(metric.median_interval_days)

    def test_get_sales_crm_summary_and_priority_sorting(self):
        """Tests the CRM dashboard summary metrics and ensures high-priority customers appear first."""
        summary = self.crm.get_sales_crm_summary(brand_id=self.tuban_customer["brand_id"])
        self.assertIsInstance(summary, SalesCrmSummary)
        self.assertGreaterEqual(summary.total_customers, 7)

        # Verify that customer list is sorted with urgent statuses (DUE_FOR_REORDER / CHURN_ALERT / OVERDUE) before ACTIVE
        status_ranks = [
            {"DUE_FOR_REORDER": 0, "CHURN_ALERT": 1, "OVERDUE": 2, "ACTIVE": 3, "NEW_CUSTOMER": 4, "INACTIVE": 5}.get(c.health_status, 99)
            for c in summary.customers
        ]
        self.assertEqual(status_ranks, sorted(status_ranks))

    def test_sales_activity_logging_and_retrieval(self):
        """Tests creating touchpoint activity logs and fetching chronological customer interaction history."""
        semarang_id = self.semarang_customer["id"]

        act1_id = self.crm.log_sales_activity(
            customer_id=semarang_id,
            sales_user_id=self.sales_id,
            activity_type="WHATSAPP",
            notes="Follow up ketersediaan stok pasir 25L aroma lavender.",
            follow_up_date="2026-02-15"
        )
        self.assertIsInstance(act1_id, str)

        act2_id = self.crm.log_sales_activity(
            customer_id=semarang_id,
            sales_user_id=self.sales_id,
            activity_type="VISIT",
            notes="Kunjungan outlet klinik Semarang Barat. Owner minta katalog produk baru.",
            follow_up_date="2026-02-20"
        )
        self.assertIsInstance(act2_id, str)

        # Retrieve activities
        activities = self.crm.get_customer_activities(semarang_id)
        self.assertGreaterEqual(len(activities), 2)
        self.assertEqual(activities[0]["id"], act2_id) # Most recent first
        self.assertEqual(activities[0]["activity_type"], "VISIT")

        # Validation guards
        with self.assertRaises(ValueError):
            self.crm.log_sales_activity(semarang_id, self.sales_id, "INVALID_TYPE", "Catatan")

        with self.assertRaises(ValueError):
            self.crm.log_sales_activity(semarang_id, self.sales_id, "CALL", "   ")

    def test_sales_target_setting_and_upsert(self):
        """Tests configuring monthly sales targets and verifying upsert idempotency."""
        target_in = SalesTargetInput(
            sales_user_id=self.sales_id,
            brand_id=self.brand_id,
            target_month="2025-03",
            target_volume_liters=40000.0,
            target_revenue_idr=200000000.0
        )
        t_id1 = self.crm.set_sales_target(target_in)
        self.assertIsInstance(t_id1, str)

        # Upsert: Update same month with revised targets
        target_revised = SalesTargetInput(
            sales_user_id=self.sales_id,
            brand_id=self.brand_id,
            target_month="2025-03",
            target_volume_liters=45000.0,
            target_revenue_idr=220000000.0
        )
        t_id2 = self.crm.set_sales_target(target_revised)
        self.assertIsInstance(t_id2, str)

        # Verify values updated in performance calculation
        report = self.crm.get_sales_performance(self.sales_id, self.brand_id, "2025-03")
        self.assertEqual(report.target_volume_liters, 45000.0)
        self.assertEqual(report.target_revenue_idr, 220000000.0)

        # Validation errors
        with self.assertRaises(ValueError):
            # Invalid month format
            self.crm.set_sales_target(SalesTargetInput(self.sales_id, self.brand_id, "2025-13", 1000.0, 1000.0))

        with self.assertRaises(ValueError):
            # Zero volume
            self.crm.set_sales_target(SalesTargetInput(self.sales_id, self.brand_id, "2025-03", 0.0, 1000.0))

        with self.assertRaises(ValueError):
            # Negative revenue
            self.crm.set_sales_target(SalesTargetInput(self.sales_id, self.brand_id, "2025-03", 1000.0, -500.0))

    def test_sales_performance_attainment_calculation(self):
        """Tests calculation of volume and revenue attainment against actual orders in that month."""
        # Find a month with real orders in the test DB
        conn = self.db.get_connection()
        cur = conn.cursor()
        cur.execute("""
            SELECT substr(order_date, 1, 7) as ym,
                   COUNT(*) as cnt,
                   SUM(total_order_volume) as vol,
                   SUM(net_invoice_grand_total) as rev
            FROM orders
            WHERE status != 'SKIPPED_AUDIT'
            GROUP BY ym
            ORDER BY cnt DESC
            LIMIT 1
        """)
        row = cur.fetchone()
        conn.close()

        target_month = row["ym"]
        expected_cnt = row["cnt"]
        expected_vol = row["vol"]
        expected_rev = row["rev"]

        # Case 1: Target set low -> Status EXCEEDED
        self.crm.set_sales_target(SalesTargetInput(
            sales_user_id=self.sales_id,
            brand_id=self.brand_id,
            target_month=target_month,
            target_volume_liters=expected_vol * 0.5,
            target_revenue_idr=expected_rev * 0.5
        ))
        rep_exceeded = self.crm.get_sales_performance(self.sales_id, self.brand_id, target_month)
        self.assertEqual(rep_exceeded.orders_count, expected_cnt)
        self.assertAlmostEqual(rep_exceeded.actual_volume_liters, expected_vol, places=2)
        self.assertAlmostEqual(rep_exceeded.actual_revenue_idr, expected_rev, places=2)
        self.assertEqual(rep_exceeded.performance_status, "EXCEEDED")
        self.assertGreaterEqual(rep_exceeded.revenue_attainment_percent, 100.0)

        # Case 2: Target set very high -> Status LAGGING
        self.crm.set_sales_target(SalesTargetInput(
            sales_user_id=self.sales_id,
            brand_id=self.brand_id,
            target_month=target_month,
            target_volume_liters=expected_vol * 10.0,
            target_revenue_idr=expected_rev * 10.0
        ))
        rep_lagging = self.crm.get_sales_performance(self.sales_id, self.brand_id, target_month)
        self.assertEqual(rep_lagging.performance_status, "LAGGING")
        self.assertLess(rep_lagging.revenue_attainment_percent, 40.0)

    def test_get_all_sales_targets_for_month(self):
        """Tests fetching performance reports for all active sales representatives."""
        reports = self.crm.get_all_sales_targets_for_month("2025-01", brand_id=self.brand_id)
        self.assertIsInstance(reports, list)
        self.assertGreaterEqual(len(reports), 1)
        self.assertIsInstance(reports[0], SalesPerformanceReport)


if __name__ == "__main__":
    unittest.main()
