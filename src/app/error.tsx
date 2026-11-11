'use client';

import React, { useEffect } from 'react';
import Link from 'next/link';
import { AlertTriangle, RotateCcw, Home } from 'lucide-react';

export default function GlobalErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log error secara aman
    console.error('Next.js Global Error Boundary:', error);
  }, [error]);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4 text-center">
      <div className="w-16 h-16 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center mx-auto mb-4 shadow-sm">
        <AlertTriangle className="w-8 h-8" />
      </div>
      <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
        Terjadi Kesalahan Sistem
      </h1>
      <p className="text-sm text-slate-600 max-w-md mt-2 mb-6 leading-relaxed">
        {error.message ||
          'Aplikasi mendeteksi kendala runtime yang tidak terduga saat memproses halaman ini.'}
      </p>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={() => reset()}
          className="inline-flex items-center gap-2 min-h-[44px] px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold shadow-sm transition-colors"
        >
          <RotateCcw className="w-4 h-4" />
          <span>Muat Ulang Halaman</span>
        </button>
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 min-h-[44px] px-5 py-2.5 bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 rounded-xl text-sm font-semibold shadow-sm transition-colors"
        >
          <Home className="w-4 h-4" />
          <span>Ke Dashboard</span>
        </Link>
      </div>
    </div>
  );
}
