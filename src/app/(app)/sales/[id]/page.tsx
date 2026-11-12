'use client';

import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import {
  ArrowLeft,
  Target,
  TrendingUp,
  DollarSign,
  AlertTriangle,
  Lock,
  MessageSquare,
  ShieldAlert,
  RefreshCw,
  Plus,
  Calendar,
  Check,
  CreditCard,
} from 'lucide-react';
import { Skeleton, ErrorState } from '@/components/ui/States';
import { MoneyInput } from '@/components/ui/MoneyInput';
import { formatRupiah, formatPercentFromBps } from '@/lib/domain/money';
import {
  OwnerSalesNoteDto,
  SalesPerformanceItem,
  CommissionReportEntryDto,
  CommissionReportResult,
} from '@/lib/services/salesEvaluation';
import { formatDateId } from '@/lib/format/date';

export default function SalesDetailEvaluationPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const salesId = params.id as string;

  const now = new Date();
  const currentMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const initialMonth = searchParams.get('month') || currentMonthStr;

  const [userRole, setUserRole] = useState<string | null>(null);
  const [loadingUser, setLoadingUser] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState<string>(initialMonth);

  // States
  const [salesInfo, setSalesInfo] = useState<{ id: string; name: string; username: string } | null>(null);
  const [performanceData, setPerformanceData] = useState<SalesPerformanceItem | null>(null);
  const [notes, setNotes] = useState<OwnerSalesNoteDto[]>([]);
  const [commissionReport, setCommissionReport] = useState<CommissionReportResult | null>(null);

  // Form states
  const [targetRevenueInput, setTargetRevenueInput] = useState<number>(0);
  const [targetProfitInput, setTargetProfitInput] = useState<number>(0);
  const [savingTarget, setSavingTarget] = useState(false);
  const [targetSuccessMessage, setTargetSuccessMessage] = useState<string | null>(null);

  const [newNote, setNewNote] = useState<string>('');
  const [savingNote, setSavingNote] = useState(false);
  const [noteSuccessMessage, setNoteSuccessMessage] = useState<string | null>(null);

  const [payingCommissionId, setPayingCommissionId] = useState<string | null>(null);
  const [payNote, setPayNote] = useState<string>('');
  const [payingLoading, setPayingLoading] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [loadingAll, setLoadingAll] = useState(true);

  // 1. Initial User check
  useEffect(() => {
    async function initUser() {
      try {
        const res = await fetch('/api/v1/auth/me');
        if (res.ok) {
          const json = await res.json();
          setUserRole(json.data.user.role);
        }
      } catch {
        setError('Gagal memverifikasi akun pengguna');
      } finally {
        setLoadingUser(false);
      }
    }
    initUser();
  }, []);

  // 2. Fetch All Data for Sales
  const loadData = useCallback(async () => {
    if (userRole !== 'SUPERADMIN' || !salesId) return;
    setLoadingAll(true);
    setError(null);

    try {
      const [perfRes, targetRes, notesRes, commRes, usersRes] = await Promise.all([
        fetch(
          `/api/v1/reports/sales-performance?salesId=${encodeURIComponent(salesId)}&month=${encodeURIComponent(selectedMonth)}`
        ),
        fetch(
          `/api/v1/sales/${encodeURIComponent(salesId)}/targets/${encodeURIComponent(selectedMonth)}`
        ),
        fetch(`/api/v1/sales/${encodeURIComponent(salesId)}/notes`),
        fetch(
          `/api/v1/reports/commissions?salesId=${encodeURIComponent(salesId)}&limit=100`
        ),
        fetch('/api/v1/users'),
      ]);

      if (perfRes.ok) {
        const json = await perfRes.json();
        const item = json.data?.items?.[0] || null;
        setPerformanceData(item);
      }

      if (targetRes.ok) {
        const json = await targetRes.json();
        setTargetRevenueInput(json.data.targetRevenue || 0);
        setTargetProfitInput(json.data.targetProfit || 0);
      }

      if (notesRes.ok) {
        const json = await notesRes.json();
        setNotes(json.data || []);
      }

      if (commRes.ok) {
        const json = await commRes.json();
        setCommissionReport(json.data || null);
      }

      if (usersRes.ok) {
        const json = await usersRes.json();
        const u = (json.data || []).find((x: { id: string }) => x.id === salesId);
        if (u) {
          setSalesInfo({ id: u.id, name: u.name, username: u.username });
        }
      }
    } catch {
      setError('Terjadi kendala saat memuat data evaluasi sales');
    } finally {
      setLoadingAll(false);
    }
  }, [salesId, selectedMonth, userRole]);

  useEffect(() => {
    if (!loadingUser && userRole === 'SUPERADMIN') {
      loadData();
    }
  }, [loadingUser, userRole, loadData]);

  // Handler: Save Target
  const handleSaveTarget = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingTarget(true);
    setTargetSuccessMessage(null);
    setError(null);

    try {
      const res = await fetch(
        `/api/v1/sales/${encodeURIComponent(salesId)}/targets/${encodeURIComponent(selectedMonth)}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            targetRevenue: targetRevenueInput,
            targetProfit: targetProfitInput,
          }),
        }
      );

      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error?.message || 'Gagal menyimpan target');
      }

      setTargetSuccessMessage('Target bulanan berhasil disimpan!');
      setTimeout(() => setTargetSuccessMessage(null), 4000);
      loadData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Gagal menyimpan target');
    } finally {
      setSavingTarget(false);
    }
  };

  // Handler: Save Note
  const handleSaveNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNote.trim()) return;

    setSavingNote(true);
    setNoteSuccessMessage(null);
    setError(null);

    try {
      const res = await fetch(
        `/api/v1/sales/${encodeURIComponent(salesId)}/notes`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ note: newNote }),
        }
      );

      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error?.message || 'Gagal menyimpan catatan pemilik');
      }

      setNewNote('');
      setNoteSuccessMessage('Catatan rahasia pemilik berhasil ditambahkan!');
      setTimeout(() => setNoteSuccessMessage(null), 4000);

      // Refresh notes
      const notesRes = await fetch(`/api/v1/sales/${encodeURIComponent(salesId)}/notes`);
      if (notesRes.ok) {
        const json = await notesRes.json();
        setNotes(json.data || []);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Gagal menyimpan catatan');
    } finally {
      setSavingNote(false);
    }
  };

  // Handler: Pay Commission
  const handlePayCommission = async (commId: string) => {
    setPayingLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/v1/commission/entries/${encodeURIComponent(commId)}/pay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note: payNote || undefined }),
      });

      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error?.message || 'Gagal memproses pembayaran komisi');
      }

      setPayingCommissionId(null);
      setPayNote('');
      loadData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Gagal membayar komisi');
    } finally {
      setPayingLoading(false);
    }
  };

  if (loadingUser || loadingAll) {
    return (
      <div className="p-6 max-w-7xl mx-auto space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-24 w-full" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
        </div>
      </div>
    );
  }

  // Zero-Leakage Guard
  if (userRole !== 'SUPERADMIN') {
    return (
      <div className="p-6 max-w-2xl mx-auto mt-12">
        <div className="bg-red-50 border border-red-200 rounded-xl p-8 text-center text-red-800 space-y-4">
          <ShieldAlert className="w-16 h-16 text-red-600 mx-auto" />
          <h2 className="text-xl font-bold">Akses Ditolak (Super Admin Only)</h2>
          <p className="text-sm text-red-700">
            Hanya pemilik usaha yang berhak mengevaluasi staf sales, mengatur target, dan menulis catatan pemilik rahasia.
          </p>
          <Link
            href="/dashboard"
            className="inline-block px-4 py-2 bg-red-600 text-white font-medium rounded-lg hover:bg-red-700 transition"
          >
            Kembali
          </Link>
        </div>
      </div>
    );
  }

  const p = performanceData;
  const commSummary = commissionReport?.summary;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-8">
      {/* Back button & Header */}
      <div>
        <Link
          href="/sales"
          className="inline-flex items-center gap-1.5 text-sm text-indigo-600 hover:text-indigo-800 font-medium mb-3 transition"
        >
          <ArrowLeft className="w-4 h-4" />
          Kembali ke Daftar Kinerja Sales
        </Link>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">
              {salesInfo?.name || p?.salesName || 'Staf Sales'}
            </h1>
            <p className="text-sm text-slate-500">
              Username: @{salesInfo?.username || p?.username || '-'} &bull; Evaluasi & Target Kinerja
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 bg-slate-50 px-3 py-1.5 border border-slate-200 rounded-lg">
              <Calendar className="w-4 h-4 text-slate-400" />
              <span className="text-xs font-medium text-slate-500">Periode:</span>
              <input
                type="month"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="text-sm font-semibold text-slate-800 bg-transparent focus:outline-none"
              />
            </div>
            <button
              type="button"
              onClick={loadData}
              className="p-2 border border-slate-200 rounded-lg hover:bg-slate-50 transition"
              title="Muat Ulang Data"
            >
              <RefreshCw className="w-4 h-4 text-slate-600" />
            </button>
          </div>
        </div>
      </div>

      {error && (
        <ErrorState
          title="Terjadi Kesalahan"
          message={error}
          onRetry={loadData}
        />
      )}

      {/* Peringatan Seksi 18.1 nomor 35: Komisi Perlu Dikembalikan */}
      {commSummary && commSummary.needsReturnCount > 0 && (
        <div className="bg-red-50 border-2 border-red-300 rounded-xl p-4 flex items-start gap-3 shadow-sm">
          <AlertTriangle className="w-6 h-6 text-red-600 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h3 className="font-bold text-red-900">
              Perhatian: {commSummary.needsReturnCount} Komisi Perlu Dikembalikan!
            </h3>
            <p className="text-sm text-red-700">
              Total senilai{' '}
              <strong className="underline">
                {formatRupiah(commSummary.totalNeedsReturn)}
              </strong>{' '}
              telah dibayarkan kepada staf ini, namun pesanannya dibatalkan atau diretur di kemudian hari (Seksi 18.1 nomor 35). Harap lakukan penagihan manual atau penyesuaian komisi berikutnya.
            </p>
          </div>
        </div>
      )}

      {/* Grid: 1. Target Bulanan & 2. Metrik Performa */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Kolom 1: Atur Target Bulanan */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-5">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Target className="w-5 h-5 text-indigo-600" />
              Target {selectedMonth}
            </h2>
            <span className="text-xs font-semibold px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded">
              Super Admin
            </span>
          </div>

          <form onSubmit={handleSaveTarget} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                Target Omzet (Revenue)
              </label>
              <MoneyInput
                value={targetRevenueInput}
                onChange={setTargetRevenueInput}
                placeholder="Rp 0"
              />
              <span className="text-xs text-slate-400 mt-0.5 block">
                Target nominal omzet penjualan bersih
              </span>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                Target Profit Usaha
              </label>
              <MoneyInput
                value={targetProfitInput}
                onChange={setTargetProfitInput}
                placeholder="Rp 0"
              />
              <span className="text-xs text-slate-400 mt-0.5 block">
                Target laba kotor setelah HPP & ongkir riil
              </span>
            </div>

            {targetSuccessMessage && (
              <div className="p-2.5 bg-emerald-50 text-emerald-800 text-xs font-medium rounded-lg flex items-center gap-2 border border-emerald-200">
                <Check className="w-4 h-4 text-emerald-600" />
                {targetSuccessMessage}
              </div>
            )}

            <button
              type="submit"
              disabled={savingTarget}
              className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-sm rounded-lg shadow-sm transition disabled:opacity-50"
            >
              {savingTarget ? 'Menyimpan...' : 'Simpan Target Bulanan'}
            </button>
          </form>

          {/* Status Capaian Target */}
          {p && p.targetRevenue !== null && p.targetRevenue > 0 && (
            <div className="mt-4 pt-4 border-t border-slate-100 space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-slate-500 font-medium">Progres Capaian:</span>
                <span className="font-bold text-slate-900">{p.achievementPercent}%</span>
              </div>
              <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                <div
                  className={`h-full ${
                    (p.achievementPercent ?? 0) >= 100
                      ? 'bg-emerald-500'
                      : (p.achievementPercent ?? 0) >= 75
                      ? 'bg-indigo-500'
                      : 'bg-amber-500'
                  }`}
                  style={{ width: `${Math.min(p.achievementPercent ?? 0, 100)}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Kolom 2 & 3: Metrik Kinerja Detail */}
        <div className="lg:col-span-2 bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-6">
          <div className="border-b border-slate-100 pb-3 flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-emerald-600" />
              Metrik Performa Riil ({selectedMonth})
            </h2>
            <span className="text-xs text-slate-400">Zero-Leakage (Owner Only)</span>
          </div>

          {p ? (
            <div className="space-y-6">
              {/* Baris Ringkasan Omzet & Profit */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="p-4 bg-slate-50 rounded-lg border border-slate-200/80">
                  <span className="text-xs font-medium text-slate-500 uppercase">Omzet Riil</span>
                  <p className="text-xl font-bold text-emerald-700 mt-1">
                    {formatRupiah(p.revenue)}
                  </p>
                  <span className="text-xs text-slate-400">{p.orderCount} order disetujui</span>
                </div>

                <div className="p-4 bg-slate-50 rounded-lg border border-slate-200/80">
                  <span className="text-xs font-medium text-slate-500 uppercase">Profit Usaha</span>
                  <p className="text-xl font-bold text-indigo-700 mt-1">
                    {formatRupiah(p.profit)}
                  </p>
                  <span className="text-xs text-slate-500 font-medium">
                    Margin: {formatPercentFromBps(p.marginBps)}
                  </span>
                </div>

                <div className="p-4 bg-slate-50 rounded-lg border border-slate-200/80">
                  <span className="text-xs font-medium text-slate-500 uppercase">Order Ditolak</span>
                  <p className="text-xl font-bold text-red-600 mt-1">
                    {p.rejectedOrderCount} Order
                  </p>
                  <span className="text-xs text-red-500">
                    Rasio tolak/batal: {p.rejectedPercent}%
                  </span>
                </div>
              </div>

              {/* Pipeline Pelanggan & Konversi */}
              <div className="p-4 bg-indigo-50/50 rounded-lg border border-indigo-100 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-indigo-900 uppercase tracking-wider">
                    Pipeline Pelanggan & Konversi Prospek
                  </span>
                  <span className="text-xs font-bold px-2 py-0.5 bg-indigo-100 text-indigo-800 rounded">
                    Tingkat Konversi: {p.pipelineConversionPercent}%
                  </span>
                </div>

                <div className="grid grid-cols-5 gap-2 text-center text-xs">
                  <div className="bg-white p-2 rounded border border-slate-200">
                    <span className="text-slate-400 block">Lead</span>
                    <strong className="text-slate-800 text-sm">
                      {p.pipelineBreakdown.lead}
                    </strong>
                  </div>
                  <div className="bg-white p-2 rounded border border-slate-200">
                    <span className="text-slate-400 block">Prospect</span>
                    <strong className="text-slate-800 text-sm">
                      {p.pipelineBreakdown.prospect}
                    </strong>
                  </div>
                  <div className="bg-white p-2 rounded border border-emerald-200 bg-emerald-50/30">
                    <span className="text-emerald-700 block font-medium">Deal</span>
                    <strong className="text-emerald-800 text-sm">
                      {p.pipelineBreakdown.deal}
                    </strong>
                  </div>
                  <div className="bg-white p-2 rounded border border-indigo-200 bg-indigo-50/30">
                    <span className="text-indigo-700 block font-medium">Repeat</span>
                    <strong className="text-indigo-800 text-sm">
                      {p.pipelineBreakdown.repeat}
                    </strong>
                  </div>
                  <div className="bg-white p-2 rounded border border-red-200 bg-red-50/30">
                    <span className="text-red-700 block font-medium">Lost</span>
                    <strong className="text-red-800 text-sm">
                      {p.pipelineBreakdown.lost}
                    </strong>
                  </div>
                </div>
              </div>

              {/* Aktivitas CRM */}
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="p-3 bg-slate-50 rounded border border-slate-200 flex items-center justify-between">
                  <span className="text-slate-600">Total Follow-up / CRM Interaction:</span>
                  <strong className="text-slate-900">{p.crmFollowUpCount} kali</strong>
                </div>
                <div className="p-3 bg-slate-50 rounded border border-slate-200 flex items-center justify-between">
                  <span className="text-slate-600">Reminder CRM Aktif:</span>
                  <strong className="text-slate-900">{p.activeRemindersCount} pengingat</strong>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-sm text-slate-400">Belum ada metrik kinerja tercatat.</p>
          )}
        </div>
      </div>

      {/* Section 3: Catatan Rahasia Pemilik Usaha (OwnerSalesNote) */}
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-6">
        <div className="border-b border-slate-100 pb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Lock className="w-5 h-5 text-amber-600" />
              Catatan Rahasia Pemilik Usaha (OwnerSalesNote)
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Catatan evaluasi kualitatif internal pemilik. Tidak dapat dilihat oleh staf sales (Zero-Leakage).
            </p>
          </div>
          <span className="text-xs font-bold px-2.5 py-1 bg-amber-100 text-amber-900 rounded-full flex items-center gap-1.5 self-start sm:self-auto">
            <Lock className="w-3.5 h-3.5" />
            100% Rahasia
          </span>
        </div>

        {/* Form Tambah Catatan */}
        <form onSubmit={handleSaveNote} className="space-y-3">
          <textarea
            rows={3}
            value={newNote}
            onChange={(e) => setNewNote(e.target.value)}
            placeholder="Tulis evaluasi rahasia untuk staf ini (contoh: disiplin follow-up tinggi, perlu ditingkatkan margin negosiasi harga)..."
            className="w-full p-3 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 resize-y"
          />

          {noteSuccessMessage && (
            <div className="p-2.5 bg-emerald-50 text-emerald-800 text-xs font-medium rounded-lg flex items-center gap-2 border border-emerald-200">
              <Check className="w-4 h-4 text-emerald-600" />
              {noteSuccessMessage}
            </div>
          )}

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={savingNote || !newNote.trim()}
              className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white font-medium text-sm rounded-lg shadow-sm transition disabled:opacity-50 flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              {savingNote ? 'Menyimpan...' : 'Tambah Catatan Rahasia'}
            </button>
          </div>
        </form>

        {/* Daftar Catatan Pemilik */}
        <div className="space-y-3">
          <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
            Riwayat Catatan Pemilik ({notes.length})
          </h3>

          {notes.length === 0 ? (
            <div className="p-6 text-center text-slate-400 bg-slate-50 rounded-lg border border-dashed border-slate-200">
              <MessageSquare className="w-8 h-8 text-slate-300 mx-auto mb-2" />
              <p className="text-sm">Belum ada catatan rahasia pemilik untuk staf sales ini.</p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {notes.map((n) => (
                <div
                  key={n.id}
                  className="p-4 bg-amber-50/40 rounded-lg border border-amber-200/70 text-sm space-y-1"
                >
                  <div className="flex items-center justify-between text-xs text-amber-900 font-semibold">
                    <span>{n.authorName || 'Super Admin'}</span>
                    <span className="text-slate-400 font-normal">
                      {n.createdAt ? new Date(n.createdAt).toLocaleString('id-ID') : '-'}
                    </span>
                  </div>
                  <p className="text-slate-800 whitespace-pre-wrap leading-relaxed">
                    {n.note}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Section 4: Laporan & Pembayaran Komisi */}
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-6">
        <div className="border-b border-slate-100 pb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-emerald-600" />
              Laporan & Pembayaran Komisi Staf Sales
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Seksi 7.6 & 18.1 nomor 35: Pembayaran komisi dan deteksi komisi yang perlu dikembalikan.
            </p>
          </div>

          {commSummary && (
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="px-2.5 py-1 bg-amber-50 text-amber-800 border border-amber-200 rounded-md font-medium">
                Diperoleh: {formatRupiah(commSummary.totalEarned)}
              </span>
              <span className="px-2.5 py-1 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-md font-medium">
                Dibayar: {formatRupiah(commSummary.totalPaid)}
              </span>
              <span className="px-2.5 py-1 bg-slate-100 text-slate-700 rounded-md font-medium">
                Dibatalkan: {formatRupiah(commSummary.totalReversed)}
              </span>
            </div>
          )}
        </div>

        {/* Tabel Komisi */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-600">
            <thead className="bg-slate-50 text-slate-700 text-xs uppercase font-semibold border-b border-slate-200">
              <tr>
                <th className="px-4 py-3">No. Order / Pelanggan</th>
                <th className="px-4 py-3">Dasar & Rate</th>
                <th className="px-4 py-3">Nominal Komisi</th>
                <th className="px-4 py-3">Status Komisi</th>
                <th className="px-4 py-3">Waktu Diperoleh / Dibayar</th>
                <th className="px-4 py-3 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(commissionReport?.data || []).length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                    Tidak ada riwayat komisi untuk staf sales ini.
                  </td>
                </tr>
              ) : (
                commissionReport?.data.map((c: CommissionReportEntryDto) => (
                  <tr
                    key={c.id}
                    className={`hover:bg-slate-50/80 transition ${
                      c.needsReturn ? 'bg-red-50/50' : ''
                    }`}
                  >
                    <td className="px-4 py-3.5">
                      <div className="font-semibold text-slate-900">{c.orderNo}</div>
                      <div className="text-xs text-slate-500">{c.customerName}</div>
                    </td>

                    <td className="px-4 py-3.5 text-xs">
                      <div className="text-slate-800 font-medium">
                        Basis: {formatRupiah(c.basisAmount)}
                      </div>
                      <div className="text-slate-400">
                        Rate: {formatPercentFromBps(c.rateBps)} ({c.mode})
                      </div>
                    </td>

                    <td className="px-4 py-3.5">
                      <strong className="text-slate-900 text-sm">
                        {formatRupiah(c.amount)}
                      </strong>
                    </td>

                    <td className="px-4 py-3.5">
                      <div className="flex flex-col items-start gap-1">
                        {c.status === 'EARNED' && (
                          <span className="text-xs font-semibold px-2 py-0.5 rounded bg-amber-100 text-amber-800">
                            EARNED (Belum Dibayar)
                          </span>
                        )}
                        {c.status === 'PAID' && (
                          <span className="text-xs font-semibold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800">
                            PAID (Lunas)
                          </span>
                        )}
                        {c.status === 'REVERSED' && (
                          <span className="text-xs font-semibold px-2 py-0.5 rounded bg-slate-200 text-slate-700">
                            REVERSED (Dibatalkan)
                          </span>
                        )}

                        {/* Indikator Seksi 18.1 nomor 35: Perlu Dikembalikan */}
                        {c.needsReturn && (
                          <span className="text-xs font-bold px-2 py-0.5 rounded bg-red-600 text-white flex items-center gap-1 shadow-sm">
                            <AlertTriangle className="w-3 h-3" />
                            Perlu Dikembalikan
                          </span>
                        )}
                      </div>
                    </td>

                    <td className="px-4 py-3.5 text-xs text-slate-500">
                      <div>Diperoleh: {formatDateId(c.earnedAt, 'compact')}</div>
                      {c.paidAt && (
                        <div className="text-emerald-700 font-medium">
                          Dibayar: {formatDateId(c.paidAt, 'compact')}
                        </div>
                      )}
                      {c.reversedAt && (
                        <div className="text-red-600 font-medium">
                          Batal: {formatDateId(c.reversedAt, 'compact')}
                        </div>
                      )}
                    </td>

                    <td className="px-4 py-3.5 text-right">
                      {c.status === 'EARNED' && (
                        <button
                          type="button"
                          onClick={() => setPayingCommissionId(c.id)}
                          className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium rounded-lg shadow-sm transition"
                        >
                          Bayar Komisi
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Dialog Bayar Komisi */}
      {payingCommissionId && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 space-y-4">
            <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <CreditCard className="w-5 h-5 text-emerald-600" />
              Konfirmasi Pembayaran Komisi
            </h3>
            <p className="text-sm text-slate-600">
              Apakah Anda yakin ingin menandai entri komisi ini telah dibayarkan kepada staf sales?
            </p>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Catatan Pembayaran (Opsional)
              </label>
              <input
                type="text"
                value={payNote}
                onChange={(e) => setPayNote(e.target.value)}
                placeholder="Contoh: Transfer BCA no ref 12345"
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setPayingCommissionId(null)}
                disabled={payingLoading}
                className="px-4 py-2 border border-slate-200 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50 transition"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => handlePayCommission(payingCommissionId)}
                disabled={payingLoading}
                className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 shadow-sm transition disabled:opacity-50"
              >
                {payingLoading ? 'Memproses...' : 'Tandai Telah Dibayar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
