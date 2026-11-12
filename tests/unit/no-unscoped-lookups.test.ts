import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import ts from 'typescript';
import { GUARDED_OPS, TENANT_MODELS } from '@/lib/db';

function getAllTsFiles(dir: string, exts = ['.ts']): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;
  const list = fs.readdirSync(dir);
  for (const file of list) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat && stat.isDirectory()) {
      results.push(...getAllTsFiles(filePath, exts));
    } else if (exts.some((ext) => file.endsWith(ext))) {
      results.push(filePath);
    }
  }
  return results;
}

function getPropertyName(propName: ts.PropertyName | undefined): string | null {
  if (!propName) return null;
  if (
    ts.isIdentifier(propName) ||
    ts.isStringLiteral(propName) ||
    ts.isNumericLiteral(propName)
  ) {
    return propName.text;
  }
  return null;
}

function hasBusinessIdInWhere(node: ts.Expression, depth = 0): boolean | 'dynamic' {
  if (depth > 5) return false;
  if (ts.isObjectLiteralExpression(node)) {
    for (const prop of node.properties) {
      if (ts.isPropertyAssignment(prop) || ts.isShorthandPropertyAssignment(prop)) {
        const name = getPropertyName(prop.name);
        if (name === 'businessId') return true;
        if ((name === 'AND' || name === 'OR') && ts.isPropertyAssignment(prop)) {
          if (ts.isArrayLiteralExpression(prop.initializer)) {
            const inner = prop.initializer.elements.some(
              (el) => hasBusinessIdInWhere(el, depth + 1) === true
            );
            if (inner) return true;
          }
        }
      } else if (ts.isSpreadAssignment(prop)) {
        return 'dynamic';
      }
    }
    return false;
  }
  return 'dynamic';
}

describe('Pencegahan Lookup Tanpa Scope di Services, PDF, & API Handlers (T0.3 & AUD-TENANT-002)', () => {
  const servicesDir = path.resolve(__dirname, '../../src/lib/services');
  const pdfDir = path.resolve(__dirname, '../../src/lib/pdf');
  const apiDir = path.resolve(__dirname, '../../src/app/api/v1');

  // Pengecualian resmi yang sudah divalidasi memiliki scoping atau verifikasi ID unik global
  const allowedExceptions: string[] = [
    // Operasi update setelah findFirst scoping atau transaction-level guard
    'bank-accounts\\[id\\]\\route.ts: tx.bankAccount.update(',
    'bank-accounts/[id]/route.ts: tx.bankAccount.update(',
    'orders\\[id\\]\\route.ts: tx.order.update(',
    'orders/[id]/route.ts: tx.order.update(',
  ];

  it('memastikan tidak ada findUnique, update, atau delete langsung pada TENANT_MODELS di src/lib/services dan src/lib/pdf', () => {
    const files = [...getAllTsFiles(servicesDir), ...getAllTsFiles(pdfDir)];
    const violations: string[] = [];

    for (const fullPath of files) {
      const relPath = path.relative(path.resolve(__dirname, '../../src/lib'), fullPath);
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

  it('memastikan seluruh operasi GUARDED_OPS pada TENANT_MODELS di src menyertakan businessId di where literal', () => {
    const srcDir = path.resolve(__dirname, '../../src');
    const files = getAllTsFiles(srcDir, ['.ts', '.tsx']);
    const tenantModelVars = new Set(
      [...TENANT_MODELS].map((m) => m.charAt(0).toLowerCase() + m.slice(1))
    );
    const violations: string[] = [];

    for (const fullPath of files) {
      const relPath = path.relative(srcDir, fullPath).replace(/\\/g, '/');
      const content = fs.readFileSync(fullPath, 'utf-8');
      const sf = ts.createSourceFile(
        fullPath,
        content,
        ts.ScriptTarget.Latest,
        true,
        fullPath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
      );

      const visit = (node: ts.Node) => {
        if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
          const op = node.expression.name.text;
          const target = node.expression.expression;
          if (GUARDED_OPS.has(op) && ts.isPropertyAccessExpression(target)) {
            const model = target.name.text;
            if (tenantModelVars.has(model)) {
              const arg0 = node.arguments[0];
              let missingReason: string | null = null;
              if (!arg0 || !ts.isObjectLiteralExpression(arg0)) {
                missingReason = 'NO_OBJECT_ARG';
              } else {
                const whereProp = arg0.properties.find(
                  (p): p is ts.PropertyAssignment | ts.ShorthandPropertyAssignment =>
                    (ts.isPropertyAssignment(p) || ts.isShorthandPropertyAssignment(p)) &&
                    getPropertyName(p.name) === 'where'
                );
                if (!whereProp) {
                  missingReason = 'NO_WHERE';
                } else if (ts.isPropertyAssignment(whereProp)) {
                  const res = hasBusinessIdInWhere(whereProp.initializer);
                  if (res === false) missingReason = 'MISSING_businessId';
                }
              }

              if (missingReason) {
                const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
                violations.push(`${relPath}:${line} (${model}.${op}: ${missingReason})`);
              }
            }
          }
        }
        ts.forEachChild(node, visit);
      };

      visit(sf);
    }

    expect(violations).toEqual([]);
  });
});
