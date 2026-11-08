'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Plus,
  Trash2,
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  DollarSign,
  HelpCircle,
  Loader2,
  Package,
  Search,
  ShieldAlert,
  Sparkles,
  Truck,
  User,
} from 'lucide-react';
import { MoneyInput } from '@/components/ui/MoneyInput';
import { PercentInput } from '@/components/ui/PercentInput';
import { formatRupiah } from '@/lib/domain/money';

export interface CustomerOption {
  id: string;
  code: string;
  name: string;
  address: string | null;
  shippingAddress: string | null;
  assignedSalesId: string | null;
}

export interface ProductOption {
  id: string;
  sku: string;
  name: string;
  unit: string;
  basePrice: number;
  minPrice: number;
  stockQty?: number;
  availableStock?: number;
  isActive: boolean;
}

export interface PromoOption {
  id: string;
  label: string;
  source: 'PROMO' | 'SUBSIDY';
  type: 'PERCENT' | 'AMOUNT';
  valueBps: number | null;
  valueAmount: number | null;
  productId: string | null;
}

export interface FormItemLine {
  id: string; // client temporary id
  productId: string;
  qty: number;
  unitPrice: number;
  discountType: 'NONE' | 'PERCENT' | 'AMOUNT' | 'PROMO';
  discountValue: number; // bps if PERCENT, amount if AMOUNT
  promoId?: string;
  promoSource?: 'PROMO' | 'SUBSIDY';
}

export interface PreviewLineResult {
  productId: string;
  productName: string;
  sku: string;
  unit: string;
  qty: number;
  unitPrice: number;
  discountType: string;
  discountValue: number;
  discountSource: string;
  lineSubtotal: number;
  lineDiscount: number;
  lineNet: number;
  floorPrice: number;
  belowMin: boolean;
  costPrice?: number;
}

export interface PreviewTotals {
  subtotal: number;
  discountTotal: number;
  goodsNet: number;
  shippingCharge: number;
  ppnAmount: number;
  grandTotal: number;
  dpAmount: number;
}

export interface ProfitSimulation {
  revenue: number;
  goodsRevenue: number;
  cogs: number;
  shippingActualCost: number;
  extraCosts: number;
  profit: number;
  marginBps: number;
}

export interface OrderFormProps {
  mode: 'create' | 'edit';
  orderId?: string;
  initialRev?: number;
  initialCustomerId?: string;
  initialItems?: Array<{
    productId: string;
    qty: number;
    unitPrice: number;
    discountType: 'NONE' | 'PERCENT' | 'AMOUNT';
    discountValue: number;
    discountSource: 'MANUAL' | 'PROMO' | 'SUBSIDY';
    promoId?: string;
  }>;
  initialShippingCharge?: number;
  initialDpBps?: number;
  initialDeliveryAddress?: string;
  initialNotes?: string;
  initialRepeatIntervalDays?: number;
  initialBelowMinReason?: string;
}

export function OrderForm({
  mode,
  orderId,
  initialRev = 0,
  initialCustomerId = '',
  initialItems = [],
  initialShippingCharge = 0,
  initialDpBps,
  initialDeliveryAddress = '',
  initialNotes = '',
  initialRepeatIntervalDays,
  initialBelowMinReason = '',
}: OrderFormProps) {
  const router = useRouter();

  // State User & Role
  const [currentUser, setCurrentUser] = useState<{
    id: string;
    role: 'SUPERADMIN' | 'SALES';
    name: string;
  } | null>(null);

  // Master Data
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [promos, setPromos] = useState<PromoOption[]>([]);
  const [loadingInitial, setLoadingInitial] = useState(true);

  // Form Fields
  const [customerId, setCustomerId] = useState(initialCustomerId);
  const [customerSearch, setCustomerSearch] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState(initialDeliveryAddress);
  const [shippingCharge, setShippingCharge] = useState<number>(initialShippingCharge);
  const [dpBps, setDpBps] = useState<number>(initialDpBps ?? 0);
  const [notes, setNotes] = useState(initialNotes);
  const [repeatIntervalDays, setRepeatIntervalDays] = useState<number | ''>(
    initialRepeatIntervalDays ?? ''
  );
  const [belowMinReason, setBelowMinReason] = useState(initialBelowMinReason);

  // Items List
  const [items, setItems] = useState<FormItemLine[]>(() => {
    if (initialItems.length > 0) {
      return initialItems.map((item, idx) => ({
        id: `init-${idx}-${Date.now()}`,
        productId: item.productId,
        qty: item.qty,
        unitPrice: item.unitPrice,
        discountType:
          item.discountSource === 'PROMO' || item.discountSource === 'SUBSIDY'
            ? 'PROMO'
            : item.discountType,
        discountValue: item.discountValue,
        promoId: item.promoId,
        promoSource:
          item.discountSource === 'PROMO' || item.discountSource === 'SUBSIDY'
            ? item.discountSource
            : undefined,
      }));
    }
    return [];
  });

  // Preview State
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewLines, setPreviewLines] = useState<PreviewLineResult[]>([]);
  const [previewTotals, setPreviewTotals] = useState<PreviewTotals | null>(null);
  const [hasBelowMin, setHasBelowMin] = useState(false);
  const [warnings, setWarnings] = useState<Array<{ productId: string; message: string; floorPrice: number }>>([]);
  const [profitSimulation, setProfitSimulation] = useState<ProfitSimulation | null>(null);

  // UI States
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  // Muat data profil dan master awal
  useEffect(() => {
    async function loadBootstrap() {
      try {
        setLoadingInitial(true);

        const [meRes, custRes, prodRes] = await Promise.all([
          fetch('/api/v1/auth/me'),
          fetch('/api/v1/customers?limit=100'),
          fetch('/api/v1/products?limit=100&active=true'),
        ]);

        if (meRes.ok) {
          const meJson = await meRes.json();
          setCurrentUser(meJson.data.user);
        }

        if (custRes.ok) {
          const custJson = await custRes.json();
          setCustomers(custJson.data.items || []);
        }

        if (prodRes.ok) {
          const prodJson = await prodRes.json();
          setProducts(prodJson.data.items || []);
        }
      } catch {
        setFormError('Gagal memuat data awal formulir.');
      } finally {
        setLoadingInitial(false);
      }
    }
    loadBootstrap();
  }, []);

  // Muat data promo saat customerId berubah
  useEffect(() => {
    if (!customerId) {
      setPromos([]);
      return;
    }

    async function loadCustomerPromos() {
      try {
        const res = await fetch(`/api/v1/customers/${customerId}/pricing`);
        if (res.ok) {
          const json = await res.json();
          const activePromos: PromoOption[] = json.data.promos || [];
          setPromos(activePromos);
        }
      } catch {
        // Abaikan bila gagal muat promo
      }
    }
    loadCustomerPromos();

    // Isi alamat pengiriman bawaan customer bila masih kosong
    const selectedCust = customers.find((c) => c.id === customerId);
    if (selectedCust && !deliveryAddress) {
      setDeliveryAddress(selectedCust.shippingAddress || selectedCust.address || '');
    }
  }, [customerId, customers, deliveryAddress]);

  // Debounced Live Preview (300 ms) sesuai Seksi 10.4 & 11.4
  const previewTimerRef = useRef<NodeJS.Timeout | null>(null);

  const fetchLivePreview = useCallback(async () => {
    if (!customerId || items.length === 0) {
      setPreviewTotals(null);
      setPreviewLines([]);
      setHasBelowMin(false);
      setWarnings([]);
      setProfitSimulation(null);
      return;
    }

    // Pastikan tidak ada baris yang belum memilih produk
    const validItems = items.filter((i) => i.productId && i.qty > 0);
    if (validItems.length === 0) return;

    try {
      setPreviewLoading(true);

      const payload = {
        customerId,
        items: validItems.map((item) => {
          let discount: Record<string, unknown> | undefined = undefined;

          if (item.discountType === 'PERCENT') {
            discount = {
              source: 'MANUAL',
              type: 'PERCENT',
              value: item.discountValue,
            };
          } else if (item.discountType === 'AMOUNT') {
            discount = {
              source: 'MANUAL',
              type: 'AMOUNT',
              value: item.discountValue,
            };
          } else if (item.discountType === 'PROMO' && item.promoId) {
            discount = {
              source: item.promoSource || 'PROMO',
              promoId: item.promoId,
            };
          }

          return {
            productId: item.productId,
            qty: item.qty,
            unitPrice: item.unitPrice,
            discount,
          };
        }),
        shippingCharge,
        dpBps,
      };

      const res = await fetch('/api/v1/orders/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        const json = await res.json();
        const data = json.data;

        setPreviewTotals(data.totals);
        setPreviewLines(data.lines || []);
        setHasBelowMin(data.hasBelowMin);
        setWarnings(data.warnings || []);
        if (data.profit) {
          setProfitSimulation(data.profit);
        } else {
          setProfitSimulation(null);
        }
        setFormError(null);
      } else {
        const errJson = await res.json().catch(() => ({}));
        if (errJson.error?.message) {
          setFormError(errJson.error.message);
        }
      }
    } catch {
      // Gagal preview
    } finally {
      setPreviewLoading(false);
    }
  }, [customerId, items, shippingCharge, dpBps]);

  useEffect(() => {
    if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
    previewTimerRef.current = setTimeout(() => {
      fetchLivePreview();
    }, 300);

    return () => {
      if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
    };
  }, [fetchLivePreview]);

  // Tambah baris produk baru
  const handleAddItem = () => {
    if (products.length === 0) return;

    // Cari produk yang belum dipilih
    const selectedIds = new Set(items.map((i) => i.productId));
    const available = products.find((p) => !selectedIds.has(p.id)) || products[0];

    const newItem: FormItemLine = {
      id: `line-${Date.now()}-${Math.random()}`,
      productId: available ? available.id : '',
      qty: 1,
      unitPrice: available ? available.basePrice : 0,
      discountType: 'NONE',
      discountValue: 0,
    };

    setItems([...items, newItem]);
  };

  // Hapus baris produk
  const handleRemoveItem = (id: string) => {
    setItems(items.filter((i) => i.id !== id));
  };

  // Ubah produk pada baris
  const handleProductChange = (id: string, newProductId: string) => {
    const prod = products.find((p) => p.id === newProductId);
    setItems(
      items.map((item) => {
        if (item.id === id) {
          return {
            ...item,
            productId: newProductId,
            unitPrice: prod ? prod.basePrice : item.unitPrice,
            discountType: 'NONE',
            discountValue: 0,
            promoId: undefined,
            promoSource: undefined,
          };
        }
        return item;
      })
    );
  };

  // Ubah qty
  const handleQtyChange = (id: string, val: string) => {
    const qty = Math.max(1, parseInt(val, 10) || 1);
    setItems(
      items.map((item) => (item.id === id ? { ...item, qty } : item))
    );
  };

  // Ubah harga deal
  const handleUnitPriceChange = (id: string, unitPrice: number) => {
    setItems(
      items.map((item) => (item.id === id ? { ...item, unitPrice } : item))
    );
  };

  // Simpan / Kirim formulir
  const handleSubmitForm = async () => {
    setFormError(null);

    if (!customerId) {
      setFormError('Silakan pilih pelanggan terlebih dahulu.');
      return;
    }

    if (items.length === 0) {
      setFormError('Pesanan harus memiliki minimal satu baris produk.');
      return;
    }

    // Validasi alasan di bawah minimal bila ada
    if (hasBelowMin && (!belowMinReason || belowMinReason.trim().length < 5)) {
      setFormError('Pesanan memuat harga di bawah batas minimal. Alasan bisnis wajib diisi minimal 5 karakter.');
      return;
    }

    try {
      setSubmitting(true);

      const payload = {
        customerId,
        items: items.map((item) => {
          let discount: Record<string, unknown> | undefined = undefined;

          if (item.discountType === 'PERCENT') {
            discount = {
              source: 'MANUAL',
              type: 'PERCENT',
              value: item.discountValue,
            };
          } else if (item.discountType === 'AMOUNT') {
            discount = {
              source: 'MANUAL',
              type: 'AMOUNT',
              value: item.discountValue,
            };
          } else if (item.discountType === 'PROMO' && item.promoId) {
            discount = {
              source: item.promoSource || 'PROMO',
              promoId: item.promoId,
            };
          }

          return {
            productId: item.productId,
            qty: item.qty,
            unitPrice: item.unitPrice,
            discount,
          };
        }),
        shippingCharge,
        dpBps,
        deliveryAddress: deliveryAddress.trim() || undefined,
        notes: notes.trim() || undefined,
        repeatIntervalDays: repeatIntervalDays ? Number(repeatIntervalDays) : undefined,
        belowMinReason: belowMinReason.trim() || undefined,
        ...(mode === 'edit' ? { rev: initialRev } : {}),
      };

      const url = mode === 'create' ? '/api/v1/orders' : `/api/v1/orders/${orderId}`;
      const method = mode === 'create' ? 'POST' : 'PATCH';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const json = await res.json();

      if (!res.ok) {
        if (res.status === 409) {
          setFormError('Data pesanan telah diperbarui pengguna lain (stale lock). Muat ulang halaman.');
        } else {
          setFormError(json.error?.message || 'Gagal menyimpan pesanan.');
        }
        return;
      }

      setShowConfirmModal(false);
      const savedId = json.data.id;
      router.push(`/orders/${savedId}`);
    } catch {
      setFormError('Terjadi kesalahan jaringan saat menyimpan pesanan.');
    } finally {
      setSubmitting(false);
    }
  };

  const filteredCustomers = useMemo(() => {
    if (!customerSearch.trim()) return customers;
    const q = customerSearch.toLowerCase();
    return customers.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.code.toLowerCase().includes(q)
    );
  }, [customers, customerSearch]);

  const selectedCustomer = useMemo(
    () => customers.find((c) => c.id === customerId),
    [customers, customerId]
  );

  if (loadingInitial) {
    return (
      <div className="flex flex-col items-center justify-center p-12 space-y-4">
        <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
        <p className="text-sm text-slate-500">Memuat formulir pesanan...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-16">
      {/* Tombol Kembali & Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link
            href={orderId ? `/orders/${orderId}` : '/orders'}
            className="inline-flex items-center justify-center w-10 h-10 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 transition min-h-[44px] min-w-[44px]"
            title="Kembali"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900">
              {mode === 'create' ? 'Buat Pesanan Baru' : 'Ubah Draf Pesanan'}
            </h1>
            <p className="text-xs sm:text-sm text-slate-500">
              Isi rincian produk, diskon, dan alamat kirim untuk membuat pesanan.
            </p>
          </div>
        </div>
      </div>

      {/* Error Alert Global */}
      {formError && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
          <div className="text-sm font-medium">{formError}</div>
        </div>
      )}

      {/* Grid Utama: Formulir Kiri + Ringkasan Kanan */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Kolom Kiri: Input Pelanggan & Barang */}
        <div className="lg:col-span-2 space-y-6">
          {/* 1. Pemilihan Pelanggan */}
          <div className="bg-white rounded-xl border border-slate-200 p-4 sm:p-5 shadow-sm space-y-4">
            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
              <User className="w-4 h-4 text-indigo-600" />
              1. Pilih Pelanggan
            </h2>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Cari Pelanggan
                </label>
                <div className="relative">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Ketik nama atau kode pelanggan..."
                    value={customerSearch}
                    onChange={(e) => setCustomerSearch(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 text-[16px] sm:text-sm rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 min-h-[44px]"
                  />
                </div>
              </div>

              <div>
                <select
                  value={customerId}
                  onChange={(e) => setCustomerId(e.target.value)}
                  className="w-full px-3 py-2 text-[16px] sm:text-sm rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 min-h-[44px]"
                >
                  <option value="">-- Pilih Pelanggan Terdaftar --</option>
                  {filteredCustomers.map((c) => (
                    <option key={c.id} value={c.id}>
                      [{c.code}] {c.name}
                    </option>
                  ))}
                </select>
              </div>

              {selectedCustomer && (
                <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-xs sm:text-sm text-slate-600 space-y-1">
                  <div className="font-semibold text-slate-900">
                    {selectedCustomer.name} ({selectedCustomer.code})
                  </div>
                  {selectedCustomer.shippingAddress ? (
                    <div>Alamat Kirim: {selectedCustomer.shippingAddress}</div>
                  ) : selectedCustomer.address ? (
                    <div>Alamat: {selectedCustomer.address}</div>
                  ) : (
                    <div className="text-slate-400 italic">Belum ada alamat terdaftar</div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* 2. Daftar Barang Pesanan */}
          <div className="bg-white rounded-xl border border-slate-200 p-4 sm:p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                <Package className="w-4 h-4 text-indigo-600" />
                2. Produk & Harga Deal
              </h2>
              <button
                type="button"
                onClick={handleAddItem}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-50 text-indigo-700 hover:bg-indigo-100 font-semibold text-xs transition min-h-[44px]"
              >
                <Plus className="w-4 h-4" />
                Tambah Produk
              </button>
            </div>

            {items.length === 0 ? (
              <div className="p-8 text-center border-2 border-dashed border-slate-200 rounded-xl space-y-2">
                <Package className="w-8 h-8 text-slate-300 mx-auto" />
                <p className="text-sm text-slate-500">Belum ada produk yang ditambahkan.</p>
                <button
                  type="button"
                  onClick={handleAddItem}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 text-white font-medium text-xs hover:bg-indigo-700 transition min-h-[44px]"
                >
                  <Plus className="w-4 h-4" />
                  Tambah Produk Sekarang
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {items.map((item, idx) => {
                  const previewLine = previewLines.find((pl) => pl.productId === item.productId);
                  const isBelow = previewLine?.belowMin ?? false;
                  const floorPrice = previewLine?.floorPrice;

                  return (
                    <div
                      key={item.id}
                      className={`p-4 rounded-xl border transition ${
                        isBelow
                          ? 'border-rose-400 bg-rose-50/40 ring-1 ring-rose-300'
                          : 'border-slate-200 bg-white'
                      } space-y-3`}
                    >
                      {/* Baris Atas: Produk & Hapus */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1">
                          <label className="block text-xs font-semibold text-slate-700 mb-1">
                            Produk #{idx + 1}
                          </label>
                          <select
                            value={item.productId}
                            onChange={(e) => handleProductChange(item.id, e.target.value)}
                            className="w-full px-3 py-2 text-[16px] sm:text-sm rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 min-h-[44px]"
                          >
                            <option value="">-- Pilih Produk --</option>
                            {products.map((p) => (
                              <option key={p.id} value={p.id}>
                                [{p.sku}] {p.name} - Rp {formatRupiah(p.basePrice)} / {p.unit}
                              </option>
                            ))}
                          </select>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemoveItem(item.id)}
                          className="mt-6 p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition min-h-[44px] min-w-[44px] flex items-center justify-center"
                          title="Hapus baris"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>

                      {/* Baris Tengah: Qty, Harga Deal, Diskon */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        {/* Jumlah Qty */}
                        <div>
                          <label className="block text-xs font-semibold text-slate-700 mb-1">
                            Jumlah (Qty)
                          </label>
                          <input
                            type="number"
                            min="1"
                            max="1000000"
                            value={item.qty}
                            onChange={(e) => handleQtyChange(item.id, e.target.value)}
                            className="w-full px-3 py-2 text-[16px] sm:text-sm rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 min-h-[44px]"
                          />
                        </div>

                        {/* Harga Deal per Unit */}
                        <div>
                          <label className="block text-xs font-semibold text-slate-700 mb-1">
                            Harga Deal per Unit
                          </label>
                          <MoneyInput
                            value={item.unitPrice}
                            onChange={(val) => handleUnitPriceChange(item.id, val)}
                            placeholder="Rp 0"
                            className="w-full min-h-[44px]"
                          />
                        </div>

                        {/* Pilihan Diskon */}
                        <div>
                          <label className="block text-xs font-semibold text-slate-700 mb-1">
                            Tipe Diskon
                          </label>
                          <select
                            value={item.discountType}
                            onChange={(e) => {
                              const dt = e.target.value as FormItemLine['discountType'];
                              setItems(
                                items.map((it) =>
                                  it.id === item.id
                                    ? {
                                        ...it,
                                        discountType: dt,
                                        discountValue: 0,
                                        promoId: undefined,
                                        promoSource: undefined,
                                      }
                                    : it
                                )
                              );
                            }}
                            className="w-full px-3 py-2 text-[16px] sm:text-sm rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 min-h-[44px]"
                          >
                            <option value="NONE">Tanpa Diskon</option>
                            <option value="PERCENT">Diskon Persen (%)</option>
                            <option value="AMOUNT">Diskon Nominal (Rp)</option>
                            {promos.length > 0 && (
                              <option value="PROMO">Promo / Subsidi Pelanggan</option>
                            )}
                          </select>
                        </div>
                      </div>

                      {/* Detail Kontrol Diskon Berdasarkan Pilihan */}
                      {item.discountType === 'PERCENT' && (
                        <div>
                          <label className="block text-xs font-semibold text-slate-700 mb-1">
                            Persentase Diskon (0 - 100%)
                          </label>
                          <PercentInput
                            value={item.discountValue}
                            onChange={(bps) =>
                              setItems(
                                items.map((it) =>
                                  it.id === item.id ? { ...it, discountValue: bps } : it
                                )
                              )
                            }
                            className="w-full sm:w-1/2 min-h-[44px]"
                          />
                        </div>
                      )}

                      {item.discountType === 'AMOUNT' && (
                        <div>
                          <label className="block text-xs font-semibold text-slate-700 mb-1">
                            Nominal Potongan Total Baris (Rp)
                          </label>
                          <MoneyInput
                            value={item.discountValue}
                            onChange={(val) =>
                              setItems(
                                items.map((it) =>
                                  it.id === item.id ? { ...it, discountValue: val } : it
                                )
                              )
                            }
                            className="w-full sm:w-1/2 min-h-[44px]"
                          />
                        </div>
                      )}

                      {item.discountType === 'PROMO' && (
                        <div>
                          <label className="block text-xs font-semibold text-slate-700 mb-1">
                            Pilih Promo / Subsidi Aktif
                          </label>
                          <select
                            value={item.promoId || ''}
                            onChange={(e) => {
                              const pId = e.target.value;
                              const selectedPromo = promos.find((p) => p.id === pId);
                              setItems(
                                items.map((it) =>
                                  it.id === item.id
                                    ? {
                                        ...it,
                                        promoId: pId,
                                        promoSource: selectedPromo?.source,
                                      }
                                    : it
                                )
                              );
                            }}
                            className="w-full sm:w-2/3 px-3 py-2 text-[16px] sm:text-sm rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 min-h-[44px]"
                          >
                            <option value="">-- Pilih Promo --</option>
                            {promos.map((p) => (
                              <option key={p.id} value={p.id}>
                                [{p.source}] {p.label} (
                                {p.type === 'PERCENT'
                                  ? `${(p.valueBps || 0) / 100}%`
                                  : `Rp ${formatRupiah(p.valueAmount || 0)}/unit`}
                                )
                              </option>
                            ))}
                          </select>
                        </div>
                      )}

                      {/* Info Harga Minimal & Peringatan Below Floor */}
                      <div className="pt-2 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between text-xs gap-2">
                        <div className="flex items-center gap-1.5 text-slate-500">
                          <HelpCircle className="w-3.5 h-3.5 text-slate-400" />
                          <span>
                            Harga minimal efektif:{' '}
                            <strong className="text-slate-700">
                              Rp {formatRupiah(floorPrice || 0)}
                            </strong>{' '}
                            / unit
                          </span>
                        </div>

                        {previewLine && (
                          <div className="text-slate-600 font-medium">
                            Subtotal: Rp {formatRupiah(previewLine.lineNet)}
                          </div>
                        )}
                      </div>

                      {/* Kotak Peringatan Merah BelowMin */}
                      {isBelow && (
                        <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-800 text-xs flex items-start gap-2.5">
                          <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                          <div>
                            <span className="font-semibold block">
                              Peringatan: Harga deal di bawah batas minimal!
                            </span>
                            Pengajuan invoice wajib disertai alasan bisnis yang jelas dan harus
                            menunggu persetujuan Super Admin/Pemilik Usaha.
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* 3. Pengiriman, Alamat & Catatan */}
          <div className="bg-white rounded-xl border border-slate-200 p-4 sm:p-5 shadow-sm space-y-4">
            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
              <Truck className="w-4 h-4 text-indigo-600" />
              3. Pengiriman & Catatan
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Ongkir Ditagihkan ke Pelanggan (Rp)
                </label>
                <MoneyInput
                  value={shippingCharge}
                  onChange={(val) => setShippingCharge(val)}
                  placeholder="Rp 0"
                  className="w-full min-h-[44px]"
                />
                <span className="text-[11px] text-slate-400 mt-1 block">
                  Boleh Rp 0 jika bebas ongkir atau ditanggung usaha.
                </span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Uang Muka (DP) Persen
                </label>
                <PercentInput
                  value={dpBps}
                  onChange={(val) => setDpBps(val)}
                  className="w-full min-h-[44px]"
                />
                <span className="text-[11px] text-slate-400 mt-1 block">
                  0% bila tanpa DP (langsung pelunasan saat invoice disetujui).
                </span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Alamat Pengiriman
              </label>
              <textarea
                rows={2}
                value={deliveryAddress}
                onChange={(e) => setDeliveryAddress(e.target.value)}
                placeholder="Alamat lengkap penerima barang..."
                className="w-full px-3 py-2 text-[16px] sm:text-sm rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Catatan Pesanan
                </label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Catatan khusus, instruksi gudang..."
                  className="w-full px-3 py-2 text-[16px] sm:text-sm rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 min-h-[44px]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Ingatkan Repeat Order Tiap (Hari)
                </label>
                <input
                  type="number"
                  min="1"
                  max="365"
                  value={repeatIntervalDays}
                  onChange={(e) =>
                    setRepeatIntervalDays(
                      e.target.value ? parseInt(e.target.value, 10) : ''
                    )
                  }
                  placeholder="Opsional (contoh: 14)"
                  className="w-full px-3 py-2 text-[16px] sm:text-sm rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 min-h-[44px]"
                />
              </div>
            </div>

            {/* Alasan di bawah minimal */}
            {hasBelowMin && (
              <div className="p-4 bg-rose-50 border border-rose-300 rounded-xl space-y-2">
                <label className="block text-xs font-bold text-rose-900 flex items-center gap-1.5">
                  <ShieldAlert className="w-4 h-4 text-rose-600" />
                  Alasan Penjualan di Bawah Minimal (Wajib minimal 5 karakter)
                </label>
                <textarea
                  rows={2}
                  value={belowMinReason}
                  onChange={(e) => setBelowMinReason(e.target.value)}
                  placeholder="Tulis alasan bisnis memberikan harga di bawah batas minimal (misal: order partai besar, loyal customer, promo pembukaan)..."
                  className="w-full px-3 py-2 text-[16px] sm:text-sm rounded-lg border border-rose-300 bg-white focus:outline-none focus:ring-2 focus:ring-rose-500"
                />
                <span className="text-[11px] text-rose-700 block">
                  Alasan ini akan ditinjau langsung oleh Pemilik Usaha saat persetujuan invoice.
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Kolom Kanan: Panel Ringkasan Real-Time (Hasil Preview Server) */}
        <div className="space-y-6 sticky top-6">
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-emerald-600" />
                Ringkasan Pesanan
              </h3>
              {previewLoading && (
                <div className="flex items-center gap-1 text-[11px] text-slate-400">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Menghitung...</span>
                </div>
              )}
            </div>

            {previewTotals ? (
              <div className="space-y-3 text-sm">
                <div className="flex items-center justify-between text-slate-600">
                  <span>Subtotal Barang</span>
                  <span className="font-semibold text-slate-900">
                    Rp {formatRupiah(previewTotals.subtotal)}
                  </span>
                </div>

                {previewTotals.discountTotal > 0 && (
                  <div className="flex items-center justify-between text-emerald-600">
                    <span>Total Diskon</span>
                    <span className="font-semibold">
                      - Rp {formatRupiah(previewTotals.discountTotal)}
                    </span>
                  </div>
                )}

                <div className="flex items-center justify-between text-slate-600">
                  <span>Barang Bersih</span>
                  <span className="font-semibold text-slate-900">
                    Rp {formatRupiah(previewTotals.goodsNet)}
                  </span>
                </div>

                <div className="flex items-center justify-between text-slate-600">
                  <span>Ongkir Ditagihkan</span>
                  <span className="font-semibold text-slate-900">
                    Rp {formatRupiah(previewTotals.shippingCharge)}
                  </span>
                </div>

                {previewTotals.ppnAmount > 0 && (
                  <div className="flex items-center justify-between text-slate-600">
                    <span>PPN Usaha</span>
                    <span className="font-semibold text-slate-900">
                      Rp {formatRupiah(previewTotals.ppnAmount)}
                    </span>
                  </div>
                )}

                <div className="pt-3 border-t border-slate-200 flex items-center justify-between">
                  <span className="font-bold text-slate-900">Grand Total</span>
                  <span className="font-bold text-lg text-indigo-700">
                    Rp {formatRupiah(previewTotals.grandTotal)}
                  </span>
                </div>

                {previewTotals.dpAmount > 0 && (
                  <div className="p-3 bg-indigo-50/60 rounded-lg space-y-1 text-xs">
                    <div className="flex items-center justify-between text-indigo-900 font-semibold">
                      <span>Uang Muka (DP {dpBps / 100}%)</span>
                      <span>Rp {formatRupiah(previewTotals.dpAmount)}</span>
                    </div>
                    <div className="flex items-center justify-between text-slate-600">
                      <span>Sisa Pelunasan</span>
                      <span>
                        Rp {formatRupiah(previewTotals.grandTotal - previewTotals.dpAmount)}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="py-8 text-center text-xs text-slate-400 italic">
                Pilih pelanggan dan produk untuk melihat rincian kalkulasi total.
              </div>
            )}

            {/* Peringatan Global Below Floor */}
            {hasBelowMin && (
              <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <span>
                  Terdapat {warnings.length} produk di bawah harga minimal. Membutuhkan persetujuan
                  pemilik usaha saat diajukan.
                </span>
              </div>
            )}

            {/* Tombol Simpan Aksi */}
            <div className="pt-3 border-t border-slate-100 space-y-2">
              <button
                type="button"
                onClick={() => setShowConfirmModal(true)}
                disabled={submitting || !customerId || items.length === 0}
                className="w-full py-2.5 px-4 rounded-xl bg-indigo-600 text-white font-semibold text-sm hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition shadow-sm min-h-[44px] flex items-center justify-center gap-2"
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Menyimpan...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>{mode === 'create' ? 'Simpan Draf Pesanan' : 'Simpan Perubahan'}</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Panel Simulasi Profit Khusus Super Admin (Seksi 11.4) */}
          {currentUser?.role === 'SUPERADMIN' && profitSimulation && (
            <div className="bg-slate-900 text-white rounded-xl p-5 shadow-sm space-y-3">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                  Simulasi Profit (Owner SA)
                </h4>
                <span
                  className={`text-xs font-semibold px-2 py-0.5 rounded ${
                    profitSimulation.profit >= 0
                      ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                      : 'bg-rose-950 text-rose-400 border border-rose-800'
                  }`}
                >
                  {(profitSimulation.marginBps / 100).toFixed(1)}% Margin
                </span>
              </div>

              <div className="space-y-2 text-xs">
                <div className="flex justify-between text-slate-400">
                  <span>Omzet Pendapatan</span>
                  <span className="text-slate-200">
                    Rp {formatRupiah(profitSimulation.revenue)}
                  </span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Total HPP Modal</span>
                  <span className="text-slate-200">
                    Rp {formatRupiah(profitSimulation.cogs)}
                  </span>
                </div>
                <div className="flex justify-between text-slate-400 pt-2 border-t border-slate-800">
                  <span className="font-semibold text-slate-200">Estimasi Laba Bersih</span>
                  <span
                    className={`font-bold ${
                      profitSimulation.profit >= 0 ? 'text-emerald-400' : 'text-rose-400'
                    }`}
                  >
                    Rp {formatRupiah(profitSimulation.profit)}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modal Konfirmasi Simpan Draf */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl space-y-4">
            <h3 className="text-lg font-bold text-slate-900">
              Konfirmasi Simpan Pesanan
            </h3>
            <p className="text-sm text-slate-600">
              Apakah Anda yakin ingin menyimpan pesanan ini untuk{' '}
              <strong>{selectedCustomer?.name}</strong> dengan total nilai{' '}
              <strong>Rp {formatRupiah(previewTotals?.grandTotal || 0)}</strong>?
            </p>

            {hasBelowMin && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <span>
                  Perhatian: Ada harga di bawah batas minimal. Pengajuan akan memerlukan persetujuan
                  pemilik usaha.
                </span>
              </div>
            )}

            <div className="flex items-center justify-end gap-3 pt-3">
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                className="px-4 py-2 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 font-medium text-xs min-h-[44px]"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleSubmitForm}
                disabled={submitting}
                className="px-4 py-2 rounded-lg bg-indigo-600 text-white font-semibold text-xs hover:bg-indigo-700 transition min-h-[44px] flex items-center gap-1.5"
              >
                {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Ya, Simpan Pesanan
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
