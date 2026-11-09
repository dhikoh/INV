'use client';

import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import {
  TrendingUp,
  RefreshCw,
  AlertTriangle,
  ArrowUpRight,
  Package,
  Users,
  ShoppingCart,
  Building2,
  FileSpreadsheet,
  FileText,
} from 'lucide-react';
import { Skeleton, ErrorState } from '@/components/ui/States';
import { formatRupiah, formatPercentFromBps } from '@/lib/domain/money';
import {
  MarginReportResult,
  MarginReportSummary,
  MarginOrderRow,
  MarginProductRow,
  MarginSalesRow,
  MarginBusinessRow,
} from '@/lib/services/reportMargin';

type GroupByOption = 'order' | 'product' | 'sales' | 'business';

export default function MarginReportPage() {
  const [userRole, setUserRole] = useState<string | null>(null);
  const [loadingUser, setLoadingUser] = useState(true);
  const [loadingReport, setLoadingReport] = useState(false);
  const [reportData, setReportData] = useState<MarginReportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Filters state
  const [groupBy, setGroupBy] = useState<GroupByOption>('order');
  const [from, setFrom] = useState<string>('');
  const [to, setTo] = useState<string>('');
  const [salesList, setSalesList] = useState<Array<{ id: string; name: string }>>([]);
  const [selectedSalesId, setSelectedSalesId] = useState<string>('');

  // 1. Initial User & Sales List load
  useEffect(() => {
    async function initUserAndFilters() {
      try {
        const [meRes, usersRes] = await Promise.all([
          fetch('/api/v1/auth/me'),
          fetch('/api/v1/users'),
        ]);

        if (meRes.ok) {
          const meJson = await meRes.json();
          setUserRole(meJson.data.user.role);
        }

        if (usersRes.ok) {
          const usersJson = await usersRes.json();
          const sales = (usersJson.data || []).filter(
            (u: { role: string }) => u.role === 'SALES'
          );
          setSalesList(sales);
        }
      } catch {
        setError('Gagal memuat profil pengguna');
      } finally {
        setLoadingUser(false);
      }
    }

    initUserAndFilters();
  }, []);

  // 2. Fetch Report Function
  const fetchReport = useCallback(async () => {
    setLoadingReport(true);
    setError(null);

    const params = new URLSearchParams();
    params.set('groupBy', groupBy);
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    if (selectedSalesId) params.set('salesId', selectedSalesId);

    try {
      const res = await fetch(`/api/v1/reports/margin?${params.toString()}`);
      if (!res.ok) {
        const errJson = await res.json();
        setError(
          errJson.error?.message || 'Gagal mengambil data laporan margin'
        );
        return;
      }
      const json = await res.json();
      setReportData(json.data);
    } catch {
      setError('Koneksi terputus saat mengambil laporan margin');
    } finally {
      setLoadingReport(false);
    }
  }, [groupBy, from, to, selectedSalesId]);

  useEffect(() => {
    if (userRole === 'SUPERADMIN') {
      fetchReport();
    }
  }, [userRole, fetchReport]);

  // Date Quick Presets
  const setThisMonth = () => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    setFrom(`${y}-${m}-01`);
    const lastDay = new Date(y, now.getMonth() + 1, 0).getDate();
    setTo(`${y}-${m}-${String(lastDay).padStart(2, '0')}`);
  };

  const setLastMonth = () => {
    const now = new Date();
    const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const y = prevMonth.getFullYear();
    const m = String(prevMonth.getMonth() + 1).padStart(2, '0');
    setFrom(`${y}-${m}-01`);
    const lastDay = new Date(y, prevMonth.getMonth() + 1, 0).getDate();
    setTo(`${y}-${m}-${String(lastDay).padStart(2, '0')}`);
  };

  const clearDates = () => {
    setFrom('');
    setTo('');
  };

  if (loadingUser) {
    return (
      <div className="space-y-6 max-w-7xl mx-auto py-6">
        <Skeleton className="h-28 w-full rounded-2xl" />
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    );
  }

  // Access Control Guard: Super Admin Only (Zero-Leakage)
  if (userRole !== 'SUPERADMIN') {
    return (
      <div className="max-w-xl mx-auto py-12 px-4 text-center">
        <div className="bg-red-50 border border-red-200 rounded-2xl p-8">
          <div className="w-12 h-12 rounded-full bg-red-100 text-red-600 flex items-center justify-center mx-auto mb-4">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <h2 className="text-lg font-bold text-red-900 mb-2">
            Akses Ditolak (Super Admin Only)
          </h2>
          <p className="text-sm text-red-700 mb-6">
            Laporan margin, HPP, dan profitabilitas usaha bersifat rahasia pemilik usaha (Seksi 17.4 a). Staf sales tidak diizinkan mengakses data ini.
          </p>
          <Link
            href="/dashboard"
            className="inline-flex items-center justify-center px-4 py-2.5 bg-blue-600 text-white font-medium rounded-xl text-sm min-h-[44px]"
          >
            Kembali ke Dashboard
          </Link>
        </div>
      </div>
    );
  }

  const summary: MarginReportSummary | undefined = reportData?.summary;

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16">
      {/* 1. Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-blue-900 text-white rounded-2xl p-6 shadow-md">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider bg-white/20 text-blue-100">
                Rahasia Pemilik Usaha
              </span>
              <span className="text-xs text-blue-200">
                Laporan Profitabilitas & Analisis Margin
              </span>
            </div>
            <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight mt-2 flex items-center gap-2.5">
              <TrendingUp className="w-7 h-7 text-emerald-400" />
              Laporan Margin & Profit
            </h1>
            <p className="text-blue-100 text-sm mt-1">
              Evaluasi akurat pendapatan riil, HPP pokok, subsidi ongkir, biaya lain, dan kerugian pembatalan pesanan.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 self-start md:self-auto">
            <button
              type="button"
              onClick={fetchReport}
              disabled={loadingReport}
              className="px-4 py-2 bg-white/10 hover:bg-white/20 active:bg-white/30 rounded-xl transition flex items-center gap-2 border border-white/20 text-xs font-semibold text-white min-h-[44px]"
            >
              <RefreshCw
                className={`w-4 h-4 ${loadingReport ? 'animate-spin' : ''}`}
              />
              Perbarui Laporan
            </button>
            <button
              type="button"
              onClick={() => {
                const params = new URLSearchParams();
                params.set('type', 'margin');
                params.set('format', 'xlsx');
                params.set('groupBy', groupBy);
                if (from) params.set('from', from);
                if (to) params.set('to', to);
                if (selectedSalesId) params.set('salesId', selectedSalesId);
                window.open(`/api/v1/reports/export?${params.toString()}`, '_blank');
              }}
              className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold shadow-sm transition flex items-center gap-1.5 min-h-[44px]"
              title="Ekspor Laporan Margin ke Excel (XLSX)"
            >
              <FileSpreadsheet className="w-4 h-4" />
              Excel
            </button>
            <button
              type="button"
              onClick={() => {
                const params = new URLSearchParams();
                params.set('type', 'margin');
                params.set('format', 'pdf');
                params.set('groupBy', groupBy);
                if (from) params.set('from', from);
                if (to) params.set('to', to);
                if (selectedSalesId) params.set('salesId', selectedSalesId);
                window.open(`/api/v1/reports/export?${params.toString()}`, '_blank');
              }}
              className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-semibold shadow-sm transition flex items-center gap-1.5 min-h-[44px]"
              title="Ekspor Laporan Margin ke PDF"
            >
              <FileText className="w-4 h-4" />
              PDF
            </button>
          </div>
        </div>
      </div>

      {/* 2. Filter Bar */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          {/* GroupBy Tabs */}
          <div className="flex flex-wrap items-center gap-1.5 p-1 bg-slate-100 rounded-xl border border-slate-200">
            <button
              type="button"
              onClick={() => setGroupBy('order')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition min-h-[36px] flex items-center gap-1.5 ${
                groupBy === 'order'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <ShoppingCart className="w-3.5 h-3.5" />
              Per Order
            </button>
            <button
              type="button"
              onClick={() => setGroupBy('product')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition min-h-[36px] flex items-center gap-1.5 ${
                groupBy === 'product'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Package className="w-3.5 h-3.5" />
              Per Produk
            </button>
            <button
              type="button"
              onClick={() => setGroupBy('sales')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition min-h-[36px] flex items-center gap-1.5 ${
                groupBy === 'sales'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              Per Staf Sales
            </button>
            <button
              type="button"
              onClick={() => setGroupBy('business')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition min-h-[36px] flex items-center gap-1.5 ${
                groupBy === 'business'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Building2 className="w-3.5 h-3.5" />
              Ringkasan Usaha
            </button>
          </div>

          {/* Quick Presets */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={setThisMonth}
              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-medium transition min-h-[36px]"
            >
              Bulan Ini
            </button>
            <button
              type="button"
              onClick={setLastMonth}
              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-medium transition min-h-[36px]"
            >
              Bulan Lalu
            </button>
            {(from || to) && (
              <button
                type="button"
                onClick={clearDates}
                className="px-2.5 py-1.5 text-xs text-red-600 hover:underline min-h-[36px]"
              >
                Reset Tanggal
              </button>
            )}
          </div>
        </div>

        {/* Inputs Date & Sales Filter */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-3 border-t border-slate-100">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">
              Dari Tanggal (WIB)
            </label>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[44px]"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">
              Sampai Tanggal (WIB)
            </label>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[44px]"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">
              Filter Staf Sales (Opsional)
            </label>
            <select
              value={selectedSalesId}
              onChange={(e) => setSelectedSalesId(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[44px]"
            >
              <option value="">Semua Staf Sales</option>
              {salesList.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <ErrorState
          title="Gagal Mengambil Laporan"
          message={error}
          onRetry={fetchReport}
        />
      )}

      {/* 3. Summary Cards */}
      {summary && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Omzet Bersih */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
              <div>
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">
                  Total Omzet Bersih
                </span>
                <div className="text-2xl font-black text-slate-900 mt-1">
                  {formatRupiah(summary.revenue)}
                </div>
              </div>
              <div className="mt-3 pt-2.5 border-t border-slate-100 text-xs text-slate-500 flex justify-between">
                <span>Barang: {formatRupiah(summary.goodsRevenue)}</span>
                <span>Ongkir: {formatRupiah(summary.shippingCharge)}</span>
              </div>
            </div>

            {/* Total HPP */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
              <div>
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">
                  Total HPP (Modal Barang)
                </span>
                <div className="text-2xl font-black text-slate-700 mt-1">
                  {formatRupiah(summary.cogs)}
                </div>
              </div>
              <div className="mt-3 pt-2.5 border-t border-slate-100 text-xs text-slate-500">
                Modal barang terjual setelah retur
              </div>
            </div>

            {/* Total Laba Bersih */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
              <div>
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">
                  Laba Bersih Usaha (Net Profit)
                </span>
                <div className={`text-2xl font-black mt-1 ${summary.profit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                  {formatRupiah(summary.profit)}
                </div>
              </div>
              <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-xs font-bold text-emerald-700">
                <span>Rasio Margin</span>
                <span>{formatPercentFromBps(summary.marginBps)}</span>
              </div>
            </div>

            {/* Biaya Pengiriman & Biaya Lain */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
              <div>
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">
                  Ongkir Aktual & Biaya Lain
                </span>
                <div className="text-2xl font-black text-slate-800 mt-1">
                  {formatRupiah(summary.shippingActualCost + summary.extraCosts)}
                </div>
              </div>
              <div className="mt-3 pt-2.5 border-t border-slate-100 text-xs text-slate-500 flex justify-between">
                <span>Subsidi Ongkir: {formatRupiah(summary.shippingSubsidy)}</span>
                <span>Biaya Lain: {formatRupiah(summary.extraCosts)}</span>
              </div>
            </div>
          </div>

          {/* Kerugian Pembatalan Alert Banner (Seksi 9.2) */}
          {summary.cancellationLoss > 0 && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-red-900">
              <div className="flex items-center gap-3">
                <AlertTriangle className="w-5 h-5 text-red-600 shrink-0" />
                <div>
                  <div className="text-sm font-bold">
                    Kerugian Pembatalan Pesanan: {formatRupiah(summary.cancellationLoss)}
                  </div>
                  <div className="text-xs text-red-700 mt-0.5">
                    {summary.cancelledOrdersWithLossCount} pesanan dibatalkan setelah ongkir atau biaya operasional dikeluarkan. Kerugian ini telah mengurangi Laba Bersih Usaha secara otomatis sesuai Seksi 9.2 Dokumen Spesifikasi.
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 4. Data Table / List */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-base font-bold text-slate-900">
            Rincian Laporan Margin ({groupBy.toUpperCase()})
          </h3>
          <span className="text-xs text-slate-500">
            Total {reportData?.items.length || 0} baris data
          </span>
        </div>

        {loadingReport ? (
          <div className="p-8 space-y-3">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : !reportData || reportData.items.length === 0 ? (
          <div className="py-12 text-center text-slate-500 text-sm">
            Tidak ada transaksi dalam rentang tanggal dan kriteria filter yang dipilih.
          </div>
        ) : (
          <div className="overflow-x-auto">
            {groupBy === 'order' && (
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider">
                    <th className="py-3 px-4">No. Order</th>
                    <th className="py-3 px-4">Customer & Sales</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Omzet Bersih</th>
                    <th className="py-3 px-4 text-right">HPP Pokok</th>
                    <th className="py-3 px-4 text-right">Ongkir & Biaya</th>
                    <th className="py-3 px-4 text-right">Profit Riil</th>
                    <th className="py-3 px-4 text-right">Margin %</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(reportData.items as MarginOrderRow[]).map((row) => (
                    <tr
                      key={row.orderId}
                      className={`hover:bg-slate-50/70 transition-colors ${
                        row.isCancellationLoss ? 'bg-red-50/40 text-red-950' : ''
                      }`}
                    >
                      <td className="py-3 px-4 font-bold">
                        <Link
                          href={`/orders/${row.orderId}`}
                          className="text-blue-600 hover:underline inline-flex items-center gap-1"
                        >
                          {row.orderNo} <ArrowUpRight className="w-3 h-3" />
                        </Link>
                        <div className="text-[11px] text-slate-400 font-normal">
                          {new Date(row.orderDate).toLocaleDateString('id-ID')}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-900">
                          {row.customerName}
                        </div>
                        <div className="text-slate-500">
                          Sales: {row.salesName}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        {row.isCancellationLoss ? (
                          <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-red-100 text-red-800">
                            Kerugian Pembatalan
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-100 text-slate-700">
                            {row.status}
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right font-medium text-slate-900">
                        {formatRupiah(row.revenue)}
                      </td>
                      <td className="py-3 px-4 text-right font-medium text-slate-700">
                        {formatRupiah(row.cogs)}
                      </td>
                      <td className="py-3 px-4 text-right text-slate-500">
                        <div>Ongkir: {formatRupiah(row.shippingActualCost)}</div>
                        {row.extraCosts > 0 && (
                          <div className="text-[11px] text-amber-600">
                            Lain: {formatRupiah(row.extraCosts)}
                          </div>
                        )}
                      </td>
                      <td
                        className={`py-3 px-4 text-right font-black ${
                          row.profit >= 0 ? 'text-emerald-600' : 'text-red-600'
                        }`}
                      >
                        {formatRupiah(row.profit)}
                      </td>
                      <td className="py-3 px-4 text-right font-bold text-slate-700">
                        {row.isCancellationLoss ? '-' : formatPercentFromBps(row.marginBps)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {groupBy === 'product' && (
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider">
                    <th className="py-3 px-4">Produk</th>
                    <th className="py-3 px-4">SKU & Satuan</th>
                    <th className="py-3 px-4 text-right">Qty Terjual</th>
                    <th className="py-3 px-4 text-right">Total Penjualan</th>
                    <th className="py-3 px-4 text-right">Total HPP Modal</th>
                    <th className="py-3 px-4 text-right">Laba Kotor Produk</th>
                    <th className="py-3 px-4 text-right">Margin %</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(reportData.items as MarginProductRow[]).map((row) => (
                    <tr key={row.productId} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-3 px-4 font-bold text-slate-900">
                        {row.name}
                      </td>
                      <td className="py-3 px-4 text-slate-500">
                        {row.sku} ({row.unit})
                      </td>
                      <td className="py-3 px-4 text-right font-bold text-slate-900">
                        {(row.qtySold ?? 0).toLocaleString('id-ID')}
                      </td>
                      <td className="py-3 px-4 text-right font-medium text-slate-900">
                        {formatRupiah(row.grossRevenue)}
                      </td>
                      <td className="py-3 px-4 text-right font-medium text-slate-700">
                        {formatRupiah(row.cogs)}
                      </td>
                      <td
                        className={`py-3 px-4 text-right font-black ${
                          row.profit >= 0 ? 'text-emerald-600' : 'text-red-600'
                        }`}
                      >
                        {formatRupiah(row.profit)}
                      </td>
                      <td className="py-3 px-4 text-right font-bold text-emerald-700">
                        {formatPercentFromBps(row.marginBps)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {groupBy === 'sales' && (
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider">
                    <th className="py-3 px-4">Staf Sales</th>
                    <th className="py-3 px-4 text-right">Order Selesai</th>
                    <th className="py-3 px-4 text-right">Total Omzet</th>
                    <th className="py-3 px-4 text-right">Total HPP</th>
                    <th className="py-3 px-4 text-right">Ongkir & Biaya</th>
                    <th className="py-3 px-4 text-right">Kerugian Batal</th>
                    <th className="py-3 px-4 text-right">Laba Bersih</th>
                    <th className="py-3 px-4 text-right">Margin %</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(reportData.items as MarginSalesRow[]).map((row) => (
                    <tr key={row.salesId} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-3 px-4 font-bold text-slate-900">
                        {row.salesName}
                      </td>
                      <td className="py-3 px-4 text-right font-medium text-slate-700">
                        {row.orderCount} pesanan
                      </td>
                      <td className="py-3 px-4 text-right font-medium text-slate-900">
                        {formatRupiah(row.revenue)}
                      </td>
                      <td className="py-3 px-4 text-right font-medium text-slate-700">
                        {formatRupiah(row.cogs)}
                      </td>
                      <td className="py-3 px-4 text-right text-slate-500">
                        {formatRupiah(row.shippingActualCost + row.extraCosts)}
                      </td>
                      <td
                        className={`py-3 px-4 text-right font-semibold ${
                          row.cancellationLoss > 0 ? 'text-red-600' : 'text-slate-400'
                        }`}
                      >
                        {formatRupiah(row.cancellationLoss)}
                      </td>
                      <td
                        className={`py-3 px-4 text-right font-black ${
                          row.profit >= 0 ? 'text-emerald-600' : 'text-red-600'
                        }`}
                      >
                        {formatRupiah(row.profit)}
                      </td>
                      <td className="py-3 px-4 text-right font-bold text-emerald-700">
                        {formatPercentFromBps(row.marginBps)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {groupBy === 'business' && (
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider">
                    <th className="py-3 px-4">Unit Usaha</th>
                    <th className="py-3 px-4 text-right">Order Selesai</th>
                    <th className="py-3 px-4 text-right">Total Omzet</th>
                    <th className="py-3 px-4 text-right">Total HPP</th>
                    <th className="py-3 px-4 text-right">Ongkir Aktual</th>
                    <th className="py-3 px-4 text-right">Kerugian Batal</th>
                    <th className="py-3 px-4 text-right">Net Profit</th>
                    <th className="py-3 px-4 text-right">Margin %</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(reportData.items as MarginBusinessRow[]).map((row) => (
                    <tr key={row.businessId} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-3 px-4 font-bold text-slate-900">
                        {row.businessName}
                      </td>
                      <td className="py-3 px-4 text-right font-medium text-slate-700">
                        {row.orderCount} pesanan
                      </td>
                      <td className="py-3 px-4 text-right font-bold text-slate-900">
                        {formatRupiah(row.revenue)}
                      </td>
                      <td className="py-3 px-4 text-right font-medium text-slate-700">
                        {formatRupiah(row.cogs)}
                      </td>
                      <td className="py-3 px-4 text-right text-slate-500">
                        {formatRupiah(row.shippingActualCost)}
                      </td>
                      <td
                        className={`py-3 px-4 text-right font-semibold ${
                          row.cancellationLoss > 0 ? 'text-red-600' : 'text-slate-400'
                        }`}
                      >
                        {formatRupiah(row.cancellationLoss)}
                      </td>
                      <td
                        className={`py-3 px-4 text-right font-black ${
                          row.profit >= 0 ? 'text-emerald-600' : 'text-red-600'
                        }`}
                      >
                        {formatRupiah(row.profit)}
                      </td>
                      <td className="py-3 px-4 text-right font-bold text-emerald-700">
                        {formatPercentFromBps(row.marginBps)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
