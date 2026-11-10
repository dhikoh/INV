'use client';

import React, { Suspense, useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Loader2,
  FileText,
  ShieldAlert,
  Send,
  AlertCircle,
} from 'lucide-react';
import { useTelegramWebApp } from '@/lib/telegram/useTelegramWebApp';
import { formatRupiah } from '@/lib/domain/money';

interface InvoiceDetail {
  id: string;
  number: string | null;
  type: 'DP' | 'FINAL';
  status: string;
  amount: number;
  paidAmount: number;
  dueDate: string | null;
  customer?: {
    id: string;
    code: string;
    name: string;
  };
  order?: {
    id: string;
    orderNo: string | null;
    grandTotal: number;
    hasBelowMin: boolean;
    belowMinReason: string | null;
    sales?: {
      id: string;
      name: string;
    } | null;
    items?: Array<{
      id: string;
      productName: string;
      qty: number;
      unit: string;
      unitPrice: number;
      lineNet: number;
      belowMin?: boolean;
    }>;
  };
}

function ApprovalContent() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { webApp, isReady } = useTelegramWebApp();

  const invoiceId = params?.id as string;
  const initialReject = searchParams.get('reject') === '1';

  const [authStatus, setAuthStatus] = useState<'checking' | 'authenticated' | 'unauthorized' | 'not_in_telegram' | 'error'>('checking');
  const [invoice, setInvoice] = useState<InvoiceDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Form states
  const [showRejectForm, setShowRejectForm] = useState(initialReject);
  const [rejectReason, setRejectReason] = useState('');
  const [overrideNote, setOverrideNote] = useState('');
  const [showApproveModal, setShowApproveModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [successAction, setSuccessAction] = useState<'APPROVED' | 'REJECTED' | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  const rejectTextareaRef = useRef<HTMLTextAreaElement | null>(null);

  // 1. Inisialisasi Otentikasi & Verifikasi Super Admin
  useEffect(() => {
    let isMounted = true;

    async function initAuth() {
      try {
        // Cek sesi aktif terlebih dahulu
        const meRes = await fetch('/api/v1/auth/me');
        if (meRes.ok) {
          const meData = await meRes.json();
          if (meData?.data?.user) {
            const user = meData.data.user;
            if (user.role !== 'SUPERADMIN') {
              if (isMounted) setAuthStatus('unauthorized');
              return;
            }
            if (isMounted) {
              setAuthStatus('authenticated');
            }
            return;
          }
        }

        // Jika belum ada sesi dan ada initData dari Telegram WebApp
        const initData = webApp?.initData;
        if (!initData || initData.trim() === '') {
          if (isMounted) setAuthStatus('not_in_telegram');
          return;
        }

        const authRes = await fetch('/api/v1/auth/telegram', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ initData }),
        });

        const authJson = await authRes.json().catch(() => null);

        if (!isMounted) return;

        if (authRes.ok && authJson?.ok && authJson?.user) {
          if (authJson.user.role !== 'SUPERADMIN') {
            setAuthStatus('unauthorized');
            return;
          }
          setAuthStatus('authenticated');
        } else {
          setAuthStatus('error');
          setErrorMsg(authJson?.error?.message || 'Gagal memverifikasi kredensial Telegram Anda.');
        }
      } catch {
        if (!isMounted) return;
        setAuthStatus('error');
        setErrorMsg('Terjadi kendala jaringan saat menghubungkan ke server.');
      }
    }

    if (isReady || typeof window !== 'undefined') {
      initAuth();
    }

    return () => {
      isMounted = false;
    };
  }, [isReady, webApp]);

  // 2. Fetch Detail Invoice
  const fetchInvoiceDetail = useCallback(async () => {
    if (!invoiceId) return;
    setLoading(true);
    setErrorMsg(null);

    try {
      const res = await fetch(`/api/v1/invoices/${invoiceId}`);
      const json = await res.json();

      if (res.ok && json?.data) {
        setInvoice(json.data);
      } else {
        setErrorMsg(json?.error?.message || 'Faktur tidak ditemukan atau tidak dapat diakses.');
      }
    } catch {
      setErrorMsg('Gagal memuat detail faktur dari server.');
    } finally {
      setLoading(false);
    }
  }, [invoiceId]);

  useEffect(() => {
    if (authStatus === 'authenticated') {
      fetchInvoiceDetail();
    }
  }, [authStatus, fetchInvoiceDetail]);

  // 3. Auto-focus Form Tolak bila ?reject=1
  useEffect(() => {
    if (showRejectForm && rejectTextareaRef.current) {
      rejectTextareaRef.current.focus();
    }
  }, [showRejectForm]);

  // 4. Handler Persetujuan (Approve)
  async function handleApprove() {
    if (!invoice) return;

    if (invoice.order?.hasBelowMin && (!overrideNote || overrideNote.trim().length < 5)) {
      setValidationError('Pesanan memiliki harga di bawah minimal. Catatan pimpinan wajib diisi minimal 5 karakter.');
      return;
    }

    setSubmitting(true);
    setValidationError(null);

    try {
      const res = await fetch(`/api/v1/invoices/${invoice.id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          overrideNote: overrideNote.trim() ? overrideNote.trim() : undefined,
          theme: 'PROFESIONAL',
        }),
      });

      const json = await res.json();

      if (res.ok) {
        setSuccessAction('APPROVED');
        setShowApproveModal(false);
      } else {
        setValidationError(json?.error?.message || 'Gagal menyetujui faktur.');
      }
    } catch {
      setValidationError('Terjadi kesalahan jaringan saat memproses persetujuan.');
    } finally {
      setSubmitting(false);
    }
  }

  // 5. Handler Penolakan (Reject)
  async function handleReject() {
    if (!invoice) return;

    if (!rejectReason || rejectReason.trim().length < 5) {
      setValidationError('Alasan penolakan wajib diisi minimal 5 karakter.');
      if (rejectTextareaRef.current) {
        rejectTextareaRef.current.focus();
      }
      return;
    }

    setSubmitting(true);
    setValidationError(null);

    try {
      const res = await fetch(`/api/v1/invoices/${invoice.id}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reason: rejectReason.trim(),
        }),
      });

      const json = await res.json();

      if (res.ok) {
        setSuccessAction('REJECTED');
        setShowRejectForm(false);
      } else {
        setValidationError(json?.error?.message || 'Gagal menolak faktur.');
      }
    } catch {
      setValidationError('Terjadi kesalahan jaringan saat memproses penolakan.');
    } finally {
      setSubmitting(false);
    }
  }

  function handleCloseTelegram() {
    if (webApp && typeof webApp.close === 'function') {
      webApp.close();
    } else {
      router.push('/dashboard');
    }
  }

  // Tampilan Cek Otentikasi
  if (authStatus === 'checking') {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center p-6 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-100 text-indigo-600">
          <Loader2 className="h-7 w-7 animate-spin" />
        </div>
        <h1 className="mt-4 text-base font-semibold text-slate-900">Memeriksa Hak Akses Super Admin...</h1>
      </main>
    );
  }

  // Tampilan Ditolak (Bukan Super Admin)
  if (authStatus === 'unauthorized') {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center p-6 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-red-100 text-red-600">
          <ShieldAlert className="h-7 w-7" />
        </div>
        <h1 className="mt-4 text-lg font-bold text-slate-900">Akses Ditolak (403)</h1>
        <p className="mt-2 text-sm text-slate-600">
          Halaman persetujuan faktur ini dikhususkan bagi peran <strong>Super Admin</strong>.
        </p>
        <button
          onClick={handleCloseTelegram}
          className="mt-6 rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-white shadow hover:bg-slate-700"
        >
          Tutup
        </button>
      </main>
    );
  }

  // Tampilan Error / Not in Telegram
  if (authStatus === 'error' || authStatus === 'not_in_telegram') {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center p-6 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-100 text-amber-600">
          <AlertTriangle className="h-7 w-7" />
        </div>
        <h1 className="mt-4 text-lg font-bold text-slate-900">Autentikasi Telegram Diperlukan</h1>
        <p className="mt-2 text-sm text-slate-600">
          {errorMsg || 'Buka halaman ini melalui tombol di bot Telegram resmi OmniCat atau masuk dengan akun Super Admin Anda.'}
        </p>
        <button
          onClick={() => router.push('/login')}
          className="mt-6 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow hover:bg-indigo-700"
        >
          Masuk ke Aplikasi Web
        </button>
      </main>
    );
  }

  // Tampilan Loading Detail
  if (loading) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center p-6 text-center">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
        <p className="mt-3 text-sm text-slate-600">Memuat detail faktur...</p>
      </main>
    );
  }

  // Tampilan Sukses Aksi
  if (successAction) {
    const isApproved = successAction === 'APPROVED';
    return (
      <main className="flex min-h-screen flex-col items-center justify-center p-6 text-center">
        <div
          className={`flex h-16 w-16 items-center justify-center rounded-2xl ${
            isApproved ? 'bg-emerald-100 text-emerald-600' : 'bg-red-100 text-red-600'
          }`}
        >
          {isApproved ? <CheckCircle2 className="h-9 w-9" /> : <XCircle className="h-9 w-9" />}
        </div>
        <h1 className="mt-4 text-lg font-bold text-slate-900">
          {isApproved ? 'Faktur Berhasil Disetujui' : 'Faktur Telah Ditolak'}
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          {isApproved
            ? `Faktur resmi #${invoice?.number || ''} telah diterbitkan dan nomor pesanan telah dialokasikan.`
            : `Faktur ditolak dengan alasan: "${rejectReason}". Staf Sales telah menerima notifikasi revisi.`}
        </p>
        <button
          onClick={handleCloseTelegram}
          className="mt-6 w-full max-w-xs rounded-xl bg-slate-900 py-3 text-sm font-semibold text-white shadow hover:bg-slate-800"
        >
          Tutup Mini App
        </button>
      </main>
    );
  }

  if (errorMsg || !invoice) {
    return (
      <main className="p-6 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-red-100 text-red-600">
          <AlertCircle className="h-7 w-7" />
        </div>
        <h1 className="mt-4 text-base font-bold text-slate-900">Kendala Memuat Faktur</h1>
        <p className="mt-2 text-sm text-slate-600">{errorMsg || 'Faktur tidak ditemukan.'}</p>
        <button
          onClick={handleCloseTelegram}
          className="mt-6 rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-white"
        >
          Kembali
        </button>
      </main>
    );
  }

  const isPending = invoice.status === 'PENDING_APPROVAL';

  return (
    <div className="mx-auto max-w-md p-4 pb-20">
      {/* Header */}
      <header className="mb-4 flex items-center justify-between border-b border-slate-200 pb-3">
        <div className="flex items-center gap-2">
          <FileText className="h-5 w-5 text-indigo-600" />
          <h1 className="text-base font-bold text-slate-900">
            Persetujuan Faktur {invoice.type === 'DP' ? 'Uang Muka (DP)' : 'Pelunasan'}
          </h1>
        </div>
        <span
          className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
            isPending ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-700'
          }`}
        >
          {invoice.status}
        </span>
      </header>

      {/* Pesan Kesalahan Validasi */}
      {validationError && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <div className="flex items-center gap-2 font-semibold">
            <AlertCircle className="h-4 w-4" />
            Perhatian
          </div>
          <p className="mt-1">{validationError}</p>
        </div>
      )}

      {/* Peringatan Harga di Bawah Minimal */}
      {invoice.order?.hasBelowMin && (
        <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 p-3.5 text-sm text-amber-900 shadow-sm">
          <div className="flex items-center gap-2 font-bold text-amber-800">
            <AlertTriangle className="h-5 w-5 text-amber-600" />
            Harga Jual di Bawah Batas Minimal
          </div>
          <p className="mt-1 text-xs text-amber-800">
            Pesanan ini memuat barang dengan harga di bawah batas dasar. Persetujuan mewajibkan catatan pertimbangan pimpinan.
          </p>
          {invoice.order.belowMinReason && (
            <p className="mt-2 text-xs italic text-amber-900 bg-amber-100/60 p-2 rounded">
              Alasan Sales: &quot;{invoice.order.belowMinReason}&quot;
            </p>
          )}
        </div>
      )}

      {/* Kartu Ringkasan Finansial */}
      <section className="mb-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="text-xs font-medium text-slate-500">Nilai Tagihan Faktur</div>
        <div className="mt-1 text-2xl font-extrabold text-slate-900">{formatRupiah(invoice.amount)}</div>

        <div className="mt-3 grid grid-cols-2 gap-2 border-t border-slate-100 pt-3 text-xs">
          <div>
            <span className="text-slate-500">Pelanggan:</span>
            <div className="font-semibold text-slate-800">{invoice.customer?.name || '-'}</div>
          </div>
          <div>
            <span className="text-slate-500">Sales:</span>
            <div className="font-semibold text-slate-800">{invoice.order?.sales?.name || '-'}</div>
          </div>
          <div>
            <span className="text-slate-500">No. Pesanan:</span>
            <div className="font-mono font-medium text-slate-700">{invoice.order?.orderNo || 'DRAF'}</div>
          </div>
          <div>
            <span className="text-slate-500">Total Pesanan:</span>
            <div className="font-semibold text-slate-800">{formatRupiah(invoice.order?.grandTotal || 0)}</div>
          </div>
        </div>
      </section>

      {/* Rincian Barang */}
      {invoice.order?.items && invoice.order.items.length > 0 && (
        <section className="mb-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-500">Rincian Barang</h2>
          <div className="divide-y divide-slate-100">
            {invoice.order.items.map((item) => (
              <div key={item.id} className="py-2.5 text-xs first:pt-0 last:pb-0">
                <div className="flex justify-between font-semibold text-slate-800">
                  <span>{item.productName}</span>
                  <span>{formatRupiah(item.lineNet)}</span>
                </div>
                <div className="mt-0.5 flex justify-between text-slate-500">
                  <span>
                    {item.qty} {item.unit} &times; {formatRupiah(item.unitPrice)}
                  </span>
                  {item.belowMin && (
                    <span className="rounded bg-red-100 px-1.5 py-0.5 font-bold text-red-700">Di Bawah Min</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Form Penolakan */}
      {showRejectForm && (
        <section className="mb-4 rounded-2xl border border-red-200 bg-red-50/50 p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-red-900">Form Alasan Penolakan</h2>
            <button
              onClick={() => setShowRejectForm(false)}
              className="text-xs text-slate-500 hover:text-slate-800"
            >
              Batal
            </button>
          </div>
          <p className="mt-1 text-xs text-slate-600">
            Tuliskan instruksi atau alasan penolakan untuk staf Sales (minimal 5 karakter):
          </p>
          <textarea
            ref={rejectTextareaRef}
            rows={3}
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="Contoh: Diskon terlalu tinggi, mohon sesuaikan kembali..."
            className="mt-2.5 w-full rounded-xl border border-red-300 bg-white p-3 text-xs text-slate-900 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
          />
          <button
            onClick={handleReject}
            disabled={submitting || rejectReason.trim().length < 5}
            className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl bg-red-600 py-2.5 text-xs font-bold text-white shadow hover:bg-red-700 disabled:opacity-50"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Kirim Penolakan ke Sales
          </button>
        </section>
      )}

      {/* Modal Input Catatan Override Harga Bawah Min */}
      {showApproveModal && (
        <section className="mb-4 rounded-2xl border border-indigo-200 bg-indigo-50/50 p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-indigo-900">Catatan Persetujuan Khusus</h2>
            <button
              onClick={() => setShowApproveModal(false)}
              className="text-xs text-slate-500 hover:text-slate-800"
            >
              Batal
            </button>
          </div>
          <p className="mt-1 text-xs text-slate-600">
            Karena ada harga di bawah minimal, berikan catatan otorisasi pimpinan (minimal 5 karakter):
          </p>
          <textarea
            rows={2}
            value={overrideNote}
            onChange={(e) => setOverrideNote(e.target.value)}
            placeholder="Contoh: Disetujui khusus untuk cuci gudang akhir tahun..."
            className="mt-2.5 w-full rounded-xl border border-indigo-300 bg-white p-3 text-xs text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
          <button
            onClick={handleApprove}
            disabled={submitting || overrideNote.trim().length < 5}
            className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl bg-emerald-600 py-2.5 text-xs font-bold text-white shadow hover:bg-emerald-700 disabled:opacity-50"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            Konfirmasi Setujui Faktur
          </button>
        </section>
      )}

      {/* Tombol Aksi Utama (Bila Status Masih PENDING_APPROVAL) */}
      {isPending && !showRejectForm && !showApproveModal && (
        <div className="fixed bottom-0 left-0 right-0 z-10 border-t border-slate-200 bg-white/95 p-3 backdrop-blur">
          <div className="mx-auto flex max-w-md gap-2">
            <button
              onClick={() => {
                setShowRejectForm(true);
                setShowApproveModal(false);
              }}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-red-300 bg-red-50 py-3 text-xs font-bold text-red-700 shadow-sm active:bg-red-100"
            >
              <XCircle className="h-4 w-4" />
              Tolak
            </button>
            <button
              onClick={() => {
                if (invoice.order?.hasBelowMin) {
                  setShowApproveModal(true);
                  setShowRejectForm(false);
                } else {
                  handleApprove();
                }
              }}
              disabled={submitting}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-emerald-600 py-3 text-xs font-bold text-white shadow-sm active:bg-emerald-700 disabled:opacity-50"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              Setujui
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function TelegramApprovalPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <Loader2 className="h-7 w-7 animate-spin text-indigo-600" />
        </div>
      }
    >
      <ApprovalContent />
    </Suspense>
  );
}

