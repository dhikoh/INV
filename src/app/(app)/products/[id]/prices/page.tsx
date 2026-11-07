'use client';

import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft,
  History,
  TrendingUp,
  TrendingDown,
  ShieldAlert,
  Calendar,
  User,
} from 'lucide-react';
import { Skeleton, EmptyState, ErrorState } from '@/components/ui/States';
import { formatRupiah } from '@/lib/domain/money';

interface PriceHistoryEntry {
  id: string;
  productId: string;
  customerId: string | null;
  field: 'COST' | 'BASE' | 'MIN' | 'CUSTOMER_MIN';
  oldValue: number | null;
  newValue: number;
  reason: string;
  changedById: string;
  createdAt: string;
}

interface ProductDetail {
  id: string;
  sku: string;
  name: string;
  unit: string;
  costPrice?: number;
  basePrice: number;
  minPrice: number;
  marginAmount?: number;
  marginBps?: number;
}

export default function ProductPricesHistoryPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const productId = params?.id;

  const [userRole, setUserRole] = useState<'SUPERADMIN' | 'SALES' | null>(null);
  const [product, setProduct] = useState<ProductDetail | null>(null);
  const [histories, setHistories] = useState<PriceHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!productId) return;

    try {
      setLoading(true);
      setError(null);

      // Cek auth & role terlebih dahulu
      const meRes = await fetch('/api/v1/auth/me');
      if (!meRes.ok) {
        router.push('/login');
        return;
      }
      const meJson = await meRes.json();
      const role = meJson.data?.user?.role;
      setUserRole(role);

      if (role !== 'SUPERADMIN') {
        setError('Akses ditolak. Riwayat harga dan HPP hanya dapat diakses oleh Super Admin.');
        setLoading(false);
        return;
      }

      // Muat info produk dan riwayat harga secara paralel
      const [prodRes, histRes] = await Promise.all([
        fetch(`/api/v1/products/${productId}`),
        fetch(`/api/v1/products/${productId}/price-history`),
      ]);

      if (!prodRes.ok) {
        throw new Error('Gagal memuat informasi produk');
      }
      if (!histRes.ok) {
        if (histRes.status === 403) {
          throw new Error('Akses ditolak ke riwayat harga.');
        }
        throw new Error('Gagal memuat riwayat harga produk');
      }

      const prodJson = await prodRes.json();
      const histJson = await histRes.json();

      if (prodJson.ok && prodJson.data) {
        setProduct(prodJson.data);
      }
      if (histJson.ok && Array.isArray(histJson.data)) {
        setHistories(histJson.data);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Terjadi kesalahan sistem');
    } finally {
      setLoading(false);
    }
  }, [productId, router]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Format tanggal ke zona waktu WIB
  const formatWibDate = (isoString: string): string => {
    try {
      const d = new Date(isoString);
      return new Intl.DateTimeFormat('id-ID', {
        timeZone: 'Asia/Jakarta',
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }).format(d) + ' WIB';
    } catch {
      return isoString;
    }
  };

  const getFieldLabel = (field: PriceHistoryEntry['field']): { label: string; badgeClass: string } => {
    switch (field) {
      case 'COST':
        return {
          label: 'HPP / Modal',
          badgeClass: 'bg-purple-100 text-purple-800 border-purple-200',
        };
      case 'BASE':
        return {
          label: 'Harga Dasar',
          badgeClass: 'bg-blue-100 text-blue-800 border-blue-200',
        };
      case 'MIN':
        return {
          label: 'Harga Minimal',
          badgeClass: 'bg-amber-100 text-amber-800 border-amber-200',
        };
      case 'CUSTOMER_MIN':
        return {
          label: 'Floor Khusus Pelanggan',
          badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-200',
        };
      default:
        return {
          label: field,
          badgeClass: 'bg-slate-100 text-slate-800 border-slate-200',
        };
    }
  };

  if (loading) {
    return (
      <div className="space-y-6 max-w-5xl mx-auto px-2 sm:px-4 py-4">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  // Proteksi Akses Sales: tidak menampilkan data apapun bila bukan Super Admin
  if (userRole === 'SALES') {
    return (
      <div className="max-w-md mx-auto mt-12 p-6 bg-white rounded-xl border border-red-200 shadow-sm text-center space-y-4">
        <div className="w-12 h-12 rounded-full bg-red-100 text-red-600 mx-auto flex items-center justify-center">
          <ShieldAlert className="w-6 h-6" />
        </div>
        <h3 className="text-lg font-bold text-slate-900">Akses Dibatasi</h3>
        <p className="text-sm text-slate-600">
          Halaman riwayat perubahan harga dan HPP modal hanya dapat diakses oleh Super Administrator.
        </p>
        <Link
          href="/products"
          className="inline-flex items-center justify-center min-h-[44px] px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
        >
          Kembali ke Katalog Produk
        </Link>
      </div>
    );
  }

  if (error || !product) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-8">
        <ErrorState
          title="Gagal Memuat Riwayat Harga"
          message={error || 'Produk tidak ditemukan'}
          onRetry={loadData}
        />
        <div className="mt-4 text-center">
          <Link
            href="/products"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:text-blue-800"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Kembali ke Katalog Produk</span>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto px-2 sm:px-4 py-4">
      {/* Tombol Kembali & Header */}
      <div className="flex flex-col gap-2">
        <Link
          href="/products"
          className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-slate-800 transition-colors w-fit min-h-[44px]"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Kembali ke Katalog Produk</span>
        </Link>

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs font-bold bg-blue-100 text-blue-800 px-2 py-0.5 rounded">
                {product.sku}
              </span>
              <h1 className="text-xl sm:text-2xl font-bold text-slate-900">
                {product.name}
              </h1>
            </div>
            <p className="text-xs sm:text-sm text-slate-500 mt-1">
              Audit log riwayat penyesuaian harga dan alasan bisnis (Seksi 10.3).
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <span className="px-3 py-1 bg-purple-50 text-purple-700 border border-purple-200 rounded-lg text-xs font-semibold flex items-center gap-1.5">
              <History className="w-4 h-4" />
              <span>{histories.length} Catatan Perubahan</span>
            </span>
          </div>
        </div>
      </div>

      {/* Ringkasan Harga Berlaku Saat Ini */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <span className="text-xs text-slate-500 block mb-1">HPP / Modal Aktif</span>
          <div className="text-lg font-bold font-mono text-purple-700">
            {formatRupiah(product.costPrice ?? 0)}
          </div>
          <span className="text-[11px] text-slate-400">Modal pokok per {product.unit}</span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <span className="text-xs text-slate-500 block mb-1">Harga Dasar Aktif</span>
          <div className="text-lg font-bold font-mono text-blue-700">
            {formatRupiah(product.basePrice)}
          </div>
          <span className="text-[11px] text-slate-400">Patokan standar penjualan</span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <span className="text-xs text-slate-500 block mb-1">Harga Minimal Aktif</span>
          <div className="text-lg font-bold font-mono text-amber-700">
            {formatRupiah(product.minPrice)}
          </div>
          <span className="text-[11px] text-slate-400">Batas bawah negosiasi sales</span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <span className="text-xs text-slate-500 block mb-1">Margin Keuntungan</span>
          <div className="text-lg font-bold font-mono text-emerald-700">
            +{formatRupiah(product.marginAmount ?? 0)}
          </div>
          <span className="text-[11px] text-emerald-600 font-medium">
            {((product.marginBps ?? 0) / 100).toFixed(1)}% dari harga dasar
          </span>
        </div>
      </div>

      {/* Kronologi Perubahan Harga */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
          <h3 className="font-semibold text-slate-800 text-sm flex items-center gap-2">
            <History className="w-4 h-4 text-slate-500" />
            <span>Kronologi Riwayat Perubahan</span>
          </h3>
          <span className="text-xs text-slate-400">Diurutkan dari yang terbaru</span>
        </div>

        {histories.length === 0 ? (
          <div className="p-8 text-center">
            <EmptyState
              title="Belum Ada Riwayat Perubahan"
              description="Harga produk ini belum pernah diubah sejak pertama kali didaftarkan."
            />
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {histories.map((h) => {
              const fieldInfo = getFieldLabel(h.field);
              const isIncrease = h.oldValue !== null && h.newValue > h.oldValue;
              const isDecrease = h.oldValue !== null && h.newValue < h.oldValue;
              const diff = h.oldValue !== null ? h.newValue - h.oldValue : null;

              return (
                <div
                  key={h.id}
                  className="p-4 sm:p-5 hover:bg-slate-50/70 transition-colors flex flex-col sm:flex-row sm:items-start justify-between gap-4"
                >
                  <div className="space-y-2 flex-1 min-w-0">
                    {/* Baris Badge & Tanggal */}
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border ${fieldInfo.badgeClass}`}
                      >
                        {fieldInfo.label}
                      </span>

                      <div className="flex items-center gap-1 text-xs text-slate-400">
                        <Calendar className="w-3.5 h-3.5" />
                        <span>{formatWibDate(h.createdAt)}</span>
                      </div>
                    </div>

                    {/* Harga Lama -> Baru */}
                    <div className="flex items-baseline gap-2 pt-1">
                      {h.oldValue !== null ? (
                        <>
                          <span className="font-mono text-sm text-slate-400 line-through">
                            {formatRupiah(h.oldValue)}
                          </span>
                          <span className="text-xs text-slate-400">➔</span>
                          <span className="font-mono text-base sm:text-lg font-bold text-slate-900">
                            {formatRupiah(h.newValue)}
                          </span>

                          {diff !== null && (
                            <span
                              className={`inline-flex items-center gap-0.5 text-xs font-semibold px-2 py-0.5 rounded ${
                                isIncrease
                                  ? 'bg-emerald-50 text-emerald-700'
                                  : isDecrease
                                  ? 'bg-rose-50 text-rose-700'
                                  : 'bg-slate-100 text-slate-600'
                              }`}
                            >
                              {isIncrease ? (
                                <TrendingUp className="w-3 h-3" />
                              ) : isDecrease ? (
                                <TrendingDown className="w-3 h-3" />
                              ) : null}
                              {diff > 0 ? `+${formatRupiah(diff)}` : formatRupiah(diff)}
                            </span>
                          )}
                        </>
                      ) : (
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium text-slate-500">Harga Awal:</span>
                          <span className="font-mono text-base font-bold text-slate-900">
                            {formatRupiah(h.newValue)}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Alasan Perubahan (priceReason) */}
                    <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 text-xs sm:text-sm text-slate-700">
                      <span className="font-semibold text-slate-500 block text-[11px] mb-0.5">
                        Alasan Perubahan:
                      </span>
                      <p className="whitespace-pre-line leading-relaxed font-sans">{h.reason}</p>
                    </div>
                  </div>

                  {/* Info Pengubah */}
                  <div className="shrink-0 text-left sm:text-right pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100">
                    <div className="inline-flex sm:flex-col items-center sm:items-end gap-1 text-xs text-slate-500">
                      <div className="flex items-center gap-1 text-slate-600 font-medium">
                        <User className="w-3.5 h-3.5 text-slate-400" />
                        <span>Diubah oleh</span>
                      </div>
                      <span className="font-mono text-[11px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
                        {h.changedById}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
