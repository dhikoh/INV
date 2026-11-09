import { withApi } from '@/lib/api/withApi';
import { Role } from '@prisma/client';
import { OwnerSalesNoteCreateSchema } from '@/lib/validation/salesEvaluation';
import {
  getOwnerSalesNotes,
  createOwnerSalesNote,
} from '@/lib/services/salesEvaluation';
import { DomainError } from '@/lib/domain/money';

/**
 * GET /api/v1/sales/:id/notes
 * Role: SUPERADMIN ONLY
 *
 * Mengambil daftar catatan rahasia pemilik tentang staf sales tertentu.
 * Rujukan: Seksi 17.3 nomor 23 & 18.1 nomor 33 Dokumen Spesifikasi.
 */
export const GET = withApi(
  {
    roles: [Role.SUPERADMIN],
  },
  async ({ ctx, params }) => {
    const salesId = params.id;
    if (!salesId) {
      throw new DomainError('BAD_REQUEST', 'ID Sales tidak valid', 400);
    }

    const data = await getOwnerSalesNotes(ctx, salesId);

    return {
      status: 200,
      data,
    };
  }
);

/**
 * POST /api/v1/sales/:id/notes
 * Role: SUPERADMIN ONLY
 *
 * Menambahkan catatan rahasia pemilik tentang staf sales tertentu.
 * Rujukan: Seksi 17.3 nomor 23 & 18.1 nomor 33 Dokumen Spesifikasi.
 */
export const POST = withApi(
  {
    roles: [Role.SUPERADMIN],
    body: OwnerSalesNoteCreateSchema,
  },
  async ({ ctx, params, body }) => {
    const salesId = params.id;
    if (!salesId) {
      throw new DomainError('BAD_REQUEST', 'ID Sales tidak valid', 400);
    }

    const data = await createOwnerSalesNote(ctx, salesId, body);

    return {
      status: 201,
      data,
    };
  }
);

