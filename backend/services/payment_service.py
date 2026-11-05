"""
OMNICAT ENTERPRISE - PAYMENT & AGING AR SERVICE
Manages Down Payments (DP), full settlement (Pelunasan), overpayment guards,
bank verification, and accounts receivable (Aging AR) aging buckets.
"""

import uuid
from datetime import datetime, date
from typing import Optional, List, Dict, Any

from backend.database import db
from backend.models import (
    RecordPaymentInput,
    PaymentOutput,
    AgingARInvoiceItem,
    AgingARReport
)

VALID_PAYMENT_TYPES = ("DP", "PELUNASAN", "FULL_PAYMENT")

class PaymentService:
    def __init__(self, database=None):
        self.db = database or db

    def record_payment(self, pay_in: RecordPaymentInput, user_id: str) -> PaymentOutput:
        """
        Records a verified payment for an invoice.
        Enforces overpayment guards, updates invoice payment status (UNPAID -> PARTIAL_DP -> PAID_LUNAS),
        and verifies user privileges.
        """
        if pay_in.amount <= 0:
            raise ValueError(f"Nominal pembayaran harus lebih besar dari 0 (diterima: {pay_in.amount}).")

        if pay_in.payment_type not in VALID_PAYMENT_TYPES:
            raise ValueError(f"Tipe pembayaran '{pay_in.payment_type}' tidak valid. Pilihan: {VALID_PAYMENT_TYPES}")

        with self.db.transaction() as cur:
            # 1. Enforce RBAC (SUPER_ADMIN or FINANCE)
            cur.execute("SELECT role FROM users WHERE id = ?", (user_id,))
            user = cur.fetchone()
            if not user or user["role"] not in ("SUPER_ADMIN", "FINANCE"):
                raise PermissionError("Hanya Super Admin atau Finance yang berwenang memverifikasi pembayaran.")

            # 2. Fetch Invoice
            cur.execute("""
                SELECT id, total_amount, amount_paid, payment_status
                FROM invoices WHERE id = ?
            """, (pay_in.invoice_id,))
            inv = cur.fetchone()
            if not inv:
                raise ValueError(f"Invoice dengan ID '{pay_in.invoice_id}' tidak ditemukan.")

            if inv["payment_status"] == "PAID_LUNAS":
                raise ValueError("Tagihan pada invoice ini sudah lunas sepenuhnya.")

            current_remaining = inv["total_amount"] - inv["amount_paid"]

            # Overpayment Guard
            if pay_in.amount > (current_remaining + 0.01):
                raise ValueError(
                    f"Nominal pembayaran (Rp {pay_in.amount:,.0f}) melebihi sisa tagihan yang harus dibayar "
                    f"(Rp {current_remaining:,.0f})."
                )

            # 3. Compute New Balances and Status
            new_amount_paid = inv["amount_paid"] + pay_in.amount
            new_remaining = max(0.0, inv["total_amount"] - new_amount_paid)

            if new_remaining <= 0.01:
                new_status = "PAID_LUNAS"
            else:
                new_status = "PARTIAL_DP"

            cur.execute("""
                UPDATE invoices
                SET amount_paid = ?,
                    payment_status = ?
                WHERE id = ?
            """, (new_amount_paid, new_status, pay_in.invoice_id))

            # 4. Insert Payment Record
            pay_id = str(uuid.uuid4())
            pay_date = pay_in.payment_date or date.today().isoformat()

            cur.execute("""
                INSERT INTO payments (
                    id, invoice_id, payment_type, amount, payment_date,
                    payment_method, proof_image_url, verified_by_user_id, notes
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                pay_id, pay_in.invoice_id, pay_in.payment_type, pay_in.amount, pay_date,
                pay_in.payment_method, pay_in.proof_image_url, user_id, pay_in.notes
            ))

            return PaymentOutput(
                id=pay_id,
                invoice_id=pay_in.invoice_id,
                payment_type=pay_in.payment_type,
                amount=pay_in.amount,
                payment_date=pay_date,
                payment_method=pay_in.payment_method,
                verified_by_user_id=user_id,
                notes=pay_in.notes,
                remaining_invoice_balance=new_remaining,
                new_payment_status=new_status
            )

    def get_aging_ar_report(self, brand_id: str, as_of_date: Optional[str] = None) -> AgingARReport:
        """
        Generates an Accounts Receivable (AR) Aging Report.
        Categorizes outstanding balances into aging buckets:
        - CURRENT: Due date in future or today
        - OVERDUE_1_15: 1 - 15 days past due
        - OVERDUE_16_30: 16 - 30 days past due
        - OVERDUE_31_60: 31 - 60 days past due
        - CRITICAL_OVER_60: > 60 days past due
        """
        as_of_dt = datetime.strptime(as_of_date, "%Y-%m-%d").date() if as_of_date else date.today()
        as_of_str = as_of_dt.isoformat()

        conn = self.db.get_connection()
        cur = conn.cursor()
        try:
            cur.execute("""
                SELECT 
                    inv.id as invoice_id,
                    inv.invoice_number,
                    c.id as customer_id,
                    c.name as customer_name,
                    r.name as region_name,
                    inv.issue_date,
                    inv.due_date,
                    inv.total_amount,
                    inv.amount_paid,
                    (inv.total_amount - inv.amount_paid) as remaining_balance
                FROM invoices inv
                JOIN orders o ON inv.order_id = o.id
                JOIN customers c ON o.customer_id = c.id
                JOIN regions r ON c.region_id = r.id
                WHERE o.brand_id = ? 
                  AND inv.payment_status NOT IN ('PAID_LUNAS', 'SUPERSEDED', 'VOID', 'CANCELLED')
                  AND o.status NOT IN ('SUPERSEDED', 'VOID', 'CANCELLED', 'SKIPPED_AUDIT')
                ORDER BY inv.due_date ASC
            """, (brand_id,))

            rows = cur.fetchall()
            items: List[AgingARInvoiceItem] = []

            total_ar = 0.0
            total_current = 0.0
            total_1_15 = 0.0
            total_16_30 = 0.0
            total_31_60 = 0.0
            total_over_60 = 0.0

            for r in rows:
                rem_bal = r["remaining_balance"]
                if rem_bal <= 0:
                    continue

                total_ar += rem_bal
                due_dt = datetime.strptime(r["due_date"], "%Y-%m-%d").date()
                days_overdue = (as_of_dt - due_dt).days

                if days_overdue <= 0:
                    bucket = "CURRENT"
                    total_current += rem_bal
                elif 1 <= days_overdue <= 15:
                    bucket = "OVERDUE_1_15"
                    total_1_15 += rem_bal
                elif 16 <= days_overdue <= 30:
                    bucket = "OVERDUE_16_30"
                    total_16_30 += rem_bal
                elif 31 <= days_overdue <= 60:
                    bucket = "OVERDUE_31_60"
                    total_31_60 += rem_bal
                else:
                    bucket = "CRITICAL_OVER_60"
                    total_over_60 += rem_bal

                items.append(AgingARInvoiceItem(
                    invoice_id=r["invoice_id"],
                    invoice_number=r["invoice_number"],
                    customer_id=r["customer_id"],
                    customer_name=r["customer_name"],
                    region_name=r["region_name"],
                    issue_date=r["issue_date"],
                    due_date=r["due_date"],
                    total_amount=r["total_amount"],
                    amount_paid=r["amount_paid"],
                    remaining_balance=rem_bal,
                    days_overdue=days_overdue,
                    bucket=bucket
                ))

            return AgingARReport(
                as_of_date=as_of_str,
                total_outstanding_ar=total_ar,
                total_current=total_current,
                total_overdue_1_15=total_1_15,
                total_overdue_16_30=total_16_30,
                total_overdue_31_60=total_31_60,
                total_critical_over_60=total_over_60,
                invoices=items
            )
        finally:
            conn.close()

    def get_invoice_payments(self, invoice_id: str) -> List[PaymentOutput]:
        """Retrieves all payment transactions associated with an invoice."""
        conn = self.db.get_connection()
        cur = conn.cursor()
        try:
            cur.execute("""
                SELECT 
                    p.id, p.invoice_id, p.payment_type, p.amount, p.payment_date,
                    p.payment_method, p.verified_by_user_id, p.notes,
                    (inv.total_amount - inv.amount_paid) as remaining_balance,
                    inv.payment_status
                FROM payments p
                JOIN invoices inv ON p.invoice_id = inv.id
                WHERE p.invoice_id = ?
                ORDER BY p.payment_date ASC, p.created_at ASC
            """, (invoice_id,))

            return [
                PaymentOutput(
                    id=r["id"],
                    invoice_id=r["invoice_id"],
                    payment_type=r["payment_type"],
                    amount=r["amount"],
                    payment_date=r["payment_date"],
                    payment_method=r["payment_method"],
                    verified_by_user_id=r["verified_by_user_id"],
                    notes=r["notes"],
                    remaining_invoice_balance=r["remaining_balance"],
                    new_payment_status=r["payment_status"]
                )
                for r in cur.fetchall()
            ]
        finally:
            conn.close()

