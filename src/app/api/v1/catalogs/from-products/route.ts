import { withApi } from '@/lib/api/withApi';
import { Role } from '@prisma/client';
import { requireBusiness } from '@/lib/auth/context';
import { CatalogFromProductsSchema } from '@/lib/validation/priceList';
import * as catalogService from '@/lib/services/catalog';

/**
 * POST /api/v1/catalogs/from-products
 *
 * Membuat katalog baru langsung dari daftar produk aktif usaha dalam satu transaksi.
 * Rujukan: Addendum v2 Seksi 13.6, 13.7 & Seksi 14.6.
 */
export const POST = withApi(
  {
    roles: [Role.SUPERADMIN, Role.SALES],
    body: CatalogFromProductsSchema,
  },
  async ({ ctx, body }) => {
    const businessId = requireBusiness(ctx);
    const id = await catalogService.createFromProducts(ctx, businessId, body);
    const catalog = await catalogService.getCatalogById(ctx, id);
    return {
      data: catalog,
      status: 201,
    };
  }
);

