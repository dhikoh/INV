import React from 'react';
import { NextRequest, NextResponse } from 'next/server';
import { requireContext, requireBusiness } from '@/lib/auth/context';
import { toErrorResponse } from '@/lib/api/withApi';
import { DomainError } from '@/lib/domain/money';
import { Role } from '@prisma/client';
import { prepareCreditNotePdf } from '@/lib/pdf/creditNotePdf';
import { renderReactToHtml, renderReactToPdf } from '@/lib/pdf/engine';

async function renderPrintableHtmlResponse(
  element: React.ReactElement
): Promise<NextResponse> {
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

export async function GET(
  req: NextRequest,
  route: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const ctx = await requireContext(req, [Role.SUPERADMIN, Role.SALES]);
    const businessId = requireBusiness(ctx);
    const { id } = await route.params;

    if (!id) {
      throw new DomainError('BAD_REQUEST', 'ID Nota Kredit tidak valid', 400);
    }

    const { element, filename } = await prepareCreditNotePdf({
      userId: ctx.user.id,
      role: ctx.user.role,
      businessId,
      strictUserBusinessId: ctx.user.businessId,
      creditNoteId: id,
      sourceLabel: 'direct',
    });

    const format = req.nextUrl.searchParams.get('format');
    if (format === 'html' || format === 'print') {
      return await renderPrintableHtmlResponse(element);
    }

    let pdfBuffer: Buffer;
    try {
      pdfBuffer = await renderReactToPdf(element);
    } catch {
      return await renderPrintableHtmlResponse(element);
    }

    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${filename}"`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
