'use client';

import React, { useState, useEffect } from 'react';
import { parsePercentToBps } from '@/lib/format/parse';

export interface PercentInputProps {
  id?: string;
  name?: string;
  value: number; // bps: 100 bps = 1%
  onChange: (bps: number) => void;
  label?: string;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  error?: string;
  helperText?: string;
  className?: string;
}

export function PercentInput({
  id,
  name,
  value,
  onChange,
  label,
  placeholder = '0',
  disabled = false,
  required = false,
  error,
  helperText,
  className = '',
}: PercentInputProps) {
  // Format tampilan persen: 350 bps -> "3,5"
  const formatDisplay = (bps: number): string => {
    if (bps === 0) return '0';
    if (!bps || isNaN(bps)) return '';
    const num = bps / 100;
    return (num ?? 0).toLocaleString('id-ID', {
      maximumFractionDigits: 2,
    });
  };

  const [displayValue, setDisplayValue] = useState<string>(formatDisplay(value));

  useEffect(() => {
    setDisplayValue(formatDisplay(value));
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    setDisplayValue(raw);

    if (raw.trim() === '') {
      onChange(0);
      return;
    }

    const bps = parsePercentToBps(raw);
    if (bps !== null) {
      onChange(bps);
    }
  };

  const handleBlur = () => {
    // Normalisasi tampilan saat keluar fokus
    setDisplayValue(formatDisplay(value));
  };

  const inputId = id || (name ? `percent-input-${name}` : undefined);

  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      {label && (
        <label
          htmlFor={inputId}
          className="text-sm font-semibold text-slate-700 flex items-center justify-between"
        >
          <span>
            {label} {required && <span className="text-red-500">*</span>}
          </span>
        </label>
      )}

      <div className="relative flex items-center rounded-lg shadow-sm">
        <input
          id={inputId}
          name={name}
          type="text"
          inputMode="decimal"
          disabled={disabled}
          required={required}
          value={displayValue}
          onChange={handleChange}
          onBlur={handleBlur}
          placeholder={placeholder}
          className={`w-full min-h-[44px] pl-3 pr-8 py-2 text-base md:text-sm bg-white border rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed ${
            error
              ? 'border-red-400 focus:ring-red-500 focus:border-red-500 text-red-900'
              : 'border-slate-300 text-slate-900'
          }`}
        />
        <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
          <span className="text-sm font-semibold text-slate-500">%</span>
        </div>
      </div>

      {error ? (
        <p className="text-xs text-red-600 font-medium">{error}</p>
      ) : helperText ? (
        <p className="text-xs text-slate-500">{helperText}</p>
      ) : null}
    </div>
  );
}
