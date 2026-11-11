'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import {
  Users,
  Plus,
  Search,
  Phone,
  UserCheck,
  Edit2,
  Trash2,
  Building2,
  AlertCircle,
  Loader2,
  ShoppingCart,
  Send,
  Lock,
  Clock,
} from 'lucide-react';
import { Skeleton, EmptyState, ErrorState } from '@/components/ui/States';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { ConfirmTypeDialog } from '@/components/ui/ConfirmTypeDialog';
import { SortableHeader } from '@/components/ui/SortableHeader';

interface SalesUser {
  id: string;
  name: string;
  username: string;
}

interface CustomerItem {
  id: string;
  businessId: string;
  code: string;
  name: string;
  contactName: string | null;
  phone: string | null;
  address: string | null;
  shippingAddress: string | null;
  billingAddress: string | null;
  npwp: string | null;
  assignedSalesId: string | null;
  assignedSales: SalesUser | null;
  pipelineStage: 'LEAD' | 'PROSPECT' | 'DEAL' | 'REPEAT' | 'LOST';
  tags: string[];
  notes: string | null;
  rev: number;
  createdAt: string;
  _count?: {
    orders: number;
    invoices?: number;
  };
}

export default function CustomersPage() {
  const [currentUser, setCurrentUser] = useState<{
    id: string;
    role: 'SUPERADMIN' | 'SALES';
  } | null>(null);

  const [customers, setCustomers] = useState<CustomerItem[]>([]);
  const [salesList, setSalesList] = useState<SalesUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filter
  const [searchQuery, setSearchQuery] = useState('');
  const [stageFilter, setStageFilter] = useState<string>('');
  const [salesFilter, setSalesFilter] = useState<string>('');

  // Sorting
  const [sortBy, setSortBy] = useState('name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  const handleSort = (field: string) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      const defaultAsc = ['name', 'code', 'pipelineStage'].includes(field);
      setSortOrder(defaultAsc ? 'asc' : 'desc');
    }
  };

  // Modal Tambah / Edit
  const [modalOpen, setModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<CustomerItem | null>(
    null
  );
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [contactName, setContactName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [shippingAddress, setShippingAddress] = useState('');
  const [billingAddress, setBillingAddress] = useState('');
  const [npwp, setNpwp] = useState('');
  const [assignedSalesId, setAssignedSalesId] = useState('');
  const [pipelineStage, setPipelineStage] = useState<
    'LEAD' | 'PROSPECT' | 'DEAL' | 'REPEAT' | 'LOST'
  >('LEAD');
  const [tagsInput, setTagsInput] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Modal Alihkan Sales (Reassign)
  const [reassignModalOpen, setReassignModalOpen] = useState(false);
  const [customerToReassign, setCustomerToReassign] =
    useState<CustomerItem | null>(null);
  const [targetSalesId, setTargetSalesId] = useState('');
  const [moveOpenOrders, setMoveOpenOrders] = useState(false);
  const [reassigning, setReassigning] = useState(false);
  const [reassignError, setReassignError] = useState<string | null>(null);

  // Dialog Hapus
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [customerToDelete, setCustomerToDelete] = useState<CustomerItem | null>(
    null
  );
  const [deleting, setDeleting] = useState(false);
  const [deleteErrorMessage, setDeleteErrorMessage] = useState<string | null>(
    null
  );

  const isSuperAdmin = currentUser?.role === 'SUPERADMIN';

  // Load customer data & sales list
  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Cek auth role
      let role = currentUser?.role;
      const meRes = await fetch('/api/v1/auth/me');
      if (meRes.ok) {
        const meData = await meRes.json();
        if (meData.ok && meData.data?.user) {
          role = meData.data.user.role;
          setCurrentUser({
            id: meData.data.user.id,
            role: meData.data.user.role,
          });
        }
      }

      // Bangun query URL
      const params = new URLSearchParams();
      if (searchQuery.trim()) params.set('q', searchQuery.trim());
      if (stageFilter) params.set('stage', stageFilter);
      if (salesFilter) params.set('salesId', salesFilter);
      params.set('sortBy', sortBy);
      params.set('sortOrder', sortOrder);

      const custRes = await fetch(
        `/api/v1/customers?${params.toString()}`
      );
      if (!custRes.ok) {
        const errJson = await custRes.json();
        throw new Error(errJson.error?.message || 'Gagal memuat pelanggan');
      }

      const custData = await custRes.json();
      if (custData.ok && Array.isArray(custData.data)) {
        setCustomers(custData.data);
      }

      // Ambil daftar sales HANYA jika Super Admin
      if (role === 'SUPERADMIN') {
        const usersRes = await fetch('/api/v1/users');
        if (usersRes.ok) {
          const usersData = await usersRes.json();
          if (usersData.ok && Array.isArray(usersData.data)) {
            const onlySales = usersData.data.filter(
              (u: { role: string }) => u.role === 'SALES'
            );
            setSalesList(onlySales);
          }
        }
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Terjadi kesalahan sistem');
    } finally {
      setLoading(false);
    }
  }, [searchQuery, stageFilter, salesFilter, sortBy, sortOrder, currentUser?.role]);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      loadData();
    }, 300);
    return () => clearTimeout(timer);
  }, [loadData]);

  // Buka Modal Tambah
  const handleOpenCreateModal = () => {
    setEditingCustomer(null);
    setCode('');
    setName('');
    setContactName('');
    setPhone('');
    setAddress('');
    setShippingAddress('');
    setBillingAddress('');
    setNpwp('');
    setAssignedSalesId(isSuperAdmin ? '' : currentUser?.id || '');
    setPipelineStage('LEAD');
    setTagsInput('');
    setNotes('');
    setFormError(null);
    setModalOpen(true);
  };

  // Buka Modal Edit
  const handleOpenEditModal = (cust: CustomerItem) => {
    setEditingCustomer(cust);
    setCode(cust.code);
    setName(cust.name);
    setContactName(cust.contactName || '');
    setPhone(cust.phone || '');
    setAddress(cust.address || '');
    setShippingAddress(cust.shippingAddress || '');
    setBillingAddress(cust.billingAddress || '');
    setNpwp(cust.npwp || '');
    setAssignedSalesId(cust.assignedSalesId || '');
    setPipelineStage(cust.pipelineStage);
    setTagsInput(cust.tags?.join(', ') || '');
    setNotes(cust.notes || '');
    setFormError(null);
    setModalOpen(true);
  };

  // Simpan Tambah / Ubah
  const handleSubmitCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const parsedTags = tagsInput
      .split(',')
      .map((t) => t.trim())
      .filter((t) => t.length > 0);

    try {
      setSaving(true);

      if (editingCustomer) {
        // PATCH
        const res = await fetch(`/api/v1/customers/${editingCustomer.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            rev: editingCustomer.rev,
            code: code.trim().toUpperCase(),
            name: name.trim(),
            contactName: contactName.trim() || null,
            phone: phone.trim() || null,
            address: address.trim() || null,
            shippingAddress: shippingAddress.trim() || null,
            billingAddress: billingAddress.trim() || null,
            npwp: npwp.trim() || null,
            assignedSalesId: isSuperAdmin
              ? assignedSalesId.trim() || null
              : undefined,
            pipelineStage,
            tags: parsedTags,
            notes: notes.trim() || null,
          }),
        });

        const data = await res.json();
        if (!res.ok || !data.ok) {
          throw new Error(data.error?.message || 'Gagal memperbarui pelanggan');
        }
      } else {
        // POST
        const res = await fetch('/api/v1/customers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            code: code.trim().toUpperCase(),
            name: name.trim(),
            contactName: contactName.trim() || null,
            phone: phone.trim() || null,
            address: address.trim() || null,
            shippingAddress: shippingAddress.trim() || null,
            billingAddress: billingAddress.trim() || null,
            npwp: npwp.trim() || null,
            assignedSalesId: isSuperAdmin
              ? assignedSalesId.trim() || null
              : undefined,
            pipelineStage,
            tags: parsedTags,
            notes: notes.trim() || null,
          }),
        });

        const data = await res.json();
        if (!res.ok || !data.ok) {
          throw new Error(data.error?.message || 'Gagal menambahkan pelanggan');
        }
      }

      setModalOpen(false);
      await loadData();
    } catch (err: unknown) {
      setFormError(
        err instanceof Error ? err.message : 'Terjadi kesalahan sistem'
      );
    } finally {
      setSaving(false);
    }
  };

  // Buka Modal Reassign (Super Admin)
  const handleOpenReassignModal = (cust: CustomerItem) => {
    setCustomerToReassign(cust);
    setTargetSalesId(cust.assignedSalesId || '');
    setMoveOpenOrders(false);
    setReassignError(null);
    setReassignModalOpen(true);
  };

  // Eksekusi Reassign
  const handleConfirmReassign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerToReassign || !targetSalesId) return;

    try {
      setReassigning(true);
      setReassignError(null);

      const res = await fetch(
        `/api/v1/customers/${customerToReassign.id}/reassign`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            salesId: targetSalesId,
            moveOpenOrders,
          }),
        }
      );

      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error?.message || 'Gagal mengalihkan sales');
      }

      setReassignModalOpen(false);
      setCustomerToReassign(null);
      await loadData();
    } catch (err: unknown) {
      setReassignError(
        err instanceof Error ? err.message : 'Terjadi kesalahan sistem'
      );
    } finally {
      setReassigning(false);
    }
  };

  // Buka Dialog Hapus
  const handleOpenDeleteDialog = (cust: CustomerItem) => {
    setCustomerToDelete(cust);
    setDeleteErrorMessage(null);
    setDeleteDialogOpen(true);
  };

  // Eksekusi Hapus Soft Delete
  const handleConfirmDelete = async () => {
    if (!customerToDelete) return;

    try {
      setDeleting(true);
      setDeleteErrorMessage(null);

      const res = await fetch(`/api/v1/customers/${customerToDelete.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          confirm: customerToDelete.code,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error?.message || 'Gagal menghapus pelanggan');
      }

      setDeleteDialogOpen(false);
      setCustomerToDelete(null);
      await loadData();
    } catch (err: unknown) {
      setDeleteErrorMessage(
        err instanceof Error ? err.message : 'Terjadi kesalahan sistem'
      );
    } finally {
      setDeleting(false);
    }
  };

  // Cek apakah kode pelanggan terkunci (karena punya faktur)
  const isCodeLocked = useMemo(() => {
    if (!editingCustomer) return false;
    return (editingCustomer._count?.invoices ?? 0) > 0;
  }, [editingCustomer]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto px-2 sm:px-4 py-2 sm:py-4">
      {/* Header Halaman */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center shrink-0">
              <Users className="w-5 h-5" />
            </div>
            <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
              Pelanggan & CRM
            </h1>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            {isSuperAdmin
              ? 'Kelola seluruh pelanggan, kontak PIC, pipeline, dan alokasi staf sales unit usaha'
              : 'Daftar pelanggan aktif yang ditugaskan khusus kepada Anda'}
          </p>
        </div>

        <button
          type="button"
          onClick={handleOpenCreateModal}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl text-sm transition-colors shadow-sm min-h-[44px]"
        >
          <Plus className="w-4 h-4" />
          <span>Tambah Pelanggan</span>
        </button>
      </div>

      {/* Filter & Pencarian Bar */}
      <div className="bg-white p-3 sm:p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col sm:flex-row items-center gap-3">
        {/* Input Pencarian */}
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari nama, kode, PIC, atau nomor telepon..."
            className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white min-h-[44px]"
          />
        </div>

        {/* Filter Tahap Pipeline */}
        <select
          value={stageFilter}
          onChange={(e) => setStageFilter(e.target.value)}
          className="w-full sm:w-44 px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white min-h-[44px]"
        >
          <option value="">Semua Tahap</option>
          <option value="LEAD">Lead</option>
          <option value="PROSPECT">Prospek</option>
          <option value="DEAL">Deal</option>
          <option value="REPEAT">Repeat</option>
          <option value="LOST">Lost</option>
        </select>

        {/* Filter Sales (Hanya Super Admin) */}
        {isSuperAdmin && (
          <select
            value={salesFilter}
            onChange={(e) => setSalesFilter(e.target.value)}
            className="w-full sm:w-48 px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white min-h-[44px]"
          >
            <option value="">Semua Staf Sales</option>
            {salesList.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        )}

        {/* Quick Sort Dropdown */}
        <select
          value={`${sortBy}_${sortOrder}`}
          onChange={(e) => {
            const [f, o] = e.target.value.split('_') as [string, 'asc' | 'desc'];
            setSortBy(f);
            setSortOrder(o);
          }}
          className="w-full sm:w-48 px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white min-h-[44px]"
          title="Urutkan pelanggan"
        >
          <option value="name_asc">Nama: A - Z</option>
          <option value="name_desc">Nama: Z - A</option>
          <option value="code_asc">Kode: A - Z</option>
          <option value="createdAt_desc">Terdaftar: Terbaru</option>
          <option value="createdAt_asc">Terdaftar: Terlama</option>
          <option value="pipelineStage_asc">Tahap Pipeline</option>
        </select>
      </div>

      {/* Konten Pelanggan */}
      {loading ? (
        <div className="space-y-4">
          <Skeleton className="h-20 w-full rounded-2xl" />
          <Skeleton className="h-20 w-full rounded-2xl" />
          <Skeleton className="h-20 w-full rounded-2xl" />
        </div>
      ) : error ? (
        <div className="bg-white rounded-2xl border border-red-200 p-6 shadow-sm">
          <ErrorState
            title="Gagal Memuat Pelanggan"
            message={error}
            onRetry={loadData}
          />
        </div>
      ) : customers.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-8 shadow-sm text-center">
          <EmptyState
            title="Belum Ada Pelanggan"
            description={
              searchQuery || stageFilter || salesFilter
                ? 'Tidak ada pelanggan yang sesuai dengan kriteria filter pencarian Anda.'
                : 'Belum ada data pelanggan yang terdaftar. Tambahkan pelanggan baru untuk memulai siklus penjualan.'
            }
          />
        </div>
      ) : (
        <>
          {/* Tampilan Desktop (Tabel Lengkap) */}
          <div className="hidden md:block bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <table className="w-full text-left text-sm text-slate-700">
              <thead className="bg-slate-50 text-xs uppercase font-bold text-slate-500 border-b border-slate-200">
                <tr>
                  <SortableHeader
                    label="Kode & Nama Pelanggan"
                    field="name"
                    currentSortBy={sortBy}
                    currentSortOrder={sortOrder}
                    onSort={handleSort}
                    className="px-4 py-3"
                  />
                  <th className="px-4 py-3">Kontak & Telepon</th>
                  <SortableHeader
                    label="Tahap Pipeline"
                    field="pipelineStage"
                    currentSortBy={sortBy}
                    currentSortOrder={sortOrder}
                    onSort={handleSort}
                    className="px-4 py-3"
                  />
                  <th className="px-4 py-3">Staf Sales</th>
                  <th className="px-4 py-3 text-center">Pesanan</th>
                  <th className="px-4 py-3 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {customers.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200">
                          {c.code}
                        </span>
                        <div>
                          <Link
                            href={`/customers/${c.id}`}
                            className="font-bold text-slate-900 hover:text-indigo-600 transition-colors inline-block"
                          >
                            {c.name}
                          </Link>
                          {c.tags && c.tags.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-0.5">
                              {c.tags.map((t, idx) => (
                                <span
                                  key={idx}
                                  className="text-[10px] px-1.5 py-0.2 rounded bg-blue-50 text-blue-600 font-medium"
                                >
                                  #{t}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>

                    <td className="px-4 py-3">
                      <div className="space-y-0.5">
                        {c.contactName && (
                          <div className="font-medium text-slate-800">
                            {c.contactName}
                          </div>
                        )}
                        {c.phone ? (
                          <a
                            href={`tel:${c.phone}`}
                            className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline font-mono"
                          >
                            <Phone className="w-3 h-3" />
                            <span>{c.phone}</span>
                          </a>
                        ) : (
                          <span className="text-xs text-slate-400">-</span>
                        )}
                      </div>
                    </td>

                    <td className="px-4 py-3">
                      <StatusBadge status={c.pipelineStage} />
                    </td>

                    <td className="px-4 py-3">
                      {c.assignedSales ? (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-700 bg-slate-100 px-2 py-0.5 rounded-md">
                          <UserCheck className="w-3.5 h-3.5 text-blue-600" />
                          <span>{c.assignedSales.name}</span>
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400 italic">
                          Belum Ditugaskan
                        </span>
                      )}
                    </td>

                    <td className="px-4 py-3 text-center">
                      <span className="inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
                        <ShoppingCart className="w-3 h-3 text-slate-400" />
                        <span>{c._count?.orders ?? 0}</span>
                      </span>
                    </td>

                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex items-center gap-1">
                        {isSuperAdmin && (
                          <button
                            type="button"
                            onClick={() => handleOpenReassignModal(c)}
                            title="Alihkan Sales"
                            className="p-1.5 rounded-lg text-slate-500 hover:text-blue-600 hover:bg-slate-100 min-h-[36px] min-w-[36px] flex items-center justify-center transition-colors"
                          >
                            <Send className="w-4 h-4" />
                          </button>
                        )}

                        <Link
                          href={`/customers/${c.id}`}
                          title="Detail & Linimasa CRM"
                          className="p-1.5 rounded-lg text-slate-500 hover:text-indigo-600 hover:bg-slate-100 min-h-[36px] min-w-[36px] flex items-center justify-center transition-colors"
                        >
                          <Clock className="w-4 h-4" />
                        </Link>

                        <button
                          type="button"
                          onClick={() => handleOpenEditModal(c)}
                          title="Ubah Pelanggan"
                          className="p-1.5 rounded-lg text-slate-500 hover:text-blue-600 hover:bg-slate-100 min-h-[36px] min-w-[36px] flex items-center justify-center transition-colors"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>

                        <button
                          type="button"
                          onClick={() => handleOpenDeleteDialog(c)}
                          title="Hapus Pelanggan"
                          className="p-1.5 rounded-lg text-slate-500 hover:text-red-600 hover:bg-red-50 min-h-[36px] min-w-[36px] flex items-center justify-center transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Tampilan Mobile (Kartu Responsif 360 px) */}
          <div className="md:hidden space-y-3">
            {customers.map((c) => (
              <div
                key={c.id}
                className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200">
                        {c.code}
                      </span>
                      <StatusBadge status={c.pipelineStage} />
                    </div>
                    <h3 className="font-bold text-slate-900 text-base leading-snug">
                      <Link
                        href={`/customers/${c.id}`}
                        className="hover:text-indigo-600 transition-colors"
                      >
                        {c.name}
                      </Link>
                    </h3>
                  </div>

                  <span className="inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 shrink-0">
                    <ShoppingCart className="w-3 h-3 text-slate-400" />
                    <span>{c._count?.orders ?? 0}</span>
                  </span>
                </div>

                {/* Info Kontak & Alamat */}
                <div className="text-xs space-y-1 text-slate-600 pt-1 border-t border-slate-100">
                  {c.contactName && (
                    <div>
                      <span className="text-slate-400">PIC: </span>
                      <span className="font-medium text-slate-800">
                        {c.contactName}
                      </span>
                    </div>
                  )}

                  {c.phone && (
                    <div className="flex items-center gap-1">
                      <Phone className="w-3 h-3 text-slate-400 shrink-0" />
                      <a
                        href={`tel:${c.phone}`}
                        className="text-blue-600 font-mono underline"
                      >
                        {c.phone}
                      </a>
                    </div>
                  )}

                  {c.address && (
                    <p className="line-clamp-2 text-slate-500 text-[11px] leading-relaxed">
                      {c.address}
                    </p>
                  )}
                </div>

                {/* Staf Sales & Aksi */}
                <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                  <div>
                    {c.assignedSales ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-700 bg-slate-100 px-2 py-0.5 rounded">
                        <UserCheck className="w-3 h-3 text-blue-600" />
                        <span>{c.assignedSales.name}</span>
                      </span>
                    ) : (
                      <span className="text-[11px] text-slate-400 italic">
                        Tanpa Sales
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1">
                    {isSuperAdmin && (
                      <button
                        type="button"
                        onClick={() => handleOpenReassignModal(c)}
                        className="p-2 bg-slate-100 text-slate-700 rounded-lg text-xs font-semibold min-h-[44px] min-w-[44px] flex items-center justify-center hover:bg-slate-200"
                        title="Alihkan Sales"
                      >
                        <Send className="w-4 h-4" />
                      </button>
                    )}

                    <Link
                      href={`/customers/${c.id}`}
                      className="p-2 bg-indigo-50 text-indigo-700 rounded-lg text-xs font-semibold min-h-[44px] min-w-[44px] flex items-center justify-center hover:bg-indigo-100"
                      title="Linimasa & CRM"
                    >
                      <Clock className="w-4 h-4" />
                    </Link>

                    <button
                      type="button"
                      onClick={() => handleOpenEditModal(c)}
                      className="p-2 bg-slate-100 text-slate-700 rounded-lg text-xs font-semibold min-h-[44px] min-w-[44px] flex items-center justify-center hover:bg-slate-200"
                      title="Ubah Pelanggan"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>

                    <button
                      type="button"
                      onClick={() => handleOpenDeleteDialog(c)}
                      className="p-2 bg-red-50 text-red-600 rounded-lg text-xs font-semibold min-h-[44px] min-w-[44px] flex items-center justify-center hover:bg-red-100"
                      title="Hapus Pelanggan"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Modal Tambah / Edit Pelanggan */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-slate-900/50 backdrop-blur-sm overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-2xl my-8 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-4 sm:p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <h3 className="font-bold text-base sm:text-lg text-slate-900 flex items-center gap-2">
                <Building2 className="w-5 h-5 text-blue-600" />
                <span>
                  {editingCustomer
                    ? 'Ubah Data Pelanggan'
                    : 'Tambah Pelanggan Baru'}
                </span>
              </h3>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 min-h-[44px] min-w-[44px] flex items-center justify-center"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmitCustomer} className="p-4 sm:p-5 space-y-4">
              {formError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs sm:text-sm flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                {/* Kode Pelanggan */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label
                      htmlFor="codeField"
                      className="text-xs font-bold text-slate-700 uppercase tracking-wider"
                    >
                      Kode Pelanggan *
                    </label>
                    {isCodeLocked && (
                      <span className="inline-flex items-center gap-0.5 text-[10px] text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200 font-semibold">
                        <Lock className="w-3 h-3" />
                        <span>Terkunci (Ada Faktur)</span>
                      </span>
                    )}
                  </div>
                  <input
                    id="codeField"
                    type="text"
                    required
                    disabled={isCodeLocked}
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase())}
                    placeholder="contoh: TEROBOS"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-base sm:text-sm font-mono uppercase focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white min-h-[44px] disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed"
                  />
                </div>

                {/* Nama Pelanggan */}
                <div>
                  <label
                    htmlFor="nameField"
                    className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1"
                  >
                    Nama Toko / Usaha *
                  </label>
                  <input
                    id="nameField"
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="contoh: Toko Sinar Jaya"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white min-h-[44px]"
                  />
                </div>

                {/* Nama Kontak PIC */}
                <div>
                  <label
                    htmlFor="contactNameField"
                    className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1"
                  >
                    Nama PIC / Kontak
                  </label>
                  <input
                    id="contactNameField"
                    type="text"
                    value={contactName}
                    onChange={(e) => setContactName(e.target.value)}
                    placeholder="contoh: Pak Bambang"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white min-h-[44px]"
                  />
                </div>

                {/* Telepon / WA */}
                <div>
                  <label
                    htmlFor="phoneField"
                    className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1"
                  >
                    No. Telepon / WhatsApp
                  </label>
                  <input
                    id="phoneField"
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="contoh: 08123456789"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white min-h-[44px]"
                  />
                </div>

                {/* Tahap Pipeline */}
                <div>
                  <label
                    htmlFor="stageField"
                    className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1"
                  >
                    Tahap Pipeline (CRM)
                  </label>
                  <select
                    id="stageField"
                    value={pipelineStage}
                    onChange={(e) =>
                      setPipelineStage(
                        e.target.value as 'LEAD' | 'PROSPECT' | 'DEAL' | 'REPEAT' | 'LOST'
                      )
                    }
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white min-h-[44px]"
                  >
                    <option value="LEAD">Lead (Calon Baru)</option>
                    <option value="PROSPECT">Prospek (Sedang Didekati)</option>
                    <option value="DEAL">Deal (Pernah Membeli)</option>
                    <option value="REPEAT">Repeat (Pelanggan Rutin)</option>
                    <option value="LOST">Lost (Batal/Hilang)</option>
                  </select>
                </div>

                {/* Staf Sales yang Ditugaskan (Hanya Super Admin) */}
                {isSuperAdmin && (
                  <div>
                    <label
                      htmlFor="salesField"
                      className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1"
                    >
                      Penugasan Staf Sales
                    </label>
                    <select
                      id="salesField"
                      value={assignedSalesId}
                      onChange={(e) => setAssignedSalesId(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white min-h-[44px]"
                    >
                      <option value="">Belum Ditugaskan</option>
                      {salesList.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name} ({s.username})
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* NPWP */}
                <div>
                  <label
                    htmlFor="npwpField"
                    className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1"
                  >
                    NPWP (Opsional)
                  </label>
                  <input
                    id="npwpField"
                    type="text"
                    value={npwp}
                    onChange={(e) => setNpwp(e.target.value)}
                    placeholder="Nomor pokok wajib pajak"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white min-h-[44px]"
                  />
                </div>

                {/* Tag Pelanggan */}
                <div>
                  <label
                    htmlFor="tagsField"
                    className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1"
                  >
                    Tag / Label (Pisahkan dengan koma)
                  </label>
                  <input
                    id="tagsField"
                    type="text"
                    value={tagsInput}
                    onChange={(e) => setTagsInput(e.target.value)}
                    placeholder="contoh: grosir, jawa timur, prioritas"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white min-h-[44px]"
                  />
                </div>
              </div>

              {/* Alamat Utama */}
              <div>
                <label
                  htmlFor="addressField"
                  className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1"
                >
                  Alamat Lengkap
                </label>
                <textarea
                  id="addressField"
                  rows={2}
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Alamat kantor / toko fisik pelanggan"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white leading-relaxed"
                />
              </div>

              {/* Catatan Khusus */}
              <div>
                <label
                  htmlFor="notesField"
                  className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1"
                >
                  Catatan Tambahan
                </label>
                <textarea
                  id="notesField"
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Catatan kebiasaan transaksi, preferensi pengiriman, dsb."
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white leading-relaxed"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 border border-slate-300 text-slate-700 hover:bg-slate-100 rounded-xl text-sm font-medium transition-colors min-h-[44px]"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold transition-colors flex items-center gap-2 disabled:opacity-50 min-h-[44px]"
                >
                  {saving ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Menyimpan...</span>
                    </>
                  ) : (
                    <span>
                      {editingCustomer
                        ? 'Simpan Perubahan'
                        : 'Daftarkan Pelanggan'}
                    </span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Alihkan Sales (Super Admin) */}
      {reassignModalOpen && customerToReassign && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-md p-5 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3 text-blue-600">
              <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center shrink-0">
                <Send className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-base text-slate-900">
                  Alihkan Sales Pelanggan
                </h3>
                <span className="text-xs text-slate-500 font-mono">
                  {customerToReassign.code} - {customerToReassign.name}
                </span>
              </div>
            </div>

            {reassignError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs sm:text-sm flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{reassignError}</span>
              </div>
            )}

            <form onSubmit={handleConfirmReassign} className="space-y-4">
              <div>
                <label
                  htmlFor="targetSalesSelect"
                  className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1"
                >
                  Pilih Staf Sales Baru *
                </label>
                <select
                  id="targetSalesSelect"
                  required
                  value={targetSalesId}
                  onChange={(e) => setTargetSalesId(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white min-h-[44px]"
                >
                  <option value="">-- Pilih Staf Sales --</option>
                  {salesList.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.username})
                    </option>
                  ))}
                </select>
              </div>

              <label className="flex items-start gap-2 p-3 bg-slate-50 border border-slate-200 rounded-xl cursor-pointer">
                <input
                  type="checkbox"
                  checked={moveOpenOrders}
                  onChange={(e) => setMoveOpenOrders(e.target.checked)}
                  className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500 mt-0.5"
                />
                <span className="text-xs sm:text-sm text-slate-700 leading-snug">
                  Pindahkan juga seluruh pesanan berjalan (komisi order akan
                  diberikan ke sales baru)
                </span>
              </label>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setReassignModalOpen(false)}
                  className="px-4 py-2 border border-slate-300 text-slate-700 hover:bg-slate-100 rounded-xl text-sm font-medium transition-colors min-h-[44px]"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={reassigning || !targetSalesId}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold transition-colors flex items-center gap-2 disabled:opacity-50 min-h-[44px]"
                >
                  {reassigning ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Mengalihkan...</span>
                    </>
                  ) : (
                    <span>Konfirmasi Alihkan</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Dialog Konfirmasi Hapus Pelanggan */}
      {customerToDelete && (
        <ConfirmTypeDialog
          isOpen={deleteDialogOpen}
          onClose={() => {
            setDeleteDialogOpen(false);
            setCustomerToDelete(null);
            setDeleteErrorMessage(null);
          }}
          onConfirm={handleConfirmDelete}
          title="Hapus Pelanggan"
          description={
            deleteErrorMessage ||
            `Apakah Anda yakin ingin menghapus data pelanggan "${customerToDelete.name}"? Data riwayat transaksi masa lalu akan tetap dipertahankan.`
          }
          confirmTarget={customerToDelete.code}
          confirmLabel="Hapus Pelanggan"
          loading={deleting}
        />
      )}
    </div>
  );
}

