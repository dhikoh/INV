'use client';

import React from 'react';

export interface StatusBadgeProps {
  status: string | boolean;
  className?: string;
}

export function StatusBadge({ status, className = '' }: StatusBadgeProps) {
  let label = '';
  let colorClasses = '';

  if (typeof status === 'boolean') {
    if (status) {
      label = 'Aktif';
      colorClasses = 'bg-emerald-50 text-emerald-700 border-emerald-200';
    } else {
      label = 'Nonaktif';
      colorClasses = 'bg-slate-100 text-slate-600 border-slate-200';
    }
  } else {
    const s = String(status).toUpperCase();
    switch (s) {
      case 'ACTIVE':
      case 'AKTIF':
        label = 'Aktif';
        colorClasses = 'bg-emerald-50 text-emerald-700 border-emerald-200';
        break;
      case 'INACTIVE':
      case 'NONAKTIF':
        label = 'Nonaktif';
        colorClasses = 'bg-slate-100 text-slate-600 border-slate-200';
        break;
      case 'DRAFT':
        label = 'Draft';
        colorClasses = 'bg-amber-50 text-amber-700 border-amber-200';
        break;
      case 'SUBMITTED':
      case 'MENUNGGU':
        label = 'Diajukan';
        colorClasses = 'bg-blue-50 text-blue-700 border-blue-200';
        break;
      case 'APPROVED':
      case 'DISETUJUI':
        label = 'Disetujui';
        colorClasses = 'bg-indigo-50 text-indigo-700 border-indigo-200';
        break;
      case 'REJECTED':
      case 'DITOLAK':
        label = 'Ditolak';
        colorClasses = 'bg-rose-50 text-rose-700 border-rose-200';
        break;
      case 'PAID':
      case 'LUNAS':
        label = 'Lunas';
        colorClasses = 'bg-green-50 text-green-700 border-green-200';
        break;
      case 'PARTIAL':
      case 'SEBAGIAN':
        label = 'Sebagian';
        colorClasses = 'bg-teal-50 text-teal-700 border-teal-200';
        break;
      case 'VOID':
      case 'BATAL':
        label = 'Dibatalkan';
        colorClasses = 'bg-red-50 text-red-700 border-red-200';
        break;
      default:
        label = status;
        colorClasses = 'bg-slate-50 text-slate-700 border-slate-200';
        break;
    }
  }

  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${colorClasses} ${className}`}
    >
      {label}
    </span>
  );
}
