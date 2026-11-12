'use client';

import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  Building2,
  Plus,
  Check,
  Trash2,
  Upload,
  AlertCircle,
  Save,
  CreditCard,
  Sliders,
  Receipt,
  Percent,
  X,
  CheckCircle2,
  Link as LinkIcon,
  ShieldCheck,
  RotateCcw,
} from 'lucide-react';
import Image from 'next/image';
import { Skeleton, EmptyState, ErrorState } from '@/components/ui/States';
import DataTransferCard from './DataTransferCard';
import { DEFAULT_PAYMENT_LEGAL_NOTICE } from '@/lib/domain/paymentPolicy';

interface BankAccount {
  id: string;
  bankName: string;
  accountNumber: string;
  accountHolder: string;
  isDefault: boolean;
}

interface BusinessDetail {
  id: string;
  code: string;
  name: string;
  legalName: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  npwp: string | null;
  logoPath: string | null;
  invoiceTheme: 'PROFESIONAL' | 'FAMILY' | 'MINIMALIS' | 'MODERN' | 'KLASIK';
  invoiceFooterNote: string | null;
  showBankOnProforma: boolean;
  paymentLegalNotice: string | null;
  allowSalesCashPayment: boolean;
  requireTransferProofForSales: boolean;
  ppnEnabled: boolean;
  ppnRateBps: number;
  allowNegativeStock: boolean;
  requirePaidBeforeShip: boolean;
  allowPartialShipment: boolean;
  allowShipBeforeFinalInvoice: boolean;
  defaultDpBps: number;
  dueDays: number;
  defaultRepeatDays: number;
  commissionMode: 'PERCENT_OF_PROFIT' | 'PERCENT_OF_GROSS' | 'FIXED_PER_ORDER';
  commissionRateBps: number;
  commissionFixedAmount: number;
  commissionTrigger: 'ON_FULL_PAID' | 'ON_FIRST_PAYMENT';
  isActive: boolean;
  bankAccounts: BankAccount[];
}

interface BusinessListItem {
  id: string;
  code: string;
  name: string;
}

interface CommissionTierItem {
  id?: string;
  businessId?: string;
  minAchievementBps: number;
  rateBps: number;
}

export default function BusinessSettingsPage() {
  const [businesses, setBusinesses] = useState<BusinessListItem[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');
  const [business, setBusiness] = useState<BusinessDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Form state
  const [formData, setFormData] = useState<Partial<BusinessDetail>>({});
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Commission tiers state (NAV-005)
  const [commissionTiers, setCommissionTiers] = useState<CommissionTierItem[]>([]);
  const [loadingTiers, setLoadingTiers] = useState(false);
  const [savingTiers, setSavingTiers] = useState(false);
  const [tierSuccess, setTierSuccess] = useState(false);
  const [tierError, setTierError] = useState<string | null>(null);

  // Logo upload state
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [logoError, setLogoError] = useState<string | null>(null);
  const [logoUrlInput, setLogoUrlInput] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Bank account modal / form
  const [showAddBank, setShowAddBank] = useState(false);
  const [newBank, setNewBank] = useState({
    bankName: '',
    accountNumber: '',
    accountHolder: '',
    isDefault: false,
  });
  const [savingBank, setSavingBank] = useState(false);
  const [bankError, setBankError] = useState<string | null>(null);

  // New business modal
  const [showAddBiz, setShowAddBiz] = useState(false);
  const [newBiz, setNewBiz] = useState({
    code: '',
    name: '',
    legalName: '',
    address: '',
    phone: '',
    email: '',
    npwp: '',
  });
  const [savingBiz, setSavingBiz] = useState(false);
  const [newBizError, setNewBizError] = useState<string | null>(null);

  // Muat daftar usaha
  const loadBusinesses = useCallback(async () => {
    try {
      setLoading(true);
      setFetchError(null);
      const res = await fetch('/api/v1/businesses');
      if (!res.ok) {
        throw new Error('Gagal memuat daftar unit usaha');
      }
      const json = await res.json();
      if (json.ok && Array.isArray(json.data)) {
        setBusinesses(json.data);
        if (json.data.length > 0 && !selectedId) {
          setSelectedId(json.data[0].id);
        }
      }
    } catch (err: unknown) {
      setFetchError(err instanceof Error ? err.message : 'Terjadi kesalahan');
    } finally {
      setLoading(false);
    }
  }, [selectedId]);

  useEffect(() => {
    loadBusinesses();
  }, [loadBusinesses]);

  // Muat detail usaha terpilih
  const loadBusinessDetail = useCallback(async (id: string) => {
    if (!id) return;
    try {
      setSaveSuccess(false);
      setSaveError(null);
      const res = await fetch(`/api/v1/businesses/${id}`);
      if (!res.ok) {
        throw new Error('Gagal memuat detail unit usaha');
      }
      const json = await res.json();
      if (json.ok && json.data) {
        setBusiness({
          ...json.data,
          bankAccounts: json.data.bankAccounts || [],
        });
        setFormData(json.data);
      }
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : 'Gagal memuat detail');
    }
  }, []);

  // Muat tingkat komisi berjenjang (NAV-005)
  const loadCommissionTiers = useCallback(async (bizId: string) => {
    if (!bizId) return;
    try {
      setLoadingTiers(true);
      setTierError(null);
      const res = await fetch(`/api/v1/commission/tiers?businessId=${bizId}`);
      if (res.ok) {
        const json = await res.json();
        if (json.ok && Array.isArray(json.data)) {
          setCommissionTiers(json.data);
        }
      }
    } catch {
      // ignore
    } finally {
      setLoadingTiers(false);
    }
  }, []);

  useEffect(() => {
    if (selectedId) {
      loadBusinessDetail(selectedId);
      loadCommissionTiers(selectedId);
    }
  }, [selectedId, loadBusinessDetail, loadCommissionTiers]);

  // Operasi Tier Komisi
  const handleAddTier = () => {
    setCommissionTiers((prev) => [
      ...prev,
      { minAchievementBps: (prev.length + 1) * 10000, rateBps: 500 },
    ]);
  };

  const handleRemoveTier = (index: number) => {
    setCommissionTiers((prev) => prev.filter((_, i) => i !== index));
  };

  const handleUpdateTier = (
    index: number,
    field: 'minAchievementBps' | 'rateBps',
    val: number
  ) => {
    setCommissionTiers((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: val };
      return copy;
    });
  };

  const handleSaveTiers = async () => {
    if (!selectedId) return;
    try {
      setSavingTiers(true);
      setTierError(null);
      setTierSuccess(false);

      const res = await fetch('/api/v1/commission/tiers', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessId: selectedId,
          tiers: commissionTiers.map((t) => ({
            minAchievementBps: Number(t.minAchievementBps),
            rateBps: Number(t.rateBps),
          })),
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(json.error?.message || 'Gagal menyimpan tingkat komisi');
      }

      setTierSuccess(true);
      if (Array.isArray(json.data)) {
        setCommissionTiers(json.data);
      }
      setTimeout(() => setTierSuccess(false), 3000);
    } catch (err: unknown) {
      setTierError(
        err instanceof Error ? err.message : 'Terjadi kesalahan saat menyimpan tingkat komisi'
      );
    } finally {
      setSavingTiers(false);
    }
  };

  const handleInputChange = (
    field: keyof BusinessDetail,
    value: string | number | boolean | null
  ) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedId) return;

    try {
      setSaving(true);
      setSaveError(null);
      setSaveSuccess(false);

      const res = await fetch(`/api/v1/businesses/${selectedId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: formData.code,
          name: formData.name,
          legalName: formData.legalName || null,
          address: formData.address || null,
          phone: formData.phone || null,
          email: formData.email || null,
          npwp: formData.npwp || null,
          invoiceTheme: formData.invoiceTheme,
          invoiceFooterNote: formData.invoiceFooterNote || null,
          showBankOnProforma: Boolean(formData.showBankOnProforma),
          paymentLegalNotice: formData.paymentLegalNotice || null,
          allowSalesCashPayment: Boolean(formData.allowSalesCashPayment),
          requireTransferProofForSales: formData.requireTransferProofForSales ?? true,
          ppnEnabled: formData.ppnEnabled,
          ppnRateBps: Number(formData.ppnRateBps),
          allowNegativeStock: formData.allowNegativeStock,
          requirePaidBeforeShip: formData.requirePaidBeforeShip,
          allowPartialShipment: Boolean(formData.allowPartialShipment),
          allowShipBeforeFinalInvoice: Boolean(formData.allowShipBeforeFinalInvoice),
          defaultDpBps: Number(formData.defaultDpBps),
          dueDays: Number(formData.dueDays),
          defaultRepeatDays: Number(formData.defaultRepeatDays),
          commissionMode: formData.commissionMode,
          commissionRateBps: Number(formData.commissionRateBps),
          commissionFixedAmount: Number(formData.commissionFixedAmount),
          commissionTrigger: formData.commissionTrigger,
          isActive: formData.isActive,
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(json.error?.message || 'Gagal menyimpan pengaturan');
      }

      setBusiness((prev) => ({
        ...(prev || {}),
        ...json.data,
        bankAccounts: json.data.bankAccounts || prev?.bankAccounts || [],
      }));
      setFormData((prev) => ({
        ...prev,
        ...json.data,
      }));
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 4000);
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : 'Gagal menyimpan');
    } finally {
      setSaving(false);
    }
  };

  // Upload Logo
  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedId) return;

    try {
      setUploadingLogo(true);
      setLogoError(null);

      const data = new FormData();
      data.append('file', file);

      const res = await fetch(`/api/v1/businesses/${selectedId}/logo`, {
        method: 'POST',
        body: data,
      });

      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(json.error?.message || 'Gagal mengunggah logo');
      }

      // Muat ulang detail usaha untuk memperbarui logoPath
      await loadBusinessDetail(selectedId);
    } catch (err: unknown) {
      setLogoError(err instanceof Error ? err.message : 'Gagal mengunggah logo');
    } finally {
      setUploadingLogo(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // Ambil Logo dari URL
  const handleLogoFromUrl = async () => {
    if (!selectedId || !logoUrlInput.trim()) return;

    try {
      setUploadingLogo(true);
      setLogoError(null);

      const res = await fetch(`/api/v1/businesses/${selectedId}/logo/from-url`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: logoUrlInput.trim() }),
      });

      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(json.error?.message || 'Gagal mengambil logo dari URL');
      }

      setLogoUrlInput('');
      await loadBusinessDetail(selectedId);
    } catch (err: unknown) {
      setLogoError(err instanceof Error ? err.message : 'Gagal mengambil logo dari URL');
    } finally {
      setUploadingLogo(false);
    }
  };

  // Tambah Rekening Bank
  const handleAddBank = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedId) return;

    try {
      setSavingBank(true);
      setBankError(null);

      const res = await fetch(`/api/v1/businesses/${selectedId}/bank-accounts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newBank),
      });

      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(json.error?.message || 'Gagal menambah rekening bank');
      }

      setShowAddBank(false);
      setNewBank({
        bankName: '',
        accountNumber: '',
        accountHolder: '',
        isDefault: false,
      });
      await loadBusinessDetail(selectedId);
    } catch (err: unknown) {
      setBankError(err instanceof Error ? err.message : 'Terjadi kesalahan');
    } finally {
      setSavingBank(false);
    }
  };

  // Jadikan Default Rekening Bank
  const handleSetDefaultBank = async (bankId: string) => {
    try {
      await fetch(`/api/v1/bank-accounts/${bankId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isDefault: true }),
      });
      await loadBusinessDetail(selectedId);
    } catch {
      // ignore
    }
  };

  // Hapus Rekening Bank
  const handleDeleteBank = async (bankId: string) => {
    if (!confirm('Apakah Anda yakin ingin menghapus rekening ini?')) return;
    try {
      await fetch(`/api/v1/bank-accounts/${bankId}`, {
        method: 'DELETE',
      });
      await loadBusinessDetail(selectedId);
    } catch {
      // ignore
    }
  };

  // Buat Unit Usaha Baru
  const handleCreateBusiness = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSavingBiz(true);
      setNewBizError(null);

      const payload = {
        code: newBiz.code.trim().toUpperCase(),
        name: newBiz.name.trim(),
        legalName: newBiz.legalName?.trim() || null,
        address: newBiz.address?.trim() || null,
        phone: newBiz.phone?.trim() || null,
        email: newBiz.email?.trim() || null,
        npwp: newBiz.npwp?.trim() || null,
      };

      const res = await fetch('/api/v1/businesses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(json.error?.message || 'Gagal membuat unit usaha');
      }

      // Otomatis aktifkan unit usaha baru ke sesi agar tidak muncul error "Pilih usaha terlebih dulu"
      await fetch('/api/v1/session/business', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ businessId: json.data.id }),
      });

      setShowAddBiz(false);
      setNewBiz({
        code: '',
        name: '',
        legalName: '',
        address: '',
        phone: '',
        email: '',
        npwp: '',
      });

      // Reload halaman agar AppShell, header, dan seluruh sesi langsung sinkron
      window.location.reload();
    } catch (err: unknown) {
      setNewBizError(err instanceof Error ? err.message : 'Gagal membuat usaha');
    } finally {
      setSavingBiz(false);
    }
  };

  const renderAddBizModal = () => {
    if (!showAddBiz) return null;
    return (
      <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100">
            <h3 className="font-bold text-slate-900 text-base">
              Tambah Unit Usaha Baru
            </h3>
            <button
              type="button"
              onClick={() => setShowAddBiz(false)}
              className="text-slate-400 hover:text-slate-600 p-1"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {newBizError && (
            <p className="text-xs font-semibold text-rose-600">
              {newBizError}
            </p>
          )}

          <form onSubmit={handleCreateBusiness} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                  Kode Usaha (Kapital)
                </label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: CAT"
                  value={newBiz.code}
                  onChange={(e) =>
                    setNewBiz((b) => ({
                      ...b,
                      code: e.target.value.toUpperCase(),
                    }))
                  }
                  className="w-full h-11 px-3.5 bg-slate-50 border border-slate-300 rounded-lg text-sm font-bold text-slate-900 uppercase"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                  Nama Usaha / Brand
                </label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: BentoCat Snack"
                  value={newBiz.name}
                  onChange={(e) =>
                    setNewBiz((b) => ({ ...b, name: e.target.value }))
                  }
                  className="w-full h-11 px-3.5 bg-slate-50 border border-slate-300 rounded-lg text-sm font-medium text-slate-900"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                Nama Badan Hukum (Opsional)
              </label>
              <input
                type="text"
                placeholder="PT / CV"
                value={newBiz.legalName}
                onChange={(e) =>
                  setNewBiz((b) => ({ ...b, legalName: e.target.value }))
                }
                className="w-full h-11 px-3.5 bg-slate-50 border border-slate-300 rounded-lg text-sm text-slate-900"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                  Nomor Telepon (Opsional)
                </label>
                <input
                  type="text"
                  placeholder="08..."
                  value={newBiz.phone}
                  onChange={(e) =>
                    setNewBiz((b) => ({ ...b, phone: e.target.value }))
                  }
                  className="w-full h-11 px-3.5 bg-slate-50 border border-slate-300 rounded-lg text-sm text-slate-900"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                  Email (Opsional)
                </label>
                <input
                  type="email"
                  placeholder="kontak@usaha.com"
                  value={newBiz.email}
                  onChange={(e) =>
                    setNewBiz((b) => ({ ...b, email: e.target.value }))
                  }
                  className="w-full h-11 px-3.5 bg-slate-50 border border-slate-300 rounded-lg text-sm text-slate-900"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                Alamat Lengkap (Opsional)
              </label>
              <textarea
                rows={2}
                placeholder="Alamat kantor"
                value={newBiz.address}
                onChange={(e) =>
                  setNewBiz((b) => ({ ...b, address: e.target.value }))
                }
                className="w-full p-3 bg-slate-50 border border-slate-300 rounded-lg text-sm text-slate-900"
              />
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <button
                type="button"
                onClick={() => setShowAddBiz(false)}
                className="h-10 px-4 rounded-lg text-sm font-semibold border border-slate-200 text-slate-700 hover:bg-slate-50"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={savingBiz}
                className="h-10 px-5 rounded-lg text-sm font-bold bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50"
              >
                {savingBiz ? 'Menyimpan...' : 'Buat Unit Usaha'}
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (fetchError) {
    return (
      <ErrorState
        title="Gagal Memuat Pengaturan"
        message={fetchError}
        onRetry={() => {
          void loadBusinesses();
        }}
      />
    );
  }

  if (businesses.length === 0) {
    return (
      <div className="space-y-8 pb-12">
        <EmptyState
          title="Belum Ada Unit Usaha"
          description="Buat unit usaha pertama Anda untuk mulai mengatur operasional dan rekening bank, atau pulihkan unit usaha lengkap dari berkas transfer portabel (ZIP)."
          actionText="Tambah Usaha Manual"
          onAction={() => setShowAddBiz(true)}
        />
        <DataTransferCard />
        {renderAddBizModal()}
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-12">
      {/* Header & Pemilihan Unit Usaha */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
            <Building2 className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">
              Pengaturan Unit Usaha
            </h1>
            <p className="text-xs text-slate-500">
              Konfigurasi legalitas, operasional, invoice, dan rekening bank
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto min-w-0">
          <select
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            className="h-10 min-w-0 flex-1 sm:flex-initial sm:max-w-xs px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {businesses.map((b) => (
              <option key={b.id} value={b.id}>
                {b.code} - {b.name}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => setShowAddBiz(true)}
            className="h-10 px-3 shrink-0 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold flex items-center gap-1.5 transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Usaha Baru</span>
          </button>
        </div>
      </div>

      {saveSuccess && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl flex items-center gap-3 text-sm font-medium">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          <span>Pengaturan unit usaha berhasil diperbarui dan diaudit!</span>
        </div>
      )}

      {saveError && (
        <div className="p-4 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl flex items-center gap-3 text-sm font-medium">
          <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
          <span>{saveError}</span>
        </div>
      )}

      {business && (
        <form onSubmit={handleSaveSettings} className="space-y-8">
          {/* Bagian 1: Identitas & Legalitas Usaha */}
          <section className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-6">
            <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
              <Building2 className="w-5 h-5 text-blue-600" />
              <h2 className="font-bold text-slate-900 text-base">
                Identitas & Legalitas Usaha
              </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                  Kode Usaha (Maks 10 Karakter, Kapital)
                </label>
                <input
                  type="text"
                  value={formData.code || ''}
                  onChange={(e) =>
                    handleInputChange('code', e.target.value.toUpperCase())
                  }
                  required
                  className="w-full h-11 px-3.5 bg-slate-50 border border-slate-300 rounded-lg text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 uppercase"
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  *Tidak dapat diubah setelah ada transaksi order.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                  Nama Brand / Usaha
                </label>
                <input
                  type="text"
                  value={formData.name || ''}
                  onChange={(e) => handleInputChange('name', e.target.value)}
                  required
                  className="w-full h-11 px-3.5 bg-slate-50 border border-slate-300 rounded-lg text-sm font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                  Nama Badan Hukum / Legal (PT/CV)
                </label>
                <input
                  type="text"
                  value={formData.legalName || ''}
                  onChange={(e) =>
                    handleInputChange('legalName', e.target.value)
                  }
                  placeholder="Contoh: PT Bento Cat Nusantara"
                  className="w-full h-11 px-3.5 bg-slate-50 border border-slate-300 rounded-lg text-sm font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                  NPWP
                </label>
                <input
                  type="text"
                  value={formData.npwp || ''}
                  onChange={(e) => handleInputChange('npwp', e.target.value)}
                  placeholder="Nomor Pokok Wajib Pajak"
                  className="w-full h-11 px-3.5 bg-slate-50 border border-slate-300 rounded-lg text-sm font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                  Nomor Telepon / WhatsApp
                </label>
                <input
                  type="text"
                  value={formData.phone || ''}
                  onChange={(e) => handleInputChange('phone', e.target.value)}
                  placeholder="Contoh: 08123456789"
                  className="w-full h-11 px-3.5 bg-slate-50 border border-slate-300 rounded-lg text-sm font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                  Email
                </label>
                <input
                  type="email"
                  value={formData.email || ''}
                  onChange={(e) => handleInputChange('email', e.target.value)}
                  placeholder="admin@usaha.com"
                  className="w-full h-11 px-3.5 bg-slate-50 border border-slate-300 rounded-lg text-sm font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                  Alamat Lengkap
                </label>
                <textarea
                  value={formData.address || ''}
                  onChange={(e) => handleInputChange('address', e.target.value)}
                  rows={2}
                  placeholder="Alamat kantor / gudang utama"
                  className="w-full p-3 bg-slate-50 border border-slate-300 rounded-lg text-sm font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </section>

          {/* Bagian 2: Logo Usaha */}
          <section className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
            <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
              <Upload className="w-5 h-5 text-blue-600" />
              <h2 className="font-bold text-slate-900 text-base">Logo Usaha</h2>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center gap-6">
              <div className="w-24 h-24 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-center overflow-hidden shrink-0">
                {business.logoPath ? (
                  <Image
                    src={`/api/v1/files/${business.logoPath}`}
                    alt="Logo Usaha"
                    width={96}
                    height={96}
                    unoptimized
                    className="w-full h-full object-contain p-2"
                  />
                ) : (
                  <Building2 className="w-10 h-10 text-slate-400" />
                )}
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={handleLogoUpload}
                    className="hidden"
                    id="logo-upload"
                  />
                  <label
                    htmlFor="logo-upload"
                    className={`h-10 px-4 rounded-lg text-sm font-semibold border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 flex items-center gap-2 cursor-pointer transition-colors shadow-sm ${
                      uploadingLogo ? 'opacity-50 pointer-events-none' : ''
                    }`}
                  >
                    <Upload className="w-4 h-4" />
                    {uploadingLogo ? 'Mengunggah...' : 'Pilih Logo Baru'}
                  </label>
                </div>
                <div className="pt-2 border-t border-slate-100 flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                  <input
                    type="url"
                    value={logoUrlInput}
                    onChange={(e) => setLogoUrlInput(e.target.value)}
                    placeholder="Atau tempel URL gambar (https://...)"
                    className="flex-1 text-xs border border-slate-300 rounded-lg px-3 py-2 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                    disabled={uploadingLogo}
                  />
                  <button
                    type="button"
                    onClick={handleLogoFromUrl}
                    disabled={uploadingLogo || !logoUrlInput.trim()}
                    className="px-3 py-2 bg-slate-800 hover:bg-slate-900 disabled:opacity-50 text-white text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 transition-colors shadow-sm shrink-0"
                  >
                    <LinkIcon className="w-3.5 h-3.5" />
                    <span>{uploadingLogo ? 'Mengambil...' : 'Ambil dari URL'}</span>
                  </button>
                </div>
                <p className="text-xs text-slate-500">
                  Format gambar yang didukung: PNG, JPEG, WebP. Maksimal 10 MB.
                  Diproses otomatis menjadi WebP tajam dan aman.
                </p>
                {logoError && (
                  <p className="text-xs font-semibold text-rose-600">
                    {logoError}
                  </p>
                )}
              </div>
            </div>
          </section>

          {/* Bagian 3: Pengaturan Operasional & Aturan Bisnis */}
          <section className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-6">
            <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
              <Sliders className="w-5 h-5 text-blue-600" />
              <h2 className="font-bold text-slate-900 text-base">
                Operasional & Ketentuan Bisnis
              </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Toggle PPN */}
              <div className="space-y-3 p-4 rounded-lg bg-slate-50 border border-slate-200">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold text-slate-800">
                    Aktifkan PPN
                  </span>
                  <input
                    type="checkbox"
                    checked={formData.ppnEnabled ?? false}
                    onChange={(e) =>
                      handleInputChange('ppnEnabled', e.target.checked)
                    }
                    className="w-5 h-5 text-blue-600 rounded border-slate-300 focus:ring-blue-500 cursor-pointer"
                  />
                </div>
                {formData.ppnEnabled && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">
                      Tarif PPN (%)
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        max="100"
                        value={((formData.ppnRateBps ?? 1100) / 100).toFixed(2)}
                        onChange={(e) =>
                          handleInputChange(
                            'ppnRateBps',
                            Math.round(parseFloat(e.target.value || '0') * 100)
                          )
                        }
                        className="w-28 h-10 px-3 bg-white border border-slate-300 rounded-lg text-sm font-bold text-slate-900"
                      />
                      <span className="text-sm font-semibold text-slate-600">
                        % ({formData.ppnRateBps ?? 1100} bps)
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Toggle Stok Negatif */}
              <div className="space-y-2 p-4 rounded-lg bg-slate-50 border border-slate-200">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-sm font-bold text-slate-800">
                      Izinkan Stok Negatif
                    </span>
                    <p className="text-xs text-slate-500">
                      Order tetap dapat diproses meski stok fisik 0
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={formData.allowNegativeStock ?? false}
                    onChange={(e) =>
                      handleInputChange('allowNegativeStock', e.target.checked)
                    }
                    className="w-5 h-5 text-blue-600 rounded border-slate-300 focus:ring-blue-500 cursor-pointer"
                  />
                </div>
              </div>

              {/* Toggle Wajib Lunas Sebelum Kirim */}
              <div className="space-y-2 p-4 rounded-lg bg-slate-50 border border-slate-200">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-sm font-bold text-slate-800">
                      Wajib Lunas Sebelum Pengiriman
                    </span>
                    <p className="text-xs text-slate-500">
                      Pengiriman barang hanya dapat dibuat jika order lunas
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={formData.requirePaidBeforeShip ?? false}
                    onChange={(e) =>
                      handleInputChange(
                        'requirePaidBeforeShip',
                        e.target.checked
                      )
                    }
                    className="w-5 h-5 text-blue-600 rounded border-slate-300 focus:ring-blue-500 cursor-pointer"
                  />
                </div>

                <div className="pt-2 border-t border-slate-200 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <span className="text-sm font-bold text-slate-800">
                        Izinkan Pengiriman Parsial / Bertahap (Multi-Kloter)
                      </span>
                      <p className="text-xs text-slate-500">
                        Gudang dapat mengirim barang bertahap per kloter dengan Surat Jalan terpisah dan memotong stok hanya untuk qty yang dikirim
                      </p>
                    </div>
                    <input
                      type="checkbox"
                      aria-label="Izinkan Pengiriman Parsial / Bertahap (Multi-Kloter)"
                      checked={formData.allowPartialShipment ?? false}
                      onChange={(e) =>
                        handleInputChange(
                          'allowPartialShipment',
                          e.target.checked
                        )
                      }
                      className="w-5 h-5 text-blue-600 rounded border-slate-300 focus:ring-blue-500 cursor-pointer shrink-0"
                    />
                  </div>

                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <span className="text-sm font-bold text-slate-800">
                        Izinkan Pengiriman Barang Sebelum Faktur Pelunasan
                      </span>
                      <p className="text-xs text-slate-500">
                        Jika aktif, order berstatus Diproses (IN_PROCESS) boleh dikirim sebelum Faktur Pelunasan diterbitkan (tetap patuh pada aturan Wajib Lunas jika aktif)
                      </p>
                    </div>
                    <input
                      type="checkbox"
                      aria-label="Izinkan Pengiriman Barang Sebelum Faktur Pelunasan"
                      checked={formData.allowShipBeforeFinalInvoice ?? false}
                      onChange={(e) =>
                        handleInputChange(
                          'allowShipBeforeFinalInvoice',
                          e.target.checked
                        )
                      }
                      className="w-5 h-5 text-blue-600 rounded border-slate-300 focus:ring-blue-500 cursor-pointer shrink-0"
                    />
                  </div>
                </div>

                {/* Pengaturan Proforma & Kontrol Pembayaran Sales */}
                <div className="pt-2 border-t border-slate-200 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <span className="text-sm font-bold text-slate-800">
                        Tampilkan Rekening Bank di Proforma PDF
                      </span>
                      <p className="text-xs text-slate-500">
                        Jika nonaktif, nomor rekening disembunyikan di Proforma sampai Faktur Resmi disetujui
                      </p>
                    </div>
                    <input
                      type="checkbox"
                      checked={formData.showBankOnProforma ?? false}
                      onChange={(e) =>
                        handleInputChange('showBankOnProforma', e.target.checked)
                      }
                      className="w-5 h-5 text-blue-600 rounded border-slate-300 focus:ring-blue-500 cursor-pointer shrink-0"
                    />
                  </div>

                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <span className="text-sm font-bold text-slate-800">
                        Izinkan Sales Input Pembayaran Tunai (Cash)
                      </span>
                      <p className="text-xs text-slate-500">
                        Default nonaktif untuk mencegah penerimaan tunai tanpa mutasi bank resmi
                      </p>
                    </div>
                    <input
                      type="checkbox"
                      checked={formData.allowSalesCashPayment ?? false}
                      onChange={(e) =>
                        handleInputChange('allowSalesCashPayment', e.target.checked)
                      }
                      className="w-5 h-5 text-blue-600 rounded border-slate-300 focus:ring-blue-500 cursor-pointer shrink-0"
                    />
                  </div>

                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <span className="text-sm font-bold text-slate-800">
                        Wajib Lampirkan Bukti Transfer untuk Sales
                      </span>
                      <p className="text-xs text-slate-500">
                        Sales wajib mengunggah foto/PDF bukti saat mencatat pembayaran Transfer Bank
                      </p>
                    </div>
                    <input
                      type="checkbox"
                      checked={formData.requireTransferProofForSales ?? true}
                      onChange={(e) =>
                        handleInputChange(
                          'requireTransferProofForSales',
                          e.target.checked
                        )
                      }
                      className="w-5 h-5 text-blue-600 rounded border-slate-300 focus:ring-blue-500 cursor-pointer shrink-0"
                    />
                  </div>
                </div>
              </div>

              {/* DP Default */}
              <div className="space-y-2 p-4 rounded-lg bg-slate-50 border border-slate-200">
                <label className="block text-xs font-semibold text-slate-700 uppercase">
                  Persentase DP Default (%)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="0"
                    max="99"
                    value={Math.round((formData.defaultDpBps ?? 5000) / 100)}
                    onChange={(e) =>
                      handleInputChange(
                        'defaultDpBps',
                        parseInt(e.target.value || '0', 10) * 100
                      )
                    }
                    className="w-24 h-10 px-3 bg-white border border-slate-300 rounded-lg text-sm font-bold text-slate-900"
                  />
                  <span className="text-sm font-semibold text-slate-600">
                    % ({formData.defaultDpBps ?? 5000} bps)
                  </span>
                </div>
              </div>

              {/* Due Days & Repeat Days */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                  Jatuh Tempo Pembayaran (Hari)
                </label>
                <input
                  type="number"
                  min="1"
                  max="365"
                  value={formData.dueDays ?? 7}
                  onChange={(e) =>
                    handleInputChange(
                      'dueDays',
                      parseInt(e.target.value || '7', 10)
                    )
                  }
                  className="w-full h-11 px-3.5 bg-slate-50 border border-slate-300 rounded-lg text-sm font-medium text-slate-900"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                  Siklus Pesan Ulang Default (Hari)
                </label>
                <input
                  type="number"
                  min="1"
                  max="365"
                  value={formData.defaultRepeatDays ?? 30}
                  onChange={(e) =>
                    handleInputChange(
                      'defaultRepeatDays',
                      parseInt(e.target.value || '30', 10)
                    )
                  }
                  className="w-full h-11 px-3.5 bg-slate-50 border border-slate-300 rounded-lg text-sm font-medium text-slate-900"
                />
              </div>
            </div>
          </section>

          {/* Bagian 4: Faktur / Invoice */}
          <section className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-6">
            <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
              <Receipt className="w-5 h-5 text-blue-600" />
              <h2 className="font-bold text-slate-900 text-base">
                Faktur & Invoice
              </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                  Tema Invoice PDF
                </label>
                <div className="flex flex-col sm:flex-row gap-2">
                  <select
                    value={formData.invoiceTheme || 'PROFESIONAL'}
                    onChange={(e) =>
                      handleInputChange(
                        'invoiceTheme',
                        e.target.value as BusinessDetail['invoiceTheme']
                      )
                    }
                    className="w-full sm:flex-1 min-w-0 h-11 px-3.5 bg-slate-50 border border-slate-300 rounded-lg text-sm font-semibold text-slate-900"
                  >
                    <option value="PROFESIONAL">Profesional (Standar Korporat Bersih)</option>
                    <option value="FAMILY">Family (Hangat & Bersahabat)</option>
                    <option value="MINIMALIS">Minimalis (Monokrom Ringkas)</option>
                    <option value="MODERN">Modern (Elegan & Tajam)</option>
                    <option value="KLASIK">Klasik (Serif Tradisional Resmi)</option>
                  </select>
                  {business && (
                    <a
                      href={`/api/v1/businesses/${business.id}/invoice-preview?theme=${formData.invoiceTheme || 'PROFESIONAL'}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center justify-center gap-1.5 px-3.5 h-11 shrink-0 bg-indigo-50 border border-indigo-200 text-indigo-700 hover:bg-indigo-100 rounded-lg text-xs font-semibold transition-colors"
                      title="Pratinjau PDF Desain Tema Terpilih"
                    >
                      <span>Pratinjau PDF</span>
                    </a>
                  )}
                </div>
              </div>

              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                  Catatan Kaki Faktur (Footer Note)
                </label>
                <textarea
                  value={formData.invoiceFooterNote || ''}
                  onChange={(e) =>
                    handleInputChange('invoiceFooterNote', e.target.value)
                  }
                  rows={2}
                  placeholder="Contoh: Terima kasih atas kepercayaan Anda. Pembayaran harap ditransfer sesuai nomor rekening tertera."
                  className="w-full p-3 bg-slate-50 border border-slate-300 rounded-lg text-sm font-medium text-slate-900"
                />
              </div>

              <div className="md:col-span-2">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                  <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 uppercase">
                    <ShieldCheck className="w-4 h-4 text-emerald-600" />
                    <span>Klausul Pembayaran Sah PDF (Anti-Fraud)</span>
                  </label>
                  <button
                    type="button"
                    onClick={() =>
                      handleInputChange(
                        'paymentLegalNotice',
                        DEFAULT_PAYMENT_LEGAL_NOTICE
                      )
                    }
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 min-h-[36px] text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-lg transition-colors"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Reset ke Teks Default</span>
                  </button>
                </div>
                <textarea
                  value={
                    formData.paymentLegalNotice ?? DEFAULT_PAYMENT_LEGAL_NOTICE
                  }
                  onChange={(e) =>
                    handleInputChange('paymentLegalNotice', e.target.value)
                  }
                  rows={3}
                  placeholder={DEFAULT_PAYMENT_LEGAL_NOTICE}
                  className="w-full p-3 bg-amber-50/50 border border-amber-300 rounded-lg text-sm font-medium text-slate-900"
                />
                <p className="text-xs text-slate-500 mt-1">
                  Tercetak otomatis pada Proforma Order, Faktur Uang Muka, dan Faktur Penjualan. Kosongkan untuk kembali ke teks default resmi.
                </p>
              </div>
            </div>
          </section>

          {/* Bagian 5: Pengaturan Komisi Sales */}
          <section className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-6">
            <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
              <Percent className="w-5 h-5 text-blue-600" />
              <h2 className="font-bold text-slate-900 text-base">
                Skema Komisi Sales
              </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                  Mode Komisi
                </label>
                <select
                  value={formData.commissionMode || 'PERCENT_OF_PROFIT'}
                  onChange={(e) =>
                    handleInputChange(
                      'commissionMode',
                      e.target.value as BusinessDetail['commissionMode']
                    )
                  }
                  className="w-full h-11 px-3.5 bg-slate-50 border border-slate-300 rounded-lg text-sm font-semibold text-slate-900"
                >
                  <option value="PERCENT_OF_PROFIT">
                    % dari Laba Kotor (Gross Profit)
                  </option>
                  <option value="PERCENT_OF_GROSS">
                    % dari Omzet (Total Penjualan)
                  </option>
                  <option value="FIXED_PER_ORDER">
                    Nominal Tetap per Order
                  </option>
                </select>
              </div>

              {formData.commissionMode === 'FIXED_PER_ORDER' ? (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Nominal Komisi (Rp)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={formData.commissionFixedAmount ?? 0}
                    onChange={(e) =>
                      handleInputChange(
                        'commissionFixedAmount',
                        parseInt(e.target.value || '0', 10)
                      )
                    }
                    className="w-full h-11 px-3.5 bg-slate-50 border border-slate-300 rounded-lg text-sm font-bold text-slate-900"
                  />
                </div>
              ) : (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Tarif Komisi (%)
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      max="100"
                      value={(
                        (formData.commissionRateBps ?? 1000) / 100
                      ).toFixed(1)}
                      onChange={(e) =>
                        handleInputChange(
                          'commissionRateBps',
                          Math.round(parseFloat(e.target.value || '0') * 100)
                        )
                      }
                      className="w-28 h-11 px-3.5 bg-slate-50 border border-slate-300 rounded-lg text-sm font-bold text-slate-900"
                    />
                    <span className="text-sm font-semibold text-slate-600">
                      % ({formData.commissionRateBps ?? 1000} bps)
                    </span>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                  Pemicu Hak Komisi
                </label>
                <select
                  value={formData.commissionTrigger || 'ON_FULL_PAID'}
                  onChange={(e) =>
                    handleInputChange(
                      'commissionTrigger',
                      e.target.value as BusinessDetail['commissionTrigger']
                    )
                  }
                  className="w-full h-11 px-3.5 bg-slate-50 border border-slate-300 rounded-lg text-sm font-semibold text-slate-900"
                >
                  <option value="ON_FULL_PAID">
                    Saat Lunas (On Full Paid)
                  </option>
                  <option value="ON_FIRST_PAYMENT">
                    Saat DP Masuk (On First Payment)
                  </option>
                </select>
              </div>
            </div>

            {/* Tingkat Komisi Berjenjang (Commission Tier - NAV-005) */}
            <div className="pt-6 border-t border-slate-100 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    Tingkat Komisi Berjenjang (Commission Tier)
                  </h3>
                  <p className="text-xs text-slate-500">
                    Atur tarif insentif bertingkat berdasarkan persentase capaian target penjualan sales.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleAddTier}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors w-fit"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Tambah Tier</span>
                </button>
              </div>

              {tierSuccess && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg text-xs font-medium flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Tingkat komisi berjenjang berhasil disimpan.</span>
                </div>
              )}

              {tierError && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-lg text-xs font-medium flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{tierError}</span>
                </div>
              )}

              {loadingTiers ? (
                <div className="p-4 text-center text-xs text-slate-400">
                  Memuat tingkat komisi...
                </div>
              ) : commissionTiers.length === 0 ? (
                <div className="p-4 bg-slate-50 border border-dashed border-slate-200 rounded-lg text-center">
                  <p className="text-xs text-slate-500">
                    Belum ada tingkat komisi berjenjang. Komisi sales akan menggunakan tarif dasar default di atas.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="grid grid-cols-12 gap-2 text-xs font-bold text-slate-600 uppercase px-2">
                    <div className="col-span-5">Capaian Target Minimal (%)</div>
                    <div className="col-span-5">Tarif Komisi (%)</div>
                    <div className="col-span-2 text-right">Aksi</div>
                  </div>
                  {commissionTiers.map((tier, idx) => (
                    <div
                      key={idx}
                      className="grid grid-cols-12 gap-2 items-center bg-slate-50 p-2.5 rounded-lg border border-slate-200"
                    >
                      <div className="col-span-5 flex items-center gap-1.5">
                        <input
                          type="number"
                          min="0"
                          max="1000"
                          value={tier.minAchievementBps / 100}
                          onChange={(e) =>
                            handleUpdateTier(
                              idx,
                              'minAchievementBps',
                              Math.round(Number(e.target.value || 0) * 100)
                            )
                          }
                          className="w-full h-9 px-2.5 bg-white border border-slate-300 rounded-lg text-xs font-bold text-slate-900"
                        />
                        <span className="text-xs text-slate-500 font-semibold">%</span>
                      </div>
                      <div className="col-span-5 flex items-center gap-1.5">
                        <input
                          type="number"
                          step="0.1"
                          min="0"
                          max="100"
                          value={(tier.rateBps / 100).toFixed(1)}
                          onChange={(e) =>
                            handleUpdateTier(
                              idx,
                              'rateBps',
                              Math.round(Number(e.target.value || 0) * 100)
                            )
                          }
                          className="w-full h-9 px-2.5 bg-white border border-slate-300 rounded-lg text-xs font-bold text-slate-900"
                        />
                        <span className="text-xs text-slate-500 font-semibold">%</span>
                      </div>
                      <div className="col-span-2 flex justify-end">
                        <button
                          type="button"
                          onClick={() => handleRemoveTier(idx)}
                          className="p-1.5 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition-colors"
                          title="Hapus Tier"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                  <div className="flex justify-end pt-2">
                    <button
                      type="button"
                      onClick={handleSaveTiers}
                      disabled={savingTiers}
                      className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-slate-800 hover:bg-slate-900 rounded-lg transition-colors disabled:opacity-50 shadow-sm"
                    >
                      <Save className="w-3.5 h-3.5" />
                      <span>{savingTiers ? 'Menyimpan...' : 'Simpan Tingkat Komisi'}</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* Tombol Simpan Form Pengaturan */}
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="h-12 px-6 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-bold flex items-center gap-2 shadow-md hover:shadow-lg transition-all disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              {saving ? 'Menyimpan...' : 'Simpan Pengaturan'}
            </button>
          </div>
        </form>
      )}

      {/* Bagian 6: Manajemen Rekening Bank */}
      {business && (
        <section className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-6">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <CreditCard className="w-5 h-5 text-blue-600" />
              <h2 className="font-bold text-slate-900 text-base">
                Rekening Bank Usaha
              </h2>
            </div>

            <button
              type="button"
              onClick={() => setShowAddBank(true)}
              className="h-9 px-3 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              Tambah Rekening
            </button>
          </div>

          {(business.bankAccounts?.length ?? 0) === 0 ? (
            <p className="text-sm text-slate-500 py-4 text-center">
              Belum ada rekening bank yang didaftarkan untuk unit usaha ini.
            </p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {business.bankAccounts?.map((account) => (
                <div
                  key={account.id}
                  className={`p-4 rounded-xl border transition-all ${
                    account.isDefault
                      ? 'border-blue-500 bg-blue-50/50'
                      : 'border-slate-200 bg-white hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-extrabold text-slate-900 text-base">
                          {account.bankName}
                        </span>
                        {account.isDefault && (
                          <span className="px-2 py-0.5 text-[11px] font-bold bg-blue-600 text-white rounded-full">
                            Utama
                          </span>
                        )}
                      </div>
                      <p className="font-mono text-sm text-slate-700 mt-1">
                        {account.accountNumber}
                      </p>
                      <p className="text-xs text-slate-500">
                        a.n. {account.accountHolder}
                      </p>
                    </div>

                    <div className="flex items-center gap-1">
                      {!account.isDefault && (
                        <button
                          type="button"
                          onClick={() => handleSetDefaultBank(account.id)}
                          title="Jadikan Rekening Utama"
                          className="min-h-[36px] min-w-[36px] p-2 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        >
                          <Check className="w-4 h-4" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleDeleteBank(account.id)}
                        title="Hapus Rekening"
                        className="min-h-[36px] min-w-[36px] p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Portabilitas Data: Ekspor & Impor ZIP */}
      {business && (
        <DataTransferCard
          businessId={business.id}
          businessCode={business.code}
        />
      )}

      {/* Modal Tambah Rekening Bank */}
      {showAddBank && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <h3 className="font-bold text-slate-900 text-base">
                Tambah Rekening Bank
              </h3>
              <button
                type="button"
                onClick={() => setShowAddBank(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {bankError && (
              <p className="text-xs font-semibold text-rose-600">{bankError}</p>
            )}

            <form onSubmit={handleAddBank} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                  Nama Bank
                </label>
                <input
                  type="text"
                  required
                  placeholder="BCA / Mandiri / BRI / BNI"
                  value={newBank.bankName}
                  onChange={(e) =>
                    setNewBank((b) => ({ ...b, bankName: e.target.value }))
                  }
                  className="w-full h-11 px-3.5 bg-slate-50 border border-slate-300 rounded-lg text-sm text-slate-900"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                  Nomor Rekening
                </label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: 1234567890"
                  value={newBank.accountNumber}
                  onChange={(e) =>
                    setNewBank((b) => ({ ...b, accountNumber: e.target.value }))
                  }
                  className="w-full h-11 px-3.5 bg-slate-50 border border-slate-300 rounded-lg text-sm font-mono text-slate-900"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                  Nama Pemilik Rekening (Atas Nama)
                </label>
                <input
                  type="text"
                  required
                  placeholder="Sesuai buku tabungan"
                  value={newBank.accountHolder}
                  onChange={(e) =>
                    setNewBank((b) => ({ ...b, accountHolder: e.target.value }))
                  }
                  className="w-full h-11 px-3.5 bg-slate-50 border border-slate-300 rounded-lg text-sm text-slate-900"
                />
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="bank-default"
                  checked={newBank.isDefault}
                  onChange={(e) =>
                    setNewBank((b) => ({ ...b, isDefault: e.target.checked }))
                  }
                  className="w-4 h-4 text-blue-600 rounded border-slate-300"
                />
                <label
                  htmlFor="bank-default"
                  className="text-sm font-medium text-slate-700 cursor-pointer"
                >
                  Jadikan Rekening Utama (Default)
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-4">
                <button
                  type="button"
                  onClick={() => setShowAddBank(false)}
                  className="h-10 px-4 rounded-lg text-sm font-semibold border border-slate-200 text-slate-700 hover:bg-slate-50"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={savingBank}
                  className="h-10 px-5 rounded-lg text-sm font-bold bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50"
                >
                  {savingBank ? 'Menyimpan...' : 'Simpan Rekening'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Tambah Unit Usaha Baru */}
      {renderAddBizModal()}
    </div>
  );
}
