'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Plus,
  DollarSign,
  CreditCard,
  Phone,
  User,
  MapPin,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Receipt,
  TrendingDown,
  TrendingUp,
  ExternalLink,
} from 'lucide-react';
import { Skeleton, ErrorState, EmptyState } from '@/components/ui/States';
import { MoneyInput } from '@/components/ui/MoneyInput';
import { formatRupiah } from '@/lib/domain/money';
import { formatDateId } from '@/lib/format/date';

interface VendorDetail {
  id: string;
  code: string;
  name: string;
  kind: 'SUPPLIER' | 'TRANSPORT';
  paymentTermDays: number;
  picName?: string | null;
  phone: string | null;
  address: string | null;
  bankName: string | null;
  bankAccountNumber: string | null;
  bankAccountHolder: string | null;
  notes?: string | null;
}

interface VendorLedgerEntry {
  id: string;
  date: string;
  type: 'PURCHASE' | 'PAYMENT';
  refNo: string;
  description: string;
  debit: number;
  credit: number;
  balance: number;
  details?: {
    status?: string;
    method?: string;
    purchaseOrderId?: string | null;
    reference?: string | null;
  };
}

interface VendorLedgerData {
  vendor: VendorDetail;
  summary: {
    totalPurchases: number;
    totalPayments: number;
    currentBalance: number;
  };
  entries: VendorLedgerEntry[];
}

export default function VendorDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;

  const [ledger, setLedger] = useState<VendorLedgerData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modal Catat Pembayaran Vendor
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paying, setPaying] = useState(false);
  const [payAmount, setPayAmount] = useState<number>(0);
  const [payDate, setPayDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [payMethod, setPayMethod] = useState<'TRANSFER' | 'CASH' | 'CREDIT' | 'OTHER'>('TRANSFER');
  const [payRef, setPayRef] = useState('');
  const [payNotes, setPayNotes] = useState('');
  const [feedbackSuccess, setFeedbackSuccess] = useState<string | null>(null);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);

  const fetchLedger = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`/api/v1/vendors/${id}/transactions`);
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || 'Gagal memuat Buku Transaksi Vendor');
      }
      const data = await res.json();
      setLedger(data.data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Terjadi kesalahan sistem');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (id) {
      fetchLedger();
    }
  }, [id, fetchLedger]);

  function handleOpenPaymentModal() {
    if (!ledger) return;
    const unpaid = Math.max(0, ledger.summary.currentBalance);
    setPayAmount(unpaid);
    setPayDate(new Date().toISOString().slice(0, 10));
    setPayMethod('TRANSFER');
    setPayRef('');
    setPayNotes(`Pembayaran tagihan vendor ${ledger.vendor.name}`);
    setShowPaymentModal(true);
  }

  async function handleRecordPayment(e: React.FormEvent) {
    e.preventDefault();
    if (!ledger) return;
    try {
      setPaying(true);
      setFeedbackError(null);
      setFeedbackSuccess(null);

      if (payAmount <= 0) {
        setFeedbackError('Nominal pembayaran harus lebih dari Rp 0');
        setPaying(false);
        return;
      }

      const payload = {
        amount: payAmount,
        paidAt: payDate,
        method: payMethod,
        reference: payRef.trim() || null,
        notes: payNotes.trim() || null,
      };

      const res = await fetch(`/api/v1/vendors/${id}/payments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || 'Gagal mencatat pembayaran vendor');
      }

      setFeedbackSuccess(`Pembayaran sebesar ${formatRupiah(payAmount)} berhasil dicatat pada buku vendor.`);
      setShowPaymentModal(false);
      fetchLedger();
    } catch (err: unknown) {
      setFeedbackError(err instanceof Error ? err.message : 'Gagal mencatat pembayaran');
    } finally {
      setPaying(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-44 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error || !ledger) {
    return (
      <ErrorState
        title="Gagal Memuat Vendor"
        message={error || 'Data vendor tidak ditemukan'}
        onRetry={fetchLedger}
      />
    );
  }

  const { vendor, summary, entries } = ledger;
  const isSupplier = vendor.kind === 'SUPPLIER';

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Tombol Kembali & Breadcrumb */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => router.push('/vendors')}
          className="p-2 border border-slate-200 rounded-lg hover:bg-slate-100 transition-colors text-slate-600 min-h-[44px] min-w-[44px] flex items-center justify-center"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <Link href="/vendors" className="hover:underline">
              Vendor
            </Link>
            <span>/</span>
            <span className="font-mono text-slate-700">{vendor.code}</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 mt-0.5 flex items-center gap-2">
            <span>{vendor.name}</span>
            <span
              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${
                isSupplier
                  ? 'bg-blue-50 text-blue-700 border-blue-200'
                  : 'bg-amber-50 text-amber-700 border-amber-200'
              }`}
            >
              {isSupplier ? 'Pemasok Barang' : 'Pengangkutan'}
            </span>
          </h1>
        </div>
      </div>

      {/* Alert Umpan Balik */}
      {feedbackSuccess && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm flex items-start gap-3">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
          <div className="flex-1 font-medium">{feedbackSuccess}</div>
          <button
            type="button"
            onClick={() => setFeedbackSuccess(null)}
            className="text-emerald-600 hover:text-emerald-800"
          >
            &times;
          </button>
        </div>
      )}

      {feedbackError && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-800 text-sm flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
          <div className="flex-1 font-medium">{feedbackError}</div>
          <button
            type="button"
            onClick={() => setFeedbackError(null)}
            className="text-red-600 hover:text-red-800"
          >
            &times;
          </button>
        </div>
      )}

      {/* Header Profil Vendor & Tombol Aksi */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Profil Rekanan Vendor
            </div>
            <div className="text-sm text-slate-600 mt-1">
              Kode Vendor: <span className="font-mono font-bold text-slate-900">{vendor.code}</span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleOpenPaymentModal}
              className="min-h-[44px] px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-semibold flex items-center gap-2 shadow-sm transition-colors"
            >
              <DollarSign className="w-4 h-4" />
              <span>Catat Pembayaran</span>
            </button>

            {isSupplier && (
              <Link
                href="/purchase-orders/new"
                className="min-h-[44px] px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold flex items-center gap-2 shadow-sm transition-colors"
              >
                <Plus className="w-4 h-4" />
                <span>Buat Purchase Order</span>
              </Link>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t border-slate-100 text-xs">
          {/* Kolom Kontak */}
          <div className="space-y-1.5 text-slate-600">
            <div className="font-semibold text-slate-800 flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-slate-400" />
              <span>PIC: {vendor.picName || '-'}</span>
            </div>
            {vendor.phone && (
              <div className="flex items-center gap-1.5 font-mono">
                <Phone className="w-3.5 h-3.5 text-slate-400" />
                <span>{vendor.phone}</span>
              </div>
            )}
            {vendor.address && (
              <div className="flex items-start gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                <span>{vendor.address}</span>
              </div>
            )}
          </div>

          {/* Kolom Rekening Bank */}
          <div className="space-y-1.5 text-slate-600">
            <div className="font-semibold text-slate-800 flex items-center gap-1.5">
              <CreditCard className="w-3.5 h-3.5 text-slate-400" />
              <span>Informasi Rekening</span>
            </div>
            {vendor.bankName && vendor.bankAccountNumber ? (
              <div>
                <div className="font-mono font-medium text-slate-900">
                  {vendor.bankName} - {vendor.bankAccountNumber}
                </div>
                <div className="text-slate-400 text-[11px]">
                  a.n {vendor.bankAccountHolder || '-'}
                </div>
              </div>
            ) : (
              <div className="text-slate-400">Belum ada info bank</div>
            )}
          </div>

          {/* Kolom Termin Pembayaran */}
          <div className="space-y-1.5 text-slate-600">
            <div className="font-semibold text-slate-800 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-slate-400" />
              <span>Termin Pembayaran (TOP)</span>
            </div>
            <div className="text-sm font-semibold text-slate-900">
              {vendor.paymentTermDays > 0 ? `${vendor.paymentTermDays} Hari` : 'Tunai / COD'}
            </div>
            <div className="text-[11px] text-slate-400">
              {vendor.paymentTermDays > 0
                ? 'Jatuh tempo dihitung dari tanggal PO diterbitkan'
                : 'Pembayaran lunas langsung saat transaksi'}
            </div>
          </div>
        </div>
      </div>

      {/* 3 Kartu Ringkasan Buku Transaksi Vendor */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Total Pembelian (Debit) */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-1">
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center justify-between">
            <span>Total Pembelian (Debit)</span>
            <TrendingUp className="w-4 h-4 text-blue-500" />
          </div>
          <div className="text-xl sm:text-2xl font-bold font-mono text-slate-900">
            {formatRupiah(summary.totalPurchases)}
          </div>
          <div className="text-[11px] text-slate-500">
            Akumulasi seluruh PO non-batal
          </div>
        </div>

        {/* Total Pembayaran (Kredit) */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-1">
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center justify-between">
            <span>Total Pembayaran (Kredit)</span>
            <TrendingDown className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-xl sm:text-2xl font-bold font-mono text-emerald-700">
            {formatRupiah(summary.totalPayments)}
          </div>
          <div className="text-[11px] text-slate-500">
            Pembayaran yang telah disetorkan
          </div>
        </div>

        {/* Sisa Hutang Berjalan */}
        <div
          className={`p-4 rounded-xl border shadow-sm space-y-1 ${
            summary.currentBalance > 0
              ? 'bg-amber-50/70 border-amber-200'
              : summary.currentBalance < 0
              ? 'bg-blue-50/70 border-blue-200'
              : 'bg-emerald-50/70 border-emerald-200'
          }`}
        >
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center justify-between">
            <span>Sisa Hutang Berjalan</span>
            <Receipt
              className={`w-4 h-4 ${
                summary.currentBalance > 0
                  ? 'text-amber-600'
                  : summary.currentBalance < 0
                  ? 'text-blue-600'
                  : 'text-emerald-600'
              }`}
            />
          </div>
          <div
            className={`text-xl sm:text-2xl font-bold font-mono ${
              summary.currentBalance > 0
                ? 'text-amber-800'
                : summary.currentBalance < 0
                ? 'text-blue-800'
                : 'text-emerald-800'
            }`}
          >
            {formatRupiah(summary.currentBalance)}
          </div>
          <div className="text-[11px] font-medium text-slate-600">
            {summary.currentBalance > 0
              ? 'Hutang berjalan wajib dilunasi'
              : summary.currentBalance < 0
              ? 'Saldo lebih bayar ke vendor'
              : 'Semua tagihan lunas'}
          </div>
        </div>
      </div>

      {/* Tabel Linimasa Buku Transaksi Vendor */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Receipt className="w-4 h-4 text-slate-600" />
            <h2 className="font-semibold text-slate-900">
              Buku Transaksi Vendor (Ledger)
            </h2>
          </div>
          <span className="text-xs text-slate-500">
            {entries.length} baris mutasi
          </span>
        </div>

        {entries.length === 0 ? (
          <EmptyState
            title="Belum Ada Transaksi"
            description="Belum ada catatan pembelian PO maupun pembayaran untuk vendor ini."
          />
        ) : (
          <>
            {/* Desktop Table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-600 border-b border-slate-200 text-xs font-semibold">
                  <tr>
                    <th className="px-4 py-3">Tanggal</th>
                    <th className="px-4 py-3">Dokumen / Jenis</th>
                    <th className="px-4 py-3">Keterangan</th>
                    <th className="px-4 py-3 text-right">Pembelian (Debit)</th>
                    <th className="px-4 py-3 text-right">Pembayaran (Kredit)</th>
                    <th className="px-4 py-3 text-right">Saldo Hutang</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {entries.map((entry) => {
                    const isPurchase = entry.type === 'PURCHASE';
                    return (
                      <tr key={entry.id} className="hover:bg-slate-50/50">
                        {/* Tanggal */}
                        <td className="px-4 py-3 text-xs text-slate-600 font-mono">
                          {formatDateId(entry.date)}
                        </td>

                        {/* Dokumen / Jenis */}
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold ${
                                isPurchase
                                  ? 'bg-blue-50 text-blue-700'
                                  : 'bg-emerald-50 text-emerald-700'
                              }`}
                            >
                              {isPurchase ? 'PO' : 'BAYAR'}
                            </span>
                            {isPurchase ? (
                              <Link
                                href={`/purchase-orders/${entry.id}`}
                                className="font-mono text-xs font-semibold text-blue-600 hover:underline flex items-center gap-1"
                              >
                                <span>{entry.refNo}</span>
                                <ExternalLink className="w-3 h-3" />
                              </Link>
                            ) : (
                              <span className="font-mono text-xs font-medium text-slate-800">
                                {entry.refNo}
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Keterangan */}
                        <td className="px-4 py-3 text-xs text-slate-700">
                          {entry.description}
                        </td>

                        {/* Pembelian (Debit) */}
                        <td className="px-4 py-3 text-right font-mono text-xs text-slate-900">
                          {entry.debit > 0 ? (
                            <span className="font-medium">{formatRupiah(entry.debit)}</span>
                          ) : (
                            <span className="text-slate-300">-</span>
                          )}
                        </td>

                        {/* Pembayaran (Kredit) */}
                        <td className="px-4 py-3 text-right font-mono text-xs text-emerald-700">
                          {entry.credit > 0 ? (
                            <span className="font-semibold">{formatRupiah(entry.credit)}</span>
                          ) : (
                            <span className="text-slate-300">-</span>
                          )}
                        </td>

                        {/* Saldo Hutang Berjalan */}
                        <td className="px-4 py-3 text-right font-mono text-xs font-bold text-slate-900">
                          {formatRupiah(entry.balance)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile View (Cards) */}
            <div className="md:hidden divide-y divide-slate-100">
              {entries.map((entry) => {
                const isPurchase = entry.type === 'PURCHASE';
                return (
                  <div key={entry.id} className="p-4 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold ${
                            isPurchase
                              ? 'bg-blue-50 text-blue-700'
                              : 'bg-emerald-50 text-emerald-700'
                          }`}
                        >
                          {isPurchase ? 'PO' : 'BAYAR'}
                        </span>
                        {isPurchase ? (
                          <Link
                            href={`/purchase-orders/${entry.id}`}
                            className="font-mono text-xs font-bold text-blue-600 hover:underline flex items-center gap-1"
                          >
                            <span>{entry.refNo}</span>
                            <ExternalLink className="w-3 h-3" />
                          </Link>
                        ) : (
                          <span className="font-mono text-xs font-bold text-slate-800">
                            {entry.refNo}
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] font-mono text-slate-400">
                        {formatDateId(entry.date)}
                      </div>
                    </div>

                    <div className="text-xs text-slate-600">
                      {entry.description}
                    </div>

                    <div className="flex items-center justify-between text-xs bg-slate-50 p-2.5 rounded-lg font-mono">
                      {isPurchase ? (
                        <div>
                          <span className="text-slate-400">Debit (Beli): </span>
                          <span className="font-bold text-slate-900">
                            {formatRupiah(entry.debit)}
                          </span>
                        </div>
                      ) : (
                        <div>
                          <span className="text-slate-400">Kredit (Bayar): </span>
                          <span className="font-bold text-emerald-700">
                            {formatRupiah(entry.credit)}
                          </span>
                        </div>
                      )}
                      <div>
                        <span className="text-slate-400">Saldo: </span>
                        <span className="font-bold text-slate-900">
                          {formatRupiah(entry.balance)}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* ========================================================================= */}
      {/* MODAL: CATAT PEMBAYARAN VENDOR */}
      {/* ========================================================================= */}
      {showPaymentModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-md overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-slate-100 bg-slate-50">
              <div className="flex items-center gap-2 font-semibold text-slate-900">
                <DollarSign className="w-5 h-5 text-indigo-600" />
                <span>Catat Pembayaran Vendor</span>
              </div>
              <button
                type="button"
                onClick={() => setShowPaymentModal(false)}
                className="text-slate-400 hover:text-slate-600 text-lg"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleRecordPayment} className="p-4 space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Vendor
                </label>
                <div className="p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-800">
                  {vendor.name} ({vendor.code})
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Nominal Pembayaran (Rp) <span className="text-red-500">*</span>
                </label>
                <MoneyInput
                  value={payAmount}
                  onChange={(val) => setPayAmount(val)}
                  placeholder="0"
                  required
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  Saldo hutang saat ini: {formatRupiah(summary.currentBalance)}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Tanggal Bayar <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    required
                    value={payDate}
                    onChange={(e) => setPayDate(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Metode Bayar
                  </label>
                  <select
                    value={payMethod}
                    onChange={(e) =>
                      setPayMethod(e.target.value as 'TRANSFER' | 'CASH' | 'CREDIT' | 'OTHER')
                    }
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="TRANSFER">Transfer Bank</option>
                    <option value="CASH">Tunai (Cash)</option>
                    <option value="CREDIT">Kredit / Giro</option>
                    <option value="OTHER">Lainnya</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  No. Referensi / Bukti Transfer
                </label>
                <input
                  type="text"
                  value={payRef}
                  onChange={(e) => setPayRef(e.target.value)}
                  placeholder="Contoh: TRF-BCA-889123"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Catatan Pembayaran
                </label>
                <textarea
                  rows={2}
                  value={payNotes}
                  onChange={(e) => setPayNotes(e.target.value)}
                  placeholder="Keterangan tambahan transaksi..."
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  disabled={paying}
                  onClick={() => setShowPaymentModal(false)}
                  className="min-h-[44px] px-4 py-2 border border-slate-200 rounded-lg text-slate-700 hover:bg-slate-100 text-sm font-medium transition-colors"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={paying}
                  className="min-h-[44px] px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-semibold flex items-center gap-2 shadow-sm transition-colors"
                >
                  {paying ? 'Menyimpan...' : 'Simpan Pembayaran'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
