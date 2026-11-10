import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  TABLES,
  EXCLUDED_MODELS,
  buildWhere,
  getSchemaMetadata,
} from '@/lib/transfer/registry';

describe('Unit Transfer: Registry Tabel & Urutan Relasi Topologis (Bagian 10 Butir B)', () => {
  const schemaPath = path.resolve(process.cwd(), 'prisma/schema.prisma');
  const schemaContent = fs.readFileSync(schemaPath, 'utf8');

  it('memastikan setiap model di schema.prisma terdaftar di TABLES atau di EXCLUDED_MODELS tanpa ada yang tertinggal', () => {
    const modelsInSchema: string[] = [];
    for (const line of schemaContent.split('\n')) {
      const match = line.match(/^model\s+(\w+)\s+\{/);
      if (match) {
        modelsInSchema.push(match[1]);
      }
    }

    expect(modelsInSchema.length).toBeGreaterThan(0);

    const registeredModels = new Set(TABLES.map((t) => t.model));
    const excludedModels = new Set(EXCLUDED_MODELS);

    const missingModels: string[] = [];
    for (const model of modelsInSchema) {
      if (!registeredModels.has(model) && !excludedModels.has(model)) {
        missingModels.push(model);
      }
    }

    expect(
      missingModels,
      `Ditemukan model di schema.prisma yang belum didaftarkan di TABLES atau EXCLUDED_MODELS: ${missingModels.join(', ')}`
    ).toEqual([]);
  });

  it('memastikan urutan topologis relasi: seluruh model induk muncul SEBELUM model anak di TABLES', () => {
    const tableOrder = TABLES.map((t) => t.model);

    // Ekstrak semua foreign key relasi dari schema
    const lines = schemaContent.split('\n');
    let currentModel = '';

    for (const line of lines) {
      const modelMatch = line.match(/^model\s+(\w+)\s+\{/);
      if (modelMatch) {
        currentModel = modelMatch[1];
        continue;
      }

      const relMatch = line.match(/@relation\(([^)]*fields:\s*\[([^\]]+)\][^)]*references:\s*\[([^\]]+)\][^)]*)\)/);
      if (relMatch) {
        const parentMatch = line.match(/^\s*\w+\s+(\w+)/);
        if (parentMatch) {
          const parentModel = parentMatch[1];

          // Abaikan relasi diri-sendiri (self-relation)
          if (parentModel === currentModel) continue;

          const childIndex = tableOrder.indexOf(currentModel);
          const parentIndex = tableOrder.indexOf(parentModel);

          // Jika kedua model berada di daftar TABLES, pastikan parentIndex < childIndex
          if (childIndex !== -1 && parentIndex !== -1) {
            expect(
              parentIndex,
              `Urutan terbalik: Induk '${parentModel}' (indeks ${parentIndex}) harus muncul sebelum anak '${currentModel}' (indeks ${childIndex})`
            ).toBeLessThan(childIndex);
          }
        }
      }
    }
  });

  it('memastikan pemetaan scope selaras dengan keberadaan field businessId di model', () => {
    // Parsing field tiap model di schema
    const modelFields: Record<string, string[]> = {};
    let cur = '';
    for (const line of schemaContent.split('\n')) {
      const m = line.match(/^model\s+(\w+)\s+\{/);
      if (m) {
        cur = m[1];
        modelFields[cur] = [];
        continue;
      }
      if (cur) {
        const f = line.trim().match(/^(\w+)\s+/);
        if (f) modelFields[cur].push(f[1]);
      }
    }

    for (const spec of TABLES) {
      const fields = modelFields[spec.model] || [];
      const hasBusinessId = fields.includes('businessId');

      if (hasBusinessId) {
        expect(['business-id', 'business-pk']).toContain(spec.scope);
      } else {
        expect(['business-pk', 'via-parent', 'system-only']).toContain(spec.scope);
      }

      if (spec.scope === 'via-parent') {
        expect(spec.parentRelation).toBeDefined();
      }
    }
  });

  it('menguji fungsi buildWhere untuk mode system dan mode business', () => {
    const bizPkSpec = TABLES.find((t) => t.scope === 'business-pk')!;
    const bizIdSpec = TABLES.find((t) => t.scope === 'business-id')!;
    const viaParentSpec = TABLES.find((t) => t.scope === 'via-parent')!;
    const systemOnlySpec = TABLES.find((t) => t.scope === 'system-only')!;

    // Mode system: selalu undefined (tanpa filter)
    expect(buildWhere(bizPkSpec, 'system')).toBeUndefined();
    expect(buildWhere(bizIdSpec, 'system')).toBeUndefined();

    // Mode business: filter sesuai scope
    const bId = 'biz_test_123';
    expect(buildWhere(bizPkSpec, 'business', bId)).toEqual({ id: bId });
    expect(buildWhere(bizIdSpec, 'business', bId)).toEqual({ businessId: bId });
    expect(buildWhere(viaParentSpec, 'business', bId)).toEqual({
      [viaParentSpec.parentRelation!]: { businessId: bId },
    });
    expect(buildWhere(systemOnlySpec, 'business', bId)).toBeUndefined();
  });

  it('memvalidasi helper getSchemaMetadata mengekstrak kolom Json dengan tepat', () => {
    const meta = getSchemaMetadata();
    expect(meta.Invoice.jsonColumns).toEqual(['snapshot']);
    expect(meta.AuditLog.jsonColumns).toContain('before');
    expect(meta.AuditLog.jsonColumns).toContain('after');
  });
});

