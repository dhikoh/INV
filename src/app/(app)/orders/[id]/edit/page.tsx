'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
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
  lineSubtotal: number;
  lineDiscount: number;
  lineNet: number;
  floorPrice: number;
  belowMin: boolean;
  costPrice?: number;
}

interface OrderDetailDto {
  id: string;
  orderNo: string | null;
  orderDate: string;
  status: string;
  version: number;
  rev: number;
  customerId: string;
  deliveryAddress: string | null;
  notes: string | null;
  repeatIntervalDays: number | null;
  subtotal: number;
  discountTotal: number;
  shippingCharge: number;
  grandTotal: number;
  dpBps: number;
  dpAmount: number;
  hasBelowMin: boolean;
  belowMinReason: string | null;
  items: OrderItemDto[];
}

export default function EditOrderPage() {
  const params = useParams();
  const router = useRouter();
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
        if (res.status === 404) {
          throw new Error('Pesanan tidak ditemukan atau Anda tidak memiliki akses ke pesanan ini.');
        }
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
      <div className="w-full max-w-7xl mx-auto px-4 py-8 space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="w-24 h-10 rounded-lg" />
          <Skeleton className="w-64 h-8 rounded-lg" />
        </div>
        <Skeleton className="w-full h-96 rounded-xl" />
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="w-full max-w-2xl mx-auto px-4 py-12">
        <ErrorState
          title="Tidak Dapat Mengedit Pesanan"
          message={error || 'Data pesanan tidak ditemukan.'}
          onRetry={fetchOrder}
        />
        <div className="mt-4 text-center">
          <button
            type="button"
            onClick={() => router.push('/orders')}
            className="inline-flex items-center gap-1.5 text-sm text-indigo-600 hover:text-indigo-800 font-medium"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Kembali ke Daftar Pesanan</span>
          </button>
        </div>
      </div>
    );
  }

  // Hanya status DRAFT atau REVISION_REQUIRED yang boleh disunting
  const isEditable = order.status === 'DRAFT' || order.status === 'REVISION_REQUIRED';

  if (!isEditable) {
    return (
      <div className="w-full max-w-2xl mx-auto px-4 py-12">
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-center space-y-4">
          <div className="w-12 h-12 bg-amber-100 text-amber-700 rounded-full flex items-center justify-center mx-auto">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              Pesanan Tidak Dapat Disunting
            </h2>
            <p className="text-sm text-slate-600 mt-1 max-w-md mx-auto">
              Pesanan <span className="font-semibold">{order.orderNo || `#${order.id}`}</span> saat ini berstatus:
            </p>
            <div className="inline-block mt-2">
              <StatusBadge status={order.status} />
            </div>
            <p className="text-xs text-slate-500 mt-3 max-w-md mx-auto">
              Hanya pesanan berstatus <span className="font-medium">Draf (DRAFT)</span> atau{' '}
              <span className="font-medium">Perlu Revisi (REVISION_REQUIRED)</span> yang dapat diedit langsung.
            </p>
          </div>

          <div className="pt-2 flex items-center justify-center gap-3">
            <Link
              href={`/orders/${order.id}`}
              className="inline-flex items-center justify-center min-h-[44px] px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors"
            >
              Lihat Detail Pesanan
            </Link>
            <Link
              href="/orders"
              className="inline-flex items-center justify-center min-h-[44px] px-4 py-2 border border-slate-300 hover:bg-slate-50 text-slate-700 text-sm font-medium rounded-lg transition-colors"
            >
              Daftar Pesanan
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Format initial items
  const formattedItems = (order.items || []).map((item) => {
    let discountType: 'NONE' | 'PERCENT' | 'AMOUNT' = 'NONE';
    if (item.discountType === 'PERCENT') discountType = 'PERCENT';
    if (item.discountType === 'AMOUNT') discountType = 'AMOUNT';

    const discountSource = (item.discountSource || 'MANUAL') as 'MANUAL' | 'PROMO' | 'SUBSIDY';

    return {
      productId: item.productId,
      qty: item.qty,
      unitPrice: item.unitPrice,
      discountType,
      discountValue: item.discountValue,
      discountSource,
    };
  });

  return (
    <div className="w-full max-w-7xl mx-auto px-4 py-6 md:py-8 space-y-4">
      {order.status === 'REVISION_REQUIRED' && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-sm flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
          <div>
            <h4 className="font-semibold text-rose-900">Perhatian: Pesanan Memerlukan Revisi</h4>
            <p className="text-xs text-rose-700 mt-0.5">
              Silakan sesuaikan item produk, harga, atau alasan di bawah minimal sebelum mengajukan kembali pesanan ini.
            </p>
          </div>
        </div>
      )}

      <OrderForm
        mode="edit"
        orderId={order.id}
        initialRev={order.rev}
        initialCustomerId={order.customerId}
        initialItems={formattedItems}
        initialShippingCharge={order.shippingCharge}
        initialDpBps={order.dpBps}
        initialDeliveryAddress={order.deliveryAddress || ''}
        initialNotes={order.notes || ''}
        initialRepeatIntervalDays={order.repeatIntervalDays || undefined}
        initialBelowMinReason={order.belowMinReason || ''}
      />
    </div>
  );
}

