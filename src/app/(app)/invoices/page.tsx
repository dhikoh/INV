'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  FileText,
  Search,
  RotateCcw,
  Printer,
  Eye,
  ChevronLeft,
  ChevronRight,
  Filter,
  AlertTriangle,
} from 'lucide-react';
import { Skeleton, EmptyState, ErrorState } from '@/components/ui/States';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { formatRupiah } from '@/lib/domain/money';

interface InvoiceListItem {
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
  createdAt: string;
  customer: {
    id: string;
    name: string;
    code: string;
    phone: string | null;
  } | null;
  order: {
    id: string;
    orderNo: string | null;
    status: string;
    grandTotal: number;
    paidTotal: number;
    hasBelowMin: boolean;
    sales: {
      id: string;
      name: string;
    } | null;
  } | null;
}

interface InvoicesResponse {
  items: InvoiceListItem[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export default function InvoicesPage() {
  const [data, setData] = useState<InvoicesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filter & Paginasi
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [typeFilter, setTypeFilter] = useState<string>('ALL');
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchQuery(searchInput);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const fetchInvoices = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams();
      params.set('page', page.toString());
      params.set('limit', '15');
      if (statusFilter !== 'ALL') params.set('status', statusFilter);
      if (typeFilter !== 'ALL') params.set('type', typeFilter);
      if (searchQuery.trim()) params.set('search', searchQuery.trim());

      const res = await fetch(`/api/v1/invoices?${params.toString()}`);
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.message || 'Gagal memuat daftar faktur');
      }

      const json = await res.json();
      setData(json.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Terjadi kesalahan sistem');
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter, typeFilter, searchQuery]);

  useEffect(() => {
    fetchInvoices();
  }, [fetchInvoices]);

  const statusTabs = [
    { label: 'Semua Status', value: 'ALL' },
    { label: 'Menunggu Persetujuan', value: 'PENDING_APPROVAL' },
    { label: 'Disetujui', value: 'APPROVED' },
    { label: 'Ditolak', value: 'REJECTED' },
    { label: 'Dibatalkan (Void)', value: 'VOID' },
  ];

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16">
      {/* Header Halaman */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <FileText className="w-6 h-6 text-blue-600" />
            <span>Faktur Penjualan (Invoices)</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Kelola faktur uang muka (DP) dan pelunasan, pantau status persetujuan, serta cetak PDF resmi.
          </p>
        </div>

        <button
          type="button"
          onClick={() => fetchInvoices()}
          className="p-2 border border-slate-200 rounded-lg hover:bg-slate-100 transition-colors text-slate-600 min-h-[44px] min-w-[44px] flex items-center justify-center"
          title="Segarkan data"
        >
          <RotateCcw className="w-4 h-4" />
        </button>
      </div>

      {/* Filter Tabs & Search */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-3">
        {/* Status Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs font-medium no-scrollbar">
          {statusTabs.map((tab) => (
            <button
              key={tab.value}
              type="button"
              onClick={() => {
                setStatusFilter(tab.value);
                setPage(1);
              }}
              className={`px-3 py-1.5 rounded-lg whitespace-nowrap transition-colors min-h-[36px] ${
                statusFilter === tab.value
                  ? 'bg-blue-600 text-white font-semibold shadow-sm'
                  : 'bg-slate-100 text-slate-600 hover:text-slate-900 hover:bg-slate-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Baris Filter Dropdown & Search Input */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-2 border-t border-slate-100">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-slate-400 shrink-0" />
            <select
              value={typeFilter}
              onChange={(e) => {
                setTypeFilter(e.target.value);
                setPage(1);
              }}
              className="text-xs border border-slate-200 rounded-lg px-2.5 py-2 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[40px]"
            >
              <option value="ALL">Semua Tipe Faktur</option>
              <option value="DP">Uang Muka (DP)</option>
              <option value="FINAL">Pelunasan (FINAL)</option>
            </select>
          </div>

          <div className="relative flex-1 sm:max-w-xs">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Cari no faktur, order, customer..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[40px]"
            />
          </div>
        </div>
      </div>

      {/* Konten Utama */}
      {loading ? (
        <div className="space-y-4">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      ) : error ? (
        <ErrorState
          title="Gagal Memuat Daftar Faktur"
          message={error}
          onRetry={fetchInvoices}
        />
      ) : !data || data.items.length === 0 ? (
        <EmptyState
          title="Tidak Ada Faktur"
          description={
            searchQuery || statusFilter !== 'ALL' || typeFilter !== 'ALL'
              ? 'Tidak ada faktur yang cocok dengan filter yang dipilih.'
              : 'Belum ada faktur yang diajukan atau diterbitkan dalam sistem.'
          }
        />
      ) : (
        <div className="space-y-4">
          {/* Tampilan Desktop: Tabel */}
          <div className="hidden md:block bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-700 font-semibold border-b border-slate-200 uppercase tracking-wider text-[11px]">
                  <tr>
                    <th className="p-3">No. Faktur</th>
                    <th className="p-3">Pesanan</th>
                    <th className="p-3">Pelanggan</th>
                    <th className="p-3">Tipe</th>
                    <th className="p-3 text-right">Nominal Tagihan</th>
                    <th className="p-3 text-center">Status</th>
                    <th className="p-3">Jatuh Tempo</th>
                    <th className="p-3 text-center">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.items.map((inv) => {
                    const isApproved = inv.status === 'APPROVED';
                    return (
                      <tr key={inv.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="p-3 font-mono font-bold text-slate-900">
                          {inv.invoiceNo || (
                            <span className="text-slate-400 italic font-normal">
                              Draf #{inv.id.slice(-6)}
                            </span>
                          )}
                        </td>
                        <td className="p-3">
                          <div className="font-mono text-slate-700">
                            {inv.order?.orderNo || `Order #${inv.order?.id?.slice(-6) ?? '-'}`}
                          </div>
                          {inv.order?.hasBelowMin && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200 mt-0.5">
                              <AlertTriangle className="w-2.5 h-2.5 text-amber-600" />
                              <span>BelowMin</span>
                            </span>
                          )}
                        </td>
                        <td className="p-3">
                          <div className="font-semibold text-slate-900">
                            {inv.customer?.name || '-'}
                          </div>
                          <div className="text-[11px] text-slate-400 font-mono">
                            {inv.customer?.code}
                          </div>
                        </td>
                        <td className="p-3">
                          <span className="font-semibold px-2 py-0.5 rounded text-[11px] bg-slate-100 text-slate-800">
                            {inv.type === 'DP' ? 'Uang Muka (DP)' : 'Pelunasan'} v{inv.version}
                          </span>
                        </td>
                        <td className="p-3 text-right font-mono font-bold text-slate-900">
                          {formatRupiah(inv.amount)}
                        </td>
                        <td className="p-3 text-center">
                          <StatusBadge status={inv.status} />
                        </td>
                        <td className="p-3 text-slate-600">
                          {inv.dueDate ? (
                            new Date(inv.dueDate).toLocaleDateString('id-ID', {
                              day: 'numeric',
                              month: 'short',
                              year: 'numeric',
                            })
                          ) : (
                            <span className="text-slate-400">-</span>
                          )}
                        </td>
                        <td className="p-3 text-center">
                          <div className="flex items-center justify-center gap-2">
                            <Link
                              href={`/invoices/${inv.id}`}
                              className="p-1.5 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded transition-colors"
                              title="Lihat Detail Faktur"
                            >
                              <Eye className="w-4 h-4" />
                            </Link>

                            {isApproved ? (
                              <a
                                href={`/api/v1/invoices/${inv.id}/pdf`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded transition-colors"
                                title="Cetak PDF Resmi"
                              >
                                <Printer className="w-4 h-4 text-emerald-600" />
                              </a>
                            ) : (
                              <span
                                className="p-1.5 text-slate-300 cursor-not-allowed"
                                title="Tombol cetak nonaktif sampai faktur disetujui pemilik"
                              >
                                <Printer className="w-4 h-4" />
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Tampilan Mobile: Kartu Responsif (360px support) */}
          <div className="md:hidden space-y-3">
            {data.items.map((inv) => {
              const isApproved = inv.status === 'APPROVED';
              return (
                <div
                  key={inv.id}
                  className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm space-y-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-mono font-bold text-slate-900 text-sm">
                        {inv.invoiceNo || `Draf #${inv.id.slice(-6)}`}
                      </div>
                      <div className="text-xs text-slate-500 font-mono mt-0.5">
                        {inv.order?.orderNo || `Order #${inv.order?.id?.slice(-6) ?? '-'}`}
                      </div>
                    </div>
                    <StatusBadge status={inv.status} />
                  </div>

                  <div className="text-xs space-y-1 pt-1 border-t border-slate-100">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Pelanggan:</span>
                      <span className="font-semibold text-slate-900">
                        {inv.customer?.name} ({inv.customer?.code})
                      </span>
                    </div>

                    <div className="flex justify-between">
                      <span className="text-slate-500">Tipe:</span>
                      <span className="font-medium text-slate-700">
                        {inv.type === 'DP' ? 'Uang Muka (DP)' : 'Pelunasan'} v{inv.version}
                      </span>
                    </div>

                    <div className="flex justify-between">
                      <span className="text-slate-500">Tagihan:</span>
                      <span className="font-mono font-bold text-blue-700 text-sm">
                        {formatRupiah(inv.amount)}
                      </span>
                    </div>

                    {inv.dueDate && (
                      <div className="flex justify-between">
                        <span className="text-slate-500">Jatuh Tempo:</span>
                        <span className="text-slate-700 font-mono">
                          {new Date(inv.dueDate).toLocaleDateString('id-ID', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                          })}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Tombol Aksi Mobile */}
                  <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
                    <Link
                      href={`/invoices/${inv.id}`}
                      className="flex-1 py-2 px-3 border border-slate-200 text-slate-700 rounded-lg text-xs font-semibold hover:bg-slate-50 min-h-[40px] flex items-center justify-center gap-1.5"
                    >
                      <Eye className="w-4 h-4" />
                      <span>Detail</span>
                    </Link>

                    {isApproved ? (
                      <a
                        href={`/api/v1/invoices/${inv.id}/pdf`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 py-2 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold min-h-[40px] flex items-center justify-center gap-1.5 shadow-sm"
                      >
                        <Printer className="w-4 h-4" />
                        <span>Cetak PDF</span>
                      </a>
                    ) : (
                      <button
                        type="button"
                        disabled
                        className="flex-1 py-2 px-3 bg-slate-100 text-slate-400 rounded-lg text-xs font-semibold min-h-[40px] flex items-center justify-center gap-1.5 cursor-not-allowed"
                        title="Menunggu persetujuan pemilik"
                      >
                        <Printer className="w-4 h-4" />
                        <span>Cetak (Kunci)</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Paginasi */}
          {data.pagination.totalPages > 1 && (
            <div className="flex items-center justify-between p-4 bg-white rounded-xl border border-slate-200 text-xs">
              <span className="text-slate-500">
                Halaman {data.pagination.page} dari {data.pagination.totalPages} ({data.pagination.total} total faktur)
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
