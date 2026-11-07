'use client';

import React, { useState, useEffect } from 'react';
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
