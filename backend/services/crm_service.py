"""
OMNICAT ENTERPRISE - SALES CRM & REPEAT ORDER CADENCE ENGINE
Calculates customer repeat-order intervals, median cadence, churn alerts,
and urgent replenishment opportunities for field sales operations.
"""

import os
import uuid
import statistics
from datetime import date, datetime, timedelta
from typing import Optional, List, Dict, Any

from backend.database import db
from backend.models import (
    CustomerCadenceMetric,
    SalesCrmSummary,
    SalesTargetInput,
    SalesPerformanceReport
)

HEALTH_PRIORITY_ORDER = {
    "DUE_FOR_REORDER": 0,
    "CHURN_ALERT": 1,
    "OVERDUE": 2,
    "ACTIVE": 3,
    "NEW_CUSTOMER": 4,
    "INACTIVE": 5
}

class CrmService:
    def __init__(self, database=None):
        self.db = database or db
        self._ensure_tables()

    def _ensure_tables(self):
        """Ensures CRM activity and target tracking tables exist in SQLite/Postgres."""
        conn = self.db.get_connection()
        cur = conn.cursor()
        try:
            cur.execute("""
                CREATE TABLE IF NOT EXISTS sales_activities (
                    id TEXT PRIMARY KEY,
                    customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
                    sales_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    activity_type TEXT NOT NULL CHECK (activity_type IN ('CALL', 'VISIT', 'WHATSAPP', 'SAMPLE_SENT', 'DEMO')),
                    notes TEXT NOT NULL,
                    follow_up_date TEXT,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP
                )
            """)
            cur.execute("""
                CREATE TABLE IF NOT EXISTS sales_targets (
                    id TEXT PRIMARY KEY,
                    sales_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    brand_id TEXT NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
                    target_month TEXT NOT NULL, -- Format: YYYY-MM
                    target_volume_liters REAL NOT NULL,
                    target_revenue_idr REAL NOT NULL,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE(sales_user_id, brand_id, target_month)
                )
            """)
            conn.commit()
        finally:
            conn.close()

    def calculate_customer_cadence(self, customer_id: str, as_of_date: Optional[date] = None) -> CustomerCadenceMetric:
        """
        Calculates customer repeat-order cadence, median interval, days since last order,
        health status classification, and recommended sales actions.
        """
        if as_of_date is None:
            as_of_date = date.today()

        conn = self.db.get_connection()
        cur = conn.cursor()
        try:
            # 1. Fetch Customer and Region Details
            cur.execute("""
                SELECT c.id, c.name, c.brand_id, c.phone, r.name as region_name, c.owner_doctor_name
                FROM customers c
                JOIN regions r ON c.region_id = r.id
                WHERE c.id = ?
            """, (customer_id,))
            cust_row = cur.fetchone()
            if not cust_row:
                raise ValueError(f"Customer dengan ID '{customer_id}' tidak ditemukan.")

            # 2. Fetch All Non-Skipped Orders sorted chronologically
            cur.execute("""
                SELECT id, order_date, total_order_volume, net_invoice_grand_total
                FROM orders
                WHERE customer_id = ? AND status != 'SKIPPED_AUDIT'
                ORDER BY order_date ASC, doc_number ASC
            """, (customer_id,))
            order_rows = cur.fetchall()

            total_orders = len(order_rows)
            total_volume = sum(r["total_order_volume"] for r in order_rows)
            lifetime_revenue = sum(r["net_invoice_grand_total"] for r in order_rows)

            # 3. Determine Favorite Product Variant
            cur.execute("""
                SELECT pv.name, SUM(oi.quantity) as total_qty
                FROM order_items oi
                JOIN orders o ON oi.order_id = o.id
                JOIN product_variants pv ON oi.variant_id = pv.id
                WHERE o.customer_id = ? AND o.status != 'SKIPPED_AUDIT'
                GROUP BY pv.name
                ORDER BY total_qty DESC
                LIMIT 1
            """, (customer_id,))
            fav_row = cur.fetchone()
            favorite_variant = fav_row["name"] if fav_row else None

            # 4. Handle Edge Case: Zero or Single Order
            if total_orders == 0:
                return CustomerCadenceMetric(
                    customer_id=customer_id,
                    customer_name=cust_row["name"],
                    region_name=cust_row["region_name"],
                    phone=cust_row["phone"],
                    brand_id=cust_row["brand_id"],
                    total_orders=0,
                    total_volume_liters=0.0,
                    lifetime_revenue_idr=0.0,
                    first_order_date=None,
                    last_order_date=None,
                    median_interval_days=None,
                    average_interval_days=None,
                    days_since_last_order=9999,
                    expected_next_order_date=None,
                    health_status="NEW_CUSTOMER",
                    recommended_action="Belum pernah bertransaksi. Jadwalkan perkenalan produk dan kirimkan sampel.",
                    favorite_variant=None
                )

            # Parse dates
            parsed_dates = []
            for r in order_rows:
                d_str = r["order_date"]
                try:
                    parsed_dates.append(date.fromisoformat(d_str[:10]))
                except Exception:
                    continue

            first_order_str = parsed_dates[0].isoformat() if parsed_dates else None
            last_order_date = parsed_dates[-1] if parsed_dates else as_of_date
            last_order_str = last_order_date.isoformat()

            days_since = max(0, (as_of_date - last_order_date).days)

            if len(parsed_dates) < 2:
                # Only 1 historical transaction
                expected_next = (last_order_date + timedelta(days=30)).isoformat()
                return CustomerCadenceMetric(
                    customer_id=customer_id,
                    customer_name=cust_row["name"],
                    region_name=cust_row["region_name"],
                    phone=cust_row["phone"],
                    brand_id=cust_row["brand_id"],
                    total_orders=1,
                    total_volume_liters=total_volume,
                    lifetime_revenue_idr=lifetime_revenue,
                    first_order_date=first_order_str,
                    last_order_date=last_order_str,
                    median_interval_days=None,
                    average_interval_days=None,
                    days_since_last_order=days_since,
                    expected_next_order_date=expected_next,
                    health_status="NEW_CUSTOMER",
                    recommended_action="Pelanggan baru (1x order). Lakukan follow-up kepuasan penggunaan dan penawaran reorder perdana.",
                    favorite_variant=favorite_variant
                )

            # 5. Compute Cadence Intervals
            intervals = []
            for i in range(1, len(parsed_dates)):
                delta_days = (parsed_dates[i] - parsed_dates[i - 1]).days
                # Avoid counting 0 days if multiple orders placed same day
                if delta_days > 0:
                    intervals.append(delta_days)

            if not intervals:
                intervals = [30] # Default fallback if all orders occurred on the same day

            median_interval = float(statistics.median(intervals))
            average_interval = round(sum(intervals) / len(intervals), 1)

            expected_next_order_date = (last_order_date + timedelta(days=round(median_interval))).isoformat()

            # 6. Health Status Classification
            # - ACTIVE: Within normal cadence window (days_since <= median - 3)
            # - DUE_FOR_REORDER: Prime replenishment window (median - 3 < days_since <= median)
            # - OVERDUE: Replenishment window passed (median < days_since <= 1.5 * median)
            # - CHURN_ALERT: Critical lapse, defection risk (1.5 * median < days_since <= 3.0 * median)
            # - INACTIVE: Dormant account (days_since > 3.0 * median)
            if days_since <= max(1, median_interval - 3):
                health_status = "ACTIVE"
                action = (
                    f"Pelanggan aktif berjalan sesuai siklus ({round(median_interval)} hari). "
                    f"Terakhir order {days_since} hari lalu. Pantau stok secara berkala."
                )
            elif days_since <= median_interval:
                health_status = "DUE_FOR_REORDER"
                action = (
                    f"WAKTU REORDER TEPAT! Estimasi persediaan menipis ({days_since} hari vs siklus {round(median_interval)} hari). "
                    f"Kirim penawaran restock ke {cust_row['owner_doctor_name'] or cust_row['name']} via WhatsApp."
                )
            elif days_since <= 1.5 * median_interval:
                health_status = "OVERDUE"
                action = (
                    f"TELAT REORDER ({days_since} hari sejak order terakhir > median {round(median_interval)} hari). "
                    f"Tawarkan voucher diskon atau subsidi ongkir untuk mempercepat pesanan."
                )
            elif days_since <= 3.0 * median_interval:
                health_status = "CHURN_ALERT"
                action = (
                    f"PERINGATAN BAHAYA CHURN! Terlambat {days_since} hari ({round(days_since / median_interval, 1)}x siklus). "
                    f"Segera jadwalkan kunjungan tatap muka atau hubungi pemilik klinik untuk evaluasi kendala."
                )
            else:
                health_status = "INACTIVE"
                action = (
                    f"Pelanggan pasif/dorman (>3x siklus reorder tanpa transaksi). "
                    f"Diperlukan re-aktivasi penjualan khusus atau pengecekan kompetitor."
                )

            return CustomerCadenceMetric(
                customer_id=customer_id,
                customer_name=cust_row["name"],
                region_name=cust_row["region_name"],
                phone=cust_row["phone"],
                brand_id=cust_row["brand_id"],
                total_orders=total_orders,
                total_volume_liters=total_volume,
                lifetime_revenue_idr=lifetime_revenue,
                first_order_date=first_order_str,
                last_order_date=last_order_str,
                median_interval_days=median_interval,
                average_interval_days=average_interval,
                days_since_last_order=days_since,
                expected_next_order_date=expected_next_order_date,
                health_status=health_status,
                recommended_action=action,
                favorite_variant=favorite_variant
            )
        finally:
            conn.close()

    def get_all_customers_cadence(
        self,
        brand_id: Optional[str] = None,
        sales_user_id: Optional[str] = None,
        as_of_date: Optional[date] = None
    ) -> List[CustomerCadenceMetric]:
        """
        Calculates cadence metrics for all customers matching filter,
        sorted by urgency (DUE_FOR_REORDER -> CHURN_ALERT -> OVERDUE -> ACTIVE -> NEW_CUSTOMER -> INACTIVE).
        """
        conn = self.db.get_connection()
        cur = conn.cursor()
        try:
            query = "SELECT id FROM customers WHERE 1=1"
            params = []
            if brand_id:
                query += " AND brand_id = ?"
                params.append(brand_id)
            if sales_user_id:
                query += " AND assigned_sales_id = ?"
                params.append(sales_user_id)

            cur.execute(query, params)
            customer_ids = [r["id"] for r in cur.fetchall()]
        finally:
            conn.close()

        metrics = [self.calculate_customer_cadence(cid, as_of_date=as_of_date) for cid in customer_ids]

        # Sort primarily by Health Priority, then descending by lifetime revenue
        metrics.sort(
            key=lambda m: (
                HEALTH_PRIORITY_ORDER.get(m.health_status, 99),
                -m.lifetime_revenue_idr
            )
        )
        return metrics

    def get_sales_crm_summary(
        self,
        brand_id: Optional[str] = None,
        sales_user_id: Optional[str] = None,
        as_of_date: Optional[date] = None
    ) -> SalesCrmSummary:
        """Aggregates CRM health status counts and priority distribution across customer base."""
        all_metrics = self.get_all_customers_cadence(
            brand_id=brand_id,
            sales_user_id=sales_user_id,
            as_of_date=as_of_date
        )

        counts = {
            "ACTIVE": 0,
            "DUE_FOR_REORDER": 0,
            "OVERDUE": 0,
            "CHURN_ALERT": 0,
            "INACTIVE": 0,
            "NEW_CUSTOMER": 0
        }

        for m in all_metrics:
            if m.health_status in counts:
                counts[m.health_status] += 1

        return SalesCrmSummary(
            total_customers=len(all_metrics),
            active_count=counts["ACTIVE"],
            due_for_reorder_count=counts["DUE_FOR_REORDER"],
            overdue_count=counts["OVERDUE"],
            churn_alert_count=counts["CHURN_ALERT"],
            inactive_count=counts["INACTIVE"],
            new_customer_count=counts["NEW_CUSTOMER"],
            customers=all_metrics
        )

    def log_sales_activity(
        self,
        customer_id: str,
        sales_user_id: str,
        activity_type: str,
        notes: str,
        follow_up_date: Optional[str] = None
    ) -> str:
        """Logs a CRM touchpoint / sales field activity."""
        valid_activities = ('CALL', 'VISIT', 'WHATSAPP', 'SAMPLE_SENT', 'DEMO')
        if activity_type not in valid_activities:
            raise ValueError(f"activity_type harus salah satu dari: {valid_activities}")

        if not notes or not notes.strip():
            raise ValueError("Catatan aktivitas sales (notes) tidak boleh kosong.")

        activity_id = str(uuid.uuid4())
        conn = self.db.get_connection()
        cur = conn.cursor()
        try:
            cur.execute("""
                INSERT INTO sales_activities (id, customer_id, sales_user_id, activity_type, notes, follow_up_date)
                VALUES (?, ?, ?, ?, ?, ?)
            """, (activity_id, customer_id, sales_user_id, activity_type, notes.strip(), follow_up_date))
            conn.commit()
            return activity_id
        finally:
            conn.close()

    def get_customer_activities(self, customer_id: str, limit: int = 20) -> List[Dict[str, Any]]:
        """Retrieves history of sales touchpoints for a specific customer."""
        conn = self.db.get_connection()
        cur = conn.cursor()
        try:
            cur.execute("""
                SELECT sa.id, sa.customer_id, sa.sales_user_id, sa.activity_type, sa.notes,
                       sa.follow_up_date, sa.created_at, u.full_name as sales_name
                FROM sales_activities sa
                JOIN users u ON sa.sales_user_id = u.id
                WHERE sa.customer_id = ?
                ORDER BY sa.created_at DESC, sa.rowid DESC
                LIMIT ?
            """, (customer_id, limit))
            return [dict(r) for r in cur.fetchall()]
        finally:
            conn.close()

    def set_sales_target(self, target_input: SalesTargetInput) -> str:
        """Sets or updates a monthly sales volume and revenue target for a sales representative."""
        # 1. Validate Month Format (YYYY-MM)
        if len(target_input.target_month) != 7 or target_input.target_month[4] != "-":
            raise ValueError(f"Format target_month harus 'YYYY-MM', ditemukan: '{target_input.target_month}'.")

        try:
            year = int(target_input.target_month[:4])
            month = int(target_input.target_month[5:7])
            if month < 1 or month > 12:
                raise ValueError()
        except Exception:
            raise ValueError(f"Bulan target '{target_input.target_month}' tidak valid.")

        if target_input.target_volume_liters <= 0:
            raise ValueError("Target volume liter harus lebih besar dari 0.")

        if target_input.target_revenue_idr <= 0:
            raise ValueError("Target revenue omset harus lebih besar dari Rp 0.")

        conn = self.db.get_connection()
        cur = conn.cursor()
        try:
            # Verify sales user exists
            cur.execute("SELECT id, role FROM users WHERE id = ?", (target_input.sales_user_id,))
            u = cur.fetchone()
            if not u:
                raise ValueError(f"User sales dengan ID '{target_input.sales_user_id}' tidak ditemukan.")

            # Verify brand exists
            cur.execute("SELECT id FROM brands WHERE id = ?", (target_input.brand_id,))
            b = cur.fetchone()
            if not b:
                raise ValueError(f"Brand dengan ID '{target_input.brand_id}' tidak ditemukan.")

            target_id = str(uuid.uuid4())
            cur.execute("""
                INSERT INTO sales_targets (id, sales_user_id, brand_id, target_month, target_volume_liters, target_revenue_idr)
                VALUES (?, ?, ?, ?, ?, ?)
                ON CONFLICT(sales_user_id, brand_id, target_month)
                DO UPDATE SET
                    target_volume_liters = excluded.target_volume_liters,
                    target_revenue_idr = excluded.target_revenue_idr
            """, (
                target_id,
                target_input.sales_user_id,
                target_input.brand_id,
                target_input.target_month,
                target_input.target_volume_liters,
                target_input.target_revenue_idr
            ))
            conn.commit()
            return target_id
        finally:
            conn.close()

    def get_sales_performance(self, sales_user_id: str, brand_id: str, target_month: str) -> SalesPerformanceReport:
        """
        Calculates sales rep target attainment vs actuals for a specific month.
        Attainment is measured on actual volume (liters) and revenue (IDR) from orders.
        """
        conn = self.db.get_connection()
        cur = conn.cursor()
        try:
            # 1. Fetch Sales User Details
            cur.execute("SELECT id, full_name FROM users WHERE id = ?", (sales_user_id,))
            user_row = cur.fetchone()
            if not user_row:
                raise ValueError(f"User sales dengan ID '{sales_user_id}' tidak ditemukan.")
            sales_name = user_row["full_name"]

            # 2. Fetch Configured Target for this Month
            cur.execute("""
                SELECT target_volume_liters, target_revenue_idr
                FROM sales_targets
                WHERE sales_user_id = ? AND brand_id = ? AND target_month = ?
            """, (sales_user_id, brand_id, target_month))
            target_row = cur.fetchone()

            target_vol = target_row["target_volume_liters"] if target_row else 0.0
            target_rev = target_row["target_revenue_idr"] if target_row else 0.0

            # 3. Fetch Actual Order Performance for this Month
            cur.execute("""
                SELECT COUNT(*) as orders_count,
                       COALESCE(SUM(total_order_volume), 0.0) as actual_volume,
                       COALESCE(SUM(net_invoice_grand_total), 0.0) as actual_revenue
                FROM orders
                WHERE brand_id = ?
                  AND (created_by_sales_id = ? OR customer_id IN (SELECT id FROM customers WHERE assigned_sales_id = ?))
                  AND status != 'SKIPPED_AUDIT'
                  AND substr(order_date, 1, 7) = ?
            """, (brand_id, sales_user_id, sales_user_id, target_month))
            actual_row = cur.fetchone()

            orders_count = actual_row["orders_count"]
            actual_vol = actual_row["actual_volume"]
            actual_rev = actual_row["actual_revenue"]

            # 4. Attainment Rates
            vol_attainment = round((actual_vol / target_vol * 100), 2) if target_vol > 0 else 0.0
            rev_attainment = round((actual_rev / target_rev * 100), 2) if target_rev > 0 else 0.0
            aov = round(actual_rev / orders_count, 2) if orders_count > 0 else 0.0

            # 5. Performance Status
            primary_attainment = rev_attainment if target_rev > 0 else vol_attainment
            if primary_attainment >= 100.0:
                perf_status = "EXCEEDED"
            elif primary_attainment >= 75.0:
                perf_status = "ON_TRACK"
            elif primary_attainment >= 40.0:
                perf_status = "AT_RISK"
            else:
                perf_status = "LAGGING"

            return SalesPerformanceReport(
                sales_user_id=sales_user_id,
                sales_name=sales_name,
                brand_id=brand_id,
                target_month=target_month,
                target_volume_liters=target_vol,
                actual_volume_liters=actual_vol,
                volume_attainment_percent=vol_attainment,
                target_revenue_idr=target_rev,
                actual_revenue_idr=actual_rev,
                revenue_attainment_percent=rev_attainment,
                orders_count=orders_count,
                average_order_value_idr=aov,
                performance_status=perf_status
            )
        finally:
            conn.close()

    def get_all_sales_targets_for_month(
        self,
        target_month: str,
        brand_id: Optional[str] = None
    ) -> List[SalesPerformanceReport]:
        """Lists performance reports across all active sales reps for a given month."""
        conn = self.db.get_connection()
        cur = conn.cursor()
        try:
            # Query default brand if not specified
            if not brand_id:
                cur.execute("SELECT id FROM brands WHERE is_active = 1 LIMIT 1")
                b_row = cur.fetchone()
                brand_id = b_row["id"] if b_row else ""

            cur.execute("SELECT id FROM users WHERE role = 'SALES' AND is_active = 1")
            sales_users = [r["id"] for r in cur.fetchall()]
        finally:
            conn.close()

        reports = [self.get_sales_performance(uid, brand_id, target_month) for uid in sales_users]
        reports.sort(key=lambda r: -r.revenue_attainment_percent)
        return reports

