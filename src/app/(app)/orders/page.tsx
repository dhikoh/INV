'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import {
  ShoppingCart,
  Plus,
  Search,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Filter,
  Eye,
  RotateCcw,
  AlertTriangle,
} from 'lucide-react';
import { Skeleton, EmptyState, ErrorState } from '@/components/ui/States';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { SortableHeader } from '@/components/ui/SortableHeader';
import { formatRupiah } from '@/lib/domain/money';

interface CustomerSummary {
  id: string;
  code: string;
  name: string;
}

interface OrderListItem {
  id: string;
  orderNo: string | null;
  orderDate: string;
  status: string;
  version: number;
  rev: number;
  customerId: string;
  customer?: CustomerSummary;
  subtotal: number;
  discountTotal: number;
  shippingCharge: number;
  grandTotal: number;
  dpAmount: number;
  hasBelowMin: boolean;
  createdAt: string;
  items?: Array<{
    id: string;
    productName: string;
    qty: number;
    unitPrice: number;
    lineNet: number;
  }>;
}

interface OrderListResponse {
  items: OrderListItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

const STATUS_OPTIONS = [
  { value: '', label: 'Semua Status' },
  { value: 'DRAFT', label: 'Draf' },
  { value: 'PENDING_APPROVAL', label: 'Menunggu Persetujuan' },
  { value: 'AWAITING_DP', label: 'Menunggu DP' },
  { value: 'IN_PROCESS', label: 'Diproses' },
  { value: 'FINAL_PENDING_APPROVAL', label: 'Persetujuan Pelunasan' },
  { value: 'AWAITING_FINAL_PAYMENT', label: 'Menunggu Pelunasan' },
  { value: 'COMPLETED', label: 'Selesai' },
  { value: 'REVISION_REQUIRED', label: 'Perlu Revisi' },
  { value: 'CANCELLED', label: 'Dibatalkan' },
];

export default function OrdersPage() {
  const [orders, setOrders] = useState<OrderListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Pagination
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
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
      const defaultAsc = ['customer', 'number'].includes(field);
      setSortOrder(defaultAsc ? 'asc' : 'desc');
    }
    setPage(1);
  };

  // Customers option for filter dropdown
  const [customerOptions, setCustomerOptions] = useState<CustomerSummary[]>([]);

  // Debounce search 300 ms
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const handleSearchChange = (val: string) => {
    setSearchTerm(val);
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    searchTimeoutRef.current = setTimeout(() => {
      setDebouncedSearch(val);
      setPage(1);
    }, 300);
  };

  // Muat opsi customer untuk dropdown filter
  useEffect(() => {
    async function loadCustomers() {
      try {
        const res = await fetch('/api/v1/customers?limit=100');
        if (res.ok) {
          const json = await res.json();
          setCustomerOptions(json.data.items || []);
        }
      } catch {
        // Abaikan kegagalan memuat dropdown pelanggan
      }
    }
    loadCustomers();
  }, []);

  // Fetch orders from API
  const fetchOrders = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams();
      params.set('page', page.toString());
      params.set('limit', limit.toString());

      if (debouncedSearch.trim()) {
        params.set('q', debouncedSearch.trim());
      }
      if (selectedStatus) {
        params.set('status', selectedStatus);
      }
      if (selectedCustomerId) {
        params.set('customerId', selectedCustomerId);
      }
      if (fromDate) {
        params.set('from', fromDate);
      }
      if (toDate) {
        params.set('to', toDate);
      }
      params.set('sortBy', sortBy);
      params.set('sortOrder', sortOrder);

      const res = await fetch(`/api/v1/orders?${params.toString()}`);
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error?.message || 'Gagal memuat daftar pesanan');
      }

      const json = await res.json();
      const data: OrderListResponse = json.data;

      setOrders(data.items || []);
      setTotalPages(data.totalPages || 1);
      setTotalCount(data.total || 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Terjadi kesalahan jaringan');
    } finally {
      setLoading(false);
    }
  }, [page, limit, debouncedSearch, selectedStatus, selectedCustomerId, fromDate, toDate, sortBy, sortOrder]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  const handleResetFilters = () => {
    setSearchTerm('');
    setDebouncedSearch('');
    setSelectedStatus('');
    setSelectedCustomerId('');
    setFromDate('');
    setToDate('');
    setSortBy('date');
    setSortOrder('desc');
    setPage(1);
  };

  const hasActiveFilters = Boolean(
    debouncedSearch || selectedStatus || selectedCustomerId || fromDate || toDate || sortBy !== 'date' || sortOrder !== 'desc'
  );

  return (
    <div className="w-full max-w-7xl mx-auto px-4 py-6 md:py-8 space-y-6">
      {/* Header Halaman */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <ShoppingCart className="w-7 h-7 text-indigo-600" />
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
              Pesanan Penjualan
            </h1>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Kelola draf pesanan, pengajuan persetujuan harga, dan status pesanan pelanggan.
          </p>
        </div>

        <Link
          href="/orders/new"
          className="inline-flex items-center justify-center gap-2 min-h-[44px] px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-medium rounded-lg shadow-sm transition-colors text-sm w-full sm:w-auto"
        >
          <Plus className="w-4 h-4" />
          <span>Buat Pesanan Baru</span>
        </Link>
      </div>

      {/* Bar Filter & Pencarian */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {/* Pencarian Teks */}
          <div className="relative sm:col-span-2 lg:col-span-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="Cari nomor order / customer..."
              className="w-full min-h-[44px] pl-9 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-base md:text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all"
            />
          </div>

          {/* Filter Status */}
          <div>
            <select
              value={selectedStatus}
              onChange={(e) => {
                setSelectedStatus(e.target.value);
                setPage(1);
              }}
              className="w-full min-h-[44px] px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-base md:text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all"
            >
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Filter Pelanggan */}
          <div>
            <select
              value={selectedCustomerId}
              onChange={(e) => {
                setSelectedCustomerId(e.target.value);
                setPage(1);
              }}
              className="w-full min-h-[44px] px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-base md:text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all"
            >
              <option value="">Semua Pelanggan</option>
              {customerOptions.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.code} - {c.name}
                </option>
              ))}
            </select>
          </div>

          {/* Filter Rentang Tanggal */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Calendar className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <input
                type="date"
                value={fromDate}
                onChange={(e) => {
                  setFromDate(e.target.value);
                  setPage(1);
                }}
                title="Dari tanggal"
                className="w-full min-h-[44px] pl-8 pr-2 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs md:text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all"
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
                title="Sampai tanggal"
                className="w-full min-h-[44px] px-2 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs md:text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all"
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
              title="Urutkan daftar pesanan"
            >
              <option value="date_desc">Tanggal: Terbaru</option>
              <option value="date_asc">Tanggal: Terlama</option>
              <option value="customer_asc">Pelanggan: A - Z</option>
              <option value="customer_desc">Pelanggan: Z - A</option>
              <option value="total_desc">Grand Total: Tertinggi</option>
              <option value="total_asc">Grand Total: Terendah</option>
              <option value="number_asc">No. Dokumen: A - Z</option>
              <option value="number_desc">No. Dokumen: Z - A</option>
              <option value="status_asc">Status Pesanan</option>
            </select>
          </div>
        </div>

        {/* Baris Status Filter Aktif */}
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
          <Skeleton className="h-20 w-full" />
        </div>
      ) : error ? (
        <ErrorState
          title="Gagal Memuat Pesanan"
          message={error}
          onRetry={fetchOrders}
        />
      ) : orders.length === 0 ? (
        <EmptyState
          title="Belum Ada Pesanan"
          description={
            hasActiveFilters
              ? 'Tidak ada pesanan yang sesuai dengan kriteria filter yang dipilih.'
              : 'Belum ada data pesanan yang tercatat. Buat draf pesanan pertama Anda sekarang.'
          }
          actionText={hasActiveFilters ? 'Reset Filter' : 'Buat Pesanan Baru'}
          onAction={hasActiveFilters ? handleResetFilters : () => { window.location.href = '/orders/new'; }}
        />
      ) : (
        <div className="space-y-4">
          {/* Tampilan Desktop (Tabel) */}
          <div className="hidden md:block bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-slate-600">
                <thead className="bg-slate-50 border-b border-slate-200 text-xs uppercase font-semibold text-slate-500">
                  <tr>
                    <SortableHeader
                      label="Nomor Dokumen"
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
                      label="Pelanggan"
                      field="customer"
                      currentSortBy={sortBy}
                      currentSortOrder={sortOrder}
                      onSort={handleSort}
                    />
                    <th scope="col" className="px-4 py-3.5 text-center">
                      Item
                    </th>
                    <SortableHeader
                      label="Grand Total"
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
                  {orders.map((order) => {
                    const formattedDate = new Date(order.orderDate).toLocaleDateString('id-ID', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    });

                    return (
                      <tr
                        key={order.id}
                        className="hover:bg-slate-50/75 transition-colors group"
                      >
                        <td className="px-4 py-3.5">
                          <div className="font-semibold text-slate-900 flex items-center gap-1.5">
                            <Link
                              href={`/orders/${order.id}`}
                              className="hover:text-indigo-600 transition-colors"
                            >
                              {order.orderNo || `(Draf #${order.id.slice(-6)})`}
                            </Link>
                            {order.hasBelowMin && (
                              <span
                                title="Memuat harga di bawah batas minimal"
                                className="inline-flex items-center text-amber-600"
                              >
                                <AlertTriangle className="w-4 h-4" />
                              </span>
                            )}
                          </div>
                          <span className="text-xs text-slate-400">
                            Versi {order.version} (rev {order.rev})
                          </span>
                        </td>
                        <td className="px-4 py-3.5 whitespace-nowrap text-slate-700">
                          {formattedDate}
                        </td>
                        <td className="px-4 py-3.5">
                          <div className="font-medium text-slate-800">
                            {order.customer?.name || '-'}
                          </div>
                          <div className="text-xs text-slate-400">
                            {order.customer?.code || ''}
                          </div>
                        </td>
                        <td className="px-4 py-3.5 text-center text-slate-700">
                          {order.items?.length ?? '-'} produk
                        </td>
                        <td className="px-4 py-3.5 text-right font-semibold text-slate-900 whitespace-nowrap">
                          {formatRupiah(order.grandTotal)}
                        </td>
                        <td className="px-4 py-3.5 text-center whitespace-nowrap">
                          <StatusBadge status={order.status} />
                        </td>
                        <td className="px-4 py-3.5 text-right whitespace-nowrap">
                          <Link
                            href={`/orders/${order.id}`}
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

          {/* Tampilan Mobile (Kartu Responsif 360 px) */}
          <div className="grid grid-cols-1 gap-3 md:hidden">
            {orders.map((order) => {
              const formattedDate = new Date(order.orderDate).toLocaleDateString('id-ID', {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
              });

              return (
                <Link
                  key={order.id}
                  href={`/orders/${order.id}`}
                  className="block bg-white p-4 rounded-xl border border-slate-200 shadow-sm active:bg-slate-50 transition-colors"
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div>
                      <div className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
                        <span>{order.orderNo || `(Draf #${order.id.slice(-6)})`}</span>
                        {order.hasBelowMin && (
                          <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
                        )}
                      </div>
                      <span className="text-xs text-slate-400">{formattedDate}</span>
                    </div>
                    <StatusBadge status={order.status} />
                  </div>

                  <div className="my-2 py-2 border-y border-slate-100 flex items-center justify-between text-xs">
                    <div>
                      <p className="font-medium text-slate-800">
                        {order.customer?.name || '-'}
                      </p>
                      <p className="text-slate-400">{order.customer?.code || ''}</p>
                    </div>
                    <div className="text-right">
                      <span className="text-slate-500">
                        {order.items?.length ?? 0} item
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <span className="text-xs text-slate-500">Grand Total</span>
                    <span className="text-sm font-bold text-indigo-600">
                      {formatRupiah(order.grandTotal)}
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>

          {/* Bar Paginasi */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 text-xs text-slate-600">
            <div className="flex items-center gap-2">
              <span>Menampilkan {orders.length} dari {totalCount} pesanan</span>
              <span>•</span>
              <select
                value={limit}
                onChange={(e) => {
                  setLimit(Number(e.target.value));
                  setPage(1);
                }}
                className="py-1 px-2 bg-white border border-slate-300 rounded text-xs focus:ring-1 focus:ring-indigo-500 text-slate-800"
              >
                <option value={10}>10 / hal</option>
                <option value={20}>20 / hal</option>
                <option value={50}>50 / hal</option>
              </select>
            </div>

            <div className="flex items-center justify-between sm:justify-end gap-2">
              <span className="text-slate-500">
                Halaman {page} dari {totalPages}
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="min-h-[44px] min-w-[44px] p-2 flex items-center justify-center border border-slate-300 rounded-lg hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  aria-label="Halaman sebelumnya"
                >
                  <ChevronLeft className="w-4 h-4 text-slate-700" />
                </button>
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="min-h-[44px] min-w-[44px] p-2 flex items-center justify-center border border-slate-300 rounded-lg hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  aria-label="Halaman selanjutnya"
                >
                  <ChevronRight className="w-4 h-4 text-slate-700" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

