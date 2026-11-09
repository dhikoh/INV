'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  TrendingUp,
  Receipt,
  Users,
  Target,
  BarChart3,
  ChevronRight,
  ShieldCheck,
} from 'lucide-react';
import { Skeleton } from '@/components/ui/States';

export default function ReportsHubPage() {
  const [userRole, setUserRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadRole() {
      try {
        const res = await fetch('/api/v1/auth/me');
        if (res.ok) {
          const json = await res.json();
          setUserRole(json.data.user.role);
        }
      } catch {
        // Abaikan kesalahan
      } finally {
        setLoading(false);
      }
    }
    loadRole();
  }, []);

  if (loading) {
    return (
      <div className="p-6 max-w-7xl mx-auto space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <Skeleton className="h-44" />
          <Skeleton className="h-44" />
          <Skeleton className="h-44" />
        </div>
      </div>
    );
  }

  const isSuperAdmin = userRole === 'SUPERADMIN';

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <BarChart3 className="w-7 h-7 text-indigo-600" />
          Pusat Laporan & Analitik Bisnis
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Akses laporan keuangan, profitabilitas, kinerja staf sales, piutang usaha, dan aktivitas CRM.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Laporan CRM (Semua Role) */}
        <Link
          href="/reports/crm"
          className="group bg-white p-6 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md hover:border-indigo-300 transition flex flex-col justify-between"
        >
          <div className="space-y-3">
            <div className="w-12 h-12 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center group-hover:scale-105 transition">
              <Users className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 group-hover:text-indigo-600 transition">
                Laporan Aktivitas & Pipeline CRM
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                Pantau perkembangan prospek customer dari Lead ke Repeat Order, rekap follow-up interaksi, dan status tugas.
              </p>
            </div>
          </div>
          <div className="mt-6 flex items-center text-xs font-semibold text-indigo-600 group-hover:translate-x-1 transition">
            Buka Laporan CRM <ChevronRight className="w-4 h-4 ml-1" />
          </div>
        </Link>

        {/* Laporan Piutang & Umur Piutang */}
        <Link
          href="/receivables"
          className="group bg-white p-6 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md hover:border-indigo-300 transition flex flex-col justify-between"
        >
          <div className="space-y-3">
            <div className="w-12 h-12 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center group-hover:scale-105 transition">
              <Receipt className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 group-hover:text-indigo-600 transition">
                Piutang & Umur Piutang Usaha
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                Kendalikan saldo tagihan faktur yang belum lunas dan analisis umur piutang (Current, 1–7 hari, s/d &gt;60 hari).
              </p>
            </div>
          </div>
          <div className="mt-6 flex items-center text-xs font-semibold text-indigo-600 group-hover:translate-x-1 transition">
            Buka Laporan Piutang <ChevronRight className="w-4 h-4 ml-1" />
          </div>
        </Link>

        {/* Super Admin Only: Laporan Margin & Profit */}
        {isSuperAdmin && (
          <Link
            href="/reports/margin"
            className="group bg-white p-6 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md hover:border-emerald-300 transition flex flex-col justify-between relative overflow-hidden"
          >
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center group-hover:scale-105 transition">
                  <TrendingUp className="w-6 h-6" />
                </div>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 uppercase tracking-wider">
                  Owner Only
                </span>
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900 group-hover:text-emerald-700 transition">
                  Laporan Margin & Profitabilitas
                </h2>
                <p className="text-xs text-slate-500 mt-1">
                  Evaluasi pendapatan bersih, HPP modal pokok, ongkir aktual, biaya ekstra, dan kerugian pembatalan pesanan.
                </p>
              </div>
            </div>
            <div className="mt-6 flex items-center text-xs font-semibold text-emerald-600 group-hover:translate-x-1 transition">
              Buka Laporan Margin <ChevronRight className="w-4 h-4 ml-1" />
            </div>
          </Link>
        )}

        {/* Super Admin Only: Kinerja & Evaluasi Sales */}
        {isSuperAdmin && (
          <Link
            href="/sales"
            className="group bg-white p-6 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md hover:border-indigo-300 transition flex flex-col justify-between relative overflow-hidden"
          >
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="w-12 h-12 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center group-hover:scale-105 transition">
                  <Target className="w-6 h-6" />
                </div>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-indigo-100 text-indigo-800 uppercase tracking-wider">
                  Owner Only
                </span>
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900 group-hover:text-indigo-600 transition">
                  Evaluasi Kinerja & Komisi Sales
                </h2>
                <p className="text-xs text-slate-500 mt-1">
                  Target bulanan sales, capaian omzet, rasio order ditolak, catatan rahasia pemilik, dan pembayaran komisi.
                </p>
              </div>
            </div>
            <div className="mt-6 flex items-center text-xs font-semibold text-indigo-600 group-hover:translate-x-1 transition">
              Buka Kinerja Sales <ChevronRight className="w-4 h-4 ml-1" />
            </div>
          </Link>
        )}
      </div>

      <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 flex items-center gap-3 text-xs text-slate-500">
        <ShieldCheck className="w-5 h-5 text-indigo-600 shrink-0" />
        <span>
          Semua berkas ekspor laporan (.xlsx & .pdf) dilindungi dengan standar keamanan Formula Injection (Seksi 16.4) dan isolasi multi-tenant yang ketat.
        </span>
      </div>
    </div>
  );
}
