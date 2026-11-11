'use client';

import React, { useEffect, useState, useCallback, useRef } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import {
  Package,
  Plus,
  Search,
  Edit2,
  Trash2,
  History,
  X,
  AlertCircle,
  CheckCircle2,
  Image as ImageIcon,
  Star,
  Upload,
  Layers,
  Loader2,
  Link as LinkIcon,
} from 'lucide-react';
import { Skeleton, EmptyState, ErrorState } from '@/components/ui/States';
import { MoneyInput } from '@/components/ui/MoneyInput';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { ConfirmTypeDialog } from '@/components/ui/ConfirmTypeDialog';
import { formatRupiah } from '@/lib/domain/money';
import { PatenPrice } from '@/components/ui/PatenPrice';
import { SortableHeader } from '@/components/ui/SortableHeader';

interface CategoryItem {
  id: string;
  name: string;
  sortOrder: number;
  _count?: { products: number };
}

interface ProductImageItem {
  id: string;
  path: string;
  sortOrder: number;
  isPrimary: boolean;
  url: string;
}

// Representasi produk dari respons API (Sales DTO vs Super Admin DTO)
interface ProductListItem {
  id: string;
  sku: string;
  name: string;
  unit: string;
  description: string | null;
  categoryId: string | null;
  category: { id: string; name: string } | null;
  basePrice: number;
  minPrice: number;
  available: number;
  isActive: boolean;
  imageUrl: string | null;

  // Khusus Super Admin (undefined untuk Sales)
  costPrice?: number;
  marginAmount?: number;
  marginBps?: number;
  stockQty?: number;
  reservedQty?: number;
  minStockAlert?: number;
  defaultVendorId?: string | null;
  rev?: number;
}

interface ProductDetailItem extends ProductListItem {
  images: ProductImageItem[];
}

export default function ProductsPage() {
  const router = useRouter();

  // User & role
  const [userRole, setUserRole] = useState<'SUPERADMIN' | 'SALES' | null>(null);
  const [activeBusinessName, setActiveBusinessName] = useState<string>('');

  // Data states
  const [products, setProducts] = useState<ProductListItem[]>([]);
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [sortBy, setSortBy] = useState<string>('name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  const handleSort = (field: string) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('asc');
    }
  };

  // Debounce search query 300 ms
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 300);
    return () => clearTimeout(handler);
  }, [searchQuery]);

  // Notifications
  const [feedbackSuccess, setFeedbackSuccess] = useState<string | null>(null);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);

  // Modal Buat Katalog dari Produk Aktif (Addendum v2)
  const [showFromProductsModal, setShowFromProductsModal] = useState(false);
  const [fromProductsTitle, setFromProductsTitle] = useState('');
  const [fromProductsCustomerId, setFromProductsCustomerId] = useState('');
  const [fromProductsCategoryId, setFromProductsCategoryId] = useState('');
  const [creatingCatalog, setCreatingCatalog] = useState(false);
  const [fromProductsError, setFromProductsError] = useState<string | null>(null);
  const [customersList, setCustomersList] = useState<Array<{ id: string; name: string; code: string }>>([]);

  const openFromProductsModal = async () => {
    setShowFromProductsModal(true);
    setFromProductsError(null);
    setFromProductsTitle(
      `Katalog Penawaran ${activeBusinessName || ''} - ${new Date().toLocaleDateString('id-ID')}`.trim()
    );
    if (customersList.length === 0) {
      try {
        const cRes = await fetch('/api/v1/customers?limit=100');
        if (cRes.ok) {
          const cJson = await cRes.json();
          if (cJson.ok && Array.isArray(cJson.data)) {
            setCustomersList(cJson.data);
          }
        }
      } catch {
        // Abaikan
      }
    }
  };

  const handleCreateFromProducts = async () => {
    if (!fromProductsTitle.trim()) {
      setFromProductsError('Judul katalog wajib diisi.');
      return;
    }
    setCreatingCatalog(true);
    setFromProductsError(null);
    try {
      const res = await fetch('/api/v1/catalogs/from-products', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: window.location.origin,
        },
        body: JSON.stringify({
          title: fromProductsTitle.trim(),
          customerId: fromProductsCustomerId || undefined,
          categoryId: fromProductsCategoryId || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setFromProductsError(json?.error?.message || 'Gagal membuat katalog.');
        return;
      }
      setShowFromProductsModal(false);
      setFromProductsTitle('');
      router.push(`/catalogs/${json.data.id}`);
    } catch {
      setFromProductsError('Terjadi kesalahan jaringan.');
    } finally {
      setCreatingCatalog(false);
    }
  };

  // Modal Tambah Produk
  const [showAddModal, setShowAddModal] = useState(false);
  const [savingAdd, setSavingAdd] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [newProduct, setNewProduct] = useState({
    sku: '',
    name: '',
    unit: 'PCS',
    description: '',
    categoryId: '',
    costPrice: 0,
    basePrice: 0,
    minPrice: 0,
    stockQty: 0,
    minStockAlert: 5,
    isActive: true,
  });

  // Modal Edit Produk
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<ProductDetailItem | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    sku: '',
    name: '',
    unit: 'PCS',
    description: '',
    categoryId: '',
    costPrice: 0,
    basePrice: 0,
    minPrice: 0,
    stockQty: 0,
    minStockAlert: 5,
    isActive: true,
    rev: 1,
    priceReason: '',
  });

  // Nilai awal harga untuk deteksi perubahan harga pada Edit
  const [initialPrices, setInitialPrices] = useState({
    costPrice: 0,
    basePrice: 0,
    minPrice: 0,
  });

  // Upload foto di Edit Modal
  const [uploadingImages, setUploadingImages] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const [imageUrlInput, setImageUrlInput] = useState('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Soft Delete Dialog
  const [deletingProduct, setDeletingProduct] = useState<ProductListItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // 1. Muat info user & unit usaha aktif
  useEffect(() => {
    async function initUserContext() {
      try {
        const [meRes, bizRes] = await Promise.all([
          fetch('/api/v1/auth/me'),
          fetch('/api/v1/business'),
        ]);

        if (meRes.ok) {
          const meJson = await meRes.json();
          if (meJson.ok && meJson.data?.user) {
            setUserRole(meJson.data.user.role);
          }
        }

        if (bizRes.ok) {
          const bizJson = await bizRes.json();
          if (bizJson.ok && bizJson.data) {
            setActiveBusinessName(bizJson.data.name);
          }
        }
      } catch {
        // Fallback default
      }
    }

    initUserContext();
  }, []);

  // 2. Muat kategori
  const loadCategories = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/categories');
      if (res.ok) {
        const json = await res.json();
        if (json.ok && Array.isArray(json.data)) {
          setCategories(json.data);
        }
      }
    } catch {
      // Abaikan error minor kategori
    }
  }, []);

  // 3. Muat daftar produk
  const loadProducts = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams();
      if (debouncedSearch.trim()) {
        params.set('q', debouncedSearch.trim());
      }
      if (selectedCategory !== 'all') {
        params.set('categoryId', selectedCategory);
      }
      if (selectedStatus === 'active') {
        params.set('active', 'true');
      } else if (selectedStatus === 'inactive') {
        params.set('active', 'false');
      }
      params.set('sortBy', sortBy);
      params.set('sortOrder', sortOrder);

      const res = await fetch(`/api/v1/products?${params.toString()}`);
      if (!res.ok) {
        throw new Error('Gagal memuat katalog produk');
      }

      const json = await res.json();
      if (json.ok && Array.isArray(json.data)) {
        setProducts(json.data);
      } else {
        setProducts([]);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Terjadi kesalahan sistem');
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, selectedCategory, selectedStatus, sortBy, sortOrder]);

  useEffect(() => {
    loadCategories();
  }, [loadCategories]);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  // Handler Buka Modal Edit Produk
  const handleOpenEdit = async (productId: string) => {
    try {
      setShowEditModal(true);
      setLoadingDetail(true);
      setEditError(null);
      setImageError(null);

      const res = await fetch(`/api/v1/products/${productId}`);
      if (!res.ok) {
        throw new Error('Gagal memuat data produk terbaru');
      }

      const json = await res.json();
      if (!json.ok || !json.data) {
        throw new Error('Data produk tidak valid');
      }

      const p: ProductDetailItem = json.data;
      setEditingProduct(p);

      const currentCost = p.costPrice ?? 0;
      const currentBase = p.basePrice ?? 0;
      const currentMin = p.minPrice ?? 0;

      setInitialPrices({
        costPrice: currentCost,
        basePrice: currentBase,
        minPrice: currentMin,
      });

      setEditForm({
        sku: p.sku,
        name: p.name,
        unit: p.unit,
        description: p.description || '',
        categoryId: p.categoryId || '',
        costPrice: currentCost,
        basePrice: currentBase,
        minPrice: currentMin,
        stockQty: p.stockQty ?? 0,
        minStockAlert: p.minStockAlert ?? 5,
        isActive: p.isActive,
        rev: p.rev ?? 1,
        priceReason: '',
      });
    } catch (err: unknown) {
      setEditError(err instanceof Error ? err.message : 'Gagal membuka detail produk');
    } finally {
      setLoadingDetail(false);
    }
  };

  // Cek apakah harga berubah pada Edit Form
  const isPriceChanged =
    editForm.costPrice !== initialPrices.costPrice ||
    editForm.basePrice !== initialPrices.basePrice ||
    editForm.minPrice !== initialPrices.minPrice;

  // Handler Submit Tambah Produk
  const handleCreateProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddError(null);

    // Validasi aturan: minPrice <= basePrice
    if (newProduct.minPrice > newProduct.basePrice) {
      setAddError('Harga minimal tidak boleh melebihi harga dasar.');
      return;
    }

    try {
      setSavingAdd(true);
      const res = await fetch('/api/v1/products', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sku: newProduct.sku.trim().toUpperCase(),
          name: newProduct.name.trim(),
          unit: newProduct.unit.trim(),
          description: newProduct.description.trim() || null,
          categoryId: newProduct.categoryId || null,
          costPrice: newProduct.costPrice,
          basePrice: newProduct.basePrice,
          minPrice: newProduct.minPrice,
          stockQty: newProduct.stockQty,
          minStockAlert: newProduct.minStockAlert,
          isActive: newProduct.isActive,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error?.message || 'Gagal menyimpan produk');
      }

      setFeedbackSuccess(`Produk "${newProduct.name}" berhasil ditambahkan.`);
      setShowAddModal(false);
      setNewProduct({
        sku: '',
        name: '',
        unit: 'PCS',
        description: '',
        categoryId: '',
        costPrice: 0,
        basePrice: 0,
        minPrice: 0,
        stockQty: 0,
        minStockAlert: 5,
        isActive: true,
      });
      loadProducts();
      loadCategories();
    } catch (err: unknown) {
      setAddError(err instanceof Error ? err.message : 'Terjadi kesalahan');
    } finally {
      setSavingAdd(false);
    }
  };

  // Handler Submit Edit Produk
  const handleUpdateProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProduct) return;
    setEditError(null);

    // Validasi aturan: minPrice <= basePrice
    if (editForm.minPrice > editForm.basePrice) {
      setEditError('Harga minimal tidak boleh melebihi harga dasar.');
      return;
    }

    // Validasi aturan: priceReason wajib jika harga berubah
    if (isPriceChanged && (!editForm.priceReason || editForm.priceReason.trim().length < 3)) {
      setEditError('Alasan perubahan harga (priceReason) wajib diisi minimal 3 karakter.');
      return;
    }

    try {
      setSavingEdit(true);
      const res = await fetch(`/api/v1/products/${editingProduct.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sku: editForm.sku.trim().toUpperCase(),
          name: editForm.name.trim(),
          unit: editForm.unit.trim(),
          description: editForm.description.trim() || null,
          categoryId: editForm.categoryId || null,
          costPrice: editForm.costPrice,
          basePrice: editForm.basePrice,
          minPrice: editForm.minPrice,
          stockQty: editForm.stockQty,
          minStockAlert: editForm.minStockAlert,
          isActive: editForm.isActive,
          rev: editForm.rev,
          priceReason: isPriceChanged ? editForm.priceReason.trim() : null,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        if (res.status === 409) {
          throw new Error('Data produk telah diperbarui oleh sesi lain. Silakan tutup dan muat ulang.');
        }
        throw new Error(json.error?.message || 'Gagal memperbarui produk');
      }

      setFeedbackSuccess(`Produk "${editForm.name}" berhasil diperbarui.`);
      setShowEditModal(false);
      setEditingProduct(null);
      loadProducts();
    } catch (err: unknown) {
      setEditError(err instanceof Error ? err.message : 'Terjadi kesalahan');
    } finally {
      setSavingEdit(false);
    }
  };

  // Handler Upload Foto Baru pada Edit Modal
  const handleUploadImages = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!editingProduct || !e.target.files || e.target.files.length === 0) return;
    setImageError(null);

    const files = Array.from(e.target.files);
    const currentCount = editingProduct.images?.length || 0;

    if (currentCount + files.length > 8) {
      setImageError(`Total foto tidak boleh melebihi batas maksimal 8 (tersisa kuota ${8 - currentCount} foto).`);
      return;
    }

    try {
      setUploadingImages(true);
      const formData = new FormData();
      for (const f of files) {
        formData.append('images', f);
      }

      const res = await fetch(`/api/v1/products/${editingProduct.id}/images`, {
        method: 'POST',
        body: formData,
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error?.message || 'Gagal mengunggah foto');
      }

      // Refresh detail produk
      const freshRes = await fetch(`/api/v1/products/${editingProduct.id}`);
      if (freshRes.ok) {
        const freshJson = await freshRes.json();
        if (freshJson.ok && freshJson.data) {
          setEditingProduct(freshJson.data);
        }
      }
      loadProducts();
    } catch (err: unknown) {
      setImageError(err instanceof Error ? err.message : 'Gagal mengunggah foto');
    } finally {
      setUploadingImages(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // Upload foto produk dari URL
  const handleUploadImageFromUrl = async () => {
    if (!editingProduct || !imageUrlInput.trim()) return;
    setImageError(null);

    const currentCount = editingProduct.images?.length || 0;
    if (currentCount >= 8) {
      setImageError('Total foto tidak boleh melebihi batas maksimal 8.');
      return;
    }

    try {
      setUploadingImages(true);
      const res = await fetch(`/api/v1/products/${editingProduct.id}/images/from-url`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: imageUrlInput.trim() }),
      });

      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(json.error?.message || 'Gagal mengambil foto dari URL');
      }

      setImageUrlInput('');
      // Refresh detail produk
      const freshRes = await fetch(`/api/v1/products/${editingProduct.id}`);
      if (freshRes.ok) {
        const freshJson = await freshRes.json();
        if (freshJson.ok && freshJson.data) {
          setEditingProduct(freshJson.data);
        }
      }
      loadProducts();
    } catch (err: unknown) {
      setImageError(err instanceof Error ? err.message : 'Gagal mengambil foto dari URL');
    } finally {
      setUploadingImages(false);
    }
  };

  // Handler Set Foto Utama
  const handleSetPrimaryImage = async (imageId: string) => {
    if (!editingProduct) return;
    setImageError(null);

    try {
      const res = await fetch(`/api/v1/products/${editingProduct.id}/images/${imageId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isPrimary: true }),
      });

      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error?.message || 'Gagal mengatur foto utama');
      }

      // Update state lokal foto
      setEditingProduct((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          images: prev.images.map((img) => ({
            ...img,
            isPrimary: img.id === imageId,
          })),
        };
      });
      loadProducts();
    } catch (err: unknown) {
      setImageError(err instanceof Error ? err.message : 'Gagal mengatur foto utama');
    }
  };

  // Handler Hapus Foto
  const handleDeleteImage = async (imageId: string) => {
    if (!editingProduct) return;
    setImageError(null);

    try {
      const res = await fetch(`/api/v1/products/${editingProduct.id}/images/${imageId}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error?.message || 'Gagal menghapus foto');
      }

      // Refresh detail produk
      const freshRes = await fetch(`/api/v1/products/${editingProduct.id}`);
      if (freshRes.ok) {
        const freshJson = await freshRes.json();
        if (freshJson.ok && freshJson.data) {
          setEditingProduct(freshJson.data);
        }
      }
      loadProducts();
    } catch (err: unknown) {
      setImageError(err instanceof Error ? err.message : 'Gagal menghapus foto');
    }
  };

  // Handler Soft Delete Produk
  const handleConfirmDelete = async () => {
    if (!deletingProduct) return;

    try {
      setIsDeleting(true);
      const res = await fetch(`/api/v1/products/${deletingProduct.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: deletingProduct.name }),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error?.message || 'Gagal menghapus produk');
      }

      setFeedbackSuccess(`Produk "${deletingProduct.name}" berhasil dihapus.`);
      setDeletingProduct(null);
      loadProducts();
      loadCategories();
    } catch (err: unknown) {
      setFeedbackError(err instanceof Error ? err.message : 'Terjadi kesalahan saat menghapus');
    } finally {
      setIsDeleting(false);
    }
  };

  const isSuperAdmin = userRole === 'SUPERADMIN';

  return (
    <div className="space-y-6 max-w-7xl mx-auto px-2 sm:px-4 py-4">
      {/* Header Halaman */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900">
              Katalog Produk
            </h1>
            {activeBusinessName && (
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                {activeBusinessName}
              </span>
            )}
          </div>
          <p className="text-sm text-slate-500 mt-1">
            {isSuperAdmin
              ? 'Kelola master produk, pantau HPP modal, margin keuntungan, dan riwayat revisi harga.'
              : 'Daftar produk dengan harga katalog, harga paten (batas minimal penawaran), dan ketersediaan stok.'}
          </p>
        </div>

        {/* Tombol Aksi Header */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={openFromProductsModal}
            className="min-h-[44px] px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-lg text-sm transition-colors flex items-center justify-center gap-2 shadow-sm shrink-0"
            title="Buat katalog baru otomatis dari seluruh produk aktif"
          >
            <Layers className="w-4 h-4" />
            <span>Buat Katalog</span>
          </button>

          {/* Tombol Tambah Produk (Hanya Super Admin) */}
          {isSuperAdmin && (
            <button
              type="button"
              onClick={() => setShowAddModal(true)}
              className="min-h-[44px] px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg text-sm transition-colors flex items-center justify-center gap-2 shadow-sm shrink-0"
            >
              <Plus className="w-5 h-5" />
              <span>Tambah Produk</span>
            </button>
          )}
        </div>
      </div>

      {/* Banner Feedback */}
      {feedbackSuccess && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg flex items-center justify-between animate-in fade-in">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <span className="text-sm font-medium">{feedbackSuccess}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedbackSuccess(null)}
            className="p-1 text-emerald-600 hover:text-emerald-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {feedbackError && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-800 rounded-lg flex items-center justify-between animate-in fade-in">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />
            <span className="text-sm font-medium">{feedbackError}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedbackError(null)}
            className="p-1 text-red-600 hover:text-red-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Filter Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Pencarian (Debounce 300 ms) */}
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="w-4 h-4 text-slate-400" />
            </div>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari SKU atau nama produk..."
              className="w-full min-h-[44px] pl-9 pr-3 py-2 text-base md:text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-slate-900"
            />
          </div>

          {/* Filter Kategori */}
          <div>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="w-full min-h-[44px] px-3 py-2 text-base md:text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-slate-900"
            >
              <option value="all">Semua Kategori</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} {c._count ? `(${c._count.products})` : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Filter Status Aktif */}
          <div>
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="w-full min-h-[44px] px-3 py-2 text-base md:text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-slate-900"
            >
              <option value="all">Semua Status</option>
              <option value="active">Aktif</option>
              <option value="inactive">Nonaktif</option>
            </select>
          </div>

          {/* Pengurutan Cepat */}
          <div>
            <select
              aria-label="Urutkan Produk"
              value={`${sortBy}-${sortOrder}`}
              onChange={(e) => {
                const [field, order] = e.target.value.split('-');
                setSortBy(field);
                setSortOrder(order as 'asc' | 'desc');
              }}
              className="w-full min-h-[44px] px-3 py-2 text-base md:text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-slate-900"
            >
              <option value="name-asc">Nama Produk (A - Z)</option>
              <option value="name-desc">Nama Produk (Z - A)</option>
              <option value="sku-asc">SKU (A - Z)</option>
              <option value="sku-desc">SKU (Z - A)</option>
              <option value="basePrice-asc">Harga (Termurah)</option>
              <option value="basePrice-desc">Harga (Tertinggi)</option>
              <option value="stockQty-desc">Stok (Terbanyak)</option>
              <option value="stockQty-asc">Stok (Tersedikit)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Konten Utama */}
      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : error ? (
        <ErrorState
          title="Gagal Memuat Produk"
          message={error}
          onRetry={loadProducts}
        />
      ) : products.length === 0 ? (
        <EmptyState
          title="Belum Ada Produk"
          description={
            debouncedSearch || selectedCategory !== 'all' || selectedStatus !== 'all'
              ? 'Tidak ada produk yang sesuai dengan filter pencarian.'
              : 'Belum ada produk yang tercatat di unit usaha ini.'
          }
          actionText={isSuperAdmin ? 'Tambah Produk Pertama' : undefined}
          onAction={isSuperAdmin ? () => setShowAddModal(true) : undefined}
        />
      ) : (
        <>
          {/* Tampilan Desktop (Tabel) */}
          <div className="hidden md:block bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-slate-700">
                <thead className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  <tr>
                    <th scope="col" className="px-4 py-3 w-14">
                      Foto
                    </th>
                    <SortableHeader
                      label="SKU"
                      field="sku"
                      currentSortBy={sortBy}
                      currentSortOrder={sortOrder}
                      onSort={handleSort}
                    />
                    <SortableHeader
                      label="Nama Produk"
                      field="name"
                      currentSortBy={sortBy}
                      currentSortOrder={sortOrder}
                      onSort={handleSort}
                    />
                    <th scope="col" className="px-4 py-3">
                      Kategori
                    </th>
                    {isSuperAdmin ? (
                      <>
                        <SortableHeader
                          label="Stok"
                          field="stockQty"
                          currentSortBy={sortBy}
                          currentSortOrder={sortOrder}
                          onSort={handleSort}
                          align="right"
                        />
                        <th scope="col" className="px-4 py-3 text-right">
                          HPP (Modal)
                        </th>
                        <SortableHeader
                          label="Harga Dasar"
                          field="basePrice"
                          currentSortBy={sortBy}
                          currentSortOrder={sortOrder}
                          onSort={handleSort}
                          align="right"
                        />
                        <th scope="col" className="px-4 py-3 text-right">
                          Margin
                        </th>
                        <th scope="col" className="px-4 py-3 text-right">
                          Harga Minimal
                        </th>
                      </>
                    ) : (
                      <>
                        <SortableHeader
                          label="Harga Katalog"
                          field="basePrice"
                          currentSortBy={sortBy}
                          currentSortOrder={sortOrder}
                          onSort={handleSort}
                          align="right"
                        />
                        <th scope="col" className="px-4 py-3 text-right">
                          Harga Paten
                        </th>
                        <SortableHeader
                          label="Tersedia"
                          field="stockQty"
                          currentSortBy={sortBy}
                          currentSortOrder={sortOrder}
                          onSort={handleSort}
                          align="right"
                        />
                      </>
                    )}
                    <th scope="col" className="px-4 py-3 text-center">
                      Status
                    </th>
                    {isSuperAdmin && (
                      <th scope="col" className="px-4 py-3 text-center w-36">
                        Aksi
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {products.map((p) => {
                    return (
                      <tr key={p.id} className="hover:bg-slate-50/70 transition-colors">
                        {/* Foto Thumbnail */}
                        <td className="px-4 py-3">
                          <div className="w-10 h-10 rounded-lg bg-slate-100 border border-slate-200 overflow-hidden flex items-center justify-center shrink-0">
                            {p.imageUrl ? (
                              <Image
                                src={p.imageUrl}
                                alt={p.name}
                                width={40}
                                height={40}
                                unoptimized
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <ImageIcon className="w-5 h-5 text-slate-400" />
                            )}
                          </div>
                        </td>

                        {/* SKU */}
                        <td className="px-4 py-3 font-mono text-xs font-semibold text-slate-900">
                          {p.sku}
                        </td>

                        {/* Nama Produk */}
                        <td className="px-4 py-3">
                          <div className="font-medium text-slate-900">{p.name}</div>
                          <div className="text-xs text-slate-400">{p.unit}</div>
                        </td>

                        {/* Kategori */}
                        <td className="px-4 py-3 text-xs text-slate-600">
                          {p.category ? (
                            <span className="inline-block px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                              {p.category.name}
                            </span>
                          ) : (
                            <span className="text-slate-400">-</span>
                          )}
                        </td>

                        {/* Kolom Berdasarkan Role */}
                        {isSuperAdmin ? (
                          <>
                            {/* Stok (Super Admin) */}
                            <td className="px-4 py-3 text-right">
                              <span
                                className={`font-semibold ${
                                  (p.available ?? 0) <= (p.minStockAlert ?? 5)
                                    ? 'text-red-600'
                                    : 'text-slate-800'
                                }`}
                              >
                                {p.available} {p.unit}
                              </span>
                              <div className="text-xs text-slate-400">
                                Total: {p.stockQty}
                              </div>
                            </td>

                            {/* HPP (Super Admin) */}
                            <td className="px-4 py-3 text-right font-mono text-slate-600">
                              {formatRupiah(p.costPrice ?? 0)}
                            </td>

                            {/* Harga Dasar (Super Admin) */}
                            <td className="px-4 py-3 text-right font-mono font-semibold text-slate-900">
                              {formatRupiah(p.basePrice)}
                            </td>

                            {/* Margin (Super Admin) */}
                            <td className="px-4 py-3 text-right">
                              <div className="font-mono text-emerald-700 font-semibold text-xs">
                                +{formatRupiah(p.marginAmount ?? 0)}
                              </div>
                              <div className="text-xs text-slate-400">
                                {((p.marginBps ?? 0) / 100).toFixed(1)}%
                              </div>
                            </td>

                            {/* Harga Minimal (Super Admin) */}
                            <td className="px-4 py-3 text-right font-mono text-xs text-slate-700">
                              {formatRupiah(p.minPrice)}
                            </td>
                          </>
                        ) : (
                          <>
                            {/* Harga Katalog (Sales) */}
                            <td className="px-4 py-3 text-right font-mono font-semibold text-slate-900">
                              {formatRupiah(p.basePrice)}
                            </td>

                            {/* Harga Paten (Sales) */}
                            <td className="px-4 py-3 text-right font-mono text-xs">
                              <PatenPrice value={p.minPrice} showPrefix={false} />
                            </td>

                            {/* Stok Tersedia (Sales) */}
                            <td className="px-4 py-3 text-right font-semibold text-slate-800">
                              {p.available} {p.unit}
                            </td>
                          </>
                        )}

                        {/* Status */}
                        <td className="px-4 py-3 text-center">
                          <StatusBadge status={p.isActive} />
                        </td>

                        {/* Aksi (Hanya Super Admin) */}
                        {isSuperAdmin && (
                          <td className="px-4 py-3 text-center">
                            <div className="flex items-center justify-center gap-1">
                              <button
                                type="button"
                                title="Edit Produk"
                                onClick={() => handleOpenEdit(p.id)}
                                className="p-1.5 rounded-lg text-slate-500 hover:text-blue-600 hover:bg-blue-50 transition-colors min-h-[36px] min-w-[36px] flex items-center justify-center"
                              >
                                <Edit2 className="w-4 h-4" />
                              </button>

                              <Link
                                href={`/products/${p.id}/prices`}
                                title="Riwayat Harga"
                                className="p-1.5 rounded-lg text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 transition-colors min-h-[36px] min-w-[36px] flex items-center justify-center"
                              >
                                <History className="w-4 h-4" />
                              </Link>

                              <button
                                type="button"
                                title="Hapus Produk"
                                onClick={() => setDeletingProduct(p)}
                                className="p-1.5 rounded-lg text-slate-500 hover:text-red-600 hover:bg-red-50 transition-colors min-h-[36px] min-w-[36px] flex items-center justify-center"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Tampilan Mobile (Kartu Responsif 360px) */}
          <div className="md:hidden space-y-3">
            {products.map((p) => {
              return (
                <div
                  key={p.id}
                  className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-3"
                >
                  {/* Baris Atas: Foto, SKU, Nama, Status */}
                  <div className="flex items-start gap-3">
                    <div className="w-12 h-12 rounded-lg bg-slate-100 border border-slate-200 overflow-hidden flex items-center justify-center shrink-0">
                      {p.imageUrl ? (
                        <Image
                          src={p.imageUrl}
                          alt={p.name}
                          width={48}
                          height={48}
                          unoptimized
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <ImageIcon className="w-6 h-6 text-slate-400" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-xs font-bold text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded">
                          {p.sku}
                        </span>
                        <StatusBadge status={p.isActive} />
                      </div>
                      <h4 className="font-semibold text-slate-900 text-sm mt-1 truncate">
                        {p.name}
                      </h4>
                      <p className="text-xs text-slate-500">
                        {p.category?.name || 'Tanpa Kategori'} • Satuan: {p.unit}
                      </p>
                    </div>
                  </div>

                  {/* Grid Harga & Stok */}
                  {isSuperAdmin ? (
                    <div className="grid grid-cols-2 gap-2 p-2.5 bg-slate-50 rounded-lg text-xs">
                      <div>
                        <span className="text-slate-400 block">HPP (Modal):</span>
                        <span className="font-mono font-medium text-slate-700">
                          {formatRupiah(p.costPrice ?? 0)}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400 block">Harga Dasar:</span>
                        <span className="font-mono font-bold text-slate-900">
                          {formatRupiah(p.basePrice)}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400 block">Margin:</span>
                        <span className="font-mono font-semibold text-emerald-700">
                          +{formatRupiah(p.marginAmount ?? 0)} ({((p.marginBps ?? 0) / 100).toFixed(1)}%)
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400 block">Harga Minimal:</span>
                        <span className="font-mono text-slate-700">
                          {formatRupiah(p.minPrice)}
                        </span>
                      </div>
                      <div className="col-span-2 pt-1 border-t border-slate-200 flex justify-between items-center">
                        <span className="text-slate-500">Stok Tersedia:</span>
                        <span
                          className={`font-semibold ${
                            (p.available ?? 0) <= (p.minStockAlert ?? 5)
                              ? 'text-red-600'
                              : 'text-slate-900'
                          }`}
                        >
                          {p.available} {p.unit} (Total: {p.stockQty})
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-2 p-2.5 bg-slate-50 rounded-lg text-xs">
                      <div>
                        <span className="text-slate-400 block">Harga Katalog:</span>
                        <span className="font-mono font-bold text-slate-900">
                          {formatRupiah(p.basePrice)}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400 block">Harga Paten:</span>
                        <PatenPrice value={p.minPrice} showPrefix={false} />
                      </div>
                      <div className="col-span-2 pt-1 border-t border-slate-200 flex justify-between items-center">
                        <span className="text-slate-500">Stok Tersedia:</span>
                        <span className="font-bold text-slate-900">
                          {p.available} {p.unit}
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Tombol Aksi Mobile (Khusus Super Admin) */}
                  {isSuperAdmin && (
                    <div className="flex items-center justify-end gap-2 pt-1 border-t border-slate-100">
                      <Link
                        href={`/products/${p.id}/prices`}
                        className="min-h-[44px] px-3 py-2 border border-slate-300 rounded-lg text-xs font-medium text-slate-700 hover:bg-slate-50 flex items-center gap-1.5 transition-colors"
                      >
                        <History className="w-4 h-4 text-slate-500" />
                        <span>Riwayat</span>
                      </Link>

                      <button
                        type="button"
                        onClick={() => handleOpenEdit(p.id)}
                        className="min-h-[44px] px-3 py-2 border border-blue-300 text-blue-700 bg-blue-50 rounded-lg text-xs font-medium hover:bg-blue-100 flex items-center gap-1.5 transition-colors"
                      >
                        <Edit2 className="w-4 h-4" />
                        <span>Ubah</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setDeletingProduct(p)}
                        className="min-h-[44px] px-3 py-2 border border-red-200 text-red-600 bg-red-50 rounded-lg text-xs font-medium hover:bg-red-100 flex items-center gap-1.5 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                        <span>Hapus</span>
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Modal Tambah Produk (Super Admin) */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-2xl my-8 overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between p-4 border-b border-slate-100 bg-slate-50">
              <div className="flex items-center gap-2 text-blue-600">
                <Package className="w-5 h-5" />
                <h3 className="font-semibold text-slate-800">Tambah Produk Baru</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 min-h-[44px] min-w-[44px] flex items-center justify-center"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateProduct} className="p-5 space-y-4 max-h-[80vh] overflow-y-auto">
              {addError && (
                <div className="p-3 bg-red-50 border border-red-200 text-red-800 text-sm rounded-lg flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                  <span>{addError}</span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* SKU */}
                <div>
                  <label className="text-sm font-semibold text-slate-700 block mb-1">
                    Kode SKU <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={newProduct.sku}
                    onChange={(e) =>
                      setNewProduct({ ...newProduct, sku: e.target.value.toUpperCase() })
                    }
                    placeholder="Contoh: PRD-001"
                    className="w-full min-h-[44px] px-3 py-2 text-base md:text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 font-mono"
                  />
                  <p className="text-xs text-slate-400 mt-1">Huruf besar unik per unit usaha</p>
                </div>

                {/* Nama Produk */}
                <div>
                  <label className="text-sm font-semibold text-slate-700 block mb-1">
                    Nama Produk <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={newProduct.name}
                    onChange={(e) =>
                      setNewProduct({ ...newProduct, name: e.target.value })
                    }
                    placeholder="Nama lengkap produk"
                    className="w-full min-h-[44px] px-3 py-2 text-base md:text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Kategori */}
                <div>
                  <label className="text-sm font-semibold text-slate-700 block mb-1">
                    Kategori
                  </label>
                  <select
                    value={newProduct.categoryId}
                    onChange={(e) =>
                      setNewProduct({ ...newProduct, categoryId: e.target.value })
                    }
                    className="w-full min-h-[44px] px-3 py-2 text-base md:text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900"
                  >
                    <option value="">Tanpa Kategori</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Satuan */}
                <div>
                  <label className="text-sm font-semibold text-slate-700 block mb-1">
                    Satuan <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={newProduct.unit}
                    onChange={(e) =>
                      setNewProduct({ ...newProduct, unit: e.target.value })
                    }
                    placeholder="PCS, BOX, PACK, KG..."
                    className="w-full min-h-[44px] px-3 py-2 text-base md:text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900"
                  />
                </div>
              </div>

              {/* Deskripsi */}
              <div>
                <label className="text-sm font-semibold text-slate-700 block mb-1">
                  Deskripsi Singkat
                </label>
                <textarea
                  rows={2}
                  value={newProduct.description}
                  onChange={(e) =>
                    setNewProduct({ ...newProduct, description: e.target.value })
                  }
                  placeholder="Keterangan spesifikasi atau catatan produk"
                  className="w-full px-3 py-2 text-base md:text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900"
                />
              </div>

              {/* Bagian Penetapan Harga (MoneyInput) */}
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                <h4 className="text-xs font-bold text-slate-600 uppercase tracking-wider">
                  Penetapan Harga (Wajib Bilangan Bulat Rupiah)
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <MoneyInput
                    label="HPP / Modal"
                    required
                    value={newProduct.costPrice}
                    onChange={(val) => setNewProduct({ ...newProduct, costPrice: val })}
                    helperText="Rahasia pemilik (Super Admin)"
                  />

                  <MoneyInput
                    label="Harga Dasar"
                    required
                    value={newProduct.basePrice}
                    onChange={(val) => setNewProduct({ ...newProduct, basePrice: val })}
                    helperText="Harga patokan jual standar"
                  />

                  <MoneyInput
                    label="Harga Minimal"
                    required
                    value={newProduct.minPrice}
                    onChange={(val) => setNewProduct({ ...newProduct, minPrice: val })}
                    helperText="Batas bawah negosiasi sales"
                    error={
                      newProduct.minPrice > newProduct.basePrice
                        ? 'Harga min > dasar!'
                        : undefined
                    }
                  />
                </div>

                {newProduct.basePrice > 0 && newProduct.costPrice > 0 && (
                  <div className="flex items-center justify-between text-xs pt-2 border-t border-slate-200">
                    <span className="text-slate-500">Estimasi Margin Keuntungan:</span>
                    <span className="font-semibold text-emerald-700">
                      +{formatRupiah(newProduct.basePrice - newProduct.costPrice)} (
                      {(
                        ((newProduct.basePrice - newProduct.costPrice) * 100) /
                        newProduct.basePrice
                      ).toFixed(1)}
                      %)
                    </span>
                  </div>
                )}

                {/* Peringatan Kerahasiaan HPP bila minPrice <= costPrice */}
                {newProduct.costPrice > 0 && newProduct.minPrice <= newProduct.costPrice && (
                  <div className="p-3 bg-amber-50 border border-amber-300 rounded-lg text-amber-900 text-xs flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-semibold block">Peringatan Kerahasiaan HPP:</span>
                      Harga paten ({formatRupiah(newProduct.minPrice)}) sama dengan atau lebih rendah dari HPP modal ({formatRupiah(newProduct.costPrice)}).
                      Staf Sales dapat melihat harga paten ini, sehingga berisiko menebak modal HPP produk.
                    </div>
                  </div>
                )}
              </div>

              {/* Stok Awal & Peringatan Minimum */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-semibold text-slate-700 block mb-1">
                    Stok Awal
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={newProduct.stockQty}
                    onChange={(e) =>
                      setNewProduct({
                        ...newProduct,
                        stockQty: Math.max(0, parseInt(e.target.value, 10) || 0),
                      })
                    }
                    className="w-full min-h-[44px] px-3 py-2 text-base md:text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900"
                  />
                </div>

                <div>
                  <label className="text-sm font-semibold text-slate-700 block mb-1">
                    Peringatan Stok Menipis
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={newProduct.minStockAlert}
                    onChange={(e) =>
                      setNewProduct({
                        ...newProduct,
                        minStockAlert: Math.max(0, parseInt(e.target.value, 10) || 0),
                      })
                    }
                    className="w-full min-h-[44px] px-3 py-2 text-base md:text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900"
                  />
                </div>
              </div>

              {/* Status Aktif */}
              <div className="flex items-center gap-2 pt-2">
                <input
                  id="add-is-active"
                  type="checkbox"
                  checked={newProduct.isActive}
                  onChange={(e) =>
                    setNewProduct({ ...newProduct, isActive: e.target.checked })
                  }
                  className="w-5 h-5 text-blue-600 rounded border-slate-300 focus:ring-blue-500"
                />
                <label
                  htmlFor="add-is-active"
                  className="text-sm font-medium text-slate-800"
                >
                  Produk Aktif (dapat dilihat dan dipesan oleh Sales)
                </label>
              </div>

              <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  disabled={savingAdd}
                  className="min-h-[44px] px-4 py-2 border border-slate-300 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-100 transition-colors disabled:opacity-50"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={savingAdd || newProduct.minPrice > newProduct.basePrice}
                  className="min-h-[44px] px-5 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors disabled:bg-slate-300 disabled:cursor-not-allowed flex items-center gap-2 shadow-sm"
                >
                  {savingAdd ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Menyimpan...</span>
                    </>
                  ) : (
                    <span>Simpan Produk</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Edit Produk (Super Admin) */}
      {showEditModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-2xl my-8 overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between p-4 border-b border-slate-100 bg-slate-50">
              <div className="flex items-center gap-2 text-blue-600">
                <Edit2 className="w-5 h-5" />
                <h3 className="font-semibold text-slate-800">
                  Ubah Produk: {editingProduct?.sku}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowEditModal(false);
                  setEditingProduct(null);
                }}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 min-h-[44px] min-w-[44px] flex items-center justify-center"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {loadingDetail ? (
              <div className="p-6 space-y-4">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-28 w-full" />
              </div>
            ) : (
              <form onSubmit={handleUpdateProduct} className="p-5 space-y-4 max-h-[80vh] overflow-y-auto">
                {editError && (
                  <div className="p-3 bg-red-50 border border-red-200 text-red-800 text-sm rounded-lg flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                    <span>{editError}</span>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* SKU */}
                  <div>
                    <label className="text-sm font-semibold text-slate-700 block mb-1">
                      Kode SKU <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={editForm.sku}
                      onChange={(e) =>
                        setEditForm({ ...editForm, sku: e.target.value.toUpperCase() })
                      }
                      className="w-full min-h-[44px] px-3 py-2 text-base md:text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 font-mono"
                    />
                  </div>

                  {/* Nama Produk */}
                  <div>
                    <label className="text-sm font-semibold text-slate-700 block mb-1">
                      Nama Produk <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={editForm.name}
                      onChange={(e) =>
                        setEditForm({ ...editForm, name: e.target.value })
                      }
                      className="w-full min-h-[44px] px-3 py-2 text-base md:text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Kategori */}
                  <div>
                    <label className="text-sm font-semibold text-slate-700 block mb-1">
                      Kategori
                    </label>
                    <select
                      value={editForm.categoryId}
                      onChange={(e) =>
                        setEditForm({ ...editForm, categoryId: e.target.value })
                      }
                      className="w-full min-h-[44px] px-3 py-2 text-base md:text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900"
                    >
                      <option value="">Tanpa Kategori</option>
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Satuan */}
                  <div>
                    <label className="text-sm font-semibold text-slate-700 block mb-1">
                      Satuan <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={editForm.unit}
                      onChange={(e) =>
                        setEditForm({ ...editForm, unit: e.target.value })
                      }
                      className="w-full min-h-[44px] px-3 py-2 text-base md:text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900"
                    />
                  </div>
                </div>

                {/* Deskripsi */}
                <div>
                  <label className="text-sm font-semibold text-slate-700 block mb-1">
                    Deskripsi Singkat
                  </label>
                  <textarea
                    rows={2}
                    value={editForm.description}
                    onChange={(e) =>
                      setEditForm({ ...editForm, description: e.target.value })
                    }
                    className="w-full px-3 py-2 text-base md:text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900"
                  />
                </div>

                {/* Galeri Foto Produk (Maksimal 8 Foto) */}
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-xs font-bold text-slate-600 uppercase tracking-wider">
                        Foto Produk ({editingProduct?.images?.length || 0}/8)
                      </h4>
                      <p className="text-xs text-slate-400">
                        Otomatis dikonversi WebP kualitas 82, batas lebar 1600px.
                      </p>
                    </div>

                    {(editingProduct?.images?.length || 0) < 8 && (
                      <div>
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          multiple
                          onChange={handleUploadImages}
                          className="hidden"
                          id="upload-product-images"
                        />
                        <label
                          htmlFor="upload-product-images"
                          className={`min-h-[36px] px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-lg cursor-pointer flex items-center gap-1.5 transition-colors shadow-sm ${
                            uploadingImages ? 'opacity-50 pointer-events-none' : ''
                          }`}
                        >
                          <Upload className="w-3.5 h-3.5" />
                          <span>{uploadingImages ? 'Mengunggah...' : 'Unggah Foto'}</span>
                        </label>
                      </div>
                    )}
                  </div>

                  {(editingProduct?.images?.length || 0) < 8 && (
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 pt-2">
                      <input
                        type="url"
                        value={imageUrlInput}
                        onChange={(e) => setImageUrlInput(e.target.value)}
                        placeholder="Atau tempel URL gambar (https://...)"
                        className="flex-1 text-xs border border-slate-300 rounded-lg px-2.5 py-1.5 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                        disabled={uploadingImages}
                      />
                      <button
                        type="button"
                        onClick={handleUploadImageFromUrl}
                        disabled={uploadingImages || !imageUrlInput.trim()}
                        className="px-3 py-1.5 bg-slate-800 hover:bg-slate-900 disabled:opacity-50 text-white text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 transition-colors shadow-sm shrink-0"
                      >
                        <LinkIcon className="w-3.5 h-3.5" />
                        <span>{uploadingImages ? 'Mengambil...' : 'Ambil dari URL'}</span>
                      </button>
                    </div>
                  )}

                  {imageError && (
                    <p className="text-xs text-red-600 font-medium">{imageError}</p>
                  )}

                  {/* Daftar Foto */}
                  {editingProduct?.images && editingProduct.images.length > 0 ? (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
                      {editingProduct.images.map((img) => (
                        <div
                          key={img.id}
                          className={`relative group rounded-lg overflow-hidden border bg-white shadow-sm flex flex-col ${
                            img.isPrimary ? 'border-amber-400 ring-2 ring-amber-300' : 'border-slate-200'
                          }`}
                        >
                          <div className="h-28 w-full bg-slate-100 overflow-hidden flex items-center justify-center relative">
                            <Image
                              src={img.url}
                              alt="Foto produk"
                              width={112}
                              height={112}
                              unoptimized
                              className="w-full h-full object-cover"
                            />
                            {img.isPrimary && (
                              <span className="absolute top-1 left-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500 text-white flex items-center gap-0.5 shadow">
                                <Star className="w-2.5 h-2.5 fill-white" />
                                Utama
                              </span>
                            )}
                          </div>

                          <div className="p-1.5 bg-slate-50 flex items-center justify-between border-t border-slate-100">
                            {!img.isPrimary ? (
                              <button
                                type="button"
                                onClick={() => handleSetPrimaryImage(img.id)}
                                className="text-[11px] text-blue-600 hover:text-blue-800 font-medium px-1 py-0.5 rounded hover:bg-blue-50"
                              >
                                Set Utama
                              </button>
                            ) : (
                              <span className="text-[10px] text-amber-600 font-semibold px-1">
                                Utama
                              </span>
                            )}
                            <button
                              type="button"
                              onClick={() => handleDeleteImage(img.id)}
                              className="p-1 text-slate-400 hover:text-red-600 rounded hover:bg-red-50"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-6 border-2 border-dashed border-slate-200 rounded-lg">
                      <ImageIcon className="w-8 h-8 text-slate-300 mx-auto mb-1" />
                      <p className="text-xs text-slate-500">
                        Belum ada foto produk. Unggah hingga 8 foto untuk katalog.
                      </p>
                    </div>
                  )}
                </div>

                {/* Penetapan Harga & Alasan Perubahan (MoneyInput) */}
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-slate-600 uppercase tracking-wider">
                      Ubah Harga (Revisi {editForm.rev})
                    </h4>
                    {isPriceChanged && (
                      <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-100 text-amber-800 border border-amber-300">
                        Harga Diubah
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <MoneyInput
                      label="HPP / Modal"
                      required
                      value={editForm.costPrice}
                      onChange={(val) => setEditForm({ ...editForm, costPrice: val })}
                      helperText="Modal pokok produk"
                    />

                    <MoneyInput
                      label="Harga Dasar"
                      required
                      value={editForm.basePrice}
                      onChange={(val) => setEditForm({ ...editForm, basePrice: val })}
                      helperText="Harga patokan jual"
                    />

                    <MoneyInput
                      label="Harga Minimal"
                      required
                      value={editForm.minPrice}
                      onChange={(val) => setEditForm({ ...editForm, minPrice: val })}
                      helperText="Batas bawah negosiasi"
                      error={
                        editForm.minPrice > editForm.basePrice
                          ? 'Harga min > dasar!'
                          : undefined
                      }
                    />
                  </div>

                  {/* Peringatan Kerahasiaan HPP bila minPrice <= costPrice */}
                  {editForm.costPrice > 0 && editForm.minPrice <= editForm.costPrice && (
                    <div className="p-3 bg-amber-50 border border-amber-300 rounded-lg text-amber-900 text-xs flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                      <div>
                        <span className="font-semibold block">Peringatan Kerahasiaan HPP:</span>
                        Harga paten ({formatRupiah(editForm.minPrice)}) sama dengan atau lebih rendah dari HPP modal ({formatRupiah(editForm.costPrice)}).
                        Staf Sales dapat melihat harga paten ini, sehingga berisiko menebak modal HPP produk.
                      </div>
                    </div>
                  )}

                  {/* Input Alasan Perubahan Harga (Wajib diisi jika harga berubah) */}
                  {isPriceChanged && (
                    <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg space-y-1.5 animate-in fade-in">
                      <label className="text-xs font-bold text-amber-900 flex items-center justify-between">
                        <span>
                          Alasan Perubahan Harga (priceReason) <span className="text-red-500">*</span>
                        </span>
                        <span className="text-[10px] text-amber-700">Wajib minimal 3 karakter</span>
                      </label>
                      <textarea
                        rows={2}
                        required
                        value={editForm.priceReason}
                        onChange={(e) =>
                          setEditForm({ ...editForm, priceReason: e.target.value })
                        }
                        placeholder="Contoh: Penyesuaian kenaikan tarif bahan baku dan logistik vendor"
                        className="w-full px-3 py-2 text-base md:text-sm bg-white border border-amber-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 text-slate-900"
                      />
                      <p className="text-[11px] text-amber-700 leading-tight">
                        Sistem akan mencatat riwayat perubahan harga ke <code>PriceHistory</code> secara
                        permanen dan menaikkan versi revisi (rev).
                      </p>
                    </div>
                  )}
                </div>

                {/* Stok & Alert Minimum */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-semibold text-slate-700 block mb-1">
                      Stok Fisik
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={editForm.stockQty}
                      onChange={(e) =>
                        setEditForm({
                          ...editForm,
                          stockQty: Math.max(0, parseInt(e.target.value, 10) || 0),
                        })
                      }
                      className="w-full min-h-[44px] px-3 py-2 text-base md:text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900"
                    />
                  </div>

                  <div>
                    <label className="text-sm font-semibold text-slate-700 block mb-1">
                      Peringatan Stok Menipis
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={editForm.minStockAlert}
                      onChange={(e) =>
                        setEditForm({
                          ...editForm,
                          minStockAlert: Math.max(0, parseInt(e.target.value, 10) || 0),
                        })
                      }
                      className="w-full min-h-[44px] px-3 py-2 text-base md:text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900"
                    />
                  </div>
                </div>

                {/* Status Aktif */}
                <div className="flex items-center gap-2 pt-2">
                  <input
                    id="edit-is-active"
                    type="checkbox"
                    checked={editForm.isActive}
                    onChange={(e) =>
                      setEditForm({ ...editForm, isActive: e.target.checked })
                    }
                    className="w-5 h-5 text-blue-600 rounded border-slate-300 focus:ring-blue-500"
                  />
                  <label
                    htmlFor="edit-is-active"
                    className="text-sm font-medium text-slate-800"
                  >
                    Produk Aktif (dapat dilihat dan dipesan oleh Sales)
                  </label>
                </div>

                <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setShowEditModal(false);
                      setEditingProduct(null);
                    }}
                    disabled={savingEdit}
                    className="min-h-[44px] px-4 py-2 border border-slate-300 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-100 transition-colors disabled:opacity-50"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={
                      savingEdit ||
                      editForm.minPrice > editForm.basePrice ||
                      (isPriceChanged && (!editForm.priceReason || editForm.priceReason.trim().length < 3))
                    }
                    className="min-h-[44px] px-5 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors disabled:bg-slate-300 disabled:cursor-not-allowed flex items-center gap-2 shadow-sm"
                  >
                    {savingEdit ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        <span>Menyimpan...</span>
                      </>
                    ) : (
                      <span>Simpan Perubahan</span>
                    )}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Modal Buat Katalog dari Daftar Produk Aktif (Addendum v2) */}
      {showFromProductsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Layers className="w-5 h-5 text-emerald-600" />
                <h3 className="font-bold text-slate-900 text-base">
                  Buat Katalog Baru
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowFromProductsModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4 overflow-y-auto">
              {fromProductsError && (
                <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{fromProductsError}</span>
                </div>
              )}

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Judul Katalog <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={fromProductsTitle}
                  onChange={(e) => setFromProductsTitle(e.target.value)}
                  placeholder="Misal: Katalog Penawaran Grosir..."
                  className="w-full min-h-[44px] px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-900"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Sasaran Pelanggan (Opsional)
                </label>
                <select
                  value={fromProductsCustomerId}
                  onChange={(e) => setFromProductsCustomerId(e.target.value)}
                  className="w-full min-h-[44px] px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-900"
                >
                  <option value="">-- Katalog Terbuka / Semua Pelanggan --</option>
                  {customersList.map((c) => (
                    <option key={c.id} value={c.id}>
                      [{c.code}] {c.name}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-slate-500 mt-1">
                  Jika dipilih, harga paten khusus pelanggan akan otomatis diterapkan.
                </p>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Filter Kategori (Opsional)
                </label>
                <select
                  value={fromProductsCategoryId}
                  onChange={(e) => setFromProductsCategoryId(e.target.value)}
                  className="w-full min-h-[44px] px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-900"
                >
                  <option value="">-- Semua Kategori Produk Aktif --</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="p-3 bg-emerald-50 rounded-lg border border-emerald-200 text-emerald-900 text-xs">
                Sistem akan menyalin seluruh produk aktif yang sesuai ke dalam katalog baru dengan harga awal otomatis disetel ke harga paten atau dasar.
              </div>
            </div>

            <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-200 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowFromProductsModal(false)}
                className="px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-200 rounded-lg"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleCreateFromProducts}
                disabled={creatingCatalog || !fromProductsTitle.trim()}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg disabled:opacity-50"
              >
                {creatingCatalog ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Layers className="w-4 h-4" />
                )}
                <span>Buat Katalog Sekarang</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Dialog Konfirmasi Soft Delete */}
      <ConfirmTypeDialog
        isOpen={Boolean(deletingProduct)}
        onClose={() => setDeletingProduct(null)}
        onConfirm={handleConfirmDelete}
        title="Konfirmasi Hapus Produk"
        description={`Produk "${deletingProduct?.name}" (${deletingProduct?.sku}) akan dinonaktifkan dan disembunyikan dari katalog penjualan.`}
        confirmTarget={deletingProduct?.name || ''}
        confirmLabel="Hapus Produk"
        loading={isDeleting}
      />
    </div>
  );
}
