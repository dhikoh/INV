'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  User,
  Shield,
  Building2,
  Send,
  KeyRound,
  AlertCircle,
  CheckCircle2,
  Loader2,
  LogOut,
  Sparkles,
} from 'lucide-react';
import { Skeleton } from '@/components/ui/States';

export default function ProfilePage() {
  const router = useRouter();
  const [profile, setProfile] = useState<{
    id: string;
    username: string;
    name: string;
    role: string;
    businessId: string | null;
    mustChangePassword: boolean;
    telegramConnected: boolean;
  } | null>(null);

  const [businessName, setBusinessName] = useState<string>('-');
  const [loading, setLoading] = useState(true);

  // Form ganti password
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Integrasi Telegram link code
  const [linkCodeData, setLinkCodeData] = useState<{
    code: string;
    expiresAt: string;
    linkUrl: string;
  } | null>(null);
  const [generatingCode, setGeneratingCode] = useState(false);
  const [unlinkingTelegram, setUnlinkingTelegram] = useState(false);
  const [telegramMessage, setTelegramMessage] = useState<string | null>(null);

  useEffect(() => {
    async function loadProfile() {
      try {
        const [meRes, bizRes] = await Promise.all([
          fetch('/api/v1/auth/me'),
          fetch('/api/v1/business'),
        ]);

        if (meRes.ok) {
          const meData = await meRes.json();
          setProfile({
            ...meData.data.user,
            telegramConnected: meData.data.telegramConnected,
          });
        }
        if (bizRes.ok) {
          const bizData = await bizRes.json();
          if (bizData.data) {
            setBusinessName(`${bizData.data.code} - ${bizData.data.name}`);
          }
        }
      } finally {
        setLoading(false);
      }
    }

    loadProfile();
  }, []);

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (newPassword.length < 10) {
      setError('Password baru minimal 10 karakter.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Konfirmasi password tidak cocok.');
      return;
    }

    if (
      profile &&
      newPassword.toLowerCase() === profile.username.toLowerCase()
    ) {
      setError('Password baru tidak boleh sama dengan username.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/v1/auth/change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ currentPassword, newPassword }),
      });

      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data?.error?.message || 'Gagal mengubah password.');
        return;
      }

      setSuccess('Password berhasil diubah. Sesi lain telah dicabut.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');

      if (profile) {
        setProfile({ ...profile, mustChangePassword: false });
      }
    } catch {
      setError('Terjadi kesalahan jaringan.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleGenerateTelegramCode() {
    try {
      setGeneratingCode(true);
      setTelegramMessage(null);
      const res = await fetch('/api/v1/auth/telegram/link-code', {
        method: 'POST',
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        setLinkCodeData(data.data);
      } else {
        setTelegramMessage(
          data?.error?.message || 'Gagal membuat kode tautan Telegram.'
        );
      }
    } catch {
      setTelegramMessage('Terjadi kesalahan jaringan.');
    } finally {
      setGeneratingCode(false);
    }
  }

  async function handleUnlinkTelegram() {
    if (!confirm('Apakah Anda yakin ingin memutuskan tautan bot Telegram?')) {
      return;
    }
    try {
      setUnlinkingTelegram(true);
      setTelegramMessage(null);
      const res = await fetch('/api/v1/auth/telegram', {
        method: 'DELETE',
      });
      if (res.ok) {
        setProfile((prev) =>
          prev ? { ...prev, telegramConnected: false } : null
        );
        setLinkCodeData(null);
        setTelegramMessage('Tautan Telegram berhasil diputuskan.');
      }
    } catch {
      setTelegramMessage('Terjadi kesalahan jaringan.');
    } finally {
      setUnlinkingTelegram(false);
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
      <div className="space-y-4 max-w-2xl mx-auto">
        <Skeleton className="h-44 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!profile) {
    return null;
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Peringatan Wajib Ganti Password */}
      {profile.mustChangePassword && (
        <div className="p-4 bg-amber-50 border border-amber-300 rounded-2xl flex items-start gap-3 text-amber-900">
          <AlertCircle className="w-6 h-6 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <h3 className="font-bold text-sm">Ganti Password Wajib</h3>
            <p className="text-xs text-amber-800 mt-0.5">
              Akun Anda menggunakan password sementara dari sistem. Anda wajib
              mengganti password sebelum dapat menggunakan fitur transaksi
              lainnya.
            </p>
          </div>
        </div>
      )}

      {/* Informasi Profil */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <div className="flex items-center gap-4 pb-6 border-b border-slate-100">
          <div className="w-16 h-16 rounded-2xl bg-blue-100 text-blue-600 flex items-center justify-center font-bold text-2xl shrink-0">
            {profile.name.charAt(0).toUpperCase()}
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-900">{profile.name}</h2>
            <p className="text-sm text-slate-500 font-mono">
              @{profile.username}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-6">
          <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl">
            <Shield className="w-5 h-5 text-blue-600 shrink-0" />
            <div>
              <div className="text-xs text-slate-400 font-medium">
                Peran Pengguna
              </div>
              <div className="text-sm font-bold text-slate-800">
                {profile.role === 'SUPERADMIN'
                  ? 'Super Admin'
                  : 'Sales Lapangan'}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl">
            <Building2 className="w-5 h-5 text-indigo-600 shrink-0" />
            <div>
              <div className="text-xs text-slate-400 font-medium">
                Unit Usaha
              </div>
              <div className="text-sm font-bold text-slate-800 truncate">
                {businessName}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl">
            <Send className="w-5 h-5 text-sky-500 shrink-0" />
            <div>
              <div className="text-xs text-slate-400 font-medium">
                Integrasi Telegram
              </div>
              <div className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
                {profile.telegramConnected ? (
                  <>
                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                    <span>Terhubung</span>
                  </>
                ) : (
                  <>
                    <span className="w-2 h-2 rounded-full bg-slate-300" />
                    <span className="text-slate-500">Belum Terhubung</span>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl">
            <User className="w-5 h-5 text-slate-500 shrink-0" />
            <div>
              <div className="text-xs text-slate-400 font-medium">
                ID Pengguna
              </div>
              <div className="text-xs font-mono text-slate-600 truncate">
                {profile.id}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Integrasi Telegram */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center font-bold">
              <Send className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base text-slate-900">
                Notifikasi & Bot Telegram
              </h3>
              <p className="text-xs text-slate-500">
                Hubungkan bot Telegram untuk menerima notifikasi order dan approval
              </p>
            </div>
          </div>

          <div>
            {profile.telegramConnected ? (
              <span className="px-2.5 py-1 text-xs font-bold rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                Terhubung
              </span>
            ) : (
              <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-slate-100 text-slate-600">
                Belum Terhubung
              </span>
            )}
          </div>
        </div>

        {telegramMessage && (
          <div className="p-3 bg-sky-50 border border-sky-200 text-sky-800 rounded-xl text-xs font-medium">
            {telegramMessage}
          </div>
        )}

        {profile.telegramConnected ? (
          <div className="flex items-center justify-between pt-2">
            <p className="text-xs text-slate-600">
              Akun Anda sudah terhubung dengan bot Telegram resmi OmniCat.
            </p>
            <button
              type="button"
              disabled={unlinkingTelegram}
              onClick={handleUnlinkTelegram}
              className="h-10 px-4 rounded-xl border border-rose-200 text-rose-600 hover:bg-rose-50 text-xs font-bold transition-colors disabled:opacity-50"
            >
              {unlinkingTelegram ? 'Memproses...' : 'Putuskan Tautan'}
            </button>
          </div>
        ) : (
          <div className="space-y-4 pt-1">
            {!linkCodeData ? (
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <p className="text-xs text-slate-600">
                  Dapatkan notifikasi instan langsung di Telegram Anda dengan menghubungkan bot.
                </p>
                <button
                  type="button"
                  disabled={generatingCode}
                  onClick={handleGenerateTelegramCode}
                  className="h-10 px-4 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-colors shrink-0 disabled:opacity-50 shadow-sm"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>{generatingCode ? 'Membuat Kode...' : 'Hubungkan Telegram'}</span>
                </button>
              </div>
            ) : (
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                <div className="text-xs text-slate-600">
                  Kode tautan Anda (berlaku 10 menit):
                </div>
                <div className="flex items-center justify-between gap-3">
                  <div className="text-2xl font-mono font-extrabold tracking-wider text-slate-900 bg-white px-4 py-2 rounded-lg border border-slate-300">
                    {linkCodeData.code}
                  </div>
                  <a
                    href={linkCodeData.linkUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="h-11 px-5 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-xs font-bold flex items-center gap-2 transition-colors shadow-sm"
                  >
                    <Send className="w-4 h-4" />
                    <span>Buka Bot di Telegram</span>
                  </a>
                </div>
                <p className="text-[11px] text-slate-500">
                  Kirim perintah <code>/start {linkCodeData.code}</code> ke bot atau klik tombol di atas.
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Formulir Ganti Password */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-700">
            <KeyRound className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold text-base text-slate-900">
              Ganti Password
            </h3>
            <p className="text-xs text-slate-500">
              Gunakan minimal 10 karakter dan jangan samakan dengan username.
            </p>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-sm flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <span>{success}</span>
          </div>
        )}

        <form onSubmit={handleChangePassword} className="space-y-4">
          <div>
            <label
              htmlFor="currentPassword"
              className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1"
            >
              Password Saat Ini
            </label>
            <input
              id="currentPassword"
              type="password"
              required
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="Masukkan password saat ini"
              className="w-full px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-base text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white min-h-[44px]"
            />
          </div>

          <div>
            <label
              htmlFor="newPassword"
              className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1"
            >
              Password Baru (Minimal 10 Karakter)
            </label>
            <input
              id="newPassword"
              type="password"
              required
              minLength={10}
              maxLength={128}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Masukkan password baru"
              className="w-full px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-base text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white min-h-[44px]"
            />
          </div>

          <div>
            <label
              htmlFor="confirmPassword"
              className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1"
            >
              Ulangi Password Baru
            </label>
            <input
              id="confirmPassword"
              type="password"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Ulangi password baru"
              className="w-full px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-base text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white min-h-[44px]"
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full min-h-[44px] py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow transition-colors flex items-center justify-center gap-2 disabled:opacity-50 text-sm"
          >
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Menyimpan...</span>
              </>
            ) : (
              <span>Simpan Password Baru</span>
            )}
          </button>
        </form>
      </div>

      {/* Akses Cepat Menu Sales (Mobile & Tablet) */}
      {profile?.role === 'SALES' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 md:p-6">
          <div className="mb-3">
            <h3 className="text-base font-bold text-slate-900">
              Akses Cepat Menu Sales
            </h3>
            <p className="text-xs text-slate-500">
              Pintasan cepat untuk menu operasional lapangan pada layar ponsel
            </p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            {[
              { href: '/orders/new', label: 'Buat Pesanan' },
              { href: '/invoices', label: 'Daftar Invoice' },
              { href: '/receivables', label: 'Piutang Pelanggan' },
              { href: '/catalogs', label: 'Katalog Produk' },
              { href: '/products', label: 'Master Produk' },
              { href: '/price-list', label: 'Daftar Harga' },
              { href: '/reports/crm', label: 'Laporan CRM' },
              { href: '/reminders', label: 'Pengingat Tagihan' },
            ].map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="min-h-[44px] px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-800 text-xs font-semibold flex items-center justify-center text-center transition-colors"
              >
                {item.label}
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Tautan Catatan Pembaruan */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 md:p-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900">
              Catatan Pembaruan Sistem
            </h3>
            <p className="text-xs text-slate-500">
              Lihat riwayat fitur baru dan perbaikan aplikasi OmniCat
            </p>
          </div>
        </div>
        <Link
          href="/updates"
          className="min-h-[44px] px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 text-sm font-semibold rounded-xl transition-colors flex items-center justify-center shrink-0"
        >
          Buka
        </Link>
      </div>

      {/* Tombol Logout */}
      <div className="pt-2">
        <button
          type="button"
          onClick={handleLogout}
          className="w-full min-h-[44px] py-3 px-4 bg-white border border-red-200 text-red-600 hover:bg-red-50 font-bold rounded-xl transition-colors flex items-center justify-center gap-2 text-sm shadow-sm"
        >
          <LogOut className="w-5 h-5" />
          <span>Keluar dari Aplikasi</span>
        </button>
      </div>
    </div>
  );
}
