import { describe, it, expect, beforeAll } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';
import path from 'path';

describe('Database SQL Constraints & Immutable Audit Trigger (T0.3)', () => {
  let db: PGlite;

  beforeAll(async () => {
    db = new PGlite();

    const initSqlPath = path.resolve(
      __dirname,
      '../../prisma/migrations/20261107000001_init/migration.sql'
    );
    const constraintsSqlPath = path.resolve(
      __dirname,
      '../../prisma/migrations/20261107000002_db_constraints/migration.sql'
    );

    const initSql = fs.readFileSync(initSqlPath, 'utf-8');
    const constraintsSql = fs.readFileSync(constraintsSqlPath, 'utf-8');

    // Run migrations
    await db.exec(initSql);
    await db.exec(constraintsSql);

    // Seed dummy business
    await db.query(
      `INSERT INTO "Business" ("id", "code", "name", "updatedAt") 
       VALUES ('biz_1', 'TRB', 'Usaha Terobos', NOW());`
    );
  });

  it('berhasil menyimpan produk dengan minPrice <= basePrice', async () => {
    await db.query(
      `INSERT INTO "Product" ("id", "businessId", "sku", "name", "unit", "costPrice", "basePrice", "minPrice", "stockQty", "reservedQty", "updatedAt")
       VALUES ('prod_ok', 'biz_1', 'SKU-001', 'Barang Bagus', 'PCS', 10000, 15000, 12000, 10, 0, NOW());`
    );

    const res = await db.query(
      `SELECT "id", "sku", "minPrice", "basePrice" FROM "Product" WHERE "id" = 'prod_ok';`
    );
    expect(res.rows).toHaveLength(1);
    expect((res.rows[0] as Record<string, unknown>).sku).toBe('SKU-001');
  });

  it('menolak (gagal) bila insert minPrice > basePrice (constraint product_min_le_base)', async () => {
    const insertSql = `
      INSERT INTO "Product" ("id", "businessId", "sku", "name", "unit", "costPrice", "basePrice", "minPrice", "stockQty", "reservedQty", "updatedAt")
      VALUES ('prod_fail', 'biz_1', 'SKU-002', 'Barang Mahal', 'PCS', 10000, 15000, 18000, 10, 0, NOW());
    `;

    await expect(db.query(insertSql)).rejects.toThrowError(
      /product_min_le_base/
    );
  });

  it('menolak nilai uang negatif pada produk (constraint product_money_nonneg)', async () => {
    const insertSql = `
      INSERT INTO "Product" ("id", "businessId", "sku", "name", "unit", "costPrice", "basePrice", "minPrice", "stockQty", "reservedQty", "updatedAt")
      VALUES ('prod_neg', 'biz_1', 'SKU-003', 'Barang Minus', 'PCS', -5000, 15000, 12000, 10, 0, NOW());
    `;

    await expect(db.query(insertSql)).rejects.toThrowError(
      /product_money_nonneg/
    );
  });

  it('menolak reservedQty negatif pada produk (constraint product_reserved_nonneg)', async () => {
    const insertSql = `
      INSERT INTO "Product" ("id", "businessId", "sku", "name", "unit", "costPrice", "basePrice", "minPrice", "stockQty", "reservedQty", "updatedAt")
      VALUES ('prod_res', 'biz_1', 'SKU-004', 'Barang Reserved Minus', 'PCS', 10000, 15000, 12000, 10, -1, NOW());
    `;

    await expect(db.query(insertSql)).rejects.toThrowError(
      /product_reserved_nonneg/
    );
  });

  it('berhasil menyimpan AuditLog awal', async () => {
    await db.query(`
      INSERT INTO "AuditLog" ("id", "businessId", "actorId", "actorRole", "action", "entityType", "entityId", "summary", "createdAt")
      VALUES ('audit_1', 'biz_1', 'user_1', 'SUPERADMIN', 'PRODUCT_CREATE', 'Product', 'prod_ok', 'Membuat produk', NOW());
    `);

    const res = await db.query(
      `SELECT "id", "action" FROM "AuditLog" WHERE "id" = 'audit_1';`
    );
    expect(res.rows).toHaveLength(1);
    expect((res.rows[0] as Record<string, unknown>).action).toBe(
      'PRODUCT_CREATE'
    );
  });

  it('menolak (gagal) bila ada UPDATE pada AuditLog (trigger audit_log_immutable)', async () => {
    const updateSql = `UPDATE "AuditLog" SET "summary" = 'Diubah paksa' WHERE "id" = 'audit_1';`;

    await expect(db.query(updateSql)).rejects.toThrowError(
      /AuditLog tidak boleh diubah atau dihapus/
    );
  });

  it('menolak (gagal) bila ada DELETE pada AuditLog (trigger audit_log_immutable)', async () => {
    const deleteSql = `DELETE FROM "AuditLog" WHERE "id" = 'audit_1';`;

    await expect(db.query(deleteSql)).rejects.toThrowError(
      /AuditLog tidak boleh diubah atau dihapus/
    );
  });
});
