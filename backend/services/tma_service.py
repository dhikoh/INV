"""
OMNICAT ENTERPRISE - TELEGRAM MINI APP (TMA) SERVICE
Handles field sales draft order submission, offline queue synchronization,
and instant WhatsApp formatted invoice sharing.
"""

import os
import re
import urllib.parse
from datetime import date, datetime
from typing import Optional, List, Dict, Any

from backend.database import db
from backend.models import (
    TokenClaims,
    CreateOrderInput,
    OrderItemInput,
    OrderOutput,
    TmaDraftItemInput,
    TmaDraftOrderInput,
    TmaDraftOrderResult,
    TmaBatchSyncResult
)
from backend.services.invoicing_service import InvoicingService
from backend.services.promotion_service import PromotionService
from backend.security.rbac_service import RbacService

# Standard pricing fallbacks
DEFAULT_VARIANT_PRICES = {
    "BC-PRM-25L": 133500.0,
    "BC-PRM-10L": 58000.0,
    "BC-PRM-5.5L": 33000.0,
    "ZEO-MOJ-25KG": 45000.0
}

class TmaService:
    def __init__(
        self,
        database=None,
        invoicing_service=None,
        promotion_service=None,
        rbac_service=None
    ):
        self.db = database or db
        self.inv_service = invoicing_service or InvoicingService(self.db)
        self.promo_service = promotion_service or PromotionService(self.db)
        self.rbac = rbac_service or RbacService(self.db)

    def create_tma_draft_order(
        self,
        sales_token_str: str,
        draft_in: TmaDraftOrderInput
    ) -> TmaDraftOrderResult:
        """
        Validates sales authentication, converts TMA input to canonical CreateOrderInput,
        submits draft order to InvoicingService, and generates instant WhatsApp share link.
        """
        # 1. Verify Sales Token & Brand Permissions
        claims = self.rbac.verify_token(sales_token_str)
        self.rbac.check_permission(claims, ("SALES", "SUPER_ADMIN", "FINANCE"))
        self.rbac.check_brand_access(claims, draft_in.brand_id)

        # 2. Validate Items
        if not draft_in.items:
            raise ValueError("Draft pesanan harus berisi minimal 1 varian produk.")

        total_qty = sum(item.quantity for item in draft_in.items)
        if total_qty <= 0:
            raise ValueError("Total kuantitas barang dalam pesanan harus lebih besar dari 0.")

        conn = self.db.get_connection()
        cur = conn.cursor()
        try:
            # 3. Resolve Customer Details
            cur.execute("""
                SELECT id, name, owner_doctor_name, phone, region_id
                FROM customers WHERE id = ?
            """, (draft_in.customer_id,))
            customer = cur.fetchone()
            if not customer:
                raise ValueError(f"Customer dengan ID '{draft_in.customer_id}' tidak ditemukan.")

            # 4. Resolve Brand Bank Account Details
            cur.execute("""
                SELECT bank_name, account_number, account_holder_name
                FROM brand_bank_accounts
                WHERE brand_id = ? AND is_primary = 1
                LIMIT 1
            """, (draft_in.brand_id,))
            bank_row = cur.fetchone()
            bank_name = bank_row["bank_name"] if bank_row else "BCA"
            bank_acc = bank_row["account_number"] if bank_row else "0902207846"
            bank_holder = bank_row["account_holder_name"] if bank_row else "FINDA FATIKASARI"

            # 5. Resolve Items and Prices
            resolved_order_items = []
            items_summary = []

            for item in draft_in.items:
                if item.quantity <= 0:
                    continue

                # Lookup variant in database by SKU or ID
                cur.execute("""
                    SELECT id, sku, name, unit_multiplier
                    FROM product_variants
                    WHERE sku = ? OR id = ?
                """, (item.variant_sku, item.variant_sku))
                v_row = cur.fetchone()

                if not v_row:
                    raise ValueError(f"Varian produk '{item.variant_sku}' tidak valid atau tidak terdaftar.")

                var_id = v_row["id"]
                var_sku = v_row["sku"]
                var_name = v_row["name"]

                # Price resolution
                if item.unit_price is not None and item.unit_price > 0:
                    price = item.unit_price
                else:
                    price = DEFAULT_VARIANT_PRICES.get(var_sku, 133500.0)

                resolved_order_items.append(OrderItemInput(
                    variant_id=var_id,
                    quantity=item.quantity,
                    unit_price=price
                ))

                items_summary.append({
                    "name": var_name,
                    "sku": var_sku,
                    "quantity": item.quantity,
                    "unit_price": price,
                    "subtotal": item.quantity * price
                })

            order_date_val = date.fromisoformat(draft_in.order_date[:10]) if draft_in.order_date else date.today()

            # 6. Create Draft Order in Backend Invoicing Engine
            create_input = CreateOrderInput(
                brand_id=draft_in.brand_id,
                customer_id=draft_in.customer_id,
                order_date=order_date_val.isoformat(),
                items=resolved_order_items,
                notes=draft_in.notes
            )

            draft_res: OrderOutput = self.inv_service.create_draft_order(create_input, sales_user_id=claims.user_id)

            # 7. Generate WhatsApp Share URL
            whatsapp_url = self.generate_whatsapp_order_summary(
                customer_name=customer["name"],
                doctor_name=customer["owner_doctor_name"],
                phone=customer["phone"],
                order_date=order_date_val.strftime("%d/%m/%Y"),
                items_summary=items_summary,
                total_volume=draft_res.total_order_volume,
                gross_subtotal=draft_res.gross_product_subtotal,
                discount=draft_res.discount_amount,
                net_grand_total=draft_res.net_invoice_grand_total,
                bank_name=bank_name,
                bank_acc=bank_acc,
                bank_holder=bank_holder
            )

            return TmaDraftOrderResult(
                client_order_id=draft_in.client_order_id,
                server_order_id=draft_res.id,
                status=draft_res.status,
                customer_id=draft_in.customer_id,
                customer_name=customer["name"],
                owner_doctor_name=customer["owner_doctor_name"],
                total_volume_liters=draft_res.total_order_volume,
                gross_subtotal_idr=draft_res.gross_product_subtotal,
                discount_idr=draft_res.discount_amount,
                net_grand_total_idr=draft_res.net_invoice_grand_total,
                whatsapp_share_url=whatsapp_url,
                is_synced=True
            )
        finally:
            conn.close()

    def sync_offline_draft_queue(
        self,
        sales_token_str: str,
        queue: List[TmaDraftOrderInput]
    ) -> TmaBatchSyncResult:
        """
        Synchronizes a queue of draft orders created offline on the mobile client.
        Processes each draft, isolates individual item failures, and returns batch report.
        """
        results = []
        synced_count = 0
        failed_count = 0

        for draft in queue:
            try:
                res = self.create_tma_draft_order(sales_token_str, draft)
                results.append(res)
                synced_count += 1
            except Exception as e:
                failed_count += 1
                results.append(TmaDraftOrderResult(
                    client_order_id=draft.client_order_id,
                    server_order_id="",
                    status="FAILED",
                    customer_id=draft.customer_id,
                    customer_name="",
                    owner_doctor_name=None,
                    total_volume_liters=0.0,
                    gross_subtotal_idr=0.0,
                    discount_idr=0.0,
                    net_grand_total_idr=0.0,
                    whatsapp_share_url="",
                    is_synced=False,
                    error_message=str(e)
                ))

        return TmaBatchSyncResult(
            total_submitted=len(queue),
            synced_count=synced_count,
            failed_count=failed_count,
            results=results
        )

    def generate_whatsapp_order_summary(
        self,
        customer_name: str,
        doctor_name: Optional[str],
        phone: Optional[str],
        order_date: str,
        items_summary: List[Dict[str, Any]],
        total_volume: float,
        gross_subtotal: float,
        discount: float,
        net_grand_total: float,
        bank_name: str = "BCA",
        bank_acc: str = "0902207846",
        bank_holder: str = "FINDA FATIKASARI"
    ) -> str:
        """
        Constructs a clean, professional WhatsApp text receipt and returns a deep-link URL.
        """
        greeting_name = f"{doctor_name} ({customer_name})" if doctor_name else customer_name

        lines = [
            f"*RINGKASAN DRAFT PESANAN BENTOCAT*",
            f"Kepada: {greeting_name}",
            f"Tanggal: {order_date}",
            f"Status: *Menunggu Approval Finance*",
            f"",
            f"*Rincian Produk:*"
        ]

        for it in items_summary:
            lines.append(f"• {it['name']}: {it['quantity']:,} unit x Rp {it['unit_price']:,.0f} = Rp {it['subtotal']:,.0f}")

        lines.append(f"")
        lines.append(f"*Total Volume:* {total_volume:,.1f} Liter")
        lines.append(f"*Subtotal Produk:* Rp {gross_subtotal:,.0f}")
        if discount > 0:
            lines.append(f"*Diskon / Potongan:* -Rp {discount:,.0f}")
        lines.append(f"*Estimasi Total Tagihan:* *Rp {net_grand_total:,.0f}*")
        lines.append(f"")
        lines.append(f"*Rekening Pembayaran Resmi:*")
        lines.append(f"Bank: {bank_name}")
        lines.append(f"No. Rekening: *{bank_acc}*")
        lines.append(f"A.n: *{bank_holder}*")
        lines.append(f"")
        lines.append(f"Nomor invoice resmi dan nota fisik akan diterbitkan setelah disetujui Finance. Terima kasih! 🙏")

        raw_message = "\n".join(lines)
        encoded_msg = urllib.parse.quote(raw_message)

        # Normalize phone number to international format
        clean_phone = ""
        if phone:
            digits = re.sub(r"\D", "", phone)
            if digits.startswith("08"):
                clean_phone = "628" + digits[2:]
            elif digits.startswith("62"):
                clean_phone = digits
            else:
                clean_phone = digits

        return f"https://wa.me/{clean_phone}?text={encoded_msg}"
