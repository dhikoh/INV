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

  const fetchOrderDetail = useCallback(async () => {
    if (!id) return;
    try {
      setLoading(true);
      setError(null);

      const [orderRes, meRes] = await Promise.all([
        fetch(`/api/v1/orders/${id}`),
        fetch('/api/v1/auth/me'),
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
  const sisaPelunasan = Math.max(0, order.grandTotal - order.dpAmount);
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
        <div className="flex items-center gap-2">
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

      {deleteError && (
        <div className="fixed bottom-4 right-4 z-50 bg-red-600 text-white px-4 py-3 rounded-lg shadow-lg text-sm flex items-center gap-2">
          <AlertTriangle className="w-4 h-4" />
          <span>{deleteError}</span>
        </div>
      )}
    </div>
  );
}
