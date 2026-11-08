'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  ArrowLeft,
  Users,
  Calendar,
  Clock,
  CheckCircle2,
  AlertCircle,
  Phone,
  Mail,
  UserCheck,
  MessageSquare,
  HelpCircle,
  ShoppingCart,
  Plus,
  Trash2,
  Tag,
  DollarSign,
  ChevronRight,
  ExternalLink,
  Loader2,
  Check,
} from 'lucide-react';
import { Skeleton, EmptyState, ErrorState } from '@/components/ui/States';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { formatRupiah } from '@/lib/domain/money';

export type PipelineStage = 'LEAD' | 'PROSPECT' | 'DEAL' | 'REPEAT' | 'LOST';
export type InteractionType = 'CALL' | 'VISIT' | 'WHATSAPP' | 'EMAIL' | 'OTHER';

interface CustomerDetail {
  id: string;
  businessId: string;
  code: string;
  name: string;
  contactName: string | null;
  phone: string | null;
  address: string | null;
  shippingAddress: string | null;
  billingAddress: string | null;
  npwp: string | null;
  assignedSalesId: string | null;
  pipelineStage: PipelineStage;
  tags: string[];
  notes: string | null;
  rev: number;
  createdAt: string;
  updatedAt: string;
  assignedSales?: {
    id: string;
    name: string;
    username: string;
  } | null;
  _count?: {
    orders: number;
    customerPromos: number;
    crmInteractions: number;
    crmTasks: number;
  };
}

interface TimelineItem {
  id: string;
  kind: 'INTERACTION' | 'ORDER';
  timestamp: string;
  interaction?: {
    type: InteractionType;
    summary: string;
    occurredAt: string;
    nextFollowUpAt: string | null;
    sales: { id: string; name: string; username: string } | null;
    createdAt: string;
  };
  order?: {
    orderNo: string | null;
    status: string;
    grandTotal: number;
    orderDate: string;
    sales: { id: string; name: string; username: string } | null;
    createdAt: string;
  };
}

interface CrmTaskItem {
  id: string;
  businessId: string;
  customerId: string;
  assignedToId: string;
  title: string;
  dueAt: string;
  doneAt: string | null;
  createdAt: string;
  computedStatus: 'PENDING' | 'OVERDUE' | 'DONE';
  assignedTo?: {
    id: string;
    name: string;
    username: string;
  } | null;
}

interface SalesOption {
  id: string;
  name: string;
  username: string;
}

export default function CustomerDetailPage() {
  const params = useParams();
  const customerId = params?.id as string;

  // State data utama
  const [customer, setCustomer] = useState<CustomerDetail | null>(null);
  const [timeline, setTimeline] = useState<TimelineItem[]>([]);
  const [tasks, setTasks] = useState<CrmTaskItem[]>([]);
  const [salesList, setSalesList] = useState<SalesOption[]>([]);
  const [currentUserRole, setCurrentUserRole] = useState<'SUPERADMIN' | 'SALES'>('SALES');
  const [currentUserId, setCurrentUserId] = useState<string>('');

  // Status loading & error halaman
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Tab aktif
  type TabKey = 'summary' | 'timeline' | 'tasks' | 'orders' | 'pricing';
  const [activeTab, setActiveTab] = useState<TabKey>('timeline');

  // Filter tugas follow-up
  const [taskFilter, setTaskFilter] = useState<'ALL' | 'PENDING' | 'OVERDUE' | 'DONE'>('ALL');

  // Modal Catat Interaksi
  const [interactionModalOpen, setInteractionModalOpen] = useState(false);
  const [interactionType, setInteractionType] = useState<InteractionType>('CALL');
  const [interactionSummary, setInteractionSummary] = useState('');
  const [interactionOccurredAt, setInteractionOccurredAt] = useState('');
  const [interactionFollowUpAt, setInteractionFollowUpAt] = useState('');
  const [submittingInteraction, setSubmittingInteraction] = useState(false);
  const [interactionError, setInteractionError] = useState<string | null>(null);

  // Modal Tambah Tugas Manual
  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDueAt, setTaskDueAt] = useState('');
  const [taskAssignedToId, setTaskAssignedToId] = useState('');
  const [submittingTask, setSubmittingTask] = useState(false);
  const [taskError, setTaskError] = useState<string | null>(null);

  // Quick Pipeline Stage Changing
  const [changingStage, setChangingStage] = useState(false);

  // Format Helper: Tanggal dan Waktu WIB
  const formatWib = (isoString: string) => {
    try {
      const d = new Date(isoString);
      return (
        new Intl.DateTimeFormat('id-ID', {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          timeZone: 'Asia/Jakarta',
        }).format(d) + ' WIB'
      );
    } catch {
      return isoString;
    }
  };

  const formatShortDate = (isoString: string) => {
    try {
      const d = new Date(isoString);
      return new Intl.DateTimeFormat('id-ID', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        timeZone: 'Asia/Jakarta',
      }).format(d);
    } catch {
      return isoString;
    }
  };

  // Muat data pelanggan, timeline, dan tugas
  const loadData = useCallback(async () => {
    if (!customerId) return;
    setLoading(true);
    setError(null);

    try {
      // 1. Profil pengguna saat ini
      const meRes = await fetch('/api/v1/auth/me');
      if (meRes.ok) {
        const meJson = await meRes.json();
        if (meJson.ok && meJson.data?.user) {
          setCurrentUserRole(meJson.data.user.role);
          setCurrentUserId(meJson.data.user.id);
        }
      }

      // 2. Data Pelanggan
      const custRes = await fetch(`/api/v1/customers/${customerId}`);
      if (!custRes.ok) {
        if (custRes.status === 404) {
          throw new Error('Pelanggan tidak ditemukan atau Anda tidak memiliki akses ke pelanggan ini.');
        }
        throw new Error('Gagal memuat data pelanggan');
      }
      const custJson = await custRes.json();
      setCustomer(custJson.data);

      // 3. Linimasa (Timeline)
      const tlRes = await fetch(`/api/v1/customers/${customerId}/timeline`);
      if (tlRes.ok) {
        const tlJson = await tlRes.json();
        setTimeline(tlJson.data?.timeline || []);
      }

      // 4. Tugas Follow-up CRM
      const taskRes = await fetch(`/api/v1/crm/tasks?customerId=${customerId}&status=ALL`);
      if (taskRes.ok) {
        const taskJson = await taskRes.json();
        setTasks(taskJson.data || []);
      }

      // 5. Daftar sales jika Super Admin
      const usersRes = await fetch('/api/v1/users?role=SALES');
      if (usersRes.ok) {
        const usersJson = await usersRes.json();
        if (usersJson.ok && Array.isArray(usersJson.data)) {
          setSalesList(usersJson.data);
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Terjadi kesalahan sistem';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [customerId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Handler Ganti Tahap Pipeline Cepat
  const handleChangeStage = async (newStage: PipelineStage) => {
    if (!customer || changingStage || customer.pipelineStage === newStage) return;
    setChangingStage(true);

    try {
      const res = await fetch(`/api/v1/customers/${customer.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rev: customer.rev,
          pipelineStage: newStage,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        if (json.error?.code === 'OPTIMISTIC_LOCK_ERROR') {
          alert('Data telah diubah pengguna lain. Halaman akan dimuat ulang.');
          loadData();
          return;
        }
        throw new Error(json.error?.message || 'Gagal mengubah tahap pipeline');
      }

      setCustomer(json.data);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Gagal memperbarui status');
    } finally {
      setChangingStage(false);
    }
  };

  // Buka Modal Interaksi
  const handleOpenInteractionModal = () => {
    setInteractionType('CALL');
    setInteractionSummary('');
    // Format YYYY-MM-DDTHH:mm untuk input datetime-local lokal
    const now = new Date();
    const tzOffset = now.getTimezoneOffset() * 60000;
    const localISOTime = new Date(now.getTime() - tzOffset).toISOString().slice(0, 16);
    setInteractionOccurredAt(localISOTime);
    setInteractionFollowUpAt('');
    setInteractionError(null);
    setInteractionModalOpen(true);
  };

  // Simpan Interaksi Baru
  const handleSubmitInteraction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customer || submittingInteraction) return;

    if (!interactionSummary.trim()) {
      setInteractionError('Ringkasan interaksi wajib diisi');
      return;
    }

    setSubmittingInteraction(true);
    setInteractionError(null);

    try {
      const body: Record<string, unknown> = {
        type: interactionType,
        summary: interactionSummary.trim(),
        occurredAt: interactionOccurredAt ? new Date(interactionOccurredAt).toISOString() : new Date().toISOString(),
      };

      if (interactionFollowUpAt) {
        body.nextFollowUpAt = new Date(interactionFollowUpAt).toISOString();
      }

      const res = await fetch(`/api/v1/customers/${customer.id}/interactions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error?.message || 'Gagal mencatat interaksi');
      }

      setInteractionModalOpen(false);
      // Muat ulang linimasa dan tugas CRM
      loadData();
    } catch (err: unknown) {
      setInteractionError(err instanceof Error ? err.message : 'Gagal mencatat interaksi');
    } finally {
      setSubmittingInteraction(false);
    }
  };

  // Buka Modal Tugas Manual
  const handleOpenTaskModal = () => {
    setTaskTitle('');
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(9, 0, 0, 0);
    const tzOffset = tomorrow.getTimezoneOffset() * 60000;
    const localISOTime = new Date(tomorrow.getTime() - tzOffset).toISOString().slice(0, 16);
    setTaskDueAt(localISOTime);
    setTaskAssignedToId(customer?.assignedSalesId || currentUserId);
    setTaskError(null);
    setTaskModalOpen(true);
  };

  // Simpan Tugas CRM Baru
  const handleSubmitTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customer || submittingTask) return;

    if (!taskTitle.trim()) {
      setTaskError('Judul tugas wajib diisi');
      return;
    }
    if (!taskDueAt) {
      setTaskError('Tenggat waktu wajib diisi');
      return;
    }

    setSubmittingTask(true);
    setTaskError(null);

    try {
      const body: Record<string, unknown> = {
        customerId: customer.id,
        title: taskTitle.trim(),
        dueAt: new Date(taskDueAt).toISOString(),
      };

      if (currentUserRole === 'SUPERADMIN' && taskAssignedToId) {
        body.assignedToId = taskAssignedToId;
      }

      const res = await fetch('/api/v1/crm/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error?.message || 'Gagal membuat tugas CRM');
      }

      setTaskModalOpen(false);
      loadData();
    } catch (err: unknown) {
      setTaskError(err instanceof Error ? err.message : 'Gagal membuat tugas');
    } finally {
      setSubmittingTask(false);
    }
  };

  // Toggle Centang Selesai / Belum Selesai Tugas
  const handleToggleTaskDone = async (task: CrmTaskItem) => {
    const isDone = task.doneAt !== null;
    try {
      const res = await fetch(`/api/v1/crm/tasks/${task.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ done: !isDone }),
      });

      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error?.message || 'Gagal memperbarui status tugas');
      }

      // Perbarui state lokal secara responsif
      setTasks((prev) =>
        prev.map((t) =>
          t.id === task.id
            ? {
                ...t,
                doneAt: !isDone ? new Date().toISOString() : null,
                computedStatus: !isDone ? 'DONE' : new Date(t.dueAt) < new Date() ? 'OVERDUE' : 'PENDING',
              }
            : t
        )
      );
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Gagal memperbarui status tugas');
    }
  };

  // Hapus Tugas CRM
  const handleDeleteTask = async (taskId: string) => {
    if (!confirm('Apakah Anda yakin ingin menghapus tugas ini?')) return;

    try {
      const res = await fetch(`/api/v1/crm/tasks/${taskId}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error?.message || 'Gagal menghapus tugas');
      }

      setTasks((prev) => prev.filter((t) => t.id !== taskId));
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Gagal menghapus tugas');
    }
  };

  // Filter list tasks
  const filteredTasks = useMemo(() => {
    if (taskFilter === 'ALL') return tasks;
    return tasks.filter((t) => t.computedStatus === taskFilter);
  }, [tasks, taskFilter]);

  // Ikon Interaksi
  const getInteractionIcon = (type: InteractionType) => {
    switch (type) {
      case 'CALL':
        return <Phone className="w-4 h-4 text-emerald-600" />;
      case 'VISIT':
        return <UserCheck className="w-4 h-4 text-blue-600" />;
      case 'WHATSAPP':
        return <MessageSquare className="w-4 h-4 text-green-600" />;
      case 'EMAIL':
        return <Mail className="w-4 h-4 text-purple-600" />;
      default:
        return <HelpCircle className="w-4 h-4 text-slate-600" />;
    }
  };

  const getInteractionLabel = (type: InteractionType) => {
    switch (type) {
      case 'CALL':
        return 'Panggilan Telepon';
      case 'VISIT':
        return 'Kunjungan Langsung';
      case 'WHATSAPP':
        return 'Pesan WhatsApp';
      case 'EMAIL':
        return 'Email Resmi';
      default:
        return 'Interaksi Lainnya';
    }
  };

  // Pipeline Stage options
  const stages: { stage: PipelineStage; label: string; color: string }[] = [
    { stage: 'LEAD', label: 'Lead', color: 'bg-sky-50 text-sky-700 border-sky-300' },
    { stage: 'PROSPECT', label: 'Prospek', color: 'bg-amber-50 text-amber-700 border-amber-300' },
    { stage: 'DEAL', label: 'Deal', color: 'bg-emerald-50 text-emerald-700 border-emerald-300' },
    { stage: 'REPEAT', label: 'Repeat', color: 'bg-purple-50 text-purple-700 border-purple-300' },
    { stage: 'LOST', label: 'Lost', color: 'bg-rose-50 text-rose-700 border-rose-300' },
  ];

  // 1. Loading State
  if (loading) {
    return (
      <div className="space-y-6 max-w-6xl mx-auto pb-12">
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-28 rounded-xl" />
          <Skeleton className="h-10 w-48 rounded-xl" />
        </div>
        <Skeleton className="h-40 w-full rounded-2xl" />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Skeleton className="h-24 rounded-2xl" />
          <Skeleton className="h-24 rounded-2xl" />
          <Skeleton className="h-24 rounded-2xl" />
          <Skeleton className="h-24 rounded-2xl" />
        </div>
        <Skeleton className="h-96 w-full rounded-2xl" />
      </div>
    );
  }

  // 2. Error State
  if (error || !customer) {
    return (
      <div className="max-w-2xl mx-auto py-12">
        <ErrorState
          title="Gagal Membuka Pelanggan"
          message={error || 'Pelanggan tidak ditemukan'}
          onRetry={loadData}
        />
        <div className="mt-4 text-center">
          <Link
            href="/customers"
            className="inline-flex items-center gap-2 text-sm font-semibold text-indigo-600 hover:text-indigo-800"
          >
            <ArrowLeft className="w-4 h-4" />
            Kembali ke Daftar Pelanggan
          </Link>
        </div>
      </div>
    );
  }

  const isSuperAdmin = currentUserRole === 'SUPERADMIN';

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-12">
      {/* Tombol Kembali & Navigasi Atas */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <Link
          href="/customers"
          className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-slate-900 bg-white border border-slate-200 px-3.5 py-2 rounded-xl shadow-sm transition-colors min-h-[44px]"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Daftar Pelanggan</span>
        </Link>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleOpenInteractionModal}
            className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm px-4 py-2.5 rounded-xl shadow-sm transition-all min-h-[44px]"
          >
            <Plus className="w-4 h-4" />
            <span>Catat Interaksi</span>
          </button>

          <button
            type="button"
            onClick={handleOpenTaskModal}
            className="inline-flex items-center gap-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 font-semibold text-sm px-4 py-2.5 rounded-xl shadow-sm transition-all min-h-[44px]"
          >
            <Calendar className="w-4 h-4 text-slate-500" />
            <span>Tambah Tugas</span>
          </button>
        </div>
      </div>

      {/* Header Kartu Informasi Pelanggan */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 md:p-6 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2 mb-1.5">
              <span className="font-mono text-xs font-bold px-2.5 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200">
                {customer.code}
              </span>
              <StatusBadge status={customer.pipelineStage} />
              {customer.assignedSales && (
                <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                  <UserCheck className="w-3.5 h-3.5 text-slate-500" />
                  Sales: <strong className="font-semibold text-slate-900">{customer.assignedSales.name}</strong>
                </span>
              )}
            </div>

            <h1 className="text-xl md:text-2xl font-bold text-slate-900">
              {customer.name}
            </h1>
          </div>

          {/* Quick Pipeline Stage Buttons */}
          <div className="bg-slate-50 p-2 rounded-xl border border-slate-200">
            <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 px-1">
              Tahap Pipeline Pelanggan
            </div>
            <div className="flex flex-wrap gap-1">
              {stages.map((st) => {
                const isSelected = customer.pipelineStage === st.stage;
                return (
                  <button
                    key={st.stage}
                    type="button"
                    disabled={changingStage}
                    onClick={() => handleChangeStage(st.stage)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all min-h-[36px] flex items-center gap-1 border ${
                      isSelected
                        ? `${st.color} shadow-sm ring-2 ring-indigo-500/20`
                        : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {isSelected && <Check className="w-3.5 h-3.5" />}
                    <span>{st.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Tags */}
        {customer.tags && customer.tags.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap pt-2 border-t border-slate-100">
            <Tag className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-xs font-semibold text-slate-500 mr-1">Tag:</span>
            {customer.tags.map((t, idx) => (
              <span
                key={idx}
                className="text-xs font-medium px-2.5 py-0.5 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-100"
              >
                #{t}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Ringkasan Angka Statistik */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 text-xs font-medium mb-1">
            <span>Total Order</span>
            <ShoppingCart className="w-4 h-4 text-indigo-500" />
          </div>
          <div className="text-xl font-bold text-slate-900">
            {customer._count?.orders ?? 0}
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 text-xs font-medium mb-1">
            <span>Interaksi CRM</span>
            <Clock className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-xl font-bold text-slate-900">
            {timeline.filter((t) => t.kind === 'INTERACTION').length}
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 text-xs font-medium mb-1">
            <span>Tugas Aktif</span>
            <Calendar className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-xl font-bold text-slate-900">
            {tasks.filter((t) => t.doneAt === null).length}
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 text-xs font-medium mb-1">
            <span>Tugas Selesai</span>
            <CheckCircle2 className="w-4 h-4 text-blue-500" />
          </div>
          <div className="text-xl font-bold text-slate-900">
            {tasks.filter((t) => t.doneAt !== null).length}
          </div>
        </div>
      </div>

      {/* Navigasi Tab (Seksi 11.3: Ringkasan, Timeline CRM, Order, Harga dan Promo, Saldo Kredit) */}
      <div className="border-b border-slate-200 flex gap-2 overflow-x-auto no-scrollbar">
        <button
          type="button"
          onClick={() => setActiveTab('timeline')}
          className={`pb-3 px-4 font-bold text-sm border-b-2 whitespace-nowrap transition-colors flex items-center gap-2 ${
            activeTab === 'timeline'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Clock className="w-4 h-4" />
          <span>Timeline CRM</span>
          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
            {timeline.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('tasks')}
          className={`pb-3 px-4 font-bold text-sm border-b-2 whitespace-nowrap transition-colors flex items-center gap-2 ${
            activeTab === 'tasks'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Calendar className="w-4 h-4" />
          <span>Tugas Follow-up</span>
          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
            {tasks.filter((t) => t.doneAt === null).length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('summary')}
          className={`pb-3 px-4 font-bold text-sm border-b-2 whitespace-nowrap transition-colors flex items-center gap-2 ${
            activeTab === 'summary'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>Ringkasan Kontak</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('orders')}
          className={`pb-3 px-4 font-bold text-sm border-b-2 whitespace-nowrap transition-colors flex items-center gap-2 ${
            activeTab === 'orders'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <ShoppingCart className="w-4 h-4" />
          <span>Order</span>
          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
            {timeline.filter((t) => t.kind === 'ORDER').length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('pricing')}
          className={`pb-3 px-4 font-bold text-sm border-b-2 whitespace-nowrap transition-colors flex items-center gap-2 ${
            activeTab === 'pricing'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <DollarSign className="w-4 h-4" />
          <span>Harga & Promo</span>
        </button>
      </div>

      {/* KONTEN TAB 1: TIMELINE CRM */}
      {activeTab === 'timeline' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-900">
              Linimasa Kronologis Interaksi & Order
            </h2>
            <button
              type="button"
              onClick={handleOpenInteractionModal}
              className="text-xs font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 min-h-[36px]"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Catat Interaksi</span>
            </button>
          </div>

          {timeline.length === 0 ? (
            <EmptyState
              title="Belum Ada Aktivitas CRM"
              description="Belum ada catatan interaksi atau order untuk pelanggan ini. Klik tombol di bawah untuk mencatat interaksi pertama."
              actionText="Catat Interaksi Sekarang"
              onAction={handleOpenInteractionModal}
            />
          ) : (
            <div className="relative pl-6 md:pl-8 space-y-6 before:absolute before:left-3 md:before:left-4 before:top-3 before:bottom-3 before:w-0.5 before:bg-slate-200">
              {timeline.map((item) => {
                const isInteraction = item.kind === 'INTERACTION' && item.interaction;
                const isOrder = item.kind === 'ORDER' && item.order;

                return (
                  <div key={item.id} className="relative group">
                    {/* Lingkaran Titik Linimasa */}
                    <div className="absolute -left-6 md:-left-8 top-1.5 w-6 h-6 rounded-full bg-white border-2 border-slate-300 group-hover:border-indigo-500 flex items-center justify-center shadow-xs transition-colors">
                      {isInteraction ? (
                        getInteractionIcon(item.interaction!.type)
                      ) : (
                        <ShoppingCart className="w-3.5 h-3.5 text-indigo-600" />
                      )}
                    </div>

                    {/* Kartu Linimasa */}
                    <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs hover:border-slate-300 transition-colors">
                      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                        <div className="flex items-center gap-2">
                          {isInteraction ? (
                            <span className="inline-flex items-center gap-1.5 text-xs font-bold px-2 py-0.5 rounded-md bg-slate-100 text-slate-800">
                              {getInteractionLabel(item.interaction!.type)}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 text-xs font-bold px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700">
                              Pesanan: {item.order!.orderNo || 'Draft Order'}
                            </span>
                          )}

                          {isOrder && <StatusBadge status={item.order!.status} />}
                        </div>

                        <div className="text-xs text-slate-500 font-medium">
                          {formatWib(item.timestamp)}
                        </div>
                      </div>

                      {/* Isi Konten */}
                      {isInteraction ? (
                        <div className="space-y-2">
                          <p className="text-sm text-slate-800 whitespace-pre-wrap leading-relaxed">
                            {item.interaction!.summary}
                          </p>

                          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 text-xs border-t border-slate-100">
                            <span className="text-slate-500">
                              Dicatat oleh:{' '}
                              <strong className="text-slate-700 font-semibold">
                                {item.interaction!.sales?.name || 'Staf'}
                              </strong>
                            </span>

                            {item.interaction!.nextFollowUpAt && (
                              <span className="inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-md bg-amber-50 text-amber-800 border border-amber-200">
                                <Calendar className="w-3 h-3 text-amber-600" />
                                Follow-up: {formatShortDate(item.interaction!.nextFollowUpAt)}
                              </span>
                            )}
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-slate-500">Nilai Pesanan:</span>
                            <span className="font-bold text-slate-900 text-base">
                              {formatRupiah(item.order!.grandTotal)}
                            </span>
                          </div>

                          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 text-xs border-t border-slate-100">
                            <span className="text-slate-500">
                              Sales Penanggung Jawab:{' '}
                              <strong className="text-slate-700 font-semibold">
                                {item.order!.sales?.name || 'Staf'}
                              </strong>
                            </span>

                            <Link
                              href={`/orders/${item.id.replace('order-', '')}`}
                              className="text-indigo-600 hover:text-indigo-800 font-semibold inline-flex items-center gap-1"
                            >
                              <span>Lihat Order</span>
                              <ExternalLink className="w-3 h-3" />
                            </Link>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* KONTEN TAB 2: TUGAS FOLLOW-UP */}
      {activeTab === 'tasks' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            {/* Filter Pills */}
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
              {(
                [
                  { key: 'ALL', label: 'Semua' },
                  { key: 'PENDING', label: 'Menunggu' },
                  { key: 'OVERDUE', label: 'Terlambat' },
                  { key: 'DONE', label: 'Selesai' },
                ] as const
              ).map((f) => (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => setTaskFilter(f.key)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all min-h-[36px] ${
                    taskFilter === f.key
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={handleOpenTaskModal}
              className="inline-flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs px-3.5 py-2 rounded-xl shadow-xs transition-all min-h-[44px]"
            >
              <Plus className="w-4 h-4" />
              <span>Tambah Tugas</span>
            </button>
          </div>

          {filteredTasks.length === 0 ? (
            <EmptyState
              title="Tidak Ada Tugas Follow-up"
              description="Tidak ada tugas follow-up pada filter yang dipilih. Tambah tugas baru untuk mengingatkan jadwal kontak berikutnya."
              actionText="Tambah Tugas Baru"
              onAction={handleOpenTaskModal}
            />
          ) : (
            <div className="space-y-2.5">
              {filteredTasks.map((t) => {
                const isDone = t.doneAt !== null;
                const isOverdue = t.computedStatus === 'OVERDUE';

                return (
                  <div
                    key={t.id}
                    className={`bg-white rounded-xl border p-4 shadow-xs flex items-start gap-3 transition-all ${
                      isDone
                        ? 'border-slate-200 bg-slate-50/50 opacity-80'
                        : isOverdue
                        ? 'border-rose-200 bg-rose-50/20'
                        : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    {/* Checkbox Selesai */}
                    <button
                      type="button"
                      onClick={() => handleToggleTaskDone(t)}
                      className={`mt-0.5 w-6 h-6 rounded-lg border flex items-center justify-center transition-colors min-w-[24px] min-h-[24px] ${
                        isDone
                          ? 'bg-emerald-600 border-emerald-600 text-white'
                          : 'border-slate-300 hover:border-indigo-600 bg-white'
                      }`}
                      title={isDone ? 'Tandai belum selesai' : 'Tandai selesai'}
                    >
                      {isDone && <Check className="w-4 h-4 stroke-[3]" />}
                    </button>

                    {/* Info Tugas */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <h4
                          className={`text-sm font-bold leading-snug break-words ${
                            isDone ? 'line-through text-slate-400' : 'text-slate-900'
                          }`}
                        >
                          {t.title}
                        </h4>

                        <button
                          type="button"
                          onClick={() => handleDeleteTask(t.id)}
                          className="text-slate-400 hover:text-rose-600 p-1 rounded-md min-h-[36px] min-w-[36px] flex items-center justify-center transition-colors"
                          title="Hapus Tugas"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 mt-2">
                        {/* Status Tenggat */}
                        {isDone ? (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <CheckCircle2 className="w-3 h-3" />
                            Selesai: {formatShortDate(t.doneAt!)}
                          </span>
                        ) : isOverdue ? (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-200">
                            <AlertCircle className="w-3 h-3" />
                            Terlambat: {formatShortDate(t.dueAt)}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200">
                            <Clock className="w-3 h-3" />
                            Tenggat: {formatShortDate(t.dueAt)}
                          </span>
                        )}

                        {t.assignedTo && (
                          <span className="text-xs text-slate-500">
                            Ditugaskan ke: <strong>{t.assignedTo.name}</strong>
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* KONTEN TAB 3: RINGKASAN KONTAK & ALAMAT */}
      {activeTab === 'summary' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Informasi Kontak */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-4">
            <h3 className="text-base font-bold text-slate-900 border-b border-slate-100 pb-2">
              Kontak & Komunikasi
            </h3>

            <div className="space-y-3 text-sm">
              <div>
                <span className="block text-xs font-bold text-slate-400 uppercase tracking-wider">
                  Nama Kontak (PIC)
                </span>
                <span className="font-semibold text-slate-800">
                  {customer.contactName || '-'}
                </span>
              </div>

              <div>
                <span className="block text-xs font-bold text-slate-400 uppercase tracking-wider">
                  Nomor Telepon / WhatsApp
                </span>
                {customer.phone ? (
                  <div className="flex items-center gap-2 mt-1">
                    <span className="font-semibold text-slate-800">{customer.phone}</span>
                    <a
                      href={`tel:${customer.phone}`}
                      className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 min-h-[36px] min-w-[36px] flex items-center justify-center transition-colors"
                      title="Panggil Telepon"
                    >
                      <Phone className="w-3.5 h-3.5" />
                    </a>
                    <a
                      href={`https://wa.me/${customer.phone.replace(/[^0-9]/g, '')}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1.5 rounded-lg bg-green-50 hover:bg-green-100 text-green-700 min-h-[36px] min-w-[36px] flex items-center justify-center transition-colors"
                      title="Kirim Pesan WhatsApp"
                    >
                      <MessageSquare className="w-3.5 h-3.5" />
                    </a>
                  </div>
                ) : (
                  <span className="text-slate-400">-</span>
                )}
              </div>

              <div>
                <span className="block text-xs font-bold text-slate-400 uppercase tracking-wider">
                  NPWP
                </span>
                <span className="font-mono text-slate-800">
                  {customer.npwp || '-'}
                </span>
              </div>

              <div>
                <span className="block text-xs font-bold text-slate-400 uppercase tracking-wider">
                  Catatan Tambahan
                </span>
                <p className="text-slate-700 whitespace-pre-wrap mt-0.5">
                  {customer.notes || '-'}
                </p>
              </div>
            </div>
          </div>

          {/* Alamat Pengiriman & Penagihan */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-4">
            <h3 className="text-base font-bold text-slate-900 border-b border-slate-100 pb-2">
              Alamat Lengkap
            </h3>

            <div className="space-y-3 text-sm">
              <div>
                <span className="block text-xs font-bold text-slate-400 uppercase tracking-wider">
                  Alamat Utama Pelanggan
                </span>
                <p className="text-slate-800 whitespace-pre-wrap mt-0.5">
                  {customer.address || '-'}
                </p>
              </div>

              <div>
                <span className="block text-xs font-bold text-slate-400 uppercase tracking-wider">
                  Alamat Pengiriman Barang
                </span>
                <p className="text-slate-800 whitespace-pre-wrap mt-0.5">
                  {customer.shippingAddress || customer.address || '-'}
                </p>
              </div>

              <div>
                <span className="block text-xs font-bold text-slate-400 uppercase tracking-wider">
                  Alamat Penagihan / Faktur
                </span>
                <p className="text-slate-800 whitespace-pre-wrap mt-0.5">
                  {customer.billingAddress || customer.address || '-'}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* KONTEN TAB 4: ORDER */}
      {activeTab === 'orders' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-900">
              Riwayat Pesanan Pelanggan
            </h2>
          </div>

          {timeline.filter((t) => t.kind === 'ORDER').length === 0 ? (
            <EmptyState
              title="Belum Ada Pesanan"
              description="Pelanggan ini belum pernah melakukan pemesanan order. Form order akan dibuat di Fase 2 berikutnya."
            />
          ) : (
            <div className="space-y-2.5">
              {timeline
                .filter((t) => t.kind === 'ORDER')
                .map((t) => (
                  <div
                    key={t.id}
                    className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs flex items-center justify-between gap-4"
                  >
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-mono text-sm font-bold text-slate-900">
                          {t.order?.orderNo || 'Draft Order'}
                        </span>
                        <StatusBadge status={t.order?.status || 'DRAFT'} />
                      </div>
                      <div className="text-xs text-slate-500">
                        Tanggal: {formatWib(t.timestamp)} • Sales: {t.order?.sales?.name || 'Staf'}
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="text-base font-bold text-slate-900">
                        {formatRupiah(t.order?.grandTotal || 0)}
                      </div>
                      <Link
                        href={`/orders/${t.id.replace('order-', '')}`}
                        className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 inline-flex items-center gap-1 mt-1"
                      >
                        <span>Rincian</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </Link>
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>
      )}

      {/* KONTEN TAB 5: HARGA & PROMO */}
      {activeTab === 'pricing' && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs text-center space-y-3">
          <DollarSign className="w-12 h-12 text-indigo-500 mx-auto" />
          <h3 className="text-lg font-bold text-slate-900">
            Aturan Harga Khusus & Promo Pelanggan (T2.3)
          </h3>
          <p className="text-sm text-slate-600 max-w-lg mx-auto">
            Fitur pengaturan batas harga minimal per produk (CustomerMinPrice), promo khusus pelanggan (CustomerPromo), dan riwayat perubahan harga akan diaktifkan pada tugas berikutnya (T2.3).
          </p>
        </div>
      )}

      {/* MODAL CATAT INTERAKSI CRM */}
      {interactionModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white w-full max-w-lg rounded-2xl shadow-xl border border-slate-200 overflow-hidden my-8 animate-in fade-in duration-200">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <Clock className="w-5 h-5 text-indigo-600" />
                Catat Interaksi CRM
              </h2>
              <button
                type="button"
                onClick={() => setInteractionModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg min-h-[36px] min-w-[36px] flex items-center justify-center"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmitInteraction} className="p-6 space-y-4">
              {interactionError && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-sm flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{interactionError}</span>
                </div>
              )}

              {/* Tipe Interaksi */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Tipe Interaksi <span className="text-rose-500">*</span>
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(
                    [
                      { type: 'CALL', label: 'Panggilan', icon: Phone },
                      { type: 'VISIT', label: 'Kunjungan', icon: UserCheck },
                      { type: 'WHATSAPP', label: 'WhatsApp', icon: MessageSquare },
                      { type: 'EMAIL', label: 'Email', icon: Mail },
                      { type: 'OTHER', label: 'Lainnya', icon: HelpCircle },
                    ] as const
                  ).map((t) => {
                    const Icon = t.icon;
                    const isSelected = interactionType === t.type;
                    return (
                      <button
                        key={t.type}
                        type="button"
                        onClick={() => setInteractionType(t.type)}
                        className={`p-2.5 rounded-xl border text-xs font-bold flex flex-col items-center gap-1 transition-all min-h-[50px] ${
                          isSelected
                            ? 'bg-indigo-50 border-indigo-600 text-indigo-700 shadow-xs'
                            : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        <Icon className="w-4 h-4" />
                        <span>{t.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Waktu Pelaksanaan */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Waktu Interaksi Terjadi <span className="text-rose-500">*</span>
                </label>
                <input
                  type="datetime-local"
                  required
                  value={interactionOccurredAt}
                  onChange={(e) => setInteractionOccurredAt(e.target.value)}
                  className="w-full text-base px-3.5 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 min-h-[44px]"
                />
              </div>

              {/* Ringkasan Pembicaraan */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Ringkasan / Catatan Interaksi <span className="text-rose-500">*</span>
                </label>
                <textarea
                  required
                  rows={3}
                  value={interactionSummary}
                  onChange={(e) => setInteractionSummary(e.target.value)}
                  placeholder="Contoh: Menanyakan stok produk A dan menawarkan promo repeat order..."
                  className="w-full text-base px-3.5 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 min-h-[44px]"
                />
              </div>

              {/* Tanggal Follow-up Otomatis (Automation Rule T2.2) */}
              <div className="bg-amber-50/60 p-3.5 rounded-xl border border-amber-200 space-y-2">
                <label className="block text-xs font-bold text-amber-900 uppercase tracking-wider">
                  Jadwalkan Follow-up Berikutnya (Opsional)
                </label>
                <input
                  type="datetime-local"
                  value={interactionFollowUpAt}
                  onChange={(e) => setInteractionFollowUpAt(e.target.value)}
                  className="w-full text-base px-3.5 py-2 rounded-lg border border-amber-300 bg-white focus:outline-none focus:ring-2 focus:ring-amber-500 min-h-[44px]"
                />
                <p className="text-xs text-amber-800 leading-relaxed">
                  💡 <strong>Aturan Otomatis:</strong> Jika tanggal di atas diisi, sistem akan <strong>otomatis membuat tugas follow-up</strong> pada daftar tugas CRM Anda.
                </p>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setInteractionModalOpen(false)}
                  disabled={submittingInteraction}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 font-semibold text-sm hover:bg-slate-50 min-h-[44px]"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={submittingInteraction}
                  className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm flex items-center gap-2 shadow-sm min-h-[44px] disabled:opacity-50"
                >
                  {submittingInteraction ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Menyimpan...</span>
                    </>
                  ) : (
                    <span>Simpan Catatan</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL TAMBAH TUGAS MANUAL */}
      {taskModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white w-full max-w-lg rounded-2xl shadow-xl border border-slate-200 overflow-hidden my-8 animate-in fade-in duration-200">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <Calendar className="w-5 h-5 text-indigo-600" />
                Tambah Tugas Follow-up CRM
              </h2>
              <button
                type="button"
                onClick={() => setTaskModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg min-h-[36px] min-w-[36px] flex items-center justify-center"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmitTask} className="p-6 space-y-4">
              {taskError && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-sm flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{taskError}</span>
                </div>
              )}

              {/* Judul Tugas */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Judul Tugas <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={taskTitle}
                  onChange={(e) => setTaskTitle(e.target.value)}
                  placeholder="Contoh: Kirim penawaran harga khusus via WA..."
                  className="w-full text-base px-3.5 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 min-h-[44px]"
                />
              </div>

              {/* Tenggat Waktu */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Tenggat Waktu Pelaksanaan <span className="text-rose-500">*</span>
                </label>
                <input
                  type="datetime-local"
                  required
                  value={taskDueAt}
                  onChange={(e) => setTaskDueAt(e.target.value)}
                  className="w-full text-base px-3.5 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 min-h-[44px]"
                />
              </div>

              {/* Penanggung Jawab (Super Admin Only) */}
              {isSuperAdmin && (
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Staf Penanggung Jawab
                  </label>
                  <select
                    value={taskAssignedToId}
                    onChange={(e) => setTaskAssignedToId(e.target.value)}
                    className="w-full text-base px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 min-h-[44px]"
                  >
                    <option value="">Pilih Staf Sales</option>
                    {salesList.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} (@{s.username})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setTaskModalOpen(false)}
                  disabled={submittingTask}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 font-semibold text-sm hover:bg-slate-50 min-h-[44px]"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={submittingTask}
                  className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm flex items-center gap-2 shadow-sm min-h-[44px] disabled:opacity-50"
                >
                  {submittingTask ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Menyimpan...</span>
                    </>
                  ) : (
                    <span>Buat Tugas</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
