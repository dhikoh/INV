"""
OMNICAT ENTERPRISE - DOMAIN DATA MODELS
Typed data structures for orders, items, invoices, and approvals.
"""

from dataclasses import dataclass, field, asdict
from typing import List, Optional, Dict, Any

@dataclass
class OrderItemInput:
    variant_id: str
    quantity: int
    unit_price: float

@dataclass
class CreateOrderInput:
    brand_id: str
    customer_id: str
    items: List[OrderItemInput]
    order_date: Optional[str] = None
    promotion_id: Optional[str] = None
    discount_amount: float = 0.0
    transport_fee_billed: float = 0.0
    unloading_fee_billed: float = 0.0
    notes: Optional[str] = None

@dataclass
class OrderItemOutput:
    id: str
    order_id: str
    variant_id: str
    variant_sku: str
    variant_name: str
    quantity: int
    unit_price: float
    cogs_per_unit: float
    line_subtotal: float
    line_cogs_total: float
    line_contribution_margin: float

@dataclass
class OrderOutput:
    id: str
    brand_id: str
    customer_id: str
    customer_name: str
    created_by_sales_id: str
    doc_number: Optional[int]
    revision_number: int
    order_date: str
    status: str
    total_order_volume: float
    gross_product_subtotal: float
    discount_amount: float
    transport_fee_billed: float
    unloading_fee_billed: float
    net_invoice_grand_total: float
    approved_by_admin_id: Optional[str] = None
    approved_at: Optional[str] = None
    rejection_reason: Optional[str] = None
    notes: Optional[str] = None
    items: List[OrderItemOutput] = field(default_factory=list)

@dataclass
class ApprovalResult:
    order_id: str
    doc_number: int
    invoice_id: str
    invoice_number: str
    total_amount: float
    issue_date: str
    due_date: str
