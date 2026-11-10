import { describe, it, expect, beforeAll } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';
import path from 'path';

describe('Database Trigger: Isolasi Tenant CatalogItem Multi-Usaha (Langkah 14.3 & Seksi 14.8)', () => {
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
    const catalogGuardSqlPath = path.resolve(
      __dirname,
      '../../prisma/migrations/20261110000003_catalog_same_business_guard/migration.sql'
    );

    const initSql = fs.readFileSync(initSqlPath, 'utf-8');
    const constraintsSql = fs.readFileSync(constraintsSqlPath, 'utf-8');
    const catalogGuardSql = fs.readFileSync(catalogGuardSqlPath, 'utf-8');

    // Terapkan seluruh migrasi berurutan
    await db.exec(initSql);
    await db.exec(constraintsSql);
    await db.exec(catalogGuardSql);

    // Siapkan dua entitas bisnis terpisah: Usaha A dan Usaha B
    await db.query(`
      INSERT INTO "Business" ("id", "code", "name", "updatedAt") 
      VALUES 
        ('biz_a', 'AAA', 'Usaha A', NOW()),
        ('biz_b', 'BBB', 'Usaha B', NOW());
    `);

    // Siapkan user owner (sales) untuk Usaha A dan Usaha B
    await db.query(`
      INSERT INTO "User" ("id", "username", "passwordHash", "name", "role", "businessId", "isActive", "mustChangePassword", "updatedAt")
      VALUES
        ('user_a', 'sales_a', 'hash_dummy', 'Sales A', 'SALES', 'biz_a', true, false, NOW()),
        ('user_b', 'sales_b', 'hash_dummy', 'Sales B', 'SALES', 'biz_b', true, false, NOW());
    `);

    // Siapkan Produk A (milik Usaha A) dan Produk B (milik Usaha B)
    await db.query(`
      INSERT INTO "Product" ("id", "businessId", "sku", "name", "unit", "costPrice", "basePrice", "minPrice", "stockQty", "reservedQty", "updatedAt")
      VALUES
        ('prod_a', 'biz_a', 'SKU-A', 'Produk Usaha A', 'PCS', 10000, 15000, 12000, 50, 0, NOW()),
        ('prod_b', 'biz_b', 'SKU-B', 'Produk Usaha B', 'PCS', 20000, 30000, 25000, 50, 0, NOW());
    `);

    // Siapkan Katalog milik Usaha A
    await db.query(`
      INSERT INTO "Catalog" ("id", "businessId", "ownerId", "title", "updatedAt")
      VALUES ('cat_a', 'biz_a', 'user_a', 'Katalog Usaha A', NOW());
    `);
  });

  it('memastikan trigger catalogitem_same_business_trg terpasang di database', async () => {
    const res = await db.query(`
      SELECT tgname FROM pg_trigger WHERE tgname = 'catalogitem_same_business_trg';
    `);
    expect(res.rows).toHaveLength(1);
    expect((res.rows[0] as { tgname: string }).tgname).toBe('catalogitem_same_business_trg');
  });

  it('berhasil menyimpan CatalogItem jika produk berasal dari usaha yang sama (prod_a di cat_a)', async () => {
    await db.query(`
      INSERT INTO "CatalogItem" ("id", "catalogId", "productId", "price", "sortOrder")
      VALUES ('item_valid_1', 'cat_a', 'prod_a', 15000, 0);
    `);

    const res = await db.query(`
      SELECT "id", "catalogId", "productId" FROM "CatalogItem" WHERE "id" = 'item_valid_1';
    `);
    expect(res.rows).toHaveLength(1);
    expect((res.rows[0] as { productId: string }).productId).toBe('prod_a');
  });

  it('menolak (error 23514 catalogitem_cross_business) saat insert CatalogItem dengan produk milik usaha lain (prod_b di cat_a)', async () => {
    const insertCrossTenantSql = `
      INSERT INTO "CatalogItem" ("id", "catalogId", "productId", "price", "sortOrder")
      VALUES ('item_invalid_cross', 'cat_a', 'prod_b', 30000, 1);
    `;

    await expect(db.query(insertCrossTenantSql)).rejects.toThrow(/catalogitem_cross_business/);
  });

  it('menolak (error 23514) saat update productId CatalogItem yang sudah ada ke produk usaha lain', async () => {
    const updateCrossTenantSql = `
      UPDATE "CatalogItem"
      SET "productId" = 'prod_b'
      WHERE "id" = 'item_valid_1';
    `;

    await expect(db.query(updateCrossTenantSql)).rejects.toThrow(/catalogitem_cross_business/);
  });
});

