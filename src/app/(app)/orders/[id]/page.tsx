'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Edit,
  Trash2,
  Calendar,
  Truck,
  FileText,
  AlertTriangle,
  Building2,
  DollarSign,
  TrendingDown,
  TrendingUp,
  ShieldAlert,
  Clock,
  CheckCircle2,
  XCircle,
  Package,
  Send,
  RotateCcw,
  X,
  Loader2,
  CreditCard,
  ExternalLink,
  Printer,
  Eye,
  Plus,
  MessageCircle,
  Ban,
} from 'lucide-react';
import { Skeleton, ErrorState } from '@/components/ui/States';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { ConfirmTypeDialog } from '@/components/ui/ConfirmTypeDialog';
import { formatRupiah, formatPercentFromBps } from '@/lib/domain/money';
import { formatDateId } from '@/lib/format/date';

interface OrderItemDto {
  id: string;
  productId: string;
  productName: string;
  sku: string;
  unit: string;
  qty: number;
  listPrice: number;
  unitPrice: number;
  discountType: string;
  discountValue: number;
  discountSource: string;
  lineSubtotal: number;
  lineDiscount: number;
  lineNet: number;
  floorPrice: number;
  belowMin: boolean;
  costPrice?: number;
  sortOrder: number;
}

interface ProfitSimulationDto {
  revenue: number;
  goodsRevenue: number;
  cogs: number;
  shippingActualCost: number;
  extraCosts: number;
  profit: number;
  marginBps: number;
}

interface PaymentItemDto {
  id: string;
  businessId: string;
  orderId: string;
  invoiceId: string | null;
  type: string;
  method: string;
  status: string;
  amount: number;
  paidAt: string;
  reference: string | null;
  proofPath: string | null;
  notes: string | null;
  createdById: string;
  verifiedById: string | null;
  verifiedAt: string | null;
  rejectReason: string | null;
  receiptNo?: string | null;
  verifyToken?: string | null;
  createdAt: string;
  updatedAt: string;
}

interface OrderDetailDto {
  id: string;
  orderNo: string | null;
  orderDate: string;
  status: string;
  version: number;
  rev: number;
  customerSeq: number | null;
  customerId: string;
  customer?: { id: string; code: string; name: string };
  salesId: string;
  deliveryAddress: string | null;
  notes: string | null;
  repeatIntervalDays: number | null;
  subtotal: number;
  discountTotal: number;
  shippingCharge: number;
  ppnEnabled: boolean;
  ppnRateBps: number;
  ppnAmount: number;
  grandTotal: number;
  dpBps: number;
  dpAmount: number;
  hasBelowMin: boolean;
  belowMinReason: string | null;
  overrideNote: string | null;
  rejectReason: string | null;
  paidTotal: number;
  creditTotal: number;
  stockReserved: boolean;
  cancelReason?: string | null;
  cancelledAt?: string | null;
  createdAt: string;
  updatedAt: string;
  items?: OrderItemDto[];
  revisions?: OrderRevisionItemDto[];
  profitSimulation?: ProfitSimulationDto;
  invoices?: InvoiceItemDto[];
  shipments?: ShipmentDto[];
  shipmentProgress?: OrderShipmentItemProgress[];
  businessPolicy?: {
    showBankOnProforma: boolean;
    allowSalesCashPayment: boolean;
    requireTransferProofForSales: boolean;
    allowPartialShipment: boolean;
    allowShipBeforeFinalInvoice: boolean;
    requirePaidBeforeShip: boolean;
  };
  pendingInvoice?: {
    id: string;
    type: 'DP' | 'FINAL';
    status: string;
    version: number;
    amount: number;
    number?: string | null;
  } | null;
}

interface OrderRevisionItemDto {
  id: string;
  revisionNo: number;
  status: 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED';
  reason: string;
  belowMinReason: string | null;
  rejectReason: string | null;
  oldGrandTotal: number;
  newGrandTotal: number;
  deltaGrandTotal: number;
  hasBelowMin: boolean;
  requestedAt: string;
  reviewedAt: string | null;
  items: Array<{
    id: string;
    productId: string;
    productName: string;
    sku: string;
    unit: string;
    oldQty: number;
    newQty: number;
    unitPrice: number;
    lineNet: number;
  }>;
}

interface InvoiceItemDto {
  id: string;
  type: 'DP' | 'FINAL';
  status: string;
  version: number;
  number?: string | null;
  amount: number;
  paidAmount: number;
  dueDate?: string | null;
  notes?: string | null;
  rejectReason?: string | null;
}

interface ShipmentItemDto {
  id: string;
  shipmentId?: string;
  orderItemId: string;
  productId?: string;
  productName?: string;
  sku?: string;
  unit?: string;
  qty: number;
}

interface OrderShipmentItemProgress {
  orderItemId: string;
  productId: string;
  productName: string;
  sku: string;
  unit: string;
  orderedQty: number;
  shippedQty: number;
  remainingQty: number;
}

interface ShipmentDto {
  id: string;
  orderId: string;
  kloterNo: number;
  method: 'OWN_FLEET' | 'EXPEDITION' | 'TRANSPORT_VENDOR';
  transporterId: string | null;
  trackingNo: string | null;
  driverName: string | null;
  vehiclePlate: string | null;
  receiverName: string | null;
  status: 'PREPARING' | 'SHIPPED' | 'DELIVERED';
  deliveryNo: string | null;
  actualCost?: number;
  shippedAt: string | null;
  deliveredAt: string | null;
  notes: string | null;
  items?: ShipmentItemDto[];
  createdAt: string;
  updatedAt: string;
}

interface CreditNoteItemDto {
  id: string;
  orderItemId: string;
  qty: number;
  creditAmount: number;
  restock: boolean;
  costReversed?: number;
}

interface CreditNoteDto {
  id: string;
  businessId: string;
  orderId: string;
  customerId: string;
  number: string;
  reason: string;
  settlement: 'OFFSET' | 'REFUND' | 'CUSTOMER_CREDIT';
  amountExPpn: number;
  ppnAmount: number;
  total: number;
  cogsReversed?: number;
  createdById: string;
  createdAt: string;
  voidedAt: string | null;
  items: CreditNoteItemDto[];
}

interface OrderCostItemDto {
  id: string;
  label: string;
  amount: number;
  createdById: string;
  createdAt: string;
}

interface OrderProfitDetailDto {
  orderId: string;
  goodsRevenue: number;
  shippingCharge: number;
  revenue: number;
  cogs: number;
  shippingActualCost: number;
  shippingSubsidy: number;
  extraCosts: number;
  profit: number;
  marginBps: number;
  discountBySource: {
    MANUAL: number;
    PROMO: number;
    SUBSIDY: number;
  };
  costs: OrderCostItemDto[];
  commission?: {
    id: string;
    mode: string;
    basisAmount: number;
    rateBps: number;
    amount: number;
    status: 'EARNED' | 'PAID' | 'REVERSED';
    earnedAt: string;
    paidAt: string | null;
    reversedAt: string | null;
    note: string | null;
  } | null;
}

export default function OrderDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = typeof params?.id === 'string' ? params.id : '';

  const [order, setOrder] = useState<OrderDetailDto | null>(null);
  const [currentUser, setCurrentUser] = useState<{
    id: string;
    role: 'SUPERADMIN' | 'SALES';
    name: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const loadedIdRef = useRef<string | null>(null);
  const currentUserRef = useRef<{
    id: string;
    role: 'SUPERADMIN' | 'SALES';
    name: string;
  } | null>(null);

  // Modal Hapus Draf
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Modal Batalkan Pesanan Resmi (Super Admin)
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelDpSettlement, setCancelDpSettlement] = useState<'REFUND' | 'CUSTOMER_CREDIT'>('REFUND');
  const [cancelRefundMethod, setCancelRefundMethod] = useState<'TRANSFER' | 'CASH' | 'OTHER'>('TRANSFER');
  const [cancelRefundReference, setCancelRefundReference] = useState('');
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  // Modal Ajukan Pesanan (Submit)
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);
  const [submitBelowMinReason, setSubmitBelowMinReason] = useState('');

  // Modal Tarik Pengajuan (Withdraw)
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);
  const [withdrawError, setWithdrawError] = useState<string | null>(null);

  // Modal Setujui (Approve) - Khusus Super Admin
  const [showApproveModal, setShowApproveModal] = useState(false);
  const [approving, setApproving] = useState(false);
  const [approveError, setApproveError] = useState<string | null>(null);
  const [overrideNote, setOverrideNote] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [theme, setTheme] = useState<'PROFESIONAL' | 'FAMILY' | 'MINIMALIS' | 'MODERN' | 'KLASIK'>('PROFESIONAL');

  // Modal Tolak / Minta Revisi (Reject) - Khusus Super Admin
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [rejectError, setRejectError] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  // Riwayat & Modal Pembayaran
  const [payments, setPayments] = useState<PaymentItemDto[]>([]);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [payInvoiceId, setPayInvoiceId] = useState('');
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState<'TRANSFER' | 'CASH' | 'CREDIT' | 'OTHER'>('TRANSFER');
  const [payDate, setPayDate] = useState(new Date().toISOString().split('T')[0]);
  const [payRef, setPayRef] = useState('');
  const [payNotes, setPayNotes] = useState('');
  const [payFile, setPayFile] = useState<File | null>(null);
  const [payAutoVerify, setPayAutoVerify] = useState(false);
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);

  // Modal Verifikasi Pembayaran (Super Admin)
  const [selectedVerifyPayment, setSelectedVerifyPayment] = useState<PaymentItemDto | null>(null);
  const [verifyingPayment, setVerifyingPayment] = useState(false);
  const [verifyPaymentError, setVerifyPaymentError] = useState<string | null>(null);

  // Modal Tolak Pembayaran (Super Admin)
  const [selectedRejectPayment, setSelectedRejectPayment] = useState<PaymentItemDto | null>(null);
  const [paymentRejectReason, setPaymentRejectReason] = useState('');
  const [paymentRejecting, setPaymentRejecting] = useState(false);
  const [paymentRejectError, setPaymentRejectError] = useState<string | null>(null);

  // Modal Persetujuan / Penolakan Revisi Pesanan (Fase 3 - Super Admin)
  const [processingRevisionId, setProcessingRevisionId] = useState<string | null>(null);
  const [rejectRevisionTarget, setRejectRevisionTarget] = useState<OrderRevisionItemDto | null>(null);
  const [revisionRejectReason, setRevisionRejectReason] = useState('');
  const [revisionActionError, setRevisionActionError] = useState<string | null>(null);

  // Modal Void Pembayaran (Super Admin)
  const [selectedVoidPayment, setSelectedVoidPayment] = useState<PaymentItemDto | null>(null);
  const [paymentVoidReason, setPaymentVoidReason] = useState('');
  const [paymentVoiding, setPaymentVoiding] = useState(false);
  const [paymentVoidError, setPaymentVoidError] = useState<string | null>(null);

  // Pengajuan Faktur Pelunasan (Request Final)
  const [showRequestFinalModal, setShowRequestFinalModal] = useState(false);
  const [finalShippingCharge, setFinalShippingCharge] = useState('');
  const [finalShippingReason, setFinalShippingReason] = useState('');
  const [requestingFinal, setRequestingFinal] = useState(false);
  const [requestFinalError, setRequestFinalError] = useState<string | null>(null);

  // Pembatalan Faktur Resmi (Void Invoice - Super Admin)
  const [selectedVoidInvoice, setSelectedVoidInvoice] = useState<InvoiceItemDto | null>(null);
  const [voidInvoiceReason, setVoidInvoiceReason] = useState('');
  const [voidingInvoice, setVoidingInvoice] = useState(false);
  const [voidInvoiceError, setVoidInvoiceError] = useState<string | null>(null);

  // Data Pengiriman & Surat Jalan (Shipment)
  const [shipment, setShipment] = useState<ShipmentDto | null>(null);
  const [shipments, setShipments] = useState<ShipmentDto[]>([]);
  const [editingShipmentId, setEditingShipmentId] = useState<string | null>(null);
  const [showShipmentModal, setShowShipmentModal] = useState(false);
  const [shipMethod, setShipMethod] = useState<'OWN_FLEET' | 'EXPEDITION' | 'TRANSPORT_VENDOR'>('OWN_FLEET');
  const [shipTrackingNo, setShipTrackingNo] = useState('');
  const [shipDriverName, setShipDriverName] = useState('');
  const [shipVehiclePlate, setShipVehiclePlate] = useState('');
  const [shipReceiverName, setShipReceiverName] = useState('');
  const [shipNotes, setShipNotes] = useState('');
  const [shipActualCost, setShipActualCost] = useState('');
  const [savingShipment, setSavingShipment] = useState(false);
  const [shipmentError, setShipmentError] = useState<string | null>(null);

  // Modal Kirim Pesanan (Ship)
  const [showShipModal, setShowShipModal] = useState(false);
  const [activeShipTargetId, setActiveShipTargetId] = useState<string | null>(null);
  const [shipItemQtys, setShipItemQtys] = useState<Record<string, number>>({});
  const [shippingOrder, setShippingOrder] = useState(false);
  const [shipOrderError, setShipOrderError] = useState<string | null>(null);

  // Modal Penerimaan Pesanan (Deliver)
  const [showDeliverModal, setShowDeliverModal] = useState(false);
  const [activeDeliverShipmentId, setActiveDeliverShipmentId] = useState<string | null>(null);
  const [deliverReceiverName, setDeliverReceiverName] = useState('');
  const [deliveringOrder, setDeliveringOrder] = useState(false);
  const [deliverOrderError, setDeliverOrderError] = useState<string | null>(null);

  // Data Nota Kredit & Retur Penjualan (Credit Notes)
  const [creditNotes, setCreditNotes] = useState<CreditNoteDto[]>([]);
  const [customerCreditBalance, setCustomerCreditBalance] = useState<number | null>(null);

  // Modal Buat Nota Kredit (Create Credit Note)
  const [showCreateCreditNoteModal, setShowCreateCreditNoteModal] = useState(false);
  const [cnReason, setCnReason] = useState('');
  const [cnSettlement, setCnSettlement] = useState<'OFFSET' | 'CUSTOMER_CREDIT' | 'REFUND'>('OFFSET');
  const [cnItems, setCnItems] = useState<{ [orderItemId: string]: { qty: number; restock: boolean } }>({});
  const [creatingCreditNote, setCreatingCreditNote] = useState(false);
  const [creditNoteError, setCreditNoteError] = useState<string | null>(null);

  // Modal Batalkan (Void) Nota Kredit (Super Admin)
  const [showVoidCreditNoteModal, setShowVoidCreditNoteModal] = useState(false);
  const [selectedVoidCreditNote, setSelectedVoidCreditNote] = useState<CreditNoteDto | null>(null);
  const [voidCreditNoteReason, setVoidCreditNoteReason] = useState('');
  const [voidingCreditNote, setVoidingCreditNote] = useState(false);
  const [voidCreditNoteError, setVoidCreditNoteError] = useState<string | null>(null);

  // Data Profit Riil & Komisi (Khusus Super Admin)
  const [orderProfit, setOrderProfit] = useState<OrderProfitDetailDto | null>(null);

  // Modal Tambah Biaya Lain (OrderCost)
  const [showAddCostModal, setShowAddCostModal] = useState(false);
  const [costLabel, setCostLabel] = useState('');
  const [costAmount, setCostAmount] = useState('');
  const [addingCost, setAddingCost] = useState(false);
  const [deletingCostId, setDeletingCostId] = useState<string | null>(null);
  const [costError, setCostError] = useState<string | null>(null);

  // Modal Bayar Komisi (Super Admin)
  const [showPayCommissionModal, setShowPayCommissionModal] = useState(false);
  const [payCommissionNote, setPayCommissionNote] = useState('');
  const [payingCommission, setPayingCommission] = useState(false);
  const [payCommissionError, setPayCommissionError] = useState<string | null>(null);

  const fetchOrderDetail = useCallback(async () => {
    if (!id) return;
    try {
      if (loadedIdRef.current !== id) {
        setLoading(true);
      }
      setError(null);

      const needMe = !currentUserRef.current;
      const [orderRes, meRes, paymentsRes, shipmentRes, creditNotesRes] = await Promise.all([
        fetch(`/api/v1/orders/${id}`),
        needMe ? fetch('/api/v1/auth/me') : Promise.resolve(null),
        fetch(`/api/v1/orders/${id}/payments`),
        fetch(`/api/v1/orders/${id}/shipment`),
        fetch(`/api/v1/orders/${id}/credit-notes`),
      ]);

      if (!orderRes.ok) {
        if (orderRes.status === 404) {
          throw new Error('Pesanan tidak ditemukan atau Anda tidak memiliki akses ke pesanan ini.');
        }
        const json = await orderRes.json().catch(() => ({}));
        throw new Error(json.error?.message || 'Gagal memuat detail pesanan.');
      }

      const orderJson = await orderRes.json();
      setOrder(orderJson.data);
      loadedIdRef.current = id;

      let resolvedUser = currentUserRef.current;
      if (meRes?.ok) {
        const meJson = await meRes.json();
        resolvedUser = meJson.data?.user ?? null;
        if (resolvedUser) {
          currentUserRef.current = resolvedUser;
          setCurrentUser(resolvedUser);
        }
      }

      if (resolvedUser?.role === 'SUPERADMIN') {
        fetch(`/api/v1/orders/${id}/profit`)
          .then((r) => (r.ok ? r.json() : null))
          .then((pJson) => {
            if (pJson?.data) setOrderProfit(pJson.data);
          })
          .catch(() => {});
      }

      if (paymentsRes.ok) {
        const payJson = await paymentsRes.json();
        setPayments(payJson.data || []);
      }

      let resolvedShipments: ShipmentDto[] = Array.isArray(orderJson.data?.shipments)
        ? orderJson.data.shipments
        : [];
      if (shipmentRes.ok) {
        const shipJson = await shipmentRes.json();
        if (resolvedShipments.length === 0 && shipJson.data) {
          resolvedShipments = [shipJson.data];
        }
        setShipment(shipJson.data || resolvedShipments[resolvedShipments.length - 1] || null);
      } else {
        setShipment(resolvedShipments[resolvedShipments.length - 1] || null);
      }
      setShipments(resolvedShipments);

      if (creditNotesRes.ok) {
        const cnJson = await creditNotesRes.json();
        setCreditNotes(cnJson.data || []);
      }

      if (orderJson.data?.customerId) {
        fetch(`/api/v1/customers/${orderJson.data.customerId}/credit-balance`)
          .then((r) => (r.ok ? r.json() : null))
          .then((cJson) => {
            if (cJson?.data?.balance !== undefined) {
              setCustomerCreditBalance(cJson.data.balance);
            }
          })
          .catch(() => {});
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Terjadi kesalahan sistem.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchOrderDetail();
  }, [fetchOrderDetail]);

  // Handle Hapus Draf (Super Admin)
  const handleDeleteOrder = async () => {
    if (!order) return;
    const confirmText = order.orderNo ?? order.id;

    try {
      setDeleting(true);
      setDeleteError(null);

      const res = await fetch(`/api/v1/orders/${order.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: confirmText }),
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(json.error?.message || 'Gagal menghapus pesanan.');
      }

      setShowDeleteModal(false);
      router.push('/orders');
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Gagal menghapus pesanan.');
    } finally {
      setDeleting(false);
    }
  };

  // Handle Batalkan Pesanan Resmi (Super Admin)
  const handleCancelOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!order) return;
    if (cancelReason.trim().length < 5) {
      setCancelError('Alasan pembatalan wajib diisi minimal 5 karakter');
      return;
    }

    try {
      setCancelling(true);
      setCancelError(null);

      const hasPaidFunds = (order.paidTotal || 0) > 0;
      const payload: Record<string, unknown> = {
        reason: cancelReason.trim(),
        rev: order.rev,
      };
      if (hasPaidFunds) {
        payload.dpSettlement = cancelDpSettlement;
        if (cancelDpSettlement === 'REFUND') {
          payload.refundMethod = cancelRefundMethod;
          if (cancelRefundReference.trim()) {
            payload.refundReference = cancelRefundReference.trim();
          }
        }
      }

      const res = await fetch(`/api/v1/orders/${order.id}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json.error?.message || 'Gagal membatalkan pesanan');
      }

      setShowCancelModal(false);
      setCancelReason('');
      setCancelRefundReference('');
      setSubmitSuccess('Pesanan berhasil dibatalkan secara resmi');
      fetchOrderDetail();
    } catch (err) {
      setCancelError(err instanceof Error ? err.message : 'Gagal membatalkan pesanan');
    } finally {
      setCancelling(false);
    }
  };

  const handleSubmitOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!order) return;
    try {
      setSubmitting(true);
      setSubmitError(null);

      if (order.hasBelowMin && submitBelowMinReason.trim().length < 5) {
        setSubmitError('Alasan harga di bawah minimal wajib diisi minimal 5 karakter');
        setSubmitting(false);
        return;
      }

      const res = await fetch(`/api/v1/orders/${order.id}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          belowMinReason: order.hasBelowMin ? submitBelowMinReason.trim() : undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || data.error?.message || 'Gagal mengajukan pesanan');
      }

      setSubmitSuccess('Pesanan berhasil diajukan dan sedang menunggu persetujuan Super Admin.');
      setShowSubmitModal(false);
      fetchOrderDetail();
    } catch (err: unknown) {
      setSubmitError(err instanceof Error ? err.message : 'Gagal mengajukan pesanan');
    } finally {
      setSubmitting(false);
    }
  };

  const handleWithdrawOrder = async () => {
    if (!order) return;
    try {
      setWithdrawing(true);
      setWithdrawError(null);

      const res = await fetch(`/api/v1/orders/${order.id}/withdraw`, {
        method: 'POST',
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || data.error?.message || 'Gagal menarik pengajuan pesanan');
      }

      setSubmitSuccess('Pengajuan pesanan berhasil ditarik kembali ke draf.');
      setShowWithdrawModal(false);
      fetchOrderDetail();
    } catch (err: unknown) {
      setWithdrawError(err instanceof Error ? err.message : 'Gagal menarik pengajuan pesanan');
    } finally {
      setWithdrawing(false);
    }
  };

  const handleApproveOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!order || !order.pendingInvoice) return;
    try {
      setApproving(true);
      setApproveError(null);

      if (order.hasBelowMin && overrideNote.trim().length < 5) {
        setApproveError('Catatan persetujuan khusus (override) wajib diisi minimal 5 karakter');
        setApproving(false);
        return;
      }

      const res = await fetch(`/api/v1/invoices/${order.pendingInvoice.id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rev: order.rev,
          overrideNote: order.hasBelowMin ? overrideNote.trim() : undefined,
          dueDate: dueDate || undefined,
          theme,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || data.error?.message || 'Gagal menyetujui pesanan');
      }

      setSubmitSuccess(`Pesanan & Faktur ${order.pendingInvoice.type} berhasil disetujui!`);
      setShowApproveModal(false);
      fetchOrderDetail();
    } catch (err: unknown) {
      setApproveError(err instanceof Error ? err.message : 'Gagal menyetujui pesanan');
    } finally {
      setApproving(false);
    }
  };

  const handleRejectOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!order || !order.pendingInvoice) return;
    try {
      setRejecting(true);
      setRejectError(null);

      if (rejectReason.trim().length < 5) {
        setRejectError('Alasan penolakan / permintaan revisi wajib diisi minimal 5 karakter');
        setRejecting(false);
        return;
      }

      const res = await fetch(`/api/v1/invoices/${order.pendingInvoice.id}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rev: order.rev,
          reason: rejectReason.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || data.error?.message || 'Gagal menolak pesanan');
      }

      setSubmitSuccess('Pengajuan pesanan berhasil ditolak dan dikembalikan ke staf Sales untuk direvisi.');
      setShowRejectModal(false);
      fetchOrderDetail();
    } catch (err: unknown) {
      setRejectError(err instanceof Error ? err.message : 'Gagal menolak pesanan');
    } finally {
      setRejecting(false);
    }
  };

  // Handle Catat Pembayaran
  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!order) return;
    try {
      setPaying(true);
      setPayError(null);

      const parsedAmount = Number(payAmount);
      if (isNaN(parsedAmount) || parsedAmount <= 0) {
        throw new Error('Jumlah pembayaran harus berupa angka positif');
      }

      const allowSalesCash = order.businessPolicy?.allowSalesCashPayment ?? false;
      const requireSalesProof = order.businessPolicy?.requireTransferProofForSales ?? true;
      if (currentUser?.role !== 'SUPERADMIN') {
        if (payMethod === 'CASH' && !allowSalesCash) {
          throw new Error('Metode pembayaran Tunai tidak diizinkan untuk Sales oleh kebijakan usaha.');
        }
        if (payMethod === 'TRANSFER' && requireSalesProof && !payFile) {
          throw new Error('Sales wajib mengunggah bukti transfer sebelum mencatat pembayaran Transfer Bank.');
        }
      }

      let res: Response;
      if (payFile) {
        const formData = new FormData();
        if (payInvoiceId) formData.append('invoiceId', payInvoiceId);
        formData.append('amount', String(parsedAmount));
        formData.append('method', payMethod);
        formData.append('paidAt', payDate);
        if (payRef.trim()) formData.append('reference', payRef.trim());
        if (payNotes.trim()) formData.append('notes', payNotes.trim());
        if (payAutoVerify && currentUser?.role === 'SUPERADMIN') {
          formData.append('autoVerify', 'true');
        }
        formData.append('proof', payFile);

        res = await fetch(`/api/v1/orders/${order.id}/payments`, {
          method: 'POST',
          body: formData,
        });
      } else {
        res = await fetch(`/api/v1/orders/${order.id}/payments`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            invoiceId: payInvoiceId || undefined,
            amount: parsedAmount,
            method: payMethod,
            paidAt: payDate,
            reference: payRef.trim() || undefined,
            notes: payNotes.trim() || undefined,
            autoVerify: payAutoVerify && currentUser?.role === 'SUPERADMIN',
          }),
        });
      }

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json.error?.message || json.message || 'Gagal mencatat pembayaran');
      }

      setSubmitSuccess('Pembayaran berhasil dicatat!');
      setShowPaymentModal(false);
      setPayInvoiceId('');
      setPayAmount('');
      setPayRef('');
      setPayNotes('');
      setPayFile(null);
      fetchOrderDetail();
    } catch (err: unknown) {
      setPayError(err instanceof Error ? err.message : 'Gagal mencatat pembayaran');
    } finally {
      setPaying(false);
    }
  };

  // Handle Verifikasi Pembayaran (Super Admin)
  const handleVerifyPayment = async () => {
    if (!selectedVerifyPayment) return;
    try {
      setVerifyingPayment(true);
      setVerifyPaymentError(null);

      const res = await fetch(`/api/v1/payments/${selectedVerifyPayment.id}/verify`, {
        method: 'POST',
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json.error?.message || json.message || 'Gagal memverifikasi pembayaran');
      }

      setSubmitSuccess('Pembayaran berhasil diverifikasi!');
      setSelectedVerifyPayment(null);
      fetchOrderDetail();
    } catch (err: unknown) {
      setVerifyPaymentError(err instanceof Error ? err.message : 'Gagal memverifikasi');
    } finally {
      setVerifyingPayment(false);
    }
  };

  // Handle Tolak Pembayaran (Super Admin)
  const handleRejectPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRejectPayment) return;
    try {
      setPaymentRejecting(true);
      setPaymentRejectError(null);

      if (paymentRejectReason.trim().length < 5) {
        setPaymentRejectError('Alasan penolakan wajib minimal 5 karakter');
        setPaymentRejecting(false);
        return;
      }

      const res = await fetch(`/api/v1/payments/${selectedRejectPayment.id}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: paymentRejectReason.trim() }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json.error?.message || json.message || 'Gagal menolak pembayaran');
      }

      setSubmitSuccess('Pembayaran berhasil ditolak.');
      setSelectedRejectPayment(null);
      setPaymentRejectReason('');
      fetchOrderDetail();
    } catch (err: unknown) {
      setPaymentRejectError(err instanceof Error ? err.message : 'Gagal menolak pembayaran');
    } finally {
      setPaymentRejecting(false);
    }
  };

  // Handle Void Pembayaran (Super Admin)
  const handleVoidPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedVoidPayment) return;
    try {
      setPaymentVoiding(true);
      setPaymentVoidError(null);

      if (paymentVoidReason.trim().length < 5) {
        setPaymentVoidError('Alasan pembatalan (void) wajib minimal 5 karakter');
        setPaymentVoiding(false);
        return;
      }

      const res = await fetch(`/api/v1/payments/${selectedVoidPayment.id}/void`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: paymentVoidReason.trim() }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json.error?.message || json.message || 'Gagal membatalkan pembayaran');
      }

      setSubmitSuccess('Pembayaran berhasil dibatalkan (void).');
      setSelectedVoidPayment(null);
      setPaymentVoidReason('');
      fetchOrderDetail();
    } catch (err: unknown) {
      setPaymentVoidError(err instanceof Error ? err.message : 'Gagal membatalkan pembayaran');
    } finally {
      setPaymentVoiding(false);
    }
  };

  // Handle Pengajuan Faktur Pelunasan (Request Final)
  const handleRequestFinal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!order) return;
    try {
      setRequestingFinal(true);
      setRequestFinalError(null);

      const parsedCharge = finalShippingCharge !== '' ? Number(finalShippingCharge) : order.shippingCharge;
      if (parsedCharge !== order.shippingCharge && finalShippingReason.trim().length < 5) {
        setRequestFinalError('Alasan perubahan ongkos kirim wajib minimal 5 karakter');
        setRequestingFinal(false);
        return;
      }

      const body: Record<string, unknown> = {};
      if (parsedCharge !== order.shippingCharge) {
        body.shippingCharge = parsedCharge;
        body.shippingReason = finalShippingReason.trim();
      }

      const res = await fetch(`/api/v1/orders/${order.id}/request-final`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json.error?.message || json.message || 'Gagal mengajukan faktur pelunasan');
      }

      setSubmitSuccess('Pengajuan faktur pelunasan berhasil dikirim untuk persetujuan.');
      setShowRequestFinalModal(false);
      fetchOrderDetail();
    } catch (err: unknown) {
      setRequestFinalError(err instanceof Error ? err.message : 'Gagal mengajukan faktur pelunasan');
    } finally {
      setRequestingFinal(false);
    }
  };

  // Handle Pembatalan Faktur Resmi (Void Invoice - Super Admin)
  const handleVoidInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedVoidInvoice) return;
    try {
      setVoidingInvoice(true);
      setVoidInvoiceError(null);

      if (voidInvoiceReason.trim().length < 5) {
        setVoidInvoiceError('Alasan pembatalan (void) wajib minimal 5 karakter');
        setVoidingInvoice(false);
        return;
      }

      const res = await fetch(`/api/v1/invoices/${selectedVoidInvoice.id}/void`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: voidInvoiceReason.trim() }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json.error?.message || json.message || 'Gagal membatalkan faktur');
      }

      setSubmitSuccess('Faktur berhasil dibatalkan (VOID). Status pesanan telah diperbarui.');
      setSelectedVoidInvoice(null);
      setVoidInvoiceReason('');
      fetchOrderDetail();
    } catch (err: unknown) {
      setVoidInvoiceError(err instanceof Error ? err.message : 'Gagal membatalkan faktur');
    } finally {
      setVoidingInvoice(false);
    }
  };

  const openShipmentModal = (target?: ShipmentDto | null) => {
    setEditingShipmentId(target?.id ?? null);
    setShipMethod(target?.method || 'OWN_FLEET');
    setShipTrackingNo(target?.trackingNo || '');
    setShipDriverName(target?.driverName || '');
    setShipVehiclePlate(target?.vehiclePlate || '');
    setShipReceiverName(target?.receiverName || '');
    setShipNotes(target?.notes || '');
    setShipActualCost(target?.actualCost !== undefined ? String(target.actualCost) : '');
    setShipmentError(null);
    setShowShipmentModal(true);
  };

  const openShipModal = (targetShipmentId?: string | null) => {
    const initialQtys: Record<string, number> = {};
    const rows =
      order?.shipmentProgress && order.shipmentProgress.length > 0
        ? order.shipmentProgress
        : (order?.items || []).map((item) => ({
            orderItemId: item.id,
            remainingQty: item.qty,
          }));
    for (const row of rows) {
      if (row.remainingQty > 0) {
        initialQtys[row.orderItemId] = row.remainingQty;
      }
    }
    setActiveShipTargetId(targetShipmentId ?? null);
    setShipItemQtys(initialQtys);
    setShipOrderError(null);
    setShowShipModal(true);
  };

  const openDeliverModal = (target: ShipmentDto) => {
    setActiveDeliverShipmentId(target.id);
    setDeliverOrderError(null);
    setDeliverReceiverName(target.receiverName || '');
    setShowDeliverModal(true);
  };

  // Handle Simpan Konfigurasi Logistik Pengiriman (Upsert Shipment)
  const handleSaveShipment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!order) return;
    try {
      setSavingShipment(true);
      setShipmentError(null);

      const body: Record<string, unknown> = {
        method: shipMethod,
        trackingNo: shipTrackingNo.trim() || null,
        driverName: shipDriverName.trim() || null,
        vehiclePlate: shipVehiclePlate.trim() || null,
        receiverName: shipReceiverName.trim() || null,
        notes: shipNotes.trim() || null,
      };
      if (editingShipmentId) {
        body.shipmentId = editingShipmentId;
      }

      if (isSuperAdmin && shipActualCost !== '') {
        body.actualCost = Number(shipActualCost);
      }

      const res = await fetch(`/api/v1/orders/${order.id}/shipment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json.error?.message || json.message || 'Gagal menyimpan data pengiriman');
      }

      setSubmitSuccess('Data logistik pengiriman berhasil disimpan.');
      setShowShipmentModal(false);
      fetchOrderDetail();
    } catch (err: unknown) {
      setShipmentError(err instanceof Error ? err.message : 'Gagal menyimpan pengiriman');
    } finally {
      setSavingShipment(false);
    }
  };

  // Handle Eksekusi Kirim Barang (Ship Order / Kloter)
  const handleShipOrder = async () => {
    if (!order) return;
    try {
      setShippingOrder(true);
      setShipOrderError(null);

      const itemsPayload = Object.entries(shipItemQtys)
        .filter(([, qty]) => qty > 0)
        .map(([orderItemId, qty]) => ({ orderItemId, qty }));

      const bodyPayload: Record<string, unknown> = {};
      if (activeShipTargetId) {
        bodyPayload.shipmentId = activeShipTargetId;
      }
      if (itemsPayload.length > 0) {
        bodyPayload.items = itemsPayload;
      }

      const res = await fetch(`/api/v1/orders/${order.id}/shipment/ship`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyPayload),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json.error?.message || json.message || 'Gagal mengirim pesanan');
      }

      setSubmitSuccess('Pengiriman berhasil diproses. Surat jalan resmi diterbitkan.');
      setShowShipModal(false);
      fetchOrderDetail();
    } catch (err: unknown) {
      setShipOrderError(err instanceof Error ? err.message : 'Gagal mengirim pesanan');
    } finally {
      setShippingOrder(false);
    }
  };

  // Handle Konfirmasi Barang Sampai (Deliver Order / Kloter)
  const handleDeliverOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!order) return;
    try {
      setDeliveringOrder(true);
      setDeliverOrderError(null);

      const res = await fetch(`/api/v1/orders/${order.id}/shipment/deliver`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shipmentId: activeDeliverShipmentId || undefined,
          receiverName: deliverReceiverName.trim() || undefined,
        }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json.error?.message || json.message || 'Gagal menandai penerimaan');
      }

      setSubmitSuccess('Pengiriman berhasil ditandai telah sampai di tujuan.');
      setShowDeliverModal(false);
      fetchOrderDetail();
    } catch (err: unknown) {
      setDeliverOrderError(err instanceof Error ? err.message : 'Gagal menandai penerimaan');
    } finally {
      setDeliveringOrder(false);
    }
  };

  // Helper & Handlers Retur & Nota Kredit (Credit Notes)
  const openCreateCreditNoteModal = () => {
    if (!order?.items) return;
    const initial: { [id: string]: { qty: number; restock: boolean } } = {};
    order.items.forEach((item) => {
      initial[item.id] = { qty: 0, restock: true };
    });
    setCnItems(initial);
    setCnReason('');
    setCnSettlement('OFFSET');
    setCreditNoteError(null);
    setShowCreateCreditNoteModal(true);
  };

  const handleCreateCreditNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!order) return;
    if (cnReason.trim().length < 5) {
      setCreditNoteError('Alasan retur minimal 5 karakter');
      return;
    }

    const itemsToReturn = Object.entries(cnItems)
      .filter(([, val]) => val.qty > 0)
      .map(([orderItemId, val]) => ({
        orderItemId,
        qty: val.qty,
        restock: val.restock,
      }));

    if (itemsToReturn.length === 0) {
      setCreditNoteError('Pilih minimal satu barang dengan jumlah retur lebih dari 0');
      return;
    }

    try {
      setCreatingCreditNote(true);
      setCreditNoteError(null);

      const res = await fetch(`/api/v1/orders/${order.id}/credit-notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reason: cnReason.trim(),
          settlement: cnSettlement,
          items: itemsToReturn,
        }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json.error?.message || 'Gagal menerbitkan nota kredit');
      }

      setShowCreateCreditNoteModal(false);
      setSubmitSuccess('Nota Kredit & Retur Penjualan berhasil diterbitkan!');
      fetchOrderDetail();
    } catch (err) {
      setCreditNoteError(err instanceof Error ? err.message : 'Terjadi kesalahan sistem');
    } finally {
      setCreatingCreditNote(false);
    }
  };

  const handleApproveRevision = async (revId: string) => {
    try {
      setProcessingRevisionId(revId);
      setRevisionActionError(null);
      const res = await fetch(`/api/v1/order-revisions/${revId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json.error?.message || 'Gagal menyetujui revisi pesanan');
      }
      setSubmitSuccess('Revisi pesanan berhasil disetujui & stok reservasi telah disesuaikan.');
      await fetchOrderDetail();
    } catch (err) {
      setRevisionActionError(err instanceof Error ? err.message : 'Gagal menyetujui revisi');
    } finally {
      setProcessingRevisionId(null);
    }
  };

  const handleRejectRevision = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rejectRevisionTarget) return;
    if (revisionRejectReason.trim().length < 5) {
      setRevisionActionError('Alasan penolakan revisi minimal 5 karakter');
      return;
    }
    try {
      setProcessingRevisionId(rejectRevisionTarget.id);
      setRevisionActionError(null);
      const res = await fetch(`/api/v1/order-revisions/${rejectRevisionTarget.id}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: revisionRejectReason.trim() }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json.error?.message || 'Gagal menolak revisi pesanan');
      }
      setRejectRevisionTarget(null);
      setRevisionRejectReason('');
      setSubmitSuccess('Pengajuan revisi pesanan telah ditolak.');
      await fetchOrderDetail();
    } catch (err) {
      setRevisionActionError(err instanceof Error ? err.message : 'Gagal menolak revisi');
    } finally {
      setProcessingRevisionId(null);
    }
  };

  const handleVoidCreditNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedVoidCreditNote) return;
    if (voidCreditNoteReason.trim().length < 5) {
      setVoidCreditNoteError('Alasan pembatalan minimal 5 karakter');
      return;
    }

    try {
      setVoidingCreditNote(true);
      setVoidCreditNoteError(null);

      const res = await fetch(`/api/v1/credit-notes/${selectedVoidCreditNote.id}/void`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reason: voidCreditNoteReason.trim(),
        }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json.error?.message || 'Gagal membatalkan nota kredit');
      }

      setShowVoidCreditNoteModal(false);
      setSelectedVoidCreditNote(null);
      setSubmitSuccess('Nota Kredit berhasil dibatalkan (VOID)! Saldo dan stok telah dipulihkan.');
      fetchOrderDetail();
    } catch (err) {
      setVoidCreditNoteError(err instanceof Error ? err.message : 'Terjadi kesalahan sistem');
    } finally {
      setVoidingCreditNote(false);
    }
  };

  // Handlers Biaya Tambahan (OrderCost) & Komisi
  const handleAddCost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!order) return;
    const amt = Number(costAmount);
    if (!costLabel.trim()) {
      setCostError('Label biaya wajib diisi');
      return;
    }
    if (isNaN(amt) || amt <= 0) {
      setCostError('Nominal biaya harus bilangan bulat lebih besar dari 0');
      return;
    }

    try {
      setAddingCost(true);
      setCostError(null);
      const res = await fetch(`/api/v1/orders/${order.id}/costs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: costLabel.trim(), amount: amt }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json.error?.message || 'Gagal menambahkan biaya');
      }
      setShowAddCostModal(false);
      setCostLabel('');
      setCostAmount('');
      setSubmitSuccess('Biaya tambahan berhasil dicatat!');
      fetchOrderDetail();
    } catch (err) {
      setCostError(err instanceof Error ? err.message : 'Terjadi kesalahan sistem');
    } finally {
      setAddingCost(false);
    }
  };

  const handleDeleteCost = async (costId: string) => {
    if (!order) return;
    if (!confirm('Apakah Anda yakin ingin menghapus biaya tambahan ini?')) return;
    try {
      setDeletingCostId(costId);
      const res = await fetch(`/api/v1/orders/${order.id}/costs/${costId}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error?.message || 'Gagal menghapus biaya');
      }
      setSubmitSuccess('Biaya tambahan berhasil dihapus.');
      fetchOrderDetail();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Gagal menghapus biaya');
    } finally {
      setDeletingCostId(null);
    }
  };

  const handlePayCommission = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orderProfit?.commission) return;
    try {
      setPayingCommission(true);
      setPayCommissionError(null);
      const res = await fetch(`/api/v1/commission/entries/${orderProfit.commission.id}/pay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note: payCommissionNote.trim() || undefined }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json.error?.message || 'Gagal menandai komisi dibayar');
      }
      setShowPayCommissionModal(false);
      setPayCommissionNote('');
      setSubmitSuccess('Komisi berhasil ditandai telah dibayarkan!');
      fetchOrderDetail();
    } catch (err) {
      setPayCommissionError(err instanceof Error ? err.message : 'Terjadi kesalahan sistem');
    } finally {
      setPayingCommission(false);
    }
  };

  if (loading) {
    return (
      <div className="w-full max-w-7xl mx-auto px-4 py-8 space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="w-20 h-10 rounded-lg" />
          <Skeleton className="w-64 h-8 rounded-lg" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Skeleton className="lg:col-span-2 h-96 rounded-xl" />
          <Skeleton className="h-96 rounded-xl" />
        </div>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="w-full max-w-2xl mx-auto px-4 py-12">
        <ErrorState
          title="Pesanan Tidak Ditemukan"
          message={error || 'Pesanan tidak ditemukan atau telah dihapus.'}
          onRetry={fetchOrderDetail}
        />
        <div className="mt-4 text-center">
          <Link
            href="/orders"
            className="inline-flex items-center gap-1.5 text-sm text-indigo-600 hover:text-indigo-800 font-medium"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Kembali ke Daftar Pesanan</span>
          </Link>
        </div>
      </div>
    );
  }

  const isSuperAdmin = currentUser?.role === 'SUPERADMIN';
  const allowSalesCash = order.businessPolicy?.allowSalesCashPayment ?? false;
  const requireSalesProof = order.businessPolicy?.requireTransferProofForSales ?? true;
  const isDraftOrRevision = order.status === 'DRAFT' || order.status === 'REVISION_REQUIRED';
  const isPendingApproval = order.status === 'PENDING_APPROVAL' || order.status === 'FINAL_PENDING_APPROVAL';
  const canPrintProforma = ['DRAFT', 'REVISION_REQUIRED', 'PENDING_APPROVAL'].includes(order.status);
  const canDeleteDraft =
    isSuperAdmin &&
    isDraftOrRevision &&
    !order.stockReserved &&
    (order.invoices || []).every((inv) => inv.status !== 'APPROVED') &&
    payments.every((p) => p.status !== 'VERIFIED');
  const canCancelOrder =
    isSuperAdmin &&
    ['PENDING_APPROVAL', 'REVISION_REQUIRED', 'AWAITING_DP', 'IN_PROCESS', 'FINAL_PENDING_APPROVAL', 'AWAITING_FINAL_PAYMENT'].includes(order.status) &&
    shipment?.status !== 'SHIPPED' &&
    shipment?.status !== 'DELIVERED';
  const proformaPdfUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/api/v1/orders/${order.id}/proforma/pdf`
      : `/api/v1/orders/${order.id}/proforma/pdf`;
  const waProformaText = encodeURIComponent(
    `Halo ${order.customer?.name || 'Pelanggan'}, berikut rincian Proforma Order senilai ${formatRupiah(order.grandTotal)}.${order.dpBps > 0 ? ` DP ${formatPercentFromBps(order.dpBps)}: ${formatRupiah(order.dpAmount)}.` : ''} Lihat dokumen PDF: ${proformaPdfUrl}`
  );
  const sisaPelunasan = Math.max(
    0,
    order.grandTotal - Math.max(order.dpAmount, order.paidTotal || 0)
  );
  const balanceDue = Math.max(
    0,
    order.grandTotal - (order.paidTotal || 0) - (order.creditTotal || 0)
  );
  const unpaidApprovedInvoices = (order.invoices || []).filter(
    (inv) => inv.status === 'APPROVED' && inv.amount > inv.paidAmount
  );
  const selectedPayInvoice = unpaidApprovedInvoices.find(
    (inv) => inv.id === payInvoiceId
  );
  const maxAllowedPayment = selectedPayInvoice
    ? Math.min(balanceDue, Math.max(0, selectedPayInvoice.amount - selectedPayInvoice.paidAmount))
    : balanceDue;

  const openPaymentModal = () => {
    const preferredInvoice =
      order.status === 'AWAITING_DP'
        ? unpaidApprovedInvoices.find((inv) => inv.type === 'DP') || unpaidApprovedInvoices[0]
        : order.status === 'AWAITING_FINAL_PAYMENT'
          ? unpaidApprovedInvoices.find((inv) => inv.type === 'FINAL') || unpaidApprovedInvoices[0]
          : unpaidApprovedInvoices[0];

    const defaultAmount = preferredInvoice
      ? Math.min(balanceDue, Math.max(0, preferredInvoice.amount - preferredInvoice.paidAmount))
      : balanceDue;

    setPayInvoiceId(preferredInvoice?.id || '');
    setPayAmount(String(defaultAmount));
    if (!isSuperAdmin && !allowSalesCash && payMethod === 'CASH') {
      setPayMethod('TRANSFER');
    }
    setPayError(null);
    setShowPaymentModal(true);
  };

  const canRecordPayment =
    !isDraftOrRevision &&
    !isPendingApproval &&
    order.status !== 'CANCELLED' &&
    balanceDue > 0;
  const hasPendingRevision = (order.revisions ?? []).some(
    (r) => r.status === 'PENDING_APPROVAL'
  );
  const canReviseOrder =
    order.status === 'IN_PROCESS' &&
    !hasPendingRevision &&
    shipment?.status !== 'SHIPPED' &&
    shipment?.status !== 'DELIVERED';
  const canRequestFinal =
    order.status === 'IN_PROCESS' &&
    (order.paidTotal || 0) >= order.dpAmount &&
    !order.pendingInvoice &&
    !hasPendingRevision;
  const progressRows: OrderShipmentItemProgress[] =
    order.shipmentProgress && order.shipmentProgress.length > 0
      ? order.shipmentProgress
      : (order.items || []).map((item) => {
          const shippedQty = shipments
            .filter((s) => s.status === 'SHIPPED' || s.status === 'DELIVERED')
            .reduce((sum, s) => {
              const found = s.items?.find((si) => si.orderItemId === item.id);
              return sum + (found ? found.qty : s.items ? 0 : item.qty);
            }, 0);
          return {
            orderItemId: item.id,
            productId: item.productId,
            productName: item.productName,
            sku: item.sku,
            unit: item.unit,
            orderedQty: item.qty,
            shippedQty,
            remainingQty: Math.max(0, item.qty - shippedQty),
          };
        });

  const allowPartialShipment = Boolean(order.businessPolicy?.allowPartialShipment);
  const allowShipBeforeFinalInvoice = Boolean(order.businessPolicy?.allowShipBeforeFinalInvoice);
  const preparingShipment = shipments.find((s) => s.status === 'PREPARING') || null;
  const shippedShipments = shipments.filter((s) => s.status === 'SHIPPED');
  const executedShipmentsCount = shipments.filter(
    (s) => s.status === 'SHIPPED' || s.status === 'DELIVERED'
  ).length;
  const hasRemainingToShip = progressRows.some((r) => r.remainingQty > 0);
  const canShipByStatus =
    order.status === 'AWAITING_FINAL_PAYMENT' ||
    (allowShipBeforeFinalInvoice &&
      ['IN_PROCESS', 'FINAL_PENDING_APPROVAL'].includes(order.status));

  const canManageShipment =
    !hasPendingRevision &&
    ['IN_PROCESS', 'FINAL_PENDING_APPROVAL', 'AWAITING_FINAL_PAYMENT'].includes(order.status) &&
    (hasRemainingToShip || Boolean(preparingShipment)) &&
    (allowPartialShipment || executedShipmentsCount === 0);
  const canShip =
    !hasPendingRevision &&
    canShipByStatus &&
    hasRemainingToShip &&
    (allowPartialShipment || executedShipmentsCount === 0);
  const canDeliver = shippedShipments.length > 0;
  const isOrderDeliveredOrShipped =
    executedShipmentsCount > 0 ||
    order.status === 'COMPLETED' ||
    order.status === 'SHIPPED' ||
    order.status === 'DELIVERED';

  const getAlreadyReturnedQty = (orderItemId: string) => {
    return creditNotes
      .filter((cn) => !cn.voidedAt)
      .reduce((sum, cn) => {
        const item = cn.items?.find((i) => i.orderItemId === orderItemId);
        return sum + (item ? item.qty : 0);
      }, 0);
  };

  const getShippedQtyForItem = (orderItemId: string, orderedQty: number) => {
    if (order.status === 'COMPLETED') return orderedQty;
    return progressRows.find((r) => r.orderItemId === orderItemId)?.shippedQty ?? 0;
  };

  const hasReturnableItems = (order.items || []).some((item) => {
    const shippedLimit = getShippedQtyForItem(item.id, item.qty);
    const returned = getAlreadyReturnedQty(item.id);
    return shippedLimit - returned > 0;
  });

  const canCreateCreditNote =
    !isDraftOrRevision &&
    !isPendingApproval &&
    order.status !== 'CANCELLED' &&
    isOrderDeliveredOrShipped &&
    hasReturnableItems;
  const items = order.items || [];
  const confirmTarget = order.orderNo ?? order.id;

  const formattedDate = formatDateId(order.orderDate, 'full');

  return (
    <div className="w-full max-w-7xl mx-auto px-4 py-6 md:py-8 space-y-6">
      {/* Tombol Kembali & Header Halaman */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <Link
            href="/orders"
            className="inline-flex items-center gap-1.5 text-xs md:text-sm font-medium text-slate-500 hover:text-slate-800 transition-colors mb-2"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Kembali ke Daftar Pesanan</span>
          </Link>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-xl md:text-2xl font-bold text-slate-900 tracking-tight">
              {order.orderNo || `Draf Pesanan (#${order.id.slice(-6)})`}
            </h1>
            <StatusBadge status={order.status} />
            {order.hasBelowMin && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-300">
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>Di Bawah Harga Minimal</span>
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 mt-1">
            <span className="inline-flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5" />
              {formattedDate}
            </span>
            <span>•</span>
            <span>Versi {order.version} (rev {order.rev})</span>
            {order.customerSeq && (
              <>
                <span>•</span>
                <span>Order ke-{order.customerSeq} bagi customer ini</span>
              </>
            )}
          </div>
        </div>

        {/* Tombol Aksi */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Tombol Ajukan Pesanan */}
          {isDraftOrRevision && (
            <button
              type="button"
              onClick={() => {
                setSubmitBelowMinReason(order.belowMinReason || '');
                setSubmitError(null);
                setShowSubmitModal(true);
              }}
              className="inline-flex items-center justify-center gap-1.5 min-h-[44px] px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg text-sm transition-colors shadow-sm"
            >
              <Send className="w-4 h-4" />
              <span>Ajukan Pesanan</span>
            </button>
          )}

          {/* Tombol Tarik Pengajuan */}
          {isPendingApproval && (
            <button
              type="button"
              onClick={() => {
                setWithdrawError(null);
                setShowWithdrawModal(true);
              }}
              className="inline-flex items-center justify-center gap-1.5 min-h-[44px] px-4 py-2 border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-800 font-medium rounded-lg text-sm transition-colors shadow-sm"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Tarik Pengajuan</span>
            </button>
          )}

          {/* Tombol Setujui Pesanan (Super Admin) */}
          {isSuperAdmin && (order.status === 'PENDING_APPROVAL' || order.status === 'FINAL_PENDING_APPROVAL') && order.pendingInvoice && (
            <button
              type="button"
              onClick={() => {
                setOverrideNote(order.overrideNote || '');
                setApproveError(null);
                setShowApproveModal(true);
              }}
              className="inline-flex items-center justify-center gap-1.5 min-h-[44px] px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-lg text-sm transition-colors shadow-sm"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Setujui Pesanan</span>
            </button>
          )}

          {/* Tombol Tolak / Revisi (Super Admin) */}
          {isSuperAdmin && (order.status === 'PENDING_APPROVAL' || order.status === 'FINAL_PENDING_APPROVAL') && order.pendingInvoice && (
            <button
              type="button"
              onClick={() => {
                setRejectReason('');
                setRejectError(null);
                setShowRejectModal(true);
              }}
              className="inline-flex items-center justify-center gap-1.5 min-h-[44px] px-4 py-2 border border-rose-300 bg-rose-50 hover:bg-rose-100 text-rose-800 font-medium rounded-lg text-sm transition-colors shadow-sm"
            >
              <XCircle className="w-4 h-4" />
              <span>Tolak / Revisi</span>
            </button>
          )}

          {/* Tombol Ajukan Pelunasan (Request Final) */}
          {canRequestFinal && (
            <button
              type="button"
              onClick={() => {
                setFinalShippingCharge(String(order.shippingCharge));
                setFinalShippingReason('');
                setRequestFinalError(null);
                setShowRequestFinalModal(true);
              }}
              className="inline-flex items-center justify-center gap-1.5 min-h-[44px] px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg text-sm transition-colors shadow-sm"
            >
              <FileText className="w-4 h-4" />
              <span>Ajukan Pelunasan</span>
            </button>
          )}

          {/* Tombol Pengiriman di Header */}
          {canShip && (
            <button
              type="button"
              onClick={() => openShipModal(preparingShipment?.id)}
              className="inline-flex items-center justify-center gap-1.5 min-h-[44px] px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg text-sm transition-colors shadow-sm"
            >
              <Truck className="w-4 h-4" />
              <span>Kirim Barang</span>
            </button>
          )}

          {canDeliver && shippedShipments[0] && (
            <button
              type="button"
              onClick={() => openDeliverModal(shippedShipments[0])}
              className="inline-flex items-center justify-center gap-1.5 min-h-[44px] px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-lg text-sm transition-colors shadow-sm"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Tandai Diterima</span>
            </button>
          )}

          {canPrintProforma && (
            <>
              <a
                href={`/api/v1/orders/${order.id}/proforma/pdf`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-1.5 min-h-[44px] px-3.5 py-2 border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-medium rounded-lg text-sm transition-colors shadow-sm"
              >
                <Printer className="w-4 h-4" />
                <span>Cetak Proforma PDF</span>
              </a>
              <a
                href={`https://wa.me/?text=${waProformaText}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-1.5 min-h-[44px] px-3.5 py-2 border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-medium rounded-lg text-sm transition-colors shadow-sm"
              >
                <MessageCircle className="w-4 h-4" />
                <span>Kirim WA</span>
              </a>
            </>
          )}

          {isDraftOrRevision && (
            <Link
              href={`/orders/${order.id}/edit`}
              className="inline-flex items-center justify-center gap-1.5 min-h-[44px] px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg text-sm transition-colors shadow-sm"
            >
              <Edit className="w-4 h-4" />
              <span>Edit Draf</span>
            </Link>
          )}

          {canReviseOrder && (
            <Link
              href={`/orders/${order.id}/revise`}
              className="inline-flex items-center justify-center gap-1.5 min-h-[44px] px-4 py-2 border border-indigo-300 bg-indigo-50 hover:bg-indigo-100 text-indigo-800 font-medium rounded-lg text-sm transition-colors shadow-sm"
            >
              <Edit className="w-4 h-4" />
              <span>Ajukan Revisi Item</span>
            </Link>
          )}

          {canDeleteDraft && (
            <button
              type="button"
              onClick={() => setShowDeleteModal(true)}
              className="inline-flex items-center justify-center gap-1.5 min-h-[44px] px-3.5 py-2 border border-rose-300 hover:bg-rose-50 text-rose-700 font-medium rounded-lg text-sm transition-colors"
            >
              <Trash2 className="w-4 h-4" />
              <span className="hidden sm:inline">Hapus Draf</span>
            </button>
          )}

          {canCancelOrder && (
            <button
              type="button"
              onClick={() => {
                setCancelReason('');
                setCancelDpSettlement('REFUND');
                setCancelRefundMethod('TRANSFER');
                setCancelRefundReference('');
                setCancelError(null);
                setShowCancelModal(true);
              }}
              className="inline-flex items-center justify-center gap-1.5 min-h-[44px] px-3.5 py-2 border border-rose-300 bg-rose-50 hover:bg-rose-100 text-rose-800 font-medium rounded-lg text-sm transition-colors shadow-sm"
            >
              <Ban className="w-4 h-4" />
              <span>Batalkan Pesanan</span>
            </button>
          )}
        </div>
      </div>

      {/* Alert Pesanan Dibatalkan Resmi */}
      {order.status === 'CANCELLED' && (
        <div className="p-4 bg-rose-50 border border-rose-300 rounded-xl flex items-start gap-3 text-rose-900 text-sm">
          <Ban className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-semibold">Pesanan Dibatalkan Resmi</p>
            <p className="text-xs text-rose-800">
              Alasan: {order.cancelReason || '-'}
              {order.cancelledAt
                ? ` • Pada ${new Date(order.cancelledAt).toLocaleString('id-ID')}`
                : ''}
            </p>
          </div>
        </div>
      )}

      {/* Alert Umpan Balik Submit / Withdraw */}
      {submitSuccess && (
        <div className="p-4 bg-emerald-50 border border-emerald-300 rounded-xl flex items-center justify-between text-emerald-900 text-sm">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <span>{submitSuccess}</span>
          </div>
          <button
            type="button"
            onClick={() => setSubmitSuccess(null)}
            className="text-emerald-700 hover:text-emerald-900 text-lg font-bold ml-2"
          >
            &times;
          </button>
        </div>
      )}

      {/* Banner Khusus PENDING_APPROVAL */}
      {isPendingApproval && (
        <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl space-y-1 text-blue-900 text-xs md:text-sm">
          <div className="flex items-center gap-2 font-semibold text-blue-800">
            <Clock className="w-4 h-4 text-blue-600 shrink-0" />
            <span>Pesanan Sedang Menunggu Persetujuan Super Admin</span>
          </div>
          <p className="pl-6 text-blue-700">
            Faktur pembayaran awal telah dibuat dan pesanan berada dalam antrean persetujuan. Anda dapat menarik kembali pengajuan ini ke draf sebelum disetujui bila perlu melakukan perubahan baris item.
          </p>
        </div>
      )}

      {/* Peringatan Status / Alasan Bisnis */}
      {order.hasBelowMin && order.belowMinReason && (
        <div className="p-4 bg-amber-50 border border-amber-300 rounded-xl space-y-1 text-amber-900">
          <div className="flex items-center gap-2 font-semibold text-sm text-amber-800">
            <AlertTriangle className="w-4 h-4 text-amber-600" />
            <span>Alasan Pengajuan Harga di Bawah Minimal:</span>
          </div>
          <p className="text-xs md:text-sm pl-6 text-amber-800 whitespace-pre-line">
            {order.belowMinReason}
          </p>
        </div>
      )}

      {order.rejectReason && (
        <div className="p-4 bg-rose-50 border border-rose-300 rounded-xl space-y-1 text-rose-900">
          <div className="flex items-center gap-2 font-semibold text-sm text-rose-800">
            <XCircle className="w-4 h-4 text-rose-600" />
            <span>Catatan Penolakan / Revisi:</span>
          </div>
          <p className="text-xs md:text-sm pl-6 text-rose-800 whitespace-pre-line">
            {order.rejectReason}
          </p>
        </div>
      )}

      {order.overrideNote && (
        <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl space-y-1 text-blue-900">
          <div className="flex items-center gap-2 font-semibold text-sm text-blue-800">
            <CheckCircle2 className="w-4 h-4 text-blue-600" />
            <span>Catatan Persetujuan Khusus (Override):</span>
          </div>
          <p className="text-xs md:text-sm pl-6 text-blue-800 whitespace-pre-line">
            {order.overrideNote}
          </p>
        </div>
      )}

      {/* Grid Informasi: Rincian Produk & Ringkasan Keuangan */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Kolom Kiri: Pelanggan & Tabel Produk */}
        <div className="lg:col-span-2 space-y-6">
          {/* Kartu Informasi Pelanggan & Pengiriman */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-4">
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Building2 className="w-4 h-4 text-indigo-600" />
              <span>Informasi Pelanggan & Pengiriman</span>
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-xs text-slate-400">Pelanggan</span>
                <p className="font-semibold text-slate-800 mt-0.5">
                  {order.customer?.name || '-'}
                </p>
                <p className="text-xs text-slate-500">{order.customer?.code || ''}</p>
              </div>

              <div>
                <span className="text-xs text-slate-400 flex items-center gap-1">
                  <Truck className="w-3.5 h-3.5" />
                  <span>Alamat Pengiriman</span>
                </span>
                <p className="text-slate-800 mt-0.5 whitespace-pre-line text-xs sm:text-sm">
                  {order.deliveryAddress || 'Sesuai alamat profil pelanggan'}
                </p>
              </div>

              {order.notes && (
                <div className="sm:col-span-2 pt-2 border-t border-slate-100">
                  <span className="text-xs text-slate-400 flex items-center gap-1">
                    <FileText className="w-3.5 h-3.5" />
                    <span>Catatan Pesanan</span>
                  </span>
                  <p className="text-xs sm:text-sm text-slate-700 mt-0.5 italic">
                    &quot;{order.notes}&quot;
                  </p>
                </div>
              )}

              {order.repeatIntervalDays && (
                <div className="sm:col-span-2 text-xs text-indigo-700 bg-indigo-50 border border-indigo-100 rounded-lg p-2.5 flex items-center gap-2">
                  <Clock className="w-4 h-4 shrink-0" />
                  <span>
                    Pesanan ini dijadwalkan berulang secara otomatis setiap{' '}
                    <strong>{order.repeatIntervalDays} hari</strong>.
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Daftar Produk (Tabel Desktop + Kartu Mobile 360 px) */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Package className="w-4 h-4 text-indigo-600" />
                <span>Rincian Produk ({items.length})</span>
              </h2>
            </div>

            {/* Desktop Table */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-left text-sm text-slate-600">
                <thead className="bg-slate-50 border-b border-slate-200 text-xs uppercase font-semibold text-slate-500">
                  <tr>
                    <th scope="col" className="px-4 py-3">
                      Produk
                    </th>
                    <th scope="col" className="px-4 py-3 text-center">
                      Qty
                    </th>
                    <th scope="col" className="px-4 py-3 text-right">
                      Harga Deal
                    </th>
                    <th scope="col" className="px-4 py-3 text-right">
                      Diskon
                    </th>
                    <th scope="col" className="px-4 py-3 text-right">
                      Subtotal
                    </th>
                    {isSuperAdmin && (
                      <th scope="col" className="px-4 py-3 text-right text-emerald-700">
                        HPP
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-xs sm:text-sm">
                  {items.map((item) => (
                    <tr
                      key={item.id}
                      className={`hover:bg-slate-50/75 transition-colors ${
                        item.belowMin ? 'bg-red-50/30' : ''
                      }`}
                    >
                      <td className="px-4 py-3">
                        <div className="font-semibold text-slate-900">
                          {item.productName}
                        </div>
                        <div className="text-xs text-slate-400">
                          SKU: {item.sku} • {item.unit}
                        </div>
                        {item.belowMin && (
                          <div className="mt-1 inline-flex items-center gap-1 text-[11px] font-semibold text-rose-700 bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
                            <AlertTriangle className="w-3 h-3" />
                            <span>Di bawah minimal ({formatRupiah(item.floorPrice)})</span>
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center font-medium text-slate-800">
                        {item.qty} {item.unit}
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-slate-800 whitespace-nowrap">
                        {formatRupiah(item.unitPrice)}
                      </td>
                      <td className="px-4 py-3 text-right text-slate-600 whitespace-nowrap">
                        {item.lineDiscount > 0 ? (
                          <div>
                            <span className="text-rose-600 font-medium">
                              -{formatRupiah(item.lineDiscount)}
                            </span>
                            {item.discountType === 'PERCENT' && (
                              <div className="text-[10px] text-slate-400">
                                ({item.discountValue / 100}%)
                              </div>
                            )}
                          </div>
                        ) : (
                          '-'
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-slate-900 whitespace-nowrap">
                        {formatRupiah(item.lineNet)}
                      </td>
                      {isSuperAdmin && (
                        <td className="px-4 py-3 text-right text-emerald-700 font-medium whitespace-nowrap">
                          {item.costPrice !== undefined
                            ? formatRupiah(item.costPrice * item.qty)
                            : '-'}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards (360 px) */}
            <div className="sm:hidden divide-y divide-slate-100">
              {items.map((item) => (
                <div
                  key={item.id}
                  className={`p-4 space-y-2 ${item.belowMin ? 'bg-red-50/40' : ''}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h4 className="font-bold text-slate-900 text-sm">
                        {item.productName}
                      </h4>
                      <p className="text-xs text-slate-400">
                        {item.sku} • {item.unit}
                      </p>
                    </div>
                    <span className="text-xs font-semibold text-slate-700">
                      {item.qty} {item.unit}
                    </span>
                  </div>

                  {item.belowMin && (
                    <div className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-700 bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
                      <AlertTriangle className="w-3 h-3" />
                      <span>Di bawah batas minimal ({formatRupiah(item.floorPrice)})</span>
                    </div>
                  )}

                  <div className="pt-1 flex items-center justify-between text-xs">
                    <span className="text-slate-500">Harga Satuan:</span>
                    <span className="font-medium text-slate-800">
                      {formatRupiah(item.unitPrice)}
                    </span>
                  </div>

                  {item.lineDiscount > 0 && (
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-500">Diskon:</span>
                      <span className="font-medium text-rose-600">
                        -{formatRupiah(item.lineDiscount)}
                      </span>
                    </div>
                  )}

                  <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-sm">
                    <span className="font-semibold text-slate-700">Subtotal Bersih:</span>
                    <span className="font-bold text-indigo-600">
                      {formatRupiah(item.lineNet)}
                    </span>
                  </div>

                  {isSuperAdmin && item.costPrice !== undefined && (
                    <div className="text-[11px] text-emerald-700 flex justify-between pt-1">
                      <span>Total HPP (Admin):</span>
                      <span className="font-medium">
                        {formatRupiah(item.costPrice * item.qty)}
                      </span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Kartu Riwayat Revisi Pesanan (Fase 3) */}
          {(order.revisions?.length ?? 0) > 0 && (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between gap-2">
                <h2 className="text-base font-bold text-slate-900">
                  Riwayat Revisi Pesanan ({order.revisions!.length})
                </h2>
                {hasPendingRevision && (
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800">
                    Menunggu Persetujuan
                  </span>
                )}
              </div>

              {revisionActionError && (
                <div className="mx-4 mt-4 p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-800">
                  {revisionActionError}
                </div>
              )}

              <div className="divide-y divide-slate-100">
                {order.revisions!.map((revItem) => (
                  <div key={revItem.id} className="p-4 sm:p-5 space-y-2.5 text-xs sm:text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono font-bold text-slate-800">
                          Revisi #{revItem.revisionNo}
                        </span>
                        <StatusBadge status={revItem.status} />
                        {revItem.hasBelowMin && (
                          <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-800 text-[11px] font-semibold">
                            Di Bawah Floor
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-slate-500">
                        {new Date(revItem.requestedAt).toLocaleString('id-ID')}
                      </span>
                    </div>

                    <p className="text-xs text-slate-700">
                      <strong>Alasan:</strong> {revItem.reason}
                    </p>
                    {revItem.rejectReason && (
                      <p className="text-xs text-rose-700 font-medium">
                        Ditolak: {revItem.rejectReason}
                      </p>
                    )}

                    <div className="flex flex-wrap items-center gap-4 text-xs bg-slate-50 border border-slate-200 rounded-lg p-3">
                      <div>
                        <span className="text-slate-500">Total Lama: </span>
                        <span className="font-mono font-semibold text-slate-700">
                          {formatRupiah(revItem.oldGrandTotal)}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-500">Total Baru: </span>
                        <span className="font-mono font-bold text-indigo-700">
                          {formatRupiah(revItem.newGrandTotal)}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-500">Selisih: </span>
                        <span
                          className={`font-mono font-bold ${
                            revItem.deltaGrandTotal >= 0 ? 'text-emerald-700' : 'text-amber-700'
                          }`}
                        >
                          {revItem.deltaGrandTotal >= 0 ? '+' : ''}
                          {formatRupiah(revItem.deltaGrandTotal)}
                        </span>
                      </div>
                    </div>

                    <div className="space-y-1 text-xs text-slate-600">
                      {revItem.items.map((ri) => (
                        <div key={ri.id} className="flex items-center justify-between gap-2">
                          <span>
                            {ri.productName} ({ri.sku})
                          </span>
                          <span className="font-mono">
                            {ri.oldQty} &rarr; <strong>{ri.newQty}</strong> {ri.unit} @{' '}
                            {formatRupiah(ri.unitPrice)}
                          </span>
                        </div>
                      ))}
                    </div>

                    {isSuperAdmin && revItem.status === 'PENDING_APPROVAL' && (
                      <div className="flex flex-wrap items-center gap-2 pt-2">
                        <button
                          type="button"
                          onClick={() => handleApproveRevision(revItem.id)}
                          disabled={processingRevisionId === revItem.id}
                          className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-semibold transition-colors"
                        >
                          {processingRevisionId === revItem.id
                            ? 'Memproses...'
                            : 'Setujui Revisi'}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setRejectRevisionTarget(revItem);
                            setRevisionRejectReason('');
                            setRevisionActionError(null);
                          }}
                          disabled={processingRevisionId === revItem.id}
                          className="px-3 py-1.5 rounded-lg border border-rose-300 text-rose-700 hover:bg-rose-50 disabled:opacity-50 text-xs font-semibold transition-colors"
                        >
                          Tolak Revisi
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Kartu Riwayat Pembayaran */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-4 sm:p-5 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-indigo-600" />
                <h2 className="text-base font-bold text-slate-900">
                  Riwayat Pembayaran
                </h2>
                <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700">
                  {payments.length}
                </span>
              </div>

              {canRecordPayment && (
                <button
                  type="button"
                  onClick={openPaymentModal}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-50 text-indigo-700 hover:bg-indigo-100 text-xs font-semibold transition-colors"
                >
                  <CreditCard className="w-3.5 h-3.5" />
                  <span>+ Catat Pembayaran</span>
                </button>
              )}
            </div>

            {payments.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-500">
                Belum ada pembayaran yang dicatat untuk pesanan ini.
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {payments.map((p) => {
                  const payDateFormatted = formatDateId(p.paidAt);

                  return (
                    <div
                      key={p.id}
                      className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/50 transition-colors"
                    >
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-bold text-slate-900 text-sm">
                            {formatRupiah(p.amount)}
                          </span>
                          <StatusBadge status={p.status} />
                          <span className="text-[11px] px-2 py-0.5 rounded font-semibold bg-slate-100 text-slate-700">
                            {p.method}
                          </span>
                          {p.receiptNo && (
                            <span className="text-[11px] px-2 py-0.5 rounded font-mono font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              {p.receiptNo}
                            </span>
                          )}
                        </div>

                        <div className="text-xs text-slate-500 flex flex-wrap items-center gap-x-3 gap-y-0.5">
                          <span>{payDateFormatted}</span>
                          {p.reference && <span>Ref: {p.reference}</span>}
                          {p.proofPath && (
                            <a
                              href={`/api/v1/files/${p.proofPath}`}
                              target="_blank"
                              rel="noreferrer"
                              className="text-indigo-600 hover:text-indigo-800 underline inline-flex items-center gap-1"
                            >
                              <span>Bukti Transfer</span>
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          )}
                        </div>

                        {p.notes && (
                          <p className="text-xs text-slate-600 italic">
                            {p.notes}
                          </p>
                        )}
                        {p.rejectReason && (
                          <p className="text-xs text-rose-600 font-medium">
                            Alasan: {p.rejectReason}
                          </p>
                        )}
                      </div>

                      {/* Aksi Pembayaran (Sales & Super Admin) */}
                      <div className="flex flex-wrap items-center gap-2 self-start sm:self-center">
                        {p.status === 'VERIFIED' && (
                          <a
                            href={`/api/v1/payments/${p.id}/receipt/pdf`}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-indigo-50 border border-indigo-200 text-indigo-700 hover:bg-indigo-100 text-xs font-semibold transition-colors"
                          >
                            <Printer className="w-3.5 h-3.5" />
                            <span>Cetak Kwitansi</span>
                          </a>
                        )}

                        {isSuperAdmin && (
                          <>
                            {p.status === 'PENDING_VERIFICATION' && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedRejectPayment(p);
                                    setPaymentRejectReason('');
                                    setPaymentRejectError(null);
                                  }}
                                  className="px-2.5 py-1 rounded border border-rose-300 text-rose-700 hover:bg-rose-50 text-xs font-semibold transition-colors"
                                >
                                  Tolak
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedVerifyPayment(p);
                                    setVerifyPaymentError(null);
                                  }}
                                  className="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold transition-colors"
                                >
                                  Verifikasi
                                </button>
                              </>
                            )}
                            {p.status === 'VERIFIED' && (
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedVoidPayment(p);
                                  setPaymentVoidReason('');
                                  setPaymentVoidError(null);
                                }}
                                className="px-2.5 py-1 rounded border border-slate-300 text-slate-600 hover:bg-slate-100 text-xs font-semibold transition-colors"
                              >
                                Void
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Kartu Informasi Pengiriman & Surat Jalan */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-4 sm:p-5 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <Truck className="w-5 h-5 text-indigo-600" />
                <h2 className="text-base font-bold text-slate-900">
                  Informasi Pengiriman &amp; Surat Jalan
                </h2>
                {shipment && <StatusBadge status={shipment.status} />}
                {shipments.length > 0 && (
                  <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700">
                    {shipments.length} Kloter
                  </span>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {canManageShipment && (
                  <button
                    type="button"
                    onClick={() => openShipmentModal(preparingShipment)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 text-xs font-semibold transition-colors"
                  >
                    <Edit className="w-3.5 h-3.5" />
                    <span>
                      {preparingShipment
                        ? 'Ubah Pengiriman'
                        : allowPartialShipment && executedShipmentsCount > 0
                        ? 'Atur Kloter Berikutnya'
                        : 'Atur Pengiriman'}
                    </span>
                  </button>
                )}

                {canShip && (
                  <button
                    type="button"
                    onClick={() => openShipModal(preparingShipment?.id)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold transition-colors shadow-sm"
                  >
                    <Truck className="w-3.5 h-3.5" />
                    <span>
                      {allowPartialShipment && executedShipmentsCount > 0
                        ? 'Kirim Kloter Berikutnya'
                        : 'Kirim Barang'}
                    </span>
                  </button>
                )}
              </div>
            </div>

            <div className="p-4 sm:p-5 space-y-4">
              {progressRows.length > 0 && (
                <div className="border border-slate-200 rounded-lg overflow-hidden">
                  <div className="px-3 py-2 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-slate-700">
                      Progres Pengiriman Item
                    </span>
                    <span className="text-xs font-semibold text-indigo-700">
                      {progressRows.reduce((s, r) => s + r.shippedQty, 0)} /{' '}
                      {progressRows.reduce((s, r) => s + r.orderedQty, 0)} unit terkirim
                    </span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-slate-50/70 border-b border-slate-100 text-slate-500">
                        <tr>
                          <th className="px-3 py-2 font-medium">Produk</th>
                          <th className="px-3 py-2 text-center font-medium">Dipesan</th>
                          <th className="px-3 py-2 text-center font-medium">Terkirim</th>
                          <th className="px-3 py-2 text-center font-medium">Sisa</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {progressRows.map((row) => (
                          <tr key={row.orderItemId}>
                            <td className="px-3 py-2">
                              <span className="font-semibold text-slate-800 block">
                                {row.productName}
                              </span>
                              <span className="text-[11px] text-slate-400 font-mono">
                                {row.sku}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-center text-slate-700">
                              {row.orderedQty} {row.unit}
                            </td>
                            <td className="px-3 py-2 text-center font-semibold text-emerald-700">
                              {row.shippedQty} {row.unit}
                            </td>
                            <td className="px-3 py-2 text-center font-semibold text-amber-700">
                              {row.remainingQty} {row.unit}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {shipments.length === 0 ? (
                <div className="text-xs text-slate-500 italic py-2">
                  Belum ada pengaturan logistik pengiriman untuk pesanan ini. Klik &quot;Atur Pengiriman&quot; untuk menyiapkan armada atau ekspedisi.
                </div>
              ) : (
                <div className="space-y-3">
                  {shipments.map((sh) => {
                    const itemMap = new Map(
                      (order.items || []).map((item) => [item.id, item])
                    );
                    return (
                      <div
                        key={sh.id}
                        className="p-3.5 sm:p-4 rounded-lg border border-slate-200 bg-slate-50/50 space-y-3"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-200/80">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="px-2 py-0.5 rounded bg-indigo-100 text-indigo-800 text-xs font-bold">
                              Kloter #{sh.kloterNo || 1}
                            </span>
                            <StatusBadge status={sh.status} />
                            {sh.deliveryNo && (
                              <span className="font-mono text-xs font-semibold text-slate-700">
                                {sh.deliveryNo}
                              </span>
                            )}
                          </div>

                          <div className="flex flex-wrap items-center gap-2">
                            {sh.status === 'PREPARING' && canManageShipment && (
                              <button
                                type="button"
                                onClick={() => openShipmentModal(sh)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 text-xs font-semibold transition-colors"
                              >
                                <Edit className="w-3 h-3" />
                                <span>Ubah Kloter</span>
                              </button>
                            )}
                            {sh.status === 'PREPARING' && canShip && (
                              <button
                                type="button"
                                onClick={() => openShipModal(sh.id)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold transition-colors"
                              >
                                <Truck className="w-3 h-3" />
                                <span>Kirim Kloter</span>
                              </button>
                            )}
                            {sh.status === 'SHIPPED' && (
                              <button
                                type="button"
                                onClick={() => openDeliverModal(sh)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold transition-colors"
                              >
                                <CheckCircle2 className="w-3 h-3" />
                                <span>Tandai Diterima</span>
                              </button>
                            )}
                            {(sh.status === 'SHIPPED' || sh.status === 'DELIVERED') && (
                              <a
                                href={`/api/v1/orders/${order.id}/delivery-note/pdf?shipmentId=${sh.id}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-indigo-50 border border-indigo-200 text-indigo-700 hover:bg-indigo-100 text-xs font-semibold transition-colors"
                              >
                                <Printer className="w-3 h-3" />
                                <span>Cetak Surat Jalan</span>
                              </a>
                            )}
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs sm:text-sm">
                          <div>
                            <span className="text-xs text-slate-400">Nomor Surat Jalan</span>
                            <p className="font-bold text-slate-900 mt-0.5">
                              {sh.deliveryNo || 'Belum terbit (dibuat saat barang dikirim)'}
                            </p>
                          </div>

                          <div>
                            <span className="text-xs text-slate-400">Metode Pengiriman</span>
                            <p className="font-semibold text-slate-800 mt-0.5">
                              {sh.method === 'OWN_FLEET'
                                ? 'Armada Sendiri'
                                : sh.method === 'TRANSPORT_VENDOR'
                                ? 'Vendor Angkutan / Truk'
                                : 'Ekspedisi / Kurir Luar'}
                            </p>
                          </div>

                          {sh.trackingNo && (
                            <div>
                              <span className="text-xs text-slate-400">Nomor Resi / AWB</span>
                              <p className="font-mono font-semibold text-slate-800 mt-0.5">
                                {sh.trackingNo}
                              </p>
                            </div>
                          )}

                          {(sh.driverName || sh.vehiclePlate) && (
                            <div>
                              <span className="text-xs text-slate-400">Kurir / Kendaraan</span>
                              <p className="font-medium text-slate-800 mt-0.5">
                                {[sh.driverName, sh.vehiclePlate].filter(Boolean).join(' • ')}
                              </p>
                            </div>
                          )}

                          {sh.receiverName && (
                            <div>
                              <span className="text-xs text-slate-400">Penerima Barang</span>
                              <p className="font-semibold text-emerald-800 mt-0.5">
                                {sh.receiverName}
                              </p>
                            </div>
                          )}

                          {isSuperAdmin && sh.actualCost !== undefined && (
                            <div>
                              <span className="text-xs text-emerald-700 font-semibold">
                                Biaya Kirim Riil (Super Admin)
                              </span>
                              <p className="font-bold text-emerald-700 mt-0.5">
                                {formatRupiah(sh.actualCost)}
                              </p>
                            </div>
                          )}

                          {sh.shippedAt && (
                            <div>
                              <span className="text-xs text-slate-400">Waktu Dikirim</span>
                              <p className="text-slate-700 mt-0.5">
                                {new Date(sh.shippedAt).toLocaleString('id-ID')}
                              </p>
                            </div>
                          )}

                          {sh.deliveredAt && (
                            <div>
                              <span className="text-xs text-slate-400">Waktu Diterima</span>
                              <p className="text-slate-700 mt-0.5">
                                {new Date(sh.deliveredAt).toLocaleString('id-ID')}
                              </p>
                            </div>
                          )}

                          {sh.items && sh.items.length > 0 && (
                            <div className="sm:col-span-2 pt-2 border-t border-slate-200/70">
                              <span className="text-xs text-slate-400 block mb-1">
                                Item di Kloter Ini
                              </span>
                              <div className="flex flex-wrap gap-1.5">
                                {sh.items.map((si) => {
                                  const oi = itemMap.get(si.orderItemId);
                                  return (
                                    <span
                                      key={si.id}
                                      className="inline-flex items-center px-2 py-0.5 rounded bg-white border border-slate-200 text-xs text-slate-700"
                                    >
                                      {oi?.productName || si.orderItemId}:{' '}
                                      <strong className="ml-1">
                                        {si.qty} {oi?.unit || ''}
                                      </strong>
                                    </span>
                                  );
                                })}
                              </div>
                            </div>
                          )}

                          {sh.notes && (
                            <div className="sm:col-span-2 pt-2 border-t border-slate-200/70">
                              <span className="text-xs text-slate-400">Catatan Pengiriman</span>
                              <p className="text-xs text-slate-600 italic mt-0.5">
                                &quot;{sh.notes}&quot;
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Kartu Daftar Faktur (Invoices) */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-indigo-600" />
                <h2 className="text-base font-bold text-slate-900">
                  Daftar Faktur Pesanan
                </h2>
                <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700">
                  {(order.invoices || []).length}
                </span>
              </div>
            </div>

            <div className="divide-y divide-slate-100">
              {(order.invoices || []).length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-500">
                  Belum ada faktur yang diterbitkan untuk pesanan ini.
                </div>
              ) : (
                (order.invoices || []).map((inv) => (
                  <div
                    key={inv.id}
                    className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/50 transition-colors"
                  >
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-bold text-slate-900 text-sm">
                          {inv.number || `Faktur Draf (#${inv.id.slice(-6)})`}
                        </span>
                        <span
                          className={`text-[11px] px-2 py-0.5 rounded font-semibold ${
                            inv.type === 'DP'
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-blue-100 text-blue-800'
                          }`}
                        >
                          {inv.type === 'DP' ? 'Uang Muka (DP)' : 'Pelunasan (FINAL)'} v{inv.version}
                        </span>
                        <StatusBadge status={inv.status} />
                      </div>

                      <div className="text-xs text-slate-500 flex flex-wrap items-center gap-x-3 gap-y-0.5">
                        <span>
                          Nominal: <strong>{formatRupiah(inv.amount)}</strong>
                        </span>
                        <span>
                          Terbayar:{' '}
                          <strong className="text-emerald-600">
                            {formatRupiah(inv.paidAmount)}
                          </strong>
                        </span>
                        {inv.dueDate && (
                          <span>
                            Jatuh Tempo: {formatDateId(inv.dueDate, 'compact')}
                          </span>
                        )}
                      </div>

                      {inv.notes && (
                        <p className="text-xs text-slate-600 italic">
                          &quot;{inv.notes}&quot;
                        </p>
                      )}

                      {inv.rejectReason && (
                        <p className="text-xs text-rose-600 font-medium">
                          Alasan: {inv.rejectReason}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-2 self-start sm:self-center">
                      {/* Tombol Cetak Faktur PDF Resmi (APPROVED) */}
                      {inv.status === 'APPROVED' && (
                        <a
                          href={`/api/v1/invoices/${inv.id}/pdf`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-indigo-50 border border-indigo-200 text-indigo-700 hover:bg-indigo-100 text-xs font-semibold transition-colors"
                          title="Cetak Faktur PDF Resmi"
                        >
                          <Printer className="w-3.5 h-3.5" />
                          <span>Cetak PDF</span>
                        </a>
                      )}

                      {/* Tombol Pratinjau Faktur PDF (Khusus Super Admin pada PENDING_APPROVAL) */}
                      {isSuperAdmin && inv.status === 'PENDING_APPROVAL' && (
                        <a
                          href={`/api/v1/invoices/${inv.id}/pdf?preview=1`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-amber-50 border border-amber-200 text-amber-700 hover:bg-amber-100 text-xs font-semibold transition-colors"
                          title="Pratinjau Draf PDF Menunggu Persetujuan"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>Pratinjau PDF</span>
                        </a>
                      )}

                      {/* Tombol Void Invoice (Khusus Super Admin pada Invoice APPROVED) */}
                      {isSuperAdmin && inv.status === 'APPROVED' && (
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedVoidInvoice(inv);
                            setVoidInvoiceReason('');
                            setVoidInvoiceError(null);
                          }}
                          className="px-2.5 py-1 rounded border border-rose-300 text-rose-700 hover:bg-rose-50 text-xs font-semibold transition-colors"
                        >
                          Batalkan (Void)
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Kartu Nota Kredit & Retur Penjualan (Credit Notes) */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <RotateCcw className="w-5 h-5 text-indigo-600" />
                <h2 className="text-base font-bold text-slate-900">
                  Nota Kredit & Retur Penjualan
                </h2>
                <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700">
                  {creditNotes.length}
                </span>
              </div>

              {canCreateCreditNote && (
                <button
                  type="button"
                  onClick={openCreateCreditNoteModal}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold transition-colors shadow-sm"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>+ Buat Nota Kredit</span>
                </button>
              )}
            </div>

            <div className="space-y-3">
              {creditNotes.length === 0 ? (
                <p className="text-xs text-slate-500 py-3 text-center">
                  Belum ada nota kredit atau retur penjualan untuk pesanan ini.
                </p>
              ) : (
                creditNotes.map((cn) => {
                  const isVoided = Boolean(cn.voidedAt);
                  return (
                    <div
                      key={cn.id}
                      className={`p-4 rounded-xl border transition-colors space-y-3 ${
                        isVoided
                          ? 'bg-slate-50 border-slate-200 opacity-75'
                          : 'bg-white border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-900 text-sm font-mono">
                              {cn.number}
                            </span>
                            {isVoided ? (
                              <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-rose-100 text-rose-800">
                                DIBATALKAN (VOID)
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-100 text-emerald-800">
                                AKTIF
                              </span>
                            )}
                            <span
                              className={`px-2 py-0.5 rounded text-[11px] font-medium ${
                                cn.settlement === 'OFFSET'
                                  ? 'bg-blue-50 text-blue-700 border border-blue-200'
                                  : cn.settlement === 'CUSTOMER_CREDIT'
                                    ? 'bg-purple-50 text-purple-700 border border-purple-200'
                                    : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              }`}
                            >
                              {cn.settlement === 'OFFSET'
                                ? 'Potong Tagihan'
                                : cn.settlement === 'CUSTOMER_CREDIT'
                                  ? 'Deposit Pelanggan'
                                  : 'Pengembalian Kas'}
                            </span>
                          </div>
                          <p className="text-xs text-slate-500 mt-0.5">
                            Diterbitkan pada{' '}
                            {formatDateId(cn.createdAt, 'dateTime')}
                          </p>
                        </div>

                        <div className="flex items-center gap-3">
                          <div className="text-right">
                            <span className="text-xs text-slate-500 block">Total Nilai Kredit</span>
                            <span className="text-sm font-bold text-slate-900">
                              {formatRupiah(cn.total)}
                            </span>
                            {isSuperAdmin && cn.cogsReversed !== undefined && (
                              <span className="text-[11px] text-slate-500 block">
                                HPP Dipulihkan: {formatRupiah(cn.cogsReversed)}
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-2">
                            <a
                              href={`/api/v1/credit-notes/${cn.id}/pdf`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="px-2.5 py-1 rounded border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 text-xs font-semibold transition-colors"
                              title="Cetak / Unduh PDF Nota Kredit Ini"
                            >
                              Cetak PDF
                            </a>

                            {isSuperAdmin && !isVoided && (
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedVoidCreditNote(cn);
                                  setVoidCreditNoteReason('');
                                  setVoidCreditNoteError(null);
                                  setShowVoidCreditNoteModal(true);
                                }}
                                className="px-2.5 py-1 rounded border border-rose-300 text-rose-700 hover:bg-rose-50 text-xs font-semibold transition-colors"
                                title="Batalkan Nota Kredit Ini"
                              >
                                Void
                              </button>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="text-xs space-y-1">
                        <div className="text-slate-700">
                          <span className="font-semibold text-slate-600">Alasan Retur: </span>
                          <span>{cn.reason}</span>
                        </div>
                        {isVoided && (
                          <div className="text-rose-600 italic">
                            Dibatalkan pada {formatDateId(cn.voidedAt!, 'compact')}
                          </div>
                        )}
                      </div>

                      {/* Rincian Barang yang Diretur */}
                      <div className="bg-slate-50 rounded-lg p-2.5 space-y-1.5 text-xs">
                        <span className="font-semibold text-slate-700 block">
                          Barang yang Diretur:
                        </span>
                        <div className="space-y-1">
                          {cn.items?.map((cni) => {
                            const matchedOrderItem = order.items?.find(
                              (oi) => oi.id === cni.orderItemId
                            );
                            return (
                              <div
                                key={cni.id}
                                className="flex items-center justify-between text-slate-600"
                              >
                                <div className="flex items-center gap-2">
                                  <span>
                                    {matchedOrderItem?.productName || 'Produk'} ({cni.qty}{' '}
                                    {matchedOrderItem?.unit || 'unit'})
                                  </span>
                                  <span
                                    className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                                      cni.restock
                                        ? 'bg-blue-50 text-blue-700'
                                        : 'bg-amber-50 text-amber-700'
                                    }`}
                                  >
                                    {cni.restock ? 'Kembali ke Gudang' : 'Tanpa Restock'}
                                  </span>
                                </div>
                                <span className="font-medium text-slate-900">
                                  {formatRupiah(cni.creditAmount)}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Kolom Kanan: Ringkasan Pembayaran & Simulasi Profit */}
        <div className="space-y-6">
          {/* Kartu Ringkasan Pembayaran */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-4">
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-indigo-600" />
              <span>Ringkasan Keuangan</span>
            </h2>

            <div className="space-y-2.5 text-xs sm:text-sm">
              <div className="flex justify-between text-slate-600">
                <span>Subtotal Barang</span>
                <span className="font-medium text-slate-900">
                  {formatRupiah(order.subtotal)}
                </span>
              </div>

              {order.discountTotal > 0 && (
                <div className="flex justify-between text-rose-600">
                  <span>Total Diskon</span>
                  <span className="font-medium">
                    -{formatRupiah(order.discountTotal)}
                  </span>
                </div>
              )}

              <div className="flex justify-between text-slate-600">
                <span>Total Barang Bersih</span>
                <span className="font-medium text-slate-900">
                  {formatRupiah(order.subtotal - order.discountTotal)}
                </span>
              </div>

              <div className="flex justify-between text-slate-600">
                <span>Ongkos Kirim</span>
                <span className="font-medium text-slate-900">
                  {formatRupiah(order.shippingCharge)}
                </span>
              </div>

              {order.ppnEnabled && (
                <div className="flex justify-between text-slate-600">
                  <span>
                    PPN ({formatPercentFromBps(order.ppnRateBps)})
                  </span>
                  <span className="font-medium text-slate-900">
                    {formatRupiah(order.ppnAmount)}
                  </span>
                </div>
              )}

              <div className="pt-3 border-t border-slate-200 flex justify-between items-baseline">
                <span className="font-bold text-slate-900 text-sm">Grand Total</span>
                <span className="font-bold text-indigo-600 text-lg">
                  {formatRupiah(order.grandTotal)}
                </span>
              </div>

              {/* Rincian DP & Pelunasan */}
              <div className="mt-4 pt-3 border-t border-slate-100 bg-slate-50 p-3 rounded-lg space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-600">
                    Uang Muka (DP {order.dpBps / 100}%)
                  </span>
                  <span className="font-semibold text-slate-800">
                    {formatRupiah(order.dpAmount)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">Sisa Pelunasan</span>
                  <span className="font-semibold text-slate-800">
                    {formatRupiah(sisaPelunasan)}
                  </span>
                </div>
              </div>

              {/* Ringkasan Saldo Pembayaran */}
              <div className="mt-3 pt-3 border-t border-slate-200 space-y-2 text-xs">
                <div className="flex justify-between text-slate-700">
                  <span>Sudah Dibayar</span>
                  <span className="font-bold text-emerald-600">
                    {formatRupiah(order.paidTotal || 0)}
                  </span>
                </div>
                {order.creditTotal > 0 && (
                  <div className="flex justify-between text-slate-700">
                    <span>Kredit Retur (Offset)</span>
                    <span className="font-bold text-indigo-600">
                      -{formatRupiah(order.creditTotal)}
                    </span>
                  </div>
                )}
                <div className="flex justify-between text-slate-700">
                  <span>Sisa Tagihan</span>
                  <span
                    className={`font-bold ${
                      balanceDue > 0 ? 'text-amber-600' : 'text-emerald-600'
                    }`}
                  >
                    {formatRupiah(balanceDue)}
                  </span>
                </div>
              </div>

              {customerCreditBalance !== null && customerCreditBalance > 0 && (
                <div className="mt-2 p-2.5 bg-purple-50 border border-purple-200 rounded-lg text-xs flex items-center justify-between">
                  <span className="text-purple-700 font-medium">Deposit Kredit Pelanggan:</span>
                  <span className="font-bold text-purple-900">{formatRupiah(customerCreditBalance)}</span>
                </div>
              )}

              {canRecordPayment && (
                <button
                  type="button"
                  onClick={openPaymentModal}
                  className="w-full mt-3 py-2 px-3 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold flex items-center justify-center gap-1.5 shadow-sm transition-colors"
                >
                  <CreditCard className="w-4 h-4" />
                  <span>Catat Pembayaran Masuk</span>
                </button>
              )}
            </div>
          </div>

          {/* Panel Simulasi Profit & Komisi (Khusus Super Admin) */}
          {isSuperAdmin && (orderProfit || order.profitSimulation) && (() => {
            const profitData = orderProfit || {
              goodsRevenue: order.profitSimulation!.goodsRevenue,
              shippingCharge: order.shippingCharge,
              revenue: order.profitSimulation!.revenue,
              cogs: order.profitSimulation!.cogs,
              shippingActualCost: order.profitSimulation!.shippingActualCost,
              shippingSubsidy: Math.max(0, order.profitSimulation!.shippingActualCost - order.shippingCharge),
              extraCosts: order.profitSimulation!.extraCosts,
              profit: order.profitSimulation!.profit,
              marginBps: order.profitSimulation!.marginBps,
              costs: [],
              commission: null,
            };

            const comm = profitData.commission;

            return (
              <div className="bg-emerald-50/60 rounded-xl border border-emerald-200 shadow-sm p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-900 flex items-center gap-1.5">
                    <ShieldAlert className="w-4 h-4 text-emerald-700" />
                    <span>Laba Riil & Komisi (Khusus Admin)</span>
                  </h3>
                  {profitData.profit >= 0 ? (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                      <TrendingUp className="w-3.5 h-3.5" />
                      <span>Laba Positif</span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-rose-700 bg-rose-100 px-2 py-0.5 rounded-full">
                      <TrendingDown className="w-3.5 h-3.5" />
                      <span>Rugi / Negatif</span>
                    </span>
                  )}
                </div>

                {/* Rincian Finansial Pesanan */}
                <div className="space-y-2 text-xs divide-y divide-emerald-100/80">
                  <div className="flex justify-between pt-1 text-slate-700">
                    <span>Pendapatan Barang (Net)</span>
                    <span className="font-medium">
                      {formatRupiah(profitData.goodsRevenue)}
                    </span>
                  </div>
                  {profitData.shippingCharge > 0 && (
                    <div className="flex justify-between pt-2 text-slate-700">
                      <span>Ongkos Kirim Diterima</span>
                      <span className="font-medium text-slate-900">
                        {formatRupiah(profitData.shippingCharge)}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between pt-2 text-slate-700">
                    <span>Total HPP Produk (COGS)</span>
                    <span className="font-medium text-rose-700">
                      -{formatRupiah(profitData.cogs)}
                    </span>
                  </div>
                  {profitData.shippingActualCost > 0 && (
                    <div className="flex justify-between pt-2 text-slate-700">
                      <div>
                        <span>Biaya Kirim Riil</span>
                        {profitData.shippingSubsidy > 0 && (
                          <span className="text-[10px] text-amber-700 block">
                            (Subsidi: {formatRupiah(profitData.shippingSubsidy)})
                          </span>
                        )}
                      </div>
                      <span className="font-medium text-rose-700">
                        -{formatRupiah(profitData.shippingActualCost)}
                      </span>
                    </div>
                  )}
                  {profitData.extraCosts > 0 && (
                    <div className="flex justify-between pt-2 text-slate-700">
                      <span>Biaya Ekstra Operasional</span>
                      <span className="font-medium text-rose-700">
                        -{formatRupiah(profitData.extraCosts)}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between pt-2 font-bold text-sm">
                    <span className="text-slate-900">Laba Bersih Riil</span>
                    <span
                      className={
                        profitData.profit >= 0
                          ? 'text-emerald-700'
                          : 'text-rose-700 font-extrabold'
                      }
                    >
                      {formatRupiah(profitData.profit)}
                    </span>
                  </div>
                  <div className="flex justify-between pt-2 text-xs">
                    <span className="text-slate-600">Margin Keuntungan</span>
                    <span
                      className={`font-semibold ${
                        profitData.marginBps >= 0
                          ? 'text-emerald-700'
                          : 'text-rose-700'
                      }`}
                    >
                      {formatPercentFromBps(profitData.marginBps)}
                    </span>
                  </div>
                </div>

                {profitData.profit < 0 && (
                  <div className="p-2.5 bg-rose-100/80 border border-rose-300 rounded-lg text-rose-900 text-xs font-semibold flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-rose-700 shrink-0" />
                    <span>
                      Peringatan: Pesanan ini menghasilkan kerugian riil bagi usaha!
                    </span>
                  </div>
                )}

                {/* Sub-panel Biaya Tambahan (OrderCost) */}
                <div className="pt-3 border-t border-emerald-200/70 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-800">Biaya Ekstra Pesanan</span>
                    <button
                      type="button"
                      onClick={() => {
                        setCostLabel('');
                        setCostAmount('');
                        setCostError(null);
                        setShowAddCostModal(true);
                      }}
                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 hover:text-emerald-900 bg-emerald-100/80 hover:bg-emerald-200/80 px-2 py-0.5 rounded transition-colors"
                    >
                      <Plus className="w-3 h-3" />
                      <span>Tambah Biaya</span>
                    </button>
                  </div>

                  {profitData.costs && profitData.costs.length > 0 ? (
                    <div className="space-y-1.5">
                      {profitData.costs.map((c) => (
                        <div
                          key={c.id}
                          className="flex items-center justify-between bg-white/70 border border-emerald-100 px-2.5 py-1.5 rounded-lg text-xs"
                        >
                          <div>
                            <span className="font-medium text-slate-800 block">{c.label}</span>
                            <span className="text-[10px] text-slate-400">
                              {formatDateId(c.createdAt, 'compact')}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-rose-700">
                              {formatRupiah(c.amount)}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleDeleteCost(c.id)}
                              disabled={deletingCostId === c.id}
                              className="p-1 text-slate-400 hover:text-rose-600 rounded transition-colors disabled:opacity-50"
                              title="Hapus Biaya"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[11px] text-slate-500 italic">
                      Belum ada biaya ekstra dicatat (cth: packaging kayu, asuransi khusus).
                    </p>
                  )}
                </div>

                {/* Sub-panel Komisi Sales */}
                <div className="pt-3 border-t border-emerald-200/70 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-800">Komisi Sales</span>
                    {comm && (
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          comm.status === 'PAID'
                            ? 'bg-emerald-100 text-emerald-800'
                            : comm.status === 'REVERSED'
                            ? 'bg-rose-100 text-rose-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {comm.status === 'PAID'
                          ? 'SUDAH DIBAYAR'
                          : comm.status === 'REVERSED'
                          ? 'DIBATALKAN'
                          : 'BELUM DIBAYAR'}
                      </span>
                    )}
                  </div>

                  {comm ? (
                    <div className="bg-white/80 border border-emerald-100 rounded-lg p-2.5 space-y-1.5 text-xs">
                      <div className="flex justify-between text-slate-600">
                        <span>Skema Komisi</span>
                        <span className="font-medium text-slate-900">
                          {comm.mode === 'PERCENT_OF_PROFIT'
                            ? 'Persentase Laba Bersih'
                            : comm.mode === 'PERCENT_OF_REVENUE'
                            ? 'Persentase Omzet Penjualan'
                            : comm.mode === 'TIERED_BY_TARGET'
                            ? 'Target Bulanan Berjenjang'
                            : 'Nominal Tetap per Pesanan'}
                        </span>
                      </div>
                      {comm.mode !== 'FIXED_PER_ORDER' && (
                        <>
                          <div className="flex justify-between text-slate-600">
                            <span>Basis Perhitungan</span>
                            <span className="font-medium text-slate-900">
                              {formatRupiah(comm.basisAmount)}
                            </span>
                          </div>
                          <div className="flex justify-between text-slate-600">
                            <span>Tarif Komisi</span>
                            <span className="font-medium text-slate-900">
                              {formatPercentFromBps(comm.rateBps)}
                            </span>
                          </div>
                        </>
                      )}
                      <div className="flex justify-between font-bold text-slate-900 pt-1 border-t border-emerald-50">
                        <span>Nilai Komisi</span>
                        <span className="text-emerald-700 font-bold">
                          {formatRupiah(comm.amount)}
                        </span>
                      </div>

                      {comm.status === 'PAID' && comm.paidAt && (
                        <div className="text-[10px] text-slate-500 pt-1">
                          Dibayar pada {formatDateId(comm.paidAt, 'compact')}
                          {comm.note ? ` (${comm.note})` : ''}
                        </div>
                      )}

                      {comm.status === 'EARNED' && (
                        <div className="pt-2">
                          <button
                            type="button"
                            onClick={() => {
                              setPayCommissionNote('');
                              setPayCommissionError(null);
                              setShowPayCommissionModal(true);
                            }}
                            className="w-full py-1.5 px-3 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs rounded-lg transition-colors shadow-sm flex items-center justify-center gap-1.5"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Tandai Komisi Sudah Dibayar</span>
                          </button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="text-[11px] text-slate-500 italic">
                      Komisi belum diterbitkan (menunggu syarat pelunasan/pembayaran DP terpenuhi).
                    </p>
                  )}
                </div>
              </div>
            );
          })()}
        </div>
      </div>

      {/* Modal Konfirmasi Hapus Draf (Super Admin) */}
      <ConfirmTypeDialog
        isOpen={showDeleteModal}
        onClose={() => {
          setShowDeleteModal(false);
          setDeleteError(null);
        }}
        onConfirm={handleDeleteOrder}
        title="Hapus Pesanan Penjualan"
        description="Tindakan ini akan memindahkan pesanan ke tempat sampah. Data pesanan dan rincian item akan dihapus dari daftar aktif."
        confirmTarget={confirmTarget}
        confirmLabel="Hapus Pesanan"
        loading={deleting}
      />

      {/* Modal Batalkan Pesanan Resmi (Super Admin) */}
      {showCancelModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between p-4 border-b border-slate-100 bg-rose-50/70">
              <div className="flex items-center gap-2 text-rose-700">
                <Ban className="w-5 h-5" />
                <h3 className="font-semibold text-slate-800">Batalkan Pesanan Resmi</h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowCancelModal(false);
                  setCancelError(null);
                }}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-rose-100/50 min-h-[44px] min-w-[44px] flex items-center justify-center"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCancelOrder} className="p-5 space-y-4">
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-800 space-y-1">
                <p className="font-semibold">Konsekuensi Pembatalan Resmi:</p>
                <ul className="list-disc list-inside space-y-0.5">
                  <li>Seluruh faktur resmi aktif di-VOID otomatis dan ditarik dari tagihan berjalan.</li>
                  <li>Reservasi stok produk dilepaskan kembali dan komisi pesanan dibalikkan.</li>
                  <li>Riwayat audit & notifikasi pembatalan dikirimkan ke Sales terkait.</li>
                </ul>
              </div>

              {(order.paidTotal || 0) > 0 && (
                <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-lg space-y-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-amber-900">Dana Masuk / DP Terverifikasi:</span>
                    <span className="font-bold text-amber-900">{formatRupiah(order.paidTotal)}</span>
                  </div>
                  <div className="space-y-2">
                    <label className="block text-xs font-semibold text-slate-700">
                      Penyelesaian Dana DP <span className="text-rose-500">*</span>
                    </label>
                    <label className="flex items-start gap-2 text-xs text-slate-700 cursor-pointer">
                      <input
                        type="radio"
                        name="dpSettlement"
                        value="REFUND"
                        checked={cancelDpSettlement === 'REFUND'}
                        onChange={() => setCancelDpSettlement('REFUND')}
                        className="mt-0.5"
                      />
                      <span>
                        <strong>Kembalikan Dana (Refund)</strong> — Mencatat transaksi refund keluar agar saldo tagihan menjadi Rp 0.
                      </span>
                    </label>
                    <label className="flex items-start gap-2 text-xs text-slate-700 cursor-pointer">
                      <input
                        type="radio"
                        name="dpSettlement"
                        value="CUSTOMER_CREDIT"
                        checked={cancelDpSettlement === 'CUSTOMER_CREDIT'}
                        onChange={() => setCancelDpSettlement('CUSTOMER_CREDIT')}
                        className="mt-0.5"
                      />
                      <span>
                        <strong>Simpan sebagai Saldo Kredit Pelanggan</strong> — Dana tetap di perusahaan untuk pesanan berikutnya.
                      </span>
                    </label>
                  </div>

                  {cancelDpSettlement === 'REFUND' && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          Metode Refund
                        </label>
                        <select
                          value={cancelRefundMethod}
                          onChange={(e) =>
                            setCancelRefundMethod(e.target.value as 'TRANSFER' | 'CASH' | 'OTHER')
                          }
                          className="w-full text-xs p-2 rounded-lg border border-slate-300 bg-white text-slate-800"
                        >
                          <option value="TRANSFER">Transfer Bank</option>
                          <option value="CASH">Tunai (Cash)</option>
                          <option value="OTHER">Lainnya</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          No. Referensi Refund
                        </label>
                        <input
                          type="text"
                          value={cancelRefundReference}
                          onChange={(e) => setCancelRefundReference(e.target.value)}
                          placeholder="Opsional (mis: TRF-001)"
                          className="w-full text-xs p-2 rounded-lg border border-slate-300 bg-white text-slate-800"
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Alasan Pembatalan Resmi <span className="text-rose-500">*</span>
                </label>
                <textarea
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  placeholder="Jelaskan alasan pembatalan pesanan (min. 5 karakter)..."
                  rows={3}
                  className="w-full text-xs p-2.5 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-rose-500 text-slate-800"
                  required
                />
              </div>

              {cancelError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-700 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{cancelError}</span>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    setShowCancelModal(false);
                    setCancelError(null);
                  }}
                  className="min-h-[44px] px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  Tutup
                </button>
                <button
                  type="submit"
                  disabled={cancelling}
                  className="min-h-[44px] px-4 py-2 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 shadow-sm"
                >
                  {cancelling && <Loader2 className="w-4 h-4 animate-spin" />}
                  <span>{cancelling ? 'Membatalkan...' : 'Konfirmasi Batalkan Pesanan'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Ajukan Pesanan (Submit) */}
      {showSubmitModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between p-4 border-b border-slate-100 bg-slate-50">
              <div className="flex items-center gap-2 text-blue-600">
                <Send className="w-5 h-5" />
                <h3 className="font-semibold text-slate-800">Ajukan Pesanan untuk Persetujuan</h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowSubmitModal(false);
                  setSubmitError(null);
                }}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 min-h-[44px] min-w-[44px] flex items-center justify-center"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitOrder} className="p-5 space-y-4">
              <div className="text-sm text-slate-600 space-y-2">
                <p>
                  Pesanan akan diajukan ke Super Admin untuk ditinjau dan disetujui. Setelah diajukan, status pesanan berubah menjadi{' '}
                  <span className="font-semibold text-amber-700">PENDING_APPROVAL</span>.
                </p>
                <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-1 text-xs text-slate-700">
                  <div className="flex justify-between">
                    <span>Tipe Invoice:</span>
                    <span className="font-bold text-slate-900">
                      {order.dpBps > 0 ? `UANG MUKA (DP ${formatPercentFromBps(order.dpBps)})` : 'PELUNASAN (FINAL 100%)'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Jumlah Tagihan:</span>
                    <span className="font-bold text-blue-700">
                      {formatRupiah(order.dpBps > 0 ? order.dpAmount : order.grandTotal)}
                    </span>
                  </div>
                </div>
              </div>

              {order.hasBelowMin && (
                <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-lg space-y-2">
                  <div className="flex items-center gap-2 text-amber-800 text-xs font-bold">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                    <span>Perhatian: Penjualan di Bawah Harga Minimal (Floor Price)</span>
                  </div>
                  <p className="text-xs text-amber-700">
                    Pesanan ini memiliki produk yang dijual di bawah harga minimal. Anda wajib mengisi alasan persetujuan (minimal 5 karakter) untuk Super Admin.
                  </p>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Alasan Harga di Bawah Minimal <span className="text-rose-500">*</span>
                    </label>
                    <textarea
                      value={submitBelowMinReason}
                      onChange={(e) => setSubmitBelowMinReason(e.target.value)}
                      placeholder="Contoh: Kesepakatan khusus volume besar atau persetujuan diskon pembukaan cabang..."
                      rows={3}
                      className="w-full text-xs p-2.5 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800"
                      required
                    />
                    <div className="flex justify-between text-[11px] text-slate-500 mt-1">
                      <span>Minimal 5 karakter</span>
                      <span className={submitBelowMinReason.trim().length < 5 ? 'text-rose-500 font-medium' : 'text-slate-600'}>
                        {submitBelowMinReason.trim().length}/1000 karakter
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {submitError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-700 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{submitError}</span>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    setShowSubmitModal(false);
                    setSubmitError(null);
                  }}
                  className="min-h-[44px] px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={submitting || (order.hasBelowMin && submitBelowMinReason.trim().length < 5)}
                  className="min-h-[44px] px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 shadow-sm"
                >
                  {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                  <span>{submitting ? 'Mengajukan...' : 'Ajukan Pesanan'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Tarik Pengajuan (Withdraw) */}
      {showWithdrawModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between p-4 border-b border-slate-100 bg-slate-50">
              <div className="flex items-center gap-2 text-amber-700">
                <RotateCcw className="w-5 h-5" />
                <h3 className="font-semibold text-slate-800">Tarik Pengajuan Pesanan</h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowWithdrawModal(false);
                  setWithdrawError(null);
                }}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 min-h-[44px] min-w-[44px] flex items-center justify-center"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <p className="text-sm text-slate-600">
                Apakah Anda yakin ingin menarik kembali pengajuan pesanan ini?
              </p>
              <div className="p-3 bg-amber-50 rounded-lg border border-amber-200 text-xs text-amber-800 space-y-1">
                <p className="font-semibold">Konsekuensi Penarikan:</p>
                <ul className="list-disc list-inside space-y-0.5 text-amber-700">
                  <li>Status pesanan akan dikembalikan ke <span className="font-bold">DRAFT</span>.</li>
                  <li>Invoice yang sedang menunggu persetujuan akan dibatalkan (<span className="font-bold">WITHDRAWN</span>).</li>
                  <li>Anda dapat mengedit data pesanan dan mengajukannya kembali sewaktu-waktu.</li>
                </ul>
              </div>

              {withdrawError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-700 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{withdrawError}</span>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    setShowWithdrawModal(false);
                    setWithdrawError(null);
                  }}
                  className="min-h-[44px] px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={handleWithdrawOrder}
                  disabled={withdrawing}
                  className="min-h-[44px] px-4 py-2 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 shadow-sm"
                >
                  {withdrawing && <Loader2 className="w-4 h-4 animate-spin" />}
                  <span>{withdrawing ? 'Menarik...' : 'Ya, Tarik ke Draf'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Setujui Pesanan (Super Admin) */}
      {showApproveModal && order?.pendingInvoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between p-4 border-b border-slate-100 bg-slate-50">
              <div className="flex items-center gap-2 text-emerald-700">
                <CheckCircle2 className="w-5 h-5" />
                <h3 className="font-semibold text-slate-800">Setujui Pesanan & Terbitkan Faktur</h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowApproveModal(false);
                  setApproveError(null);
                }}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 min-h-[44px] min-w-[44px] flex items-center justify-center"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleApproveOrder} className="p-5 space-y-4">
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-1 text-xs text-slate-700">
                <div className="flex justify-between">
                  <span>Tipe Faktur:</span>
                  <span className="font-bold text-slate-900">
                    {order.pendingInvoice.type === 'DP' ? `Uang Muka (DP ${formatPercentFromBps(order.dpBps)})` : 'Pelunasan (FINAL)'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Nominal Tagihan:</span>
                  <span className="font-bold text-emerald-700">
                    {formatRupiah(order.pendingInvoice.amount)}
                  </span>
                </div>
              </div>

              {order.hasBelowMin && (
                <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-lg space-y-2">
                  <div className="flex items-center gap-2 text-amber-800 text-xs font-bold">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                    <span>Catatan Persetujuan Khusus (Override Harga Minimal)</span>
                  </div>
                  <p className="text-xs text-amber-700">
                    Pesanan ini memiliki produk di bawah harga minimal. Anda wajib mengisi catatan persetujuan khusus (override) minimal 5 karakter.
                  </p>
                  <div>
                    <textarea
                      value={overrideNote}
                      onChange={(e) => setOverrideNote(e.target.value)}
                      placeholder="Contoh: Disetujui khusus untuk proyek strategis atau pemesanan volume besar..."
                      rows={3}
                      className="w-full text-xs p-2.5 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-800"
                      required
                    />
                    <div className="flex justify-between text-[11px] text-slate-500 mt-1">
                      <span>Wajib diisi (minimal 5 karakter)</span>
                      <span className={overrideNote.trim().length < 5 ? 'text-rose-500 font-medium' : 'text-slate-600'}>
                        {overrideNote.trim().length}/1000 karakter
                      </span>
                    </div>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Jatuh Tempo Faktur (Opsional)
                  </label>
                  <input
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    className="w-full p-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-800"
                  />
                  <span className="text-[11px] text-slate-500">Bawaan: sesuai tempo usaha</span>
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Tema Dokumen PDF
                  </label>
                  <select
                    value={theme}
                    onChange={(e) => setTheme(e.target.value as typeof theme)}
                    className="w-full p-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-800 bg-white"
                  >
                    <option value="PROFESIONAL">Profesional</option>
                    <option value="FAMILY">Family</option>
                    <option value="MINIMALIS">Minimalis</option>
                    <option value="MODERN">Modern</option>
                    <option value="KLASIK">Klasik</option>
                  </select>
                </div>
              </div>

              {approveError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-700 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{approveError}</span>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    setShowApproveModal(false);
                    setApproveError(null);
                  }}
                  className="min-h-[44px] px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={approving || (order.hasBelowMin && overrideNote.trim().length < 5)}
                  className="min-h-[44px] px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 shadow-sm"
                >
                  {approving && <Loader2 className="w-4 h-4 animate-spin" />}
                  <span>{approving ? 'Memproses...' : 'Setujui & Terbitkan Invoice'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Tolak / Minta Revisi (Super Admin) */}
      {showRejectModal && order?.pendingInvoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between p-4 border-b border-slate-100 bg-slate-50">
              <div className="flex items-center gap-2 text-rose-700">
                <XCircle className="w-5 h-5" />
                <h3 className="font-semibold text-slate-800">Tolak Pengajuan & Minta Revisi</h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowRejectModal(false);
                  setRejectError(null);
                }}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 min-h-[44px] min-w-[44px] flex items-center justify-center"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleRejectOrder} className="p-5 space-y-4">
              <div className="p-3 bg-rose-50 rounded-lg border border-rose-200 text-xs text-rose-800 space-y-1">
                <p className="font-semibold">Konsekuensi Penolakan:</p>
                <ul className="list-disc list-inside space-y-0.5 text-rose-700">
                  <li>Invoice pengajuan saat ini akan ditandai <span className="font-bold">REJECTED</span>.</li>
                  <li>Status pesanan berubah menjadi <span className="font-bold">REVISION_REQUIRED</span>.</li>
                  <li>Staf Sales dapat menyunting ulang pesanan dan mengajukannya kembali.</li>
                </ul>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Alasan Penolakan / Permintaan Revisi <span className="text-rose-500">*</span>
                </label>
                <textarea
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="Contoh: Diskon terlalu besar, mohon sesuaikan harga atau konfirmasi ulang tanggal acara..."
                  rows={3}
                  className="w-full text-xs p-2.5 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-rose-500 text-slate-800"
                  required
                />
                <div className="flex justify-between text-[11px] text-slate-500 mt-1">
                  <span>Wajib minimal 5 karakter</span>
                  <span className={rejectReason.trim().length < 5 ? 'text-rose-500 font-medium' : 'text-slate-600'}>
                    {rejectReason.trim().length}/1000 karakter
                  </span>
                </div>
              </div>

              {rejectError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-700 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{rejectError}</span>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    setShowRejectModal(false);
                    setRejectError(null);
                  }}
                  className="min-h-[44px] px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={rejecting || rejectReason.trim().length < 5}
                  className="min-h-[44px] px-4 py-2 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 shadow-sm"
                >
                  {rejecting && <Loader2 className="w-4 h-4 animate-spin" />}
                  <span>{rejecting ? 'Mengirim...' : 'Kirim Penolakan'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Catat Pembayaran */}
      {showPaymentModal && order && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between p-4 border-b border-slate-100 bg-slate-50">
              <div className="flex items-center gap-2 text-indigo-700">
                <CreditCard className="w-5 h-5" />
                <h3 className="font-semibold text-slate-800">
                  Catat Pembayaran Masuk
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowPaymentModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleRecordPayment} className="p-5 space-y-4">
              <div className="p-3 bg-indigo-50/60 rounded-lg border border-indigo-100 text-xs text-indigo-900 flex justify-between items-center">
                <span>Sisa Tagihan Pesanan:</span>
                <span className="font-bold text-sm">
                  {formatRupiah(balanceDue)}
                </span>
              </div>

              {unpaidApprovedInvoices.length > 0 && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Alokasi Faktur
                  </label>
                  <select
                    value={payInvoiceId}
                    onChange={(e) => {
                      const nextId = e.target.value;
                      setPayInvoiceId(nextId);
                      const nextInv = unpaidApprovedInvoices.find((inv) => inv.id === nextId);
                      if (nextInv) {
                        const rem = Math.min(balanceDue, Math.max(0, nextInv.amount - nextInv.paidAmount));
                        setPayAmount(String(rem));
                      } else {
                        setPayAmount(String(balanceDue));
                      }
                    }}
                    className="w-full text-xs p-2.5 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-800 bg-white"
                  >
                    {unpaidApprovedInvoices.map((inv) => {
                      const rem = Math.max(0, inv.amount - inv.paidAmount);
                      return (
                        <option key={inv.id} value={inv.id}>
                          {inv.number || `Faktur #${inv.id.slice(-6)}`} ({inv.type === 'DP' ? 'DP' : 'Pelunasan'} - Sisa {formatRupiah(rem)})
                        </option>
                      );
                    })}
                    <option value="">Pembayaran Umum Pesanan (Tanpa Faktur Khusus)</option>
                  </select>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Nominal Pembayaran (Rp) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="number"
                  min="1"
                  max={maxAllowedPayment}
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                  placeholder="Contoh: 500000"
                  className="w-full text-xs p-2.5 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-800 font-semibold"
                  required
                />
                {selectedPayInvoice && (
                  <span className="text-[11px] text-slate-500 mt-1 block">
                    Maksimal sesuai sisa faktur terpilih: {formatRupiah(maxAllowedPayment)}
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Metode Pembayaran <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={payMethod}
                    onChange={(e) =>
                      setPayMethod(
                        e.target.value as 'TRANSFER' | 'CASH' | 'CREDIT' | 'OTHER'
                      )
                    }
                    className="w-full text-xs p-2.5 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-800"
                  >
                    <option value="TRANSFER">Transfer Bank</option>
                    {(isSuperAdmin || allowSalesCash) && (
                      <option value="CASH">Tunai (Cash)</option>
                    )}
                    {isSuperAdmin && (
                      <option value="CREDIT">Saldo Kredit Pelanggan</option>
                    )}
                    <option value="OTHER">Lainnya</option>
                  </select>
                  {!isSuperAdmin && !allowSalesCash && (
                    <span className="text-[11px] text-amber-700 mt-1 block">
                      Pembayaran tunai oleh Sales dinonaktifkan oleh kebijakan usaha.
                    </span>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Tanggal Bayar <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={payDate}
                    onChange={(e) => setPayDate(e.target.value)}
                    className="w-full text-xs p-2.5 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-800"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Nomor Referensi / No. Struk (Opsional)
                </label>
                <input
                  type="text"
                  value={payRef}
                  onChange={(e) => setPayRef(e.target.value)}
                  placeholder="Contoh: BCA-987654321"
                  className="w-full text-xs p-2.5 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-800"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Unggah Bukti Transfer (Gambar / PDF, maks 5 MB){' '}
                  {!isSuperAdmin && requireSalesProof && payMethod === 'TRANSFER' && (
                    <span className="text-rose-600">* Wajib untuk Sales</span>
                  )}
                </label>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,application/pdf"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    setPayFile(f || null);
                  }}
                  className="w-full text-xs text-slate-600 file:mr-2 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Catatan Pembayaran (Opsional)
                </label>
                <textarea
                  value={payNotes}
                  onChange={(e) => setPayNotes(e.target.value)}
                  placeholder="Catatan tambahan terkait pembayaran..."
                  rows={2}
                  className="w-full text-xs p-2.5 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-800"
                />
              </div>

              {isSuperAdmin && (
                <div className="flex items-center gap-2 p-3 bg-emerald-50 rounded-lg border border-emerald-200">
                  <input
                    type="checkbox"
                    id="autoVerifyCheck"
                    checked={payAutoVerify}
                    onChange={(e) => setPayAutoVerify(e.target.checked)}
                    className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500"
                  />
                  <label
                    htmlFor="autoVerifyCheck"
                    className="text-xs text-emerald-900 font-semibold cursor-pointer"
                  >
                    Langsung Verifikasi Pembayaran (Auto-Verify)
                  </label>
                </div>
              )}

              {payError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-700 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{payError}</span>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowPaymentModal(false)}
                  className="min-h-[44px] px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={paying}
                  className="min-h-[44px] px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 shadow-sm"
                >
                  {paying && <Loader2 className="w-4 h-4 animate-spin" />}
                  <span>{paying ? 'Menyimpan...' : 'Simpan Pembayaran'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Konfirmasi Verifikasi Pembayaran (Super Admin) */}
      {selectedVerifyPayment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200 p-5 space-y-4">
            <div className="flex items-center gap-2 text-emerald-700">
              <CheckCircle2 className="w-6 h-6 shrink-0" />
              <h3 className="font-semibold text-slate-800 text-base">
                Verifikasi Pembayaran
              </h3>
            </div>

            <p className="text-xs sm:text-sm text-slate-600">
              Apakah Anda yakin ingin memverifikasi penerimaan dana sebesar{' '}
              <strong className="text-slate-900">
                {formatRupiah(selectedVerifyPayment.amount)}
              </strong>{' '}
              ({selectedVerifyPayment.method})?
            </p>

            {verifyPaymentError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-700 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{verifyPaymentError}</span>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setSelectedVerifyPayment(null)}
                disabled={verifyingPayment}
                className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleVerifyPayment}
                disabled={verifyingPayment}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition-colors shadow-sm"
              >
                {verifyingPayment ? 'Memverifikasi...' : 'Ya, Verifikasi'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Tolak Pembayaran (Super Admin) */}
      {selectedRejectPayment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200 p-5 space-y-4">
            <div className="flex items-center gap-2 text-rose-700">
              <XCircle className="w-6 h-6 shrink-0" />
              <h3 className="font-semibold text-slate-800 text-base">
                Tolak Pembayaran Masuk
              </h3>
            </div>

            <p className="text-xs sm:text-sm text-slate-600">
              Tolak pembayaran sebesar{' '}
              <strong className="text-slate-900">
                {formatRupiah(selectedRejectPayment.amount)}
              </strong>
              . Staf sales akan menerima notifikasi beserta alasan penolakan.
            </p>

            <form onSubmit={handleRejectPayment} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Alasan Penolakan <span className="text-rose-500">*</span>
                </label>
                <textarea
                  value={paymentRejectReason}
                  onChange={(e) => setPaymentRejectReason(e.target.value)}
                  placeholder="Contoh: Bukti transfer tidak valid atau dana tidak ditemukan..."
                  rows={3}
                  className="w-full text-xs p-2.5 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-rose-500 text-slate-800"
                  required
                />
                <span className="text-[11px] text-slate-400">Minimal 5 karakter</span>
              </div>

              {paymentRejectError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-700 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{paymentRejectError}</span>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setSelectedRejectPayment(null)}
                  disabled={paymentRejecting}
                  className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={paymentRejecting || paymentRejectReason.trim().length < 5}
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition-colors shadow-sm"
                >
                  {paymentRejecting ? 'Menolak...' : 'Tolak Pembayaran'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Void Pembayaran (Super Admin) */}
      {selectedVoidPayment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200 p-5 space-y-4">
            <div className="flex items-center gap-2 text-slate-700">
              <RotateCcw className="w-6 h-6 shrink-0 text-amber-600" />
              <h3 className="font-semibold text-slate-800 text-base">
                Batalkan (Void) Pembayaran Terverifikasi
              </h3>
            </div>

            <p className="text-xs sm:text-sm text-slate-600">
              Pembatalan pembayaran sebesar{' '}
              <strong className="text-slate-900">
                {formatRupiah(selectedVoidPayment.amount)}
              </strong>{' '}
              akan mengurangi total bayar pesanan dan mengembalikan status pesanan jika diperlukan.
            </p>

            <form onSubmit={handleVoidPayment} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Alasan Pembatalan (Void) <span className="text-rose-500">*</span>
                </label>
                <textarea
                  value={paymentVoidReason}
                  onChange={(e) => setPaymentVoidReason(e.target.value)}
                  placeholder="Contoh: Dana ditarik kembali / chargeback oleh bank..."
                  rows={3}
                  className="w-full text-xs p-2.5 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-500 text-slate-800"
                  required
                />
                <span className="text-[11px] text-slate-400">Minimal 5 karakter</span>
              </div>

              {paymentVoidError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-700 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{paymentVoidError}</span>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setSelectedVoidPayment(null)}
                  disabled={paymentVoiding}
                  className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={paymentVoiding || paymentVoidReason.trim().length < 5}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-900 disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition-colors shadow-sm"
                >
                  {paymentVoiding ? 'Membatalkan...' : 'Void Pembayaran'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Ajukan Faktur Pelunasan (Request Final) */}
      {showRequestFinalModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200 p-5 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2 text-indigo-700">
                <FileText className="w-5 h-5" />
                <h3 className="font-semibold text-slate-800 text-base">
                  Ajukan Faktur Pelunasan (Final Invoice)
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowRequestFinalModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs sm:text-sm text-slate-600">
              Pesanan ini telah lunas uang muka (DP). Mengajukan faktur pelunasan akan menerbitkan tagihan sisa pesanan dan mengalihkan status ke{' '}
              <strong>FINAL_PENDING_APPROVAL</strong> untuk persetujuan Super Admin.
            </p>

            <form onSubmit={handleRequestFinal} className="space-y-4">
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-2 text-xs">
                <div className="flex justify-between text-slate-600">
                  <span>Grand Total Saat Ini:</span>
                  <span className="font-bold text-slate-900">{formatRupiah(order.grandTotal)}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Uang Muka Terbayar:</span>
                  <span className="font-bold text-emerald-600">{formatRupiah(order.dpAmount)}</span>
                </div>
                <div className="flex justify-between pt-1 border-t border-slate-200 text-slate-800 font-bold">
                  <span>Estimasi Tagihan Pelunasan:</span>
                  <span className="text-indigo-600 text-sm">
                    {formatRupiah(Math.max(0, order.grandTotal - order.dpAmount))}
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Penyesuaian Ongkos Kirim (Rp)
                </label>
                <input
                  type="number"
                  min="0"
                  value={finalShippingCharge}
                  onChange={(e) => setFinalShippingCharge(e.target.value)}
                  placeholder="0"
                  className="w-full text-xs p-2.5 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-800"
                />
                <span className="text-[11px] text-slate-400">
                  Ubah nominal jika terdapat biaya kirim tambahan saat pengiriman riil.
                </span>
              </div>

              {Number(finalShippingCharge || order.shippingCharge) !== order.shippingCharge && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Alasan Perubahan Ongkos Kirim <span className="text-rose-500">*</span>
                  </label>
                  <textarea
                    value={finalShippingReason}
                    onChange={(e) => setFinalShippingReason(e.target.value)}
                    placeholder="Contoh: Perubahan ekspedisi kargo roda 4 karena volume bertambah..."
                    rows={2}
                    className="w-full text-xs p-2.5 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-800"
                    required
                  />
                  <span className="text-[11px] text-slate-400">Minimal 5 karakter</span>
                </div>
              )}

              {requestFinalError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-700 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{requestFinalError}</span>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowRequestFinalModal(false)}
                  disabled={requestingFinal}
                  className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={
                    requestingFinal ||
                    (Number(finalShippingCharge || order.shippingCharge) !== order.shippingCharge &&
                      finalShippingReason.trim().length < 5)
                  }
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition-colors shadow-sm"
                >
                  {requestingFinal ? 'Mengajukan...' : 'Ajukan Pelunasan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Batalkan Faktur Resmi (Void Invoice - Super Admin) */}
      {selectedVoidInvoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200 p-5 space-y-4">
            <div className="flex items-center gap-2 text-rose-700">
              <AlertTriangle className="w-6 h-6 shrink-0" />
              <h3 className="font-semibold text-slate-800 text-base">
                Batalkan Faktur Resmi (VOID)
              </h3>
            </div>

            <p className="text-xs sm:text-sm text-slate-600">
              Anda akan membatalkan faktur{' '}
              <strong className="text-slate-900">
                {selectedVoidInvoice.number || selectedVoidInvoice.id}
              </strong>{' '}
              ({selectedVoidInvoice.type === 'DP' ? 'Uang Muka' : 'Pelunasan'}) senilai{' '}
              <strong>{formatRupiah(selectedVoidInvoice.amount)}</strong>.
            </p>

            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900 space-y-1">
              <p className="font-semibold">Perhatian:</p>
              <p>
                {selectedVoidInvoice.type === 'DP'
                  ? 'Pembatalan faktur uang muka akan melepas reservasi stok barang dan mengembalikan status pesanan ke REVISION_REQUIRED.'
                  : 'Pembatalan faktur pelunasan akan mengembalikan pesanan ke status IN_PROCESS.'}
              </p>
            </div>

            <form onSubmit={handleVoidInvoice} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Alasan Pembatalan (VOID) <span className="text-rose-500">*</span>
                </label>
                <textarea
                  value={voidInvoiceReason}
                  onChange={(e) => setVoidInvoiceReason(e.target.value)}
                  placeholder="Contoh: Salah perhitungan PPN atau perubahan kesepakatan pemesanan..."
                  rows={3}
                  className="w-full text-xs p-2.5 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-rose-500 text-slate-800"
                  required
                />
                <span className="text-[11px] text-slate-400">Minimal 5 karakter</span>
              </div>

              {voidInvoiceError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-700 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{voidInvoiceError}</span>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setSelectedVoidInvoice(null)}
                  disabled={voidingInvoice}
                  className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={voidingInvoice || voidInvoiceReason.trim().length < 5}
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition-colors shadow-sm"
                >
                  {voidingInvoice ? 'Membatalkan...' : 'Batalkan Faktur'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Atur Pengiriman (Upsert Shipment) */}
      {showShipmentModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200 p-5 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2 text-indigo-700">
                <Truck className="w-5 h-5" />
                <h3 className="font-semibold text-slate-800 text-base">
                  {shipment ? 'Perbarui Logistik Pengiriman' : 'Atur Logistik Pengiriman'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowShipmentModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveShipment} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Metode Pengiriman <span className="text-rose-500">*</span>
                </label>
                <select
                  value={shipMethod}
                  onChange={(e) =>
                    setShipMethod(
                      e.target.value as 'OWN_FLEET' | 'EXPEDITION' | 'TRANSPORT_VENDOR'
                    )
                  }
                  className="w-full text-xs p-2.5 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-800"
                >
                  <option value="OWN_FLEET">Armada Sendiri (Kurir Internal)</option>
                  <option value="EXPEDITION">Ekspedisi / Logistik Pihak Ketiga</option>
                  <option value="TRANSPORT_VENDOR">Vendor Angkutan / Truk Eksternal</option>
                </select>
              </div>

              {(shipMethod === 'EXPEDITION' || shipMethod === 'TRANSPORT_VENDOR') && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Nomor Resi / AWB / Surat Muat
                  </label>
                  <input
                    type="text"
                    value={shipTrackingNo}
                    onChange={(e) => setShipTrackingNo(e.target.value)}
                    placeholder="Contoh: JNE-0123456789 atau TRUK-FUSO-01"
                    className="w-full text-xs p-2.5 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-800 font-mono"
                  />
                </div>
              )}

              {(shipMethod === 'OWN_FLEET' || shipMethod === 'TRANSPORT_VENDOR') && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Nama Sopir / Driver
                    </label>
                    <input
                      type="text"
                      value={shipDriverName}
                      onChange={(e) => setShipDriverName(e.target.value)}
                      placeholder="Contoh: Pak Joko"
                      className="w-full text-xs p-2.5 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-800"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Plat Nomor Kendaraan
                    </label>
                    <input
                      type="text"
                      value={shipVehiclePlate}
                      onChange={(e) => setShipVehiclePlate(e.target.value)}
                      placeholder="Contoh: B 1234 CD"
                      className="w-full text-xs p-2.5 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-800"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Penerima di Lokasi (Opsional)
                </label>
                <input
                  type="text"
                  value={shipReceiverName}
                  onChange={(e) => setShipReceiverName(e.target.value)}
                  placeholder="Nama staf/penerima di gudang pelanggan"
                  className="w-full text-xs p-2.5 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-800"
                />
              </div>

              {isSuperAdmin && (
                <div>
                  <label className="block text-xs font-semibold text-emerald-800 mb-1">
                    Biaya Kirim Riil (HPP / Biaya Aktual - Khusus Admin)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={shipActualCost}
                    onChange={(e) => setShipActualCost(e.target.value)}
                    placeholder="Contoh: 15000"
                    className="w-full text-xs p-2.5 rounded-lg border border-emerald-300 bg-emerald-50/40 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-800 font-semibold"
                  />
                  <span className="text-[11px] text-slate-400">
                    Nilai ini tidak akan diperlihatkan kepada Sales.
                  </span>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Catatan Pengiriman
                </label>
                <textarea
                  value={shipNotes}
                  onChange={(e) => setShipNotes(e.target.value)}
                  placeholder="Contoh: Titip ke satpam pintu timur..."
                  rows={2}
                  className="w-full text-xs p-2.5 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-800"
                />
              </div>

              {shipmentError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-700 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{shipmentError}</span>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowShipmentModal(false)}
                  disabled={savingShipment}
                  className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={savingShipment}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition-colors shadow-sm"
                >
                  {savingShipment ? 'Menyimpan...' : 'Simpan Pengiriman'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Konfirmasi Kirim Barang (Ship Order / Kloter) */}
      {showShipModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-lg max-h-[90vh] overflow-y-auto animate-in zoom-in-95 duration-200 p-5 space-y-4">
            <div className="flex items-center gap-2 text-indigo-700">
              <Truck className="w-6 h-6 shrink-0" />
              <h3 className="font-semibold text-slate-800 text-base">
                Kirim Pesanan &amp; Terbitkan Surat Jalan
              </h3>
            </div>

            <p className="text-xs sm:text-sm text-slate-600">
              Sistem akan mengalokasikan <strong>Nomor Surat Jalan resmi</strong> dan{' '}
              <strong>memotong stok fisik gudang</strong> hanya untuk kuantitas yang dikirim pada kloter ini.
            </p>

            {!allowPartialShipment && (
              <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-600">
                Mode pengiriman penuh aktif (pengiriman parsial dinonaktifkan di pengaturan bisnis). Seluruh sisa qty akan dikirim sekaligus.
              </div>
            )}

            <div className="border border-slate-200 rounded-lg overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                  <tr>
                    <th className="p-2.5">Produk</th>
                    <th className="p-2.5 text-center">Sisa</th>
                    <th className="p-2.5 text-center w-28">Qty Dikirim</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {progressRows
                    .filter((r) => r.remainingQty > 0)
                    .map((row) => {
                      const val = shipItemQtys[row.orderItemId] ?? row.remainingQty;
                      return (
                        <tr key={row.orderItemId}>
                          <td className="p-2.5">
                            <span className="font-semibold text-slate-800 block">
                              {row.productName}
                            </span>
                            <span className="text-[11px] text-slate-400 font-mono">
                              {row.sku}
                            </span>
                          </td>
                          <td className="p-2.5 text-center text-slate-600">
                            {row.remainingQty} {row.unit}
                          </td>
                          <td className="p-2.5 text-center">
                            <input
                              type="number"
                              min={0}
                              max={row.remainingQty}
                              aria-label={`Qty dikirim ${row.productName}`}
                              value={val}
                              disabled={!allowPartialShipment}
                              onChange={(e) => {
                                const parsed = Math.max(
                                  0,
                                  Math.min(row.remainingQty, Math.floor(Number(e.target.value) || 0))
                                );
                                setShipItemQtys((prev) => ({
                                  ...prev,
                                  [row.orderItemId]: parsed,
                                }));
                              }}
                              className="w-20 p-1.5 text-center border border-slate-300 rounded text-xs font-semibold disabled:bg-slate-100"
                            />
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>

            {shipOrderError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-700 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{shipOrderError}</span>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowShipModal(false)}
                disabled={shippingOrder}
                className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleShipOrder}
                disabled={
                  shippingOrder ||
                  Object.values(shipItemQtys).reduce((s, q) => s + q, 0) <= 0
                }
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition-colors shadow-sm"
              >
                {shippingOrder ? 'Memproses Pengiriman...' : 'Konfirmasi Kirim'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Konfirmasi Barang Diterima (Deliver Order) */}
      {showDeliverModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200 p-5 space-y-4">
            <div className="flex items-center gap-2 text-emerald-700">
              <CheckCircle2 className="w-6 h-6 shrink-0" />
              <h3 className="font-semibold text-slate-800 text-base">
                Konfirmasi Penerimaan Barang di Tujuan
              </h3>
            </div>

            <p className="text-xs sm:text-sm text-slate-600">
              Tandai bahwa barang telah sukses sampai dan diterima oleh pelanggan.
            </p>

            <form onSubmit={handleDeliverOrder} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Nama Penerima Barang (Opsional)
                </label>
                <input
                  type="text"
                  value={deliverReceiverName}
                  onChange={(e) => setDeliverReceiverName(e.target.value)}
                  placeholder="Contoh: Ibu Ratna (Staf Penerima)"
                  className="w-full text-xs p-2.5 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-800"
                />
              </div>

              {deliverOrderError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-700 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{deliverOrderError}</span>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowDeliverModal(false)}
                  disabled={deliveringOrder}
                  className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={deliveringOrder}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition-colors shadow-sm"
                >
                  {deliveringOrder ? 'Memproses...' : 'Tandai Diterima'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Buat Nota Kredit & Retur Penjualan */}
      {showCreateCreditNoteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between p-4 border-b border-slate-100">
              <div className="flex items-center gap-2 text-indigo-700">
                <RotateCcw className="w-5 h-5" />
                <h3 className="font-bold text-slate-900 text-base">
                  Buat Nota Kredit & Retur Penjualan
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowCreateCreditNoteModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateCreditNote} className="flex flex-col flex-1 overflow-hidden">
              <div className="p-5 overflow-y-auto space-y-4 flex-1">
                {/* Alasan Retur */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Alasan Retur / Nota Kredit <span className="text-rose-500">*</span>
                  </label>
                  <textarea
                    rows={2}
                    value={cnReason}
                    onChange={(e) => setCnReason(e.target.value)}
                    placeholder="Contoh: Kemasan sobek saat pengiriman / salah varian produk"
                    className="w-full text-xs p-2.5 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-800"
                    required
                  />
                  <span className="text-[11px] text-slate-400">Minimal 5 karakter.</span>
                </div>

                {/* Pilihan Penyelesaian (Settlement) */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-2">
                    Metode Penyelesaian Kredit <span className="text-rose-500">*</span>
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    <label
                      className={`p-3 rounded-lg border text-xs cursor-pointer transition-colors ${
                        cnSettlement === 'OFFSET'
                          ? 'border-indigo-600 bg-indigo-50/50 text-indigo-900'
                          : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                      }`}
                    >
                      <input
                        type="radio"
                        name="settlement"
                        value="OFFSET"
                        checked={cnSettlement === 'OFFSET'}
                        onChange={() => setCnSettlement('OFFSET')}
                        className="sr-only"
                      />
                      <span className="font-bold block mb-1">Potong Tagihan</span>
                      <span className="text-[11px] text-slate-500 block">
                        Memotong sisa tagihan pesanan ini langsung.
                      </span>
                    </label>

                    <label
                      className={`p-3 rounded-lg border text-xs cursor-pointer transition-colors ${
                        cnSettlement === 'CUSTOMER_CREDIT'
                          ? 'border-indigo-600 bg-indigo-50/50 text-indigo-900'
                          : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                      }`}
                    >
                      <input
                        type="radio"
                        name="settlement"
                        value="CUSTOMER_CREDIT"
                        checked={cnSettlement === 'CUSTOMER_CREDIT'}
                        onChange={() => setCnSettlement('CUSTOMER_CREDIT')}
                        className="sr-only"
                      />
                      <span className="font-bold block mb-1">Deposit Pelanggan</span>
                      <span className="text-[11px] text-slate-500 block">
                        Disimpan sebagai deposit saldo untuk pesanan berikutnya.
                      </span>
                    </label>

                    <label
                      className={`p-3 rounded-lg border text-xs cursor-pointer transition-colors ${
                        cnSettlement === 'REFUND'
                          ? 'border-indigo-600 bg-indigo-50/50 text-indigo-900'
                          : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                      }`}
                    >
                      <input
                        type="radio"
                        name="settlement"
                        value="REFUND"
                        checked={cnSettlement === 'REFUND'}
                        onChange={() => setCnSettlement('REFUND')}
                        className="sr-only"
                      />
                      <span className="font-bold block mb-1">Pengembalian Kas</span>
                      <span className="text-[11px] text-slate-500 block">
                        Pengembalian uang tunai/transfer (maks {formatRupiah(order.paidTotal || 0)}).
                      </span>
                    </label>
                  </div>
                </div>

                {/* Tabel Barang yang Diretur */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-2">
                    Pilih Barang & Jumlah Retur
                  </label>
                  <div className="border border-slate-200 rounded-lg overflow-hidden">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                        <tr>
                          <th className="p-2.5">Produk</th>
                          <th className="p-2.5 text-center">Dipesan</th>
                          <th className="p-2.5 text-center">Sisa</th>
                          <th className="p-2.5 text-center w-24">Qty Retur</th>
                          <th className="p-2.5 text-center">Restock</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {order.items?.map((item) => {
                          const alreadyReturned = getAlreadyReturnedQty(item.id);
                          const shippedLimit = getShippedQtyForItem(item.id, item.qty);
                          const returnable = Math.max(0, shippedLimit - alreadyReturned);
                          const currentQty = cnItems[item.id]?.qty || 0;
                          const currentRestock = cnItems[item.id]?.restock ?? true;

                          return (
                            <tr key={item.id} className="hover:bg-slate-50/50">
                              <td className="p-2.5">
                                <span className="font-semibold text-slate-800 block">
                                  {item.productName}
                                </span>
                                <span className="text-[11px] text-slate-400 font-mono">
                                  {item.sku}
                                </span>
                              </td>
                              <td className="p-2.5 text-center text-slate-600">
                                {item.qty} {item.unit}
                              </td>
                              <td className="p-2.5 text-center font-semibold text-indigo-700">
                                {returnable} {item.unit}
                              </td>
                              <td className="p-2.5 text-center">
                                <input
                                  type="number"
                                  min="0"
                                  max={returnable}
                                  value={currentQty}
                                  disabled={returnable === 0}
                                  onChange={(e) => {
                                    const val = Math.max(
                                      0,
                                      Math.min(returnable, Number(e.target.value) || 0)
                                    );
                                    setCnItems((prev) => ({
                                      ...prev,
                                      [item.id]: {
                                        qty: val,
                                        restock: prev[item.id]?.restock ?? true,
                                      },
                                    }));
                                  }}
                                  className="w-16 p-1 text-center border border-slate-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500 font-semibold"
                                />
                              </td>
                              <td className="p-2.5 text-center">
                                <input
                                  type="checkbox"
                                  checked={currentRestock}
                                  disabled={currentQty === 0}
                                  onChange={(e) => {
                                    setCnItems((prev) => ({
                                      ...prev,
                                      [item.id]: {
                                        qty: prev[item.id]?.qty || 0,
                                        restock: e.target.checked,
                                      },
                                    }));
                                  }}
                                  className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500"
                                  title="Kembalikan barang ke stok gudang"
                                />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {creditNoteError && (
                  <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-700 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                    <span>{creditNoteError}</span>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end gap-2 p-4 border-t border-slate-100 bg-slate-50">
                <button
                  type="button"
                  onClick={() => setShowCreateCreditNoteModal(false)}
                  disabled={creatingCreditNote}
                  className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-200 rounded-lg transition-colors"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={creatingCreditNote}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition-colors shadow-sm flex items-center gap-1.5"
                >
                  {creatingCreditNote ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Menerbitkan...</span>
                    </>
                  ) : (
                    <span>Terbitkan Nota Kredit</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Batalkan (Void) Nota Kredit (Super Admin) */}
      {showVoidCreditNoteModal && selectedVoidCreditNote && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-md p-5 space-y-4 animate-in zoom-in-95 duration-200">
            <div className="flex items-center gap-2 text-rose-700">
              <AlertTriangle className="w-6 h-6 shrink-0" />
              <h3 className="font-semibold text-slate-800 text-base">
                Batalkan (Void) Nota Kredit
              </h3>
            </div>

            <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-800 space-y-1">
              <p className="font-semibold">Perhatian Tindakan Permanen:</p>
              <p>
                Membatalkan nota kredit <strong>{selectedVoidCreditNote.number}</strong> senilai{' '}
                <strong>{formatRupiah(selectedVoidCreditNote.total)}</strong> akan membatalkan pemotongan tagihan atau saldo deposit pelanggan, serta menarik kembali stok fisik gudang bila sebelumnya direstock.
              </p>
            </div>

            <form onSubmit={handleVoidCreditNote} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Alasan Pembatalan <span className="text-rose-500">*</span>
                </label>
                <textarea
                  rows={2}
                  value={voidCreditNoteReason}
                  onChange={(e) => setVoidCreditNoteReason(e.target.value)}
                  placeholder="Contoh: Kesepakatan ulang retur dibatalkan oleh pihak pembeli"
                  className="w-full text-xs p-2.5 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-rose-500 text-slate-800"
                  required
                />
                <span className="text-[11px] text-slate-400">Minimal 5 karakter.</span>
              </div>

              {voidCreditNoteError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-700 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{voidCreditNoteError}</span>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowVoidCreditNoteModal(false)}
                  disabled={voidingCreditNote}
                  className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  Tutup
                </button>
                <button
                  type="submit"
                  disabled={voidingCreditNote}
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition-colors shadow-sm flex items-center gap-1.5"
                >
                  {voidingCreditNote ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Membatalkan...</span>
                    </>
                  ) : (
                    <span>Konfirmasi Void</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Tambah Biaya Ekstra (OrderCost) */}
      {showAddCostModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between p-4 border-b border-slate-100 bg-slate-50">
              <div className="flex items-center gap-2 text-indigo-600">
                <DollarSign className="w-5 h-5" />
                <h3 className="font-semibold text-slate-800">Tambah Biaya Ekstra Pesanan</h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowAddCostModal(false);
                  setCostError(null);
                }}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 min-h-[44px] min-w-[44px] flex items-center justify-center"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddCost} className="p-5 space-y-4">
              <p className="text-xs text-slate-600">
                Biaya ekstra (seperti packing kayu, asuransi, bongkar muat, retribusi) akan mengurangi laba bersih riil pesanan dan memperbarui komisi sales.
              </p>

              {costError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-700 text-xs flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{costError}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Nama / Label Biaya <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: Packing Kayu, Biaya Karantina"
                  value={costLabel}
                  onChange={(e) => setCostLabel(e.target.value)}
                  className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Nominal Biaya (Rp) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="number"
                  required
                  min="1"
                  step="1"
                  placeholder="Contoh: 50000"
                  value={costAmount}
                  onChange={(e) => setCostAmount(e.target.value)}
                  className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddCostModal(false);
                    setCostError(null);
                  }}
                  disabled={addingCost}
                  className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={addingCost}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition-colors shadow-sm flex items-center gap-1.5"
                >
                  {addingCost ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Menyimpan...</span>
                    </>
                  ) : (
                    <span>Simpan Biaya</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Tandai Komisi Sudah Dibayar */}
      {showPayCommissionModal && orderProfit?.commission && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between p-4 border-b border-slate-100 bg-slate-50">
              <div className="flex items-center gap-2 text-emerald-600">
                <CheckCircle2 className="w-5 h-5" />
                <h3 className="font-semibold text-slate-800">Tandai Komisi Dibayar</h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowPayCommissionModal(false);
                  setPayCommissionError(null);
                }}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 min-h-[44px] min-w-[44px] flex items-center justify-center"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handlePayCommission} className="p-5 space-y-4">
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs space-y-1">
                <div className="text-slate-600">
                  Nominal Komisi: <strong className="text-emerald-800 text-sm">{formatRupiah(orderProfit.commission.amount)}</strong>
                </div>
                <div className="text-slate-500">
                  Setelah ditandai dibayar (PAID), entri komisi ini dikunci dan tidak akan berubah meski terjadi penambahan biaya ekstra atau retur.
                </div>
              </div>

              {payCommissionError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-700 text-xs flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{payCommissionError}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Catatan Pembayaran (Opsional)
                </label>
                <textarea
                  rows={2}
                  placeholder="Contoh: Ditransfer via BCA Payroll tanggal 25"
                  value={payCommissionNote}
                  onChange={(e) => setPayCommissionNote(e.target.value)}
                  className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    setShowPayCommissionModal(false);
                    setPayCommissionError(null);
                  }}
                  disabled={payingCommission}
                  className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={payingCommission}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition-colors shadow-sm flex items-center gap-1.5"
                >
                  {payingCommission ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Memproses...</span>
                    </>
                  ) : (
                    <span>Konfirmasi Bayar</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Tolak Revisi Pesanan (Fase 3 - Super Admin) */}
      {rejectRevisionTarget && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-5 sm:p-6 shadow-xl space-y-4">
            <h3 className="text-base font-bold text-slate-900">
              Tolak Pengajuan Revisi #{rejectRevisionTarget.revisionNo}
            </h3>
            <form onSubmit={handleRejectRevision} className="space-y-4">
              {revisionActionError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-700">
                  {revisionActionError}
                </div>
              )}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Alasan Penolakan (Min 5 karakter) *
                </label>
                <textarea
                  rows={3}
                  required
                  value={revisionRejectReason}
                  onChange={(e) => setRevisionRejectReason(e.target.value)}
                  placeholder="Jelaskan alasan penolakan revisi..."
                  className="w-full px-3 py-2 text-xs sm:text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setRejectRevisionTarget(null)}
                  className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={processingRevisionId === rejectRevisionTarget.id}
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white text-xs font-semibold rounded-lg"
                >
                  Konfirmasi Tolak
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Toast Notifikasi Sukses */}
      {submitSuccess && (
        <div className="fixed bottom-4 right-4 z-50 bg-emerald-600 text-white px-4 py-3 rounded-lg shadow-lg text-sm flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4" />
          <span>{submitSuccess}</span>
          <button
            type="button"
            onClick={() => setSubmitSuccess(null)}
            className="ml-2 hover:opacity-80 p-1"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {deleteError && (
        <div className="fixed bottom-4 right-4 z-50 bg-red-600 text-white px-4 py-3 rounded-lg shadow-lg text-sm flex items-center gap-2">
          <AlertTriangle className="w-4 h-4" />
          <span>{deleteError}</span>
        </div>
      )}
    </div>
  );
}
