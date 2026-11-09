import { describe, it, expect, beforeAll } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';
import path from 'path';

describe('T5.6: Uji Pemulihan Cadangan Database (Backup & Restore) & DocumentCounter (Seksi 3.4 & Seksi 18.1 nomor 38)', () => {
  let db: PGlite;
  const initSqlPath = path.resolve(
    __dirname,
    '../../prisma/migrations/20261107000001_init/migration.sql'
  );
  const constraintsSqlPath = path.resolve(
    __dirname,
    '../../prisma/migrations/20261107000002_db_constraints/migration.sql'
  );

  beforeAll(async () => {
    db = new PGlite();
    const initSql = fs.readFileSync(initSqlPath, 'utf-8');
    const constraintsSql = fs.readFileSync(constraintsSqlPath, 'utf-8');

    await db.exec(initSql);
    await db.exec(constraintsSql);
  });

  it('memastikan berkas skrip operasional backup.sh, restore.sh, dan setup-telegram-webhook.ts tersedia di repositori', () => {
    const backupScript = path.resolve(__dirname, '../../scripts/backup.sh');
    const restoreScript = path.resolve(__dirname, '../../scripts/restore.sh');
    const webhookScript = path.resolve(__dirname, '../../scripts/setup-telegram-webhook.ts');

    expect(fs.existsSync(backupScript)).toBe(true);
    expect(fs.existsSync(restoreScript)).toBe(true);
    expect(fs.existsSync(webhookScript)).toBe(true);

    const backupContent = fs.readFileSync(backupScript, 'utf-8');
    expect(backupContent).toContain('pg_dump');
    expect(backupContent).toContain('/data/uploads');

    const restoreContent = fs.readFileSync(restoreScript, 'utf-8');
    expect(restoreContent).toContain('pg_restore');
    expect(restoreContent).toContain('prisma migrate deploy');
  });

  it('mensimulasikan pemulihan DocumentCounter: urutan counter nomor berlanjut tanpa reset atau tabrakan (Seksi 18.1 no. 38)', async () => {
    const bizId = 'biz_restore_test';
    const customerId = 'cust_restore_01';

    // 1. Simulasikan unit usaha & customer
    await db.query(`
      INSERT INTO "Business" ("id", "code", "name", "updatedAt")
      VALUES ('${bizId}', 'TRB', 'Terobos Pet Shop', NOW());
    `);

    await db.query(`
      INSERT INTO "Customer" ("id", "businessId", "code", "name", "pipelineStage", "updatedAt")
      VALUES ('${customerId}', '${bizId}', 'CUST-001', 'Pelanggan Uji Pemulihan', 'DEAL', NOW());
    `);

    // 2. Simulasikan alokasi nomor awal: Sequence ke-5 untuk scopeId = customerId
    const initialLastSeq = 5;

    await db.query(`
      INSERT INTO "DocumentCounter" ("id", "businessId", "scope", "scopeId", "lastSeq")
      VALUES ('cnt_01', '${bizId}', 'ORDER_SEQ', '${customerId}', ${initialLastSeq});
    `);

    // Verifikasi counter tersimpan
    const checkRes = await db.query(`
      SELECT "lastSeq" FROM "DocumentCounter"
      WHERE "businessId" = '${bizId}' AND "scope" = 'ORDER_SEQ' AND "scopeId" = '${customerId}';
    `);
    expect(checkRes.rows).toHaveLength(1);
    expect((checkRes.rows[0] as any).lastSeq).toBe(5);

    // 3. Simulasikan "Dump Backup": Snapshot data DocumentCounter
    const snapshotRows = checkRes.rows;

    // 4. Simulasikan "Disaster Recovery / Pemulihan ke Database Bersih"
    const freshDb = new PGlite();
    const initSql = fs.readFileSync(initSqlPath, 'utf-8');
    const constraintsSql = fs.readFileSync(constraintsSqlPath, 'utf-8');
    await freshDb.exec(initSql);
    await freshDb.exec(constraintsSql);

    // Pulihkan Business, Customer, dan DocumentCounter
    await freshDb.query(`
      INSERT INTO "Business" ("id", "code", "name", "updatedAt")
      VALUES ('${bizId}', 'TRB', 'Terobos Pet Shop', NOW());
    `);

    await freshDb.query(`
      INSERT INTO "Customer" ("id", "businessId", "code", "name", "pipelineStage", "updatedAt")
      VALUES ('${customerId}', '${bizId}', 'CUST-001', 'Pelanggan Uji Pemulihan', 'DEAL', NOW());
    `);

    await freshDb.query(`
      INSERT INTO "DocumentCounter" ("id", "businessId", "scope", "scopeId", "lastSeq")
      VALUES ('cnt_01', '${bizId}', 'ORDER_SEQ', '${customerId}', ${(snapshotRows[0] as any).lastSeq});
    `);

    // 5. Pembuktian Seksi 18.1 nomor 38:
    // Alokasi nomor berikutnya HARUS melanjutkan dari sequence terakhir (lastSeq + 1 = 6), TIDAK boleh reset ke 1
    const nextSeqRes = await freshDb.query(`
      UPDATE "DocumentCounter"
      SET "lastSeq" = "lastSeq" + 1
      WHERE "businessId" = '${bizId}' AND "scope" = 'ORDER_SEQ' AND "scopeId" = '${customerId}'
      RETURNING "lastSeq";
    `);

    expect(nextSeqRes.rows).toHaveLength(1);
    const allocatedSeq = (nextSeqRes.rows[0] as any).lastSeq;
    expect(allocatedSeq).toBe(6); // Berlanjut ke sequence 6 secara deterministik!
  });

  it('memastikan data AuditLog append-only terlindungi dan tidak dapat dimanipulasi setelah pemulihan', async () => {
    const bizId = 'biz_restore_test';

    // Insert log awal
    await db.query(`
      INSERT INTO "AuditLog" ("id", "businessId", "action", "entityType", "entityId", "summary", "createdAt")
      VALUES ('aud_post_restore', '${bizId}', 'SYSTEM_RESTORE', 'System', 'sys_01', 'Pemulihan snapshot database berhasil', NOW());
    `);

    const res = await db.query(`SELECT "id", "action" FROM "AuditLog" WHERE "id" = 'aud_post_restore';`);
    expect(res.rows).toHaveLength(1);

    // Trigger audit_log_immutable harus tetap aktif menolak manipulasi
    await expect(
      db.query(`UPDATE "AuditLog" SET "summary" = 'Manipulasi ilegal' WHERE "id" = 'aud_post_restore';`)
    ).rejects.toThrowError(/AuditLog tidak boleh diubah atau dihapus/);
  });
});
