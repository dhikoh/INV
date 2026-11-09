'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  Receipt,
  AlertTriangle,
  Clock,
  Search,
  RefreshCw,
  ExternalLink,
  MessageCircle,
  FileText,
  FileSpreadsheet,
  Loader2,
  CheckCircle2,
} from 'lucide-react';
import { AgingBucket } from '@/lib/domain/receivable';

interface CustomerInfo {
  id: string;
  code: string;
  name: string;
  phone: string | null;
}

interface SalesInfo {
  id: string;
  name: string;
}

interface ReceivableItem {
  id: string;
  invoiceNumber: string;
  type: string;
  amount: number;
  paidAmount: number;
  remainingAmount: number;
  issueDate: string | null;
  dueDate: string | null;
  orderId: string;
  orderNo: string | null;
  customer: CustomerInfo;
  sales: SalesInfo;
  daysOverdue: number;
  remainingDays: number;
  isOverdue: boolean;
  agingBucket: AgingBucket;
  agingLabel: string;
}

interface BucketSummary {
  CURRENT: number;
  DAYS_1_7: number;
  DAYS_8_30: number;
  DAYS_31_60: number;
  DAYS_OVER_60: number;
}

interface ReceivablesMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  totalOutstanding: number;
  totalOverdue: number;
  overdueCount: number;
  bucketSummary: BucketSummary;
}

export default function ReceivablesPage() {
  const [items, setItems] = useState<ReceivableItem[]>([]);
  const [meta, setMeta] = useState<ReceivablesMeta>({
    total: 0,
    page: 1,
    limit: 50,
    totalPages: 1,
    totalOutstanding: 0,
    totalOverdue: 0,
    overdueCount: 0,
    bucketSummary: {
      CURRENT: 0,
      DAYS_1_7: 0,
      DAYS_8_30: 0,
      DAYS_31_60: 0,
      DAYS_OVER_60: 0,
    },
  });
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<'all' | 'overdue' | 'current'>('all');
  const [bucketFilter, setBucketFilter] = useState<AgingBucket | 'ALL'>('ALL');
  const [search, setSearch] = useState('');

  const fetchReceivables = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== 'all') {
        params.set('status', statusFilter);
      }
      if (bucketFilter !== 'ALL') {
        params.set('bucket', bucketFilter);
      }
      if (search.trim()) {
        params.set('search', search.trim());
      }

      const res = await fetch(`/api/v1/receivables?${params.toString()}`);
      const json = await res.json();
      if (json.ok && Array.isArray(json.data)) {
        setItems(json.data);
        if (json.meta) {
          setMeta(json.meta);
        }
      }
    } catch {
      // Tangani error jaringan
    } finally {
      setLoading(false);
    }
  }, [statusFilter, bucketFilter, search]);

  useEffect(() => {
    fetchReceivables();
  }, [fetchReceivables]);

  const formatRupiah = (val: number) =>
    `Rp ${Number(val ?? 0).toLocaleString('id-ID')}`;

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
            <Receipt className="h-6 w-6 text-indigo-600" />
            Piutang Usaha & Umur Piutang
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Pantau saldo tagihan pelanggan yang belum lunas dan kendalikan risiko piutang macet.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={fetchReceivables}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Segarkan
          </button>
          <a
            href="/api/v1/reports/export?type=receivables-aging&format=xlsx"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-emerald-700 transition"
            title="Ekspor Laporan Umur Piutang ke Excel (XLSX)"
          >
            <FileSpreadsheet className="h-4 w-4" />
            Excel
          </a>
          <a
            href="/api/v1/reports/export?type=receivables-aging&format=pdf"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg bg-slate-800 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-slate-900 transition"
            title="Ekspor Laporan Umur Piutang ke PDF"
          >
            <FileText className="h-4 w-4" />
            PDF
          </a>
        </div>
      </div>

      {/* Metrik Ringkasan Utama */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Total Piutang Belum Lunas
          </div>
          <div className="text-2xl font-bold text-slate-900 mt-1">
            {formatRupiah(meta.totalOutstanding)}
          </div>
          <div className="text-xs text-slate-500 mt-1">
            {meta.total} faktur belum lunas
          </div>
        </div>

        <div className="rounded-xl border border-rose-200 bg-rose-50/40 p-4 shadow-sm">
          <div className="text-xs font-semibold text-rose-700 uppercase tracking-wider flex items-center gap-1.5">
            <AlertTriangle className="h-4 w-4 text-rose-600" />
            Total Piutang Terlambat
          </div>
          <div className="text-2xl font-bold text-rose-600 mt-1">
            {formatRupiah(meta.totalOverdue)}
          </div>
          <div className="text-xs text-rose-600/80 mt-1">
            {meta.overdueCount} faktur melewati jatuh tempo
          </div>
        </div>

        <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-4 shadow-sm">
          <div className="text-xs font-semibold text-emerald-700 uppercase tracking-wider flex items-center gap-1.5">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            Belum Jatuh Tempo (Lancar)
          </div>
          <div className="text-2xl font-bold text-emerald-700 mt-1">
            {formatRupiah(meta.bucketSummary.CURRENT)}
          </div>
          <div className="text-xs text-emerald-600/80 mt-1">
            Faktur jatuh tempo di masa depan
          </div>
        </div>
      </div>

      {/* Kartu Umur Piutang (Aging Buckets) */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
          Distribusi Umur Piutang (Aging Buckets - Seksi 13.3)
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <button
            type="button"
            onClick={() => setBucketFilter(bucketFilter === 'CURRENT' ? 'ALL' : 'CURRENT')}
            className={`rounded-lg border p-3 text-left transition-all ${
              bucketFilter === 'CURRENT'
                ? 'border-emerald-500 bg-emerald-50 ring-2 ring-emerald-500'
                : 'border-slate-200 bg-slate-50/50 hover:bg-slate-50'
            }`}
          >
            <div className="text-[11px] font-medium text-slate-500">Belum Jatuh Tempo</div>
            <div className="text-sm font-bold text-emerald-700 mt-1">
              {formatRupiah(meta.bucketSummary.CURRENT)}
            </div>
          </button>

          <button
            type="button"
            onClick={() => setBucketFilter(bucketFilter === 'DAYS_1_7' ? 'ALL' : 'DAYS_1_7')}
            className={`rounded-lg border p-3 text-left transition-all ${
              bucketFilter === 'DAYS_1_7'
                ? 'border-amber-500 bg-amber-50 ring-2 ring-amber-500'
                : 'border-slate-200 bg-slate-50/50 hover:bg-slate-50'
            }`}
          >
            <div className="text-[11px] font-medium text-slate-500">1–7 Hari</div>
            <div className="text-sm font-bold text-amber-700 mt-1">
              {formatRupiah(meta.bucketSummary.DAYS_1_7)}
            </div>
          </button>

          <button
            type="button"
            onClick={() => setBucketFilter(bucketFilter === 'DAYS_8_30' ? 'ALL' : 'DAYS_8_30')}
            className={`rounded-lg border p-3 text-left transition-all ${
              bucketFilter === 'DAYS_8_30'
                ? 'border-orange-500 bg-orange-50 ring-2 ring-orange-500'
                : 'border-slate-200 bg-slate-50/50 hover:bg-slate-50'
            }`}
          >
            <div className="text-[11px] font-medium text-slate-500">8–30 Hari</div>
            <div className="text-sm font-bold text-orange-700 mt-1">
              {formatRupiah(meta.bucketSummary.DAYS_8_30)}
            </div>
          </button>

          <button
            type="button"
            onClick={() => setBucketFilter(bucketFilter === 'DAYS_31_60' ? 'ALL' : 'DAYS_31_60')}
            className={`rounded-lg border p-3 text-left transition-all ${
              bucketFilter === 'DAYS_31_60'
                ? 'border-rose-500 bg-rose-50 ring-2 ring-rose-500'
                : 'border-slate-200 bg-slate-50/50 hover:bg-slate-50'
            }`}
          >
            <div className="text-[11px] font-medium text-slate-500">31–60 Hari</div>
            <div className="text-sm font-bold text-rose-700 mt-1">
              {formatRupiah(meta.bucketSummary.DAYS_31_60)}
            </div>
          </button>

          <button
            type="button"
            onClick={() => setBucketFilter(bucketFilter === 'DAYS_OVER_60' ? 'ALL' : 'DAYS_OVER_60')}
            className={`rounded-lg border p-3 text-left transition-all col-span-2 sm:col-span-1 ${
              bucketFilter === 'DAYS_OVER_60'
                ? 'border-purple-500 bg-purple-50 ring-2 ring-purple-500'
                : 'border-slate-200 bg-slate-50/50 hover:bg-slate-50'
            }`}
          >
            <div className="text-[11px] font-medium text-slate-500">&gt; 60 Hari</div>
            <div className="text-sm font-bold text-purple-700 mt-1">
              {formatRupiah(meta.bucketSummary.DAYS_OVER_60)}
            </div>
          </button>
        </div>
      </div>

      {/* Filter & Pencarian */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
          <button
            type="button"
            onClick={() => setStatusFilter('all')}
            className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold whitespace-nowrap transition-colors ${
              statusFilter === 'all'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            Semua ({meta.total})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('overdue')}
            className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold whitespace-nowrap transition-colors ${
              statusFilter === 'overdue'
                ? 'bg-rose-600 text-white shadow-sm'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            Terlambat ({meta.overdueCount})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('current')}
            className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold whitespace-nowrap transition-colors ${
              statusFilter === 'current'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            Lancar
          </button>
        </div>

        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Cari no invoice / pelanggan..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 py-1.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>
      </div>

      {/* Konten Daftar Piutang */}
      {loading ? (
        <div className="flex flex-col items-center justify-center p-12 text-slate-400">
          <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
          <span className="mt-3 text-sm">Memuat data piutang usaha...</span>
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 p-12 text-center bg-white">
          <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-500" />
          <h3 className="mt-3 text-sm font-semibold text-slate-900">
            Tidak ada piutang outstanding
          </h3>
          <p className="mt-1 text-xs text-slate-500 max-w-sm mx-auto">
            Semua faktur penjualan yang disetujui telah dilunasi dengan baik.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {items.map((item) => {
            const cleanPhone = item.customer.phone
              ? item.customer.phone.replace(/[^0-9]/g, '')
              : null;
            const waNumber =
              cleanPhone && cleanPhone.startsWith('0')
                ? `62${cleanPhone.slice(1)}`
                : cleanPhone;

            return (
              <div
                key={item.id}
                className={`rounded-xl border bg-white p-4 sm:p-5 shadow-sm transition-all hover:border-slate-300 ${
                  item.isOverdue
                    ? 'border-rose-200 bg-rose-50/20'
                    : 'border-slate-200'
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/invoices/${item.id}`}
                        className="text-base font-bold text-slate-900 hover:text-indigo-600 transition-colors flex items-center gap-1"
                      >
                        Faktur #{item.invoiceNumber}
                        <ExternalLink className="h-3.5 w-3.5 text-slate-400" />
                      </Link>
                      <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-mono text-slate-600">
                        {item.type}
                      </span>
                      {item.orderNo && (
                        <span className="text-xs text-slate-500">
                          Order: <strong>{item.orderNo}</strong>
                        </span>
                      )}
                    </div>

                    <div className="text-sm font-semibold text-slate-800">
                      <Link
                        href={`/customers/${item.customer.id}`}
                        className="hover:underline"
                      >
                        {item.customer.name}
                      </Link>
                      <span className="text-xs text-slate-500 font-normal ml-1.5">
                        ({item.customer.code})
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 pt-1">
                      <div>
                        Jatuh Tempo:{' '}
                        <strong>
                          {item.dueDate
                            ? new Date(item.dueDate).toLocaleDateString('id-ID')
                            : '-'}
                        </strong>
                      </div>
                      <div>
                        Sales: <strong>{item.sales?.name || '-'}</strong>
                      </div>
                    </div>
                  </div>

                  {/* Nilai Finansial & Aging Badge */}
                  <div className="flex flex-col sm:items-end justify-between gap-3">
                    <div className="flex flex-wrap sm:flex-col items-baseline sm:items-end gap-1">
                      <div className="text-xs text-slate-500">Sisa Tagihan:</div>
                      <div className="text-lg font-bold text-slate-900">
                        {formatRupiah(item.remainingAmount)}
                      </div>
                      <div className="text-[11px] text-slate-400">
                        Total {formatRupiah(item.amount)} (Terbayar {formatRupiah(item.paidAmount)})
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {item.isOverdue ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2.5 py-1 text-xs font-bold text-rose-700">
                          <AlertTriangle className="h-3.5 w-3.5" />
                          Terlambat {item.daysOverdue} hari ({item.agingLabel})
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                          <Clock className="h-3.5 w-3.5" />
                          Lancar ({item.remainingDays} hari lagi)
                        </span>
                      )}

                      {waNumber && (
                        <a
                          href={`https://wa.me/${waNumber}?text=Halo%20${encodeURIComponent(
                            item.customer.name
                          )},%20kami%20dari%20tim%20keuangan%20mengingatkan%20faktur%20${encodeURIComponent(
                            item.invoiceNumber
                          )}%20dengan%20sisa%20tagihan%20${encodeURIComponent(
                            formatRupiah(item.remainingAmount)
                          )}%20telah%20jatuh%20tempo.%20Terima%20kasih.`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700"
                        >
                          <MessageCircle className="h-3.5 w-3.5" />
                          Tagih WA
                        </a>
                      )}

                      <Link
                        href={`/invoices/${item.id}`}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50"
                      >
                        <FileText className="h-3.5 w-3.5" />
                        Detail Faktur
                      </Link>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
