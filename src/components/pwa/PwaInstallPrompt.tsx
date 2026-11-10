'use client';

import React, { useState, useEffect } from 'react';
import { Smartphone, Download, X, Share } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/**
 * PwaInstallPrompt: Menampilkan tombol/banner ajakan memasang aplikasi di HP (Seksi 15.3).
 * Menyesuaikan perilaku di Android (beforeinstallprompt) dan iOS Safari (petunjuk Share -> Tambah ke Layar Utama).
 * Disembunyikan otomatis jika sudah standalone atau di dalam Telegram Mini App.
 */
let globalDeferredPrompt: BeforeInstallPromptEvent | null = null;

export function PwaInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(globalDeferredPrompt);
  const [isIos, setIsIos] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [isTelegram, setIsTelegram] = useState(false);
  const [showIosGuide, setShowIosGuide] = useState(false);
  const [dismissed, setDismissed] = useState(() => {
    if (typeof window !== 'undefined') {
      return sessionStorage.getItem('pwa_prompt_dismissed') === 'true';
    }
    return false;
  });

  const handleDismiss = () => {
    setDismissed(true);
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('pwa_prompt_dismissed', 'true');
    }
  };

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // 1. Cek mode standalone
    const standaloneCheck =
      window.matchMedia('(display-mode: standalone)').matches ||
      Boolean((navigator as unknown as { standalone?: boolean }).standalone);
    setIsStandalone(standaloneCheck);

    // 2. Cek apakah dibuka di dalam Telegram Mini App
    const telegramCheck = Boolean(
      (window as unknown as { Telegram?: { WebApp?: { initData?: string } } }).Telegram?.WebApp
        ?.initData
    );
    setIsTelegram(telegramCheck);

    // 3. Cek apakah iOS Safari
    const userAgent = window.navigator.userAgent.toLowerCase();
    const iosDevice = /iphone|ipad|ipod/.test(userAgent);
    setIsIos(iosDevice && !standaloneCheck);

    if (standaloneCheck || telegramCheck) return;

    if (globalDeferredPrompt) {
      setDeferredPrompt(globalDeferredPrompt);
    }

    // 4. Tangkap event beforeinstallprompt untuk Android / Chromium
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      globalDeferredPrompt = e as BeforeInstallPromptEvent;
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      globalDeferredPrompt = null;
      setDeferredPrompt(null);
      setIsStandalone(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  // Sembunyikan bila sudah standalone, di dalam Telegram, atau ditutup oleh pengguna
  if (isStandalone || isTelegram || dismissed) {
    return null;
  }

  // Tampilkan tombol untuk Android/Chrome bila prompt tersedia
  if (deferredPrompt) {
    const handleInstallClick = async () => {
      if (!deferredPrompt) return;
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === 'accepted') {
        setDeferredPrompt(null);
      }
    };

    return (
      <div className="bg-gradient-to-r from-slate-900 to-indigo-950 text-white px-4 py-3 shadow-md flex items-center justify-between gap-3 text-xs md:text-sm">
        <div className="flex items-center gap-2.5">
          <Smartphone className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>
            Pasang <strong>BentoCat CRM</strong> di layar utama HP untuk akses cepat dan offline.
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleInstallClick}
            className="inline-flex items-center gap-1.5 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-bold px-3 py-1.5 rounded-lg text-xs shadow-sm transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Pasang</span>
          </button>
          <button
            type="button"
            onClick={handleDismiss}
            className="text-slate-400 hover:text-white p-1"
            title="Tutup"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  // Tampilkan panduan iOS Safari bila pengguna membuka di iPhone/iPad di luar standalone
  if (isIos) {
    return (
      <div className="bg-slate-900 text-white px-4 py-2.5 shadow-md text-xs flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Share className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>
            {showIosGuide ? (
              <span>
                Ketuk ikon <strong>Bagikan</strong> di bilah Safari, lalu pilih{' '}
                <strong>&ldquo;Tambah ke Layar Utama&rdquo;</strong>.
              </span>
            ) : (
              <span>Ingin pasang di iPhone? Ketuk untuk melihat petunjuk.</span>
            )}
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {!showIosGuide && (
            <button
              type="button"
              onClick={() => setShowIosGuide(true)}
              className="text-emerald-400 font-bold hover:underline"
            >
              Lihat
            </button>
          )}
          <button
            type="button"
            onClick={handleDismiss}
            className="text-slate-400 hover:text-white p-1"
            title="Tutup"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    );
  }

  return null;
}
