import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { Role } from '@prisma/client';
import { importData } from '@/lib/transfer/import';
import { env } from '@/lib/env';

describe('BentoCat Production Export ZIP Validation', () => {
  it('omnicat-export-business-BENTOCAT.zip valid dan lulus simulasi impor (dry-run)', async () => {
    const zipPath = path.resolve('exports/omnicat-export-business-BENTOCAT.zip');
    expect(fs.existsSync(zipPath)).toBe(true);

    const zipBuffer = fs.readFileSync(zipPath);
    const report = await importData(new Uint8Array(zipBuffer), {
      dryRun: true,
      overwrite: true,
      replaceSeedSuperadmin: false,
      actor: { id: 'test_admin', role: Role.SUPERADMIN },
      uploadDir: env.UPLOAD_DIR,
    });

    if (!report.ok) {
      console.error('Import errors:', report.errors);
      console.warn('Import warnings:', report.warnings);
    }

    expect(report.errors).toEqual([]);
    expect(report.ok).toBe(true);
    expect(report.manifest?.businessCodes).toContain('BENTOCAT');
  });
});
