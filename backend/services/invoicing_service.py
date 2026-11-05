"""
OMNICAT ENTERPRISE - INVOICING SERVICE
Handles draft orders, concurrency-safe atomic document sequencing,
approval workflows, and invoice generation.
"""

import uuid
from datetime import datetime, date, timedelta
from typing import Optional, List, Dict, Any

from backend.database import db
from backend.models import (
    CreateOrderInput,
    OrderItemInput,
    OrderOutput,
    OrderItemOutput,
    ApprovalResult
)

class InvoicingService:
    def __init__(self, database=None):
        self.db = database or db

    def create_draft_order(self, data: CreateOrderInput, sales_user_id: str) -> OrderOutput:
        """
        Creates a new draft order from sales input.
        Initial status is PENDING_APPROVAL with doc_number = None.
        """
        if not data.items:
            raise ValueError("Pesanan harus memiliki minimal 1 produk.")

        with self.db.transaction() as cur:
            # 1. Validate Customer & Brand
            cur.execute("SELECT id, name, region_id FROM customers WHERE id = ? AND brand_id = ?", (data.customer_id, data.brand_id))
            cust = cur.fetchone()
            if not cust:
                raise ValueError(f"Customer dengan ID '{data.customer_id}' tidak ditemukan pada brand ini.")

            customer_name = cust["name"]

            # 2. Process Line Items and Calculate Subtotals & Volumes
            order_items_to_insert = []
            gross_subtotal = 0.0
            total_volume = 0.0

            for item_in in data.items:
                if item_in.quantity <= 0:
                    raise ValueError(f"Kuantitas produk harus lebih dari 0 (diterima: {item_in.quantity}).")
                if item_in.unit_price < 0:
                    raise ValueError(f"Harga satuan produk tidak boleh negatif.")

                # Fetch variant metadata & active COGS
                cur.execute("""
                    SELECT pv.id, pv.sku, pv.name, pv.unit_multiplier
                    FROM product_variants pv
                    WHERE pv.id = ?
                """, (item_in.variant_id,))
                variant = cur.fetchone()
                if not variant:
                    raise ValueError(f"Varian produk dengan ID '{item_in.variant_id}' tidak ditemukan.")

                # Fetch active COGS
                cur.execute("""
                    SELECT total_cogs_per_unit FROM product_cogs_history
                    WHERE variant_id = ? AND (effective_to IS NULL OR effective_to >= CURRENT_DATE)
                    ORDER BY effective_from DESC LIMIT 1
                """, (item_in.variant_id,))
                cogs_row = cur.fetchone()
                cogs_per_unit = cogs_row["total_cogs_per_unit"] if cogs_row else 0.0

                line_subtotal = item_in.quantity * item_in.unit_price
                line_cogs = item_in.quantity * cogs_per_unit
                line_margin = line_subtotal - line_cogs
                item_volume = item_in.quantity * variant["unit_multiplier"]

                gross_subtotal += line_subtotal
                total_volume += item_volume

                item_id = str(uuid.uuid4())
                order_items_to_insert.append({
                    "id": item_id,
                    "variant_id": variant["id"],
                    "variant_sku": variant["sku"],
                    "variant_name": variant["name"],
                    "quantity": item_in.quantity,
                    "unit_price": item_in.unit_price,
                    "cogs_per_unit": cogs_per_unit,
                    "line_subtotal": line_subtotal,
                    "line_cogs_total": line_cogs,
                    "line_contribution_margin": line_margin
                })

            # Calculate Net Grand Total
            net_grand_total = gross_subtotal - data.discount_amount + data.transport_fee_billed + data.unloading_fee_billed
            if net_grand_total < 0:
                raise ValueError("Total tagihan invoice tidak boleh bernilai negatif.")

            order_id = str(uuid.uuid4())
            order_date_str = data.order_date or date.today().isoformat()

            # 3. Insert into orders table
            cur.execute("""
                INSERT INTO orders (
                    id, brand_id, customer_id, created_by_sales_id, doc_number, revision_number,
                    order_date, status, total_order_volume, gross_product_subtotal, promotion_id,
                    discount_amount, transport_fee_billed, unloading_fee_billed, net_invoice_grand_total,
                    notes
                ) VALUES (?, ?, ?, ?, NULL, 0, ?, 'PENDING_APPROVAL', ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                order_id, data.brand_id, data.customer_id, sales_user_id,
                order_date_str, total_volume, gross_subtotal, data.promotion_id,
                data.discount_amount, data.transport_fee_billed, data.unloading_fee_billed, net_grand_total,
                data.notes
            ))

            # 4. Insert order_items
            for oi in order_items_to_insert:
                cur.execute("""
                    INSERT INTO order_items (
                        id, order_id, variant_id, quantity, unit_price, cogs_per_unit,
                        line_subtotal, line_cogs_total, line_contribution_margin
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    oi["id"], order_id, oi["variant_id"], oi["quantity"], oi["unit_price"], oi["cogs_per_unit"],
                    oi["line_subtotal"], oi["line_cogs_total"], oi["line_contribution_margin"]
                ))

            # Format outputs
            items_output = [
                OrderItemOutput(
                    id=oi["id"],
                    order_id=order_id,
                    variant_id=oi["variant_id"],
                    variant_sku=oi["variant_sku"],
                    variant_name=oi["variant_name"],
                    quantity=oi["quantity"],
                    unit_price=oi["unit_price"],
                    cogs_per_unit=oi["cogs_per_unit"],
                    line_subtotal=oi["line_subtotal"],
                    line_cogs_total=oi["line_cogs_total"],
                    line_contribution_margin=oi["line_contribution_margin"]
                )
                for oi in order_items_to_insert
            ]

            return OrderOutput(
                id=order_id,
                brand_id=data.brand_id,
                customer_id=data.customer_id,
                customer_name=customer_name,
                created_by_sales_id=sales_user_id,
                doc_number=None,
                revision_number=0,
                order_date=order_date_str,
                status="PENDING_APPROVAL",
                total_order_volume=total_volume,
                gross_product_subtotal=gross_subtotal,
                discount_amount=data.discount_amount,
                transport_fee_billed=data.transport_fee_billed,
                unloading_fee_billed=data.unloading_fee_billed,
                net_invoice_grand_total=net_grand_total,
                notes=data.notes,
                items=items_output
            )

    def approve_order(self, order_id: str, admin_user_id: str) -> ApprovalResult:
        """
        Approves an order by executing the atomic sequence lock.
        Assigns the next sequential document number for the customer,
        updates order status to APPROVED, and automatically creates the official invoice.
        """
        with self.db.transaction() as cur:
            # 1. Fetch Order with lock
            cur.execute("""
                SELECT o.id, o.brand_id, o.customer_id, o.order_date, o.net_invoice_grand_total,
                       o.status, o.doc_number, b.code as brand_code, r.name as region_name
                FROM orders o
                JOIN brands b ON o.brand_id = b.id
                JOIN customers c ON o.customer_id = c.id
                JOIN regions r ON c.region_id = r.id
                WHERE o.id = ?
            """, (order_id,))
            order = cur.fetchone()
            if not order:
                raise ValueError(f"Order dengan ID '{order_id}' tidak ditemukan.")

            if order["status"] != "PENDING_APPROVAL":
                raise ValueError(f"Hanya pesanan berstatus PENDING_APPROVAL yang dapat di-approve (Status saat ini: {order['status']}).")

            # 2. Validate User Access (SUPER_ADMIN or FINANCE)
            cur.execute("SELECT role FROM users WHERE id = ?", (admin_user_id,))
            user = cur.fetchone()
            if not user or user["role"] not in ("SUPER_ADMIN", "FINANCE"):
                raise PermissionError("Hanya Super Admin atau Finance yang memiliki hak akses untuk approve pesanan.")

            customer_id = order["customer_id"]
            brand_id = order["brand_id"]

            # 3. ATOMIC SEQUENCE LOCK
            # Read and increment customer doc sequence inside the exclusive transaction lock
            cur.execute("""
                SELECT last_doc_number FROM customer_doc_sequences
                WHERE customer_id = ? AND brand_id = ?
            """, (customer_id, brand_id))
            seq_row = cur.fetchone()

            if seq_row is None:
                next_doc = 1
                cur.execute("""
                    INSERT INTO customer_doc_sequences (customer_id, brand_id, last_doc_number, updated_at)
                    VALUES (?, ?, ?, CURRENT_TIMESTAMP)
                """, (customer_id, brand_id, next_doc))
            else:
                next_doc = seq_row["last_doc_number"] + 1
                cur.execute("""
                    UPDATE customer_doc_sequences
                    SET last_doc_number = ?, updated_at = CURRENT_TIMESTAMP
                    WHERE customer_id = ? AND brand_id = ?
                """, (next_doc, customer_id, brand_id))

            # 4. Update Order to APPROVED
            now_iso = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            cur.execute("""
                UPDATE orders
                SET doc_number = ?, status = 'APPROVED', approved_by_admin_id = ?,
                    approved_at = ?, updated_at = ?
                WHERE id = ?
            """, (next_doc, admin_user_id, now_iso, now_iso, order_id))

            # 5. Generate Official Invoice
            inv_id = str(uuid.uuid4())
            brand_code = order["brand_code"]
            order_date_dt = datetime.strptime(order["order_date"], "%Y-%m-%d").date()
            year_str = str(order_date_dt.year)
            reg_code = order["region_name"][:3].upper()
            invoice_number = f"INV/{brand_code}/{year_str}/{reg_code}/{next_doc:03d}"

            due_date_str = (order_date_dt + timedelta(days=14)).isoformat()

            cur.execute("""
                INSERT INTO invoices (
                    id, order_id, invoice_number, issue_date, due_date,
                    total_amount, amount_paid, payment_status
                ) VALUES (?, ?, ?, ?, ?, ?, 0.0, 'UNPAID')
            """, (
                inv_id, order_id, invoice_number, order["order_date"], due_date_str,
                order["net_invoice_grand_total"]
            ))

            return ApprovalResult(
                order_id=order_id,
                doc_number=next_doc,
                invoice_id=inv_id,
                invoice_number=invoice_number,
                total_amount=order["net_invoice_grand_total"],
                issue_date=order["order_date"],
                due_date=due_date_str
            )

    def reject_order(self, order_id: str, admin_user_id: str, reason: str) -> bool:
        """Rejects a pending order with a reason, requesting revision from sales."""
        if not reason or not reason.strip():
            raise ValueError("Alasan penolakan pesanan wajib diisi.")

        with self.db.transaction() as cur:
            cur.execute("SELECT status FROM orders WHERE id = ?", (order_id,))
            row = cur.fetchone()
            if not row:
                raise ValueError("Pesanan tidak ditemukan.")
            if row["status"] != "PENDING_APPROVAL":
                raise ValueError("Hanya pesanan berstatus PENDING_APPROVAL yang dapat ditolak.")

            cur.execute("""
                UPDATE orders
                SET status = 'REVISION_REQUESTED', rejection_reason = ?, updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            """, (reason.strip(), order_id))
            return True

    def create_order_revision(self, original_order_id: str, data: CreateOrderInput, sales_user_id: str) -> OrderOutput:
        """
        Creates a revision for an approved or revision-requested order.
        Supersedes the original order while preserving the same doc_number.
        """
        with self.db.transaction() as cur:
            cur.execute("""
                SELECT id, doc_number, revision_number, status, brand_id, customer_id
                FROM orders WHERE id = ?
            """, (original_order_id,))
            orig = cur.fetchone()
            if not orig:
                raise ValueError("Pesanan asal tidak ditemukan.")

            doc_no = orig["doc_number"]
            next_rev = orig["revision_number"] + 1

            # Mark original order as SUPERSEDED
            cur.execute("UPDATE orders SET status = 'SUPERSEDED', updated_at = CURRENT_TIMESTAMP WHERE id = ?", (original_order_id,))

        # Create draft revision
        new_order = self.create_draft_order(data, sales_user_id)

        # Update parent_order_id, doc_number, and revision_number
        with self.db.transaction() as cur:
            cur.execute("""
                UPDATE orders
                SET parent_order_id = ?, doc_number = ?, revision_number = ?
                WHERE id = ?
            """, (original_order_id, doc_no, next_rev, new_order.id))

        new_order.doc_number = doc_no
        new_order.revision_number = next_rev
        return new_order

