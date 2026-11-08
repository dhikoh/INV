'use client';

import React, { useState, useEffect, useCallback } from 'react';
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
} from 'lucide-react';
import { Skeleton, ErrorState } from '@/components/ui/States';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { ConfirmTypeDialog } from '@/components/ui/ConfirmTypeDialog';
import { formatRupiah, formatPercentFromBps } from '@/lib/domain/money';

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
  createdAt: string;
  updatedAt: string;
  items?: OrderItemDto[];
  profitSimulation?: ProfitSimulationDto;
  pendingInvoice?: {
    id: string;
    type: 'DP' | 'FINAL';
    status: string;
    version: number;
    amount: number;
    number?: string | null;
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

  // Modal Hapus Draf
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

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

  // Modal Void Pembayaran (Super Admin)
  const [selectedVoidPayment, setSelectedVoidPayment] = useState<PaymentItemDto | null>(null);
  const [paymentVoidReason, setPaymentVoidReason] = useState('');
  const [paymentVoiding, setPaymentVoiding] = useState(false);
  const [paymentVoidError, setPaymentVoidError] = useState<string | null>(null);

  const fetchOrderDetail = useCallback(async () => {
    if (!id) return;
    try {
      setLoading(true);
      setError(null);

      const [orderRes, meRes, paymentsRes] = await Promise.all([
        fetch(`/api/v1/orders/${id}`),
        fetch('/api/v1/auth/me'),
        fetch(`/api/v1/orders/${id}/payments`),
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

      if (meRes.ok) {
        const meJson = await meRes.json();
        setCurrentUser(meJson.data.user);
      }

      if (paymentsRes.ok) {
        const payJson = await paymentsRes.json();
        setPayments(payJson.data || []);
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

      let res: Response;
      if (payFile) {
        const formData = new FormData();
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
  const isDraftOrRevision = order.status === 'DRAFT' || order.status === 'REVISION_REQUIRED';
  const isPendingApproval = order.status === 'PENDING_APPROVAL';
  const sisaPelunasan = Math.max(0, order.grandTotal - order.dpAmount);
  const balanceDue = Math.max(
    0,
    order.grandTotal - (order.paidTotal || 0) - (order.creditTotal || 0)
  );
  const canRecordPayment =
    !isDraftOrRevision &&
    !isPendingApproval &&
    order.status !== 'CANCELLED' &&
    balanceDue > 0;
  const items = order.items || [];
  const confirmTarget = order.orderNo ?? order.id;

  const formattedDate = new Date(order.orderDate).toLocaleDateString('id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

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

          {isDraftOrRevision && (
            <Link
              href={`/orders/${order.id}/edit`}
              className="inline-flex items-center justify-center gap-1.5 min-h-[44px] px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg text-sm transition-colors shadow-sm"
            >
              <Edit className="w-4 h-4" />
              <span>Edit Draf</span>
            </Link>
          )}

          {isSuperAdmin && (
            <button
              type="button"
              onClick={() => setShowDeleteModal(true)}
              className="inline-flex items-center justify-center gap-1.5 min-h-[44px] px-3.5 py-2 border border-rose-300 hover:bg-rose-50 text-rose-700 font-medium rounded-lg text-sm transition-colors"
            >
              <Trash2 className="w-4 h-4" />
              <span className="hidden sm:inline">Hapus Draf</span>
            </button>
          )}
        </div>
      </div>

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
                  onClick={() => {
                    setPayAmount(String(balanceDue));
                    setPayError(null);
                    setShowPaymentModal(true);
                  }}
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
                  const payDateFormatted = new Date(p.paidAt).toLocaleDateString('id-ID', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  });

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

                      {/* Aksi Super Admin untuk pembayaran */}
                      {isSuperAdmin && (
                        <div className="flex items-center gap-2 self-start sm:self-center">
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
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
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

              {canRecordPayment && (
                <button
                  type="button"
                  onClick={() => {
                    setPayAmount(String(balanceDue));
                    setPayError(null);
                    setShowPaymentModal(true);
                  }}
                  className="w-full mt-3 py-2 px-3 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold flex items-center justify-center gap-1.5 shadow-sm transition-colors"
                >
                  <CreditCard className="w-4 h-4" />
                  <span>Catat Pembayaran Masuk</span>
                </button>
              )}
            </div>
          </div>

          {/* Panel Simulasi Profit (Khusus Super Admin) */}
          {isSuperAdmin && order.profitSimulation && (
            <div className="bg-emerald-50/60 rounded-xl border border-emerald-200 shadow-sm p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-900 flex items-center gap-1.5">
                  <ShieldAlert className="w-4 h-4 text-emerald-700" />
                  <span>Simulasi Profit (Khusus Admin)</span>
                </h3>
                {order.profitSimulation.profit >= 0 ? (
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

              <div className="space-y-2 text-xs divide-y divide-emerald-100/80">
                <div className="flex justify-between pt-1 text-slate-700">
                  <span>Pendapatan Barang (Net)</span>
                  <span className="font-medium">
                    {formatRupiah(order.profitSimulation.goodsRevenue)}
                  </span>
                </div>
                <div className="flex justify-between pt-2 text-slate-700">
                  <span>Total HPP Produk (COGS)</span>
                  <span className="font-medium text-rose-700">
                    -{formatRupiah(order.profitSimulation.cogs)}
                  </span>
                </div>
                {order.profitSimulation.shippingActualCost > 0 && (
                  <div className="flex justify-between pt-2 text-slate-700">
                    <span>Biaya Kirim Riil</span>
                    <span className="font-medium text-rose-700">
                      -{formatRupiah(order.profitSimulation.shippingActualCost)}
                    </span>
                  </div>
                )}
                {order.profitSimulation.extraCosts > 0 && (
                  <div className="flex justify-between pt-2 text-slate-700">
                    <span>Biaya Tambahan Lain</span>
                    <span className="font-medium text-rose-700">
                      -{formatRupiah(order.profitSimulation.extraCosts)}
                    </span>
                  </div>
                )}
                <div className="flex justify-between pt-2 font-bold text-sm">
                  <span className="text-slate-900">Estimasi Laba Bersih</span>
                  <span
                    className={
                      order.profitSimulation.profit >= 0
                        ? 'text-emerald-700'
                        : 'text-rose-700 font-extrabold'
                    }
                  >
                    {formatRupiah(order.profitSimulation.profit)}
                  </span>
                </div>
                <div className="flex justify-between pt-2 text-xs">
                  <span className="text-slate-600">Margin Keuntungan</span>
                  <span
                    className={`font-semibold ${
                      order.profitSimulation.marginBps >= 0
                        ? 'text-emerald-700'
                        : 'text-rose-700'
                    }`}
                  >
                    {formatPercentFromBps(order.profitSimulation.marginBps)}
                  </span>
                </div>
              </div>

              {order.profitSimulation.profit < 0 && (
                <div className="p-2.5 bg-rose-100/80 border border-rose-300 rounded-lg text-rose-900 text-xs font-semibold flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-700 shrink-0" />
                  <span>
                    Peringatan: Pesanan ini menghasilkan estimasi kerugian bersih!
                  </span>
                </div>
              )}
            </div>
          )}
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

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Nominal Pembayaran (Rp) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="number"
                  min="1"
                  max={balanceDue}
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                  placeholder="Contoh: 500000"
                  className="w-full text-xs p-2.5 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-800 font-semibold"
                  required
                />
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
                    <option value="CASH">Tunai (Cash)</option>
                    {isSuperAdmin && (
                      <option value="CREDIT">Saldo Kredit Pelanggan</option>
                    )}
                    <option value="OTHER">Lainnya</option>
                  </select>
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
                  Unggah Bukti Transfer (Gambar / PDF, maks 5 MB)
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
