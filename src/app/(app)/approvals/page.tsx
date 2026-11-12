'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  CheckCircle2,
  AlertTriangle,
  Search,
  RotateCcw,
  Clock,
  ArrowRight,
  TrendingUp,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { Skeleton, EmptyState, ErrorState } from '@/components/ui/States';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { formatRupiah, formatPercentFromBps } from '@/lib/domain/money';

interface ApprovalItem {
  id: string;
  orderNo: string | null;
  orderDate: string;
  status: string;
  version: number;
  rev: number;
  customerSeq: number | null;
  grandTotal: number;
  dpBps: number;
  dpAmount: number;
  hasBelowMin: boolean;
  belowMinReason: string | null;
  customer?: {
    id: string;
    code: string;
    name: string;
    phone: string | null;
    address: string | null;
  };
  sales?: {
    id: string;
    name: string;
    username: string;
  } | null;
  pendingInvoice?: {
    id: string;
    type: 'DP' | 'FINAL';
    status: string;
    version: number;
    amount: number;
    requestedAt: string;
    requestedById: string;
  } | null;
  profit?: {
    netProfit: number;
    marginBps: number;
  };
  items?: Array<{
    id: string;
    productName: string;
    sku: string;
    qty: number;
    unitPrice: number;
    lineNet: number;
    belowMin: boolean;
  }>;
}

interface ApprovalRevisionItem {
  id: string;
  orderId: string;
  orderNo: string | null;
  revisionNo: number;
  status: string;
  reason: string;
  oldGrandTotal: number;
  newGrandTotal: number;
  deltaGrandTotal: number;
  hasBelowMin: boolean;
  belowMinReason: string | null;
  requestedAt: string;
  customer?: {
    id: string;
    code: string;
    name: string;
  };
  sales?: {
    id: string;
    name: string;
    username: string;
  } | null;
}

interface ApprovalsResponse {
  items: ApprovalItem[];
  revisions?: ApprovalRevisionItem[];
  summary: {
    totalPending: number;
    totalBelowMin: number;
    totalPendingRevisions?: number;
  };
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export default function ApprovalsPage() {
  const [data, setData] = useState<ApprovalsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filter & Paginasi
  const [page, setPage] = useState(1);
  const [hasBelowMin, setHasBelowMin] = useState<string>('all'); // 'all' | 'true' | 'false'
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchQuery(searchInput);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const fetchApprovals = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams();
      params.set('page', page.toString());
      params.set('limit', '15');
      if (hasBelowMin === 'true') params.set('hasBelowMin', 'true');
      if (hasBelowMin === 'false') params.set('hasBelowMin', 'false');
      if (searchQuery) params.set('search', searchQuery);

      const res = await fetch(`/api/v1/approvals?${params.toString()}`);
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.message || 'Gagal memuat antrean persetujuan');
      }

      const json = await res.json();
      setData(json.data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Terjadi kesalahan sistem');
    } finally {
      setLoading(false);
    }
  }, [page, hasBelowMin, searchQuery]);

  useEffect(() => {
    fetchApprovals();
  }, [fetchApprovals]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Header Halaman */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <CheckCircle2 className="w-6 h-6 text-blue-600" />
            <span>Antrean Persetujuan Pesanan</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Daftar pesanan penjualan dan faktur yang diajukan oleh staf sales untuk diverifikasi oleh Super Admin.
          </p>
        </div>

        <button
          type="button"
          onClick={() => fetchApprovals()}
          className="p-2 border border-slate-200 rounded-lg hover:bg-slate-100 transition-colors text-slate-600 min-h-[44px] min-w-[44px] flex items-center justify-center"
          title="Segarkan data"
        >
          <RotateCcw className="w-4 h-4" />
        </button>
      </div>

      {/* Ringkasan Metrik */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Total Menunggu Persetujuan
            </div>
            <div className="text-2xl font-bold font-mono text-slate-900 mt-1">
              {data?.summary.totalPending ?? 0}
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">
              Pesanan siap ditinjau dan diterbitkan fakturnya
            </div>
          </div>
          <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
            <Clock className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Pesanan Di Bawah Minimal (BelowMin)
            </div>
            <div className="text-2xl font-bold font-mono text-amber-700 mt-1">
              {data?.summary.totalBelowMin ?? 0}
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">
              Membutuhkan override persetujuan harga khusus
            </div>
          </div>
          <div className="w-12 h-12 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Filter & Pencarian */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-3">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          {/* Tabs Filter */}
          <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-lg text-xs font-medium">
            <button
              type="button"
              onClick={() => {
                setHasBelowMin('all');
                setPage(1);
              }}
              className={`px-3 py-1.5 rounded-md transition-colors ${
                hasBelowMin === 'all'
                  ? 'bg-white text-slate-900 shadow-sm font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Semua Antrean ({data?.summary.totalPending ?? 0})
            </button>
            <button
              type="button"
              onClick={() => {
                setHasBelowMin('true');
                setPage(1);
              }}
              className={`px-3 py-1.5 rounded-md transition-colors flex items-center gap-1.5 ${
                hasBelowMin === 'true'
                  ? 'bg-amber-100 text-amber-900 shadow-sm font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
              <span>Di Bawah Minimal ({data?.summary.totalBelowMin ?? 0})</span>
            </button>
          </div>

          {/* Search Box */}
          <div className="relative flex-1 sm:max-w-xs">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Cari nomor order / customer..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
      </div>

      {/* Konten Utama */}
      {loading ? (
        <div className="space-y-4">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
        </div>
      ) : error ? (
        <ErrorState
          title="Gagal Memuat Antrean"
          message={error}
          onRetry={fetchApprovals}
        />
      ) : !data || (data.items.length === 0 && (!data.revisions || data.revisions.length === 0)) ? (
        <EmptyState
          title="Tidak Ada Antrean Persetujuan"
          description={
            searchQuery || hasBelowMin !== 'all'
              ? 'Tidak ada pesanan yang cocok dengan kriteria filter saat ini.'
              : 'Semua pesanan yang diajukan telah diproses. Belum ada draf baru yang membutuhkan persetujuan.'
          }
        />
      ) : (
        <div className="space-y-4">
          {/* Antrean Revisi Pesanan Berjalan (Fase 3) */}
          {data.revisions && data.revisions.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-sm font-bold uppercase tracking-wider text-indigo-800 flex items-center gap-2">
                <span>Pengajuan Revisi Pesanan ({data.revisions.length})</span>
              </h2>
              {data.revisions.map((revItem) => (
                <div
                  key={revItem.id}
                  className="bg-indigo-50/40 rounded-xl border border-indigo-200 p-4 sm:p-5 shadow-sm space-y-3"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs font-bold bg-indigo-100 text-indigo-900 px-2 py-0.5 rounded">
                          {revItem.orderNo || `ORD #${revItem.orderId.slice(-6)}`} • Revisi #{revItem.revisionNo}
                        </span>
                        <StatusBadge status={revItem.status} />
                        {revItem.hasBelowMin && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
                            <AlertTriangle className="w-3 h-3 text-amber-600" />
                            <span>Di Bawah Floor</span>
                          </span>
                        )}
                      </div>
                      <h3 className="font-bold text-slate-900 text-base mt-1.5">
                        {revItem.customer?.name} ({revItem.customer?.code})
                      </h3>
                      <p className="text-xs text-slate-600 mt-0.5">
                        Diajukan oleh <strong>{revItem.sales?.name || 'Sales'}</strong> • Alasan: {revItem.reason}
                      </p>
                    </div>
                    <Link
                      href={`/orders/${revItem.orderId}`}
                      className="min-h-[44px] px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-semibold flex items-center gap-1.5 shadow-sm transition-colors shrink-0"
                    >
                      <span>Tinjau & Putuskan Revisi</span>
                      <ArrowRight className="w-4 h-4" />
                    </Link>
                  </div>
                  <div className="grid grid-cols-3 gap-3 pt-2 border-t border-indigo-100 text-xs">
                    <div>
                      <div className="text-slate-500">Total Lama</div>
                      <div className="font-mono font-semibold text-slate-800">{formatRupiah(revItem.oldGrandTotal)}</div>
                    </div>
                    <div>
                      <div className="text-slate-500">Total Baru</div>
                      <div className="font-mono font-bold text-indigo-700">{formatRupiah(revItem.newGrandTotal)}</div>
                    </div>
                    <div>
                      <div className="text-slate-500">Selisih</div>
                      <div className={`font-mono font-bold ${revItem.deltaGrandTotal >= 0 ? 'text-emerald-700' : 'text-amber-700'}`}>
                        {revItem.deltaGrandTotal >= 0 ? '+' : ''}
                        {formatRupiah(revItem.deltaGrandTotal)}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {data.items.map((item) => {
            const hasBelowMin = item.hasBelowMin;
            return (
              <div
                key={item.id}
                className={`bg-white rounded-xl border p-4 sm:p-5 shadow-sm transition-all hover:shadow-md space-y-3 ${
                  hasBelowMin ? 'border-amber-300 bg-amber-50/10' : 'border-slate-200'
                }`}
              >
                {/* Baris Atas: Order & Customer */}
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold bg-slate-100 text-slate-800 px-2 py-0.5 rounded">
                        {item.orderNo || `DRAF #${item.id.slice(-6)}`}
                      </span>
                      <StatusBadge status={item.status} />
                      {hasBelowMin && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
                          <AlertTriangle className="w-3 h-3 text-amber-600" />
                          <span>Di Bawah Floor</span>
                        </span>
                      )}
                    </div>
                    <h3 className="font-bold text-slate-900 text-base mt-1.5">
                      {item.customer?.name} ({item.customer?.code})
                    </h3>
                    <div className="text-xs text-slate-500 flex flex-wrap items-center gap-2 mt-0.5">
                      <span>
                        Diajukan oleh: <strong>{item.sales?.name || 'Sales'}</strong>
                      </span>
                      <span>&bull;</span>
                      <span>
                        Tanggal:{' '}
                        {new Date(item.orderDate).toLocaleDateString('id-ID', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </span>
                    </div>
                  </div>

                  {/* Tombol Tinjau Detail */}
                  <Link
                    href={
                      item.pendingInvoice
                        ? `/approvals/${item.pendingInvoice.id}`
                        : `/orders/${item.id}`
                    }
                    className="min-h-[44px] px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold flex items-center gap-1.5 shadow-sm transition-colors shrink-0"
                  >
                    <span>
                      {item.pendingInvoice ? 'Tinjau Persetujuan' : 'Tinjau Pesanan'}
                    </span>
                    <ArrowRight className="w-4 h-4" />
                  </Link>
                </div>

                {/* Banner Alasan BelowMin jika ada */}
                {hasBelowMin && (
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900 space-y-1">
                    <div className="font-semibold flex items-center gap-1 text-amber-800">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                      <span>Alasan Penjualan di Bawah Harga Minimal:</span>
                    </div>
                    <p className="italic">
                      &quot;{item.belowMinReason || 'Tidak ada alasan yang dicantumkan'}&quot;
                    </p>
                  </div>
                )}

                {/* Grid Info Keuangan & Invoice */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3 border-t border-slate-100 text-xs">
                  {/* Total Pesanan */}
                  <div>
                    <div className="text-slate-400 font-medium">Grand Total Order</div>
                    <div className="font-mono font-bold text-slate-900 text-sm mt-0.5">
                      {formatRupiah(item.grandTotal)}
                    </div>
                  </div>

                  {/* Invoice Ditagihkan */}
                  <div>
                    <div className="text-slate-400 font-medium">Faktur Diajukan</div>
                    <div className="font-mono font-bold text-blue-700 text-sm mt-0.5">
                      {item.pendingInvoice ? (
                        <>
                          <span>{formatRupiah(item.pendingInvoice.amount)}</span>{' '}
                          <span className="text-[11px] font-normal text-slate-500">
                            ({item.pendingInvoice.type} v{item.pendingInvoice.version})
                          </span>
                        </>
                      ) : (
                        '-'
                      )}
                    </div>
                  </div>

                  {/* Uang Muka (DP) */}
                  <div>
                    <div className="text-slate-400 font-medium">Uang Muka (DP)</div>
                    <div className="font-mono text-slate-700 text-sm mt-0.5">
                      {item.dpAmount > 0 ? (
                        <>
                          <span>{formatRupiah(item.dpAmount)}</span>{' '}
                          <span className="text-[11px] text-slate-400">
                            ({item.dpBps / 100}%)
                          </span>
                        </>
                      ) : (
                        <span className="text-slate-400">Tanpa DP (Lunas)</span>
                      )}
                    </div>
                  </div>

                  {/* Simulasi Profit Super Admin */}
                  <div>
                    <div className="text-slate-400 font-medium flex items-center gap-1">
                      <TrendingUp className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Estimasi Laba Bersih</span>
                    </div>
                    <div
                      className={`font-mono font-bold text-sm mt-0.5 ${
                        (item.profit?.netProfit ?? 0) >= 0
                          ? 'text-emerald-700'
                          : 'text-red-600'
                      }`}
                    >
                      {formatRupiah(item.profit?.netProfit ?? 0)}{' '}
                      <span className="text-[11px] font-normal text-slate-500">
                        ({formatPercentFromBps(item.profit?.marginBps ?? 0)})
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}

          {/* Paginasi */}
          {data.pagination.totalPages > 1 && (
            <div className="flex items-center justify-between p-4 bg-white rounded-xl border border-slate-200 text-xs">
              <span className="text-slate-500">
                Halaman {data.pagination.page} dari {data.pagination.totalPages} ({data.pagination.total} total antrean)
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="px-3 py-1.5 border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50 min-h-[36px] flex items-center gap-1"
                >
                  <ChevronLeft className="w-4 h-4" />
                  <span>Sebelumnya</span>
                </button>
                <button
                  type="button"
                  disabled={page >= data.pagination.totalPages}
                  onClick={() => setPage((p) => p + 1)}
                  className="px-3 py-1.5 border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50 min-h-[36px] flex items-center gap-1"
                >
                  <span>Selanjutnya</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
