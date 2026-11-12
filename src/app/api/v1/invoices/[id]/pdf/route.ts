import { NextRequest, NextResponse } from 'next/server';
import React from 'react';
import { prisma } from '@/lib/db';
import { requireContext, requireBusiness } from '@/lib/auth/context';
import { toErrorResponse } from '@/lib/api/withApi';
import { DomainError } from '@/lib/domain/money';
import { Role, InvoiceStatus } from '@prisma/client';
import { buildInvoiceSnapshot, InvoiceSnapshot } from '@/lib/pdf/snapshot';
import { InvoiceDocument } from '@/lib/pdf/InvoiceDocument';
import { renderReactToPdf, renderReactToHtml } from '@/lib/pdf/engine';
import { getLogoDataUri } from '@/lib/pdf/logo';
import { buildQrVerificationProps, ensureInvoiceVerifyToken } from '@/lib/pdf/qr';

export async function GET(
  req: NextRequest,
  route: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const ctx = await requireContext(req, [Role.SUPERADMIN, Role.SALES]);
    const businessId = requireBusiness(ctx);
    const { id } = await route.params;

    if (!id) {
      throw new DomainError('BAD_REQUEST', 'ID Invoice tidak valid', 400);
    }

    const preview = req.nextUrl.searchParams.get('preview') === '1';

    const invoice = await prisma.invoice.findFirst({
      where: { id, businessId, deletedAt: null },
      include: {
        business: {
          select: {
            id: true,
            name: true,
            legalName: true,
            address: true,
            phone: true,
            email: true,
            npwp: true,
            logoPath: true,
          },
        },
      },
    });

    if (!invoice) {
      throw new DomainError('INVOICE_NOT_FOUND', 'Invoice tidak ditemukan', 404);
    }

    const order = await prisma.order.findFirst({
      where: { id: invoice.orderId, businessId, deletedAt: null },
      select: {
        id: true,
        orderNo: true,
        salesId: true,
        businessId: true,
        paidTotal: true,
        grandTotal: true,
        dpAmount: true,
      },
    });

    if (!order) {
      throw new DomainError('NOT_FOUND', 'Pesanan tidak ditemukan', 404);
    }

    // Pembatasan Staf Sales (Seksi 14.3 Dokumen Spesifikasi):
    // Sales HANYA boleh mencetak faktur pesanan miliknya dan HANYA yang berstatus APPROVED.
    if (ctx.user.role === Role.SALES) {
      if (order.salesId !== ctx.user.id) {
        throw new DomainError(
          'FORBIDDEN',
          'Anda hanya dapat mengakses invoice pesanan Anda sendiri',
          403
        );
      }
      if (invoice.status !== InvoiceStatus.APPROVED) {
        throw new DomainError(
          'INVOICE_NOT_APPROVED',
          'Invoice belum disetujui, PDF faktur resmi belum dapat dicetak',
          409
        );
      }
    }

    // Validasi Super Admin
    if (ctx.user.role === Role.SUPERADMIN) {
      if (invoice.status === InvoiceStatus.PENDING_APPROVAL) {
        if (!preview) {
          throw new DomainError(
            'INVOICE_NOT_APPROVED',
            'Invoice belum disetujui, gunakan parameter ?preview=1 untuk pratinjau',
            409
          );
        }
      } else if (
        invoice.status !== InvoiceStatus.APPROVED &&
        invoice.status !== InvoiceStatus.VOID
      ) {
        throw new DomainError(
          'INVOICE_NOT_APPROVED',
          'Status invoice tidak valid untuk pencetakan PDF',
          409
        );
      }
    }

    // Bangun atau ambil snapshot
    let snapshot: InvoiceSnapshot;
    let watermark: string | null = null;
    let isNormalPrint = false;

    if (invoice.status === InvoiceStatus.APPROVED) {
      if (invoice.snapshot) {
        snapshot = invoice.snapshot as unknown as InvoiceSnapshot;
      } else {
        snapshot = await buildInvoiceSnapshot(prisma, invoice.id, {
          businessId: invoice.businessId,
          number: invoice.number,
          issueDate: invoice.issueDate ?? undefined,
          dueDate: invoice.dueDate ?? undefined,
          theme: invoice.theme ?? undefined,
        });
      }

      // Aturan Watermark LUNAS (Seksi 14.3 & 14.5)
      const isPaid =
        invoice.paidAmount >= invoice.amount ||
        (order.paidTotal >= order.grandTotal && order.grandTotal > 0n);

      if (isPaid) {
        watermark = 'LUNAS';
      }

      isNormalPrint = true;
    } else if (invoice.status === InvoiceStatus.PENDING_APPROVAL) {
      // Pratinjau draf invoice sebelum disetujui
      snapshot = await buildInvoiceSnapshot(prisma, invoice.id, {
        businessId: invoice.businessId,
        number: null,
        theme: invoice.theme ?? undefined,
      });
      watermark = 'PRATINJAU, MENUNGGU PERSETUJUAN';
    } else if (invoice.status === InvoiceStatus.VOID) {
      // Invoice batal
      if (invoice.snapshot) {
        snapshot = invoice.snapshot as unknown as InvoiceSnapshot;
      } else {
        snapshot = await buildInvoiceSnapshot(prisma, invoice.id, {
          businessId: invoice.businessId,
          number: invoice.number,
          theme: invoice.theme ?? undefined,
        });
      }
      watermark = 'BATAL';
    } else {
      throw new DomainError(
        'INVOICE_NOT_APPROVED',
        'Status invoice tidak valid untuk dicetak',
        409
      );
    }

    const logoDataUri = getLogoDataUri(snapshot.business.logoPath);

    const verifyToken = await ensureInvoiceVerifyToken(
      invoice,
      snapshot.verifyToken,
      prisma.invoice
    );
    const { verifyUrl, qrDataUri } = await buildQrVerificationProps(verifyToken, req);

    const element = React.createElement(InvoiceDocument, {
      snapshot,
      watermark,
      logoDataUri,
      qrDataUri,
      verifyUrl,
    });

    const format = req.nextUrl.searchParams.get('format');

    // Update counter cetak dan log audit jika cetak faktur resmi
    if (isNormalPrint) {
      await prisma.invoice.updateMany({
        where: { id: invoice.id, businessId: invoice.businessId },
        data: {
          printedCount: { increment: 1 },
          lastPrintedAt: new Date(),
        },
      });

      await prisma.auditLog.create({
        data: {
          businessId: ctx.businessId,
          actorId: ctx.user.id,
          actorRole: ctx.user.role,
          action: 'INVOICE_PRINT',
          entityType: 'Invoice',
          entityId: invoice.id,
          summary: `Invoice #${invoice.number} dicetak (Cetak ke-${(invoice.printedCount ?? 0) + 1})`,
        },
      });
    }

    // Jika parameter format=html diminta secara eksplisit, kirim halaman cetak HTML interaktif
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
      // Fallback anggun: jika headless browser Chromium di server belum terkonfigurasi / spawn error / timeout / memory issue,
      // kembalikan tampilan dokumen HTML dengan auto-print agar pengguna tetap dapat mencetak faktur tanpa kegagalan (500)
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

    const rawNumber = snapshot.number || (preview ? 'DRAFT-INVOICE' : 'INVOICE');
    const safeFilename = `${rawNumber.replace(/[/\\?%*:|"<>]/g, '-')}.pdf`;

    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${safeFilename}"`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
