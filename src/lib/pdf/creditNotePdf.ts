import React from 'react';
import { prisma } from '@/lib/db';
import { DomainError } from '@/lib/domain/money';
import { Role } from '@prisma/client';
import { CreditNoteDocument, CreditNotePdfData } from './CreditNoteDocument';
import { getLogoDataUri } from './logo';

export interface CreditNotePdfContext {
  userId: string;
  role: Role;
  businessId: string;
  strictUserBusinessId?: string | null;
  creditNoteId: string;
  sourceLabel: 'direct' | 'token';
}

export async function prepareCreditNotePdf({
  userId,
  role,
  businessId,
  strictUserBusinessId,
  creditNoteId,
  sourceLabel,
}: CreditNotePdfContext): Promise<{
  element: React.ReactElement;
  filename: string;
  number: string;
}> {
  const creditNote = await prisma.creditNote.findFirst({
    where: {
      id: creditNoteId,
      businessId,
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
      items: true,
    },
  });

  if (!creditNote) {
    throw new DomainError('NOT_FOUND', 'Nota kredit tidak ditemukan', 404);
  }

  if (strictUserBusinessId && creditNote.businessId !== strictUserBusinessId) {
    throw new DomainError('FORBIDDEN', 'Akses ditolak', 403);
  }

  const order = await prisma.order.findFirst({
    where: {
      id: creditNote.orderId,
      businessId: creditNote.businessId,
      deletedAt: null,
    },
    include: {
      customer: true,
      items: true,
    },
  });

  if (!order) {
    throw new DomainError('NOT_FOUND', 'Pesanan tidak ditemukan', 404);
  }

  if (role === Role.SALES && order.salesId !== userId) {
    throw new DomainError(
      'FORBIDDEN',
      'Anda hanya dapat mengakses nota kredit pesanan Anda sendiri',
      403
    );
  }

  const orderItemsMap = new Map(order.items.map((it) => [it.id, it]));

  const pdfData: CreditNotePdfData = {
    number: creditNote.number,
    orderNumber: order.orderNo || `DRAFT-${order.id.slice(0, 8)}`,
    settlement: creditNote.settlement,
    createdAt: creditNote.createdAt.toISOString(),
    voidedAt: creditNote.voidedAt ? creditNote.voidedAt.toISOString() : null,
    reason: creditNote.reason,
    business: {
      name: creditNote.business.name,
      legalName: creditNote.business.legalName,
      address: creditNote.business.address,
      phone: creditNote.business.phone,
      email: creditNote.business.email,
      npwp: creditNote.business.npwp,
      logoPath: creditNote.business.logoPath,
    },
    customer: {
      code: order.customer.code,
      name: order.customer.name,
      contactName: order.customer.contactName,
      address: order.customer.address,
      phone: order.customer.phone,
    },
    items: creditNote.items.map((item, idx) => {
      const oi = orderItemsMap.get(item.orderItemId);
      return {
        no: idx + 1,
        sku: oi?.sku || '-',
        name: oi?.productName || 'Produk Retur',
        qty: item.qty,
        unit: oi?.unit || 'pcs',
        restock: item.restock,
        creditAmount: Number(item.creditAmount),
      };
    }),
    totals: {
      amountExPpn: Number(creditNote.amountExPpn),
      ppnAmount: Number(creditNote.ppnAmount),
      total: Number(creditNote.total),
    },
  };

  await prisma.auditLog.create({
    data: {
      businessId: creditNote.businessId,
      actorId: userId,
      actorRole: role,
      action: 'CREDIT_NOTE_PRINT',
      entityType: 'CreditNote',
      entityId: creditNote.id,
      summary:
        sourceLabel === 'token'
          ? `Nota Kredit #${creditNote.number} diunduh via tautan sekali buka`
          : `Nota Kredit #${creditNote.number} dicetak`,
    },
  });

  const logoDataUri = getLogoDataUri(pdfData.business.logoPath);
  const element = React.createElement(CreditNoteDocument, {
    data: pdfData,
    logoDataUri,
  });

  const safeFilename = `${creditNote.number.replace(/[/\\?%*:|"<>]/g, '-')}.pdf`;

  return {
    element,
    filename: safeFilename,
    number: creditNote.number,
  };
}
