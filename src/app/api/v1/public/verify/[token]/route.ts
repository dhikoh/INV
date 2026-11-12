import { NextRequest, NextResponse } from 'next/server';
import { toErrorResponse } from '@/lib/api/withApi';
import { checkPublicVerifyRateLimit } from '@/lib/auth/rateLimit';
import { DomainError } from '@/lib/domain/money';
import { resolvePublicVerifyDocument } from '@/lib/services/verify';

function extractClientIp(req: NextRequest): string {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) {
    const first = xff.split(',')[0]?.trim();
    if (first) return first;
  }
  const realIp = req.headers.get('x-real-ip')?.trim();
  if (realIp) return realIp;
  return '127.0.0.1';
}

/**
 * GET /api/v1/public/verify/:token
 * Endpoint publik (tanpa sesi login) untuk memverifikasi keaslian Proforma Order,
 * Faktur Resmi, dan Kwitansi Pembayaran melalui QR Code.
 * Dibatasi rate limit per IP dan hanya mengembalikan data tersamar (anti-PII/anti-HPP).
 */
export async function GET(
  req: NextRequest,
  route: { params: Promise<{ token: string }> }
): Promise<NextResponse> {
  try {
    const ip = extractClientIp(req);
    checkPublicVerifyRateLimit(ip);

    const { token } = await route.params;
    const doc = await resolvePublicVerifyDocument(token);

    if (!doc) {
      throw new DomainError(
        'TOKEN_NOT_FOUND',
        'Dokumen tidak ditemukan atau kode verifikasi tidak valid',
        404
      );
    }

    return NextResponse.json(
      {
        ok: true,
        data: doc,
      },
      {
        status: 200,
        headers: {
          'Cache-Control': 'no-store',
        },
      }
    );
  } catch (err) {
    return toErrorResponse(err);
  }
}

