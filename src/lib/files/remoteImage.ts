import https from 'node:https';
import dns from 'node:dns';
import net from 'node:net';
import { URL } from 'node:url';
import { DomainError } from '../domain/money';
import { detectMimeFromBytes } from './fileService';

const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB
const TIMEOUT_MS = 10_000; // 10 detik
const MAX_REDIRECTS = 3;

/**
 * Memeriksa apakah alamat IP merupakan IP privat, loopback, link-local,
 * CGNAT, multicast, atau rentang terlarang lainnya (SSRF Guard).
 * Fungsi murni agar mudah diuji secara independen.
 */
export function isForbiddenIp(ip: string): boolean {
  if (!ip) return true;

  // 1. IPv4
  if (net.isIPv4(ip)) {
    const parts = ip.split('.').map(Number);
    if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) {
      return true;
    }
    const [b0, b1] = parts;

    // 0.0.0.0/8 (Current network / "this" host)
    if (b0 === 0) return true;

    // 10.0.0.0/8 (Private-Use)
    if (b0 === 10) return true;

    // 127.0.0.0/8 (Loopback)
    if (b0 === 127) return true;

    // 169.254.0.0/16 (Link-Local & Cloud Metadata seperti AWS/GCP 169.254.169.254)
    if (b0 === 169 && b1 === 254) return true;

    // 172.16.0.0/12 (Private-Use: 172.16.0.0 - 172.31.255.255)
    if (b0 === 172 && b1 >= 16 && b1 <= 31) return true;

    // 192.168.0.0/16 (Private-Use)
    if (b0 === 192 && b1 === 168) return true;

    // 100.64.0.0/10 (Shared Address Space / CGNAT: 100.64.0.0 - 100.127.255.255)
    if (b0 === 100 && b1 >= 64 && b1 <= 127) return true;

    // 224.0.0.0/4 (Multicast) & 240.0.0.0/4 (Reserved / Broadcast)
    if (b0 >= 224) return true;

    return false;
  }

  // 2. IPv6
  if (net.isIPv6(ip)) {
    const lower = ip.toLowerCase();

    // Loopback ::1 dan Unspecified ::
    if (lower === '::1' || lower === '::') return true;

    // IPv4-mapped IPv6: ::ffff:192.168.1.1 atau ::ffff:7f00:1
    if (lower.startsWith('::ffff:')) {
      const remainder = lower.slice(7);
      if (net.isIPv4(remainder)) {
        return isForbiddenIp(remainder);
      }
      // Bentuk heksadesimal 2 kata (mis. 7f00:1 atau c0a8:0101)
      const hexParts = remainder.split(':');
      if (hexParts.length === 2) {
        const n1 = parseInt(hexParts[0], 16);
        const n2 = parseInt(hexParts[1], 16);
        if (!isNaN(n1) && !isNaN(n2)) {
          const b0 = (n1 >> 8) & 0xff;
          const b1 = n1 & 0xff;
          const b2 = (n2 >> 8) & 0xff;
          const b3 = n2 & 0xff;
          return isForbiddenIp(`${b0}.${b1}.${b2}.${b3}`);
        }
      }
      return true;
    }

    // IPv4-compatible IPv6: ::192.168.1.1
    if (lower.startsWith('::') && lower.includes('.')) {
      const v4Part = lower.slice(2);
      if (net.isIPv4(v4Part)) {
        return isForbiddenIp(v4Part);
      }
      return true;
    }

    // 6to4 encapsulation (2002::/16)
    if (lower.startsWith('2002:')) {
      const parts = lower.split(':');
      if (parts.length >= 3) {
        const n1 = parseInt(parts[1], 16);
        const n2 = parseInt(parts[2], 16);
        if (!isNaN(n1) && !isNaN(n2)) {
          const b0 = (n1 >> 8) & 0xff;
          const b1 = n1 & 0xff;
          const b2 = (n2 >> 8) & 0xff;
          const b3 = n2 & 0xff;
          return isForbiddenIp(`${b0}.${b1}.${b2}.${b3}`);
        }
      }
    }

    // Unique Local Addresses (ULA): fc00::/7 (fc.. atau fd..)
    if (lower.startsWith('fc') || lower.startsWith('fd')) return true;

    // Link-Local Unicast: fe80::/10 (fe8, fe9, fea, feb)
    if (/^fe[89ab]/i.test(lower)) return true;

    // Site-Local Unicast: fec0::/10 (fec, fed, fee, fef)
    if (/^fe[cdef]/i.test(lower)) return true;

    // Multicast: ff00::/8
    if (lower.startsWith('ff')) return true;

    // Documentation range: 2001:db8::/32
    if (lower.startsWith('2001:db8:') || lower.startsWith('2001:0db8:')) return true;

    return false;
  }

  return true;
}

/**
 * Validasi awal URL sebelum membuat koneksi:
 * - Wajib protokol https:
 * - Dilarang membawa kredensial (user:pass@)
 * - Port harus 443 atau kosong (standar https)
 */
function validateTargetUrl(rawUrl: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new DomainError('VALIDATION_ERROR', 'URL gambar tidak valid', 422);
  }

  if (parsed.protocol !== 'https:') {
    throw new DomainError(
      'VALIDATION_ERROR',
      'Hanya URL dengan protokol HTTPS aman yang diizinkan',
      422
    );
  }

  if (parsed.username || parsed.password) {
    throw new DomainError(
      'VALIDATION_ERROR',
      'URL tidak boleh memuat kredensial (username/password)',
      422
    );
  }

  // Jika port ditentukan eksplisit dan bukan 443, tolak
  if (parsed.port && parsed.port !== '443') {
    throw new DomainError(
      'VALIDATION_ERROR',
      'Port selain 443 (standar HTTPS) tidak diizinkan',
      422
    );
  }

  return parsed;
}

export interface FetchRemoteImageResult {
  bytes: Uint8Array;
  mime: 'image/jpeg' | 'image/png' | 'image/webp';
}

/**
 * Mengunduh gambar dari URL eksternal dengan mitigasi komprehensif terhadap SSRF:
 * 1. Pencegahan DNS Rebinding via lookup kustom pada socket TLS.
 * 2. Pemblokiran IP privat, loopback, CGNAT, dan metadata cloud.
 * 3. Pembatasan ukuran 5 MB saat streaming dan timeout 10 detik.
 * 4. Pengecekan magic bytes (hanya gambar JPEG, PNG, WebP).
 */
export async function fetchRemoteImage(
  targetUrl: string,
  redirectCount = 0
): Promise<FetchRemoteImageResult> {
  if (redirectCount > MAX_REDIRECTS) {
    throw new DomainError(
      'VALIDATION_ERROR',
      'Maksimal pengalihan (redirect) terlampaui (maksimal 3 kali)',
      422
    );
  }

  const parsedUrl = validateTargetUrl(targetUrl);

  return new Promise((resolve, reject) => {
    let settled = false;
    const safeResolve = (res: FetchRemoteImageResult) => {
      if (settled) return;
      settled = true;
      resolve(res);
    };
    const safeReject = (err: unknown) => {
      if (settled) return;
      settled = true;
      reject(err);
    };

    // Custom DNS lookup untuk mencegah DNS rebinding saat pembentukan koneksi TLS
    const customLookup = (
      hostname: string,
      _opts: dns.LookupOptions,
      callback: (err: NodeJS.ErrnoException | null, address: string, family: number) => void
    ) => {
      dns.lookup(hostname, { all: false }, (err, address, family) => {
        if (err) return callback(err, address, family);
        if (isForbiddenIp(address)) {
          const forbiddenErr = new Error('FORBIDDEN_IP_DESTINATION');
          return callback(forbiddenErr, address, family);
        }
        return callback(null, address, family);
      });
    };

    const req = https.request(
      parsedUrl,
      {
        method: 'GET',
        lookup: customLookup,
        timeout: TIMEOUT_MS,
        headers: {
          'User-Agent': 'OmniCat-MediaFetcher/1.0',
          Accept: 'image/webp,image/png,image/jpeg,*/*',
        },
      },
      (res) => {
        // Tangani redirect (HTTP 301, 302, 307, 308)
        if (
          res.statusCode &&
          [301, 302, 303, 307, 308].includes(res.statusCode) &&
          res.headers.location
        ) {
          req.destroy();
          const redirectTarget = new URL(res.headers.location, parsedUrl).toString();
          return fetchRemoteImage(redirectTarget, redirectCount + 1)
            .then(safeResolve)
            .catch(safeReject);
        }

        if (res.statusCode !== 200) {
          req.destroy();
          return safeReject(
            new DomainError(
              'VALIDATION_ERROR',
              `Server asal mengembalikan status HTTP ${res.statusCode}`,
              422
            )
          );
        }

        const chunks: Buffer[] = [];
        let receivedBytes = 0;

        res.on('data', (chunk: Buffer) => {
          receivedBytes += chunk.length;
          if (receivedBytes > MAX_IMAGE_BYTES) {
            req.destroy(new Error('FILE_TOO_LARGE'));
          } else {
            chunks.push(chunk);
          }
        });

        res.on('end', () => {
          const buffer = Buffer.concat(chunks);

          // Validasi magic bytes
          try {
            const detectedMime = detectMimeFromBytes(buffer);
            if (detectedMime === 'application/pdf') {
              return safeReject(
                new DomainError(
                  'VALIDATION_ERROR',
                  'Format PDF tidak diizinkan untuk gambar produk atau logo',
                  422
                )
              );
            }

            safeResolve({
              bytes: new Uint8Array(buffer),
              mime: detectedMime as 'image/jpeg' | 'image/png' | 'image/webp',
            });
          } catch (err: unknown) {
            safeReject(err);
          }
        });
      }
    );

    req.on('timeout', () => {
      req.destroy(new Error('REQUEST_TIMEOUT'));
    });

    req.on('error', (err: Error) => {
      if (err.message === 'FILE_TOO_LARGE') {
        return safeReject(
          new DomainError(
            'VALIDATION_ERROR',
            'Ukuran berkas gambar melebihi batas maksimal 5 MB',
            422
          )
        );
      }
      if (err.message === 'REQUEST_TIMEOUT') {
        return safeReject(
          new DomainError(
            'VALIDATION_ERROR',
            'Waktu pengambilan gambar habis (timeout 10 detik)',
            422
          )
        );
      }
      if (err.message === 'FORBIDDEN_IP_DESTINATION') {
        return safeReject(
          new DomainError(
            'FORBIDDEN',
            'Alamat tujuan berada pada jaringan privat/terlarang dan tidak dapat diakses',
            403
          )
        );
      }

      safeReject(
        new DomainError(
          'VALIDATION_ERROR',
          'Gagal mengambil gambar dari URL eksternal: koneksi terputus atau host tidak dapat dihubungi',
          422
        )
      );
    });

    req.end();
  });
}
