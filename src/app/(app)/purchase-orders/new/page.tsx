'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Package,
  Plus,
  Trash2,
  Building2,
  AlertTriangle,
  Loader2,
} from 'lucide-react';
import { MoneyInput } from '@/components/ui/MoneyInput';
import { formatRupiah } from '@/lib/domain/money';

interface VendorOption {
  id: string;
  code: string;
  name: string;
}

interface ProductOption {
  id: string;
  sku: string;
  name: string;
  unit: string;
  costPrice: number;
}

interface FormItem {
  id: string; // client temporary id
  productId: string;
  qty: number;
  unitCost: number;
}

export default function NewPurchaseOrderPage() {
  const router = useRouter();

  const [vendors, setVendors] = useState<VendorOption[]>([]);
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [loadingInitial, setLoadingInitial] = useState(true);

  // Form states
  const [vendorId, setVendorId] = useState('');
  const [orderDate, setOrderDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [expectedDate, setExpectedDate] = useState('');
  const [shippingCost, setShippingCost] = useState(0);
  const [otherCost, setOtherCost] = useState(0);
  const [notes, setNotes] = useState('');

  const [items, setItems] = useState<FormItem[]>([
    { id: 'item-1', productId: '', qty: 1, unitCost: 0 },
  ]);

  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      try {
        setLoadingInitial(true);
        const [vRes, pRes] = await Promise.all([
          fetch('/api/v1/vendors?limit=100'),
          fetch('/api/v1/products?limit=100&active=true'),
        ]);

        if (vRes.ok) {
          const vJson = await vRes.json();
          setVendors(vJson.data.items || []);
        }

        if (pRes.ok) {
          const pJson = await pRes.json();
          setProducts(pJson.data.items || []);
        }
      } catch {
        setFormError('Gagal memuat data master vendor dan produk');
      } finally {
        setLoadingInitial(false);
      }
    }
    loadData();
  }, []);

  const handleAddItem = () => {
    setItems((prev) => [
      ...prev,
      { id: `item-${Date.now()}`, productId: '', qty: 1, unitCost: 0 },
    ]);
  };

  const handleRemoveItem = (id: string) => {
    if (items.length <= 1) return;
    setItems((prev) => prev.filter((i) => i.id !== id));
  };

  const handleProductChange = (id: string, prodId: string) => {
    const prod = products.find((p) => p.id === prodId);
    setItems((prev) =>
      prev.map((i) =>
        i.id === id
          ? {
              ...i,
              productId: prodId,
              unitCost: prod ? prod.costPrice : i.unitCost,
            }
          : i
      )
    );
  };

  const handleQtyChange = (id: string, qty: number) => {
    setItems((prev) =>
      prev.map((i) => (i.id === id ? { ...i, qty: Math.max(1, qty) } : i))
    );
  };

  const handleUnitCostChange = (id: string, unitCost: number) => {
    setItems((prev) =>
      prev.map((i) => (i.id === id ? { ...i, unitCost: Math.max(0, unitCost) } : i))
    );
  };

  // Kalkulasi total
  const subtotal = useMemo(() => {
    return items.reduce((acc, i) => acc + (i.productId ? i.qty * i.unitCost : 0), 0);
  }, [items]);

  const grandTotal = subtotal + shippingCost + otherCost;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!vendorId) {
      setFormError('Silakan pilih vendor terlebih dahulu');
      return;
    }

    const validItems = items.filter((i) => i.productId && i.qty > 0);
    if (validItems.length === 0) {
      setFormError('Minimal satu baris produk harus dipilih');
      return;
    }

    try {
      setSubmitting(true);
      const res = await fetch('/api/v1/purchase-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vendorId,
          orderDate,
          expectedDate: expectedDate || undefined,
          shippingCost,
          otherCost,
          notes: notes.trim() || undefined,
          items: validItems.map((i) => ({
            productId: i.productId,
            qty: i.qty,
            unitCost: i.unitCost,
          })),
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error?.message || 'Gagal membuat Purchase Order');
      }

      router.push(`/purchase-orders/${json.data.id}`);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Terjadi kesalahan sistem');
    } finally {
      setSubmitting(false);
    }
  };

  if (loadingInitial) {
    return (
      <div className="flex flex-col items-center justify-center p-12 space-y-4">
        <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
        <p className="text-sm text-slate-500">Memuat formulir Purchase Order...</p>
      </div>
    );
  }

  return (
    <div className="w-full max-w-5xl mx-auto px-4 py-6 md:py-8 space-y-6">
      <div>
        <Link
          href="/purchase-orders"
          className="inline-flex items-center gap-1.5 text-xs md:text-sm font-medium text-slate-500 hover:text-slate-800 transition-colors mb-2"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Kembali ke Daftar PO</span>
        </Link>
        <div className="flex items-center gap-2">
          <Package className="w-7 h-7 text-indigo-600" />
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            Buat Purchase Order Baru
          </h1>
        </div>
        <p className="text-sm text-slate-500 mt-1">
          Isi rincian pengadaan barang ke pemasok. PO akan dibuat dengan status Draf.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Informasi Vendor & Tanggal */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-4">
          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <Building2 className="w-4 h-4 text-indigo-600" />
            <span>Informasi Pemasok & Waktu</span>
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="sm:col-span-1 space-y-1">
              <label className="text-xs font-semibold text-slate-700">Pilih Vendor:</label>
              <select
                value={vendorId}
                onChange={(e) => setVendorId(e.target.value)}
                required
                className="w-full min-h-[44px] px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-base md:text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">-- Pilih Vendor --</option>
                {vendors.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.code} - {v.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-700">Tanggal Pemesanan:</label>
              <input
                type="date"
                value={orderDate}
                onChange={(e) => setOrderDate(e.target.value)}
                required
                className="w-full min-h-[44px] px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-base md:text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-700">Perkiraan Tiba (Opsional):</label>
              <input
                type="date"
                value={expectedDate}
                onChange={(e) => setExpectedDate(e.target.value)}
                className="w-full min-h-[44px] px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-base md:text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>
        </div>

        {/* Tabel Baris Produk */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Package className="w-4 h-4 text-indigo-600" />
              <span>Daftar Produk yang Dipesan</span>
            </h2>
            <button
              type="button"
              onClick={handleAddItem}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors min-h-[36px]"
            >
              <Plus className="w-4 h-4" />
              <span>Tambah Baris</span>
            </button>
          </div>

          <div className="space-y-3">
            {items.map((item, idx) => {
              const lineTotal = item.productId ? item.qty * item.unitCost : 0;

              return (
                <div
                  key={item.id}
                  className="p-3.5 bg-slate-50/75 rounded-xl border border-slate-200 grid grid-cols-1 sm:grid-cols-12 gap-3 items-end"
                >
                  <div className="sm:col-span-5 space-y-1">
                    <label className="text-[11px] font-semibold text-slate-600">
                      Produk #{idx + 1}:
                    </label>
                    <select
                      value={item.productId}
                      onChange={(e) => handleProductChange(item.id, e.target.value)}
                      required
                      className="w-full min-h-[44px] px-3 py-2 bg-white border border-slate-300 rounded-lg text-base md:text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="">-- Pilih Produk --</option>
                      {products.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.sku} - {p.name} ({p.unit})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="sm:col-span-2 space-y-1">
                    <label className="text-[11px] font-semibold text-slate-600">Qty:</label>
                    <input
                      type="number"
                      min="1"
                      value={item.qty}
                      onChange={(e) => handleQtyChange(item.id, Number(e.target.value))}
                      required
                      className="w-full min-h-[44px] px-3 py-2 bg-white border border-slate-300 rounded-lg text-base md:text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-center font-bold"
                    />
                  </div>

                  <div className="sm:col-span-3 space-y-1">
                    <label className="text-[11px] font-semibold text-slate-600">Harga Beli Satuan:</label>
                    <MoneyInput
                      value={item.unitCost}
                      onChange={(val) => handleUnitCostChange(item.id, val)}
                    />
                  </div>

                  <div className="sm:col-span-2 flex items-center justify-between sm:justify-end gap-2">
                    <div className="text-right">
                      <span className="text-[10px] text-slate-400 block">Subtotal</span>
                      <span className="text-xs sm:text-sm font-bold text-slate-900">
                        {formatRupiah(lineTotal)}
                      </span>
                    </div>

                    {items.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveItem(item.id)}
                        className="p-2 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg min-h-[44px] min-w-[44px] flex items-center justify-center transition-colors"
                        title="Hapus Baris"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Biaya Tambahan & Ringkasan */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-3">
            <h3 className="text-sm font-bold text-slate-900">Biaya Tambahan & Catatan</h3>
            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700">Ongkos Kirim Vendor:</label>
                <MoneyInput value={shippingCost} onChange={setShippingCost} />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700">Biaya Lain-lain:</label>
                <MoneyInput value={otherCost} onChange={setOtherCost} />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700">Catatan Pesanan:</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Catatan untuk vendor atau internal..."
                  rows={2}
                  className="w-full min-h-[44px] px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-base md:text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>
          </div>

          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between space-y-4">
            <h3 className="text-sm font-bold text-slate-900">Ringkasan Nilai PO</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between text-slate-600 text-xs sm:text-sm">
                <span>Subtotal Barang ({items.filter((i) => i.productId).length} produk)</span>
                <span className="font-semibold text-slate-800">{formatRupiah(subtotal)}</span>
              </div>
              <div className="flex justify-between text-slate-600 text-xs sm:text-sm">
                <span>Ongkos Kirim</span>
                <span className="font-semibold text-slate-800">{formatRupiah(shippingCost)}</span>
              </div>
              <div className="flex justify-between text-slate-600 text-xs sm:text-sm">
                <span>Biaya Lain-lain</span>
                <span className="font-semibold text-slate-800">{formatRupiah(otherCost)}</span>
              </div>
              <div className="pt-3 border-t border-slate-200 flex justify-between items-baseline">
                <span className="font-bold text-slate-900 text-sm">Total Estimasi PO</span>
                <span className="font-bold text-indigo-600 text-lg sm:text-xl">
                  {formatRupiah(grandTotal)}
                </span>
              </div>
            </div>

            {formError && (
              <div className="p-3 bg-red-50 text-red-700 rounded-lg text-xs font-medium flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <div className="pt-2 flex items-center justify-end gap-3">
              <Link
                href="/purchase-orders"
                className="min-h-[44px] px-4 py-2 border border-slate-300 hover:bg-slate-50 text-slate-700 text-sm font-medium rounded-lg transition-colors flex items-center justify-center"
              >
                Batal
              </Link>
              <button
                type="submit"
                disabled={submitting}
                className="min-h-[44px] px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg shadow-sm transition-colors flex items-center justify-center gap-2"
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Menyimpan...</span>
                  </>
                ) : (
                  <span>Simpan Draf PO</span>
                )}
              </button>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
