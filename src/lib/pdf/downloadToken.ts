import crypto from 'node:crypto';
import { DomainError } from '../domain/money';

export type DownloadType =
  | 'INVOICE_PDF'
  | 'DELIVERY_NOTE_PDF'
  | 'CATALOG_PDF'
  | 'CREDIT_NOTE_PDF';

export interface DownloadTokenPayload {
  t: DownloadType;
  id: string;
  uid: string;
  bid?: string;
  exp: number;
}

/**
 * Membuat token unduh bertanda tangan HMAC-SHA256 (berlaku default 5 menit).
 *
 * Rujukan: Seksi 16.3 Dokumen Spesifikasi.
 */
export function createDownloadToken(
  data: {
    type: DownloadType;
    id: string;
    userId: string;
    businessId?: string;
  },
  secret: string,
  expiresInSec = 300
): { token: string; expiresAt: Date } {
  const expiresAt = new Date(Date.now() + expiresInSec * 1000);
  const payload: DownloadTokenPayload = {
    t: data.type,
    id: data.id,
    uid: data.userId,
    ...(data.businessId ? { bid: data.businessId } : {}),
    exp: Math.floor(expiresAt.getTime() / 1000),
  };

  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto
    .createHmac('sha256', secret)
    .update(payloadB64)
    .digest('base64url');

  const token = `${payloadB64}.${signature}`;
  return { token, expiresAt };
}

/**
 * Memverifikasi integritas, tanda tangan, dan masa berlaku token unduh.
 *
 * Rujukan: Seksi 16.3 Dokumen Spesifikasi.
 */
export function verifyDownloadToken(
  token: string,
  secret: string
): { type: DownloadType; id: string; userId: string; businessId?: string } {
  const fail = () =>
    new DomainError(
      'INVALID_DOWNLOAD_TOKEN',
      'Tautan unduh tidak valid atau sudah kedaluwarsa.',
      401
    );

  if (!token || typeof token !== 'string') {
    throw fail();
  }

  const parts = token.split('.');
  if (parts.length !== 2) {
    throw fail();
  }

  const [payloadB64, signature] = parts;

  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(payloadB64)
    .digest('base64url');

  const sigBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);

  if (
    sigBuffer.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(sigBuffer, expectedBuffer)
  ) {
    throw fail();
  }

  let payload: DownloadTokenPayload;
  try {
    payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
  } catch {
    throw fail();
  }

  if (
    !payload ||
    !payload.t ||
    !payload.id ||
    !payload.uid ||
    !Number.isFinite(payload.exp)
  ) {
    throw fail();
  }

  if (Date.now() / 1000 > payload.exp) {
    throw fail();
  }

  return {
    type: payload.t,
    id: payload.id,
    userId: payload.uid,
    businessId: payload.bid,
  };
}
