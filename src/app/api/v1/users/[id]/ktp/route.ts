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
    const userId = params.id;
    if (!userId) {
      throw new DomainError('BAD_REQUEST', 'ID Pengguna tidak valid', 400);
    }

    const user = await prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
    });

    if (!user) {
      throw new DomainError('NOT_FOUND', 'Pengguna tidak ditemukan', 404);
    }

    const formData = await req.formData().catch(() => {
      throw new DomainError('BAD_REQUEST', 'Form data tidak valid', 400);
    });

    const file = formData.get('file');
    if (!file || !(file instanceof Blob)) {
      throw new DomainError(
        'VALIDATION_ERROR',
        'Berkas KTP wajib dilampirkan',
        422
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Gunakan user.businessId atau 'system' jika superadmin global
    const targetBusinessId = user.businessId || 'system';

    const saved = await saveFile({
      businessId: targetBusinessId,
      kind: 'user-ktp',
      buffer,
    });

    const updated = await prisma.$transaction(async (tx) => {
      const res = await tx.user.update({
        where: { id: userId },
        data: {
          ktpPath: saved.relativePath,
          identityVerifiedAt: new Date(),
        },
        select: {
          id: true,
          username: true,
          name: true,
          ktpPath: true,
          identityVerifiedAt: true,
        },
      });

      await audit(tx, ctx, {
        action: 'USER_KTP_UPLOAD',
        entityType: 'User',
        entityId: userId,
        businessId: user.businessId,
        summary: `Unggah berkas KTP untuk pengguna: ${user.username}`,
        before: { ktpPath: user.ktpPath },
        after: { ktpPath: saved.relativePath },
      });

      return res;
    });

    return {
      data: updated,
    };
  }
);

export const DELETE = withApi(
  {
    roles: ['SUPERADMIN'],
  },
  async ({ ctx, params }) => {
    const userId = params.id;
    if (!userId) {
      throw new DomainError('BAD_REQUEST', 'ID Pengguna tidak valid', 400);
    }

    const user = await prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
    });

    if (!user) {
      throw new DomainError('NOT_FOUND', 'Pengguna tidak ditemukan', 404);
    }

    const updated = await prisma.$transaction(async (tx) => {
      const res = await tx.user.update({
        where: { id: userId },
        data: {
          ktpPath: null,
          identityVerifiedAt: null,
        },
        select: {
          id: true,
          username: true,
          name: true,
          ktpPath: true,
          identityVerifiedAt: true,
        },
      });

      await audit(tx, ctx, {
        action: 'USER_KTP_DELETE',
        entityType: 'User',
        entityId: userId,
        businessId: user.businessId,
        summary: `Hapus berkas KTP untuk pengguna: ${user.username}`,
        before: { ktpPath: user.ktpPath },
        after: { ktpPath: null },
      });

      return res;
    });

    return {
      data: updated,
    };
  }
);

