import { withApi } from '@/lib/api/withApi';
import { requireBusiness } from '@/lib/auth/context';
import { prisma } from '@/lib/db';
import { Role } from '@prisma/client';
import { CommissionTiersUpdateSchema } from '@/lib/validation/commission';
import {
  getCommissionTiers,
  setCommissionTiers,
  TxClient,
} from '@/lib/services/commission';

/**
 * GET /api/v1/commission/tiers
 * Role: SUPERADMIN ONLY
 *
 * Mengambil daftar tier komisi (CommissionTier) untuk unit usaha.
 *
 * Rujukan: Seksi 7.6 Dokumen Spesifikasi.
 */
export const GET = withApi(
  {
    roles: [Role.SUPERADMIN],
  },
  async ({ ctx }) => {
    const businessId = requireBusiness(ctx);

    const data = await prisma.$transaction(async (tx) => {
      return getCommissionTiers(tx as unknown as TxClient, businessId);
    });

    return {
      status: 200,
      data,
    };
  }
);

/**
 * PUT /api/v1/commission/tiers
 * Role: SUPERADMIN ONLY
 *
 * Mengatur / memperbarui daftar tier komisi (CommissionTier) untuk unit usaha.
 *
 * Rujukan: Seksi 7.6 Dokumen Spesifikasi.
 */
export const PUT = withApi(
  {
    roles: [Role.SUPERADMIN],
    body: CommissionTiersUpdateSchema,
  },
  async ({ ctx, body }) => {
    requireBusiness(ctx);

    const data = await prisma.$transaction(async (tx) => {
      return setCommissionTiers(tx as unknown as TxClient, ctx, body.tiers);
    });

    return {
      status: 200,
      data,
    };
  }
);

