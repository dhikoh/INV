'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  WifiOff,
  BookOpen,
  RefreshCw,
  ExternalLink,
  ArrowRight,
  Package,
} from 'lucide-react';

interface OfflineCatalogItem {
  id: string;
  title: string;
  customerName?: string;
  itemCount: number;
  savedAt: string;
}

export default function OfflinePage() {
  const [offlineCatalogs, setOfflineCatalogs] = useState<OfflineCatalogItem[]>([]);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    // Muat daftar katalog yang telah disimpan di penyimpanan lokal offline
    try {
      const saved: OfflineCatalogItem[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('catalog_offline_')) {
          const raw = localStorage.getItem(key);
          if (raw) {
            const data = JSON.parse(raw);
            saved.push({
              id: data.id,
              title: data.title,
              customerName: data.customer?.name,
              itemCount: data.itemCount || data.items?.length || 0,
              savedAt: data.updatedAt || new Date().toISOString(),
            });
          }
        }
      }
      setOfflineCatalogs(saved);
    } catch {
      // Abaikan jika penyimpanan lokal tidak dapat diakses
    }
  }, []);

  const handleRetry = () => {
    setChecking(true);
    setTimeout(() => {
      window.location.reload();
    }, 600);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-2xl border border-slate-200 p-6 md:p-8 shadow-sm space-y-6 text-center">
        {/* Ikon Wifi Off */}
        <div className="w-16 h-16 bg-amber-50 text-amber-600 rounded-2xl flex items-center justify-center mx-auto shadow-inner">
          <WifiOff className="w-8 h-8" />
        </div>

        {/* Teks Informasi */}
        <div className="space-y-2">
          <h1 className="text-xl font-bold text-slate-900">Anda Sedang Offline</h1>
          <p className="text-sm text-slate-600">
            Koneksi internet Anda terputus. Anda tetap dapat mengakses katalog harga yang telah
            disimpan di perangkat ini.
          </p>
        </div>

        {/* Daftar Katalog yang Tersedia Offline */}
        <div className="space-y-3 text-left">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Katalog Tersimpan di Perangkat ({offlineCatalogs.length})
          </h2>

          {offlineCatalogs.length === 0 ? (
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-center space-y-2">
              <Package className="w-6 h-6 text-slate-400 mx-auto" />
              <p className="text-xs text-slate-500">
                Belum ada katalog yang disimpan untuk akses offline.
              </p>
              <p className="text-[11px] text-slate-400">
                Saat online nanti, buka katalog lalu klik tombol &ldquo;Simpan untuk Offline&rdquo;.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden bg-slate-50">
              {offlineCatalogs.map((cat) => (
                <Link
                  key={cat.id}
                  href={`/catalogs/${cat.id}`}
                  className="p-3.5 flex items-center justify-between hover:bg-slate-100 transition-colors group"
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg">
                      <BookOpen className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-900 group-hover:text-emerald-700 transition-colors">
                        {cat.title}
                      </p>
                      <p className="text-xs text-slate-500">
                        {cat.customerName ? `Untuk: ${cat.customerName}` : 'Umum'} •{' '}
                        {cat.itemCount} produk
                      </p>
                    </div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-emerald-600 transition-colors" />
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Tombol Aksi Coba Lagi */}
        <div className="pt-2 flex flex-col gap-2">
          <button
            type="button"
            onClick={handleRetry}
            disabled={checking}
            className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-sm rounded-xl shadow-sm transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${checking ? 'animate-spin' : ''}`} />
            <span>{checking ? 'Memeriksa Koneksi...' : 'Coba Muat Ulang'}</span>
          </button>

          <Link
            href="/dashboard"
            className="w-full inline-flex items-center justify-center gap-1.5 py-2 px-4 text-slate-600 hover:text-slate-900 text-xs font-medium transition-colors"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span>Kembali ke Beranda</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
