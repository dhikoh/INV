import { withApi } from '@/lib/api/withApi';
import { requireBusiness } from '@/lib/auth/context';
import { prisma } from '@/lib/db';
import { Role } from '@prisma/client';
import { CommissionPaySchema } from '@/lib/validation/commission';
import { payCommissionEntry, TxClient } from '@/lib/services/commission';
import { DomainError } from '@/lib/domain/money';

/**
 * POST /api/v1/commissions/:id/pay
 * Role: SUPERADMIN ONLY
 *
 * @deprecated Rute ini didepresiasi (NAV-012, AUD-DUP-001).
 * Rute kanon resmi: POST /api/v1/commission/entries/:id/pay.
 * Seluruh antarmuka pengguna OmniCat dan konsumen baru wajib menggunakan rute kanon.
 * Dipertahankan untuk backward compatibility pengujian warisan.
 *
 * Rujukan: NAV-012, Dokumen Spesifikasi Seksi 7.6.
 */
export const POST = withApi(
  {
    roles: [Role.SUPERADMIN],
    body: CommissionPaySchema,
  },
  async ({ ctx, params, body }) => {
    requireBusiness(ctx);
    const entryId = params.id;
    if (!entryId) {
      throw new DomainError('BAD_REQUEST', 'ID Komisi tidak valid', 400);
    }

    const data = await prisma.$transaction(async (tx) => {
      return payCommissionEntry(tx as unknown as TxClient, ctx, entryId, body.note);
    });

    return {
      status: 200,
      data,
      headers: {
        'Deprecation': '@deprecated Gunakan /api/v1/commission/entries/:id/pay (NAV-012)',
      },
    };
  }
);
