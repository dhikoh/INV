'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  BookOpen,
  Plus,
  Search,
  FileDown,
  ShoppingCart,
  Users,
  Package,
  ExternalLink,
  Loader2,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';
import { Skeleton } from '@/components/ui/States';
import { formatDateId } from '@/lib/format/date';

interface CustomerSummary {
  id: string;
  code: string;
  name: string;
}

interface CatalogListItem {
  id: string;
  title: string;
  note: string | null;
  customerId: string | null;
  customer: CustomerSummary | null;
  ownerId: string;
  ownerName: string;
  itemCount: number;
  createdAt: string;
  updatedAt: string;
}

interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export default function CatalogsPage() {
  const [catalogs, setCatalogs] = useState<CatalogListItem[]>([]);
  const [pagination, setPagination] = useState<PaginationMeta>({
    total: 0,
    page: 1,
    limit: 20,
    totalPages: 1,
  });
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const fetchCatalogs = useCallback(async (searchQuery = '') => {
    setLoading(true);
    setDownloadError(null);
    try {
      const params = new URLSearchParams();
      if (searchQuery.trim()) {
        params.set('search', searchQuery.trim());
      }
      const res = await fetch(`/api/v1/catalogs?${params.toString()}`);
      const json = await res.json();
      if (json.ok && Array.isArray(json.data)) {
        setCatalogs(json.data);
        if (json.meta) {
          setPagination(json.meta);
        }
      }
    } catch {
      // Tangani kesalahan jaringan
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCatalogs();
  }, [fetchCatalogs]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchCatalogs(search);
  };

  const handleDownloadPdf = async (catalog: CatalogListItem) => {
    setDownloadingId(catalog.id);
    setDownloadError(null);
    try {
      const res = await fetch(`/api/v1/catalogs/${catalog.id}/pdf`);
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        if (json?.error?.code === 'CATALOG_STALE') {
          setDownloadError(
            `Katalog "${catalog.title}" memiliki item yang kedaluwarsa di bawah harga minimal terbaru. Buka detail katalog untuk menyesuaikan harga terlebih dahulu.`
          );
        } else {
          setDownloadError(json?.error?.message || 'Gagal mengunduh PDF');
        }
        return;
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Katalog-${catalog.title.replace(/[^a-zA-Z0-9-]/g, '-')}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      a.remove();
    } catch {
      setDownloadError('Terjadi kesalahan saat mengunduh berkas PDF.');
    } finally {
      setDownloadingId(null);
    }
  };

  const totalCatalogs = pagination.total || catalogs.length;
  const customerSpecificCount = catalogs.filter((c) => Boolean(c.customerId)).length;
  const generalCount = catalogs.filter((c) => !c.customerId).length;

  return (
    <div className="w-full max-w-7xl mx-auto px-4 py-6 md:py-8 space-y-6">
      {/* Header Halaman */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <BookOpen className="w-7 h-7 text-emerald-600" />
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
              Katalog Harga
            </h1>
          </div>
          <p className="text-sm text-slate-600 mt-1">
            Kelola katalog harga khusus customer atau umum, cetak PDF resmi, dan buat pesanan cepat.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
          <Link
            href="/price-list"
            className="inline-flex items-center justify-center gap-2 border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-medium px-4 py-2.5 rounded-lg shadow-sm transition-colors text-sm w-full sm:w-auto"
          >
            <span>Daftar Harga Resmi</span>
          </Link>
          <Link
            href="/catalogs/new"
            className="inline-flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-medium px-4 py-2.5 rounded-lg shadow-sm transition-colors text-sm w-full sm:w-auto"
          >
            <Plus className="w-4 h-4" />
            <span>Buat Katalog Baru</span>
          </Link>
        </div>
      </div>

      {/* Pesan Kesalahan Unduh PDF */}
      {downloadError && (
        <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="flex-1 text-sm">
            <p className="font-semibold text-amber-950">Gagal Mengunduh Dokumen</p>
            <p className="mt-0.5">{downloadError}</p>
          </div>
          <button
            onClick={() => setDownloadError(null)}
            className="text-amber-800 hover:text-amber-950 font-bold text-sm"
          >
            ✕
          </button>
        </div>
      )}

      {/* Kartu Ringkasan Metrik */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">
              Total Katalog
            </p>
            <p className="text-2xl font-bold text-slate-900 mt-1">{totalCatalogs}</p>
          </div>
          <div className="p-3 bg-emerald-50 text-emerald-600 rounded-lg">
            <BookOpen className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">
              Khusus Pelanggan
            </p>
            <p className="text-2xl font-bold text-blue-600 mt-1">{customerSpecificCount}</p>
          </div>
          <div className="p-3 bg-blue-50 text-blue-600 rounded-lg">
            <Users className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">
              Umum / Terbuka
            </p>
            <p className="text-2xl font-bold text-slate-700 mt-1">{generalCount}</p>
          </div>
          <div className="p-3 bg-slate-100 text-slate-600 rounded-lg">
            <Package className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Bar Pencarian */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col sm:flex-row gap-3 items-center justify-between">
        <form onSubmit={handleSearchSubmit} className="relative w-full sm:w-96">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari judul katalog atau catatan..."
            className="w-full pl-9 pr-4 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
          />
        </form>
        <button
          onClick={() => fetchCatalogs(search)}
          disabled={loading}
          className="inline-flex items-center gap-1.5 px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-700 hover:bg-slate-50 font-medium transition-colors w-full sm:w-auto justify-center"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          <span>Muat Ulang</span>
        </button>
      </div>

      {/* Konten Daftar Katalog */}
      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-20 w-full rounded-xl" />
          <Skeleton className="h-20 w-full rounded-xl" />
          <Skeleton className="h-20 w-full rounded-xl" />
        </div>
      ) : catalogs.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-8 text-center space-y-4">
          <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center mx-auto">
            <BookOpen className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-slate-900">
              {search ? 'Tidak ada katalog yang cocok' : 'Belum Ada Katalog Harga'}
            </h3>
            <p className="text-sm text-slate-500 mt-1 max-w-md mx-auto">
              {search
                ? `Tidak ditemukan katalog dengan kata kunci "${search}". Coba ubah pencarian.`
                : 'Buat katalog harga sekarang untuk menetapkan harga khusus grosir, eceran, atau customer tertentu dan bagikan PDF resminya.'}
            </p>
          </div>
          {!search && (
            <Link
              href="/catalogs/new"
              className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-medium px-4 py-2 rounded-lg text-sm shadow-sm transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>Buat Katalog Pertama</span>
            </Link>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {catalogs.map((catalog) => (
            <div
              key={catalog.id}
              className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm hover:border-slate-300 transition-all flex flex-col justify-between"
            >
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-semibold text-slate-900 text-base leading-snug">
                    {catalog.title}
                  </h3>
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-emerald-50 text-emerald-700 shrink-0">
                    {catalog.itemCount} Produk
                  </span>
                </div>

                {catalog.customer ? (
                  <div className="flex items-center gap-1.5 text-xs text-blue-700 bg-blue-50 px-2.5 py-1.5 rounded-md">
                    <Users className="w-3.5 h-3.5 shrink-0" />
                    <span className="font-medium truncate">
                      Untuk: {catalog.customer.name} ({catalog.customer.code})
                    </span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 text-xs text-slate-600 bg-slate-50 px-2.5 py-1.5 rounded-md">
                    <Package className="w-3.5 h-3.5 shrink-0" />
                    <span>Katalog Terbuka / Umum</span>
                  </div>
                )}

                {catalog.note && (
                  <p className="text-xs text-slate-600 line-clamp-2 italic">
                    &ldquo;{catalog.note}&rdquo;
                  </p>
                )}

                <div className="text-[11px] text-slate-400 flex items-center justify-between pt-1 border-t border-slate-100">
                  <span>Dibuat oleh: {catalog.ownerName}</span>
                  <span>{formatDateId(catalog.updatedAt, 'compact')}</span>
                </div>
              </div>

              {/* Tombol Aksi */}
              <div className="pt-4 mt-4 border-t border-slate-100 grid grid-cols-3 gap-2">
                <Link
                  href={`/catalogs/${catalog.id}`}
                  className="inline-flex items-center justify-center gap-1 px-2.5 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors text-center"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Detail</span>
                </Link>

                <button
                  type="button"
                  onClick={() => handleDownloadPdf(catalog)}
                  disabled={downloadingId === catalog.id}
                  className="inline-flex items-center justify-center gap-1 px-2.5 py-2 text-xs font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg transition-colors text-center disabled:opacity-50"
                  title="Unduh PDF Resmi"
                >
                  {downloadingId === catalog.id ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <FileDown className="w-3.5 h-3.5" />
                  )}
                  <span>PDF</span>
                </button>

                <Link
                  href={`/orders/new?fromCatalog=${catalog.id}`}
                  className="inline-flex items-center justify-center gap-1 px-2.5 py-2 text-xs font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors text-center"
                  title="Buat pesanan langsung dengan harga katalog ini"
                >
                  <ShoppingCart className="w-3.5 h-3.5" />
                  <span>Order</span>
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
