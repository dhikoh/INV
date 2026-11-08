import React from 'react';
import { OrderForm } from '@/components/orders/OrderForm';

export const metadata = {
  title: 'Buat Pesanan Baru | BentoCat',
  description: 'Formulir pembuatan draf pesanan baru',
};

export default function NewOrderPage() {
  return (
    <div className="w-full max-w-7xl mx-auto px-4 py-6 md:py-8">
      <OrderForm mode="create" />
    </div>
  );
}

