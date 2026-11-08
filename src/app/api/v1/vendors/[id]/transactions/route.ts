import { withApi } from '@/lib/api/withApi';
import { requireBusiness } from '@/lib/auth/context';
import { prisma } from '@/lib/db';
import { Role } from '@prisma/client';
import { getVendorLedger } from '@/lib/services/vendor-ledger';

/**
 * GET /api/v1/vendors/:id/transactions
 * Role: SUPERADMIN ONLY (Sales ditolak 403 FORBIDDEN)
 *
 * Mengambil Buku Transaksi Vendor (Vendor Ledger) beserta perhitungan saldo hutang berjalan.
 *
 * Rujukan: Seksi 7.9 & Kriteria T2.7 Dokumen Spesifikasi.
 */
export const GET = withApi(
  {
    roles: [Role.SUPERADMIN],
  },
  async ({ ctx, params }) => {
    const businessId = requireBusiness(ctx);
    const { id } = params;

    const ledger = await getVendorLedger(prisma, businessId, id);

    return {
      status: 200,
      data: ledger,
    };
  }
);
