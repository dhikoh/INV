'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  CheckCircle2,
  XCircle,
  Search,
  RotateCcw,
  Clock,
  ArrowRight,
  ExternalLink,
  FileText,
  AlertCircle,
} from 'lucide-react';
import { Skeleton, EmptyState, ErrorState } from '@/components/ui/States';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { formatRupiah } from '@/lib/domain/money';

interface PendingPaymentItem {
  id: string;
  businessId: string;
  orderId: string;
  invoiceId: string | null;
  type: string;
  method: string;
  status: string;
  amount: number;
  paidAt: string;
  reference: string | null;
  proofPath: string | null;
  notes: string | null;
  createdById: string;
  createdAt: string;
  orderNo: string | null;
  customerName: string;
  salesName: string;
}

export default function PaymentsPage() {
  const [payments, setPayments] = useState<PendingPaymentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Modal Verifikasi
  const [selectedVerify, setSelectedVerify] = useState<PendingPaymentItem | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);

  // Modal Tolak
  const [selectedReject, setSelectedReject] = useState<PendingPaymentItem | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [rejectError, setRejectError] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  // Toast
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const fetchPayments = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch('/api/v1/payments');
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error?.message || 'Gagal memuat antrean pembayaran');
      }
      const json = await res.json();
      setPayments(json.data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Terjadi kesalahan sistem');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPayments();
  }, [fetchPayments]);

  const handleVerify = async () => {
    if (!selectedVerify) return;
    try {
      setVerifying(true);
      setVerifyError(null);
      const res = await fetch(`/api/v1/payments/${selectedVerify.id}/verify`, {
        method: 'POST',
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error?.message || 'Gagal memverifikasi pembayaran');
      }
      setToastMessage(`Pembayaran sebesar ${formatRupiah(selectedVerify.amount)} berhasil diverifikasi!`);
      setSelectedVerify(null);
      fetchPayments();
    } catch (err) {
      setVerifyError(err instanceof Error ? err.message : 'Terjadi kesalahan');
    } finally {
      setVerifying(false);
    }
  };

  const handleReject = async () => {
    if (!selectedReject) return;
    if (rejectReason.trim().length < 5) {
      setRejectError('Alasan penolakan wajib diisi minimal 5 karakter');
      return;
    }
    try {
      setRejecting(true);
      setRejectError(null);
      const res = await fetch(`/api/v1/payments/${selectedReject.id}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: rejectReason.trim() }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error?.message || 'Gagal menolak pembayaran');
      }
      setToastMessage('Pembayaran berhasil ditolak.');
      setSelectedReject(null);
      setRejectReason('');
      fetchPayments();
    } catch (err) {
      setRejectError(err instanceof Error ? err.message : 'Terjadi kesalahan');
    } finally {
      setRejecting(false);
    }
  };

  const filteredPayments = payments.filter((p) => {
    const q = searchQuery.toLowerCase();
    const orderMatch = p.orderNo?.toLowerCase().includes(q) || p.orderId.toLowerCase().includes(q);
    const customerMatch = p.customerName.toLowerCase().includes(q);
    const salesMatch = p.salesName.toLowerCase().includes(q);
    const refMatch = p.reference?.toLowerCase().includes(q);
    return orderMatch || customerMatch || salesMatch || Boolean(refMatch);
  });

  return (
    <div className="w-full max-w-7xl mx-auto px-4 py-6 md:py-8 space-y-6">
      {/* Toast Notifikasi */}
      {toastMessage && (
        <div className="fixed bottom-5 right-5 z-50 flex items-center gap-2 bg-emerald-600 text-white px-4 py-3 rounded-lg shadow-lg text-sm font-medium animate-in fade-in slide-in-from-bottom-2">
          <CheckCircle2 className="w-5 h-5" />
          <span>{toastMessage}</span>
          <button
            onClick={() => setToastMessage(null)}
            className="ml-3 text-emerald-200 hover:text-white"
          >
            ✕
          </button>
        </div>
      )}

      {/* Header Halaman */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl md:text-2xl font-bold text-slate-900 tracking-tight">
              Verifikasi Pembayaran
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-300">
              {payments.length} Menunggu
            </span>
          </div>
          <p className="text-xs md:text-sm text-slate-500 mt-1">
            Daftar bukti transfer dan pembayaran pelanggan yang perlu diperiksa dan diverifikasi.
          </p>
        </div>

        <button
          onClick={fetchPayments}
          disabled={loading}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 transition-colors shadow-sm self-start sm:self-auto"
        >
          <RotateCcw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Segarkan</span>
        </button>
      </div>

      {/* Bar Pencarian */}
      <div className="relative">
        <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Cari nomor order, pelanggan, sales, atau referensi..."
          className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-lg text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
      </div>

      {/* Konten Utama */}
      {loading ? (
        <div className="space-y-4">
          <Skeleton className="h-28 w-full rounded-xl" />
          <Skeleton className="h-28 w-full rounded-xl" />
          <Skeleton className="h-28 w-full rounded-xl" />
        </div>
      ) : error ? (
        <ErrorState
          title="Gagal Memuat Antrean Pembayaran"
          message={error}
          onRetry={fetchPayments}
        />
      ) : filteredPayments.length === 0 ? (
        <EmptyState
          title="Tidak Ada Pembayaran Menunggu"
          description={
            searchQuery
              ? 'Tidak ditemukan pembayaran yang sesuai dengan kriteria pencarian Anda.'
              : 'Semua pembayaran pelanggan telah diverifikasi. Antrean Anda bersih!'
          }
        />
      ) : (
        <div className="space-y-4">
          {filteredPayments.map((p) => {
            const formattedDate = new Date(p.paidAt).toLocaleDateString('id-ID', {
              day: 'numeric',
              month: 'short',
              year: 'numeric',
            });

            return (
              <div
                key={p.id}
                className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 sm:p-5 hover:border-slate-300 transition-colors space-y-3"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
                  <div className="flex flex-wrap items-center gap-2 min-w-0">
                    <Link
                      href={`/orders/${p.orderId}`}
                      className="font-bold text-indigo-600 hover:text-indigo-800 text-sm flex items-center gap-1 group max-w-full"
                    >
                      <span className="break-all">{p.orderNo || `Order #${p.orderId.slice(-6)}`}</span>
                      <ArrowRight className="w-3.5 h-3.5 shrink-0 group-hover:translate-x-0.5 transition-transform" />
                    </Link>
                    <StatusBadge status={p.status} />
                    <span className="text-xs px-2 py-0.5 rounded font-semibold bg-slate-100 text-slate-700 shrink-0">
                      {p.method}
                    </span>
                  </div>

                  <div className="text-xs text-slate-500 flex items-center gap-2">
                    <Clock className="w-3.5 h-3.5" />
                    <span>Diajukan {formattedDate}</span>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                  <div>
                    <span className="text-slate-500 block">Pelanggan</span>
                    <span className="font-semibold text-slate-800 text-sm">
                      {p.customerName}
                    </span>
                  </div>

                  <div>
                    <span className="text-slate-500 block">Sales Pembuat</span>
                    <span className="font-semibold text-slate-800 text-sm">
                      {p.salesName}
                    </span>
                  </div>

                  <div>
                    <span className="text-slate-500 block">Nominal Pembayaran</span>
                    <span className="font-bold text-emerald-600 text-base">
                      {formatRupiah(p.amount)}
                    </span>
                  </div>

                  <div>
                    <span className="text-slate-500 block">Referensi / Catatan</span>
                    <span className="text-slate-700">
                      {p.reference ? `Ref: ${p.reference}` : p.notes || '-'}
                    </span>
                  </div>
                </div>

                {/* Bukti Bayar & Tombol Aksi */}
                <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-50">
                  <div>
                    {p.proofPath ? (
                      <a
                        href={`/api/v1/files/${p.proofPath}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 text-xs text-indigo-600 hover:text-indigo-800 font-medium underline"
                      >
                        <FileText className="w-4 h-4" />
                        <span>Lihat Bukti Transfer (Unggahan)</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    ) : (
                      <span className="text-xs text-slate-400 italic">
                        Tanpa lampiran berkas bukti
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        setSelectedReject(p);
                        setRejectReason('');
                        setRejectError(null);
                      }}
                      className="px-3 py-1.5 rounded-lg border border-rose-300 text-xs font-semibold text-rose-700 hover:bg-rose-50 transition-colors shadow-sm"
                    >
                      Tolak
                    </button>

                    <button
                      onClick={() => {
                        setSelectedVerify(p);
                        setVerifyError(null);
                      }}
                      className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold transition-colors shadow-sm"
                    >
                      Verifikasi
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal Konfirmasi Verifikasi */}
      {selectedVerify && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 animate-in fade-in">
          <div className="bg-white rounded-xl max-w-md w-full p-5 space-y-4 shadow-xl border border-slate-200">
            <div className="flex items-center gap-2.5 text-emerald-600">
              <CheckCircle2 className="w-6 h-6 shrink-0" />
              <h3 className="text-base font-bold text-slate-900">
                Verifikasi Pembayaran
              </h3>
            </div>

            <p className="text-xs sm:text-sm text-slate-600">
              Apakah Anda yakin ingin memverifikasi penerimaan dana sebesar{' '}
              <strong className="text-slate-900">{formatRupiah(selectedVerify.amount)}</strong>{' '}
              untuk pesanan{' '}
              <strong className="text-slate-900">{selectedVerify.orderNo || selectedVerify.orderId}</strong>?
            </p>

            <div className="bg-slate-50 p-3 rounded-lg text-xs space-y-1 text-slate-700">
              <div className="flex justify-between">
                <span>Pelanggan:</span>
                <span className="font-semibold">{selectedVerify.customerName}</span>
              </div>
              <div className="flex justify-between">
                <span>Metode:</span>
                <span className="font-semibold">{selectedVerify.method}</span>
              </div>
              {selectedVerify.reference && (
                <div className="flex justify-between">
                  <span>Referensi:</span>
                  <span className="font-semibold">{selectedVerify.reference}</span>
                </div>
              )}
            </div>

            {verifyError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-700 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{verifyError}</span>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setSelectedVerify(null)}
                disabled={verifying}
                className="px-4 py-2 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleVerify}
                disabled={verifying}
                className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold transition-colors shadow-sm disabled:opacity-50"
              >
                {verifying ? 'Memverifikasi...' : 'Ya, Verifikasi Pembayaran'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Tolak Pembayaran */}
      {selectedReject && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 animate-in fade-in">
          <div className="bg-white rounded-xl max-w-md w-full p-5 space-y-4 shadow-xl border border-slate-200">
            <div className="flex items-center gap-2.5 text-rose-600">
              <XCircle className="w-6 h-6 shrink-0" />
              <h3 className="text-base font-bold text-slate-900">
                Tolak Pembayaran Masuk
              </h3>
            </div>

            <p className="text-xs sm:text-sm text-slate-600">
              Tolak pembayaran sebesar{' '}
              <strong className="text-slate-900">{formatRupiah(selectedReject.amount)}</strong>.
              Staf sales akan menerima notifikasi beserta alasan penolakan ini.
            </p>

            <div className="space-y-1">
              <label className="block text-xs font-semibold text-slate-700">
                Alasan Penolakan <span className="text-rose-600">*</span>
              </label>
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Contoh: Bukti transfer tidak valid atau dana tidak ditemukan di mutasi bank"
                rows={3}
                className="w-full p-2.5 border border-slate-200 rounded-lg text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-rose-500"
              />
              <span className="text-[11px] text-slate-400">Minimal 5 karakter</span>
            </div>

            {rejectError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-700 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{rejectError}</span>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setSelectedReject(null)}
                disabled={rejecting}
                className="px-4 py-2 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleReject}
                disabled={rejecting || rejectReason.trim().length < 5}
                className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold transition-colors shadow-sm disabled:opacity-50"
              >
                {rejecting ? 'Menolak...' : 'Tolak Pembayaran'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
