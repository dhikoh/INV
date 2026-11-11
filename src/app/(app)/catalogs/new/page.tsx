'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Plus,
  Trash2,
  AlertTriangle,
  Loader2,
  CheckCircle2,
  Package,
  Search,
} from 'lucide-react';
import { MoneyInput } from '@/components/ui/MoneyInput';
import { formatRupiah } from '@/lib/domain/money';

interface CustomerOption {
  id: string;
  code: string;
  name: string;
}

interface ProductOption {
  id: string;
  sku: string;
  name: string;
  unit: string;
  basePrice: number;
  minPrice: number;
  isActive: boolean;
}

interface CatalogFormLine {
  productId: string;
  name: string;
  sku: string;
  unit: string;
  basePrice: number;
  floorPrice: number;
  price: number;
}

export default function NewCatalogPage() {
  const router = useRouter();

  // State Input
  const [title, setTitle] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [note, setNote] = useState('');
  const [lines, setLines] = useState<CatalogFormLine[]>([]);

  // Master Data
  const [presets, setPresets] = useState<string[]>([]);
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [customerFloorMap, setCustomerFloorMap] = useState<Map<string, number>>(new Map());

  // UI State
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [productSearch, setProductSearch] = useState('');

  // Muat data master awal (preset, customer, produk)
  useEffect(() => {
    async function loadMasterData() {
      try {
        const [presetRes, custRes, prodRes] = await Promise.all([
          fetch('/api/v1/catalog-presets'),
          fetch('/api/v1/customers?limit=100'),
          fetch('/api/v1/products?limit=200&active=true'),
        ]);

        if (presetRes.ok) {
          const json = await presetRes.json();
          if (json.ok && Array.isArray(json.data?.presets)) {
            setPresets(json.data.presets);
          }
        }

        if (custRes.ok) {
          const json = await custRes.json();
          const items = Array.isArray(json.data) ? json.data : json.data?.items;
          if (Array.isArray(items)) {
            setCustomers(items);
          }
        }

        if (prodRes.ok) {
          const json = await prodRes.json();
          const items = Array.isArray(json.data) ? json.data : json.data?.items;
          if (Array.isArray(items)) {
            setProducts(items.filter((p: ProductOption) => p.isActive !== false));
          }
        }
      } catch {
        setFormError('Gagal memuat data master.');
      } finally {
        setLoadingInitial(false);
      }
    }

    loadMasterData();
  }, []);

  // Muat harga minimal khusus saat customer dipilih
  useEffect(() => {
    if (!customerId) {
      setCustomerFloorMap(new Map());
      return;
    }

    async function loadCustomerMinPrices() {
      try {
        const res = await fetch(`/api/v1/customers/${customerId}/pricing`);
        if (res.ok) {
          const json = await res.json();
          const map = new Map<string, number>();
          const pricing = json.data?.pricing;
          if (Array.isArray(pricing)) {
            pricing.forEach((cm: { productId: string; effectiveFloorPrice: number }) => {
              map.set(cm.productId, Number(cm.effectiveFloorPrice));
            });
          }
          setCustomerFloorMap(map);
        }
      } catch {
        // Abaikan
      }
    }

    loadCustomerMinPrices();
  }, [customerId]);

  // Perbarui floorPrice setiap baris ketika customerFloorMap berubah
  useEffect(() => {
    setLines((prevLines) =>
      prevLines.map((line) => {
        const prod = products.find((p) => p.id === line.productId);
        const specialFloor = customerFloorMap.get(line.productId);
        const defaultMin = prod ? Number(prod.minPrice) : line.floorPrice;
        const newFloor = specialFloor !== undefined ? specialFloor : defaultMin;
        return {
          ...line,
          floorPrice: newFloor,
        };
      })
    );
  }, [customerFloorMap, products]);

  // Filter produk yang belum ditambahkan
  const availableProducts = useMemo(() => {
    const selectedIds = new Set(lines.map((l) => l.productId));
    return products.filter((p) => {
      if (selectedIds.has(p.id)) return false;
      if (!productSearch.trim()) return true;
      const q = productSearch.toLowerCase();
      return (
        p.name.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q)
      );
    });
  }, [products, lines, productSearch]);

  const handleAddProduct = (prod: ProductOption) => {
    const specialFloor = customerFloorMap.get(prod.id);
    const floor = specialFloor !== undefined ? specialFloor : Number(prod.minPrice);
    const initialPrice = Number(prod.basePrice) || floor;

    setLines((prev) => [
      ...prev,
      {
        productId: prod.id,
        name: prod.name,
        sku: prod.sku,
        unit: prod.unit,
        basePrice: Number(prod.basePrice),
        floorPrice: floor,
        price: initialPrice,
      },
    ]);
  };

  const handleRemoveProduct = (productId: string) => {
    setLines((prev) => prev.filter((l) => l.productId !== productId));
  };

  const handlePriceChange = (productId: string, newPrice: number) => {
    setLines((prev) =>
      prev.map((l) => (l.productId === productId ? { ...l, price: newPrice } : l))
    );
  };

  const handleAddAllAvailable = () => {
    availableProducts.forEach((p) => handleAddProduct(p));
  };

  // Cek validasi baris
  const violations = useMemo(() => {
    return lines.filter((l) => l.price < l.floorPrice);
  }, [lines]);

  const isValid =
    title.trim().length > 0 &&
    lines.length > 0 &&
    lines.length <= 300 &&
    violations.length === 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid || submitting) return;

    setSubmitting(true);
    setFormError(null);

    try {
      const payload = {
        title: title.trim(),
        customerId: customerId || null,
        note: note.trim() || null,
        items: lines.map((l, idx) => ({
          productId: l.productId,
          price: l.price,
          sortOrder: idx,
        })),
      };

      const res = await fetch('/api/v1/catalogs', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: window.location.origin,
        },
        body: JSON.stringify(payload),
      });

      const json = await res.json();
      if (!res.ok) {
        if (json?.error?.code === 'PRICE_BELOW_MIN') {
          setFormError('Terdapat produk dengan harga di bawah harga minimal yang diizinkan.');
        } else {
          setFormError(json?.error?.message || 'Gagal menyimpan katalog.');
        }
        return;
      }

      // Berhasil dibuat -> redirect ke halaman detail katalog
      router.push(`/catalogs/${json.data.id}`);
    } catch {
      setFormError('Terjadi kesalahan jaringan saat menyimpan katalog.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loadingInitial) {
    return (
      <div className="w-full max-w-5xl mx-auto px-4 py-8 space-y-4">
        <div className="flex items-center gap-2">
          <Loader2 className="w-5 h-5 animate-spin text-emerald-600" />
          <span className="text-sm text-slate-500">Memuat formulir katalog...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-5xl mx-auto px-4 py-6 md:py-8 space-y-6">
      {/* Header & Navigasi Kembali */}
      <div className="flex items-center gap-3">
        <Link
          href="/catalogs"
          className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-slate-900 tracking-tight">
            Buat Katalog Harga Baru
          </h1>
          <p className="text-xs md:text-sm text-slate-600">
            Tentukan harga penawaran khusus dan cetak PDF resmi untuk pelanggan.
          </p>
        </div>
      </div>

      {/* Alert Error */}
      {formError && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-900 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
          <div className="flex-1 text-sm">
            <p className="font-semibold text-red-950">Terjadi Kesalahan</p>
            <p className="mt-0.5">{formError}</p>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Seksi Informasi Katalog */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-4">
          <h2 className="text-sm font-semibold text-slate-900 uppercase tracking-wider">
            1. Informasi Katalog
          </h2>

          <div className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Judul Katalog <span className="text-red-500">*</span>
              </label>
              {presets.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-2">
                  <span className="text-xs text-slate-500 self-center">Pilihan cepat:</span>
                  {presets.map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setTitle(preset)}
                      className={`text-xs px-2.5 py-1 rounded-md font-medium transition-colors ${
                        title === preset
                          ? 'bg-emerald-600 text-white'
                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                      }`}
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              )}
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={60}
                required
                placeholder="Contoh: Grosir, Distributor Tunggal, Promo Ramadhan"
                className="w-full px-3.5 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
              />
              <p className="text-[11px] text-slate-400 mt-1">1–60 karakter.</p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Pelanggan Khusus (Opsional)
              </label>
              <select
                value={customerId}
                onChange={(e) => setCustomerId(e.target.value)}
                className="w-full px-3.5 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
              >
                <option value="">-- Umum / Terbuka Untuk Semua Pelanggan --</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.code})
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-slate-400 mt-1">
                Bila dikaitkan ke customer, harga minimal khusus customer tersebut akan otomatis diterapkan.
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Catatan Katalog (Opsional)
              </label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                maxLength={500}
                placeholder="Catatan tambahan yang akan tampil di bagian bawah katalog PDF..."
                className="w-full px-3.5 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
              />
            </div>
          </div>
        </div>

        {/* Seksi Pemilih Produk */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold text-slate-900 uppercase tracking-wider">
                2. Daftar Produk Katalog ({lines.length} Produk)
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Maksimal 300 produk per katalog. Harga tidak boleh di bawah harga minimal.
              </p>
            </div>
            {availableProducts.length > 0 && (
              <button
                type="button"
                onClick={handleAddAllAvailable}
                className="text-xs font-medium text-emerald-600 hover:text-emerald-700 self-start sm:self-auto"
              >
                + Tambah Semua Produk ({availableProducts.length})
              </button>
            )}
          </div>

          {/* Kotak Pencari Produk untuk Ditambahkan */}
          <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-3">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
                placeholder="Ketik nama atau SKU produk untuk menambahkan..."
                className="w-full pl-9 pr-3 py-1.5 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
              />
            </div>

            {availableProducts.length > 0 && productSearch.trim() && (
              <div className="max-h-48 overflow-y-auto divide-y divide-slate-200 border border-slate-200 rounded-lg bg-white">
                {availableProducts.slice(0, 8).map((p) => {
                  const specialFloor = customerFloorMap.get(p.id);
                  const floor = specialFloor !== undefined ? specialFloor : Number(p.minPrice);
                  return (
                    <div
                      key={p.id}
                      className="p-2.5 flex items-center justify-between hover:bg-slate-50 gap-2"
                    >
                      <div>
                        <p className="text-sm font-medium text-slate-900">{p.name}</p>
                        <p className="text-xs text-slate-500">
                          SKU: {p.sku} • Dasar: {formatRupiah(Number(p.basePrice))} • Min: {formatRupiah(floor)}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleAddProduct(p)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-medium text-xs rounded transition-colors"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Tambah</span>
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Tabel / Baris Produk yang Dipilih */}
          {lines.length === 0 ? (
            <div className="p-8 text-center text-slate-400 border border-dashed border-slate-200 rounded-lg">
              <Package className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">Belum ada produk yang ditambahkan ke katalog.</p>
              <p className="text-xs text-slate-400 mt-1">
                Gunakan pencarian di atas untuk memilih produk.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-200 border border-slate-200 rounded-lg overflow-hidden">
              {lines.map((line, index) => {
                const isBelowFloor = line.price < line.floorPrice;
                return (
                  <div
                    key={line.productId}
                    className={`p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                      isBelowFloor ? 'bg-red-50' : 'bg-white'
                    }`}
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-slate-400 w-5">
                          {index + 1}.
                        </span>
                        <h4 className="text-sm font-semibold text-slate-900 leading-snug">
                          {line.name}
                        </h4>
                      </div>
                      <div className="text-xs text-slate-500 flex flex-wrap gap-x-3 gap-y-1 mt-1 ml-7">
                        <span>SKU: {line.sku}</span>
                        <span>Satuan: {line.unit}</span>
                        <span className="font-medium text-slate-700">
                          Floor Min: {formatRupiah(line.floorPrice)}
                        </span>
                      </div>
                      {isBelowFloor && (
                        <p className="text-xs font-semibold text-red-600 flex items-center gap-1 mt-1.5 ml-7">
                          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                          <span>
                            Harga di bawah batas minimal ({formatRupiah(line.floorPrice)})!
                          </span>
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-3 ml-7 sm:ml-0">
                      <div className="w-40">
                        <label className="block text-[11px] font-medium text-slate-500 mb-0.5">
                          Harga Katalog (Rp)
                        </label>
                        <MoneyInput
                          value={line.price}
                          onChange={(val) => handlePriceChange(line.productId, val)}
                          className={`w-full text-sm font-medium ${
                            isBelowFloor ? 'border-red-400 focus:ring-red-500' : ''
                          }`}
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveProduct(line.productId)}
                        className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors mt-4 sm:mt-0"
                        title="Hapus baris"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer Tombol Aksi */}
        <div className="flex items-center justify-between bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="text-xs text-slate-500">
            {violations.length > 0 ? (
              <span className="text-red-600 font-semibold flex items-center gap-1">
                <AlertTriangle className="w-4 h-4" />
                {violations.length} produk memiliki harga di bawah minimal.
              </span>
            ) : lines.length > 0 ? (
              <span className="text-emerald-700 font-medium flex items-center gap-1">
                <CheckCircle2 className="w-4 h-4" />
                Seluruh harga produk valid ({lines.length} produk).
              </span>
            ) : (
              <span>Pilih minimal 1 produk untuk menyimpan.</span>
            )}
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/catalogs"
              className="px-4 py-2 border border-slate-300 hover:bg-slate-50 text-slate-700 text-sm font-medium rounded-lg transition-colors"
            >
              Batal
            </Link>
            <button
              type="submit"
              disabled={!isValid || submitting}
              className="inline-flex items-center gap-2 px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-lg shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
              <span>Simpan Katalog</span>
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
