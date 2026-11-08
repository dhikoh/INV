import type { Metadata } from 'next';
import Script from 'next/script';
import React from 'react';

export const metadata: Metadata = {
  title: 'OmniCat Mini App',
  description: 'Aplikasi OmniCat untuk Telegram Mini App',
};

export default function TelegramLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 antialiased selection:bg-indigo-500 selection:text-white">
      <Script
        src="https://telegram.org/js/telegram-web-app.js"
        strategy="beforeInteractive"
      />
      {children}
    </div>
  );
}
