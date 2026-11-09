'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  FileDown,
  ShoppingCart,
  Users,
  AlertTriangle,
  Trash2,
  Edit2,
  RefreshCw,
  Save,
  Loader2,
  DownloadCloud,
  Check,
} from 'lucide-react';
import { Skeleton } from '@/components/ui/States';
import { MoneyInput } from '@/components/ui/MoneyInput';
import { formatRupiah } from '@/lib/domain/money';

interface CustomerSummary {
  id: string;
  code: string;
  name: string;
}

interface CatalogDetailItem {
  id: string;
  productId: string;
  name: string;
  sku: string;
  unit: string;
  price: number;
  floorPrice: number;
  basePrice: number;
  isStale: boolean;
  isDeleted: boolean;
  imagePath: string | null;
}

interface CatalogDetail {
  id: string;
  title: string;
  note: string | null;
  customerId: string | null;
  customer: CustomerSummary | null;
  ownerId: string;
  ownerName: string;
  itemCount: number;
  hasStaleItems: boolean;
  staleItemsCount: number;
  items: CatalogDetailItem[];
  createdAt: string;
  updatedAt: string;
}

export default function CatalogDetailPage() {
  const params = useParams();
  const router = useRouter();
  const catalogId = params?.id as string;

  const [catalog, setCatalog] = useState<CatalogDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Edit items mode
  const [isEditingItems, setIsEditingItems] = useState(false);
  const [editablePrices, setEditablePrices] = useState<Map<string, number>>(new Map());
  const [savingItems, setSavingItems] = useState(false);

  // Action states
  const [adjustingMin, setAdjustingMin] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [offlineSaved, setOfflineSaved] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const fetchCatalog = useCallback(async () => {
    if (!catalogId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/catalogs/${catalogId}`);
      if (!res.ok) {
        if (res.status === 404) {
          setError('Katalog tidak ditemukan atau Anda tidak memiliki hak akses.');
        } else {
          setError('Gagal memuat detail katalog.');
        }
        return;
      }
      const json = await res.json();
      if (json.ok && json.data) {
        setCatalog(json.data);
        const map = new Map<string, number>();
        json.data.items.forEach((it: CatalogDetailItem) => {
          map.set(it.productId, it.price);
        });
        setEditablePrices(map);
      }
    } catch {
      setError('Terjadi kesalahan jaringan.');
    } finally {
      setLoading(false);
    }
  }, [catalogId]);

  useEffect(() => {
    fetchCatalog();
  }, [fetchCatalog]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 4000);
  };

  // Unduh PDF
  const handleDownloadPdf = async () => {
    if (!catalog) return;
    setDownloadingPdf(true);
    try {
      const res = await fetch(`/api/v1/catalogs/${catalog.id}/pdf`);
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        if (json?.error?.code === 'CATALOG_STALE') {
          showToast(
            'Katalog kedaluwarsa: Ada item di bawah harga minimal terbaru. Klik "Sesuaikan ke harga minimal" terlebih dahulu.'
          );
        } else {
          showToast(json?.error?.message || 'Gagal mengunduh PDF katalog.');
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
      showToast('Berkas PDF katalog berhasil diunduh.');
    } catch {
      showToast('Terjadi kesalahan saat mengunduh PDF.');
    } finally {
      setDownloadingPdf(false);
    }
  };

  // Sesuaikan seluruh item stale ke harga minimal terbaru (POST /adjust-min)
  const handleAdjustMin = async () => {
    if (!catalog) return;
    setAdjustingMin(true);
    try {
      const res = await fetch(`/api/v1/catalogs/${catalog.id}/adjust-min`, {
        method: 'POST',
        headers: { Origin: window.location.origin },
      });
      const json = await res.json();
      if (!res.ok) {
        showToast(json?.error?.message || 'Gagal menyesuaikan harga.');
        return;
      }
      setCatalog(json.data);
      const map = new Map<string, number>();
      json.data.items.forEach((it: CatalogDetailItem) => {
        map.set(it.productId, it.price);
      });
      setEditablePrices(map);
      showToast('Seluruh item berhasil disesuaikan ke harga minimal terbaru.');
    } catch {
      showToast('Terjadi kesalahan saat menyesuaikan harga.');
    } finally {
      setAdjustingMin(false);
    }
  };

  // Simpan perubahan harga item (PUT /items)
  const handleSaveItems = async () => {
    if (!catalog) return;

    // Periksa apakah ada harga di bawah floor
    for (const item of catalog.items) {
      const currentVal = editablePrices.get(item.productId) ?? item.price;
      if (currentVal < item.floorPrice) {
        showToast(
          `Harga untuk "${item.name}" tidak boleh di bawah harga minimal (${formatRupiah(
            item.floorPrice
          )}).`
        );
        return;
      }
    }

    setSavingItems(true);
    try {
      const payload = {
        items: catalog.items.map((it, idx) => ({
          productId: it.productId,
          price: editablePrices.get(it.productId) ?? it.price,
          sortOrder: idx,
        })),
      };

      const res = await fetch(`/api/v1/catalogs/${catalog.id}/items`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Origin: window.location.origin,
        },
        body: JSON.stringify(payload),
      });

      const json = await res.json();
      if (!res.ok) {
        showToast(json?.error?.message || 'Gagal menyimpan perubahan harga.');
        return;
      }

      setIsEditingItems(false);
      fetchCatalog();
      showToast('Harga produk katalog berhasil diperbarui.');
    } catch {
      showToast('Terjadi kesalahan jaringan.');
    } finally {
      setSavingItems(false);
    }
  };

  // Hapus Katalog (Soft Delete)
  const handleDeleteCatalog = async () => {
    if (!catalog) return;
    if (!window.confirm(`Yakin ingin menghapus katalog "${catalog.title}"?`)) return;

    setDeleting(true);
    try {
      const res = await fetch(`/api/v1/catalogs/${catalog.id}`, {
        method: 'DELETE',
        headers: { Origin: window.location.origin },
      });
      if (res.ok) {
        router.push('/catalogs');
      } else {
        const json = await res.json();
        showToast(json?.error?.message || 'Gagal menghapus katalog.');
      }
    } catch {
      showToast('Terjadi kesalahan jaringan.');
    } finally {
      setDeleting(false);
    }
  };

  // PWA Offline Caching Simpan
  const handleSaveForOffline = () => {
    if (!catalog) return;
    try {
      const offlineKey = `catalog_offline_${catalog.id}`;
      localStorage.setItem(offlineKey, JSON.stringify(catalog));
      setOfflineSaved(true);
      showToast('Katalog berhasil disimpan untuk akses offline di perangkat ini.');
      setTimeout(() => setOfflineSaved(false), 3000);
    } catch {
      showToast('Gagal menyimpan ke penyimpanan lokal offline.');
    }
  };

  if (loading) {
    return (
      <div className="w-full max-w-5xl mx-auto px-4 py-8 space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  if (error || !catalog) {
    return (
      <div className="w-full max-w-5xl mx-auto px-4 py-12 text-center space-y-4">
        <AlertTriangle className="w-10 h-10 text-amber-500 mx-auto" />
        <h2 className="text-lg font-bold text-slate-900">{error || 'Katalog tidak ditemukan'}</h2>
        <Link
          href="/catalogs"
          className="inline-flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 text-sm font-medium rounded-lg"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Kembali ke Daftar Katalog</span>
        </Link>
      </div>
    );
  }

  return (
    <div className="w-full max-w-5xl mx-auto px-4 py-6 md:py-8 space-y-6">
      {/* Toast Notifikasi */}
      {toastMessage && (
        <div className="fixed bottom-5 right-5 z-50 bg-slate-900 text-white px-4 py-3 rounded-xl shadow-lg text-sm max-w-md flex items-center justify-between gap-3 animate-in fade-in slide-in-from-bottom-2">
          <span>{toastMessage}</span>
          <button
            onClick={() => setToastMessage(null)}
            className="text-slate-400 hover:text-white font-bold"
          >
            ✕
          </button>
        </div>
      )}

      {/* Header & Aksi */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link
            href="/catalogs"
            className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl md:text-2xl font-bold text-slate-900 tracking-tight">
                {catalog.title}
              </h1>
              <span className="px-2.5 py-0.5 rounded text-xs font-semibold bg-emerald-100 text-emerald-800">
                {catalog.itemCount} Produk
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Dibuat oleh {catalog.ownerName} • {new Date(catalog.createdAt).toLocaleDateString('id-ID')}
            </p>
          </div>
        </div>

        {/* Tombol Utama */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleSaveForOffline}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors"
            title="Simpan untuk dibuka saat offline"
          >
            {offlineSaved ? (
              <Check className="w-3.5 h-3.5 text-emerald-600" />
            ) : (
              <DownloadCloud className="w-3.5 h-3.5" />
            )}
            <span>{offlineSaved ? 'Tersimpan' : 'Offline'}</span>
          </button>

          <button
            type="button"
            onClick={handleDownloadPdf}
            disabled={downloadingPdf}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg transition-colors"
          >
            {downloadingPdf ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <FileDown className="w-3.5 h-3.5" />
            )}
            <span>Unduh PDF</span>
          </button>

          <Link
            href={`/orders/new?fromCatalog=${catalog.id}`}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-sm transition-colors"
          >
            <ShoppingCart className="w-3.5 h-3.5" />
            <span>Buat Order</span>
          </Link>
        </div>
      </div>

      {/* Banner Peringatan STALE (Kedaluwarsa Harga Minimal) */}
      {catalog.hasStaleItems && (
        <div className="p-4 rounded-xl bg-amber-50 border border-amber-300 text-amber-950 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-sm text-amber-950">
                Katalog Kedaluwarsa ({catalog.staleItemsCount} Produk di Bawah Harga Minimal)
              </p>
              <p className="text-xs text-amber-800 mt-0.5">
                Super Admin telah menaikkan batas harga minimal produk setelah katalog ini dibuat.
                PDF tidak dapat dicetak sebelum harga disesuaikan.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleAdjustMin}
            disabled={adjustingMin}
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-lg shadow-sm transition-colors shrink-0"
          >
            {adjustingMin ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <RefreshCw className="w-3.5 h-3.5" />
            )}
            <span>Sesuaikan ke Harga Minimal</span>
          </button>
        </div>
      )}

      {/* Detail Informasi */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-xs text-slate-500 font-medium uppercase tracking-wider block">
              Sasaran Pelanggan
            </span>
            {catalog.customer ? (
              <div className="flex items-center gap-1.5 font-semibold text-blue-700 mt-1">
                <Users className="w-4 h-4" />
                <span>
                  {catalog.customer.name} ({catalog.customer.code})
                </span>
              </div>
            ) : (
              <p className="font-semibold text-slate-700 mt-1">
                Katalog Terbuka / Semua Pelanggan
              </p>
            )}
          </div>

          <div>
            <span className="text-xs text-slate-500 font-medium uppercase tracking-wider block">
              Catatan Katalog
            </span>
            <p className="text-slate-800 mt-1 italic text-xs md:text-sm">
              {catalog.note || 'Tidak ada catatan khusus.'}
            </p>
          </div>
        </div>
      </div>

      {/* Tabel Baris Produk */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="font-bold text-slate-900 text-base">Daftar Produk & Harga</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Harga di bawah adalah harga jual yang tampil di katalog penawaran.
            </p>
          </div>

          <div className="flex items-center gap-2">
            {isEditingItems ? (
              <>
                <button
                  type="button"
                  onClick={() => setIsEditingItems(false)}
                  className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg font-medium"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={handleSaveItems}
                  disabled={savingItems}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg shadow-sm"
                >
                  {savingItems ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Save className="w-3.5 h-3.5" />
                  )}
                  <span>Simpan Perubahan</span>
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setIsEditingItems(true)}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
              >
                <Edit2 className="w-3.5 h-3.5" />
                <span>Ubah Harga</span>
              </button>
            )}
          </div>
        </div>

        <div className="divide-y divide-slate-200">
          {catalog.items.map((item, idx) => {
            const currentPrice = editablePrices.get(item.productId) ?? item.price;
            const isItemStale = item.isStale || currentPrice < item.floorPrice;

            return (
              <div
                key={item.id}
                className={`p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                  isItemStale ? 'bg-amber-50/50' : 'hover:bg-slate-50/50'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="text-xs font-semibold text-slate-400 w-5">
                    {idx + 1}.
                  </span>

                  {/* Thumbnail Foto Produk (max 300px di PDF, thumbnail kecil di UI) */}
                  <div className="w-12 h-12 bg-slate-100 rounded-lg border border-slate-200 overflow-hidden flex items-center justify-center shrink-0">
                    {item.imagePath ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={`/api/v1/uploads/${item.imagePath}`}
                        alt={item.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <span className="text-xs font-bold text-slate-400">
                        {item.name.substring(0, 2).toUpperCase()}
                      </span>
                    )}
                  </div>

                  <div>
                    <h4 className="text-sm font-semibold text-slate-900 leading-snug">
                      {item.name}
                    </h4>
                    <div className="text-xs text-slate-500 flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
                      <span>SKU: {item.sku}</span>
                      <span>Satuan: {item.unit}</span>
                      {isItemStale && (
                        <span className="text-amber-700 font-semibold flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" />
                          Harga minimal terkini: {formatRupiah(item.floorPrice)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-3 ml-8 sm:ml-0">
                  {isEditingItems ? (
                    <div className="w-40">
                      <MoneyInput
                        value={currentPrice}
                        onChange={(val) => {
                          const nextMap = new Map(editablePrices);
                          nextMap.set(item.productId, val);
                          setEditablePrices(nextMap);
                        }}
                        className={`text-sm ${
                          currentPrice < item.floorPrice ? 'border-red-400 focus:ring-red-500' : ''
                        }`}
                      />
                    </div>
                  ) : (
                    <div className="text-right">
                      <span className="text-sm font-bold text-slate-900">
                        {formatRupiah(item.price)}
                      </span>
                      <span className="text-xs text-slate-400 block">/ {item.unit}</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Zona Bahaya / Hapus Katalog */}
      <div className="pt-4 flex justify-between items-center text-xs text-slate-400">
        <span>ID Katalog: {catalog.id}</span>
        <button
          type="button"
          onClick={handleDeleteCatalog}
          disabled={deleting}
          className="inline-flex items-center gap-1 text-red-600 hover:text-red-700 hover:underline font-medium"
        >
          {deleting ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Trash2 className="w-3.5 h-3.5" />
          )}
          <span>Hapus Katalog Ini</span>
        </button>
      </div>
    </div>
  );
}
