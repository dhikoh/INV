import React from 'react';
import { formatRupiah } from '@/lib/domain/money';
import { FloorSource } from '@/lib/domain/pricing';

export interface PatenPriceProps {
  value: number;
  source?: FloorSource;
  className?: string;
  showPrefix?: boolean;
}

/**
 * Komponen resmi untuk menampilkan Harga Paten (batas minimal) sesuai Addendum v2 Seksi 13.5 & 14.7.
 * Menampilkan label "Harga paten Rp ..." dan penanda "khusus customer ini" bila bersumber dari CustomerMinPrice.
 */
export function PatenPrice({
  value,
  source,
  className = '',
  showPrefix = true,
}: PatenPriceProps) {
  return (
    <span className={`inline-flex items-center flex-wrap gap-1.5 ${className}`}>
      {showPrefix && (
        <span className="text-slate-500 font-medium">Harga paten:</span>
      )}
      <span className="font-semibold text-slate-800">
        {formatRupiah(value)}
      </span>
      {source === 'CUSTOMER' && (
        <span className="text-[11px] px-1.5 py-0.5 font-medium rounded bg-amber-50 text-amber-700 border border-amber-200">
          khusus customer ini
        </span>
      )}
    </span>
  );
}

