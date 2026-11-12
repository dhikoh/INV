'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, AlertCircle, ShieldAlert } from 'lucide-react';
import { OrderForm } from '@/components/orders/OrderForm';
import { Skeleton, ErrorState } from '@/components/ui/States';
import { StatusBadge } from '@/components/ui/StatusBadge';

interface OrderItemDto {
  id: string;
  productId: string;
  productName: string;
  sku: string;
  unit: string;
  qty: number;
  unitPrice: number;
  discountType: string;
  discountValue: number;
  discountSource: string;
}

interface OrderDetailDto {
  id: string;
  orderNo: string | null;
  status: string;
  rev: number;
  customerId: string;
  deliveryAddress: string | null;
  notes: string | null;
  shippingCharge: number;
  grandTotal: number;
  paidTotal: number;
  dpBps: number;
  belowMinReason: string | null;
  items: OrderItemDto[];
  revisions?: Array<{ id: string; status: string }>;
}

export default function ReviseOrderPage() {
  const params = useParams();
  const id = typeof params?.id === 'string' ? params.id : '';

  const [order, setOrder] = useState<OrderDetailDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchOrder = useCallback(async () => {
    if (!id) return;
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`/api/v1/orders/${id}`);
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error?.message || 'Gagal memuat data pesanan.');
      }
      const json = await res.json();
      setOrder(json.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Terjadi kesalahan sistem.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchOrder();
  }, [fetchOrder]);

  if (loading) {
    return (
      <div className="w-full max-w-5xl mx-auto px-4 py-6 space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="w-full max-w-2xl mx-auto px-4 py-12">
        <ErrorState
          title="Gagal Memuat Pesanan"
          message={error || 'Pesanan tidak ditemukan.'}
          onRetry={fetchOrder}
        />
      </div>
    );
  }

  const hasPendingRevision = (order.revisions ?? []).some(
    (r) => r.status === 'PENDING_APPROVAL'
  );
  const canAmend = order.status === 'IN_PROCESS' && !hasPendingRevision;

  if (!canAmend) {
    return (
      <div className="w-full max-w-2xl mx-auto px-4 py-12">
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-center space-y-4">
          <div className="w-12 h-12 bg-amber-100 text-amber-700 rounded-full flex items-center justify-center mx-auto">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              Revisi Pesanan Belum Tersedia
            </h2>
            <p className="text-sm text-slate-600 mt-1">
              Pesanan{' '}
              <span className="font-semibold">
                {order.orderNo || `#${order.id.slice(-6)}`}
              </span>{' '}
              berstatus <StatusBadge status={order.status} />.
            </p>
            <p className="text-xs text-slate-500 mt-2">
              {hasPendingRevision
                ? 'Saat ini masih ada pengajuan revisi yang menunggu persetujuan Super Admin.'
                : 'Revisi item saat berjalan hanya dapat diajukan pada pesanan berstatus IN_PROCESS.'}
            </p>
          </div>
          <Link
            href={`/orders/${order.id}`}
            className="inline-flex items-center justify-center min-h-[44px] px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            <ArrowLeft className="w-4 h-4 mr-1.5" />
            Kembali ke Detail Pesanan
          </Link>
        </div>
      </div>
    );
  }

  const formattedItems = (order.items || []).map((item) => {
    let discountType: 'NONE' | 'PERCENT' | 'AMOUNT' = 'NONE';
    if (item.discountType === 'PERCENT') discountType = 'PERCENT';
    if (item.discountType === 'AMOUNT') discountType = 'AMOUNT';
    return {
      productId: item.productId,
      qty: item.qty,
      unitPrice: item.unitPrice,
      discountType,
      discountValue: item.discountValue,
      discountSource: (item.discountSource || 'MANUAL') as
        | 'MANUAL'
        | 'PROMO'
        | 'SUBSIDY',
    };
  });

  return (
    <div className="w-full max-w-7xl mx-auto px-4 py-6 md:py-8 space-y-4">
      <div className="p-4 bg-indigo-50 border border-indigo-200 rounded-xl text-indigo-900 text-xs sm:text-sm flex items-start gap-3">
        <AlertCircle className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />
        <div>
          <h4 className="font-semibold">Mode Revisi Pesanan Berjalan ({order.orderNo})</h4>
          <p className="text-xs text-indigo-800 mt-0.5">
            DP dan pembayaran terverifikasi tetap dipertahankan. Pengajuan akan menyesuaikan reservasi stok setelah disetujui Super Admin.
          </p>
        </div>
      </div>

      <OrderForm
        mode="amend"
        orderId={order.id}
        initialRev={order.rev}
        initialOldGrandTotal={order.grandTotal}
        initialPaidTotal={order.paidTotal}
        initialCustomerId={order.customerId}
        initialItems={formattedItems}
        initialShippingCharge={order.shippingCharge}
        initialDpBps={order.dpBps}
        initialDeliveryAddress={order.deliveryAddress || ''}
        initialBelowMinReason={order.belowMinReason || ''}
      />
    </div>
  );
}

