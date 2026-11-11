import React from 'react';
import Link from 'next/link';
import { FileQuestion, ArrowLeft } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4 text-center">
      <div className="w-16 h-16 rounded-2xl bg-blue-100 text-blue-600 flex items-center justify-center mx-auto mb-4 shadow-sm">
        <FileQuestion className="w-8 h-8" />
      </div>
      <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
        404 - Halaman Tidak Ditemukan
      </h1>
      <p className="text-sm text-slate-600 max-w-sm mt-2 mb-6 leading-relaxed">
        Maaf, halaman atau dokumen yang Anda cari tidak tersedia, telah dihapus,
        atau tautan yang Anda tuju salah.
      </p>
      <Link
        href="/dashboard"
        className="inline-flex items-center gap-2 min-h-[44px] px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold shadow-sm transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        <span>Kembali ke Dashboard</span>
      </Link>
    </div>
  );
}
