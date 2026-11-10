import { z } from 'zod';
import { withApi } from '@/lib/api/withApi';
import { prisma } from '@/lib/db';
import { DomainError } from '@/lib/domain/money';
import { saveFile } from '@/lib/files/fileService';
import { fetchRemoteImage } from '@/lib/files/remoteImage';
import { audit } from '@/lib/audit/audit';

const bodySchema = z.object({
  url: z.string().url('URL gambar tidak valid'),
});

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/v1/businesses/[id]/logo/from-url
 *
 * Mengambil gambar logo dari URL eksternal HTTPS dengan proteksi SSRF,
 * menyimpannya secara lokal di storage, dan memperbarui logo unit usaha.
 */
export const POST = withApi(
  {
    roles: ['SUPERADMIN'],
    body: bodySchema,
  },
  async ({ ctx, params, body }) => {
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

    // Unduh gambar dari URL eksternal secara aman
    const remote = await fetchRemoteImage(body.url);

    // Simpan melalui fileService standar
    const saved = await saveFile({
      businessId,
      kind: 'logo',
      buffer: Buffer.from(remote.bytes),
    });

    // Perbarui logoPath pada unit usaha dan catat audit
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
        summary: 'Unggah logo unit usaha dari URL eksternal',
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

