CREATE OR REPLACE FUNCTION audit_log_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'AuditLog tidak boleh diubah atau dihapus';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS audit_log_no_change ON "AuditLog";
CREATE TRIGGER audit_log_no_change BEFORE UPDATE OR DELETE ON "AuditLog" FOR EACH ROW EXECUTE PROCEDURE audit_log_immutable();

CREATE OR REPLACE FUNCTION catalogitem_same_business() RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM "Catalog" c
    JOIN "Product" p ON p."businessId" = c."businessId"
    WHERE c."id" = NEW."catalogId" AND p."id" = NEW."productId"
  ) THEN
    RAISE EXCEPTION 'catalogitem_cross_business' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS catalogitem_same_business_trg ON "CatalogItem";
CREATE TRIGGER catalogitem_same_business_trg
BEFORE INSERT OR UPDATE OF "catalogId", "productId" ON "CatalogItem"
FOR EACH ROW EXECUTE PROCEDURE catalogitem_same_business();

DELETE FROM _prisma_migrations;
INSERT INTO _prisma_migrations (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
VALUES 
  ('1', 'init', NOW(), '20261107000001_init', null, null, NOW(), 1),
  ('2', 'constraints', NOW(), '20261107000002_db_constraints', null, null, NOW(), 1),
  ('3', 'catalog_guard', NOW(), '20261110000003_catalog_same_business_guard', null, null, NOW(), 1);

