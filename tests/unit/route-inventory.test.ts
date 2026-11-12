import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

function walkDir(dir: string): string[] {
  let results: string[] = [];
  if (!fs.existsSync(dir)) return results;
  const list = fs.readdirSync(dir);
  for (const file of list) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat && stat.isDirectory()) {
      results = results.concat(walkDir(fullPath));
    } else {
      results.push(fullPath);
    }
  }
  return results;
}

describe('Tes Inventaris Rute API v1 & Konsistensi Dokumen Blueprint (Seksi 17.4 c)', () => {
  const apiV1Dir = path.resolve(__dirname, '../../src/app/api/v1');
  const blueprintPath = path.resolve(__dirname, '../../docs/BLUEPRINT.md');

  // Rute khusus yang mengembalikan respons binary (PDF/gambar/Excel/ZIP) atau alur otentikasi login publik
  const ALLOWED_NON_WITH_API_ROUTES = new Set([
    'auth/login/route.ts',
    'businesses/[id]/export/route.ts',
    'businesses/[id]/invoice-preview/route.ts',
    'catalogs/[id]/pdf/route.ts',
    'credit-notes/[id]/pdf/route.ts',
    'data-transfer/export/route.ts',
    'dl/[token]/route.ts',
    'files/[businessId]/[kind]/[filename]/route.ts',
    'invoices/[id]/pdf/route.ts',
    'orders/[id]/delivery-note/pdf/route.ts',
    'orders/[id]/proforma/pdf/route.ts',
    'payments/[id]/receipt/pdf/route.ts',
    'public/verify/[token]/route.ts',
    'reports/export/route.ts',
  ]);

  it('memastikan setiap handler di src/app/api/v1/**/route.ts dibungkus withApi (atau tercatat dalam pengecualian resmi binary)', () => {
    const routeFiles = walkDir(apiV1Dir).filter((f) => f.endsWith('route.ts'));
    expect(routeFiles.length).toBeGreaterThan(0);

    const unwrappedRoutes: string[] = [];

    for (const filePath of routeFiles) {
      const relPath = path
        .relative(apiV1Dir, filePath)
        .replace(/\\/g, '/');

      const content = fs.readFileSync(filePath, 'utf-8');
      const usesWithApi = content.includes('withApi(');

      if (!usesWithApi && !ALLOWED_NON_WITH_API_ROUTES.has(relPath)) {
        unwrappedRoutes.push(relPath);
      }
    }

    expect(
      unwrappedRoutes,
      `Ditemukan handler API v1 yang tidak dibungkus withApi: ${unwrappedRoutes.join(', ')}`
    ).toEqual([]);
  });

  it('memastikan seluruh rute di src/app/api/v1 tercantum di tabel endpoint docs/BLUEPRINT.md', () => {
    expect(fs.existsSync(blueprintPath)).toBe(true);
    const blueprintContent = fs.readFileSync(blueprintPath, 'utf-8');

    const routeFiles = walkDir(apiV1Dir).filter((f) => f.endsWith('route.ts'));
    const missingEndpoints: string[] = [];

    for (const filePath of routeFiles) {
      let relPath = path.relative(apiV1Dir, filePath).replace(/\\/g, '/');
      // hilangkan suffix route.ts
      relPath = relPath.replace(/\/route\.ts$/, '').replace(/^route\.ts$/, '');

      // Konversi [id] -> :id, [token] -> :token, [month] -> :month, dll.
      const normalizedPath =
        '/api/v1' + (relPath ? '/' + relPath.replace(/\[([^\]]+)\]/g, ':$1') : '');

      if (!blueprintContent.includes(normalizedPath)) {
        missingEndpoints.push(normalizedPath);
      }
    }

    expect(
      missingEndpoints,
      `Ditemukan endpoint API v1 yang belum tercatat di docs/BLUEPRINT.md: ${missingEndpoints.join(', ')}`
    ).toEqual([]);
  });
});

