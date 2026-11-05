"""
OMNICAT ENTERPRISE - ESTAFET SHARED FREIGHT OPTIMIZER
Consolidates multi-destination shipments within 7-day order windows for geographic clusters
(e.g., East Java: Bojonegoro, Tuban, Lamongan) to eliminate transport subsidy leakage.
"""

import os
import uuid
from datetime import date, datetime, timedelta
from typing import Optional, List, Dict, Any

from backend.database import db
from backend.models import FreightClusterOrder, FreightOptimizationPlan

# 1. Geographic Cluster Definitions
CLUSTERS = {
    "EAST_JAVA": {
        "name": "Kluster Jawa Timur Utara",
        "regions": ["TUBAN", "LAMONGAN", "BOJONEGORO"],
        "default_route": ["Gudang Pusat", "Lamongan", "Tuban", "Bojonegoro"]
    },
    "CENTRAL_JAVA": {
        "name": "Kluster Jawa Tengah",
        "regions": ["SEMARANG", "CILACAP"],
        "default_route": ["Gudang Pusat", "Semarang", "Cilacap"]
    }
}

# 2. Standalone Freight Rates (Cost if shipped individually)
STANDALONE_FREIGHT_RATES = {
    "TUBAN": 2750000.0,
    "LAMONGAN": 2500000.0,
    "BOJONEGORO": 3000000.0,
    "SEMARANG": 3500000.0,
    "CILACAP": 4500000.0,
    "BLITAR": 2500000.0,
    "TIMIKA": 8000000.0
}

# 3. Freight Truck Specifications
TRUCK_SPECS = {
    "TRUK_ENGKEL_8T": {
        "name": "Truk Engkel Box (8 Ton)",
        "capacity_liters": 8000.0,
        "base_cost_east_java": 2800000.0,
        "base_cost_central_java": 3800000.0,
        "multi_drop_surcharge": 250000.0
    },
    "TRUK_FUSO_15T": {
        "name": "Truk Fuso Long (15 Ton)",
        "capacity_liters": 15000.0,
        "base_cost_east_java": 4250000.0,
        "base_cost_central_java": 5500000.0,
        "multi_drop_surcharge": 350000.0
    }
}

class FreightOptimizerService:
    def __init__(self, database=None):
        self.db = database or db

    def find_shared_freight_opportunities(
        self,
        cluster_key: str = "EAST_JAVA",
        window_days: int = 7,
        brand_id: Optional[str] = None
    ) -> List[FreightOptimizationPlan]:
        """
        Scans historical/active orders in a geographic cluster, groups them within a 7-day
        sliding window, and constructs optimal shared Estafet truck dispatch plans.
        """
        cluster_cfg = CLUSTERS.get(cluster_key)
        if not cluster_cfg:
            raise ValueError(f"Kluster '{cluster_key}' tidak valid. Pilihan: {list(CLUSTERS.keys())}")

        cluster_regions = cluster_cfg["regions"]

        conn = self.db.get_connection()
        cur = conn.cursor()
        try:
            # Query all non-skipped orders for regions in this cluster
            placeholders = ",".join("?" for _ in cluster_regions)
            query = f"""
                SELECT 
                    o.id as order_id, o.customer_id, c.name as customer_name,
                    r.name as region_name, o.order_date, o.total_order_volume,
                    o.transport_fee_billed
                FROM orders o
                JOIN customers c ON o.customer_id = c.id
                JOIN regions r ON c.region_id = r.id
                WHERE r.name IN ({placeholders})
                  AND o.status != 'SKIPPED_AUDIT'
            """
            params = list(cluster_regions)
            if brand_id:
                query += " AND o.brand_id = ?"
                params.append(brand_id)

            query += " ORDER BY o.order_date ASC, o.doc_number ASC"

            cur.execute(query, params)
            rows = cur.fetchall()
        finally:
            conn.close()

        if not rows:
            return []

        # Parse orders into domain structs
        parsed_orders = []
        for r in rows:
            reg = r["region_name"]
            std_freight = STANDALONE_FREIGHT_RATES.get(reg, 2500000.0)
            parsed_orders.append({
                "order_id": r["order_id"],
                "customer_id": r["customer_id"],
                "customer_name": r["customer_name"],
                "region_name": reg,
                "order_date": r["order_date"],
                "order_dt": date.fromisoformat(r["order_date"][:10]),
                "volume_liters": r["total_order_volume"],
                "standalone_freight_idr": std_freight
            })

        # Group orders using a 7-day sliding consolidation window
        plans = []
        visited_order_ids = set()

        for i, lead_order in enumerate(parsed_orders):
            if lead_order["order_id"] in visited_order_ids:
                continue

            window_start_dt = lead_order["order_dt"]
            window_end_dt = window_start_dt + timedelta(days=window_days)

            # Collect candidate orders falling within window
            window_batch = []
            for candidate in parsed_orders[i:]:
                if candidate["order_id"] in visited_order_ids:
                    continue
                if window_start_dt <= candidate["order_dt"] <= window_end_dt:
                    window_batch.append(candidate)

            # Consolidate if batch contains at least 2 orders
            if len(window_batch) >= 2:
                for b in window_batch:
                    visited_order_ids.add(b["order_id"])

                plan = self._build_optimization_plan(cluster_key, cluster_cfg, window_start_dt, window_end_dt, window_batch)
                plans.append(plan)

        return plans

    def _build_optimization_plan(
        self,
        cluster_key: str,
        cluster_cfg: Dict[str, Any],
        window_start_dt: date,
        window_end_dt: date,
        batch: List[Dict[str, Any]]
    ) -> FreightOptimizationPlan:
        """Constructs an Estafet freight plan with proportional cost allocation."""
        total_vol = sum(b["volume_liters"] for b in batch)
        standalone_total = sum(b["standalone_freight_idr"] for b in batch)

        # Select Truck Type based on combined volume
        if total_vol <= 8000.0:
            truck_type = "TRUK_ENGKEL_8T"
            spec = TRUCK_SPECS["TRUK_ENGKEL_8T"]
            base_cost = spec["base_cost_east_java"] if cluster_key == "EAST_JAVA" else spec["base_cost_central_java"]
        else:
            truck_type = "TRUK_FUSO_15T"
            spec = TRUCK_SPECS["TRUK_FUSO_15T"]
            base_cost = spec["base_cost_east_java"] if cluster_key == "EAST_JAVA" else spec["base_cost_central_java"]

        capacity = spec["capacity_liters"]
        multi_drop_rate = spec["multi_drop_surcharge"]

        # Distinct delivery destinations in this batch
        distinct_regions = list(dict.fromkeys(b["region_name"] for b in batch))
        multi_drops_count = max(0, len(distinct_regions) - 1)

        estafet_cost = base_cost + (multi_drops_count * multi_drop_rate)
        savings_idr = max(0.0, standalone_total - estafet_cost)
        savings_pct = round((savings_idr / standalone_total * 100), 2) if standalone_total > 0 else 0.0
        utilization_pct = round((total_vol / capacity * 100), 2)

        # Proportional cost allocation based on volume
        allocated_orders = []
        for b in batch:
            vol_ratio = (b["volume_liters"] / total_vol) if total_vol > 0 else 0.0
            order_alloc_freight = round(estafet_cost * vol_ratio, 2)
            order_alloc_savings = round(b["standalone_freight_idr"] - order_alloc_freight, 2)

            allocated_orders.append(FreightClusterOrder(
                order_id=b["order_id"],
                customer_id=b["customer_id"],
                customer_name=b["customer_name"],
                region_name=b["region_name"],
                order_date=b["order_date"],
                volume_liters=b["volume_liters"],
                standalone_freight_idr=b["standalone_freight_idr"],
                allocated_freight_idr=order_alloc_freight,
                allocated_savings_idr=order_alloc_savings
            ))

        route_stops = ["Gudang Pusat (Pabrik)"] + distinct_regions

        return FreightOptimizationPlan(
            plan_id=f"ESTAFET-{cluster_key}-{window_start_dt.strftime('%Y%m%d')}",
            cluster_name=cluster_cfg["name"],
            window_start=window_start_dt.isoformat(),
            window_end=window_end_dt.isoformat(),
            recommended_truck_type=truck_type,
            truck_capacity_liters=capacity,
            total_volume_liters=total_vol,
            truck_utilization_percent=utilization_pct,
            standalone_total_freight_idr=standalone_total,
            estafet_total_freight_idr=estafet_cost,
            projected_savings_idr=savings_idr,
            savings_percent=savings_pct,
            orders=allocated_orders,
            route_stops=route_stops
        )

    def simulate_consolidation(
        self,
        new_region: str,
        new_volume_liters: float,
        target_date: date,
        cluster_key: str = "EAST_JAVA",
        window_days: int = 7
    ) -> Dict[str, Any]:
        """
        Simulates if a proposed new order can be consolidated with existing orders
        in the same cluster within +/- window_days to save freight subsidies.
        """
        cluster_cfg = CLUSTERS.get(cluster_key)
        if not cluster_cfg or new_region not in cluster_cfg["regions"]:
            return {
                "can_consolidate": False,
                "reason": f"Wilayah '{new_region}' tidak termasuk dalam kluster '{cluster_key}'."
            }

        start_dt = target_date - timedelta(days=window_days)
        end_dt = target_date + timedelta(days=window_days)

        conn = self.db.get_connection()
        cur = conn.cursor()
        try:
            placeholders = ",".join("?" for _ in cluster_cfg["regions"])
            cur.execute(f"""
                SELECT 
                    o.id, c.name as customer_name, r.name as region_name,
                    o.order_date, o.total_order_volume
                FROM orders o
                JOIN customers c ON o.customer_id = c.id
                JOIN regions r ON c.region_id = r.id
                WHERE r.name IN ({placeholders})
                  AND o.status != 'SKIPPED_AUDIT'
                  AND o.order_date BETWEEN ? AND ?
                LIMIT 5
            """, list(cluster_cfg["regions"]) + [start_dt.isoformat(), end_dt.isoformat()])
            nearby_orders = cur.fetchall()
        finally:
            conn.close()

        if not nearby_orders:
            standalone_cost = STANDALONE_FREIGHT_RATES.get(new_region, 2500000.0)
            return {
                "can_consolidate": False,
                "reason": f"Tidak ada pesanan lain di kluster {cluster_key} dalam jendela +/- {window_days} hari.",
                "standalone_freight_idr": standalone_cost
            }

        # Build simulated batch
        sim_batch = []
        for o in nearby_orders:
            sim_batch.append({
                "order_id": o["id"],
                "customer_id": "existing",
                "customer_name": o["customer_name"],
                "region_name": o["region_name"],
                "order_date": o["order_date"],
                "volume_liters": o["total_order_volume"],
                "standalone_freight_idr": STANDALONE_FREIGHT_RATES.get(o["region_name"], 2500000.0)
            })

        # Add new simulated order
        sim_batch.append({
            "order_id": "SIMULATED-NEW",
            "customer_id": "new",
            "customer_name": f"Pesanan Baru {new_region}",
            "region_name": new_region,
            "order_date": target_date.isoformat(),
            "volume_liters": new_volume_liters,
            "standalone_freight_idr": STANDALONE_FREIGHT_RATES.get(new_region, 2500000.0)
        })

        plan = self._build_optimization_plan(cluster_key, cluster_cfg, start_dt, end_dt, sim_batch)

        return {
            "can_consolidate": True,
            "recommended_truck": plan.recommended_truck_type,
            "combined_volume_liters": plan.total_volume_liters,
            "truck_utilization_percent": plan.truck_utilization_percent,
            "standalone_total_freight_idr": plan.standalone_total_freight_idr,
            "estafet_total_freight_idr": plan.estafet_total_freight_idr,
            "projected_savings_idr": plan.projected_savings_idr,
            "savings_percent": plan.savings_percent,
            "route_stops": plan.route_stops,
            "consolidated_orders_count": len(plan.orders),
            "recommendation": (
                f"REKOMENDASI LOGISTIK: Gabungkan pesanan {new_region} ({new_volume_liters:,.0f} L) "
                f"dengan {len(nearby_orders)} pesanan sekitar menggunakan {plan.recommended_truck_type}. "
                f"Estimasi penghematan subsidi transport: Rp {plan.projected_savings_idr:,.0f} ({plan.savings_percent}%)."
            )
        }
