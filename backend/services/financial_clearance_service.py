"""
OMNICAT ENTERPRISE - FINANCIAL CLEARANCE SERVICE
Calculates real-time COGS (HPP), actual logistics vs billed freight,
subsidy leakage, and Gross Contribution Margin (Laba Kontribusi Kotor).
Enforces RBAC protection: Sales role is strictly forbidden from accessing HPP and margins.
"""

from typing import Optional, List, Dict, Any

from backend.database import db
from backend.models import (
    FinancialClearanceInput,
    OrderFinancialsOutput,
    RegionalProfitabilitySummary
)

class FinancialClearanceService:
    def __init__(self, database=None):
        self.db = database or db

    def _verify_finance_role(self, cur, user_id: str, allow_viewer: bool = False):
        """Validates that user has privilege to access financial data."""
        cur.execute("SELECT role FROM users WHERE id = ?", (user_id,))
        row = cur.fetchone()
        if not row:
            raise PermissionError("Pengguna tidak terdaftar.")

        role = row["role"]
        allowed = ("SUPER_ADMIN", "FINANCE", "MANAGEMENT_VIEWER") if allow_viewer else ("SUPER_ADMIN", "FINANCE")
        if role not in allowed:
            raise PermissionError(
                f"Akses ditolak: Peran '{role}' dilarang mengakses data rahasia HPP dan margin finansial perusahaan."
            )
        return role

    def calculate_and_save_clearance(
        self,
        order_id: str,
        clearance_in: FinancialClearanceInput,
        evaluator_user_id: str
    ) -> OrderFinancialsOutput:
        """
        Computes and records financial clearance for an order.
        Calculates:
        - Total COGS (HPP)
        - Actual freight cost from trucking vendor
        - Net freight subsidy borne: max(0, actual_freight - transport_fee_billed)
        - Contribution Margin Amount: Net Invoice - COGS - Freight - Unloading
        - Contribution Margin %
        - Margin health threshold check (alert if < min_margin_percent)
        """
        with self.db.transaction() as cur:
            # 1. Enforce Role Privileges
            user_role = self._verify_finance_role(cur, evaluator_user_id)

            # 2. Fetch Order & Brand details
            cur.execute("""
                SELECT o.id, o.brand_id, o.net_invoice_grand_total, o.transport_fee_billed,
                       b.min_contribution_margin_percent
                FROM orders o
                JOIN brands b ON o.brand_id = b.id
                WHERE o.id = ?
            """, (order_id,))
            order = cur.fetchone()
            if not order:
                raise ValueError(f"Order dengan ID '{order_id}' tidak ditemukan.")

            net_invoice = order["net_invoice_grand_total"]
            transport_billed = order["transport_fee_billed"]
            min_margin_pct = order["min_contribution_margin_percent"] or 15.0

            # 3. Compute Total COGS from Line Items
            cur.execute("""
                SELECT coalesce(sum(line_cogs_total), 0.0) as total_cogs
                FROM order_items
                WHERE order_id = ?
            """, (order_id,))
            total_cogs = cur.fetchone()["total_cogs"]

            # 4. Compute Logistics, Subsidy & Margin
            actual_freight = clearance_in.actual_freight_cost
            actual_unloading = clearance_in.actual_unloading_cost
            net_subsidy = max(0.0, actual_freight - transport_billed)

            # Contribution Margin formula: Net Invoice - COGS - Actual Freight - Unloading
            cm_amount = net_invoice - total_cogs - actual_freight - actual_unloading
            cm_percent = round((cm_amount / net_invoice * 100.0), 2) if net_invoice > 0 else 0.0
            is_healthy = cm_percent >= min_margin_pct
            requires_override = not is_healthy

            # If margin is unhealthy and user is not SUPER_ADMIN, check if override reason was provided
            if requires_override and user_role != "SUPER_ADMIN":
                if not clearance_in.override_reason:
                    raise PermissionError(
                        f"Margin kontribusi order ({cm_percent}%) berada di bawah ambang batas sehat ({min_margin_pct}%). "
                        f"Persetujuan membutuhkan izin khusus Super Admin dengan alasan override tertulis."
                    )

            # 5. Insert or Update order_financials
            cur.execute("""
                INSERT INTO order_financials (
                    order_id, total_cogs_amount, actual_freight_cost, actual_unloading_cost,
                    net_transport_subsidy_borne, contribution_margin_amount,
                    contribution_margin_percent, is_margin_healthy
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(order_id) DO UPDATE SET
                    total_cogs_amount = excluded.total_cogs_amount,
                    actual_freight_cost = excluded.actual_freight_cost,
                    actual_unloading_cost = excluded.actual_unloading_cost,
                    net_transport_subsidy_borne = excluded.net_transport_subsidy_borne,
                    contribution_margin_amount = excluded.contribution_margin_amount,
                    contribution_margin_percent = excluded.contribution_margin_percent,
                    is_margin_healthy = excluded.is_margin_healthy
            """, (
                order_id, total_cogs, actual_freight, actual_unloading,
                net_subsidy, cm_amount, cm_percent, 1 if is_healthy else 0
            ))

            return OrderFinancialsOutput(
                order_id=order_id,
                net_invoice_grand_total=net_invoice,
                total_cogs_amount=total_cogs,
                actual_freight_cost=actual_freight,
                actual_unloading_cost=actual_unloading,
                net_transport_subsidy_borne=net_subsidy,
                contribution_margin_amount=cm_amount,
                contribution_margin_percent=cm_percent,
                is_margin_healthy=is_healthy,
                requires_superadmin_override=requires_override
            )

    def get_order_financials(self, order_id: str, user_id: str) -> OrderFinancialsOutput:
        """Retrieves financial clearance details for an order (Guarded by RBAC)."""
        conn = self.db.get_connection()
        cur = conn.cursor()
        try:
            self._verify_finance_role(cur, user_id, allow_viewer=True)

            cur.execute("""
                SELECT 
                    of.order_id,
                    o.net_invoice_grand_total,
                    of.total_cogs_amount,
                    of.actual_freight_cost,
                    of.actual_unloading_cost,
                    of.net_transport_subsidy_borne,
                    of.contribution_margin_amount,
                    of.contribution_margin_percent,
                    of.is_margin_healthy
                FROM order_financials of
                JOIN orders o ON of.order_id = o.id
                WHERE of.order_id = ?
            """, (order_id,))
            row = cur.fetchone()
            if not row:
                raise ValueError(f"Rincian finansial untuk order '{order_id}' belum dibuat.")

            return OrderFinancialsOutput(
                order_id=row["order_id"],
                net_invoice_grand_total=row["net_invoice_grand_total"],
                total_cogs_amount=row["total_cogs_amount"],
                actual_freight_cost=row["actual_freight_cost"],
                actual_unloading_cost=row["actual_unloading_cost"],
                net_transport_subsidy_borne=row["net_transport_subsidy_borne"],
                contribution_margin_amount=row["contribution_margin_amount"],
                contribution_margin_percent=row["contribution_margin_percent"],
                is_margin_healthy=bool(row["is_margin_healthy"]),
                requires_superadmin_override=not bool(row["is_margin_healthy"])
            )
        finally:
            conn.close()

    def get_regional_financial_summary(self, brand_id: str, user_id: str) -> List[RegionalProfitabilitySummary]:
        """Generates regional profitability breakdown (Guarded by RBAC)."""
        conn = self.db.get_connection()
        cur = conn.cursor()
        try:
            self._verify_finance_role(cur, user_id, allow_viewer=True)

            cur.execute("""
                SELECT 
                    r.id as region_id,
                    r.name as region_name,
                    count(o.id) as orders_count,
                    coalesce(sum(o.net_invoice_grand_total), 0.0) as total_revenue,
                    coalesce(sum(of.total_cogs_amount), 0.0) as total_cogs,
                    coalesce(sum(of.actual_freight_cost), 0.0) as total_freight,
                    coalesce(sum(of.net_transport_subsidy_borne), 0.0) as total_subsidy,
                    coalesce(sum(of.contribution_margin_amount), 0.0) as gross_margin
                FROM regions r
                JOIN customers c ON r.id = c.region_id
                JOIN orders o ON c.id = o.customer_id AND o.brand_id = ? AND o.status != 'SKIPPED_AUDIT'
                LEFT JOIN order_financials of ON o.id = of.order_id
                GROUP BY r.id, r.name
                ORDER BY total_revenue DESC
            """, (brand_id,))

            results = []
            for row in cur.fetchall():
                rev = row["total_revenue"]
                gm = row["gross_margin"]
                pct = round((gm / rev * 100.0), 2) if rev > 0 else 0.0
                results.append(RegionalProfitabilitySummary(
                    region_id=row["region_id"],
                    region_name=row["region_name"],
                    orders_count=row["orders_count"],
                    total_revenue=rev,
                    total_cogs=row["total_cogs"],
                    total_freight=row["total_freight"],
                    total_subsidy_borne=row["total_subsidy"],
                    gross_contribution_margin=gm,
                    margin_percent=pct
                ))
            return results
        finally:
            conn.close()

    def get_company_overall_summary(self, brand_id: str, user_id: str) -> Dict[str, Any]:
        """Generates company-wide financial performance report."""
        conn = self.db.get_connection()
        cur = conn.cursor()
        try:
            self._verify_finance_role(cur, user_id, allow_viewer=True)

            cur.execute("""
                SELECT 
                    count(o.id) as total_orders,
                    coalesce(sum(o.net_invoice_grand_total), 0.0) as total_revenue,
                    coalesce(sum(of.total_cogs_amount), 0.0) as total_cogs,
                    coalesce(sum(of.actual_freight_cost), 0.0) as total_freight,
                    coalesce(sum(of.net_transport_subsidy_borne), 0.0) as total_subsidy_borne,
                    coalesce(sum(of.contribution_margin_amount), 0.0) as total_contribution_margin
                FROM orders o
                LEFT JOIN order_financials of ON o.id = of.order_id
                WHERE o.brand_id = ? AND o.status != 'SKIPPED_AUDIT'
            """, (brand_id,))
            row = cur.fetchone()
            rev = row["total_revenue"]
            cm = row["total_contribution_margin"]
            pct = round((cm / rev * 100.0), 2) if rev > 0 else 0.0

            return {
                "total_orders": row["total_orders"],
                "total_revenue": rev,
                "total_cogs": row["total_cogs"],
                "total_freight": row["total_freight"],
                "total_subsidy_borne": row["total_subsidy_borne"],
                "total_contribution_margin": cm,
                "overall_margin_percent": pct
            }
        finally:
            conn.close()
