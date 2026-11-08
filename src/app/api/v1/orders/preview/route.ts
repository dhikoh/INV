import { withApi } from '@/lib/api/withApi';
import { requireBusiness } from '@/lib/auth/context';
import { prisma } from '@/lib/db';
import { OrderCreateSchema } from '@/lib/validation/order';
import { buildOrderSnapshot, formatPreviewDto } from '@/lib/services/order';
import { Role } from '@prisma/client';

/**
 * POST /api/v1/orders/preview
 * Role: SUPERADMIN & SALES
 *
 * Menghitung simulasi total order, floor per baris, diskon promo, dan penanda belowMin
 * tanpa menyimpan ke database. Dipakai formulir order UI untuk menampilkan angka real-time.
 *
 * Rujukan: Seksi 10.4 Dokumen Spesifikasi.
 */
export const POST = withApi(
  {
    roles: [Role.SUPERADMIN, Role.SALES],
    body: OrderCreateSchema,
  },
  async ({ ctx, body }) => {
    requireBusiness(ctx);

    const snapshot = await buildOrderSnapshot(prisma, ctx, body);

    const result = formatPreviewDto(snapshot, ctx.user.role);

    return {
      status: 200,
      data: result,
    };
  }
);
