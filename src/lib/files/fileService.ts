import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import sharp from 'sharp';
import { NextRequest, NextResponse } from 'next/server';
import { env } from '../env';
import { DomainError } from '../domain/money';
import { requireContext } from '../auth/context';
import { prisma } from '../db';

export type FileKind = 'product' | 'logo' | 'proof' | 'vendor-proof';

export type DetectedMime =
  | 'image/jpeg'
  | 'image/png'
  | 'image/webp'
  | 'application/pdf';

// Pemeriksaan magic bytes: jenis ditentukan dari byte awal berkas, bukan dari ekstensi/header klien
export function detectMimeFromBytes(buffer: Buffer): DetectedMime {
  if (buffer.length < 4) {
    throw new DomainError(
      'VALIDATION_ERROR',
      'Ukuran berkas terlalu kecil atau rusak',
      422
    );
  }

  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }

  // PNG: 89 50 4E 47
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    return 'image/png';
  }

  // WebP: RIFF....WEBP (52 49 46 46 .... 57 45 42 50)
  if (
    buffer.length >= 12 &&
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    return 'image/webp';
  }

  // PDF: %PDF (25 50 44 46)
  if (
    buffer[0] === 0x25 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x44 &&
    buffer[3] === 0x46
  ) {
    return 'application/pdf';
  }

  throw new DomainError(
    'VALIDATION_ERROR',
    'Jenis berkas tidak diizinkan. Hanya format JPEG, PNG, WebP, dan PDF yang didukung.',
    422
  );
}

export interface SaveFileOptions {
  businessId: string;
  kind: FileKind;
  buffer: Buffer;
}

export interface SavedFileResult {
  relativePath: string;
  contentType: string;
  size: number;
}

export async function saveFile({
  businessId,
  kind,
  buffer,
}: SaveFileOptions): Promise<SavedFileResult> {
  // 1. Batas ukuran MAX_UPLOAD_MB
  const maxBytes = env.MAX_UPLOAD_MB * 1024 * 1024;
  if (buffer.length > maxBytes) {
    throw new DomainError(
      'VALIDATION_ERROR',
      `Ukuran berkas melebihi batas maksimal ${env.MAX_UPLOAD_MB} MB`,
      422
    );
  }

  // 2. Deteksi tipe berdasarkan byte awal berkas
  const mime = detectMimeFromBytes(buffer);

  // 3. Validasi kategori berkas
  if (kind === 'logo' || kind === 'product') {
    if (mime === 'application/pdf') {
      throw new DomainError(
        'VALIDATION_ERROR',
        'Logo dan foto produk hanya boleh berupa gambar (JPEG, PNG, WebP)',
        422
      );
    }
  }

  let finalBuffer: Buffer;
  let ext: string;
  let contentType: string;

  if (mime === 'application/pdf') {
    // PDF disimpan apa adanya
    finalBuffer = buffer;
    ext = 'pdf';
    contentType = 'application/pdf';
  } else {
    // Gambar diproses dengan sharp: hapus metadata EXIF, putar sesuai orientasi, max sisi 1600px, WebP kualitas 82
    finalBuffer = await sharp(buffer)
      .rotate()
      .resize({
        width: 1600,
        height: 1600,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality: 82 })
      .toBuffer();

    ext = 'webp';
    contentType = 'image/webp';
  }

  // 4. Nama berkas selalu UUID acak untuk mencegah path traversal
  const filename = `${crypto.randomUUID()}.${ext}`;
  const relativePath = `${businessId}/${kind}/${filename}`;

  const baseUploadDir = path.resolve(env.UPLOAD_DIR);
  const targetDir = path.resolve(baseUploadDir, businessId, kind);
  const fullPath = path.resolve(targetDir, filename);

  // Pengaman path traversal
  if (!fullPath.startsWith(baseUploadDir + path.sep)) {
    throw new DomainError('NOT_FOUND', 'Jalur penyimpanan tidak valid', 404);
  }

  await fs.promises.mkdir(targetDir, { recursive: true });
  await fs.promises.writeFile(fullPath, finalBuffer);

  return {
    relativePath,
    contentType,
    size: finalBuffer.length,
  };
}

export async function serveFile(
  req: NextRequest,
  params: { businessId: string; kind: string; filename: string }
): Promise<NextResponse> {
  const ctx = await requireContext(req);

  const { businessId, kind, filename } = params;

  // Wajib login. Sales hanya boleh jika businessId di jalur sama dengan usahanya
  if (ctx.role === 'SALES' && ctx.user.businessId !== businessId) {
    throw new DomainError('NOT_FOUND', 'Berkas tidak ditemukan', 404);
  }

  const relativePath = `${businessId}/${kind}/${filename}`;

  // Jenis proof: Sales hanya boleh jika bukti bayar milik order sales tersebut
  if (ctx.role === 'SALES' && kind === 'proof') {
    const payment = await prisma.payment.findFirst({
      where: {
        businessId,
        proofPath: relativePath,
      },
    });

    if (!payment) {
      throw new DomainError('NOT_FOUND', 'Berkas tidak ditemukan', 404);
    }

    const order = await prisma.order.findFirst({
      where: {
        id: payment.orderId,
        businessId,
        salesId: ctx.user.id,
      },
    });

    if (!order) {
      throw new DomainError('NOT_FOUND', 'Berkas tidak ditemukan', 404);
    }
  }

  const baseUploadDir = path.resolve(env.UPLOAD_DIR);
  const fullPath = path.resolve(baseUploadDir, businessId, kind, filename);

  // Selesaikan jalur dengan path.resolve, pastikan diawali UPLOAD_DIR + path.sep (cegah path traversal)
  if (!fullPath.startsWith(baseUploadDir + path.sep)) {
    throw new DomainError('NOT_FOUND', 'Berkas tidak ditemukan', 404);
  }

  if (!fs.existsSync(fullPath)) {
    throw new DomainError('NOT_FOUND', 'Berkas tidak ditemukan', 404);
  }

  const ext = path.extname(fullPath).toLowerCase();
  let contentType = 'application/octet-stream';
  if (ext === '.webp') contentType = 'image/webp';
  else if (ext === '.pdf') contentType = 'application/pdf';
  else if (ext === '.jpg' || ext === '.jpeg') contentType = 'image/jpeg';
  else if (ext === '.png') contentType = 'image/png';

  const cacheControl =
    kind === 'proof' || kind === 'vendor-proof'
      ? 'no-store'
      : 'private, max-age=3600';

  const fileBuffer = await fs.promises.readFile(fullPath);

  return new NextResponse(fileBuffer, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': cacheControl,
    },
  });
}
