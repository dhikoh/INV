import QRCode from 'qrcode';

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
 * Menyusun URL halaman verifikasi publik `/verify/[token]` berdasarkan origin atau APP_URL.
 */
export function buildPublicVerifyUrl(token: string, origin?: string | null): string {
  const base = (origin || process.env.APP_URL || 'http://localhost:3000').replace(/\/+$/, '');
  return `${base}/verify/${encodeURIComponent(token)}`;
}

