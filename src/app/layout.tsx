import type { Metadata } from 'next';
import React from 'react';

export const metadata: Metadata = {
  title: 'OmniCat - Sistem Multi-Usaha',
  description: 'Sistem Order, CRM dan Invoice Multi-Usaha',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
