import React from 'react';
import { ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react';

export interface SortableHeaderProps {
  label: string;
  field: string;
  currentSortBy: string;
  currentSortOrder: 'asc' | 'desc';
  onSort: (field: string) => void;
  align?: 'left' | 'center' | 'right';
  className?: string;
}

export function SortableHeader({
  label,
  field,
  currentSortBy,
  currentSortOrder,
  onSort,
  align = 'left',
  className = '',
}: SortableHeaderProps) {
  const isActive = currentSortBy === field;

  const alignClass =
    align === 'right'
      ? 'justify-end text-right'
      : align === 'center'
      ? 'justify-center text-center'
      : 'justify-start text-left';

  return (
    <th
      scope="col"
      onClick={() => onSort(field)}
      className={`px-4 py-3.5 select-none cursor-pointer transition-colors hover:bg-slate-100 hover:text-slate-900 ${
        isActive ? 'text-indigo-600 font-bold bg-indigo-50/60' : 'text-slate-500'
      } ${className}`}
      title={`Klik untuk mengurutkan berdasarkan ${label} (${
        isActive ? (currentSortOrder === 'asc' ? 'Z-A / Terlama' : 'A-Z / Terbaru') : 'Urutkan'
      })`}
    >
      <div className={`inline-flex items-center gap-1.5 w-full ${alignClass}`}>
        <span>{label}</span>
        <span className="shrink-0 transition-transform">
          {isActive ? (
            currentSortOrder === 'asc' ? (
              <ArrowUp className="w-3.5 h-3.5 text-indigo-600 stroke-[2.5]" />
            ) : (
              <ArrowDown className="w-3.5 h-3.5 text-indigo-600 stroke-[2.5]" />
            )
          ) : (
            <ArrowUpDown className="w-3.5 h-3.5 text-slate-300 opacity-60 group-hover:opacity-100" />
          )}
        </span>
      </div>
    </th>
  );
}

