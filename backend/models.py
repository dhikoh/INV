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

@dataclass
class RecordPaymentInput:
    invoice_id: str
    payment_type: str  # 'DP', 'PELUNASAN', 'FULL_PAYMENT'
    amount: float
    payment_date: Optional[str] = None
    payment_method: str = "BCA Transfer"
    proof_image_url: Optional[str] = None
    notes: Optional[str] = None

@dataclass
class PaymentOutput:
    id: str
    invoice_id: str
    payment_type: str
    amount: float
    payment_date: str
    payment_method: str
    verified_by_user_id: str
    notes: Optional[str]
    remaining_invoice_balance: float
    new_payment_status: str

@dataclass
class AgingARInvoiceItem:
    invoice_id: str
    invoice_number: str
    customer_id: str
    customer_name: str
    region_name: str
    issue_date: str
    due_date: str
    total_amount: float
    amount_paid: float
    remaining_balance: float
    days_overdue: int
    bucket: str  # 'CURRENT', 'OVERDUE_1_15', 'OVERDUE_16_30', 'OVERDUE_31_60', 'CRITICAL_OVER_60'

@dataclass
class AgingARReport:
    as_of_date: str
    total_outstanding_ar: float
    total_current: float
    total_overdue_1_15: float
    total_overdue_16_30: float
    total_overdue_31_60: float
    total_critical_over_60: float
    invoices: List[AgingARInvoiceItem] = field(default_factory=list)

@dataclass
class TokenClaims:
    user_id: str
    username: str
    full_name: str
    role: str
    brand_access: List[str]
    telegram_user_id: Optional[int] = None
    exp: int = 0
    iat: int = 0

@dataclass
class TelegramAuthResult:
    is_valid: bool
    user_id: Optional[str] = None
    username: Optional[str] = None
    role: Optional[str] = None
    token: Optional[str] = None
    rejection_reason: Optional[str] = None

@dataclass
class CustomerCadenceMetric:
    customer_id: str
    customer_name: str
    region_name: str
    phone: Optional[str]
    brand_id: str
    total_orders: int
    total_volume_liters: float
    lifetime_revenue_idr: float
    first_order_date: Optional[str]
    last_order_date: Optional[str]
    median_interval_days: Optional[float]
    average_interval_days: Optional[float]
    days_since_last_order: int
    expected_next_order_date: Optional[str]
    health_status: str
    recommended_action: str
    favorite_variant: Optional[str]

@dataclass
class SalesCrmSummary:
    total_customers: int
    active_count: int
    due_for_reorder_count: int
    overdue_count: int
    churn_alert_count: int
    inactive_count: int
    new_customer_count: int
    customers: List[CustomerCadenceMetric] = field(default_factory=list)






