import { NextRequest, NextResponse } from 'next/server';
import React from 'react';
import { prisma } from '@/lib/db';
import { requireBusiness, requireContext } from '@/lib/auth/context';
import { toErrorResponse } from '@/lib/api/withApi';
import { DomainError, formatRupiah } from '@/lib/domain/money';
import { OrderStatus, Role } from '@prisma/client';
import { buildProformaSnapshot } from '@/lib/pdf/snapshot';
import { InvoiceDocument } from '@/lib/pdf/InvoiceDocument';
import { getLogoDataUri } from '@/lib/pdf/logo';
import { renderElementToPdfResponse } from '@/lib/pdf/response';
import { buildPublicVerifyUrl, generateQrDataUri } from '@/lib/pdf/qr';

const ALLOWED_PROFORMA_STATUSES: OrderStatus[] = [
  OrderStatus.DRAFT,
  OrderStatus.REVISION_REQUIRED,
  OrderStatus.PENDING_APPROVAL,
];

/**
 * GET /api/v1/orders/:id/proforma/pdf
 * Role: SUPERADMIN & SALES (khusus order miliknya)
 *
 * Mencetak Proforma Order PDF sebelum pengajuan disetujui menjadi Faktur Resmi.
 * - Tidak menaikkan DocumentCounter faktur resmi.
 * - Mematuhi toggle `showBankOnProforma` usaha & menyertakan klausul pembayaran sah.
 * - Mencatat AuditLog `PROFORMA_PRINT` sebagai jejak pengawasan.
 */
export async function GET(
  req: NextRequest,
  route: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const ctx = await requireContext(req, [Role.SUPERADMIN, Role.SALES]);
    const businessId = requireBusiness(ctx);
    const { id } = await route.params;

    if (!id) {
      throw new DomainError('BAD_REQUEST', 'ID Order tidak valid', 400);
    }

    const order = await prisma.order.findFirst({
      where: { id, businessId, deletedAt: null },
      select: {
        id: true,
        businessId: true,
        salesId: true,
        status: true,
        hasBelowMin: true,
        grandTotal: true,
        dpAmount: true,
        _count: { select: { items: true } },
      },
    });

    if (!order) {
      throw new DomainError('ORDER_NOT_FOUND', 'Pesanan tidak ditemukan', 404);
    }

    if (ctx.user.role === Role.SALES && order.salesId !== ctx.user.id) {
      throw new DomainError(
        'FORBIDDEN',
        'Anda hanya dapat mencetak proforma pesanan Anda sendiri',
        403
      );
    }

    if (!ALLOWED_PROFORMA_STATUSES.includes(order.status)) {
      throw new DomainError(
        'INVALID_STATE',
        'Proforma Order hanya dapat dicetak sebelum faktur resmi disetujui',
        409
      );
    }

    if (order._count.items === 0) {
      throw new DomainError(
        'EMPTY_ITEMS',
        'Pesanan belum memiliki item produk untuk dicetak',
        422
      );
    }

    const snapshot = await buildProformaSnapshot(prisma, order.id, {
      businessId,
    });

    const watermark = order.hasBelowMin
      ? 'PROFORMA — MENUNGGU PERSETUJUAN MANAJEMEN'
      : 'PROFORMA — BUKAN FAKTUR RESMI';

    await prisma.auditLog.create({
      data: {
        businessId,
        actorId: ctx.user.id,
        actorRole: ctx.user.role,
        action: 'PROFORMA_PRINT',
        entityType: 'Order',
        entityId: order.id,
        summary: `Proforma Order ${snapshot.number} dicetak senilai ${formatRupiah(
          Number(order.grandTotal)
        )}${order.hasBelowMin ? ' (Memuat harga di bawah minimal)' : ''}`,
        after: {
          number: snapshot.number,
          grandTotal: Number(order.grandTotal),
          dpAmount: Number(order.dpAmount),
          hasBelowMin: order.hasBelowMin,
          status: order.status,
        },
      },
    });

    const logoDataUri = getLogoDataUri(snapshot.business.logoPath);
    const verifyUrl = snapshot.verifyToken
      ? buildPublicVerifyUrl(snapshot.verifyToken, req.nextUrl.origin)
      : null;
    const qrDataUri = verifyUrl ? await generateQrDataUri(verifyUrl) : null;

    const element = React.createElement(InvoiceDocument, {
      snapshot,
      watermark,
      logoDataUri,
      qrDataUri,
      verifyUrl,
    });

    const format = req.nextUrl.searchParams.get('format');
    const filename = `${snapshot.number || `PROFORMA-${order.id.slice(-6)}`}.pdf`;

    return await renderElementToPdfResponse(element, filename, format);
  } catch (err) {
    return toErrorResponse(err);
  }
}
