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
  Copy,
  ExternalLink,
  ShieldCheck,
  Sparkles,
  LayoutGrid,
  Table as TableIcon,
  Flame,
  BookOpen,
  SlidersHorizontal,
} from 'lucide-react';
import { Skeleton } from '@/components/ui/States';
import { MoneyInput } from '@/components/ui/MoneyInput';
import { formatRupiah } from '@/lib/domain/money';
import { PatenPrice } from '@/components/ui/PatenPrice';
import { FloorSource } from '@/lib/domain/pricing';
import { useIsOnline } from '@/components/pwa/OfflineBanner';
import { formatDateId } from '@/lib/format/date';

type LayoutStyle = 'TABLE' | 'PROMO_GRID' | 'HERO_SALE' | 'EDITORIAL';
type PromoValidityType = 'NONE' | 'PERIOD';

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
  badgeText?: string | null;
  itemNote?: string | null;
  floorSource?: FloorSource;
  catalogPrice?: number;
  patenPrice?: number;
}

interface CatalogDetail {
  id: string;
  title: string;
  subtitle?: string | null;
  promoHighlight?: string | null;
  layoutStyle: LayoutStyle;
  isPromo: boolean;
  promoValidityType: PromoValidityType;
  promoStartAt?: string | null;
  promoEndAt?: string | null;
  validityText?: string | null;
  showStrikethroughPrice: boolean;
  showSku: boolean;
  ctaText?: string | null;
  termsNote?: string | null;
  note: string | null;
  verifyToken: string;
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
  sync?: {
    newProducts: number;
    belowFloor: number;
    inactive: number;
  };
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
  const [editableBadges, setEditableBadges] = useState<Map<string, string>>(new Map());
  const [editableNotes, setEditableNotes] = useState<Map<string, string>>(new Map());
  const [savingItems, setSavingItems] = useState(false);

  // Edit metadata modal
  const [showEditMetaModal, setShowEditMetaModal] = useState(false);
  const [metaTitle, setMetaTitle] = useState('');
  const [metaSubtitle, setMetaSubtitle] = useState('');
  const [metaHighlight, setMetaHighlight] = useState('');
  const [metaLayoutStyle, setMetaLayoutStyle] = useState<LayoutStyle>('TABLE');
  const [metaIsPromo, setMetaIsPromo] = useState(false);
  const [metaValidityType, setMetaValidityType] = useState<PromoValidityType>('NONE');
  const [metaStartAt, setMetaStartAt] = useState('');
  const [metaEndAt, setMetaEndAt] = useState('');
  const [metaValidityText, setMetaValidityText] = useState('');
  const [metaStrikethrough, setMetaStrikethrough] = useState(true);
  const [metaShowSku, setMetaShowSku] = useState(true);
  const [metaCtaText, setMetaCtaText] = useState('');
  const [metaTermsNote, setMetaTermsNote] = useState('');
  const [metaNote, setMetaNote] = useState('');
  const [savingMeta, setSavingMeta] = useState(false);
  const [copiedVerify, setCopiedVerify] = useState(false);

  // Action states
  const isOnline = useIsOnline();
  const [isOfflineView, setIsOfflineView] = useState(false);
  const [adjustingMin, setAdjustingMin] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [offlineSaved, setOfflineSaved] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Sync state (Addendum v2)
  const [syncing, setSyncing] = useState(false);
  const [showSyncModal, setShowSyncModal] = useState(false);
  const [syncAddNew, setSyncAddNew] = useState(true);
  const [syncRaiseFloor, setSyncRaiseFloor] = useState(true);

  const fetchCatalog = useCallback(async () => {
    if (!catalogId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/catalogs/${catalogId}`);
      if (!res.ok) {
        // Coba fallback offline dari cache lokal bila gagal atau offline (Seksi 15.3)
        try {
          const offlineRaw = localStorage.getItem(`catalog_offline_${catalogId}`);
          if (offlineRaw) {
            const offlineData = JSON.parse(offlineRaw);
            setCatalog(offlineData);
            setIsOfflineView(true);
            return;
          }
        } catch {
          // Abaikan
        }

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
        setIsOfflineView(false);
        const priceMap = new Map<string, number>();
        const badgeMap = new Map<string, string>();
        const noteMap = new Map<string, string>();
        json.data.items.forEach((it: CatalogDetailItem) => {
          priceMap.set(it.productId, it.price);
          badgeMap.set(it.productId, it.badgeText || '');
          noteMap.set(it.productId, it.itemNote || '');
        });
        setEditablePrices(priceMap);
        setEditableBadges(badgeMap);
        setEditableNotes(noteMap);
      }
    } catch {
      // Coba fallback offline dari cache lokal
      try {
        const offlineRaw = localStorage.getItem(`catalog_offline_${catalogId}`);
        if (offlineRaw) {
          const offlineData = JSON.parse(offlineRaw);
          setCatalog(offlineData);
          setIsOfflineView(true);
          return;
        }
      } catch {
        // Abaikan
      }
      setError('Terjadi kesalahan jaringan atau perangkat sedang offline.');
    } finally {
      setLoading(false);
    }
  }, [catalogId]);

  const openEditMetaModal = () => {
    if (!catalog) return;
    setMetaTitle(catalog.title || '');
    setMetaSubtitle(catalog.subtitle || '');
    setMetaHighlight(catalog.promoHighlight || '');
    setMetaLayoutStyle(catalog.layoutStyle || 'TABLE');
    setMetaIsPromo(Boolean(catalog.isPromo));
    setMetaValidityType(catalog.promoValidityType || 'NONE');
    setMetaStartAt(catalog.promoStartAt ? catalog.promoStartAt.split('T')[0] : '');
    setMetaEndAt(catalog.promoEndAt ? catalog.promoEndAt.split('T')[0] : '');
    setMetaValidityText(catalog.validityText || '');
    setMetaStrikethrough(catalog.showStrikethroughPrice ?? true);
    setMetaShowSku(catalog.showSku ?? true);
    setMetaCtaText(catalog.ctaText || '');
    setMetaTermsNote(catalog.termsNote || '');
    setMetaNote(catalog.note || '');
    setShowEditMetaModal(true);
  };

  const handleSaveMeta = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!catalog || savingMeta) return;

    setSavingMeta(true);
    try {
      const payload = {
        title: metaTitle.trim(),
        subtitle: metaSubtitle.trim() || null,
        promoHighlight: metaHighlight.trim() || null,
        layoutStyle: metaLayoutStyle,
        isPromo: metaIsPromo,
        promoValidityType: metaIsPromo ? metaValidityType : 'NONE',
        promoStartAt:
          metaIsPromo && metaValidityType === 'PERIOD' && metaStartAt
            ? new Date(metaStartAt + 'T00:00:00Z').toISOString()
            : null,
        promoEndAt:
          metaIsPromo && metaValidityType === 'PERIOD' && metaEndAt
            ? new Date(metaEndAt + 'T23:59:59Z').toISOString()
            : null,
        validityText: metaIsPromo && metaValidityText.trim() ? metaValidityText.trim() : null,
        showStrikethroughPrice: metaStrikethrough,
        showSku: metaShowSku,
        ctaText: metaCtaText.trim() || null,
        termsNote: metaTermsNote.trim() || null,
        note: metaNote.trim() || null,
      };

      const res = await fetch(`/api/v1/catalogs/${catalog.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Origin: window.location.origin,
        },
        body: JSON.stringify(payload),
      });

      const json = await res.json();
      if (!res.ok) {
        showToast(json?.error?.message || 'Gagal menyimpan pengaturan katalog.');
        return;
      }

      setShowEditMetaModal(false);
      fetchCatalog();
      showToast('Pengaturan katalog dan tata letak berhasil diperbarui.');
    } catch {
      showToast('Terjadi kesalahan jaringan.');
    } finally {
      setSavingMeta(false);
    }
  };

  const handleCopyVerifyLink = () => {
    if (!catalog?.verifyToken) return;
    const url = `${window.location.origin}/verify/${catalog.verifyToken}`;
    navigator.clipboard.writeText(url);
    setCopiedVerify(true);
    showToast('Tautan verifikasi publik disalin ke clipboard.');
    setTimeout(() => setCopiedVerify(false), 3000);
  };

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

  // Sinkronkan katalog (POST /sync - Addendum v2)
  const handleSync = async () => {
    if (!catalog) return;
    if (!syncAddNew && !syncRaiseFloor) {
      showToast('Pilih minimal satu opsi sinkronisasi.');
      return;
    }
    setSyncing(true);
    try {
      const res = await fetch(`/api/v1/catalogs/${catalog.id}/sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: window.location.origin,
        },
        body: JSON.stringify({
          addNewProducts: syncAddNew,
          raiseToFloor: syncRaiseFloor,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        showToast(json?.error?.message || 'Gagal menyinkronkan katalog.');
        return;
      }
      setShowSyncModal(false);
      showToast(
        `Sinkronisasi selesai: ${json.data.added} produk baru ditambahkan, ${json.data.updated} harga diperbarui.`
      );
      fetchCatalog();
    } catch {
      showToast('Terjadi kesalahan jaringan.');
    } finally {
      setSyncing(false);
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
          `Harga untuk "${item.name}" tidak boleh di bawah harga paten (${formatRupiah(
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
          badgeText: editableBadges.get(it.productId)?.trim() || null,
          itemNote: editableNotes.get(it.productId)?.trim() || null,
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

  // PWA Offline Caching Simpan (Seksi 15.3 & 17.5 nomor 5)
  const handleSaveForOffline = () => {
    if (!catalog) return;
    try {
      const offlineKey = `catalog_offline_${catalog.id}`;
      localStorage.setItem(offlineKey, JSON.stringify(catalog));

      // Kirim pesan SAVE_CATALOG ke Service Worker untuk menyimpan respons API dan aset foto
      if (typeof window !== 'undefined' && 'serviceWorker' in navigator && navigator.serviceWorker.controller) {
        const urlsToCache = [
          `/api/v1/catalogs/${catalog.id}`,
          ...catalog.items
            .filter((it) => it.imagePath)
            .map((it) => `/api/v1/files/${it.imagePath}`),
        ];

        navigator.serviceWorker.controller.postMessage({
          type: 'SAVE_CATALOG',
          userId: catalog.ownerId,
          urls: urlsToCache,
        });
      }

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
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl md:text-2xl font-bold text-slate-900 tracking-tight">
                {catalog.title}
              </h1>
              <span className="px-2.5 py-0.5 rounded text-xs font-semibold bg-emerald-100 text-emerald-800">
                {catalog.itemCount} Produk
              </span>
              {catalog.isPromo && (
                <span className="px-2.5 py-0.5 rounded text-xs font-bold bg-amber-100 text-amber-900 flex items-center gap-1">
                  <Sparkles className="w-3 h-3 text-amber-600" />
                  PROMO
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Dibuat oleh {catalog.ownerName} • {formatDateId(catalog.createdAt, 'compact')}
            </p>
          </div>
        </div>

        {/* Tombol Utama */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Link Verifikasi Publik */}
          <div className="flex items-center gap-1 bg-white border border-slate-300 rounded-lg p-0.5">
            <a
              href={`/verify/${catalog.verifyToken}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-emerald-700 hover:text-emerald-800 text-xs font-semibold rounded transition-colors"
              title="Buka Halaman Verifikasi QR Publik"
            >
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
              <span>Verifikasi QR</span>
              <ExternalLink className="w-3 h-3 text-slate-400" />
            </a>
            <button
              type="button"
              onClick={handleCopyVerifyLink}
              className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded transition-colors"
              title="Salin Tautan Verifikasi"
            >
              {copiedVerify ? (
                <Check className="w-3.5 h-3.5 text-emerald-600" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
            </button>
          </div>

          <button
            type="button"
            onClick={openEditMetaModal}
            disabled={!isOnline}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors"
            title="Ubah template tata letak, judul, dan pengaturan promo"
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span>Pengaturan & Desain</span>
          </button>

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
            onClick={() => setShowSyncModal(true)}
            disabled={syncing || !isOnline}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-indigo-800 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-lg transition-colors"
            title="Sinkronkan produk baru dan sesuaikan harga ke harga paten"
          >
            {syncing ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <RefreshCw className="w-3.5 h-3.5" />
            )}
            <span>Sinkronkan</span>
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

      {/* Banner Mode Offline */}
      {isOfflineView && (
        <div className="p-4 rounded-xl bg-blue-50 border border-blue-200 text-blue-950 flex items-center gap-3 shadow-sm">
          <DownloadCloud className="w-5 h-5 text-blue-600 shrink-0" />
          <div className="text-xs md:text-sm">
            <p className="font-bold text-blue-950">Menampilkan Salinan Offline</p>
            <p className="text-blue-700 mt-0.5">
              Katalog ini dibuka dari penyimpanan offline perangkat Anda. Perubahan harga dinonaktifkan hingga koneksi internet kembali pulih.
            </p>
          </div>
        </div>
      )}

      {/* Banner Sinkronisasi Otomatis (Addendum v2) */}
      {catalog.sync && (catalog.sync.newProducts > 0 || catalog.sync.belowFloor > 0) && (
        <div className="p-4 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-950 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm">
          <div className="flex items-start gap-3">
            <RefreshCw className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-sm text-indigo-950">
                Pembaruan Tersedia untuk Katalog Ini
              </p>
              <div className="text-xs text-indigo-800 mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5">
                {catalog.sync.newProducts > 0 && (
                  <span>
                    • Ada <strong>{catalog.sync.newProducts}</strong> produk aktif baru belum masuk katalog.
                  </span>
                )}
                {catalog.sync.belowFloor > 0 && (
                  <span>
                    • Ada <strong>{catalog.sync.belowFloor}</strong> produk dengan harga di bawah paten terkini.
                  </span>
                )}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowSyncModal(true)}
            disabled={syncing || !isOnline}
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg shadow-sm transition-colors shrink-0 disabled:opacity-50"
          >
            {syncing ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <RefreshCw className="w-3.5 h-3.5" />
            )}
            <span>Sinkronkan Sekarang</span>
          </button>
        </div>
      )}

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
            disabled={adjustingMin || !isOnline}
            title={!isOnline ? 'Koneksi internet diperlukan untuk menyesuaikan harga' : undefined}
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-lg shadow-sm transition-colors shrink-0 disabled:opacity-50"
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

      {/* Detail Informasi & Konfigurasi Desain */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
          <div>
            <span className="text-xs text-slate-500 font-medium uppercase tracking-wider block">
              Template Tata Letak PDF
            </span>
            <div className="mt-1 flex items-center gap-2">
              <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-slate-100 text-slate-800 border border-slate-200 inline-flex items-center gap-1.5">
                {catalog.layoutStyle === 'TABLE' && <TableIcon className="w-3.5 h-3.5 text-slate-600" />}
                {catalog.layoutStyle === 'PROMO_GRID' && <LayoutGrid className="w-3.5 h-3.5 text-blue-600" />}
                {catalog.layoutStyle === 'HERO_SALE' && <Flame className="w-3.5 h-3.5 text-amber-600" />}
                {catalog.layoutStyle === 'EDITORIAL' && <BookOpen className="w-3.5 h-3.5 text-purple-600" />}
                <span>
                  {catalog.layoutStyle === 'TABLE' && 'Tabel Formal B2B'}
                  {catalog.layoutStyle === 'PROMO_GRID' && 'Grid Promo Retail'}
                  {catalog.layoutStyle === 'HERO_SALE' && 'Hero Promo Banner'}
                  {catalog.layoutStyle === 'EDITORIAL' && 'Lookbook Editorial'}
                </span>
              </span>
            </div>
          </div>

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
              Status Promo
            </span>
            {catalog.isPromo ? (
              <div className="text-xs text-amber-900 font-semibold mt-1 space-y-0.5">
                <p>
                  {catalog.promoValidityType === 'PERIOD'
                    ? `Periode: ${catalog.validityText || 'Rentang Tanggal'}`
                    : 'Selama Persediaan Ada (Tanpa Batas Tanggal)'}
                </p>
                {catalog.promoHighlight && (
                  <p className="text-[11px] text-amber-700 font-bold">
                    Highlight: {catalog.promoHighlight}
                  </p>
                )}
              </div>
            ) : (
              <p className="text-slate-600 text-xs mt-1">Pricelist Standar (Bukan Promo)</p>
            )}
          </div>
        </div>

        {(catalog.subtitle || catalog.note || catalog.termsNote || catalog.ctaText) && (
          <div className="pt-3 border-t border-slate-100 grid grid-cols-1 md:grid-cols-2 gap-3 text-xs text-slate-600">
            {catalog.subtitle && (
              <div>
                <span className="font-semibold text-slate-700">Subjudul:</span> {catalog.subtitle}
              </div>
            )}
            {catalog.ctaText && (
              <div>
                <span className="font-semibold text-slate-700">Call to Action:</span> {catalog.ctaText}
              </div>
            )}
            {catalog.termsNote && (
              <div className="col-span-full">
                <span className="font-semibold text-slate-700">Syarat & Ketentuan:</span> {catalog.termsNote}
              </div>
            )}
            {catalog.note && (
              <div className="col-span-full italic text-slate-500">
                <span className="font-semibold text-slate-700 not-italic">Catatan:</span> {catalog.note}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Tabel Baris Produk */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="font-bold text-slate-900 text-base">Daftar Produk & Harga</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Harga di bawah adalah harga penawaran yang tampil pada katalog PDF resmi.
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
                disabled={!isOnline}
                title={!isOnline ? 'Koneksi internet diperlukan untuk mengubah harga' : undefined}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Edit2 className="w-3.5 h-3.5" />
                <span>Ubah Harga & Badge</span>
              </button>
            )}
          </div>
        </div>

        <div className="divide-y divide-slate-200">
          {catalog.items.map((item, idx) => {
            const currentPrice = editablePrices.get(item.productId) ?? item.price;
            const currentBadge = editableBadges.get(item.productId) ?? item.badgeText ?? '';
            const currentItemNote = editableNotes.get(item.productId) ?? item.itemNote ?? '';
            const isItemStale = item.isStale || currentPrice < item.floorPrice;
            const hasStrikePrice =
              catalog.showStrikethroughPrice && Number(item.basePrice) > currentPrice;

            return (
              <div
                key={item.id}
                className={`p-4 flex flex-col gap-3 ${
                  isItemStale ? 'bg-amber-50/50' : 'hover:bg-slate-50/50'
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-3 flex-1">
                    <span className="text-xs font-semibold text-slate-400 w-5">
                      {idx + 1}.
                    </span>

                    {/* Thumbnail Foto Produk */}
                    <div className="w-12 h-12 bg-slate-100 rounded-lg border border-slate-200 overflow-hidden flex items-center justify-center shrink-0">
                      {item.imagePath ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={`/api/v1/files/${item.imagePath}`}
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
                      <div className="flex flex-wrap items-center gap-2">
                        <h4 className="text-sm font-semibold text-slate-900 leading-snug">
                          {item.name}
                        </h4>
                        {!isEditingItems && item.badgeText && (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-900">
                            {item.badgeText}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-500 flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5 items-center">
                        {catalog.showSku && <span>SKU: {item.sku}</span>}
                        <span>Satuan: {item.unit}</span>
                        <PatenPrice value={item.floorPrice} source={item.floorSource} />
                        {isItemStale && (
                          <span className="text-amber-700 font-semibold flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3" />
                            Di bawah harga paten!
                          </span>
                        )}
                      </div>
                      {!isEditingItems && item.itemNote && (
                        <p className="text-xs text-slate-500 italic mt-0.5">
                          Ket: {item.itemNote}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-3 ml-8 sm:ml-0">
                    {isEditingItems ? (
                      <div className="w-40">
                        <label className="block text-[10px] text-slate-400 mb-0.5">Harga Jual</label>
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
                        {hasStrikePrice && (
                          <span className="text-xs text-slate-400 line-through block">
                            {formatRupiah(item.basePrice)}
                          </span>
                        )}
                        <span className="text-sm font-bold text-slate-900">
                          {formatRupiah(item.price)}
                        </span>
                        <span className="text-xs text-slate-400 block">/ {item.unit}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Edit Badge & Catatan Item saat mode ubah */}
                {isEditingItems && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2 border-t border-slate-100 ml-8">
                    <div>
                      <label className="block text-[10px] font-medium text-slate-500 mb-0.5">
                        Badge Produk (Misal: SPECIAL PRICE / HEMAT 10rb)
                      </label>
                      <input
                        type="text"
                        value={currentBadge}
                        onChange={(e) => {
                          const nextMap = new Map(editableBadges);
                          nextMap.set(item.productId, e.target.value);
                          setEditableBadges(nextMap);
                        }}
                        maxLength={40}
                        placeholder="Tampil di badge kartu produk"
                        className="w-full px-2.5 py-1 text-xs border border-slate-200 rounded bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-medium text-slate-500 mb-0.5">
                        Catatan / Varian Kemasan (Misal: 500g / Isi 10)
                      </label>
                      <input
                        type="text"
                        value={currentItemNote}
                        onChange={(e) => {
                          const nextMap = new Map(editableNotes);
                          nextMap.set(item.productId, e.target.value);
                          setEditableNotes(nextMap);
                        }}
                        maxLength={120}
                        placeholder="Keterangan tambahan produk"
                        className="w-full px-2.5 py-1 text-xs border border-slate-200 rounded bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                      />
                    </div>
                  </div>
                )}
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
          disabled={deleting || !isOnline}
          title={!isOnline ? 'Koneksi internet diperlukan untuk menghapus katalog' : undefined}
          className="inline-flex items-center gap-1 text-red-600 hover:text-red-700 hover:underline font-medium disabled:opacity-50 disabled:no-underline disabled:cursor-not-allowed"
        >
          {deleting ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Trash2 className="w-3.5 h-3.5" />
          )}
          <span>Hapus Katalog Ini</span>
        </button>
      </div>

      {/* Modal Pengaturan & Tata Letak Katalog */}
      {showEditMetaModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in overflow-y-auto">
          <div className="bg-white w-full max-w-2xl rounded-2xl shadow-xl border border-slate-200 overflow-hidden my-8 max-h-[90vh] flex flex-col">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <SlidersHorizontal className="w-5 h-5 text-emerald-600" />
                <h3 className="font-bold text-slate-900 text-base">
                  Pengaturan Desain & Promo Katalog
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowEditMetaModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveMeta} className="p-5 space-y-4 text-sm text-slate-700 overflow-y-auto flex-1">
              {/* Template Tata Letak */}
              <div>
                <label className="block text-xs font-semibold text-slate-800 mb-1.5 uppercase tracking-wider">
                  Template Tata Letak PDF
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {[
                    {
                      id: 'TABLE' as LayoutStyle,
                      title: 'Tabel Formal B2B',
                      desc: 'Pricelist formal, padat, cocok untuk agen & mitra.',
                      icon: TableIcon,
                    },
                    {
                      id: 'PROMO_GRID' as LayoutStyle,
                      title: 'Grid Promo Retail',
                      desc: 'Kartu 3 kolom berbingkai dengan badge diskon ala retail.',
                      icon: LayoutGrid,
                    },
                    {
                      id: 'HERO_SALE' as LayoutStyle,
                      title: 'Hero Promo Banner',
                      desc: 'Header hero mencolok dengan persentase & banner penawaran.',
                      icon: Flame,
                    },
                    {
                      id: 'EDITORIAL' as LayoutStyle,
                      title: 'Lookbook Editorial',
                      desc: 'Minimalis elegan dengan tipografi bersih & ruang lapang.',
                      icon: BookOpen,
                    },
                  ].map((t) => {
                    const isSelected = metaLayoutStyle === t.id;
                    const Icon = t.icon;
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setMetaLayoutStyle(t.id)}
                        className={`p-3 rounded-xl border text-left transition-all flex items-start gap-3 ${
                          isSelected
                            ? 'border-emerald-600 bg-emerald-50/50 ring-2 ring-emerald-500 shadow-sm'
                            : 'border-slate-200 hover:border-slate-300 bg-white'
                        }`}
                      >
                        <div className="p-2 rounded-lg bg-slate-100 text-slate-700 shrink-0 mt-0.5">
                          <Icon className="w-4 h-4" />
                        </div>
                        <div>
                          <p className="text-xs font-bold text-slate-900">{t.title}</p>
                          <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">{t.desc}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Judul & Subjudul */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-100">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Judul Katalog <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={metaTitle}
                    onChange={(e) => setMetaTitle(e.target.value)}
                    maxLength={60}
                    required
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Subjudul Katalog
                  </label>
                  <input
                    type="text"
                    value={metaSubtitle}
                    onChange={(e) => setMetaSubtitle(e.target.value)}
                    maxLength={120}
                    placeholder="Contoh: Spesial Akhir Pekan"
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              {/* Promo Toggle & Pengaturan */}
              <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/50 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-amber-600" />
                      Aktifkan Fitur Promo
                    </h4>
                    <p className="text-[11px] text-slate-500">
                      Tampilkan banner promosi, highlight diskon, dan coretan harga asal di PDF.
                    </p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={metaIsPromo}
                      onChange={(e) => setMetaIsPromo(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-10 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-600"></div>
                  </label>
                </div>

                {metaIsPromo && (
                  <div className="pt-2 border-t border-slate-200 space-y-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Highlight Promo (Tampil Mencolok)
                      </label>
                      <input
                        type="text"
                        value={metaHighlight}
                        onChange={(e) => setMetaHighlight(e.target.value)}
                        maxLength={80}
                        placeholder="Contoh: DISKON HINGGA 40%, HARGA GEBYAR"
                        className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-sm bg-white"
                      />
                    </div>

                    <div className="p-3 bg-white rounded-lg border border-slate-200 space-y-2">
                      <label className="block text-xs font-semibold text-slate-800">
                        Masa Berlaku Promo
                      </label>
                      <div className="flex flex-wrap gap-4 text-xs">
                        <label className="inline-flex items-center gap-1.5 cursor-pointer">
                          <input
                            type="radio"
                            name="metaPromoValidityType"
                            value="NONE"
                            checked={metaValidityType === 'NONE'}
                            onChange={() => setMetaValidityType('NONE')}
                            className="text-emerald-600 focus:ring-emerald-500"
                          />
                          <span>Selama Persediaan Ada (Tanpa Batas Tanggal)</span>
                        </label>
                        <label className="inline-flex items-center gap-1.5 cursor-pointer">
                          <input
                            type="radio"
                            name="metaPromoValidityType"
                            value="PERIOD"
                            checked={metaValidityType === 'PERIOD'}
                            onChange={() => setMetaValidityType('PERIOD')}
                            className="text-emerald-600 focus:ring-emerald-500"
                          />
                          <span>Berdasarkan Rentang Tanggal</span>
                        </label>
                      </div>

                      {metaValidityType === 'PERIOD' && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                          <div>
                            <label className="block text-[10px] text-slate-500 mb-0.5">Mulai</label>
                            <input
                              type="date"
                              value={metaStartAt}
                              onChange={(e) => setMetaStartAt(e.target.value)}
                              className="w-full px-2.5 py-1 text-xs border border-slate-300 rounded bg-white"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] text-slate-500 mb-0.5">Berakhir</label>
                            <input
                              type="date"
                              value={metaEndAt}
                              onChange={(e) => setMetaEndAt(e.target.value)}
                              className="w-full px-2.5 py-1 text-xs border border-slate-300 rounded bg-white"
                            />
                          </div>
                        </div>
                      )}

                      <div>
                        <label className="block text-[10px] text-slate-500 mb-0.5">
                          Teks Periode (Tampil di PDF)
                        </label>
                        <input
                          type="text"
                          value={metaValidityText}
                          onChange={(e) => setMetaValidityText(e.target.value)}
                          maxLength={120}
                          placeholder="Contoh: Periode: 1–15 Ramadhan 1447H"
                          className="w-full px-2.5 py-1 text-xs border border-slate-300 rounded bg-white"
                        />
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-4 text-xs">
                      <label className="inline-flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={metaStrikethrough}
                          onChange={(e) => setMetaStrikethrough(e.target.checked)}
                          className="text-emerald-600 rounded focus:ring-emerald-500"
                        />
                        <span>Coretan Harga Asal</span>
                      </label>
                      <label className="inline-flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={metaShowSku}
                          onChange={(e) => setMetaShowSku(e.target.checked)}
                          className="text-emerald-600 rounded focus:ring-emerald-500"
                        />
                        <span>Tampilkan Kode SKU</span>
                      </label>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[11px] text-slate-600 mb-0.5">Call to Action (CTA)</label>
                        <input
                          type="text"
                          value={metaCtaText}
                          onChange={(e) => setMetaCtaText(e.target.value)}
                          maxLength={100}
                          placeholder="Contoh: Hubungi Sales Kami Segera"
                          className="w-full px-2.5 py-1 text-xs border border-slate-300 rounded bg-white"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] text-slate-600 mb-0.5">Syarat & Ketentuan</label>
                        <input
                          type="text"
                          value={metaTermsNote}
                          onChange={(e) => setMetaTermsNote(e.target.value)}
                          maxLength={500}
                          placeholder="Contoh: *Selama persediaan masih ada"
                          className="w-full px-2.5 py-1 text-xs border border-slate-300 rounded bg-white"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Catatan Umum */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Catatan Tambahan Katalog (Opsional)
                </label>
                <textarea
                  value={metaNote}
                  onChange={(e) => setMetaNote(e.target.value)}
                  rows={2}
                  maxLength={500}
                  className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-sm bg-white"
                />
              </div>

              <div className="pt-3 border-t border-slate-200 flex justify-end gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setShowEditMetaModal(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 rounded-lg"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={savingMeta}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg disabled:opacity-50"
                >
                  {savingMeta && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>Simpan Perubahan</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Sinkronisasi Katalog (Addendum v2) */}
      {showSyncModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <RefreshCw className="w-5 h-5 text-indigo-600" />
                <h3 className="font-bold text-slate-900 text-base">
                  Sinkronkan Katalog
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowSyncModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
              >
                ✕
              </button>
            </div>

            <div className="p-5 space-y-4 text-sm text-slate-700">
              <p className="text-xs text-slate-500">
                Pilih operasi sinkronisasi yang ingin dijalankan pada katalog ini:
              </p>

              <label className="flex items-start gap-3 p-3 rounded-lg border border-slate-200 hover:bg-slate-50 cursor-pointer">
                <input
                  type="checkbox"
                  checked={syncAddNew}
                  onChange={(e) => setSyncAddNew(e.target.checked)}
                  className="mt-1 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                />
                <div>
                  <span className="font-semibold block text-slate-900">
                    Tambahkan Produk Aktif Baru
                  </span>
                  <span className="text-xs text-slate-500">
                    Menyalin produk master aktif yang belum ada di katalog ini. Produk yang sudah ada tidak akan diduplikasi.
                  </span>
                </div>
              </label>

              <label className="flex items-start gap-3 p-3 rounded-lg border border-slate-200 hover:bg-slate-50 cursor-pointer">
                <input
                  type="checkbox"
                  checked={syncRaiseFloor}
                  onChange={(e) => setSyncRaiseFloor(e.target.checked)}
                  className="mt-1 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                />
                <div>
                  <span className="font-semibold block text-slate-900">
                    Naikkan Harga di Bawah Paten
                  </span>
                  <span className="text-xs text-slate-500">
                    Menyesuaikan harga item yang berada di bawah harga paten terbaru. Harga produk lain yang sudah di atas paten tidak akan diubah.
                  </span>
                </div>
              </label>
            </div>

            <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-200 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowSyncModal(false)}
                className="px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-200 rounded-lg"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleSync}
                disabled={syncing || (!syncAddNew && !syncRaiseFloor)}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg disabled:opacity-50"
              >
                {syncing ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4" />
                )}
                <span>Jalankan Sinkronisasi</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
