import { NextRequest, NextResponse } from 'next/server';
import { requireContext } from '@/lib/auth/context';
import { toErrorResponse } from '@/lib/api/withApi';
import { Role } from '@prisma/client';
import { generateCatalogPdf } from '@/lib/services/catalog';

/**
 * GET /api/v1/catalogs/:id/pdf
 *
 * Mengunduh berkas PDF resmi katalog harga.
 * Ditolak 422 CATALOG_STALE jika ada produk dengan harga di bawah harga minimal terbaru.
 * Bebas dari kebocoran data rahasia (tanpa HPP, minimal price, atau stok).
 *
 * Rujukan: Seksi 15.1, 15.2 & Tes 17.3 nomor 18 Dokumen Spesifikasi.
 */
export async function GET(
  req: NextRequest,
  route: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const ctx = await requireContext(req, [Role.SUPERADMIN, Role.SALES]);
    const { id } = await route.params;

    const { buffer, filename } = await generateCatalogPdf(ctx, id);

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${filename}"`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
