import { withApi } from '@/lib/api/withApi';
import { Role } from '@prisma/client';
import { UpdateCatalogSchema } from '@/lib/validation/catalog';
import {
  getCatalogById,
  updateCatalog,
  deleteCatalog,
} from '@/lib/services/catalog';

/**
 * GET /api/v1/catalogs/:id
 *
 * Mengambil detail katalog harga beserta status kedaluwarsa (stale) produk.
 * Rujukan: Seksi 15.1 Dokumen Spesifikasi.
 */
export const GET = withApi(
  {
    roles: [Role.SUPERADMIN, Role.SALES],
  },
  async ({ ctx, params }) => {
    const data = await getCatalogById(ctx, params.id);
    return { data };
  }
);

/**
 * PATCH /api/v1/catalogs/:id
 *
 * Memperbarui metadata katalog (judul, pelanggan, catatan).
 * Rujukan: Seksi 15.1 Dokumen Spesifikasi.
 */
export const PATCH = withApi(
  {
    roles: [Role.SUPERADMIN, Role.SALES],
    body: UpdateCatalogSchema,
  },
  async ({ ctx, params, body }) => {
    const data = await updateCatalog(ctx, params.id, body);
    return { data };
  }
);

/**
 * DELETE /api/v1/catalogs/:id
 *
 * Menghapus katalog (soft delete).
 * Rujukan: Seksi 15.1 Dokumen Spesifikasi.
 */
export const DELETE = withApi(
  {
    roles: [Role.SUPERADMIN, Role.SALES],
  },
  async ({ ctx, params }) => {
    const data = await deleteCatalog(ctx, params.id);
    return { data };
  }
);
