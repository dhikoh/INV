'use client';

import React, { useState, useEffect } from 'react';
import { parseRupiahInput } from '@/lib/format/parse';

export interface MoneyInputProps {
  id?: string;
  name?: string;
  value: number; // Rupiah bulat
  onChange: (value: number) => void;
  label?: string;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  error?: string;
  helperText?: string;
  min?: number;
  max?: number;
  className?: string;
}

export function MoneyInput({
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
  min = 0,
  max,
  className = '',
}: MoneyInputProps) {
  // Format tampilan angka ribuan dengan pemisah titik
  const formatDisplay = (num: number): string => {
    if (!num || isNaN(num) || num <= 0) return '';
    return num.toLocaleString('id-ID');
  };

  const [displayValue, setDisplayValue] = useState<string>(formatDisplay(value));

  // Sinkronisasi saat value prop berubah dari luar
  useEffect(() => {
    setDisplayValue(formatDisplay(value));
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    const parsed = parseRupiahInput(raw);

    if (parsed === null) {
      setDisplayValue('');
      onChange(0);
      return;
    }

    let finalVal = Math.max(min, parsed);
    if (max !== undefined && finalVal > max) {
      finalVal = max;
    }

    setDisplayValue(finalVal.toLocaleString('id-ID'));
    onChange(finalVal);
  };

  const inputId = id || (name ? `money-input-${name}` : undefined);

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
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <span className="text-sm font-semibold text-slate-500">Rp</span>
        </div>
        <input
          id={inputId}
          name={name}
          type="text"
          inputMode="numeric"
          disabled={disabled}
          required={required}
          value={displayValue}
          onChange={handleChange}
          placeholder={placeholder}
          className={`w-full min-h-[44px] pl-10 pr-3 py-2 text-base md:text-sm bg-white border rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed ${
            error
              ? 'border-red-400 focus:ring-red-500 focus:border-red-500 text-red-900'
              : 'border-slate-300 text-slate-900'
          }`}
        />
      </div>

      {error ? (
        <p className="text-xs text-red-600 font-medium">{error}</p>
      ) : helperText ? (
        <p className="text-xs text-slate-500">{helperText}</p>
      ) : null}
    </div>
  );
}
