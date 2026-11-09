'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { WifiOff, BookOpen } from 'lucide-react';

/**
 * Hook untuk memeriksa status koneksi internet perangkat secara live.
 */
export function useIsOnline(): boolean {
  const [isOnline, setIsOnline] = useState<boolean>(true);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    setIsOnline(navigator.onLine);

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return isOnline;
}

/**
 * Banner notifikasi offline global (Seksi 15.3).
 * Muncul otomatis di bagian atas aplikasi saat perangkat kehilangan koneksi internet.
 */
export function OfflineBanner() {
  const isOnline = useIsOnline();

  if (isOnline) {
    return null;
  }

  return (
    <div className="bg-amber-500 text-slate-950 px-4 py-2.5 shadow-sm text-xs md:text-sm font-semibold flex items-center justify-between gap-3 sticky top-0 z-50">
      <div className="flex items-center gap-2">
        <WifiOff className="w-4 h-4 shrink-0 text-slate-950" />
        <span>
          Anda sedang offline. Hanya katalog yang telah disimpan yang dapat dibuka saat ini.
        </span>
      </div>
      <Link
        href="/offline"
        className="inline-flex items-center gap-1 bg-slate-950 text-white px-2.5 py-1 rounded text-xs font-bold hover:bg-slate-800 transition-colors shrink-0"
      >
        <BookOpen className="w-3.5 h-3.5" />
        <span>Katalog Offline</span>
      </Link>
    </div>
  );
}
