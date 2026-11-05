#!/usr/bin/env python3
"""
OMNICAT ENTERPRISE - ESTAFET SHARED FREIGHT OPTIMIZER TEST SUITE
Validates 7-day multi-order consolidation for East Java cluster (Bojonegoro, Tuban, Lamongan),
truck type selection (Engkel vs Fuso), proportional cost allocation, and what-if simulation.
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
TEST_DB_PATH = os.path.join(WORKSPACE_ROOT, "data", "test_freight.db")

from backend.database import Database
from backend.models import FreightOptimizationPlan, FreightClusterOrder
from backend.services.freight_optimizer_service import FreightOptimizerService

class TestFreightOptimizerService(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        if os.path.exists(TEST_DB_PATH):
            os.remove(TEST_DB_PATH)
        shutil.copyfile(CANONICAL_DB_PATH, TEST_DB_PATH)

        cls.db = Database(TEST_DB_PATH)
        cls.optimizer = FreightOptimizerService(cls.db)

    @classmethod
    def tearDownClass(cls):
        if os.path.exists(TEST_DB_PATH):
            os.remove(TEST_DB_PATH)

    def test_01_find_shared_freight_opportunities_east_java(self):
        """Tests that East Java historical orders yield shared freight plans with significant savings."""
        plans = self.optimizer.find_shared_freight_opportunities(cluster_key="EAST_JAVA", window_days=7)

        self.assertIsInstance(plans, list)
        self.assertGreaterEqual(len(plans), 1)

        # Inspect first plan
        plan = plans[0]
        self.assertIsInstance(plan, FreightOptimizationPlan)
        self.assertGreaterEqual(len(plan.orders), 2)
        self.assertGreater(plan.total_volume_liters, 0)
        self.assertIn(plan.recommended_truck_type, ["TRUK_ENGKEL_8T", "TRUK_FUSO_15T"])

        # Financial savings verification
        self.assertGreater(plan.standalone_total_freight_idr, plan.estafet_total_freight_idr)
        self.assertGreater(plan.projected_savings_idr, 0)
        self.assertGreater(plan.savings_percent, 10.0)

        # Proportional allocation invariant: sum of allocated freights must equal estafet total freight
        total_allocated = sum(o.allocated_freight_idr for o in plan.orders)
        self.assertAlmostEqual(total_allocated, plan.estafet_total_freight_idr, places=1)

    def test_02_truck_capacity_and_type_selection(self):
        """Verifies that truck selection strictly obeys 8,000L vs 15,000L capacity tiers."""
        plans = self.optimizer.find_shared_freight_opportunities(cluster_key="EAST_JAVA", window_days=7)

        for p in plans:
            if p.total_volume_liters <= 8000.0:
                self.assertEqual(p.recommended_truck_type, "TRUK_ENGKEL_8T")
                self.assertEqual(p.truck_capacity_liters, 8000.0)
            else:
                self.assertEqual(p.recommended_truck_type, "TRUK_FUSO_15T")
                self.assertEqual(p.truck_capacity_liters, 15000.0)

    def test_03_simulate_consolidation_what_if(self):
        """Tests what-if simulation for a proposed new order to Tuban near historical orders."""
        sim = self.optimizer.simulate_consolidation(
            new_region="TUBAN",
            new_volume_liters=3500.0,
            target_date=date(2025, 1, 15),
            cluster_key="EAST_JAVA",
            window_days=7
        )

        self.assertIsInstance(sim, dict)
        if sim["can_consolidate"]:
            self.assertGreater(sim["projected_savings_idr"], 0)
            self.assertGreater(sim["savings_percent"], 0)
            self.assertIn("REKOMENDASI LOGISTIK", sim["recommendation"])
            self.assertIn("TUBAN", sim["route_stops"])

    def test_04_simulate_unsupported_region_rejection(self):
        """Tests that a region outside the cluster cannot be consolidated into that cluster."""
        sim = self.optimizer.simulate_consolidation(
            new_region="TIMIKA",
            new_volume_liters=3000.0,
            target_date=date(2026, 2, 1),
            cluster_key="EAST_JAVA"
        )
        self.assertFalse(sim["can_consolidate"])
        self.assertIn("tidak termasuk", sim["reason"])

if __name__ == "__main__":
    unittest.main()
