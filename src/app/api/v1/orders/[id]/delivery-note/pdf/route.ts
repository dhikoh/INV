import { NextRequest, NextResponse } from 'next/server';
import React from 'react';
import { prisma } from '@/lib/db';
import { requireContext, requireBusiness } from '@/lib/auth/context';
import { toErrorResponse } from '@/lib/api/withApi';
import { DomainError } from '@/lib/domain/money';
import { Role, InvoiceStatus, ShipStatus } from '@prisma/client';
import { DeliveryNoteDocument, DeliveryNoteData } from '@/lib/pdf/DeliveryNoteDocument';
import { renderReactToPdf, renderReactToHtml } from '@/lib/pdf/engine';
import { getLogoDataUri } from '@/lib/pdf/logo';

export async function GET(
  req: NextRequest,
  route: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const ctx = await requireContext(req, [Role.SUPERADMIN, Role.SALES]);
    const businessId = requireBusiness(ctx);
    const { id } = await route.params;

    if (!id) {
      throw new DomainError('BAD_REQUEST', 'ID Pesanan tidak valid', 400);
    }

    const order = await prisma.order.findFirst({
      where: { id, businessId, deletedAt: null },
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

    if (ctx.user.role === Role.SALES && order.salesId !== ctx.user.id) {
      throw new DomainError(
        'FORBIDDEN',
        'Anda hanya dapat mengakses surat jalan pesanan Anda sendiri',
        403
      );
    }

    const [shipment, invoices] = await Promise.all([
      prisma.shipment.findFirst({
        where: { orderId: order.id, businessId },
      }),
      prisma.invoice.findMany({
        where: { orderId: order.id, businessId, status: InvoiceStatus.APPROVED, deletedAt: null },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    // Surat Jalan HANYA boleh dicetak jika pengiriman sudah berstatus SHIPPED atau DELIVERED (Seksi 14.6)
    if (
      !shipment ||
      (shipment.status !== ShipStatus.SHIPPED &&
        shipment.status !== ShipStatus.DELIVERED)
    ) {
      throw new DomainError(
        'INVALID_STATE',
        'Surat Jalan hanya dapat dicetak setelah pesanan dikirim (status SHIPPED)',
        409
      );
    }

    // Bangun data Surat Jalan (PENTING: DILARANG MEMUAT HARGA / HPP / NILAI FINANSIAL)
    const deliveryNo =
      shipment.deliveryNo ||
      `SJ/${order.orderNo || order.id.slice(0, 8).toUpperCase()}`;

    const deliveryData: DeliveryNoteData = {
      deliveryNo,
      orderNumber: order.orderNo || `DRAFT-${order.id.slice(0, 8)}`,
      invoiceNumber: invoices[0]?.number || null,
      shippedAt: shipment.shippedAt
        ? shipment.shippedAt.toISOString()
        : null,
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
        shippingAddress:
          order.deliveryAddress || order.customer.address,
        phone: order.customer.phone,
      },
      logistics: {
        courier: shipment.transporterId || shipment.method,
        trackingNo: shipment.trackingNo,
        driverName: shipment.driverName,
        vehiclePlate: shipment.vehiclePlate,
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
      notes: shipment.notes || order.notes || null,
    };

    const logoDataUri = getLogoDataUri(order.business.logoPath);

    const element = React.createElement(DeliveryNoteDocument, {
      data: deliveryData,
      logoDataUri,
    });

    const format = req.nextUrl.searchParams.get('format');

    // Jika format=html diminta secara eksplisit, kembalikan dokumen cetak HTML
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
      // kembalikan tampilan dokumen HTML dengan auto-print agar pengguna tetap dapat mencetak surat jalan tanpa kegagalan (500)
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

    const safeFilename = `${deliveryNo.replace(/[/\\?%*:|"<>]/g, '-')}.pdf`;

    return new NextResponse(pdfBuffer, {
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
