'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ArrowLeft,
  FileText,
  DollarSign,
  Package,
  User,
  AlertCircle,
  Clock,
} from 'lucide-react';
import { Skeleton, ErrorState } from '@/components/ui/States';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { formatRupiah, formatPercentFromBps } from '@/lib/domain/money';
import { InvoiceTheme } from '@prisma/client';

interface InvoiceDetailData {
  id: string;
  invoiceNo: string | null;
  type: 'DP' | 'FINAL';
  status: string;
  theme: InvoiceTheme | null;
  version: number;
  rev: number;
  amount: number;
  paidAmount: number;
  dueDate: string | null;
  issuedAt: string | null;
  approvedAt: string | null;
  rejectionReason: string | null;
  voidReason: string | null;
  overrideNote: string | null;
  createdAt: string;
  customer: {
    id: string;
    code: string;
    name: string;
    phone: string | null;
    address: string | null;
  };
  order: {
    id: string;
    orderNo: string | null;
    orderDate: string;
    status: string;
    subtotal: number;
    discountTotal: number;
    shippingCharge: number;
    ppnEnabled: boolean;
    ppnRateBps: number;
    ppnAmount: number;
    grandTotal: number;
    paidTotal: number;
    dpAmount: number;
    dpBps: number;
    hasBelowMin: boolean;
    belowMinReason: string | null;
    rev: number;
    deliveryAddress: string | null;
    notes: string | null;
    sales: {
      id: string;
      name: string;
      username: string;
    } | null;
    items: Array<{
      id: string;
      productId: string;
      productName: string;
      sku: string;
      unit: string;
      qty: number;
      unitPrice: number;
      discountType: string;
      discountValue: number;
      lineSubtotal: number;
      lineDiscount: number;
      lineNet: number;
      belowMin: boolean;
      floorPrice?: number;
    }>;
  };
  bankAccounts: Array<{
    id: string;
    bankName: string;
    accountNumber: string;
    accountHolder: string;
    isDefault: boolean;
  }>;
  profitSimulation: {
    goodsRevenue: number;
    shippingCharge: number;
    revenue: number;
    cogs: number;
    shippingActualCost: number;
    shippingSubsidy: number;
    extraCosts: number;
    profit: number;
    marginBps: number;
    commissionAmount: number;
    costs: Array<{
      id: string;
      label: string;
      amount: number;
    }>;
  } | null;
  belowMinItems: Array<{
    id: string;
    productName: string;
    sku: string;
    qty: number;
    unitPrice: number;
    minPriceSnapshot: number;
    priceGap: number;
    belowMinReason: string | null;
  }> | null;
  customerStats: {
    orderCount: number;
    openReceivables: number;
  } | null;
  stockAvailability: Array<{
    productId: string;
    productName: string;
    sku: string;
    orderedQty: number;
    physicalStock: number;
    reservedStock: number;
    availableStock: number;
    isSufficient: boolean;
  }> | null;
}

export default function ApprovalDetailPage() {
  const params = useParams();
  const router = useRouter();
  const invoiceId = params?.invoiceId as string;

  const [data, setData] = useState<InvoiceDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modal Approve
  const [showApproveModal, setShowApproveModal] = useState(false);
  const [overrideNote, setOverrideNote] = useState('');
  const [selectedTheme, setSelectedTheme] = useState<InvoiceTheme>(InvoiceTheme.PROFESIONAL);
  const [dueDateInput, setDueDateInput] = useState('');
  const [approving, setApproving] = useState(false);
  const [approveError, setApproveError] = useState<string | null>(null);

  // Modal Reject
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [rejecting, setRejecting] = useState(false);
  const [rejectError, setRejectError] = useState<string | null>(null);

  // Toast
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const fetchInvoice = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`/api/v1/invoices/${invoiceId}`);
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.message || 'Gagal memuat detail invoice');
      }
      const json = await res.json();
      setData(json.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Terjadi kesalahan sistem');
    } finally {
      setLoading(false);
    }
  }, [invoiceId]);

  useEffect(() => {
    if (invoiceId) {
      fetchInvoice();
    }
  }, [invoiceId, fetchInvoice]);

  const handleApprove = async () => {
    if (!data) return;
    if (data.order.hasBelowMin && overrideNote.trim().length < 5) {
      setApproveError('Catatan override harga di bawah minimal wajib diisi minimal 5 karakter');
      return;
    }

    try {
      setApproving(true);
      setApproveError(null);

      const payload: {
        theme?: InvoiceTheme;
        dueDate?: string;
        overrideNote?: string;
        rev?: number;
      } = {
        theme: selectedTheme,
        rev: data.rev,
      };

      if (overrideNote.trim()) {
        payload.overrideNote = overrideNote.trim();
      }

      if (dueDateInput) {
        payload.dueDate = new Date(dueDateInput).toISOString();
      }

      const res = await fetch(`/api/v1/invoices/${invoiceId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.message || 'Gagal menyetujui faktur');
      }

      setToastMessage('Faktur berhasil disetujui dan nomor resmi telah diterbitkan!');
      setShowApproveModal(false);
      setTimeout(() => {
        router.push('/approvals');
      }, 1500);
    } catch (err) {
      setApproveError(err instanceof Error ? err.message : 'Gagal menyetujui faktur');
    } finally {
      setApproving(false);
    }
  };

  const handleReject = async () => {
    if (!data) return;
    if (rejectReason.trim().length < 5) {
      setRejectError('Alasan penolakan / revisi wajib diisi minimal 5 karakter');
      return;
    }

    try {
      setRejecting(true);
      setRejectError(null);

      const res = await fetch(`/api/v1/invoices/${invoiceId}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reason: rejectReason.trim(),
          rev: data.rev,
        }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.message || 'Gagal menolak faktur');
      }

      setToastMessage('Faktur ditolak dan instruksi revisi telah dikirim ke sales.');
      setShowRejectModal(false);
      setTimeout(() => {
        router.push('/approvals');
      }, 1500);
    } catch (err) {
      setRejectError(err instanceof Error ? err.message : 'Gagal menolak faktur');
    } finally {
      setRejecting(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto space-y-6 pb-12">
        <Skeleton className="h-10 w-48" />
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <Skeleton className="lg:col-span-7 h-96" />
          <Skeleton className="lg:col-span-5 h-96" />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="max-w-7xl mx-auto py-8">
        <ErrorState
          title="Gagal Memuat Detail Persetujuan"
          message={error || 'Data invoice tidak ditemukan'}
          onRetry={fetchInvoice}
        />
      </div>
    );
  }

  const isPending = data.status === 'PENDING_APPROVAL';

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-16">
      {/* Toast Notifikasi */}
      {toastMessage && (
        <div className="fixed bottom-5 right-5 z-50 flex items-center gap-2 bg-emerald-600 text-white px-4 py-3 rounded-lg shadow-lg text-sm font-medium animate-in fade-in slide-in-from-bottom-2">
          <CheckCircle2 className="w-5 h-5 shrink-0" />
          <span>{toastMessage}</span>
          <button
            type="button"
            onClick={() => setToastMessage(null)}
            className="ml-2 hover:opacity-80 p-1"
          >
            &times;
          </button>
        </div>
      )}

      {/* Breadcrumb & Navigation */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link
            href="/approvals"
            className="p-2 border border-slate-200 rounded-lg hover:bg-slate-100 transition-colors text-slate-600 min-h-[44px] min-w-[44px] flex items-center justify-center"
            title="Kembali ke antrean"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
                Tinjau & Persetujuan Faktur
              </h1>
              <StatusBadge status={data.status} />
              <span className="text-xs font-semibold px-2 py-0.5 rounded bg-blue-100 text-blue-800">
                {data.type === 'DP' ? 'Uang Muka (DP)' : 'Pelunasan (FINAL)'} v{data.version}
              </span>
            </div>
            <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
              Pesanan: <span className="font-mono font-semibold">{data.order.orderNo || `DRAF #${data.order.id.slice(-6)}`}</span> &bull; Diajukan oleh: <span className="font-semibold">{data.order.sales?.name || 'Sales'}</span>
            </p>
          </div>
        </div>

        {/* Action Header Buttons */}
        {isPending && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setRejectReason('');
                setRejectError(null);
                setShowRejectModal(true);
              }}
              className="px-4 py-2 border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 font-semibold rounded-lg text-sm transition-colors min-h-[44px] flex items-center gap-1.5"
            >
              <XCircle className="w-4 h-4" />
              <span>Tolak / Revisi</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setOverrideNote('');
                setApproveError(null);
                setShowApproveModal(true);
              }}
              className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-lg text-sm transition-colors shadow-sm min-h-[44px] flex items-center gap-1.5"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Setujui Faktur</span>
            </button>
          </div>
        )}
      </div>

      {/* 2-Column Responsive Layout: Left: Visual Invoice Preview; Right: Approval Inspection */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Kolom Kiri: Pratinjau Invoice Visual (Desktop 7 cols) */}
        <div className="lg:col-span-7 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          {/* Header Card Pratinjau */}
          <div className="bg-slate-50 px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-slate-600" />
              <span className="font-bold text-xs uppercase tracking-wider text-slate-700">
                Pratinjau Visual Faktur
              </span>
            </div>
            {data.theme && (
              <span className="text-xs bg-slate-200 text-slate-700 px-2 py-0.5 rounded font-medium">
                Tema: {data.theme}
              </span>
            )}
          </div>

          <div className="p-6 sm:p-8 space-y-6 text-slate-800 text-xs sm:text-sm">
            {/* Watermark Draft Banner */}
            {isPending && (
              <div className="bg-amber-50 border-2 border-dashed border-amber-300 rounded-lg p-3 text-center text-amber-900 font-bold text-xs tracking-wider uppercase flex items-center justify-center gap-2">
                <Clock className="w-4 h-4 text-amber-600" />
                <span>DRAFT &bull; MENUNGGU PERSETUJUAN PEMILIK USAHA</span>
              </div>
            )}

            {/* Header Invoice */}
            <div className="flex flex-wrap items-start justify-between gap-4 pb-6 border-b border-slate-200">
              <div>
                <h2 className="text-lg sm:text-xl font-bold text-slate-900">
                  FAKTUR PENJUALAN
                </h2>
                <div className="font-mono text-xs text-slate-500 mt-1">
                  Nomor:{' '}
                  <strong className="text-slate-800">
                    {data.invoiceNo || `[DRAF / BELUM DISETUJUI]`}
                  </strong>
                </div>
                <div className="text-xs text-slate-500 mt-0.5">
                  Tanggal Pengajuan:{' '}
                  {new Date(data.createdAt).toLocaleDateString('id-ID', {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                  })}
                </div>
              </div>

              <div className="text-right">
                <div className="font-bold text-slate-900 text-base">
                  {data.customer.name}
                </div>
                <div className="font-mono text-xs text-slate-500">
                  Kode: {data.customer.code}
                </div>
                {data.customer.phone && (
                  <div className="text-xs text-slate-500">
                    Telp: {data.customer.phone}
                  </div>
                )}
                {data.customer.address && (
                  <div className="text-xs text-slate-500 max-w-xs mt-0.5">
                    {data.customer.address}
                  </div>
                )}
              </div>
            </div>

            {/* Rincian Produk Pesanan */}
            <div className="space-y-2">
              <div className="font-bold text-xs uppercase tracking-wider text-slate-600">
                Rincian Barang
              </div>
              <div className="overflow-x-auto border border-slate-200 rounded-lg">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-700 font-semibold border-b border-slate-200">
                    <tr>
                      <th className="p-2.5">Produk & SKU</th>
                      <th className="p-2.5 text-center">Qty</th>
                      <th className="p-2.5 text-right">Harga Satuan</th>
                      <th className="p-2.5 text-right">Diskon</th>
                      <th className="p-2.5 text-right">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.order.items.map((it) => (
                      <tr
                        key={it.id}
                        className={it.belowMin ? 'bg-amber-50/50' : undefined}
                      >
                        <td className="p-2.5">
                          <div className="font-semibold text-slate-900">
                            {it.productName}
                          </div>
                          <div className="font-mono text-[11px] text-slate-400">
                            {it.sku} &bull; {it.unit}
                          </div>
                        </td>
                        <td className="p-2.5 text-center font-mono">
                          {it.qty}
                        </td>
                        <td className="p-2.5 text-right font-mono">
                          {formatRupiah(it.unitPrice)}
                        </td>
                        <td className="p-2.5 text-right font-mono text-slate-500">
                          {it.lineDiscount > 0
                            ? `-${formatRupiah(it.lineDiscount)}`
                            : '-'}
                        </td>
                        <td className="p-2.5 text-right font-mono font-semibold text-slate-900">
                          {formatRupiah(it.lineNet)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Ringkasan Biaya & Nominal Faktur */}
            <div className="border-t border-slate-200 pt-4 flex flex-col sm:flex-row items-stretch sm:items-start justify-between gap-6">
              {/* Petunjuk Rekening Pembayaran */}
              <div className="flex-1 space-y-2">
                <div className="font-bold text-xs uppercase tracking-wider text-slate-600">
                  Rekening Bank Pembayaran
                </div>
                {data.bankAccounts.length === 0 ? (
                  <p className="text-xs text-slate-400 italic">
                    Belum ada rekening bank aktif yang terdaftar.
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    {data.bankAccounts.map((acc) => (
                      <div
                        key={acc.id}
                        className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                      >
                        <div className="font-bold text-slate-900">
                          {acc.bankName} - {acc.accountNumber}
                        </div>
                        <div className="text-slate-500">
                          a/n {acc.accountHolder} {acc.isDefault && '(Utama)'}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Rincian Total */}
              <div className="w-full sm:w-64 space-y-2 text-xs">
                <div className="flex justify-between text-slate-600">
                  <span>Subtotal Barang:</span>
                  <span className="font-mono font-medium">
                    {formatRupiah(data.order.subtotal)}
                  </span>
                </div>

                {data.order.discountTotal > 0 && (
                  <div className="flex justify-between text-emerald-700">
                    <span>Total Diskon:</span>
                    <span className="font-mono font-medium">
                      -{formatRupiah(data.order.discountTotal)}
                    </span>
                  </div>
                )}

                {data.order.shippingCharge > 0 && (
                  <div className="flex justify-between text-slate-600">
                    <span>Ongkos Kirim:</span>
                    <span className="font-mono font-medium">
                      {formatRupiah(data.order.shippingCharge)}
                    </span>
                  </div>
                )}

                {data.order.ppnEnabled && (
                  <div className="flex justify-between text-slate-600">
                    <span>PPN ({data.order.ppnRateBps / 100}%):</span>
                    <span className="font-mono font-medium">
                      {formatRupiah(data.order.ppnAmount)}
                    </span>
                  </div>
                )}

                <div className="flex justify-between text-slate-900 font-bold pt-2 border-t border-slate-200">
                  <span>Grand Total Order:</span>
                  <span className="font-mono text-sm">
                    {formatRupiah(data.order.grandTotal)}
                  </span>
                </div>

                {/* Tagihan Faktur Ini */}
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg mt-3 space-y-1">
                  <div className="text-xs font-semibold text-blue-900 flex justify-between">
                    <span>Nominal Faktur Ini:</span>
                    <span className="font-mono font-bold text-blue-800 text-sm">
                      {formatRupiah(data.amount)}
                    </span>
                  </div>
                  <div className="text-[11px] text-blue-700">
                    {data.type === 'DP'
                      ? `Uang Muka (${data.order.dpBps / 100}%) sebelum pengerjaan pesanan`
                      : 'Pelunasan sisa tagihan pesanan'}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Kolom Kanan: Inspeksi Persetujuan Super Admin (Desktop 5 cols) */}
        <div className="lg:col-span-5 space-y-5">
          {/* Panel 1: Simulasi Profit & Margin */}
          {data.profitSimulation && (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 sm:p-5 space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <DollarSign className="w-5 h-5 text-emerald-600" />
                  <h3 className="font-bold text-slate-900 text-sm">
                    Simulasi Profitabilitas Pesanan
                  </h3>
                </div>
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                  Khusus Super Admin
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <span className="text-slate-400">Pendapatan Bersih:</span>
                  <div className="font-mono font-bold text-slate-900 mt-0.5">
                    {formatRupiah(data.profitSimulation.revenue)}
                  </div>
                </div>

                <div>
                  <span className="text-slate-400">Estimasi HPP (COGS):</span>
                  <div className="font-mono font-bold text-slate-700 mt-0.5">
                    {formatRupiah(data.profitSimulation.cogs)}
                  </div>
                </div>

                <div>
                  <span className="text-slate-400">Ongkir & Ekstra Biaya:</span>
                  <div className="font-mono text-slate-700 mt-0.5">
                    {formatRupiah(
                      data.profitSimulation.shippingSubsidy +
                        data.profitSimulation.extraCosts
                    )}
                  </div>
                </div>

                <div>
                  <span className="text-slate-400">Komisi Sales:</span>
                  <div className="font-mono text-slate-700 mt-0.5">
                    {formatRupiah(data.profitSimulation.commissionAmount)}
                  </div>
                </div>
              </div>

              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center justify-between">
                <div>
                  <div className="text-xs text-emerald-800 font-medium">
                    Estimasi Laba Bersih
                  </div>
                  <div
                    className={`font-mono font-bold text-base mt-0.5 ${
                      data.profitSimulation.profit >= 0
                        ? 'text-emerald-700'
                        : 'text-rose-600'
                    }`}
                  >
                    {formatRupiah(data.profitSimulation.profit)}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-emerald-800 font-medium">
                    Margin Bersih
                  </div>
                  <div className="font-mono font-bold text-base text-emerald-700 mt-0.5">
                    {formatPercentFromBps(data.profitSimulation.marginBps)}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Panel 2: Peringatan Harga di Bawah Minimal (BelowMin) */}
          {data.order.hasBelowMin && (
            <div className="bg-amber-50 rounded-xl border border-amber-300 p-4 sm:p-5 space-y-3">
              <div className="flex items-center gap-2 text-amber-900">
                <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
                <h3 className="font-bold text-sm">
                  Peringatan Harga di Bawah Floor (BelowMin)
                </h3>
              </div>

              <p className="text-xs text-amber-800 leading-relaxed">
                Staf sales mengajukan harga di bawah batas harga minimal yang diizinkan sistem. Konfirmasi persetujuan memerlukan catatan override dari pemilik usaha.
              </p>

              {data.order.belowMinReason && (
                <div className="p-2.5 bg-white border border-amber-200 rounded-lg text-xs space-y-1">
                  <div className="font-semibold text-slate-700">
                    Alasan dari Staf Sales:
                  </div>
                  <p className="italic text-slate-600">
                    &quot;{data.order.belowMinReason}&quot;
                  </p>
                </div>
              )}

              {data.belowMinItems && data.belowMinItems.length > 0 && (
                <div className="space-y-1.5 pt-1">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-amber-900">
                    Barang yang di bawah minimal:
                  </div>
                  {data.belowMinItems.map((item) => (
                    <div
                      key={item.id}
                      className="p-2 bg-white/80 border border-amber-200 rounded text-xs flex justify-between items-center"
                    >
                      <div>
                        <div className="font-semibold text-slate-900">
                          {item.productName}
                        </div>
                        <div className="text-[11px] text-slate-500 font-mono">
                          Deal: {formatRupiah(item.unitPrice)} vs Min: {formatRupiah(item.minPriceSnapshot)}
                        </div>
                      </div>
                      <span className="font-mono text-xs font-bold text-rose-600 bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
                        Selisih -{formatRupiah(item.priceGap)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Panel 3: Ketersediaan Stok Fisik vs Order */}
          {data.stockAvailability && (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 sm:p-5 space-y-3">
              <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
                <Package className="w-5 h-5 text-blue-600" />
                <h3 className="font-bold text-slate-900 text-sm">
                  Ketersediaan Stok Fisik
                </h3>
              </div>

              <div className="space-y-2 text-xs">
                {data.stockAvailability.map((stk) => (
                  <div
                    key={stk.productId}
                    className="p-2.5 border border-slate-100 rounded-lg bg-slate-50/50 space-y-1"
                  >
                    <div className="flex justify-between items-center">
                      <span className="font-semibold text-slate-900">
                        {stk.productName}
                      </span>
                      {stk.isSufficient ? (
                        <span className="text-[11px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" />
                          <span>Stok Cukup</span>
                        </span>
                      ) : (
                        <span className="text-[11px] font-bold text-rose-700 bg-rose-100 px-2 py-0.5 rounded flex items-center gap-1">
                          <AlertCircle className="w-3 h-3" />
                          <span>Defisit Stok</span>
                        </span>
                      )}
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-[11px] text-slate-500 pt-1">
                      <div>
                        Order: <strong className="text-slate-800">{stk.orderedQty}</strong>
                      </div>
                      <div>
                        Fisik: <strong className="text-slate-800">{stk.physicalStock}</strong>
                      </div>
                      <div>
                        Tersedia:{' '}
                        <strong
                          className={
                            stk.availableStock >= stk.orderedQty
                              ? 'text-emerald-700'
                              : 'text-rose-600'
                          }
                        >
                          {stk.availableStock}
                        </strong>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Panel 4: Riwayat & Piutang Pelanggan */}
          {data.customerStats && (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 sm:p-5 space-y-3">
              <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
                <User className="w-5 h-5 text-indigo-600" />
                <h3 className="font-bold text-slate-900 text-sm">
                  Riwayat & Piutang Customer
                </h3>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                  <span className="text-slate-400">Total Order Lalu:</span>
                  <div className="font-mono font-bold text-slate-900 text-base mt-0.5">
                    {data.customerStats.orderCount} pesanan
                  </div>
                </div>

                <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                  <span className="text-slate-400">Piutang Berjalan:</span>
                  <div
                    className={`font-mono font-bold text-base mt-0.5 ${
                      data.customerStats.openReceivables > 0
                        ? 'text-amber-700'
                        : 'text-emerald-700'
                    }`}
                  >
                    {formatRupiah(data.customerStats.openReceivables)}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* MODAL SETUJUI FAKTUR */}
      {showApproveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-xl max-w-lg w-full p-6 shadow-2xl space-y-5">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                  <span>Setujui & Terbitkan Faktur Resmi</span>
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  Nomor invoice resmi akan dialokasikan dan snapshot dokumen akan dikunci.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowApproveModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1 min-h-[36px] min-w-[36px] flex items-center justify-center"
              >
                &times;
              </button>
            </div>

            {approveError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-800 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{approveError}</span>
              </div>
            )}

            {/* Jika Order hasBelowMin: Wajib overrideNote */}
            {data.order.hasBelowMin && (
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-amber-900">
                  Catatan Override Persetujuan Harga di Bawah Minimal (Wajib min 5 karakter) *
                </label>
                <textarea
                  value={overrideNote}
                  onChange={(e) => setOverrideNote(e.target.value)}
                  placeholder="Contoh: Disetujui khusus karena promo pembukaan pelanggan baru atau pesanan partai besar..."
                  rows={3}
                  className="w-full text-xs p-3 border border-amber-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:outline-none"
                />
                <div className="text-[11px] text-slate-400 text-right">
                  {overrideNote.trim().length} / 500 karakter
                </div>
              </div>
            )}

            {/* Pilihan Tema Faktur */}
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-700">
                Pilih Tema Visual Faktur
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {[
                  InvoiceTheme.PROFESIONAL,
                  InvoiceTheme.MODERN,
                  InvoiceTheme.KLASIK,
                  InvoiceTheme.FAMILY,
                  InvoiceTheme.MINIMALIS,
                ].map((thm) => (
                  <button
                    key={thm}
                    type="button"
                    onClick={() => setSelectedTheme(thm)}
                    className={`py-2 px-3 text-xs font-semibold rounded-lg border text-center transition-colors ${
                      selectedTheme === thm
                        ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                        : 'border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {thm}
                  </button>
                ))}
              </div>
            </div>

            {/* Jatuh Tempo */}
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-700">
                Tanggal Jatuh Tempo (Opsional)
              </label>
              <input
                type="date"
                value={dueDateInput}
                onChange={(e) => setDueDateInput(e.target.value)}
                className="w-full text-xs p-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </div>

            {/* Tombol Aksi Dialog */}
            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                disabled={approving}
                onClick={() => setShowApproveModal(false)}
                className="px-4 py-2 border border-slate-200 text-slate-700 rounded-lg text-xs font-semibold hover:bg-slate-50 min-h-[40px]"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={approving}
                onClick={handleApprove}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg text-xs font-semibold min-h-[40px] flex items-center gap-1.5 shadow-sm"
              >
                {approving ? (
                  <>
                    <Clock className="w-4 h-4 animate-spin" />
                    <span>Menyetujui...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Konfirmasi Setujui</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL TOLAK / REVISI FAKTUR */}
      {showRejectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-xl max-w-lg w-full p-6 shadow-2xl space-y-5">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                  <XCircle className="w-5 h-5 text-rose-600" />
                  <span>Tolak Pengajuan & Minta Revisi</span>
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  Pesanan akan dikembalikan ke staf sales untuk direvisi sesuai catatan Anda.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowRejectModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1 min-h-[36px] min-w-[36px] flex items-center justify-center"
              >
                &times;
              </button>
            </div>

            {rejectError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-800 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{rejectError}</span>
              </div>
            )}

            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-800">
                Alasan Penolakan / Catatan Perbaikan (Wajib min 5 karakter) *
              </label>
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Tuliskan dengan jelas bagian mana yang harus diperbaiki oleh sales (contoh: Harga terlalu rendah, diskon melebihi wewenang, sesuaikan uang muka menjadi 50%)..."
                rows={4}
                className="w-full text-xs p-3 border border-slate-200 rounded-lg focus:ring-2 focus:ring-rose-500 focus:outline-none"
              />
              <div className="text-[11px] text-slate-400 text-right">
                {rejectReason.trim().length} / 500 karakter
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                disabled={rejecting}
                onClick={() => setShowRejectModal(false)}
                className="px-4 py-2 border border-slate-200 text-slate-700 rounded-lg text-xs font-semibold hover:bg-slate-50 min-h-[40px]"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={rejecting}
                onClick={handleReject}
                className="px-5 py-2 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white rounded-lg text-xs font-semibold min-h-[40px] flex items-center gap-1.5 shadow-sm"
              >
                {rejecting ? (
                  <>
                    <Clock className="w-4 h-4 animate-spin" />
                    <span>Mengirim...</span>
                  </>
                ) : (
                  <>
                    <XCircle className="w-4 h-4" />
                    <span>Kirim Penolakan</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
