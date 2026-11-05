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

@dataclass
class FinancialClearanceInput:
    actual_freight_cost: float
    actual_unloading_cost: float = 0.0
    override_reason: Optional[str] = None

@dataclass
class OrderFinancialsOutput:
    order_id: str
    net_invoice_grand_total: float
    total_cogs_amount: float
    actual_freight_cost: float
    actual_unloading_cost: float
    net_transport_subsidy_borne: float
    contribution_margin_amount: float
    contribution_margin_percent: float
    is_margin_healthy: bool
    requires_superadmin_override: bool

@dataclass
class RegionalProfitabilitySummary:
    region_id: str
    region_name: str
    orders_count: int
    total_revenue: float
    total_cogs: float
    total_freight: float
    total_subsidy_borne: float
    gross_contribution_margin: float
    margin_percent: float

@dataclass
class CreatePromotionInput:
    brand_id: str
    code: str
    name: str
    promo_type: str  # 'PERCENTAGE_DISCOUNT', 'FIXED_DISCOUNT', 'FREE_TRANSPORT', 'SUBSIDIZED_TRANSPORT', 'FREE_GOODS'
    discount_percent: float = 0.0
    discount_fixed_amount: float = 0.0
    min_order_volume: float = 0.0
    start_date: str = ""
    end_date: str = ""
    requires_admin_approval: bool = False

@dataclass
class PromotionOutput:
    id: str
    brand_id: str
    code: str
    name: str
    promo_type: str
    discount_percent: float
    discount_fixed_amount: float
    min_order_volume: float
    start_date: str
    end_date: str
    requires_admin_approval: bool
    is_active: bool

@dataclass
class PromoValidationResult:
    is_valid: bool
    promo_id: Optional[str] = None
    promo_code: Optional[str] = None
    promo_name: Optional[str] = None
    promo_type: Optional[str] = None
    discount_amount: float = 0.0
    adjusted_transport_fee: float = 0.0
    rejection_reason: Optional[str] = None
    requires_admin_approval: bool = False



