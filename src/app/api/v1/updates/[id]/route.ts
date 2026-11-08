import { z } from 'zod';
import { Role } from '@prisma/client';
import { withApi } from '@/lib/api/withApi';
import { prisma } from '@/lib/db';
import { DomainError } from '@/lib/domain/money';
import { audit } from '@/lib/audit/audit';

const updateSchema = z
  .object({
    version: z.string().min(1, 'Versi wajib diisi').max(50).optional(),
    title: z.string().min(1, 'Judul wajib diisi').max(200).optional(),
    bodyMarkdown: z.string().min(1, 'Isi markdown wajib diisi').optional(),
  })
  .strict();

// GET /api/v1/updates/:id - Detail catatan pembaruan (SA & Sales, Sales hanya jika terbit)
export const GET = withApi(
  {
    roles: [Role.SUPERADMIN, Role.SALES],
  },
  async ({ ctx, params }) => {
    const note = await prisma.releaseNote.findUnique({
      where: { id: params.id },
    });

    if (!note) {
      throw new DomainError('NOT_FOUND', 'Catatan pembaruan tidak ditemukan', 404);
    }

    if (ctx.role === Role.SALES && !note.publishedAt) {
      throw new DomainError('NOT_FOUND', 'Catatan pembaruan tidak ditemukan', 404);
    }

    return {
      data: note,
    };
  }
);

// PATCH /api/v1/updates/:id - Ubah catatan pembaruan (Khusus Super Admin)
export const PATCH = withApi(
  {
    roles: [Role.SUPERADMIN],
    body: updateSchema,
  },
  async ({ ctx, body, params }) => {
    const existing = await prisma.releaseNote.findUnique({
      where: { id: params.id },
    });

    if (!existing) {
      throw new DomainError('NOT_FOUND', 'Catatan pembaruan tidak ditemukan', 404);
    }

    const updated = await prisma.releaseNote.update({
      where: { id: params.id },
      data: {
        ...(body.version !== undefined ? { version: body.version.trim() } : {}),
        ...(body.title !== undefined ? { title: body.title.trim() } : {}),
        ...(body.bodyMarkdown !== undefined ? { bodyMarkdown: body.bodyMarkdown } : {}),
      },
    });

    await audit(prisma, ctx, {
      action: 'RELEASE_NOTE_UPDATE',
      entityType: 'ReleaseNote',
      entityId: updated.id,
      summary: `Memperbarui rilis ${updated.version}: ${updated.title}`,
      before: existing,
      after: updated,
    });

    return {
      data: updated,
    };
  }
);

// DELETE /api/v1/updates/:id - Hapus catatan pembaruan (Khusus Super Admin)
export const DELETE = withApi(
  {
    roles: [Role.SUPERADMIN],
  },
  async ({ ctx, params }) => {
    const existing = await prisma.releaseNote.findUnique({
      where: { id: params.id },
    });

    if (!existing) {
      throw new DomainError('NOT_FOUND', 'Catatan pembaruan tidak ditemukan', 404);
    }

    await prisma.releaseNote.delete({
      where: { id: params.id },
    });

    await audit(prisma, ctx, {
      action: 'RELEASE_NOTE_DELETE',
      entityType: 'ReleaseNote',
      entityId: existing.id,
      summary: `Menghapus rilis ${existing.version}: ${existing.title}`,
      before: existing,
    });

    return {
      data: {
        success: true,
      },
    };
  }
);
