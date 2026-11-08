'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  Bell,
  Clock,
  AlertTriangle,
  Calendar,
  Search,
  Plus,
  MessageCircle,
  ExternalLink,
  PauseCircle,
  PlayCircle,
  RefreshCw,
  Loader2,
  Package,
} from 'lucide-react';
import { StatusBadge } from '@/components/ui/StatusBadge';

interface CustomerInfo {
  id: string;
  code: string;
  name: string;
  phone: string | null;
  address: string | null;
}

interface ProductInfo {
  id: string;
  name: string;
  sku: string;
  unit: string;
}

interface ReminderItem {
  id: string;
  businessId: string;
  customerId: string;
  customer: CustomerInfo;
  productId: string | null;
  product: ProductInfo | null;
  salesId: string;
  intervalDays: number;
  lastOrderDate: string;
  nextDueDate: string;
  status: 'ACTIVE' | 'PAUSED' | 'DONE' | 'CANCELLED';
  source: 'AUTO' | 'MANUAL';
  snoozedUntil: string | null;
  lastNotifiedAt: string | null;
  escalatedAt: string | null;
  note: string | null;
  daysUntil: number;
  isOverdue: boolean;
  isDueToday: boolean;
}

interface ReminderMeta {
  total: number;
  overdueCount: number;
  dueTodayCount: number;
}

export default function RemindersPage() {
  const [reminders, setReminders] = useState<ReminderItem[]>([]);
  const [meta, setMeta] = useState<ReminderMeta>({
    total: 0,
    overdueCount: 0,
    dueTodayCount: 0,
  });
  const [loading, setLoading] = useState(true);
  const [dueFilter, setDueFilter] = useState<'all' | 'overdue' | 'today' | 'week'>('all');
  const [search, setSearch] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Modal states
  const [selectedReminder, setSelectedReminder] = useState<ReminderItem | null>(null);
  const [actionType, setActionType] = useState<'snooze' | 'edit_interval' | null>(null);
  const [newInterval, setNewInterval] = useState<number>(30);
  const [snoozeDays, setSnoozeDays] = useState<number>(7);

  const fetchReminders = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (dueFilter !== 'all') {
        params.set('due', dueFilter);
      }
      const res = await fetch(`/api/v1/reminders?${params.toString()}`);
      const json = await res.json();
      if (json.ok && Array.isArray(json.data)) {
        setReminders(json.data);
        if (json.meta) {
          setMeta(json.meta);
        }
      }
    } catch {
      // Tangani error jaringan
    } finally {
      setLoading(false);
    }
  }, [dueFilter]);

  useEffect(() => {
    fetchReminders();
  }, [fetchReminders]);

  const handleUpdateStatus = async (
    id: string,
    newStatus: 'ACTIVE' | 'PAUSED' | 'CANCELLED'
  ) => {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/v1/reminders/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        await fetchReminders();
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleSaveInterval = async () => {
    if (!selectedReminder || newInterval <= 0) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/v1/reminders/${selectedReminder.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ intervalDays: Number(newInterval) }),
      });
      if (res.ok) {
        setSelectedReminder(null);
        setActionType(null);
        await fetchReminders();
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleSaveSnooze = async () => {
    if (!selectedReminder || snoozeDays <= 0) return;
    setSubmitting(true);
    try {
      const snoozedDate = new Date(Date.now() + snoozeDays * 86_400_000);
      const res = await fetch(`/api/v1/reminders/${selectedReminder.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ snoozedUntil: snoozedDate.toISOString() }),
      });
      if (res.ok) {
        setSelectedReminder(null);
        setActionType(null);
        await fetchReminders();
      }
    } finally {
      setSubmitting(false);
    }
  };

  const filteredReminders = reminders.filter((r) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    const custMatch =
      r.customer.name.toLowerCase().includes(q) ||
      (r.customer.phone && r.customer.phone.includes(q)) ||
      r.customer.code.toLowerCase().includes(q);
    const prodMatch =
      r.product &&
      (r.product.name.toLowerCase().includes(q) ||
        r.product.sku.toLowerCase().includes(q));
    return custMatch || prodMatch;
  });

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
            <Bell className="h-6 w-6 text-indigo-600" />
            Pengingat Repeat Order
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Pantau siklus pemesanan ulang pelanggan untuk mencegah churn dan meningkatkan omset.
          </p>
        </div>
        <button
          type="button"
          onClick={fetchReminders}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Segarkan
        </button>
      </div>

      {/* Metrik Ringkasan */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
            <Calendar className="h-6 w-6" />
          </div>
          <div>
            <div className="text-2xl font-bold text-slate-900">{meta.total}</div>
            <div className="text-xs text-slate-500 font-medium">Pengingat Aktif</div>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-rose-50 text-rose-600">
            <AlertTriangle className="h-6 w-6" />
          </div>
          <div>
            <div className="text-2xl font-bold text-rose-600">{meta.overdueCount}</div>
            <div className="text-xs text-slate-500 font-medium">Perlu Follow-up (Terlambat)</div>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
            <Clock className="h-6 w-6" />
          </div>
          <div>
            <div className="text-2xl font-bold text-amber-600">{meta.dueTodayCount}</div>
            <div className="text-xs text-slate-500 font-medium">Jatuh Tempo Hari Ini</div>
          </div>
        </div>
      </div>

      {/* Filter & Tab */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
          <button
            type="button"
            onClick={() => setDueFilter('all')}
            className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold whitespace-nowrap transition-colors ${
              dueFilter === 'all'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            Semua ({reminders.length})
          </button>
          <button
            type="button"
            onClick={() => setDueFilter('overdue')}
            className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold whitespace-nowrap transition-colors ${
              dueFilter === 'overdue'
                ? 'bg-rose-600 text-white shadow-sm'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            Terlambat ({meta.overdueCount})
          </button>
          <button
            type="button"
            onClick={() => setDueFilter('today')}
            className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold whitespace-nowrap transition-colors ${
              dueFilter === 'today'
                ? 'bg-amber-600 text-white shadow-sm'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            Hari Ini ({meta.dueTodayCount})
          </button>
          <button
            type="button"
            onClick={() => setDueFilter('week')}
            className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold whitespace-nowrap transition-colors ${
              dueFilter === 'week'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            7 Hari Kedepan
          </button>
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Cari pelanggan / produk..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 py-1.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>
      </div>

      {/* Konten Daftar Pengingat */}
      {loading ? (
        <div className="flex flex-col items-center justify-center p-12 text-slate-400">
          <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
          <span className="mt-3 text-sm">Memuat data pengingat...</span>
        </div>
      ) : filteredReminders.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 p-12 text-center bg-white">
          <Bell className="mx-auto h-10 w-10 text-slate-300" />
          <h3 className="mt-3 text-sm font-semibold text-slate-900">
            Tidak ada pengingat ditemukan
          </h3>
          <p className="mt-1 text-xs text-slate-500 max-w-sm mx-auto">
            Pengingat akan terbentuk secara otomatis setiap kali pesanan pelanggan
            berhasil diselesaikan (COMPLETED).
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {filteredReminders.map((reminder) => {
            const cleanPhone = reminder.customer.phone
              ? reminder.customer.phone.replace(/[^0-9]/g, '')
              : null;
            const waNumber =
              cleanPhone && cleanPhone.startsWith('0')
                ? `62${cleanPhone.slice(1)}`
                : cleanPhone;

            return (
              <div
                key={reminder.id}
                className={`rounded-xl border bg-white p-4 sm:p-5 shadow-sm transition-all hover:border-slate-300 ${
                  reminder.isOverdue
                    ? 'border-rose-200 bg-rose-50/20'
                    : reminder.isDueToday
                    ? 'border-amber-200 bg-amber-50/20'
                    : 'border-slate-200'
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/customers/${reminder.customerId}`}
                        className="text-base font-bold text-slate-900 hover:text-indigo-600 transition-colors flex items-center gap-1"
                      >
                        {reminder.customer.name}
                        <ExternalLink className="h-3.5 w-3.5 text-slate-400" />
                      </Link>
                      <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-mono text-slate-600">
                        {reminder.customer.code}
                      </span>
                      <StatusBadge status={reminder.status} />
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                          reminder.source === 'AUTO'
                            ? 'bg-blue-50 text-blue-700 border border-blue-200'
                            : 'bg-purple-50 text-purple-700 border border-purple-200'
                        }`}
                      >
                        {reminder.source}
                      </span>
                    </div>

                    {reminder.product && (
                      <div className="flex items-center gap-1.5 text-xs text-slate-600 font-medium">
                        <Package className="h-3.5 w-3.5 text-slate-400" />
                        <span>{reminder.product.name}</span>
                        <span className="text-slate-400">({reminder.product.sku})</span>
                      </div>
                    )}

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 pt-1">
                      <div>
                        Siklus: <strong>{reminder.intervalDays} hari</strong>
                      </div>
                      <div>
                        Order Terakhir:{' '}
                        <strong>
                          {new Date(reminder.lastOrderDate).toLocaleDateString('id-ID')}
                        </strong>
                      </div>
                      <div>
                        Jatuh Tempo:{' '}
                        <strong
                          className={
                            reminder.isOverdue
                              ? 'text-rose-600'
                              : reminder.isDueToday
                              ? 'text-amber-600'
                              : 'text-slate-800'
                          }
                        >
                          {new Date(reminder.nextDueDate).toLocaleDateString('id-ID')}
                        </strong>
                      </div>
                    </div>

                    {reminder.snoozedUntil && (
                      <div className="text-[11px] text-amber-600 font-medium">
                        Ditunda sampai:{' '}
                        {new Date(reminder.snoozedUntil).toLocaleDateString('id-ID')}
                      </div>
                    )}
                  </div>

                  {/* Status Keterlambatan / Waktu */}
                  <div className="flex flex-col sm:items-end justify-between gap-3">
                    <div className="flex items-center gap-1.5">
                      {reminder.isOverdue ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2.5 py-1 text-xs font-bold text-rose-700">
                          <AlertTriangle className="h-3.5 w-3.5" />
                          Terlambat {Math.abs(reminder.daysUntil)} hari
                        </span>
                      ) : reminder.isDueToday ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-800">
                          <Clock className="h-3.5 w-3.5" />
                          Jatuh Tempo Hari Ini
                        </span>
                      ) : reminder.daysUntil <= 3 ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2.5 py-1 text-xs font-semibold text-blue-700">
                          <Calendar className="h-3.5 w-3.5" />
                          H-{reminder.daysUntil}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
                          {reminder.daysUntil} hari lagi
                        </span>
                      )}
                    </div>

                    {/* Tombol Aksi */}
                    <div className="flex flex-wrap items-center gap-2">
                      {waNumber && (
                        <a
                          href={`https://wa.me/${waNumber}?text=Halo%20${encodeURIComponent(
                            reminder.customer.name
                          )},%20apakah%20stok%20produk%20Anda%20masih%20aman%3F`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700"
                        >
                          <MessageCircle className="h-3.5 w-3.5" />
                          WhatsApp
                        </a>
                      )}

                      <Link
                        href={`/orders/new?customerId=${reminder.customerId}`}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-2.5 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-indigo-700"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Buat Order
                      </Link>

                      <button
                        type="button"
                        onClick={() => {
                          setSelectedReminder(reminder);
                          setActionType('snooze');
                        }}
                        className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                      >
                        Tunda
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setSelectedReminder(reminder);
                          setNewInterval(reminder.intervalDays);
                          setActionType('edit_interval');
                        }}
                        className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                      >
                        Ubah Interval
                      </button>

                      {reminder.status === 'ACTIVE' ? (
                        <button
                          type="button"
                          onClick={() => handleUpdateStatus(reminder.id, 'PAUSED')}
                          disabled={submitting}
                          title="Jeda Pengingat"
                          className="rounded-lg border border-slate-300 bg-white p-1.5 text-slate-500 hover:bg-slate-50"
                        >
                          <PauseCircle className="h-4 w-4" />
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleUpdateStatus(reminder.id, 'ACTIVE')}
                          disabled={submitting}
                          title="Aktifkan Kembali"
                          className="rounded-lg border border-emerald-300 bg-emerald-50 p-1.5 text-emerald-600 hover:bg-emerald-100"
                        >
                          <PlayCircle className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal Tunda (Snooze) */}
      {actionType === 'snooze' && selectedReminder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl">
            <h3 className="text-base font-bold text-slate-900">
              Tunda Pengingat
            </h3>
            <p className="mt-1 text-xs text-slate-500">
              Pilih berapa hari pengingat untuk {selectedReminder.customer.name} ditunda:
            </p>

            <div className="mt-4 flex gap-2">
              {[3, 7, 14].map((days) => (
                <button
                  key={days}
                  type="button"
                  onClick={() => setSnoozeDays(days)}
                  className={`flex-1 rounded-lg border py-2 text-xs font-semibold ${
                    snoozeDays === days
                      ? 'border-indigo-600 bg-indigo-50 text-indigo-700'
                      : 'border-slate-200 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  +{days} Hari
                </button>
              ))}
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setActionType(null)}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleSaveSnooze}
                disabled={submitting}
                className="rounded-lg bg-indigo-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700"
              >
                Simpan Penundaan
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Ubah Interval */}
      {actionType === 'edit_interval' && selectedReminder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl">
            <h3 className="text-base font-bold text-slate-900">
              Ubah Siklus Pengingat
            </h3>
            <p className="mt-1 text-xs text-slate-500">
              Ubah siklus interval repeat order untuk {selectedReminder.customer.name}.
              Status sumber akan otomatis menjadi <strong>MANUAL</strong>.
            </p>

            <div className="mt-4">
              <label className="block text-xs font-semibold text-slate-700">
                Interval (Hari):
              </label>
              <input
                type="number"
                min={1}
                max={365}
                value={newInterval}
                onChange={(e) => setNewInterval(Number(e.target.value))}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setActionType(null)}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleSaveInterval}
                disabled={submitting}
                className="rounded-lg bg-indigo-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700"
              >
                Simpan Interval
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
