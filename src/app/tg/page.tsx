'use client';

import React, { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  Loader2,
  CheckCircle2,
  AlertTriangle,
  UserX,
  LogIn,
  RefreshCw,
  ExternalLink,
} from 'lucide-react';
import { useTelegramWebApp } from '@/lib/telegram/useTelegramWebApp';

type AuthState =
  | { status: 'idle' | 'loading' }
  | { status: 'success'; targetUrl: string }
  | { status: 'unlinked' }
  | { status: 'not_in_telegram' }
  | { status: 'error'; message: string };

function TelegramEntryContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { webApp, isReady } = useTelegramWebApp();
  const [state, setState] = useState<AuthState>({ status: 'idle' });

  useEffect(() => {
    if (!isReady) return;

    const initData = webApp?.initData;
    if (!initData || initData.trim() === '') {
      setState({ status: 'not_in_telegram' });
      return;
    }

    let isMounted = true;
    setState({ status: 'loading' });

    async function authenticate() {
      try {
        const res = await fetch('/api/v1/auth/telegram', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ initData }),
        });

        const json = await res.json().catch(() => null);

        if (!isMounted) return;

        if (res.ok && json?.ok) {
          const rawRedirect = searchParams.get('redirect');
          const isValidRedirect =
            rawRedirect &&
            rawRedirect.startsWith('/') &&
            !rawRedirect.startsWith('//');
          const targetUrl = isValidRedirect ? rawRedirect : '/dashboard';

          setState({ status: 'success', targetUrl });
          router.replace(targetUrl);
          return;
        }

        if (res.status === 401 && json?.error?.code === 'TELEGRAM_NOT_LINKED') {
          setState({ status: 'unlinked' });
          return;
        }

        const message =
          json?.error?.message ||
          'Gagal memverifikasi identitas Telegram Anda. Silakan coba kembali.';
        setState({ status: 'error', message });
      } catch {
        if (!isMounted) return;
        setState({
          status: 'error',
          message: 'Terjadi kendala jaringan saat menghubungkan ke server.',
        });
      }
    }

    authenticate();

    return () => {
      isMounted = false;
    };
  }, [isReady, webApp, searchParams, router]);

  if (state.status === 'idle' || state.status === 'loading') {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center p-6 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-100 text-indigo-600 shadow-sm">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
        <h1 className="mt-6 text-xl font-bold tracking-tight text-slate-900">
          Menghubungkan ke OmniCat
        </h1>
        <p className="mt-2 text-sm text-slate-500 max-w-xs">
          Memverifikasi sesi aman akun Telegram Anda...
        </p>
      </main>
    );
  }

  if (state.status === 'success') {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center p-6 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-600 shadow-sm">
          <CheckCircle2 className="h-8 w-8" />
        </div>
        <h1 className="mt-6 text-xl font-bold tracking-tight text-slate-900">
          Autentikasi Berhasil
        </h1>
        <p className="mt-2 text-sm text-slate-500 max-w-xs">
          Mengarahkan Anda ke dalam aplikasi...
        </p>
      </main>
    );
  }

  if (state.status === 'unlinked') {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center p-6 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-100 text-amber-600 shadow-sm">
          <UserX className="h-8 w-8" />
        </div>
        <h1 className="mt-6 text-xl font-bold tracking-tight text-slate-900">
          Akun Belum Terhubung
        </h1>
        <p className="mt-2 text-sm text-slate-600 max-w-md">
          Akun Telegram Anda belum ditautkan ke akun pengguna OmniCat manapun.
        </p>

        <div className="mt-6 w-full max-w-sm rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Cara Menghubungkan:
          </h2>
          <ol className="mt-3 list-decimal pl-4 space-y-2 text-xs text-slate-700 leading-relaxed">
            <li>Buka OmniCat di peramban web (browser).</li>
            <li>Masuk menggunakan nama pengguna dan kata sandi Anda.</li>
            <li>Buka menu <strong>Pengaturan Profil</strong>.</li>
            <li>
              Pilih <strong>Hubungkan Telegram</strong> dan ikuti petunjuk bot.
            </li>
          </ol>
        </div>

        <div className="mt-6 flex flex-col gap-3 w-full max-w-sm">
          <Link
            href="/login"
            className="flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 transition-colors"
          >
            <LogIn className="h-4 w-4" />
            Buka Halaman Login Web
          </Link>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 transition-colors"
          >
            <RefreshCw className="h-4 w-4" />
            Coba Autentikasi Lagi
          </button>
        </div>
      </main>
    );
  }

  if (state.status === 'not_in_telegram') {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center p-6 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600 shadow-sm">
          <ExternalLink className="h-8 w-8" />
        </div>
        <h1 className="mt-6 text-xl font-bold tracking-tight text-slate-900">
          Telegram Mini App
        </h1>
        <p className="mt-2 text-sm text-slate-600 max-w-md">
          Halaman ini dirancang untuk diakses melalui Telegram Mini App OmniCat.
          Silakan buka melalui aplikasi bot Telegram resmi kami atau masuk lewat
          peramban biasa.
        </p>

        <div className="mt-6 flex flex-col gap-3 w-full max-w-sm">
          <Link
            href="/login"
            className="flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 transition-colors"
          >
            <LogIn className="h-4 w-4" />
            Buka Halaman Login Web
          </Link>
        </div>
      </main>
    );
  }

  const errorMessage =
    state.status === 'error'
      ? state.message
      : 'Terjadi kendala saat menghubungkan ke akun Telegram Anda.';

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-6 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-rose-100 text-rose-600 shadow-sm">
        <AlertTriangle className="h-8 w-8" />
      </div>
      <h1 className="mt-6 text-xl font-bold tracking-tight text-slate-900">
        Kendala Autentikasi
      </h1>
      <p className="mt-2 text-sm text-slate-600 max-w-md">
        {errorMessage}
      </p>

      <div className="mt-6 flex flex-col gap-3 w-full max-w-sm">
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 transition-colors"
        >
          <RefreshCw className="h-4 w-4" />
          Coba Lagi
        </button>
        <Link
          href="/login"
          className="flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 transition-colors"
        >
          <LogIn className="h-4 w-4" />
          Buka Halaman Login Web
        </Link>
      </div>
    </main>
  );
}

export default function TelegramEntryPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen flex-col items-center justify-center p-6 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-100 text-indigo-600 shadow-sm">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
          <h1 className="mt-6 text-xl font-bold tracking-tight text-slate-900">
            Menyiapkan OmniCat Mini App...
          </h1>
        </div>
      }
    >
      <TelegramEntryContent />
    </Suspense>
  );
}
