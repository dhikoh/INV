import { withApi } from '@/lib/api/withApi';
import { requireBusiness } from '@/lib/auth/context';
import { prisma } from '@/lib/db';
import { DomainError } from '@/lib/domain/money';
import { env } from '@/lib/env';
import { Role, InvoiceStatus } from '@prisma/client';
import { z } from 'zod';
import { createDownloadToken } from '@/lib/pdf/downloadToken';

const DownloadRequestSchema = z
  .object({
    type: z.enum([
      'INVOICE_PDF',
      'DELIVERY_NOTE_PDF',
      'CATALOG_PDF',
      'CREDIT_NOTE_PDF',
    ]),
    id: z.string().min(1, 'ID dokumen wajib diisi'),
  })
  .strict();

/**
 * POST /api/v1/downloads
 *
 * Membuat tautan unduh PDF sekali buka bertanda tangan HMAC-SHA256 (berlaku 5 menit).
 * Digunakan terutama oleh Telegram Mini App yang tidak berbagi cookie dengan browser eksternal.
 *
 * Rujukan: Seksi 11.5 & Seksi 16.3 Dokumen Spesifikasi.
 */
export const POST = withApi(
  {
    roles: [Role.SUPERADMIN, Role.SALES],
    body: DownloadRequestSchema,
  },
  async ({ ctx, body }) => {
    const businessId = requireBusiness(ctx);

    // 1. Validasi hak akses dan status dokumen (persis seperti endpoint unduh PDF langsung)
    if (body.type === 'INVOICE_PDF') {
      const invoice = await prisma.invoice.findFirst({
        where: { id: body.id, businessId, deletedAt: null },
      });

      if (!invoice) {
        throw new DomainError('INVOICE_NOT_FOUND', 'Invoice tidak ditemukan', 404);
      }

      if (invoice.businessId !== businessId) {
        throw new DomainError('FORBIDDEN', 'Akses ditolak', 403);
      }

      const order = await prisma.order.findFirst({
        where: { id: invoice.orderId, businessId, deletedAt: null },
      });

      if (!order) {
        throw new DomainError('NOT_FOUND', 'Pesanan tidak ditemukan', 404);
      }

      // Pembatasan Staf Sales: hanya boleh pesanan miliknya dan HANYA yang APPROVED
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
    } else if (body.type === 'DELIVERY_NOTE_PDF') {
      const order = await prisma.order.findFirst({
        where: { id: body.id, businessId, deletedAt: null },
      });

      if (!order) {
        throw new DomainError('NOT_FOUND', 'Pesanan tidak ditemukan', 404);
      }

      if (order.businessId !== businessId) {
        throw new DomainError('FORBIDDEN', 'Akses ditolak', 403);
      }

      if (ctx.user.role === Role.SALES && order.salesId !== ctx.user.id) {
        throw new DomainError(
          'FORBIDDEN',
          'Anda hanya dapat mengakses surat jalan pesanan Anda sendiri',
          403
        );
      }
    } else if (body.type === 'CREDIT_NOTE_PDF') {
      const cn = await prisma.creditNote.findFirst({
        where: { id: body.id, businessId, voidedAt: null },
      });

      if (!cn) {
        throw new DomainError('NOT_FOUND', 'Nota kredit tidak ditemukan', 404);
      }

      if (cn.businessId !== businessId) {
        throw new DomainError('FORBIDDEN', 'Akses ditolak', 403);
      }

      const order = await prisma.order.findFirst({
        where: { id: cn.orderId, businessId, deletedAt: null },
      });

      if (ctx.user.role === Role.SALES && order?.salesId !== ctx.user.id) {
        throw new DomainError('FORBIDDEN', 'Akses ditolak', 403);
      }
    } else if (body.type === 'CATALOG_PDF') {
      const catalog = await prisma.catalog.findFirst({
        where: { id: body.id, businessId, deletedAt: null },
      });

      if (!catalog) {
        throw new DomainError('NOT_FOUND', 'Katalog tidak ditemukan', 404);
      }

      if (catalog.businessId !== businessId) {
        throw new DomainError('FORBIDDEN', 'Akses ditolak', 403);
      }
    }

    // 2. Buat token bertanda tangan HMAC-SHA256 dengan masa berlaku 5 menit
    const { token, expiresAt } = createDownloadToken(
      {
        type: body.type,
        id: body.id,
        userId: ctx.user.id,
        businessId,
      },
      env.APP_SECRET,
      300
    );

    return {
      status: 200,
      data: {
        url: `${env.APP_URL}/api/v1/dl/${token}`,
        expiresAt: expiresAt.toISOString(),
      },
    };
  }
);
