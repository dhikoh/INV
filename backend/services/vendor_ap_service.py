"""
OMNICAT ENTERPRISE - VENDOR ACCOUNTS PAYABLE (AP) & SHARED FREIGHT ALLOCATION SERVICE
Manages third-party vendor bills (expeditions & packaging suppliers), proportional allocation
of shared Estafet truck invoices to customer order financials, and payment settlement tracking.
"""

import os
import uuid
from datetime import date, datetime
from typing import Optional, List, Dict, Any

from backend.database import db
from backend.models import (
    VendorInput,
    VendorInvoiceInput,
    VendorPaymentInput,
    VendorApSummary
)

class VendorApService:
    def __init__(self, database=None):
        self.db = database or db
        self._ensure_tables()

    def _ensure_tables(self):
        """Ensures vendor AP and shared freight allocation tables exist in the database."""
        conn = self.db.get_connection()
        cur = conn.cursor()
        try:
            cur.execute("""
                CREATE TABLE IF NOT EXISTS vendors (
                    id TEXT PRIMARY KEY,
                    brand_id TEXT NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
                    code TEXT UNIQUE NOT NULL,
                    name TEXT NOT NULL,
                    category TEXT NOT NULL CHECK (category IN ('FREIGHT_EXPEDITION', 'PACKAGING_SUPPLIER', 'RAW_MATERIAL', 'GENERAL_OPERATIONAL')),
                    contact_person TEXT,
                    phone TEXT,
                    bank_name TEXT,
                    bank_account_number TEXT,
                    bank_account_holder TEXT,
                    is_active INTEGER DEFAULT 1,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP
                )
            """)
            cur.execute("""
                CREATE TABLE IF NOT EXISTS vendor_invoices (
                    id TEXT PRIMARY KEY,
                    vendor_id TEXT NOT NULL REFERENCES vendors(id) ON DELETE RESTRICT,
                    brand_id TEXT NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
                    invoice_number TEXT NOT NULL,
                    invoice_date TEXT NOT NULL,
                    due_date TEXT NOT NULL,
                    total_amount REAL NOT NULL CHECK (total_amount > 0),
                    amount_paid REAL NOT NULL DEFAULT 0,
                    payment_status TEXT NOT NULL CHECK (payment_status IN ('UNPAID', 'PARTIAL', 'PAID_LUNAS')) DEFAULT 'UNPAID',
                    is_shared_freight INTEGER DEFAULT 0,
                    notes TEXT,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE(vendor_id, invoice_number)
                )
            """)
            cur.execute("""
                CREATE TABLE IF NOT EXISTS shared_freight_allocations (
                    id TEXT PRIMARY KEY,
                    vendor_invoice_id TEXT NOT NULL REFERENCES vendor_invoices(id) ON DELETE CASCADE,
                    order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
                    allocated_freight_amount REAL NOT NULL,
                    allocated_ratio REAL NOT NULL,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE(vendor_invoice_id, order_id)
                )
            """)
            conn.commit()
        finally:
            conn.close()

    def create_vendor(self, vendor_in: VendorInput) -> str:
        """Registers a new logistics expedition, packaging supplier, or operational vendor."""
        valid_cats = ('FREIGHT_EXPEDITION', 'PACKAGING_SUPPLIER', 'RAW_MATERIAL', 'GENERAL_OPERATIONAL')
        if vendor_in.category not in valid_cats:
            raise ValueError(f"Kategori vendor harus salah satu dari: {valid_cats}")

        vendor_id = str(uuid.uuid4())
        conn = self.db.get_connection()
        cur = conn.cursor()
        try:
            cur.execute("""
                INSERT INTO vendors (
                    id, brand_id, code, name, category, contact_person, phone,
                    bank_name, bank_account_number, bank_account_holder, is_active
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
            """, (
                vendor_id, vendor_in.brand_id, vendor_in.code, vendor_in.name,
                vendor_in.category, vendor_in.contact_person, vendor_in.phone,
                vendor_in.bank_name, vendor_in.bank_account_number, vendor_in.bank_account_holder
            ))
            conn.commit()
            return vendor_id
        finally:
            conn.close()

    def create_vendor_invoice(self, inv_in: VendorInvoiceInput) -> str:
        """
        Records an incoming vendor bill. If is_shared_freight is True, allocates the freight bill
        proportionally across participating orders and recalculates order_financials.
        """
        if inv_in.total_amount <= 0:
            raise ValueError("Total tagihan vendor harus lebih besar dari Rp 0.")

        invoice_id = str(uuid.uuid4())
        conn = self.db.get_connection()
        cur = conn.cursor()
        try:
            # 1. Verify Vendor Exists
            cur.execute("SELECT id, name, category FROM vendors WHERE id = ?", (inv_in.vendor_id,))
            vendor = cur.fetchone()
            if not vendor:
                raise ValueError(f"Vendor dengan ID '{inv_in.vendor_id}' tidak ditemukan.")

            # 2. Insert Vendor Invoice
            cur.execute("""
                INSERT INTO vendor_invoices (
                    id, vendor_id, brand_id, invoice_number, invoice_date, due_date,
                    total_amount, amount_paid, payment_status, is_shared_freight, notes
                ) VALUES (?, ?, ?, ?, ?, ?, ?, 0.0, 'UNPAID', ?, ?)
            """, (
                invoice_id, inv_in.vendor_id, inv_in.brand_id, inv_in.invoice_number,
                inv_in.invoice_date, inv_in.due_date, inv_in.total_amount,
                1 if inv_in.is_shared_freight else 0, inv_in.notes
            ))

            # 3. Handle Shared Freight Proportional Allocation
            if inv_in.is_shared_freight and inv_in.shared_order_ids:
                # Query order volumes
                placeholders = ",".join("?" for _ in inv_in.shared_order_ids)
                cur.execute(f"""
                    SELECT id, total_order_volume, net_invoice_grand_total, transport_fee_billed
                    FROM orders
                    WHERE id IN ({placeholders})
                """, inv_in.shared_order_ids)
                orders_data = cur.fetchall()

                if len(orders_data) != len(inv_in.shared_order_ids):
                    raise ValueError("Satu atau lebih order ID dalam daftar alokasi pengiriman bersama tidak ditemukan.")

                total_shared_vol = sum(o["total_order_volume"] for o in orders_data)
                if total_shared_vol <= 0:
                    raise ValueError("Total volume pesanan dalam alokasi bersama harus lebih besar dari 0 Liter.")

                # Allocate proportionally to each participating order
                for o in orders_data:
                    ratio = o["total_order_volume"] / total_shared_vol
                    allocated_freight = round(inv_in.total_amount * ratio, 2)
                    alloc_id = str(uuid.uuid4())

                    cur.execute("""
                        INSERT INTO shared_freight_allocations (
                            id, vendor_invoice_id, order_id, allocated_freight_amount, allocated_ratio
                        ) VALUES (?, ?, ?, ?, ?)
                    """, (alloc_id, invoice_id, o["id"], allocated_freight, round(ratio, 4)))

                    # 4. Synchronize order_financials with Real Freight Cost
                    cur.execute("""
                        SELECT total_cogs_amount, actual_unloading_cost
                        FROM order_financials WHERE order_id = ?
                    """, (o["id"],))
                    fin = cur.fetchone()

                    if fin:
                        total_cogs = fin["total_cogs_amount"]
                        unloading = fin["actual_unloading_cost"]
                        net_rev = o["net_invoice_grand_total"]
                        billed_freight = o["transport_fee_billed"]

                        subsidy_borne = max(0.0, allocated_freight - billed_freight)
                        margin_amt = net_rev - total_cogs - allocated_freight - unloading
                        margin_pct = round((margin_amt / net_rev * 100), 2) if net_rev > 0 else 0.0
                        is_healthy = 1 if margin_pct >= 15.0 else 0

                        cur.execute("""
                            UPDATE order_financials
                            SET actual_freight_cost = ?,
                                net_transport_subsidy_borne = ?,
                                contribution_margin_amount = ?,
                                contribution_margin_percent = ?,
                                is_margin_healthy = ?
                            WHERE order_id = ?
                        """, (allocated_freight, subsidy_borne, margin_amt, margin_pct, is_healthy, o["id"]))

            conn.commit()
            return invoice_id
        finally:
            conn.close()

    def record_vendor_payment(self, payment_in: VendorPaymentInput) -> Dict[str, Any]:
        """Records payment made to vendor with strict anti-overpayment guard."""
        if payment_in.amount <= 0:
            raise ValueError("Nominal pembayaran vendor harus lebih besar dari Rp 0.")

        conn = self.db.get_connection()
        cur = conn.cursor()
        try:
            cur.execute("""
                SELECT id, invoice_number, total_amount, amount_paid, payment_status
                FROM vendor_invoices WHERE id = ?
            """, (payment_in.vendor_invoice_id,))
            inv = cur.fetchone()
            if not inv:
                raise ValueError(f"Invoice vendor dengan ID '{payment_in.vendor_invoice_id}' tidak ditemukan.")

            if inv["payment_status"] == "PAID_LUNAS":
                raise ValueError("Invoice vendor ini sudah lunas sepenuhnya.")

            current_paid = inv["amount_paid"]
            total_amt = inv["total_amount"]
            new_paid = round(current_paid + payment_in.amount, 2)

            if new_paid > total_amt:
                sisa = round(total_amt - current_paid, 2)
                raise ValueError(
                    f"Pembayaran melebihi sisa tagihan! "
                    f"Total: Rp {total_amt:,.2f}, Sudah Bayar: Rp {current_paid:,.2f}, Sisa: Rp {sisa:,.2f}. "
                    f"Nominal diajukan: Rp {payment_in.amount:,.2f}."
                )

            new_status = "PAID_LUNAS" if new_paid >= total_amt else "PARTIAL"

            cur.execute("""
                UPDATE vendor_invoices
                SET amount_paid = ?,
                    payment_status = ?
                WHERE id = ?
            """, (new_paid, new_status, payment_in.vendor_invoice_id))
            conn.commit()

            return {
                "vendor_invoice_id": payment_in.vendor_invoice_id,
                "invoice_number": inv["invoice_number"],
                "amount_paid_now": payment_in.amount,
                "cumulative_paid": new_paid,
                "remaining_balance": round(total_amt - new_paid, 2),
                "payment_status": new_status,
                "payment_date": payment_in.payment_date,
                "payment_method": payment_in.payment_method
            }
        finally:
            conn.close()

    def get_vendor_ap_summary(
        self,
        brand_id: Optional[str] = None,
        as_of_date: Optional[date] = None
    ) -> VendorApSummary:
        """
        Calculates cumulative Vendor AP balance, total paid, outstanding debt,
        and overdue AP balances beyond payment due dates.
        """
        if as_of_date is None:
            as_of_date = date.today()

        as_of_str = as_of_date.isoformat()

        conn = self.db.get_connection()
        cur = conn.cursor()
        try:
            query = """
                SELECT 
                    vi.id, vi.vendor_id, vi.invoice_number, vi.invoice_date, vi.due_date,
                    vi.total_amount, vi.amount_paid, vi.payment_status, vi.is_shared_freight,
                    v.name as vendor_name, v.category as vendor_category
                FROM vendor_invoices vi
                JOIN vendors v ON vi.vendor_id = v.id
                WHERE 1=1
            """
            params = []
            if brand_id:
                query += " AND vi.brand_id = ?"
                params.append(brand_id)

            query += " ORDER BY vi.due_date ASC, vi.created_at ASC"

            cur.execute(query, params)
            rows = cur.fetchall()

            total_inv_count = len(rows)
            unpaid_count = 0
            total_ap = 0.0
            total_paid = 0.0
            total_outstanding = 0.0
            overdue_outstanding = 0.0
            invoices_list = []

            for r in rows:
                inv_total = r["total_amount"]
                inv_paid = r["amount_paid"]
                rem_balance = round(inv_total - inv_paid, 2)

                total_ap += inv_total
                total_paid += inv_paid
                total_outstanding += rem_balance

                is_overdue = False
                if r["payment_status"] != "PAID_LUNAS":
                    unpaid_count += 1
                    if r["due_date"] < as_of_str:
                        is_overdue = True
                        overdue_outstanding += rem_balance

                invoices_list.append({
                    "id": r["id"],
                    "vendor_id": r["vendor_id"],
                    "vendor_name": r["vendor_name"],
                    "vendor_category": r["vendor_category"],
                    "invoice_number": r["invoice_number"],
                    "invoice_date": r["invoice_date"],
                    "due_date": r["due_date"],
                    "total_amount": inv_total,
                    "amount_paid": inv_paid,
                    "remaining_balance": rem_balance,
                    "payment_status": r["payment_status"],
                    "is_overdue": is_overdue,
                    "is_shared_freight": bool(r["is_shared_freight"])
                })

            return VendorApSummary(
                total_invoices_count=total_inv_count,
                unpaid_count=unpaid_count,
                total_ap_amount_idr=round(total_ap, 2),
                total_paid_idr=round(total_paid, 2),
                total_outstanding_ap_idr=round(total_outstanding, 2),
                overdue_outstanding_ap_idr=round(overdue_outstanding, 2),
                invoices=invoices_list
            )
        finally:
            conn.close()
