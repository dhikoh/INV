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

@dataclass
class SalesTargetInput:
    sales_user_id: str
    brand_id: str
    target_month: str  # Format: YYYY-MM
    target_volume_liters: float
    target_revenue_idr: float

@dataclass
class SalesPerformanceReport:
    sales_user_id: str
    sales_name: str
    brand_id: str
    target_month: str
    target_volume_liters: float
    actual_volume_liters: float
    volume_attainment_percent: float
    target_revenue_idr: float
    actual_revenue_idr: float
    revenue_attainment_percent: float
    orders_count: int
    average_order_value_idr: float
    performance_status: str

@dataclass
class TmaDraftItemInput:
    variant_sku: str
    quantity: int
    unit_price: Optional[float] = None

@dataclass
class TmaDraftOrderInput:
    client_order_id: str
    customer_id: str
    brand_id: str
    items: List[TmaDraftItemInput]
    order_date: Optional[str] = None
    notes: Optional[str] = None
    promo_code: Optional[str] = None

@dataclass
class TmaDraftOrderResult:
    client_order_id: str
    server_order_id: str
    status: str
    customer_id: str
    customer_name: str
    owner_doctor_name: Optional[str]
    total_volume_liters: float
    gross_subtotal_idr: float
    discount_idr: float
    net_grand_total_idr: float
    whatsapp_share_url: str
    is_synced: bool
    error_message: Optional[str] = None

@dataclass
class TmaBatchSyncResult:
    total_submitted: int
    synced_count: int
    failed_count: int
    results: List[TmaDraftOrderResult] = field(default_factory=list)

@dataclass
class DeliverySlipInput:
    order_id: str
    carrier_name: Optional[str] = "Ekspedisi Logistik Truk"
    vehicle_plate_number: Optional[str] = "S 8291 UJ"
    driver_name: Optional[str] = "Sopir Pengiriman"
    notes: Optional[str] = None

@dataclass
class DeliverySlipResult:
    order_id: str
    delivery_slip_number: str
    invoice_number: str
    doc_number: Optional[int]
    customer_name: str
    shipping_address: str
    shipping_date: str
    total_packages_count: int
    total_volume_liters: float
    estimated_weight_kg: float
    pdf_path: str

@dataclass
class FreightClusterOrder:
    order_id: str
    customer_id: str
    customer_name: str
    region_name: str
    order_date: str
    volume_liters: float
    standalone_freight_idr: float
    allocated_freight_idr: float = 0.0
    allocated_savings_idr: float = 0.0

@dataclass
class FreightOptimizationPlan:
    plan_id: str
    cluster_name: str
    window_start: str
    window_end: str
    recommended_truck_type: str  # 'TRUK_ENGKEL_8T' or 'TRUK_FUSO_15T'
    truck_capacity_liters: float
    total_volume_liters: float
    truck_utilization_percent: float
    standalone_total_freight_idr: float
    estafet_total_freight_idr: float
    projected_savings_idr: float
    savings_percent: float
    orders: List[FreightClusterOrder] = field(default_factory=list)
    route_stops: List[str] = field(default_factory=list)

@dataclass
class VendorInput:
    brand_id: str
    code: str
    name: str
    category: str  # 'FREIGHT_EXPEDITION', 'PACKAGING_SUPPLIER', 'RAW_MATERIAL', 'GENERAL_OPERATIONAL'
    contact_person: Optional[str] = None
    phone: Optional[str] = None
    bank_name: Optional[str] = None
    bank_account_number: Optional[str] = None
    bank_account_holder: Optional[str] = None

@dataclass
class VendorInvoiceInput:
    vendor_id: str
    brand_id: str
    invoice_number: str
    invoice_date: str
    due_date: str
    total_amount: float
    is_shared_freight: bool = False
    shared_order_ids: List[str] = field(default_factory=list)
    notes: Optional[str] = None

@dataclass
class VendorPaymentInput:
    vendor_invoice_id: str
    amount: float
    payment_date: str
    payment_method: str = "BCA Transfer"
    notes: Optional[str] = None

@dataclass
class VendorApSummary:
    total_invoices_count: int
    unpaid_count: int
    total_ap_amount_idr: float
    total_paid_idr: float
    total_outstanding_ap_idr: float
    overdue_outstanding_ap_idr: float
    invoices: List[Dict[str, Any]] = field(default_factory=list)

@dataclass
class CatalogPdfInput:
    brand_id: str
    format_type: str = "DISPLAY_LANDSCAPE"  # "DISPLAY_LANDSCAPE" or "B2B_PRICE_SHEET"
    target_region_id: Optional[str] = None
    effective_date: Optional[str] = None
    title: Optional[str] = None
    include_qr_code: bool = True
    notes: Optional[str] = None

@dataclass
class CatalogPdfResult:
    brand_id: str
    brand_code: str
    brand_name: str
    format_type: str
    orientation: str  # "LANDSCAPE" or "PORTRAIT"
    file_path: str
    page_count: int
    file_size_bytes: int
    has_pricing: bool
    generated_at: str

@dataclass
class AiExportInput:
    brand_id: Optional[str] = None
    redacted: bool = True  # UU PDP compliance
    requested_by_user_id: str = "00000000-0000-0000-0000-000000000001"
    include_financials: bool = True
    include_logistics: bool = True
    include_customers: bool = True

@dataclass
class AiExportResult:
    export_id: str
    generated_at: str
    is_redacted: bool
    brand_scope: str
    total_orders_included: int
    total_revenue_idr: float
    total_volume_liters: float
    json_schema_version: str
    data: Dict[str, Any]
    json_payload: str

@dataclass
class BrandImportInput:
    performed_by_user_id: str
    brand_data: Dict[str, Any]
    dry_run: bool = False
    superadmin_2fa_confirmed: bool = False
    two_factor_auth_token: Optional[str] = None

@dataclass
class BrandImportResult:
    success: bool
    brand_id: str
    brand_code: str
    is_dry_run: bool
    changes_detected: List[str]
    bank_accounts_updated: int
    bank_timelock_active: bool
    bank_timelock_until: Optional[str]
    audit_log_id: str
    message: str













