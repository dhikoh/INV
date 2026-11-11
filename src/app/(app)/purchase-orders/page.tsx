'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import {
  Package,
  Plus,
  Search,
  Filter,
  Eye,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { Skeleton, EmptyState, ErrorState } from '@/components/ui/States';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { SortableHeader } from '@/components/ui/SortableHeader';
import { formatRupiah } from '@/lib/domain/money';

interface PoListItem {
  id: string;
  poNo: string | null;
  status: string;
  orderDate: string;
  expectedDate: string | null;
  vendorId: string;
  vendor?: {
    id: string;
    code: string;
    name: string;
  };
  subtotal: number;
  shippingCost: number;
  otherCost: number;
  total: number;
  paidTotal: number;
  items?: Array<{
    id: string;
    qty: number;
    receivedQty: number;
    unitCost: number;
    lineTotal: number;
  }>;
}

const PO_STATUS_OPTIONS = [
  { value: '', label: 'Semua Status' },
  { value: 'DRAFT', label: 'Draf' },
  { value: 'ORDERED', label: 'Dipesan' },
  { value: 'PARTIAL_RECEIVED', label: 'Diterima Sebagian' },
  { value: 'RECEIVED', label: 'Diterima Penuh' },
  { value: 'CANCELLED', label: 'Dibatalkan' },
];

export default function PurchaseOrdersPage() {
  const [orders, setOrders] = useState<PoListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Pagination & Filter
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');
  const [selectedVendorId, setSelectedVendorId] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  // Sorting
  const [sortBy, setSortBy] = useState('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  const handleSort = (field: string) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      const defaultAsc = ['vendor', 'number'].includes(field);
      setSortOrder(defaultAsc ? 'asc' : 'desc');
    }
    setPage(1);
  };

  const [vendorOptions, setVendorOptions] = useState<Array<{ id: string; name: string; code: string }>>([]);

  // Debounce search 300 ms
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const handleSearchChange = (val: string) => {
    setSearchTerm(val);
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(() => {
      setDebouncedSearch(val);
      setPage(1);
    }, 300);
  };

  // Muat opsi vendor
  useEffect(() => {
    async function loadVendors() {
      try {
        const res = await fetch('/api/v1/vendors?limit=100');
        if (res.ok) {
          const json = await res.json();
          const vList = Array.isArray(json.data)
            ? json.data
            : json.data?.items || [];
          setVendorOptions(vList);
        }
      } catch {
        // Abaikan
      }
    }
    loadVendors();
  }, []);

  const fetchOrders = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams();
      params.set('page', page.toString());
      params.set('limit', '20');

      if (debouncedSearch.trim()) params.set('q', debouncedSearch.trim());
      if (selectedStatus) params.set('status', selectedStatus);
      if (selectedVendorId) params.set('vendorId', selectedVendorId);
      if (fromDate) params.set('from', fromDate);
      if (toDate) params.set('to', toDate);
      params.set('sortBy', sortBy);
      params.set('sortOrder', sortOrder);

      const res = await fetch(`/api/v1/purchase-orders?${params.toString()}`);
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error?.message || 'Gagal memuat daftar Purchase Order');
      }

      const json = await res.json();
      setOrders(json.data.items || []);
      setTotalPages(json.data.totalPages || 1);
      setTotalCount(json.data.total || 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Terjadi kesalahan sistem');
    } finally {
      setLoading(false);
    }
  }, [page, debouncedSearch, selectedStatus, selectedVendorId, fromDate, toDate, sortBy, sortOrder]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  const handleResetFilters = () => {
    setSearchTerm('');
    setDebouncedSearch('');
    setSelectedStatus('');
    setSelectedVendorId('');
    setFromDate('');
    setToDate('');
    setSortBy('date');
    setSortOrder('desc');
    setPage(1);
  };

  const hasActiveFilters = Boolean(
    debouncedSearch || selectedStatus || selectedVendorId || fromDate || toDate || sortBy !== 'date' || sortOrder !== 'desc'
  );

  return (
    <div className="w-full max-w-7xl mx-auto px-4 py-6 md:py-8 space-y-6">
      {/* Header Halaman */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Package className="w-7 h-7 text-indigo-600" />
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
              Pesanan Pembelian (PO)
            </h1>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Kelola pengadaan barang ke vendor, penerimaan stok gudang, dan pembayaran vendor.
          </p>
        </div>

        <Link
          href="/purchase-orders/new"
          className="inline-flex items-center justify-center gap-2 min-h-[44px] px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-medium rounded-lg shadow-sm transition-colors text-sm w-full sm:w-auto"
        >
          <Plus className="w-4 h-4" />
          <span>Buat PO Baru</span>
        </Link>
      </div>

      {/* Bar Filter & Pencarian */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {/* Pencarian */}
          <div className="relative sm:col-span-2 lg:col-span-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="Cari nomor PO / vendor..."
              className="w-full min-h-[44px] pl-9 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-base md:text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
            />
          </div>

          {/* Status */}
          <div>
            <select
              value={selectedStatus}
              onChange={(e) => {
                setSelectedStatus(e.target.value);
                setPage(1);
              }}
              className="w-full min-h-[44px] px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-base md:text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
            >
              {PO_STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Vendor */}
          <div>
            <select
              value={selectedVendorId}
              onChange={(e) => {
                setSelectedVendorId(e.target.value);
                setPage(1);
              }}
              className="w-full min-h-[44px] px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-base md:text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
            >
              <option value="">Semua Vendor</option>
              {vendorOptions.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.code} - {v.name}
                </option>
              ))}
            </select>
          </div>

          {/* Tanggal */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <input
                type="date"
                value={fromDate}
                onChange={(e) => {
                  setFromDate(e.target.value);
                  setPage(1);
                }}
                className="w-full min-h-[44px] px-2 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs md:text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <span className="text-slate-400 text-xs">-</span>
            <div className="relative flex-1">
              <input
                type="date"
                value={toDate}
                onChange={(e) => {
                  setToDate(e.target.value);
                  setPage(1);
                }}
                className="w-full min-h-[44px] px-2 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs md:text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          {/* Quick Sort Dropdown */}
          <div>
            <select
              value={`${sortBy}_${sortOrder}`}
              onChange={(e) => {
                const [f, o] = e.target.value.split('_') as [string, 'asc' | 'desc'];
                setSortBy(f);
                setSortOrder(o);
                setPage(1);
              }}
              className="w-full min-h-[44px] px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-base md:text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all"
              title="Urutkan Purchase Order"
            >
              <option value="date_desc">Tanggal: Terbaru</option>
              <option value="date_asc">Tanggal: Terlama</option>
              <option value="vendor_asc">Vendor: A - Z</option>
              <option value="vendor_desc">Vendor: Z - A</option>
              <option value="total_desc">Nilai PO: Tertinggi</option>
              <option value="total_asc">Nilai PO: Terendah</option>
              <option value="number_asc">No. PO: A - Z</option>
              <option value="number_desc">No. PO: Z - A</option>
              <option value="status_asc">Status PO</option>
            </select>
          </div>
        </div>

        {hasActiveFilters && (
          <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs text-slate-600">
            <div className="flex items-center gap-1.5">
              <Filter className="w-3.5 h-3.5 text-indigo-600" />
              <span>Filter aktif diterapkan</span>
            </div>
            <button
              type="button"
              onClick={handleResetFilters}
              className="inline-flex items-center gap-1 text-indigo-600 hover:text-indigo-800 font-medium py-1 px-2 rounded hover:bg-indigo-50 transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset Filter</span>
            </button>
          </div>
        )}
      </div>

      {/* Konten Utama */}
      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      ) : error ? (
        <ErrorState title="Gagal Memuat PO" message={error} onRetry={fetchOrders} />
      ) : orders.length === 0 ? (
        <EmptyState
          title="Belum Ada Purchase Order"
          description={
            hasActiveFilters
              ? 'Tidak ada PO yang cocok dengan filter yang Anda tentukan.'
              : 'Belum ada pesanan pembelian yang dibuat. Buat Purchase Order pertama Anda sekarang.'
          }
          actionText={hasActiveFilters ? 'Reset Filter' : 'Buat PO Baru'}
          onAction={hasActiveFilters ? handleResetFilters : () => { window.location.href = '/purchase-orders/new'; }}
        />
      ) : (
        <div className="space-y-4">
          {/* Desktop Table */}
          <div className="hidden md:block bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-slate-600">
                <thead className="bg-slate-50 border-b border-slate-200 text-xs uppercase font-semibold text-slate-500">
                  <tr>
                    <SortableHeader
                      label="Nomor PO"
                      field="number"
                      currentSortBy={sortBy}
                      currentSortOrder={sortOrder}
                      onSort={handleSort}
                    />
                    <SortableHeader
                      label="Tanggal"
                      field="date"
                      currentSortBy={sortBy}
                      currentSortOrder={sortOrder}
                      onSort={handleSort}
                    />
                    <SortableHeader
                      label="Vendor"
                      field="vendor"
                      currentSortBy={sortBy}
                      currentSortOrder={sortOrder}
                      onSort={handleSort}
                    />
                    <th scope="col" className="px-4 py-3.5 text-center">
                      Item
                    </th>
                    <SortableHeader
                      label="Total Nilai PO"
                      field="total"
                      currentSortBy={sortBy}
                      currentSortOrder={sortOrder}
                      onSort={handleSort}
                      align="right"
                    />
                    <SortableHeader
                      label="Status"
                      field="status"
                      currentSortBy={sortBy}
                      currentSortOrder={sortOrder}
                      onSort={handleSort}
                      align="center"
                    />
                    <th scope="col" className="px-4 py-3.5 text-right">
                      Aksi
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {orders.map((po) => {
                    const formattedDate = new Date(po.orderDate).toLocaleDateString('id-ID', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    });

                    return (
                      <tr key={po.id} className="hover:bg-slate-50/75 transition-colors group">
                        <td className="px-4 py-3.5">
                          <Link
                            href={`/purchase-orders/${po.id}`}
                            className="font-semibold text-slate-900 hover:text-indigo-600 transition-colors"
                          >
                            {po.poNo || `(Draf #${po.id.slice(-6)})`}
                          </Link>
                        </td>
                        <td className="px-4 py-3.5 whitespace-nowrap text-slate-700">
                          {formattedDate}
                        </td>
                        <td className="px-4 py-3.5">
                          <div className="font-medium text-slate-800">{po.vendor?.name || '-'}</div>
                          <div className="text-xs text-slate-400">{po.vendor?.code || ''}</div>
                        </td>
                        <td className="px-4 py-3.5 text-center text-slate-700">
                          {po.items?.length ?? 0} produk
                        </td>
                        <td className="px-4 py-3.5 text-right font-semibold text-slate-900 whitespace-nowrap">
                          {formatRupiah(po.total)}
                        </td>
                        <td className="px-4 py-3.5 text-center whitespace-nowrap">
                          <StatusBadge status={po.status} />
                        </td>
                        <td className="px-4 py-3.5 text-right whitespace-nowrap">
                          <Link
                            href={`/purchase-orders/${po.id}`}
                            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 rounded-lg transition-colors min-h-[36px]"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>Detail</span>
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile Cards (360 px) */}
          <div className="grid grid-cols-1 gap-3 md:hidden">
            {orders.map((po) => {
              const formattedDate = new Date(po.orderDate).toLocaleDateString('id-ID', {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
              });

              return (
                <Link
                  key={po.id}
                  href={`/purchase-orders/${po.id}`}
                  className="block bg-white p-4 rounded-xl border border-slate-200 shadow-sm active:bg-slate-50 transition-colors"
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div>
                      <div className="font-bold text-slate-900 text-sm">
                        {po.poNo || `(Draf #${po.id.slice(-6)})`}
                      </div>
                      <span className="text-xs text-slate-400">{formattedDate}</span>
                    </div>
                    <StatusBadge status={po.status} />
                  </div>

                  <div className="my-2 py-2 border-y border-slate-100 flex items-center justify-between text-xs">
                    <div>
                      <p className="font-medium text-slate-800">{po.vendor?.name || '-'}</p>
                      <p className="text-slate-400">{po.vendor?.code || ''}</p>
                    </div>
                    <div className="text-right">
                      <span className="text-slate-500">{po.items?.length ?? 0} item</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <span className="text-xs text-slate-500">Total Biaya PO</span>
                    <span className="text-sm font-bold text-indigo-600">
                      {formatRupiah(po.total)}
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>

          {/* Bar Paginasi */}
          <div className="flex items-center justify-between pt-2 text-xs text-slate-600">
            <span>
              Menampilkan {orders.length} dari {totalCount} PO
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="min-h-[44px] min-w-[44px] p-2 flex items-center justify-center border border-slate-300 rounded-lg hover:bg-slate-100 disabled:opacity-40"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="min-h-[44px] min-w-[44px] p-2 flex items-center justify-center border border-slate-300 rounded-lg hover:bg-slate-100 disabled:opacity-40"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
