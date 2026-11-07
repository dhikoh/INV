'use client';

import React, { useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';

export interface ConfirmTypeDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: string;
  confirmTarget: string; // Teks yang wajib diketik persis sama
  confirmLabel?: string;
  placeholder?: string;
  loading?: boolean;
}

export function ConfirmTypeDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  confirmTarget,
  confirmLabel = 'Hapus Permanen',
  placeholder,
  loading = false,
}: ConfirmTypeDialogProps) {
  const [typedText, setTypedText] = useState('');

  if (!isOpen) return null;

  const isMatched = typedText.trim() === confirmTarget.trim();

  const handleClose = () => {
    setTypedText('');
    onClose();
  };

  const handleConfirm = () => {
    if (isMatched && !loading) {
      onConfirm();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between p-4 border-b border-slate-100 bg-slate-50">
          <div className="flex items-center gap-2 text-red-600">
            <AlertTriangle className="w-5 h-5" />
            <h3 className="font-semibold text-slate-800">{title}</h3>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 min-h-[44px] min-w-[44px] flex items-center justify-center"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 flex flex-col gap-4">
          <p className="text-sm text-slate-600 leading-relaxed">{description}</p>

          <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-xs text-red-700 font-medium mb-1">
              Ketik teks konfirmasi berikut persis untuk melanjutkan:
            </p>
            <p className="text-sm font-bold text-red-900 select-all font-mono break-all">
              {confirmTarget}
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-slate-700">
              Teks Konfirmasi:
            </label>
            <input
              type="text"
              value={typedText}
              onChange={(e) => setTypedText(e.target.value)}
              placeholder={placeholder || confirmTarget}
              autoFocus
              className="w-full min-h-[44px] px-3 py-2 text-base md:text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500 text-slate-900 font-mono"
            />
          </div>
        </div>

        <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={handleClose}
            disabled={loading}
            className="min-h-[44px] px-4 py-2 border border-slate-300 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-100 transition-colors disabled:opacity-50"
          >
            Batal
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!isMatched || loading}
            className="min-h-[44px] px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 transition-colors disabled:bg-slate-300 disabled:cursor-not-allowed flex items-center gap-2 shadow-sm"
          >
            {loading ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>Memproses...</span>
              </>
            ) : (
              <span>{confirmLabel}</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
