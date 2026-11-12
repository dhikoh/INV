import { NextRequest, NextResponse } from 'next/server';
import React from 'react';
import { prisma } from '@/lib/db';
import { env } from '@/lib/env';
import { toErrorResponse } from '@/lib/api/withApi';
import { DomainError } from '@/lib/domain/money';
import { Role, InvoiceStatus } from '@prisma/client';
import type { Ctx } from '@/lib/auth/context';
import { verifyDownloadToken } from '@/lib/pdf/downloadToken';
import { buildInvoiceSnapshot, InvoiceSnapshot } from '@/lib/pdf/snapshot';
import { InvoiceDocument } from '@/lib/pdf/InvoiceDocument';
import { DeliveryNoteDocument, DeliveryNoteData } from '@/lib/pdf/DeliveryNoteDocument';
import { renderReactToPdf } from '@/lib/pdf/engine';
import { getLogoDataUri } from '@/lib/pdf/logo';
import { generateCatalogPdf } from '@/lib/services/catalog';
import { prepareCreditNotePdf } from '@/lib/pdf/creditNotePdf';

/**
 * GET /api/v1/dl/:token
 *
 * Endpoint penyajian PDF bertanda tangan sekali buka tanpa cookie sesi biasa.
 * Dikecualikan dari withApi (Seksi 10 & Seksi 17.4 c Dokumen Spesifikasi).
 * Memverifikasi tanda tangan HMAC-SHA256, masa berlaku 5 menit, dan
 * mengulang pemeriksaan hak akses pengguna pada saat tautan dibuka.
 *
 * Rujukan: Seksi 11.5 & Seksi 16.3 Dokumen Spesifikasi.
 */
export async function GET(
  req: NextRequest,
  route: { params: Promise<{ token: string }> }
): Promise<NextResponse> {
  try {
    const { token } = await route.params;

    if (!token) {
      throw new DomainError('BAD_REQUEST', 'Token unduh tidak valid', 400);
    }

    // 1. Verifikasi tanda tangan dan masa berlaku token
    const payload = verifyDownloadToken(token, env.APP_SECRET);

    // 2. Ambil user pemilik token dan pastikan masih aktif
    const user = await prisma.user.findFirst({
      where: { id: payload.userId, isActive: true, deletedAt: null },
    });

    if (!user) {
      throw new DomainError('UNAUTHENTICATED', 'Pengguna tidak ditemukan atau non-aktif', 401);
    }

    const scopedBusinessId = user.businessId ?? payload.businessId;

    // 3. Evaluasi hak akses dan sajikan dokumen sesuai tipe
    if (payload.type === 'INVOICE_PDF') {
      const invoice = await prisma.invoice.findFirst({
        where: {
          id: payload.id,
          ...(scopedBusinessId ? { businessId: scopedBusinessId } : {}),
          deletedAt: null,
        },
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

      // Validasi isolasi usaha jika user memiliki businessId
      if (user.businessId && invoice.businessId !== user.businessId) {
        throw new DomainError('FORBIDDEN', 'Akses ditolak', 403);
      }

      const order = await prisma.order.findFirst({
        where: { id: invoice.orderId, businessId: invoice.businessId, deletedAt: null },
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

      // Pembatasan Staf Sales: hanya boleh pesanan miliknya dan HANYA yang APPROVED
      if (user.role === Role.SALES) {
        if (order.salesId !== user.id) {
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

      // Bangun atau ambil snapshot faktur
      let snapshot: InvoiceSnapshot;
      let watermark: string | null = null;

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

        const isPaid =
          invoice.paidAmount >= invoice.amount ||
          (order.paidTotal >= order.grandTotal && order.grandTotal > 0n);

        if (isPaid) {
          watermark = 'LUNAS';
        }
      } else if (invoice.status === InvoiceStatus.VOID) {
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
      const element = React.createElement(InvoiceDocument, {
        snapshot,
        watermark,
        logoDataUri,
      });

      const pdfBuffer = await renderReactToPdf(element);

      // Perbarui log audit dan counter cetak dengan tenant scoping
      await prisma.invoice.updateMany({
        where: { id: invoice.id, businessId: invoice.businessId },
        data: {
          printedCount: { increment: 1 },
          lastPrintedAt: new Date(),
        },
      });

      await prisma.auditLog.create({
        data: {
          businessId: invoice.businessId,
          actorId: user.id,
          actorRole: user.role,
          action: 'INVOICE_PRINT',
          entityType: 'Invoice',
          entityId: invoice.id,
          summary: `Invoice #${invoice.number} diunduh via tautan sekali buka (Cetak ke-${(invoice.printedCount ?? 0) + 1})`,
        },
      });

      const rawNumber = snapshot.number || 'INVOICE';
      const safeFilename = `${rawNumber.replace(/[/\\?%*:|"<>]/g, '-')}.pdf`;

      return new NextResponse(pdfBuffer, {
        status: 200,
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `inline; filename="${safeFilename}"`,
          'Cache-Control': 'private, no-store',
        },
      });
    }

    if (payload.type === 'DELIVERY_NOTE_PDF') {
      const order = await prisma.order.findFirst({
        where: {
          id: payload.id,
          ...(scopedBusinessId ? { businessId: scopedBusinessId } : {}),
          deletedAt: null,
        },
        include: {
          customer: true,
          business: true,
          items: {
            orderBy: { sortOrder: 'asc' },
          },
        },
      });

      if (!order) {
        throw new DomainError('NOT_FOUND', 'Pesanan tidak ditemukan', 404);
      }

      if (user.businessId && order.businessId !== user.businessId) {
        throw new DomainError('FORBIDDEN', 'Akses ditolak', 403);
      }

      if (user.role === Role.SALES && order.salesId !== user.id) {
        throw new DomainError(
          'FORBIDDEN',
          'Anda hanya dapat mengakses surat jalan pesanan Anda sendiri',
          403
        );
      }

      const [shipment, invoices] = await Promise.all([
        prisma.shipment.findFirst({
          where: { orderId: order.id, businessId: order.businessId },
        }),
        prisma.invoice.findMany({
          where: {
            orderId: order.id,
            businessId: order.businessId,
            status: InvoiceStatus.APPROVED,
            deletedAt: null,
          },
          orderBy: { createdAt: 'desc' },
        }),
      ]);

      const deliveryNo =
        shipment?.deliveryNo ||
        `SJ/${order.orderNo || order.id.slice(0, 8).toUpperCase()}`;

      const deliveryNoteData: DeliveryNoteData = {
        deliveryNo,
        orderNumber: order.orderNo || `DRAFT-${order.id.slice(0, 8)}`,
        invoiceNumber: invoices[0]?.number || null,
        shippedAt: shipment?.shippedAt ? shipment.shippedAt.toISOString() : null,
        business: {
          name: order.business.name,
          legalName: order.business.legalName,
          address: order.business.address,
          phone: order.business.phone,
          email: order.business.email,
          logoPath: order.business.logoPath,
        },
        customer: {
          code: order.customer.code,
          name: order.customer.name,
          contactName: order.customer.contactName,
          shippingAddress: order.deliveryAddress || order.customer.address,
          phone: order.customer.phone,
        },
        logistics: {
          courier: shipment ? shipment.transporterId || shipment.method : null,
          trackingNo: shipment?.trackingNo || null,
          driverName: shipment?.driverName || null,
          vehiclePlate: shipment?.vehiclePlate || null,
          estimatedArrival: null,
        },
        items: order.items.map((it, idx) => ({
          no: idx + 1,
          name: it.productName,
          sku: it.sku,
          qty: it.qty,
          unit: it.unit,
          note: null,
        })),
        notes: shipment?.notes || order.notes || null,
      };

      const logoDataUri = getLogoDataUri(deliveryNoteData.business.logoPath);
      const element = React.createElement(DeliveryNoteDocument, {
        data: deliveryNoteData,
        logoDataUri,
      });

      const pdfBuffer = await renderReactToPdf(element);

      const safeFilename = `SuratJalan-${(order.orderNo || order.id).replace(/[/\\?%*:|"<>]/g, '-')}.pdf`;

      return new NextResponse(pdfBuffer, {
        status: 200,
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `inline; filename="${safeFilename}"`,
          'Cache-Control': 'private, no-store',
        },
      });
    }

    if (payload.type === 'CATALOG_PDF') {
      if (!scopedBusinessId) {
        throw new DomainError(
          'BAD_REQUEST',
          'Konteks unit usaha tidak ditemukan pada tautan unduh katalog',
          400
        );
      }

      const dlCtx: Ctx = {
        user: {
          id: user.id,
          role: user.role,
          name: user.name,
          businessId: user.businessId,
        },
        role: user.role,
        businessId: scopedBusinessId,
        sessionId: 'download-token',
        ip: null,
      };

      const { buffer, filename } = await generateCatalogPdf(dlCtx, payload.id);

      return new NextResponse(new Uint8Array(buffer), {
        status: 200,
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `inline; filename="${filename}"`,
          'Cache-Control': 'private, no-store',
        },
      });
    }

    if (payload.type === 'CREDIT_NOTE_PDF') {
      if (!scopedBusinessId) {
        throw new DomainError(
          'BAD_REQUEST',
          'Konteks unit usaha tidak ditemukan pada tautan unduh nota kredit',
          400
        );
      }

      const { element, filename } = await prepareCreditNotePdf({
        userId: user.id,
        role: user.role,
        businessId: scopedBusinessId,
        strictUserBusinessId: user.businessId,
        creditNoteId: payload.id,
        sourceLabel: 'token',
      });

      const pdfBuffer = await renderReactToPdf(element);

      return new NextResponse(new Uint8Array(pdfBuffer), {
        status: 200,
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `inline; filename="${filename}"`,
          'Cache-Control': 'private, no-store',
        },
      });
    }

    throw new DomainError('NOT_SUPPORTED', 'Jenis dokumen belum didukung', 400);
  } catch (err: unknown) {
    return toErrorResponse(err);
  }
}
