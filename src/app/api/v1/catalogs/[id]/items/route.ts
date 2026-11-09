import { withApi } from '@/lib/api/withApi';
import { Role } from '@prisma/client';
import { ReplaceCatalogItemsSchema } from '@/lib/validation/catalog';
import { replaceCatalogItems } from '@/lib/services/catalog';

/**
 * PUT /api/v1/catalogs/:id/items
 *
 * Mengganti seluruh item dalam katalog.
 * Validasi harga di bawah floor langsung ditolak 422 PRICE_BELOW_MIN (tanpa jalur persetujuan).
 *
 * Rujukan: Seksi 15.1 Dokumen Spesifikasi.
 */
export const PUT = withApi(
  {
    roles: [Role.SUPERADMIN, Role.SALES],
    body: ReplaceCatalogItemsSchema,
  },
  async ({ ctx, params, body }) => {
    const data = await replaceCatalogItems(ctx, params.id, body.items);
    return { data };
  }
);
