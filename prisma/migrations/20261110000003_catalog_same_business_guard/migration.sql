-- Create function to enforce catalog and product belong to the same business
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

-- Trigger on CatalogItem before insert or update of catalogId or productId
CREATE TRIGGER catalogitem_same_business_trg
BEFORE INSERT OR UPDATE OF "catalogId", "productId" ON "CatalogItem"
FOR EACH ROW EXECUTE FUNCTION catalogitem_same_business();

