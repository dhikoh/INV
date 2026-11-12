'use client';

import React, { useEffect, useState, useCallback } from 'react';
import {
  Users,
  Calendar,
  RefreshCw,
  FileSpreadsheet,
  FileText,
} from 'lucide-react';
import { Skeleton, ErrorState } from '@/components/ui/States';
import { CrmReportResult, CrmActivityItemDto } from '@/lib/services/reportCrm';
import { formatDateId } from '@/lib/format/date';

export default function CrmReportPage() {
  const [userRole, setUserRole] = useState<string | null>(null);
  const [loadingUser, setLoadingUser] = useState(true);
  const [loadingReport, setLoadingReport] = useState(false);
  const [report, setReport] = useState<CrmReportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const now = new Date();
  const currentMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const [selectedMonth, setSelectedMonth] = useState<string>(currentMonthStr);
  const [salesList, setSalesList] = useState<Array<{ id: string; name: string }>>([]);
  const [selectedSalesId, setSelectedSalesId] = useState<string>('');

  // 1. Initial User & Sales List
  useEffect(() => {
    async function initUser() {
      try {
        const meRes = await fetch('/api/v1/auth/me');
        if (meRes.ok) {
          const json = await meRes.json();
          const role = json.data?.user?.role;
          setUserRole(role);

          if (role === 'SUPERADMIN') {
            const usersRes = await fetch('/api/v1/users');
            if (usersRes.ok) {
              const usersJson = await usersRes.json();
              const sales = (usersJson.data || []).filter((u: { role: string }) => u.role === 'SALES');
              setSalesList(sales);
            }
          }
        }
      } catch {
        setError('Gagal memverifikasi akun pengguna');
      } finally {
        setLoadingUser(false);
      }
    }
    initUser();
  }, []);

  // 2. Fetch CRM Report
  const fetchReport = useCallback(async () => {
    setLoadingReport(true);
    setError(null);

    const params = new URLSearchParams();
    if (selectedMonth) params.set('month', selectedMonth);
    if (selectedSalesId && userRole === 'SUPERADMIN') params.set('salesId', selectedSalesId);

    try {
      const res = await fetch(`/api/v1/reports/crm?${params.toString()}`);
      if (!res.ok) {
        const errJson = await res.json();
        setError(errJson.error?.message || 'Gagal mengambil data laporan CRM');
        return;
      }
      const json = await res.json();
      setReport(json.data);
    } catch {
      setError('Koneksi terputus saat mengambil data laporan CRM');
    } finally {
      setLoadingReport(false);
    }
  }, [selectedMonth, selectedSalesId, userRole]);

  useEffect(() => {
    if (!loadingUser) {
      fetchReport();
    }
  }, [loadingUser, fetchReport]);

  const handleExport = (format: 'xlsx' | 'pdf') => {
    const params = new URLSearchParams();
    params.set('type', 'crm');
    params.set('format', format);
    if (selectedMonth) params.set('month', selectedMonth);
    if (selectedSalesId && userRole === 'SUPERADMIN') params.set('salesId', selectedSalesId);

    window.open(`/api/v1/reports/export?${params.toString()}`, '_blank');
  };

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

  const s = report?.summary;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header & Filter */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Users className="w-7 h-7 text-indigo-600" />
            Laporan CRM & Aktivitas Pipeline
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Pantau pergerakan prospek pelanggan, aktivitas interaksi, dan follow-up tugas.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Month selector */}
          <div className="flex items-center gap-2 bg-white px-3 py-1.5 border border-slate-200 rounded-lg shadow-sm">
            <Calendar className="w-4 h-4 text-slate-400" />
            <span className="text-xs font-medium text-slate-500">Bulan:</span>
            <input
              type="month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="text-sm text-slate-800 font-semibold focus:outline-none bg-transparent"
            />
          </div>

          {/* Sales filter (Super Admin only) */}
          {userRole === 'SUPERADMIN' && (
            <select
              value={selectedSalesId}
              onChange={(e) => setSelectedSalesId(e.target.value)}
              aria-label="Filter Staf Sales"
              className="px-3 py-2 bg-white border border-slate-200 text-slate-700 text-sm font-medium rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">Semua Staf Sales</option>
              {salesList.map((sales) => (
                <option key={sales.id} value={sales.id}>
                  {sales.name}
                </option>
              ))}
            </select>
          )}

          {/* Refresh button */}
          <button
            type="button"
            onClick={fetchReport}
            disabled={loadingReport}
            className="flex items-center gap-2 px-3 py-2 bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 rounded-lg text-sm font-medium shadow-sm transition disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loadingReport ? 'animate-spin' : ''}`} />
            Refresh
          </button>

          {/* Export buttons */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => handleExport('xlsx')}
              className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium shadow-sm transition"
              title="Ekspor ke Excel (XLSX) dengan Proteksi Formula"
            >
              <FileSpreadsheet className="w-4 h-4" />
              Excel
            </button>
            <button
              type="button"
              onClick={() => handleExport('pdf')}
              className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-sm font-medium shadow-sm transition"
              title="Ekspor ke Dokumen PDF"
            >
              <FileText className="w-4 h-4" />
              PDF
            </button>
          </div>
        </div>
      </div>

      {error && (
        <ErrorState
          title="Terjadi Kesalahan"
          message={error}
          onRetry={fetchReport}
        />
      )}

      {/* KPI Cards */}
      {s && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-1">
            <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">
              Total Pelanggan Dikelola
            </span>
            <p className="text-2xl font-bold text-slate-900">
              {s.totalCustomers} Pelanggan
            </p>
            <span className="text-xs text-slate-400">Database pelanggan aktif</span>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-1">
            <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">
              Tingkat Konversi Deal
            </span>
            <p className="text-2xl font-bold text-emerald-600">
              {s.conversionPercent}%
            </p>
            <span className="text-xs text-slate-400">Pelanggan deal + repeat</span>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-1">
            <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">
              Interaksi CRM ({selectedMonth})
            </span>
            <p className="text-2xl font-bold text-indigo-600">
              {s.interactions.total} Kali
            </p>
            <span className="text-xs text-slate-400">
              WA: {s.interactions.whatsapp} &bull; Call: {s.interactions.call} &bull; Visit: {s.interactions.visit}
            </span>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-1">
            <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">
              Tugas Follow-up CRM
            </span>
            <p className="text-2xl font-bold text-amber-600">
              {s.tasks.completed} Selesai
            </p>
            <span className="text-xs text-slate-400">
              Pending: {s.tasks.pending} dari {s.tasks.total} tugas
            </span>
          </div>
        </div>
      )}

      {/* Visualisasi Pipeline Pelanggan */}
      {s && (
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h2 className="text-base font-bold text-slate-900">
              Tahapan Pipeline Pelanggan
            </h2>
            <span className="text-xs font-semibold px-2.5 py-1 bg-indigo-50 text-indigo-700 rounded-full">
              Konversi: {s.conversionPercent}%
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
            <div className="p-4 bg-slate-50 rounded-lg border border-slate-200 text-center space-y-1">
              <span className="text-xs font-medium text-slate-500 uppercase">1. Lead</span>
              <p className="text-2xl font-bold text-slate-800">{s.pipeline.lead}</p>
              <span className="text-xs text-slate-400">Kontak baru</span>
            </div>

            <div className="p-4 bg-blue-50/50 rounded-lg border border-blue-200 text-center space-y-1">
              <span className="text-xs font-medium text-blue-600 uppercase">2. Prospect</span>
              <p className="text-2xl font-bold text-blue-700">{s.pipeline.prospect}</p>
              <span className="text-xs text-blue-500">Negosiasi / follow-up</span>
            </div>

            <div className="p-4 bg-emerald-50 rounded-lg border border-emerald-200 text-center space-y-1">
              <span className="text-xs font-medium text-emerald-700 uppercase">3. Deal</span>
              <p className="text-2xl font-bold text-emerald-800">{s.pipeline.deal}</p>
              <span className="text-xs text-emerald-600">Closing order perdana</span>
            </div>

            <div className="p-4 bg-indigo-50 rounded-lg border border-indigo-200 text-center space-y-1">
              <span className="text-xs font-medium text-indigo-700 uppercase">4. Repeat</span>
              <p className="text-2xl font-bold text-indigo-800">{s.pipeline.repeat}</p>
              <span className="text-xs text-indigo-600">Langganan tetap</span>
            </div>

            <div className="p-4 bg-red-50 rounded-lg border border-red-200 text-center space-y-1">
              <span className="text-xs font-medium text-red-600 uppercase">5. Lost</span>
              <p className="text-2xl font-bold text-red-700">{s.pipeline.lost}</p>
              <span className="text-xs text-red-500">Tidak aktif / batal</span>
            </div>
          </div>
        </div>
      )}

      {/* Linimasa Aktivitas Terbaru */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-900">
            Aktivitas CRM Terkini ({report?.recentActivities.length || 0})
          </h2>
          <span className="text-xs text-slate-400 font-medium">
            Interaksi & Tugas Terjadwal
          </span>
        </div>

        {loadingReport ? (
          <div className="p-6 space-y-3">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : (report?.recentActivities || []).length === 0 ? (
          <div className="p-10 text-center text-slate-400 space-y-2">
            <Users className="w-10 h-10 text-slate-300 mx-auto" />
            <p className="font-semibold text-slate-700">Belum ada aktivitas CRM</p>
            <p className="text-xs text-slate-400">
              Belum tercatat interaksi atau tugas CRM pada periode bulan ini.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-600">
              <thead className="bg-slate-50 text-slate-700 text-xs uppercase font-semibold border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3">Waktu</th>
                  <th className="px-4 py-3">Jenis</th>
                  <th className="px-4 py-3">Tipe</th>
                  <th className="px-4 py-3">Pelanggan</th>
                  <th className="px-4 py-3">Staf Sales</th>
                  <th className="px-4 py-3">Ringkasan</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {report?.recentActivities.map((act: CrmActivityItemDto) => (
                  <tr key={act.id} className="hover:bg-slate-50/80 transition">
                    <td className="px-4 py-3.5 text-xs text-slate-500 whitespace-nowrap">
                      {formatDateId(act.date, 'shortPad')}
                    </td>

                    <td className="px-4 py-3.5">
                      <span
                        className={`text-xs font-semibold px-2 py-0.5 rounded ${
                          act.kind === 'INTERACTION'
                            ? 'bg-indigo-50 text-indigo-700'
                            : 'bg-amber-50 text-amber-700'
                        }`}
                      >
                        {act.kind}
                      </span>
                    </td>

                    <td className="px-4 py-3.5 text-xs font-medium text-slate-800">
                      {act.type}
                    </td>

                    <td className="px-4 py-3.5 font-medium text-slate-900">
                      {act.customerName}
                    </td>

                    <td className="px-4 py-3.5 text-xs text-slate-600">
                      {act.salesName}
                    </td>

                    <td className="px-4 py-3.5 text-xs text-slate-700 max-w-xs truncate">
                      {act.summary}
                    </td>

                    <td className="px-4 py-3.5 text-xs">
                      {act.status ? (
                        <span
                          className={`font-semibold px-2 py-0.5 rounded ${
                            act.status === 'COMPLETED'
                              ? 'bg-emerald-50 text-emerald-700'
                              : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {act.status}
                        </span>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
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
