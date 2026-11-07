import { withApi } from '@/lib/api/withApi';
import { prisma } from '@/lib/db';
import { DomainError } from '@/lib/domain/money';
import { saveFile } from '@/lib/files/fileService';
import { audit } from '@/lib/audit/audit';

export const POST = withApi(
  {
    roles: ['SUPERADMIN'],
  },
  async ({ ctx, params, req }) => {
    const businessId = params.id;
    if (!businessId) {
      throw new DomainError('BAD_REQUEST', 'ID Usaha tidak valid', 400);
    }

    const business = await prisma.business.findFirst({
      where: { id: businessId, deletedAt: null },
    });

    if (!business) {
      throw new DomainError('NOT_FOUND', 'Usaha tidak ditemukan', 404);
    }

    const formData = await req.formData().catch(() => {
      throw new DomainError('BAD_REQUEST', 'Form data tidak valid', 400);
    });

    const file = formData.get('file');
    if (!file || !(file instanceof Blob)) {
      throw new DomainError(
        'VALIDATION_ERROR',
        'Berkas logo wajib dilampirkan',
        422
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const saved = await saveFile({
      businessId,
      kind: 'logo',
      buffer,
    });

    // Perbarui logoPath pada unit usaha dan catat audit dalam transaksi
    await prisma.$transaction(async (tx) => {
      await tx.business.update({
        where: { id: businessId },
        data: { logoPath: saved.relativePath },
      });

      await audit(tx, ctx, {
        action: 'BUSINESS_UPDATE',
        entityType: 'Business',
        entityId: businessId,
        businessId,
        summary: 'Unggah logo unit usaha',
        before: { logoPath: business.logoPath },
        after: { logoPath: saved.relativePath },
      });
    });

    return {
      data: {
        logoPath: saved.relativePath,
      },
    };
  }
);
