'use client';

import React, { useState, useEffect, useCallback, Suspense } from 'react';
import Link from 'next/link';
import {
  Tag,
  Search,
  BookOpen,
  ArrowUpDown,
  Loader2,
  Package,
  ShieldCheck,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { formatRupiah } from '@/lib/domain/money';

interface PriceListItem {
  id: string;
  sku: string;
  name: string;
  unit: string;
  categoryId: string | null;
  imageUrl: string | null;
  available: number;
  basePrice: number;
  floorPrice: number;
  floorSource: 'DEFAULT' | 'CUSTOMER_SPECIFIC';
  suggestedPrice: number;
}

interface PaginationMeta {
  total: number;
  page: number;
  pageSize: number;
}

function PriceListContent() {
  const [items, setItems] = useState<PriceListItem[]>([]);
  const [meta, setMeta] = useState<PaginationMeta>({ total: 0, page: 1, pageSize: 20 });
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<'name:asc' | 'name:desc' | 'basePrice:asc' | 'basePrice:desc'>('name:asc');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPriceList = useCallback(
    async (pageToFetch = 1, searchQuery = search, sortQuery = sort) => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        params.set('page', String(pageToFetch));
        params.set('pageSize', '20');
        params.set('sort', sortQuery);
        if (searchQuery.trim()) {
          params.set('q', searchQuery.trim());
        }

        const res = await fetch(`/api/v1/price-list?${params.toString()}`);
        const json = await res.json();

        if (res.ok && Array.isArray(json.data)) {
          setItems(json.data);
          if (json.meta) {
            setMeta(json.meta);
          }
        } else {
          setError(json?.error?.message || 'Gagal memuat daftar harga resmi.');
        }
      } catch {
        setError('Terjadi kendala jaringan saat menghubungi server.');
      } finally {
        setLoading(false);
      }
    },
    [search, sort]
  );

  useEffect(() => {
    fetchPriceList(1, search, sort);
  }, [fetchPriceList, search, sort]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchPriceList(1, search, sort);
  };

  const totalPages = Math.ceil((meta.total || 0) / (meta.pageSize || 20)) || 1;

  return (
    <div className="w-full max-w-7xl mx-auto px-4 py-6 md:py-8 space-y-6">
      {/* Header Halaman */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Tag className="w-7 h-7 text-emerald-600" />
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
              Daftar Harga Resmi Produk
            </h1>
          </div>
          <p className="text-sm text-slate-600 mt-1">
            Informasi harga jual standar dan batas minimal paten resmi unit usaha aktif (bebas margin HPP).
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/catalogs"
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
          >
            <BookOpen className="w-4 h-4 text-slate-500" />
            <span>Katalog Cetak</span>
          </Link>
        </div>
      </div>

      {/* Filter & Bar Pencarian */}
      <div className="flex flex-col sm:flex-row gap-3">
        <form onSubmit={handleSearchSubmit} className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Cari berdasarkan nama produk atau SKU..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 bg-white border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </form>

        <div className="flex items-center gap-2">
          <div className="relative">
            <select
              value={sort}
              onChange={(e) =>
                setSort(
                  e.target.value as
                    | 'name:asc'
                    | 'name:desc'
                    | 'basePrice:asc'
                    | 'basePrice:desc'
                )
              }
              className="appearance-none bg-white border border-slate-300 rounded-xl pl-3 pr-8 py-2.5 text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="name:asc">Nama (A-Z)</option>
              <option value="name:desc">Nama (Z-A)</option>
              <option value="basePrice:asc">Harga Terendah</option>
              <option value="basePrice:desc">Harga Tertinggi</option>
            </select>
            <ArrowUpDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          </div>
        </div>
      </div>

      {/* Konten / Status */}
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex flex-col items-center justify-center p-12 text-center">
          <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
          <p className="mt-3 text-sm text-slate-500">Memuat daftar harga resmi...</p>
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center">
          <Package className="mx-auto h-12 w-12 text-slate-300" />
          <h2 className="mt-3 text-base font-bold text-slate-800">Tidak ada produk ditemukan</h2>
          <p className="mt-1 text-sm text-slate-500">Coba ubah kata kunci pencarian Anda.</p>
        </div>
      ) : (
        <>
          {/* Tabel Desktop */}
          <div className="hidden md:block overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-4 py-3.5">Produk</th>
                  <th className="px-4 py-3.5">SKU</th>
                  <th className="px-4 py-3.5">Satuan</th>
                  <th className="px-4 py-3.5 text-right">Harga Dasar</th>
                  <th className="px-4 py-3.5 text-right">Harga Minimal Paten</th>
                  <th className="px-4 py-3.5 text-center">Batas Floor</th>
                  <th className="px-4 py-3.5 text-right">Stok Tersedia</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {items.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="px-4 py-3 font-medium text-slate-900">{item.name}</td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-500">{item.sku}</td>
                    <td className="px-4 py-3 text-slate-600">{item.unit}</td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-900">
                      {formatRupiah(item.basePrice)}
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-amber-700">
                      {formatRupiah(item.floorPrice)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                          item.floorSource === 'CUSTOMER_SPECIFIC'
                            ? 'bg-purple-100 text-purple-700'
                            : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        <ShieldCheck className="w-3 h-3" />
                        {item.floorSource === 'CUSTOMER_SPECIFIC' ? 'Khusus' : 'Standar'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-medium">
                      {item.available > 0 ? (
                        <span className="text-emerald-700">{item.available} {item.unit}</span>
                      ) : (
                        <span className="text-slate-400">Kosong</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Kartu Mobile (360px safe) */}
          <div className="grid grid-cols-1 gap-3 md:hidden">
            {items.map((item) => (
              <div
                key={item.id}
                className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm space-y-2.5"
              >
                <div className="flex justify-between items-start gap-2">
                  <div>
                    <h3 className="font-semibold text-slate-900 text-sm">{item.name}</h3>
                    <p className="font-mono text-xs text-slate-500">{item.sku}</p>
                  </div>
                  <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 shrink-0">
                    {item.available} {item.unit}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 border-t border-slate-100 pt-2.5 text-xs">
                  <div>
                    <span className="text-slate-500">Harga Dasar:</span>
                    <div className="font-bold text-slate-900 text-sm">{formatRupiah(item.basePrice)}</div>
                  </div>
                  <div>
                    <span className="text-slate-500">Batas Minimal:</span>
                    <div className="font-bold text-amber-700 text-sm">{formatRupiah(item.floorPrice)}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Paginasi */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-slate-200 pt-4">
              <p className="text-xs text-slate-500">
                Menampilkan halaman {meta.page} dari {totalPages} ({meta.total} produk)
              </p>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => fetchPriceList(meta.page - 1)}
                  disabled={meta.page <= 1}
                  className="rounded-lg border border-slate-300 p-1.5 text-slate-600 hover:bg-slate-100 disabled:opacity-40"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  onClick={() => fetchPriceList(meta.page + 1)}
                  disabled={meta.page >= totalPages}
                  className="rounded-lg border border-slate-300 p-1.5 text-slate-600 hover:bg-slate-100 disabled:opacity-40"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function PriceListPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[400px] items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
        </div>
      }
    >
      <PriceListContent />
    </Suspense>
  );
}

