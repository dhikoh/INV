import { withApi } from '@/lib/api/withApi';
import { Role } from '@prisma/client';
import { requireBusiness } from '@/lib/auth/context';
import { PriceListQuery } from '@/lib/validation/priceList';
import * as priceListService from '@/lib/services/priceList';

/**
 * GET /api/v1/price-list
 *
 * Mengambil daftar harga resmi (katalog & paten) produk usaha aktif.
 * Bebas kebocoran HPP dan terisolasi per tenant.
 * Rujukan: Addendum v2 Seksi 13.7 & Seksi 14.6.
 */
export const GET = withApi(
  {
    roles: [Role.SUPERADMIN, Role.SALES],
    query: PriceListQuery,
  },
  async ({ ctx, query }) => {
    const businessId = requireBusiness(ctx);
    const { items, total } = await priceListService.listPriceList(
      ctx,
      businessId,
      query
    );
    return {
      data: items,
      meta: {
        page: query.page,
        pageSize: query.pageSize,
        total,
      },
    };
  }
);

