import { withApi } from '@/lib/api/withApi';
import { Role } from '@prisma/client';
import {
  CreateCatalogSchema,
  CatalogQuerySchema,
} from '@/lib/validation/catalog';
import {
  listCatalogs,
  createCatalog,
} from '@/lib/services/catalog';

/**
 * GET /api/v1/catalogs
 *
 * Mengambil daftar katalog harga.
 * Staf Sales dibatasi hanya melihat katalog miliknya sendiri.
 *
 * Rujukan: Seksi 15.1 Dokumen Spesifikasi.
 */
export const GET = withApi(
  {
    roles: [Role.SUPERADMIN, Role.SALES],
    query: CatalogQuerySchema,
  },
  async ({ ctx, query }) => {
    const result = await listCatalogs(ctx, query);
    return {
      data: result.items,
      meta: result.pagination,
    };
  }
);

/**
 * POST /api/v1/catalogs
 *
 * Membuat katalog harga baru beserta baris produk.
 * Memvalidasi agar harga produk tidak di bawah harga minimal (PRICE_BELOW_MIN).
 *
 * Rujukan: Seksi 15.1 Dokumen Spesifikasi.
 */
export const POST = withApi(
  {
    roles: [Role.SUPERADMIN, Role.SALES],
    body: CreateCatalogSchema,
  },
  async ({ ctx, body }) => {
    const catalog = await createCatalog(ctx, body);
    return {
      status: 201,
      data: {
        id: catalog.id,
        title: catalog.title,
        customerId: catalog.customerId,
        layoutStyle: catalog.layoutStyle,
        isPromo: catalog.isPromo,
        verifyToken: catalog.verifyToken,
        note: catalog.note,
        createdAt: catalog.createdAt.toISOString(),
      },
    };
  }
);
