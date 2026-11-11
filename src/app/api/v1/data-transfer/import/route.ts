import { withApi } from '@/lib/api/withApi';
import { DomainError } from '@/lib/domain/money';
import { env } from '@/lib/env';
import { importData } from '@/lib/transfer/import';
import { unzipSync, strFromU8 } from 'fflate';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/v1/data-transfer/import
 *
 * Mengimpor satu unit usaha dari berkas ZIP portabel (multipart/form-data).
 * Khusus Super Admin. Impor seluruh sistem (scope: system) ditolak dini dan diarahkan ke CLI.
 *
 * Query params:
 * - ?dryRun=1 : Hanya simulasi pemeriksaan tanpa menyimpan data atau menulis berkas.
 */
export const POST = withApi(
  {
    roles: ['SUPERADMIN'],
  },
  async ({ ctx, req }) => {
    // 1. Tolak dini bila Content-Length melebihi TRANSFER_MAX_MB sebelum membaca formData
    const contentLength = req.headers.get('content-length');
    const maxBytes = env.TRANSFER_MAX_MB * 1024 * 1024;
    if (contentLength && parseInt(contentLength, 10) > maxBytes) {
      throw new DomainError(
        'VALIDATION_ERROR',
        `Ukuran berkas melebihi batas maksimal ${env.TRANSFER_MAX_MB} MB`,
        422
      );
    }

    const url = new URL(req.url);
    const dryRun = url.searchParams.get('dryRun') === '1';
    const overwrite =
      url.searchParams.get('overwrite') === '1' ||
      url.searchParams.get('overwrite') === 'true';

    const formData = await req.formData().catch(() => {
      throw new DomainError('BAD_REQUEST', 'Form data tidak valid', 400);
    });

    const file = formData.get('file');
    if (!file || !(file instanceof Blob)) {
      throw new DomainError(
        'VALIDATION_ERROR',
        'Berkas ZIP wajib dilampirkan pada field "file"',
        422
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const zipBytes = new Uint8Array(arrayBuffer);

    // 2. Baca manifest.scope: tolak bila system dan arahkan ke CLI
    try {
      const files = unzipSync(zipBytes, {
        filter: (f) => f.name === 'manifest.json',
      });
      if (files['manifest.json']) {
        const manifest = JSON.parse(strFromU8(files['manifest.json']));
        if (manifest.scope === 'system') {
          throw new DomainError(
            'FORBIDDEN_SCOPE',
            'Impor seluruh sistem hanya dapat dilakukan melalui CLI terminal (scripts/import-json.ts) pada database kosong.',
            422
          );
        }
      }
    } catch (err: unknown) {
      if (err instanceof DomainError) throw err;
      // Format ZIP atau manifest korup akan ditangani secara terstruktur oleh importData
    }

    // 3. Jalankan impor data
    try {
      const report = await importData(zipBytes, {
        dryRun,
        overwrite,
        replaceSeedSuperadmin: false,
        actor: { id: ctx.user.id, role: ctx.user.role },
        uploadDir: env.UPLOAD_DIR,
      });

      return {
        data: report,
        status: report.ok ? 200 : 422,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        data: {
          ok: false,
          dryRun,
          scope: 'business',
          counts: {},
          uploads: { files: 0, written: 0, skipped: 0, failed: [] },
          warnings: [],
          errors: [`Gagal memproses berkas impor: ${msg}`],
        },
        status: 422,
      };
    }
  }
);
