'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  ShieldCheck,
  Search,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Clock,
  User,
  Layers,
  ArrowRightLeft,
  X,
} from 'lucide-react';
import { Skeleton, ErrorState } from '@/components/ui/States';

interface AuditActor {
  id: string;
  name: string;
  username: string;
  role: string;
}

interface AuditLogItem {
  id: string;
  businessId: string | null;
  actorId: string | null;
  actorRole: string | null;
  actor: AuditActor | null;
  action: string;
  entityType: string;
  entityId: string;
  summary: string | null;
  before: unknown;
  after: unknown;
  reason: string | null;
  ip: string | null;
  createdAt: string;
}

const COMMON_ACTIONS = [
  'SEMUA_AKSI',
  'ORDER_SUBMIT',
  'ORDER_WITHDRAW',
  'ORDER_VOID',
  'ORDER_REQUEST_FINAL',
  'INVOICE_APPROVE',
  'INVOICE_REJECT',
  'INVOICE_VOID',
  'PAYMENT_CREATE',
  'PAYMENT_VERIFY',
  'PAYMENT_REJECT',
  'PAYMENT_VOID',
  'PRICE_CHANGE',
  'PRODUCT_CREATE',
  'PRODUCT_DELETE',
  'CUSTOMER_REASSIGN',
  'STOCK_ADJUST',
  'STOCK_OPNAME',
  'PO_ORDER',
  'PO_RECEIVE',
  'PO_CANCEL',
  'COMMISSION_PAY',
  'PASSWORD_CHANGE',
  'USER_CREATE',
  'USER_DEACTIVATE',
  'BUSINESS_UPDATE',
];

const COMMON_ENTITIES = [
  'SEMUA_ENTITAS',
  'Order',
  'Invoice',
  'Payment',
  'Product',
  'Customer',
  'User',
  'Business',
  'StockMovement',
  'PurchaseOrder',
  'VendorPayment',
  'CreditNote',
  'CommissionEntry',
  'SalesTarget',
  'OwnerSalesNote',
];

export default function AuditLogPage() {
  const [logs, setLogs] = useState<AuditLogItem[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [limit] = useState(20);

  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [entityFilter, setEntityFilter] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modal / Drawer state for comparing before & after
  const [activeLogDiff, setActiveLogDiff] = useState<AuditLogItem | null>(null);

  const fetchAuditLogs = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams();
      params.set('page', page.toString());
      params.set('limit', limit.toString());

      if (search.trim()) params.set('q', search.trim());
      if (actionFilter && actionFilter !== 'SEMUA_AKSI') params.set('action', actionFilter);
      if (entityFilter && entityFilter !== 'SEMUA_ENTITAS') params.set('entityType', entityFilter);
      if (fromDate) params.set('from', `${fromDate}T00:00:00.000Z`);
      if (toDate) params.set('to', `${toDate}T23:59:59.999Z`);

      const res = await fetch(`/api/v1/audit-logs?${params.toString()}`);
      if (!res.ok) {
        if (res.status === 403) {
          throw new Error('Hanya Super Admin yang berhak mengakses audit log.');
        }
        throw new Error('Gagal memuat catatan audit trail.');
      }

      const json = await res.json();
      if (!json.ok) throw new Error(json.error?.message || 'Terjadi kesalahan sistem.');

      setLogs(json.data.items || []);
      setTotal(json.data.total || 0);
      setTotalPages(json.data.totalPages || 1);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Terjadi kesalahan');
    } finally {
      setLoading(false);
    }
  }, [page, limit, search, actionFilter, entityFilter, fromDate, toDate]);

  useEffect(() => {
    fetchAuditLogs();
  }, [fetchAuditLogs]);

  const handleResetFilters = () => {
    setSearch('');
    setActionFilter('');
    setEntityFilter('');
    setFromDate('');
    setToDate('');
    setPage(1);
  };

  const formatTimestamp = (iso: string) => {
    try {
      const d = new Date(iso);
      return new Intl.DateTimeFormat('id-ID', {
        dateStyle: 'medium',
        timeStyle: 'medium',
        timeZone: 'Asia/Jakarta',
      }).format(d);
    } catch {
      return iso;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Halaman */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between border-b border-slate-200 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              Audit Trail & Rekam Jejak
            </h1>
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-600/20">
              <ShieldCheck className="h-3.5 w-3.5" />
              Tamper-Proof Trigger
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            Log mutasi data append-only yang tidak dapat diubah atau dihapus untuk memastikan kepatuhan integritas audit.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={fetchAuditLogs}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Segarkan
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          {/* Pencarian Teks */}
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Cari ringkasan, ID, alasan..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="w-full rounded-lg border border-slate-300 pl-9 pr-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          {/* Filter Aksi */}
          <div>
            <select
              value={actionFilter}
              onChange={(e) => {
                setActionFilter(e.target.value);
                setPage(1);
              }}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              <option value="">Semua Aksi</option>
              {COMMON_ACTIONS.filter((a) => a !== 'SEMUA_AKSI').map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </div>

          {/* Filter Tipe Entitas */}
          <div>
            <select
              value={entityFilter}
              onChange={(e) => {
                setEntityFilter(e.target.value);
                setPage(1);
              }}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              <option value="">Semua Tipe Entitas</option>
              {COMMON_ENTITIES.filter((e) => e !== 'SEMUA_ENTITAS').map((e) => (
                <option key={e} value={e}>
                  {e}
                </option>
              ))}
            </select>
          </div>

          {/* Rentang Tanggal */}
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={fromDate}
              onChange={(e) => {
                setFromDate(e.target.value);
                setPage(1);
              }}
              className="w-1/2 rounded-lg border border-slate-300 px-2 py-2 text-xs text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              title="Dari Tanggal"
            />
            <span className="text-slate-400 text-xs">s/d</span>
            <input
              type="date"
              value={toDate}
              onChange={(e) => {
                setToDate(e.target.value);
                setPage(1);
              }}
              className="w-1/2 rounded-lg border border-slate-300 px-2 py-2 text-xs text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              title="Sampai Tanggal"
            />
          </div>
        </div>

        {(search || actionFilter || entityFilter || fromDate || toDate) && (
          <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs text-slate-500">
            <span>Filter aktif diterapkan</span>
            <button
              type="button"
              onClick={handleResetFilters}
              className="font-medium text-indigo-600 hover:text-indigo-800"
            >
              Reset Semua Filter
            </button>
          </div>
        )}
      </div>

      {/* Konten Log */}
      {error && <ErrorState message={error} onRetry={fetchAuditLogs} />}

      {loading && !error && (
        <div className="space-y-3">
          <Skeleton className="h-16 w-full rounded-xl" />
          <Skeleton className="h-16 w-full rounded-xl" />
          <Skeleton className="h-16 w-full rounded-xl" />
          <Skeleton className="h-16 w-full rounded-xl" />
        </div>
      )}

      {!loading && !error && logs.length === 0 && (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-12 text-center">
          <Layers className="mx-auto h-10 w-10 text-slate-400" />
          <h3 className="mt-2 text-sm font-semibold text-slate-900">Belum Ada Rekam Audit</h3>
          <p className="mt-1 text-sm text-slate-500">
            Tidak ditemukan mutasi data yang cocok dengan kriteria pencarian yang Anda tentukan.
          </p>
        </div>
      )}

      {!loading && !error && logs.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
              <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-600">
                <tr>
                  <th scope="col" className="px-4 py-3.5">Waktu (WIB)</th>
                  <th scope="col" className="px-4 py-3.5">Pelaksana (Actor)</th>
                  <th scope="col" className="px-4 py-3.5">Aksi & Entitas</th>
                  <th scope="col" className="px-4 py-3.5">Ringkasan / Alasan</th>
                  <th scope="col" className="px-4 py-3.5 text-right">Perubahan Data</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white text-slate-700">
                {logs.map((log) => {
                  const hasStateDiff = Boolean(log.before || log.after);
                  return (
                    <tr key={log.id} className="hover:bg-slate-50 transition">
                      {/* Waktu & IP */}
                      <td className="whitespace-nowrap px-4 py-3.5 text-xs text-slate-600">
                        <div className="flex items-center gap-1.5 font-medium text-slate-900">
                          <Clock className="h-3.5 w-3.5 text-slate-400" />
                          {formatTimestamp(log.createdAt)}
                        </div>
                        <div className="mt-0.5 text-slate-400 font-mono text-[11px]">
                          IP: {log.ip || '-'}
                        </div>
                      </td>

                      {/* Actor */}
                      <td className="px-4 py-3.5 text-xs">
                        <div className="flex items-center gap-1.5 font-medium text-slate-900">
                          <User className="h-3.5 w-3.5 text-slate-400" />
                          {log.actor?.name || 'Sistem / Anonim'}
                        </div>
                        <div className="mt-0.5 flex items-center gap-1 text-[11px] text-slate-500">
                          <span>@{log.actor?.username || '-'}</span>
                          <span className="rounded bg-slate-100 px-1 py-0.2 font-mono text-[10px] text-slate-600">
                            {log.actorRole || 'SYSTEM'}
                          </span>
                        </div>
                      </td>

                      {/* Action & Entity */}
                      <td className="px-4 py-3.5 text-xs">
                        <div>
                          <span className="inline-block rounded-md bg-indigo-50 px-2 py-0.5 font-mono text-xs font-semibold text-indigo-700">
                            {log.action}
                          </span>
                        </div>
                        <div className="mt-1 flex items-center gap-1 text-[11px] text-slate-500">
                          <span className="font-medium text-slate-700">{log.entityType}:</span>
                          <span className="font-mono text-slate-500 truncate max-w-[140px]" title={log.entityId}>
                            {log.entityId}
                          </span>
                        </div>
                      </td>

                      {/* Summary & Reason */}
                      <td className="px-4 py-3.5 text-xs">
                        <div className="font-medium text-slate-800">
                          {log.summary
                            ? log.summary.replace(/Rp[\s\u00a0]+Rp/g, 'Rp')
                            : '-'}
                        </div>
                        {log.reason && (
                          <div className="mt-1 text-[11px] italic text-amber-700 bg-amber-50 rounded px-1.5 py-0.5 inline-block">
                            Alasan: &ldquo;{log.reason}&rdquo;
                          </div>
                        )}
                      </td>

                      {/* Perubahan Before & After */}
                      <td className="whitespace-nowrap px-4 py-3.5 text-right text-xs">
                        {hasStateDiff ? (
                          <button
                            type="button"
                            onClick={() => setActiveLogDiff(log)}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition"
                          >
                            <ArrowRightLeft className="h-3.5 w-3.5 text-indigo-600" />
                            Bandingkan
                          </button>
                        ) : (
                          <span className="text-[11px] text-slate-400 italic">
                            Tanpa snapshot
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Paginasi Footer */}
          <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
            <div>
              Menampilkan <span className="font-medium">{logs.length}</span> dari{' '}
              <span className="font-medium">{total}</span> catatan audit
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1 || loading}
                className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                Sebelumnya
              </button>
              <span className="px-2 font-medium">
                Halaman {page} dari {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages || loading}
                className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50"
              >
                Berikutnya
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal / Dialog Komparasi Before vs After */}
      {activeLogDiff && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
          <div className="relative w-full max-w-4xl max-h-[85vh] flex flex-col rounded-2xl bg-white shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 bg-slate-50">
              <div>
                <div className="flex items-center gap-2">
                  <span className="inline-block rounded bg-indigo-100 px-2 py-0.5 font-mono text-xs font-bold text-indigo-700">
                    {activeLogDiff.action}
                  </span>
                  <h3 className="text-base font-bold text-slate-900">
                    Perbandingan Snapshot State Data
                  </h3>
                </div>
                <p className="mt-0.5 text-xs text-slate-500">
                  Entitas {activeLogDiff.entityType} ({activeLogDiff.entityId}) • {formatTimestamp(activeLogDiff.createdAt)}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setActiveLogDiff(null)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-200 hover:text-slate-600 transition"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Body: Kolom Komparasi Side-by-Side */}
            <div className="flex-1 overflow-y-auto p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Kolom Kiri: Before */}
              <div className="flex flex-col rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center justify-between pb-2 border-b border-slate-200 mb-3">
                  <span className="text-xs font-bold uppercase tracking-wider text-rose-700 flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-rose-600 inline-block"></span>
                    Sebelum (Before)
                  </span>
                  {!activeLogDiff.before && (
                    <span className="text-[11px] text-slate-400 italic">
                      (Data Baru / Dibuat)
                    </span>
                  )}
                </div>

                <div className="flex-1 overflow-x-auto rounded-lg bg-slate-900 p-3 text-[12px] font-mono text-emerald-400">
                  {activeLogDiff.before ? (
                    <pre className="whitespace-pre-wrap break-words">
                      {JSON.stringify(activeLogDiff.before, null, 2)}
                    </pre>
                  ) : (
                    <span className="text-slate-500 italic">null (tidak ada state sebelum perubahan)</span>
                  )}
                </div>
              </div>

              {/* Kolom Kanan: After */}
              <div className="flex flex-col rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center justify-between pb-2 border-b border-slate-200 mb-3">
                  <span className="text-xs font-bold uppercase tracking-wider text-emerald-700 flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-emerald-600 inline-block"></span>
                    Sesudah (After)
                  </span>
                  {!activeLogDiff.after && (
                    <span className="text-[11px] text-slate-400 italic">
                      (Data Dihapus / Void)
                    </span>
                  )}
                </div>

                <div className="flex-1 overflow-x-auto rounded-lg bg-slate-900 p-3 text-[12px] font-mono text-sky-400">
                  {activeLogDiff.after ? (
                    <pre className="whitespace-pre-wrap break-words">
                      {JSON.stringify(activeLogDiff.after, null, 2)}
                    </pre>
                  ) : (
                    <span className="text-slate-500 italic">null (tidak ada state setelah perubahan)</span>
                  )}
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="border-t border-slate-200 bg-slate-50 px-6 py-3 flex items-center justify-between text-xs text-slate-500">
              <div>
                Pelaksana: <span className="font-semibold text-slate-800">{activeLogDiff.actor?.name || 'Sistem'}</span> (IP: {activeLogDiff.ip || '-'})
              </div>
              <button
                type="button"
                onClick={() => setActiveLogDiff(null)}
                className="rounded-lg bg-slate-800 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-slate-700 transition"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
