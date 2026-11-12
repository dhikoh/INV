import { Role } from '@prisma/client';
import { z } from 'zod';
import { withApi } from '@/lib/api/withApi';
import { prisma } from '@/lib/db';
import { requireBusiness } from '@/lib/auth/context';
import { getCustomerTransactionPrices } from '@/lib/services/customerPricingHistory';

const QuerySchema = z
  .object({
    productId: z.string().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
  })
  .strict();

/**
 * GET /api/v1/customers/:id/transaction-prices
 * Role: SUPERADMIN & SALES
 *
 * Menampilkan riwayat harga transaksi riil untuk pelanggan ini agar Sales dan pemilik usaha
 * memiliki referensi harga jual sebelumnya (bebas dari kebocoran HPP / margin / profit / overrideNote).
 */
export const GET = withApi(
  {
    roles: [Role.SUPERADMIN, Role.SALES],
    query: QuerySchema,
  },
  async ({ ctx, params, query }) => {
    requireBusiness(ctx);
    const data = await getCustomerTransactionPrices(prisma, ctx, params.id, {
      productId: query?.productId,
      limit: query?.limit,
    });
    return {
      status: 200,
      data,
    };
  }
);

