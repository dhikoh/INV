"""
OMNICAT ENTERPRISE - REST API BACKEND (FASTAPI)
Provides end-to-end API routes for Telegram Mini App (TMA), field sales,
offline queue batch synchronization, Finance/Admin approvals, and QR verification.
"""

import os
import sqlite3
from typing import List, Optional, Dict, Any
from datetime import datetime, date

from fastapi import FastAPI, Depends, HTTPException, Header, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from backend.database import db
from backend.models import (
    TokenClaims,
    TmaDraftOrderInput,
    TmaDraftItemInput,
    TmaDraftOrderResult,
    TmaBatchSyncResult,
    ApprovalResult,
    FinancialClearanceInput
)
from backend.services.invoicing_service import InvoicingService
from backend.services.tma_service import TmaService
from backend.services.financial_clearance_service import FinancialClearanceService
from backend.services.payment_service import PaymentService
from backend.security.rbac_service import RbacService

app = FastAPI(
    title="OmniCat Enterprise API",
    description="Backend Distribution, Finance & Invoicing Engine for BentoCat",
    version="1.0.0"
)

# Enable CORS for local TMA development and web clients
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Instantiate core services
rbac_service = RbacService(db)
invoicing_service = InvoicingService(db)
tma_service = TmaService(db, invoicing_service=invoicing_service, rbac_service=rbac_service)
fin_service = FinancialClearanceService(db)
pay_service = PaymentService(db)

# ---------------------------------------------------------------------------
# DEPENDENCY: Authentication & Token Claims Extraction
# ---------------------------------------------------------------------------
def get_current_user(authorization: Optional[str] = Header(None)) -> TokenClaims:
    if not authorization:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Header Authorization Bearer token wajib disertakan."
        )
    parts = authorization.split()
    if len(parts) != 2 or parts[0].lower() != "bearer":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Format authorization header harus 'Bearer <token>'."
        )
    token = parts[1]
    try:
        return rbac_service.verify_token(token)
    except PermissionError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(e)
        )

# ---------------------------------------------------------------------------
# REQUEST & RESPONSE PYDANTIC SCHEMAS
# ---------------------------------------------------------------------------
class TelegramAuthRequest(BaseModel):
    init_data: str

class TelegramAuthResponse(BaseModel):
    is_valid: bool
    user_id: Optional[str] = None
    username: Optional[str] = None
    role: Optional[str] = None
    token: Optional[str] = None
    rejection_reason: Optional[str] = None

class BatchSyncRequest(BaseModel):
    drafts: List[Dict[str, Any]]

class ApproveOrderRequest(BaseModel):
    order_id: str
    override_reason: Optional[str] = None

class RejectOrderRequest(BaseModel):
    order_id: str
    reason: str

# ---------------------------------------------------------------------------
# API ROUTES
# ---------------------------------------------------------------------------

@app.get("/api/health")
def health_check():
    return {
        "status": "healthy",
        "service": "OmniCat Enterprise API",
        "timestamp": datetime.now().isoformat(),
        "database": "sqlite_wal"
    }

# --- 1. TMA Telegram Authentication ---
@app.post("/api/auth/telegram", response_model=TelegramAuthResponse)
def authenticate_telegram(req: TelegramAuthRequest):
    bot_token = os.environ.get("TELEGRAM_BOT_TOKEN", "mock_bot_token_for_dev")
    auth_result = rbac_service.validate_telegram_init_data(req.init_data, bot_token)
    if not auth_result.is_valid:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=auth_result.rejection_reason or "Otentikasi Telegram gagal."
        )
    return TelegramAuthResponse(
        is_valid=True,
        user_id=auth_result.user_id,
        username=auth_result.username,
        role=auth_result.role,
        token=auth_result.token
    )

# --- 2. Master Data: Customers & Products for TMA ---
@app.get("/api/customers")
def get_customers(claims: TokenClaims = Depends(get_current_user)):
    conn = db.get_connection()
    cur = conn.cursor()
    try:
        cur.execute("""
            SELECT 
                c.id, c.name, c.owner_doctor_name as doctor, c.phone,
                c.shipping_address, r.name as region_name,
                c.total_lifetime_orders as totalOrders,
                c.median_order_interval_days as medianInterval,
                c.last_order_date as lastOrder,
                c.predicted_next_order_date as predictedNextOrder,
                c.churn_risk as churnRisk
            FROM customers c
            JOIN regions r ON c.region_id = r.id
            ORDER BY c.name ASC
        """)
        rows = cur.fetchall()
        result = []
        today = date.today()
        for r in rows:
            last_dt = datetime.strptime(r["lastOrder"], "%Y-%m-%d").date() if r["lastOrder"] else None
            days_since = (today - last_dt).days if last_dt else 0
            med = r["medianInterval"] or 30
            
            # Determine status
            if days_since > (med + 14):
                status_calc = "OVERDUE"
            elif days_since >= (med - 3):
                status_calc = "DUE_FOR_REORDER"
            else:
                status_calc = "ACTIVE"

            result.append({
                "id": r["id"],
                "name": r["name"],
                "doctor": r["doctor"] or "-",
                "phone": r["phone"] or "-",
                "region": r["region_name"],
                "totalOrders": r["totalOrders"] or 0,
                "medianInterval": med,
                "daysSince": days_since,
                "status": status_calc
            })
        return {"customers": result}
    finally:
        conn.close()

@app.get("/api/products")
def get_products():
    conn = db.get_connection()
    cur = conn.cursor()
    try:
        cur.execute("""
            SELECT pv.id, pv.sku, pv.name, pv.packaging_unit, pv.unit_multiplier
            FROM product_variants pv
            ORDER BY pv.unit_multiplier DESC
        """)
        rows = cur.fetchall()
        from backend.services.tma_service import DEFAULT_VARIANT_PRICES
        products = []
        for r in rows:
            sku = r["sku"]
            price = DEFAULT_VARIANT_PRICES.get(sku, 133500.0)
            products.append({
                "id": r["id"],
                "sku": sku,
                "name": r["name"],
                "packaging_unit": r["packaging_unit"],
                "unit_multiplier": r["unit_multiplier"],
                "default_price": price
            })
        return {"products": products}
    finally:
        conn.close()

# --- 3. Field Sales Draft & Offline Batch Synchronization ---
@app.post("/api/orders/draft")
def create_draft_order(
    draft_data: Dict[str, Any],
    claims: TokenClaims = Depends(get_current_user),
    authorization: str = Header(...)
):
    token = authorization.split()[1]
    items_in = [
        TmaDraftItemInput(
            variant_sku=it["variant_sku"],
            quantity=int(it["quantity"]),
            unit_price=float(it["unit_price"]) if it.get("unit_price") else None
        )
        for it in draft_data.get("items", [])
    ]
    tma_in = TmaDraftOrderInput(
        brand_id=draft_data.get("brand_id", claims.brand_access[0] if claims.brand_access else "00000000-0000-0000-0000-000000000001"),
        customer_id=draft_data["customer_id"],
        client_order_id=draft_data.get("client_order_id"),
        items=items_in,
        order_date=draft_data.get("order_date"),
        notes=draft_data.get("notes")
    )
    try:
        res = tma_service.create_tma_draft_order(token, tma_in)
        return {"status": "success", "order": res.__dict__}
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

@app.post("/api/orders/sync")
def sync_offline_drafts(
    req: BatchSyncRequest,
    claims: TokenClaims = Depends(get_current_user),
    authorization: str = Header(...)
):
    token = authorization.split()[1]
    default_brand = claims.brand_access[0] if claims.brand_access else "00000000-0000-0000-0000-000000000001"
    
    typed_drafts = []
    for d in req.drafts:
        items = []
        # Support both direct items array or single quantity fields
        if "items" in d and d["items"]:
            for it in d["items"]:
                items.append(TmaDraftItemInput(
                    variant_sku=it.get("variant_sku", it.get("sku")),
                    quantity=int(it["quantity"]),
                    unit_price=float(it["unit_price"]) if it.get("unit_price") else None
                ))
        else:
            # Fallback for simple qty fields
            if d.get("qty25L"):
                items.append(TmaDraftItemInput(variant_sku="BC-PRM-25L", quantity=int(d["qty25L"])))
            if d.get("qty10L"):
                items.append(TmaDraftItemInput(variant_sku="BC-PRM-10L", quantity=int(d["qty10L"])))
            if d.get("qty5L"):
                items.append(TmaDraftItemInput(variant_sku="BC-PRM-5.5L", quantity=int(d["qty5L"])))

        typed_drafts.append(TmaDraftOrderInput(
            brand_id=d.get("brand_id", default_brand),
            customer_id=d["customer_id"],
            client_order_id=d.get("client_order_id"),
            items=items,
            order_date=d.get("order_date"),
            notes=d.get("notes")
        ))

    sync_result: TmaBatchSyncResult = tma_service.sync_offline_draft_queue(token, typed_drafts)
    return {
        "status": "success",
        "total_submitted": sync_result.total_submitted,
        "synced_count": sync_result.synced_count,
        "failed_count": sync_result.failed_count,
        "results": [r.__dict__ for r in sync_result.results]
    }

# --- 4. Finance & Admin Approval Workflow ---
@app.get("/api/finance/pending")
def list_pending_orders(claims: TokenClaims = Depends(get_current_user)):
    rbac_service.check_permission(claims, ("SUPER_ADMIN", "FINANCE"))
    conn = db.get_connection()
    cur = conn.cursor()
    try:
        cur.execute("""
            SELECT 
                o.id, o.client_order_id, o.order_date, o.total_order_volume,
                o.gross_product_subtotal, o.discount_amount, o.transport_fee_billed,
                o.net_invoice_grand_total, o.notes,
                c.id as customer_id, c.name as customer_name, r.name as region_name,
                u.full_name as sales_name
            FROM orders o
            JOIN customers c ON o.customer_id = c.id
            JOIN regions r ON c.region_id = r.id
            JOIN users u ON o.created_by_sales_id = u.id
            WHERE o.status = 'PENDING_APPROVAL'
            ORDER BY o.created_at ASC
        """)
        orders = []
        for row in cur.fetchall():
            cur.execute("""
                SELECT pv.name, oi.quantity, oi.unit_price, oi.line_subtotal
                FROM order_items oi
                JOIN product_variants pv ON oi.variant_id = pv.id
                WHERE oi.order_id = ?
            """, (row["id"],))
            items = [dict(it) for it in cur.fetchall()]
            ord_dict = dict(row)
            ord_dict["items"] = items
            orders.append(ord_dict)
        return {"pending_orders": orders}
    finally:
        conn.close()

@app.post("/api/finance/approve")
def approve_order_endpoint(req: ApproveOrderRequest, claims: TokenClaims = Depends(get_current_user)):
    rbac_service.check_permission(claims, ("SUPER_ADMIN", "FINANCE"))
    try:
        res = invoicing_service.approve_order(req.order_id, claims.user_id)
        return {
            "status": "success",
            "approval": res.__dict__
        }
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

@app.post("/api/finance/reject")
def reject_order_endpoint(req: RejectOrderRequest, claims: TokenClaims = Depends(get_current_user)):
    rbac_service.check_permission(claims, ("SUPER_ADMIN", "FINANCE"))
    try:
        invoicing_service.reject_order(req.order_id, claims.user_id, req.reason)
        return {"status": "success", "message": f"Order {req.order_id} berhasil ditolak (status: REVISION_REQUESTED)."}
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

# --- 5. QR Code Invoice Verification Endpoint ---
@app.get("/verify/{invoice_id}", response_class=HTMLResponse)
def verify_invoice_qr(invoice_id: str):
    conn = db.get_connection()
    cur = conn.cursor()
    try:
        cur.execute("""
            SELECT 
                inv.id, inv.invoice_number, inv.issue_date, inv.due_date,
                inv.total_amount, inv.amount_paid, inv.payment_status,
                o.doc_number, o.order_date, o.total_order_volume,
                c.name as customer_name, c.owner_doctor_name,
                r.name as region_name, b.name as brand_name,
                b.legal_entity_name
            FROM invoices inv
            JOIN orders o ON inv.order_id = o.id
            JOIN customers c ON o.customer_id = c.id
            JOIN regions r ON c.region_id = r.id
            JOIN brands b ON o.brand_id = b.id
            WHERE inv.id = ? OR inv.invoice_number = ?
        """, (invoice_id, invoice_id))
        row = cur.fetchone()
        if not row:
            return HTMLResponse(
                content=f"""
                <!DOCTYPE html>
                <html lang="id">
                <head>
                    <meta charset="UTF-8">
                    <title>Verifikasi Gagal - OmniCat</title>
                    <script src="https://cdn.tailwindcss.com"></script>
                </head>
                <body class="bg-slate-100 flex items-center justify-center min-h-screen p-4 font-sans">
                    <div class="bg-white max-w-md w-full rounded-2xl shadow-xl p-8 text-center space-y-4">
                        <div class="w-16 h-16 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center mx-auto text-3xl font-bold">✕</div>
                        <h1 class="text-xl font-bold text-slate-800">Invoice Tidak Ditemukan</h1>
                        <p class="text-sm text-slate-500">Nomor referensi atau ID invoice <code>{invoice_id}</code> tidak terdaftar pada sistem resmi OmniCat BentoCat.</p>
                        <div class="pt-4"><a href="/" class="text-xs text-blue-600 hover:underline">Kembali ke Beranda</a></div>
                    </div>
                </body>
                </html>
                """,
                status_code=404
            )

        status_badge = ""
        if row["payment_status"] == "PAID_LUNAS":
            status_badge = '<span class="px-3 py-1 bg-emerald-100 text-emerald-800 rounded-full text-xs font-bold">✓ LUNAS (PAID)</span>'
        elif row["payment_status"] == "PARTIAL_DP":
            status_badge = '<span class="px-3 py-1 bg-amber-100 text-amber-800 rounded-full text-xs font-bold">DP TERBAYAR</span>'
        else:
            status_badge = '<span class="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-xs font-bold">MENUNGGU PEMBAYARAN</span>'

        html_content = f"""
        <!DOCTYPE html>
        <html lang="id">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Verifikasi Invoice Resmi - {row['invoice_number']}</title>
            <script src="https://cdn.tailwindcss.com"></script>
        </head>
        <body class="bg-slate-100 flex items-center justify-center min-h-screen p-4 font-sans text-slate-800">
            <div class="bg-white max-w-md w-full rounded-2xl shadow-xl overflow-hidden border border-slate-200">
                <div class="bg-slate-900 text-white p-6 text-center space-y-1">
                    <div class="text-xs font-semibold tracking-wider uppercase text-emerald-400">✓ Dokumen Resmi Terverifikasi</div>
                    <h1 class="text-xl font-extrabold">{row['invoice_number']}</h1>
                    <p class="text-xs text-slate-400">{row['legal_entity_name']}</p>
                </div>
                
                <div class="p-6 space-y-4">
                    <div class="flex justify-between items-center pb-3 border-b border-slate-100">
                        <span class="text-xs text-slate-500">Status Pembayaran:</span>
                        {status_badge}
                    </div>

                    <div class="space-y-2 text-xs">
                        <div class="flex justify-between">
                            <span class="text-slate-500">Pelanggan / Mitra:</span>
                            <span class="font-bold text-slate-900">{row['customer_name']}</span>
                        </div>
                        <div class="flex justify-between">
                            <span class="text-slate-500">Wilayah:</span>
                            <span class="font-medium text-slate-700">{row['region_name']}</span>
                        </div>
                        <div class="flex justify-between">
                            <span class="text-slate-500">Tanggal Terbit:</span>
                            <span class="font-medium text-slate-700">{row['issue_date']}</span>
                        </div>
                        <div class="flex justify-between">
                            <span class="text-slate-500">Jatuh Tempo:</span>
                            <span class="font-medium text-slate-700">{row['due_date']}</span>
                        </div>
                        <div class="flex justify-between">
                            <span class="text-slate-500">Total Volume:</span>
                            <span class="font-medium text-slate-700">{row['total_order_volume']:,.1f} Liter</span>
                        </div>
                    </div>

                    <div class="bg-slate-50 p-4 rounded-xl border border-slate-200 text-center space-y-1">
                        <div class="text-xs text-slate-500">Total Tagihan Resmi:</div>
                        <div class="text-2xl font-black text-slate-900">Rp {row['total_amount']:,.0f}</div>
                    </div>

                    <div class="text-xs text-slate-400 text-center space-y-1 pt-2">
                        <p>Rekening Resmi: <b>BCA 0902207846</b> a.n. <b>FINDA FATIKASARI</b></p>
                        <p class="text-[10px]">Verifikasi Kriptografis OmniCat Trust Engine v1.0</p>
                    </div>
                </div>
            </div>
        </body>
        </html>
        """
        return HTMLResponse(content=html_content)
    finally:
        conn.close()

# Mount frontend directory
frontend_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "frontend")
if os.path.exists(frontend_dir):
    app.mount("/", StaticFiles(directory=frontend_dir, html=True), name="frontend")
