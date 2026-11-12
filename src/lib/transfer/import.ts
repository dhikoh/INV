import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { z } from 'zod';
import { Prisma, Role, PaymentType, PaymentStatus } from '@prisma/client';
import { unzipSync, strFromU8 } from 'fflate';
import { prisma } from '../db';
import { env } from '../env';
import { TABLES, getSchemaMetadata } from './registry';
import { fromJsonLine } from './serialize';
import { detectMimeFromBytes } from '../files/fileService';
import { CounterScope } from '../services/counter';

export interface ImportOptions {
  dryRun: boolean;
  replaceSeedSuperadmin: boolean;
  actor: { id: string; role: Role } | null;
  uploadDir: string;
  overwrite?: boolean;
}

export interface ImportReport {
  ok: boolean;
  dryRun: boolean;
  scope: 'system' | 'business';
  manifest?: { appVersion: string; exportedAt: string; businessCodes: string[] };
  counts: Record<string, number>;
  uploads: { files: number; written: number; skipped: number; failed: string[] };
  warnings: string[];
  errors: string[];
}

class DryRunRollbackSentinel extends Error {
  constructor() {
    super('__DRY_RUN_ROLLBACK__');
  }
}

const manifestSchema = z.object({
  format: z.literal('omnicat-export'),
  formatVersion: z.literal(1),
  appVersion: z.string(),
  lastMigration: z.string(),
  exportedAt: z.string(),
  exportedBy: z.string(),
  scope: z.enum(['system', 'business']),
  businessIds: z.array(z.string()),
  businessCodes: z.array(z.string()),
  options: z.object({
    includeUploads: z.boolean(),
  }),
  tables: z.record(
    z.object({
      file: z.string(),
      rows: z.number().int().nonnegative(),
      sha256: z.string(),
    })
  ),
  uploads: z.object({
    fileCount: z.number().int().nonnegative(),
    totalBytes: z.number().int().nonnegative(),
    files: z.array(
      z.object({
        path: z.string(),
        sha256: z.string(),
      })
    ),
    missing: z.array(z.string()),
  }),
  containsSecrets: z.literal(true),
});

export type Manifest = z.infer<typeof manifestSchema>;

const ALLOWED_UPLOAD_KINDS = new Set(['product', 'logo', 'proof', 'vendor-proof', 'user-ktp']);
const UPLOAD_PATH_REGEX = /^uploads\/([A-Za-z0-9_-]+)\/([a-z-]+)\/([A-Za-z0-9_-]+\.(webp|pdf|png|jpg|jpeg))$/;

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

const modelScalarFields: Record<string, Set<string>> = {};
for (const model of Prisma.dmmf.datamodel.models) {
  modelScalarFields[model.name] = new Set(
    model.fields.filter((f) => f.kind === 'scalar' || f.kind === 'enum').map((f) => f.name)
  );
}

function sanitizeRowForInsert(
  rawRow: Record<string, unknown>,
  jsonCols: Set<string>,
  nullableWithDefaultCols: Set<string>,
  validFields?: Set<string>
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(rawRow)) {
    // Saring dan buang field yang tidak terdaftar di skema database (contoh: rev pada Business)
    if (validFields && !validFields.has(key)) {
      continue;
    }

    if (value === null) {
      if (nullableWithDefaultCols.has(key)) {
        if (jsonCols.has(key)) {
          result[key] = Prisma.DbNull;
        } else {
          result[key] = null;
        }
      }
      // Bila null dan tidak memiliki @default, kunci dihapus agar Postgres menyetel NULL
    } else {
      result[key] = value;
    }
  }

  return result;
}

/**
 * Validasi dan ekstraksi ZIP yang aman terhadap Zip-Bomb dan Zip-Slip.
 */
function safeUnpackZip(
  zip: Uint8Array,
  maxMb: number,
  errors: string[]
): {
  entries: Record<string, Uint8Array>;
  manifest: Manifest;
} | null {
  const maxBytes = maxMb * 1024 * 1024;
  if (zip.length > maxBytes) {
    errors.push(
      `Ukuran berkas ZIP (${(zip.length / (1024 * 1024)).toFixed(1)} MB) melebihi batas maksimal ${maxMb} MB.`
    );
    return null;
  }

  let totalOriginalSize = 0;
  const maxExtractBytes = maxMb * 5 * 1024 * 1024;

  let rawFiles: Record<string, Uint8Array>;
  try {
    rawFiles = unzipSync(zip, {
      filter: (file) => {
        totalOriginalSize += file.originalSize;
        if (totalOriginalSize > maxExtractBytes) {
          throw new Error('ZIP_BOMB_DETECTED');
        }
        return true;
      },
    });
  } catch (err: unknown) {
    if (err instanceof Error && err.message === 'ZIP_BOMB_DETECTED') {
      errors.push(
        `Berkas ZIP ditolak: ukuran setelah diekstrak melebihi batas rasio kompresi aman (${maxMb * 5} MB).`
      );
    } else {
      errors.push(`Gagal mengekstrak berkas ZIP: berkas rusak atau format tidak didukung.`);
    }
    return null;
  }

  // 1. Validasi nama berkas (Zip-Slip & format entri)
  const registeredModels = new Set(TABLES.map((t) => t.model));

  for (const entryName of Object.keys(rawFiles)) {
    if (entryName.includes('..') || entryName.includes('\\') || entryName.startsWith('/')) {
      errors.push(`Entri berbahaya terdeteksi dalam berkas ZIP (zip-slip): ${entryName}`);
      return null;
    }

    if (entryName === 'manifest.json') continue;

    if (entryName.startsWith('data/')) {
      const match = entryName.match(/^data\/(\w+)\.ndjson$/);
      if (!match || !registeredModels.has(match[1])) {
        errors.push(`Entri data tidak dikenal atau tidak terdaftar di sistem: ${entryName}`);
        return null;
      }
      continue;
    }

    if (entryName.startsWith('uploads/')) {
      const match = entryName.match(UPLOAD_PATH_REGEX);
      if (!match) {
        errors.push(`Format path berkas upload tidak valid: ${entryName}`);
        return null;
      }
      const [, , kind] = match;
      if (!ALLOWED_UPLOAD_KINDS.has(kind)) {
        errors.push(`Jenis folder upload '${kind}' tidak diizinkan: ${entryName}`);
        return null;
      }
      continue;
    }

    errors.push(`Entri asing tidak diizinkan di dalam berkas ZIP: ${entryName}`);
    return null;
  }

  // 2. Baca dan validasi manifest.json
  const manifestBytes = rawFiles['manifest.json'];
  if (!manifestBytes) {
    errors.push(`Berkas manifest.json tidak ditemukan di dalam ZIP.`);
    return null;
  }

  let manifest: Manifest;
  try {
    const json = JSON.parse(strFromU8(manifestBytes));
    manifest = manifestSchema.parse(json);
  } catch {
    errors.push(`Format manifest.json tidak valid atau korup.`);
    return null;
  }

  // Validasi businessId pada entri upload harus terdaftar di manifest
  const validBizIds = new Set(manifest.businessIds);
  for (const entryName of Object.keys(rawFiles)) {
    if (entryName.startsWith('uploads/')) {
      const match = entryName.match(UPLOAD_PATH_REGEX);
      if (match && !validBizIds.has(match[1])) {
        errors.push(
          `Unit usaha '${match[1]}' pada path '${entryName}' tidak terdaftar di manifest.businessIds.`
        );
        return null;
      }
    }
  }

  return { entries: rawFiles, manifest };
}

/**
 * Memulihkan hanya berkas upload fisik tanpa menyentuh database.
 */
export async function restoreUploadsOnly(
  zip: Uint8Array,
  uploadDir: string
): Promise<ImportReport> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const report: ImportReport = {
    ok: false,
    dryRun: false,
    scope: 'system',
    counts: {},
    uploads: { files: 0, written: 0, skipped: 0, failed: [] },
    warnings,
    errors,
  };

  const unpacked = safeUnpackZip(zip, env.TRANSFER_MAX_MB, errors);
  if (!unpacked) {
    return report;
  }

  const { entries, manifest } = unpacked;
  report.scope = manifest.scope;
  report.manifest = {
    appVersion: manifest.appVersion,
    exportedAt: manifest.exportedAt,
    businessCodes: manifest.businessCodes,
  };

  const uploadEntries = Object.keys(entries).filter((k) => k.startsWith('uploads/'));
  report.uploads.files = uploadEntries.length;

  for (const entryPath of uploadEntries) {
    const bytes = entries[entryPath];
    const relSubPath = entryPath.replace(/^uploads\//, '');
    const destPath = path.resolve(uploadDir, relSubPath);

    // Proteksi zip-slip pada filesystem
    if (!destPath.startsWith(path.resolve(uploadDir) + path.sep)) {
      errors.push(`Jalur berkas melanggar batas direktori uploads: ${entryPath}`);
      return report;
    }

    if (fs.existsSync(destPath)) {
      report.uploads.skipped++;
      warnings.push(`Berkas '${entryPath}' sudah ada di server tujuan, dilewati.`);
      continue;
    }

    try {
      fs.mkdirSync(path.dirname(destPath), { recursive: true });
      fs.writeFileSync(destPath, bytes);
      report.uploads.written++;
    } catch {
      report.uploads.failed.push(entryPath);
    }
  }

  report.ok = errors.length === 0;
  return report;
}

/**
 * Layanan Impor Data Utama OmniCat (ADR 0008).
 * Mendukung simulasi dry-run penuh, validasi integritas sha256, dan staging uploads.
 */
export async function importData(
  zip: Uint8Array,
  opts: ImportOptions
): Promise<ImportReport> {
  const { dryRun, replaceSeedSuperadmin, actor, uploadDir, overwrite = false } = opts;
  const errors: string[] = [];
  const warnings: string[] = [];
  const counts: Record<string, number> = {};
  const businessesToOverwrite: string[] = [];

  const report: ImportReport = {
    ok: false,
    dryRun,
    scope: 'system',
    counts,
    uploads: { files: 0, written: 0, skipped: 0, failed: [] },
    warnings,
    errors,
  };

  // 1 & 2. Buka ZIP dan periksa batas ukuran serta nama entri
  const unpacked = safeUnpackZip(zip, env.TRANSFER_MAX_MB, errors);
  if (!unpacked) {
    return report;
  }

  const { entries, manifest } = unpacked;
  report.scope = manifest.scope;
  report.manifest = {
    appVersion: manifest.appVersion,
    exportedAt: manifest.exportedAt,
    businessCodes: manifest.businessCodes,
  };

  // 3. Validasi migrasi database target
  let targetLastMigration = '';
  try {
    const migRows = await prisma.$queryRaw<Array<{ migration_name: string }>>`
      SELECT migration_name
      FROM "_prisma_migrations"
      WHERE finished_at IS NOT NULL
      ORDER BY migration_name DESC
      LIMIT 1
    `;
    if (migRows && migRows.length > 0) {
      targetLastMigration = migRows[0].migration_name;
    }
  } catch {
    targetLastMigration = '20261110000003_catalog_same_business_guard';
  }

  if (targetLastMigration && manifest.lastMigration !== targetLastMigration) {
    errors.push(
      `Versi migrasi database sumber (${manifest.lastMigration}) berbeda dengan database target (${targetLastMigration}). Jalankan 'prisma migrate deploy' pada aplikasi versi yang sama dengan sumber sebelum mengimpor.`
    );
    return report;
  }

  const currentAppVersion = getAppVersion();
  if (manifest.appVersion !== currentAppVersion) {
    warnings.push(
      `Versi aplikasi sumber (${manifest.appVersion}) berbeda dengan target (${currentAppVersion}).`
    );
  }

  // 4. Validasi Integritas Checksum SHA-256 & Magic Bytes
  const parsedTablesData: Record<string, Record<string, unknown>[]> = {};

  for (const [modelName, meta] of Object.entries(manifest.tables)) {
    const fileBytes = entries[meta.file];
    if (!fileBytes) {
      errors.push(`Berkas '${meta.file}' yang terdaftar di manifest tidak ditemukan di dalam ZIP.`);
      return report;
    }

    const contentStr = strFromU8(fileBytes);
    const hash = crypto.createHash('sha256').update(contentStr).digest('hex');
    if (hash !== meta.sha256) {
      errors.push(`Integritas berkas '${meta.file}' gagal: checksum SHA-256 tidak cocok.`);
      return report;
    }

    const rawLines = contentStr.length === 0 ? [] : (contentStr.endsWith('\n') ? contentStr.slice(0, -1) : contentStr).split('\n');
    const lines = rawLines;
    if (lines.length !== meta.rows) {
      errors.push(
        `Jumlah baris '${meta.file}' (${lines.length}) tidak sesuai dengan manifest (${meta.rows}).`
      );
      return report;
    }

    const rows: Record<string, unknown>[] = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      try {
        const parsed = fromJsonLine<Record<string, unknown>>(line);
        rows.push(parsed);
      } catch {
        errors.push(`Berkas '${meta.file}' baris ${i + 1} tidak valid (gagal di-parse).`);
        return report;
      }
    }

    parsedTablesData[modelName] = rows;
  }

  // Validasi file upload (sha256 & magic bytes)
  const uploadFiles = Object.keys(entries).filter((k) => k.startsWith('uploads/'));
  report.uploads.files = uploadFiles.length;

  for (const uploadPath of uploadFiles) {
    const bytes = entries[uploadPath];
    const hash = crypto.createHash('sha256').update(bytes).digest('hex');
    const metaFile = manifest.uploads.files.find((f) => f.path === uploadPath);
    if (metaFile && metaFile.sha256 !== hash) {
      errors.push(`Integritas berkas upload '${uploadPath}' gagal: checksum SHA-256 tidak cocok.`);
      return report;
    }

    try {
      detectMimeFromBytes(Buffer.from(bytes));
    } catch {
      errors.push(`Berkas upload '${uploadPath}' rusak atau bukan format gambar/PDF yang sah.`);
      return report;
    }
  }

  // 5. Validasi Prasyarat Target Database
  if (manifest.scope === 'system') {
    const existingBizCount = await prisma.business.count();
    if (existingBizCount > 0) {
      errors.push(
        `Impor mode sistem hanya diizinkan pada database KOSONG. Ditemukan ${existingBizCount} unit usaha di target.`
      );
      return report;
    }

    const nonSuperAdminUsers = await prisma.user.count({
      where: { role: { not: Role.SUPERADMIN }, deletedAt: null },
    });
    if (nonSuperAdminUsers > 0) {
      errors.push(
        `Ditemukan ${nonSuperAdminUsers} pengguna non-Superadmin di database target. Database target harus bersih untuk impor sistem.`
      );
      return report;
    }

    const superAdminCount = await prisma.user.count({
      where: { role: Role.SUPERADMIN, deletedAt: null },
    });

    if (superAdminCount > 0 && !replaceSeedSuperadmin) {
      errors.push(
        `Database target sudah berisi akun Super Admin bawaan seed. Jalankan ulang dengan opsi '--ganti-superadmin-seed' atau set RUN_SEED=false.`
      );
      return report;
    }
  } else {
    // Mode business: periksa id/code unit usaha dan keunikan username
    const bizRows = parsedTablesData['Business'] || [];
    for (const biz of bizRows) {
      const conflict = await prisma.business.findFirst({
        where: {
          OR: [{ id: biz.id as string }, { code: biz.code as string }],
        },
      });
      if (conflict) {
        if (!overwrite) {
          errors.push(
            `Unit usaha dengan ID '${biz.id}' atau Kode '${biz.code}' sudah terdaftar di sistem target.`
          );
          return report;
        } else {
          if (!businessesToOverwrite.includes(conflict.id)) {
            businessesToOverwrite.push(conflict.id);
          }
          warnings.push(
            `Unit usaha '${conflict.name}' (${conflict.code}) sudah terdaftar di sistem dan akan ditimpa (seluruh data lama unit usaha ini akan dibersihkan sebelum data baru dimasukkan).`
          );
        }
      }
    }

    // Periksa keunikan username
    const userRows = parsedTablesData['User'] || [];
    const usernames = userRows.map((u) => u.username as string).filter(Boolean);
    if (usernames.length > 0) {
      const whereUsers: Record<string, unknown> = {
        username: { in: usernames },
        deletedAt: null,
      };
      if (overwrite && businessesToOverwrite.length > 0) {
        whereUsers.businessId = { notIn: businessesToOverwrite };
      }
      const existingUsers = await prisma.user.findMany({
        where: whereUsers,
        select: { username: true },
      });
      if (existingUsers.length > 0) {
        const conflicts = existingUsers.map((u) => u.username).join(', ');
        errors.push(`Username berikut sudah digunakan oleh unit usaha lain di sistem target: ${conflicts}`);
        return report;
      }
    }

    // Periksa collision ID utama
    for (const model of ['Customer', 'Order', 'Product', 'Invoice'] as const) {
      const rows = parsedTablesData[model] || [];
      const ids = rows.map((r) => r.id as string).filter(Boolean);
      if (ids.length > 0) {
        const delegate = (prisma as unknown as Record<string, {
          findMany: (args: Record<string, unknown>) => Promise<Array<{ id: string }>>;
        }>)[model.charAt(0).toLowerCase() + model.slice(1)];
        if (delegate) {
          const whereModel: Record<string, unknown> = {
            id: { in: ids },
            businessId: { not: '' },
          };
          if (overwrite && businessesToOverwrite.length > 0) {
            whereModel.businessId = { notIn: businessesToOverwrite };
          }
          const existing = await delegate.findMany({
            where: whereModel,
            select: { id: true },
          });
          if (existing.length > 0) {
            errors.push(
              `Terdapat ${existing.length} data ${model} dari berkas yang ID-nya sudah digunakan oleh unit usaha lain di target.`
            );
            return report;
          }
        }
      }
    }

    // Periksa telegramChatId bentrok
    for (const u of userRows) {
      if (u.telegramChatId) {
        const whereChat: Record<string, unknown> = {
          telegramChatId: BigInt(u.telegramChatId as string | number | bigint),
          deletedAt: null,
        };
        if (overwrite && businessesToOverwrite.length > 0) {
          whereChat.businessId = { notIn: businessesToOverwrite };
        }
        const existingChat = await prisma.user.findFirst({
          where: whereChat,
        });
        if (existingChat) {
          u.telegramChatId = null;
          warnings.push(
            `telegramChatId untuk user '${u.username}' sudah dipakai di target dan di-set null.`
          );
        }
      }
    }

    // Periksa keunikan global Shipment.deliveryNo (Seksi OPEN_QUESTIONS #3)
    const shipmentRows = parsedTablesData['Shipment'] || [];
    const seenDeliveryNos = new Set<string>();
    for (const s of shipmentRows) {
      if (s.deliveryNo && typeof s.deliveryNo === 'string') {
        const trimmedNo = s.deliveryNo.trim();
        if (seenDeliveryNos.has(trimmedNo)) {
          errors.push(
            `Nomor surat jalan '${trimmedNo}' duplikat di dalam berkas impor.`
          );
          return report;
        }
        seenDeliveryNos.add(trimmedNo);

        const existingShipment = await prisma.shipment.findFirst({
          where: {
            deliveryNo: trimmedNo,
            businessId: { not: '' },
          },
          select: { id: true, businessId: true },
        });
        if (existingShipment) {
          if (!overwrite || !businessesToOverwrite.includes(existingShipment.businessId)) {
            errors.push(
              `Nomor surat jalan '${trimmedNo}' sudah terpakai oleh unit usaha lain di target.`
            );
            return report;
          }
        }
      }
    }
  }

  // 6. Staging Berkas Upload (Hanya bila bukan dry-run dan ada berkas)
  const stagingId = `.import-${crypto.randomUUID()}`;
  const stagingDir = path.resolve(uploadDir, stagingId);
  const stagingWritten: string[] = [];

  if (!dryRun && uploadFiles.length > 0) {
    try {
      fs.mkdirSync(stagingDir, { recursive: true });
      for (const uploadPath of uploadFiles) {
        const bytes = entries[uploadPath];
        const relSubPath = uploadPath.replace(/^uploads\//, '');
        const targetStagingFile = path.resolve(stagingDir, relSubPath);

        if (!targetStagingFile.startsWith(stagingDir + path.sep)) {
          errors.push(`Jalur berkas melanggar batas direktori staging: ${uploadPath}`);
          return report;
        }

        fs.mkdirSync(path.dirname(targetStagingFile), { recursive: true });
        fs.writeFileSync(targetStagingFile, bytes);
        stagingWritten.push(uploadPath);
      }
    } catch {
      errors.push(`Gagal mempersiapkan berkas upload ke folder staging.`);
      try {
        fs.rmSync(stagingDir, { recursive: true, force: true });
      } catch {
        // ignore
      }
      return report;
    }
  }

  // 7. Eksekusi Transaksi Database (atau Dry-Run Rollback)
  const schemaMeta = getSchemaMetadata();

  try {
    await prisma.$transaction(
      async (tx) => {
        // Kunci penasehat PostgreSQL agar impor tidak bertabrakan secara paralel
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(849201948201)`;

        // Ganti Super Admin seed jika mode sistem & diminta
        if (manifest.scope === 'system' && replaceSeedSuperadmin) {
          const superUsers = await tx.user.findMany({
            where: { role: Role.SUPERADMIN },
            select: { id: true },
          });
          const ids = superUsers.map((u) => u.id);
          if (ids.length > 0) {
            await tx.session.deleteMany({ where: { userId: { in: ids } } });
            await tx.telegramLinkCode.deleteMany({ where: { userId: { in: ids } } });
            await tx.notification.deleteMany({ where: { userId: { in: ids } } });
            await tx.user.deleteMany({ where: { id: { in: ids } } });
          }
        }

        // Bersihkan data unit usaha lama bila mode business dan overwrite=true
        if (manifest.scope === 'business' && overwrite && businessesToOverwrite.length > 0) {
          // 1. Ambil semua user milik unit usaha yang akan ditimpa untuk bersihkan sessions, link codes, notifications
          const bizUsers = await tx.user.findMany({
            where: { businessId: { in: businessesToOverwrite } },
            select: { id: true },
          });
          const bizUserIds = bizUsers.map((u) => u.id);

          if (bizUserIds.length > 0) {
            await tx.session.deleteMany({ where: { userId: { in: bizUserIds } } });
            await tx.telegramLinkCode.deleteMany({ where: { userId: { in: bizUserIds } } });
          }
          await tx.notification.deleteMany({
            where: {
              OR: [
                { businessId: { in: businessesToOverwrite } },
                ...(bizUserIds.length > 0 ? [{ userId: { in: bizUserIds } }] : []),
              ],
            },
          });

          // 2. Hapus model-model anak ke induk (urutan terbalik dari TABLES)
          // Catatan: ReleaseNote (system-only) dan AuditLog (immutable trigger database) tidak boleh dihapus
          for (const spec of [...TABLES].reverse()) {
            if (spec.model === 'ReleaseNote' || spec.model === 'AuditLog') continue;

            const delegate = (tx as unknown as Record<string, {
              deleteMany: (args: Record<string, unknown>) => Promise<{ count: number }>;
            }>)[spec.delegate];

            if (delegate && typeof delegate.deleteMany === 'function') {
              if (spec.scope === 'via-parent' && spec.parentRelation) {
                await delegate.deleteMany({
                  where: { [spec.parentRelation]: { businessId: { in: businessesToOverwrite } } },
                });
              } else if (spec.scope === 'business-id') {
                await delegate.deleteMany({
                  where: { businessId: { in: businessesToOverwrite } },
                });
              } else if (spec.scope === 'business-pk') {
                await delegate.deleteMany({
                  where: { id: { in: businessesToOverwrite } },
                });
              }
            }
          }
        }

        // Sisipkan tiap model sesuai urutan registry
        for (const spec of TABLES) {
          const rows = parsedTablesData[spec.model] || [];
          if (rows.length === 0) continue;

          const delegate = (tx as unknown as Record<string, {
            createMany: (args: Record<string, unknown>) => Promise<{ count: number }>;
          }>)[spec.delegate];

          if (!delegate || typeof delegate.createMany !== 'function') {
            throw new Error(`Delegate Prisma createMany tidak tersedia untuk model: ${spec.model}`);
          }

          const modelMeta = schemaMeta[spec.model] || {
            jsonColumns: [],
            nullableWithDefaultColumns: [],
          };
          const jsonCols = new Set(modelMeta.jsonColumns);
          const nullableWithDefaultCols = new Set(modelMeta.nullableWithDefaultColumns);

          // Batching per 500 baris
          const batchSize = 500;
          for (let b = 0; b < rows.length; b += batchSize) {
            const batch = rows.slice(b, b + batchSize);
            const validFields = modelScalarFields[spec.model];
            const sanitizedBatch = batch.map((r) =>
              sanitizeRowForInsert(r, jsonCols, nullableWithDefaultCols, validFields)
            );

            await delegate.createMany({
              data: sanitizedBatch,
              skipDuplicates: spec.model === 'ReleaseNote' || spec.model === 'AuditLog',
            });
          }

          counts[spec.model] = rows.length;
        }

        // 8. Verifikasi Konsistensi Counter Dokumen (Penting: Rollback bila ada celah/anomali)
        const orderRows = parsedTablesData['Order'] || [];
        const poRows = parsedTablesData['PurchaseOrder'] || [];
        const cnRows = parsedTablesData['CreditNote'] || [];

        // Cek ORDER_SEQ per customerId
        const orderMaxSeqByCust = new Map<string, number>();
        for (const o of orderRows) {
          const cId = o.customerId as string;
          const seq = Number(o.customerSeq) || 0;
          if (!orderMaxSeqByCust.has(cId) || seq > orderMaxSeqByCust.get(cId)!) {
            orderMaxSeqByCust.set(cId, seq);
          }
        }

        for (const [cId, maxSeq] of orderMaxSeqByCust.entries()) {
          const counter = await tx.documentCounter.findFirst({
            where: {
              scope: CounterScope.ORDER_SEQ,
              scopeId: cId,
              businessId: { not: '' },
            },
          });
          if (!counter) {
            throw new Error(
              `Anomali Counter: Pesanan ada untuk customer '${cId}' tetapi DocumentCounter ORDER_SEQ tidak ditemukan.`
            );
          }
          if (counter.lastSeq < maxSeq) {
            throw new Error(
              `Anomali Counter: lastSeq ORDER_SEQ (${counter.lastSeq}) lebih kecil dari max customerSeq (${maxSeq}) pada customer '${cId}'.`
            );
          }
        }

        // Cek PO_SEQ per vendorId
        const poMaxSeqByVendor = new Map<string, number>();
        for (const po of poRows) {
          const vId = po.vendorId as string;
          const seq = Number(po.vendorSeq) || 0;
          if (!poMaxSeqByVendor.has(vId) || seq > poMaxSeqByVendor.get(vId)!) {
            poMaxSeqByVendor.set(vId, seq);
          }
        }

        for (const [vId, maxSeq] of poMaxSeqByVendor.entries()) {
          const counter = await tx.documentCounter.findFirst({
            where: {
              scope: CounterScope.PO_SEQ,
              scopeId: vId,
              businessId: { not: '' },
            },
          });
          if (!counter) {
            throw new Error(
              `Anomali Counter: PurchaseOrder ada untuk vendor '${vId}' tetapi DocumentCounter PO_SEQ tidak ditemukan.`
            );
          }
          if (counter.lastSeq < maxSeq) {
            throw new Error(
              `Anomali Counter: lastSeq PO_SEQ (${counter.lastSeq}) lebih kecil dari max vendorSeq (${maxSeq}) pada vendor '${vId}'.`
            );
          }
        }

        // Cek CREDIT_NOTE_SEQ per customerId
        const cnMaxSeqByCust = new Map<string, number>();
        for (const cn of cnRows) {
          const cId = cn.customerId as string;
          const numStr = (cn.number as string) || '';
          const parts = numStr.split('/');
          const seq = parseInt(parts[parts.length - 1], 10);
          if (!isNaN(seq)) {
            if (!cnMaxSeqByCust.has(cId) || seq > cnMaxSeqByCust.get(cId)!) {
              cnMaxSeqByCust.set(cId, seq);
            }
          }
        }

        for (const [cId, maxSeq] of cnMaxSeqByCust.entries()) {
          const counter = await tx.documentCounter.findFirst({
            where: {
              scope: CounterScope.CREDIT_NOTE_SEQ,
              scopeId: cId,
              businessId: { not: '' },
            },
          });
          if (!counter) {
            throw new Error(
              `Anomali Counter: CreditNote ada untuk customer '${cId}' tetapi DocumentCounter CREDIT_NOTE_SEQ tidak ditemukan.`
            );
          }
          if (counter.lastSeq < maxSeq) {
            throw new Error(
              `Anomali Counter: lastSeq CREDIT_NOTE_SEQ (${counter.lastSeq}) lebih kecil dari urutan nota kredit (${maxSeq}) pada customer '${cId}'.`
            );
          }
        }

        // 9. Cek Konsistensi Bisnis (Peringatan / Warning saja)
        const paymentRows = parsedTablesData['Payment'] || [];
        const paymentsByOrder = new Map<string, bigint>();
        for (const p of paymentRows) {
          if (p.status === PaymentStatus.VERIFIED) {
            const oId = p.orderId as string;
            const amt = BigInt(p.amount as string | number | bigint);
            const cur = paymentsByOrder.get(oId) || 0n;
            if (p.type === PaymentType.RECEIPT) {
              paymentsByOrder.set(oId, cur + amt);
            } else if (p.type === PaymentType.REFUND) {
              paymentsByOrder.set(oId, cur - amt);
            }
          }
        }

        for (const o of orderRows) {
          const oId = o.id as string;
          const paidTotal = BigInt(o.paidTotal as string | number | bigint);
          const computed = paymentsByOrder.get(oId) || 0n;
          if (paidTotal !== computed) {
            warnings.push(
              `Konsistensi: Order '${o.orderNo || oId}' paidTotal (${paidTotal}) berbeda dari saldo verifikasi payment (${computed}).`
            );
          }
        }

        // Catat AuditLog SATU kali untuk transaksi DATA_IMPORT
        const totalRowsImported = Object.values(counts).reduce((a, b) => a + b, 0);
        await tx.auditLog.create({
          data: {
            action: 'DATA_IMPORT',
            entityType: manifest.scope === 'system' ? 'System' : 'Business',
            entityId: manifest.scope === 'system' ? 'SYSTEM' : manifest.businessIds[0],
            businessId: manifest.scope === 'system' ? null : manifest.businessIds[0],
            actorId: actor?.id ?? null,
            actorRole: actor?.role ?? null,
            summary: `Impor data (${manifest.scope}): ${totalRowsImported} baris, ${uploadFiles.length} berkas upload (dryRun: ${dryRun})`,
          },
        });

        // 10. Jika Dry-Run, lempar sentinel khusus untuk rollback penuh
        if (dryRun) {
          throw new DryRunRollbackSentinel();
        }
      },
      {
        timeout: 15 * 60 * 1000,
        maxWait: 30 * 1000,
      }
    );
  } catch (err: unknown) {
    if (err instanceof DryRunRollbackSentinel) {
      report.ok = errors.length === 0;
      report.dryRun = true;
      return report;
    }

    const msg = err instanceof Error ? err.message : String(err);
    errors.push(`Transaksi database dibatalkan (rollback): ${msg}`);
    return report;
  } finally {
    // 11. Pindahkan berkas dari staging ke tujuan akhir (bila sukses dan bukan dry-run)
    if (!dryRun && stagingWritten.length > 0) {
      for (const uploadPath of stagingWritten) {
        const relSubPath = uploadPath.replace(/^uploads\//, '');
        const stagedFile = path.resolve(stagingDir, relSubPath);
        const destFile = path.resolve(uploadDir, relSubPath);

        if (fs.existsSync(destFile)) {
          report.uploads.skipped++;
          warnings.push(`Berkas '${uploadPath}' sudah ada di target, dilewati.`);
          continue;
        }

        try {
          fs.mkdirSync(path.dirname(destFile), { recursive: true });
          fs.renameSync(stagedFile, destFile);
          report.uploads.written++;
        } catch {
          report.uploads.failed.push(uploadPath);
        }
      }
    }

    // Bersihkan folder staging
    try {
      if (fs.existsSync(stagingDir)) {
        fs.rmSync(stagingDir, { recursive: true, force: true });
      }
    } catch {
      // ignore
    }
  }

  report.ok = errors.length === 0;
  return report;
}
