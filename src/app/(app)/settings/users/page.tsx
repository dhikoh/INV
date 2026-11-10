'use client';

import React, { useEffect, useState, useCallback } from 'react';
import {
  Users,
  Plus,
  Search,
  KeyRound,
  Trash2,
  X,
  Building2,
  CheckCircle2,
  AlertCircle,
  Edit2,
  UserCheck,
  UserX,
  Send,
} from 'lucide-react';
import { Skeleton, EmptyState, ErrorState } from '@/components/ui/States';

interface BusinessItem {
  id: string;
  code: string;
  name: string;
}

interface UserItem {
  id: string;
  username: string;
  name: string;
  role: 'SUPERADMIN' | 'SALES';
  businessId: string | null;
  business: {
    id: string;
    code: string;
    name: string;
  } | null;
  isActive: boolean;
  mustChangePassword: boolean;
  telegramChatId: string | number | null;
  telegramLinkedAt: string | null;
  telegramBlocked: boolean;
  commissionMode: 'PERCENT_OF_PROFIT' | 'PERCENT_OF_GROSS' | 'FIXED_PER_ORDER' | null;
  commissionRateBps: number | null;
  commissionFixedAmount: number | null;
  lastLoginAt: string | null;
  createdAt: string;
}

export default function UsersManagementPage() {
  const [users, setUsers] = useState<UserItem[]>([]);
  const [businesses, setBusinesses] = useState<BusinessItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Filters
  const [selectedBusinessId, setSelectedBusinessId] = useState<string>('');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Alerts
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Modal Tambah Sales
  const [showAddModal, setShowAddModal] = useState(false);
  const [newUserData, setNewUserData] = useState({
    username: '',
    name: '',
    password: '',
    businessId: '',
    commissionMode: '',
    commissionRateBps: 1000,
    commissionFixedAmount: 0,
  });
  const [savingNewUser, setSavingNewUser] = useState(false);
  const [addUserError, setAddUserError] = useState<string | null>(null);

  // Modal Edit User
  const [editingUser, setEditingUser] = useState<UserItem | null>(null);
  const [editFormData, setEditFormData] = useState({
    name: '',
    businessId: '',
    commissionMode: '',
    commissionRateBps: 1000,
    commissionFixedAmount: 0,
  });
  const [savingEdit, setSavingEdit] = useState(false);
  const [editUserError, setEditUserError] = useState<string | null>(null);

  // Modal Reset Password
  const [resettingUser, setResettingUser] = useState<UserItem | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [savingReset, setSavingReset] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setFetchError(null);

      const [usersRes, bizRes] = await Promise.all([
        fetch('/api/v1/users'),
        fetch('/api/v1/businesses'),
      ]);

      if (!usersRes.ok) {
        throw new Error('Gagal memuat data pengguna');
      }
      if (!bizRes.ok) {
        throw new Error('Gagal memuat data unit usaha');
      }

      const usersJson = await usersRes.json();
      const bizJson = await bizRes.json();

      if (usersJson.ok && Array.isArray(usersJson.data)) {
        setUsers(usersJson.data);
      }
      if (bizJson.ok && Array.isArray(bizJson.data)) {
        setBusinesses(bizJson.data);
        if (bizJson.data.length > 0) {
          setNewUserData((prev) => ({
            ...prev,
            businessId: prev.businessId || bizJson.data[0].id,
          }));
        }
      }
    } catch (err: unknown) {
      setFetchError(err instanceof Error ? err.message : 'Terjadi kesalahan');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // Tambah User Sales Baru
  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSavingNewUser(true);
      setAddUserError(null);

      const businessId = newUserData.businessId || businesses[0]?.id;
      if (!businessId) {
        setAddUserError('Silakan pilih unit usaha untuk sales');
        return;
      }

      const name = newUserData.name.trim();
      if (name.length < 2) {
        setAddUserError('Nama lengkap minimal 2 karakter');
        return;
      }

      const username = newUserData.username.trim().toLowerCase();
      if (username.length < 3) {
        setAddUserError('Username minimal 3 karakter');
        return;
      }
      if (!/^[a-zA-Z0-9_.-]+$/.test(username)) {
        setAddUserError('Username hanya boleh huruf, angka, titik (.), strip (-), dan garis bawah (_)');
        return;
      }

      const password = newUserData.password;
      if (password.length < 10) {
        setAddUserError('Password minimal 10 karakter');
        return;
      }
      if (password.toLowerCase() === username) {
        setAddUserError('Password tidak boleh sama dengan username');
        return;
      }

      const res = await fetch('/api/v1/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username,
          name,
          password,
          businessId,
          role: 'SALES',
          commissionMode: newUserData.commissionMode || null,
          commissionRateBps: newUserData.commissionMode
            ? Number(newUserData.commissionRateBps)
            : null,
          commissionFixedAmount: newUserData.commissionMode
            ? Number(newUserData.commissionFixedAmount)
            : null,
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.ok) {
        let msg = json.error?.message || 'Gagal menambahkan sales';
        if (json.error?.fields) {
          const fieldMsgs = Object.entries(json.error.fields)
            .map(([f, m]) => `${f}: ${m}`)
            .join(' | ');
          msg = `${msg}: ${fieldMsgs}`;
        }
        throw new Error(msg);
      }

      setShowAddModal(false);
      setNewUserData({
        username: '',
        name: '',
        password: '',
        businessId: businesses[0]?.id || '',
        commissionMode: '',
        commissionRateBps: 1000,
        commissionFixedAmount: 0,
      });
      setActionSuccess('Akun sales berhasil dibuat!');
      setTimeout(() => setActionSuccess(null), 4000);
      await loadData();
    } catch (err: unknown) {
      setAddUserError(err instanceof Error ? err.message : 'Terjadi kesalahan');
    } finally {
      setSavingNewUser(false);
    }
  };

  // Edit Data User
  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;

    try {
      setSavingEdit(true);
      setEditUserError(null);

      const res = await fetch(`/api/v1/users/${editingUser.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editFormData.name.trim(),
          businessId: editFormData.businessId || null,
          commissionMode: editFormData.commissionMode || null,
          commissionRateBps: editFormData.commissionMode
            ? Number(editFormData.commissionRateBps)
            : null,
          commissionFixedAmount: editFormData.commissionMode
            ? Number(editFormData.commissionFixedAmount)
            : null,
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.ok) {
        let msg = json.error?.message || 'Gagal memperbarui pengguna';
        if (json.error?.fields) {
          const fieldMsgs = Object.entries(json.error.fields)
            .map(([f, m]) => `${f}: ${m}`)
            .join(' | ');
          msg = `${msg}: ${fieldMsgs}`;
        }
        throw new Error(msg);
      }

      setEditingUser(null);
      setActionSuccess('Data pengguna berhasil diperbarui!');
      setTimeout(() => setActionSuccess(null), 4000);
      await loadData();
    } catch (err: unknown) {
      setEditUserError(
        err instanceof Error ? err.message : 'Terjadi kesalahan'
      );
    } finally {
      setSavingEdit(false);
    }
  };

  // Reset Password User
  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resettingUser) return;

    try {
      setSavingReset(true);
      setResetError(null);

      if (newPassword.length < 10) {
        setResetError('Password minimal 10 karakter');
        return;
      }
      if (newPassword.toLowerCase() === resettingUser.username.toLowerCase()) {
        setResetError('Password tidak boleh sama dengan username');
        return;
      }

      const res = await fetch(`/api/v1/users/${resettingUser.id}/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: newPassword }),
      });

      const json = await res.json();
      if (!res.ok || !json.ok) {
        let msg = json.error?.message || 'Gagal me-reset password';
        if (json.error?.fields) {
          const fieldMsgs = Object.entries(json.error.fields)
            .map(([f, m]) => `${f}: ${m}`)
            .join(' | ');
          msg = `${msg}: ${fieldMsgs}`;
        }
        throw new Error(msg);
      }

      setResettingUser(null);
      setNewPassword('');
      setActionSuccess('Password berhasil di-reset dan seluruh sesi aktif dicabut!');
      setTimeout(() => setActionSuccess(null), 4000);
      await loadData();
    } catch (err: unknown) {
      setResetError(err instanceof Error ? err.message : 'Terjadi kesalahan');
    } finally {
      setSavingReset(false);
    }
  };

  // Toggle Aktivasi User
  const handleToggleActive = async (user: UserItem) => {
    const action = user.isActive ? 'deactivate' : 'activate';
    const actionLabel = user.isActive ? 'menonaktifkan' : 'mengaktifkan';

    if (
      !confirm(
        `Apakah Anda yakin ingin ${actionLabel} akun ${user.username}? ${
          user.isActive
            ? 'Seluruh sesi aktif akan dicabut dan pengguna tidak bisa login.'
            : ''
        }`
      )
    ) {
      return;
    }

    try {
      setActionError(null);
      const res = await fetch(`/api/v1/users/${user.id}/${action}`, {
        method: 'POST',
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(json.error?.message || `Gagal ${actionLabel} akun`);
      }

      setActionSuccess(`Akun ${user.username} berhasil di${actionLabel}!`);
      setTimeout(() => setActionSuccess(null), 4000);
      await loadData();
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Terjadi kesalahan');
    }
  };

  // Hapus User (Soft Delete)
  const handleDeleteUser = async (user: UserItem) => {
    if (
      !confirm(
        `Apakah Anda yakin ingin menghapus akun ${user.username}? Akun ini akan dinonaktifkan dan sesi dicabut.`
      )
    ) {
      return;
    }

    try {
      setActionError(null);
      const res = await fetch(`/api/v1/users/${user.id}`, {
        method: 'DELETE',
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(json.error?.message || 'Gagal menghapus pengguna');
      }

      setActionSuccess(`Akun ${user.username} berhasil dihapus!`);
      setTimeout(() => setActionSuccess(null), 4000);
      await loadData();
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Terjadi kesalahan');
    }
  };

  // Filter daftar pengguna
  const filteredUsers = users.filter((u) => {
    if (selectedBusinessId && u.businessId !== selectedBusinessId) {
      return false;
    }
    if (selectedStatus === 'active' && !u.isActive) return false;
    if (selectedStatus === 'inactive' && u.isActive) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const matchName = u.name.toLowerCase().includes(q);
      const matchUsername = u.username.toLowerCase().includes(q);
      if (!matchName && !matchUsername) return false;
    }
    return true;
  });

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-20 w-full" />
        <div className="space-y-3">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      </div>
    );
  }

  if (fetchError) {
    return (
      <ErrorState
        title="Gagal Memuat Pengguna"
        message={fetchError}
        onRetry={() => {
          void loadData();
        }}
      />
    );
  }

  return (
    <div className="space-y-6 pb-12">
      {/* Header Utama */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
            <Users className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">
              Manajemen Pengguna & Sales
            </h1>
            <p className="text-xs text-slate-500">
              Kelola akun staf sales, reset password, status akun, dan tautan Telegram
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => {
            setNewUserData({
              username: '',
              name: '',
              password: '',
              businessId: businesses[0]?.id || selectedBusinessId || '',
              commissionMode: '',
              commissionRateBps: 1000,
              commissionFixedAmount: 0,
            });
            setAddUserError(null);
            setShowAddModal(true);
          }}
          className="h-11 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-colors shadow-sm"
        >
          <Plus className="w-4 h-4" />
          <span>Tambah Sales</span>
        </button>
      </div>

      {actionSuccess && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl flex items-center gap-3 text-sm font-medium">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          <span>{actionSuccess}</span>
        </div>
      )}

      {actionError && (
        <div className="p-4 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl flex items-center gap-3 text-sm font-medium">
          <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
          <span>{actionError}</span>
        </div>
      )}

      {/* Filter Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3.5" />
          <input
            type="text"
            placeholder="Cari nama atau username..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-10 pl-9 pr-3 bg-slate-50 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <select
            value={selectedBusinessId}
            onChange={(e) => setSelectedBusinessId(e.target.value)}
            className="w-full h-10 px-3 bg-slate-50 border border-slate-300 rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
          >
            <option value="">Semua Unit Usaha</option>
            {businesses.map((b) => (
              <option key={b.id} value={b.id}>
                {b.code} - {b.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="w-full h-10 px-3 bg-slate-50 border border-slate-300 rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
          >
            <option value="all">Semua Status</option>
            <option value="active">Aktif Saja</option>
            <option value="inactive">Nonaktif</option>
          </select>
        </div>
      </div>

      {/* Daftar Pengguna */}
      {filteredUsers.length === 0 ? (
        <EmptyState
          title="Tidak Ada Pengguna"
          description={
            users.length === 0
              ? 'Belum ada akun sales yang dibuat. Klik Tambah Sales untuk memulai.'
              : 'Tidak ada pengguna yang cocok dengan kriteria pencarian atau filter.'
          }
          actionText={users.length === 0 ? 'Tambah Sales' : undefined}
          onAction={users.length === 0 ? () => setShowAddModal(true) : undefined}
        />
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-600 uppercase">
                <tr>
                  <th className="py-3.5 px-4">Pengguna</th>
                  <th className="py-3.5 px-4">Role & Usaha</th>
                  <th className="py-3.5 px-4">Status & Sesi</th>
                  <th className="py-3.5 px-4">Telegram</th>
                  <th className="py-3.5 px-4 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredUsers.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-3.5 px-4">
                      <div className="font-bold text-slate-900">{u.name}</div>
                      <div className="text-xs font-mono text-slate-500">
                        @{u.username}
                      </div>
                    </td>

                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-1.5 mb-1">
                        <span
                          className={`px-2 py-0.5 rounded text-[11px] font-bold uppercase ${
                            u.role === 'SUPERADMIN'
                              ? 'bg-purple-100 text-purple-700'
                              : 'bg-blue-100 text-blue-700'
                          }`}
                        >
                          {u.role === 'SUPERADMIN' ? 'Super Admin' : 'Sales'}
                        </span>
                      </div>
                      <div className="text-xs text-slate-600 flex items-center gap-1">
                        <Building2 className="w-3.5 h-3.5 text-slate-400" />
                        <span>
                          {u.business
                            ? `${u.business.code} - ${u.business.name}`
                            : 'Semua Usaha'}
                        </span>
                      </div>
                    </td>

                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-1.5 mb-1">
                        <span
                          className={`w-2 h-2 rounded-full ${
                            u.isActive ? 'bg-emerald-500' : 'bg-rose-500'
                          }`}
                        />
                        <span
                          className={`text-xs font-semibold ${
                            u.isActive ? 'text-emerald-700' : 'text-rose-700'
                          }`}
                        >
                          {u.isActive ? 'Aktif' : 'Nonaktif'}
                        </span>
                      </div>
                      {u.mustChangePassword && (
                        <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                          Wajib Ganti Password
                        </span>
                      )}
                    </td>

                    <td className="py-3.5 px-4">
                      {u.telegramChatId ? (
                        <div className="flex items-center gap-1.5 text-emerald-600 font-semibold text-xs">
                          <Send className="w-3.5 h-3.5" />
                          <span>Terhubung</span>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400">
                          Belum terhubung
                        </span>
                      )}
                    </td>

                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingUser(u);
                            setEditFormData({
                              name: u.name,
                              businessId: u.businessId || businesses[0]?.id || '',
                              commissionMode: u.commissionMode || '',
                              commissionRateBps: u.commissionRateBps || 1000,
                              commissionFixedAmount:
                                u.commissionFixedAmount || 0,
                            });
                          }}
                          title="Edit Pengguna"
                          className="min-h-[36px] min-w-[36px] p-2 text-slate-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setResettingUser(u);
                            setNewPassword('');
                            setResetError(null);
                          }}
                          title="Reset Password"
                          className="min-h-[36px] min-w-[36px] p-2 text-slate-600 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
                        >
                          <KeyRound className="w-4 h-4" />
                        </button>

                        {u.role !== 'SUPERADMIN' && (
                          <button
                            type="button"
                            onClick={() => handleToggleActive(u)}
                            title={
                              u.isActive
                                ? 'Nonaktifkan Akun (Cabut Sesi)'
                                : 'Aktifkan Akun'
                            }
                            className={`min-h-[36px] min-w-[36px] p-2 rounded-lg transition-colors ${
                              u.isActive
                                ? 'text-amber-600 hover:bg-amber-50'
                                : 'text-emerald-600 hover:bg-emerald-50'
                            }`}
                          >
                            {u.isActive ? (
                              <UserX className="w-4 h-4" />
                            ) : (
                              <UserCheck className="w-4 h-4" />
                            )}
                          </button>
                        )}

                        {u.role !== 'SUPERADMIN' && (
                          <button
                            type="button"
                            onClick={() => handleDeleteUser(u)}
                            title="Hapus Pengguna"
                            className="min-h-[36px] min-w-[36px] p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal Tambah Sales */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <h3 className="font-bold text-slate-900 text-base">
                Tambah Akun Sales Baru
              </h3>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {addUserError && (
              <p className="text-xs font-semibold text-rose-600">
                {addUserError}
              </p>
            )}

            <form onSubmit={handleCreateUser} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                  Unit Usaha Sales <span className="text-rose-500">*</span>
                </label>
                <select
                  required
                  value={newUserData.businessId}
                  onChange={(e) =>
                    setNewUserData((prev) => ({
                      ...prev,
                      businessId: e.target.value,
                    }))
                  }
                  className="w-full h-11 px-3 bg-slate-50 border border-slate-300 rounded-lg text-sm text-slate-900 font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="" disabled>
                    -- Pilih Unit Usaha --
                  </option>
                  {businesses.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.code} - {b.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                  Nama Lengkap <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  minLength={2}
                  placeholder="Contoh: Budi Santoso"
                  value={newUserData.name}
                  onChange={(e) =>
                    setNewUserData((prev) => ({
                      ...prev,
                      name: e.target.value,
                    }))
                  }
                  className="w-full h-11 px-3.5 bg-slate-50 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Username <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    minLength={3}
                    placeholder="budisales"
                    value={newUserData.username}
                    onChange={(e) =>
                      setNewUserData((prev) => ({
                        ...prev,
                        username: e.target.value.toLowerCase().replace(/\s+/g, '_'),
                      }))
                    }
                    className="w-full h-11 px-3.5 bg-slate-50 border border-slate-300 rounded-lg text-sm font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <p className="text-[11px] text-slate-500 mt-1">
                    Huruf kecil, angka, titik, strip, garis bawah (_)
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Password Awal <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="password"
                    required
                    minLength={10}
                    autoComplete="new-password"
                    placeholder="Minimal 10 karakter"
                    value={newUserData.password}
                    onChange={(e) =>
                      setNewUserData((prev) => ({
                        ...prev,
                        password: e.target.value,
                      }))
                    }
                    className="w-full h-11 px-3.5 bg-slate-50 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <p className="text-[11px] text-slate-500 mt-1">
                    Min 10 karakter & beda dari username
                  </p>
                </div>
              </div>

              <p className="text-xs text-slate-500 bg-amber-50 p-2.5 rounded-lg border border-amber-200">
                *Sales akan diwajibkan mengganti password ini pada saat pertama kali login ke sistem.
              </p>

              {/* Opsional Skema Komisi Khusus */}
              <div className="pt-2 border-t border-slate-100 space-y-3">
                <label className="block text-xs font-bold text-slate-800 uppercase">
                  Skema Komisi Khusus (Opsional)
                </label>
                <select
                  value={newUserData.commissionMode}
                  onChange={(e) =>
                    setNewUserData((prev) => ({
                      ...prev,
                      commissionMode: e.target.value,
                    }))
                  }
                  className="w-full h-10 px-3 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-800"
                >
                  <option value="">Ikuti Pengaturan Unit Usaha (Default)</option>
                  <option value="PERCENT_OF_PROFIT">
                    % dari Laba Kotor Khusus
                  </option>
                  <option value="PERCENT_OF_GROSS">
                    % dari Omzet Khusus
                  </option>
                  <option value="FIXED_PER_ORDER">
                    Nominal Tetap per Order
                  </option>
                </select>

                {newUserData.commissionMode === 'FIXED_PER_ORDER' ? (
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      Nominal per Order (Rp)
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={newUserData.commissionFixedAmount}
                      onChange={(e) =>
                        setNewUserData((prev) => ({
                          ...prev,
                          commissionFixedAmount: parseInt(
                            e.target.value || '0',
                            10
                          ),
                        }))
                      }
                      className="w-full h-10 px-3 bg-slate-50 border border-slate-300 rounded-lg text-sm font-bold"
                    />
                  </div>
                ) : newUserData.commissionMode ? (
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      Tarif Komisi (%)
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      max="100"
                      value={(newUserData.commissionRateBps / 100).toFixed(1)}
                      onChange={(e) =>
                        setNewUserData((prev) => ({
                          ...prev,
                          commissionRateBps: Math.round(
                            parseFloat(e.target.value || '0') * 100
                          ),
                        }))
                      }
                      className="w-32 h-10 px-3 bg-slate-50 border border-slate-300 rounded-lg text-sm font-bold"
                    />
                  </div>
                ) : null}
              </div>

              <div className="flex justify-end gap-2 pt-4">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="h-10 px-4 rounded-lg text-sm font-semibold border border-slate-200 text-slate-700 hover:bg-slate-50"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={savingNewUser}
                  className="h-10 px-5 rounded-lg text-sm font-bold bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50"
                >
                  {savingNewUser ? 'Menyimpan...' : 'Buat Akun Sales'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Edit User */}
      {editingUser && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <h3 className="font-bold text-slate-900 text-base">
                Edit Pengguna: @{editingUser.username}
              </h3>
              <button
                type="button"
                onClick={() => setEditingUser(null)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {editUserError && (
              <p className="text-xs font-semibold text-rose-600">
                {editUserError}
              </p>
            )}

            <form onSubmit={handleSaveEdit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                  Nama Lengkap
                </label>
                <input
                  type="text"
                  required
                  value={editFormData.name}
                  onChange={(e) =>
                    setEditFormData((prev) => ({
                      ...prev,
                      name: e.target.value,
                    }))
                  }
                  className="w-full h-11 px-3.5 bg-slate-50 border border-slate-300 rounded-lg text-sm text-slate-900"
                />
              </div>

              {editingUser.role !== 'SUPERADMIN' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Unit Usaha
                  </label>
                  <select
                    required
                    value={editFormData.businessId}
                    onChange={(e) =>
                      setEditFormData((prev) => ({
                        ...prev,
                        businessId: e.target.value,
                      }))
                    }
                    className="w-full h-11 px-3 bg-slate-50 border border-slate-300 rounded-lg text-sm text-slate-900 font-semibold"
                  >
                    {businesses.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.code} - {b.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-4">
                <button
                  type="button"
                  onClick={() => setEditingUser(null)}
                  className="h-10 px-4 rounded-lg text-sm font-semibold border border-slate-200 text-slate-700 hover:bg-slate-50"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={savingEdit}
                  className="h-10 px-5 rounded-lg text-sm font-bold bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50"
                >
                  {savingEdit ? 'Menyimpan...' : 'Simpan Perubahan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Reset Password */}
      {resettingUser && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div className="flex items-center gap-2 text-amber-600">
                <KeyRound className="w-5 h-5" />
                <h3 className="font-bold text-slate-900 text-base">
                  Reset Password
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setResettingUser(null)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-600">
              Mengganti password untuk <strong>@{resettingUser.username}</strong> ({resettingUser.name}).
              Seluruh sesi login aktif pengguna ini akan otomatis dicabut.
            </p>

            {resetError && (
              <p className="text-xs font-semibold text-rose-600">
                {resetError}
              </p>
            )}

            <form onSubmit={handleResetPassword} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                  Password Baru (Min 10 Karakter) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="password"
                  required
                  minLength={10}
                  autoComplete="new-password"
                  placeholder="Masukkan password baru (minimal 10 karakter)"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full h-11 px-3.5 bg-slate-50 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-4">
                <button
                  type="button"
                  onClick={() => setResettingUser(null)}
                  className="h-10 px-4 rounded-lg text-sm font-semibold border border-slate-200 text-slate-700 hover:bg-slate-50"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={savingReset}
                  className="h-10 px-5 rounded-lg text-sm font-bold bg-amber-600 hover:bg-amber-700 text-white disabled:opacity-50"
                >
                  {savingReset ? 'Memproses...' : 'Reset Password'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
