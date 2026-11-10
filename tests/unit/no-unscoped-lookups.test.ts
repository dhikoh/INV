import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { TENANT_MODELS } from '@/lib/db';

function getAllTsFiles(dir: string): string[] {
  let results: string[] = [];
  if (!fs.existsSync(dir)) return results;
  const list = fs.readdirSync(dir);
  for (const file of list) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat && stat.isDirectory()) {
      results = results.concat(getAllTsFiles(filePath));
    } else if (file.endsWith('.ts')) {
      results.push(filePath);
    }
  }
  return results;
}

describe('Pencegahan Lookup Tanpa Scope di Services & API Handlers (T0.3 & AUD-TENANT-002)', () => {
  const servicesDir = path.resolve(__dirname, '../../src/lib/services');
  const apiDir = path.resolve(__dirname, '../../src/app/api/v1');

  // Pengecualian resmi yang sudah divalidasi memiliki scoping atau verifikasi ID unik global
  const allowedExceptions: string[] = [
    // Operasi update setelah findFirst scoping atau transaction-level guard
    'bank-accounts\\[id\\]\\route.ts: tx.bankAccount.update(',
    'bank-accounts/[id]/route.ts: tx.bankAccount.update(',
    'orders\\[id\\]\\route.ts: tx.order.update(',
    'orders/[id]/route.ts: tx.order.update(',
  ];

  it('memastikan tidak ada findUnique, update, atau delete langsung pada TENANT_MODELS di src/lib/services', () => {
    const files = getAllTsFiles(servicesDir);
    const violations: string[] = [];

    for (const fullPath of files) {
      const relPath = path.relative(servicesDir, fullPath);
      const content = fs.readFileSync(fullPath, 'utf-8');

      for (const model of TENANT_MODELS) {
        const modelVar = model.charAt(0).toLowerCase() + model.slice(1);
        const forbiddenPatterns = [
          `prisma.${modelVar}.findUnique(`,
          `tx.${modelVar}.findUnique(`,
          `prisma.${modelVar}.update(`,
          `tx.${modelVar}.update(`,
          `prisma.${modelVar}.delete(`,
          `tx.${modelVar}.delete(`,
        ];

        for (const pattern of forbiddenPatterns) {
          if (content.includes(pattern)) {
            const entry = `${relPath}: ${pattern}`;
            if (!allowedExceptions.some((exc) => entry.includes(exc))) {
              violations.push(entry);
            }
          }
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it('memastikan tidak ada unscoped findUnique pada TENANT_MODELS di src/app/api/v1', () => {
    const files = getAllTsFiles(apiDir);
    const violations: string[] = [];

    for (const fullPath of files) {
      const relPath = path.relative(apiDir, fullPath);
      const content = fs.readFileSync(fullPath, 'utf-8');

      for (const model of TENANT_MODELS) {
        const modelVar = model.charAt(0).toLowerCase() + model.slice(1);
        const forbiddenPatterns = [
          `prisma.${modelVar}.findUnique(`,
          `tx.${modelVar}.findUnique(`,
        ];

        for (const pattern of forbiddenPatterns) {
          if (content.includes(pattern)) {
            const entry = `${relPath}: ${pattern}`;
            if (!allowedExceptions.some((exc) => entry.includes(exc))) {
              violations.push(entry);
            }
          }
        }
      }
    }

    expect(violations).toEqual([]);
  });
});
