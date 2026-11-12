'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Calendar,
  Truck,
  FileText,
  DollarSign,
  CheckCircle2,
  XCircle,
  Package,
  Boxes,
  Send,
  AlertTriangle,
  Receipt,
  User,
  Phone,
  MapPin,
} from 'lucide-react';
import { Skeleton, ErrorState } from '@/components/ui/States';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { MoneyInput } from '@/components/ui/MoneyInput';
import { formatRupiah } from '@/lib/domain/money';

interface PoItem {
  id: string;
  purchaseOrderId: string;
  productId: string;
  qty: number;
  receivedQty: number;
  unitCost: number;
  lineTotal: number;
  product: {
    id: string;
    sku: string;
    name: string;
    unit: string;
  } | null;
}

interface PurchaseOrderDetail {
  id: string;
  businessId: string;
  vendorId: string;
  vendorSeq: number | null;
  poNo: string | null;
  status: 'DRAFT' | 'ORDERED' | 'PARTIAL_RECEIVED' | 'RECEIVED' | 'CANCELLED';
  orderDate: string;
  expectedDate: string | null;
  subtotal: number;
  shippingCost: number;
  otherCost: number;
  total: number;
  paidTotal: number;
  notes: string | null;
  createdById: string;
  createdAt: string;
  updatedAt: string;
  vendor?: {
    id: string;
    code: string;
    name: string;
    picName: string | null;
    phone: string | null;
    address: string | null;
  };
  items: PoItem[];
}

function extractApiError(payload: unknown, fallback: string): string {
  if (payload && typeof payload === 'object') {
    const obj = payload as { error?: { message?: string }; message?: string };
    if (obj.error?.message) return obj.error.message;
    if (obj.message) return obj.message;
  }
  return fallback;
}

function ModalErrorBanner({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-800 text-xs flex items-start gap-2">
      <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
      <span className="font-medium">{message}</span>
    </div>
  );
}

export default function PurchaseOrderDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;

  const [po, setPo] = useState<PurchaseOrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const loadedIdRef = useRef<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Modal Pesan Sekarang
  const [showOrderModal, setShowOrderModal] = useState(false);
  const [ordering, setOrdering] = useState(false);

  // Modal Penerimaan Barang
  const [showReceiveModal, setShowReceiveModal] = useState(false);
  const [receiving, setReceiving] = useState(false);
  const [receiveItems, setReceiveItems] = useState<
    Array<{ itemId: string; name: string; sku: string; unit: string; maxQty: number; qty: number; unitCost: number; updateHpp: boolean }>
  >([]);
  const [receiveNotes, setReceiveNotes] = useState('');

  // Modal Catat Pembayaran Vendor
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paying, setPaying] = useState(false);
  const [payAmount, setPayAmount] = useState<number>(0);
  const [payDate, setPayDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [payMethod, setPayMethod] = useState<'TRANSFER' | 'CASH' | 'CREDIT' | 'OTHER'>('TRANSFER');
  const [payRef, setPayRef] = useState('');
  const [payNotes, setPayNotes] = useState('');

  // Modal Batalkan PO
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelReason, setCancelReason] = useState('');

  const fetchDetail = useCallback(async () => {
    try {
      if (loadedIdRef.current !== id) {
        setLoading(true);
      }
      setError(null);
      const res = await fetch(`/api/v1/purchase-orders/${id}`);
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(extractApiError(errData, 'Gagal memuat detail Purchase Order'));
      }
      const data = await res.json();
      setPo(data.data);
      loadedIdRef.current = id;
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Terjadi kesalahan sistem');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (id) {
      fetchDetail();
    }
  }, [id, fetchDetail]);

  // Aksi 1: Pesan Sekarang (DRAFT -> ORDERED)
  async function handleOrderPo() {
    try {
      setOrdering(true);
      setActionError(null);
      setActionSuccess(null);

      const res = await fetch(`/api/v1/purchase-orders/${id}/order`, {
        method: 'POST',
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(extractApiError(data, 'Gagal mengubah status PO menjadi Dipesan'));
      }

      setActionSuccess(`Purchase Order resmi diterbitkan dengan nomor ${data.data.poNo}`);
      setShowOrderModal(false);
      fetchDetail();
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Gagal memproses pemesanan');
    } finally {
      setOrdering(false);
    }
  }

  // Buka Modal Penerimaan
  function handleOpenReceiveModal() {
    if (!po) return;
    const initialItems = po.items
      .map((item) => {
        const remaining = Math.max(0, item.qty - item.receivedQty);
        return {
          itemId: item.id,
          name: item.product?.name || 'Produk',
          sku: item.product?.sku || '-',
          unit: item.product?.unit || 'pcs',
          maxQty: remaining,
          qty: remaining, // default menerima seluruh sisa
          unitCost: item.unitCost,
          updateHpp: false,
        };
      })
      .filter((it) => it.maxQty > 0);

    setActionError(null);
    setReceiveItems(initialItems);
    setReceiveNotes('');
    setShowReceiveModal(true);
  }

  // Aksi 2: Terima Barang
  async function handleReceiveGoods(e: React.FormEvent) {
    e.preventDefault();
    try {
      setReceiving(true);
      setActionError(null);
      setActionSuccess(null);

      const validItems = receiveItems.filter((i) => i.qty > 0);
      if (validItems.length === 0) {
        setActionError('Tentukan minimal 1 item dengan kuantitas terima lebih dari 0');
        setReceiving(false);
        return;
      }

      const payload = {
        items: validItems.map((i) => ({
          itemId: i.itemId,
          qty: i.qty,
          updateHpp: i.updateHpp,
        })),
        notes: receiveNotes.trim() || undefined,
      };

      const res = await fetch(`/api/v1/purchase-orders/${id}/receive`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(extractApiError(data, 'Gagal memproses penerimaan barang'));
      }

      setActionSuccess('Penerimaan barang berhasil dicatat dan stok fisik bertambah.');
      setShowReceiveModal(false);
      fetchDetail();
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Gagal memproses penerimaan');
    } finally {
      setReceiving(false);
    }
  }

  // Buka Modal Pembayaran Vendor
  function handleOpenPaymentModal() {
    if (!po) return;
    const unpaid = Math.max(0, po.total - po.paidTotal);
    setActionError(null);
    setPayAmount(unpaid > 0 ? unpaid : po.total);
    setPayDate(new Date().toISOString().slice(0, 10));
    setPayMethod('TRANSFER');
    setPayRef('');
    setPayNotes(`Pelunasan PO ${po.poNo || '#' + po.id.slice(-6)}`);
    setShowPaymentModal(true);
  }

  // Aksi 3: Catat Bayar Vendor
  async function handleRecordPayment(e: React.FormEvent) {
    e.preventDefault();
    if (!po) return;
    try {
      setPaying(true);
      setActionError(null);
      setActionSuccess(null);

      if (payAmount <= 0) {
        setActionError('Nominal pembayaran harus lebih dari Rp 0');
        setPaying(false);
        return;
      }

      const payload = {
        purchaseOrderId: po.id,
        amount: payAmount,
        paidAt: payDate,
        method: payMethod,
        reference: payRef.trim() || null,
        notes: payNotes.trim() || null,
      };

      const res = await fetch(`/api/v1/vendors/${po.vendorId}/payments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(extractApiError(data, 'Gagal mencatat pembayaran vendor'));
      }

      setActionSuccess(`Pembayaran sebesar ${formatRupiah(payAmount)} berhasil dicatat pada buku vendor.`);
      setShowPaymentModal(false);
      fetchDetail();
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Gagal mencatat pembayaran');
    } finally {
      setPaying(false);
    }
  }

  // Aksi 4: Batalkan PO
  async function handleCancelPo(e: React.FormEvent) {
    e.preventDefault();
    try {
      setCancelling(true);
      setActionError(null);
      setActionSuccess(null);

      if (cancelReason.trim().length < 5) {
        setActionError('Alasan pembatalan minimal 5 karakter');
        setCancelling(false);
        return;
      }

      const res = await fetch(`/api/v1/purchase-orders/${id}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: cancelReason }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(extractApiError(data, 'Gagal membatalkan PO'));
      }

      setActionSuccess('Purchase Order berhasil dibatalkan.');
      setShowCancelModal(false);
      fetchDetail();
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Gagal membatalkan PO');
    } finally {
      setCancelling(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-44 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error || !po) {
    return (
      <ErrorState
        title="Gagal Memuat Purchase Order"
        message={error || 'PO tidak ditemukan'}
        onRetry={fetchDetail}
      />
    );
  }

  const isDraft = po.status === 'DRAFT';
  const isOrdered = po.status === 'ORDERED';
  const isPartial = po.status === 'PARTIAL_RECEIVED';
  const isReceived = po.status === 'RECEIVED';
  const isCancelled = po.status === 'CANCELLED';

  const totalReceivedCount = po.items.reduce((acc, i) => acc + i.receivedQty, 0);
  const totalQtyOrdered = po.items.reduce((acc, i) => acc + i.qty, 0);
  const canBeCancelled = totalReceivedCount === 0 && !isCancelled;
  const remainingDebt = Math.max(0, po.total - po.paidTotal);

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Tombol Kembali & Breadcrumb */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => router.push('/purchase-orders')}
          className="p-2 border border-slate-200 rounded-lg hover:bg-slate-100 transition-colors text-slate-600 min-h-[44px] min-w-[44px] flex items-center justify-center"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <Link href="/purchase-orders" className="hover:underline">
              Purchase Order
            </Link>
            <span>/</span>
            <span className="font-mono text-slate-700">{po.poNo || 'Draf'}</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 mt-0.5 flex items-center gap-2">
            <span>PO: {po.poNo || `[DRAF #${po.id.slice(-6)}]`}</span>
            <StatusBadge status={po.status} />
          </h1>
        </div>
      </div>

      {/* Alert Umpan Balik */}
      {actionSuccess && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm flex items-start gap-3">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
          <div className="flex-1 font-medium">{actionSuccess}</div>
          <button
            type="button"
            onClick={() => setActionSuccess(null)}
            className="text-emerald-600 hover:text-emerald-800"
          >
            &times;
          </button>
        </div>
      )}

      {actionError && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-800 text-sm flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
          <div className="flex-1 font-medium">{actionError}</div>
          <button
            type="button"
            onClick={() => setActionError(null)}
            className="text-red-600 hover:text-red-800"
          >
            &times;
          </button>
        </div>
      )}

      {/* Banner Khusus Status */}
      {isDraft && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 text-sm flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <div className="font-semibold">Status PO: Draf Belum Dipesan</div>
            <div className="text-xs text-amber-800 mt-0.5">
              PO ini belum diterbitkan ke vendor. Klik tombol <strong>&quot;Pesan Sekarang&quot;</strong> untuk mengalokasikan nomor urut resmi dan memulai pemesanan barang.
            </div>
          </div>
        </div>
      )}

      {isCancelled && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-900 text-sm flex items-start gap-3">
          <XCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
          <div>
            <div className="font-semibold">Purchase Order Dibatalkan</div>
            <div className="text-xs text-red-800 mt-0.5">
              PO ini telah dibatalkan secara resmi dan tidak lagi memengaruhi hutang maupun stok barang.
            </div>
          </div>
        </div>
      )}

      {/* Baris Tombol Aksi Utama */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
        <div className="flex items-center gap-2">
          {po.vendor && (
            <Link
              href={`/vendors/${po.vendorId}`}
              className="text-xs font-semibold text-blue-600 hover:underline flex items-center gap-1.5"
            >
              <Truck className="w-4 h-4" />
              <span>Buka Buku Transaksi Vendor ({po.vendor.name})</span>
            </Link>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Aksi DRAFT: Pesan Sekarang */}
          {isDraft && (
            <button
              type="button"
              onClick={() => {
                setActionError(null);
                setShowOrderModal(true);
              }}
              className="min-h-[44px] px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold flex items-center gap-2 shadow-sm transition-colors"
            >
              <Send className="w-4 h-4" />
              <span>Pesan Sekarang</span>
            </button>
          )}

          {/* Aksi ORDERED / PARTIAL: Terima Barang */}
          {(isOrdered || isPartial) && (
            <button
              type="button"
              onClick={handleOpenReceiveModal}
              className="min-h-[44px] px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-semibold flex items-center gap-2 shadow-sm transition-colors"
            >
              <Boxes className="w-4 h-4" />
              <span>Terima Barang</span>
            </button>
          )}

          {/* Aksi Pembayaran Vendor (jika belum lunas dan PO non-batal) */}
          {!isCancelled && !isDraft && (
            <button
              type="button"
              onClick={handleOpenPaymentModal}
              className="min-h-[44px] px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-semibold flex items-center gap-2 shadow-sm transition-colors"
            >
              <DollarSign className="w-4 h-4" />
              <span>Catat Bayar Vendor</span>
            </button>
          )}

          {/* Aksi Batalkan PO */}
          {canBeCancelled && (
            <button
              type="button"
              onClick={() => {
                setActionError(null);
                setCancelReason('');
                setShowCancelModal(true);
              }}
              className="min-h-[44px] px-4 py-2 border border-red-200 text-red-600 hover:bg-red-50 rounded-lg text-sm font-semibold flex items-center gap-2 transition-colors"
            >
              <XCircle className="w-4 h-4" />
              <span>Batalkan PO</span>
            </button>
          )}
        </div>
      </div>

      {/* Grid Informasi Vendor & Waktu */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Kolom 1: Vendor */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-2">
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
            <Truck className="w-4 h-4 text-slate-500" />
            <span>Informasi Vendor</span>
          </div>
          <div className="font-semibold text-slate-900 text-base">
            {po.vendor?.name || 'Vendor Tidak Dikenal'}
          </div>
          <div className="text-xs text-slate-600 space-y-1">
            <div className="font-mono text-slate-500">Kode: {po.vendor?.code}</div>
            {po.vendor?.picName && (
              <div className="flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-slate-400" />
                <span>PIC: {po.vendor.picName}</span>
              </div>
            )}
            {po.vendor?.phone && (
              <div className="flex items-center gap-1.5">
                <Phone className="w-3.5 h-3.5 text-slate-400" />
                <span>{po.vendor.phone}</span>
              </div>
            )}
            {po.vendor?.address && (
              <div className="flex items-center gap-1.5 line-clamp-2">
                <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span>{po.vendor.address}</span>
              </div>
            )}
          </div>
        </div>

        {/* Kolom 2: Tanggal & Jadwal */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-2">
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
            <Calendar className="w-4 h-4 text-slate-500" />
            <span>Jadwal Pemesanan</span>
          </div>
          <div className="text-xs text-slate-600 space-y-2">
            <div>
              <div className="text-slate-400">Tanggal Pesan</div>
              <div className="font-medium text-slate-900 text-sm">
                {new Date(po.orderDate).toLocaleDateString('id-ID', {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                })}
              </div>
            </div>
            <div>
              <div className="text-slate-400">Perkiraan Tiba</div>
              <div className="font-medium text-slate-900 text-sm">
                {po.expectedDate
                  ? new Date(po.expectedDate).toLocaleDateString('id-ID', {
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric',
                    })
                  : 'Tidak ditentukan'}
              </div>
            </div>
          </div>
        </div>

        {/* Kolom 3: Status Progres Penerimaan */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-2">
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
            <Boxes className="w-4 h-4 text-slate-500" />
            <span>Progres Penerimaan Barang</span>
          </div>
          <div className="space-y-2">
            <div className="flex items-baseline justify-between">
              <span className="text-2xl font-bold text-slate-900">
                {totalReceivedCount}{' '}
                <span className="text-sm font-normal text-slate-500">/ {totalQtyOrdered} item</span>
              </span>
              <span className="text-xs font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                {totalQtyOrdered > 0
                  ? `${Math.round((totalReceivedCount / totalQtyOrdered) * 100)}%`
                  : '0%'}
              </span>
            </div>
            {/* Progress bar */}
            <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all duration-300 ${
                  isReceived
                    ? 'bg-emerald-500'
                    : isPartial
                    ? 'bg-amber-500'
                    : 'bg-slate-300'
                }`}
                style={{
                  width: `${
                    totalQtyOrdered > 0
                      ? Math.min(100, (totalReceivedCount / totalQtyOrdered) * 100)
                      : 0
                  }%`,
                }}
              />
            </div>
            <div className="text-[11px] text-slate-500">
              {isReceived
                ? 'Seluruh barang telah diterima di gudang'
                : isPartial
                ? 'Penerimaan bertahap sedang berlangsung'
                : isDraft
                ? 'Menunggu PO diterbitkan'
                : 'Menunggu pengiriman dari vendor'}
            </div>
          </div>
        </div>
      </div>

      {/* Tabel Item Purchase Order */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex items-center justify-between">
          <h2 className="font-semibold text-slate-900 flex items-center gap-2">
            <Package className="w-4 h-4 text-slate-600" />
            <span>Rincian Produk Dipesan ({po.items.length} item)</span>
          </h2>
        </div>

        {/* Desktop Table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-600 border-b border-slate-200 text-xs font-semibold">
              <tr>
                <th className="px-4 py-3">No</th>
                <th className="px-4 py-3">Produk</th>
                <th className="px-4 py-3 text-right">Dipesan</th>
                <th className="px-4 py-3 text-right">Diterima</th>
                <th className="px-4 py-3 text-right">Sisa Belum Diterima</th>
                <th className="px-4 py-3 text-right">Harga Beli Satuan</th>
                <th className="px-4 py-3 text-right">Subtotal</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {po.items.map((item, idx) => {
                const remaining = Math.max(0, item.qty - item.receivedQty);
                return (
                  <tr key={item.id} className="hover:bg-slate-50/50">
                    <td className="px-4 py-3 text-xs text-slate-400">{idx + 1}</td>
                    <td className="px-4 py-3">
                      <div className="font-semibold text-slate-900">
                        {item.product?.name || 'Produk'}
                      </div>
                      <div className="font-mono text-xs text-slate-400">
                        SKU: {item.product?.sku || '-'} &bull; Satuan: {item.product?.unit || 'pcs'}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-medium text-slate-800">
                      {item.qty} {item.product?.unit || 'pcs'}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-medium">
                      <span
                        className={
                          item.receivedQty >= item.qty
                            ? 'text-emerald-700 font-bold'
                            : item.receivedQty > 0
                            ? 'text-amber-700'
                            : 'text-slate-400'
                        }
                      >
                        {item.receivedQty}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-medium">
                      <span
                        className={
                          remaining === 0
                            ? 'text-slate-400'
                            : 'text-amber-600 font-semibold'
                        }
                      >
                        {remaining}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-slate-700">
                      {formatRupiah(item.unitCost)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-bold text-slate-900">
                      {formatRupiah(item.lineTotal)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Mobile View (Cards) */}
        <div className="md:hidden divide-y divide-slate-100">
          {po.items.map((item, idx) => {
            const remaining = Math.max(0, item.qty - item.receivedQty);
            return (
              <div key={item.id} className="p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="text-[11px] font-mono text-slate-400">#{idx + 1}</span>
                    <h4 className="font-semibold text-slate-900 text-sm">
                      {item.product?.name || 'Produk'}
                    </h4>
                    <div className="font-mono text-xs text-slate-500">
                      SKU: {item.product?.sku || '-'}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-bold font-mono text-slate-900 text-sm">
                      {formatRupiah(item.lineTotal)}
                    </div>
                    <div className="text-[11px] text-slate-500">
                      @ {formatRupiah(item.unitCost)}
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between text-xs bg-slate-50 p-2.5 rounded-lg font-mono">
                  <div>
                    <span className="text-slate-400">Dipesan: </span>
                    <span className="font-bold text-slate-800">{item.qty}</span>
                  </div>
                  <div>
                    <span className="text-slate-400">Diterima: </span>
                    <span className="font-bold text-emerald-700">{item.receivedQty}</span>
                  </div>
                  <div>
                    <span className="text-slate-400">Sisa: </span>
                    <span className="font-bold text-amber-600">{remaining}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Ringkasan Biaya PO & Saldo Pembayaran */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Catatan PO */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-2">
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
            <FileText className="w-4 h-4 text-slate-500" />
            <span>Catatan / Instruksi Pengiriman</span>
          </div>
          <div className="p-3 bg-slate-50 rounded-lg text-xs text-slate-700 whitespace-pre-line min-h-[80px]">
            {po.notes || 'Tidak ada catatan khusus.'}
          </div>
        </div>

        {/* Ringkasan Angka */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-3">
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
            <Receipt className="w-4 h-4 text-slate-500" />
            <span>Ringkasan Keuangan PO</span>
          </div>

          <div className="space-y-1.5 text-xs text-slate-600">
            <div className="flex justify-between py-1 border-b border-slate-100">
              <span>Subtotal Produk</span>
              <span className="font-mono font-medium text-slate-900">{formatRupiah(po.subtotal)}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-slate-100">
              <span>Ongkos Kirim</span>
              <span className="font-mono font-medium text-slate-900">{formatRupiah(po.shippingCost)}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-slate-100">
              <span>Biaya Lain-lain</span>
              <span className="font-mono font-medium text-slate-900">{formatRupiah(po.otherCost)}</span>
            </div>
            <div className="flex justify-between py-2 border-b-2 border-slate-200 font-bold text-sm text-slate-900">
              <span>Grand Total PO</span>
              <span className="font-mono text-blue-700">{formatRupiah(po.total)}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-slate-100">
              <span>Sudah Dibayar</span>
              <span className="font-mono font-semibold text-emerald-700">{formatRupiah(po.paidTotal)}</span>
            </div>
            <div className="flex justify-between py-2 bg-slate-50 p-2.5 rounded-lg text-sm font-bold">
              <span className={remainingDebt > 0 ? 'text-amber-800' : 'text-slate-800'}>
                Sisa Hutang PO
              </span>
              <span
                className={`font-mono ${
                  remainingDebt > 0 ? 'text-amber-700 font-bold' : 'text-emerald-700'
                }`}
              >
                {formatRupiah(remainingDebt)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* MODAL 1: PESAN SEKARANG (DRAFT -> ORDERED) */}
      {/* ========================================================================= */}
      {showOrderModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-md overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-slate-100 bg-slate-50">
              <div className="flex items-center gap-2 font-semibold text-slate-900">
                <Send className="w-5 h-5 text-blue-600" />
                <span>Terbitkan Purchase Order</span>
              </div>
              <button
                type="button"
                onClick={() => setShowOrderModal(false)}
                className="text-slate-400 hover:text-slate-600 text-lg"
              >
                &times;
              </button>
            </div>

            <div className="p-4 space-y-3 text-sm text-slate-600">
              <ModalErrorBanner message={actionError} />
              <p>
                Apakah Anda yakin ingin menerbitkan PO ini ke vendor{' '}
                <strong>{po.vendor?.name}</strong>?
              </p>
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-800 space-y-1">
                <div className="font-semibold">Perhatian:</div>
                <ul className="list-disc list-inside space-y-0.5">
                  <li>Nomor urut resmi PO (contoh: <code>VND/PO/...</code>) akan dialokasikan secara atomik.</li>
                  <li>Draf PO tidak dapat diedit kembali setelah diterbitkan.</li>
                  <li>Tagihan PO akan dicatat pada Buku Transaksi Vendor.</li>
                </ul>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 p-4 border-t border-slate-100 bg-slate-50">
              <button
                type="button"
                disabled={ordering}
                onClick={() => setShowOrderModal(false)}
                className="min-h-[44px] px-4 py-2 border border-slate-200 rounded-lg text-slate-700 hover:bg-slate-100 text-sm font-medium transition-colors"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={ordering}
                onClick={handleOrderPo}
                className="min-h-[44px] px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold flex items-center gap-2 shadow-sm transition-colors"
              >
                {ordering ? 'Memproses...' : 'Ya, Terbitkan PO'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 2: TERIMA BARANG (Penerimaan Fisik & Opsi Update HPP) */}
      {/* ========================================================================= */}
      {showReceiveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b border-slate-100 bg-slate-50 sticky top-0 z-10">
              <div className="flex items-center gap-2 font-semibold text-slate-900">
                <Boxes className="w-5 h-5 text-emerald-600" />
                <span>Penerimaan Barang Gudang</span>
              </div>
              <button
                type="button"
                onClick={() => setShowReceiveModal(false)}
                className="text-slate-400 hover:text-slate-600 text-lg"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleReceiveGoods} className="p-4 space-y-4">
              <ModalErrorBanner message={actionError} />
              <p className="text-xs text-slate-600">
                Masukkan kuantitas fisik riil yang diterima di gudang saat ini. Stok fisik produk akan bertambah otomatis.
              </p>

              <div className="space-y-3">
                {receiveItems.map((item, idx) => (
                  <div
                    key={item.itemId}
                    className="p-3 border border-slate-200 rounded-lg bg-slate-50/50 space-y-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-semibold text-sm text-slate-900">{item.name}</div>
                        <div className="text-xs font-mono text-slate-500">
                          SKU: {item.sku} &bull; Maks Sisa Terima: {item.maxQty} {item.unit}
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="text-xs font-mono text-slate-600">
                          Biaya: {formatRupiah(item.unitCost)}
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-200">
                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">
                          Kuantitas Diterima ({item.unit}) <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="number"
                          min="0"
                          max={item.maxQty}
                          value={item.qty}
                          onChange={(e) => {
                            const val = parseInt(e.target.value, 10) || 0;
                            const clamped = Math.max(0, Math.min(item.maxQty, val));
                            setReceiveItems((prev) =>
                              prev.map((it, i) => (i === idx ? { ...it, qty: clamped } : it))
                            );
                          }}
                          className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-mono text-right focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        />
                      </div>

                      <div className="flex items-center pt-5">
                        <label className="flex items-start gap-2 cursor-pointer text-xs text-slate-700">
                          <input
                            type="checkbox"
                            checked={item.updateHpp}
                            onChange={(e) => {
                              const checked = e.target.checked;
                              setReceiveItems((prev) =>
                                prev.map((it, i) => (i === idx ? { ...it, updateHpp: checked } : it))
                              );
                            }}
                            className="mt-0.5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                          />
                          <span>
                            Perbarui <strong>HPP master</strong> menjadi {formatRupiah(item.unitCost)}
                          </span>
                        </label>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Catatan Penerimaan / No. Surat Jalan Vendor
                </label>
                <input
                  type="text"
                  value={receiveNotes}
                  onChange={(e) => setReceiveNotes(e.target.value)}
                  placeholder="Contoh: Surat Jalan #SJ-2026-001 dari driver Pak Joko"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  disabled={receiving}
                  onClick={() => setShowReceiveModal(false)}
                  className="min-h-[44px] px-4 py-2 border border-slate-200 rounded-lg text-slate-700 hover:bg-slate-100 text-sm font-medium transition-colors"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={receiving}
                  className="min-h-[44px] px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-semibold flex items-center gap-2 shadow-sm transition-colors"
                >
                  {receiving ? 'Menyimpan...' : 'Simpan Penerimaan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 3: CATAT PEMBAYARAN VENDOR */}
      {/* ========================================================================= */}
      {showPaymentModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-md overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-slate-100 bg-slate-50">
              <div className="flex items-center gap-2 font-semibold text-slate-900">
                <DollarSign className="w-5 h-5 text-indigo-600" />
                <span>Catat Pembayaran Vendor</span>
              </div>
              <button
                type="button"
                onClick={() => setShowPaymentModal(false)}
                className="text-slate-400 hover:text-slate-600 text-lg"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleRecordPayment} className="p-4 space-y-3">
              <ModalErrorBanner message={actionError} />
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Vendor
                </label>
                <div className="p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-800">
                  {po.vendor?.name} ({po.vendor?.code})
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Nominal Pembayaran (Rp) <span className="text-red-500">*</span>
                </label>
                <MoneyInput
                  value={payAmount}
                  onChange={(val) => setPayAmount(val)}
                  placeholder="0"
                  required
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  Sisa tagihan PO ini: {formatRupiah(remainingDebt)}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Tanggal Bayar <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    required
                    value={payDate}
                    onChange={(e) => setPayDate(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Metode Bayar
                  </label>
                  <select
                    value={payMethod}
                    onChange={(e) =>
                      setPayMethod(e.target.value as 'TRANSFER' | 'CASH' | 'CREDIT' | 'OTHER')
                    }
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="TRANSFER">Transfer Bank</option>
                    <option value="CASH">Tunai (Cash)</option>
                    <option value="CREDIT">Kredit / Giro</option>
                    <option value="OTHER">Lainnya</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  No. Referensi / Bukti Transfer
                </label>
                <input
                  type="text"
                  value={payRef}
                  onChange={(e) => setPayRef(e.target.value)}
                  placeholder="Contoh: TRF-BCA-889123"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Catatan Pembayaran
                </label>
                <textarea
                  rows={2}
                  value={payNotes}
                  onChange={(e) => setPayNotes(e.target.value)}
                  placeholder="Keterangan tambahan transaksi..."
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  disabled={paying}
                  onClick={() => setShowPaymentModal(false)}
                  className="min-h-[44px] px-4 py-2 border border-slate-200 rounded-lg text-slate-700 hover:bg-slate-100 text-sm font-medium transition-colors"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={paying}
                  className="min-h-[44px] px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-semibold flex items-center gap-2 shadow-sm transition-colors"
                >
                  {paying ? 'Menyimpan...' : 'Simpan Pembayaran'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 4: BATALKAN PO */}
      {/* ========================================================================= */}
      {showCancelModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-md overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-slate-100 bg-red-50">
              <div className="flex items-center gap-2 font-semibold text-red-700">
                <XCircle className="w-5 h-5" />
                <span>Batalkan Purchase Order</span>
              </div>
              <button
                type="button"
                onClick={() => setShowCancelModal(false)}
                className="text-slate-400 hover:text-slate-600 text-lg"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleCancelPo} className="p-4 space-y-3">
              <ModalErrorBanner message={actionError} />
              <p className="text-xs text-slate-600">
                Pembatalan PO hanya dapat dilakukan jika belum ada barang yang diterima di gudang.
              </p>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Alasan Pembatalan <span className="text-red-500">* (minimal 5 karakter)</span>
                </label>
                <textarea
                  rows={3}
                  required
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  placeholder="Contoh: Vendor tidak memiliki stok bahan baku dan pesanan dibatalkan atas kesepakatan bersama."
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  disabled={cancelling}
                  onClick={() => setShowCancelModal(false)}
                  className="min-h-[44px] px-4 py-2 border border-slate-200 rounded-lg text-slate-700 hover:bg-slate-100 text-sm font-medium transition-colors"
                >
                  Tutup
                </button>
                <button
                  type="submit"
                  disabled={cancelling || cancelReason.trim().length < 5}
                  className="min-h-[44px] px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-semibold flex items-center gap-2 shadow-sm transition-colors disabled:opacity-50"
                >
                  {cancelling ? 'Membatalkan...' : 'Konfirmasi Batal PO'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
