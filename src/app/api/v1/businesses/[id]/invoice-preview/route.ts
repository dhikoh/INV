import { NextRequest, NextResponse } from 'next/server';
import React from 'react';
import { prisma } from '@/lib/db';
import { requireContext } from '@/lib/auth/context';
import { toErrorResponse } from '@/lib/api/withApi';
import { DomainError } from '@/lib/domain/money';
import { Role, InvoiceTheme } from '@prisma/client';
import { InvoiceDocument } from '@/lib/pdf/InvoiceDocument';
import { renderReactToPdf, renderReactToHtml } from '@/lib/pdf/engine';
import { getDummySnapshot } from '@/lib/pdf/dummy';
import { getLogoDataUri } from '@/lib/pdf/logo';

const VALID_THEMES: InvoiceTheme[] = [
  InvoiceTheme.PROFESIONAL,
  InvoiceTheme.FAMILY,
  InvoiceTheme.MINIMALIS,
  InvoiceTheme.MODERN,
  InvoiceTheme.KLASIK,
];

export async function GET(
  req: NextRequest,
  route: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const ctx = await requireContext(req, [Role.SUPERADMIN]);
    if (ctx.user.role !== Role.SUPERADMIN) {
      throw new DomainError('FORBIDDEN', 'Akses ditolak', 403);
    }
    const { id } = await route.params;

    if (!id) {
      throw new DomainError('BAD_REQUEST', 'ID Usaha tidak valid', 400);
    }

    if (id !== ctx.businessId) {
      throw new DomainError('FORBIDDEN', 'Akses ditolak', 403);
    }

    const business = await prisma.business.findFirst({
      where: { id, deletedAt: null },
      select: {
        name: true,
        legalName: true,
        address: true,
        phone: true,
        email: true,
        npwp: true,
        logoPath: true,
        invoiceTheme: true,
        paymentLegalNotice: true,
      },
    });

    if (!business) {
      throw new DomainError('NOT_FOUND', 'Unit usaha tidak ditemukan', 404);
    }

    const requestedTheme = (req.nextUrl.searchParams.get('theme') ||
      business.invoiceTheme ||
      'PROFESIONAL') as InvoiceTheme;

    const theme = VALID_THEMES.includes(requestedTheme)
      ? requestedTheme
      : InvoiceTheme.PROFESIONAL;

    const dummySnapshot = getDummySnapshot(theme, {
      name: business.name,
      legalName: business.legalName,
      address: business.address,
      phone: business.phone,
      email: business.email,
      npwp: business.npwp,
      logoPath: business.logoPath,
    });
    dummySnapshot.legalNotice = business.paymentLegalNotice ?? null;

    const logoDataUri = getLogoDataUri(business.logoPath);

    const element = React.createElement(InvoiceDocument, {
      snapshot: dummySnapshot,
      watermark: 'CONTOH',
      logoDataUri,
    });

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

    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="PREVIEW-TEMA-${theme}.pdf"`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
