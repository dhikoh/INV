'use client';

import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import {
  Users,
  RefreshCw,
  Search,
  ChevronRight,
  ShieldAlert,
} from 'lucide-react';
import { Skeleton, ErrorState } from '@/components/ui/States';
import { formatRupiah, formatPercentFromBps } from '@/lib/domain/money';
import {
  SalesPerformanceReportResult,
  SalesPerformanceItem,
} from '@/lib/services/salesEvaluation';

export default function SalesEvaluationListPage() {
  const [userRole, setUserRole] = useState<string | null>(null);
  const [loadingUser, setLoadingUser] = useState(true);
  const [loadingReport, setLoadingReport] = useState(false);
  const [report, setReport] = useState<SalesPerformanceReportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Filter
  const now = new Date();
  const currentMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const [selectedMonth, setSelectedMonth] = useState<string>(currentMonthStr);
  const [searchTerm, setSearchTerm] = useState<string>('');

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
        setError('Gagal memverifikasi hak akses');
      } finally {
        setLoadingUser(false);
      }
    }
    initUser();
  }, []);

  // 2. Fetch Performance Report
  const fetchReport = useCallback(async () => {
    if (userRole !== 'SUPERADMIN') return;
    setLoadingReport(true);
    setError(null);

    try {
      const res = await fetch(
        `/api/v1/reports/sales-performance?month=${encodeURIComponent(selectedMonth)}`
      );
      if (!res.ok) {
        const errJson = await res.json();
        setError(
          errJson.error?.message || 'Gagal mengambil data evaluasi kinerja sales'
        );
        return;
      }
      const json = await res.json();
      setReport(json.data);
    } catch {
      setError('Koneksi terputus saat mengambil data kinerja sales');
    } finally {
      setLoadingReport(false);
    }
  }, [selectedMonth, userRole]);

  useEffect(() => {
    if (!loadingUser && userRole === 'SUPERADMIN') {
      fetchReport();
    }
  }, [loadingUser, userRole, fetchReport]);

  if (loadingUser) {
    return (
      <div className="p-6 max-w-7xl mx-auto space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
        </div>
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  // Zero-Leakage Guard
  if (userRole !== 'SUPERADMIN') {
    return (
      <div className="p-6 max-w-2xl mx-auto mt-12">
        <div className="bg-red-50 border border-red-200 rounded-xl p-8 text-center text-red-800 space-y-4">
          <ShieldAlert className="w-16 h-16 text-red-600 mx-auto" />
          <h2 className="text-xl font-bold">Akses Terbatas: Super Admin Only</h2>
          <p className="text-sm text-red-700">
            Halaman Evaluasi Kinerja Sales, Target Omzet/Profit, dan Catatan
            Pemilik Usaha bersifat rahasia dan hanya dapat diakses oleh pemilik usaha (Super Admin).
          </p>
          <div>
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-2 px-4 py-2 bg-red-600 text-white font-medium rounded-lg hover:bg-red-700 transition"
            >
              Kembali ke Beranda
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const items = (report?.items || []).filter((item) => {
    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase();
    return (
      item.salesName.toLowerCase().includes(term) ||
      item.username.toLowerCase().includes(term)
    );
  });

  const summary = report?.summary;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header & Filter */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Users className="w-7 h-7 text-indigo-600" />
            Evaluasi Kinerja Staf Sales
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Pantau target omzet, profit riil, konversi prospek, dan evaluasi rahasia per staf sales.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 bg-white px-3 py-1.5 border border-slate-200 rounded-lg shadow-sm">
            <span className="text-xs font-medium text-slate-500">Bulan:</span>
            <input
              type="month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="text-sm text-slate-800 font-semibold focus:outline-none bg-transparent"
            />
          </div>

          <button
            type="button"
            onClick={fetchReport}
            disabled={loadingReport}
            className="flex items-center gap-2 px-3 py-2 bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 rounded-lg text-sm font-medium shadow-sm transition disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loadingReport ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <ErrorState
          title="Terjadi Kesalahan"
          message={error}
          onRetry={fetchReport}
        />
      )}

      {/* Ringkasan Eksekutif */}
      {summary && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-1">
            <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">
              Staf Sales Aktif
            </span>
            <p className="text-2xl font-bold text-slate-900">
              {summary.totalSalesCount} Orang
            </p>
            <span className="text-xs text-slate-400">Terdaftar di unit usaha</span>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-1">
            <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">
              Total Omzet Sales
            </span>
            <p className="text-2xl font-bold text-emerald-600">
              {formatRupiah(summary.totalRevenue)}
            </p>
            <span className="text-xs text-slate-400">Order disetujui / lunas</span>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-1">
            <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">
              Profit Riil Usaha
            </span>
            <p className="text-2xl font-bold text-indigo-600">
              {formatRupiah(summary.totalProfit)}
            </p>
            <span className="text-xs text-slate-500 font-medium">
              Margin: {formatPercentFromBps(summary.averageMarginBps)}
            </span>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-1">
            <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">
              Total Pesanan Deal
            </span>
            <p className="text-2xl font-bold text-slate-900">
              {summary.totalOrderCount} Pesanan
            </p>
            <span className="text-xs text-slate-400">Bulan {selectedMonth}</span>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-1">
            <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">
              Komisi Diperoleh
            </span>
            <p className="text-2xl font-bold text-amber-600">
              {formatRupiah(summary.totalEarnedCommission)}
            </p>
            <span className="text-xs text-slate-400">Hak komisi staf sales</span>
          </div>
        </div>
      )}

      {/* Daftar Tabel Staf Sales */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Cari staf sales berdasarkan nama / username..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <span className="text-xs text-slate-500 font-medium">
            Menampilkan {items.length} staf sales
          </span>
        </div>

        {loadingReport ? (
          <div className="p-8 space-y-4">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : items.length === 0 ? (
          <div className="p-12 text-center text-slate-500 space-y-2">
            <Users className="w-12 h-12 text-slate-300 mx-auto" />
            <p className="font-semibold text-slate-700">Tidak ada staf sales ditemukan</p>
            <p className="text-sm text-slate-400">
              Belum ada data staf sales aktif pada unit usaha ini.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-600">
              <thead className="bg-slate-50 text-slate-700 text-xs uppercase font-semibold border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3">Staf Sales</th>
                  <th className="px-4 py-3">Target Omzet</th>
                  <th className="px-4 py-3">Capaian Omzet</th>
                  <th className="px-4 py-3">Profit & Margin</th>
                  <th className="px-4 py-3">Deal / Konversi</th>
                  <th className="px-4 py-3">Ditolak / Batal</th>
                  <th className="px-4 py-3">Komisi</th>
                  <th className="px-4 py-3 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((s: SalesPerformanceItem) => (
                  <tr key={s.salesId} className="hover:bg-slate-50/80 transition">
                    <td className="px-4 py-3.5">
                      <div className="font-semibold text-slate-900">{s.salesName}</div>
                      <div className="text-xs text-slate-400">@{s.username}</div>
                    </td>

                    <td className="px-4 py-3.5">
                      {s.targetRevenue !== null && s.targetRevenue > 0 ? (
                        <div>
                          <div className="font-medium text-slate-800">
                            {formatRupiah(s.targetRevenue)}
                          </div>
                          <div className="text-xs text-slate-400">
                            Profit: {formatRupiah(s.targetProfit ?? 0)}
                          </div>
                        </div>
                      ) : (
                        <span className="text-xs font-medium text-amber-600 bg-amber-50 px-2 py-0.5 rounded">
                          Belum Diatur
                        </span>
                      )}
                    </td>

                    <td className="px-4 py-3.5">
                      <div className="font-semibold text-emerald-700">
                        {formatRupiah(s.revenue)}
                      </div>
                      {s.achievementPercent !== null ? (
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <div className="w-16 bg-slate-200 h-1.5 rounded-full overflow-hidden">
                            <div
                              className={`h-full ${
                                s.achievementPercent >= 100
                                  ? 'bg-emerald-500'
                                  : s.achievementPercent >= 75
                                  ? 'bg-indigo-500'
                                  : 'bg-amber-500'
                              }`}
                              style={{
                                width: `${Math.min(s.achievementPercent, 100)}%`,
                              }}
                            />
                          </div>
                          <span className="text-xs font-semibold text-slate-700">
                            {s.achievementPercent}%
                          </span>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400">-</span>
                      )}
                    </td>

                    <td className="px-4 py-3.5">
                      <div className="font-semibold text-indigo-700">
                        {formatRupiah(s.profit)}
                      </div>
                      <div className="text-xs text-slate-500">
                        Margin: {formatPercentFromBps(s.marginBps)}
                      </div>
                    </td>

                    <td className="px-4 py-3.5">
                      <div className="font-medium text-slate-800">
                        {s.orderCount} Deal
                      </div>
                      <div className="text-xs text-slate-500">
                        Konversi: {s.pipelineConversionPercent}% ({s.totalCustomers} customer)
                      </div>
                    </td>

                    <td className="px-4 py-3.5">
                      {s.rejectedOrderCount > 0 ? (
                        <div>
                          <span className="text-xs font-semibold text-red-600 bg-red-50 px-2 py-0.5 rounded">
                            {s.rejectedOrderCount} Order ({s.rejectedPercent}%)
                          </span>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400">0 Ditolak</span>
                      )}
                    </td>

                    <td className="px-4 py-3.5">
                      <div className="font-medium text-amber-700">
                        {formatRupiah(s.earnedCommission)}
                      </div>
                      <div className="text-xs text-slate-400">
                        Dibayar: {formatRupiah(s.paidCommission)}
                      </div>
                    </td>

                    <td className="px-4 py-3.5 text-right">
                      <Link
                        href={`/sales/${s.salesId}?month=${selectedMonth}`}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 font-medium text-xs rounded-lg transition"
                      >
                        Detail & Evaluasi
                        <ChevronRight className="w-3.5 h-3.5" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
