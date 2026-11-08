import { z } from 'zod';
import { Role } from '@prisma/client';
import { withApi } from '@/lib/api/withApi';
import { prisma } from '@/lib/db';
import { audit } from '@/lib/audit/audit';

const createSchema = z.object({
  version: z.string().min(1, 'Versi wajib diisi').max(50),
  title: z.string().min(1, 'Judul wajib diisi').max(200),
  bodyMarkdown: z.string().min(1, 'Isi markdown wajib diisi'),
  isPublishNow: z.boolean().optional(),
});

// GET /api/v1/updates - Daftar catatan pembaruan (SA melihat draft & published; Sales hanya published)
export const GET = withApi(
  {
    roles: [Role.SUPERADMIN, Role.SALES],
  },
  async ({ ctx }) => {
    const isSuperAdmin = ctx.role === Role.SUPERADMIN;

    const updates = await prisma.releaseNote.findMany({
      where: isSuperAdmin ? {} : { publishedAt: { not: null } },
      orderBy: isSuperAdmin
        ? [{ createdAt: 'desc' }]
        : [{ publishedAt: 'desc' }],
    });

    return {
      data: updates,
    };
  }
);

// POST /api/v1/updates - Buat catatan pembaruan baru (Khusus Super Admin)
export const POST = withApi(
  {
    roles: [Role.SUPERADMIN],
    body: createSchema,
  },
  async ({ ctx, body }) => {
    const now = new Date();
    const publishedAt = body.isPublishNow ? now : null;

    const note = await prisma.releaseNote.create({
      data: {
        version: body.version.trim(),
        title: body.title.trim(),
        bodyMarkdown: body.bodyMarkdown,
        createdById: ctx.user.id,
        publishedAt,
      },
    });

    await audit(prisma, ctx, {
      action: 'RELEASE_NOTE_CREATE',
      entityType: 'ReleaseNote',
      entityId: note.id,
      summary: `Membuat catatan rilis ${note.version}: ${note.title}${
        publishedAt ? ' (Langsung terbit)' : ' (Draft)'
      }`,
      after: note,
    });

    return {
      status: 201,
      data: note,
    };
  }
);
