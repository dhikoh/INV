import { NextResponse } from 'next/server';
import React from 'react';
import { renderReactToHtml, renderReactToPdf } from './engine';

/**
 * Mengonversi elemen React PDF menjadi NextResponse application/pdf
 * dengan dukungan mode HTML print (?format=html|print) dan fallback anggun
 * bila headless Chromium tidak tersedia.
 */
export async function renderElementToPdfResponse(
  element: React.ReactElement,
  filename: string,
  format?: string | null
): Promise<NextResponse> {
  if (format === 'html' || format === 'print') {
    const html = await renderReactToHtml(element);
    const printableHtml = html.replace(
      '</body>',
      `<script>window.addEventListener('DOMContentLoaded', () => { window.print(); });</script></body>`
    );
    return new NextResponse(printableHtml, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'private, no-store',
      },
    });
  }

  let pdfBuffer: Buffer;
  try {
    pdfBuffer = await renderReactToPdf(element);
  } catch {
    const html = await renderReactToHtml(element);
    const printableHtml = html.replace(
      '</body>',
      `<script>window.addEventListener('DOMContentLoaded', () => { window.print(); });</script></body>`
    );
    return new NextResponse(printableHtml, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'private, no-store',
      },
    });
  }

  const safeFilename = filename.replace(/[/\\?%*:|"<>]/g, '-');

  return new NextResponse(new Uint8Array(pdfBuffer), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${safeFilename}"`,
      'Cache-Control': 'private, no-store',
    },
  });
}

