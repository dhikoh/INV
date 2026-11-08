'use client';

import { useEffect, useState, useCallback } from 'react';
import type { TelegramWebApp, TelegramThemeParams } from '@/types/telegram';
import type { DownloadType } from '@/lib/pdf/downloadToken';

export function useTelegramWebApp() {
  const [webApp, setWebApp] = useState<TelegramWebApp | null>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined' && window.Telegram?.WebApp) {
      const tg = window.Telegram.WebApp;
      setWebApp(tg);
      try {
        tg.ready();
        tg.expand();
      } catch {
        // Abaikan jika dipanggil di luar browser Telegram
      }
      setIsReady(true);

      // Terapkan parameter tema Telegram ke CSS custom variables
      if (tg.themeParams) {
        applyTelegramTheme(tg.themeParams);
      }
    }
  }, []);

  const openSignedPdf = useCallback(
    async (type: DownloadType, id: string): Promise<boolean> => {
      try {
        const res = await fetch('/api/v1/downloads', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type, id }),
        });

        const json = await res.json();
        if (!res.ok || !json.data?.url) {
          return false;
        }

        const downloadUrl = json.data.url;

        if (webApp && typeof webApp.openLink === 'function') {
          // Buka di browser eksternal via Telegram WebApp (Seksi 11.5 & 16.3)
          webApp.openLink(downloadUrl);
        } else if (typeof window !== 'undefined') {
          window.open(downloadUrl, '_blank');
        }
        return true;
      } catch {
        return false;
      }
    },
    [webApp]
  );

  return {
    webApp,
    isTelegramWebApp: Boolean(webApp && webApp.initData),
    isReady,
    themeParams: webApp?.themeParams || {},
    openSignedPdf,
  };
}

function applyTelegramTheme(params: TelegramThemeParams) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (params.bg_color) root.style.setProperty('--tg-theme-bg-color', params.bg_color);
  if (params.text_color) root.style.setProperty('--tg-theme-text-color', params.text_color);
  if (params.hint_color) root.style.setProperty('--tg-theme-hint-color', params.hint_color);
  if (params.link_color) root.style.setProperty('--tg-theme-link-color', params.link_color);
  if (params.button_color) root.style.setProperty('--tg-theme-button-color', params.button_color);
  if (params.button_text_color) root.style.setProperty('--tg-theme-button-text-color', params.button_text_color);
  if (params.secondary_bg_color) root.style.setProperty('--tg-theme-secondary-bg-color', params.secondary_bg_color);
}
