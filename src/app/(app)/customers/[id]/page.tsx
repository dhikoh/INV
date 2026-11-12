'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
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
  History,
  Sparkles,
  SlidersHorizontal,
  RotateCcw,
} from 'lucide-react';
import { Skeleton, EmptyState, ErrorState } from '@/components/ui/States';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { formatRupiah } from '@/lib/domain/money';
import { buildWaUrl } from '@/lib/domain/whatsapp';
import { MoneyInput } from '@/components/ui/MoneyInput';
import { PercentInput } from '@/components/ui/PercentInput';
import { formatDateId } from '@/lib/format/date';

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

export interface ApplicablePromoDto {
  id: string;
  label: string;
  source: 'PROMO' | 'SUBSIDY';
  type: 'PERCENT' | 'AMOUNT';
  valueBps: number | null;
  valueAmount: number | null;
  discountPerUnit: number;
  floorWithPromo: number;
  validFrom: string;
  validTo: string | null;
  note: string | null;
}

export interface CustomerProductPricingDto {
  productId: string;
  productSku: string;
  productName: string;
  basePrice: number;
  defaultMinPrice: number;
  customerMinPrice: number | null;
  effectiveFloorPrice: number;
  hasCustomFloor: boolean;
  activePromos: ApplicablePromoDto[];
}

export interface CustomerPromoItem {
  id: string;
  customerId: string;
  productId: string | null;
  productSku: string | null;
  productName: string;
  label: string;
  source: 'PROMO' | 'SUBSIDY';
  type: 'PERCENT' | 'AMOUNT';
  valueBps: number | null;
  valueAmount: number | null;
  validFrom: string;
  validTo: string | null;
  isActive: boolean;
  statusLabel: 'AKTIF' | 'KEDALUWARSA' | 'MENDATANG' | 'NONAKTIF';
  note: string | null;
  createdAt: string;
}

export interface PriceHistoryItem {
  id: string;
  productId: string;
  productSku: string;
  productName: string;
  customerId: string | null;
  field: string;
  oldValue: number | null;
  newValue: number;
  reason: string;
  changedBy: { id: string; name: string; username: string } | null;
  createdAt: string;
}

interface SalesOption {
  id: string;
  name: string;
  username: string;
}

export interface CustomerTransactionPriceDto {
  orderItemId: string;
  orderId: string;
  orderNo: string | null;
  orderDate: string;
  orderStatus: string;
  salesName: string;
  productId: string;
  productSku: string;
  productName: string;
  unit: string;
  qty: number;
  listPrice: number;
  unitPrice: number;
  discountType: string;
  discountSource: string;
  lineDiscount: number;
  lineNet: number;
  effectiveUnitPrice: number;
}

export interface UnpaidCustomerInvoiceDto {
  invoiceId: string;
  invoiceNumber: string;
  type: 'DP' | 'FINAL';
  orderId: string;
  orderNo: string | null;
  orderStatus: string;
  invoiceAmount: number;
  paidAmount: number;
  remainingInvoice: number;
  orderBalanceDue: number;
  dueDate: string | null;
}

export default function CustomerDetailPage() {
  const router = useRouter();
  const params = useParams();
  const customerId = params?.id as string;

  // Verifikasi Tabrakan Toko (NAV-004)
  const [verifyingCollision, setVerifyingCollision] = useState(false);
  const [showReassignCollisionModal, setShowReassignCollisionModal] = useState(false);
  const [targetCollisionSalesId, setTargetCollisionSalesId] = useState('');
  const [collisionNotes, setCollisionNotes] = useState('');

  // State data utama
  const [customer, setCustomer] = useState<CustomerDetail | null>(null);
  const [timeline, setTimeline] = useState<TimelineItem[]>([]);
  const [tasks, setTasks] = useState<CrmTaskItem[]>([]);
  const [salesList, setSalesList] = useState<SalesOption[]>([]);
  const [pricingList, setPricingList] = useState<CustomerProductPricingDto[]>([]);
  const [promosList, setPromosList] = useState<CustomerPromoItem[]>([]);
  const [priceHistoryList, setPriceHistoryList] = useState<PriceHistoryItem[]>([]);
  const [transactionPrices, setTransactionPrices] = useState<CustomerTransactionPriceDto[]>([]);
  const [txPriceFilterProductId, setTxPriceFilterProductId] = useState<string>('');

  // State Modal Pembayaran Kolektif (Fase 5)
  const [showCollectiveModal, setShowCollectiveModal] = useState(false);
  const [loadingUnpaidInvoices, setLoadingUnpaidInvoices] = useState(false);
  const [unpaidInvoices, setUnpaidInvoices] = useState<UnpaidCustomerInvoiceDto[]>([]);
  const [selectedInvoiceIds, setSelectedInvoiceIds] = useState<Record<string, boolean>>({});
  const [collectiveAllocations, setCollectiveAllocations] = useState<Record<string, string>>({});
  const [collectiveTotalPaid, setCollectiveTotalPaid] = useState<string>('');
  const [collectiveCreditOption, setCollectiveCreditOption] = useState<boolean>(true);
  const [collectiveMethod, setCollectiveMethod] = useState<'TRANSFER' | 'CASH'>('TRANSFER');
  const [collectivePaidAt, setCollectivePaidAt] = useState<string>(() =>
    new Date().toISOString().slice(0, 10)
  );
  const [collectiveReference, setCollectiveReference] = useState<string>('');
  const [collectiveNotes, setCollectiveNotes] = useState<string>('');
  const [collectiveProofFile, setCollectiveProofFile] = useState<File | null>(null);
  const [submittingCollective, setSubmittingCollective] = useState(false);
  const [collectiveError, setCollectiveError] = useState<string | null>(null);
  const [collectiveSuccess, setCollectiveSuccess] = useState<string | null>(null);

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

  // Modal Atur Harga Minimal Khusus (T2.3)
  const [minPriceModalOpen, setMinPriceModalOpen] = useState(false);
  const [selectedProductForMinPrice, setSelectedProductForMinPrice] = useState<CustomerProductPricingDto | null>(null);
  const [minPriceInput, setMinPriceInput] = useState<number>(0);
  const [minPriceReason, setMinPriceReason] = useState<string>('');
  const [minPriceNote, setMinPriceNote] = useState<string>('');
  const [submittingMinPrice, setSubmittingMinPrice] = useState(false);
  const [minPriceError, setMinPriceError] = useState<string | null>(null);

  // Modal Reset Harga Minimal ke Default (T2.3)
  const [resetModalOpen, setResetModalOpen] = useState(false);
  const [productToReset, setProductToReset] = useState<CustomerProductPricingDto | null>(null);
  const [resetReason, setResetReason] = useState<string>('');
  const [submittingReset, setSubmittingReset] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);

  // Modal Tambah Promo (T2.3)
  const [promoModalOpen, setPromoModalOpen] = useState(false);
  const [promoLabel, setPromoLabel] = useState<string>('');
  const [promoSource, setPromoSource] = useState<'PROMO' | 'SUBSIDY'>('PROMO');
  const [promoType, setPromoType] = useState<'PERCENT' | 'AMOUNT'>('PERCENT');
  const [promoValueBps, setPromoValueBps] = useState<number>(500); // 5%
  const [promoValueAmount, setPromoValueAmount] = useState<number>(10000); // Rp 10.000
  const [promoProductId, setPromoProductId] = useState<string>('');
  const [promoValidFrom, setPromoValidFrom] = useState<string>('');
  const [promoValidTo, setPromoValidTo] = useState<string>('');
  const [promoNote, setPromoNote] = useState<string>('');
  const [submittingPromo, setSubmittingPromo] = useState(false);
  const [promoError, setPromoError] = useState<string | null>(null);

  // Modal Riwayat Perubahan Harga (T2.3)
  const [historyModalOpen, setHistoryModalOpen] = useState(false);

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

  // Muat data pelanggan, timeline, tugas, dan harga/promo
  const loadData = useCallback(async () => {
    if (!customerId) return;
    setLoading(true);
    setError(null);

    try {
      // 1. Profil pengguna saat ini
      let role = 'SALES';
      const meRes = await fetch('/api/v1/auth/me');
      if (meRes.ok) {
        const meJson = await meRes.json();
        if (meJson.ok && meJson.data?.user) {
          role = meJson.data.user.role;
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

      // 5. Pricing per produk untuk customer ini (Seksi 7.2 & 10.5)
      const pricingRes = await fetch(`/api/v1/customers/${customerId}/pricing`);
      if (pricingRes.ok) {
        const pricingJson = await pricingRes.json();
        setPricingList(pricingJson.data?.pricing || []);
      }

      // 5b. Riwayat harga transaksi riil customer ini (Fase 5 - Sales & Super Admin)
      const txPriceRes = await fetch(`/api/v1/customers/${customerId}/transaction-prices?limit=50`);
      if (txPriceRes.ok) {
        const txPriceJson = await txPriceRes.json();
        setTransactionPrices(txPriceJson.data || []);
      }

      // 6. Data khusus Super Admin (Promos, Price History, Sales List)
      if (role === 'SUPERADMIN') {
        const [promosRes, historyRes, usersRes] = await Promise.all([
          fetch(`/api/v1/customers/${customerId}/promos`),
          fetch(`/api/v1/customers/${customerId}/price-history`),
          fetch('/api/v1/users?role=SALES'),
        ]);

        if (promosRes.ok) {
          const promosJson = await promosRes.json();
          setPromosList(promosJson.data || []);
        }

        if (historyRes.ok) {
          const historyJson = await historyRes.json();
          setPriceHistoryList(historyJson.data || []);
        }

        if (usersRes.ok) {
          const usersJson = await usersRes.json();
          if (usersJson.ok && Array.isArray(usersJson.data)) {
            setSalesList(usersJson.data);
          }
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

  const openCollectivePaymentModal = async () => {
    setShowCollectiveModal(true);
    setCollectiveError(null);
    setCollectiveSuccess(null);
    setLoadingUnpaidInvoices(true);
    setCollectiveProofFile(null);
    setCollectiveReference('');
    setCollectiveNotes('');
    setCollectiveCreditOption(true);
    setCollectiveMethod('TRANSFER');
    setCollectivePaidAt(new Date().toISOString().slice(0, 10));

    try {
      const res = await fetch(`/api/v1/payments/collective?customerId=${customerId}`);
      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(json.error?.message || 'Gagal memuat daftar faktur belum lunas');
      }
      const list: UnpaidCustomerInvoiceDto[] = json.data || [];
      setUnpaidInvoices(list);

      const nextSelected: Record<string, boolean> = {};
      const nextAllocs: Record<string, string> = {};
      for (const inv of list) {
        nextSelected[inv.invoiceId] = false;
        nextAllocs[inv.invoiceId] = String(inv.remainingInvoice);
      }
      setSelectedInvoiceIds(nextSelected);
      setCollectiveAllocations(nextAllocs);
      setCollectiveTotalPaid('');
    } catch (err: unknown) {
      setCollectiveError(err instanceof Error ? err.message : 'Gagal memuat faktur');
    } finally {
      setLoadingUnpaidInvoices(false);
    }
  };

  const toggleCollectiveInvoice = (inv: UnpaidCustomerInvoiceDto) => {
    const next = {
      ...selectedInvoiceIds,
      [inv.invoiceId]: !selectedInvoiceIds[inv.invoiceId],
    };
    setSelectedInvoiceIds(next);
    const sum = unpaidInvoices.reduce((acc, item) => {
      if (!next[item.invoiceId]) return acc;
      const val = Number(collectiveAllocations[item.invoiceId] || 0);
      return acc + (Number.isFinite(val) && val > 0 ? val : 0);
    }, 0);
    setCollectiveTotalPaid(sum > 0 ? String(sum) : '');
  };

  const handleCollectiveAllocChange = (invoiceId: string, rawValue: string) => {
    const clean = rawValue.replace(/[^0-9]/g, '');
    const updated = { ...collectiveAllocations, [invoiceId]: clean };
    setCollectiveAllocations(updated);
    const sum = unpaidInvoices.reduce((acc, item) => {
      if (!selectedInvoiceIds[item.invoiceId]) return acc;
      const val = Number(updated[item.invoiceId] || 0);
      return acc + (Number.isFinite(val) && val > 0 ? val : 0);
    }, 0);
    setCollectiveTotalPaid(sum > 0 ? String(sum) : '');
  };

  const collectiveAllocatedSum = unpaidInvoices.reduce((acc, item) => {
    if (!selectedInvoiceIds[item.invoiceId]) return acc;
    const val = Number(collectiveAllocations[item.invoiceId] || 0);
    return acc + (Number.isFinite(val) && val > 0 ? val : 0);
  }, 0);

  const collectiveTotalPaidNum = Number(collectiveTotalPaid.replace(/[^0-9]/g, '') || 0);
  const collectiveExcessAmount = Math.max(0, collectiveTotalPaidNum - collectiveAllocatedSum);

  const handleSubmitCollectivePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    setCollectiveError(null);

    const selectedAllocs = unpaidInvoices
      .filter((inv) => selectedInvoiceIds[inv.invoiceId])
      .map((inv) => ({
        invoiceId: inv.invoiceId,
        amount: Number(collectiveAllocations[inv.invoiceId] || 0),
      }))
      .filter((a) => Number.isFinite(a.amount) && a.amount > 0);

    if (selectedAllocs.length === 0) {
      setCollectiveError('Pilih minimal 1 faktur dan isi nominal alokasinya.');
      return;
    }

    if (collectiveTotalPaidNum < collectiveAllocatedSum) {
      setCollectiveError('Total transfer tidak boleh kurang dari total alokasi faktur.');
      return;
    }

    try {
      setSubmittingCollective(true);
      const formData = new FormData();
      formData.append('customerId', customerId);
      formData.append('totalPaid', String(collectiveTotalPaidNum));
      formData.append('creditOption', String(collectiveCreditOption));
      formData.append('method', collectiveMethod);
      formData.append('paidAt', new Date(`${collectivePaidAt}T12:00:00`).toISOString());
      if (collectiveReference.trim()) formData.append('reference', collectiveReference.trim());
      if (collectiveNotes.trim()) formData.append('notes', collectiveNotes.trim());
      formData.append('allocations', JSON.stringify(selectedAllocs));
      if (collectiveProofFile) {
        formData.append('proof', collectiveProofFile);
      }

      const res = await fetch('/api/v1/payments/collective', {
        method: 'POST',
        body: formData,
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(json.error?.message || 'Gagal mencatat pembayaran kolektif');
      }

      setShowCollectiveModal(false);
      setCollectiveSuccess(
        currentUserRole === 'SUPERADMIN'
          ? 'Pembayaran kolektif berhasil dicatat dan menunggu verifikasi di antrean Pembayaran.'
          : 'Pembayaran kolektif berhasil diajukan dan menunggu verifikasi Super Admin.'
      );
      await loadData();
    } catch (err: unknown) {
      setCollectiveError(
        err instanceof Error ? err.message : 'Gagal mengirim pembayaran kolektif'
      );
    } finally {
      setSubmittingCollective(false);
    }
  };

  // Aksi Penyelesaian Verifikasi Tabrakan Toko (NAV-004)
  const handleVerifyCollision = async (
    action: 'APPROVE' | 'REASSIGN' | 'REJECT',
    targetSalesId?: string,
    notes?: string
  ) => {
    if (action === 'REJECT') {
      if (
        !confirm(
          'Apakah Anda yakin ingin menolak pendaftaran toko ini karena duplikasi data? Tindakan ini akan menghapus data calon toko.'
        )
      ) {
        return;
      }
    }

    try {
      setVerifyingCollision(true);
      const res = await fetch(`/api/v1/customers/${customerId}/verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action,
          targetSalesId: targetSalesId || undefined,
          notes: notes || undefined,
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(json.error?.message || 'Gagal memproses verifikasi toko');
      }

      if (action === 'REJECT') {
        router.push('/customers');
      } else {
        setShowReassignCollisionModal(false);
        setTargetCollisionSalesId('');
        setCollisionNotes('');
        await loadData();
      }
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Terjadi kesalahan sistem');
    } finally {
      setVerifyingCollision(false);
    }
  };

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

  // Buka Modal Atur Harga Minimal Khusus (T2.3)
  const handleOpenSetMinPriceModal = (item: CustomerProductPricingDto) => {
    setSelectedProductForMinPrice(item);
    setMinPriceInput(item.customerMinPrice ?? item.defaultMinPrice);
    setMinPriceReason('');
    setMinPriceNote('');
    setMinPriceError(null);
    setMinPriceModalOpen(true);
  };

  // Simpan Harga Minimal Khusus (PUT /customers/:id/min-prices)
  const handleSubmitMinPrice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customer || !selectedProductForMinPrice || submittingMinPrice) return;

    if (!minPriceReason.trim() || minPriceReason.trim().length < 3) {
      setMinPriceError('Alasan perubahan wajib diisi (minimal 3 karakter)');
      return;
    }

    if (minPriceInput > selectedProductForMinPrice.basePrice) {
      setMinPriceError(
        `Harga minimal khusus (${formatRupiah(minPriceInput)}) tidak boleh melebihi harga jual dasar (${formatRupiah(selectedProductForMinPrice.basePrice)})`
      );
      return;
    }

    setSubmittingMinPrice(true);
    setMinPriceError(null);

    try {
      const res = await fetch(`/api/v1/customers/${customer.id}/min-prices`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: selectedProductForMinPrice.productId,
          minPrice: minPriceInput,
          reason: minPriceReason.trim(),
          note: minPriceNote.trim() || null,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error?.message || 'Gagal mengatur harga minimal khusus');
      }

      setMinPriceModalOpen(false);
      loadData();
    } catch (err: unknown) {
      setMinPriceError(err instanceof Error ? err.message : 'Gagal mengatur harga');
    } finally {
      setSubmittingMinPrice(false);
    }
  };

  // Buka Modal Reset Harga Minimal (T2.3)
  const handleOpenResetModal = (item: CustomerProductPricingDto) => {
    setProductToReset(item);
    setResetReason('');
    setResetError(null);
    setResetModalOpen(true);
  };

  // Konfirmasi Reset Harga Minimal (DELETE /customers/:id/min-prices)
  const handleConfirmResetMinPrice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customer || !productToReset || submittingReset) return;

    if (!resetReason.trim() || resetReason.trim().length < 3) {
      setResetError('Alasan reset harga wajib diisi (minimal 3 karakter)');
      return;
    }

    setSubmittingReset(true);
    setResetError(null);

    try {
      const res = await fetch(`/api/v1/customers/${customer.id}/min-prices`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: productToReset.productId,
          reason: resetReason.trim(),
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error?.message || 'Gagal mereset harga minimal');
      }

      setResetModalOpen(false);
      loadData();
    } catch (err: unknown) {
      setResetError(err instanceof Error ? err.message : 'Gagal mereset harga');
    } finally {
      setSubmittingReset(false);
    }
  };

  // Buka Modal Tambah Promo (T2.3)
  const handleOpenPromoModal = () => {
    setPromoLabel('');
    setPromoSource('PROMO');
    setPromoType('PERCENT');
    setPromoValueBps(500); // 5%
    setPromoValueAmount(10000);
    setPromoProductId('');
    const today = new Date().toISOString().slice(0, 10);
    setPromoValidFrom(today);
    setPromoValidTo('');
    setPromoNote('');
    setPromoError(null);
    setPromoModalOpen(true);
  };

  // Simpan Promo Baru (POST /customers/:id/promos)
  const handleSubmitPromo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customer || submittingPromo) return;

    if (!promoLabel.trim()) {
      setPromoError('Nama/label promo wajib diisi');
      return;
    }
    if (!promoValidFrom) {
      setPromoError('Tanggal mulai berlaku wajib diisi');
      return;
    }

    setSubmittingPromo(true);
    setPromoError(null);

    try {
      const body: Record<string, unknown> = {
        label: promoLabel.trim(),
        source: promoSource,
        type: promoType,
        productId: promoProductId || null,
        validFrom: new Date(promoValidFrom).toISOString(),
        validTo: promoValidTo ? new Date(promoValidTo).toISOString() : null,
        note: promoNote.trim() || null,
      };

      if (promoType === 'PERCENT') {
        body.valueBps = promoValueBps;
      } else {
        body.valueAmount = promoValueAmount;
      }

      const res = await fetch(`/api/v1/customers/${customer.id}/promos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error?.message || 'Gagal menambahkan promo');
      }

      setPromoModalOpen(false);
      loadData();
    } catch (err: unknown) {
      setPromoError(err instanceof Error ? err.message : 'Gagal menambahkan promo');
    } finally {
      setSubmittingPromo(false);
    }
  };

  // Toggle Aktif / Nonaktif Promo (PATCH /customer-promos/:id)
  const handleTogglePromoActive = async (promo: CustomerPromoItem) => {
    try {
      const res = await fetch(`/api/v1/customer-promos/${promo.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !promo.isActive }),
      });

      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error?.message || 'Gagal mengubah status promo');
      }

      loadData();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Gagal memperbarui status promo');
    }
  };

  // Hapus Promo (DELETE /customer-promos/:id)
  const handleDeletePromo = async (promoId: string) => {
    if (!confirm('Apakah Anda yakin ingin menghapus promo ini?')) return;

    try {
      const res = await fetch(`/api/v1/customer-promos/${promoId}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error?.message || 'Gagal menghapus promo');
      }

      loadData();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Gagal menghapus promo');
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

      {/* Banner Verifikasi Tabrakan Toko (NAV-004) */}
      {customer.tags &&
        customer.tags.includes('PENDING_VERIFIKASI_ADMIN') &&
        currentUserRole === 'SUPERADMIN' && (
          <div className="bg-amber-50 border-2 border-amber-300 rounded-2xl p-4 md:p-5 shadow-sm space-y-3">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-amber-100 text-amber-700 rounded-xl shrink-0 mt-0.5">
                <AlertCircle className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-bold text-amber-950">
                  Verifikasi Tabrakan Toko (Persetujuan Owner Diperlukan)
                </h3>
                <p className="text-xs text-amber-800 mt-1 leading-relaxed">
                  Sistem mendeteksi calon toko ini memiliki kemiripan nama, nomor kontak, atau lokasi dengan toko binaan sales lain. Status penahanan aktif sampai Super Admin menyelesaikan verifikasi resmi di bawah ini.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-amber-200/60">
              <button
                type="button"
                disabled={verifyingCollision}
                onClick={() => handleVerifyCollision('APPROVE')}
                className="min-h-[40px] px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-sm transition-colors disabled:opacity-50"
              >
                <Check className="w-4 h-4" />
                <span>Setujui Sebagai Cabang Resmi</span>
              </button>

              <button
                type="button"
                disabled={verifyingCollision}
                onClick={() => setShowReassignCollisionModal(true)}
                className="min-h-[40px] px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-sm transition-colors disabled:opacity-50"
              >
                <Users className="w-4 h-4" />
                <span>Alihkan ke Sales Pembina</span>
              </button>

              <button
                type="button"
                disabled={verifyingCollision}
                onClick={() => {
                  const reason = prompt('Masukkan catatan/alasan penolakan duplikat (opsional):');
                  if (reason !== null) {
                    handleVerifyCollision('REJECT', undefined, reason);
                  }
                }}
                className="min-h-[40px] px-3.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-sm transition-colors disabled:opacity-50"
              >
                <Trash2 className="w-4 h-4" />
                <span>Tolak & Hapus Duplikat</span>
              </button>
            </div>
          </div>
        )}

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
            <span>Promo Aktif</span>
            <Sparkles className="w-4 h-4 text-purple-500" />
          </div>
          <div className="text-xl font-bold text-slate-900">
            {promosList.filter((p) => p.isActive && p.statusLabel === 'AKTIF').length}
          </div>
        </div>
      </div>

      {/* Navigasi Tab (Seksi 11.3: Ringkasan, Timeline CRM, Order, Harga dan Promo) */}
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
          onClick={() => setActiveTab('pricing')}
          className={`pb-3 px-4 font-bold text-sm border-b-2 whitespace-nowrap transition-colors flex items-center gap-2 ${
            activeTab === 'pricing'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <DollarSign className="w-4 h-4" />
          <span>Harga & Promo</span>
          {pricingList.some((p) => p.hasCustomFloor) && (
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
          )}
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
                    <div className="absolute -left-6 md:-left-8 top-1.5 w-6 h-6 rounded-full bg-white border-2 border-slate-300 group-hover:border-indigo-500 flex items-center justify-center shadow-xs transition-colors">
                      {isInteraction ? (
                        getInteractionIcon(item.interaction!.type)
                      ) : (
                        <ShoppingCart className="w-3.5 h-3.5 text-indigo-600" />
                      )}
                    </div>

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

      {/* KONTEN TAB 3: HARGA & PROMO (T2.3) */}
      {activeTab === 'pricing' && (
        <div className="space-y-8">
          {/* SEKSI 1: HARGA MINIMAL KHUSUS PER PRODUK (CustomerMinPrice) */}
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <DollarSign className="w-5 h-5 text-indigo-600" />
                  Batas Harga Minimal Khusus Pelanggan
                </h3>
                <p className="text-xs text-slate-500">
                  Floor price khusus ini menimpa harga minimal default produk. Perubahan wajib mencatat alasan ke riwayat audit.
                </p>
              </div>

              {isSuperAdmin && priceHistoryList.length > 0 && (
                <button
                  type="button"
                  onClick={() => setHistoryModalOpen(true)}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-white border border-slate-200 px-3 py-1.5 rounded-xl shadow-xs min-h-[36px]"
                >
                  <History className="w-4 h-4 text-slate-500" />
                  <span>Riwayat Perubahan ({priceHistoryList.length})</span>
                </button>
              )}
            </div>

            {pricingList.length === 0 ? (
              <EmptyState
                title="Belum Ada Produk Aktif"
                description="Belum ada produk aktif di unit usaha ini untuk diatur harga minimalnya."
              />
            ) : (
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm text-slate-700">
                    <thead className="bg-slate-50 text-xs uppercase font-bold text-slate-500 border-b border-slate-200">
                      <tr>
                        <th className="px-4 py-3">Produk</th>
                        <th className="px-4 py-3 text-right">Harga Jual Dasar</th>
                        <th className="px-4 py-3 text-right">Floor Default</th>
                        <th className="px-4 py-3 text-right">Floor Efektif Pelanggan</th>
                        <th className="px-4 py-3 text-center">Status Floor</th>
                        {isSuperAdmin && <th className="px-4 py-3 text-right">Aksi</th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {pricingList.map((item) => (
                        <tr key={item.productId} className="hover:bg-slate-50/80 transition-colors">
                          <td className="px-4 py-3">
                            <div className="font-bold text-slate-900">{item.productName}</div>
                            <div className="font-mono text-xs text-slate-400">{item.productSku}</div>
                          </td>
                          <td className="px-4 py-3 text-right font-medium text-slate-900">
                            {formatRupiah(item.basePrice)}
                          </td>
                          <td className="px-4 py-3 text-right text-slate-500">
                            {formatRupiah(item.defaultMinPrice)}
                          </td>
                          <td className="px-4 py-3 text-right font-bold text-slate-900">
                            <span className={item.hasCustomFloor ? 'text-indigo-600' : 'text-slate-900'}>
                              {formatRupiah(item.effectiveFloorPrice)}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            {item.hasCustomFloor ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                                Khusus Pelanggan
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-600 border border-slate-200">
                                Default Produk
                              </span>
                            )}
                          </td>
                          {isSuperAdmin && (
                            <td className="px-4 py-3 text-right">
                              <div className="inline-flex items-center gap-1.5 justify-end">
                                <button
                                  type="button"
                                  onClick={() => handleOpenSetMinPriceModal(item)}
                                  className="px-3 py-1 rounded-lg text-xs font-bold bg-indigo-50 text-indigo-700 hover:bg-indigo-100 transition-colors min-h-[36px]"
                                >
                                  {item.hasCustomFloor ? 'Ubah' : 'Atur'}
                                </button>
                                {item.hasCustomFloor && (
                                  <button
                                    type="button"
                                    onClick={() => handleOpenResetModal(item)}
                                    title="Reset ke floor default produk"
                                    className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-slate-100 transition-colors min-h-[36px] min-w-[36px] flex items-center justify-center"
                                  >
                                    <RotateCcw className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          {/* SEKSI 2: PROMO & SUBSIDI KHUSUS PELANGGAN (CustomerPromo) */}
          <div className="space-y-4 pt-4 border-t border-slate-200">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-purple-600" />
                  Promo & Subsidi Khusus Pelanggan
                </h3>
                <p className="text-xs text-slate-500">
                  Diskon promo/subsidi yang disetujui lebih dulu akan langsung menurunkan floor baris order saat formulir order dibuat.
                </p>
              </div>

              {isSuperAdmin && (
                <button
                  type="button"
                  onClick={handleOpenPromoModal}
                  className="inline-flex items-center gap-1.5 bg-purple-600 hover:bg-purple-700 text-white font-semibold text-xs px-3.5 py-2 rounded-xl shadow-xs transition-all min-h-[44px]"
                >
                  <Plus className="w-4 h-4" />
                  <span>Tambah Promo Pelanggan</span>
                </button>
              )}
            </div>

            {promosList.length === 0 ? (
              <EmptyState
                title="Belum Ada Promo Khusus"
                description="Pelanggan ini belum memiliki promo atau subsidi aktif."
                actionText={isSuperAdmin ? 'Tambah Promo Sekarang' : undefined}
                onAction={isSuperAdmin ? handleOpenPromoModal : undefined}
              />
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                {promosList.map((promo) => (
                  <div
                    key={promo.id}
                    className={`bg-white rounded-2xl border p-4 shadow-xs space-y-3 transition-all ${
                      !promo.isActive || promo.statusLabel === 'KEDALUWARSA'
                        ? 'border-slate-200 bg-slate-50/50 opacity-75'
                        : 'border-slate-200 hover:border-purple-300'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-1.5 mb-1">
                          <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${
                            promo.source === 'SUBSIDY'
                              ? 'bg-amber-50 text-amber-800 border-amber-200'
                              : 'bg-purple-50 text-purple-800 border-purple-200'
                          }`}>
                            {promo.source}
                          </span>

                          <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${
                            promo.statusLabel === 'AKTIF'
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : promo.statusLabel === 'KEDALUWARSA'
                              ? 'bg-rose-50 text-rose-700 border-rose-200'
                              : 'bg-slate-100 text-slate-600 border-slate-200'
                          }`}>
                            {promo.statusLabel}
                          </span>
                        </div>

                        <h4 className="font-bold text-slate-900 text-sm">
                          {promo.label}
                        </h4>
                      </div>

                      {isSuperAdmin && (
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleTogglePromoActive(promo)}
                            className={`p-1.5 rounded-lg text-xs font-bold transition-colors min-h-[36px] min-w-[36px] flex items-center justify-center ${
                              promo.isActive
                                ? 'text-emerald-700 hover:bg-emerald-50'
                                : 'text-slate-400 hover:bg-slate-100'
                            }`}
                            title={promo.isActive ? 'Nonaktifkan Promo' : 'Aktifkan Promo'}
                          >
                            <CheckCircle2 className="w-4 h-4" />
                          </button>

                          <button
                            type="button"
                            onClick={() => handleDeletePromo(promo.id)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-slate-100 transition-colors min-h-[36px] min-w-[36px] flex items-center justify-center"
                            title="Hapus Promo"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                    </div>

                    <div className="bg-slate-50 p-2.5 rounded-xl text-xs space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500">Nilai Diskon:</span>
                        <strong className="text-slate-900 text-sm font-bold">
                          {promo.type === 'PERCENT'
                            ? `${(promo.valueBps ?? 0) / 100}%`
                            : formatRupiah(promo.valueAmount ?? 0) + ' / unit'}
                        </strong>
                      </div>

                      <div className="flex items-center justify-between">
                        <span className="text-slate-500">Target Produk:</span>
                        <span className="font-semibold text-slate-800">
                          {promo.productName}
                        </span>
                      </div>

                      <div className="flex items-center justify-between">
                        <span className="text-slate-500">Periode:</span>
                        <span className="text-slate-700 font-medium">
                          {formatShortDate(promo.validFrom)} s/d {promo.validTo ? formatShortDate(promo.validTo) : 'Seterusnya'}
                        </span>
                      </div>
                    </div>

                    {promo.note && (
                      <p className="text-xs text-slate-500 italic">
                        Catatan: {promo.note}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* BAGIAN 3: RIWAYAT HARGA TRANSAKSI RIIL PELANGGAN (FASE 5 - AMAN UNTUK SALES & SUPER ADMIN) */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  Riwayat Harga Transaksi Pelanggan
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Harga jual riil pada pesanan sebelumnya (tidak termasuk draft atau dibatalkan) untuk referensi penawaran.
                </p>
              </div>
              {transactionPrices.length > 0 && (
                <select
                  value={txPriceFilterProductId}
                  onChange={(e) => setTxPriceFilterProductId(e.target.value)}
                  aria-label="Filter Produk Riwayat Harga"
                  className="text-xs px-3 py-2 border border-slate-300 rounded-xl bg-white min-h-[40px]"
                >
                  <option value="">Semua Produk</option>
                  {Array.from(
                    new Map(
                      transactionPrices.map((tp) => [
                        tp.productId,
                        `${tp.productSku} - ${tp.productName}`,
                      ])
                    ).entries()
                  ).map(([pid, label]) => (
                    <option key={pid} value={pid}>
                      {label}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {transactionPrices.length === 0 ? (
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600 text-center">
                Belum ada riwayat harga transaksi untuk pelanggan ini.
              </div>
            ) : (
              <div className="overflow-x-auto -mx-2 px-2">
                <table className="w-full text-left border-collapse text-xs sm:text-sm min-w-[640px]">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-500 font-semibold">
                      <th className="py-2.5 pr-3">Tanggal</th>
                      <th className="py-2.5 px-3">No. Order</th>
                      <th className="py-2.5 px-3">Produk</th>
                      <th className="py-2.5 px-3 text-right">Qty</th>
                      <th className="py-2.5 px-3 text-right">Harga Satuan</th>
                      <th className="py-2.5 pl-3 text-right">Harga Net / Unit</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {transactionPrices
                      .filter(
                        (tp) =>
                          !txPriceFilterProductId || tp.productId === txPriceFilterProductId
                      )
                      .map((tp) => (
                        <tr key={tp.orderItemId} className="hover:bg-slate-50/70">
                          <td className="py-2.5 pr-3 whitespace-nowrap text-slate-600">
                            {formatDateId(tp.orderDate, 'shortPad')}
                          </td>
                          <td className="py-2.5 px-3 whitespace-nowrap">
                            <Link
                              href={`/orders/${tp.orderId}`}
                              className="font-semibold text-indigo-600 hover:underline"
                            >
                              {tp.orderNo || tp.orderId}
                            </Link>
                          </td>
                          <td className="py-2.5 px-3">
                            <div className="font-semibold text-slate-900">
                              {tp.productName}
                            </div>
                            <div className="text-[11px] text-slate-500 font-mono">
                              {tp.productSku}
                            </div>
                          </td>
                          <td className="py-2.5 px-3 text-right whitespace-nowrap font-medium text-slate-700">
                            {tp.qty} {tp.unit}
                          </td>
                          <td className="py-2.5 px-3 text-right whitespace-nowrap text-slate-700">
                            {formatRupiah(tp.unitPrice)}
                          </td>
                          <td className="py-2.5 pl-3 text-right whitespace-nowrap font-bold text-slate-900">
                            {formatRupiah(tp.effectiveUnitPrice)}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* KONTEN TAB 4: RINGKASAN KONTAK & ALAMAT */}
      {activeTab === 'summary' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                      href={
                        buildWaUrl(
                          customer.phone,
                          `Halo ${customer.name}, kami dari tim penjualan ingin menindaklanjuti kebutuhan pesanan Anda.`
                        ) || '#'
                      }
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

      {/* KONTEN TAB 5: ORDER */}
      {activeTab === 'orders' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-bold text-slate-900">
              Riwayat Pesanan Pelanggan
            </h2>
            <button
              type="button"
              onClick={openCollectivePaymentModal}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs sm:text-sm font-semibold shadow-xs transition-colors min-h-[44px] flex items-center gap-1.5"
            >
              <span>+ Catat Pembayaran Kolektif</span>
            </button>
          </div>

          {collectiveSuccess && (
            <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs sm:text-sm font-medium">
              {collectiveSuccess}
            </div>
          )}

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

      {/* MODAL ATUR HARGA MINIMAL KHUSUS (T2.3) */}
      {minPriceModalOpen && selectedProductForMinPrice && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white w-full max-w-lg rounded-2xl shadow-xl border border-slate-200 overflow-hidden my-8 animate-in fade-in duration-200">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <SlidersHorizontal className="w-5 h-5 text-indigo-600" />
                Atur Harga Minimal Khusus Pelanggan
              </h2>
              <button
                type="button"
                onClick={() => setMinPriceModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg min-h-[36px] min-w-[36px] flex items-center justify-center"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmitMinPrice} className="p-6 space-y-4">
              {minPriceError && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-sm flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{minPriceError}</span>
                </div>
              )}

              {/* Info Produk */}
              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-1.5 text-xs">
                <div className="font-bold text-slate-900 text-sm">
                  {selectedProductForMinPrice.productName}
                </div>
                <div className="font-mono text-slate-500">
                  SKU: {selectedProductForMinPrice.productSku}
                </div>
                <div className="flex items-center justify-between pt-1 border-t border-slate-200">
                  <span className="text-slate-500">Harga Jual Dasar:</span>
                  <span className="font-bold text-slate-900">
                    {formatRupiah(selectedProductForMinPrice.basePrice)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Floor Default Produk:</span>
                  <span className="font-medium text-slate-700">
                    {formatRupiah(selectedProductForMinPrice.defaultMinPrice)}
                  </span>
                </div>
              </div>

              {/* Input Harga Minimal Baru */}
              <div>
                <MoneyInput
                  label="Harga Minimal Khusus Pelanggan Ini *"
                  value={minPriceInput}
                  onChange={(val) => setMinPriceInput(val)}
                  helperText={`Maksimal ${formatRupiah(selectedProductForMinPrice.basePrice)} (harga dasar)`}
                />
              </div>

              {/* Input Alasan Wajib (Seksi 7.2 & 17.3 nomor 12) */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Alasan Perubahan Harga Minimal <span className="text-rose-500">* (Wajib)</span>
                </label>
                <textarea
                  required
                  rows={2}
                  value={minPriceReason}
                  onChange={(e) => setMinPriceReason(e.target.value)}
                  placeholder="Contoh: Kesepakatan kontrak volume 100 karton / bulan..."
                  className="w-full text-base px-3.5 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 min-h-[44px]"
                />
                <span className="text-[11px] text-slate-500">
                  Alasan ini akan dicatat permanen dalam riwayat audit harga (PriceHistory).
                </span>
              </div>

              {/* Catatan Opsional */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Catatan Tambahan (Opsional)
                </label>
                <input
                  type="text"
                  value={minPriceNote}
                  onChange={(e) => setMinPriceNote(e.target.value)}
                  placeholder="Catatan internal..."
                  className="w-full text-base px-3.5 py-2 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 min-h-[44px]"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setMinPriceModalOpen(false)}
                  disabled={submittingMinPrice}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 font-semibold text-sm hover:bg-slate-50 min-h-[44px]"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={submittingMinPrice}
                  className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm flex items-center gap-2 shadow-sm min-h-[44px] disabled:opacity-50"
                >
                  {submittingMinPrice ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Menyimpan...</span>
                    </>
                  ) : (
                    <span>Simpan Harga Minimal</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL RESET HARGA MINIMAL (T2.3) */}
      {resetModalOpen && productToReset && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-xl border border-slate-200 overflow-hidden my-8 animate-in fade-in duration-200">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <RotateCcw className="w-5 h-5 text-rose-600" />
                Reset ke Floor Default Produk
              </h2>
              <button
                type="button"
                onClick={() => setResetModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg min-h-[36px] min-w-[36px] flex items-center justify-center"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleConfirmResetMinPrice} className="p-6 space-y-4">
              {resetError && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-sm flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{resetError}</span>
                </div>
              )}

              <p className="text-sm text-slate-700 leading-relaxed">
                Harga minimal khusus produk <strong>{productToReset.productName}</strong> akan dihapus dan kembali ke batas floor default produk (<strong>{formatRupiah(productToReset.defaultMinPrice)}</strong>).
              </p>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Alasan Reset Harga <span className="text-rose-500">* (Wajib)</span>
                </label>
                <textarea
                  required
                  rows={2}
                  value={resetReason}
                  onChange={(e) => setResetReason(e.target.value)}
                  placeholder="Contoh: Masa kontrak khusus telah berakhir..."
                  className="w-full text-base px-3.5 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-rose-500 min-h-[44px]"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setResetModalOpen(false)}
                  disabled={submittingReset}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 font-semibold text-sm hover:bg-slate-50 min-h-[44px]"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={submittingReset}
                  className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-semibold text-sm flex items-center gap-2 shadow-sm min-h-[44px] disabled:opacity-50"
                >
                  {submittingReset ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Mereset...</span>
                    </>
                  ) : (
                    <span>Konfirmasi Reset</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL TAMBAH PROMO (T2.3) */}
      {promoModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white w-full max-w-lg rounded-2xl shadow-xl border border-slate-200 overflow-hidden my-8 animate-in fade-in duration-200">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-purple-600" />
                Tambah Promo / Subsidi Pelanggan
              </h2>
              <button
                type="button"
                onClick={() => setPromoModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg min-h-[36px] min-w-[36px] flex items-center justify-center"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmitPromo} className="p-6 space-y-4">
              {promoError && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-sm flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{promoError}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Nama / Label Promo <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={promoLabel}
                  onChange={(e) => setPromoLabel(e.target.value)}
                  placeholder="Contoh: Subsidi Ongkir / Diskon Mitra Loyal 10%..."
                  className="w-full text-base px-3.5 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-purple-500 min-h-[44px]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Sumber Diskon <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={promoSource}
                    onChange={(e) => setPromoSource(e.target.value as 'PROMO' | 'SUBSIDY')}
                    className="w-full text-base px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-purple-500 min-h-[44px]"
                  >
                    <option value="PROMO">PROMO (Diskon Promo Toko)</option>
                    <option value="SUBSIDY">SUBSIDY (Subsidi Khusus Owner)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Tipe Diskon <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={promoType}
                    onChange={(e) => setPromoType(e.target.value as 'PERCENT' | 'AMOUNT')}
                    className="w-full text-base px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-purple-500 min-h-[44px]"
                  >
                    <option value="PERCENT">Persentase (%)</option>
                    <option value="AMOUNT">Nominal Tetap (Rp / unit)</option>
                  </select>
                </div>
              </div>

              {promoType === 'PERCENT' ? (
                <div>
                  <PercentInput
                    label="Persentase Diskon *"
                    value={promoValueBps}
                    onChange={(bps) => setPromoValueBps(bps)}
                    helperText="Contoh ketik: 5 atau 7,5%"
                  />
                </div>
              ) : (
                <div>
                  <MoneyInput
                    label="Potongan Tetap per Unit (Rp) *"
                    value={promoValueAmount}
                    onChange={(val) => setPromoValueAmount(val)}
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Target Produk
                </label>
                <select
                  value={promoProductId}
                  onChange={(e) => setPromoProductId(e.target.value)}
                  className="w-full text-base px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-purple-500 min-h-[44px]"
                >
                  <option value="">Semua Produk (Berlaku Global)</option>
                  {pricingList.map((p) => (
                    <option key={p.productId} value={p.productId}>
                      {p.productName} ({p.productSku})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Mulai Berlaku <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="date"
                    required
                    value={promoValidFrom}
                    onChange={(e) => setPromoValidFrom(e.target.value)}
                    className="w-full text-base px-3.5 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-purple-500 min-h-[44px]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Berakhir Pada (Opsional)
                  </label>
                  <input
                    type="date"
                    value={promoValidTo}
                    onChange={(e) => setPromoValidTo(e.target.value)}
                    className="w-full text-base px-3.5 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-purple-500 min-h-[44px]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Catatan Promo (Opsional)
                </label>
                <input
                  type="text"
                  value={promoNote}
                  onChange={(e) => setPromoNote(e.target.value)}
                  placeholder="Keterangan program..."
                  className="w-full text-base px-3.5 py-2 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-purple-500 min-h-[44px]"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setPromoModalOpen(false)}
                  disabled={submittingPromo}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 font-semibold text-sm hover:bg-slate-50 min-h-[44px]"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={submittingPromo}
                  className="px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-semibold text-sm flex items-center gap-2 shadow-sm min-h-[44px] disabled:opacity-50"
                >
                  {submittingPromo ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Menyimpan...</span>
                    </>
                  ) : (
                    <span>Simpan Promo</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL RIWAYAT PERUBAHAN HARGA KHUSUS (T2.3) */}
      {historyModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white w-full max-w-2xl rounded-2xl shadow-xl border border-slate-200 overflow-hidden my-8 animate-in fade-in duration-200">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <History className="w-5 h-5 text-indigo-600" />
                Riwayat Perubahan Harga Khusus Pelanggan
              </h2>
              <button
                type="button"
                onClick={() => setHistoryModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg min-h-[36px] min-w-[36px] flex items-center justify-center"
              >
                ✕
              </button>
            </div>

            <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
              {priceHistoryList.length === 0 ? (
                <EmptyState
                  title="Belum Ada Riwayat Perubahan"
                  description="Belum pernah ada perubahan batas harga minimal untuk pelanggan ini."
                />
              ) : (
                <div className="space-y-3">
                  {priceHistoryList.map((h) => (
                    <div
                      key={h.id}
                      className="p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-2 text-xs"
                    >
                      <div className="flex items-center justify-between text-slate-500">
                        <span className="font-bold text-slate-900 text-sm">
                          {h.productName} ({h.productSku})
                        </span>
                        <span>{formatWib(h.createdAt)}</span>
                      </div>

                      <div className="flex items-center gap-2 text-sm font-bold">
                        <span className="text-slate-500 line-through">
                          {h.oldValue !== null ? formatRupiah(h.oldValue) : '(Awal)'}
                        </span>
                        <span className="text-slate-400">→</span>
                        <span className="text-indigo-600">{formatRupiah(h.newValue)}</span>
                      </div>

                      <div className="pt-2 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2">
                        <div className="text-slate-700">
                          <strong>Alasan:</strong> {h.reason}
                        </div>
                        <div className="text-slate-500">
                          Diubah oleh:{' '}
                          <strong className="text-slate-800">
                            {h.changedBy?.name || 'Super Admin'}
                          </strong>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex justify-end">
              <button
                type="button"
                onClick={() => setHistoryModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-white border border-slate-200 text-slate-700 font-semibold text-xs hover:bg-slate-100 min-h-[36px]"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Alihkan Calon Toko Tabrakan (NAV-004) */}
      {showReassignCollisionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <h3 className="text-base font-bold text-slate-900">
              Alihkan Calon Toko ke Sales Pembina
            </h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Pilih staf sales yang membina wilayah atau jaringan toko ini. Status penahanan tabrakan akan dilepaskan secara otomatis.
            </p>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Pilih Staf Sales Tujuan <span className="text-rose-500">*</span>
                </label>
                <select
                  value={targetCollisionSalesId}
                  onChange={(e) => setTargetCollisionSalesId(e.target.value)}
                  className="w-full text-xs font-medium bg-slate-50 border border-slate-300 rounded-lg p-2.5 text-slate-800 focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">-- Pilih Staf Sales --</option>
                  {salesList.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} (@{s.username})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Catatan Pengalihan (Opsional)
                </label>
                <textarea
                  value={collisionNotes}
                  onChange={(e) => setCollisionNotes(e.target.value)}
                  placeholder="Contoh: Toko ini cabang dari langganan lama di Blitar..."
                  rows={2}
                  className="w-full text-xs bg-slate-50 border border-slate-300 rounded-lg p-2.5 text-slate-800 focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowReassignCollisionModal(false)}
                className="px-4 py-2 text-xs font-medium text-slate-600 hover:text-slate-800 transition-colors"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={!targetCollisionSalesId || verifyingCollision}
                onClick={() =>
                  handleVerifyCollision(
                    'REASSIGN',
                    targetCollisionSalesId,
                    collisionNotes
                  )
                }
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold shadow-sm transition-colors disabled:opacity-50"
              >
                {verifyingCollision ? 'Memproses...' : 'Simpan & Alihkan'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL PEMBAYARAN KOLEKTIF MULTI-FAKTUR (FASE 5) */}
      {showCollectiveModal && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-2xl w-full max-h-[90vh] overflow-y-auto p-5 sm:p-6 space-y-4">
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base sm:text-lg font-bold text-slate-900">
                  Catat Pembayaran Kolektif (Multi-Faktur)
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Pilih beberapa faktur resmi dari 1 transfer pembayaran pelanggan, lalu atur alokasi per faktur.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowCollectiveModal(false)}
                className="p-2 text-slate-400 hover:text-slate-600 rounded-lg min-h-[40px] min-w-[40px]"
              >
                ✕
              </button>
            </div>

            {collectiveError && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-medium">
                {collectiveError}
              </div>
            )}

            {loadingUnpaidInvoices ? (
              <div className="py-8 text-center text-sm text-slate-500">
                Memuat daftar faktur resmi belum lunas...
              </div>
            ) : unpaidInvoices.length === 0 ? (
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-center text-sm text-slate-600">
                Tidak ada faktur resmi (DP / Final) yang masih memiliki sisa tagihan untuk pelanggan ini.
              </div>
            ) : (
              <form onSubmit={handleSubmitCollectivePayment} className="space-y-4">
                <div className="space-y-2">
                  <div className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    Pilih Faktur & Nominal Alokasi
                  </div>
                  <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
                    {unpaidInvoices.map((inv) => {
                      const checked = Boolean(selectedInvoiceIds[inv.invoiceId]);
                      return (
                        <div
                          key={inv.invoiceId}
                          className={`p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                            checked ? 'bg-indigo-50/40' : 'bg-white'
                          }`}
                        >
                          <label className="flex items-start gap-2.5 cursor-pointer min-w-0 flex-1">
                            <input
                              type="checkbox"
                              aria-label={`Pilih faktur ${inv.invoiceNumber}`}
                              checked={checked}
                              onChange={() => toggleCollectiveInvoice(inv)}
                              className="mt-1 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                            />
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="text-sm font-bold text-slate-900">
                                  {inv.invoiceNumber}
                                </span>
                                <span className="text-[11px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 font-semibold">
                                  {inv.type}
                                </span>
                                <span className="text-xs text-slate-500">
                                  ({inv.orderNo || inv.orderId})
                                </span>
                              </div>
                              <div className="text-xs text-slate-600 mt-0.5">
                                Sisa Faktur: <strong>{formatRupiah(inv.remainingInvoice)}</strong> · Sisa Order:{' '}
                                {formatRupiah(inv.orderBalanceDue)}
                              </div>
                            </div>
                          </label>
                          <div className="sm:w-44 shrink-0">
                            <label className="block text-[11px] font-semibold text-slate-500 mb-0.5">
                              Alokasi (Rp)
                            </label>
                            <input
                              type="number"
                              min={1}
                              max={inv.orderBalanceDue}
                              disabled={!checked}
                              value={collectiveAllocations[inv.invoiceId] || ''}
                              onChange={(e) =>
                                handleCollectiveAllocChange(inv.invoiceId, e.target.value)
                              }
                              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg disabled:bg-slate-100 disabled:text-slate-400 min-h-[42px]"
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Total Nominal Diterima / Transfer (Rp) <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="number"
                      required
                      min={1}
                      value={collectiveTotalPaid}
                      onChange={(e) => setCollectiveTotalPaid(e.target.value)}
                      placeholder="Contoh: 500000"
                      className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 min-h-[44px]"
                    />
                    <p className="text-[11px] text-slate-500 mt-1">
                      Total teralokasi ke faktur: <strong>{formatRupiah(collectiveAllocatedSum)}</strong>
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Tanggal Pembayaran <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="date"
                      required
                      value={collectivePaidAt}
                      onChange={(e) => setCollectivePaidAt(e.target.value)}
                      className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 min-h-[44px]"
                    />
                  </div>
                </div>

                {collectiveExcessAmount > 0 && (
                  <div className="p-3 rounded-xl border border-emerald-200 bg-emerald-50 space-y-2">
                    <div className="text-xs font-bold text-emerald-900">
                      Kelebihan Pembayaran Terdeteksi: {formatRupiah(collectiveExcessAmount)}
                    </div>
                    <label className="flex items-start gap-2 text-xs text-emerald-800 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={collectiveCreditOption}
                        onChange={(e) => setCollectiveCreditOption(e.target.checked)}
                        className="mt-0.5 h-4 w-4 rounded border-emerald-300 text-emerald-600 focus:ring-emerald-500"
                      />
                      <span>
                        Simpan kelebihan dana ke <strong>Saldo Kredit Pelanggan</strong> saat Super Admin memverifikasi pembayaran ini.
                      </span>
                    </label>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Metode Pembayaran
                    </label>
                    <select
                      value={collectiveMethod}
                      onChange={(e) => setCollectiveMethod(e.target.value as 'TRANSFER' | 'CASH')}
                      className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-xl bg-white min-h-[44px]"
                    >
                      <option value="TRANSFER">Transfer Bank</option>
                      <option value="CASH">Tunai (Sesuai Kebijakan Bisnis)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      No. Referensi / Mutasi (Opsional)
                    </label>
                    <input
                      type="text"
                      value={collectiveReference}
                      onChange={(e) => setCollectiveReference(e.target.value)}
                      placeholder="Contoh: TRF-BCA-1112"
                      className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-xl min-h-[44px]"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Bukti Transfer {currentUserRole === 'SALES' && collectiveMethod === 'TRANSFER' ? '(Wajib untuk Sales)' : '(Opsional)'}
                  </label>
                  <input
                    type="file"
                    accept="image/*,application/pdf"
                    onChange={(e) => setCollectiveProofFile(e.target.files?.[0] || null)}
                    className="w-full text-xs text-slate-600 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Catatan (Opsional)
                  </label>
                  <textarea
                    rows={2}
                    value={collectiveNotes}
                    onChange={(e) => setCollectiveNotes(e.target.value)}
                    placeholder="Contoh: Pelanggan transfer 1 kali untuk melunasi 2 faktur sekaligus..."
                    className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-xl"
                  />
                </div>

                <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setShowCollectiveModal(false)}
                    className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 min-h-[44px]"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={submittingCollective}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-xs disabled:opacity-50 min-h-[44px]"
                  >
                    {submittingCollective ? 'Menyimpan...' : 'Kirim Pembayaran Kolektif'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
