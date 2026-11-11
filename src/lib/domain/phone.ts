/**
 * Helper utilitas normalisasi nomor telepon Indonesia, pembersihan nama toko,
 * dan ekstraksi wilayah kota untuk pencegahan tabrakan pelanggan antar-sales.
 */

export const KNOWN_INDONESIAN_CITIES = [
  'blitar',
  'cilacap',
  'semarang',
  'bojonegoro',
  'lamongan',
  'tuban',
  'timika',
  'surabaya',
  'malang',
  'kediri',
  'tulungagung',
  'nganjuk',
  'jombang',
  'mojokerto',
  'sidoarjo',
  'gresik',
  'pasuruan',
  'probolinggo',
  'madiun',
  'magetan',
  'ngawi',
  'solo',
  'surakarta',
  'jogja',
  'yogyakarta',
  'magelang',
  'salatiga',
  'pekalongan',
  'tegal',
  'brebes',
  'banyumas',
  'purwokerto',
  'purbalingga',
  'kudus',
  'pati',
  'jepara',
  'jakarta',
  'bogor',
  'depok',
  'tangerang',
  'bekasi',
  'bandung',
  'cirebon',
  'denpasar',
] as const;

/**
 * Normalisasi format nomor telepon Indonesia menjadi format baku '08xxxx'.
 * Menangani prefix '+62', '62', '0', spasi, titik, dan tanda strip.
 *
 * Contoh:
 * - '+62 812-3456-7890' -> '081234567890'
 * - '6281234567890'     -> '081234567890'
 * - '0812 3456 7890'    -> '081234567890'
 * - '81234567890'       -> '081234567890'
 */
export function normalizeIndonesianPhone(phone?: string | null): string | null {
  if (!phone || typeof phone !== 'string') return null;

  // Hapus karakter pemisah umum (spasi, strip, kurung, titik)
  let cleaned = phone.trim().replace(/[^\d+]/g, '');
  if (!cleaned) return null;

  if (cleaned.startsWith('+62')) {
    cleaned = '0' + cleaned.slice(3);
  } else if (cleaned.startsWith('62')) {
    cleaned = '0' + cleaned.slice(2);
  } else if (!cleaned.startsWith('0') && cleaned.length >= 9) {
    cleaned = '0' + cleaned;
  }

  // Bersihkan karakter non-digit tersisa
  cleaned = cleaned.replace(/\D/g, '');

  // Validasi panjang nomor di Indonesia (antara 8 sampai 16 digit)
  if (cleaned.length < 8 || cleaned.length > 16) {
    return null;
  }

  return cleaned;
}

/**
 * Membersihkan nama toko dari tanda baca dan kata-kata umum (stopwords) seperti
 * 'petshop', 'pet shop', 'toko', 'ps', 'drh', 'ud', 'cv', 'pt'.
 *
 * Contoh:
 * - 'Cherry Petshop'       -> 'cherry'
 * - 'Cherry Pet Shop'      -> 'cherry'
 * - 'Toko Cherry'          -> 'cherry'
 * - 'Drh Nela Dwi (Vetma)' -> 'nela dwi vetma'
 */
export function cleanStoreName(name?: string | null): string {
  if (!name || typeof name !== 'string') return '';

  let str = name.toLowerCase().trim();

  // Hilangkan tanda baca dan karakter khusus
  str = str.replace(/[^\w\s]/g, ' ');

  // Hapus kata umum jenis usaha & sebutan petshop
  const stopwords = [
    'petshop',
    'pet shop',
    'pet',
    'shop',
    'ps',
    'toko',
    'ud',
    'cv',
    'pt',
    'drh',
    'dokter',
  ];

  for (const sw of stopwords) {
    const reg = new RegExp(`\\b${sw}\\b`, 'gi');
    str = str.replace(reg, ' ');
  }

  // Rapikan spasi berlebih
  return str.replace(/\s+/g, ' ').trim();
}

/**
 * Mengekstrak nama kota/wilayah dari kombinasi teks (nama toko, alamat pengiriman, billing).
 */
export function extractCityFromRecord(record: {
  name?: string | null;
  address?: string | null;
  shippingAddress?: string | null;
  billingAddress?: string | null;
}): string | null {
  const combined = `${record.name ?? ''} ${record.address ?? ''} ${
    record.shippingAddress ?? ''
  } ${record.billingAddress ?? ''}`.toLowerCase();

  if (!combined.trim()) return null;

  // 1. Cek dari daftar kota-kota operasional umum
  for (const c of KNOWN_INDONESIAN_CITIES) {
    const reg = new RegExp(`\\b${c}\\b`, 'i');
    if (reg.test(combined)) {
      return c;
    }
  }

  // 2. Cek pola 'Kota X' atau 'Kab. X' atau 'Kabupaten X'
  const m = combined.match(/(?:kota|kabupaten|kab\.?)\s+([a-z]+)/i);
  if (m && m[1]) {
    const candidate = m[1].trim();
    if (!['raya', 'barat', 'timur', 'selatan', 'utara', 'pusat'].includes(candidate)) {
      return candidate;
    }
  }

  return null;
}

/**
 * Memeriksa apakah dua entitas toko berada di wilayah kota yang sama.
 * Mengembalikan true jika keduanya memiliki nama kota yang sama persis.
 * Jika salah satu atau keduanya tidak dapat diidentifikasi kotanya, mengembalikan false.
 */
export function areCitiesMatching(
  recordA: {
    name?: string | null;
    address?: string | null;
    shippingAddress?: string | null;
    billingAddress?: string | null;
  },
  recordB: {
    name?: string | null;
    address?: string | null;
    shippingAddress?: string | null;
    billingAddress?: string | null;
  }
): boolean {
  const cityA = extractCityFromRecord(recordA);
  const cityB = extractCityFromRecord(recordB);

  if (cityA && cityB) {
    return cityA === cityB;
  }

  return false;
}
