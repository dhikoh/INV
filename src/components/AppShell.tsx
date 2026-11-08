'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  CheckCircle2,
  ShoppingCart,
  FileText,
  CreditCard,
  Users,
  Package,
  Boxes,
  ClipboardList,
  Truck,
  BarChart3,
  Settings,
  UserCog,
  Bell,
  Receipt,
  Sparkles,
  User,
  LogOut,
  Building2,
  ChevronDown,
  Menu,
  X,
} from 'lucide-react';
import { Skeleton } from './ui/States';

export interface UserContext {
  id: string;
  username: string;
  name: string;
  role: 'SUPERADMIN' | 'SALES';
  businessId: string | null;
  mustChangePassword: boolean;
}

export interface BusinessItem {
  id: string;
  code: string;
  name: string;
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  const [user, setUser] = useState<UserContext | null>(null);
  const [activeBusiness, setActiveBusiness] = useState<BusinessItem | null>(
    null
  );
  const [businesses, setBusinesses] = useState<BusinessItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [unreadCount, setUnreadCount] = useState<number>(0);

  // Load user profile & active business & unread updates
  useEffect(() => {
    async function loadContext() {
      try {
        const res = await fetch('/api/v1/auth/me');
        if (res.status === 401) {
          router.push('/login');
          return;
        }

        const data = await res.json();
        if (data.ok) {
          setUser(data.data.user);

          // Muat info usaha aktif
          const bizRes = await fetch('/api/v1/business');
          if (bizRes.ok) {
            const bizData = await bizRes.json();
            if (bizData.ok && bizData.data) {
              setActiveBusiness(bizData.data);
            }
          }

          // Bila Super Admin, muat daftar seluruh usaha untuk pengalih usaha
          if (data.data.user.role === 'SUPERADMIN') {
            const allBizRes = await fetch('/api/v1/businesses');
            if (allBizRes.ok) {
              const allBizData = await allBizRes.json();
              if (allBizData.ok && Array.isArray(allBizData.data)) {
                setBusinesses(allBizData.data);
              }
            }
          }

          // Muat hitungan pembaruan yang belum dilihat
          const unreadRes = await fetch('/api/v1/updates/unread-count');
          if (unreadRes.ok) {
            const unreadData = await unreadRes.json();
            if (
              unreadData.ok &&
              typeof unreadData.data?.unreadCount === 'number'
            ) {
              setUnreadCount(unreadData.data.unreadCount);
            }
          }
        } else {
          router.push('/login');
        }
      } catch {
        router.push('/login');
      } finally {
        setLoading(false);
      }
    }

    loadContext();
  }, [router]);

  // Saat membuka halaman /updates, set unreadCount menjadi 0
  useEffect(() => {
    if (pathname === '/updates') {
      setUnreadCount(0);
    }
  }, [pathname]);

  async function handleSwitchBusiness(businessId: string) {
    try {
      setSwitching(true);
      const res = await fetch('/api/v1/session/business', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ businessId }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.ok) {
          setActiveBusiness(data.data.business);
          setSwitcherOpen(false);
          router.refresh();
        }
      }
    } finally {
      setSwitching(false);
    }
  }

  async function handleLogout() {
    try {
      await fetch('/api/v1/auth/logout', { method: 'POST' });
    } finally {
      router.push('/login');
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col p-4">
        <Skeleton className="h-16 w-full mb-4" />
        <div className="flex flex-1 gap-4">
          <Skeleton className="hidden md:block w-64 h-full" />
          <Skeleton className="flex-1 h-full" />
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  const isSuperAdmin = user.role === 'SUPERADMIN';

  const superAdminNav = [
    { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
    { label: 'Persetujuan', href: '/approvals', icon: CheckCircle2 },
    { label: 'Order', href: '/orders', icon: ShoppingCart },
    { label: 'Invoice', href: '/invoices', icon: FileText },
    { label: 'Pembayaran', href: '/payments', icon: CreditCard },
    { label: 'Piutang', href: '/receivables', icon: Receipt },
    { label: 'Pengingat', href: '/reminders', icon: Bell },
    { label: 'Pelanggan', href: '/customers', icon: Users },
    { label: 'Produk & Harga', href: '/products', icon: Package },
    { label: 'Stok & Opname', href: '/stock', icon: Boxes },
    { label: 'Purchase Order', href: '/purchase-orders', icon: ClipboardList },
    { label: 'Vendor', href: '/vendors', icon: Truck },
    { label: 'Laporan', href: '/reports', icon: BarChart3 },
    { label: 'Pengaturan Usaha', href: '/settings/business', icon: Settings },
    { label: 'Pengguna', href: '/settings/users', icon: UserCog },
    {
      label: 'Pembaruan',
      href: '/updates',
      icon: Sparkles,
      badge: unreadCount > 0 ? 'Baru' : undefined,
    },
    { label: 'Profil Saya', href: '/profile', icon: User },
  ];

  const salesDesktopNav = [
    { label: 'Beranda', href: '/dashboard', icon: LayoutDashboard },
    { label: 'Order', href: '/orders', icon: ShoppingCart },
    { label: 'Invoice', href: '/invoices', icon: FileText },
    { label: 'Piutang', href: '/receivables', icon: Receipt },
    { label: 'Customer', href: '/customers', icon: Users },
    { label: 'Pengingat', href: '/reminders', icon: Bell },
    {
      label: 'Pembaruan',
      href: '/updates',
      icon: Sparkles,
      badge: unreadCount > 0 ? 'Baru' : undefined,
    },
    { label: 'Profil Saya', href: '/profile', icon: User },
  ];

  const salesNav = [
    { label: 'Beranda', href: '/dashboard', icon: LayoutDashboard },
    { label: 'Order', href: '/orders', icon: ShoppingCart },
    { label: 'Customer', href: '/customers', icon: Users },
    { label: 'Pengingat', href: '/reminders', icon: Bell },
    {
      label: 'Lainnya',
      href: '/profile',
      icon: User,
      hasUnread: unreadCount > 0,
    },
  ];

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col text-slate-900 pb-16 md:pb-0">
      {/* Banner Wajib Ganti Password */}
      {user.mustChangePassword && (
        <div className="bg-amber-500 text-slate-950 px-4 py-2 text-center text-sm font-semibold flex items-center justify-center gap-2 shadow-sm">
          <span>
            ⚠️ Anda wajib mengganti password awal sebelum mengakses fitur
            lainnya.
          </span>
          <Link
            href="/profile"
            className="underline font-bold hover:text-black transition-colors"
          >
            Ganti Sekarang
          </Link>
        </div>
      )}

      {/* Header Utama */}
      <header className="h-16 bg-white border-b border-slate-200 px-4 flex items-center justify-between sticky top-0 z-30">
        <div className="flex items-center gap-3">
          {/* Tombol Menu Mobile untuk Super Admin */}
          {isSuperAdmin && (
            <button
              type="button"
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="md:hidden min-h-[44px] min-w-[44px] flex items-center justify-center text-slate-600 hover:text-slate-900"
              aria-label="Buka menu navigasi"
            >
              {sidebarOpen ? (
                <X className="w-6 h-6" />
              ) : (
                <Menu className="w-6 h-6" />
              )}
            </button>
          )}

          <Link href="/dashboard" className="flex items-center gap-2">
            <span className="font-extrabold text-xl tracking-tight text-blue-600">
              OmniCat
            </span>
            <span className="text-xs px-2 py-0.5 font-bold uppercase rounded bg-slate-100 text-slate-700">
              {isSuperAdmin ? 'Admin' : 'Sales'}
            </span>
          </Link>
        </div>

        {/* Pengalih Usaha (Khusus Super Admin) atau Info Usaha (Sales) & Tautan Cepat */}
        <div className="flex items-center gap-2">
          {isSuperAdmin ? (
            <div className="relative">
              <button
                type="button"
                onClick={() => setSwitcherOpen(!switcherOpen)}
                className="min-h-[44px] flex items-center gap-2 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 text-sm font-medium rounded-lg border border-slate-300 transition-colors"
              >
                <Building2 className="w-4 h-4 text-blue-600" />
                <span className="max-w-[120px] md:max-w-[180px] truncate">
                  {activeBusiness
                    ? `${activeBusiness.code} - ${activeBusiness.name}`
                    : 'Pilih Usaha...'}
                </span>
                <ChevronDown className="w-4 h-4 text-slate-500" />
              </button>

              {/* Dropdown Menu Pengalih Usaha */}
              {switcherOpen && (
                <div className="absolute right-0 mt-2 w-64 bg-white border border-slate-200 rounded-xl shadow-lg z-50 p-2">
                  <div className="text-xs font-semibold text-slate-400 px-3 py-1 uppercase tracking-wider">
                    Pilih Unit Usaha
                  </div>
                  {businesses.length === 0 ? (
                    <div className="px-3 py-2 text-sm text-slate-500">
                      Belum ada usaha terdaftar
                    </div>
                  ) : (
                    <div className="max-h-60 overflow-y-auto space-y-1">
                      {businesses.map((b) => (
                        <button
                          key={b.id}
                          type="button"
                          disabled={switching}
                          onClick={() => handleSwitchBusiness(b.id)}
                          className={`w-full text-left px-3 py-2 text-sm rounded-lg flex items-center justify-between min-h-[44px] ${
                            activeBusiness?.id === b.id
                              ? 'bg-blue-50 text-blue-700 font-bold'
                              : 'hover:bg-slate-100 text-slate-700'
                          }`}
                        >
                          <span className="truncate">
                            <span className="font-mono text-xs px-1.5 py-0.5 bg-slate-200 text-slate-800 rounded mr-2">
                              {b.code}
                            </span>
                            {b.name}
                          </span>
                          {activeBusiness?.id === b.id && (
                            <CheckCircle2 className="w-4 h-4 text-blue-600 shrink-0" />
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2 text-sm font-medium text-slate-700 bg-slate-100 px-3 py-1.5 rounded-lg border border-slate-200">
              <Building2 className="w-4 h-4 text-blue-600" />
              <span className="max-w-[140px] truncate">
                {activeBusiness ? activeBusiness.name : 'Usaha'}
              </span>
            </div>
          )}

          {/* Tombol Tautan Cepat Pembaruan */}
          <Link
            href="/updates"
            title="Catatan Pembaruan"
            className="relative min-h-[44px] min-w-[44px] flex items-center justify-center text-slate-500 hover:text-blue-600 transition-colors rounded-lg"
          >
            <Sparkles className="w-5 h-5" />
            {unreadCount > 0 && (
              <span className="absolute top-2 right-2 flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500"></span>
              </span>
            )}
          </Link>

          {/* Tombol Logout */}
          <button
            type="button"
            onClick={handleLogout}
            title="Keluar"
            className="min-h-[44px] min-w-[44px] flex items-center justify-center text-slate-500 hover:text-red-600 transition-colors rounded-lg"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Konten Utama & Sidebar */}
      <div className="flex flex-1">
        {/* Sidebar Desktop (Super Admin & Sales) */}
        <aside className="hidden md:flex w-64 bg-white border-r border-slate-200 flex-col py-4 px-3 shrink-0">
          <nav className="space-y-1 flex-1">
            {(isSuperAdmin ? superAdminNav : salesDesktopNav).map((item) => {
              const Icon = item.icon;
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium min-h-[44px] transition-colors ${
                    active
                      ? 'bg-blue-600 text-white font-semibold shadow-sm'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Icon className="w-5 h-5 shrink-0" />
                    <span>{item.label}</span>
                  </div>
                  {item.badge && (
                    <span
                      className={`px-1.5 py-0.5 text-[10px] font-bold rounded-full ${
                        active
                          ? 'bg-amber-300 text-slate-950'
                          : 'bg-amber-500 text-slate-950'
                      }`}
                    >
                      {item.badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>
        </aside>

        {/* Drawer Mobile Super Admin */}
        {isSuperAdmin && sidebarOpen && (
          <div className="fixed inset-0 z-40 md:hidden flex">
            <div
              className="fixed inset-0 bg-slate-900/40"
              onClick={() => setSidebarOpen(false)}
            />
            <div className="relative w-72 max-w-[85%] bg-white h-full shadow-2xl flex flex-col p-4 z-50">
              <div className="flex items-center justify-between pb-4 border-b border-slate-200 mb-2">
                <span className="font-bold text-lg text-blue-600">
                  Menu Navigasi
                </span>
                <button
                  type="button"
                  onClick={() => setSidebarOpen(false)}
                  className="min-h-[44px] min-w-[44px] flex items-center justify-center text-slate-500"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>
              <nav className="space-y-1 overflow-y-auto flex-1">
                {superAdminNav.map((item) => {
                  const Icon = item.icon;
                  const active = pathname === item.href;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setSidebarOpen(false)}
                      className={`flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium min-h-[44px] ${
                        active
                          ? 'bg-blue-600 text-white font-semibold'
                          : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <Icon className="w-5 h-5 shrink-0" />
                        <span>{item.label}</span>
                      </div>
                      {item.badge && (
                        <span
                          className={`px-1.5 py-0.5 text-[10px] font-bold rounded-full ${
                            active
                              ? 'bg-amber-300 text-slate-950'
                              : 'bg-amber-500 text-slate-950'
                          }`}
                        >
                          {item.badge}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </nav>
            </div>
          </div>
        )}

        {/* Konten Halaman */}
        <main className="flex-1 p-4 md:p-6 max-w-7xl w-full mx-auto">
          {children}
        </main>
      </div>

      {/* Bar Bawah Khusus Sales (Mobile-first bottom navigation) */}
      {!isSuperAdmin && (
        <nav className="fixed bottom-0 left-0 right-0 h-16 bg-white border-t border-slate-200 flex items-center justify-around z-30 shadow-lg md:hidden">
          {salesNav.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`relative flex flex-col items-center justify-center flex-1 h-full min-h-[44px] ${
                  active ? 'text-blue-600 font-bold' : 'text-slate-500'
                }`}
              >
                <div className="relative">
                  <Icon className="w-5 h-5" />
                  {item.hasUnread && (
                    <span className="absolute -top-1 -right-1 w-2 h-2 bg-amber-500 rounded-full ring-2 ring-white" />
                  )}
                </div>
                <span className="text-[11px] mt-0.5">{item.label}</span>
              </Link>
            );
          })}
        </nav>
      )}
    </div>
  );
}
