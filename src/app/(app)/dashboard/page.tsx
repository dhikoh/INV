'use client';

import React, { useEffect, useState } from 'react';
import { Building2, ShoppingCart, Users, CheckCircle2 } from 'lucide-react';
import Link from 'next/link';
import { Skeleton } from '@/components/ui/States';

export default function DashboardPage() {
  const [user, setUser] = useState<{ name: string; role: string } | null>(null);
  const [business, setBusiness] = useState<{
    name: string;
    code: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchDashboardData() {
      try {
        const [meRes, bizRes] = await Promise.all([
          fetch('/api/v1/auth/me'),
          fetch('/api/v1/business'),
        ]);

        if (meRes.ok) {
          const meData = await meRes.json();
          setUser(meData.data.user);
        }
        if (bizRes.ok) {
          const bizData = await bizRes.json();
          setBusiness(bizData.data);
        }
      } finally {
        setLoading(false);
      }
    }

    fetchDashboardData();
  }, []);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-28 w-full" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      </div>
    );
  }

  const isSuperAdmin = user?.role === 'SUPERADMIN';

  return (
    <div className="space-y-6">
      {/* Welcome Banner */}
      <div className="bg-gradient-to-r from-blue-600 to-indigo-700 text-white rounded-2xl p-6 shadow-md">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight">
              Selamat Datang, {user?.name || 'Pengguna'}!
            </h1>
            <p className="text-blue-100 text-sm mt-1">
              {isSuperAdmin
                ? 'Panel Pemilik - Pantau persetujuan, margin, dan transaksi lintas usaha.'
                : 'Panel Sales - Kelola pesanan, pelanggan, dan follow-up harian Anda.'}
            </p>
          </div>
          {business ? (
            <div className="bg-white/10 backdrop-blur-sm px-4 py-2 rounded-xl flex items-center gap-2 border border-white/20 self-start md:self-auto">
              <Building2 className="w-5 h-5 text-blue-200" />
              <div>
                <div className="text-xs text-blue-200 uppercase font-semibold">
                  Usaha Aktif
                </div>
                <div className="text-sm font-bold">
                  {business.code} - {business.name}
                </div>
              </div>
            </div>
          ) : (
            isSuperAdmin && (
              <div className="bg-amber-400/20 text-amber-200 px-4 py-2 rounded-xl text-xs font-semibold border border-amber-300/30">
                Pilih unit usaha melalui menu di pojok kanan atas.
              </div>
            )
          )}
        </div>
      </div>

      {/* Quick Action Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
        <Link
          href="/orders"
          className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm hover:border-blue-400 transition-all flex items-center gap-4 min-h-[44px]"
        >
          <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
            <ShoppingCart className="w-6 h-6" />
          </div>
          <div>
            <div className="text-base font-bold text-slate-900">
              Daftar Order
            </div>
            <div className="text-xs text-slate-500">
              Buat draft atau pantau pesanan
            </div>
          </div>
        </Link>

        <Link
          href="/customers"
          className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm hover:border-blue-400 transition-all flex items-center gap-4 min-h-[44px]"
        >
          <div className="w-12 h-12 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
            <Users className="w-6 h-6" />
          </div>
          <div>
            <div className="text-base font-bold text-slate-900">
              Pelanggan & CRM
            </div>
            <div className="text-xs text-slate-500">
              Kelola prospek dan customer
            </div>
          </div>
        </Link>

        {isSuperAdmin && (
          <Link
            href="/approvals"
            className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm hover:border-blue-400 transition-all flex items-center gap-4 min-h-[44px]"
          >
            <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <div>
              <div className="text-base font-bold text-slate-900">
                Antrean Approval
              </div>
              <div className="text-xs text-slate-500">
                Setujui order & invoice DP
              </div>
            </div>
          </Link>
        )}
      </div>
    </div>
  );
}
