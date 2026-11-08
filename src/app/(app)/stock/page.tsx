'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import {
  Boxes,
  Package,
  Search,
  AlertTriangle,
  History,
  X,
  SlidersHorizontal,
} from 'lucide-react';
import { Skeleton, EmptyState, ErrorState } from '@/components/ui/States';
import { formatRupiah } from '@/lib/domain/money';

interface ProductStockItem {
  id: string;
  sku: string;
  name: string;
  unit: string;
  category: { id: string; name: string } | null;
  costPrice: number;
  basePrice: number;
  minPrice: number;
  stockQty: number;
  reservedQty: number;
  available: number;
  isNegative: boolean;
  isActive: boolean;
}

interface StockMovementItem {
  id: string;
  productId: string;
  product?: { id: string; sku: string; name: string; unit: string } | null;
  type: string;
  qtyDelta: number;
  balanceAfter: number;
  refType: string | null;
  refId: string | null;
  note: string | null;
  createdAt: string;
}

interface CategoryOption {
  id: string;
  name: string;
}

const MOVE_TYPE_LABELS: Record<string, { label: string; color: string }> = {
  PO_RECEIPT: { label: 'Terima PO', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  SALE_SHIPMENT: { label: 'Kirim Order', color: 'bg-blue-50 text-blue-700 border-blue-200' },
  RETURN_IN: { label: 'Retur Masuk', color: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  ADJUSTMENT: { label: 'Koreksi Stok', color: 'bg-amber-50 text-amber-700 border-amber-200' },
  OPNAME: { label: 'Stock Opname', color: 'bg-purple-50 text-purple-700 border-purple-200' },
  VOID_REVERSAL: { label: 'Pembalikan Void', color: 'bg-rose-50 text-rose-700 border-rose-200' },
};

export default function StockPage() {
  const [products, setProducts] = useState<ProductStockItem[]>([]);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Pagination & Filter
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [negativeOnly, setNegativeOnly] = useState(false);

  // Modal Koreksi Stok (Adjust)
  const [showAdjustModal, setShowAdjustModal] = useState(false);
  const [selectedProductForAdjust, setSelectedProductForAdjust] = useState<ProductStockItem | null>(null);
  const [adjustQtyDelta, setAdjustQtyDelta] = useState<number | ''>('');
  const [adjustReason, setAdjustReason] = useState('');
  const [submittingAdjust, setSubmittingAdjust] = useState(false);
  const [adjustError, setAdjustError] = useState<string | null>(null);

  // Modal Stock Opname
  const [showOpnameModal, setShowOpnameModal] = useState(false);
  const [selectedProductForOpname, setSelectedProductForOpname] = useState<ProductStockItem | null>(null);
  const [opnameCountedQty, setOpnameCountedQty] = useState<number | ''>('');
  const [opnameReason, setOpnameReason] = useState('');
  const [submittingOpname, setSubmittingOpname] = useState(false);
  const [opnameError, setOpnameError] = useState<string | null>(null);

  // Modal / Drawer Riwayat Mutasi
  const [showMovementsModal, setShowMovementsModal] = useState(false);
  const [movementsProductId, setMovementsProductId] = useState<string | null>(null);
  const [movements, setMovements] = useState<StockMovementItem[]>([]);
  const [loadingMovements, setLoadingMovements] = useState(false);
  const [movementFilterType, setMovementFilterType] = useState('');

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

  // Muat opsi kategori
  useEffect(() => {
    async function loadCategories() {
      try {
        const res = await fetch('/api/v1/categories');
        if (res.ok) {
          const json = await res.json();
          setCategories(json.data?.items || json.data || []);
        }
      } catch {
        // Abaikan kegagalan muat kategori
      }
    }
    loadCategories();
  }, []);

  // Fetch data stok dari server
  const fetchStock = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams();
      params.set('page', page.toString());
      params.set('limit', '25');

      if (debouncedSearch.trim()) params.set('q', debouncedSearch.trim());
      if (selectedCategory) params.set('categoryId', selectedCategory);
      if (negativeOnly) params.set('negativeOnly', 'true');

      const res = await fetch(`/api/v1/stock?${params.toString()}`);
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error?.message || 'Gagal memuat data stok');
      }

      const json = await res.json();
      setProducts(json.data.items || []);
      setTotalPages(json.data.totalPages || 1);
      setTotalCount(json.data.total || 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Terjadi kesalahan sistem');
    } finally {
      setLoading(false);
    }
  }, [page, debouncedSearch, selectedCategory, negativeOnly]);

  useEffect(() => {
    fetchStock();
  }, [fetchStock]);

  // Muat riwayat mutasi
  const fetchMovements = useCallback(async (prodId?: string | null) => {
    try {
      setLoadingMovements(true);
      const params = new URLSearchParams();
      if (prodId) params.set('productId', prodId);
      if (movementFilterType) params.set('type', movementFilterType);
      params.set('limit', '50');

      const res = await fetch(`/api/v1/stock/movements?${params.toString()}`);
      if (res.ok) {
        const json = await res.json();
        setMovements(json.data.items || []);
      }
    } catch {
      // Abaikan kegagalan muat riwayat
    } finally {
      setLoadingMovements(false);
    }
  }, [movementFilterType]);

  const handleOpenMovements = (prod?: ProductStockItem) => {
    setMovementsProductId(prod?.id || null);
    setShowMovementsModal(true);
    fetchMovements(prod?.id || null);
  };

  // Submit Koreksi Stok
  const handleAdjustSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProductForAdjust) return;

    const delta = Number(adjustQtyDelta);
    if (isNaN(delta) || delta === 0) {
      setAdjustError('Jumlah koreksi stok tidak boleh 0');
      return;
    }

    if (!adjustReason || adjustReason.trim().length < 5) {
      setAdjustError('Alasan penyesuaian stok wajib diisi minimal 5 karakter');
      return;
    }

    try {
      setSubmittingAdjust(true);
      setAdjustError(null);

      const res = await fetch('/api/v1/stock/adjust', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: selectedProductForAdjust.id,
          qtyDelta: delta,
          reason: adjustReason.trim(),
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error?.message || 'Gagal menyimpan penyesuaian stok');
      }

      setShowAdjustModal(false);
      setSelectedProductForAdjust(null);
      setAdjustQtyDelta('');
      setAdjustReason('');
      fetchStock();
    } catch (err) {
      setAdjustError(err instanceof Error ? err.message : 'Terjadi kesalahan');
    } finally {
      setSubmittingAdjust(false);
    }
  };

  // Submit Stock Opname
  const handleOpnameSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProductForOpname) return;

    const counted = Number(opnameCountedQty);
    if (isNaN(counted) || counted < 0) {
      setOpnameError('Jumlah fisik hasil hitung tidak boleh negatif');
      return;
    }

    if (!opnameReason || opnameReason.trim().length < 5) {
      setOpnameError('Alasan stock opname wajib diisi minimal 5 karakter');
      return;
    }

    try {
      setSubmittingOpname(true);
      setOpnameError(null);

      const res = await fetch('/api/v1/stock/opname', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: selectedProductForOpname.id,
          countedQty: counted,
          reason: opnameReason.trim(),
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error?.message || 'Gagal menyimpan hasil stock opname');
      }

      setShowOpnameModal(false);
      setSelectedProductForOpname(null);
      setOpnameCountedQty('');
      setOpnameReason('');
      fetchStock();
    } catch (err) {
      setOpnameError(err instanceof Error ? err.message : 'Terjadi kesalahan');
    } finally {
      setSubmittingOpname(false);
    }
  };

  // Ringkasan metrik stok
  const totalPhysical = products.reduce((acc, p) => acc + p.stockQty, 0);
  const totalReserved = products.reduce((acc, p) => acc + p.reservedQty, 0);
  const totalAvailable = products.reduce((acc, p) => acc + p.available, 0);
  const negativeCount = products.filter((p) => p.isNegative).length;

  return (
    <div className="w-full max-w-7xl mx-auto px-4 py-6 md:py-8 space-y-6">
      {/* Header Halaman */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Boxes className="w-7 h-7 text-indigo-600" />
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
              Manajemen Stok & Opname
            </h1>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Pantau stok fisik, alokasi reservasi order, koreksi stok manual, dan stock opname berkala.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => handleOpenMovements()}
            className="inline-flex items-center gap-1.5 min-h-[44px] px-3.5 py-2 border border-slate-300 hover:bg-slate-50 text-slate-700 font-medium rounded-lg text-sm transition-colors"
          >
            <History className="w-4 h-4 text-slate-500" />
            <span>Riwayat Mutasi</span>
          </button>
          <Link
            href="/purchase-orders"
            className="inline-flex items-center gap-1.5 min-h-[44px] px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg text-sm transition-colors shadow-sm"
          >
            <Package className="w-4 h-4" />
            <span>Purchase Order (PO)</span>
          </Link>
        </div>
      </div>

      {/* Kartu Ringkasan Metrik */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <span className="text-xs font-medium text-slate-500">Total Stok Fisik</span>
          <p className="text-xl sm:text-2xl font-bold text-slate-900 mt-1">
            {totalPhysical.toLocaleString('id-ID')}
          </p>
          <span className="text-[11px] text-slate-400 mt-0.5 block">Di seluruh gudang</span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <span className="text-xs font-medium text-amber-700">Dipesan / Reservasi</span>
          <p className="text-xl sm:text-2xl font-bold text-amber-600 mt-1">
            {totalReserved.toLocaleString('id-ID')}
          </p>
          <span className="text-[11px] text-amber-600/80 mt-0.5 block">Terkunci untuk order</span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <span className="text-xs font-medium text-emerald-700">Stok Tersedia</span>
          <p className="text-xl sm:text-2xl font-bold text-emerald-600 mt-1">
            {totalAvailable.toLocaleString('id-ID')}
          </p>
          <span className="text-[11px] text-emerald-600/80 mt-0.5 block">Siap dijual</span>
        </div>

        <div
          className={`p-4 rounded-xl border shadow-sm ${
            negativeCount > 0
              ? 'bg-rose-50 border-rose-200 text-rose-900'
              : 'bg-white border-slate-200 text-slate-900'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium">Stok Minus</span>
            {negativeCount > 0 && <AlertTriangle className="w-4 h-4 text-rose-600" />}
          </div>
          <p
            className={`text-xl sm:text-2xl font-bold mt-1 ${
              negativeCount > 0 ? 'text-rose-700' : 'text-slate-900'
            }`}
          >
            {negativeCount} produk
          </p>
          <span className="text-[11px] text-slate-500 mt-0.5 block">
            {negativeCount > 0 ? 'Perlu pengadaan segera' : 'Kondisi stok aman'}
          </span>
        </div>
      </div>

      {/* Bar Filter & Pencarian */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* Pencarian */}
          <div className="relative sm:col-span-2 lg:col-span-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="Cari SKU atau nama produk..."
              className="w-full min-h-[44px] pl-9 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-base md:text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
            />
          </div>

          {/* Kategori */}
          <div>
            <select
              value={selectedCategory}
              onChange={(e) => {
                setSelectedCategory(e.target.value);
                setPage(1);
              }}
              className="w-full min-h-[44px] px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-base md:text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
            >
              <option value="">Semua Kategori</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          {/* Checkbox Hanya Stok Minus */}
          <div className="flex items-center">
            <label className="flex items-center gap-2 cursor-pointer text-sm text-slate-700 min-h-[44px]">
              <input
                type="checkbox"
                checked={negativeOnly}
                onChange={(e) => {
                  setNegativeOnly(e.target.checked);
                  setPage(1);
                }}
                className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500"
              />
              <span className="font-medium text-xs md:text-sm">
                Tampilkan hanya stok minus / habis
              </span>
            </label>
          </div>
        </div>
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
        <ErrorState title="Gagal Memuat Stok" message={error} onRetry={fetchStock} />
      ) : products.length === 0 ? (
        <EmptyState
          title="Tidak Ada Produk"
          description="Tidak ditemukan produk yang sesuai dengan kriteria pencarian atau filter stok."
          actionText="Reset Filter"
          onAction={() => {
            setSearchTerm('');
            setDebouncedSearch('');
            setSelectedCategory('');
            setNegativeOnly(false);
            setPage(1);
          }}
        />
      ) : (
        <div className="space-y-4">
          {/* Tabel Desktop */}
          <div className="hidden md:block bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-slate-600">
                <thead className="bg-slate-50 border-b border-slate-200 text-xs uppercase font-semibold text-slate-500">
                  <tr>
                    <th scope="col" className="px-4 py-3.5">
                      Produk
                    </th>
                    <th scope="col" className="px-4 py-3.5">
                      Kategori
                    </th>
                    <th scope="col" className="px-4 py-3.5 text-center">
                      Fisik (Stock)
                    </th>
                    <th scope="col" className="px-4 py-3.5 text-center text-amber-700">
                      Dipesan
                    </th>
                    <th scope="col" className="px-4 py-3.5 text-center">
                      Tersedia
                    </th>
                    <th scope="col" className="px-4 py-3.5 text-right text-emerald-700">
                      HPP
                    </th>
                    <th scope="col" className="px-4 py-3.5 text-right">
                      Aksi
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {products.map((p) => (
                    <tr
                      key={p.id}
                      className={`hover:bg-slate-50/75 transition-colors ${
                        p.isNegative ? 'bg-rose-50/25' : ''
                      }`}
                    >
                      <td className="px-4 py-3.5">
                        <div className="font-semibold text-slate-900">{p.name}</div>
                        <div className="text-xs text-slate-400">
                          SKU: {p.sku} • {p.unit}
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-slate-600">
                        {p.category?.name || '-'}
                      </td>
                      <td className="px-4 py-3.5 text-center font-bold text-slate-800">
                        {p.stockQty} {p.unit}
                      </td>
                      <td className="px-4 py-3.5 text-center font-semibold text-amber-600">
                        {p.reservedQty} {p.unit}
                      </td>
                      <td className="px-4 py-3.5 text-center">
                        <span
                          className={`inline-flex items-center gap-1 font-bold px-2 py-0.5 rounded text-xs ${
                            p.isNegative
                              ? 'bg-rose-100 text-rose-800 border border-rose-300'
                              : p.available === 0
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-emerald-100 text-emerald-800'
                          }`}
                        >
                          {p.available} {p.unit}
                          {p.isNegative && <AlertTriangle className="w-3 h-3" />}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-right font-medium text-emerald-700">
                        {formatRupiah(p.costPrice)}
                      </td>
                      <td className="px-4 py-3.5 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedProductForAdjust(p);
                              setAdjustQtyDelta('');
                              setAdjustReason('');
                              setAdjustError(null);
                              setShowAdjustModal(true);
                            }}
                            className="px-2.5 py-1 text-xs font-medium text-amber-700 bg-amber-50 hover:bg-amber-100 rounded border border-amber-200 transition-colors min-h-[32px]"
                          >
                            Koreksi
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedProductForOpname(p);
                              setOpnameCountedQty(p.stockQty);
                              setOpnameReason('');
                              setOpnameError(null);
                              setShowOpnameModal(true);
                            }}
                            className="px-2.5 py-1 text-xs font-medium text-purple-700 bg-purple-50 hover:bg-purple-100 rounded border border-purple-200 transition-colors min-h-[32px]"
                          >
                            Opname
                          </button>
                          <button
                            type="button"
                            onClick={() => handleOpenMovements(p)}
                            className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded min-h-[32px] min-w-[32px] flex items-center justify-center transition-colors"
                            title="Lihat Riwayat Mutasi"
                          >
                            <History className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Kartu Mobile Responsif (360 px) */}
          <div className="grid grid-cols-1 gap-3 md:hidden">
            {products.map((p) => (
              <div
                key={p.id}
                className={`bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-3 ${
                  p.isNegative ? 'border-rose-300 bg-rose-50/20' : ''
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="font-bold text-slate-900 text-sm">{p.name}</h3>
                    <p className="text-xs text-slate-400">
                      SKU: {p.sku} • {p.unit} {p.category ? `• ${p.category.name}` : ''}
                    </p>
                  </div>
                  <span
                    className={`font-bold text-xs px-2 py-0.5 rounded ${
                      p.isNegative
                        ? 'bg-rose-100 text-rose-800'
                        : 'bg-emerald-100 text-emerald-800'
                    }`}
                  >
                    Tersedia: {p.available}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2 py-2 border-y border-slate-100 text-center text-xs">
                  <div>
                    <span className="text-slate-400 block text-[10px]">Stok Fisik</span>
                    <span className="font-bold text-slate-800">{p.stockQty}</span>
                  </div>
                  <div>
                    <span className="text-amber-600 block text-[10px]">Reservasi</span>
                    <span className="font-bold text-amber-600">{p.reservedQty}</span>
                  </div>
                  <div>
                    <span className="text-emerald-700 block text-[10px]">HPP</span>
                    <span className="font-medium text-emerald-700">
                      {formatRupiah(p.costPrice)}
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => handleOpenMovements(p)}
                    className="inline-flex items-center gap-1 text-xs text-slate-600 hover:text-slate-900 py-1"
                  >
                    <History className="w-3.5 h-3.5 text-slate-400" />
                    <span>Riwayat</span>
                  </button>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedProductForAdjust(p);
                        setAdjustQtyDelta('');
                        setAdjustReason('');
                        setAdjustError(null);
                        setShowAdjustModal(true);
                      }}
                      className="min-h-[44px] px-3 py-1.5 text-xs font-semibold text-amber-700 bg-amber-50 hover:bg-amber-100 rounded-lg border border-amber-200"
                    >
                      Koreksi
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedProductForOpname(p);
                        setOpnameCountedQty(p.stockQty);
                        setOpnameReason('');
                        setOpnameError(null);
                        setShowOpnameModal(true);
                      }}
                      className="min-h-[44px] px-3 py-1.5 text-xs font-semibold text-purple-700 bg-purple-50 hover:bg-purple-100 rounded-lg border border-purple-200"
                    >
                      Opname
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Bar Paginasi */}
          <div className="flex items-center justify-between pt-2 text-xs text-slate-600">
            <span>
              Menampilkan {products.length} dari {totalCount} produk
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="min-h-[44px] px-3 py-1 border border-slate-300 rounded hover:bg-slate-50 disabled:opacity-40"
              >
                Sebelumnya
              </button>
              <span className="px-2">
                {page} / {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="min-h-[44px] px-3 py-1 border border-slate-300 rounded hover:bg-slate-50 disabled:opacity-40"
              >
                Selanjutnya
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Koreksi Stok (Adjust) */}
      {showAdjustModal && selectedProductForAdjust && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-md overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-slate-100 bg-amber-50">
              <div className="flex items-center gap-2 text-amber-800">
                <SlidersHorizontal className="w-5 h-5 text-amber-600" />
                <h3 className="font-bold text-slate-900">Koreksi Stok Manual</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowAdjustModal(false)}
                className="p-1 rounded text-slate-400 hover:text-slate-600 min-h-[44px] min-w-[44px] flex items-center justify-center"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAdjustSubmit} className="p-5 space-y-4">
              <div>
                <span className="text-xs text-slate-400">Produk</span>
                <p className="font-semibold text-slate-900">{selectedProductForAdjust.name}</p>
                <p className="text-xs text-slate-500">
                  Stok Fisik Saat Ini: <strong>{selectedProductForAdjust.stockQty} {selectedProductForAdjust.unit}</strong>
                </p>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700">
                  Jumlah Penyesuaian (+ untuk bertambah, - untuk berkurang):
                </label>
                <input
                  type="number"
                  value={adjustQtyDelta}
                  onChange={(e) => setAdjustQtyDelta(e.target.value === '' ? '' : Number(e.target.value))}
                  placeholder="Contoh: -2 atau 5"
                  required
                  autoFocus
                  className="w-full min-h-[44px] px-3 py-2 text-base md:text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
                {adjustQtyDelta !== '' && (
                  <p className="text-xs text-slate-500 pt-1">
                    Stok setelah koreksi:{' '}
                    <strong>
                      {selectedProductForAdjust.stockQty + Number(adjustQtyDelta)}{' '}
                      {selectedProductForAdjust.unit}
                    </strong>
                  </p>
                )}
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700">
                  Alasan Penyesuaian (wajib, minimal 5 karakter):
                </label>
                <textarea
                  value={adjustReason}
                  onChange={(e) => setAdjustReason(e.target.value)}
                  placeholder="Contoh: Barang rusak saat penataan gudang"
                  rows={3}
                  required
                  className="w-full min-h-[44px] px-3 py-2 text-base md:text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              {adjustError && (
                <div className="p-3 bg-red-50 text-red-700 rounded-lg text-xs font-medium">
                  {adjustError}
                </div>
              )}

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAdjustModal(false)}
                  disabled={submittingAdjust}
                  className="min-h-[44px] px-4 py-2 border border-slate-300 hover:bg-slate-50 text-slate-700 text-sm font-medium rounded-lg"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={submittingAdjust}
                  className="min-h-[44px] px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium rounded-lg"
                >
                  {submittingAdjust ? 'Menyimpan...' : 'Simpan Koreksi'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Stock Opname */}
      {showOpnameModal && selectedProductForOpname && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-md overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-slate-100 bg-purple-50">
              <div className="flex items-center gap-2 text-purple-800">
                <Boxes className="w-5 h-5 text-purple-600" />
                <h3 className="font-bold text-slate-900">Input Hasil Stock Opname</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowOpnameModal(false)}
                className="p-1 rounded text-slate-400 hover:text-slate-600 min-h-[44px] min-w-[44px] flex items-center justify-center"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleOpnameSubmit} className="p-5 space-y-4">
              <div>
                <span className="text-xs text-slate-400">Produk</span>
                <p className="font-semibold text-slate-900">{selectedProductForOpname.name}</p>
                <p className="text-xs text-slate-500">
                  Stok di Sistem: <strong>{selectedProductForOpname.stockQty} {selectedProductForOpname.unit}</strong>
                </p>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700">
                  Jumlah Fisik Riil Hasil Hitung:
                </label>
                <input
                  type="number"
                  min="0"
                  value={opnameCountedQty}
                  onChange={(e) => setOpnameCountedQty(e.target.value === '' ? '' : Math.max(0, Number(e.target.value)))}
                  placeholder="0"
                  required
                  autoFocus
                  className="w-full min-h-[44px] px-3 py-2 text-base md:text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
                {opnameCountedQty !== '' && (
                  <p className="text-xs text-slate-600 pt-1">
                    Selisih penyesuaian:{' '}
                    <strong className={Number(opnameCountedQty) - selectedProductForOpname.stockQty >= 0 ? 'text-emerald-700' : 'text-rose-700'}>
                      {Number(opnameCountedQty) - selectedProductForOpname.stockQty > 0 ? '+' : ''}
                      {Number(opnameCountedQty) - selectedProductForOpname.stockQty} {selectedProductForOpname.unit}
                    </strong>
                  </p>
                )}
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700">
                  Alasan / Keterangan Opname (wajib, minimal 5 karakter):
                </label>
                <textarea
                  value={opnameReason}
                  onChange={(e) => setOpnameReason(e.target.value)}
                  placeholder="Contoh: Stock opname fisik akhir bulan November"
                  rows={3}
                  required
                  className="w-full min-h-[44px] px-3 py-2 text-base md:text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>

              {opnameError && (
                <div className="p-3 bg-red-50 text-red-700 rounded-lg text-xs font-medium">
                  {opnameError}
                </div>
              )}

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowOpnameModal(false)}
                  disabled={submittingOpname}
                  className="min-h-[44px] px-4 py-2 border border-slate-300 hover:bg-slate-50 text-slate-700 text-sm font-medium rounded-lg"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={submittingOpname}
                  className="min-h-[44px] px-5 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium rounded-lg"
                >
                  {submittingOpname ? 'Menyimpan...' : 'Perbarui Stok Opname'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Riwayat Mutasi Stok */}
      {showMovementsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-3xl max-h-[85vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-slate-100 bg-slate-50">
              <div className="flex items-center gap-2">
                <History className="w-5 h-5 text-indigo-600" />
                <h3 className="font-bold text-slate-900">Riwayat Mutasi Stok</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowMovementsModal(false)}
                className="p-1 rounded text-slate-400 hover:text-slate-600 min-h-[44px] min-w-[44px] flex items-center justify-center"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 border-b border-slate-100 flex items-center gap-3">
              <select
                value={movementFilterType}
                onChange={(e) => {
                  setMovementFilterType(e.target.value);
                  fetchMovements(movementsProductId);
                }}
                className="py-1.5 px-3 bg-slate-50 border border-slate-300 rounded-lg text-xs md:text-sm text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              >
                <option value="">Semua Tipe Mutasi</option>
                {Object.entries(MOVE_TYPE_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {loadingMovements ? (
                <div className="space-y-2">
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                </div>
              ) : movements.length === 0 ? (
                <div className="text-center py-8 text-slate-400 text-sm">
                  Belum ada catatan mutasi stok untuk produk ini.
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {movements.map((m) => {
                    const typeInfo = MOVE_TYPE_LABELS[m.type] || {
                      label: m.type,
                      color: 'bg-slate-100 text-slate-700',
                    };
                    const dateStr = new Date(m.createdAt).toLocaleString('id-ID', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    });

                    return (
                      <div key={m.id} className="py-2.5 flex items-start justify-between gap-3 text-xs">
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${typeInfo.color}`}>
                              {typeInfo.label}
                            </span>
                            <span className="font-semibold text-slate-900">
                              {m.product?.name || m.productId}
                            </span>
                          </div>
                          {m.note && <p className="text-slate-600 text-xs italic">&quot;{m.note}&quot;</p>}
                          <span className="text-slate-400 text-[11px] block">{dateStr}</span>
                        </div>

                        <div className="text-right whitespace-nowrap">
                          <span
                            className={`font-bold text-sm ${
                              m.qtyDelta > 0 ? 'text-emerald-600' : 'text-rose-600'
                            }`}
                          >
                            {m.qtyDelta > 0 ? `+${m.qtyDelta}` : m.qtyDelta}
                          </span>
                          <span className="text-[11px] text-slate-400 block">
                            Saldo: {m.balanceAfter}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="p-3 bg-slate-50 border-t border-slate-100 text-right">
              <button
                type="button"
                onClick={() => setShowMovementsModal(false)}
                className="min-h-[44px] px-4 py-2 border border-slate-300 hover:bg-slate-100 text-slate-700 text-sm font-medium rounded-lg"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
