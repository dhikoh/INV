'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Building2,
  ShoppingCart,
  Users,
  CheckCircle2,
  Package,
  AlertTriangle,
  Clock,
  ArrowUpRight,
  TrendingUp,
  CreditCard,
  Phone,
  MessageSquare,
  AlertCircle,
  Trophy,
  Target,
  Wallet,
  FileText,
  RefreshCw,
  ExternalLink,
} from 'lucide-react';
import { Skeleton, ErrorState } from '@/components/ui/States';
import { formatRupiah, formatPercentFromBps } from '@/lib/domain/money';

// Types for Super Admin Dashboard DTO
interface SuperAdminSummary {
  pendingApprovalsCount: number;
  pendingPaymentsCount: number;
  negativeStockCount: number;
  lowStockCount: number;
  overdueInvoicesCount: number;
  overdueAmount: number;
  unassignedCustomersCount: number;
}

interface MonthlyMetrics {
  month: string;
  orderCount: number;
  grossRevenue: number;
  discountTotal: number;
  netRevenue: number;
  cogs: number;
  netProfit: number;
  marginBps: number;
}

interface PendingApprovalItem {
  id: string;
  orderNo: string;
  customerName: string;
  grandTotal: number;
  hasBelowMin: boolean;
  belowMinReason: string | null;
  submittedAt: string;
}

interface PendingPaymentItem {
  id: string;
  orderId: string;
  orderNo: string;
  customerName: string;
  amount: number;
  paymentMethod: string;
  proofPath: string | null;
  createdAt: string;
}

interface StockProductItem {
  id: string;
  name: string;
  sku: string;
  unit: string;
  stockQty: number;
  reservedQty: number;
  availableStock: number;
  minStockAlert?: number;
}

interface OverdueInvoiceItem {
  invoiceId: string;
  orderId: string;
  invoiceNumber: string;
  overdueAmount: number;
  daysOverdue: number;
  dueDate: string;
}

interface SalesLeaderboardItem {
  salesId: string;
  salesName: string;
  revenue: number;
  profit: number;
  orderCount: number;
}

interface SuperAdminDashboardData {
  role: 'SUPERADMIN';
  summary: SuperAdminSummary;
  monthlyMetrics: MonthlyMetrics;
  actionItems: {
    pendingApprovals: PendingApprovalItem[];
    pendingPayments: PendingPaymentItem[];
    negativeStockProducts: StockProductItem[];
    lowStockProducts: StockProductItem[];
    overdueInvoices: OverdueInvoiceItem[];
  };
  leaderboard: SalesLeaderboardItem[];
}

// Types for Sales Dashboard DTO
interface SalesReminderItem {
  id: string;
  customerId: string;
  customerName: string;
  customerPhone: string | null;
  intervalDays: number;
  lastOrderDate: string;
  nextDueDate: string;
  note: string | null;
}

interface SalesTaskItem {
  id: string;
  customerId: string;
  customerName: string;
  customerPhone: string | null;
  title: string;
  dueAt: string;
}

interface SalesOrderApprovalItem {
  id: string;
  orderNo: string;
  customerName: string;
  grandTotal: number;
  status: string;
  hasBelowMin: boolean;
  rejectReason: string | null;
  updatedAt: string;
}

interface SalesDueReceivableItem {
  invoiceId: string;
  orderId: string;
  invoiceNumber: string;
  balanceDue: number;
  dueDate: string;
  daysOverdue: number;
}

interface SalesTodayFocus {
  remindersCount: number;
  tasksCount: number;
  approvalAlertsCount: number;
  dueReceivablesCount: number;
  reminders: SalesReminderItem[];
  tasks: SalesTaskItem[];
  orderApprovals: SalesOrderApprovalItem[];
  dueReceivables: SalesDueReceivableItem[];
}

interface SalesPerformance {
  month: string;
  revenue: number;
  targetRevenue: number | null;
  achievementPercent: number | null;
  estimatedCommission: number;
  myCustomersCount: number;
  activeOrdersCount: number;
}

interface SalesDashboardData {
  role: 'SALES';
  todayFocus: SalesTodayFocus;
  performance: SalesPerformance;
}

type DashboardResponse = SuperAdminDashboardData | SalesDashboardData;

export default function DashboardPage() {
  const [user, setUser] = useState<{ name: string; role: string } | null>(null);
  const [business, setBusiness] = useState<{
    name: string;
    code: string;
  } | null>(null);
  const [dashboardData, setDashboardData] = useState<DashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function fetchAllData() {
    setLoading(true);
    setError(null);
    try {
      const [meRes, bizRes, dashRes] = await Promise.all([
        fetch('/api/v1/auth/me'),
        fetch('/api/v1/business'),
        fetch('/api/v1/dashboard'),
      ]);

      if (meRes.ok) {
        const meData = await meRes.json();
        setUser(meData.data.user);
      }

      if (bizRes.ok) {
        const bizData = await bizRes.json();
        setBusiness(bizData.data);
      }

      if (dashRes.ok) {
        const dashJson = await dashRes.json();
        setDashboardData(dashJson.data);
      } else {
        const errJson = await dashRes.json();
        setError(errJson.error?.message || 'Gagal memuat data dashboard');
      }
    } catch {
      setError('Koneksi terputus saat mengambil data dashboard');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchAllData();
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-28 w-full rounded-2xl" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Skeleton className="h-28 w-full rounded-xl" />
          <Skeleton className="h-28 w-full rounded-xl" />
          <Skeleton className="h-28 w-full rounded-xl" />
          <Skeleton className="h-28 w-full rounded-xl" />
        </div>
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    );
  }

  if (error || !dashboardData) {
    return (
      <div className="py-8">
        <ErrorState
          title="Tidak Dapat Memuat Dashboard"
          message={error || 'Terjadi kesalahan sistem saat memproses ringkasan operasional'}
          onRetry={fetchAllData}
        />
      </div>
    );
  }

  const isSuperAdmin = dashboardData.role === 'SUPERADMIN';

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Welcome Banner */}
      <div className="bg-gradient-to-r from-blue-700 via-indigo-700 to-slate-900 text-white rounded-2xl p-6 shadow-md">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wider bg-white/20 text-blue-100">
                {isSuperAdmin ? 'Pemilik & Super Admin' : 'Staf Sales'}
              </span>
              <span className="text-xs text-blue-200">
                WIB Bulan: {isSuperAdmin ? dashboardData.monthlyMetrics.month : dashboardData.performance.month}
              </span>
            </div>
            <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight mt-2">
              Selamat Datang, {user?.name || 'Pengguna'}!
            </h1>
            <p className="text-blue-100 text-sm mt-1">
              {isSuperAdmin
                ? 'Pantau kesehatan keuangan, persetujuan diskon, piutang, dan kinerja tim sales.'
                : 'Fokus harian Anda: tindak lanjuti prospek, pelanggan repeat order, dan pantau status komisi.'}
            </p>
          </div>

          <div className="flex items-center gap-2 self-start md:self-auto">
            {business && (
              <div className="bg-white/10 backdrop-blur-sm px-4 py-2 rounded-xl flex items-center gap-2 border border-white/20">
                <Building2 className="w-5 h-5 text-blue-200 shrink-0" />
                <div>
                  <div className="text-xs text-blue-200 uppercase font-semibold">
                    Unit Usaha
                  </div>
                  <div className="text-sm font-bold">
                    {business.code} - {business.name}
                  </div>
                </div>
              </div>
            )}
            <button
              type="button"
              onClick={fetchAllData}
              title="Perbarui Data"
              className="min-h-[44px] min-w-[44px] p-2.5 bg-white/10 hover:bg-white/20 active:bg-white/30 rounded-xl transition flex items-center justify-center border border-white/20"
            >
              <RefreshCw className="w-4 h-4 text-white" />
            </button>
          </div>
        </div>
      </div>

      {/* Render Role-Specific View */}
      {isSuperAdmin ? (
        <SuperAdminView data={dashboardData as SuperAdminDashboardData} />
      ) : (
        <SalesView data={dashboardData as SalesDashboardData} />
      )}
    </div>
  );
}

/**
 * Komponen Dashboard untuk Pemilik / Super Admin
 */
function SuperAdminView({ data }: { data: SuperAdminDashboardData }) {
  const { summary, monthlyMetrics, actionItems, leaderboard } = data;

  return (
    <div className="space-y-6">
      {/* 1. Baris KPI Keuangan Utama (Bulan Ini) */}
      <section aria-labelledby="kpi-keuangan-heading">
        <h2 id="kpi-keuangan-heading" className="text-lg font-bold text-slate-900 mb-3 flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-blue-600" />
          Kinerja Keuangan ({monthlyMetrics.month})
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Omzet Bersih */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
            <div>
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                Omzet Bersih
              </span>
              <div className="text-2xl font-black text-slate-900 mt-1">
                {formatRupiah(monthlyMetrics.netRevenue)}
              </div>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
              <span>{monthlyMetrics.orderCount} pesanan disetujui</span>
              {monthlyMetrics.discountTotal > 0 && (
                <span className="text-amber-600 font-medium">
                  Diskon: {formatRupiah(monthlyMetrics.discountTotal)}
                </span>
              )}
            </div>
          </div>

          {/* HPP (COGS) */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
            <div>
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                Total HPP (Modal Barang)
              </span>
              <div className="text-2xl font-black text-slate-700 mt-1">
                {formatRupiah(monthlyMetrics.cogs)}
              </div>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-100 text-xs text-slate-500">
              Biaya modal pokok barang terjual
            </div>
          </div>

          {/* Laba Kotor Bersih */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
            <div>
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                Laba Bersih Produk
              </span>
              <div className="text-2xl font-black text-emerald-600 mt-1">
                {formatRupiah(monthlyMetrics.netProfit)}
              </div>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs font-semibold text-emerald-700">
              <span>Margin Keuntungan</span>
              <span>{formatPercentFromBps(monthlyMetrics.marginBps)}</span>
            </div>
          </div>

          {/* Piutang Tertunggak */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
            <div>
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                Piutang Jatuh Tempo
              </span>
              <div className={`text-2xl font-black mt-1 ${summary.overdueAmount > 0 ? 'text-red-600' : 'text-slate-900'}`}>
                {formatRupiah(summary.overdueAmount)}
              </div>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
              <span>{summary.overdueInvoicesCount} faktur lewat tempo</span>
              <Link href="/orders" className="text-blue-600 font-medium hover:underline inline-flex items-center gap-0.5">
                Cek <ArrowUpRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* 2. Kartu Aksi Segera (Antrean, Pembayaran, Stok Minus, Unassigned Customer) */}
      <section aria-labelledby="aksi-segera-heading">
        <h2 id="aksi-segera-heading" className="text-lg font-bold text-slate-900 mb-3 flex items-center gap-2">
          <AlertCircle className="w-5 h-5 text-amber-500" />
          Perlu Perhatian & Tindakan Pemilik
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {/* Approval Pesanan */}
          <Link
            href="/approvals"
            className={`p-4 rounded-xl border transition-all flex flex-col justify-between min-h-[44px] ${
              summary.pendingApprovalsCount > 0
                ? 'bg-amber-50/70 border-amber-300 hover:border-amber-500 shadow-sm'
                : 'bg-white border-slate-200 hover:border-slate-300'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-700">Antrean Persetujuan</span>
              <CheckCircle2 className={`w-4 h-4 ${summary.pendingApprovalsCount > 0 ? 'text-amber-600' : 'text-slate-400'}`} />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-black text-slate-900">{summary.pendingApprovalsCount}</span>
              <span className="text-xs text-slate-500">pesanan</span>
            </div>
            <span className="text-[11px] text-slate-500 mt-2">Diskon khusus & batas margin</span>
          </Link>

          {/* Verifikasi Pembayaran */}
          <Link
            href="/orders"
            className={`p-4 rounded-xl border transition-all flex flex-col justify-between min-h-[44px] ${
              summary.pendingPaymentsCount > 0
                ? 'bg-blue-50/70 border-blue-300 hover:border-blue-500 shadow-sm'
                : 'bg-white border-slate-200 hover:border-slate-300'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-700">Verifikasi Pembayaran</span>
              <CreditCard className={`w-4 h-4 ${summary.pendingPaymentsCount > 0 ? 'text-blue-600' : 'text-slate-400'}`} />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-black text-slate-900">{summary.pendingPaymentsCount}</span>
              <span className="text-xs text-slate-500">transfer</span>
            </div>
            <span className="text-[11px] text-slate-500 mt-2">Menunggu cek mutasi bank</span>
          </Link>

          {/* Stok Minus */}
          <Link
            href="/products"
            className={`p-4 rounded-xl border transition-all flex flex-col justify-between min-h-[44px] ${
              summary.negativeStockCount > 0
                ? 'bg-red-50 border-red-300 hover:border-red-500 shadow-sm'
                : 'bg-white border-slate-200 hover:border-slate-300'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-700">Stok Minus</span>
              <AlertTriangle className={`w-4 h-4 ${summary.negativeStockCount > 0 ? 'text-red-600' : 'text-slate-400'}`} />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className={`text-2xl font-black ${summary.negativeStockCount > 0 ? 'text-red-600' : 'text-slate-900'}`}>
                {summary.negativeStockCount}
              </span>
              <span className="text-xs text-slate-500">produk</span>
            </div>
            <span className="text-[11px] text-red-600 font-medium mt-2">Fisik kurang dari reserved!</span>
          </Link>

          {/* Stok Menipis */}
          <Link
            href="/products"
            className={`p-4 rounded-xl border transition-all flex flex-col justify-between min-h-[44px] ${
              summary.lowStockCount > 0
                ? 'bg-amber-50/50 border-amber-200 hover:border-amber-400'
                : 'bg-white border-slate-200 hover:border-slate-300'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-700">Stok Menipis</span>
              <Package className={`w-4 h-4 ${summary.lowStockCount > 0 ? 'text-amber-500' : 'text-slate-400'}`} />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-black text-slate-900">{summary.lowStockCount}</span>
              <span className="text-xs text-slate-500">produk</span>
            </div>
            <span className="text-[11px] text-slate-500 mt-2">Mendekati batas minimal alert</span>
          </Link>

          {/* Pelanggan Tanpa Sales */}
          <Link
            href="/customers"
            className={`p-4 rounded-xl border transition-all flex flex-col justify-between min-h-[44px] ${
              summary.unassignedCustomersCount > 0
                ? 'bg-purple-50/70 border-purple-300 hover:border-purple-500 shadow-sm'
                : 'bg-white border-slate-200 hover:border-slate-300'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-700">Customer Orphan</span>
              <Users className={`w-4 h-4 ${summary.unassignedCustomersCount > 0 ? 'text-purple-600' : 'text-slate-400'}`} />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-black text-slate-900">{summary.unassignedCustomersCount}</span>
              <span className="text-xs text-slate-500">customer</span>
            </div>
            <span className="text-[11px] text-slate-500 mt-2">Belum ditugaskan ke sales</span>
          </Link>
        </div>
      </section>

      {/* 3. Grid Rincian: Antrean Approval & Leaderboard Tim Sales */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Kolom Kiri: Antrean Approval & Verifikasi Pembayaran (2 Kolom) */}
        <div className="lg:col-span-2 space-y-6">
          {/* Daftar Antrean Approval */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Antrean Persetujuan Order Terbaru
                </h3>
                <p className="text-xs text-slate-500">
                  Pesanan dengan harga di bawah batas atau diskon khusus
                </p>
              </div>
              <Link
                href="/approvals"
                className="text-xs font-semibold text-blue-600 hover:underline flex items-center gap-1 min-h-[44px] px-2"
              >
                Lihat Semua ({summary.pendingApprovalsCount}) <ArrowUpRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            {actionItems.pendingApprovals.length === 0 ? (
              <div className="py-6 text-center text-xs text-slate-500 bg-slate-50 rounded-xl">
                Tidak ada pesanan yang menunggu persetujuan saat ini.
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {actionItems.pendingApprovals.map((item) => (
                  <div key={item.id} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-slate-900">
                          {item.orderNo}
                        </span>
                        {item.hasBelowMin && (
                          <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-amber-100 text-amber-800">
                            Di Bawah Batas Minimal
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-600 mt-0.5">
                        Customer: <span className="font-semibold">{item.customerName}</span>
                      </div>
                      {item.belowMinReason && (
                        <div className="text-xs text-slate-500 italic mt-0.5">
                          &quot;{item.belowMinReason}&quot;
                        </div>
                      )}
                    </div>
                    <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
                      <div className="text-right">
                        <div className="text-sm font-bold text-slate-900">
                          {formatRupiah(item.grandTotal)}
                        </div>
                      </div>
                      <Link
                        href="/approvals"
                        className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg transition min-h-[44px] flex items-center"
                      >
                        Tinjau
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Pembayaran Menunggu Verifikasi */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Pembayaran Perlu Verifikasi Bank
                </h3>
                <p className="text-xs text-slate-500">
                  Kuitansi transfer yang diunggah staf sales
                </p>
              </div>
              <Link
                href="/orders"
                className="text-xs font-semibold text-blue-600 hover:underline flex items-center gap-1 min-h-[44px] px-2"
              >
                Lihat Semua ({summary.pendingPaymentsCount}) <ArrowUpRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            {actionItems.pendingPayments.length === 0 ? (
              <div className="py-6 text-center text-xs text-slate-500 bg-slate-50 rounded-xl">
                Tidak ada pembayaran yang menunggu verifikasi.
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {actionItems.pendingPayments.map((p) => (
                  <div key={p.id} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <div className="font-bold text-sm text-slate-900">
                        {p.orderNo} - {p.customerName}
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5">
                        Metode: <span className="font-medium text-slate-700">{p.paymentMethod}</span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
                      <div className="text-sm font-bold text-emerald-600">
                        {formatRupiah(p.amount)}
                      </div>
                      {p.proofPath && (
                        <a
                          href={`/${p.proofPath}`}
                          target="_blank"
                          rel="noreferrer"
                          className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium rounded-lg transition inline-flex items-center gap-1 min-h-[44px]"
                        >
                          Bukti <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                      <Link
                        href={`/orders`}
                        className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-lg transition min-h-[44px] flex items-center"
                      >
                        Buka Order
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Kolom Kanan: Leaderboard Staf Sales Bulan Ini */}
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
            <div className="flex items-center gap-2 mb-4">
              <Trophy className="w-5 h-5 text-amber-500" />
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Peringkat Omzet Sales
                </h3>
                <p className="text-xs text-slate-500">
                  Performa penjualan bulan berjalan ({monthlyMetrics.month})
                </p>
              </div>
            </div>

            {leaderboard.length === 0 ? (
              <div className="py-6 text-center text-xs text-slate-500 bg-slate-50 rounded-xl">
                Belum ada transaksi sales bulan ini.
              </div>
            ) : (
              <div className="space-y-3">
                {leaderboard.map((sales, idx) => (
                  <div
                    key={sales.salesId}
                    className="p-3 rounded-xl border border-slate-100 bg-slate-50 flex items-center justify-between"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs shrink-0 ${
                          idx === 0
                            ? 'bg-amber-400 text-amber-950 ring-2 ring-amber-200'
                            : idx === 1
                            ? 'bg-slate-300 text-slate-800'
                            : idx === 2
                            ? 'bg-amber-700 text-amber-100'
                            : 'bg-slate-200 text-slate-600'
                        }`}
                      >
                        {idx + 1}
                      </div>
                      <div>
                        <div className="text-sm font-bold text-slate-900">
                          {sales.salesName}
                        </div>
                        <div className="text-xs text-slate-500">
                          {sales.orderCount} pesanan selesai
                        </div>
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="text-sm font-extrabold text-blue-600">
                        {formatRupiah(sales.revenue)}
                      </div>
                      <div className="text-xs text-emerald-600 font-semibold">
                        Laba: {formatRupiah(sales.profit)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Quick Navigasi Pintasan */}
          <div className="bg-slate-50 rounded-2xl border border-slate-200 p-5 space-y-3">
            <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wide">
              Pintasan Operasional
            </h4>
            <div className="grid grid-cols-2 gap-2">
              <Link
                href="/orders/new"
                className="p-3 bg-white rounded-xl border border-slate-200 text-xs font-bold text-slate-900 hover:border-blue-500 transition min-h-[44px] flex items-center justify-center text-center"
              >
                + Buat Order Baru
              </Link>
              <Link
                href="/customers"
                className="p-3 bg-white rounded-xl border border-slate-200 text-xs font-bold text-slate-900 hover:border-blue-500 transition min-h-[44px] flex items-center justify-center text-center"
              >
                + Pelanggan
              </Link>
              <Link
                href="/products"
                className="p-3 bg-white rounded-xl border border-slate-200 text-xs font-bold text-slate-900 hover:border-blue-500 transition min-h-[44px] flex items-center justify-center text-center"
              >
                Katalog & Stok
              </Link>
              <Link
                href="/orders"
                className="p-3 bg-white rounded-xl border border-slate-200 text-xs font-bold text-slate-900 hover:border-blue-500 transition min-h-[44px] flex items-center justify-center text-center"
              >
                Daftar Order
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Komponen Dashboard untuk Staf Sales
 * STRICT ZERO-LEAKAGE: Tidak pernah menampilkan profit, margin, HPP, atau cogs.
 */
function SalesView({ data }: { data: SalesDashboardData }) {
  const { todayFocus, performance } = data;

  return (
    <div className="space-y-6">
      {/* 1. Bar Pintasan Aksi Cepat (Mobile Friendly) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Link
          href="/orders/new"
          className="bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white p-3.5 rounded-xl font-bold text-sm shadow-sm transition flex items-center justify-center gap-2 min-h-[44px]"
        >
          <ShoppingCart className="w-4 h-4 shrink-0" />
          <span>+ Order Baru</span>
        </Link>
        <Link
          href="/customers"
          className="bg-white hover:bg-slate-50 active:bg-slate-100 text-slate-800 border border-slate-200 p-3.5 rounded-xl font-bold text-sm shadow-sm transition flex items-center justify-center gap-2 min-h-[44px]"
        >
          <Users className="w-4 h-4 text-indigo-600 shrink-0" />
          <span>Pelanggan Saya</span>
        </Link>
        <Link
          href="/products"
          className="bg-white hover:bg-slate-50 active:bg-slate-100 text-slate-800 border border-slate-200 p-3.5 rounded-xl font-bold text-sm shadow-sm transition flex items-center justify-center gap-2 min-h-[44px]"
        >
          <Package className="w-4 h-4 text-amber-600 shrink-0" />
          <span>Katalog Produk</span>
        </Link>
        <Link
          href="/orders"
          className="bg-white hover:bg-slate-50 active:bg-slate-100 text-slate-800 border border-slate-200 p-3.5 rounded-xl font-bold text-sm shadow-sm transition flex items-center justify-center gap-2 min-h-[44px]"
        >
          <FileText className="w-4 h-4 text-slate-600 shrink-0" />
          <span>Daftar Order</span>
        </Link>
      </div>

      {/* 2. Capaian Target & Estimasi Komisi Sales */}
      <section aria-labelledby="target-sales-heading">
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Target className="w-5 h-5 text-blue-600" />
              <div>
                <h2 id="target-sales-heading" className="text-base font-bold text-slate-900">
                  Capaian Target Pribadi ({performance.month})
                </h2>
                <p className="text-xs text-slate-500">
                  Pantau omzet penjualan dan estimasi komisi Anda
                </p>
              </div>
            </div>

            <div className="flex items-center gap-4 text-right">
              <div>
                <div className="text-xs text-slate-500 uppercase font-semibold">Omzet Tercapai</div>
                <div className="text-xl font-black text-blue-600">
                  {formatRupiah(performance.revenue)}
                </div>
              </div>
              <div className="border-l border-slate-200 pl-4">
                <div className="text-xs text-slate-500 uppercase font-semibold">Estimasi Komisi</div>
                <div className="text-xl font-black text-emerald-600">
                  {formatRupiah(performance.estimatedCommission)}
                </div>
              </div>
            </div>
          </div>

          {/* Progress Bar Target */}
          {performance.targetRevenue ? (
            <div className="space-y-1.5 pt-2 border-t border-slate-100">
              <div className="flex justify-between text-xs font-semibold">
                <span className="text-slate-600">
                  Target: {formatRupiah(performance.targetRevenue)}
                </span>
                <span className={performance.achievementPercent && performance.achievementPercent >= 100 ? 'text-emerald-600 font-bold' : 'text-blue-600 font-bold'}>
                  {performance.achievementPercent ?? 0}%
                </span>
              </div>
              <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    performance.achievementPercent && performance.achievementPercent >= 100
                      ? 'bg-emerald-500'
                      : 'bg-blue-600'
                  }`}
                  style={{
                    width: `${Math.min(100, performance.achievementPercent ?? 0)}%`,
                  }}
                />
              </div>
            </div>
          ) : (
            <div className="text-xs text-slate-500 pt-2 border-t border-slate-100 italic">
              Target bulanan belum ditetapkan oleh pemilik usaha.
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 pt-2 text-xs text-slate-600 border-t border-slate-100">
            <div>
              Total Pelanggan Terdaftar: <span className="font-bold text-slate-900">{performance.myCustomersCount}</span>
            </div>
            <div>
              Pesanan Aktif Berjalan: <span className="font-bold text-slate-900">{performance.activeOrdersCount}</span>
            </div>
          </div>
        </div>
      </section>

      {/* 3. Kotak Status Perhatian: Order Ditolak / Menunggu Approval */}
      {todayFocus.orderApprovals.length > 0 && (
        <section aria-labelledby="status-order-heading">
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-3">
            <h3 id="status-order-heading" className="text-base font-bold text-slate-900 flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-amber-500" />
              Status Order Butuh Perhatian ({todayFocus.orderApprovals.length})
            </h3>

            <div className="divide-y divide-slate-100">
              {todayFocus.orderApprovals.map((ord) => {
                const isRejected = ord.status === 'REVISION_REQUIRED';
                return (
                  <div
                    key={ord.id}
                    className={`py-3 px-3.5 my-1 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                      isRejected
                        ? 'bg-red-50/70 border-red-200'
                        : 'bg-amber-50/50 border-amber-200'
                    }`}
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-slate-900">
                          {ord.orderNo}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                            isRejected
                              ? 'bg-red-100 text-red-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {isRejected ? 'Perlu Revisi (Ditolak)' : 'Menunggu Approval'}
                        </span>
                      </div>
                      <div className="text-xs text-slate-600 mt-0.5">
                        Pelanggan: <span className="font-semibold">{ord.customerName}</span> • Nilai: {formatRupiah(ord.grandTotal)}
                      </div>

                      {/* Tampilkan Alasan Penolakan dengan Jelas jika Ditolak */}
                      {isRejected && ord.rejectReason && (
                        <div className="mt-2 text-xs bg-white/90 p-2 rounded-lg border border-red-200 text-red-800">
                          <span className="font-bold">Alasan Penolakan dari Pemilik:</span>{' '}
                          {ord.rejectReason}
                        </div>
                      )}
                    </div>

                    <div className="shrink-0 flex items-center gap-2">
                      <Link
                        href={`/orders`}
                        className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition min-h-[44px] flex items-center ${
                          isRejected
                            ? 'bg-red-600 hover:bg-red-700 text-white'
                            : 'bg-slate-800 hover:bg-slate-900 text-white'
                        }`}
                      >
                        {isRejected ? 'Perbaiki Order' : 'Lihat Order'}
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* 4. Fokus "Hari Ini": Repeat Order & Tugas CRM Follow-Up */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Kolom Kiri: Pengingat Repeat Order */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-indigo-600" />
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Pengingat Repeat Order ({todayFocus.remindersCount})
                </h3>
                <p className="text-xs text-slate-500">
                  Customer jatuh tempo untuk pemesanan ulang
                </p>
              </div>
            </div>
          </div>

          {todayFocus.reminders.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-500 bg-slate-50 rounded-xl">
              Tidak ada jadwal repeat order yang jatuh tempo hari ini.
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {todayFocus.reminders.map((rem) => (
                <div key={rem.id} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <div className="font-bold text-sm text-slate-900">
                      {rem.customerName}
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      Interval: {rem.intervalDays} hari • Order terakhir:{' '}
                      {new Date(rem.lastOrderDate).toLocaleDateString('id-ID')}
                    </div>
                    {rem.note && (
                      <div className="text-xs text-slate-600 italic mt-0.5">
                        &quot;{rem.note}&quot;
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {rem.customerPhone && (
                      <a
                        href={`https://wa.me/${rem.customerPhone.replace(/[^0-9]/g, '')}`}
                        target="_blank"
                        rel="noreferrer"
                        className="p-2 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded-lg text-xs font-semibold transition min-h-[44px] min-w-[44px] flex items-center justify-center border border-emerald-200"
                        title="Hubungi WhatsApp"
                      >
                        <MessageSquare className="w-4 h-4" />
                      </a>
                    )}
                    <Link
                      href={`/orders/new`}
                      className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold transition min-h-[44px] flex items-center"
                    >
                      + Order
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Kolom Kanan: Tugas CRM & Piutang Jatuh Tempo */}
        <div className="space-y-6">
          {/* Tugas CRM */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Tugas CRM Hari Ini ({todayFocus.tasksCount})
                </h3>
                <p className="text-xs text-slate-500">
                  Aktivitas follow-up yang perlu diselesaikan
                </p>
              </div>
            </div>

            {todayFocus.tasks.length === 0 ? (
              <div className="py-6 text-center text-xs text-slate-500 bg-slate-50 rounded-xl">
                Semua tugas CRM hari ini telah diselesaikan.
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {todayFocus.tasks.map((task) => (
                  <div key={task.id} className="py-2.5 flex items-center justify-between gap-2">
                    <div>
                      <div className="text-sm font-semibold text-slate-900">
                        {task.title}
                      </div>
                      <div className="text-xs text-slate-500">
                        Customer: <span className="font-medium text-slate-700">{task.customerName}</span>
                      </div>
                    </div>
                    {task.customerPhone && (
                      <a
                        href={`https://wa.me/${task.customerPhone.replace(/[^0-9]/g, '')}`}
                        target="_blank"
                        rel="noreferrer"
                        className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs transition min-h-[44px] min-w-[44px] flex items-center justify-center"
                      >
                        <Phone className="w-4 h-4" />
                      </a>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Piutang Pelanggan Jatuh Tempo */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
            <div className="flex items-center gap-2">
              <Wallet className="w-5 h-5 text-red-500" />
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Piutang Pelanggan Lewat Tempo ({todayFocus.dueReceivablesCount})
                </h3>
                <p className="text-xs text-slate-500">
                  Ingatkan customer untuk melunasi tagihan yang jatuh tempo
                </p>
              </div>
            </div>

            {todayFocus.dueReceivables.length === 0 ? (
              <div className="py-6 text-center text-xs text-slate-500 bg-slate-50 rounded-xl">
                Tidak ada tagihan pelanggan yang jatuh tempo saat ini.
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {todayFocus.dueReceivables.map((rec) => (
                  <div key={rec.invoiceId} className="py-2.5 flex items-center justify-between gap-2">
                    <div>
                      <div className="text-sm font-bold text-slate-900">
                        {rec.invoiceNumber}
                      </div>
                      <div className="text-xs text-red-600 font-medium">
                        Lewat {rec.daysOverdue} hari
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-black text-red-600">
                        {formatRupiah(rec.balanceDue)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
