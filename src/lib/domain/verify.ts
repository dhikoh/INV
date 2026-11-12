import { randomBytes } from 'node:crypto';

/**
 * Menghasilkan token verifikasi publik acak yang aman dan sulit ditebak
 * untuk disematkan ke QR Code Proforma, Faktur Resmi, dan Kwitansi Pembayaran.
 */
export function generateVerifyToken(): string {
  return `ver_${randomBytes(18).toString('base64url')}`;
}

const BUSINESS_ENTITY_PREFIXES = new Set(['PT', 'CV', 'UD', 'PD', 'TOKO', 'KLINIK', 'PETSHOP']);

/**
 * Menyamarkan sebagian nama pelanggan agar pemilik faktur tetap dapat mengenali
 * dokumen miliknya tanpa membocorkan identitas lengkap ke pihak luar (Seksi Anti-PII).
 *
 * Contoh: "PT Petshop Jaya Abadi" -> "PT Pe***** Ja** Ab***"
 */
export function maskCustomerName(name: string | null | undefined): string {
  const clean = (name ?? '').trim();
  if (!clean) return '***';

  const words = clean.split(/\s+/);
  return words
    .map((word, idx) => {
      const upper = word.toUpperCase().replace(/[^A-Z]/g, '');
      if (idx === 0 && BUSINESS_ENTITY_PREFIXES.has(upper) && words.length > 1) {
        return word;
      }
      if (word.length <= 2) {
        return `${word[0]}*`;
      }
      const visible = word.slice(0, 2);
      const starsCount = Math.min(Math.max(word.length - 2, 2), 6);
      return `${visible}${'*'.repeat(starsCount)}`;
    })
    .join(' ');
}

/**
 * Menyamarkan rincian sensitif alamat pelanggan untuk halaman verifikasi publik.
 * Bila alamat memakai pemisah koma (misal "... , Kota"), mempertahankan bagian wilayah akhir
 * tanpa angka jalan dan menyembunyikan nama jalan/nomor rumah.
 */
export function maskAddress(address: string | null | undefined): string | null {
  const clean = (address ?? '').trim();
  if (!clean) return null;

  const segments = clean
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  if (segments.length >= 2) {
    const tail = segments[segments.length - 1].replace(/\d+/g, '*').trim();
    if (tail && tail.length >= 2) {
      return `Alamat disamarkan (***, ${tail})`;
    }
  }

  return 'Alamat disamarkan demi privasi';
}

