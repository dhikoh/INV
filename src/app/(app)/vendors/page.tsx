'use client';

import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import {
  Truck,
  Plus,
  Search,
  Edit2,
  Trash2,
  X,
  AlertCircle,
  CheckCircle2,
  Phone,
  User,
  CreditCard,
  Clock,
  ShieldAlert,
  Package,
  Receipt,
} from 'lucide-react';
import { Skeleton, EmptyState, ErrorState } from '@/components/ui/States';
import { ConfirmTypeDialog } from '@/components/ui/ConfirmTypeDialog';

interface VendorItem {
  id: string;
  businessId: string;
  kind: 'SUPPLIER' | 'TRANSPORT';
  code: string;
  name: string;
  picName: string | null;
  phone: string | null;
  address: string | null;
  bankName: string | null;
  bankAccountNumber: string | null;
  bankAccountHolder: string | null;
  paymentTermDays: number;
  notes: string | null;
  createdAt: string;
  _count?: {
    products: number;
    purchaseOrders: number;
  };
}

export default function VendorsPage() {
  // User & context
  const [userRole, setUserRole] = useState<'SUPERADMIN' | 'SALES' | null>(null);
  const [activeBusinessName, setActiveBusinessName] = useState<string>('');

  // Data states
  const [vendors, setVendors] = useState<VendorItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedKind, setSelectedKind] = useState<string>('all');

  // Notifications
  const [feedbackSuccess, setFeedbackSuccess] = useState<string | null>(null);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);

  // Debounce search query 300 ms
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 300);
    return () => clearTimeout(handler);
  }, [searchQuery]);

  // Modal Tambah Vendor
  const [showAddModal, setShowAddModal] = useState(false);
  const [savingAdd, setSavingAdd] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [newVendor, setNewVendor] = useState({
    kind: 'SUPPLIER' as 'SUPPLIER' | 'TRANSPORT',
    code: '',
    name: '',
    picName: '',
    phone: '',
    address: '',
    bankName: '',
    bankAccountNumber: '',
    bankAccountHolder: '',
    paymentTermDays: 0,
    notes: '',
  });

  // Modal Edit Vendor
  const [editingVendor, setEditingVendor] = useState<VendorItem | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    kind: 'SUPPLIER' as 'SUPPLIER' | 'TRANSPORT',
    code: '',
    name: '',
    picName: '',
    phone: '',
    address: '',
    bankName: '',
    bankAccountNumber: '',
    bankAccountHolder: '',
    paymentTermDays: 0,
    notes: '',
  });

  // Soft Delete Dialog
  const [deletingVendor, setDeletingVendor] = useState<VendorItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // 1. Muat profil user & unit usaha aktif
  useEffect(() => {
    async function initContext() {
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

    initContext();
  }, []);

  // 2. Muat data vendor
  const loadVendors = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams();
      if (debouncedSearch.trim()) {
        params.set('q', debouncedSearch.trim());
      }
      if (selectedKind !== 'all') {
        params.set('kind', selectedKind);
      }

      const res = await fetch(`/api/v1/vendors?${params.toString()}`);
      if (!res.ok) {
        if (res.status === 403) {
          throw new Error('Akses ditolak: Menu ini hanya dapat diakses oleh Super Admin.');
        }
        throw new Error('Gagal memuat daftar vendor');
      }

      const json = await res.json();
      if (json.ok && Array.isArray(json.data)) {
        setVendors(json.data);
      } else {
        setVendors([]);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Terjadi kesalahan sistem');
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, selectedKind]);

  useEffect(() => {
    loadVendors();
  }, [loadVendors]);

  // Handler Buka Edit
  const handleOpenEdit = (v: VendorItem) => {
    setEditingVendor(v);
    setEditForm({
      kind: v.kind,
      code: v.code,
      name: v.name,
      picName: v.picName || '',
      phone: v.phone || '',
      address: v.address || '',
      bankName: v.bankName || '',
      bankAccountNumber: v.bankAccountNumber || '',
      bankAccountHolder: v.bankAccountHolder || '',
      paymentTermDays: v.paymentTermDays,
      notes: v.notes || '',
    });
    setEditError(null);
  };

  // Handler Submit Tambah Vendor
  const handleCreateVendor = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddError(null);

    try {
      setSavingAdd(true);
      const res = await fetch('/api/v1/vendors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: newVendor.kind,
          code: newVendor.code.trim().toUpperCase(),
          name: newVendor.name.trim(),
          picName: newVendor.picName.trim() || null,
          phone: newVendor.phone.trim() || null,
          address: newVendor.address.trim() || null,
          bankName: newVendor.bankName.trim() || null,
          bankAccountNumber: newVendor.bankAccountNumber.trim() || null,
          bankAccountHolder: newVendor.bankAccountHolder.trim() || null,
          paymentTermDays: newVendor.paymentTermDays,
          notes: newVendor.notes.trim() || null,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error?.message || 'Gagal menyimpan vendor');
      }

      setFeedbackSuccess(`Vendor "${newVendor.name}" berhasil didaftarkan.`);
      setShowAddModal(false);
      setNewVendor({
        kind: 'SUPPLIER',
        code: '',
        name: '',
        picName: '',
        phone: '',
        address: '',
        bankName: '',
        bankAccountNumber: '',
        bankAccountHolder: '',
        paymentTermDays: 0,
        notes: '',
      });
      loadVendors();
    } catch (err: unknown) {
      setAddError(err instanceof Error ? err.message : 'Terjadi kesalahan');
    } finally {
      setSavingAdd(false);
    }
  };

  // Handler Submit Ubah Vendor
  const handleUpdateVendor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingVendor) return;
    setEditError(null);

    try {
      setSavingEdit(true);
      const res = await fetch(`/api/v1/vendors/${editingVendor.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: editForm.kind,
          code: editForm.code.trim().toUpperCase(),
          name: editForm.name.trim(),
          picName: editForm.picName.trim() || null,
          phone: editForm.phone.trim() || null,
          address: editForm.address.trim() || null,
          bankName: editForm.bankName.trim() || null,
          bankAccountNumber: editForm.bankAccountNumber.trim() || null,
          bankAccountHolder: editForm.bankAccountHolder.trim() || null,
          paymentTermDays: editForm.paymentTermDays,
          notes: editForm.notes.trim() || null,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error?.message || 'Gagal memperbarui vendor');
      }

      setFeedbackSuccess(`Data vendor "${editForm.name}" berhasil diperbarui.`);
      setEditingVendor(null);
      loadVendors();
    } catch (err: unknown) {
      setEditError(err instanceof Error ? err.message : 'Terjadi kesalahan');
    } finally {
      setSavingEdit(false);
    }
  };

  // Handler Soft Delete
  const handleConfirmDelete = async () => {
    if (!deletingVendor) return;

    try {
      setIsDeleting(true);
      const res = await fetch(`/api/v1/vendors/${deletingVendor.id}`, {
        method: 'DELETE',
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error?.message || 'Gagal menghapus vendor');
      }

      setFeedbackSuccess(`Vendor "${deletingVendor.name}" berhasil dihapus.`);
      setDeletingVendor(null);
      loadVendors();
    } catch (err: unknown) {
      setFeedbackError(err instanceof Error ? err.message : 'Terjadi kesalahan saat menghapus');
    } finally {
      setIsDeleting(false);
    }
  };

  // Proteksi Akses untuk Sales
  if (userRole === 'SALES') {
    return (
      <div className="max-w-md mx-auto mt-12 p-6 bg-white rounded-xl border border-red-200 shadow-sm text-center space-y-4">
        <div className="w-12 h-12 rounded-full bg-red-100 text-red-600 mx-auto flex items-center justify-center">
          <ShieldAlert className="w-6 h-6" />
        </div>
        <h3 className="text-lg font-bold text-slate-900">Akses Dibatasi</h3>
        <p className="text-sm text-slate-600">
          Menu Manajemen Vendor dan Logistik hanya dapat diakses oleh Super Administrator.
        </p>
        <Link
          href="/dashboard"
          className="inline-flex items-center justify-center min-h-[44px] px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
        >
          Kembali ke Dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto px-2 sm:px-4 py-4">
      {/* Header Halaman */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900">
              Manajemen Vendor & Logistik
            </h1>
            {activeBusinessName && (
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                {activeBusinessName}
              </span>
            )}
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Kelola data pemasok barang dagang (SUPPLIER) dan mitra ekspedisi / pengangkutan (TRANSPORT).
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowAddModal(true)}
          className="min-h-[44px] px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg text-sm transition-colors flex items-center justify-center gap-2 shadow-sm shrink-0"
        >
          <Plus className="w-5 h-5" />
          <span>Tambah Vendor</span>
        </button>
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
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Pencarian (Debounce 300 ms) */}
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="w-4 h-4 text-slate-400" />
            </div>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari kode vendor, nama, atau kontak PIC..."
              className="w-full min-h-[44px] pl-9 pr-3 py-2 text-base md:text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-slate-900"
            />
          </div>

          {/* Filter Jenis Vendor */}
          <div>
            <select
              value={selectedKind}
              onChange={(e) => setSelectedKind(e.target.value)}
              className="w-full min-h-[44px] px-3 py-2 text-base md:text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-slate-900"
            >
              <option value="all">Semua Jenis Vendor</option>
              <option value="SUPPLIER">Pemasok Barang (SUPPLIER)</option>
              <option value="TRANSPORT">Jasa Pengangkutan / Ekspedisi (TRANSPORT)</option>
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
          title="Gagal Memuat Vendor"
          message={error}
          onRetry={loadVendors}
        />
      ) : vendors.length === 0 ? (
        <EmptyState
          title="Belum Ada Vendor"
          description={
            debouncedSearch || selectedKind !== 'all'
              ? 'Tidak ada vendor yang cocok dengan filter pencarian.'
              : 'Belum ada vendor atau rekanan logistik yang didaftarkan untuk unit usaha ini.'
          }
          actionText="Tambah Vendor Pertama"
          onAction={() => setShowAddModal(true)}
        />
      ) : (
        <>
          {/* Tampilan Desktop (Tabel) */}
          <div className="hidden md:block bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-slate-700">
                <thead className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  <tr>
                    <th scope="col" className="px-4 py-3">
                      Kode
                    </th>
                    <th scope="col" className="px-4 py-3">
                      Nama Vendor
                    </th>
                    <th scope="col" className="px-4 py-3">
                      Jenis
                    </th>
                    <th scope="col" className="px-4 py-3">
                      Kontak / PIC
                    </th>
                    <th scope="col" className="px-4 py-3">
                      Rekening Bank
                    </th>
                    <th scope="col" className="px-4 py-3 text-center">
                      Jatuh Tempo (TOP)
                    </th>
                    <th scope="col" className="px-4 py-3 text-center">
                      Produk / PO
                    </th>
                    <th scope="col" className="px-4 py-3 text-center w-28">
                      Aksi
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {vendors.map((v) => {
                    const isSupplier = v.kind === 'SUPPLIER';
                    return (
                      <tr key={v.id} className="hover:bg-slate-50/70 transition-colors">
                        {/* Kode */}
                        <td className="px-4 py-3 font-mono text-xs font-bold text-slate-900">
                          {v.code}
                        </td>

                        {/* Nama */}
                        <td className="px-4 py-3">
                          <Link
                            href={`/vendors/${v.id}`}
                            className="font-semibold text-slate-900 hover:text-blue-600 hover:underline"
                          >
                            {v.name}
                          </Link>
                          {v.address && (
                            <div className="text-xs text-slate-400 line-clamp-1">
                              {v.address}
                            </div>
                          )}
                        </td>

                        {/* Jenis */}
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${
                              isSupplier
                                ? 'bg-blue-50 text-blue-700 border-blue-200'
                                : 'bg-amber-50 text-amber-700 border-amber-200'
                            }`}
                          >
                            {isSupplier ? 'Pemasok Barang' : 'Pengangkutan'}
                          </span>
                        </td>

                        {/* Kontak */}
                        <td className="px-4 py-3 text-xs">
                          {v.picName ? (
                            <div className="font-medium text-slate-800 flex items-center gap-1">
                              <User className="w-3.5 h-3.5 text-slate-400" />
                              <span>{v.picName}</span>
                            </div>
                          ) : (
                            <span className="text-slate-400">-</span>
                          )}
                          {v.phone && (
                            <div className="text-slate-500 font-mono flex items-center gap-1 mt-0.5">
                              <Phone className="w-3.5 h-3.5 text-slate-400" />
                              <span>{v.phone}</span>
                            </div>
                          )}
                        </td>

                        {/* Bank */}
                        <td className="px-4 py-3 text-xs">
                          {v.bankName && v.bankAccountNumber ? (
                            <div>
                              <div className="font-medium text-slate-800">
                                {v.bankName} - {v.bankAccountNumber}
                              </div>
                              <div className="text-slate-400 text-[11px]">
                                a.n {v.bankAccountHolder || '-'}
                              </div>
                            </div>
                          ) : (
                            <span className="text-slate-400">-</span>
                          )}
                        </td>

                        {/* TOP */}
                        <td className="px-4 py-3 text-center text-xs">
                          {v.paymentTermDays > 0 ? (
                            <span className="inline-block px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-medium">
                              {v.paymentTermDays} hari
                            </span>
                          ) : (
                            <span className="inline-block px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 font-medium">
                              Cash / COD
                            </span>
                          )}
                        </td>

                        {/* Produk / PO Counter */}
                        <td className="px-4 py-3 text-center text-xs font-mono text-slate-600">
                          {v._count?.products || 0} prd / {v._count?.purchaseOrders || 0} PO
                        </td>

                        {/* Aksi */}
                        <td className="px-4 py-3 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <Link
                              href={`/vendors/${v.id}`}
                              title="Buku Transaksi Vendor"
                              className="p-1.5 rounded-lg text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 transition-colors min-h-[36px] min-w-[36px] flex items-center justify-center"
                            >
                              <Receipt className="w-4 h-4" />
                            </Link>

                            <button
                              type="button"
                              title="Ubah Vendor"
                              onClick={() => handleOpenEdit(v)}
                              className="p-1.5 rounded-lg text-slate-500 hover:text-blue-600 hover:bg-blue-50 transition-colors min-h-[36px] min-w-[36px] flex items-center justify-center"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>

                            <button
                              type="button"
                              title="Hapus Vendor"
                              onClick={() => setDeletingVendor(v)}
                              className="p-1.5 rounded-lg text-slate-500 hover:text-red-600 hover:bg-red-50 transition-colors min-h-[36px] min-w-[36px] flex items-center justify-center"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Tampilan Mobile (Kartu Responsif 360 px) */}
          <div className="md:hidden space-y-3">
            {vendors.map((v) => {
              const isSupplier = v.kind === 'SUPPLIER';
              return (
                <div
                  key={v.id}
                  className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold bg-slate-100 text-slate-800 px-2 py-0.5 rounded">
                          {v.code}
                        </span>
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border ${
                            isSupplier
                              ? 'bg-blue-50 text-blue-700 border-blue-200'
                              : 'bg-amber-50 text-amber-700 border-amber-200'
                          }`}
                        >
                          {isSupplier ? 'Pemasok' : 'Ekspedisi'}
                        </span>
                      </div>
                      <h4 className="font-semibold text-slate-900 text-sm mt-1.5">
                        {v.name}
                      </h4>
                    </div>
                  </div>

                  <div className="p-3 bg-slate-50 rounded-lg text-xs space-y-1.5 text-slate-600">
                    {v.picName && (
                      <div className="flex items-center gap-1.5">
                        <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span>PIC: {v.picName}</span>
                      </div>
                    )}
                    {v.phone && (
                      <div className="flex items-center gap-1.5 font-mono">
                        <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span>{v.phone}</span>
                      </div>
                    )}
                    {v.bankName && v.bankAccountNumber && (
                      <div className="flex items-center gap-1.5">
                        <CreditCard className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span>
                          {v.bankName} - {v.bankAccountNumber} ({v.bankAccountHolder})
                        </span>
                      </div>
                    )}
                    <div className="flex items-center gap-1.5 pt-1 border-t border-slate-200">
                      <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span>
                        Jatuh Tempo: {v.paymentTermDays > 0 ? `${v.paymentTermDays} hari` : 'Cash / COD'}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-end gap-2 pt-1 border-t border-slate-100">
                    <Link
                      href={`/vendors/${v.id}`}
                      className="min-h-[44px] px-3 py-2 border border-indigo-200 text-indigo-700 bg-indigo-50 rounded-lg text-xs font-medium hover:bg-indigo-100 flex items-center gap-1.5 transition-colors"
                    >
                      <Receipt className="w-4 h-4" />
                      <span>Buku Transaksi</span>
                    </Link>

                    <button
                      type="button"
                      onClick={() => handleOpenEdit(v)}
                      className="min-h-[44px] px-3 py-2 border border-blue-200 text-blue-700 bg-blue-50 rounded-lg text-xs font-medium hover:bg-blue-100 flex items-center gap-1.5 transition-colors"
                    >
                      <Edit2 className="w-4 h-4" />
                      <span>Ubah</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setDeletingVendor(v)}
                      className="min-h-[44px] px-3 py-2 border border-red-200 text-red-600 bg-red-50 rounded-lg text-xs font-medium hover:bg-red-100 flex items-center gap-1.5 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                      <span>Hapus</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Modal Tambah Vendor */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-lg my-8 overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between p-4 border-b border-slate-100 bg-slate-50">
              <div className="flex items-center gap-2 text-blue-600">
                <Truck className="w-5 h-5" />
                <h3 className="font-semibold text-slate-800">Tambah Vendor Baru</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 min-h-[44px] min-w-[44px] flex items-center justify-center"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateVendor} className="p-5 space-y-4 max-h-[80vh] overflow-y-auto">
              {addError && (
                <div className="p-3 bg-red-50 border border-red-200 text-red-800 text-sm rounded-lg flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                  <span>{addError}</span>
                </div>
              )}

              {/* Jenis Vendor */}
              <div>
                <label className="text-sm font-semibold text-slate-700 block mb-1">
                  Jenis Vendor <span className="text-red-500">*</span>
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setNewVendor({ ...newVendor, kind: 'SUPPLIER' })}
                    className={`min-h-[44px] px-3 py-2 rounded-lg text-xs font-semibold border flex items-center justify-center gap-2 transition-colors ${
                      newVendor.kind === 'SUPPLIER'
                        ? 'bg-blue-50 border-blue-500 text-blue-700 ring-2 ring-blue-200'
                        : 'border-slate-300 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <Package className="w-4 h-4" />
                    <span>Pemasok Barang</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setNewVendor({ ...newVendor, kind: 'TRANSPORT' })}
                    className={`min-h-[44px] px-3 py-2 rounded-lg text-xs font-semibold border flex items-center justify-center gap-2 transition-colors ${
                      newVendor.kind === 'TRANSPORT'
                        ? 'bg-amber-50 border-amber-500 text-amber-800 ring-2 ring-amber-200'
                        : 'border-slate-300 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <Truck className="w-4 h-4" />
                    <span>Jasa Ekspedisi</span>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Kode Vendor */}
                <div>
                  <label className="text-sm font-semibold text-slate-700 block mb-1">
                    Kode Vendor <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={newVendor.code}
                    onChange={(e) =>
                      setNewVendor({ ...newVendor, code: e.target.value.toUpperCase() })
                    }
                    placeholder="Contoh: SUP-ABC"
                    className="w-full min-h-[44px] px-3 py-2 text-base md:text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 font-mono"
                  />
                  <p className="text-xs text-slate-400 mt-1">Dipakai di nomor PO</p>
                </div>

                {/* Nama Vendor */}
                <div>
                  <label className="text-sm font-semibold text-slate-700 block mb-1">
                    Nama Vendor / Badan Usaha <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={newVendor.name}
                    onChange={(e) =>
                      setNewVendor({ ...newVendor, name: e.target.value })
                    }
                    placeholder="PT / CV / Toko..."
                    className="w-full min-h-[44px] px-3 py-2 text-base md:text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Nama PIC */}
                <div>
                  <label className="text-sm font-semibold text-slate-700 block mb-1">
                    Nama Kontak PIC
                  </label>
                  <input
                    type="text"
                    value={newVendor.picName}
                    onChange={(e) =>
                      setNewVendor({ ...newVendor, picName: e.target.value })
                    }
                    placeholder="Nama narahubung"
                    className="w-full min-h-[44px] px-3 py-2 text-base md:text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900"
                  />
                </div>

                {/* Nomor Telepon */}
                <div>
                  <label className="text-sm font-semibold text-slate-700 block mb-1">
                    Nomor Telepon / WhatsApp
                  </label>
                  <input
                    type="text"
                    value={newVendor.phone}
                    onChange={(e) =>
                      setNewVendor({ ...newVendor, phone: e.target.value })
                    }
                    placeholder="0812..."
                    className="w-full min-h-[44px] px-3 py-2 text-base md:text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 font-mono"
                  />
                </div>
              </div>

              {/* Alamat */}
              <div>
                <label className="text-sm font-semibold text-slate-700 block mb-1">
                  Alamat Lengkap
                </label>
                <textarea
                  rows={2}
                  value={newVendor.address}
                  onChange={(e) =>
                    setNewVendor({ ...newVendor, address: e.target.value })
                  }
                  placeholder="Alamat kantor atau gudang vendor"
                  className="w-full px-3 py-2 text-base md:text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900"
                />
              </div>

              {/* Info Bank Rekening */}
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                <h4 className="text-xs font-bold text-slate-600 uppercase tracking-wider">
                  Informasi Rekening Pembayaran
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-slate-600 block mb-1">
                      Nama Bank
                    </label>
                    <input
                      type="text"
                      value={newVendor.bankName}
                      onChange={(e) =>
                        setNewVendor({ ...newVendor, bankName: e.target.value })
                      }
                      placeholder="BCA, Mandiri, dll"
                      className="w-full min-h-[44px] px-3 py-2 text-base md:text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-slate-600 block mb-1">
                      Nomor Rekening
                    </label>
                    <input
                      type="text"
                      value={newVendor.bankAccountNumber}
                      onChange={(e) =>
                        setNewVendor({ ...newVendor, bankAccountNumber: e.target.value })
                      }
                      placeholder="Nomor rekening"
                      className="w-full min-h-[44px] px-3 py-2 text-base md:text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 font-mono"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-slate-600 block mb-1">
                      Atas Nama (Holder)
                    </label>
                    <input
                      type="text"
                      value={newVendor.bankAccountHolder}
                      onChange={(e) =>
                        setNewVendor({ ...newVendor, bankAccountHolder: e.target.value })
                      }
                      placeholder="Nama pemilik rekening"
                      className="w-full min-h-[44px] px-3 py-2 text-base md:text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900"
                    />
                  </div>
                </div>
              </div>

              {/* Term of Payment */}
              <div>
                <label className="text-sm font-semibold text-slate-700 block mb-1">
                  Jatuh Tempo Pembayaran (Term of Payment)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={0}
                    max={365}
                    value={newVendor.paymentTermDays}
                    onChange={(e) =>
                      setNewVendor({
                        ...newVendor,
                        paymentTermDays: Math.max(0, parseInt(e.target.value, 10) || 0),
                      })
                    }
                    className="w-32 min-h-[44px] px-3 py-2 text-base md:text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 text-center font-mono"
                  />
                  <span className="text-sm text-slate-600">
                    hari (isi 0 bila tunai / Cash / COD)
                  </span>
                </div>
              </div>

              {/* Catatan */}
              <div>
                <label className="text-sm font-semibold text-slate-700 block mb-1">
                  Catatan Tambahan
                </label>
                <textarea
                  rows={2}
                  value={newVendor.notes}
                  onChange={(e) =>
                    setNewVendor({ ...newVendor, notes: e.target.value })
                  }
                  placeholder="Catatan khusus kesepakatan, nomor kontak darurat, dll"
                  className="w-full px-3 py-2 text-base md:text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900"
                />
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
                  disabled={savingAdd}
                  className="min-h-[44px] px-5 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors disabled:bg-slate-300 disabled:cursor-not-allowed flex items-center gap-2 shadow-sm"
                >
                  {savingAdd ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Menyimpan...</span>
                    </>
                  ) : (
                    <span>Simpan Vendor</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Ubah Vendor */}
      {editingVendor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-lg my-8 overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between p-4 border-b border-slate-100 bg-slate-50">
              <div className="flex items-center gap-2 text-blue-600">
                <Edit2 className="w-5 h-5" />
                <h3 className="font-semibold text-slate-800">
                  Ubah Vendor: {editingVendor.code}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setEditingVendor(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 min-h-[44px] min-w-[44px] flex items-center justify-center"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleUpdateVendor} className="p-5 space-y-4 max-h-[80vh] overflow-y-auto">
              {editError && (
                <div className="p-3 bg-red-50 border border-red-200 text-red-800 text-sm rounded-lg flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                  <span>{editError}</span>
                </div>
              )}

              {/* Jenis Vendor */}
              <div>
                <label className="text-sm font-semibold text-slate-700 block mb-1">
                  Jenis Vendor <span className="text-red-500">*</span>
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setEditForm({ ...editForm, kind: 'SUPPLIER' })}
                    className={`min-h-[44px] px-3 py-2 rounded-lg text-xs font-semibold border flex items-center justify-center gap-2 transition-colors ${
                      editForm.kind === 'SUPPLIER'
                        ? 'bg-blue-50 border-blue-500 text-blue-700 ring-2 ring-blue-200'
                        : 'border-slate-300 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <Package className="w-4 h-4" />
                    <span>Pemasok Barang</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setEditForm({ ...editForm, kind: 'TRANSPORT' })}
                    className={`min-h-[44px] px-3 py-2 rounded-lg text-xs font-semibold border flex items-center justify-center gap-2 transition-colors ${
                      editForm.kind === 'TRANSPORT'
                        ? 'bg-amber-50 border-amber-500 text-amber-800 ring-2 ring-amber-200'
                        : 'border-slate-300 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <Truck className="w-4 h-4" />
                    <span>Jasa Ekspedisi</span>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Kode Vendor */}
                <div>
                  <label className="text-sm font-semibold text-slate-700 block mb-1">
                    Kode Vendor <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={editForm.code}
                    onChange={(e) =>
                      setEditForm({ ...editForm, code: e.target.value.toUpperCase() })
                    }
                    className="w-full min-h-[44px] px-3 py-2 text-base md:text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 font-mono"
                  />
                </div>

                {/* Nama Vendor */}
                <div>
                  <label className="text-sm font-semibold text-slate-700 block mb-1">
                    Nama Vendor / Badan Usaha <span className="text-red-500">*</span>
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
                {/* Nama PIC */}
                <div>
                  <label className="text-sm font-semibold text-slate-700 block mb-1">
                    Nama Kontak PIC
                  </label>
                  <input
                    type="text"
                    value={editForm.picName}
                    onChange={(e) =>
                      setEditForm({ ...editForm, picName: e.target.value })
                    }
                    className="w-full min-h-[44px] px-3 py-2 text-base md:text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900"
                  />
                </div>

                {/* Nomor Telepon */}
                <div>
                  <label className="text-sm font-semibold text-slate-700 block mb-1">
                    Nomor Telepon / WhatsApp
                  </label>
                  <input
                    type="text"
                    value={editForm.phone}
                    onChange={(e) =>
                      setEditForm({ ...editForm, phone: e.target.value })
                    }
                    className="w-full min-h-[44px] px-3 py-2 text-base md:text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 font-mono"
                  />
                </div>
              </div>

              {/* Alamat */}
              <div>
                <label className="text-sm font-semibold text-slate-700 block mb-1">
                  Alamat Lengkap
                </label>
                <textarea
                  rows={2}
                  value={editForm.address}
                  onChange={(e) =>
                    setEditForm({ ...editForm, address: e.target.value })
                  }
                  className="w-full px-3 py-2 text-base md:text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900"
                />
              </div>

              {/* Info Bank Rekening */}
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                <h4 className="text-xs font-bold text-slate-600 uppercase tracking-wider">
                  Informasi Rekening Pembayaran
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-slate-600 block mb-1">
                      Nama Bank
                    </label>
                    <input
                      type="text"
                      value={editForm.bankName}
                      onChange={(e) =>
                        setEditForm({ ...editForm, bankName: e.target.value })
                      }
                      className="w-full min-h-[44px] px-3 py-2 text-base md:text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-slate-600 block mb-1">
                      Nomor Rekening
                    </label>
                    <input
                      type="text"
                      value={editForm.bankAccountNumber}
                      onChange={(e) =>
                        setEditForm({ ...editForm, bankAccountNumber: e.target.value })
                      }
                      className="w-full min-h-[44px] px-3 py-2 text-base md:text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 font-mono"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-slate-600 block mb-1">
                      Atas Nama (Holder)
                    </label>
                    <input
                      type="text"
                      value={editForm.bankAccountHolder}
                      onChange={(e) =>
                        setEditForm({ ...editForm, bankAccountHolder: e.target.value })
                      }
                      className="w-full min-h-[44px] px-3 py-2 text-base md:text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900"
                    />
                  </div>
                </div>
              </div>

              {/* Term of Payment */}
              <div>
                <label className="text-sm font-semibold text-slate-700 block mb-1">
                  Jatuh Tempo Pembayaran (Term of Payment)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={0}
                    max={365}
                    value={editForm.paymentTermDays}
                    onChange={(e) =>
                      setEditForm({
                        ...editForm,
                        paymentTermDays: Math.max(0, parseInt(e.target.value, 10) || 0),
                      })
                    }
                    className="w-32 min-h-[44px] px-3 py-2 text-base md:text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 text-center font-mono"
                  />
                  <span className="text-sm text-slate-600">hari</span>
                </div>
              </div>

              {/* Catatan */}
              <div>
                <label className="text-sm font-semibold text-slate-700 block mb-1">
                  Catatan Tambahan
                </label>
                <textarea
                  rows={2}
                  value={editForm.notes}
                  onChange={(e) =>
                    setEditForm({ ...editForm, notes: e.target.value })
                  }
                  className="w-full px-3 py-2 text-base md:text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900"
                />
              </div>

              <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setEditingVendor(null)}
                  disabled={savingEdit}
                  className="min-h-[44px] px-4 py-2 border border-slate-300 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-100 transition-colors disabled:opacity-50"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={savingEdit}
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
          </div>
        </div>
      )}

      {/* Dialog Konfirmasi Hapus Vendor */}
      <ConfirmTypeDialog
        isOpen={Boolean(deletingVendor)}
        onClose={() => setDeletingVendor(null)}
        onConfirm={handleConfirmDelete}
        title="Konfirmasi Hapus Vendor"
        description={`Vendor "${deletingVendor?.name}" (${deletingVendor?.code}) akan dinonaktifkan (soft delete). Data transaksi riwayat PO dan pembayaran masa lalu tetap tersimpan secara aman.`}
        confirmTarget={deletingVendor?.name || ''}
        confirmLabel="Hapus Vendor"
        loading={isDeleting}
      />
    </div>
  );
}
