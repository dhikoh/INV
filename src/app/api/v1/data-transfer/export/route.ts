import { NextRequest, NextResponse } from 'next/server';
import { Role } from '@prisma/client';
import { requireContext } from '@/lib/auth/context';
import { toErrorResponse } from '@/lib/api/withApi';
import { audit } from '@/lib/audit/audit';
import { prisma } from '@/lib/db';
import { exportData } from '@/lib/transfer/export';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/data-transfer/export
 *
 * Ekspor seluruh sistem (seluruh unit usaha dan data global) ke dalam berkas ZIP (ADR 0008).
 * Query parameter opsional:
 * - ?tanpaBerkas=1 : ekspor hanya data database (ndjson + manifest), tanpa folder uploads.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const ctx = await requireContext(req, [Role.SUPERADMIN]);

    const url = new URL(req.url);
    const tanpaBerkas = url.searchParams.get('tanpaBerkas') === '1';

    const result = await exportData({
      scope: 'system',
      actorName: ctx.user.name,
      includeUploads: !tanpaBerkas,
    });

    // Hitung total baris yang diekspor
    const totalRows = Object.values(result.manifest.tables).reduce(
      (acc, t) => acc + t.rows,
      0
    );

    // Catat log audit transaksi DATA_EXPORT untuk seluruh sistem
    await audit(prisma, ctx, {
      action: 'DATA_EXPORT',
      entityType: 'System',
      entityId: 'SYSTEM',
      businessId: null,
      summary: `Ekspor data seluruh sistem (${result.manifest.businessCodes.length} usaha): ${totalRows} baris, ${(result.data.length / 1024).toFixed(1)} KB (upload: ${!tanpaBerkas ? 'ya' : 'tidak'})`,
    });

    return new NextResponse(Buffer.from(result.data), {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${result.filename}"`,
        'Content-Length': String(result.data.length),
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (err: unknown) {
    return toErrorResponse(err);
  }
}
