import fs from 'fs';
import path from 'path';
import { env } from '../env';

/**
 * Membaca berkas logo dari disk lokal dan mengubahnya menjadi Data URI Base64.
 * Menggunakan pengaman path traversal agar aman dari arbitrary file read.
 */
export function getLogoDataUri(logoPath: string | null | undefined): string | null {
  if (!logoPath) return null;

  try {
    const baseUploadDir = path.resolve(env.UPLOAD_DIR);
    const fullPath = path.resolve(baseUploadDir, logoPath);

    // Pengaman Path Traversal
    if (!fullPath.startsWith(baseUploadDir + path.sep)) {
      return null;
    }

    if (!fs.existsSync(fullPath)) {
      return null;
    }

    const buffer = fs.readFileSync(fullPath);
    const ext = path.extname(fullPath).toLowerCase().replace('.', '');
    const mime =
      ext === 'png'
        ? 'image/png'
        : ext === 'jpg' || ext === 'jpeg'
          ? 'image/jpeg'
          : ext === 'svg'
            ? 'image/svg+xml'
            : 'image/webp';

    return `data:${mime};base64,${buffer.toString('base64')}`;
  } catch {
    return null;
  }
}
