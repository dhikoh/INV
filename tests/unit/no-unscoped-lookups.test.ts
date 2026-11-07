import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { TENANT_MODELS } from '@/lib/db';

describe('Pencegahan Lookup Tanpa Scope di Services (T0.3)', () => {
  const servicesDir = path.resolve(__dirname, '../../src/lib/services');
  const allowedExceptions: string[] = [];

  it('memastikan tidak ada findUnique, update, atau delete langsung pada TENANT_MODELS di src/lib/services', () => {
    if (!fs.existsSync(servicesDir)) {
      expect(true).toBe(true);
      return;
    }

    const files = fs.readdirSync(servicesDir).filter((f) => f.endsWith('.ts'));
    const violations: string[] = [];

    for (const file of files) {
      const fullPath = path.join(servicesDir, file);
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
            const entry = `${file}: ${pattern}`;
            if (!allowedExceptions.includes(entry)) {
              violations.push(entry);
            }
          }
        }
      }
    }

    expect(violations).toEqual([]);
  });
});
