'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  Printer,
  MessageSquare,
  ArrowLeft,
  CheckCircle2,
  XCircle,
  Clock,
  Ban,
  DollarSign,
  AlertCircle,
  Edit,
  ExternalLink,
} from 'lucide-react';
import { Skeleton, ErrorState } from '@/components/ui/States';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { formatRupiah, formatPercentFromBps } from '@/lib/domain/money';
import { buildInvoiceWaMessage, buildWaShareUrl } from '@/lib/domain/whatsapp';

interface InvoiceDetailResponse {
  id: string;
  invoiceNo: string | null;
  type: 'DP' | 'FINAL';
  status: string;
  theme: string | null;
  version: number;
  rev: number;
  amount: number;
  paidAmount: number;
  dueDate: string | null;
  issuedAt: string | null;
  approvedAt: string | null;
  rejectedAt: string | null;
  rejectionReason: string | null;
  voidReason: string | null;
  verifyToken?: string | null;
  overrideNote: string | null;
  createdAt: string;
  updatedAt: string;
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
  payments?: Array<{
    id: string;
    invoiceId: string | null;
    receiptNo: string | null;
    verifyToken: string | null;
    method: string;
    status: string;
    amount: number;
    paidAt: string;
    reference: string | null;
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

export default function InvoiceDetailPage() {
  const params = useParams();
  const id = params?.id as string;

  const [data, setData] = useState<InvoiceDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modal Void
  const [showVoidModal, setShowVoidModal] = useState(false);
  const [voidReason, setVoidReason] = useState('');
  const [voiding, setVoiding] = useState(false);
  const [voidError, setVoidError] = useState<string | null>(null);

  // Toast
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const fetchInvoice = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`/api/v1/invoices/${id}`);
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
  }, [id]);

  useEffect(() => {
    if (id) {
      fetchInvoice();
    }
  }, [id, fetchInvoice]);

  const handleVoid = async () => {
    if (!data) return;
    if (voidReason.trim().length < 5) {
      setVoidError('Alasan pembatalan faktur wajib diisi minimal 5 karakter');
      return;
    }

    try {
      setVoiding(true);
      setVoidError(null);
      const res = await fetch(`/api/v1/invoices/${id}/void`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reason: voidReason.trim(),
          rev: data.rev,
        }),
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.message || 'Gagal membatalkan faktur');
      }

      setToastMessage('Faktur resmi telah berhasil dibatalkan (VOID).');
      setShowVoidModal(false);
      fetchInvoice();
    } catch (err) {
      setVoidError(err instanceof Error ? err.message : 'Terjadi kesalahan');
    } finally {
      setVoiding(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto space-y-6 pb-16">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="max-w-7xl mx-auto py-8">
        <ErrorState
          title="Faktur Tidak Ditemukan"
          message={error || 'Data faktur tidak tersedia atau Anda tidak memiliki akses.'}
          onRetry={fetchInvoice}
        />
      </div>
    );
  }

  const isApproved = data.status === 'APPROVED';
  const isPending = data.status === 'PENDING_APPROVAL';
  const isRejected = data.status === 'REJECTED';
  const isVoid = data.status === 'VOID';
  const isSuperAdmin = data.profitSimulation !== null;

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

      {/* Header & Navigasi */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link
            href="/invoices"
            className="p-2 border border-slate-200 rounded-lg hover:bg-slate-100 transition-colors text-slate-600 min-h-[44px] min-w-[44px] flex items-center justify-center"
            title="Kembali ke daftar faktur"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight font-mono">
                {data.invoiceNo || `DRAF #${data.id.slice(-6)}`}
              </h1>
              <StatusBadge status={data.status} />
              <span className="text-xs font-semibold px-2 py-0.5 rounded bg-blue-100 text-blue-800">
                {data.type === 'DP' ? 'Uang Muka (DP)' : 'Pelunasan'} v{data.version}
              </span>
            </div>
            <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
              Pesanan Induk:{' '}
              <Link
                href={`/orders/${data.order.id}`}
                className="font-mono font-semibold text-blue-600 hover:underline inline-flex items-center gap-1"
              >
                <span>{data.order.orderNo || `Draf #${data.order.id.slice(-6)}`}</span>
                <ExternalLink className="w-3 h-3" />
              </Link>
            </p>
          </div>
        </div>

        {/* Tombol Aksi Header */}
        <div className="flex flex-wrap items-center gap-2">
          {data.verifyToken && (
            <Link
              href={`/verify/${data.verifyToken}`}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3.5 py-2 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 rounded-lg text-sm font-semibold min-h-[44px] flex items-center gap-1.5 transition-colors"
            >
              <ExternalLink className="w-4 h-4" />
              <span>Link Verifikasi QR</span>
            </Link>
          )}

          {/* Tombol Cetak PDF */}
          {isApproved ? (
            <>
              <a
                href={`/api/v1/invoices/${data.id}/pdf`}
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-semibold min-h-[44px] flex items-center gap-1.5 shadow-sm transition-colors"
              >
                <Printer className="w-4 h-4" />
                <span>Cetak PDF Faktur</span>
              </a>
              <a
                href={buildWaShareUrl(
                  buildInvoiceWaMessage({
                    customerName: data.customer.name,
                    invoiceNumber: data.invoiceNo || data.id,
                    type: data.type,
                    remainingAmount: Math.max(0, data.amount - data.paidAmount),
                    grandTotal: data.order?.grandTotal ?? data.amount,
                    verifyUrl:
                      typeof window !== 'undefined' && data.verifyToken
                        ? `${window.location.origin}/verify/${data.verifyToken}`
                        : null,
                  }),
                  data.customer?.phone
                )}
                target="_blank"
                rel="noreferrer"
                className="px-4 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-lg text-sm font-semibold min-h-[44px] flex items-center gap-1.5 transition-colors"
              >
                <MessageSquare className="w-4 h-4" />
                <span>Kirim via WhatsApp</span>
              </a>
            </>
          ) : (
            <button
              type="button"
              disabled
              title="Tombol cetak nonaktif sampai faktur disetujui pemilik usaha"
              className="px-4 py-2 bg-slate-100 text-slate-400 rounded-lg text-sm font-semibold min-h-[44px] flex items-center gap-1.5 cursor-not-allowed"
            >
              <Printer className="w-4 h-4" />
              <span>Menunggu Persetujuan Pemilik</span>
            </button>
          )}

          {/* Tombol Super Admin: Void */}
          {isSuperAdmin && isApproved && data.paidAmount === 0 && (
            <button
              type="button"
              onClick={() => {
                setVoidReason('');
                setVoidError(null);
                setShowVoidModal(true);
              }}
              className="px-4 py-2 border border-slate-200 bg-white hover:bg-rose-50 hover:border-rose-300 hover:text-rose-700 text-slate-700 rounded-lg text-sm font-semibold min-h-[44px] flex items-center gap-1.5 transition-colors"
            >
              <Ban className="w-4 h-4" />
              <span>Batalkan Faktur (Void)</span>
            </button>
          )}

          {/* Tombol Super Admin: Tinjau jika masih pending */}
          {isSuperAdmin && isPending && (
            <Link
              href={`/approvals/${data.id}`}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold min-h-[44px] flex items-center gap-1.5 shadow-sm transition-colors"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Tinjau Persetujuan</span>
            </Link>
          )}
        </div>
      </div>

      {/* Banner Notifikasi Status */}
      {isRejected && (
        <div className="p-4 sm:p-5 bg-rose-50 border border-rose-200 rounded-xl space-y-3">
          <div className="flex items-center gap-2 text-rose-900 font-bold text-sm">
            <XCircle className="w-5 h-5 text-rose-600 shrink-0" />
            <span>Faktur Ditolak oleh Pemilik Usaha / Super Admin</span>
          </div>
          <div className="p-3 bg-white border border-rose-200 rounded-lg text-xs space-y-1">
            <div className="font-semibold text-slate-700">Alasan Penolakan:</div>
            <p className="italic text-slate-800">
              &quot;{data.rejectionReason || 'Tidak ada alasan yang dicantumkan'}&quot;
            </p>
          </div>
          <div className="flex items-center justify-between">
            <p className="text-xs text-rose-700">
              Silakan lakukan perbaikan pada pesanan dan ajukan ulang faktur setelah disesuaikan.
            </p>
            <Link
              href={`/orders/${data.order.id}/edit`}
              className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-sm transition-colors min-h-[40px]"
            >
              <Edit className="w-4 h-4" />
              <span>Revisi Pesanan</span>
            </Link>
          </div>
        </div>
      )}

      {isPending && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5 text-amber-900 text-xs sm:text-sm">
            <Clock className="w-5 h-5 text-amber-600 shrink-0" />
            <div>
              <span className="font-bold">Faktur ini berstatus Draf dan sedang Menunggu Persetujuan.</span>
              <p className="text-amber-800 text-xs mt-0.5">
                Tombol cetak PDF resmi dan nomor invoice akan aktif setelah pemilik usaha menyetujui pengajuan ini.
              </p>
            </div>
          </div>
          {isSuperAdmin && (
            <Link
              href={`/approvals/${data.id}`}
              className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-semibold whitespace-nowrap min-h-[40px] flex items-center gap-1 shrink-0"
            >
              <span>Buka Menu Persetujuan</span>
            </Link>
          )}
        </div>
      )}

      {isVoid && (
        <div className="p-4 bg-slate-100 border border-slate-300 rounded-xl space-y-2">
          <div className="flex items-center gap-2 text-slate-800 font-bold text-sm">
            <Ban className="w-5 h-5 text-slate-600" />
            <span>Faktur ini telah Dibatalkan (VOID)</span>
          </div>
          {data.voidReason && (
            <p className="text-xs text-slate-600 italic">
              Alasan pembatalan: &quot;{data.voidReason}&quot;
            </p>
          )}
        </div>
      )}

      {/* Konten Utama: 2 Kolom Responsif */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Kolom Kiri: Dokumen Rincian Faktur (Desktop 8 cols) */}
        <div className="lg:col-span-8 bg-white rounded-xl border border-slate-200 shadow-sm p-5 sm:p-7 space-y-6">
          {/* Header Faktur */}
          <div className="flex flex-wrap items-start justify-between gap-4 pb-6 border-b border-slate-200">
            <div>
              <h2 className="text-lg sm:text-xl font-bold text-slate-900 font-mono">
                {data.invoiceNo || `DRAF FAKTUR`}
              </h2>
              <div className="text-xs text-slate-500 mt-1">
                Dibuat pada:{' '}
                {new Date(data.createdAt).toLocaleDateString('id-ID', {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                })}
              </div>
              {data.dueDate && (
                <div className="text-xs text-slate-700 mt-0.5">
                  Jatuh Tempo:{' '}
                  <strong className="font-mono">
                    {new Date(data.dueDate).toLocaleDateString('id-ID', {
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric',
                    })}
                  </strong>
                </div>
              )}
            </div>

            <div className="text-right">
              <div className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Ditagihkan Kepada:
              </div>
              <div className="font-bold text-slate-900 text-base mt-0.5">
                {data.customer.name}
              </div>
              <div className="font-mono text-xs text-slate-500">
                {data.customer.code}
              </div>
              {data.customer.phone && (
                <div className="text-xs text-slate-500">{data.customer.phone}</div>
              )}
              {data.customer.address && (
                <div className="text-xs text-slate-500 max-w-xs mt-0.5">
                  {data.customer.address}
                </div>
              )}
            </div>
          </div>

          {/* Rincian Barang */}
          <div className="space-y-2">
            <div className="font-bold text-xs uppercase tracking-wider text-slate-700">
              Daftar Barang Pesanan
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
                    <tr key={it.id}>
                      <td className="p-2.5">
                        <div className="font-semibold text-slate-900">
                          {it.productName}
                        </div>
                        <div className="font-mono text-[11px] text-slate-400">
                          {it.sku} &bull; {it.unit}
                        </div>
                      </td>
                      <td className="p-2.5 text-center font-mono">{it.qty}</td>
                      <td className="p-2.5 text-right font-mono">
                        {formatRupiah(it.unitPrice)}
                      </td>
                      <td className="p-2.5 text-right font-mono text-slate-500">
                        {it.lineDiscount > 0 ? `-${formatRupiah(it.lineDiscount)}` : '-'}
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

          {/* Ringkasan Biaya & Rekening Transfer */}
          <div className="border-t border-slate-200 pt-5 flex flex-col sm:flex-row items-stretch sm:items-start justify-between gap-6">
            {/* Rekening Pembayaran */}
            <div className="flex-1 space-y-2">
              <div className="font-bold text-xs uppercase tracking-wider text-slate-700">
                Rekening Pembayaran Resmi Usaha
              </div>
              <div className="space-y-2">
                {data.bankAccounts.map((acc) => (
                  <div
                    key={acc.id}
                    className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                  >
                    <div className="font-bold text-slate-900 font-mono">
                      {acc.bankName} - {acc.accountNumber}
                    </div>
                    <div className="text-slate-600 mt-0.5">
                      a/n {acc.accountHolder} {acc.isDefault && '(Rekening Utama)'}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Total Ringkasan */}
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
                  <span>Tagihan Faktur Ini:</span>
                  <span className="font-mono font-bold text-blue-800 text-sm">
                    {formatRupiah(data.amount)}
                  </span>
                </div>
                <div className="text-[11px] text-blue-700">
                  {data.type === 'DP'
                    ? `Uang Muka (${data.order.dpBps / 100}%)`
                    : 'Pelunasan Akhir'}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Kolom Kanan: Linimasa & Super Admin Inspection (Desktop 4 cols) */}
        <div className="lg:col-span-4 space-y-5">
          {/* Linimasa Status Faktur */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 sm:p-5 space-y-4">
            <h3 className="font-bold text-slate-900 text-sm pb-2 border-b border-slate-100">
              Linimasa Faktur
            </h3>

            <div className="relative border-l-2 border-slate-200 pl-4 space-y-4 text-xs">
              {/* Step 1: Diajukan */}
              <div className="relative">
                <div className="absolute -left-[21px] top-0.5 w-3 h-3 rounded-full bg-blue-600 border-2 border-white" />
                <div className="font-semibold text-slate-900">Faktur Diajukan</div>
                <div className="text-slate-500 text-[11px]">
                  {new Date(data.createdAt).toLocaleDateString('id-ID', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </div>
              </div>

              {/* Step 2: Persetujuan */}
              <div className="relative">
                <div
                  className={`absolute -left-[21px] top-0.5 w-3 h-3 rounded-full border-2 border-white ${
                    isApproved
                      ? 'bg-emerald-600'
                      : isRejected
                      ? 'bg-rose-600'
                      : isVoid
                      ? 'bg-slate-400'
                      : 'bg-amber-500 animate-pulse'
                  }`}
                />
                <div className="font-semibold text-slate-900">
                  {isApproved
                    ? 'Disetujui Pemilik'
                    : isRejected
                    ? 'Ditolak / Revisi'
                    : isVoid
                    ? 'Faktur Dibatalkan'
                    : 'Menunggu Persetujuan'}
                </div>
                {data.approvedAt && (
                  <div className="text-slate-500 text-[11px]">
                    {new Date(data.approvedAt).toLocaleDateString('id-ID', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </div>
                )}
                {data.rejectedAt && (
                  <div className="text-slate-500 text-[11px]">
                    {new Date(data.rejectedAt).toLocaleDateString('id-ID', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </div>
                )}
              </div>

              {/* Step 3: Pembayaran */}
              <div className="relative">
                <div
                  className={`absolute -left-[21px] top-0.5 w-3 h-3 rounded-full border-2 border-white ${
                    data.paidAmount >= data.amount
                      ? 'bg-emerald-600'
                      : 'bg-slate-300'
                  }`}
                />
                <div className="font-semibold text-slate-900">
                  {data.paidAmount >= data.amount
                    ? 'Pembayaran Lunas'
                    : data.paidAmount > 0
                    ? `Terbayar Sebagian (${formatRupiah(data.paidAmount)})`
                    : 'Belum Terbayar'}
                </div>
              </div>
            </div>
          </div>

          {/* Riwayat Pembayaran & Kwitansi Resmi */}
          {data.payments && data.payments.length > 0 && (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 sm:p-5 space-y-3">
              <h3 className="font-bold text-slate-900 text-sm pb-2 border-b border-slate-100">
                Riwayat Pembayaran & Kwitansi
              </h3>
              <div className="space-y-2.5">
                {data.payments.map((p) => (
                  <div
                    key={p.id}
                    className="p-3 rounded-lg bg-slate-50 border border-slate-200 space-y-2 text-xs"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-slate-900">
                        {formatRupiah(p.amount)}
                      </span>
                      <StatusBadge status={p.status} />
                    </div>
                    <div className="text-slate-500 flex flex-wrap items-center gap-2">
                      <span>{p.method}</span>
                      <span>•</span>
                      <span>
                        {new Date(p.paidAt).toLocaleDateString('id-ID', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </span>
                    </div>
                    {p.receiptNo && (
                      <div className="font-mono text-[11px] font-semibold text-emerald-700">
                        {p.receiptNo}
                      </div>
                    )}
                    {p.status === 'VERIFIED' && (
                      <a
                        href={`/api/v1/payments/${p.id}/receipt/pdf`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded bg-indigo-50 border border-indigo-200 text-indigo-700 hover:bg-indigo-100 text-xs font-semibold transition-colors"
                      >
                        <Printer className="w-3.5 h-3.5" />
                        <span>Cetak Kwitansi</span>
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Panel Khusus Super Admin: Profit */}
          {data.profitSimulation && (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 sm:p-5 space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <DollarSign className="w-5 h-5 text-emerald-600" />
                  <h3 className="font-bold text-slate-900 text-sm">
                    Profitabilitas Pesanan
                  </h3>
                </div>
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                  Super Admin
                </span>
              </div>

              <div className="space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-500">Pendapatan Bersih:</span>
                  <span className="font-mono font-semibold text-slate-800">
                    {formatRupiah(data.profitSimulation.revenue)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Estimasi HPP:</span>
                  <span className="font-mono font-semibold text-slate-700">
                    {formatRupiah(data.profitSimulation.cogs)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Biaya Tambahan:</span>
                  <span className="font-mono font-semibold text-slate-700">
                    {formatRupiah(
                      data.profitSimulation.shippingSubsidy +
                        data.profitSimulation.extraCosts
                    )}
                  </span>
                </div>
                <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-lg flex justify-between items-center mt-2">
                  <span className="font-bold text-emerald-900">Estimasi Laba:</span>
                  <span className="font-mono font-bold text-emerald-700 text-sm">
                    {formatRupiah(data.profitSimulation.profit)} (
                    {formatPercentFromBps(data.profitSimulation.marginBps)})
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Catatan Override Pemilik jika ada */}
          {data.overrideNote && (
            <div className="bg-amber-50 rounded-xl border border-amber-200 p-4 space-y-1.5 text-xs">
              <div className="font-bold text-amber-900 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-amber-700" />
                <span>Catatan Override Pemilik Usaha</span>
              </div>
              <p className="italic text-amber-800">&quot;{data.overrideNote}&quot;</p>
            </div>
          )}
        </div>
      </div>

      {/* MODAL BATALKAN FAKTUR (VOID) */}
      {showVoidModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-xl max-w-lg w-full p-6 shadow-2xl space-y-5">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                  <Ban className="w-5 h-5 text-rose-600" />
                  <span>Batalkan Faktur Resmi (Void)</span>
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  Membatalkan faktur yang telah diterbitkan dan melepaskan reservasi stok jika belum ada pembayaran.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowVoidModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1 min-h-[36px] min-w-[36px] flex items-center justify-center"
              >
                &times;
              </button>
            </div>

            {voidError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-800 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{voidError}</span>
              </div>
            )}

            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-800">
                Alasan Pembatalan Faktur (Wajib min 5 karakter) *
              </label>
              <textarea
                value={voidReason}
                onChange={(e) => setVoidReason(e.target.value)}
                placeholder="Tuliskan alasan pembatalan faktur ini..."
                rows={3}
                className="w-full text-xs p-3 border border-slate-200 rounded-lg focus:ring-2 focus:ring-rose-500 focus:outline-none"
              />
              <div className="text-[11px] text-slate-400 text-right">
                {voidReason.trim().length} / 500 karakter
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                disabled={voiding}
                onClick={() => setShowVoidModal(false)}
                className="px-4 py-2 border border-slate-200 text-slate-700 rounded-lg text-xs font-semibold hover:bg-slate-50 min-h-[40px]"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={voiding}
                onClick={handleVoid}
                className="px-5 py-2 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white rounded-lg text-xs font-semibold min-h-[40px] flex items-center gap-1.5 shadow-sm"
              >
                {voiding ? (
                  <>
                    <Clock className="w-4 h-4 animate-spin" />
                    <span>Membatalkan...</span>
                  </>
                ) : (
                  <>
                    <Ban className="w-4 h-4" />
                    <span>Konfirmasi Pembatalan</span>
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
