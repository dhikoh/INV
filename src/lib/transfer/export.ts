import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { Prisma } from '@prisma/client';
import { zipSync, strToU8, Zippable } from 'fflate';
import { prisma } from '../db';
import { env } from '../env';
import { DomainError } from '../domain/money';
import { TABLES, buildWhere } from './registry';
import { toJsonLine } from './serialize';

export interface Manifest {
  format: 'omnicat-export';
  formatVersion: 1;
  appVersion: string;
  lastMigration: string;
  exportedAt: string;
  exportedBy: string;
  scope: 'system' | 'business';
  businessIds: string[];
  businessCodes: string[];
  options: {
    includeUploads: boolean;
  };
  tables: Record<string, { file: string; rows: number; sha256: string }>;
  uploads: {
    fileCount: number;
    totalBytes: number;
    files: Array<{ path: string; sha256: string }>;
    missing: string[];
  };
  containsSecrets: true;
}

export interface ExportDataOptions {
  scope: 'system' | 'business';
  businessId?: string;
  actorName: string;
  includeUploads?: boolean;
}

export interface ExportDataResult {
  filename: string;
  data: Uint8Array;
  manifest: Manifest;
}

function formatTimestamp(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const yyyy = d.getFullYear();
  const mm = pad(d.getMonth() + 1);
  const dd = pad(d.getDate());
  const hh = pad(d.getHours());
  const mi = pad(d.getMinutes());
  const ss = pad(d.getSeconds());
  return `${yyyy}${mm}${dd}-${hh}${mi}${ss}`;
}

function sanitizeCode(code: string): string {
  return code.replace(/[^A-Za-z0-9_-]/g, '_');
}

function getAppVersion(): string {
  try {
    const pkgPath = path.resolve(process.cwd(), 'package.json');
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      return pkg.version || '1.0.0';
    }
  } catch {
    // fallback
  }
  return '1.0.0';
}

function getAllFilesRecursively(dir: string): string[] {
  let results: string[] = [];
  if (!fs.existsSync(dir)) return results;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isSymbolicLink()) continue; // Abaikan symlink
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results = results.concat(getAllFilesRecursively(fullPath));
    } else if (entry.isFile()) {
      results.push(fullPath);
    }
  }
  return results;
}

/**
 * Ekspor data OmniCat ke dalam format berkas portabel ZIP (ADR 0008).
 * Menjalankan pembacaan seluruh tabel dalam satu transaksi snapshot RepeatableRead.
 */
export async function exportData(opts: ExportDataOptions): Promise<ExportDataResult> {
  const { scope, businessId, actorName, includeUploads = true } = opts;

  let targetBusinessCode = 'all';
  let businessIds: string[] = [];
  let businessCodes: string[] = [];

  // 1. Validasi keberadaan usaha pada mode business
  if (scope === 'business') {
    if (!businessId) {
      throw new DomainError('BAD_REQUEST', 'businessId wajib diisi untuk ekspor mode business', 400);
    }
    const biz = await prisma.business.findFirst({
      where: { id: businessId },
    });
    if (!biz) {
      throw new DomainError('NOT_FOUND', 'Usaha tidak ditemukan', 404);
    }
    targetBusinessCode = biz.code;
    businessIds = [biz.id];
    businessCodes = [biz.code];
  }

  const appVersion = getAppVersion();
  const exportedAt = new Date().toISOString();

  // Koleksi file dalam zip
  const zipFiles: Zippable = {};
  const manifestTables: Manifest['tables'] = {};

  // Database paths untuk cek berkas upload yang hilang
  const recordedUploadPaths = new Set<string>();

  // 2. Transaksi snapshot RepeatableRead
  const txResult = await prisma.$transaction(
    async (tx) => {
      // Ambil last migration
      let lastMigration = '';
      try {
        const migrationRows = await tx.$queryRaw<Array<{ migration_name: string }>>`
          SELECT migration_name
          FROM "_prisma_migrations"
          WHERE finished_at IS NOT NULL
          ORDER BY migration_name DESC
          LIMIT 1
        `;
        if (migrationRows && migrationRows.length > 0) {
          lastMigration = migrationRows[0].migration_name;
        }
      } catch {
        lastMigration = '20261110000003_catalog_same_business_guard';
      }

      // Pada mode sistem, kumpulkan semua businessIds & businessCodes
      if (scope === 'system') {
        const allBiz = await tx.business.findMany({
          orderBy: { code: 'asc' },
        });
        businessIds = allBiz.map((b) => b.id);
        businessCodes = allBiz.map((b) => b.code);
      }

      // Loop semua tabel sesuai registry
      for (const spec of TABLES) {
        if (scope === 'business' && spec.scope === 'system-only') {
          continue; // Lewati tabel system-only pada mode business
        }

        const where = buildWhere(spec, scope, businessId);
        const delegate = (tx as unknown as Record<string, {
          findMany: (args: Record<string, unknown>) => Promise<Record<string, unknown>[]>;
        }>)[spec.delegate];

        if (!delegate || typeof delegate.findMany !== 'function') {
          throw new Error(`Delegate Prisma tidak ditemukan untuk model: ${spec.model}`);
        }

        // Paging kursor id
        const rows: Record<string, unknown>[] = [];
        const pageSize = 1000;
        let lastId: string | null = null;

        while (true) {
          const findArgs: Record<string, unknown> = {
            take: pageSize,
            orderBy: { id: 'asc' },
          };
          if (where) {
            findArgs.where = where;
          }
          if (lastId) {
            findArgs.cursor = { id: lastId };
            findArgs.skip = 1;
          }

          const batch = await delegate.findMany(findArgs);
          if (batch.length === 0) break;

          for (const row of batch) {
            rows.push(row);

            // Kumpulkan path upload yang tercatat di database untuk validasi berkas
            if (spec.model === 'Business' && typeof row.logoPath === 'string' && row.logoPath) {
              recordedUploadPaths.add(row.logoPath);
            } else if (spec.model === 'ProductImage' && typeof row.path === 'string' && row.path) {
              recordedUploadPaths.add(row.path);
            } else if (spec.model === 'Payment' && typeof row.proofPath === 'string' && row.proofPath) {
              recordedUploadPaths.add(row.proofPath);
            } else if (spec.model === 'VendorPayment' && typeof row.proofPath === 'string' && row.proofPath) {
              recordedUploadPaths.add(row.proofPath);
            } else if (spec.model === 'User' && typeof row.ktpPath === 'string' && row.ktpPath) {
              recordedUploadPaths.add(row.ktpPath);
            }
          }

          lastId = (batch[batch.length - 1].id as string) || null;
          if (batch.length < pageSize || !lastId) break;
        }

        // Serialisasi baris ndjson
        const ndjsonLines = rows.map((r) => toJsonLine(r));
        const ndjsonContent = ndjsonLines.join('\n');
        const ndjsonBytes = strToU8(ndjsonContent);
        const sha256 = crypto.createHash('sha256').update(ndjsonContent).digest('hex');

        const fileName = `${spec.model}.ndjson`;
        zipFiles[`data/${fileName}`] = ndjsonBytes;

        manifestTables[spec.model] = {
          file: `data/${fileName}`,
          rows: rows.length,
          sha256,
        };
      }

      return { lastMigration };
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
      timeout: 5 * 60 * 1000,
      maxWait: 30 * 1000,
    }
  );

  // 3. Kumpulkan berkas uploads bila includeUploads aktif
  const uploadFilesMeta: Array<{ path: string; sha256: string }> = [];
  const missingFiles: string[] = [];
  let totalUploadBytes = 0;
  const discoveredRelativePaths = new Set<string>();

  if (includeUploads) {
    const baseUploadDir = env.UPLOAD_DIR;

    for (const bId of businessIds) {
      const bizUploadDir = path.resolve(baseUploadDir, bId);
      if (!fs.existsSync(bizUploadDir)) continue;

      const physicalFiles = getAllFilesRecursively(bizUploadDir);
      for (const absFile of physicalFiles) {
        const relToUpload = path.relative(baseUploadDir, absFile).replace(/\\/g, '/');
        const fileBytes = fs.readFileSync(absFile);
        const fileHash = crypto.createHash('sha256').update(fileBytes).digest('hex');

        totalUploadBytes += fileBytes.length;
        uploadFilesMeta.push({
          path: `uploads/${relToUpload}`,
          sha256: fileHash,
        });
        discoveredRelativePaths.add(relToUpload);

        // Berkas upload dikompres level 0 (tanpa kompresi tambahan)
        zipFiles[`uploads/${relToUpload}`] = [fileBytes, { level: 0 }];
      }
    }

    // 4. Verifikasi berkas fisik database vs disk (warning ke missing)
    for (const recPath of recordedUploadPaths) {
      const normalized = recPath.replace(/\\/g, '/');
      if (!discoveredRelativePaths.has(normalized)) {
        missingFiles.push(normalized);
      }
    }
  }

  // 5. Susun Manifest
  const manifest: Manifest = {
    format: 'omnicat-export',
    formatVersion: 1,
    appVersion,
    lastMigration: txResult.lastMigration,
    exportedAt,
    exportedBy: actorName,
    scope,
    businessIds,
    businessCodes,
    options: {
      includeUploads,
    },
    tables: manifestTables,
    uploads: {
      fileCount: uploadFilesMeta.length,
      totalBytes: totalUploadBytes,
      files: uploadFilesMeta,
      missing: missingFiles,
    },
    containsSecrets: true,
  };

  const manifestStr = JSON.stringify(manifest, null, 2);
  zipFiles['manifest.json'] = strToU8(manifestStr);

  // Bangun ZIP dengan level kompresi 6 untuk teks/manifest
  const zipBuffer = zipSync(zipFiles, { level: 6 });

  // 6. Validasi batas ukuran TRANSFER_MAX_MB
  const maxBytes = env.TRANSFER_MAX_MB * 1024 * 1024;
  if (zipBuffer.length > maxBytes) {
    throw new DomainError(
      'VALIDATION_ERROR',
      `Ukuran data ekspor (${(zipBuffer.length / (1024 * 1024)).toFixed(1)} MB) melebihi batas maksimal ${env.TRANSFER_MAX_MB} MB. Gunakan skrip backup.sh atau ekspor tanpa berkas upload (?tanpaBerkas=1).`,
      422
    );
  }

  // 7. Nama berkas unduhan
  const now = new Date();
  const timestamp = formatTimestamp(now);
  const codePart = scope === 'business' ? sanitizeCode(targetBusinessCode) : 'all';
  const filename = `omnicat-export-${scope}-${codePart}-${timestamp}.zip`;

  return {
    filename,
    data: zipBuffer,
    manifest,
  };
}
