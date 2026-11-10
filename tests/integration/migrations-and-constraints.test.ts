import { describe, it, expect, beforeEach } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';
import path from 'path';

describe('Verifikasi AUD-SPEC-006: Integritas Migrasi Database (prisma migrate deploy)', () => {
  let db: PGlite;

  const mig1Path = path.resolve(__dirname, '../../prisma/migrations/20261107000001_init/migration.sql');
  const mig2Path = path.resolve(__dirname, '../../prisma/migrations/20261107000002_db_constraints/migration.sql');
  const mig3Path = path.resolve(__dirname, '../../prisma/migrations/20261110000003_catalog_same_business_guard/migration.sql');

  beforeEach(async () => {
    // Jalankan seluruh migrasi berurutan pada database kosong (simulasi prisma migrate deploy)
    db = new PGlite();
    await db.exec(fs.readFileSync(mig1Path, 'utf-8'));
    await db.exec(fs.readFileSync(mig2Path, 'utf-8'));
    await db.exec(fs.readFileSync(mig3Path, 'utf-8'));
  });

  it('membuktikan trigger audit_log_immutable aktif menolak UPDATE dan DELETE pada AuditLog', async () => {
    await db.query(`
      INSERT INTO "Business" ("id", "code", "name", "updatedAt")
      VALUES ('biz_m_1', 'BZ1', 'Bisnis Migrasi 1', NOW());
    `);

    await db.query(`
      INSERT INTO "AuditLog" ("id", "businessId", "action", "entityType", "entityId", "summary", "createdAt")
      VALUES ('log_1', 'biz_m_1', 'CREATE', 'Order', 'ord_1', 'Order dibuat', NOW());
    `);

    // 1. UPDATE harus ditolak keras oleh trigger
    await expect(
      db.query(`UPDATE "AuditLog" SET "summary" = 'Diubah' WHERE "id" = 'log_1';`)
    ).rejects.toThrowError(/AuditLog tidak boleh diubah atau dihapus/);

    // 2. DELETE harus ditolak keras oleh trigger
    await expect(
      db.query(`DELETE FROM "AuditLog" WHERE "id" = 'log_1';`)
    ).rejects.toThrowError(/AuditLog tidak boleh diubah atau dihapus/);
  });

  it('membuktikan CHECK constraint menolak harga atau kuantitas tidak valid di level PostgreSQL', async () => {
    await db.query(`
      INSERT INTO "Business" ("id", "code", "name", "updatedAt")
      VALUES ('biz_m_1', 'BZ1', 'Bisnis Migrasi 1', NOW());
    `);

    await db.query(`
      INSERT INTO "User" ("id", "businessId", "username", "passwordHash", "name", "role", "updatedAt")
      VALUES ('user_s1', 'biz_m_1', 'sales1', 'hash123', 'Sales 1', 'SALES', NOW());
    `);

    await db.query(`
      INSERT INTO "Category" ("id", "businessId", "name")
      VALUES ('cat_1', 'biz_m_1', 'Kategori 1');
    `);

    // 1. Product minPrice > basePrice harus ditolak (product_min_le_base)
    await expect(
      db.query(`
        INSERT INTO "Product" ("id", "businessId", "categoryId", "sku", "name", "unit", "costPrice", "basePrice", "minPrice", "updatedAt")
        VALUES ('p_invalid', 'biz_m_1', 'cat_1', 'SKU-INV', 'Produk Invalid', 'pcs', 10000, 20000, 25000, NOW());
      `)
    ).rejects.toThrow();

    // 2. Payment amount <= 0 harus ditolak (payment_amount_pos)
    await db.query(`
      INSERT INTO "Customer" ("id", "businessId", "code", "name", "pipelineStage", "updatedAt")
      VALUES ('cust_1', 'biz_m_1', 'C-1', 'Cust 1', 'DEAL', NOW());
    `);
    await db.query(`
      INSERT INTO "Order" ("id", "businessId", "customerId", "salesId", "orderNo", "orderDate", "status", "subtotal", "discountTotal", "shippingCharge", "grandTotal", "dpAmount", "dpBps", "updatedAt")
      VALUES ('ord_1', 'biz_m_1', 'cust_1', 'user_s1', 'ORD-001', NOW(), 'DRAFT', 100000, 0, 0, 100000, 0, 0, NOW());
    `);

    await expect(
      db.query(`
        INSERT INTO "Payment" ("id", "businessId", "orderId", "type", "method", "status", "amount", "paidAt")
        VALUES ('pay_zero', 'biz_m_1', 'ord_1', 'DOWN_PAYMENT', 'TRANSFER', 'PENDING_VERIFICATION', 0, NOW());
      `)
    ).rejects.toThrow();
  });

  it('membuktikan trigger catalogitem_same_business_trg menolak penyisipan item lintas unit usaha (error 23514)', async () => {
    // Buat dua usaha berbeda
    await db.query(`
      INSERT INTO "Business" ("id", "code", "name", "updatedAt")
      VALUES ('biz_A', 'BZA', 'Usaha A', NOW()),
             ('biz_B', 'BZB', 'Usaha B', NOW());
    `);

    await db.query(`
      INSERT INTO "User" ("id", "businessId", "username", "passwordHash", "name", "role", "updatedAt")
      VALUES ('user_B', 'biz_B', 'ownerB', 'hash123', 'Owner B', 'SUPERADMIN', NOW());
    `);

    await db.query(`
      INSERT INTO "Category" ("id", "businessId", "name")
      VALUES ('cat_A', 'biz_A', 'Kategori A');
    `);

    // Produk milik Usaha A
    await db.query(`
      INSERT INTO "Product" ("id", "businessId", "categoryId", "sku", "name", "unit", "costPrice", "basePrice", "minPrice", "updatedAt")
      VALUES ('prod_A', 'biz_A', 'cat_A', 'SKU-A', 'Produk Usaha A', 'pcs', 10000, 20000, 15000, NOW());
    `);

    // Katalog milik Usaha B
    await db.query(`
      INSERT INTO "Catalog" ("id", "businessId", "ownerId", "title", "updatedAt")
      VALUES ('cat_B', 'biz_B', 'user_B', 'Katalog Usaha B', NOW());
    `);

    // Upaya memasukkan Produk Usaha A ke Katalog Usaha B harus ditolak oleh trigger catalogitem_same_business_trg
    await expect(
      db.query(`
        INSERT INTO "CatalogItem" ("id", "catalogId", "productId", "sortOrder")
        VALUES ('item_cross', 'cat_B', 'prod_A', 1);
      `)
    ).rejects.toThrowError(/catalogitem_cross_business/);
  });
});
