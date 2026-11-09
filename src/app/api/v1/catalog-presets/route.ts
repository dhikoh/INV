import { withApi } from '@/lib/api/withApi';
import { Role } from '@prisma/client';
import { CATALOG_PRESETS } from '@/lib/validation/catalog';

/**
 * GET /api/v1/catalog-presets
 *
 * Mengembalikan judul preset bawaan katalog (Grosir, Distributor Tunggal, Ecer).
 * Rujukan: Seksi 15.1 Dokumen Spesifikasi.
 */
export const GET = withApi(
  {
    roles: [Role.SUPERADMIN, Role.SALES],
  },
  async () => {
    return {
      data: {
        presets: [...CATALOG_PRESETS],
      },
    };
  }
);
