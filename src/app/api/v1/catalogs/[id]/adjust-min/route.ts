import { withApi } from '@/lib/api/withApi';
import { Role } from '@prisma/client';
import { adjustCatalogToMinPrice } from '@/lib/services/catalog';

/**
 * POST /api/v1/catalogs/:id/adjust-min
 *
 * Menyesuaikan seluruh item katalog yang stale ke harga minimal terbaru.
 * Rujukan: Seksi 15.1 Dokumen Spesifikasi.
 */
export const POST = withApi(
  {
    roles: [Role.SUPERADMIN, Role.SALES],
  },
  async ({ ctx, params }) => {
    const data = await adjustCatalogToMinPrice(ctx, params.id);
    return { data };
  }
);
