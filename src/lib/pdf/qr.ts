import QRCode from 'qrcode';
import { generateVerifyToken } from '@/lib/domain/verify';

export interface RequestOriginSource {
  headers?: { get(name: string): string | null };
  nextUrl?: { origin?: string | null; protocol?: string | null };
}

const INTERNAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1', '[::1]']);

function normalizeOrigin(raw?: string | null): string | null {
  if (!raw) return null;
  const trimmed = raw.trim().replace(/\/+$/, '');
  if (!trimmed || trimmed === 'null') return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null;
    }
    return parsed.origin;
  } catch {
    return null;
  }
}

/**
 * Mengecek apakah URL/origin merujuk ke alamat internal container atau loopback
 * (seperti localhost, 127.0.0.1, 0.0.0.0, *.local, *.internal).
 */
export function isInternalOrigin(raw?: string | null): boolean {
  const normalized = normalizeOrigin(raw);
  if (!normalized) return true;
  try {
    const host = new URL(normalized).hostname.toLowerCase();
    return (
      INTERNAL_HOSTNAMES.has(host) ||
      host.endsWith('.local') ||
      host.endsWith('.internal')
    );
  } catch {
    return true;
  }
}

function extractForwardedOrigin(source?: RequestOriginSource | null): string | null {
  if (!source?.headers) return null;
  const forwardedHost = source.headers.get('x-forwarded-host')?.split(',')[0]?.trim();
  const hostHeader = forwardedHost || source.headers.get('host')?.split(',')[0]?.trim();
  if (!hostHeader) return null;

  const rawProto =
    source.headers.get('x-forwarded-proto')?.split(',')[0]?.trim() ||
    (source.nextUrl?.protocol ? source.nextUrl.protocol.replace(':', '') : '') ||
    'https';
  const proto = rawProto === 'http' || rawProto === 'https' ? rawProto : 'https';
  return normalizeOrigin(`${proto}://${hostHeader}`);
}

/**
 * Menghasilkan SVG Data URI secara lokal (100% offline, tanpa layanan eksternal)
 * untuk disematkan ke PDF Faktur, Proforma Order, dan Kwitansi Pembayaran.
 */
export async function generateQrDataUri(content: string): Promise<string> {
  const svg = await QRCode.toString(content, {
    type: 'svg',
    margin: 1,
    width: 112,
    errorCorrectionLevel: 'M',
    color: {
      dark: '#0F172A',
      light: '#FFFFFF',
    },
  });
  const base64 = Buffer.from(svg, 'utf8').toString('base64');
  return `data:image/svg+xml;base64,${base64}`;
}

/**
 * Menentukan base URL publik untuk halaman verifikasi QR `/verify/[token]`.
 *
 * Di balik reverse proxy (Docker / Coolify), `req.nextUrl.origin` sering terbaca sebagai
 * alamat internal container (`http://localhost:3000` atau `http://0.0.0.0:3000`).
 * Karena itu:
 * - Untuk request server, `APP_URL` non-internal selalu diprioritaskan;
 * - Jika `APP_URL` masih kosong/internal, header proxy (`x-forwarded-host`) dan
 *   origin request non-internal dipakai sebelum fallback ke `localhost`.
 */
export function resolvePublicBaseUrl(
  originOrReq?: string | RequestOriginSource | null
): string {
  const envAppOrigin = normalizeOrigin(process.env.APP_URL);
  const envIsPublic = Boolean(envAppOrigin && !isInternalOrigin(envAppOrigin));

  if (typeof originOrReq === 'string') {
    const explicitOrigin = normalizeOrigin(originOrReq);
    if (explicitOrigin && !isInternalOrigin(explicitOrigin)) {
      return explicitOrigin;
    }
    if (envIsPublic && envAppOrigin) {
      return envAppOrigin;
    }
    return envAppOrigin || explicitOrigin || 'http://localhost:3000';
  }

  if (originOrReq && typeof originOrReq === 'object') {
    if (envIsPublic && envAppOrigin) {
      return envAppOrigin;
    }
    const forwardedOrigin = extractForwardedOrigin(originOrReq);
    if (forwardedOrigin && !isInternalOrigin(forwardedOrigin)) {
      return forwardedOrigin;
    }
    const directOrigin = normalizeOrigin(originOrReq.nextUrl?.origin);
    if (directOrigin && !isInternalOrigin(directOrigin)) {
      return directOrigin;
    }
    return envAppOrigin || directOrigin || forwardedOrigin || 'http://localhost:3000';
  }

  return envAppOrigin || 'http://localhost:3000';
}

/**
 * Menyusun URL halaman verifikasi publik `/verify/[token]` berdasarkan origin/request atau APP_URL.
 */
export function buildPublicVerifyUrl(
  token: string,
  originOrReq?: string | RequestOriginSource | null
): string {
  const base = resolvePublicBaseUrl(originOrReq).replace(/\/+$/, '');
  return `${base}/verify/${encodeURIComponent(token)}`;
}

/**
 * Membentuk pasangan `{ verifyUrl, qrDataUri }` siap pakai untuk template PDF resmi.
 */
export async function buildQrVerificationProps(
  token: string | null | undefined,
  originOrReq?: string | RequestOriginSource | null
): Promise<{ verifyUrl: string | null; qrDataUri: string | null }> {
  if (!token) {
    return { verifyUrl: null, qrDataUri: null };
  }
  const verifyUrl = buildPublicVerifyUrl(token, originOrReq);
  const qrDataUri = await generateQrDataUri(verifyUrl);
  return { verifyUrl, qrDataUri };
}

export interface VerifyTokenPersistTarget {
  updateMany?: (args: {
    where: { id: string; businessId: string; verifyToken: null };
    data: { verifyToken: string };
  }) => Promise<unknown>;
}

/**
 * Mengambil verifyToken dari snapshot atau record faktur, atau menghasilkan token baru
 * untuk faktur legacy sebelum rendering QR Code.
 */
export async function ensureInvoiceVerifyToken(
  invoice: { id: string; businessId: string; verifyToken?: string | null },
  snapshotVerifyToken?: string | null,
  invoiceRepo?: VerifyTokenPersistTarget | null
): Promise<string> {
  const existing = snapshotVerifyToken ?? invoice.verifyToken ?? null;
  if (existing) {
    return existing;
  }

  const generated = generateVerifyToken();
  if (typeof invoiceRepo?.updateMany === 'function') {
    await invoiceRepo.updateMany({
      where: { id: invoice.id, businessId: invoice.businessId, verifyToken: null },
      data: { verifyToken: generated },
    });
  }
  return generated;
}

/**
 * Mengambil verifyToken dari katalog atau menghasilkan token baru untuk katalog.
 */
export async function ensureCatalogVerifyToken(
  catalog: { id: string; businessId: string; verifyToken?: string | null },
  catalogRepo?: VerifyTokenPersistTarget | null
): Promise<string> {
  const existing = catalog.verifyToken ?? null;
  if (existing) {
    return existing;
  }

  const generated = generateVerifyToken();
  if (typeof catalogRepo?.updateMany === 'function') {
    await catalogRepo.updateMany({
      where: { id: catalog.id, businessId: catalog.businessId, verifyToken: null },
      data: { verifyToken: generated },
    });
  }
  return generated;
}

