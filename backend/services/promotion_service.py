"""
OMNICAT ENTERPRISE - PROMOTION & DISCOUNT SERVICE
Manages promotional rules, discount vouchers, transport subsidies,
free freight for full truckloads, and minimum volume criteria.
"""

import uuid
from datetime import datetime, date
from typing import Optional, List, Dict, Any

from backend.database import db
from backend.models import (
    CreatePromotionInput,
    PromotionOutput,
    PromoValidationResult
)

VALID_PROMO_TYPES = (
    "PERCENTAGE_DISCOUNT",
    "FIXED_DISCOUNT",
    "FREE_TRANSPORT",
    "SUBSIDIZED_TRANSPORT",
    "FREE_GOODS"
)

class PromotionService:
    def __init__(self, database=None):
        self.db = database or db

    def create_promotion(self, promo_in: CreatePromotionInput, user_id: str) -> PromotionOutput:
        """Creates a new promotion rule (SUPER_ADMIN or FINANCE only)."""
        with self.db.transaction() as cur:
            # 1. Enforce RBAC
            cur.execute("SELECT role FROM users WHERE id = ?", (user_id,))
            user = cur.fetchone()
            if not user or user["role"] not in ("SUPER_ADMIN", "FINANCE"):
                raise PermissionError("Hanya Super Admin atau Finance yang berwenang membuat promo/diskon.")

            # 2. Validate Inputs
            if not promo_in.code or not promo_in.code.strip():
                raise ValueError("Kode promo wajib diisi.")
            code = promo_in.code.strip().upper()

            if promo_in.promo_type not in VALID_PROMO_TYPES:
                raise ValueError(f"Tipe promo '{promo_in.promo_type}' tidak valid. Pilihan: {VALID_PROMO_TYPES}")

            start_dt = promo_in.start_date or date.today().isoformat()
            end_dt = promo_in.end_date or (date.today().replace(year=date.today().year + 1)).isoformat()
            if start_dt > end_dt:
                raise ValueError("Tanggal mulai promo tidak boleh melewati tanggal berakhir.")

            # 3. Check Code Uniqueness
            cur.execute("SELECT id FROM promotions WHERE code = ?", (code,))
            if cur.fetchone():
                raise ValueError(f"Kode promo '{code}' sudah digunakan.")

            promo_id = str(uuid.uuid4())
            cur.execute("""
                INSERT INTO promotions (
                    id, brand_id, code, name, promo_type, discount_percent,
                    discount_fixed_amount, min_order_volume, start_date, end_date,
                    requires_admin_approval, is_active
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
            """, (
                promo_id, promo_in.brand_id, code, promo_in.name, promo_in.promo_type,
                promo_in.discount_percent, promo_in.discount_fixed_amount, promo_in.min_order_volume,
                start_dt, end_dt, 1 if promo_in.requires_admin_approval else 0
            ))

            return PromotionOutput(
                id=promo_id,
                brand_id=promo_in.brand_id,
                code=code,
                name=promo_in.name,
                promo_type=promo_in.promo_type,
                discount_percent=promo_in.discount_percent,
                discount_fixed_amount=promo_in.discount_fixed_amount,
                min_order_volume=promo_in.min_order_volume,
                start_date=start_dt,
                end_date=end_dt,
                requires_admin_approval=promo_in.requires_admin_approval,
                is_active=True
            )

    def validate_promotion(
        self,
        promo_code: str,
        brand_id: str,
        order_volume: float,
        gross_subtotal: float,
        transport_fee: float,
        check_date: Optional[str] = None
    ) -> PromoValidationResult:
        """
        Validates if a promo code can be applied to an order and calculates the discount.
        """
        code = promo_code.strip().upper()
        current_date_str = check_date or date.today().isoformat()

        conn = self.db.get_connection()
        cur = conn.cursor()
        try:
            cur.execute("""
                SELECT id, brand_id, code, name, promo_type, discount_percent,
                       discount_fixed_amount, min_order_volume, start_date, end_date,
                       requires_admin_approval, is_active
                FROM promotions
                WHERE code = ?
            """, (code,))
            promo = cur.fetchone()

            if not promo:
                return PromoValidationResult(is_valid=False, rejection_reason=f"Kode promo '{code}' tidak ditemukan.")

            if promo["brand_id"] != brand_id:
                return PromoValidationResult(is_valid=False, rejection_reason=f"Kode promo '{code}' tidak berlaku untuk brand ini.")

            if not promo["is_active"]:
                return PromoValidationResult(is_valid=False, rejection_reason=f"Kode promo '{code}' sudah tidak aktif.")

            if current_date_str < promo["start_date"] or current_date_str > promo["end_date"]:
                return PromoValidationResult(
                    is_valid=False,
                    rejection_reason=f"Masa berlaku promo '{code}' telah berakhir atau belum dimulai ({promo['start_date']} s.d. {promo['end_date']})."
                )

            if order_volume < promo["min_order_volume"]:
                return PromoValidationResult(
                    is_valid=False,
                    rejection_reason=f"Volume pesanan ({order_volume:,.0f} L) kurang dari syarat minimum promo ({promo['min_order_volume']:,.0f} L)."
                )

            ptype = promo["promo_type"]
            discount_amount = 0.0
            adjusted_transport = transport_fee

            if ptype == "PERCENTAGE_DISCOUNT":
                discount_amount = round(gross_subtotal * (promo["discount_percent"] / 100.0), 2)
            elif ptype == "FIXED_DISCOUNT":
                discount_amount = min(gross_subtotal, promo["discount_fixed_amount"])
            elif ptype == "FREE_TRANSPORT":
                adjusted_transport = 0.0
            elif ptype == "SUBSIDIZED_TRANSPORT":
                subsidy = promo["discount_fixed_amount"]
                adjusted_transport = max(0.0, transport_fee - subsidy)
            elif ptype == "FREE_GOODS":
                discount_amount = promo["discount_fixed_amount"]

            return PromoValidationResult(
                is_valid=True,
                promo_id=promo["id"],
                promo_code=promo["code"],
                promo_name=promo["name"],
                promo_type=ptype,
                discount_amount=discount_amount,
                adjusted_transport_fee=adjusted_transport,
                requires_admin_approval=bool(promo["requires_admin_approval"])
            )
        finally:
            conn.close()

    def apply_promotion_to_order(self, order_id: str, promo_code: str, user_id: str) -> Dict[str, Any]:
        """Validates and applies a promotion directly to a draft order."""
        with self.db.transaction() as cur:
            cur.execute("""
                SELECT id, brand_id, status, total_order_volume, gross_product_subtotal,
                       transport_fee_billed, unloading_fee_billed, order_date
                FROM orders WHERE id = ?
            """, (order_id,))
            order = cur.fetchone()
            if not order:
                raise ValueError("Pesanan tidak ditemukan.")

            if order["status"] != "PENDING_APPROVAL":
                raise ValueError(f"Hanya pesanan PENDING_APPROVAL yang dapat diberikan promo (Status saat ini: {order['status']}).")

            val = self.validate_promotion(
                promo_code=promo_code,
                brand_id=order["brand_id"],
                order_volume=order["total_order_volume"],
                gross_subtotal=order["gross_product_subtotal"],
                transport_fee=order["transport_fee_billed"],
                check_date=order["order_date"]
            )

            if not val.is_valid:
                raise ValueError(val.rejection_reason)

            # Recompute net grand total
            new_discount = val.discount_amount
            new_transport = val.adjusted_transport_fee
            unloading = order["unloading_fee_billed"]
            new_net_total = order["gross_product_subtotal"] - new_discount + new_transport + unloading

            cur.execute("""
                UPDATE orders
                SET promotion_id = ?,
                    discount_amount = ?,
                    transport_fee_billed = ?,
                    net_invoice_grand_total = ?,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            """, (val.promo_id, new_discount, new_transport, new_net_total, order_id))

            return {
                "order_id": order_id,
                "promo_code": val.promo_code,
                "promo_name": val.promo_name,
                "discount_amount": new_discount,
                "adjusted_transport_fee": new_transport,
                "net_invoice_grand_total": new_net_total,
                "requires_admin_approval": val.requires_admin_approval
            }

    def list_active_promotions(self, brand_id: str) -> List[PromotionOutput]:
        """Lists all currently active promotions for a brand."""
        conn = self.db.get_connection()
        cur = conn.cursor()
        try:
            today_str = date.today().isoformat()
            cur.execute("""
                SELECT id, brand_id, code, name, promo_type, discount_percent,
                       discount_fixed_amount, min_order_volume, start_date, end_date,
                       requires_admin_approval, is_active
                FROM promotions
                WHERE brand_id = ? AND is_active = 1
                  AND start_date <= ? AND end_date >= ?
                ORDER BY code ASC
            """, (brand_id, today_str, today_str))
            
            return [
                PromotionOutput(
                    id=r["id"],
                    brand_id=r["brand_id"],
                    code=r["code"],
                    name=r["name"],
                    promo_type=r["promo_type"],
                    discount_percent=r["discount_percent"],
                    discount_fixed_amount=r["discount_fixed_amount"],
                    min_order_volume=r["min_order_volume"],
                    start_date=r["start_date"],
                    end_date=r["end_date"],
                    requires_admin_approval=bool(r["requires_admin_approval"]),
                    is_active=bool(r["is_active"])
                )
                for r in cur.fetchall()
            ]
        finally:
            conn.close()
