import { NextRequest, NextResponse } from 'next/server';
import React from 'react';
import { PaymentStatus, Role } from '@prisma/client';
import { prisma } from '@/lib/db';
import { requireBusiness, requireContext } from '@/lib/auth/context';
import { toErrorResponse } from '@/lib/api/withApi';
import { DomainError } from '@/lib/domain/money';
import { ReceiptDocument } from '@/lib/pdf/ReceiptDocument';
import { getLogoDataUri } from '@/lib/pdf/logo';
import { renderElementToPdfResponse } from '@/lib/pdf/response';
import { buildQrVerificationProps } from '@/lib/pdf/qr';
import { allocateReceiptIdentifiers } from '@/lib/services/payment';
import { lockOrder } from '@/lib/services/orderGuard';

/**
 * GET /api/v1/payments/:id/receipt/pdf
 * Role: SUPERADMIN & SALES (khusus pesanan milik sales tersebut)
 *
 * Mencetak Kwitansi Pembayaran Resmi PDF hanya untuk pembayaran yang berstatus VERIFIED.
 * Pembayaran PENDING_VERIFICATION / REJECTED / VOID ditolak dengan 409 PAYMENT_NOT_VERIFIED
 * agar tidak dapat dijadikan bukti pembayaran palsu.
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
      throw new DomainError('BAD_REQUEST', 'ID Pembayaran tidak valid', 400);
    }

    const payment = await prisma.payment.findFirst({
      where: { id, businessId },
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
            invoiceTheme: true,
            paymentLegalNotice: true,
          },
        },
      },
    });

    if (!payment) {
      throw new DomainError('PAYMENT_NOT_FOUND', 'Pembayaran tidak ditemukan', 404);
    }

    const [order, invoice] = await Promise.all([
      prisma.order.findFirst({
        where: { id: payment.orderId, businessId, deletedAt: null },
        include: {
          customer: {
            select: {
              id: true,
              code: true,
              name: true,
              contactName: true,
              address: true,
              phone: true,
            },
          },
        },
      }),
      payment.invoiceId
        ? prisma.invoice.findFirst({
          where: { id: payment.invoiceId, businessId, deletedAt: null },
          select: {
            id: true,
            number: true,
            type: true,
          },
        })
        : Promise.resolve(null),
    ]);

    if (!order) {
      throw new DomainError('ORDER_NOT_FOUND', 'Pesanan tidak ditemukan', 404);
    }

    if (ctx.role === Role.SALES && order.salesId !== ctx.user.id) {
      throw new DomainError(
        'FORBIDDEN',
        'Anda tidak memiliki akses untuk mencetak kwitansi order ini',
        403
      );
    }

    if (payment.status !== PaymentStatus.VERIFIED) {
      throw new DomainError(
        'PAYMENT_NOT_VERIFIED',
        'Kwitansi resmi hanya dapat diterbitkan untuk pembayaran yang sudah terverifikasi perusahaan',
        409
      );
    }

    let receiptNo = payment.receiptNo;
    let verifyToken = payment.verifyToken;

    if (!receiptNo || !verifyToken) {
      const resolved = await prisma.$transaction(async (tx) => {
        await lockOrder(tx, payment.orderId, businessId);
        const ids = await allocateReceiptIdentifiers(
          tx,
          businessId,
          order.customerId,
          payment.paidAt,
          receiptNo,
          verifyToken
        );

        await tx.payment.updateMany({
          where: { id: payment.id, businessId },
          data: {
            ...(ids.receiptNo ? { receiptNo: ids.receiptNo } : {}),
            ...(ids.verifyToken ? { verifyToken: ids.verifyToken } : {}),
          },
        });

        return ids;
      });

      receiptNo = resolved.receiptNo ?? receiptNo;
      verifyToken = resolved.verifyToken ?? verifyToken;
    }

    const finalReceiptNo =
      receiptNo || `KWT-${payment.id.slice(-6).toUpperCase()}`;
    const orderDisplayNo = order.orderNo || `ORD-${order.id.slice(-6).toUpperCase()}`;
    const { verifyUrl, qrDataUri } = await buildQrVerificationProps(verifyToken, req);
    const logoDataUri = getLogoDataUri(payment.business.logoPath);

    const element = React.createElement(ReceiptDocument, {
      receipt: {
        receiptNo: finalReceiptNo,
        paidAt: payment.paidAt.toISOString(),
        method: payment.method,
        reference: payment.reference,
        amount: Number(payment.amount),
        orderNo: orderDisplayNo,
        orderGrandTotal: Number(order.grandTotal),
        orderPaidTotal: Number(order.paidTotal),
        invoiceNumber: invoice?.number ?? null,
        invoiceType: invoice?.type ?? null,
        theme: payment.business.invoiceTheme,
        legalNotice: payment.business.paymentLegalNotice,
        business: {
          name: payment.business.name,
          legalName: payment.business.legalName,
          address: payment.business.address,
          phone: payment.business.phone,
          email: payment.business.email,
          npwp: payment.business.npwp,
          logoPath: payment.business.logoPath,
        },
        customer: {
          name: order.customer.name,
          contactName: order.customer.contactName,
          address: order.customer.address,
          phone: order.customer.phone,
        },
      },
      logoDataUri,
      qrDataUri,
      verifyUrl,
    });

    const format = req.nextUrl.searchParams.get('format');
    const filename = `${finalReceiptNo}.pdf`;

    return await renderElementToPdfResponse(element, filename, format);
  } catch (err) {
    return toErrorResponse(err);
  }
}
