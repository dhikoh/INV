import { withApi } from '@/lib/api/withApi';
import { Role } from '@prisma/client';
import { requireBusiness } from '@/lib/auth/context';
import { CatalogSyncSchema } from '@/lib/validation/priceList';
import * as catalogService from '@/lib/services/catalog';

/**
 * POST /api/v1/catalogs/:id/sync
 *
 * Menyinkronkan item katalog: menambah produk baru dan/atau menaikkan harga item yang stale ke batas paten.
 * Rujukan: Addendum v2 Seksi 13.6, 13.7 & Seksi 14.6.
 */
export const POST = withApi(
  {
    roles: [Role.SUPERADMIN, Role.SALES],
    body: CatalogSyncSchema,
  },
  async ({ ctx, body, params }) => {
    const businessId = requireBusiness(ctx);
    const result = await catalogService.syncCatalog(
      ctx,
      businessId,
      params.id,
      body
    );
    return { data: result };
  }
);

